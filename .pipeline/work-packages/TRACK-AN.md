# Track AN: Tool Integration

Source: the founder boundary act of 2026-06-23 (`plans/AN/boundary-concept.md`, `plans/AN/concept.md`), a follow-on from Track AL's review→act execution loop (AL7). The founder's question — *how does an agent actually reach external tools (GitHub, GitLab, Figma, Stripe…)? how does it get credentials? how is the sandbox provisioned? how does the ecosystem contribute?* — surfaced that the entire path from an agent to an external service is unbuilt: no outbound MCP client, no external-service credentials, no OAuth, no sandbox secret-injection, no integration registry. This track builds that path.

**Why a separate track.** Tool integration is a distinct subsystem from the review *experience* (Track AL): Connections, brokering, sandbox provisioning, and the ecosystem registry share AL7's capability-split concept but no code seam with the review surfaces. It can proceed in parallel.

**Scope rules.** External tool integration only. The outer frame is locked (`plans/AN/concept.md`, `plans/AN/boundary-concept.md`): **ride the MCP standard**, **hybrid broker** (reversible operations run direct, irreversible operations are brokered through HyperIdle), and AL7's **capability split** (the agent never holds the live credential). No changes to verdict semantics, the thread model, or the kernel work-loop. `npm run verify` must pass after each workpackage merges.

**Reference docs:** `plans/AN/concept.md`, `plans/AN/boundary-concept.md`, `docs/architecture/system-boundary.md`, `docs/architecture/credential-model.md`, `docs/agent-layer/harness-capability-descriptor.md`, `packages/server/src/mcp/mcp-bridge.ts`, `plans/AL1/design/tool-ecosystem-and-canvases.md` (§3).

---

### AN1 — External Connections (ride harness/MCP auth + user tokens)

**Workpackage.** As a user, I want to make my external services (GitHub, Stripe, Figma, Gmail…) available to my HyperIdle agents the same way I already do in any coding tool — by pointing at an MCP server I run, pasting a token I generate, or simply letting the agent inherit the tools my harness/environment is already logged into — so that agents can act on those services without me ever handing a secret to an agent, **and without HyperIdle ever registering an OAuth app or becoming a "verified company" to do it.** This adds the per-user record of "service S is available to me" plus the place a user manages it.

**Why this matters.** Agents can reach zero external services today; every downstream integration workpackage (AN2–AN4) has nothing to broker against until Connections exist. The user benefits — make a service available once, then agents work across the tools the user already uses. Critically, riding the user's existing auth (harness/MCP/token) is *why HyperIdle is built on harnesses*: the connectors and credentials already live there, so HyperIdle avoids the per-service OAuth-app registration, publisher verification, and enterprise baggage that would otherwise be forced on it. The cost of not building it: agents stay sealed off from real tools, and "review for anything across every tool" can't begin.

**What exists today.** The credential model (`docs/architecture/credential-model.md`) — one canonical store, one resolver, AES-GCM at rest, per-user — scoped to a **closed catalog of LLM-provider keys** (`packages/shared/src/credential.ts`: 4 entries). The harnesses HyperIdle runs already carry their own tool connectors and MCP config, and the inbound MCP bridge exists. No per-(user×service) connection record, no manage surface, no path to reference a user's MCP servers or store a user-supplied service token.

**What's genuinely missing.** A per-(user × service) Connection record whose auth resolves from one of three sources — the user's harness/environment, a user-supplied token HyperIdle stores (vault extended past the closed LLM catalog), or the MCP server's own OAuth (service is the provider; client self-registers via DCR/CIMD) — and a surface where a user makes a service available, inspects it, and revokes it. **No HyperIdle-hosted OAuth-app flow.**

**Depends on.** None — it is the foundation the rest broker against.

**Complexity.** L

**Pre-build gates.**
- **Concept:** Required — locked in `plans/AN/concept.md` (introduces **Connection**). Skip a fresh `/concept`; read the locked doc.
- **Design:** Required — a novel *connect-a-service / manage-connections* surface; `/design` multi-variant + human review.

**Human design review.** Yes — introduces a new user-facing connect/manage surface (authorize, list, trust, revoke); its shape is what's being decided.

