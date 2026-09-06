import { config, createConfigStore, field, type Infer } from "@signalbox/config"

export const APP_NAME = "traffic-cop-router"

export const configSchema = config({
    caddyEndpoint: field()
        .string()
        .default("http://localhost:2019")
        .describe("Caddy admin API endpoint (a TCP url or a unix// socket)"),
    caddyServer: field().string().default("srv0").describe("Caddy HTTP server name routes are added to"),
    acmeEmail: field().string().optional().describe("ACME account email for Let's Encrypt registration"),
    socketPath: field().string().default("/run/traffic-cop/router.sock").describe("Unix socket the router listens on"),
    socketGroup: field().string().optional().describe("Group that owns the socket; its members may call the router"),
    policyPath: field()
        .string()
        .default("/etc/traffic-cop/policy.json")
        .describe("Path to the JSON authorization policy (hot-reloaded; missing file means an empty policy)"),
})

export type TrafficCopConfig = Infer<typeof configSchema>

export const createStore = (path?: string) =>
    createConfigStore({ appName: APP_NAME, schema: configSchema, ...(path ? { path } : {}) })
