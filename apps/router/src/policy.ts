import { readFileSync, watch, type FSWatcher } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { z } from "zod"

/** A set of hostnames a caller (by uid) or group (by gid) is allowed to register. */
export const hostRuleSchema = z.object({
    /** Exact hostnames or `"*.suffix"` wildcards this rule permits. */
    hosts: z.array(z.string()).default([]),
})

/** The authorization policy. A caller is allowed a host if its uid rule or any of its group rules permits it. */
export const routerPolicySchema = z.object({
    /** Keyed by caller uid (a string, since JSON object keys are strings). */
    accounts: z.record(z.string(), hostRuleSchema).default({}),
    /** Keyed by group gid (a string). Applies to any caller whose primary or supplementary groups include it. */
    groups: z.record(z.string(), hostRuleSchema).default({}),
})

export type HostRule = z.infer<typeof hostRuleSchema>
export type RouterPolicy = z.infer<typeof routerPolicySchema>

const EMPTY_POLICY: RouterPolicy = { accounts: {}, groups: {} }
const RELOAD_DEBOUNCE_MS = 100

/** A live view of the router policy that reloads when its file changes. */
export interface PolicyStore {
    /** The current policy (the last successfully parsed one). */
    current: () => RouterPolicy
    /** Stop watching the policy file. */
    close: () => void
}

/** Parse and validate a policy file's contents. Throws if the file is invalid. */
const parsePolicy = (path: string): RouterPolicy => routerPolicySchema.parse(JSON.parse(readFileSync(path, "utf8")))

/**
 * Load the policy from a file and keep it up to date as the file changes. If no path is given, or
 * the file cannot be read or fails validation, the store falls back to the last good policy (an
 * empty policy at startup) rather than crashing — a bad edit must not take routing down.
 * @param path the policy file path, or undefined for an always-empty policy
 * @param hooks optional callbacks for reload success and failure (for logging)
 * @returns a store exposing the current policy and a `close`
 */
export const createPolicyStore = (
    path: string | undefined,
    hooks: { onReload?: (policy: RouterPolicy) => void; onError?: (error: unknown) => void } = {},
): PolicyStore => {
    let policy: RouterPolicy = EMPTY_POLICY

    const reload = (): void => {
        if (path === undefined) return
        try {
            policy = parsePolicy(path)
            hooks.onReload?.(policy)
        } catch (error) {
            hooks.onError?.(error)
        }
    }

    reload()

    let watcher: FSWatcher | undefined
    if (path !== undefined) {
        const absolute = resolve(path)
        const directory = dirname(absolute)
        const fileName = basename(absolute)
        let timer: NodeJS.Timeout | undefined

        try {
            // Watch the directory, not the file, so atomic replaces (write-temp-then-rename, as
            // editors and deploy tooling do) keep firing events instead of orphaning the watch.
            watcher = watch(directory, { persistent: false }, (_event, changed) => {
                if (changed === null || changed === fileName) {
                    if (timer) clearTimeout(timer)
                    timer = setTimeout(reload, RELOAD_DEBOUNCE_MS)
                    timer.unref()
                }
            })
        } catch (error) {
            hooks.onError?.(error)
        }
    }

    return {
        current: () => policy,
        close: () => watcher?.close(),
    }
}
