# Layers and the build cache {mid}

Every Dockerfile instruction that changes the file system produces a **layer**, and the builder (**BuildKit**, the default since Docker Engine 23) reuses a layer from its
**cache** when the instruction and its inputs haven't changed. Ordering instructions well is the difference between a 2-second and a 2-minute rebuild, and understanding layers
explains why images are sometimes unexpectedly large.

## How the cache works

- A step is reused if the instruction text is the same, its parent layer is the same, and for `COPY`/`ADD` the **checksums of the copied files** are the same (timestamps don't
  matter). `RUN` steps are cached by their command text, not by what they download.
- Once a step is rebuilt, **every following step is rebuilt** too.
- `--no-cache` ignores the cache; `--pull` checks for a newer base image; `RUN apt-get update` alone in a cached layer never refreshes, so combine it with the install in one `RUN`.

## Order from least to most frequently changed

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./          # changes rarely
RUN npm ci --omit=dev          # cached while the lock file is unchanged
COPY . .                       # changes on every commit
CMD ["node", "server.js"]
```

Verified with a project depending on `express` and `lodash`: after editing only `server.js`,

- the Dockerfile with `COPY . .` **before** `npm ci` re-ran the install (3.2 s, whole build about 5.9 s);
- the version above reported `npm ci` as **CACHED** and rebuilt in about **1.6 s**.

The same applies to .NET (`COPY *.csproj` + `dotnet restore` before `COPY . .`) and other ecosystems.

## Layers and image size

Files deleted in a later layer still exist in the earlier one. Verified: writing a 50 MB file in one `RUN` and deleting it in the next produced a **53.9 MB** image (the history showed
a 50 MB layer), while creating and deleting it in the **same** `RUN` gave **3.9 MB**, the size of the Alpine base. That's why installs and their cleanup go in one step
(`apk add --no-cache ...`, `apt-get install ... && rm -rf /var/lib/apt/lists/*`), and why multi-stage builds are the cleanest way to leave build tools behind.
`docker history` and tools like `dive` show what each layer contains.

## Cache mounts

`RUN --mount=type=cache,target=/root/.npm npm ci` keeps the package manager's download cache **between builds** without putting it in the image, so when the lock file changes the
install doesn't start from zero. In the test project (69 small packages on a fast network) the gain was small (`npm ci` 1.1 s with a warm cache mount vs 1.4 s without); it matters
for large dependency trees, slow registries and compiled dependencies. Similar targets: `/root/.nuget/packages`, `/root/.cache/pip`, `/var/cache/apt`.

In CI, where each build may run on a fresh machine, the layer cache must be exported and imported (`--cache-to`/`--cache-from` with a registry or the CI's cache backend).

## Sources

- [Docker build cache](https://docs.docker.com/build/cache/)
- [Optimize cache usage in builds](https://docs.docker.com/build/cache/optimize/)
- [Understanding image layers](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/)
- [Cache storage backends](https://docs.docker.com/build/cache/backends/)
- [BuildKit](https://docs.docker.com/build/buildkit/)

## Questions

### How does Docker decide whether a build step can use the cache? {mid}

It compares the instruction with a cached step built on the same parent layer: the instruction text must match, and for `COPY` and `ADD` the checksums of the source files must match
too. `RUN` commands are matched by their text only, so `RUN apt-get update` doesn't notice new packages. When one step misses the cache, all later steps are rebuilt.

### Why copy the dependency manifest before the rest of the source code? {junior}

So the expensive dependency installation sits in a layer that only depends on the manifest and lock file. When you change application code, only the final `COPY` and later steps are
rebuilt and the install is taken from the cache. In a test, changing one source file rebuilt the image in about 1.6 s with this order, versus about 5.9 s (reinstalling packages) when
the whole project was copied first.

### Why doesn't deleting a file in a later `RUN` make the image smaller? {mid}

Layers are stacked, and a later layer can only hide a file (with a "whiteout"), not remove it from the earlier layer, which is still downloaded and stored. In a test, creating a 50 MB
file in one `RUN` and deleting it in the next gave a 53.9 MB image, while doing both in a single `RUN` gave 3.9 MB. Clean up in the same step, or use a multi-stage build.

### Why combine `apt-get update` and `apt-get install` in one `RUN`? {mid}

If `update` is a separate step, its layer is cached indefinitely, so a later change to the install line runs against an old package index and may fail or install outdated versions.
Combining them (`RUN apt-get update && apt-get install -y --no-install-recommends pkg && rm -rf /var/lib/apt/lists/*`) refreshes the index whenever the install changes and removes the
index files from the layer.

### What is BuildKit? {mid}

The build engine behind `docker build` since Docker Engine 23 (and `docker buildx`). It builds independent stages in parallel, skips unused stages, transfers the build context
incrementally, and supports features like cache mounts, secret and SSH mounts, cache export/import, multi-platform builds and attestations. Most modern Dockerfile features
(`RUN --mount`, heredocs) require it.

### What is a cache mount, and how is it different from the layer cache? {senior}

The layer cache reuses whole steps only when their inputs are unchanged. A cache mount (`RUN --mount=type=cache,target=...`) gives a step a persistent directory, such as the npm or NuGet
package cache, that survives between builds but isn't included in the image. So even when the lock file changes and the step reruns, the package manager can reuse previously downloaded
packages. The benefit grows with dependency size; in a small test project it was only about 0.3 s.

### How do you keep the build cache in CI? {senior}

CI runners often start without local cache, so every build would start from scratch. BuildKit can export the cache (`--cache-to`) and import it (`--cache-from`) using a registry
(`type=registry`), the local file system, or CI-specific backends such as GitHub Actions (`type=gha`). With `mode=max`, layers of intermediate stages are cached too, which helps
multi-stage builds.

### How do you find out what makes an image large? {mid}

`docker history <image>` lists layers with their sizes and the instructions that created them; tools like `dive` let you browse each layer's files. Typical culprits are build tools and
SDKs left in the final image, package manager caches, files deleted in a later layer, a missing `.dockerignore`, and a large base image. Fixes: multi-stage builds, slimmer base
images, cleanup in the same `RUN`.

### When should you use `--no-cache` or `--pull`? {mid}

`--pull` makes the builder check for a newer version of the base image tag, which is how you pick up security patches in scheduled or release builds. `--no-cache` rebuilds every step,
useful when a cached `RUN` step fetched something that has since changed or when you suspect a stale cache. Routine development builds use neither, to stay fast.

### Does changing a `LABEL`, `ENV` or `ARG` value invalidate the cache of later steps? {senior}

It depends on whether later steps can see the value. Verified with BuildKit: changing a `LABEL` (image metadata only) left the following `RUN` step **CACHED**; changing an `ENV`
value made it rerun, because environment variables are part of every later `RUN`; changing an `ARG` default rebuilt only a `RUN` that referenced the argument and kept an unrelated
one cached. So values that change on every build, such as a commit hash, should be declared as late as possible and only where they're used.
