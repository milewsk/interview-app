# Container security {senior}

Containers isolate processes, but all of them share the host's kernel, and Docker's defaults favour convenience: processes run as **root**, images may contain secrets or
vulnerable packages, and a single flag (`--privileged`, a mounted Docker socket) can hand over the host. Securing containers means reducing what a compromised process can do and
what an image contains.

## Run as non-root

Verified: `docker run alpine id` returned `uid=0(root)`; with `--user 1000:1000` it was `uid=1000`. Set `USER` in the Dockerfile (the .NET images provide `USER $APP_UID`, UID
1654; Node images a `node` user), make only the necessary directories writable for that user, and make sure the app listens on a port above 1024 (see multi-stage builds).
Rootless Docker or user namespace remapping additionally maps container root to an unprivileged host user.

## Capabilities and privileges

Root in a container doesn't have all of root's powers: Docker grants a limited set of Linux **capabilities**. Verified:

- default effective capabilities were `00000000a80425fb`; with `--cap-drop ALL` they were `0`, and `chown`, which worked as root by default, failed with "Operation not permitted";
- mounting a file system inside a default container was denied, but worked with `--privileged`, which also exposed **171** device nodes in `/dev` instead of 15.

So: `--cap-drop ALL` and add back only what's needed (`--cap-add NET_BIND_SERVICE`), never use `--privileged` for applications, add `--security-opt no-new-privileges` (setuid
binaries can't gain privileges), keep the default seccomp and AppArmor/SELinux profiles, and use `--read-only` with a tmpfs for writable paths.

## The Docker socket

Mounting `/var/run/docker.sock` gives a container the full Docker API. Verified: a Node.js script in a container with the socket mounted listed **all 13 containers on the host**;
it could just as well start a privileged container that mounts the host's root file system, so the socket is equivalent to **root on the host**. Avoid it; if a tool really needs
it (CI agents, reverse proxies that watch containers), use a restricted socket proxy or rootless setups.

## Image contents

- **Secrets never in images**: a token passed with `--build-arg` was readable in `docker history` (see the Dockerfile topic), and a `.env` copied by `COPY . .` ended up in the
  image without a `.dockerignore`. Use build secrets and runtime secrets.
- **Small, trusted bases**: official or verified images pinned by version or digest; minimal images (chiseled, distroless, Alpine) contain fewer packages that can be vulnerable.
- **Scan and rebuild**: scanners such as Docker Scout (needs a Docker login; it asked for one here), Trivy or Grype list known CVEs in OS packages and dependencies; rebuild regularly
  with `--pull` to pick up base image patches, and generate SBOMs and provenance attestations (`docker buildx build --sbom=true --provenance=true`).
- **Sign and verify** images (Docker Content Trust / Notary, Sigstore cosign) so deployments run only what your pipeline built.

## Sources

- [Docker Engine security](https://docs.docker.com/engine/security/)
- [Rootless mode](https://docs.docker.com/engine/security/rootless/)
- [Runtime privilege and Linux capabilities](https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities)
- [Protect the Docker daemon socket](https://docs.docker.com/engine/security/protect-access/)
- [Docker Scout](https://docs.docker.com/scout/)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)

## Questions

### Why shouldn't containers run as root? {junior}

If an attacker exploits the application, they get the container's user. As root they can modify everything in the container, use root's capabilities, and a container escape or a
misconfiguration (mounted host paths, the Docker socket) leads directly to root on the host. By default containers run as root (verified: `uid=0`), so set a non-root `USER` in the image or
run with `--user`, like the .NET images' `app` user.

### What are Linux capabilities in the context of Docker? {mid}

Root's privileges split into units such as `CHOWN`, `NET_ADMIN`, `SYS_ADMIN` or `NET_BIND_SERVICE`. Docker gives containers a reduced default set, so container root is weaker than host
root: mounting file systems was denied in a test. `--cap-drop ALL` removes them all (then `chown` failed as root), and `--cap-add` adds specific ones back. The principle is least privilege:
drop all, add only what the app needs.

### What does `--privileged` do and why is it dangerous? {mid}

It gives the container all capabilities, access to host devices (171 entries in `/dev` versus 15 by default in a test), and disables seccomp and AppArmor confinement, so the container can mount
host disks, load kernel modules and effectively control the host. It's meant for special cases like Docker-in-Docker or hardware access, not for applications.

### Why is mounting the Docker socket into a container risky? {mid}

The socket exposes the full Docker API, and anyone who can use it can start a privileged container with the host's file system mounted, which amounts to root on the host. In a test, a
container with the socket mounted listed every container running on the host. Only trusted infrastructure tools should get it, preferably through a proxy that allows only the needed API calls.

### How do you keep secrets out of images? {mid}

Never `COPY` them in or pass them as `ARG`/`ENV`: build arguments were visible in `docker history` in a test, and files copied without a `.dockerignore` stay in layers even if deleted later.
Use BuildKit secret mounts for build-time secrets, inject runtime secrets from the orchestrator or a secrets manager (as files or environment variables at start), and keep `.dockerignore`
up to date. If a secret was ever baked into a pushed image, rotate it.

### How do you find vulnerabilities in images? {mid}

Scan them with tools such as Docker Scout, Trivy or Grype, which compare OS packages and application dependencies with vulnerability databases, ideally in CI with a policy that fails the
build on critical findings. Because new CVEs appear after build time, scan registries continuously and rebuild images regularly with `--pull` to pick up base image fixes. Smaller base images
mean fewer findings.

### What does `--read-only` do, and what breaks when you enable it? {mid}

It mounts the container's root file system read-only, so a compromised process can't modify binaries or configuration or drop tools into the container. Many images expect to
write somewhere at startup: in a test, `nginx` with `--read-only` exited with code 1 because its entrypoint couldn't modify `/etc/nginx/conf.d/default.conf`, and it ran once
`/var/cache/nginx`, `/run` and `/tmp` were mounted as tmpfs. So combine `--read-only` with tmpfs or volumes for the few paths that must be writable.

### What is rootless Docker? {senior}

Running the Docker daemon and containers as an unprivileged user, using user namespaces so that root inside a container maps to a non-root user on the host. A container escape then gives an
attacker only that user's privileges. It has limitations (some network and storage features, performance of some drivers). A related option is user namespace remapping (`userns-remap`) for the
regular daemon.

### What runtime flags harden a container? {senior}

`--user` (non-root), `--cap-drop ALL` plus minimal `--cap-add`, `--security-opt no-new-privileges`, `--read-only` with `--tmpfs` for writable paths, resource limits (`--memory`, `--pids-limit`)
to contain denial of service, no `--privileged`, no Docker socket, only needed ports published on the right interfaces, and the default seccomp/AppArmor profiles left enabled.

### How do you ensure only trusted images are deployed? {senior}

Build images in CI from reviewed Dockerfiles, push them to a private registry, and deploy by digest rather than mutable tags. Sign images (Sigstore cosign, Notation) and verify signatures at
deployment with an admission policy, attach SBOMs and provenance attestations, restrict which registries can be pulled from, and scan images before promotion to production.
