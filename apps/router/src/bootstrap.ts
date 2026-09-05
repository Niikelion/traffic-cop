import { CaddyAdminError, type CaddyAdmin, type CaddyConfig, type CaddyServer } from "./caddy/api"

/** Options for {@link ensureCaddyServer}. */
export interface BootstrapOptions {
    /** The HTTP server name to ensure exists (must match the router's configured server). */
    server: string
    /** Addresses the server listens on (default `[":443"]`, which enables automatic HTTPS). */
    listen?: string[]
    /** ACME account email. When set, Caddy uses it for Let's Encrypt registration. */
    email?: string
    /** How many times to retry when a concurrent config change is detected (HTTP 412). Default 5. */
    maxAttempts?: number
}

const withAcmeEmail = (tls: unknown, email: string): unknown => {
    // Set a default ACME issuer email without discarding any existing tls config.
    const base = (typeof tls === "object" && tls !== null ? tls : {}) as Record<string, unknown>
    return {
        ...base,
        automation: {
            policies: [{ issuers: [{ module: "acme", email }] }],
        },
    }
}

/**
 * Ensure Caddy has an HTTP server listening for HTTPS, so routes added later get certificates
 * automatically. Reads the current config, merges the server in (preserving existing routes and
 * any unrelated config), and writes it back with `POST /load`.
 *
 * The read and the write are separate requests, so a concurrent change would otherwise be lost.
 * The write is guarded by the read's ETag (`If-Match`); on a collision Caddy returns HTTP 412 and
 * the whole read-merge-write is retried up to `maxAttempts` times.
 * @param caddy the Caddy admin client
 * @param options the server name, listen addresses, ACME email, and retry count
 */
export const ensureCaddyServer = async (caddy: CaddyAdmin, options: BootstrapOptions): Promise<void> => {
    const listen = options.listen ?? [":443"]
    const maxAttempts = options.maxAttempts ?? 5

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { config: current, etag } = await caddy.getConfig()
        const config: CaddyConfig = current ?? {}

        const apps = config.apps ?? {}
        const http = apps.http ?? {}
        const servers = http.servers ?? {}
        const existing: CaddyServer | undefined = servers[options.server]

        const server: CaddyServer = existing
            ? { ...existing, listen: [...new Set([...(existing.listen ?? []), ...listen])] }
            : { listen, routes: [] }

        const next: CaddyConfig = {
            ...config,
            apps: {
                ...apps,
                http: { ...http, servers: { ...servers, [options.server]: server } },
                ...(options.email === undefined ? {} : { tls: withAcmeEmail(apps.tls, options.email) }),
            },
        }

        try {
            await caddy.load(next, etag)
            return
        } catch (error) {
            const collision = error instanceof CaddyAdminError && error.status === 412
            if (!collision || attempt === maxAttempts) throw error
            // Config changed under us; re-read and retry.
        }
    }
}
