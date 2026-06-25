# Concept — Track AO (Self-Hosting Build Loop): Substrate

**Level:** Track concept (gating). Fixed input for **AO1** (substrate model + bind surface). AO2 consumes it (materialization); AO3 is parked behind AL7; AO4 (multi-instance scope) is **deferred** — for now the build scope is simply the **Team** (see "Scope" below).

**One load-bearing noun:** **Substrate** — *new primitive.* The working files an agent's output lives in and accrues history on, **attached to an agent within a team**, of a `kind` (a git **code repository** for code work, a **document/knowledge set** for non-code work).

> **Scope = Team. "Product" is not modelled (for now).** An earlier draft introduced a Product noun and a Product↔Team coupling; the founder has set that aside — we speak only of **Team**. Multi-instance / per-product isolation (AO4) is deferred. Everything below scopes to the Team and, more precisely, to an **agent within a team**.

---

## Required reading (downstream: `/architecture`, `/design`, `/pipeline`)

- `docs/architecture/system-boundary.md` — RIDE git / INTEGRATE infra / REPLACE collaboration; "code lives in a local git repo, forge-optional"; code is git-derived, never stored-of-record. **The substrate noun is grounded here.**
- `docs/process-layer/substrate-primitive.md` — the Substrate ground-truth this pass writes.
- `docs/process-layer/canonical-shapes.md` — the Substrate canonical-shape entry this pass adds.
- `docs/process-layer/staged-operation.md` — the trust model: **agents hold their own credentials in the sandbox**; the review gate is a collaboration checkpoint on irreversible landing, never a credential boundary. **Read this for how agents work *with* access.**
- `docs/process-layer/teams-persistent-product-bound.md` — Team is persistent; an agent belongs to exactly one team; lifecycle (commit → active → kill).
- `docs/process-layer/artifact-primitive.md` — Artifact (L3) is the *reviewable record*; substrate is the *files the record derives from*. Open `kind` vocabulary is the model the substrate `kind` mirrors.
- Code seams (verified 2026-06-26): `packages/db/src/schema.ts` (teams 17-34, teamMembers ~102, users ~47, artifacts 848-865, knowledgeItems 580-602, scopeId 590), `packages/fabric/src/services/git-export-runner.ts` (export-only — no clone/fetch/checkout), `packages/server/src/services/session-provisioning.ts` (sandbox spawn + context write), `packages/fabric/src/promotion-pipeline.ts:207` (factory-wide leak — a Team-isolation item, deferred with AO4).

---

## Phase 0 — The noun, classified against code reality

