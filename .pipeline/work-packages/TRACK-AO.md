# Track AO: Code Substrate & Landing

Source: the product-deep-review of 2026-06-24 (focus: *what is still missing to use HyperIdle to develop HyperIdle itself, and two other similarly-shaped products?*) — findings PDR-0001 (agent sessions never receive a product repo) and PDR-0002 (no per-team repo binding / single global git target). Reframed 2026-06-25 after deep code research + founder review against the **locked** boundary concept `plans/AN/boundary-concept.md` (founder act, 2026-06-22).

This track builds the **code case** of that boundary: the agent's git working copy and the path that turns its edits into a reviewable diff and a landed change. Track AN builds the *connected-system* side (forges/tools as Connections); Track AO builds the *code-substrate* side AN does not cover.

**The locked frame (do not re-litigate — `boundary-concept.md`).** Two distinct primitives:
- **Code substrate** — the git repository where a coding agent's files physically live and accrue history. **Local-first, forge-optional**: a plain git working copy on disk / in the sandbox. Cardinality (Contract): **exactly one working copy per unit of work; 0..1 connected forge** (GitHub/GitLab) as an optional remote.
- **Connected system (forge)** — the optional remote git host, reached as an **AN Connection** (auth seam). The repo's *identity/location/branch/working-copy* are code-substrate data; the *push/PR/merge auth* rides an AN Connection. The two compose; neither reduces to the other.
- **Landing** — the operative act (merge/push/deploy/publish) that takes an accepted descriptive code diff live, modeled as an **operative artifact carrying an AL7 Staged Operation, behind a review**. HyperIdle is trigger + gate; the forge/CI is executor. "Code is git-derived, never HyperIdle-stored-of-record."

**Concept status.** The load-bearing nouns (Code substrate, Connected system, Landing) and the cardinality/landing contracts are **LOCKED** in `plans/AN/boundary-concept.md`. Per-WP concept work that remains is narrow and is noted on each WP. Two genuine open decisions are carried as **DECISION-NEEDED** flags below (polyrepo-per-unit-of-work; where multi-repo *association* lives) — resolve in `/concept AO1`, not in this spec.

**What the code actually does today (verified, not docs).**
- Session sandbox is a bare `mkdir` — no repo is ever placed in it (`local-sandbox-adapter.ts:74-81`); `spawn()` mints a **unique per-session leaf** `local-sb-<n>-<ts>` / `docker-sb-<n>-<ts>` under one global base, and destroy/TTL-reaper are scoped to that leaf (`sandbox-reaper.ts:97-118`). **Sessions are already filesystem-isolated from each other** — team identity never enters the sandbox path.
- `GitRunner` is **export-only** — `init/add/commit/push/status`, **no `clone`/`fetch`/`checkout`** anywhere (`git-export-runner.ts:18-41`). The only git today exports *knowledge* docs to one global repo, not code.
- The harness descriptor declares **no git capability** (`fileEditing/toolUse/mcpSupport/modelProviders` only — `harness-capability-descriptor.ts`); HyperIdle cannot delegate the clone to the harness within its own model.
- No agent→connection / task→connection / agent→tool association exists; tools attach by **role**, MCP attaches **per-session inbound-only** (`session-provisioning.ts:612-617,696-709`). AN1's `ServiceConnectionResolver` has **zero production callers** (test-only) — Connections are not yet wired into sessions.
- The `code_diff` review canvas + `code` artifact kind exist but are **fed by hand-written fixtures**; `GET /api/reviews/:id` is a pure fixture (`reviews.ts:4-65`). **AL7** (review→act execution loop) is built but **UNMERGED** (branch `concept/AL7-review-execution-loop`, not on `main`).

**Scope rules.** The code-substrate working copy, its materialization into the session sandbox, and the code diff → Landing path. Out of frame: the connected-system/forge auth mechanism (Track AN), the review *experience*/verdict semantics and the operative-call loop (Track AL / AL7), agent equipping/skill-repertoire (see "Adjacent, not in AO" below). `npm run verify` must pass after each WP merges.

