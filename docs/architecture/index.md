# Architecture

How HyperIdle is built.

- [Overview](./overview.md) — apps, layers, modules, the 18 actions and how the UI calls them, plumbing routes, events, subscriptions, the core–orchestration seam, system boundary
- [Security](./security.md) — authentication, per-object access rules, WebSocket topics, secrets
- [Connections](./connections.md) — held vs inherited service connections
- [Plugins](./plugins.md) — what a plugin contributes, install, lifecycle, bundled plugins

Package boundary rules are enforced by the linter — see [`tools/governance/README.md`](../../tools/governance/README.md).