| Noun | Class | Code reality (2026-06-26, grep-verified) |
|---|---|---|
| **Substrate** | **New primitive** | Zero implementation. `artifacts` has no repoPath/filePath/commitSha (schema.ts:848-865). `GitRunner` is export-only — `init/add/commit/push`, **no clone/fetch/checkout** (git-export-runner.ts:18-41). Sandbox holds `context/ knowledge/ work/` only — no `src/`. |
| Team | Stable (input) | `teams` table — the durable scope. An agent belongs to exactly one team (`teamMembers`, U1). The build scope for AO. |
| Agent-within-a-team | Stable (input) | An agent's membership in a team (`teamMembers`; `users.teamId`). **The primary thing a substrate attaches to.** |
| Unit of work (bet/task/session) | Stable (input) | `teamId`-scoped spine. A session run by an agent materializes that agent's attached substrate (AO2). |
| Connection (Track AN) | Stable (input, not yet built) | Holds durable auth/tools; provisioned **into** the sandbox each spawn (durable-auth→disposable-sandbox, PR #364). Supplies forge auth to a code substrate. Composes with substrate. |

**Human-design-review forecast (advisory).** **AO1 = Yes** (new attach/inspect substrate surface). `/design`'s `DESIGN-CLASS` remains authoritative.

---

## Phase 1 — Essence (Substrate)

1. **Identity.** A Substrate is the **durable working files an agent's output lives in and accrues history on**, attached to an **agent within a team**, of a `kind` — a git **code repository** for code, a **document/knowledge set** for non-code. It is a *container of working files with history*, not an event, not a snapshot.
2. **Essential properties.** Every substrate has: a `kind`; a **location** (for code: clone URL / local path + branch); an **attachment** to an agent-within-a-team (team-scoped); the capacity to **accrue history** (commits / revisions); a **reachability state**. It is distinct from `knowledge_items` and from the knowledge-export config.
3. **Rejection list.** See Phase 2.
4. **Composition.** A Substrate is **attached to an agent within a team** (primary), under that **Team** as scope (`agent-in-team 1 — 0..N Substrate`; a team may share one at team level). For a code kind it **references** a forge **Connection** (Track AN) for auth — by reference; the Connection's auth is provisioned **into** the sandbox so the agent's own tools work. A **session** the agent runs **materializes** its attached substrate(s) into the sandbox (AO2). The **Artifact** (L3) the agent produces is **derived from** the substrate, never the substrate itself.
5. **Lifecycle.** `attached` → `reachable` (materializable; can be checked out / opened) ⇄ `needs-attention` (unreachable / unauthenticated — surfaced, never silent). A code substrate's working tree is materialized per session, **mutated by the agent**, and **captured back** (committed/written) at session end. The substrate record is durable; the materialization is ephemeral.
6. **Authority.** The **agent (within its team)** owns and works its substrate(s). The **founder attaches** a substrate to an agent/team (and sees its kind/location/state). The **system materializes** it at provisioning **and provisions the Connection's auth into the sandbox** — the agent uses its **own** credentials and tools (git/gh) to fetch/push, exactly like a real employee. For code, the **git repo itself** is the source of truth (code is git-derived, never HyperIdle-stored-of-record — system-boundary hard rule 4).
7. **Vocabulary collision.** "Substrate" is used informally in `system-boundary.md` and the deep review — this pass **formalizes** it; no collision. Distinguish hard from **sandbox** (the ephemeral per-session dir where a substrate is materialized) and from **workspace** (retired term → sandbox).

---

## Phase 2 — Rejection list (what a Substrate is NOT, with reasons)

- **Not a `knowledge_item`** — knowledge items are *derived, promoted, attention-scored* fabric entries; a substrate is the *raw working files* the agent edits/builds/tests. Different store, different lifecycle. *(Today non-code output is wrongly squeezed into `knowledge_items` — AO1 fixes exactly this.)*
- **Not the knowledge-export config/target** — `git-export` writes knowledge markdown to a single global repo; a substrate is the agent's working files. Attaching a substrate **must not overwrite** the export configuration (an AO1 AC).
- **Not a Connection (Track AN)** — a Connection is *auth + tools*; a substrate is *files*. Orthogonal axes that **compose**: the Connection supplies the forge auth that is provisioned **into the sandbox** alongside the materialized substrate. They are distinct records; the substrate references the Connection, it does not embed or replace it.
- **Not the sandbox** — the sandbox is the *ephemeral, per-session, isolated directory* where a substrate is *materialized* (AO2). The substrate is durable; the sandbox is thrown away each session.
- **Not HyperIdle's store-of-record for code** — code is **git-derived**; the Artifact is derived from the repo, never our canonical store (system-boundary hard rule 4).

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Substrate** | Durable working files an agent's output lives in and accrues history on, attached to an agent-within-a-team, of a `kind`. | workspace (= sandbox), repo (one *kind*), working directory, codebase (code-only), project files |
| **Substrate kind** | The class of a substrate's files. Initial committed set: `code` (git repo), `doc_set` (document/knowledge set). **Open** vocabulary. | substrate type, repo type |
| **Sandbox** | The ephemeral, per-session, isolated directory where a substrate is *materialized* and the agent's inherited Connections/tools/creds are provisioned (AO2). | workspace, container, env |
| **Materialize** | Place an agent's attached substrate into a session sandbox (e.g. checkout a repo at its branch). | mount, sync, hydrate |
| **Land** | Make an approved substrate change real via the connected target (push/PR/merge/publish) — the *agent's own* tool call, using its own creds, routed through review (AO3/AL7). | deploy (one kind), commit (capture ≠ land), execute |

---

## Phase 4 — Contracts

- **Cardinality.** `agent-in-team 1 — 0..N Substrate` (primary). A substrate is attached to **one** agent-within-a-team, or shared at the **Team** level; either way it is **team-scoped**. A session run by that agent materializes its attached substrate(s) (defaults to its primary).
- **Closure.** Substrate `kind` vocabulary is **OPEN** (mirrors the Artifact-kind model): new kinds added without editing core. Initial committed kinds: `code` + at least one non-code (`doc_set`) — the primitive must not be code-only (AO1 AC).
- **Mutability.** The attachment (`kind`, `location`, `branch`) is set at attach and updatable; the **materialized working tree** is mutated by the agent and captured back.
- **Identity.** Opaque substrate id. For `code`, the natural address is `(location + branch)`.
- **Hard rules.**
  1. **Agents work *with* their credentials.** The sandbox is provisioned with the agent's inherited Connections/tools/creds (durable-auth→disposable-sandbox, PR #364); for a code substrate the forge auth from the bound Connection is present so the agent's own git/gh tools fetch/push/PR. We do **not** withhold credentials, do **not** build a broker-only path, do **not** design against a rogue agent. The review gate (AL7) is a **collaboration checkpoint on irreversible landing** that fades as trust grows — never a credential boundary.
  2. Substrate ⟂ Connection — distinct axes (files vs auth/tools) that **compose**, never merge. The substrate references the Connection; the Connection supplies the auth.
  3. **Local-first** — a substrate functions with **no forge** (a plain local git repo; a solo founder needs no GitHub).
  4. A substrate is **not** a knowledge item and **not** the knowledge-export target — attaching one must not overwrite the export config or a knowledge item.
  5. An unreachable/unauthenticated substrate surfaces as **needs-attention**, never a silent failure.
  6. Materialization is driven by the **agent's attachment**, never a global path. A substrate-less session degrades to today's behavior (provisions, runs, no working tree).
  7. **Forward-only** migration.

---

## Phase 6 — Self-critique (1 round)

- **Rejection list distinct?** Yes — five different stores/axes (knowledge item, export target, Connection, sandbox, store-of-record).
- **Vocabulary collisions?** "substrate" only appears as the informal concept being formalized; no clash. "Product" removed per founder.
- **Contracts complete?** Cardinality / closure / mutability / identity / hard rules covered. Binding level settled at **agent-within-a-team** (founder, 2026-06-26).
- **Credential model correct?** Yes — corrected: **creds are present in the sandbox**; the agent uses its own tools/auth. The earlier "no cred in sandbox" line was reverted-broker garbage and is removed.
- **Right files touched?** This pass writes `plans/AO/concept.md`, creates `docs/process-layer/substrate-primitive.md`, adds the canonical-shape entry, and links it from the index. No Product modelling; the teams doc is left as-is.

**Concept LOCKED.**

---

## Rationale (why this shape)

The substrate is the *structural keystone* of Track AO: without a durable home for an agent's output (code least of all — the sandbox has no `src/`), agents stay doc-only. We attach it to an **agent within a team** because that is where work actually happens — a specific builder agent operates a specific repo; a marketing agent operates a document set. Generalizing `kind` beyond `code` (git repo → doc set) is what lets one HyperIdle instance build *similar-stack apps* and serve non-engineering work with one primitive. The substrate (files) and Connection (auth/tools) stay **distinct axes that compose** — but, critically, **the agent has its credentials in the sandbox and works with them**, like a real employee (ETHOS §4; the no-credential / broker-only model was reverted in PR #364). The review gate governs *irreversible landing* as a collaboration checkpoint, not by starving the agent of access. **Product** is deliberately not modelled yet — the scope is the **Team**; multi-instance isolation (AO4) is deferred until the substrate keystone exists.
