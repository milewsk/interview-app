# Multi-stage builds and small images {mid}

A **multi-stage build** uses several `FROM` stages in one Dockerfile: early stages have the SDK and build tools and compile the app, and the final stage copies only the build
output onto a small runtime image. The result is smaller, faster to pull, and has a smaller attack surface, without separate build scripts. It's the standard way to containerize
.NET, Node.js/React, Go and Java apps.

## .NET example

```dockerfile
# build stage: full SDK, never shipped
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY api/Api.csproj api/
RUN dotnet restore api/Api.csproj
COPY api/ api/
RUN dotnet publish api/Api.csproj -c Release -o /app --no-restore

# final stage: ASP.NET Core runtime only
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENTRYPOINT ["dotnet", "Api.dll"]
```

Verified with a minimal API (`docker image ls` sizes):

| Final image | Size | Notes |
|---|---|---|
| single stage on `sdk:10.0` | **1.3 GB** | SDK, NuGet cache and sources shipped; runs as **root** |
| multi-stage on `aspnet:10.0` | **340 MB** | runtime only; runs as user `app` (UID 1654) |
| multi-stage on `aspnet:10.0-noble-chiseled` | **180 MB** | no shell, no package manager; non-root by default |

All three returned HTTP 200. Facts from the images: `ASPNETCORE_HTTP_PORTS=8080` (since .NET 8 apps listen on **8080**, not 80), `APP_UID=1654`, and in the chiseled image
`docker exec ... sh` failed with "executable file not found", which is the point: there's nothing to exec into for an attacker, but also for you (debug with a sidecar container).

The chiseled image also sets **`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true`** because it has no ICU: in a test,
`1234.5m.ToString("C", CultureInfo.GetCultureInfo("pl-PL"))` returned `1 234,50 zł` on `aspnet:10.0` but threw `CultureNotFoundException` ("Only the invariant culture is supported
in globalization-invariant mode") on the chiseled image. Apps that format dates, numbers or currencies for users need an `-extra` variant or a full image.

## Frontend example

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.30-alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

Verified with a small build script: the final image was **92.8 MB** (nginx) instead of carrying the 241 MB Node.js image and `node_modules`, and served the built `index.html`.

## Useful details

- Name stages (`AS build`) instead of relying on indexes; `COPY --from=<stage>` can also copy from any image (`COPY --from=nginx:1.30-alpine /etc/nginx/nginx.conf ...`).
- `docker build --target build` stops at a stage (verified: the `build` target produced a 1.3 GB image with the SDK), useful for running tests or debugging; BuildKit builds only
  the stages the target depends on, and builds independent stages in parallel.
- Other small bases: `-alpine` (musl libc, occasional compatibility issues), Debian `-slim`, distroless and chiseled images, `scratch` for static binaries (Go, .NET native AOT with
  `runtime-deps`).

## Sources

- [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [.NET container images](https://learn.microsoft.com/en-us/dotnet/core/docker/container-images)
- [Containerize a .NET app](https://learn.microsoft.com/en-us/dotnet/core/docker/build-container)
- [Globalization invariant mode](https://github.com/dotnet/runtime/blob/main/docs/design/features/globalization-invariant-mode.md)

## Questions

### What is a multi-stage build and why use it? {junior}

A Dockerfile with several `FROM` stages where earlier stages build the application (with the SDK, compilers, dev dependencies) and the final stage copies only the output onto a minimal
runtime image. The shipped image is much smaller and contains fewer tools an attacker could use: in a test, a .NET API was 1.3 GB built on the SDK image and 340 MB (or 180 MB chiseled)
as a multi-stage build.

### How does `COPY --from` work? {mid}

It copies files from another stage (by name, e.g. `--from=build`, or index) or from any image (`--from=nginx:1.30-alpine`) instead of from the build context. It's how build output moves
into the final stage without the tools that produced it. Naming stages keeps `COPY --from` correct when stages are reordered.

### What is `--target` used for? {mid}

`docker build --target <stage>` builds up to and including that stage and outputs it as the image, for example a `test` stage that runs the test suite in CI, a `dev` stage with
hot reload, or the `build` stage for debugging (in a test, the build target was a 1.3 GB image with the SDK). BuildKit only builds stages the target needs, so unrelated stages are skipped.

### Why shouldn't you ship the .NET SDK image to production? {junior}

It's several times larger (1.3 GB vs 340 MB for the runtime image in a test), so pulls and scale-out are slower, and it contains compilers, the NuGet cache and source code that
production doesn't need and that increase the attack surface. It also ran as root in the test, while the `aspnet` image runs as the non-root `app` user when you set `USER $APP_UID`.

### What are chiseled or distroless images? {mid}

Minimal images containing only the runtime and the libraries the app needs, without a shell, package manager or other utilities. The .NET chiseled `aspnet:10.0` image was 180 MB in a test,
ran as a non-root user by default, and `docker exec ... sh` failed because there's no shell. They reduce size and attack surface, but debugging requires tools from outside (sidecar or
debug containers) and they may lack libraries such as ICU.

### What pitfall did the chiseled .NET image show with cultures? {senior}

It has no ICU and sets `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true`, so the app runs in globalization-invariant mode: in a test, formatting a price with `pl-PL` returned `1 234,50 zł` on
the regular `aspnet` image but threw `CultureNotFoundException` on the chiseled one. Apps that need culture-specific formatting, sorting or time zones should use the `-extra` variant
(with ICU and tzdata) or a full image, and tests should run on the same image as production.

### Which port does a .NET 8+ container listen on? {junior}

Port 8080, set by `ASPNETCORE_HTTP_PORTS=8080` in the official images (verified in the `aspnet:10.0` image), so the app can run as the non-root `app` user everywhere. On Linux, ports
below 1024 normally require privileges: in a test, a non-root process got "Permission denied" binding port 80 with host networking, although Docker's default bridge network allowed it
(Docker sets `ip_unprivileged_port_start=0` there), so the result depends on the runtime and its configuration. Map it with `-p 5000:8080` or change it with `ASPNETCORE_HTTP_PORTS`/`ASPNETCORE_URLS`;
older examples that expose port 80 no longer match the images.

### How do you containerize a React or Vite frontend? {mid}

Build the static files in a Node stage (`npm ci`, `npm run build`) and copy the output (`dist`) into an nginx (or other static server) image, with an nginx configuration that serves
`index.html` for client-side routes. In a test, the final nginx image was 92.8 MB and served the built page, without Node.js or `node_modules`. Runtime configuration such as the API URL
needs special handling, because build-time environment variables are baked into the bundle.

### What are the trade-offs of Alpine-based images? {mid}

They're small because Alpine uses musl libc and BusyBox, but musl can behave differently from glibc (DNS resolution details, performance of some workloads, native modules or binaries
built for glibc not working). For .NET and Node.js, Alpine images are supported and widely used, but if you hit native compatibility issues, Debian `-slim`, Ubuntu chiseled or distroless
images are alternatives with glibc.

### How can you run tests as part of a multi-stage build? {senior}

Add a stage after `build` that runs the tests (`FROM build AS test` + `RUN dotnet test`) and build it in CI with `--target test`, so the tests run in the same environment as the build;
the final stage doesn't depend on it, so production builds skip it. Test results can be exported with a separate stage and `--output`. Many teams still run tests outside Docker for faster
feedback and use the container build only for packaging.
