# @traffic-cop/router

## 0.1.1

### Patch Changes

- Fix Caddy admin connectivity: send the `Host` header with the port so Caddy's admin origin check accepts the request. Without it Caddy answered 403, which the router reported as "caddy admin not reachable" and skipped bootstrapping the `:443` server.
