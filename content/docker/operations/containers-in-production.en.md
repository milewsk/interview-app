# Containers in production {senior}

Running containers in production is less about Docker commands and more about properties the application and platform must have: **configuration from the environment**,
**stateless** processes that can be replaced and scaled, **logs** on stdout with rotation, **resource limits**, health checks and graceful shutdown, and an **orchestrator**
that schedules, restarts and updates containers across machines. These are the ideas behind the Twelve-Factor App and Kubernetes.

## Configuration from the environment

The same image should run in every environment; only configuration differs. ASP.NET Core reads environment variables over `appsettings.json`, with `__` as the section separator.
Verified with a .NET 10 container: without variables, `/config` returned `Greeting=from appsettings; Db=(unset)`; with `-e Greeting__Text="from env"` and
`-e ConnectionStrings__Default="Host=db;Database=shop"` it returned the environment values. Secrets come from the orchestrator's secret store or a secrets manager, not from the
image.

## Logs

Apps write to stdout/stderr and the platform collects them. The default `json-file` driver (verified as the daemon default) **doesn't rotate logs unless configured**, which can fill
disks. Verified: with `--log-opt max-size=10k --log-opt max-file=2`, a container that printed 3,000 lines kept only the last **218** (from "line 2783"). Configure rotation per
container or daemon-wide (`log-opts` in `daemon.json`), or use the `local` driver or ship logs to a central system (Fluent Bit, OpenTelemetry Collector, cloud logging), preferably
as structured JSON.

## Stateless processes and scaling

State belongs in databases, caches and object storage, not in the container, so any instance can be killed and replaced. Verified: `docker compose up --scale web=3` started three
replicas, and the service name `web` resolved to **three IP addresses** (DNS round robin). Real load balancing, health-aware routing and rolling updates come from a reverse
proxy or orchestrator.

## Resources

Without limits a container can use the whole host: `docker stats` showed a .NET container's memory limit as the host's **15.31 GiB**. Set memory and CPU limits (`--memory`,
`--cpus`, Compose `deploy.resources`, Kubernetes requests and limits); runtimes like .NET size their GC heap from the container limit. Watch for OOM kills (exit 137,
`OOMKilled`).

## Orchestration

On more than one host an orchestrator is needed. Kubernetes concepts in brief: a **Pod** runs one or more containers; a **Deployment** keeps N replicas running and performs **rolling
updates** with rollback; a **Service** gives them a stable name and load balancing; **ConfigMaps** and **Secrets** provide configuration; **liveness/readiness probes** replace
`HEALTHCHECK`; **requests/limits** drive scheduling. Managed alternatives (Azure Container Apps, AWS ECS/Fargate, Google Cloud Run) run containers without managing a cluster.

Deployment strategies: rolling update (default), blue-green (switch traffic between two full environments), canary (a small share of traffic first). All need backward-compatible
database migrations, since old and new versions run at the same time.

## Sources

- [The Twelve-Factor App: config](https://12factor.net/config)
- [Configure logging drivers](https://docs.docker.com/engine/logging/configure/)
- [JSON File logging driver](https://docs.docker.com/engine/logging/drivers/json-file/)
- [Configuration in ASP.NET Core: environment variables](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/#non-prefixed-environment-variables)
- [Kubernetes overview](https://kubernetes.io/docs/concepts/overview/)
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

## Questions

### Why should the same image be used in every environment? {junior}

So that what was tested is exactly what runs in production: rebuilding per environment can bring different dependency versions or build settings. Environment differences (connection strings,
URLs, feature flags, log levels) come from configuration injected at runtime, as the Twelve-Factor App recommends; the image is promoted from test to production by tag or digest.

### How do you configure an ASP.NET Core app in a container? {mid}

With environment variables, which override `appsettings.json`; nested keys use a double underscore, e.g. `ConnectionStrings__Default` or `Logging__LogLevel__Default`. In a test,
`Greeting__Text` and `ConnectionStrings__Default` passed with `-e` replaced the values from `appsettings.json`. Secrets are mounted from the orchestrator's secret store or read from a secrets
manager (e.g. Azure Key Vault) at startup.

### Why do container logs need rotation? {mid}

The default `json-file` driver keeps writing logs to the host's disk without a size limit unless rotation is configured, so a chatty container can fill the disk and take down the host. With
`max-size` and `max-file` only recent logs are kept (in a test, 218 of 3,000 lines remained). In production, logs are also shipped to a central system, because they're lost with the container and
you need search across instances.

### What does "stateless" mean for containers and why does it matter? {mid}

The container holds no data that must survive it: sessions, uploads and caches live in external services (database, Redis, object storage). Then any instance can be killed, restarted, moved
or scaled without losing data, which is what orchestrators assume when they replace unhealthy instances or perform rolling updates. Stateful services (databases) need volumes and special care.

### How does scaling a service work with Docker Compose, and what are its limits? {mid}

`docker compose up --scale web=3` starts three containers of the service on one host, and the service name resolves to all their IPs (verified: three addresses), so clients get simple DNS
round robin. Ports can't be published to the same host port for all replicas, there's no health-aware load balancing or rolling update logic, and everything is on one machine, so a reverse
proxy or an orchestrator is needed for real scaling.

### What happens if you don't set memory limits? {mid}

The container can use all of the host's memory (in a test, `docker stats` showed the host's 15.31 GiB as its limit), so one leaking service can starve others or trigger the host's OOM killer,
which may kill an unrelated process. With limits, only the offending container is killed (exit 137), and runtimes like .NET size their heaps to fit. Orchestrators also need requests and
limits to schedule containers sensibly.

### What are the core Kubernetes objects a developer should know? {mid}

Pod (one or more containers sharing network and storage, the unit of scheduling), Deployment (declares the desired number of replicas and handles rolling updates and rollbacks), Service
(stable virtual IP and DNS name that load-balances to matching pods), Ingress or Gateway (HTTP routing from outside), ConfigMap and Secret (configuration), and probes and resource requests and
limits in the pod spec. Namespaces separate teams or environments.

### What deployment strategies are there for containers? {senior}

Rolling update (replace instances gradually, the default in Kubernetes Deployments), blue-green (deploy the new version alongside the old one and switch traffic at once, easy rollback), and
canary (send a small percentage of traffic to the new version and increase it while monitoring). All of them run old and new versions at the same time, so APIs and database schema changes must
be backward compatible (expand-and-contract migrations).

### When would you choose a managed container service instead of Kubernetes? {senior}

When you want to run containers without operating a cluster: services like Azure Container Apps, AWS ECS/Fargate or Google Cloud Run handle scheduling, scaling (often to zero), TLS and
upgrades, with a smaller learning curve and cost for small and medium workloads. Kubernetes pays off when you need its ecosystem and flexibility (custom networking, operators, many teams and
services, multi-cloud) and have people to run it.

### What does a production-ready container image and runtime configuration include? {senior}

A small, pinned, scanned base image built with a multi-stage build; a non-root user; exec-form entrypoint with graceful `SIGTERM` handling; configuration and secrets from the environment; logs
on stdout with rotation or shipping; health, readiness and liveness endpoints; resource limits; read-only root file system where possible; image tagged by version and deployed by digest; and
metrics and traces exported (e.g. OpenTelemetry).
