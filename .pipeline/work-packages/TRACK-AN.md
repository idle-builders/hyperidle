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

### AN2 — Outbound tool brokering (hybrid) — ⛔ WON'T DO

> **STATUS — WON'T DO (2026-06-25).** Killed. AN2's distinctive half was a **reversible/irreversible broker-GATE** that classified every external call and routed the "irreversible" ones through a wall before they could run. That is the preemptive-security pattern the ethos now explicitly rejects (`ETHOS.md` §2 — *security is never preemptive; "irreversible" is not, by itself, a reason to gate; friction is earned from learnings, not built first*). It also presumed danger, leaned on AL7 rather than adding its own value, and was poorly structured. The *valuable* half — agents actually reaching and using connected tools — is rebuilt trust-first, with **no gate**, in the reshaped **AN3** (use connected tools in a session) and **AN5** (see inherited tools). Where an action genuinely warrants review, it rides **AL7**'s existing loop only when a human chose it or a learning earned it. The original PR (#360) was closed and its branch deleted. The spec below is retained for history only.

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

### AN3 — Use the tools you've connected, from inside an agent session

> **Reshaped trust-first (2026-06-25).** Was "Sandbox tool provisioning" — a broker-delivery mechanism gated on the killed AN2 and built around a "zero secrets in the sandbox" containment guarantee. Now reframed: agents simply *use* the tools the user connected, directly, with **no preemptive gate** and no credential-withholding dogma (`ETHOS.md` §2). Dependency moved from AN2 → AN1.

**Workpackage.** As an agent doing real work in a session, I want to actually call the external tools my user has connected — read a repo, query records, open a branch, create an issue, post a message — directly, the same way I'd use any tool, so that I can get real work done in the user's GitHub/Stripe/Figma/Gmail without a wall in front of every action. The tools a user has connected become available in the session and the agent calls them freely; nothing is pre-classified as "too dangerous to run."

**Why this matters.** This is the actual bridge from "agent" to "external effect" — the thing that makes Connections (AN1) worth anything. Today an agent can reach zero external tools: a user can connect GitHub but their agent still can't touch it. The fast-moving solo founder benefits directly — they connect their stack once and their agents work across it at full speed. The cost of not building it: Connections are a dead-end settings screen and "agents that do real work in your tools" never ships.

**What exists today.** AN1 (#353) shipped the per-(user×service) Connection record + manage UI and the credential vault (token source live; harness-native source is a UI placeholder). AL7 (#351) owns the review→act execution loop for the narrow cases where a human chose to review an action — the *earned* gate, not a precondition for tool use. The inbound MCP bridge (`packages/server/src/mcp/mcp-bridge.ts`) already gives each session a token-scoped localhost endpoint exposing HyperIdle's internal tools. The original AN2 (outbound broker + reversible/irreversible gate) was killed — its broker-gate is the preemptive-security pattern the ethos rejects.

**What's genuinely missing.** Nothing connects a session's agent to a connected service's tools. There is no path that takes a user's active Connections and makes those tools callable inside the agent's session, and no per-session assembly of "internal tools + this user's connected tools."

**Depends on.**
- AN1 (`done`) — a session resolves the user's Connections; it cannot expose connected tools before the Connection store exists.

**Complexity.** L

**Pre-build gates.**
- **Concept:** Not required — consumes **Connection** and **Tool grant**, locked in `plans/AN/concept.md`. (Founder note: the AN concept doc still contains the now-dead **Brokered/Direct call** nouns and the reversible/irreversible "hybrid path"; a `/concept AN` cleanup to strip the gate framing is recommended upstream but does not block this WP, which consumes only the surviving nouns.)
- **Design:** Not required — runtime/session provisioning, no rendered surface.

**Human design review.** No — backend/runtime mechanism; no user-facing component.

**Acceptance criteria.**
- When a session starts, the agent can discover and call exactly the external tools its user has connected, alongside the internal tools — and call them directly, with no reversibility classifier gating the call.
- An agent can perform a real external operation against at least one real connected service end-to-end (e.g. read a repository or create a record) and receive the result.
- The mechanism works for more than one service — proven against at least one real external MCP server, with a second reachable by configuration rather than new per-service code.
- A user connecting or disconnecting a service changes which external tools subsequent sessions receive; after disconnect, the tool is absent.
- One user's connected tools are never reachable from another user's session.
- Where an action does pass through review, it does so via AL7's existing loop — this WP adds no new gate, classifier, or policy engine of its own.

**Validation scenarios.**
- Given a user with a connected service, when their agent's session starts, then the agent sees that service's tools plus the internal tools and can call them directly.
- Given a connected service, when an agent reads data from it, then the read succeeds with no human gate.
- Given a user disconnects a service, when a new session starts, then that service's tools are absent from the session.
- Given two users, when each connects the same service, then neither user's session can act through the other's connection.

**Plan calls.** Skip `/design`. Standard architecture pass — assembling a session's tool set (internal + the user's active Connections) onto the session endpoint, the outbound reach to a connected MCP server, and per-session/per-user isolation. This is a live-proof workpackage: it must call one real external MCP service end-to-end before it is `done` (an in-repo standard MCP server spawned over a real transport is an acceptable real service; a stub of our own client is not).

