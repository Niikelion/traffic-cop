# traffic-cop

HTTP routing for a private server with multiple service accounts. A single [Caddy](https://caddyserver.com)
instance owns `:80`/`:443` and all TLS (automatic Let's Encrypt); a broker authorizes each service
account and applies its reverse-proxy routes to Caddy over the admin API.

Built on [signalbox](https://github.com/Niikelion/signalbox): the broker is a signalbox app, service
accounts talk to it over kernel-authenticated Unix-socket RPC (`@signalbox/local-rpc`), and
`@signalbox/permissions` scopes which subdomains each account may register.

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

Scaffold. The RPC contract, client, Caddy admin client, and Pulumi adapter shape are in place;
authorization policy and the broker's Caddy bootstrap are stubbed and marked with `TODO`.

## License

MIT
