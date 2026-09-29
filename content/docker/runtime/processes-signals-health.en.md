# PID 1, signals, graceful shutdown and health checks {senior}

A container runs as long as its main process, **PID 1**, runs. PID 1 has special duties in Linux: signals without a handler are **ignored** for it, and it must **reap zombie
processes**. Getting this wrong makes `docker stop` slow, loses in-flight requests and leaks processes. Health checks then tell Docker, Compose or an orchestrator whether the
process that runs is actually working.

## Signals and graceful shutdown

`docker stop` sends `SIGTERM` (or the image's `STOPSIGNAL`), waits a grace period (10 s by default), then sends `SIGKILL`. Verified:

- `sleep 300` as PID 1 has no `SIGTERM` handler, so the kernel **ignored** the signal and the container was killed after the grace period (exit **137**); `--stop-timeout 3`
  shortened that to about 4 s.
- A shell-form `CMD` left `/bin/sh` as PID 1, which didn't forward `SIGTERM` to the app (see the Dockerfile topic).
- An ASP.NET Core app (exec form) received `SIGTERM`, logged "Application is shutting down...", and stopped in **1 s with exit code 0**. The generic host stops hosted services and
  drains requests; its `HostOptions.ShutdownTimeout` defaults to **30 s** (checked on .NET 10), longer than Docker's default 10 s grace period, so align them
  (`docker stop -t`, `--stop-timeout`, Compose `stop_grace_period`, Kubernetes `terminationGracePeriodSeconds`) when shutdown can take long.

A graceful shutdown means: stop accepting new work, finish or hand back in-flight requests and messages, flush logs and close connections, then exit with 0.

## Zombies and `--init`

When a child process exits, its parent must `wait()` for it; orphans are re-parented to PID 1. Verified: with `sleep` as PID 1, an orphaned background process stayed as a **zombie**
(`Z` in `ps`); with `docker run --init`, PID 1 was `docker-init` (tini), which reaped it, and there was no zombie. It also forwards signals: `sleep` under `--init` stopped in 1 s with
exit 143. Use `--init` (or `init: true` in Compose, or tini/dumb-init in the image) when PID 1 isn't a proper init, e.g. shell scripts or apps that spawn children.

## Health checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
```

Verified with nginx (short intervals): status went `starting` → `healthy`; after breaking the site the checks returned `0 1 1 1 1` and the status became **`unhealthy`**, and
`docker ps` showed "(unhealthy)". Crucially, the container kept **running** even with `--restart always` (0 restarts): **plain Docker doesn't restart unhealthy containers**.
Health status is used by Compose (`depends_on: condition: service_healthy`), Swarm, and load balancers or monitoring; Kubernetes ignores `HEALTHCHECK` and uses its own probes.

- The check runs **inside** the container, so the tool it uses (`wget`, `curl`) must exist there; chiseled or distroless images have none, so check from outside or use a small
  health binary.
- Distinguish **liveness** ("the process is stuck, restart it") from **readiness** ("don't send traffic yet", e.g. while warming up or when a dependency is down). ASP.NET Core
  health checks (`MapHealthChecks`) can expose separate endpoints for each.

## Sources

- [docker container stop](https://docs.docker.com/reference/cli/docker/container/stop/)
- [Dockerfile reference: HEALTHCHECK and STOPSIGNAL](https://docs.docker.com/reference/dockerfile/#healthcheck)
- [docker run --init](https://docs.docker.com/reference/cli/docker/container/run/#init)
- [.NET Generic Host: host shutdown](https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host#host-shutdown)
- [Health checks in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks)

## Questions

### Why is PID 1 special in a container? {mid}

The first process in a PID namespace behaves like `init`: the kernel doesn't apply default signal actions to it, so a signal without a registered handler (like `SIGTERM` for `sleep`)
is ignored, and orphaned processes are re-parented to it, so it must reap them. Applications aren't usually written as init systems, which leads to slow stops (killed after the grace
period) and zombie processes.

### What is `STOPSIGNAL`, and why do some images change it? {mid}

It sets the signal `docker stop` sends first instead of `SIGTERM`, for applications that use a different signal for graceful shutdown. The official `nginx` image sets
`SIGQUIT`, which nginx treats as "finish current requests and exit" (in a test it logged "signal 3 (SIGQUIT) received" and "gracefully shutting down", then exited with 0),
while `SIGTERM` would make it stop immediately; the `postgres` image uses `SIGINT` for PostgreSQL's fast shutdown mode. It can also be overridden with
`docker run --stop-signal`.

### What is a graceful shutdown and how do you implement it? {mid}

Handling `SIGTERM` by stopping new work, finishing in-flight requests and messages, closing connections and flushing logs, then exiting. In .NET the generic host does this: it triggers
`IHostApplicationLifetime.ApplicationStopping`, stops hosted services with a cancellation token and waits up to `HostOptions.ShutdownTimeout`. The app must run in exec form so it receives
the signal, and the container's grace period must be long enough.

### Why can Docker's stop timeout and .NET's shutdown timeout conflict? {senior}

.NET's `HostOptions.ShutdownTimeout` defaults to 30 seconds (checked on .NET 10), but `docker stop` sends `SIGKILL` after 10 seconds by default. If background services or request draining
take longer than 10 seconds, the process is killed mid-shutdown, losing work. Set the container's grace period above the app's timeout (`stop_grace_period` in Compose,
`terminationGracePeriodSeconds` in Kubernetes) or shorten the app's timeout deliberately.

### What is a zombie process and how does `--init` help? {senior}

A process that has exited but whose parent hasn't collected its exit status with `wait()`; it keeps a process table entry. In containers, orphans are re-parented to PID 1, and if PID 1 is
an app or `sleep` that never calls `wait()`, zombies accumulate: in a test, an orphan stayed in state `Z`. `docker run --init` makes a tiny init (tini, shown as `docker-init`) PID 1, which
reaps zombies and forwards signals to the app; in the test, no zombie remained.

### What does `HEALTHCHECK` do? {junior}

It defines a command Docker runs periodically inside the container; exit code 0 means healthy and 1 unhealthy. Docker tracks the status (`starting`, `healthy`, `unhealthy`) with the
configured interval, timeout, start period and retries, and shows it in `docker ps` and `docker inspect`. In a test, a broken nginx became `unhealthy` after the configured number of
failed checks.

### Does Docker restart an unhealthy container? {mid}

No. Plain Docker only records the health status; restart policies react to the process exiting, not to health. In a test, an unhealthy container with `--restart always` kept running with
zero restarts. Health status is acted on by other tools: Compose's `depends_on` with `condition: service_healthy`, Swarm replacing tasks, load balancers, monitoring. Kubernetes uses its
own liveness and readiness probes instead of `HEALTHCHECK`.

### What is the difference between liveness and readiness checks? {mid}

A liveness check answers "is the process still working, or should it be restarted?", and should check only the app itself, since restarting won't fix a down database. A readiness check
answers "can it receive traffic right now?", and may include warm-up and critical dependencies, so traffic is routed elsewhere without restarting. Mixing them up causes restart loops
when a shared dependency fails. ASP.NET Core health checks can expose both with tags and separate endpoints.

### Why can a health check fail in a minimal image even though the app works? {mid}

The check runs inside the container, so the command it calls must exist there: chiseled and distroless images have no shell, `curl` or `wget`, and a check like `CMD curl ...` fails. Options:
ship a tiny health-check binary or a mode of the app itself that performs the check, use the exec form without a shell, or rely on external checks (the orchestrator's HTTP probes).

### How should an app behave when it receives `SIGTERM` while processing messages from a queue? {senior}

Stop fetching new messages, finish the ones in progress within the grace period, acknowledge only completed messages, and let unfinished ones be redelivered (they return to the queue when
the connection closes or the visibility timeout expires). Handlers must therefore be idempotent. Cancellation tokens passed from the host's stopping token let long operations stop cleanly
instead of being killed mid-way by `SIGKILL`.
