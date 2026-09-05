import type { CaddyAdmin, CaddyConfig, CaddyServer } from "./caddy/api"

/** Options for {@link ensureCaddyServer}. */
export interface BootstrapOptions {
    /** The HTTP server name to ensure exists (must match the router's configured server). */
    server: string
    /** Addresses the server listens on (default `[":443"]`, which enables automatic HTTPS). */
    listen?: string[]
    /** ACME account email. When set, Caddy uses it for Let's Encrypt registration. */
    email?: string
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
 * This assumes the router is the sole writer of Caddy's config. It is not safe against another
 * process changing the config between the read and the write.
 * @param caddy the Caddy admin client
 * @param options the server name, listen addresses, and optional ACME email
 */
export const ensureCaddyServer = async (caddy: CaddyAdmin, options: BootstrapOptions): Promise<void> => {
    const listen = options.listen ?? [":443"]
    const config: CaddyConfig = (await caddy.getConfig()) ?? {}

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

    await caddy.load(next)
}
