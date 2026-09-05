import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http"

/** How to reach the Caddy admin API. */
export interface CaddyAdminOptions {
    /**
     * Admin endpoint. Either a TCP URL (`"http://localhost:2019"`, the default) or a
     * Unix socket (`"unix//run/caddy/admin.sock"` or `"unix:/run/caddy/admin.sock"`).
     */
    endpoint?: string
    /** Per-request timeout in milliseconds (default 30000). */
    timeoutMs?: number
}

const DEFAULT_ENDPOINT = "http://localhost:2019"
const DEFAULT_TIMEOUT = 30_000

interface ResolvedTarget {
    readonly socketPath?: string
    readonly host?: string
    readonly port?: number
}

/**
 * Resolve an endpoint string into `node:http` connection options.
 * @param endpoint a TCP URL or a `unix:`/`unix//` socket path
 * @returns connection target for {@link adminRequest}
 */
export const resolveTarget = (endpoint: string): ResolvedTarget => {
    // Accept "unix:/path", "unix//path" (Caddy's own form), and "unix://path".
    if (endpoint.startsWith("unix://")) return { socketPath: endpoint.slice("unix:/".length) }
    if (endpoint.startsWith("unix//")) return { socketPath: endpoint.slice("unix/".length) }
    if (endpoint.startsWith("unix:")) return { socketPath: endpoint.slice("unix:".length) }

    const url = new URL(endpoint)
    return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 2019,
    }
}

/** An error returned by the Caddy admin API. */
export class CaddyAdminError extends Error {
    constructor(
        readonly status: number,
        readonly method: string,
        readonly path: string,
        readonly detail: string,
    ) {
        super(`Caddy admin ${method} ${path} -> HTTP ${String(status)}: ${detail}`)
        this.name = "CaddyAdminError"
    }
}

interface AdminRaw {
    status: number
    etag?: string
    text: string
}

const sendAdmin = (
    options: CaddyAdminOptions,
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<AdminRaw> => {
    const target = resolveTarget(options.endpoint ?? DEFAULT_ENDPOINT)
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body)

    const requestOptions: RequestOptions = {
        socketPath: target.socketPath,
        host: target.host,
        port: target.port,
        path,
        method,
        headers: {
            Host: target.host ?? "localhost",
            ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
            ...init.headers,
        },
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT,
    }

    return new Promise<AdminRaw>((resolve, reject) => {
        const req = httpRequest(requestOptions, (res: IncomingMessage) => {
            const chunks: Buffer[] = []
            res.on("data", (chunk: Buffer) => chunks.push(chunk))
            res.on("end", () => {
                const etagHeader: string | string[] | undefined = res.headers.etag
                const etag = typeof etagHeader === "string" ? etagHeader : etagHeader?.[0]
                resolve({
                    status: res.statusCode ?? 0,
                    ...(etag === undefined ? {} : { etag }),
                    text: Buffer.concat(chunks).toString("utf8"),
                })
            })
        })

        req.on("error", reject)
        req.on("timeout", () => {
            req.destroy(new Error(`Caddy admin ${method} ${path} timed out after ${String(requestOptions.timeout)}ms`))
        })
        if (payload !== undefined) req.write(payload)
        req.end()
    })
}

const errorDetail = (text: string): string => {
    try {
        const parsed = JSON.parse(text) as { error?: string }
        if (parsed.error) return parsed.error
    } catch {
        // Non-JSON error body; fall through to the raw text.
    }
    return text || "(no body)"
}

/**
 * Make one request to the Caddy admin API, throwing {@link CaddyAdminError} on any non-2xx status.
 * @param options endpoint and timeout
 * @param method HTTP method
 * @param path admin path, e.g. `"/config/apps/http"`
 * @param body optional JSON body
 * @param headers optional extra request headers (e.g. `If-Match`)
 * @returns the parsed JSON response, or `undefined` for an empty body
 */
export const adminRequest = async <T = unknown>(
    options: CaddyAdminOptions,
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
): Promise<T> => {
    const res = await sendAdmin(options, method, path, { body, headers })
    if (res.status < 200 || res.status >= 300) {
        throw new CaddyAdminError(res.status, method, path, errorDetail(res.text))
    }
    return (res.text ? (JSON.parse(res.text) as T) : undefined) as T
}

/** A reverse-proxy route, addressed by a stable id. */
export interface ProxyRoute {
    /** Stable Caddy `@id`, e.g. `"alice/app"`. */
    id: string
    /** Hostname(s) this route matches; Caddy provisions HTTPS for them automatically. */
    host: string | string[]
    /** Upstream to proxy to, as `host:port`. */
    upstream: string
}

/** The Caddy JSON shape for a single route. */
export interface CaddyRoute {
    "@id": string
    match: { host: string[] }[]
    handle: { handler: "reverse_proxy"; upstreams: { dial: string }[] }[]
}

