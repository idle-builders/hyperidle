# AN1 — Connection · Concept

**Level:** per-workpackage. Locks the central noun **Connection** for Track AN (External Tools). The prior track-segment concept (`plans/AN/concept.md`, PR #353) was deleted in the 2026-06-25 reset; this re-locks **Connection** fresh, ETHOS-aligned — no broker, no reversible/irreversible classifier, no trust tier, no "the agent never sees the secret."

**Mode:** founder-shaped (interactive, 2026-06-25). One load-bearing fork researched and decided (see Rationale).

**Origin:** founder question — *"inherited = someone used the Claude Code GitHub connector, and we inherit that GitHub connection from Claude Code; that's why we ride harnesses — OAuth without us becoming an OAuth app. We can store simple secrets but not complex OAuth. How does t3code do it — only its own OAuth apps, or can it inherit?"* Two research passes (t3code source; the MCP/Claude-Code OAuth landscape) answered it (Required reading). The answer reshaped the concept: **HyperIdle holds only simple secrets; OAuth-protected services arrive _inherited_ from the harness; HyperIdle is never an OAuth provider.**

---

## Required reading (downstream `/design`, `/architecture`, `/pipeline` must read)

- `docs/architecture/credential-model.md` — the **one-store / one-resolver** contract for the *closed* infra-secret catalog (LLM keys). AN1 **extends** the encryption primitive + resolver pattern to an **open, per-(user×service)** Connection set — it does **not** add to the closed catalog.
- `docs/agent-layer/harness-capability-descriptor.md` + `packages/shared/src/harness/harness-capability-descriptor.ts` — AM2's Kernel-owned descriptor. Today it exposes only `runtime.mcpSupport: boolean`; AN1 **extends** it to enumerate a harness's *configured* MCP servers / logged-in CLIs (the inherited set), **without** reading any token value.
- `packages/server/src/mcp/mcp-bridge.ts` — the inbound bridge (HyperIdle → harness, per-session localhost endpoint). The seam AN2 re-applies Connections through on sandbox spawn (out of scope here).
- `plans/AL7/concept.md` — the review→act loop. AN1 does **not** gate anything; where a specific action is ever reviewed, it rides AL7 unchanged, earned per-case. Not a precondition for using a tool.
- **Research (this concept's evidence):** MCP Authorization spec 2025-06-18 (`https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization` — server = resource server, client = OAuth client; stdio SHOULD use env credentials, not OAuth); Claude Code MCP docs (`https://code.claude.com/docs/en/mcp` — `claude mcp list/get`, config in `~/.claude.json` + `.mcp.json`, OAuth tokens in keychain); Stripe MCP (`https://docs.stripe.com/mcp` — API key as Bearer, "you can't use OAuth"); t3code source (`github.com/pingdotgg/t3code` — pure inheritance via `$HOME` injection, stores zero third-party secrets).

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Connection** | **New primitive** (central) | A per-(user × service) record that a service is available to the user's agents, classified by **who holds the auth**: HyperIdle (a stored simple secret or an MCP-server pointer) or the harness/environment (inherited). |
| Auth source | New (an axis of Connection, not a standalone primitive) | Where a Connection's auth lives: `token`, `mcp`, or `inherited`. Closed set. |
| Connection health | New (a field of Connection) | Whether the Connection currently works (`working` / `needs-attention`) — surfaces an expired token instead of failing silently. |
| Credential (infra) | **Stable** (input — `credential-model.md`) | The *closed* catalog of infra/LLM-provider secrets. Connection is a **distinct, open** set; it reuses the encryption primitive + resolver pattern, never the closed catalog. |
| Harness capability descriptor | **Stable** (input — AM2) | Source of truth for what a harness is configured with. AN1 extends it to enumerate configured MCP servers / CLIs; it does not redefine it. |

Only **Connection** (with its `auth source` and `health` axes) is new and enters the rest of this skill.

**Human-design-review forecast:** the connect/manage surface was already founder-approved in #353 (`VariantAInheritedDefault`); AN1 *adapts* it (strip the trust-tier badge, add the now-in-scope live inherited group). A subtraction + an in-family addition is **not** a novel re-open → forecast **No**. `/design`'s DESIGN-CLASS stays authoritative.

---

## Phase 1 — Essence

**Identity.** A Connection is a **durable per-(user × service) record** that a given external service is reachable by that user's agents. It is *not* a credential and *not* a tool — it is the **fact of availability** plus a pointer to where the auth for it lives.

**Essential properties.** Every Connection has: an owning **user**; a **service** identity (what it connects to, e.g. `github`, `stripe`); an **auth source** (`token` | `mcp` | `inherited`); a **health** state (`working` | `needs-attention`). A `token` Connection additionally holds an **encrypted secret**; an `mcp` Connection holds a **server URL** (+ optional simple bearer secret); an `inherited` Connection holds **no secret at all** — only the reflection that it exists.

**The two storage modes — the load-bearing split.**
- **Held** (`token`, `mcp`): HyperIdle holds the auth material. A `token` is a *simple secret the user pastes* (a PAT, a Stripe restricted key, a service API key) — stored AES-GCM at rest, reusing the infra credential encryption primitive. An `mcp` Connection is a *pointer* to a standard MCP server the user runs/points at, with at most a simple bearer secret. The user **creates** and **removes** these; HyperIdle resolves and injects them into the agent's sandbox at spawn (AN2). **HyperIdle never runs a 3-legged OAuth dance and registers no per-service OAuth app** — only simple secrets and plain MCP pointers.
- **Inherited** (`inherited`): the auth lives in the **user's harness / environment** — a harness-configured MCP server or OAuth connector (Claude Code's GitHub connector), or a logged-in CLI on PATH (`gh`, `stripe`). HyperIdle holds **nothing**; it **reflects** the connection so the user can *see* it. The agent reaches it by being spawned **through that harness** (the harness already has the auth; the token sits in the OS keychain, never extracted). The user does **not** "set up" or "remove" an inherited Connection in HyperIdle — that is managed in the harness.

**Lifecycle.**
- `token` / `mcp`: *created* (user pastes a secret / points at a server) → *working* → may become *needs-attention* (e.g. expired token) → *removed* (by the user; agents lose access).
- `inherited`: *appears* (reflected from the harness) → *present* while the harness has it → *disappears* (when the harness stops being configured with it). No HyperIdle-side create/remove.

**Authority.** A Connection is owned by exactly one **user** and is the source of truth for *held* auth material (server-side, encrypted). For *inherited* Connections, the source of truth is the **harness/environment** — HyperIdle's record is a live reflection, not a store.

**Vocabulary collision.** "Connection" collides with the **database connection** noun (`packages/db/src/connection.ts`, `pg-connection`). To disambiguate in code, the service-connection types/table/resolver use the **`ServiceConnection`** prefix (as #353 did: `serviceConnections` table, `ServiceConnectionResolver`). User-facing copy says "connection" / "connected service"; the db connection is never user-facing, so there is no UI collision.

---

## Phase 2 — Rejection list (what a Connection is NOT)

1. **NOT a trust-tiered object.** No `vetted`/`community` badge, no trust-tier column, no provenance policy. — *Reason: ETHOS §2 — security is earned from learnings, never a preemptive wall; a tier with no learning behind it is exactly the gate-by-default we reject.*
2. **NOT withheld from the agent.** A `token` Connection's secret IS resolved into the agent's sandbox so its tools can authenticate — that is the entire point. The secret is only never *displayed in the management UI* or *written to logs*. — *Reason: ETHOS §2 — a tool that can't authenticate is useless; "the agent must never see the secret" is the containment model the reset killed.*
3. **NOT an OAuth app HyperIdle registered, and HyperIdle is NOT an OAuth provider.** We never appear on a service's consent screen, never pass publisher verification, never run a 3-legged OAuth exchange. — *Reason: research confirms the *service* owns OAuth (MCP server = resource server). Registering per-service apps is the "verified company" enterprise baggage we ride harnesses to avoid; t3code registers zero. OAuth-protected services arrive **inherited**.*
4. **NOT a brokered/gated call seam.** No reversible/irreversible classifier, no broker in front of every external call. Held tools run **direct** from the sandbox. — *Reason: ETHOS §2 — no preemptive gate; where review is genuinely wanted it rides AL7, earned per-case.*
5. **NOT an entry in the closed infra-credential catalog.** The catalog stays closed for infra/LLM secrets; Connections are an **open, user-driven** set that merely reuses the encryption primitive + resolver pattern. — *Reason: keep the infra-secret contract intact (`credential-model.md` Hard Rules) while letting users connect arbitrary services.*
6. **NOT a tool-execution engine.** A Connection makes a service *available*; the service's own MCP server / CLI executes the operation. HyperIdle never reimplements a service's API. — *Reason: ride the MCP standard (track scope rule).*
7. **An `inherited` Connection is NOT something HyperIdle stores or removes.** It is a live reflection of the harness/environment; its auth never enters HyperIdle. — *Reason: that is precisely how OAuth services are reached without us holding OAuth — the token stays in the harness keychain (t3code's `$HOME`-injection model).*

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Connection** | Per-(user × service) record that a service is available to a user's agents. | integration, connector, account, credential, link |
| **Held connection** | A Connection whose auth HyperIdle holds: `token` (stored encrypted secret) or `mcp` (server pointer). | stored connection, managed credential |
| **Inherited connection** | A Connection whose auth lives in the harness/environment; HyperIdle only reflects it. | native tool, environment tool (informal OK in copy, not in types) |
| **Auth source** | Where a Connection's auth lives: `token` \| `mcp` \| `inherited`. Closed. | auth type, kind, provider |
| **Connection health** | Whether the Connection currently works: `working` \| `needs-attention`. | status, validation state (reserve `validationState` for infra Credential) |
| `ServiceConnection*` | The code prefix for service-connection types/table/resolver (collision-avoidance with the db `Connection`). | `Connection` (bare, in code) |

---

## Phase 4 — Contracts

- **Cardinality.** One Connection per (user × service × auth source). A service may appear at most once per auth source for a user (e.g. a held GitHub `token` and an inherited GitHub connector can coexist and are distinct rows/reflections). Held connections are real rows; inherited connections are reflections keyed the same way.
- **Closure.** **Auth source is a closed set** `{ token, mcp, inherited }`. Adding a fourth requires a concept-doc update first. **Health is a closed set** `{ working, needs-attention }`. Services are an **open** set (any string identity the user connects).
- **Mutability.** A held Connection's secret is write-only from the UI (set/replace, never read back). Auth source is immutable once created (changing it is remove + re-create). Health is mutated by the system (a validate/probe), not the user. Inherited Connections are wholly immutable from HyperIdle.
- **Identity.** A held Connection has an opaque server-issued id, unique on (userId, service, authSource). An inherited Connection's identity is derived from the harness descriptor (harness + server/CLI identity), not a stored id.
- **Hard rules.**
  1. **A stored secret is never returned to a display or log surface** — but it **is** resolvable server-side for injection into the agent's sandbox (ETHOS §2). Hard-rule violation = the secret appears in any GET response, UI field, or log line.
  2. **HyperIdle runs no 3-legged OAuth and registers no per-service OAuth app.** Held auth is only a simple secret or an MCP pointer; OAuth services arrive inherited. Violation = any code path that performs an authorization-code exchange or registers a client HyperIdle owns on a third-party service.
  3. **Per-user isolation.** One user's Connection (held or inherited) is never resolvable, listable, or usable from another user's session. Violation = any cross-user read.
  4. **Inherited Connections store no auth material.** Violation = any token/keychain value copied into a HyperIdle record.
  5. **The closed infra-credential catalog stays closed.** Connections never add a name to it. Violation = a Connection written into the infra credential store/catalog.

---

## Rationale

The 2026-06-25 reset killed the prior AN concept's spine (broker-gate, reversible/irreversible classifier, trust tiers, "agent never holds the secret"). Re-locking forced the real question the founder named: *what auth can HyperIdle actually hold without becoming the enterprise OAuth product we reject?* Two research passes answered it decisively. **(1)** The MCP authorization model puts OAuth on the *service* (server = resource server, client = OAuth client); stdio servers use env credentials, not OAuth. So a *simple stored secret* (Bearer/PAT) covers most of the real surface — GitHub, Stripe (which explicitly can't use OAuth), Figma, databases — and the genuine-3-legged-OAuth residue is near-empty (consumer Google/Microsoft), itself reachable **inherited**. **(2)** t3code — the closest reference — registers **zero** OAuth apps and stores **zero** third-party secrets; it rides the user's CLI logins by injecting the real `$HOME`. That is the inherited path, proven in production.

So Connection's load-bearing shape is the **held vs inherited** split: HyperIdle holds only *simple secrets* and *MCP pointers* (held), and *reflects* harness/environment auth (inherited) so the user sees what their agents already reach. This is the concrete meaning of "ride the harness" — the reason HyperIdle is built on harnesses is that OAuth already lives there, and we never re-acquire it.

**Scope note (founder decision, 2026-06-25).** AN1 ships the **live inherited group now** (not deferred to AN3): the manage surface shows held + inherited together from day one, which requires AN1 to extend the AM2 descriptor to enumerate configured MCP servers / logged-in CLIs (token values never read). This pulls AN3's live-inherited view forward; AN3 is expected to shrink to enrichment. Flagged for the founder; AN3 is not re-planned here.

**The concept is locked.** `/design` and `/architecture` explore inside it; they do not reshape held-vs-inherited, the closed auth-source set, or the five hard rules.
