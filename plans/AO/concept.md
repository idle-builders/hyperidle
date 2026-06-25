# Concept — Track AO (Self-Hosting Build Loop): Product + Substrate

**Level:** Track concept (gating). Shared fixed input for **AO1** (substrate model) and **AO4** (product scope). AO2 consumes it; AO3 is parked behind AL7.

**Two load-bearing nouns, settled together:**
- **Substrate** — *new primitive.* The working files an agent's output lives in and accrues history on.
- **Product** — *reshaped concept.* The durable thing being built; the build scope. Represented **1:1 by a Team** (U1 invariant kept — founder decision, 2026-06-26).

---

## Required reading (downstream: `/architecture`, `/design`, `/pipeline`)

- `docs/architecture/system-boundary.md` — RIDE git / INTEGRATE infra / REPLACE collaboration; "code lives in a local git repo, forge-optional"; code is git-derived, never stored-of-record. **The substrate noun is grounded here.**
- `docs/process-layer/teams-persistent-product-bound.md` — Team is persistent and product-bound; team lifecycle (commit → active → kill). **Product=Team 1:1 lives here.**
- `docs/process-layer/substrate-primitive.md` — the Substrate ground-truth this pass writes.
- `docs/process-layer/canonical-shapes.md` — Substrate + Product canonical-shape entries this pass adds.
- `docs/process-layer/artifact-primitive.md` — Artifact (L3) is the *reviewable record*; substrate is the *files the record derives from*. Open `kind` vocabulary is the model the substrate `kind` mirrors.
- `docs/process-layer/staged-operation.md` — Proposed Call; landing a substrate change is the agent's own tool call routed to review (AO3/AL7), not a HyperIdle executor.
- Code seams (verified 2026-06-26): `packages/db/src/schema.ts` (teams 17-34, artifacts 848-865, knowledgeItems 580-602, scopeId 590), `packages/fabric/src/services/git-export-runner.ts` (no clone/fetch/checkout), `packages/fabric/src/services/git-export.ts` (`products/<scopeId>/<kind>.md`), `packages/server/src/services/session-provisioning.ts` (sandbox spawn), `packages/fabric/src/promotion-pipeline.ts:207` (factory-wide DISTINCT scopeId — the leak).

---

## Phase 0 — The nouns, classified against code reality

| Noun | Class | Code reality (2026-06-26, grep-verified) |
|---|---|---|
| **Substrate** | **New primitive** | Zero implementation. `artifacts` has no repoPath/filePath/commitSha (schema.ts:848-865). `GitRunner` is export-only — `init/add/commit/push`, **no clone/fetch/checkout** (git-export-runner.ts:18-41). Sandbox holds `context/ knowledge/ work/` only — no `src/`. `boundary-concept.md` code-substrate was prose with no code (retired). |
| **Product** | **Reshaped** | **`productId` no longer exists.** U1 migration renamed `products`→`teams`, `product_id`→`team_id`, establishing **1:1 Product=Team** (schema.ts:14-16). `teams` carries the product-shaped attributes (briefPath/architecturePath/brandPath/principlesPath). The track's "three disjoint live keys" is **stale**. |
| Team | Stable (input) | `teams` table = the durable product-bound record. Roster = `teamMembers`. Reused as-is; Product is its build-scope facet. |
| Unit of work (bet/task/session) | Stable (input) | `teamId`-scoped spine, N-team-capable at route/DB. Materializes the product's substrate (AO2). |
| Connection (Track AN) | Stable (input, not yet built) | No `connections` table today (AN unmerged). Supplies forge auth to a code substrate; composes, never merges. |

> **Stale-prose correction (verify against code, not docs).** The track and the deep review describe "three disjoint scope keys (teamId / productId / scopeId) to reconcile." In current code there is effectively **one** live key — `teamId`. `productId` was removed by U1; `scopeId` already equals `teamId` with `scopeKind="product"` (write-memory.ts; git-export.ts:149,176; context-assembly.ts:189). The reconciliation is largely **already done**; the residual is behavioral, not structural — see Phase 4.

