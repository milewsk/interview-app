# Volumes and storage {mid}

A container's writable layer disappears with the container, so anything that must survive (database files, uploads) or be shared goes into a **mount**. Docker has three kinds:
**volumes** (managed by Docker), **bind mounts** (a host path) and **tmpfs** (memory). Choosing the right one, and knowing how they behave on first use, is a common interview
topic, especially around databases in containers.

## Named volumes

```bash
docker volume create pgdata
docker run -d -e POSTGRES_PASSWORD=pw -v pgdata:/var/lib/postgresql postgres:18-alpine
```

Verified with PostgreSQL 18: a table created in the first container was still there (`42`) after the container was **removed** and a new one started on the same volume. The new
container logged "Database directory appears to contain a database; Skipping initialization", and the different `POSTGRES_PASSWORD` it was given had **no effect**: the image's
`POSTGRES_*` variables only apply when initializing an empty data directory. Note that the `postgres:18` image moved its data: it declares `VOLUME /var/lib/postgresql` with
`PGDATA=/var/lib/postgresql/18/docker`, and a volume mounted at the old path `/var/lib/postgresql/data` made the container **exit with code 1** and an error explaining the
new major-version-specific layout (verified).

- Volumes live in Docker's storage area, work the same on every OS, and can use drivers (NFS, cloud storage).
- An **empty volume is pre-populated** from the image on first mount: a new volume mounted at nginx's `/usr/share/nginx/html` contained the image's `50x.html` and `index.html`.
- Removing a container keeps its named volumes; `docker volume rm` or `docker volume prune` deletes them.

## Anonymous volumes

If an image declares `VOLUME` and you don't mount anything there, Docker creates an **anonymous volume** with a random name: starting `postgres:18-alpine` without `-v` increased
the number of volumes by one. `docker rm -v` removes it together with the container; otherwise such volumes accumulate unnoticed.

## Bind mounts

`-v /host/path:/container/path` (or `--mount type=bind,...`) maps a host directory into the container, which is ideal for **development** (live code, config files) but ties the
container to the host's layout and permissions. Verified:

- files written by the container appeared on the host, and host files were visible in the container;
- an **empty host directory hides** the image's content at that path (the nginx HTML directory listed nothing), unlike a volume, which is pre-populated;
- `:ro` made the mount read-only ("Read-only file system").

On Docker Desktop, bind mounts from the Windows or macOS file system cross the VM boundary and are slower than volumes; for heavy I/O (e.g. `node_modules`) keep files in a volume or
in the WSL 2 file system. On Linux, file ownership is by numeric UID, so a non-root container user may be unable to write to a host directory owned by someone else.

## tmpfs and read-only containers

`--tmpfs /scratch:size=16m` gives an in-memory directory (it showed a 16 MB file system) that disappears when the container stops, good for temporary or sensitive files. With
`--read-only` the root file system is read-only (writing to `/etc` failed) while a tmpfs at `/tmp` stays writable, a useful hardening combination.

## Backups

Back up a volume with a throwaway container: `docker run --rm -v pgdata:/src:ro -v "$PWD":/backup alpine tar -czf /backup/pgdata.tgz -C /src .` (verified: a 4.8 MB archive). For
databases, prefer the database's own tools (`pg_dump`) or stop writes first, since copying files of a running database can produce an inconsistent snapshot.

## Sources

- [Volumes](https://docs.docker.com/engine/storage/volumes/)
- [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [tmpfs mounts](https://docs.docker.com/engine/storage/tmpfs/)
- [postgres image: PGDATA and PostgreSQL 18](https://hub.docker.com/_/postgres)
- [WSL 2 best practices (Docker Desktop)](https://docs.docker.com/desktop/features/wsl/best-practices/)

## Questions

### What is the difference between a volume, a bind mount and tmpfs? {junior}

A volume is storage managed by Docker (created with `docker volume create` or on first use), independent of the host's directory structure and portable across operating systems. A bind
mount maps an existing host path into the container, so both sides see the same files. A tmpfs mount lives in memory and disappears when the container stops. Volumes are the default
choice for persistent data, bind mounts for development and configuration, tmpfs for temporary or sensitive files.

### How do you persist database data in Docker? {junior}

Mount a named volume at the database's data directory, e.g. `-v pgdata:/var/lib/postgresql` for PostgreSQL 18. The data survives removing and recreating the container: in a test, a new
container on the same volume still had the table and value created by the previous one. Without a volume, the data lives in the writable layer (or an anonymous volume) and is easily lost.

### Why didn't changing `POSTGRES_PASSWORD` change the database password? {mid}

The official image uses `POSTGRES_PASSWORD`, `POSTGRES_USER` and `POSTGRES_DB` only when it initializes an empty data directory. With an existing volume it logs "Skipping
initialization" and ignores them, as a test with a different password showed. To change credentials you use SQL (`ALTER USER`), or delete the volume in development to reinitialize.

### What happens when you mount an empty volume versus an empty bind mount over a directory that has files in the image? {mid}

An empty named volume is populated with the image's files at that path on first mount: a new volume on nginx's HTML directory contained the image's `index.html` and `50x.html`. A bind
mount always shows the host directory's contents, so an empty host directory hides the image's files: the same path listed nothing. This explains "my config disappeared" surprises with
bind mounts.

### What are anonymous volumes and why can they be a problem? {mid}

Volumes with generated names that Docker creates when an image declares `VOLUME` and you don't mount anything there (as the `postgres` image does). They persist after the container stops
and aren't obviously linked to anything, so they pile up and waste disk space; in a test, running PostgreSQL without `-v` added one. Use named volumes, remove containers with
`docker rm -v`, and clean up unused volumes deliberately.

### Why are bind mounts slow on Docker Desktop, and what do you do about it? {mid}

On Windows and macOS, containers run in a Linux VM, so a bind mount from the host file system goes through a file-sharing layer between the host and the VM, which is much slower than
native disk access, especially for many small files like `node_modules`. Keep heavy directories in named volumes, and on Windows keep the project in the WSL 2 file system, as the Docker
documentation recommends.

### How do you make a mount read-only, and why? {junior}

Add `:ro` to `-v` (or `readonly` with `--mount`): writes then fail with "Read-only file system", as a test showed. Use it for configuration, secrets and source code that the container
shouldn't modify. Combined with `--read-only` for the root file system and a tmpfs for `/tmp`, it limits what a compromised process can change.

### How do you back up a Docker volume? {mid}

Run a temporary container that mounts the volume (read-only) and a host directory, and archive the volume's contents:
`docker run --rm -v pgdata:/src:ro -v "$PWD":/backup alpine tar -czf /backup/pgdata.tgz -C /src .`. Restore the same way in reverse. For databases, use their dump tools or
stop the database first, because copying the files of a running database may not give a consistent backup.

### Why might a container fail to write to a bind-mounted directory? {senior}

On Linux, permissions are checked by numeric UID and GID, and the container's user (for example UID 1654 in .NET images or 1000 in Node images) may not own or have write access to the
host directory, which is owned by your host user or root. Fixes: set matching ownership on the host directory, run the container with `--user $(id -u):$(id -g)`, or use a named volume
initialized with the right ownership. Docker Desktop's file sharing hides many of these issues, which then appear on Linux servers.

### Should you run a database in a container in production? {senior}

It's common for development, testing and CI, and possible in production with care: data on a durable volume, resource limits, backups and restore tests, monitoring, and planned upgrades
(e.g. the PostgreSQL 18 image changed its data path). Many teams prefer managed database services in production to offload backups, high availability and patching, and use containers for
stateless services.