**Contracts / constraints.** No preemptive gate — reversible and irreversible external calls alike run directly; the agent is trusted to act. Where review is wanted it rides AL7 unchanged (a human chose it, or a learning earned it) — never a reversible/irreversible classifier built into this WP. Per-session and per-user isolation: one user's Connection is never usable from another user's session. Ride the MCP standard — a tool source is a standard MCP server, no per-service side-effect reimplementation. **No "zero secrets in the sandbox" dogma** — agents may hold the credentials their tools need to authenticate (ETHOS §2); credentials are still resolved per the AN1 credential model and never logged or shown in an agent-facing *settings* surface, but a tool that can't authenticate is useless and credential-withholding is not a goal.

**Out of scope.** The connect/credential surface (AN1). Harness-native tool *visibility* in the UI (AN5). The community connector registry / trust tiers (AN4, deferred). Any new review-gating mechanism (that is AL7's, and only where earned).

**Effort.** L (~4d)

---

### AN4 — Ecosystem integration registry — ⏸ DEFERRED

> **STATUS — DEFERRED (2026-06-25).** The community registry + vetted/community **trust tiers** are *earned-later* ecosystem work, not part of the core access loop (AN1 → AN3 → AN5). Two reasons to hold: (1) under the current ethos, **trust tier is not a policy engine** and security is earned from learnings, not built as a preemptive registry gate up front; (2) HyperIdle authoring its own first-party connected-tool use (AN3) must be real, and community contribution an actual demand, before a registry earns its complexity. Revisit only then. Its dependency on the killed AN2 is replaced by AN3. Spec below retained as the future direction.

**Workpackage.** As HyperIdle and its ecosystem, I want a third party to contribute a tool integration as a standard MCP server plus a small manifest — its authorization method, its trust tier, and an optional review canvas — discoverable and installable with clear trust consent, so that the long tail of tools is covered by the community instead of HyperIdle hand-building every connector. The family review canvas (AL2) remains the floor; a contributed connector may ship its own canvas on top.

**Why this matters.** "Integrate any tool" cannot scale if HyperIdle authors every connector. The ecosystem and the founder benefit: the catalog of usable tools grows without HyperIdle engineering each one, while users keep a clear vetted-vs-community trust signal. The cost of not building it: only first-party services ever get connected, and the integration surface stays as wide as HyperIdle's own build capacity.

**What exists today.** HyperIdle speaks MCP (the inbound bridge); AN2 supplies outbound brokering and AN1 supplies Connections; AL5 builds tool-shipped `ui://` review canvases. There is no manifest format, no registry, no vetted/community trust tier, and no discovery or validation of contributed integrations.

**What's genuinely missing.** A Connector manifest (authorization method, trust tier, optional `ui://` review canvas), a two-tier (vetted/community) registry with discovery and validation, and a trust-consent step before a community connector may act.

**Depends on.** AN3 — a registered connector is consumed by the session's connected-tool use; there is nothing to register until agents can use connected tools (replaces the dependency on the killed AN2). AL5 — a connector that ships its own review canvas does so through the `ui://` canvas mechanism AL5 builds.

**Complexity.** L

**Pre-build gates.**
- **Concept:** Not required — consumes **Connector** and **Trust tier**, locked in `plans/AN/concept.md`.
- **Design:** Not required — primarily a resolution/registry mechanism; any consent chrome extends existing surfaces. `/design`'s DESIGN-CLASS stays authoritative.

**Human design review.** No — integration + registry mechanism; no new base component.

**Acceptance criteria.**
- A third party can describe an integration as a standard MCP server plus a manifest, and HyperIdle can install it without HyperIdle-authored per-service code.
- A registered integration declares its trust tier; a community (unvetted) integration requires explicit user consent before it can act, and a vetted one is visibly distinguished from it.
- A malformed or untrusted manifest or connector is rejected or sandboxed and cannot compromise the host or other connectors.
- When a connector ships its own review canvas, reviewing its operations uses that canvas; otherwise the generic family canvas (AL2) still renders.
- A user can discover available integrations and see each one's provenance (vetted vs community) before connecting.

**Validation scenarios.**
- Given a standard MCP server and a valid manifest, when it is installed, then its tools become connectable with no HyperIdle-authored per-service code.
- Given a community integration, when a user connects it, then they must explicitly consent to its trust tier before it can act.
- Given a malformed connector, when installation is attempted, then it is rejected or sandboxed and the host review is unaffected.

**Plan calls.** Concept nouns already locked (`plans/AN/concept.md`) — skip `/concept`. Skip `/design` (mechanism). Standard architecture pass; likely splits into the MCP-manifest install path and the registry/trust-tier path.

**Contracts / constraints.** Ride the MCP standard — a connector is a standard MCP server plus a manifest, never a HyperIdle-proprietary plugin format. Trust tier ∈ {vetted, community}; community connectors are sandboxed and consent-gated. The family canvas (AL2) is always the floor; a connector canvas is additive, with deterministic precedence (connector canvas over family floor) consistent with AL5.

**Out of scope.** Building specific connectors. AL5's canvas mechanism itself. The connect surface (AN1).

**Effort.** L (~6d)

---

### AN5 — See the tools your agents inherit from your environment

**Workpackage.** As a user, I want to see, in the same place I manage my Connections, the tools my agents already inherit from my environment — the MCP servers and logged-in CLIs my harness is already configured with — so that I know exactly what my agents can reach without connecting anything, and the "Inherited from your environment" group reflects my real setup instead of being an empty placeholder.

**Why this matters.** AN1 shipped the "Inherited from your environment" group as a placeholder but never populated it — so a user can't tell what their agents already inherit (the whole reason HyperIdle rides harnesses: the connectors and logins already live there). The fast-moving user benefits from transparency: they see their real reachable toolset at a glance and connect only what's genuinely missing. The cost of not building it: the inherited group stays empty and misleading, and users re-connect tools they already have.

**What exists today.** AN1 (#353) shipped the Connections manage UI including the empty "Inherited from your environment" group (a projection seam with no live data). AM2 (#339) shipped the harness capability descriptor, proven against real harness binaries (Claude Code, Codex, OpenCode) — it already declares per-harness capability and is where a harness's configured MCP servers/tools are known. AN1's own scope note deferred live harness-source enumeration to the (now-dead) outbound-client work.

**What's genuinely missing.** Nothing reads the user's harness/environment configuration and projects the actually-present MCP servers / inherited tools into AN1's "Inherited from your environment" group. The group renders empty regardless of what the user's harness is configured with.

**Depends on.**
- AN1 (`done`) — populates AN1's existing inherited-tools group; that surface must exist first.
- AM2 (`done`) — the harness capability descriptor is where a harness's configured tools/MCP servers are declared; enumeration reads from it.

**Complexity.** M

**Pre-build gates.**
- **Concept:** Not required — consumes **Connection** (harness-native source) and the harness capability descriptor, both already locked.
- **Design:** Light — extends AN1's existing "Inherited from your environment" group with real data; single-variant `/design` to place the populated state, no human-review park.

**Human design review.** No — extends an existing, already-approved component group with live data; introduces no new primitive.

**Acceptance criteria.**
- A user with MCP servers / logged-in tools configured in their harness sees those reflected in the "Inherited from your environment" group, identified by service, without having connected anything.
- A user whose harness has no extra tools configured sees an honest none-state for the inherited group, not a misleading placeholder.
- The inherited list reflects the user's real environment — changing the harness's configured tools changes what the group shows on a refresh.
- No secret or token value from an inherited tool is shown in the surface — only the fact that the tool is available.

**Validation scenarios.**
- Given a user whose harness is configured with two MCP servers, when they open their Connections, then both appear in the "Inherited from your environment" group identified by service.
- Given a user whose harness has no extra tools, when they open their Connections, then the inherited group shows an honest none-state.
- Given an inherited tool, when the surface renders it, then no credential or token value is present in the rendered output.

**Plan calls.** Single-variant `/design` to place the populated inherited group (extends AN1's surface). Then a standard architecture pass — read the harness capability descriptor (AM2) and project the user's configured MCP servers / inherited tools into the AN1 group.

**Contracts / constraints.** Renders from the harness capability descriptor — no per-harness branching baked into the UI. The inherited group is read-only (you don't "connect" what you already inherit; you only see it). No secret values surfaced. Consistent with AN1's existing Connection vocabulary and group layout.

**Out of scope.** Using inherited tools in a session (AN3 / native harness use). Connecting new services (AN1). The community registry (AN4).

**Effort.** M (~6h)
