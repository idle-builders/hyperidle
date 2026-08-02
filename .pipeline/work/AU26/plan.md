# AU26 — Connections is agent-session-provisioning domain, not core domain: relocate to agent-orchestration

## Work package

**Work package.** As a maintainer, I want the `service_connections` domain (a user's held + inherited connections that make external services reachable by their agents) to live where it actually belongs — agent-orchestration, the Layer that owns session provisioning — instead of core-api, so that the codebase's own domain-ownership discipline (established and enforced throughout AU21) holds for this concept too, not just the ones AU21 happened to touch first. Today `@hyperidle/connections` (core-api) conflates two genuinely distinct things: the LLM-provider credential catalog (`server_credentials`, legitimately core/infra) and user service connections (`service_connections`, which every load-bearing property points at the agent/session-provisioning side — its "inherited" half is literally sourced from `agent-execution`'s harness descriptors and is never a DB row at all; its "held" half exists only to be injected into a session at spawn). Splitting these and relocating `service_connections` to a new agent-orchestration-owned Service closes a real domain-ownership gap AU21's own F2 decision (Increment 8) left half-done — F2 moved the *provisioning operation* to orchestration but left the *record* in core "because the UI owns it," a convenience argument, not a domain one.

**Why this matters.** The maintainer directly challenged this during AU21's build ("domain is the only accepted reason for such a cut — everything else has to engineer properly around it") and confirmed, after a real investigation traced every dependent and the actual layer rules, that no domain argument holds for keeping `service_connections` core-side. Leaving it misplaced means the codebase's stated domain-ownership discipline has a known, identified exception sitting in a Layer that doesn't conceptually own it — exactly the kind of thing this track (AU) exists to keep honest. It is not user-facing-broken today (F2 already made it functionally work), so this is a coherence fix, not an incident — but it is a real, scoped, buildable piece of debt, not speculative cleanup.

**Type.** backend.

**What exists today.** `packages/core-api/connections/src/` (643 lines) holds both `server_credentials` (LLM-key catalog: `credential-store.ts`, `credential-resolver.ts`, `credential-encryption.ts`) and `service_connections` (user connections: `service-connection-store.ts`, `service-connection-resolver.ts` — the sole held-token decrypt path, `service-connection-projection.ts` — projects agent-discovered "inherited" connections, never DB rows). `packages/core-api/src/routes/connections.ts` (526 lines) hosts `/api/connections` (GET/POST/DELETE + `/provisioning`, the seam route `CoreApiPort.connections.listHeldConnectionsForProvisioning` backs). `AgentOrchestrationPort` (a read-only seam from core-ui to agent-orchestration, serving per-session cost) already shipped in AU21 Increment 6/7 — the exact re-hosting precedent this WP reuses. AU21's Decision J (`.pipeline/work/AU21/architecture.md`, search "Decision J") contains the full investigation this plan is built from: verified dependents, the real layer model (`docs/architecture/runtime-simplification.md`), and why agent-execution and a new shared package are both structurally disqualified as the destination (agent-execution has zero DB/Service access of any kind; a stateful SQL-owning Service that also needs the harness adapter pool cannot be a `shared`-style leaf package).

**What's genuinely missing.** A new SQL-owning `packages/agent-orchestration/connections/` Service that becomes the sole ACL-holder of the `serviceConnections` table; the AES-GCM primitive relocated to `@hyperidle/shared` so the new Service can decrypt without importing a core Service (Mechanism C); the core `connections` package renamed to `@hyperidle/credentials` and stripped down to just the LLM-key catalog; the `/api/connections` HTTP surface re-hosted in core-api but delegating to the relocated Service (the `AgentOrchestrationPort` precedent); `CoreApiPort.connections` + the `/connections/provisioning` seam route deleted since the provisioning read becomes in-layer once the record moves.

**Depends on.**
- **AU21** — this WP relocates code AU21 built/touched (`CoreApiPort`, `AgentOrchestrationPort`, F2's `connection-provisioning.ts` in `run-orchestration`) and reuses patterns AU21 established; it cannot be meaningfully scoped or built until AU21 has shipped those doors.

**Complexity.** L

**Engineering tier.** production (matches AU21's own tier).

**Pre-build gates.**
- **Refinement:** Not required — the goal, the domain ruling, and the increment breakdown are already settled via AU21's Decision J investigation (a real, verified architecture pass, not a fuzzy goal).
- **Design:** Not required — backend/infra, no new UI surface (the Settings UI's frontend is unchanged; only its backend wiring re-points).

**Human review gates.** Yes — mandatory for every work package. One genuinely open sub-question (below) should be confirmed before or during build, not assumed away.

**Plan calls.** Standard architecture pass, but treat `.pipeline/work/AU21/architecture.md`'s Decision J section as the locked design — do not re-derive it from scratch; verify its claims still hold against the current tree (AU21 will have shipped more increments by the time this starts) and proceed straight to the four-increment breakdown it already specifies (J1–J4, renamed here without the "J" prefix per this WP's own numbering).

**Contracts / constraints.**
- No data migration: table *definitions* stay in `packages/db/src/schema.ts`; only the ACL-holder (which Service package is the sole importer of the `serviceConnections` table object) changes.
- `server_credentials` / `@hyperidle/credentials` stays core-api-owned — this WP does not move the LLM-key catalog, only splits it cleanly out of the conflated package.
- `AgentOrchestrationPort` stays strictly read-only (its existing, already-shipped contract) — connection mutations (POST/DELETE/validate) stay HTTP-hosted in core-api, delegating to the relocated Service, never routed through that read-only seam.
- The Settings UI's frontend (`SettingsConnections.tsx`) is unchanged — same routes, same request/response shapes; only the handler's backend delegation changes.
- Must not break `model-gateway`'s credential resolution (a core-api Service, dual-consumed by both layers) — verified in Decision J as the reason the LLM-key catalog stays core-side; this WP must prove that resolution path is unaffected, not just assume it.
- Must not attempt to give `agent-execution` any Service/DB access — that Layer is structurally disqualified (zero DB credentials, may run on a separate machine) and is not a candidate destination for any part of this move.

**Out of scope.**
- Moving or renaming `server_credentials` / the LLM-key catalog itself — it stays core-side as `@hyperidle/credentials`.
- Re-litigating whether `model-gateway` itself is correctly core-api-owned (see the open question below) — that is a separate, bigger question this WP does not resolve, only flags.
- Any UI redesign of the Settings connections/filesystems pages.
- Filesystems' own record/routes/UI beyond the narrow reachability-probe resolver co-move (Decision J's J8) — F2 already correctly placed filesystems provisioning; this WP does not revisit that.

**Effort.** L (~4-6d) — a real package relocation + rename + crypto-primitive move + route re-hosting + a new `AgentOrchestrationPort` read family, each independently testable per Decision J's four-increment breakdown.

## Acceptance criteria

- The `serviceConnections` table has exactly one Service importer (the new agent-orchestration `connections` Service) — no core-api Service reaches it directly, enforced by a real guard (mirroring AU21's own anti-regrowth guard pattern), not just documentation.
- Session-launch provisioning resolves an agent's held connections with zero calls through `CoreApiPort` — the provisioning operation reads the relocated Service in-layer.
- `model-gateway`'s LLM-provider credential resolution works identically to before the move (a real test proves the resolved key/behavior is unchanged), proving the core-side `@hyperidle/credentials` split didn't regress it.
- The Settings UI's connections page (list, add, delete, validate) works identically end-to-end through the relocated Service, with zero frontend changes required.
- `CoreApiPort.connections` and the `/connections/provisioning` route are deleted with no remaining caller; the read path core-ui needs is served by a new `connections` family on the already-shipped `AgentOrchestrationPort` instead.
- Inherited connection projection (agent-discovered, never a DB row) produces identical output to today for a fixed harness-descriptor fixture, proving the relocation didn't change what gets displayed.

## Validation scenarios

- Given a user has both a held (token) connection and an inherited (harness-discovered) connection, when they view Settings → Connections, then both appear with the same shape as before the move, sourced through the relocated Service via the `AgentOrchestrationPort`-hosted read.
- Given a session is about to launch for an agent with a held connection, when provisioning resolves that agent's connections, then it reads the agent-orchestration-owned Service directly (in-layer), never crossing back through `CoreApiPort`.
- Given `model-gateway` needs to resolve an LLM provider's API key, when it calls its existing credential resolution path, then it succeeds identically to before the split, proving the core-side `@hyperidle/credentials` catalog still works for its dual (core + orchestration-session) consumers.
- Given a core-api Service attempts to import the `serviceConnections` table object directly (a regression attempt), when the guard runs, then it fails the build — the ACL is enforced, not just documented.
