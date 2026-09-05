# traffic-cop

HTTP routing for a private server with multiple service accounts. A single [Caddy](https://caddyserver.com)
instance owns `:80`/`:443` and all TLS (automatic Let's Encrypt); a broker authorizes each service
account and applies its reverse-proxy routes to Caddy over the admin API.

Built on [signalbox](https://github.com/Niikelion/signalbox): the broker is a signalbox app, and
service accounts talk to it over kernel-authenticated Unix-socket RPC (`@signalbox/local-rpc`) — the
router identifies each caller by its OS uid, never by anything the caller sends. A policy file maps
each uid to the subdomains it is allowed to register.

```
service account (Pulumi)
  → @traffic-cop/pulumi  ─┐
  → @traffic-cop/api      ├─ Unix socket (peer uid) ─▶  router (broker)
                          ┘                               ├─ authorize uid → allowed hosts
                                                          └─ Caddy admin API (routes + auto-HTTPS)
```

## Packages

| package | what it does |
| --- | --- |
| [`@traffic-cop/router`](apps/router) | the broker daemon: owns Caddy, authorizes callers, applies routes |
| [`@traffic-cop/api`](packages/api) | the RPC contract and a typed client for talking to the router |
| [`@traffic-cop/pulumi`](packages/pulumi) | a Pulumi resource that declares a route as part of a deployment |

## Status

Early, but functional end to end. The router runs as a [`@signalbox/service-cli`](https://www.npmjs.com/package/@signalbox/service-cli)
daemon: on start it ensures Caddy has an HTTPS server, then authorizes each caller by uid against a
hot-reloaded policy and applies routes over Caddy's admin API. The RPC contract, typed client, and
Pulumi resource are in place, and the core logic (authorization, policy loading, route building) is
unit-tested.

Not yet published to npm, and not yet proven in production — interfaces may still change, and
real-world hardening is ongoing. Feedback and issues welcome.

## Requirements

Linux (the router uses Unix-socket peer credentials and systemd) and a [Caddy](https://caddyserver.com)
instance with its admin API reachable.

## License

MIT
