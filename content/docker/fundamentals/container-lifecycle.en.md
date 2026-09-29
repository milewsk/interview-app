# Container lifecycle and everyday commands {junior}

A container moves through a few **states**: `created` → `running` (→ `paused`) → `exited`, and finally it's removed. Knowing what `run`, `stop`, `kill`, `exec` and restart
policies actually do, and what the **exit codes** mean, is the basis for debugging containers in development and production.

## Lifecycle, verified step by step

| Command | Result in the test |
|---|---|
| `docker create` | state `created`: the container exists, nothing runs |
| `docker start` | `running` |
| `docker pause` / `unpause` | `paused` (processes frozen via cgroups) / running again |
| `docker exec c sh -c ...` | ran as an extra process (PID 10) next to PID 1 in the same container |
| `docker stop` (the main process traps `SIGTERM`) | printed "got TERM", `exited`, **exit 0 after 1 s** |
| `docker stop` (`sleep 300` as PID 1, ignores `SIGTERM`) | `exited`, **exit 137 after 11 s**: killed after the 10 s grace period |
| `docker kill` | `exited`, **exit 137** immediately (`SIGKILL`) |
| a shell exceeding `--memory 32m` | `exited`, **exit 137**, `OOMKilled: true` |
| `--restart on-failure:3` with a command that exits 1 | restarted **3** times, then stayed `exited` with exit code 1 |
| `docker run --rm alpine sh -c 'exit 42'` | `docker run` itself returned **42** |

`docker run` = pull (if needed) + create + start (+ attach). Common flags: `-d` (detached), `-it` (interactive terminal), `--rm` (remove on exit), `--name`, `-e`, `-p`, `-v`,
`--restart`, `--memory`, `--cpus`.

## Exit codes

- `0`: success; `1` and other small numbers: the application's own error.
- **`128 + signal`**: killed by a signal. **137** = 128 + 9 (`SIGKILL`: `docker kill`, the stop timeout, or the OOM killer, so check `OOMKilled` in `docker inspect`), **143** =
  128 + 15 (`SIGTERM` with its default action; verified: `sleep` started with `--init` stopped in 1 s with 143).
- `125`, `126`, `127`: Docker couldn't run the container, the command isn't executable, or the command wasn't found (verified with an unknown flag, `/etc` as the command, and a
  nonexistent command).

## Logs, inspection, cleanup

- `docker logs -f --tail 100 c` shows what the main process writes to **stdout/stderr**, so containerized apps should log there, not to files.
- `docker inspect c` returns the full configuration and state (`.State.ExitCode`, `.State.OOMKilled`, `.RestartCount`, mounts, networks); `docker stats` shows live resource use.
- `docker ps -a` lists stopped containers too; they keep their writable layer and logs until `docker rm`. `docker container prune` removes all stopped containers (so use it with care
  on shared machines).

## Restart policies

`no` (default), `on-failure[:max-retries]` (only non-zero exits), `always` (restarts whenever it stops; a manually stopped container comes back only when the daemon restarts), and
`unless-stopped` (like `always`, but a stopped container isn't restarted even after a daemon restart). Docker waits before each restart, doubling the delay from
100 ms. Restart policies suit single hosts and Compose; orchestrators such as Kubernetes manage restarts themselves.

## Sources

- [docker container run](https://docs.docker.com/reference/cli/docker/container/run/)
- [docker container stop](https://docs.docker.com/reference/cli/docker/container/stop/)
- [Start containers automatically (restart policies)](https://docs.docker.com/engine/containers/start-containers-automatically/)
- [Resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)

## Questions

### What states can a container be in? {junior}

`created` (exists but hasn't started), `running`, `paused` (processes frozen), `restarting`, `exited` (the main process ended; the container, its writable layer and logs remain),
`removing` and `dead`. `docker ps` shows running containers and `docker ps -a` all of them. A container runs exactly as long as its main process (PID 1) runs.

### What does `docker run` do? {junior}

It pulls the image if it isn't present locally, creates a container (writable layer, network, mounts, configuration from the flags), starts it, and by default attaches to its output.
`-d` runs it in the background, `-it` gives an interactive terminal, and `--rm` removes it when it exits. It's equivalent to `docker create` followed by `docker start`.

### What is the difference between `docker stop` and `docker kill`? {junior}

`docker stop` sends `SIGTERM` so the application can shut down gracefully, and after a grace period (10 seconds by default, `-t` to change) sends `SIGKILL`. `docker kill` sends
`SIGKILL` immediately (or another signal with `--signal`). In a test, a process handling `SIGTERM` stopped in 1 s with exit code 0, while `sleep` as PID 1 ignored it and was killed
after 11 s with exit code 137.

### What does exit code 137 mean, and how do you find out why it happened? {mid}

137 is 128 + 9, so the process was killed with `SIGKILL`. Causes: `docker kill`, a `docker stop` whose grace period expired because the process ignored `SIGTERM`, or the kernel's OOM
killer when the container exceeded its memory limit. `docker inspect` shows `State.OOMKilled`: in a test, a shell exceeding a 32 MB limit ended with 137 and `OOMKilled: true`. Exit 143
(128 + 15) means the process ended on `SIGTERM`.

### How do you run a command inside a running container? {junior}

`docker exec -it <container> sh` (or `bash` if the image has it) starts an additional process in the same namespaces as the main one; in a test it ran as PID 10 next to PID 1. It's for
debugging and one-off tasks, not for changing configuration, since changes are lost when the container is recreated. Minimal images may have no shell; then run a debug container that joins its
namespaces: `docker run --rm -it --pid container:web --network container:web busybox` saw nginx's processes and reached it on `localhost` in a test.

### Where do container logs come from? {junior}

From the main process's standard output and standard error, captured by the logging driver (by default `json-file` on the host). `docker logs -f --tail 100 <container>` shows them. Apps
in containers should therefore log to stdout/stderr, one event per line and preferably structured, and let the platform collect and ship logs, instead of writing log files inside the
container.

### What restart policies are there? {mid}

`no` (default) never restarts; `on-failure[:N]` restarts only after a non-zero exit, up to N times (in a test, `on-failure:3` restarted a failing container three times); `always` restarts it
whenever it stops, and a manually stopped one comes back when the daemon restarts; `unless-stopped` doesn't bring back containers you stopped. The delay before each restart doubles,
starting at 100 ms, to avoid tight crash loops.

### Is a stopped container deleted? {junior}

No. It stays with its writable layer, logs and configuration, can be restarted with `docker start`, and its files can be copied out with `docker cp`, until you remove it with `docker rm`
(or it was started with `--rm`). Stopped containers accumulate and use disk space, so remove them or run short-lived ones with `--rm`.

### What does `docker run` return as its exit code? {mid}

The exit code of the container's main process, which makes containers usable in scripts and CI: in a test, `docker run --rm alpine sh -c 'exit 42'` returned 42. Codes 125, 126 and 127
come from Docker itself: the container couldn't be created or started, the command couldn't be invoked, or the command wasn't found.

### How do you limit a container's resources, and what happens when it exceeds them? {mid}

With `--memory` (and `--memory-swap`), `--cpus`, `--pids-limit` and others, enforced by cgroups. Exceeding the memory limit makes the kernel kill a process in the container (exit 137,
`OOMKilled: true`), while CPU limits only throttle it, making it slower. Without limits a container can use all of the host's resources, so production containers should have limits,
and runtimes such as .NET read them, e.g. to size the GC heap.
