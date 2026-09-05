import { LocalRpcError, type LocalRpcPlugin } from "@signalbox/local-rpc"
import { listRoutes, removeRoute, upsertRoute } from "@traffic-cop/api"
import type { CaddyAdmin } from "./caddy/api"

/** What one account (identified by uid) is allowed to register. */
export interface AccountPolicy {
    /** Exact hostnames or `"*.suffix"` wildcards this account may route. */
    hosts: string[]
}

/** The authorization policy: which uid may register which hostnames. */
export interface RouterPolicy {
    /** Keyed by caller uid. */
    accounts: Record<number, AccountPolicy>
}

const hostMatches = (allowed: string, host: string): boolean => {
    if (allowed === host) return true
    if (allowed.startsWith("*.")) return host.endsWith(allowed.slice(1)) && host !== allowed.slice(2)
    return false
}

const authorizeHosts = (policy: AccountPolicy, hosts: string[]): string[] => {
    const denied = hosts.filter(host => !policy.hosts.some(allowed => hostMatches(allowed, host)))
    return denied
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
 * @param policy the authorization policy
 */
export const registerRouterMethods = (rpc: LocalRpcPlugin, caddy: CaddyAdmin, policy: RouterPolicy): void => {
    const accountFor = (uid: number): AccountPolicy => {
        const account = policy.accounts[uid]
        if (!account) throw new LocalRpcError("FORBIDDEN", `uid ${String(uid)} is not a registered account`)
        return account
    }

    rpc.route(upsertRoute, async (input, ctx) => {
        const account = accountFor(ctx.peer.uid)
        const hosts = asArray(input.host)
        const denied = authorizeHosts(account, hosts)
        if (denied.length > 0) {
            throw new LocalRpcError("FORBIDDEN", `not allowed to route: ${denied.join(", ")}`)
        }
        // TODO: restrict `input.upstream` to a loopback address the account actually owns.
        await caddy.upsertRoute({ id: scopedId(ctx.peer.uid, input.id), host: hosts, upstream: input.upstream })
        return { id: input.id }
    })

    rpc.route(removeRoute, async (input, ctx) => {
        accountFor(ctx.peer.uid)
        const removed = await caddy.removeRoute(scopedId(ctx.peer.uid, input.id))
        return { removed }
    })

    rpc.route(listRoutes, async (_input, ctx) => {
        accountFor(ctx.peer.uid)
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
