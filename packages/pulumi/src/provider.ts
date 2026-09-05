import * as pulumi from "@pulumi/pulumi"
import { createTrafficCopClient } from "@traffic-cop/api"

/** The resolved inputs a {@link Route} sends to its provider. */
interface RouteInputs {
    /** Path to the router's Unix socket. */
    routerSocket: string
    /** Stable route id, scoped to the calling account by the router. */
    routeId: string
    /** Hostname(s) to route. */
    host: string | string[]
    /** Upstream to proxy to, as `host:port`. */
    upstream: string
}

const apply = async (inputs: RouteInputs): Promise<void> => {
    const client = createTrafficCopClient({ socketPath: inputs.routerSocket })
    await client.upsertRoute(
        { id: inputs.routeId, host: inputs.host, upstream: inputs.upstream },
        { idempotencyKey: inputs.routeId },
    )
}

const provider: pulumi.dynamic.ResourceProvider<RouteInputs, RouteInputs & { id: string }> = {
    async create(inputs) {
        await apply(inputs)
        return { id: inputs.routeId, outs: { ...inputs, id: inputs.routeId } }
    },
    async update(_id, _olds, news) {
        await apply(news)
        return { outs: { ...news, id: news.routeId } }
    },
    async delete(_id, props) {
        const client = createTrafficCopClient({ socketPath: props.routerSocket })
        await client.removeRoute({ id: props.routeId })
    },
    async diff(_id, olds, news) {
        const changed =
            olds.routeId !== news.routeId ||
            olds.upstream !== news.upstream ||
            JSON.stringify(olds.host) !== JSON.stringify(news.host)
        return {
            changes: changed,
            // Changing the id means a different route object in Caddy, so replace.
            replaces: olds.routeId !== news.routeId ? ["routeId"] : [],
        }
    },
}

/** Arguments for a {@link Route}. */
export interface RouteArgs {
    /** Path to the router's Unix socket, e.g. `"/run/traffic-cop/router.sock"`. */
    routerSocket: pulumi.Input<string>
    /** Stable route id (unique within the calling account). */
    routeId: pulumi.Input<string>
    /** Hostname(s) to route; the router provisions HTTPS for them via Caddy. */
    host: pulumi.Input<string | string[]>
    /** Upstream to proxy to, as `host:port`. */
    upstream: pulumi.Input<string>
}

/**
 * A traffic-cop reverse-proxy route, declared as part of a Pulumi deployment. Create/update/delete
 * of this resource calls the router over its Unix socket; the deploying process must have permission
 * to reach that socket, and the router authorizes the route by the caller's uid.
 */
export class Route extends pulumi.dynamic.Resource {
    /** The route id as applied. */
    declare readonly routeId: pulumi.Output<string>
    /** The upstream as applied. */
    declare readonly upstream: pulumi.Output<string>

    constructor(name: string, args: RouteArgs, opts?: pulumi.CustomResourceOptions) {
        super(provider, name, args, opts)
    }
}
