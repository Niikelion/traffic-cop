import { defineLocalRpcMethod } from "@signalbox/local-rpc"
import { z } from "zod"

/** A host matcher: one hostname or several. */
export const hostSchema = z.union([z.string(), z.array(z.string()).nonempty()])

/** A route as seen over the wire. */
export const routeSchema = z.object({
    /** Stable route id. The router scopes ids per calling account. */
    id: z.string().min(1),
    /** Hostname(s) to route; the router provisions HTTPS for them via Caddy. */
    host: hostSchema,
    /** Upstream to proxy to, as `host:port`, e.g. `"localhost:3000"`. */
    upstream: z.string().min(1),
})

/** Create or replace one reverse-proxy route owned by the caller. */
export const upsertRoute = defineLocalRpcMethod({
    method: "router.route.upsert",
    request: routeSchema,
    response: z.object({ id: z.string() }),
})

/** Remove one route the caller owns. */
export const removeRoute = defineLocalRpcMethod({
    method: "router.route.remove",
    request: z.object({ id: z.string().min(1) }),
    response: z.object({ removed: z.boolean() }),
})

/** List the routes the caller owns. */
export const listRoutes = defineLocalRpcMethod({
    method: "router.route.list",
    request: z.object({}),
    response: z.object({
        routes: z.array(
            z.object({
                id: z.string(),
                host: z.array(z.string()),
                upstream: z.string(),
            }),
        ),
    }),
})
