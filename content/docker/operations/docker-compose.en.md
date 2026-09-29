# Docker Compose {mid}

**Docker Compose** describes a multi-container application in one YAML file (`compose.yaml`): services, networks, volumes, configuration and startup dependencies. One command
(`docker compose up`) creates and starts everything, which makes it the standard tool for local development environments, integration tests and simple single-host deployments.
Examples here ran on Compose v2.32 (the `docker compose` plugin; the old Python `docker-compose` v1 is retired).

## A compose file

```yaml
name: shop
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}          # interpolated from the shell or .env
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      retries: 15

  migrate:
    image: postgres:18-alpine
    command: ["psql", "-h", "db", "-U", "postgres", "-c", "create table if not exists items(id int); insert into items values (1);"]
    depends_on:
      db:
        condition: service_healthy               # wait for the health check, not just the start

  web:
    image: nginx:1.30-alpine
    ports:
      - "127.0.0.1:${WEB_PORT:-18300}:80"        # default value if WEB_PORT is unset
    depends_on:
      migrate:
        condition: service_completed_successfully

  tools:
    image: busybox:1.38
    profiles: [tools]                            # only started with --profile tools

volumes:
  pgdata:
```

## What was verified

- `docker compose up -d --wait` took about 9 s and respected dependencies: `db` became **healthy**, then `migrate` ran and exited 0, then `web` started (start timestamps in that
  order). `--wait` returns only when services are running/healthy, which is useful in CI.
- Compose created a network `shop_default` (here `iprep-compose_default`) and a volume `<project>_pgdata`; `web` resolved `db` by the **service name**.
- `${DB_PASSWORD}` came from the `.env` file; `DB_PASSWORD=from-shell docker compose config` showed the shell value winning over `.env`. `docker compose config` prints the fully
  resolved configuration, the first debugging step.
- `compose.override.yaml` was **merged automatically** (its environment variable appeared in `web`); with `-f compose.yaml` only, it wasn't.
- The `tools` service didn't start with a plain `up`; `docker compose --profile tools run --rm tools` ran it.
- Changing only `web`'s configuration and running `up` again **recreated only `web`**; `db` kept running in the same container.
- `docker compose down` removed containers and the network but **kept the volume** (the data was still there after `up`); `down -v` deleted it.
- The one-off `migrate` service **ran again on every `up`** (the table ended up with 3 rows), so migration steps must be idempotent or run explicitly (`docker compose run`).

## Good practices

- `depends_on` without a condition only orders **starting**; use `condition: service_healthy` with a health check for readiness, and still make apps retry connections.
- Keep secrets out of `compose.yaml` and out of git: `.env` (ignored), environment-specific files, or Compose `secrets` (mounted as files in `/run/secrets`). Verified: a secret
  from a file was readable at `/run/secrets/db_password`, and unlike a plain environment variable its value didn't appear in `docker inspect`.
- Use override files or profiles for environment differences: bind-mounted source code and debug ports in development, resource limits and restart policies in production.
- Compose Watch (`docker compose watch`) syncs files or rebuilds on change for development.

## Sources

- [Docker Compose overview](https://docs.docker.com/compose/)
- [Compose file reference: services](https://docs.docker.com/reference/compose-file/services/)
- [Control startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Environment variable precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)
- [Merge Compose files](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)
- [Using profiles](https://docs.docker.com/compose/how-tos/profiles/)

## Questions

### What is Docker Compose used for? {junior}

To define and run multi-container applications with one declarative file: services (image or build, ports, environment, volumes, dependencies), networks and volumes. `docker compose up`
creates everything and `down` removes it. It's typically used for local development environments (API + database + cache), integration tests in CI and simple single-host deployments;
for multi-host production, orchestrators like Kubernetes take over.

### How do services in Compose talk to each other? {junior}

Compose creates a default network for the project (`<project>_default`) and attaches all services to it, and each service is reachable by its service name through Docker's DNS: in a test,
`web` resolved `db` to its IP. So a connection string uses `Host=db`, not `localhost`. Ports only need publishing for access from the host.

### Does `depends_on` wait until a dependency is ready? {mid}

Not by default: it only makes Compose start the dependency first. `condition: service_healthy` waits for the dependency's health check to pass, and `condition: service_completed_successfully`
waits for a one-off service to exit with 0; in a test, `web` started only after `db` was healthy and `migrate` had finished. Applications should still retry connections, since dependencies can
restart later.

### How do environment variables and `.env` work in Compose? {mid}

`${VAR}` in the compose file is interpolated from the shell environment and the project's `.env` file (with defaults like `${WEB_PORT:-18300}`); a value set in the shell wins over `.env`, as a
test showed. Variables for the container are set with `environment` or `env_file`. `docker compose config` shows the result after interpolation. `.env` files with secrets must stay out of
version control.

### What happens to volumes when you run `docker compose down`? {junior}

`down` stops and removes containers and networks but keeps named volumes, so databases survive: in a test the data was still there after `down` and `up`. `down -v` also removes the
project's named volumes (and anonymous ones), which deletes the data. `--rmi` can remove images built or pulled for the project.

### What are Compose override files and profiles for? {mid}

`compose.override.yaml` is merged automatically on top of `compose.yaml` (in a test, a variable from it appeared in the container), and more files can be combined with `-f`. This keeps the base
file shared and puts environment-specific settings (development bind mounts, debug ports, production limits) in separate files. Profiles mark optional services (debugging tools, seeders) that
start only with `--profile`; in a test, the `tools` service was skipped by a plain `up`.

### What does `docker compose up` do when the configuration changes? {mid}

It compares the desired configuration with running containers and recreates only services whose configuration (or image) changed, leaving others running: in a test, changing `web`'s
environment recreated `web` while `db` kept its container. Services whose dependencies were recreated may also be restarted. `--force-recreate` recreates everything, `--no-recreate` nothing.

### How would you run database migrations with Compose? {senior}

As a one-off service that depends on the database being healthy and that the app depends on with `service_completed_successfully`, or explicitly with `docker compose run --rm migrate` in a
deployment script. Note that a one-off service runs again on every `up`: in a test, a non-idempotent insert ran three times. Migration tools (EF Core migrations bundles, Flyway, Liquibase)
track applied migrations, so rerunning them is safe.

### Is Docker Compose suitable for production? {senior}

For a single host, yes, with care: restart policies, resource limits, health checks, logging configuration, secrets, and a reverse proxy with TLS. It lacks multi-host scheduling,
self-healing across machines, rolling updates with automatic rollback and autoscaling, which is where Kubernetes or managed container platforms come in. Many small systems run well on Compose
behind a proxy.

### How do you handle secrets in Compose? {mid}

Don't hard-code them in `compose.yaml`: pass them from the environment or an ignored `.env` file, or use Compose `secrets`, which mount a file or environment value into the container at
`/run/secrets/<name>` instead of exposing it as an environment variable visible in `docker inspect`. In production, fetch them from a secrets manager. Rotate any secret that was committed to
git.
