import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs"
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

/** The deepest ancestor of `dir` (including itself) that currently exists. */
const nearestExistingDir = (dir: string): string => {
    let current = dir
    while (!existsSync(current)) {
        const parent = dirname(current)
        if (parent === current) return current
        current = parent
    }
    return current
}

/**
 * Load the policy from a file and keep it up to date as the file changes. Tolerant by design:
 * - no path, an unreadable file, or an invalid one falls back to the last good policy (empty at
 *   startup) rather than crashing — a bad edit must not take routing down;
 * - the policy file's directory need not exist yet. The store watches the nearest existing ancestor
 *   and re-attaches deeper as directories appear, so a policy dropped in later is picked up live
 *   without a restart.
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
    let timer: NodeJS.Timeout | undefined
    let closed = false

    if (path !== undefined) {
        const absolute = resolve(path)
        const policyDir = dirname(absolute)
        const fileName = basename(absolute)

        const attach = (): void => {
            if (closed) return
            watcher?.close()
            const watchDir = nearestExistingDir(policyDir)
            try {
                // Watch a directory, not the file, so atomic replaces (write-temp-then-rename) keep
                // firing. When watching an ancestor (the policy dir doesn't exist yet), react to any
                // change and re-check; when watching the policy dir itself, react only to its file.
                watcher = watch(watchDir, { persistent: false }, (_event, changed) => {
                    if (watchDir === policyDir && changed !== null && changed !== fileName) return
                    if (timer) clearTimeout(timer)
                    timer = setTimeout(() => {
                        reload()
                        // A parent directory may have just been created — start watching deeper.
                        if (watchDir !== policyDir && existsSync(policyDir)) attach()
                    }, RELOAD_DEBOUNCE_MS)
                    timer.unref()
                })
            } catch (error) {
                hooks.onError?.(error)
            }
        }

        attach()
    }

    return {
        current: () => policy,
        close: () => {
            closed = true
            if (timer) clearTimeout(timer)
            watcher?.close()
        },
    }
}
