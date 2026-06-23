# Tool Integration Architecture · Concept (AN1 lead; spans AN1–AN4)

**Level:** track-segment. The shared concept for *how an AI agent reaches external tools* (GitHub, GitLab, Figma, Stripe, Gmail…) — agent tool access, credentials, sandbox provisioning, ecosystem contribution. Outer frame: `plans/AN/boundary-concept.md` (ride / integrate / replace) + `docs/architecture/system-boundary.md`. Inherits AL7's **capability split** + **reversibility** classifier as fixed inputs.

**Mode:** founder-shaped (interactive, 2026-06-23). Two load-bearing forks decided (Contracts).

**Origin:** founder question, 2026-06-23 — *"how do GitHub/GitLab/Figma integrations work? how does an agent get access to all these tools? how do we deploy this into the sandbox? do we have it figured out? how can the ecosystem contribute?"* Assessment: **the path for an agent to reach any external service is entirely unbuilt** (no MCP client, no external credentials, no OAuth, no sandbox injection, no registry). This concept defines it.

---

## What this is, in one breath

An agent reaches an external service through a **Connector** (a standard MCP server + a small manifest). The user's authority to use that service is a **Connection** (an OAuth/credential record HyperIdle holds, never the agent). Reversible work runs **direct** from the sandbox for speed; every **irreversible** call is **brokered** through HyperIdle, where the credential lives and the human gate sits (AL7). The agent gets a *handle to capabilities*, never the keys.

---

## Required reading (downstream `/architecture`, `/pipeline` must read)

- `plans/AN/boundary-concept.md` + `docs/architecture/system-boundary.md` — ride the open standard; integrate, don't reimplement.
- `plans/AL7/concept.md` — the **capability split** (agent never holds the live commit verb / live credential; Kernel holds it; approve is the only bridge) and **reversibility** as the gate classifier. AN1's spine inherits both.
- `docs/architecture/credential-model.md` — the one-store/one-resolver credential contract AN1 *extends* from closed-catalog LLM-keys to open per-(user×service) Connections.
- `docs/agent-layer/harness-capability-descriptor.md` — Kernel-owned declaration of what a harness can run (incl. `mcpSupport`); a Connector's tools are resolved alongside, not from a hardcoded map.
- `packages/server/src/mcp/mcp-bridge.ts` — the **inbound** bridge (HyperIdle → harness). AN1 extends it to also surface **brokered external** tools on the same per-session localhost endpoint.
- `packages/server/src/tools/tool-registry.ts` — how internal tools are assembled per role; external tools join the same per-session assembly.
- `plans/AL1/design/tool-ecosystem-and-canvases.md` §3 — the MCP-Apps `ui://` + HACS-style two-tier registry sketch AN4 builds on.

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Connector** | **New primitive** (central) | A standard **MCP server + manifest** that exposes one external service's tools (and optional `ui://` review canvas) to HyperIdle. The unit the ecosystem contributes. |
| **Connection** | **New primitive** (central) | A reference to a tool source the user has **made available** — its auth lives in one of three places (the user's harness/MCP config, a user-supplied token HyperIdle stores, or the MCP server's own OAuth). Per (user × service). **HyperIdle is never the OAuth provider and registers no per-service OAuth app** — it consumes auth, it does not issue it. |
| **Brokered call** | **New** (the gate seam) | An irreversible/credentialed external tool call routed **through** HyperIdle — the Kernel attaches the Connection's credential and makes the call; the agent never sees it. The point where AL7's gate applies. |
| **Direct call** | **New** | A reversible / draft-space external tool call the agent makes from the sandbox without the gate (read a repo, build in a branch, query). Speed path. |
| **Tool grant** | **New** | What a session's sandbox actually gets: a localhost MCP endpoint exposing internal skill-tools + the session's *permitted* external tools — **never raw credentials**. |
| **Trust tier** | **New axis** | `vetted` (first-party/reviewed) vs `community` (BYO, sandboxed, at-your-own-risk) for a Connector. Gates what it may do unsupervised. |
| Capability split | Stable (input, AL7) | Agent holds draft/safe verbs only; Kernel holds the live credential + commit verb. AN1 is the *external-tool* application of it. |
| Reversibility | Stable (input, AL7) | The classifier deciding direct vs brokered. Not familiarity. |
| Harness capability descriptor | Stable (input) | Declares `mcpSupport` etc.; Connectors resolve against it. |

