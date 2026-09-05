import { createApp, type NoEvents } from "@signalbox/core"
import { localRpcPlugin } from "@signalbox/local-rpc"
import { createPermissionExecution, entityRef } from "@signalbox/permissions"
import type { Runnable } from "@signalbox/service-cli"
import { ensureCaddyServer } from "./bootstrap"
import { registerRouterMethods } from "./broker"
import { createCaddyAdmin } from "./caddy/api"
import { createPolicyStore } from "./policy"
import { APP_NAME, type TrafficCopConfig } from "./config"

const routerPermissions = () => {
    const permissions = createPermissionExecution()
    return {
        runtime: permissions.runtime,
        core: permissions.core,
        host: permissions.identities.issue({ principal: entityRef("system", APP_NAME) }),
    }
}

/**
 * Build the router as a {@link Runnable} for the service CLI. Wires the local-RPC surface to the
 * Caddy admin API, authorizing each caller by its kernel-supplied uid against the hot-reloaded
 * policy. On `run` it ensures Caddy has a `:443` server, then serves until stopped.
 * @param config the validated service configuration
 * @returns a runnable the CLI's `run` command starts
 */
export const createRouterApp = (config: TrafficCopConfig): Runnable => {
    const caddy = createCaddyAdmin({ endpoint: config.caddyEndpoint }, config.caddyServer)
    const policyStore = createPolicyStore(config.policyPath, {
        onReload: policy => {
            console.info(`policy reloaded: ${String(Object.keys(policy.accounts).length)} account(s)`)
        },
        onError: error => {
            console.warn(`policy file invalid, keeping previous policy: ${String(error)}`)
        },
    })

    const rpc = localRpcPlugin({
        socketPath: config.socketPath,
        ...(config.socketGroup === undefined ? {} : { group: config.socketGroup }),
        mode: 0o660,
    })

    // Register the RPC surface before the app starts accepting connections. Handlers read the policy
    // through the store on each call, so a hot reload applies without a restart.
    registerRouterMethods(rpc, caddy, () => policyStore.current())

    const app = createApp<NoEvents, { rpc: typeof rpc }>({
        name: APP_NAME,
        permissions: routerPermissions(),
        plugins: { rpc },
        workflows: [],
    })

    return {
        run: async () => {
            // Ensure Caddy has a :443 server so automatic HTTPS covers every route we later add.
            if (await caddy.reachable()) {
                await ensureCaddyServer(caddy, {
                    server: config.caddyServer,
                    ...(config.acmeEmail === undefined ? {} : { email: config.acmeEmail }),
                })
            } else {
                console.warn(`caddy admin not reachable at ${config.caddyEndpoint}; skipping bootstrap`)
            }

            try {
                await app.run()
            } finally {
                policyStore.close()
            }
        },
    }
}
