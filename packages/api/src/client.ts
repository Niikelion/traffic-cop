import { createLocalRpcClient, type LocalRpcCallOptions } from "@signalbox/local-rpc"
import type { z } from "zod"
import { listRoutes, removeRoute, upsertRoute } from "./methods"

/** Options for {@link createTrafficCopClient}. */
export interface TrafficCopClientOptions {
    /** Path to the router's Unix socket, e.g. `"/run/traffic-cop/router.sock"`. */
    socketPath: string
    /** Default per-call timeout in milliseconds. */
    timeoutMs?: number
}

/** A typed client for the traffic-cop router. */
export interface TrafficCopClient {
    /** Create or replace a route. Pass an idempotency key for safe retries (e.g. a Pulumi op id). */
    upsertRoute: (
        input: z.input<typeof upsertRoute.request>,
        options?: LocalRpcCallOptions,
    ) => Promise<z.output<typeof upsertRoute.response>>
    /** Remove a route by id. */
    removeRoute: (
        input: z.input<typeof removeRoute.request>,
        options?: LocalRpcCallOptions,
    ) => Promise<z.output<typeof removeRoute.response>>
    /** List the caller's routes. */
    listRoutes: (options?: LocalRpcCallOptions) => Promise<z.output<typeof listRoutes.response>>
}

/**
 * Create a client that talks to a running traffic-cop router over its Unix socket.
 * The router identifies the caller from the kernel-supplied peer credentials, not from anything
 * this client sends, so there is nothing to authenticate here.
 * @param options socket path and default timeout
 * @returns a typed client
 */
export const createTrafficCopClient = (options: TrafficCopClientOptions): TrafficCopClient => {
    const client = createLocalRpcClient({ socketPath: options.socketPath, timeoutMs: options.timeoutMs })
    return {
        upsertRoute: (input, callOptions) => client.call(upsertRoute, input, callOptions),
        removeRoute: (input, callOptions) => client.call(removeRoute, input, callOptions),
        listRoutes: callOptions => client.call(listRoutes, {}, callOptions),
    }
}
