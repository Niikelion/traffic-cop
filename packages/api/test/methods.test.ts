import { describe, expect, it } from "vitest"
import { listRoutes, removeRoute, routeSchema, upsertRoute } from "../src/index"

describe("route schemas", () => {
    it("accepts a valid route with a single host", () => {
        expect(routeSchema.parse({ id: "app", host: "a.example.com", upstream: "localhost:3000" })).toEqual({
            id: "app",
            host: "a.example.com",
            upstream: "localhost:3000",
        })
    })

    it("accepts an array of hosts", () => {
        expect(routeSchema.parse({ id: "app", host: ["a.example.com", "b.example.com"], upstream: "u:1" }).host).toEqual([
            "a.example.com",
            "b.example.com",
        ])
    })

    it("rejects an empty id", () => {
        expect(() => routeSchema.parse({ id: "", host: "a.example.com", upstream: "u:1" })).toThrow()
    })

    it("rejects an empty host array", () => {
        expect(() => routeSchema.parse({ id: "app", host: [], upstream: "u:1" })).toThrow()
    })
})

describe("method descriptors", () => {
    it("upsert request rejects a missing upstream", () => {
        expect(() => upsertRoute.request.parse({ id: "app", host: "a.example.com" })).toThrow()
    })

    it("remove request requires an id", () => {
        expect(() => removeRoute.request.parse({})).toThrow()
    })

    it("list request accepts an empty object", () => {
        expect(listRoutes.request.parse({})).toEqual({})
    })
})
