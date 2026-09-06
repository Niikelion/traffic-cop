import { createServer } from "node:http"
import { describe, expect, it } from "vitest"
import { adminRequest, createCaddyAdmin, resolveTarget, toCaddyRoute } from "../src/caddy/api"

describe("resolveTarget", () => {
    it("parses a TCP url with the default admin port", () => {
        expect(resolveTarget("http://localhost:2019")).toEqual({ host: "localhost", port: 2019 })
    })

    it("parses a TCP url with a custom port", () => {
        expect(resolveTarget("http://127.0.0.1:9000")).toEqual({ host: "127.0.0.1", port: 9000 })
    })

    it("parses a unix: socket path", () => {
        expect(resolveTarget("unix:/run/caddy/admin.sock")).toEqual({ socketPath: "/run/caddy/admin.sock" })
    })

    it("parses Caddy's unix// socket spelling", () => {
        expect(resolveTarget("unix//run/caddy/admin.sock")).toEqual({ socketPath: "/run/caddy/admin.sock" })
    })
})

describe("toCaddyRoute", () => {
    it("wraps a single host string in a matcher", () => {
        expect(toCaddyRoute({ id: "x", host: "a.example.com", upstream: "localhost:3000" })).toEqual({
            "@id": "x",
            match: [{ host: ["a.example.com"] }],
            handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "localhost:3000" }] }],
        })
    })

    it("keeps an array of hosts", () => {
        expect(toCaddyRoute({ id: "x", host: ["a.example.com", "b.example.com"], upstream: "u:1" }).match[0]?.host).toEqual([
            "a.example.com",
            "b.example.com",
        ])
    })
})

describe("adminRequest", () => {
    it("sends a Host header with the port so Caddy's origin check passes", async () => {
        let seenHost: string | undefined
        const server = createServer((req, res) => {
            seenHost = req.headers.host
            res.end("{}")
        })
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
        const address = server.address()
        const port = typeof address === "object" && address !== null ? address.port : 0
        try {
            await adminRequest({ endpoint: `http://127.0.0.1:${String(port)}` }, "GET", "/config/")
            expect(seenHost).toBe(`127.0.0.1:${String(port)}`)
        } finally {
            server.close()
        }
    })
})

describe("createCaddyAdmin.upsertRoute", () => {
    it("prepends a new route (PUT at index 0) so it beats a catch-all", async () => {
        let createMethod: string | undefined
        let createUrl: string | undefined
        const server = createServer((req, res) => {
            if (req.method === "GET" && req.url?.startsWith("/id/")) {
                res.statusCode = 404
                res.end('{"error":"unknown object id"}')
                return
            }
            createMethod = req.method
            createUrl = req.url
            res.end("{}")
        })
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
        const address = server.address()
        const port = typeof address === "object" && address !== null ? address.port : 0
        try {
            const caddy = createCaddyAdmin({ endpoint: `http://127.0.0.1:${String(port)}` }, "srv0")
            await caddy.upsertRoute({ id: "financer", host: "financer.local", upstream: "127.0.0.1:43117" })
            expect(createMethod).toBe("PUT")
            expect(createUrl).toBe("/config/apps/http/servers/srv0/routes/0")
        } finally {
            server.close()
        }
    })
})
