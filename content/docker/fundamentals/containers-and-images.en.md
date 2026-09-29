# Containers and images {junior}

A **container** is an isolated process (or group of processes) running on the host's kernel, with its own view of the file system, network, process tree and resource
limits. An **image** is the read-only template it starts from: a stack of file system layers plus metadata (command, environment, ports). Docker popularized the tooling, and the
formats are standardized by the **OCI** (Open Container Initiative), so images built with Docker run on containerd, Podman or Kubernetes. Examples here ran on Docker Desktop
(Engine 27.5.1, WSL2); the current Engine release is 29.x.

## Containers vs virtual machines

| | Container | Virtual machine |
|---|---|---|
| Isolation | Linux **namespaces** (what a process sees) and **cgroups** (what it can use) | a hypervisor with virtual hardware |
| Kernel | **shared** with the host | its own guest OS kernel |
| Size / start | megabytes, starts in about a second | gigabytes, boots in tens of seconds |
| Security boundary | weaker (one kernel for all) | stronger |

Verified:

- An Alpine and a BusyBox container both reported the same kernel, `5.15.167.4-microsoft-standard-WSL2`, while `/etc/os-release` said "Alpine Linux v3.24": the image brings
  user space, not a kernel. On Windows and macOS, Docker Desktop runs Linux containers inside a lightweight Linux VM.
- **PID namespace**: `ps` inside a container showed only its own process, as **PID 1**.
- **cgroups**: `--memory 64m --cpus 0.5` appeared inside the container as a memory limit of `67108864` bytes and a CPU quota of `50000/100000` (this engine uses cgroup v1; modern
  Linux hosts use cgroup v2 with `memory.max` and `cpu.max`).
- `docker run --rm alpine true` (create, start, exit, remove) took about 1.7 s end to end on this machine.

## Images, layers and the writable layer

- An image is **immutable** and made of **layers**, each a set of file changes from one build step. `node:24-alpine` had 4 layers; `docker history` shows the step that created
  each one and its size (165 MB for the Node.js installation).
- Layers are **shared** between images and containers, so ten containers from one image don't store ten copies.
- A running container adds a thin **writable layer**. Verified: after creating `/tmp/note.txt` and deleting `/etc/motd`, `docker diff` showed `A /tmp/note.txt` and
  `D /etc/motd`; a new container from the same image didn't see the file; the stopped container still had it until it was removed. Data meant to survive belongs in **volumes**.
- Images are identified by **tags** (`node:24-alpine`, movable names) and **digests** (`node@sha256:...`, content hashes that never change). With the containerd image store
  (default in new Engine 29 installs, enabled on this Docker Desktop) the image ID is that digest.

## Sources

- [What is a container?](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/)
- [What is an image?](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/)
- [Understanding image layers](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/)
- [containerd image store](https://docs.docker.com/engine/storage/containerd/)
- [Open Container Initiative](https://opencontainers.org/)

## Questions

### What is the difference between an image and a container? {junior}

An image is a read-only, layered template containing the file system and metadata needed to run an application. A container is a running (or stopped) instance of an image: the image
layers plus its own writable layer, with isolated process space, network and resource limits. One image can start many containers, much like a class and its objects.

### How does a container differ from a virtual machine? {junior}

A virtual machine emulates hardware and runs a full guest operating system with its own kernel, so it's heavy and slow to boot but strongly isolated. A container is just an isolated process
on the host's kernel, using namespaces and cgroups, so it starts in about a second and weighs megabytes, but all containers share one kernel, which is a weaker security boundary. In a
test, two different images reported the same host kernel version.

### What are namespaces and cgroups? {mid}

Namespaces control what a process can see: its own PID tree (the container's main process is PID 1), network interfaces, mount points, hostname, users and IPC. Control groups (cgroups)
control what it can use: memory, CPU, I/O and number of processes. Docker combines them to build containers; in a test, `--memory 64m --cpus 0.5` showed up inside the container as a
64 MiB memory limit and a 50% CPU quota.

### Can you run a Windows or a different Linux kernel in a Linux container? {mid}

No. Containers share the host's kernel, so a Linux container needs a Linux kernel, and the image only provides user space (libraries, shell, application). Different distributions work
because they use the same kernel interface: an Alpine image on an Ubuntu host runs on Ubuntu's kernel. Docker Desktop on Windows and macOS runs a Linux VM to provide that kernel; Windows
containers are a separate technology that needs a Windows kernel.

### What are image layers and why do they matter? {mid}

Each build step that changes files creates a layer, and an image is an ordered stack of them. Layers are content-addressed and shared, so images built from the same base reuse its layers
on disk and when pulling, and unchanged layers are reused from the build cache. It also means deleting a file in a later step doesn't make the image smaller, because the earlier layer
still contains it.

### What happens to files a container writes? {junior}

They go into the container's writable layer, which exists only for that container: in a test, a file created in one container wasn't visible in a new container from the same image. The
layer survives stops and restarts but is deleted with the container, and writing there is slower than a volume. Persistent data (databases, uploads) belongs in volumes or bind mounts.

### What is the containerd image store? {senior}

A storage backend in which Docker keeps images in containerd, using containerd snapshotters instead of Docker's classic graph drivers. It stores images as OCI content,
including multi-platform indexes and attestations, so one engine can hold images for several architectures. It's the default for new Docker Engine 29 installations and can be
enabled in Docker Desktop; on this machine `docker info` showed the `io.containerd.snapshotter.v1` driver type, and an image's ID equalled its manifest digest. Sizes shown by
`docker image ls` and `docker image inspect` can differ between the two stores.

### What is the OCI? {mid}

The Open Container Initiative defines open standards for container image formats, runtimes and distribution (registries). Because Docker images follow them, the same image can be run by
Docker, containerd, Podman, CRI-O or Kubernetes, and stored in any compliant registry. Docker itself uses containerd and runc (the OCI reference runtime) under the hood.

### Why shouldn't you use `docker commit` to create images? {mid}

`docker commit` snapshots a container's writable layer into a new image, which makes the image a black box: nobody knows how it was produced, it can't be rebuilt reproducibly,
reviewed or updated when the base image gets security fixes, and it often includes leftover files. Images should be built from a Dockerfile kept in version control. `docker diff` is
useful for seeing what a container changed while debugging.

### Is a container a security boundary? {senior}

Only partially. Namespaces, cgroups, capabilities, seccomp and other mechanisms isolate containers well enough for most workloads, but all containers share the host kernel, so a kernel
vulnerability or a misconfiguration (a privileged container, a mounted Docker socket, running as root with broad capabilities) can lead to host compromise. For untrusted code, add
stronger isolation: rootless or user-namespaced containers, gVisor, Kata Containers or separate VMs.
