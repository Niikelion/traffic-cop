import { describe, expect, it } from "vitest"
import { resolveTarget, toCaddyRoute } from "../src/caddy/api"

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