Only **Connector, Connection, Brokered/Direct call, Tool grant, Trust tier** are new here.

**Human-design-review forecast:** the *Connect a service* / *manage Connections* surface (point at an MCP server, paste a token, connection list, trust-tier consent — **not** an OAuth-app flow we host) is a **new user-facing surface** → forecast **Yes** for the WP that owns it (AN1 connections UI). The broker/sandbox internals (AN2/AN3) are runtime → **No**. `/design`'s DESIGN-CLASS stays authoritative.

---

## Phase 1 — Essence

### Connector (how a tool exists in HyperIdle)

A Connector is **not HyperIdle code per service** — it is a pointer to a standard **MCP server** plus a **manifest** (`{ service, auth: oauth|apiKey|none, trustTier, tools?, ui://canvas? }`). HyperIdle ships an **outbound MCP client** that connects to it. Because MCP is the open standard, *anyone who ships an MCP server is already 90% of a Connector* — the manifest is the thin HyperIdle-specific glue (auth method + trust + optional review canvas). This is the **ride-the-standard** decision: no proprietary plugin/adapter format.

### Connection (how authority exists) — HyperIdle is never an OAuth provider

A Connection is the **Kernel-held** record that *this user has made service S available to HyperIdle*. Crucially, **HyperIdle does not own the auth and registers no per-service OAuth app** — owning OAuth apps per service (and the "verified company"/enterprise baggage that comes with it) is a product/distribution choice we reject. This is the whole reason we ride harnesses: auth already lives elsewhere. A Connection's auth resolves from one of **three sources**, in preference order:

1. **Harness / user-environment native (default).** The agent runs in the user's environment and inherits their already-authenticated CLIs (`gh`, `git`, `stripe`) and the harness's own MCP servers. HyperIdle stores nothing — this is exactly the t3code / Claude Code model. *Why this is first: it's the reason we built on harnesses.*
2. **User-supplied token (PAT / API key)**, stored ciphertext-at-rest in the credential vault (extending the one-store/one-resolver model from the closed LLM-key catalog to an open per-(user×service) set). HyperIdle is a credential **consumer**, never an issuer; the user generates the token.
3. **The MCP server's own OAuth** (for a remote OAuth-protected server). The **service is the OAuth provider** (e.g. GitHub); the MCP client self-registers via Dynamic Client Registration / CIMD — **no static per-service OAuth app on HyperIdle's side**, and the token is held by the server/the user's flow, not issued by us.

**The agent never holds a stored Connection secret.** When a brokered call runs, the Kernel resolves the source, attaches the credential (sources 2/3) or routes through the user-environment tool (source 1), makes the call, and returns only the result.

### The hybrid path (direct vs brokered — the founder fork)

The **reversibility** classifier (AL7) decides the path:
- **Reversible / draft-space** (read a repo, open a branch, render a Figma preview, query a record) → **Direct**: the agent's harness may call the tool from the sandbox for speed. Worst case is undoable.
- **Irreversible / credentialed commit** (merge, deploy, refund, send) → **Brokered**: staged as an operative artifact (AL7), the credential stays server-side, and a human approve is the trigger that lets the Kernel execute it. The agent **cannot** make this call itself — it lacks the live credential (capability split).

This is exactly AL7 generalized to external tools: HyperIdle is the **broker + gate**; the Connector's MCP server is the **executor**.

### Tool grant (deploy-into-sandbox)

A session's sandbox gets **one localhost MCP endpoint** (the extended bridge) exposing: internal skill-tools + the session's permitted external tools (direct-eligible ones callable now; brokered ones presented as *stage-for-review* handles). **No credential, OAuth token, or live key is ever written into the sandbox** — not in env, not in `.mcp.json`. Per-session isolation: session A's grant never exposes session B's Connections.

---

## Phase 2 — Rejection list

