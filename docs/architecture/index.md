# Architecture

Technical ground truth for how HyperIdle is built — the four-Layer structure, code-level domain map, data flows, and every load-bearing boundary decision. Companion to [docs/requirements/](../requirements/index.md).

What may cross which package boundary is not documented here. It is machine-enforced by `npm run lint` and stated once in [`governance/README.md`](../../governance/README.md).

- [system-overview.md](./system-overview.md) — the four Layers and the repository tiers, stack summary, desktop-shell posture, non-goals, delivery/mobile claim
- [as-implemented-domain-architecture.md](./as-implemented-domain-architecture.md) — verified component inventory, MCP surface, session flow, EventBus + WS contract
- [data-flow-examples.md](./data-flow-examples.md) — five end-to-end flows traced to real services, tables, and columns
- [runtime-simplification.md](./runtime-simplification.md) — the Application / Layer / Service vocabulary and the core-app vs agent-layer behavioral split
- [run-unit-model.md](./run-unit-model.md) — agents run as host child processes (AQ1), working-directory abstraction, capture seam
- [system-boundary.md](./system-boundary.md) — where HyperIdle ends and git-host/CI/deploy begin; trigger-not-executor seam
- [authorization-model.md](./authorization-model.md) — load-bearing access-boundary contract (cites `access-boundary.ts`), WS subscribe authorization
- [credential-model.md](./credential-model.md) — infra-secret storage, AES-GCM encryption, runtime resolution, user visibility
- [connection-model.md](./connection-model.md) — held vs inherited Connection split, `service_connections` table, resolver, descriptor extension
- [decisions.md](./decisions.md) — code-verified architecture decision log