**Acceptance criteria.**
- A user can make an external service available — by referencing an MCP server, supplying a token, or relying on their harness/environment's existing auth — and afterward see it listed alongside their other available services.
- A user can remove a connection, after which agents can no longer act on that service.
- A connection records its auth source and whether it is currently usable; an expired/invalid token surfaces as needing attention rather than failing silently.
- Any secret a user supplies is never readable by an agent or visible in any agent-facing surface — only the fact that the service is available is.
- Connections are per user; one user's connection is never usable from another user's session.
- HyperIdle registers **no per-service OAuth app** and acts as **no OAuth provider** — making a service available never requires HyperIdle to appear on the service's consent screen or pass publisher verification.

**Validation scenarios.**
- Given a user with no connections, when they authorize a service, then it appears as connected and its granted scopes are recorded.
- Given a connected service, when the user revokes it, then subsequent agent attempts to act on that service are refused.
- Given a connection backed by a user-supplied token that has expired, when the user views their connections, then it is shown as needing attention.
- Given two users, when each makes the same service available, then neither can act through the other's connection.

**Plan calls.** Concept locked — skip `/concept`. `/design` the connect/manage surface (novel → human review; the direction forks — how a user references an MCP server vs pastes a token vs sees harness-inherited tools, and how trust/removal are presented — are decided by rendered variants, not prose). Then a standard architecture pass extending the credential store to reference per-(user×service) Connections and store user-supplied tokens. **No hosted OAuth-app flow is in scope.**

**Contracts / constraints.** Any stored secret is resolved server-side only and never present in any agent-facing surface, sandbox, or log. Per-user isolation holds. The one-store/one-resolver invariant of the credential model is preserved. The open Connection set is distinct from the closed infra-secret catalog — the infra catalog stays closed. **HyperIdle registers no per-service OAuth app and is never an OAuth provider** — auth rides the user's harness/environment, a user-supplied token, or the MCP server's own OAuth (DCR/CIMD; the service is the provider).

