# Track AO: Self-Hosting Build Loop

The genuinely-missing work to let a flat team of humans + AI agents build real software — HyperIdle itself and other similar-stack apps — **on** HyperIdle. Source: the deep review of 2026-06-25 (`.pipeline/audits/product/DEEP-REVIEW-2026-06-25.md`) — 11 read-only lanes across the full prod code + 205 docs + live app, then 3 reviewer agents.

**Corrected scope (founder review, 2026-06-25).** Two deep-review items were *not* genuine WPs and have been removed:
- **Thinking backend / onboarding is already built.** `SetupFlow.tsx` asks for and writes the model key (AH1 §5), AM4 shipped harness detection/config (`SettingsHarnesses.tsx`), AN shipped external connections. The deep review's "credentials absent / SetupFlow never asks" was an artifact of testing an *un-onboarded* dev DB, not a missing capability.
- **Boot-migration crash is a bugfix, not a WP** — fix it directly, don't track it here.
- The live "decomposition `blocked/0 tasks`" is downstream of the un-onboarded DB — a *verify-once-onboarded* item, not net-new WP scope.

**What's actually missing (this track):** the build-loop middle — a filesystem for an agent's output (code or otherwise), its materialization into the session sandbox so agents do real work, the output→review→land wiring (pending AL7), and **product** as a first-class scope so one instance can build several things.

