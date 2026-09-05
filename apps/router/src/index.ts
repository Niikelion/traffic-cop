import { readFileSync } from "node:fs"
import { createApp, type NoEvents } from "@signalbox/core"
import { localRpcPlugin } from "@signalbox/local-rpc"
import { createPermissionExecution, entityRef } from "@signalbox/permissions"
import { createCaddyAdmin } from "./caddy/api"
import { registerRouterMethods, type RouterPolicy } from "./broker"

/** Runtime configuration for the router, from the environment. */
interface RouterConfig {
    socketPath: string
    socketGroup?: string
    caddyEndpoint: string
    caddyServer: string
    policyPath?: string
}

const readConfig = (): RouterConfig => ({
    socketPath: process.env["TRAFFIC_COP_SOCKET"] ?? "/run/traffic-cop/router.sock",
    socketGroup: process.env["TRAFFIC_COP_GROUP"],
    caddyEndpoint: process.env["CADDY_ADMIN"] ?? "http://localhost:2019",
    caddyServer: process.env["CADDY_SERVER"] ?? "srv0",
    policyPath: process.env["TRAFFIC_COP_POLICY"],
})

const loadPolicy = (path?: string): RouterPolicy => {
    if (!path) return { accounts: {} }
    // TODO: validate the policy file with a Zod schema and watch it for changes.
    return JSON.parse(readFileSync(path, "utf8")) as RouterPolicy
}

const testPermissions = () => {
    const permissions = createPermissionExecution()
    return {
        runtime: permissions.runtime,
        core: permissions.core,
        host: permissions.identities.issue({ principal: entityRef("system", "traffic-cop-router") }),
    }
}

const main = async (): Promise<void> => {
    const config = readConfig()
    const caddy = createCaddyAdmin({ endpoint: config.caddyEndpoint }, config.caddyServer)
    const policy = loadPolicy(config.policyPath)

    const rpc = localRpcPlugin({
        socketPath: config.socketPath,
        ...(config.socketGroup === undefined ? {} : { group: config.socketGroup }),
        mode: 0o660,
    })

    // Register the RPC surface before the app starts accepting connections.
    registerRouterMethods(rpc, caddy, policy)

    // TODO: bootstrap Caddy's http app + `:443` server here via `caddy.load(...)` when absent,
    // so automatic HTTPS applies to every route the broker later adds.
    if (!(await caddy.reachable())) {
        console.warn(`caddy admin not reachable at ${config.caddyEndpoint}; routes will fail until it is up`)
    }

    const app = createApp<NoEvents, { rpc: typeof rpc }>({
        name: "traffic-cop-router",
        permissions: testPermissions(),
        plugins: { rpc },
        workflows: [],
    })

    await app.run()
}

main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