**Reference docs (concept) + code seams:** `plans/AN/boundary-concept.md`, `plans/AN/concept.md`, `plans/AL7/concept.md`, `docs/architecture/system-boundary.md`. Code: `packages/server/src/harness/local-sandbox-adapter.ts`, `packages/server/src/services/session-provisioning.ts`, `packages/fabric/src/services/git-export-runner.ts`, `packages/server/src/routes/reviews.ts`, `packages/web/src/pages/review/review-artifact.ts`.

---

### AO1 — Code substrate: a per-unit-of-work git working copy

**Workpackage.** As a founder running a flat human+agent team, I want a unit of work (a bet/task an agent picks up) to reference a code substrate — a git repository, local-first with an optional remote forge — drawn from the repositories my org/team has made available, so that an agent has a real codebase to edit and a second unit of work can target a different product without one overwriting the other. Today there is no code substrate at all; this makes "the repo this work happens in" a first-class, selectable thing, with forge auth supplied by an existing Connection rather than re-modeled here.

**Founder Q (kept).** *"As per AN tracking even a repo would be an external connection or not? does it even make sense that repo count is built into the kernel?"* — **Resolved (code + locked concept):** A repo is **not** an AN Connection. `serviceConnections` (`schema.ts:1087-1120`) models per-user *credential availability* (`harness|token|mcp-oauth`) with no field for a working copy/clone-URL/branch. The boundary concept (`boundary-concept.md:29-30,97`) separates **Code substrate** (the working copy — this WP) from the **Connected forge** (the optional remote — an AN Connection). So multiple repos *associated* to an org/team is a list to draw from; the **forge** side of each rides AN; the **working copy** is code-substrate data. Repo "count" is not a kernel primitive — the substrate *reference on a unit of work* is.

**Why this matters.** This is the foundation of both self-hosting and multi-product use. Without a code substrate, an agent has nothing to edit (the sandbox is an empty dir) and the instance has no notion of "which product this work touches." Every downstream AO WP (materialize, diff, land) has nothing to bind against until a unit of work can reference a substrate. Cost of not building it: HyperIdle can plan and discuss code work but never perform it, and can never address more than the single global git target it has today.

**What exists today.** `teams` exist (renamed from *Product*) and carry knowledge-doc paths; `create_team`'s `repoPath` input is mapped to `factoryDbPath` (the knowledge DB path) — a conflation, not a code binding. The only git binding is the single global `git_export.*` knowledge-export config in `factory_settings` (no `teamId`). AN1 ships a per-user Connection vault (`serviceConnections`) but it is not wired into sessions. There is no code-substrate record, no per-unit-of-work repo reference, and no inbound git capability (`GitRunner` is export-only).

**What's genuinely missing.** A code-substrate record (repo identity + local path / clone URL + branch + a `0..1` reference to the AN forge Connection that supplies its auth), the ability for an org/team to make repositories available, and the reference that ties a unit of work to the substrate it happens in — none of which `serviceConnections` or `teams` can express today.