**Out of scope.** Brokering calls through a connection (AN2). Sandbox provisioning (AN3). The community registry (AN4). Per-team shared connections. **Harness-source live enumeration** (populating the "Inherited from your environment" group with the user's actual MCP servers) depends on AN2's outbound MCP client / descriptor enrichment — AN1 ships the projection seam + UI group; token and mcp-oauth sources are fully live at AN1. (Phase-4 review scope amendment, 2026-06-23.)

**Effort.** L (~5d)

---

### AN2 — Outbound tool brokering (hybrid)

**Workpackage.** As an agent doing real work, I want to use an external service's tools — reading freely and proposing irreversible actions for review — so that I can actually get work done in GitHub/Stripe/Figma while the dangerous verbs stay behind the human gate. Reversible operations run directly for speed; irreversible ones are staged for review and only happen on approval, with HyperIdle (never the agent) attaching the credential at the moment of execution.

**Why this matters.** This is the actual bridge from "agent" to "external effect" — the thing that makes Connections (AN1) usable and gives AL7's gate real external operations to gate. The reviewer, the founder, and every agent benefit: agents become able to do tool work, and the irreversible subset is exactly what surfaces for human approval. The cost of not building it: a user can authorize services but agents still cannot touch them.

**What exists today.** The inbound MCP bridge (`packages/server/src/mcp/mcp-bridge.ts`) exposes HyperIdle's own tools to a harness, per session, token-scoped; the internal tool registry is role-filtered; AL7 supplies the staged-operation model + capability split; AN1 supplies Connections. There is **no outbound MCP client** — nothing connects HyperIdle out to an external MCP server.

**What's genuinely missing.** The ability for HyperIdle to connect out to a tool's MCP server, present its tools to a session, classify each call as reversible (run direct) or irreversible (broker it through the Kernel with the credential attached, as an AL7 staged operation).

**Depends on.** AN1 — a brokered call resolves a Connection's credential; it cannot run before the Connection store exists. AL7 — a brokered irreversible call *is* a staged operation; its gate, at-most-once, and outcome semantics come from AL7.

**Complexity.** L

**Pre-build gates.**
- **Concept:** Not required — consumes nouns locked in `plans/AN/concept.md` (Brokered/Direct call) and `plans/AL7/concept.md` (Staged Operation).
- **Design:** Not required — runtime/broker mechanism, no rendered surface.

**Human design review.** No — backend brokering mechanism; no new user-facing component.

**Acceptance criteria.**
- An agent can perform a reversible external operation (e.g. read a repository, query records) and receive the result without a human gate.
- An irreversible external operation is not performed when the agent requests it; it is staged for review and carried out only on a binding approval, inheriting AL7's at-most-once execution and outcome-surfacing.
- The credential for a brokered operation is attached by the system at execution and is never present in the agent's session.
- The mechanism works for more than one service — proven end-to-end against at least one real external service, with a second reachable by configuration rather than new bespoke code.
- An operation whose reversibility is unknown or ambiguous is treated as irreversible (gated), never run directly.

**Validation scenarios.**
- Given a connected service, when an agent reads data from it, then the read succeeds directly with no human gate.
- Given a connected service, when an agent attempts an irreversible action, then nothing happens until a human approves, after which it executes once and its result is recorded.
- Given an operation whose reversibility cannot be determined, when an agent requests it, then it is gated rather than executed directly.

**Plan calls.** Skip `/design`. Standard architecture pass — the outbound MCP client, the reversible/brokered classification, and the credential-attach execution path as an AL7 staged operation. This is a live-proof workpackage: it must execute one real external service end-to-end before it is `done` (stubs/fixtures are not proof).

**Contracts / constraints.** The credential is never present in the sandbox or the agent's session. A brokered call inherits AL7's gate unchanged (at-most-once, idempotency, failure surfaced). The reversibility classification is Kernel/Strategy-owned, never the agent's. Ride the MCP standard — a tool source is a standard MCP server, with no per-service side-effect reimplementation. Unknown reversibility fails safe to brokered.

**Out of scope.** The connect/credential surface (AN1). The per-session sandbox endpoint mechanics (AN3). The connector manifest/registry (AN4). Building specific per-service connectors.

**Effort.** L (~5d)

---

### AN3 — Sandbox tool provisioning

**Workpackage.** As the system running an agent session, I want the agent's sandbox to receive exactly the tools that session is allowed — internal skill-tools plus the user's permitted external ones — through a single endpoint that never carries a secret, so that agents can use tools without any credential entering the sandbox and without one session reaching another's tools. This is the "deploy into the sandbox" mechanics that make brokering real, per session, safely.

**Why this matters.** Brokering (AN2) needs a clean, safe delivery into each agent's runtime, and the system's credential-containment and isolation guarantees have to be enforced at the sandbox boundary, not assumed. The system and every user benefit from the guarantee that no secret is ever in a sandbox and no session can reach another's tools. The cost of not building it: ad-hoc, leak-prone provisioning that quietly breaks the capability split.

**What exists today.** Session provisioning materializes a workspace with an allowed-env-only policy (no secrets injected); the inbound MCP bridge already gives each session a token-scoped endpoint. AN2 supplies the brokered external tools. There is no unified *tool grant* assembling internal + permitted-external tools for a session, and no per-session isolation of external tools.

**What's genuinely missing.** Assembling a session's permitted tool set (internal + the user's active Connections) onto the session's endpoint, with no secret injected and strict per-session/per-user isolation.

**Depends on.** AN2 — there must be brokered external tools to provision before a grant can expose them.

**Complexity.** L

**Pre-build gates.**
- **Concept:** Not required — consumes the **Tool grant** noun locked in `plans/AN/concept.md`.
- **Design:** Not required — sandbox/runtime provisioning, no rendered surface.

**Human design review.** No — infrastructure mechanism; no user-facing component.

**Acceptance criteria.**
- When a session starts, the agent can discover and call exactly the tools that session is permitted — internal skill-tools plus the external tools its user has connected — and no others.
- No credential, token, or live key is present anywhere in the sandbox — not in environment, configuration, or files.
- One session cannot reach another session's or another user's external tools.
- A user connecting or disconnecting a service changes which external tools subsequent sessions receive.
- Removing all external connections leaves the session with its internal tools still fully working.

**Validation scenarios.**
- Given a user with two connected services, when their session starts, then the agent sees exactly those two services' tools plus the internal tools, and nothing from any other user.
- Given any running session, when the sandbox environment and files are inspected, then no secret is present.
- Given a user disconnects a service, when a new session starts, then that service's tools are absent from the grant.

**Plan calls.** Skip `/design`. Standard architecture pass — the tool-grant assembly, its exposure on the session endpoint, and per-session isolation; prove the no-secret-in-sandbox property.

**Contracts / constraints.** Zero secrets in the sandbox. Per-session and per-user isolation of external tools. Internal tools are unaffected when there are no external connections. The grant is the intersection of (role-permitted tools) × (the user's active Connections).

**Out of scope.** The connect surface (AN1). The broker itself (AN2). The registry (AN4).

**Effort.** L (~4d)

---

### AN4 — Ecosystem integration registry

**Workpackage.** As HyperIdle and its ecosystem, I want a third party to contribute a tool integration as a standard MCP server plus a small manifest — its authorization method, its trust tier, and an optional **referenced review template** (AL5) — discoverable and installable with clear trust consent, so that the long tail of tools is covered by the community instead of HyperIdle hand-building every connector. The family review canvas (AL2) remains the floor; a contributed connector may **reference an AL5 review template** as its preferred review surface.

**Why this matters.** "Integrate any tool" cannot scale if HyperIdle authors every connector. The ecosystem and the founder benefit: the catalog of usable tools grows without HyperIdle engineering each one, while users keep a clear vetted-vs-community trust signal. The cost of not building it: only first-party services ever get connected, and the integration surface stays as wide as HyperIdle's own build capacity.

**What exists today.** HyperIdle speaks MCP (the inbound bridge); AN2 supplies outbound brokering and AN1 supplies Connections; AL5 builds the **review-template** mechanism (declarative, first-party + community). There is no manifest format, no registry, no vetted/community trust tier, and no discovery or validation of contributed integrations.

**What's genuinely missing.** A Connector manifest (authorization method, trust tier, optional **referenced review template**), a two-tier (vetted/community) registry with discovery and validation, and a trust-consent step before a community connector may act.

**Depends on.** AN2 — a registered connector is consumed by the broker; there is nothing to register until brokering exists. AL5 — a connector that names a preferred review surface does so by **referencing a review template** AL5 defines (declarative; no shipped `ui://` UI).

**Complexity.** L

**Pre-build gates.**
- **Concept:** Not required — consumes **Connector** and **Trust tier**, locked in `plans/AN/concept.md`.
- **Design:** Not required — primarily a resolution/registry mechanism; any consent chrome extends existing surfaces. `/design`'s DESIGN-CLASS stays authoritative.

**Human design review.** No — integration + registry mechanism; no new base component.

**Acceptance criteria.**
- A third party can describe an integration as a standard MCP server plus a manifest, and HyperIdle can install it without HyperIdle-authored per-service code.
- A registered integration declares its trust tier; a community (unvetted) integration requires explicit user consent before it can act, and a vetted one is visibly distinguished from it.
- A malformed or untrusted manifest or connector is rejected or sandboxed and cannot compromise the host or other connectors.
- When a connector references a review template, reviewing its operations uses that template; otherwise the generic family canvas (AL2) still renders.
- A user can discover available integrations and see each one's provenance (vetted vs community) before connecting.

**Validation scenarios.**
- Given a standard MCP server and a valid manifest, when it is installed, then its tools become connectable with no HyperIdle-authored per-service code.
- Given a community integration, when a user connects it, then they must explicitly consent to its trust tier before it can act.
- Given a malformed connector, when installation is attempted, then it is rejected or sandboxed and the host review is unaffected.

**Plan calls.** Concept nouns already locked (`plans/AN/concept.md`) — skip `/concept`. Skip `/design` (mechanism). Standard architecture pass; likely splits into the MCP-manifest install path and the registry/trust-tier path.

**Contracts / constraints.** Ride the MCP standard — a connector is a standard MCP server plus a manifest, never a HyperIdle-proprietary plugin format. Trust tier ∈ {vetted, community}; community connectors are sandboxed and consent-gated. The family canvas (AL2) is always the floor; a referenced review template is additive and degrades to the floor, consistent with AL5.

**Out of scope.** Building specific connectors. AL5's review-template mechanism itself. The connect surface (AN1).

**Effort.** L (~6d)