**Human-design-review forecast (advisory).** Unchanged from `/work-planning`: **AO1 = Yes** (new bind/inspect substrate surface), **AO4 = Yes** (product context/switcher — load-bearing IA). AO2/AO3 = No. `/design`'s `DESIGN-CLASS` remains authoritative.

---

## Phase 1 — Essence

### Substrate

1. **Identity.** A Substrate is the **durable working files an agent's output lives in and accrues history on**, owned by a Product, of a `kind` — a git **code repository** for code work, a **document/knowledge set** for non-code work. It is a *container of working files with history*, not an event, not a snapshot.
2. **Essential properties.** Every substrate has: a `kind`; a **location** (for code: clone URL / local path + branch); ownership by exactly one **Product**; the capacity to **accrue history** (commits / revisions); a **reachability state**. It is distinct from `knowledge_items` and from the knowledge-export config.
3. **Rejection list.** See Phase 2.
4. **Composition.** A Substrate is **owned by a Product** (`Product 1 — 0..N Substrate`). For a code kind it **references** a forge **Connection** (Track AN) for auth — by reference, never embedding the credential. A **unit of work** under the product **materializes** one (or more) of its product's substrates into the session sandbox (AO2). The **Artifact** (L3) an agent produces is **derived from** the substrate, never the substrate itself.
5. **Lifecycle.** `bound` → `reachable` (materializable; can be checked out / opened) ⇄ `needs-attention` (unreachable / unauthenticated — surfaced, never silent). A code substrate's working tree is materialized per session, mutated by the agent, and **captured back** (committed/written) at session end. The substrate record is durable; the materialization is ephemeral.
6. **Authority.** The **Product owns** its substrate(s). The **founder binds** a substrate to a product. The **system materializes** it at provisioning and **applies auth** at checkout/push — the **agent never holds the forge credential**. The source of truth for code is the **git repo itself** (code is git-derived, never HyperIdle-stored-of-record — system-boundary hard rule 4).
7. **Vocabulary collision.** "Substrate" is used informally in `system-boundary.md` and the deep review — this pass **formalizes** that usage; no collision. Distinguish hard from **sandbox** (the ephemeral per-session dir where a substrate is materialized) and from **workspace** (retired term → sandbox).

### Product

1. **Identity.** A Product is the **durable thing being built** — the build **scope** that owns substrate, work, knowledge, connections, and cost. It is **the same record as a Team** (1:1); "Product" is its build-scope facet, "Team" its people-roster facet.
2. **Essential properties.** Durable (outlives any single bet); owns `0..N` substrates; scopes its bets/tasks/sessions/routines (`teamId`); scopes its knowledge (product-scoped promotion + context); scopes its connections and its cost budget; **isolated** from other products.
3. **Rejection list.** See Phase 2.
4. **Composition.** A Product **is** a Team (1:1). It **owns** substrates, **scopes** the unit-of-work spine, **scopes** knowledge and connections and a cost budget. A **Portfolio** aggregates many Products (read-only rollup); a Product never owns a Portfolio.
5. **Lifecycle.** `committed` (team forms, product begins) → `active` (successive bets pass through) → `killed` (deliberate founder decision; team dissolves, knowledge archived to the practice layer). Mirrors `teams-persistent-product-bound.md` §4.4 exactly.
6. **Authority.** The **founder** commits and kills a product. The **team** (humans + agents) operates within it. Source of truth = the `teams` row.
7. **Vocabulary collision.** "Product" already names the `teams` table's purpose throughout docs/code — consistent. Reject **"project"** (time-bound, ends). Distinguish from **Portfolio** (aggregate) and **Bet** (time-boxed unit of work under a product).

---

## Phase 2 — Rejection lists (what they are NOT, with reasons)

