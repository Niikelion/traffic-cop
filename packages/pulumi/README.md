# @traffic-cop/pulumi

A [Pulumi](https://www.pulumi.com) resource that declares a [traffic-cop](https://github.com/Niikelion/traffic-cop)
route as part of a deployment. Bringing the resource up registers the route with the router;
tearing it down removes it.

```ts
import { Route } from "@traffic-cop/pulumi"

new Route("app", {
    routerSocket: "/run/traffic-cop/router.sock",
    routeId: "app",
    host: "alice.example.com",
    upstream: "localhost:43127",
})
```

The resource is a Pulumi dynamic provider that calls the router over its Unix socket. The process
running `pulumi up` must be able to reach that socket (e.g. run as the service account), and the
router authorizes the route from the caller's kernel-supplied uid — Pulumi sends no credentials.

`@pulumi/pulumi` is a peer dependency; install it in your Pulumi project.

## License

MIT