1. **A Connector is NOT a HyperIdle-proprietary plugin/SDK.** It is a standard MCP server + a thin manifest. — *Reason: reinventing MCP raises the contribution bar and forfeits the existing ecosystem; ride the standard (boundary doc).*
2. **A Connection is NOT held by the agent, and NOT injected into the sandbox.** It is Kernel-resolved per brokered call. — *Reason: the capability split; a credential in the sandbox is a credential the agent (and any prompt-injection) can exfiltrate or fire ungated.*
3. **A Brokered call is NOT every external call.** Reversible work goes direct — gating the harmless-and-undoable is the approval fatigue AL7 explicitly rejects. — *Reason: reversibility, not credential-presence alone, decides the gate; reads are cheap and safe.*
4. **A Connection is NOT a new entry in the closed credential catalog.** The catalog stays closed for *infrastructure* secrets (LLM keys); Connections are an **open, user-driven** set. — *Reason: keep the infra-secret contract intact while letting users connect arbitrary services.*
5. **AN1 is NOT a tool-execution engine.** HyperIdle brokers and gates; the Connector's MCP server executes the side-effect. — *Reason: trigger-not-executor (boundary doc); we never reimplement a service's API.*
6. **Trust tier is NOT a per-call risk policy engine.** It is a coarse vetted/community provenance flag feeding the existing graduated-autonomy dial — not thresholds/allowlists. — *Reason: a policy engine is the enterprise product HyperIdle is not (AL7 rationale).*
7. **A Connection is NOT an OAuth app HyperIdle registered, and HyperIdle is NOT an OAuth provider.** We never put HyperIdle on a service's consent screen, never pass per-service publisher verification, never become "a verified company" to function. — *Reason: registering an OAuth app per service is the exact enterprise/distribution baggage we ride harnesses to avoid (t3code/Claude Code register none). Auth lives in the user's environment, a user-supplied token, or the MCP server's own OAuth — never issued by us. A hosted branded "Connect" button is a future, optional, multi-tenant product choice, never the floor.*

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Connector** | A standard MCP server + manifest exposing one service's tools to HyperIdle. | plugin, adapter, integration package, extension |
| **Connection** | A reference to a tool source the user has made available; auth resolves from the harness/env, a user-supplied token, or the MCP server's own OAuth — never an OAuth app HyperIdle registered. | account link, credential (bare — reserved for infra secrets), OAuth app, integration |
| **Brokered call** | An irreversible/credentialed external call routed through HyperIdle (Kernel attaches the credential). | proxied call, gated action |
| **Direct call** | A reversible external call the agent makes from the sandbox, ungated. | unsafe call, raw call |
| **Tool grant** | The localhost MCP endpoint a sandbox gets; internal + permitted external tools, no credentials. | tool injection, capability mount |
| **Trust tier** | `vetted` vs `community` provenance of a Connector. | trust level, security tier, permission level |

---

## Phase 4 — Contracts