**A Substrate is NOT:**
- **a `knowledge_item`** — knowledge items are *derived, promoted, attention-scored* fabric entries; a substrate is the *raw working files* the agent edits/builds/tests. Different store, different lifecycle. *(Today non-code output is wrongly squeezed into `knowledge_items` — AO1 fixes exactly this.)*
- **the knowledge-export config/target** — `git-export` writes knowledge markdown to a single global repo; a substrate is per-product working files. Binding a substrate **must not overwrite** the export configuration (an explicit AO1 AC).
- **a Connection (Track AN)** — a Connection is *auth + tools*; a substrate is *files*. They are orthogonal axes that **compose** (a code substrate's forge auth comes from a Connection). No forge credential is stored on the substrate record.
- **the sandbox** — the sandbox is the *ephemeral, per-session, isolated directory* where a substrate is *materialized* (AO2). The substrate is durable; the sandbox is thrown away.
- **HyperIdle's store-of-record for code** — code is **git-derived**; the Artifact is derived from the repo, never our canonical store (system-boundary hard rule 4).

**A Product is NOT:**
- **a "project"** — projects are time-bound and *end*; a product is **durable**. (Founder's explicit rejection — the whole reason the noun is "product.")
- **a Bet** — a bet is a *time-boxed unit of work under* a product; many bets pass through one product over its life.
- **a Portfolio** — a portfolio *aggregates* many products; a product is *one* durable thing.
- **a separate entity from Team** — Product **is** Team, 1:1 (U1 invariant, founder-confirmed 2026-06-26). We **reject** lifting a people-roster above product (the N:1 "one team builds many products" model was considered and **not chosen**): an agent belongs to exactly one team; cross-product help is **temporary borrow** (§8.5), not shared membership.
- **a substrate** — a product *owns* substrate(s); it is not itself the files. A product with no substrate bound is still a valid product (doc/ops-only work).

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Substrate** | Durable working files an agent's output lives in and accrues history on, owned by a Product, of a `kind`. | workspace (= sandbox), repo (one *kind*), working directory, codebase (code-only), project files |
| **Substrate kind** | The class of a substrate's files. Initial committed set: `code` (git repo), `doc_set` (document/knowledge set). **Open** vocabulary. | substrate type, repo type |
| **Product** | The durable thing being built; the build scope (substrate + work + knowledge + connections + cost). **= Team, 1:1.** | project (rejected — time-bound), workspace, app/app-instance, tenant |
| **Sandbox** | The ephemeral, per-session, isolated directory where a substrate is *materialized* (AO2). | workspace, container, env |
| **Materialize** | Place a product's bound substrate into a session sandbox (e.g. checkout a repo at its branch). | mount, sync, hydrate |
| **Land** | Make an approved substrate change real via the connected target (push/PR/merge/publish) — the *agent's own* tool call routed through review (AO3/AL7). | deploy (one kind), commit (capture ≠ land), execute |

---

## Phase 4 — Contracts

### Substrate
- **Cardinality.** `Product 1 — 0..N Substrate`. A substrate belongs to **exactly one** product. A unit of work materializes one or more of **its product's** substrates (defaults to the product's primary). *Binding level is the **Product** (durable), not the unit of work — settled here per the AO1 open question.*
- **Closure.** Substrate `kind` vocabulary is **OPEN** (mirrors the Artifact-kind model): new kinds added without editing core. Initial committed kinds: `code` + at least one non-code (`doc_set`) — the primitive must not be code-only (AO1 AC).
- **Mutability.** The binding (`kind`, `location`, `branch`) is set at bind and updatable; the **materialized working tree** is mutated by the agent and captured back; **forge auth is never stored on the record** and never enters the sandbox.
- **Identity.** Opaque substrate id. For `code`, the natural address is `(location + branch)`.
- **Hard rules.**
  1. Substrate ⟂ Connection — they **compose, never merge**. No forge credential on the substrate record or in the sandbox; the **system** applies auth at checkout/push.
  2. **Local-first** — a substrate functions with **no forge** (a plain local git repo; a solo founder needs no GitHub).
  3. A substrate is **not** a knowledge item and **not** the knowledge-export target — binding one must not overwrite the export config or a knowledge item.
  4. An unreachable/unauthenticated substrate surfaces as **needs-attention**, never a silent failure.
  5. Materialization is driven by the **unit-of-work → product** binding, never a global path. A substrate-less unit of work degrades to today's behavior (provisions, runs, no working tree).
  6. **Forward-only** migration.

### Product
- **Cardinality.** **Product = Team, 1:1.** One `teams` row **is** one product. A product owns `0..N` substrates, `N` bets/tasks/sessions/routines, product-scoped knowledge, `0..N` connections, **one** cost budget.
- **Closure.** **One** load-bearing product identifier = **`teams.id`**. The legacy `productId` (removed by U1) and `scopeId` (== `teamId`, `scopeKind="product"`) reconcile onto it. **No new fourth key.**
- **Mutability.** Product attributes (brief/architecture/brand/principles) are mutable; the **identity is durable**; a product is killed only by a deliberate founder decision.
- **Identity.** `teams.id`.
- **Hard rules.**
  1. Promotion and knowledge context are **product(team)-scoped** — no cross-product validation or injection. *(Fixes the factory-wide `DISTINCT scopeId` leak at promotion-pipeline.ts:207.)*
  2. **Per-product isolation** of substrate, connections, and cost — one product's spend/credentials/files are never another's.
  3. **Back-compat single-product default** — a fresh instance is one team = one product; existing single-product behavior is unchanged.
  4. **Product = Team 1:1 stays** — do **not** re-split into an N:1 roster-above-product model. Multi-product = multi-team.
  5. **Forward-only** migration.

---

## Phase 6 — Self-critique (1 round)

- **Rejection lists distinct?** Yes — Substrate's five rejections are five different stores/axes (knowledge item, export target, Connection, sandbox, store-of-record). Product's are five different scopes (project, bet, portfolio, team-split, substrate).
- **Vocabulary collisions?** `grep` confirms "substrate" appears only as the informal concept I'm formalizing; "product" is consistent with the `teams` purpose. No new clash.
- **Contracts complete?** Cardinality / closure / mutability / identity / hard rules covered for both. The one previously-open question (substrate **binding level** — product vs unit of work) is now **settled at Product** with the unit of work selecting from its product's substrates.
- **Rationale concrete?** Yes — cites U1's 1:1 collapse, the founder's 2026-06-26 decision, the promotion-pipeline:207 leak, and the system-boundary hard rules.
- **Right files touched?** This pass writes `plans/AO/concept.md`, creates `docs/process-layer/substrate-primitive.md`, adds canonical-shape entries, and annotates `teams-persistent-product-bound.md` with the Product=Team build-scope framing.

**Concept LOCKED.**

---

## Rationale (why this shape)

Two forces drove it. **First**, the founder's "build for the fast, not the enterprise" + the realization that **U1 already collapsed Product into Team (1:1)** — so the track's premise of "three disjoint live scope keys to reconcile" was stale (productId gone, scopeId == teamId). Re-splitting into an N:1 "one roster builds many products" model was a real option (cleaner for agencies / solo-founder-many-apps) but was **not chosen**: it re-opens a shipped invariant and re-threads `productId` through the entire spine for a flexibility a small flat team can get from multi-team + borrow. **Multi-product = multi-team** keeps the migration small and the mental model clean. **Second**, the substrate is the *structural keystone* — without a durable home for an agent's output (code least of all), agents stay doc-only. Generalizing it across kinds (git repo for code; doc set for marketing/writing) is what lets one HyperIdle instance build *similar-stack apps* and serve non-engineering work with one model. The substrate ⟂ Connection split (files vs auth) and the no-credential-in-sandbox rule come straight from `system-boundary.md` and the staged-operation trust model — we trust the agent, but auth lives on the connection axis, not smeared onto the files.
