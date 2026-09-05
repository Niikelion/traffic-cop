# @traffic-cop/api

The RPC contract and a typed client for the [traffic-cop](https://github.com/Niikelion/traffic-cop) router.

Shared by the router (which implements the methods) and callers (which invoke them), so the request
and response types are defined once.

```ts
import { createTrafficCopClient } from "@traffic-cop/api"

const client = createTrafficCopClient({ socketPath: "/run/traffic-cop/router.sock" })

await client.upsertRoute(
    { id: "app", host: "alice.example.com", upstream: "localhost:43127" },
    { idempotencyKey: pulumiOperationId },
)
```

The router identifies the caller from kernel-supplied Unix-socket peer credentials, so the client
sends no identity of its own. Route `id`s are scoped per calling account by the router.

## Exports

- `createTrafficCopClient({ socketPath, timeoutMs? })` — the typed client.
- `upsertRoute` / `removeRoute` / `listRoutes` — the method descriptors (for the router to implement).
- `routeSchema` / `hostSchema` — the shared Zod schemas.

## License

MIT
