# Registries, tags and CI builds {mid}

Images are distributed through **registries** (Docker Hub, GitHub Container Registry, Azure Container Registry, Amazon ECR, self-hosted ones). A CI pipeline builds the image,
tags it, pushes it, and deployments pull it. Interview questions focus on **tags vs digests**, tagging strategy, **multi-platform** images and keeping builds fast with a
**remote cache**.

## Tags move, digests don't

Verified with a local registry (`registry:3`): an image was pushed as `1.0.0` and `latest`, then a rebuilt image as `1.1.0` and `latest`.

- The registry listed tags `1.0.0`, `1.1.0`, `latest`; after removing local copies, pulling `:latest` returned **1.1.0**: the tag had moved.
- Pulling `iprep-app@sha256:cf39...` (the digest recorded for 1.0.0) still returned **1.0.0**.

So deploy by digest (or immutable version tags) for reproducibility and rollbacks, and treat `latest` as a convenience for humans. A practical tagging scheme: semantic version
(`1.4.2`, plus `1.4` and `1`), the Git commit SHA for traceability, and optionally the branch for previews. Many registries can make tags immutable.

## Multi-platform images

An image name can point to an **index** (manifest list) with one image per platform. `docker buildx imagetools inspect alpine:3.24` listed `linux/amd64`, `linux/arm/v6`,
`linux/arm/v7`, `linux/arm64/v8` (plus attestation manifests shown as `unknown/unknown`), and the client picks the right one. Verified:

- `docker buildx build --platform linux/amd64,linux/arm64 ... --push` produced an index with both platforms;
- `docker run --platform linux/arm64 alpine uname -m` printed `aarch64` on an x86 machine, via QEMU emulation. Emulated builds are slow; native ARM runners or cross-compilation
  (e.g. `dotnet publish -r linux-arm64` in an amd64 build stage) are faster.

This matters for Apple Silicon laptops, ARM cloud instances (AWS Graviton, Azure Cobalt) and mixed clusters.

## Build cache in CI

CI runners often start empty, so each build would redo every step. Verified with fresh BuildKit builders (simulating new runners) on a Node.js project:

| Build | Time | `npm ci` |
|---|---|---|
| fresh builder, `--cache-to type=registry,ref=.../cache:main,mode=max` | 17 s | ran (2.4 s) |
| another fresh builder, no cache | 16 s | ran |
| another fresh builder, `--cache-from type=registry,ref=.../cache:main` | **9 s** | **CACHED** |

`mode=max` also exports intermediate stages. GitHub Actions has a dedicated backend (`type=gha`).

```yaml
# GitHub Actions (sketch)
- uses: docker/setup-buildx-action@v3
- uses: docker/login-action@v3
  with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
- uses: docker/build-push-action@v6
  with:
    push: true
    platforms: linux/amd64,linux/arm64
    tags: ghcr.io/acme/api:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

## Registry hygiene

Authenticate with `docker login` and credential helpers, not plain-text config; use short-lived CI credentials (OIDC) where the registry supports them; set retention policies to
delete old untagged images; scan images on push; and mind Docker Hub's pull rate limits for unauthenticated pulls in CI (mirror or authenticate).

## Sources

- [Docker Hub and registries](https://docs.docker.com/docker-hub/)
- [Image tags and digests: docker image pull](https://docs.docker.com/reference/cli/docker/image/pull/)
- [Multi-platform builds](https://docs.docker.com/build/building/multi-platform/)
- [Cache storage backends](https://docs.docker.com/build/cache/backends/)
- [GitHub Actions with Docker](https://docs.docker.com/build/ci/github-actions/)
- [Distribution registry (registry image)](https://distribution.github.io/distribution/)

## Questions

### What is a container registry? {junior}

A server that stores and distributes images, organized into repositories with tags. `docker push` uploads an image's layers and manifest, `docker pull` downloads what's missing, and layers
shared with images already present locally are reused (the pulls in a test reported "Already exists" for the base layer). Examples: Docker Hub, GHCR, ACR, ECR, Harbor, or the open-source
`registry` image for self-hosting.

### Why is deploying `latest` a bad idea? {junior}

`latest` is just a movable tag, not "the newest stable version": in a test, `:latest` pointed to 1.0.0 and after the next push to 1.1.0. Deployments using it aren't reproducible, rollbacks
don't know what to go back to, and different nodes may run different versions depending on when they pulled. Deploy explicit version tags or, better, digests.

### What is an image digest and when do you use it? {mid}

A SHA-256 hash of the image manifest that identifies exactly one image content. Pulling by digest always returns the same image: in a test, the 1.0.0 digest still returned 1.0.0 after `latest`
moved to 1.1.0. Use digests in production deployment manifests, for base images in Dockerfiles when you need full reproducibility, and in security policies.

### How would you tag images in a CI pipeline? {mid}

With the Git commit SHA on every build (traceable to the exact source), semantic version tags on releases (`1.4.2`, and possibly `1.4`/`1` for consumers who want updates), and optionally branch or
environment tags for previews. Production deploys reference the SHA tag or the digest. Enabling tag immutability in the registry prevents overwriting released versions.

### What is a multi-platform image? {mid}

An image index (manifest list) that references separate images for different OS/architecture combinations under one name, e.g. `linux/amd64` and `linux/arm64`; the client pulls the variant for its
platform. `docker buildx build --platform linux/amd64,linux/arm64 --push` builds and pushes both (verified), using emulation or cross-compilation for the non-native one. It's needed for ARM laptops and
ARM cloud servers.

### Why are emulated multi-platform builds slow and how do you speed them up? {senior}

Building for a foreign architecture runs every `RUN` instruction through QEMU emulation (in a test, an x86 machine ran an arm64 container this way), which can be many times slower for compilers and
package installs. Faster options: native builders for each architecture (ARM CI runners, remote builders), or cross-compilation in a build stage running on the native platform
(`FROM --platform=$BUILDPLATFORM` and targeting `$TARGETARCH`, e.g. `dotnet publish -r linux-arm64`), leaving only the final stage per platform.

### How do you keep Docker builds fast in CI? {mid}

Order Dockerfile instructions for caching and export the build cache between runs: `--cache-to`/`--cache-from` with a registry or the CI's cache backend. In a test with fresh builders, importing
the cache from a registry made the dependency install `CACHED` and cut the build from about 16 to 9 seconds. Also use `.dockerignore`, small base images, and multi-stage builds that skip unused
stages.

### How should CI authenticate to a registry? {mid}

With credentials scoped to the needed repositories and permissions, stored as CI secrets, or better with short-lived tokens obtained through OIDC federation (supported by GitHub Actions with GHCR,
AWS, Azure and GCP registries), so no long-lived password is stored. `docker login` stores credentials for the Docker client; credential helpers keep them in the OS keychain.

### What are Docker Hub rate limits and why do they affect CI? {mid}

Docker Hub limits the number of image pulls, with stricter limits for anonymous users, so CI systems pulling base images on every build from shared IP addresses can hit the limit and fail. Solutions:
authenticate pulls, use a pull-through cache or mirror, or copy base images to your own registry.

### What is a pull-through cache or mirror? {senior}

A registry that proxies another registry: on the first request it pulls the image from upstream and stores it, and later requests are served locally. It speeds up builds and deployments, reduces
external bandwidth and protects against upstream outages and rate limits. Cloud registries (ACR, ECR, GAR) and Harbor or the open-source `registry` image in proxy mode offer it.
