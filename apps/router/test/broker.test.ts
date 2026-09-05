import type { LocalRpcContext, LocalRpcPlugin } from "@signalbox/local-rpc"
import { listRoutes, removeRoute, upsertRoute } from "@traffic-cop/api"
import { beforeEach, describe, expect, it } from "vitest"
import { registerRouterMethods } from "../src/broker"
import type { CaddyAdmin, ProxyRoute } from "../src/caddy/api"
import type { RouterPolicy } from "../src/policy"

/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles use loose types on purpose */
type Handler = (input: any, ctx: LocalRpcContext) => Promise<any>

const makeRpc = () => {
    const handlers = new Map<string, Handler>()
    const rpc = {
        route: (method: { method: string }, handler: Handler) => handlers.set(method.method, handler),
    } as unknown as LocalRpcPlugin
    return { rpc, handlers }
}

const makeCaddy = () => {
    const routes: ProxyRoute[] = []
    const caddy: CaddyAdmin = {
        upsertRoute: async route => {
            const index = routes.findIndex(existing => existing.id === route.id)
            if (index >= 0) routes[index] = route
            else routes.push(route)
        },
        removeRoute: async id => {
            const index = routes.findIndex(existing => existing.id === id)
            if (index < 0) return false
            routes.splice(index, 1)
            return true
        },
        listRoutes: async () => routes.slice(),
        getConfig: async () => ({ config: null }),
        load: async () => undefined,
        reachable: async () => true,
    }
    return { caddy, routes }
}

const ctx = (uid: number, groups: number[] = []): LocalRpcContext => ({
    peer: { uid, gid: groups[0] ?? uid, pid: 100, supplementaryGids: groups.slice(1) },
    requestId: "test",
    signal: new AbortController().signal,
})

const policy: RouterPolicy = {
    accounts: {
        "1001": { hosts: ["alice.example.com", "*.alice.example.com"] },
        "1002": { hosts: ["bob.example.com"] },
    },
    groups: {
        "2000": { hosts: ["team.example.com", "*.team.example.com"] },
    },
}

describe("registerRouterMethods", () => {
    let handlers: Map<string, Handler>
    let routes: ProxyRoute[]

    beforeEach(() => {
        const rpcParts = makeRpc()
        const caddyParts = makeCaddy()
        handlers = rpcParts.handlers
        routes = caddyParts.routes
        registerRouterMethods(rpcParts.rpc, caddyParts.caddy, () => policy)
    })

    const upsert = (input: unknown, uid: number, groups: number[] = []) =>
        handlers.get(upsertRoute.method)!(input, ctx(uid, groups))
    const remove = (input: unknown, uid: number) => handlers.get(removeRoute.method)!(input, ctx(uid))
    const list = (uid: number) => handlers.get(listRoutes.method)!({}, ctx(uid))

    it("applies an allowed route with a per-account scoped id", async () => {
        const result = await upsert({ id: "app", host: "alice.example.com", upstream: "localhost:3000" }, 1001)
        expect(result).toEqual({ id: "app" })
        expect(routes).toHaveLength(1)
        expect(routes[0]).toEqual({ id: "acct-1001:app", host: ["alice.example.com"], upstream: "localhost:3000" })
    })

    it("allows a wildcard-covered host", async () => {
        await upsert({ id: "app", host: "svc.alice.example.com", upstream: "localhost:3000" }, 1001)
        expect(routes[0]?.host).toEqual(["svc.alice.example.com"])
    })

    it("rejects a host outside the account's allowance", async () => {
        await expect(upsert({ id: "app", host: "evil.example.com", upstream: "localhost:3000" }, 1001)).rejects.toThrow(
            /not allowed to route/,
        )
        expect(routes).toHaveLength(0)
    })

    it("rejects a caller with no account entry", async () => {
        await expect(upsert({ id: "app", host: "alice.example.com", upstream: "localhost:3000" }, 9999)).rejects.toThrow(
            /not a registered account or group member/,
        )
    })

    it("allows a host granted through the caller's primary group", async () => {
        // uid 3001 has no account entry, but its primary group 2000 grants team.example.com.
        const result = await upsert({ id: "svc", host: "team.example.com", upstream: "localhost:3000" }, 3001, [2000])
        expect(result).toEqual({ id: "svc" })
        expect(routes[0]).toEqual({ id: "acct-3001:svc", host: ["team.example.com"], upstream: "localhost:3000" })
    })

    it("allows a group host via a supplementary group", async () => {
        await upsert({ id: "svc", host: "x.team.example.com", upstream: "localhost:3000" }, 3002, [500, 2000])
        expect(routes[0]?.host).toEqual(["x.team.example.com"])
    })

    it("combines the caller's account and group grants", async () => {
        // uid 1001 (account: alice) is also in group 2000 (team).
        await upsert({ id: "a", host: "alice.example.com", upstream: "localhost:3000" }, 1001, [2000])
        await upsert({ id: "t", host: "team.example.com", upstream: "localhost:4000" }, 1001, [2000])
        expect(routes.map(route => route.id)).toEqual(["acct-1001:a", "acct-1001:t"])
    })

    it("rejects a group host when the caller is not in that group", async () => {
        await expect(
            upsert({ id: "svc", host: "team.example.com", upstream: "localhost:3000" }, 1002),
        ).rejects.toThrow(/not allowed to route/)
    })

    it("keeps accounts isolated by scoping the same id per uid", async () => {
        await upsert({ id: "app", host: "alice.example.com", upstream: "localhost:3000" }, 1001)
        await upsert({ id: "app", host: "bob.example.com", upstream: "localhost:4000" }, 1002)
        expect(routes.map(route => route.id).sort()).toEqual(["acct-1001:app", "acct-1002:app"])
    })

    it("removes only the caller's own route", async () => {
        await upsert({ id: "app", host: "alice.example.com", upstream: "localhost:3000" }, 1001)
        expect(await remove({ id: "app" }, 1001)).toEqual({ removed: true })
        expect(routes).toHaveLength(0)
        expect(await remove({ id: "app" }, 1001)).toEqual({ removed: false })
    })

    it("lists only the caller's routes with ids unscoped", async () => {
        await upsert({ id: "app", host: "alice.example.com", upstream: "localhost:3000" }, 1001)
        await upsert({ id: "app", host: "bob.example.com", upstream: "localhost:4000" }, 1002)
        const result = (await list(1001)) as { routes: { id: string }[] }
        expect(result.routes).toEqual([{ id: "app", host: ["alice.example.com"], upstream: "localhost:3000" }])
    })
})
