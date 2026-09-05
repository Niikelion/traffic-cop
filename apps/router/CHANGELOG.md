# @traffic-cop/router

## 0.1.2

### Patch Changes

- Depend on `@traffic-cop/api` by version range instead of the `workspace:` protocol. `changeset publish` (npm) does not rewrite `workspace:*`, so the published 0.1.1 shipped an unresolvable `workspace:*` dependency and failed to install (`EUNSUPPORTEDPROTOCOL`). A real range publishes cleanly and is kept in sync by changesets.

## 0.1.1

### Patch Changes

- Fix Caddy admin connectivity: send the `Host` header with the port so Caddy's admin origin check accepts the request. Without it Caddy answered 403, which the router reported as "caddy admin not reachable" and skipped bootstrapping the `:443` server.
