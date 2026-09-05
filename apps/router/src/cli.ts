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
})
