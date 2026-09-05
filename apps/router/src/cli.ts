#!/usr/bin/env node
import { runCliMain } from "@signalbox/service-cli"
import { createRouterApp } from "./app"
import { APP_NAME, configSchema, createStore } from "./config"

await runCliMain({
    appName: APP_NAME,
    tagline: "authorize service accounts and route their subdomains through Caddy",
    schema: configSchema,
    createStore: path => createStore(path),
    createApp: createRouterApp,
    systemService: {
        // Dedicated system account; its primary group gates who may call the socket. Add a service
        // account to the `traffic-cop` group to let it register routes.
        user: "traffic-cop",
        createAccount: true,
        // systemd creates /run/traffic-cop for the socket; 0755 so callers can traverse to it while
        // the socket's own 0660 group permission is the actual gate.
        runtimeDirectory: { name: "traffic-cop", mode: 0o755 },
    },
})
