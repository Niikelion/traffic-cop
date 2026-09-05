# @traffic-cop/router

The broker daemon. It owns the connection to Caddy, authorizes each calling service account by its
kernel-supplied Unix-socket identity, and applies that account's reverse-proxy routes to Caddy.

## How it works

1. Listens on a Unix socket (`@signalbox/local-rpc`) at `TRAFFIC_COP_SOCKET`.
2. On each call, reads the caller's `uid` from the kernel (`SO_PEERCRED`) — never from the request.
3. Looks the `uid` up in the policy to find the hostnames that account may register.
4. Namespaces the route id per account (`acct-<uid>:<id>`) so accounts cannot touch each other's routes.
5. Applies the route to Caddy's admin API; Caddy handles the Let's Encrypt certificate automatically.

## Configuration (environment)

| variable | default | meaning |
| --- | --- | --- |
| `TRAFFIC_COP_SOCKET` | `/run/traffic-cop/router.sock` | the RPC socket path |
| `TRAFFIC_COP_GROUP` | — | group that owns the socket (members may call the router) |
| `TRAFFIC_COP_POLICY` | — | path to a JSON policy file (`{ accounts: { <uid>: { hosts: [...] } } }`) |
| `CADDY_ADMIN` | `http://localhost:2019` | Caddy admin endpoint (TCP or `unix//...`) |
| `CADDY_SERVER` | `srv0` | the Caddy HTTP server routes are added to |
| `ACME_EMAIL` | — | ACME account email for Let's Encrypt registration |

## Startup

On start (when Caddy is reachable) the router ensures `CADDY_SERVER` exists and listens on `:443`,
so Caddy's automatic HTTPS covers every route added afterwards. Existing routes and unrelated config
are preserved. The router assumes it is the sole writer of Caddy's config.

## Not yet implemented

- Validating and hot-reloading the policy file.
- Restricting upstreams to a loopback address the account owns.

## License

MIT
