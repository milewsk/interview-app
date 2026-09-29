# Networking {mid}

Each container gets its own network namespace: its own interfaces, IP address and `localhost`. Docker connects containers through **networks** (by default a Linux bridge),
provides **DNS** between containers on user-defined networks, and makes services reachable from outside by **publishing ports**. Most "it works locally but not in Docker"
problems are networking misunderstandings, which is why interviewers ask about them.

## User-defined bridge networks

```bash
docker network create backend
docker run -d --name db --network backend postgres:18-alpine
docker run -d --name api --network backend -e DB_HOST=db my-api
```

Verified:

- On a user-defined network, a container reached nginx **by container name** and by a **network alias** (`--network-alias api`); the embedded DNS server is `127.0.0.11`.
- A container on another network was unreachable both by name ("bad address") and by IP (timeout): networks isolate groups of containers. After
  `docker network connect` added the second container to the first network, it was reachable by name.
- On the **default `bridge` network**, names didn't resolve ("bad address"), only IP addresses worked. That's why applications should use their own networks (Compose creates one
  per project automatically).

## Ports and `localhost`

- Inside a container, `localhost` is **the container itself**: a request to `localhost:80` from a container without a web server was refused. To reach another container use its
  name; to reach the host from a container on Docker Desktop use **`host.docker.internal`** (verified: it reached a server published on the host's `127.0.0.1:18200`). On Linux add
  `--add-host=host.docker.internal:host-gateway`.
- Publishing: `-p 8080:80` maps host port 8080 to container port 80 on all interfaces; `-p 127.0.0.1:8080:80` only on localhost (see the Dockerfile topic, where `-P` picked a
  random port). Published ports on Linux are implemented with iptables/nftables rules that can bypass host firewalls such as `ufw`, so bind to `127.0.0.1` when a port shouldn't be public.
- The application must listen on **`0.0.0.0`** (all interfaces) inside the container; a server bound to `127.0.0.1` inside the container isn't reachable through a published port.

## Network drivers

| Driver | Use |
|---|---|
| `bridge` | default, single host, isolated networks per app |
| `host` | the container uses the host's network stack directly (no isolation, no port mapping; Linux, opt-in on Docker Desktop) |
| `none` | no networking: verified, only the `lo` interface existed |
| `overlay` | multi-host networks (Swarm) |
| `macvlan`/`ipvlan` | containers appear as devices on the physical network |
| `container:<name>` | share another container's network namespace (debugging, sidecars) |

## Sources

- [Networking overview](https://docs.docker.com/engine/network/)
- [Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)
- [Port publishing and mapping](https://docs.docker.com/engine/network/port-publishing/)
- [Docker Desktop networking (host.docker.internal)](https://docs.docker.com/desktop/features/networking/)
- [Packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

## Questions

### How do containers find each other on the same host? {junior}

Put them on the same user-defined network (`docker network create`, or the default network Compose creates) and use container names or network aliases as host names; Docker's embedded
DNS server (`127.0.0.11`) resolves them to the current IP addresses. In a test, a container reached nginx by its name and by an alias. Hard-coding IP addresses breaks because they change
when containers are recreated.

### Why can't containers on the default bridge network resolve each other by name? {mid}

The default `bridge` network doesn't provide automatic DNS between containers (a legacy behavior); only IP addresses work there, as a test showed ("bad address" by name, success by IP).
User-defined bridge networks add name resolution, better isolation (only containers you attach are connected) and the ability to connect and disconnect containers at runtime, so they
should be used instead.

### What does `localhost` mean inside a container? {junior}

The container's own network namespace, not the host and not other containers. A request to `localhost` from one container can't reach a database in another container or on your
machine: in a test it was refused because nothing listened in that container. Use the other container's name, or `host.docker.internal` to reach the host on Docker Desktop.

### What is an internal network? {mid}

A user-defined network created with `docker network create --internal`: containers on it can talk to each other, but the network has no route to the outside world. In a test,
a container on an internal network reached a sibling nginx by name, while its request to a public website was blocked; the same request from the default network succeeded. It
suits databases and back-end services that should never initiate or receive outside traffic; services that need both attach to an internal and a normal network.

### Why is my app in a container unreachable even though the port is published? {mid}

Common causes: the app listens on `127.0.0.1` inside the container instead of `0.0.0.0`, so traffic arriving on the container's network interface is refused; the wrong container port is
mapped (e.g. 80 instead of 8080 for .NET 8+ images); the app crashed (check `docker ps` and `docker logs`); or a host firewall or another process uses the host port. `docker port` shows the
actual mappings.

### How do you isolate groups of containers? {mid}

Create separate user-defined networks, e.g. `frontend` and `backend`, and attach each container only to the networks it needs: the database only to `backend`, the API to both, the reverse
proxy only to `frontend`. In a test, a container on one network couldn't reach a container on another either by name or by IP until it was explicitly connected. Mark internal networks
with `--internal` to block outside access.

### How does a container reach a service running on the host? {mid}

On Docker Desktop, via the special name `host.docker.internal` (in a test, a container reached a server published on the host's localhost this way). On Linux, add
`--add-host=host.docker.internal:host-gateway` (or `extra_hosts` in Compose), or use host networking. The host service must listen on an interface the container can reach.

### What is host networking and when would you use it? {senior}

With `--network host` the container shares the host's network stack: no separate IP, no port mapping, the app binds directly to host ports. It avoids NAT overhead and helps with software
that needs many ports or multicast, but removes network isolation and can cause port conflicts. It's a Linux feature; Docker Desktop supports it only as an opt-in. Most applications should use
bridge networks.

### Why can published ports bypass a firewall like `ufw` on Linux? {senior}

Docker publishes ports by inserting its own iptables (or nftables) rules for NAT and forwarding, which are evaluated before the chains that tools like `ufw` manage, so a published port can be
reachable from the internet even if the firewall appears to block it. Mitigations: publish only on `127.0.0.1` behind a reverse proxy, use the `DOCKER-USER` chain for filtering, or rely on
cloud security groups.

### How do you debug network problems between containers? {mid}

Check that both containers are on the same network (`docker network inspect`), then test from inside: `docker exec` into the client or run a throwaway container on the same network (or
sharing the container's namespace with `--network container:<name>`) with tools like `wget`, `nslookup` or `nc` to verify DNS resolution and connectivity to the right port. Then check that
the server listens on `0.0.0.0` and on the expected port, and read both containers' logs.
