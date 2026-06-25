# Track AO: Self-Hosting Build Loop

The genuinely-missing work to let a flat team of humans + AI agents build real software — HyperIdle itself and other similar-stack apps — **on** HyperIdle. Source: the deep review of 2026-06-25 (`.pipeline/audits/product/DEEP-REVIEW-2026-06-25.md`) — 11 read-only lanes across the full prod code + 205 docs + live app, then 3 reviewer agents.

**Corrected scope (founder review, 2026-06-25).** Two deep-review items were *not* genuine WPs and have been removed:
- **Thinking backend / onboarding is already built.** `SetupFlow.tsx` asks for and writes the model key (AH1 §5), AM4 shipped harness detection/config (`SettingsHarnesses.tsx`), AN shipped external connections. The deep review's "credentials absent / SetupFlow never asks" was an artifact of testing an *un-onboarded* dev DB, not a missing capability.
- **Boot-migration crash is a bugfix, not a WP** — fix it directly, don't track it here.
- The live "decomposition `blocked/0 tasks`" is downstream of the un-onboarded DB — a *verify-once-onboarded* item, not net-new WP scope.

**What's actually missing (this track):** the build-loop middle — a substrate for an agent's output (code or otherwise), its materialization into the session sandbox so agents do real work, the output→review→land wiring (pending AL7), and **product** as a first-class scope so one instance can build several things.

**Gating concept — `/concept AO` (product + substrate, entangled).** Two load-bearing nouns must be settled together before AO1/AO4 are architected:
- **Product** = the durable thing being built (distinct from the **team**, the people). ("Project" is rejected — projects are time-bound and end; a product is durable.) **The product↔team coupling is an open exploration for `/concept AO`** — 1:1, a team building many products, or a product spanning teams are all on the table; the concept pass decides. Knowledge already half-references a `productId`; git-export a `scopeId`; work a `teamId` — three disjoint keys to reconcile onto **product** as the build scope.
- **Substrate** = the working files an agent's output lives in and accrues history on. A **git repository is one kind** (for code); generalized to other kinds (a document/knowledge set for non-code work — a marketing agent's Obsidian/GDrive-style files). A product owns its substrate(s). Connectors (tools/MCP — Track AN) and substrate (files) are the two axes; they compose.

**Adjacent, not owned here (deps/cross-track):** AL7 = review→act execution loop (built, **unmerged**; AO3 is gated on it and may be largely subsumed by it — see AO3). AN2/AN3 = outbound MCP client + broker (Track AN; required for apps that touch external services + forge-based landing). Strategy **dynamic skill/tool injection** (agents get only `systemPrompt` + role-filtered tools; `AgentScaffoldSpec` has no skills field) = a real **major** extensibility gap belonging to the AK/Strategy family.

**Scope rules.** The build-loop middle only: substrate, its materialization, output→review→land wiring, and product scope. Out of frame: onboarding/credentials (AH1/AM4/AN — done), the review experience/surface (Track AL), the AL7 execution loop (dep), outbound connectivity (Track AN), dynamic skill injection (AK). `npm run verify` must pass after each WP merges.

**Reference:** `.pipeline/audits/product/DEEP-REVIEW-2026-06-25.md`, `plans/AN/boundary-concept.md`. Code seams: `packages/server/src/services/session-provisioning.ts`, `packages/fabric/src/context-assembly.ts`, `packages/server/src/routes/{reviews,artifacts}.ts`, `packages/fabric/src/services/{git-export,promotion-pipeline}.ts`.

---

### AO1 — A product's output substrate: where an agent's work lives

**Workpackage.** As an agent doing real work, I want a substrate — the files my work lives in and accrues history on, owned by the product I'm building — generalized across kinds (a git **code repository** for a coding task; a document/knowledge set for a writing or marketing task), so that my output has a real home instead of evaporating or being forced into a knowledge-item shape. Today there is no such substrate: code has no home at all, and non-code outputs are squeezed into `knowledge_items`.

**Why this matters.** This is the structural keystone of the whole track: without a substrate an agent can research and plan but cannot produce durable, reviewable output — code least of all (the sandbox has no `src/`). Generalizing beyond code is what lets HyperIdle build *similar-stack apps* and serve non-engineering work with one model. Cost of not building it: agents stay doc-only; "build software here" is impossible.

**What exists today.** `knowledge_items` is the only durable output store; `artifacts` exist but carry **no substrate columns** (no repoPath/filePath/commitSha — verified) and `artifacts.cost` is always NULL. `git-export` writes knowledge markdown to a single global repo; it is not a per-work code working tree. The "code substrate" of `plans/AN/boundary-concept.md` has **zero implementation**.

