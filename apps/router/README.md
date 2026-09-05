# @traffic-cop/router

The broker daemon. It owns the connection to Caddy, authorizes each calling service account by its
kernel-supplied Unix-socket identity, and applies that account's reverse-proxy routes to Caddy.

## How it works

1. Listens on a Unix socket (`@signalbox/local-rpc`) at the configured `socketPath`.
2. On each call, reads the caller's `uid` from the kernel (`SO_PEERCRED`) — never from the request.
3. Looks the `uid` up in the policy to find the hostnames that account may register.
4. Namespaces the route id per account (`acct-<uid>:<id>`) so accounts cannot touch each other's routes.
5. Applies the route to Caddy's admin API; Caddy handles the Let's Encrypt certificate automatically.

## Running it

The router is a [`@signalbox/service-cli`](https://www.npmjs.com/package/@signalbox/service-cli) app:
it manages its own config and systemd lifecycle. Every setting has a default, so it runs with no
configuration at all.

```bash
traffic-cop-router run       # run in the foreground (what systemd calls)
traffic-cop-router setup     # install and start the systemd service
traffic-cop-router status
traffic-cop-router config list        # show current config
traffic-cop-router config set <key> <value>
```

## Configuration

Stored by the CLI (`/etc/traffic-cop-router/config.json` as root, else `~/.config/...`); every key
has a default.

| key | default | meaning |
| --- | --- | --- |
| `caddyEndpoint` | `http://localhost:2019` | Caddy admin endpoint (TCP url or `unix//...` socket) |
| `caddyServer` | `srv0` | the Caddy HTTP server routes are added to |
| `acmeEmail` | — | ACME account email for Let's Encrypt registration |
| `socketPath` | `/run/traffic-cop/router.sock` | the RPC socket path |
| `socketGroup` | — | group that owns the socket (its members may call the router) |
| `policyPath` | `/etc/traffic-cop/policy.json` | path to the JSON authorization policy (hot-reloaded) |

On start (when Caddy is reachable) the router ensures `caddyServer` exists and listens on `:443`,
so Caddy's automatic HTTPS covers every route added afterwards. Existing routes and unrelated config
are preserved. The router assumes it is the sole writer of Caddy's config.

## Deployment

`traffic-cop-router setup` installs the systemd service under a dedicated `traffic-cop` system
account and creates the `/run/traffic-cop` runtime directory for the socket. The service account's
primary group (`traffic-cop`) gates access to the socket — add a service account to it to let that
account register routes:

```bash
sudo usermod -aG traffic-cop <service-account>
```

The account's uid must also appear in the policy file. Caller access therefore needs both: group
membership (to reach the socket) and a policy entry (to authorize specific hostnames).

## Policy

`policyPath` points at a JSON file mapping each account's uid to the hostnames it may register. It is
validated on load and **hot-reloaded** when the file changes — no restart needed. An invalid edit is
rejected and the previous policy is kept, so a bad save cannot take routing down. A missing file
means an empty policy (every caller rejected until it exists).

```json
{
    "accounts": {
        "1001": { "hosts": ["alice.example.com", "*.alice.example.com"] },
        "1002": { "hosts": ["bob.example.com"] }
    }
}
```

Hostnames are exact matches or `*.suffix` wildcards. A uid with no entry is rejected.

## Upstreams

The upstream address is not restricted: services legitimately live on loopback, Docker bridge
networks, or other hosts. The security boundary is host authorization (which subdomains an account
may claim), not where that account points its own traffic. Caddy validates the dial address when the
route is applied.

## License

MIT