**Gating concept — LOCKED `/pipeline:refine AO0` (2026-06-26).** Full concept: `plans/AO/requirements.md` + decision-rule research `plans/AO/research-filesystem-vs-tool.md`. Outcomes that bind AO1/AO2:
- **Filesystem** = the durable file-like artifacts an agent **authors** and accrues history on, materialized into its session sandbox, **attached to an agent within a team** (team-scoped). **OPEN `kind`** — initial `code` (git repo) + `doc_set` (markdown/Obsidian authoring folder).
- **Filesystem↔Tool↔Knowledge decision rule (research-grounded).** A filesystem is **only** an authored, file-like, version-controlled corpus (**code + document authoring**). **Systems of record** (email inbox, ticket queue, CRM) are **live tools** (Track AN) — never materialized. **Reference corpora** (drive lookup) are **retrieval** (knowledge fabric). Discriminator: *author a corpus* → filesystem; *operate a system of record* → tool; *look something up* → knowledge — not "does an API exist." So AO does **not** materialize inboxes/CRMs/ticket queues and does **not** build a Drive/Dropbox sync engine.
- **Connected like any connector.** Account once in Settings = a **Connection** (Track AN — held token or inherited, **never a HyperIdle OAuth app**); then per-agent select **which resource** (a GitHub repo+branch, an Obsidian/Drive folder) is the filesystem. Filesystem ⟂ Connection = files vs auth/tools; compose.
- **Agents work *with* their credentials in the sandbox.** The bound Connection's auth is provisioned into the sandbox so the agent's own tools push/PR. **No credential withholding, no broker-only path** (the reverted-broker model is dead — PR #364). The review gate (AL7) checkpoints irreversible *landing*, never access.
- **Write-back rides the host** — `git` (commit→push/PR) for code; `file` (last-write + snapshot) for a folder; **no custom sync/conflict engine.**
- **Product is NOT modelled (for now).** Scope is the **Team**. The earlier "product↔team coupling" exploration is set aside; multi-instance/per-product isolation is **deferred (AO4)**.

**Adjacent, not owned here (deps/cross-track):** AL7 = review→act execution loop (built, **unmerged**; AO3 is gated on it and may be largely subsumed by it — see AO3). AN2/AN3 = outbound MCP client + broker (Track AN; required for apps that touch external services + forge-based landing). Strategy **dynamic skill/tool injection** (agents get only `systemPrompt` + role-filtered tools; `AgentScaffoldSpec` has no skills field) = a real **major** extensibility gap belonging to the AK/Strategy family.

**Scope rules.** The build-loop middle only: filesystem, its materialization, output→review→land wiring, and product scope. Out of frame: onboarding/credentials (AH1/AM4/AN — done), the review experience/surface (Track AL), the AL7 execution loop (dep), outbound connectivity (Track AN), dynamic skill injection (AK). `npm run verify` must pass after each WP merges.

**Reference:** `.pipeline/audits/product/DEEP-REVIEW-2026-06-25.md`, `plans/AN/boundary-concept.md`. Code seams: `packages/server/src/services/session-provisioning.ts`, `packages/fabric/src/context-assembly.ts`, `packages/server/src/routes/{reviews,artifacts}.ts`, `packages/fabric/src/services/{git-export,promotion-pipeline}.ts`.

---

### AO1 — A product's output filesystem: where an agent's work lives

**Workpackage.** As an agent doing real work, I want a filesystem — the files my work lives in and accrues history on, owned by the product I'm building — generalized across kinds (a git **code repository** for a coding task; a document/knowledge set for a writing or marketing task), so that my output has a real home instead of evaporating or being forced into a knowledge-item shape. Today there is no such filesystem: code has no home at all, and non-code outputs are squeezed into `knowledge_items`.

**Why this matters.** This is the structural keystone of the whole track: without a filesystem an agent can research and plan but cannot produce durable, reviewable output — code least of all (the sandbox has no `src/`). Generalizing beyond code is what lets HyperIdle build *similar-stack apps* and serve non-engineering work with one model. Cost of not building it: agents stay doc-only; "build software here" is impossible.

**What exists today.** `knowledge_items` is the only durable output store; `artifacts` exist but carry **no filesystem columns** (no repoPath/filePath/commitSha — verified) and `artifacts.cost` is always NULL. `git-export` writes knowledge markdown to a single global repo; it is not a per-work code working tree. The "code filesystem" of `plans/AN/boundary-concept.md` has **zero implementation**.

**What's genuinely missing.** A filesystem record that binds a product (and the unit of work under it) to the working files it operates on — for code, a git repository (clone URL/local path + branch, forge optional via an AN Connection); generalized so other output kinds are filesystem kinds too — distinct from `knowledge_items` and from the global knowledge-export config.

**Depends on.** None to build the model. (Its binding level — product vs unit of work — is settled by `/concept AO`; live-proof an agent works *in* it comes with AO2.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `DONE — /concept AO0 locked (plans/AO/concept.md + research-filesystem-vs-tool.md). Filesystem = authored corpora only (code + doc_set); attached to an agent-within-a-team; connected via a Connection + resource selection; SoRs are AN tools.`
- **Design:** `DONE (routine EXTRACT) — Filesystems is the next Settings section, extracted from the established Settings-section pattern (sibling to Harnesses/Models/Agents; reuses KeyValue/StatusChip/Tag/Button). Single design (plans/AO1/design/design.md), NOT multi-variant. No SettingsConnections on this branch (AN reverted) — extracted from SettingsHarnesses.`

**Human design review.** No — reclassified at design time. The planning forecast said Yes, but this is a **routine extraction** of an already-solved Settings pattern (no novel decision, no placement fork — Settings is where Connections/Harnesses/Models/Agents already live). Founder corrected an initial 3-variant pass as a failure to reuse what exists; the extract gate governs.

**Acceptance criteria.**
- An agent within a team can be attached to a filesystem, and afterward that attachment (its kind, resource, write-back capability, state) is visible.
- A `code` filesystem records its repository (Connection + repo + branch) with forge auth resolved from an existing **Connection** (Track AN), not re-modelled here.
- The filesystem model accommodates the `doc_set` authoring kind (a markdown/Obsidian folder), so the primitive is not code-only — **and systems of record (inbox/CRM/ticket) are categorically excluded** (those are AN tools, not filesystems).
- A filesystem attachment is distinct from, and does not overwrite, the instance knowledge-export configuration or a knowledge item.
- An unreachable/unauthenticated filesystem surfaces as needing attention rather than failing silently — **via a REAL reachability probe against the real source, never a stub** (founder 2026-06-27: a stub built from memory is worthless + non-mergeable; PR #366 v1's `NoopAuthResolver` was rejected for exactly this).

**Reachability scope (founder decision, 2026-06-27).** Real registration = a real check against the real source, and that is a **matrix of per-source integrations** (each its own auth + probe + live-proof) — plausibly larger than AO2. **AO1 ships the reachable slice, real + live-proven:**
- **`local` / Obsidian folder** → `fs` access probe (Obsidian vault = a local folder; NOT deferred).
- **`code` / git forge** (GitHub) → `git ls-remote` using the real token from AN1's `ServiceConnectionResolver` (now on main). Real repo → `reachable`; bogus/no-auth → `needs_attention`.
- **Deferred to their own connector-gated WPs (queued):** GDrive, Dropbox, S3, … — each needs an AN connector that does not exist yet (+ the no-OAuth question). Stated honestly, never stubbed.

See `plans/AO1/architecture.md` "Reachability rework (v2)" — grounded in the real AN resolver + real `git ls-remote` behavior.

**Validation scenarios.**
- Given an agent in a team, when a founder attaches a `code` repository (Connection + repo + branch) as its filesystem, then the repo + branch + write-back + state are shown.
- Given a writing agent, when a `doc_set` folder filesystem is attached, then a non-code filesystem kind is recorded (proving generality without a sync engine).
- Given a filesystem whose forge Connection is missing, when it is viewed, then it is shown as needing attention.

**Plan calls.** Concept DONE (AO0). Then `/design` the attach/select surface (novel → human review). Standard `/architecture` modelling the filesystem record + attachment + resource selection, forge auth via the AN Connection seam.

**Contracts / constraints.** Filesystem (files) and Connection (auth/tools) are distinct and compose; the filesystem references a Connection + resource, **no credential stored on the filesystem record** — but the Connection's auth **is provisioned into the sandbox** so the agent works with it (no withholding). Local-first: a filesystem functions with no forge. The filesystem is an authored corpus only — not a system of record, not a knowledge item, not the knowledge-export target. Write-back rides the host (`git`/`file`); no custom sync engine. Forward-only migration.

**Out of scope.** Materializing the filesystem into a sandbox (AO2). Review/land (AO3). Product scope itself (AO4). The forge auth mechanism (Track AN).

**Effort.** L (~5d)

---

### AO2 — Mount the bound filesystem into the session working directory

> **AQ1 implication (founder, 2026-06-28) — building WITHOUT a sandbox for now.** AQ1 removes isolation: the "session sandbox" is a **working directory on the host**, no boundary. So AO2's materialization is a **plain checkout into a host directory** and writeback is a **direct host-filesystem** capture — there is no isolation layer to cross, no container/worker copy-in/out. When a task runs on a **remote** joined desktop, it runs host-local *there*, so materialization + writeback happen on that desktop's host filesystem (a scheduler concern, not an isolation one). Drop any "materialize across an isolation boundary" assumption; per-agent isolation (and materializing into it) is an **AQ2** concern. Update the wording below ("already isolated per session") accordingly when AO2 is architected.

**Workpackage.** As the system running a session, I want the unit of work's bound filesystem placed into that session's working directory — for code, the repository checked out at its branch — so that the harness can read, edit, build, and test real working files instead of an empty directory. The session runs in a host working directory (AQ1 — no isolation). **Mount is per-source, adapter-dispatched** behind one `FilesystemMounter` seam: a **local git repo → `git worktree add`**, a **remote repo → `git clone`**, a **local folder (Obsidian/`doc_set`) → work in place + snapshot**; **cloud-synced sources (GDrive/Dropbox/S3) are deferred** to their connector WPs. Plus capture-back before the working dir is `rm -rf`'d.

**Why this matters.** This is where an agent stops being a planner and becomes a builder. Today even with Claude Code detected (`fileEditing: true`), the sandbox holds only knowledge files — so an agent cannot produce a code change. With the filesystem materialized, the build step becomes real for code and for file-based work generally. Cost of not building it: the build loop has no execute stage.

**What exists today.** Session provisioning spawns a per-session **host working directory** (`LocalSandboxAdapter.spawn()` = `mkdir`; AQ1 — no isolation), then writes knowledge/context + `AGENTS.md`/`CLAUDE.md`. The harness runs host-local with `cwd: sandboxPath` and the real `$HOME` (`cli-harness-adapter.ts:376-380`), so inherited `git`/`gh`/`~/.ssh` authenticate for free. `GitRunner` is **export-only** — `init/add/commit/push/lsRemote`, **no `clone`/`worktree`/`fetch`/`checkout`** (`git-export-runner.ts:34-71`). AO1 shipped the `FilesystemMounter`/`FilesystemAuthResolver` seam **types** (`shared/src/filesystem.ts:101-133`) and the per-bot injection model — no implementation. No step places working files into the working directory. The **harness layer already demonstrates the registry pattern** AO2's mounter follows: `SandboxAdapter` (uniform interface) + `AdapterPool.select()` (registry selector by type/capabilities, `adapter-pool.ts:194-246`) + per-kind impls (`local-sandbox-adapter.ts`, `disabled-sandbox-adapter.ts`).

**What's genuinely missing.** A spawn-time **mount** step that checks the bound `code` filesystem (AO1) out into the session working directory at its branch before the harness runs; the inbound-git capability (`clone`/`fetch`/`checkout`) the runner lacks; and a **capture-back** path that commits/snapshots authored changes before the working directory is destroyed. No new auth path — inherited host auth is ambient (AQ1); held-connection auth is AN2.

**Depends on.** AO1 — there must be a bound filesystem to mount. **Not blocked on AN2** — AO2's live-proof uses the free inherited host auth; AN2's held-connection provisioning composes later (files ⟂ auth).

**Complexity.** M (shrunk from L — auth mooted by AQ1's host model, isolation deferred to AQ2; real residual = `GitRunner` `clone`/`worktree`/`fetch`/`checkout` verbs + registry-backed `FilesystemMounter` + three v1 adapters (local-git worktree, remote-git clone, local-folder in-place) + two `session-provisioning` hook calls + `filesystem_captures` provenance row + live-proof).

**Pre-build gates.**
- **Concept:** `DONE — /concept AO2 RE-LOCKED + GENERALIZED post-AQ1 (plans/AO2/concept.md). Mount (was materialize) = per-source, adapter-dispatched behind one FilesystemMounter seam: local-git worktree · remote-git clone · local-folder in-place; cloud-sync deferred to connector WPs. AO2 is NOT auth-injection (inherited free / held = AN2), NOT isolation (AQ2), NOT a sync engine, NOT landing. Stale pre-AQ1 (clone-only, isolation) branch discarded; GitRunner.clone/bundle + filesystemCaptures schema salvageable.`
- **Design:** `Not required — runtime mount mechanism; no rendered surface.`

**Human design review.** No — backend provisioning mechanism.

**Acceptance criteria.**
- For a **`code`** filesystem the **session working directory** contains its working tree at its branch (via the **worktree** adapter when the repo is local on host, the **clone** adapter when remote), and the agent (running host-local) can read, edit, and run its build/test commands; for a **`doc_set`** filesystem the working directory contains the folder's files (the **local-folder** adapter, work-in-place + snapshot). **Mount dispatches per-source behind one `FilesystemMounter` contract; the provisioning flow never branches on source.**
- The agent's changes to the working tree are captured rather than lost when the **working directory is `rm -rf`'d** on destroy. **Capture-back is source-aware, routed through the mount adapter:** git → commit (+ bundle); local folder → snapshot; (cloud → push, deferred). Capture-back is commit/snapshot only; **push/PR/publish to an external target is landing (AL7/AO3), not AO2**.
- A session for a unit of work with no filesystem still provisions and runs (no working tree), rather than failing.
- A session for a `code` filesystem can run a real authenticated `git fetch`/push against the repo **using the agent's inherited host auth** (`$HOME` — `gh`/`git`/`~/.ssh`, free under AQ1). AO2 builds **no** auth-into-sandbox mechanism: inherited auth is ambient (AQ1); held-connection provisioning is **AN2's** job and composes later without changing AO2's mount. The filesystem row stores no secret; AO2 never extracts inherited auth (AN1 hard-rule 4).
- Mount is implemented as a **registry of mount adapters** selected by `(kind, source)` behind the single `FilesystemMounter` seam. **v1 ships:** a **local-git worktree** adapter, a **remote-git clone** adapter, and a **thin local-folder** adapter (`doc_set` — work-in-place + snapshot). **Cloud-sync adapters (GDrive/Dropbox/S3) are NOT built in AO2** — they are named in the registry and selecting one yields an explicit `needs_attention` ("adapter not built"), never a silent failure; they are built in their connector WPs. A `switch (source)` in `session-provisioning` is a defect — all source differences live inside an adapter.

**Validation scenarios.**
- Given a unit of work with a code filesystem, when a session starts, then the working directory holds the repo at its branch and the agent edits a file and runs the project's test command against it.
- Given the agent made changes, when the session ends, then those changes are captured (committed/snapshotted) before the working directory is removed.
- Given a filesystem-less unit of work, when a session starts, then it provisions with no working tree and internal tools still work.
- Given a code filesystem, when a session starts on a host with inherited `gh`/`git` auth, then the agent runs a real authenticated `git fetch`/push against the repo using that **inherited host auth** — no provisioned-auth step in AO2.
- Given a `code` filesystem whose repo is local-on-host, when a session starts, then the working directory is populated via `git worktree add` (no clone, no network) and capture-back commits on the session branch; given a `doc_set` local folder filesystem, when a session starts, then the folder is mounted in place, the agent edits a file, and capture-back snapshots the changed subtree. Cloud scenarios are explicitly out of v1.

**Plan calls.** Skip `/design`. Standard `/architecture` for the **adapter-dispatched mount** into the host working directory (AQ1 — no isolation): worktree for local git, clone for remote git, in-place for local folder; one extended `GitRunner` for both git adapters; cloud-sync adapters deferred. Covers the inbound-git capability (`clone`/`worktree`/`fetch`/`checkout` on `GitRunner`), the mounter registry + three v1 adapters, the agent's file/build/git tool surface, and capture-back. **Live-proof:** a real session checks out a real repo, the agent edits + runs tests, and the change is captured — before `done` (inherited `$HOME` auth is sufficient; no AN2 dependency).

**Contracts / constraints.** **One uniform `mount`/`captureBack` contract; per-source mount adapters behind a mounter registry** (worktree/clone/local-folder in v1; cloud deferred) — the provisioning flow is source-agnostic. For `code`: a **local** repo (on host, `connectionId` null / local path) mounts via **`git worktree add`** on a per-session branch (`agent/<sessionId>`) — instant, shared object store, no network, mirroring the human worktree flow; a **remote** repo mounts via shallow **`git clone`**. For `doc_set`: a **local folder** mounts **in place** (no copy — no boundary under AQ1; concurrency on the same vault is last-write-wins + snapshot, never merged). The one extended `GitRunner` serves both git adapters (`clone`/`worktree`/`fetch`/`checkout` reusing `buildGitEnv`). Inherited host auth is ambient and free; held-connection auth is AN2's provisioning, composed later — AO2 implements **no** auth path and **never extracts inherited auth** (AN1 hard-rule 4). Capture-back (commit/bundle/snapshot) runs **after `endSession`, before `rm -rf`**; landing (push/PR/publish) is AL7/AO3, never AO2. Mount is driven by the bot's `FilesystemInjection` (AO1), never a global path; a no-filesystem session degrades to today's behavior. No custom sync engine (`git` for `code`; last-write + snapshot for `doc_set`/`file`). The `filesystem_captures` provenance row (source-agnostic: `sessionId`, `filesystemId`, `capturePath`, `commitSha`) is created per capture for AO3 handoff.

**Out of scope.** Turning captured output into review/landing (AO3). Product scope (AO4). The filesystem binding (AO1). Harness selection (Track AM). **Held-connection auth provisioning (AN2). Per-agent isolation / any sandbox boundary (AQ2).**

**Effort.** M (~2-3d) — shrunk from L (~5d) at concept re-lock (auth mooted by AQ1's host model, isolation deferred to AQ2).

---

### AO3 — Agent output becomes reviewable and landable — WONT DO

**Status: WONT DO (founder, 2026-07-03).** AO3's direct `land_change` concept is rejected. It tried to make HyperIdle "land" captured code by pushing a git ref after a HyperIdle review, which duplicates and bypasses the provider-native flow that already owns code review, CI, branch protection, conflict handling, and merge. Code work should ride the host/provider mechanism: agents use normal git/gh tools to create branches and PRs; GitHub/GitLab own review and merge; HyperIdle syncs the external PR/MR into Work/Conversations and gates only consequential agent actions through AL7 when the founder chooses that. The replacement scope is **AN4 — Sync provider-native code review flows**, under Track AN because it is external-tool/provider synchronization, not filesystem landing.

**What remains valuable.** AO2 capture-back still matters as provenance and recovery evidence; AL7 still matters as the generic review→grant→agent-act loop; review canvases can still render captured output. Those are not a reason to build a HyperIdle-specific merge or sync engine.

**Problem identified (deep review, 2026-06-25).** The build loop's final stages — an agent's output becoming a real review a human can act on, and approval **landing** the change — do not work on real output today: `GET /api/reviews/:id` is a hardcoded fixture (reviews.ts:4-61), there is no reviews table or POST, only a *knowledge*-review factory exists (no task/artifact/bet), and **AL7 (the approve→execute loop) is unmerged**. So even a correct verdict lands nothing. Note: the review *experience* itself — threads, verdicts (founder-verdict, self-verdict block, first-verdict-wins), proof-family canvases — **is** real (threads.ts); the founder constraint holds that we review **outputs/results, not code diffs**.

**Why it is parked.** AL7 is built (on `concept/AL7-review-execution-loop`) and is the staged-operation execute-on-approve seam. It very likely supplies most or all of "generate a review subject from work → verdict → execute on approve." Speccing a solution now would almost certainly duplicate or contradict AL7. The honest move is to let AL7 land, then re-measure.

**What `/pipeline:refine AO3` must re-check after AL7 ships.**
- Does AL7 already generate review subjects from *agent output across kinds* (task/artifact/code), or only from the cases it shipped? If general, this WP closes with no new scope.
- Does AL7's execute-on-approve cover **landing a filesystem change** (push/PR/merge/publish via the connected target), or is a filesystem-specific landing step still missing?
- Is the fixture `GET /api/reviews` replaced by real generation as part of AL7, or still outstanding?
- Only the residual that AL7 does **not** cover becomes the (re-scoped) AO3 WP — or this WP is closed as subsumed.

**Depends on.** AL7 (must be merged before this is even researched). AO2 (there must be real captured output to review/land).

**Complexity.** Unknown until researched (placeholder L).

**Pre-build gates.**
- **Refinement:** `Required — /pipeline:refine AO3 AFTER AL7 merges: re-check whether any gap remains beyond AL7; if none, close this WP.`
- **Design:** `Deferred — decided in /pipeline:refine AO3; outputs render through existing proof-family canvases regardless, so likely Light or none.`

**Human concept review.** No (expected) — reuses the existing review experience; reassess in `/pipeline:refine AO3`.

**Acceptance criteria.** *Deferred to `/pipeline:refine AO3`* — the problem to keep in view: an agent's real output (code or otherwise) generates a real review subject (not a fixture) rendered through the existing canvases, and approval lands the change performed by the system (never the agent), inheriting AL7's at-most-once/outcome semantics. Whether any of this remains unmet after AL7 is exactly what the concept pass determines.

**Validation scenarios.** *Deferred to `/pipeline:refine AO3`.*

**Plan calls.** No `/architecture` yet. After AL7 merges, run `/pipeline:refine AO3` to determine if a residual gap exists; only then scope and size the real WP (or close it).

**Contracts / constraints.** We review **outputs/results, not raw diffs** — render through the existing proof-family canvases. The agent never executes the landing; the system triggers the connected target. No duplication of AL7 — this WP only addresses what AL7 demonstrably does not.

**Out of scope.** The review experience/surface (Track AL). The AL7 loop itself (dep). Materializing the filesystem (AO2).

**Effort.** TBD — re-size in `/pipeline:refine AO3` after AL7.

---

### AO4 — Product as a first-class scope (multi-product) — DEFERRED

**Status: DEFERRED (founder, 2026-06-26).** "Product" is **not modelled for now** — the build scope is the **Team**; multi-product = multi-team. The `/concept AO0` pass set the Product noun aside until the filesystem keystone (AO1/AO2) exists. The residual reconciliation is also smaller than this WP assumes: `productId` was already removed by U1 (→ `teamId`), and `scopeId` already equals `teamId` (`scopeKind="product"`) — so the only live residual is the per-team isolation of promotion (the factory-wide `DISTINCT scopeId` leak at `promotion-pipeline.ts:207`). Re-scope or re-open this WP only after AO1/AO2 land. The text below is the original framing, retained for history.

**Workpackage.** As a founder running HyperIdle and a couple of other apps on one instance, I want a **product** to be a first-class scope — the durable thing being built — that isolates each product's filesystem, work, knowledge, connections, and cost, so that building one product can't leak into or collide with another. Today there is no such scope: work scopes by `teamId`, knowledge by a separate `productId` (never wired), git-export by `scopeId`, and connections by `userId`; knowledge promotion leaks across teams.

**Founder framing (2026-06-25) — kept deliberately loose.** "Project" is rejected — projects are time-bound and end. The scope is **product**: durable, the thing being built. **How a product couples to a team is an open question to explore in `/concept AO`, not a decision to pre-resolve here** — it may be 1:1, a team may build several products, or a product may span teams; the right coupling is exactly what the concept pass must work out (alongside reconciling the three disjoint scope keys onto product). Treat the cardinality below as illustrative, not fixed.

**Why this matters.** This is the entire "AND a set of other apps" half of the core task. Today concurrent products contaminate each other: promotion auto-validates one team's principles for all (promotion-pipeline.ts:207, no team filter), and there is no per-product budget, credential, repo, or UI context — so a team must run a separate instance per product. Cost of not building it: multi-product is a trap that appears to work until two builds interfere.

**What exists today.** The bet→task→session spine is `teamId`-scoped and N-team-capable at the route/DB level — a real foundation. But `teams` has no owner FK or filesystem binding; the three scope keys (`teamId`/`productId`/`scopeId`) are disjoint and unreconciled; promotion counts `DISTINCT scopeId` factory-wide; connections are `userId`-only; cost caps are per-agent/factory; the AppShell has no product context or picker and every call hits global `/api/teams`. (Vestigial "Nimmly" demo data persists in pre-AF17 *local* DBs only; source is guarded clean.)

**What's genuinely missing.** A first-class **product** scope threaded through filesystem, work, knowledge (product-scoped promotion + wired context filtering), connections, cost, and the UI shell (a product picker / namespaced calls) — reconciling the three disjoint scope keys onto product, and defining product↔team (not 1:1).

**Depends on.** AO1 — a product owns its filesystem; the filesystem model must exist to isolate it per product.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — /concept AO (shared with AO1): define the Product scope (durable, not the time-bound 'project') and EXPLORE which product↔team coupling we actually need (1:1? a team builds many products? a product spans teams?) — this is an open exploration, not a settled cardinality. Reconcile teamId / productId / git-export scopeId onto product.`
- **Design:** `Required — a product context/switcher in the app shell and per-product surfaces; /design multi-variant + human review.`

**Human design review.** Yes — introduces a top-level product context/switcher in the shell; a load-bearing IA change.

**Acceptance criteria.**
- An instance can host multiple products, each with its own filesystem, work, knowledge scope, connections, and cost budget, and a founder can tell which product they are operating in and switch.
- Knowledge promotion and context for one product do not validate or inject into another's (no cross-product leak).
- A connection and a cost budget can be scoped to a product, so one product's spend or credentials are not another's.
- Concurrent work across two products operates on disjoint filesystems/sandboxes and neither can read the other's.
- The product↔team coupling decided in `/concept AO` is implemented and made explicit (whatever cardinality that exploration settles on).

**Validation scenarios.**
- Given two products, when each runs work, then each product's filesystem/work/sessions are isolated and a founder can switch context between them.
- Given two products, when one accumulates a repeated knowledge finding, then it is promoted only within that product (the other is unaffected).
- Given per-product cost budgets, when one product hits its cap, then the other is unaffected.

**Plan calls.** `/concept AO` (product + filesystem; reconcile the three scope keys; **explore the product↔team coupling**). `/design` the product context/switcher + per-product surfaces (novel → human review). Standard `/architecture` to thread the product scope through filesystem, work, knowledge promotion/context, connections, cost, and the API namespace. Purge any vestigial demo data from local DBs as part of this.

**Contracts / constraints.** One load-bearing **product** identifier; the three legacy scope keys reconcile onto it (no new fourth key). "Product" is durable (not the time-bound "project"). Promotion + knowledge context are product-scoped — no cross-product validation/injection. Per-product isolation of filesystem, connections, and cost. Forward-only migration; back-compatible single-product default.

**Out of scope.** The filesystem model (AO1) and materialization (AO2). Review/land (AO3). Outbound connectivity (Track AN). Multi-node/horizontal scale.

**Effort.** L (~6d)
