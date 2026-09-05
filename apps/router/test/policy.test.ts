import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createPolicyStore, routerPolicySchema } from "../src/policy"

const dirs: string[] = []

const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "tc-policy-"))
    dirs.push(dir)
    return dir
}

const waitFor = async (condition: () => boolean, timeoutMs: number): Promise<void> => {
    const start = Date.now()
    while (!condition()) {
        if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for policy reload")
        await new Promise(resolve => setTimeout(resolve, 25))
    }
}

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("routerPolicySchema", () => {
    it("parses a valid policy", () => {
        const policy = routerPolicySchema.parse({ accounts: { "1001": { hosts: ["a.example.com"] } } })
        expect(policy.accounts["1001"]?.hosts).toEqual(["a.example.com"])
    })

    it("defaults accounts and hosts", () => {
        expect(routerPolicySchema.parse({})).toEqual({ accounts: {} })
        expect(routerPolicySchema.parse({ accounts: { "1": {} } }).accounts["1"]?.hosts).toEqual([])
    })

    it("rejects a non-string host", () => {
        expect(() => routerPolicySchema.parse({ accounts: { "1": { hosts: [123] } } })).toThrow()
    })
})

describe("createPolicyStore", () => {
    it("is empty when given no path", () => {
        const store = createPolicyStore(undefined)
        expect(store.current()).toEqual({ accounts: {} })
        store.close()
    })

    it("loads an existing file", () => {
        const path = join(tempDir(), "policy.json")
        writeFileSync(path, JSON.stringify({ accounts: { "1001": { hosts: ["a.example.com"] } } }))
        const store = createPolicyStore(path)
        expect(store.current().accounts["1001"]?.hosts).toEqual(["a.example.com"])
        store.close()
    })

    it("keeps the last good policy when the file is invalid", () => {
        const path = join(tempDir(), "policy.json")
        writeFileSync(path, "{ not valid json")
        let errored = false
        const store = createPolicyStore(path, { onError: () => (errored = true) })
        expect(errored).toBe(true)
        expect(store.current()).toEqual({ accounts: {} })
        store.close()
    })

    it("hot-reloads when the file changes", async () => {
        const path = join(tempDir(), "policy.json")
        writeFileSync(path, JSON.stringify({ accounts: {} }))
        const store = createPolicyStore(path)
        expect(store.current().accounts["1001"]).toBeUndefined()

        writeFileSync(path, JSON.stringify({ accounts: { "1001": { hosts: ["a.example.com"] } } }))
        await waitFor(() => store.current().accounts["1001"] !== undefined, 3000)

        expect(store.current().accounts["1001"]?.hosts).toEqual(["a.example.com"])
        store.close()
    })
})
