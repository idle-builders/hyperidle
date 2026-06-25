# Track AO: Self-Hosting Build Loop

The genuinely-missing work to let a flat team of humans + AI agents build real software — HyperIdle itself and other similar-stack apps — **on** HyperIdle. Source: the deep review of 2026-06-25 (`.pipeline/audits/product/DEEP-REVIEW-2026-06-25.md`) — 11 read-only lanes across the full prod code + 205 docs + live app, then 3 reviewer agents (self-host / multi-project / adversarial). Verdict: **self-host NO, multi-project NO** — not for lack of surface (the bet→task→session→thread spine is real and N-team-capable) but because the build loop never closes.

This track rewrites the earlier "Code Substrate" draft against that evidence. Three corrections drove the rewrite: (1) the **credential/boot root cause is upstream and cheapest** — agents can't think out of the box — so it leads; (2) the substrate must **generalize beyond code** (a marketing agent has Obsidian/GDrive files, not a repo); (3) **we review outputs, not code diffs** — the verdict surface is already real, so the gap is review *generation* + *landing*, not a diff viewer.

**Where the loop breaks (`plan → equip → substrate → execute → connect → review → land → repeat`), verified against code:**
- **Equip (root):** live `GET /api/credentials` = all 4 slots `absent`; `SetupFlow.tsx` never asks for a key; assistant inert (assistant-turn.ts:125). This starves decomposition (live bet `9ec17faa`: `blocked, 0 tasks`), sessions, artifacts, reviews.
- **Substrate (structural):** sandbox = `context/ knowledge/ work/` only (context-assembly.ts:88-107); no `src/`, no clone, no `repoPath/projectId` in schema; `git-export` exports knowledge markdown only. Agent outputs (doc/metric/email/**code**) have no general substrate beyond `knowledge_items`.
- **Review+land:** `GET /api/reviews/:id` is a fixture (reviews.ts:4-61); no reviews table/POST; only a *knowledge*-review factory; AL7 (approve→execute) unmerged. The thread+verdict surface (threads.ts) **is** real.
- **Multi-project:** single-global at every layer — three disjoint scope keys (teamId / productId [never wired] / git-export scopeId), promotion leaks across teams (promotion-pipeline.ts:207, no team filter), no project picker.

**Adjacent work, not owned here (referenced as deps):** AL7 = the review→act execution loop (built, **unmerged**; AO4 depends on it). AN2/AN3 = outbound MCP client + broker (Track AN; required for apps that touch external services + forge-based landing; downstream of this track). Strategy **dynamic skill/tool injection** (agents can only get `systemPrompt` + role-filtered tools today; `AgentScaffoldSpec` has no skills field) = a real **major** extensibility gap that belongs to the AK/Strategy family, not here.

**Scope rules.** Closing the build loop for real software: agents can think and the app self-boots; a generalized output substrate; materialization of that substrate into the session sandbox so agents do real work; the wiring from agent output → review → land; and first-class project scope for concurrency. Out of frame: the review *experience/surface* itself (Track AL), the AL7 execution loop (dep), outbound external-tool connectivity (Track AN), dynamic skill injection (AK). `npm run verify` must pass after each WP merges.

**Reference:** `.pipeline/audits/product/DEEP-REVIEW-2026-06-25.md`, `plans/AN/boundary-concept.md`. Code seams: `packages/web/src/pages/SetupFlow.tsx`, `packages/server/src/server-factory.ts`, `packages/server/src/services/session-provisioning.ts`, `packages/fabric/src/context-assembly.ts`, `packages/server/src/routes/{reviews,artifacts}.ts`, `packages/fabric/src/services/{git-export,promotion-pipeline}.ts`.

---

### AO1 — Agents can think out of the box, and the app self-boots

**Workpackage.** As a founder standing up HyperIdle to build software, I want a fresh install to walk me through giving agents a thinking backend and to migrate its own database on boot, so that after I clone and run I have working agents instead of a crash and a roster that can't act. Today a fresh instance has zero model credentials and does not migrate on boot, so nothing downstream of "an agent thinks" can happen.

**Why this matters.** This is the cheapest change with the largest unblocking radius — the deep review traced it as the upstream root cause of four otherwise-separate failures (assistant inert, decomposition `blocked/0 tasks`, no sessions, no reviews). Until agents can think, none of the rest of this track is even testable. The cost of not building it: every other build-loop fix is unreachable, and "clone → run → onboard" fails before a team starts.

**What exists today.** `SetupFlow.tsx` captures name/functions/repoPath but **never asks for a model credential**; `migrateCredentialsToStore` seeds `anthropic_api_key` from env only if `HYPERIDLE_ANTHROPIC_API_KEY` is set — the default clone leaves all four slots `absent` (verified live). `createServer` (server-factory.ts:204-247) runs only `migrateCredentialsToStore`, never `applyMigrations`/`applyFactoryBootstrap` (only the Electron `main.ts` migrates); a stale/missing schema crashes boot. AM4 shipped harness *detection*, not credential wiring into setup. A `MISSING_ROOT_SECRET` boot warning exists (server-factory.ts:235-237).

**What's genuinely missing.** A first-run path that establishes a working thinking backend (prompt for a key, or accept an env/provisioned one, or the detected Claude Code subscription) before agents are expected to act; and schema migration on server boot (or a fast, legible "run setup" failure) so a fresh clone runs.

**Depends on.** None.

**Complexity.** M

**Pre-build gates.**
- **Concept:** `Not required — credential store, profiles, and harness/onboarding concepts are settled (docs/architecture/credential-model.md, AM4).`
- **Design:** `Light — extends the existing SetupFlow with a thinking-backend step; single-variant /design, no human-review park.`

**Human design review.** No — extends an existing onboarding surface; no new base component.

**Acceptance criteria.**
- After a fresh clone-and-run, a founder is guided to establish a thinking backend (enter a key, use a detected subscription harness, or an injected one) before reaching a state where agents are expected to act.
- With a thinking backend established, an agent can complete one real model turn (the assistant produces a non-canned reply).
- A fresh instance with an unmigrated/stale database either migrates itself on boot or fails with a clear, actionable message instead of an opaque crash.
- An instance with no thinking backend surfaces that state as "agents can't act yet — set this up" rather than failing silently downstream.

**Validation scenarios.**
- Given a fresh clone, when the founder runs the app and completes onboarding, then a thinking backend is configured and the assistant returns a real reply.
- Given a database missing the latest schema, when the server boots, then it migrates (or stops with a legible "run setup" message) rather than crashing on a missing column.
- Given no thinking backend configured, when the founder opens the app, then the missing-backend state is shown with a clear next step.

**Plan calls.** Light `/design` to place the thinking-backend step in onboarding. Standard `/architecture` for boot-time migration and the credential-establish path (key entry / env-inject / detected-subscription), honoring the single credential-store/resolver invariant.

**Contracts / constraints.** No secret is exposed in any agent-facing surface or log. The single credential-store/one-resolver invariant holds. Boot migration is forward-only with a downgrade guard. The default dev key (`hyperidle-dev-local`) remains a dev-only convenience, never a production default.

**Out of scope.** The substrate/sandbox work (AO2-AO3). Per-project credential isolation (AO5). Harness *detection* (AM4, shipped).

**Effort.** M (~1d)

---

### AO2 — Output substrate: where an agent's work lives

**Workpackage.** As an agent doing real work, I want a substrate — the files my work lives in and accrues history on — bound to the unit of work I pick up, generalized across kinds (a git **code repository** for a coding task, a document/knowledge set for a writing or marketing task), so that my output has a real home instead of evaporating or being forced into a knowledge-item shape. Today there is no such substrate: code has no home at all, and non-code outputs are squeezed into `knowledge_items`.

**Founder-driven generalization (resolved 2026-06-25).** The boundary concept (`plans/AN/boundary-concept.md`) locked a **code** substrate (local git, forge-optional). The founder’s correction: substrate is *files in general*, not only code — a marketing agent works in Obsidian/GDrive-style files. So a **git code repository is one kind of substrate**; the primitive is "the working files a unit of work operates on/produces." Connectors (tools/MCP — Track AN) and substrate (files) are the two axes.

**Why this matters.** This is the structural keystone of the whole track: without a substrate, an agent can research and plan but cannot produce durable, reviewable output — code least of all (the sandbox has no `src/`). Generalizing it beyond code is what lets HyperIdle build *similar-stack apps* and serve non-engineering work with one model. Cost of not building it: agents stay doc-only; "build software here" is impossible.

**What exists today.** `knowledge_items` is the only durable output store; `artifacts` exist but carry **no substrate columns** (no repoPath/filePath/commitSha — verified) and `artifacts.cost` is always NULL. `git-export` writes knowledge markdown to a single global repo; it is not a per-work code working tree. The "code substrate" of the boundary concept has **zero implementation**.

**What's genuinely missing.** A substrate record that binds a unit of work to the working files it operates on — for code, a git repository (clone URL/local path + branch, forge optional via an AN Connection); generalized so other output kinds (documents, knowledge sets) are substrate kinds too — distinct from `knowledge_items` and from the global knowledge-export config.

**Depends on.** None — foundational data model. (Live-proof that an agent works *in* a substrate comes with AO3.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — run /concept AO2: generalize the locked Code-substrate noun (plans/AN/boundary-concept.md) into a Substrate primitive across output kinds; settle its kinds, its relation to knowledge_items/artifacts, and the unit-of-work binding (task/bet/team) + cardinality.`
- **Design:** `Required — a surface to bind/inspect/select a unit of work's substrate (a repo, a doc set); /design multi-variant + human review.`

**Human design review.** Yes — introduces a new user-facing way to bind a substrate to work; its shape and where it lives are what's being decided.

**Acceptance criteria.**
- A unit of work can be bound to a substrate, and afterward that binding (its kind, location, and state) is visible on the work.
- A code substrate records its repository (location + branch) and, optionally, a forge whose auth comes from an existing Connection rather than re-modeled here.
- The substrate model accommodates at least one non-code kind (e.g. a document/knowledge set), so the primitive is not code-only.
- A substrate binding is distinct from, and does not overwrite, the instance knowledge-export configuration or a knowledge item.
- An unreachable/unauthenticated substrate surfaces as needing attention rather than failing silently.

**Validation scenarios.**
- Given a unit of work, when a founder binds a code repository as its substrate, then the repo + branch + state are shown on the work.
- Given a non-code unit of work, when a substrate is bound, then a non-code substrate kind is recorded (proving generality).
- Given a substrate whose forge Connection is missing, when it is viewed, then it is shown as needing attention.

**Plan calls.** Run `/concept AO2` (generalize substrate beyond code; settle kinds + binding + cardinality) — concept-reshaping. Then `/design` the bind/select surface (novel → human review; forks: where binding lives, single vs multi-substrate, how kinds present). Standard `/architecture` after, modelling the substrate record + unit-of-work binding, forge auth via the AN Connection seam.

**Contracts / constraints.** Substrate (files) and Connection (auth/tools) are distinct and compose; no forge credential is stored on the substrate record or exposed to agents. Local-first: a substrate functions with no forge. The substrate is not a knowledge item and not the knowledge-export target. Forward-only migration.

**Out of scope.** Materializing the substrate into a sandbox (AO3). Review/land (AO4). Per-project scoping (AO5). The forge auth mechanism (Track AN).

**Effort.** L (~5d)

---

### AO3 — Materialize the substrate into the session sandbox

**Workpackage.** As the system running a session, I want the unit of work's bound substrate placed into that session's sandbox — for code, the repository checked out at its branch — so that the harness can read, edit, build, and test real working files instead of an empty directory. The sandbox is already isolated per session, so this is a plain checkout into it, plus the tools to act on it.

**Why this matters.** This is where an agent stops being a planner and becomes a builder. Today even with Claude Code detected (`fileEditing: true`), the sandbox holds only knowledge files — so an agent cannot produce a code change. With the substrate materialized, the "interact"/build step becomes real for code and for file-based work generally. Cost of not building it: the build loop has no execute stage.

**What exists today.** Session provisioning spawns a unique per-session sandbox (`spawn()` = `mkdir`; isolated leaf), then writes knowledge/context + `AGENTS.md`/`CLAUDE.md`. The harness runs with `cwd: sandboxPath`. `GitRunner` exists but is **export-only** — `init/add/commit/push`, no `clone`/`fetch`/`checkout`. No step places working files into the sandbox.

**What's genuinely missing.** A provisioning step that materializes the bound substrate (AO2) into the session sandbox at its branch before the harness runs; inbound-git capability (clone/checkout) the runner lacks; a tool surface for the agent to act on the files (edit/build/test/commit); and a writeback path that captures the result.

**Depends on.** AO2 — there must be a bound substrate to materialize. AO1 — proving an agent actually edits/builds requires a thinking agent (the live-proof needs both a substrate and a working model turn).

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — consumes the AO2 Substrate noun and the existing Session/Sandbox primitives.`
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

**Plan calls.** Skip `/design`. Standard `/architecture` for the materialization step (clone/checkout into the isolated sandbox — no shared worktrees), the inbound-git capability, the agent's file/build/git tool surface, and writeback. **Live-proof:** a real session checks out a real repo, the agent edits + runs tests, and the change is captured — before `done`.

**Contracts / constraints.** Plain checkout into the already-isolated per-session sandbox. No repo/forge secret enters the sandbox; auth is applied by the system at checkout/push, never handed to the agent. A substrate-less session degrades to today's behavior. Materialization is driven by the unit-of-work binding (AO2), never a global path.

**Out of scope.** Turning the captured output into a review/landing (AO4). Per-project isolation (AO5). The substrate binding (AO2). Harness selection (Track AM).

**Effort.** L (~5d)

---

### AO4 — Agent output becomes reviewable and landable

**Workpackage.** As a founder, I want the output an agent produces in a session — a code change, a document, a result — to generate a real review I can act on, and approving it to **land** the change (e.g. push/PR/merge, or publish) performed by the system, so that agent work flows through HyperIdle's plan→**review**→act loop instead of dead-ending at a fixture. We review the **output/result** with the existing proof canvases; we do not read raw diffs.

**Founder constraint (resolved 2026-06-25).** "We look at outputs, not code; reviewing code is what we stop doing on HyperIdle." So this WP is **not** a code-diff viewer — the verdict/thread surface and proof-family canvases already exist and are real. The gap is **review generation** (real review subjects from real outputs) and **landing** (execute-on-approve), wired into the existing review experience.

**Why this matters.** This closes the loop's final two stages. Today `GET /api/reviews` returns a hardcoded fixture, there is no reviews table or creation path beyond knowledge, and AL7 (approve→execute) is unmerged — so even a perfect verdict lands nothing. With this, agent work becomes reviewable and an approval has teeth. Cost of not building it: the build cycle never completes even when upstream stages work.

**What exists today.** The thread + verdict machinery is real (threads.ts — founder-verdict, self-verdict block, first-verdict-wins). Proof-family canvases + a code-diff canvas exist in the review UI but are **fixture-fed**; `GET /api/reviews/:id` is a fixture (rev-1 only). Only `createReviewItemForKnowledge` exists — no task/artifact/bet factory. AL7 (the staged-operation execute-on-approve loop) is built but **unmerged**.

**What's genuinely missing.** Generation of real review subjects from real agent outputs (across kinds, not just knowledge), replacing the fixture; and a landing path where an approved output's operative action (push/PR/merge/publish) executes through the connected system via AL7 — the system, never the agent, holding the credential.

**Depends on.** AO3 — there must be real agent output (a captured change/result) to review. AL7 — landing is an AL7 staged operation; it must be merged, and is the execute-on-approve seam this WP wires output into.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — consumes the review Subject/verdict (Track AL), the Substrate/output (AO2-AO3), and AL7's Staged Operation + Landing (plans/AN/boundary-concept.md).`
- **Design:** `Light — outputs render through the existing proof-family canvases; placing real (non-fixture) subjects + the landing action is single-variant /design, no human-review park.`

**Human design review.** No — reuses the established review experience; any new canvas is Track AL's call.

**Acceptance criteria.**
- An agent's output from a session generates a real review subject a founder can open and judge — rendered through the existing proof canvases, not a fixture.
- An output that produced no change yields no empty/spurious review.
- Approving an output can land it (push/PR/merge, or publish) performed by the system through the connected forge/target — the agent never holds the landing credential.
- A local-only or remote-less output still reviews; landing degrades to the local/no-remote case.
- Landing inherits at-most-once execution and surfaces its outcome (success/failure) rather than failing silently.

**Validation scenarios.**
- Given a session that produced a code change, when it completes, then a real review subject (not a fixture) is reviewable for that unit of work via the existing canvases.
- Given a substrate with a forge, when a founder approves, then the system lands the change through the forge and records the outcome; the agent holds no credential.
- Given a session that changed nothing, when it completes, then no review or landing is created.

**Plan calls.** Skip `/concept`. Light `/design` to place real subjects + the landing action in the existing review surfaces. Standard `/architecture` for review generation across output kinds (replace the fixture loader; add task/artifact/bet review creation) and the landing as an AL7 staged operation. **Sequencing:** AL7 must be merged first.

**Contracts / constraints.** We review the **output/result**, not raw diffs — render through the existing proof-family canvases; the invariant is that agent work is reviewed through the same experience as any other output. The agent never executes the landing; the system triggers the connected target (at-most-once, outcome surfaced — AL7). No empty/no-op reviews or landings. Outputs are derived from the substrate, never re-hosted as the store of record.

**Out of scope.** The review experience/surface and any new canvas (Track AL). The AL7 execution loop itself (dep). Materializing the substrate (AO3). Outbound external-tool reach for non-forge targets (Track AN).

**Effort.** L (~5d)

---

### AO5 — Project as a first-class scope (multi-project)

**Workpackage.** As a founder running HyperIdle and two other apps on one instance, I want a "project" to be a first-class scope that isolates each app's work, knowledge, connections, cost, and sandbox, so that building one product can't leak into or collide with another. Today there is no single project identifier: work scopes by `teamId`, knowledge by a separate `productId` (never wired), git-export by `scopeId`, and connections by `userId` — and knowledge promotion leaks across teams.

**Why this matters.** This is the entire "AND a set of other apps" half of the core task. Today concurrent projects contaminate each other: promotion auto-validates one team's principles for all (promotion-pipeline.ts:207, no team filter), and there is no per-project budget, credential, repo, or UI context — so a team must run a separate instance per app. Cost of not building it: multi-project is a trap that appears to work until two builds interfere.

**What exists today.** The bet→task→session spine is `teamId`-scoped and N-team-capable at the route/DB level — a real foundation. But `teams` has no owner FK or repo binding; the three scope keys are disjoint and unreconciled; promotion counts `DISTINCT scopeId` factory-wide; connections are `userId`-only; cost caps are per-agent/factory; the AppShell has no project context or picker and every call hits global `/api/teams`. (Vestigial Nimmly demo data persists in pre-AF17 *local* DBs only; source is guarded clean.)

**What's genuinely missing.** A single first-class project scope threaded through work, knowledge (team/project-scoped promotion + wired context filtering), connections, cost, sandbox, and the UI shell (a project picker / namespaced calls) — reconciling the three disjoint scope keys onto one.

**Depends on.** AO2 — the project scope binds a substrate (repo) per project; without the substrate model there is nothing project-scoped to bind. (Best sequenced after the single-project loop AO1-AO4 is proven.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — run /concept AO5: define the Project scope and reconcile the three existing keys (teamId / productId / git-export scopeId) onto one; decide whether project promotes teamId or is a new entity teams belong to.`
- **Design:** `Required — a project context/switcher in the app shell and per-project surfaces; /design multi-variant + human review.`

**Human design review.** Yes — introduces a top-level project context/switcher in the shell; a load-bearing IA change.

**Acceptance criteria.**
- An instance can host multiple projects, each with its own work, substrate, knowledge scope, connections, and cost budget, and a founder can tell which project they are operating in and switch.
- Knowledge promotion and context for one project do not validate or inject into another's (no cross-project leak).
- A connection and a cost budget can be scoped to a project, so one project's spend or credentials are not another's.
- Concurrent work across two projects operates on disjoint substrates/sandboxes and neither can read the other's.

**Validation scenarios.**
- Given two projects, when each runs work, then each project's bets/tasks/sessions/substrate are isolated and a founder can switch context between them.
- Given two projects, when one accumulates a repeated knowledge finding, then it is promoted only within that project (the other is unaffected).
- Given per-project cost budgets, when one project hits its cap, then the other is unaffected.

**Plan calls.** Run `/concept AO5` (define Project; reconcile the three scope keys). `/design` the project context/switcher + per-project surfaces (novel → human review). Standard `/architecture` to thread the project scope through work, knowledge promotion/context, connections, cost, sandbox, and the API namespace. Purge any vestigial demo data from local DBs as part of this.

**Contracts / constraints.** One load-bearing project identifier; the three legacy scope keys reconcile onto it (no new fourth key). Promotion + knowledge context are project-scoped — no cross-project validation/injection. Per-project isolation of substrate, connections, and cost. Forward-only migration; back-compatible single-project default.

**Out of scope.** The substrate model (AO2) and its materialization (AO3). Review/land (AO4). Outbound connectivity (Track AN). Multi-node/horizontal scale (out of frame for a flat team on one node).

**Effort.** L (~6d)