**What's genuinely missing.** A substrate record that binds a product (and the unit of work under it) to the working files it operates on — for code, a git repository (clone URL/local path + branch, forge optional via an AN Connection); generalized so other output kinds are substrate kinds too — distinct from `knowledge_items` and from the global knowledge-export config.

**Depends on.** None to build the model. (Its binding level — product vs unit of work — is settled by `/concept AO`; live-proof an agent works *in* it comes with AO2.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — /concept AO (shared with AO4): generalize the locked Code-substrate noun (boundary-concept.md) into a Substrate primitive across output kinds; settle kinds, relation to knowledge_items/artifacts, and the product/unit-of-work binding + cardinality.`
- **Design:** `Required — a surface to bind/inspect/select a product's substrate (a repo, a doc set); /design multi-variant + human review.`

**Human design review.** Yes — introduces a new user-facing way to bind a substrate to a product/work; its shape and placement are what's being decided.

**Acceptance criteria.**
- A product (and the work under it) can be bound to a substrate, and afterward that binding (its kind, location, state) is visible.
- A code substrate records its repository (location + branch) and, optionally, a forge whose auth comes from an existing Connection rather than re-modeled here.
- The substrate model accommodates at least one non-code kind (e.g. a document/knowledge set), so the primitive is not code-only.
- A substrate binding is distinct from, and does not overwrite, the instance knowledge-export configuration or a knowledge item.
- An unreachable/unauthenticated substrate surfaces as needing attention rather than failing silently.

**Validation scenarios.**
- Given a product, when a founder binds a code repository as its substrate, then the repo + branch + state are shown.
- Given a non-code unit of work, when a substrate is bound, then a non-code substrate kind is recorded (proving generality).
- Given a substrate whose forge Connection is missing, when it is viewed, then it is shown as needing attention.

**Plan calls.** `/concept AO` (product + substrate, shared with AO4). Then `/design` the bind/select surface (novel → human review). Standard `/architecture` modelling the substrate record + binding, forge auth via the AN Connection seam.

**Contracts / constraints.** Substrate (files) and Connection (auth/tools) are distinct and compose; no forge credential is stored on the substrate record or exposed to agents. Local-first: a substrate functions with no forge. The substrate is not a knowledge item and not the knowledge-export target. Forward-only migration.

**Out of scope.** Materializing the substrate into a sandbox (AO2). Review/land (AO3). Product scope itself (AO4). The forge auth mechanism (Track AN).

**Effort.** L (~5d)

---

### AO2 — Materialize the substrate into the session sandbox

**Workpackage.** As the system running a session, I want the unit of work's bound substrate placed into that session's sandbox — for code, the repository checked out at its branch — so that the harness can read, edit, build, and test real working files instead of an empty directory. The sandbox is already isolated per session, so this is a plain checkout into it, plus the tools to act on it.

**Why this matters.** This is where an agent stops being a planner and becomes a builder. Today even with Claude Code detected (`fileEditing: true`), the sandbox holds only knowledge files — so an agent cannot produce a code change. With the substrate materialized, the build step becomes real for code and for file-based work generally. Cost of not building it: the build loop has no execute stage.

**What exists today.** Session provisioning spawns a unique per-session sandbox (`spawn()` = `mkdir`; isolated leaf), then writes knowledge/context + `AGENTS.md`/`CLAUDE.md`. The harness runs with `cwd: sandboxPath`. `GitRunner` exists but is **export-only** — `init/add/commit/push`, no `clone`/`fetch`/`checkout`. No step places working files into the sandbox.

**What's genuinely missing.** A provisioning step that materializes the bound substrate (AO1) into the session sandbox at its branch before the harness runs; inbound-git capability (clone/checkout) the runner lacks; a tool surface for the agent to act on the files (edit/build/test/commit); and a writeback path that captures the result.

**Depends on.** AO1 — there must be a bound substrate to materialize.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — consumes the AO1 Substrate noun and the existing Session/Sandbox primitives.`
- **Design:** `Not required — sandbox/runtime provisioning; no rendered surface.`

**Human design review.** No — backend provisioning mechanism.

**Acceptance criteria.**
- When a session starts for a unit of work with a code substrate, the sandbox contains that repository's working tree at its branch, and the agent can read, edit, and run its build/test commands.
- The agent's changes to the working tree are captured (committed/written back) rather than lost when the sandbox is destroyed.
- A session for a unit of work with no substrate still provisions and runs (no working tree), rather than failing.
- No repository or forge credential is present in the sandbox environment or files.

**Validation scenarios.**
- Given a unit of work with a code substrate, when a session starts, then the sandbox holds the repo at its branch and the agent edits a file and runs the project's test command against it.
- Given the agent made changes, when the session ends, then those changes are captured (not lost).
- Given a substrate-less unit of work, when a session starts, then it provisions with no working tree and internal tools still work.
- Given any running session, when the sandbox is inspected, then no repo/forge secret is present.

**Plan calls.** Skip `/design`. Standard `/architecture` for the materialization step (checkout into the isolated sandbox — no shared worktrees), inbound-git capability, the agent's file/build/git tool surface, and writeback. **Live-proof:** a real session checks out a real repo, the agent edits + runs tests, and the change is captured — before `done`.

**Contracts / constraints.** Plain checkout into the already-isolated per-session sandbox. No repo/forge secret enters the sandbox; auth is applied by the system at checkout/push, never handed to the agent. A substrate-less session degrades to today's behavior. Materialization is driven by the unit-of-work binding (AO1), never a global path.

**Out of scope.** Turning captured output into review/landing (AO3). Product scope (AO4). The substrate binding (AO1). Harness selection (Track AM).

**Effort.** L (~5d)

---

### AO3 — Agent output becomes reviewable and landable — NEEDS RESEARCH (post-AL7)

**Status: NEEDS RESEARCH + CONCEPT, gated on AL7.** Do not architect or build until AL7 has shipped (merged to main) and `/concept AO3` has re-checked whether a genuine gap remains. This WP records a *problem*, not yet a committed solution.

**Problem identified (deep review, 2026-06-25).** The build loop's final stages — an agent's output becoming a real review a human can act on, and approval **landing** the change — do not work on real output today: `GET /api/reviews/:id` is a hardcoded fixture (reviews.ts:4-61), there is no reviews table or POST, only a *knowledge*-review factory exists (no task/artifact/bet), and **AL7 (the approve→execute loop) is unmerged**. So even a correct verdict lands nothing. Note: the review *experience* itself — threads, verdicts (founder-verdict, self-verdict block, first-verdict-wins), proof-family canvases — **is** real (threads.ts); the founder constraint holds that we review **outputs/results, not code diffs**.

**Why it is parked.** AL7 is built (on `concept/AL7-review-execution-loop`) and is the staged-operation execute-on-approve seam. It very likely supplies most or all of "generate a review subject from work → verdict → execute on approve." Speccing a solution now would almost certainly duplicate or contradict AL7. The honest move is to let AL7 land, then re-measure.

**What `/concept AO3` must re-check after AL7 ships.**
- Does AL7 already generate review subjects from *agent output across kinds* (task/artifact/code), or only from the cases it shipped? If general, this WP closes with no new scope.
- Does AL7's execute-on-approve cover **landing a substrate change** (push/PR/merge/publish via the connected target), or is a substrate-specific landing step still missing?
- Is the fixture `GET /api/reviews` replaced by real generation as part of AL7, or still outstanding?
- Only the residual that AL7 does **not** cover becomes the (re-scoped) AO3 WP — or this WP is closed as subsumed.

**Depends on.** AL7 (must be merged before this is even researched). AO2 (there must be real captured output to review/land).

**Complexity.** Unknown until researched (placeholder L).

**Pre-build gates.**
- **Concept:** `Required — /concept AO3 AFTER AL7 merges: re-check whether any gap remains beyond AL7; if none, close this WP.`
- **Design:** `Deferred — decided in /concept AO3; outputs render through existing proof-family canvases regardless, so likely Light or none.`

**Human design review.** No (expected) — reuses the existing review experience; reassess in `/concept AO3`.

**Acceptance criteria.** *Deferred to `/concept AO3`* — the problem to keep in view: an agent's real output (code or otherwise) generates a real review subject (not a fixture) rendered through the existing canvases, and approval lands the change performed by the system (never the agent), inheriting AL7's at-most-once/outcome semantics. Whether any of this remains unmet after AL7 is exactly what the concept pass determines.

**Validation scenarios.** *Deferred to `/concept AO3`.*

**Plan calls.** No `/architecture` yet. After AL7 merges, run `/concept AO3` to determine if a residual gap exists; only then scope and size the real WP (or close it).

**Contracts / constraints.** We review **outputs/results, not raw diffs** — render through the existing proof-family canvases. The agent never executes the landing; the system triggers the connected target. No duplication of AL7 — this WP only addresses what AL7 demonstrably does not.

**Out of scope.** The review experience/surface (Track AL). The AL7 loop itself (dep). Materializing the substrate (AO2).

**Effort.** TBD — re-size in `/concept AO3` after AL7.

---

### AO4 — Product as a first-class scope (multi-product)

**Workpackage.** As a founder running HyperIdle and a couple of other apps on one instance, I want a **product** to be a first-class scope — the durable thing being built — that isolates each product's substrate, work, knowledge, connections, and cost, so that building one product can't leak into or collide with another. Today there is no such scope: work scopes by `teamId`, knowledge by a separate `productId` (never wired), git-export by `scopeId`, and connections by `userId`; knowledge promotion leaks across teams.

**Founder framing (2026-06-25) — kept deliberately loose.** "Project" is rejected — projects are time-bound and end. The scope is **product**: durable, the thing being built. **How a product couples to a team is an open question to explore in `/concept AO`, not a decision to pre-resolve here** — it may be 1:1, a team may build several products, or a product may span teams; the right coupling is exactly what the concept pass must work out (alongside reconciling the three disjoint scope keys onto product). Treat the cardinality below as illustrative, not fixed.

**Why this matters.** This is the entire "AND a set of other apps" half of the core task. Today concurrent products contaminate each other: promotion auto-validates one team's principles for all (promotion-pipeline.ts:207, no team filter), and there is no per-product budget, credential, repo, or UI context — so a team must run a separate instance per product. Cost of not building it: multi-product is a trap that appears to work until two builds interfere.

**What exists today.** The bet→task→session spine is `teamId`-scoped and N-team-capable at the route/DB level — a real foundation. But `teams` has no owner FK or substrate binding; the three scope keys (`teamId`/`productId`/`scopeId`) are disjoint and unreconciled; promotion counts `DISTINCT scopeId` factory-wide; connections are `userId`-only; cost caps are per-agent/factory; the AppShell has no product context or picker and every call hits global `/api/teams`. (Vestigial "Nimmly" demo data persists in pre-AF17 *local* DBs only; source is guarded clean.)

**What's genuinely missing.** A first-class **product** scope threaded through substrate, work, knowledge (product-scoped promotion + wired context filtering), connections, cost, and the UI shell (a product picker / namespaced calls) — reconciling the three disjoint scope keys onto product, and defining product↔team (not 1:1).

**Depends on.** AO1 — a product owns its substrate; the substrate model must exist to isolate it per product.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — /concept AO (shared with AO1): define the Product scope (durable, not the time-bound 'project') and EXPLORE which product↔team coupling we actually need (1:1? a team builds many products? a product spans teams?) — this is an open exploration, not a settled cardinality. Reconcile teamId / productId / git-export scopeId onto product.`
- **Design:** `Required — a product context/switcher in the app shell and per-product surfaces; /design multi-variant + human review.`

**Human design review.** Yes — introduces a top-level product context/switcher in the shell; a load-bearing IA change.

**Acceptance criteria.**
- An instance can host multiple products, each with its own substrate, work, knowledge scope, connections, and cost budget, and a founder can tell which product they are operating in and switch.
- Knowledge promotion and context for one product do not validate or inject into another's (no cross-product leak).
- A connection and a cost budget can be scoped to a product, so one product's spend or credentials are not another's.
- Concurrent work across two products operates on disjoint substrates/sandboxes and neither can read the other's.
- The product↔team coupling decided in `/concept AO` is implemented and made explicit (whatever cardinality that exploration settles on).

**Validation scenarios.**
- Given two products, when each runs work, then each product's substrate/work/sessions are isolated and a founder can switch context between them.
- Given two products, when one accumulates a repeated knowledge finding, then it is promoted only within that product (the other is unaffected).
- Given per-product cost budgets, when one product hits its cap, then the other is unaffected.

**Plan calls.** `/concept AO` (product + substrate; reconcile the three scope keys; **explore the product↔team coupling**). `/design` the product context/switcher + per-product surfaces (novel → human review). Standard `/architecture` to thread the product scope through substrate, work, knowledge promotion/context, connections, cost, and the API namespace. Purge any vestigial demo data from local DBs as part of this.

**Contracts / constraints.** One load-bearing **product** identifier; the three legacy scope keys reconcile onto it (no new fourth key). "Product" is durable (not the time-bound "project"). Promotion + knowledge context are product-scoped — no cross-product validation/injection. Per-product isolation of substrate, connections, and cost. Forward-only migration; back-compatible single-product default.

**Out of scope.** The substrate model (AO1) and materialization (AO2). Review/land (AO3). Outbound connectivity (Track AN). Multi-node/horizontal scale.

**Effort.** L (~6d)