- **Cardinality.** Connection → exactly 1 (user × service). A Connector → 0..N Connections (one per user who connects it). A session's Tool grant → the intersection of (the agent's role-permitted tools) × (the user's active Connections). A brokered call → exactly 1 Connection resolved at execution.
- **Closure.** Connectors are **OPEN** (any MCP server + manifest; resolved via the harness capability descriptor, mirroring the open artifact-kind vocab). Trust tier is **CLOSED** (`vetted | community`). The direct/brokered axis is **CLOSED** (derived from reversibility, AL7).
- **Credential containment (hard).** A Connection's secret is **resolved server-side only**, attached to a brokered call by the Kernel, and **never** present in the sandbox, env, `.mcp.json`, logs, or any agent-visible surface.
- **Gate inheritance (hard).** A brokered call is an AL7 staged operation — at-most-once, idempotent, failure-surfacing, human-gated where required. AN1 adds the credential attachment; it does not weaken the gate.
- **Direct safety (hard).** Only a tool classified reversible may be a direct call. A Connector's manifest declares per-tool reversibility; an unclassified/ambiguous tool defaults to **brokered** (fail safe).
- **Isolation (hard).** A session's Tool grant exposes only that session's user's Connections; no cross-session/cross-user credential or tool leakage.
- **Ride-the-standard (hard).** No HyperIdle-proprietary integration format — a Connector is a standard MCP server; the manifest carries only HyperIdle glue (auth, trust, ui://).
- **No-OAuth-provider (hard).** HyperIdle registers **no per-service OAuth app** and is **never** an OAuth provider/authorization server. Service auth resolves from (1) the user's harness/environment, (2) a user-supplied token HyperIdle stores as a consumer, or (3) the MCP server's own OAuth (service is the provider; client self-registers via DCR/CIMD). A hosted branded multi-tenant "Connect" flow, if ever built, is additive and optional — never required for the agent to use a tool.

---

## The workpackage split (founder: "split into more than one")

Four buildable WPs, all reading this concept + the boundary doc:

| WP | Scope | Depends |
|---|---|---|
| **AN1 — External Connections (ride harness/MCP auth + user tokens)** | The per-(user×service) Connection store + the *Connect a service* / manage-connections surface. Default source: the user's harness/environment + their MCP config (HyperIdle stores nothing). Fallback: a user-supplied token in the vault (resolver extended from the closed LLM-key catalog). **No OAuth app, no OAuth provider.** The foundation everything brokers against. | credential-model |
| **AN2 — Outbound tool brokering (hybrid)** | The outbound **MCP client**; resolve a Connector; surface its tools into the per-session bridge; classify direct vs brokered by reversibility; route brokered calls through the Kernel (credential attach) as AL7 staged ops. | AN1, AL7 |
| **AN3 — Sandbox tool provisioning** | The Tool grant: the localhost MCP endpoint exposing internal + permitted external tools to the sandbox; per-session isolation; **no secrets injected**. The "deploy into the sandbox" mechanics. | AN2 |
| **AN4 — Ecosystem integration registry** | The Connector manifest + two-tier (vetted/community) registry; discovery, validation, trust-tier consent; builds on AL5's `ui://` canvases so a contributed Connector can ship its review canvas. | AN2, AL5 |

Each gets its own `/concept` only if it reshapes a noun; otherwise this concept is its fixed input.

---

## Founder decisions (2026-06-23)

1. **Hybrid integration path** — irreversible/credentialed calls are brokered through HyperIdle (credential never in the sandbox, AL7 gate applies); reversible draft-space work goes direct for speed.
2. **Ride the MCP standard** — a contributed integration is a standard MCP server + a small manifest (auth, trust tier, optional `ui://` canvas). No proprietary plugin format.
3. **Split into four WPs** (AN1–AN4 above).
4. **Never an OAuth provider / no per-service OAuth apps (2026-06-23).** Auth rides the user's harness/environment, a user-supplied token, or the MCP server's own OAuth (service is the provider; client self-registers via DCR/CIMD). This is why we built on harnesses — the connectors and auth already exist there. Grounded in t3code (wraps the user's CLI logins, ships zero OAuth apps), Claude Code/OpenCode/"claws" (ride local CLIs + user-configured MCP), and the MCP auth spec (server owns upstream auth; client uses DCR/CIMD). The enterprise "verified company + branded Connect button" path is deliberately rejected as the floor; it can return later as an optional hosted-product add-on.

---

## Rationale

The honest assessment forced the shape: we have a strong *inbound* MCP story (the X2 bridge) and zero *outbound* story — no way for an agent to touch GitHub at all. The temptation is the easy path: inject the user's token into the sandbox and let the harness call GitHub's MCP server directly. AL7's capability split rules that out — a live credential in the sandbox is one prompt-injection away from an ungated, irreversible action. So the spine is forced: **HyperIdle holds the Connection and brokers the irreversible call; the agent gets a handle, not the keys.** Reversible reads stay direct so the gate doesn't become approval fatigue. And contribution rides MCP — the same "integrate the open standard, never reimplement" logic as the git boundary — so the long tail of tools is covered by whoever ships an MCP server, not by HyperIdle hand-building each one. These are expensive to change once a credential vault schema and a broker dispatch path exist — hence locking them before the four WPs' architecture.

---

## Phase 6 — Self-critique

- **Rejection list distinct?** Yes — six rejections name different traps (proprietary plugin, credential-in-sandbox, gate-everything, closed-catalog pollution, execution engine, policy engine), each with a reason.
- **Consistent with AL7 + boundary?** Yes — AN1 is AL7's capability split applied to external tools, and the boundary's "integrate the standard" applied to MCP. No noun contradicts a locked one.
- **Vocabulary collisions?** "Connection" risks colliding with DB/websocket "connection" — flagged; use the capitalized primitive in concept/arch prose, and qualify in code (`ServiceConnection`). "Credential" reserved for infra secrets; Connections are distinct.
- **Contracts complete?** Credential containment, gate inheritance, isolation, fail-safe-to-brokered all pinned; the open/closed axes stated.
- **Right files?** Concept here; ground truth on the broker/connection model lands during AN1/AN2 architecture (new `docs/agent-layer/tool-integration.md` + a credential-model extension note); the four WP specs register in `TRACK-AN.md` + manifest via `/work-planning`.

**Concept LOCKED.** The four WPs explore inside it.