/** The subset of a Caddy HTTP server this project reads and writes. */
export interface CaddyServer {
    listen?: string[]
    routes?: CaddyRoute[]
    [key: string]: unknown
}

/** The subset of a Caddy config this project reads and writes; unknown fields are preserved. */
export interface CaddyConfig {
    apps?: {
        http?: { servers?: Record<string, CaddyServer>; [key: string]: unknown }
        tls?: unknown
        [key: string]: unknown
    }
    [key: string]: unknown
}

/**
 * Build the Caddy route JSON for a {@link ProxyRoute}.
 * @param route the route definition
 * @returns the Caddy route object, tagged with `@id`
 */
export const toCaddyRoute = (route: ProxyRoute): CaddyRoute => ({
    "@id": route.id,
    match: [{ host: Array.isArray(route.host) ? route.host : [route.host] }],
    handle: [{ handler: "reverse_proxy", upstreams: [{ dial: route.upstream }] }],
})

const routesPath = (server: string) => `/config/apps/http/servers/${server}/routes`

const fromCaddyRoute = (route: CaddyRoute): ProxyRoute => ({
    id: route["@id"],
    host: route.match.flatMap(matcher => matcher.host),
    upstream: route.handle.flatMap(handler => handler.upstreams.map(upstream => upstream.dial))[0] ?? "",
})

/** A thin client over the Caddy admin API for managing reverse-proxy routes. */
export interface CaddyAdmin {
    /** Create or replace a route addressed by its stable id. */
    upsertRoute: (route: ProxyRoute) => Promise<void>
    /** Remove a route by id; a no-op if absent. */
    removeRoute: (id: string) => Promise<boolean>
    /** List the managed routes (those carrying an `@id`) on the configured server. */
    listRoutes: () => Promise<ProxyRoute[]>
    /**
     * Read Caddy's entire configuration (`GET /config/`) together with its `ETag`. `config` is
     * `null` when Caddy has no config loaded; `etag` may be undefined if the server sent none.
     */
    getConfig: () => Promise<{ config: CaddyConfig | null; etag?: string }>
    /**
     * Replace Caddy's entire configuration (`POST /load`). Pass `ifMatch` (an ETag from
     * {@link getConfig}) for an optimistic-concurrency write: Caddy rejects it with HTTP 412 if the
     * config changed since, surfaced as a {@link CaddyAdminError} with `status === 412`.
     */
    load: (config: unknown, ifMatch?: string) => Promise<void>
    /** Whether the admin API is reachable. */
    reachable: () => Promise<boolean>
}

/**
 * Create a Caddy admin client.
 * @param options admin endpoint and timeout
 * @param server the HTTP server name routes are managed on (default `"srv0"`)
 * @returns the admin client
 */
export const createCaddyAdmin = (options: CaddyAdminOptions, server = "srv0"): CaddyAdmin => {
    const idPath = (id: string) => `/id/${encodeURIComponent(id)}`

    const exists = async (id: string): Promise<boolean> => {
        try {
            await adminRequest(options, "GET", idPath(id))
            return true
        } catch (error) {
            if (error instanceof CaddyAdminError && error.status === 404) return false
            throw error
        }
    }

    return {
        upsertRoute: async route => {
            const body = toCaddyRoute(route)
            if (await exists(route.id)) {
                await adminRequest(options, "PATCH", idPath(route.id), body)
            } else {
                await adminRequest(options, "POST", routesPath(server), body)
            }
        },
        removeRoute: async id => {
            try {
                await adminRequest(options, "DELETE", idPath(id))
                return true
            } catch (error) {
                if (error instanceof CaddyAdminError && error.status === 404) return false
                throw error
            }
        },
        listRoutes: async () => {
            const routes = (await adminRequest<CaddyRoute[] | null>(options, "GET", routesPath(server))) ?? []
            return routes.filter(route => typeof route["@id"] === "string").map(fromCaddyRoute)
        },
        getConfig: async () => {
            const res = await sendAdmin(options, "GET", "/config/")
            if (res.status < 200 || res.status >= 300) {
                throw new CaddyAdminError(res.status, "GET", "/config/", errorDetail(res.text))
            }
            const config = res.text ? (JSON.parse(res.text) as CaddyConfig | null) : null
            return { config: config ?? null, ...(res.etag === undefined ? {} : { etag: res.etag }) }
        },
        load: (config, ifMatch) =>
            adminRequest(options, "POST", "/load", config, ifMatch === undefined ? undefined : { "If-Match": ifMatch }),
        reachable: async () => {
            try {
                await adminRequest(options, "GET", "/config/")
                return true
            } catch {
                return false
            }
        },
    }
}
