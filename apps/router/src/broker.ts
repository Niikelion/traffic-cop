import { LocalRpcError, type LocalRpcPeer, type LocalRpcPlugin } from "@signalbox/local-rpc"
import { listRoutes, removeRoute, upsertRoute } from "@traffic-cop/api"
import type { CaddyAdmin } from "./caddy/api"
import type { RouterPolicy } from "./policy"

const hostMatches = (allowed: string, host: string): boolean => {
    if (allowed === host) return true
    if (allowed.startsWith("*.")) return host.endsWith(allowed.slice(1)) && host !== allowed.slice(2)
    return false
}

/** The gids a caller belongs to: its primary group plus any supplementary groups. */
const groupIdsOf = (peer: LocalRpcPeer): number[] => [...new Set([peer.gid, ...(peer.supplementaryGids ?? [])])]

/**
 * The host patterns a caller may register: its uid rule plus every group rule for a group it is in.
 * `undefined` means the caller has no applicable rule at all (unregistered).
 */
const allowedPatternsFor = (policy: RouterPolicy, peer: LocalRpcPeer): string[] | undefined => {
    const rules = [
        policy.accounts[String(peer.uid)],
        ...groupIdsOf(peer).map(gid => policy.groups[String(gid)]),
    ].filter(rule => rule !== undefined)

    if (rules.length === 0) return undefined
    return rules.flatMap(rule => rule.hosts)
}

/** Namespace a caller's route id so accounts cannot address each other's routes. */
const scopedId = (uid: number, id: string): string => `acct-${String(uid)}:${id}`
const idPrefix = (uid: number): string => `acct-${String(uid)}:`

const asArray = (host: string | string[]): string[] => (Array.isArray(host) ? host : [host])

/**
 * Register the router's RPC methods, wiring authorized calls to the Caddy admin API.
 * Caller identity comes from `ctx.peer.uid` (kernel-supplied), never from the request body.
 * @param rpc the local-rpc plugin instance
 * @param caddy the Caddy admin client
 * @param getPolicy returns the current authorization policy (re-read per call so hot reloads apply)
 */
export const registerRouterMethods = (rpc: LocalRpcPlugin, caddy: CaddyAdmin, getPolicy: () => RouterPolicy): void => {
    const patternsFor = (peer: LocalRpcPeer): string[] => {
        const patterns = allowedPatternsFor(getPolicy(), peer)
        if (patterns === undefined) {
            throw new LocalRpcError("FORBIDDEN", `uid ${String(peer.uid)} is not a registered account or group member`)
        }
        return patterns
    }

    rpc.route(upsertRoute, async (input, ctx) => {
        const patterns = patternsFor(ctx.peer)
        const hosts = asArray(input.host)
        const denied = hosts.filter(host => !patterns.some(allowed => hostMatches(allowed, host)))
        if (denied.length > 0) {
            throw new LocalRpcError("FORBIDDEN", `not allowed to route: ${denied.join(", ")}`)
        }
        // Upstream is intentionally unrestricted: services live on loopback, Docker bridge
        // networks, or other hosts. The security boundary is host authorization above, not the
        // upstream. Caddy validates the dial address when the route is applied.
        await caddy.upsertRoute({ id: scopedId(ctx.peer.uid, input.id), host: hosts, upstream: input.upstream })
        return { id: input.id }
    })

    rpc.route(removeRoute, async (input, ctx) => {
        patternsFor(ctx.peer)
        const removed = await caddy.removeRoute(scopedId(ctx.peer.uid, input.id))
        return { removed }
    })

    rpc.route(listRoutes, async (_input, ctx) => {
        patternsFor(ctx.peer)
        const prefix = idPrefix(ctx.peer.uid)
        const routes = (await caddy.listRoutes())
            .filter(route => route.id.startsWith(prefix))
            .map(route => ({
                id: route.id.slice(prefix.length),
                host: asArray(route.host),
                upstream: route.upstream,
            }))
        return { routes }
    })
}