**Depends on.** None — it is the foundation the rest of the track binds against. (Forge auth *composes with* AN Connections but does not block: a purely local substrate needs no forge.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Light — the Code-substrate noun and its cardinality are LOCKED in plans/AN/boundary-concept.md. Run a focused /concept AO1 only to settle the two DECISION-NEEDED items (below) and the substrate-record shape + where the unit-of-work reference lives (task / bet / agent / team).`
- **Design:** `Required — a novel make-a-repo-available / pick-the-repo-for-this-work surface (associate, inspect, select, remove); /design multi-variant + human review.`

**Human design review.** Yes — introduces a new user-facing surface for associating repositories and selecting one for a unit of work; its shape and placement are what's being decided.

**DECISION-NEEDED (resolve in /concept AO1, do not pre-resolve here):**
- Does a single unit of work ever span **multiple** repos (polyrepo)? The locked contract says *exactly one working copy per unit of work*; the founder wants "multiple repos to org and team" — reconcile association (many available) vs materialization (one per unit) and decide whether polyrepo-per-unit is in or out.
- Does repository **association** live at the **org** level, the **team** level, or both?

**Acceptance criteria.**
- A founder can make one or more git repositories available to their org/team and afterward see them listed, each showing its branch and whether it is currently reachable.
- A unit of work can reference exactly one of the available repositories as the code substrate the work happens in, and that reference is visible on the work.
- Two units of work can reference different repositories at the same time; selecting or changing one never alters another's.
- A repository's optional remote forge draws its push/clone auth from an existing Connection rather than a credential re-entered here; a local-only repository needs no forge and still works.
- An unreachable or unauthenticated repository surfaces as needing attention rather than failing silently.

**Validation scenarios.**
- Given an org/team with repositories made available, when a founder opens a unit of work, then they can select one of those repositories as its code substrate and see the selection.
- Given two units of work referencing different repositories, when one's substrate is changed, then the other's is unchanged.
- Given a repository whose forge Connection is missing or expired, when a founder views it, then it is shown as needing attention.
- Given a local-only repository (no forge), when it is referenced by a unit of work, then the work proceeds without any forge auth.

**Plan calls.** Run a focused `/concept AO1` (settle the DECISION-NEEDED items + record shape) — the core noun is already locked, so this is refinement, not a from-scratch concept. Then `/design` the make-available / select surface (novel → human review; forks — where association lives, how selection is presented, single vs multi-repo — decided by rendered variants). Standard `/architecture` after, modelling the substrate record and its unit-of-work reference, with forge auth resolved via the AN Connection seam.

**Contracts / constraints.** Code substrate and forge Connection are distinct: the substrate holds repo identity/location/branch; the forge auth resolves through AN Connections (the invariant: no forge credential is re-modeled or stored on the substrate record, and none is exposed in any agent-facing surface). One unit of work references exactly one working copy (per the locked cardinality, pending the polyrepo decision). Local-first: a substrate functions with no forge. Forward-only migration if persisted.

**Out of scope.** Materializing the substrate into a sandbox (AO2). Deriving the diff or Landing (AO3). The forge auth mechanism itself (Track AN). Equipping the agent with skills (see "Adjacent, not in AO").

**Effort.** L (~5d)

---

### AO2 — Materialize the code substrate into the session sandbox

**Workpackage.** As the system running a coding session, I want the unit of work's referenced code substrate cloned into that session's sandbox at the right branch, so the coding harness can read, edit, and run the product's real source and tests instead of an empty directory. The sandbox is already private to the session, so this is a plain clone/checkout into it — not a shared git worktree.

**Founder Q (kept).** *"is a working-tree a worktree or what is that working-tree? … not sure we need worktrees in the sandbox."* — **Resolved (code):** "Working tree" = git's checked-out files (vs the `.git` history). We do **not** need git *worktrees*: each session already gets its **own** sandbox leaf (`local-sandbox-adapter.ts:75-77`; destroy/reaper scoped per-leaf), so a plain **clone/checkout into the session sandbox** is correct and simplest. *"if we have that external connection repo X, then we need repo X in the sandbox"* — exactly: that placement is what's missing (`spawn()` is a bare `mkdir`; `GitRunner` has no `clone`/`fetch`/`checkout`).

**Founder Q (kept).** *"during workplanning we need to decide what connections are relevant for that task so they are attached for session materialization … or attach the external connections like the repo to the agent … tools, skills, mcp are also attached to an agent? depending on the harness that connection might even be at the harness level?"* — **Resolved (code):** None of that attachment exists yet. Tools attach by **role** at provision (`session-provisioning.ts:612-617`), MCP **per-session inbound-only** (`:696-709`); there is **no agent→connection / task→connection association** in the schema, and the harness declares no git capability. So the natural, locked seam is **materialize at the session/sandbox boundary, per unit of work** — the unit of work's AO1 substrate reference (and its forge Connection) is what gets materialized. Whether the *selection* is made at work-planning (per task) or carried on the agent is the AO1 reference-placement decision.

**Why this matters.** This is the keystone of self-hosting. Today even though Claude Code is detected with `fileEditing: true`, the sandbox holds only read-only knowledge files, so the agent can plan code but not write it. With the substrate cloned in, the agent edits real source and runs the project's checks — the "interact" step of plan→interact→review becomes real for code. Cost of not building it: agents can never perform software work.

**What exists today.** Session provisioning spawns a per-session sandbox (`spawn()` = `mkdir`, unique leaf), then writes knowledge/context + `AGENTS.md`/`CLAUDE.md` into it; the adapter exposes `exec()` and the harness runs with `cwd: sandboxPath`. `GitRunner` exists but is export-only (no inbound git). No step places a code repository into the sandbox.

**What's genuinely missing.** A provisioning step that clones/checks-out the unit of work's referenced substrate (AO1) into the session's sandbox at its branch before the harness runs — plus the inbound-git capability (`clone`/`fetch`/`checkout`) and inbound auth that `GitRunner` lacks today.

**Depends on.** AO1 — there must be a substrate reference on the unit of work to materialize; without it there is no repo to clone.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — consumes the locked Code-substrate noun and the existing Session/Sandbox primitives.`
- **Design:** `Not required — sandbox/runtime provisioning mechanism; no rendered surface.`

**Human design review.** No — backend provisioning mechanism; no new user-facing component.

**Acceptance criteria.**
- When a coding session starts for a unit of work with a referenced substrate, the agent's sandbox contains that repository's working tree at the configured branch and the agent can read its files.
- The agent can modify files in the working tree and run the repository's own build/test commands against them within the session.
- A session for a unit of work with no referenced substrate still provisions and runs (no working tree), rather than failing.
- The working tree reflects the substrate's current state at session start, not a stale or empty copy.
- No repository or forge credential is present in the sandbox environment or files.

**Validation scenarios.**
- Given a unit of work with a referenced substrate, when a coding session starts, then the sandbox contains the repository's files at the configured branch and the agent can list/read them.
- Given a running session with a materialized tree, when the agent edits a file and runs the project's test command, then the edit is present and the command runs against the tree.
- Given a unit of work with no substrate, when a session starts, then it provisions with no working tree and the agent's internal tools still work.
- Given a running session, when the sandbox environment and files are inspected, then no repository/forge secret is present.

**Plan calls.** Skip `/design`. Standard `/architecture` — the materialization step in session provisioning and the inbound-git capability (clone/checkout at the bound branch), reusing or extending the existing `GitRunner` shape. Live-proof: materialize and edit a real repository end-to-end in a session before `done` (a stub sandbox is not proof).

**Contracts / constraints.** Plain clone/checkout into the already-isolated per-session sandbox — no shared worktrees. No repository/forge credential enters the sandbox (consistent with the boundary's "code is git-derived" + AN's no-secret-in-sandbox stance; auth is applied by the system at clone, not handed to the agent). A substrate-less unit of work degrades to today's behavior, not an error. Materialization is driven by the unit-of-work reference (AO1), never a global path.

**Out of scope.** Turning edits into a diff/branch/PR or landing them (AO3). The substrate reference/record (AO1). Choosing/installing the harness (Track AM). Sandbox isolation between sessions (already solved — not a gap).

**Effort.** L (~5d)

---

### AO3 — Code diff as a descriptive review artifact, Landing as an operative one

**Workpackage.** As a founder reviewing what an agent built, I want the agent's edits in the session's working copy to surface as a **code diff I can review**, and approving it to be able to **land** the change (push / open a PR / merge) through the connected forge — so that code flows through the same plan→review→**act** loop as every other kind of work, with the merge performed by the system, never the agent. This is the boundary concept's "read diffs in, route Landing out," made real and replacing today's hand-assembled fixture diff.

**Founder Q (kept).** *"This seems like a lot of overlap with AL7 … but a lot depends on AL7."* — **Resolved (code):** No overlap with AL7's core. AL7 is **operative-call** centric (captures an irreversible *tool call*, re-executes on approve) and **explicitly excludes** descriptive artifacts — "a code diff … does not 'execute' on approve" (`TRACK-AL.md:270`). AO3 supplies the **descriptive** half AL7 leaves out (the diff, derived from the working copy) **plus** the **Landing** operative artifact whose Staged Operation AL7 carries. So AO3 *depends on* AL7 (which is **unmerged** today — `concept/AL7-review-execution-loop`) and on the review/artifact persistence path (today `GET /api/reviews` is a fixture, `reviews.ts:4-65`), but is not duplicated by it. The `code_diff` canvas + `code` artifact kind already exist (fixture-fed); AO3 makes them real.

**Why this matters.** Without it, AO2's edits evaporate when the sandbox is torn down and review has no code artifact to gate — the dogfooding loop never completes. With it, the agent's real diff becomes a first-class review object and "approve" gains teeth for code: a landing the system triggers through the forge. Cost of not building it: agents can edit code but nothing durable, reviewable, or landable comes out.

**What exists today.** AO2 yields a materialized working copy the agent edits. `GitRunner` provides `add/commit/push` (export path). `ARTIFACT_KINDS` includes `code`, and a `code_diff` review canvas with a PR-shaped payload exists (`review-artifact.ts`, `ReviewCodeDiff.tsx`) — but it is fed by a hand-written fixture and `GET /api/reviews/:id` reads no DB. AL7 (unmerged) defines the Staged-Operation/landing seam and its at-most-once/outcome contracts. There is no path from a session's working-copy changes to a derived diff artifact, and no Landing.

**What's genuinely missing.** Derivation of the code diff from the session's working copy as a persisted **descriptive** review artifact (replacing the fixture), and a **Landing** operative artifact (push/PR/merge through the forge Connection) that approve triggers via AL7 — with the system, not the agent, holding the merge credential.

**Depends on.** AO2 — there must be a materialized working copy with edits to diff. AL7 — Landing is an AL7 Staged Operation; AO3's operative artifact is gated and executed through AL7's loop, so AL7 must be merged and is the proof seam. (Also rides the review/artifact persistence path; if `GET /api/reviews` is still a fixture, that real-read is part of AL7's landing.)

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — consumes locked nouns: Code substrate (AO), Descriptive/Operative artifact + Staged Operation + Landing (plans/AL7 + boundary-concept.md).`
- **Design:** `Light — the diff renders through the existing code_diff canvas; placing the real (non-fixture) artifact + the Landing action is single-variant /design, no human-review park.`

**Human design review.** No — reuses the established review/artifact rendering; a novel code-review canvas, if any, is Track AL's call.

**Acceptance criteria.**
- When an agent makes changes in a coding session's working copy, those changes surface as a code-diff review artifact a founder can open, showing what changed — derived from the working copy, not a fixture.
- A code diff that an agent produced with no changes yields no empty artifact and no spurious landing.
- Where the substrate has a connected forge, approving the diff can land the change (push / open a PR / merge) through that forge, performed by the system — the agent never holds the merge/push credential.
- A purely local substrate (no forge) still produces a reviewable diff; landing degrades to a local commit/branch with no remote step.
- Landing inherits at-most-once execution and surfaces its outcome (success/failure) rather than failing silently.

**Validation scenarios.**
- Given a session in which the agent edited files, when it completes, then a code-diff artifact derived from the working copy is reviewable and identifiable to that unit of work.
- Given a substrate with a connected forge, when a founder approves the diff, then the system lands the change through the forge (push/PR/merge) and the outcome is recorded; the agent holds no credential.
- Given a session that changed nothing, when it completes, then no artifact, branch, or PR is created.
- Given a local-only substrate, when a diff is approved, then it lands locally (commit/branch) with no remote operation.

**Plan calls.** Skip `/concept`. `/design` is light (place the real diff artifact + Landing action in the existing review surfaces, single variant). Standard `/architecture` for diff derivation from the working copy and the Landing operative artifact wired as an AL7 Staged Operation through the forge Connection. Live-proof: a real session's edits become a real reviewable diff and a real landing before `done`. **Sequencing:** AL7 must be merged first (it is the landing seam and proof vehicle).

**Contracts / constraints.** The code diff is **descriptive** (approve accepts), Landing is a **distinct operative** artifact (approve/ follow-up triggers its Staged Operation) — per the founder's locked landing-behind-review decision. The agent never executes the side-effect; the system triggers the forge, which executes and returns an Outcome (at-most-once, idempotent, failure surfaced — AL7). Code is **git-derived**, never HyperIdle-stored-of-record. No empty/no-op artifacts or landings. Local-first: works with no forge.

**Out of scope.** AL7's operative-call loop itself and any new review canvas (Track AL). Materializing the working copy (AO2). The substrate reference (AO1). CI status integration on the PR.

**Effort.** L (~5d)

---

### AO4 — Per-team knowledge-export target

**Workpackage.** As a founder running more than one product in one HyperIdle instance, I want each team's knowledge export to publish to that team's own repository rather than all teams sharing one global export target, so that exporting one product's knowledge cannot overwrite or entangle another's. This is the narrow, genuine multi-project residual — distinct from code builds, which are already isolated.

**Founder Q (kept).** *"why would these build collide? … isn't each session its own sandbox?"* — **Resolved (code):** It wouldn't — you were right. Sandboxes are **already** per-session isolated (unique `local-sb-/docker-sb-<n>-<ts>` leaves; scoped destroy/reaper; team never in the path — `local-sandbox-adapter.ts:75-77`, `sandbox-reaper.ts:97-118`). Concurrent code builds cannot collide on disk. The original "multi-project isolation" WP was a non-issue and is **dropped**. The *only* genuinely shared resource is the single global **knowledge-export** target (`git_export.*` in `factory_settings`, `computeExportPlan` with no team filter — `git-export.ts:205-232`) — and that is knowledge docs, not code. This WP is that narrowed fix only.

**Why this matters.** With one global export repo, two products' knowledge publishes into one shared tree and any team's export rewrites the whole repo. Moving the export target per-team lets each product own its knowledge mirror. Cost of not building it: multi-product knowledge export stays entangled. (Lower priority than AO1–AO3 — code development is the blocker; this is a knowledge-layer tidy.)

**What exists today.** `git-export-config.ts` reads a single global `git_export.repo_path`/`remote_url`/`branch` from `factory_settings` (no `teamId`); `computeExportPlan(db)` selects across all teams with no team filter, routing each into `products/<scopeId>/…` within the one repo; one `GitRunner` per repoPath, guarded by a per-repoPath mutex (`git-export.ts:269-293`).

**What's genuinely missing.** Per-team export configuration (target repo/branch) and a team-scoped export plan, so each team's export runs against its own repository rather than the single global one.

**Depends on.** None strictly (operates on the existing export layer); benefits from AO1's per-team repository association if the export target is drawn from it.

**Complexity.** M

**Pre-build gates.**
- **Concept:** `Not required — extends the existing knowledge-export config; no new noun.`
- **Design:** `Not required — config/backend; the per-team export setting extends existing settings surfaces.`

**Human design review.** No — configuration/backend; no new base component.

**Acceptance criteria.**
- Each team can have its own knowledge-export target (repository/branch), and exporting one team's knowledge writes only to that team's target.
- A knowledge export triggered for one team does not commit or push to another team's repository.
- With no per-team target configured, export behavior is unchanged from today (back-compatible default).

**Validation scenarios.**
- Given two teams with different export targets, when team A's knowledge changes and exports, then only A's repository receives the commit.
- Given a team with no configured target, when its knowledge changes, then export behaves as it does today.
- Given concurrent exports for two teams, when both run, then each writes only its own repository.

**Plan calls.** Skip `/design`. Standard `/architecture` — move `git_export.*` to a per-team scope and add a team filter to `computeExportPlan`; the runner/mutex is already repoPath-keyed and handles multiple targets once config fans out.

**Contracts / constraints.** Per-team export target; no all-teams-at-once commit against one repo. Back-compatible default when unconfigured. Forward-only migration if the per-team setting is persisted.

**Out of scope.** Code-substrate materialization or landing (AO1–AO3). Sandbox isolation (already solved). Any change to what knowledge is exported.

**Effort.** M (~1d)

---

## Adjacent, not in AO — surfaced for placement

**Strategy-injected skill / plugin repertoire ("souls/plugins").** Founder note on AO3: *"via the strategy include some initial skills, prompts, souls … inserting parts of our pipeline skills as the starting point for the agents … maybe call those plugins instead of strategy."* Code research: prompt/identity injection **exists** and is Strategy-owned (AK6 — `scaffoldAgents → AgentScaffoldSpec.systemPrompt → users.systemPrompt → assemblePrompt → AGENTS.md/CLAUDE.md`), but injecting **operating skills/procedures** (the pipeline `/concept`,`/design`,`/write-code` repertoire) as an agent's starting capability is **unbuilt** — `userSkills` is a routing tag, not a procedure store. The closest seam is extending `AgentScaffoldSpec` (a Strategy-chosen skills/plugins field) + `context-assembly-prompt.ts` to materialize selected skills into the sandbox (as AGENTS.md is). This is a real WP but it concerns **agent equipping**, not the code substrate — it belongs under the Strategy/agent track (AK family) or a new track, **not AO**. Flagged for the founder to place; not registered here.
