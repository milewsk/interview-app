# Dockerfile essentials {junior}

A **Dockerfile** is the recipe for an image: a base image (`FROM`) followed by instructions that add files, run commands and set metadata. Interviewers like the details that
cause real bugs: `CMD` vs `ENTRYPOINT`, **shell vs exec form** and signals, `ARG` vs `ENV`, `COPY` vs `ADD`, `EXPOSE`, and what gets sent in the **build context**.

## A typical Dockerfile

```dockerfile
FROM node:24-alpine                 # base image: pin a specific tag (or digest)
WORKDIR /app                        # creates the directory and sets it for later instructions
COPY package*.json ./               # dependencies first, for better caching
RUN npm ci --omit=dev
COPY . .                            # then the source code
ENV NODE_ENV=production             # available at build and at runtime
EXPOSE 3000                         # documentation only
USER node                           # don't run as root
CMD ["node", "server.js"]           # exec form
```

## `ENTRYPOINT` and `CMD`

With `ENTRYPOINT ["echo", "hello"]` and `CMD ["world"]`, verified: `docker run img` printed `hello world`, `docker run img you` printed `hello you` (arguments replace `CMD`), and
`--entrypoint ls img /etc/alpine-release` replaced the entrypoint. `ENTRYPOINT` is the fixed executable, `CMD` the default arguments (or the default command when there's no
entrypoint). A common pattern is an entrypoint script that prepares the environment and ends with `exec "$@"`.

## Exec form vs shell form

- **Exec form** `CMD ["node", "/app.js"]`: the program runs directly as **PID 1** and receives signals.
- **Shell form** `CMD node /app.js`: stored as `["/bin/sh","-c","node /app.js"]` (verified in `docker image inspect`).

Verified with a Node app that handles `SIGTERM`: with `CMD node /app.js; echo app ended`, PID 1 was `/bin/sh`, `docker stop` didn't reach Node, and the container was killed after
**11 s with exit code 137**; with the exec form Node received `SIGTERM`, logged it and exited with **0 in 1 s**. Alpine's BusyBox shell `exec`s the last simple command
(`CMD node /app.js` and even `echo starting && node /app.js` ended up with Node as PID 1), which hides the problem until the command changes or the base image uses another shell.
Use the exec form.

## `ARG` vs `ENV`

`ARG` is a **build-time** variable (`--build-arg`), and an `ARG` before `FROM` can parameterize the base image; `ENV` is set in the image and visible to the running container
(overridable with `-e`). Verified: with `--build-arg APP_VERSION=2.5.0`, a `RUN` step saw `2.5.0`, but at runtime `APP_VERSION` was empty, while `APP_ENV` from `ENV` was
`production` (and `staging` with `-e APP_ENV=staging`). Neither is safe for secrets: a token passed with `--build-arg` appeared in plain text in `docker history --no-trunc` (`NPM_TOKEN=...`), while
the same token given as a BuildKit secret mount (`RUN --mount=type=secret,id=npm_token`) left no trace in the history or in the saved image.

## `COPY` vs `ADD`, `.dockerignore`, `EXPOSE`

- `ADD` extracts local tar archives and can download URLs; `COPY` just copies. Verified: `ADD arch.tar /added/` produced the extracted `a.txt`, `COPY arch.tar /copied/` the tar file.
  Prefer `COPY` unless you need those features.
- The **build context** (the directory passed to `docker build`) is sent to the builder. Without a `.dockerignore`, a 60 MB `node_modules` was transferred and `COPY . .` put
  `node_modules` and a **`.env` file with a secret** into the image; with `node_modules`, `.env` and `*.tar` (plus `!arch.tar`) in `.dockerignore`, neither ended up there.
- `EXPOSE` only documents ports. Verified with nginx (`EXPOSE 80`): without `-p` no port was published; `-P` published it on a random host port (`0.0.0.0:32768`), and
  `-p 127.0.0.1:18080:80` made it reachable at `127.0.0.1:18080` (HTTP 200) and only on localhost.

## Sources

- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [Building best practices](https://docs.docker.com/build/building/best-practices/)
- [Build context and .dockerignore](https://docs.docker.com/build/concepts/context/)
- [Build secrets](https://docs.docker.com/build/building/secrets/)

## Questions

### What is the difference between `CMD` and `ENTRYPOINT`? {junior}

`ENTRYPOINT` sets the executable that always runs; `CMD` provides default arguments to it, or the default command if there's no entrypoint. Arguments passed to `docker run` replace
`CMD` but not `ENTRYPOINT` (which needs `--entrypoint` to override). In a test, `ENTRYPOINT ["echo", "hello"]` with `CMD ["world"]` printed `hello world`, and `docker run img you`
printed `hello you`.

### Why should you use the exec form of `CMD` and `ENTRYPOINT`? {mid}

In exec form (`["node", "app.js"]`) the application runs as PID 1 and receives signals such as `SIGTERM` from `docker stop`, so it can shut down gracefully. In shell form (`node app.js`)
it's started by `/bin/sh -c`, and if the shell stays as PID 1 it doesn't forward signals: in a test, the app never got `SIGTERM` and was killed after 10 seconds with exit code 137.
Some shells exec the last command and hide the issue, so rely on the exec form.

### What is the difference between `ARG` and `ENV`? {junior}

`ARG` defines a variable available only while building (set with `--build-arg`, and before `FROM` usable in the base image reference). `ENV` sets an environment variable stored in the
image and available both in later build steps and in running containers, where `-e` can override it. In a test, a build argument was visible in a `RUN` step but empty at runtime.

### Why shouldn't secrets be passed with `ARG` or `ENV`? {mid}

Build arguments and environment variables are recorded in the image: `ENV` values are in the image configuration, and build arguments can appear in the history and provenance metadata,
so anyone who can pull the image can read them (in a test, a build-arg token was readable with `docker history --no-trunc`). Use BuildKit secret mounts (`RUN --mount=type=secret,id=npm_token ...`) for build-time secrets, and inject runtime secrets from the
environment or a secrets manager when the container starts.

### When should you use `ADD` instead of `COPY`? {mid}

Only when you need its extra behavior: automatically extracting a local tar archive into the image (in a test, `ADD arch.tar` produced the extracted file, while `COPY` copied the archive)
or fetching a remote URL or Git repository. For ordinary files `COPY` is preferred because it's explicit and predictable.

### What is the build context and why does `.dockerignore` matter? {mid}

The build context is the set of files (usually the current directory) sent to the builder, and the only files `COPY` can use. Without a `.dockerignore`, large folders like
`node_modules` or `bin/obj` slow down every build, and `COPY . .` can put secrets into the image: in a test, a `.env` file ended up in the image until it was added to `.dockerignore`.
List build outputs, dependencies, VCS folders and secret files there.

### Does `EXPOSE` publish a port? {junior}

No. `EXPOSE` documents which port the application listens on and is used by `-P`. Ports are published with `-p host:container` (or `-P`, which maps exposed ports to random host ports).
In a test, nginx with `EXPOSE 80` had no published port without `-p`, `-P` mapped it to host port 32768, and `-p 127.0.0.1:18080:80` made it reachable only from localhost.

### What does `WORKDIR` do, and why use it instead of `RUN cd`? {junior}

It sets the working directory for the following `RUN`, `CMD`, `ENTRYPOINT`, `COPY` and `ADD` instructions, creating it if necessary. Each `RUN` starts a new shell, so `RUN cd /app`
doesn't affect later instructions. Using absolute `WORKDIR` paths makes the Dockerfile easier to read and the container's starting directory predictable.

### Why pin the base image version? {mid}

`FROM node:latest` or `FROM node` can change underneath you: a rebuild may bring a new major version and break the app, and two builds of the same commit can produce different images.
Pin a specific tag (`node:24-alpine`) and, for full reproducibility, a digest (`node:24-alpine@sha256:...`), then update deliberately (e.g. with Dependabot or Renovate) to pick up
security fixes.

### What is an entrypoint script, and why does it end with `exec "$@"`? {senior}

A shell script set as `ENTRYPOINT` that prepares the container at startup (waits for dependencies, renders configuration, runs migrations) and then starts the main command passed as `CMD`
arguments. Ending with `exec "$@"` replaces the shell with the application, so the application becomes PID 1 and receives signals directly; without `exec`, the script's shell stays
PID 1 and, as tested with shell form, `docker stop` falls back to `SIGKILL` after the timeout.
