# Track AO: Codebase Development Substrate

Source: the product-deep-review of 2026-06-24 (focus: *what is still missing to use HyperIdle to develop HyperIdle itself, and to develop two other similarly-shaped products?*). Findings PDR-0001 and PDR-0002 surfaced that the path from an agent session to a real product codebase is unbuilt: when an agent picks up a Task/Bet, session provisioning does `mkdir` + writes read-only knowledge context, and **no product repository is ever cloned, worktree'd, or mounted into the sandbox**. The coding harness is reachable and ready (`GET /api/harnesses` reports Claude Code present, `fileEditing: true`), but it has no working tree to edit. Separately, the only git binding that exists is a **single global** knowledge-export config (`git_export.*` in `factory_settings`) plus a single global sandbox base path — so even if a repo were mounted, two products could not be developed side by side. This track builds the substrate that lets agents develop real software products — including HyperIdle itself — across multiple repositories.

**Why a separate track.** This is a distinct subsystem from external tool integration (Track AN) and the review *experience* (Track AL). Track AN brokers **external MCP tools** to a session and explicitly keeps secrets and repos *out* of the sandbox (AN3); it never gives an agent a product working tree. Track AL renders and gates **review** of agent output; it assumes an artifact already exists. Track AO builds the missing middle: the team-owned **Repository**, its materialization into the session sandbox so a coding harness can edit source and run tests, the branch/PR output that AL7 then gates, and the per-team isolation that makes concurrent multi-project work possible. It shares AL7's review→act seam (AO3 feeds it) but otherwise has no code seam with AN/AL and can proceed in parallel.

**Concept status — FLAGGED.** The overall track concept is **not yet locked**. There is no `docs/` ground-truth defining the product **Repository / Codebase** as a primitive, and the relationship between it and the existing **Team** (renamed from *Product*), the knowledge **git-export** mirror, and the **Sandbox** is undecided. Open conceptual questions a track-level `/concept AO` must resolve before AO1 is architected:
- Is the bound thing a single git **Repository** (1:1), or a **Project/Codebase** that may span repos (polyrepo)? What is the load-bearing noun and its rejection list?
- How does it relate to **Team** (was *Product*)? Does a repo bind to a Team directly, or is there a separate Project entity a Team owns? (Note: `create_team` already accepts a `repoPath`, but it is mapped to `factoryDbPath` — the *knowledge* DB path — not a product code repo. The existing field is a conflation, not a binding.)
- Is the product code repo the **same** repo as the `git_export` knowledge mirror, or a **separate** one? (The export writes `factory/…` and `products/<teamId>/…` knowledge docs — almost certainly a different repo from the product source.)
- What is the relationship between a **Session/Sandbox** (ephemeral) and the **Repository** (durable) — clone, worktree, or persistent checkout reused across sessions?

Register the WPs below outcome-level (the observable outcomes are stable regardless of how the noun is modeled), but **run `/concept AO` first** to lock the Repository noun before AO1's `/architecture`. AO1 is marked `Concept: Required` accordingly.

**Scope rules.** Product codebase development only — binding repositories to teams, materializing working trees into sandboxes, producing review-ready branches, and isolating concurrent projects. Out of frame: the review *experience* and verdict semantics (Track AL), external MCP tool brokering and credential connections (Track AN), and the conversation/session-view surfaces (Track AM). `npm run verify` must pass after each workpackage merges.

**Reference docs:** `docs/architecture/system-boundary.md`, `docs/architecture/credential-model.md`, `docs/process-layer/` (Sessions, Tasks, Bets), `packages/fabric/src/services/git-export-config.ts`, `packages/fabric/src/services/git-export-runner.ts`, `packages/server/src/services/session-provisioning.ts`, `packages/server/src/harness/local-sandbox-adapter.ts`, `packages/server/src/harness/claude-agent-sdk-adapter.ts`. Dependency graph: `.pipeline/work-packages/dependency-graph.md` (if present).

---

### AO1 — Repository as a per-team primitive

**Workpackage.** As a founder running a flat human+agent team, I want to bind one or more code repositories to a team — and have each team's repository, branch, and workspace settings be its own rather than a single setting shared by the whole instance — so that a team has a real codebase to develop and a second team can develop a different product without overwriting the first. Today "team" is an org grouping with no codebase of its own; this makes the repository a first-class thing a team owns, manages, and an agent can later be given.

**Why this matters.** This is the foundation of both self-hosting and multi-project use. The founder benefits directly: without per-team repository binding, the instance can target exactly one repo (the global `git_export` config), so HyperIdle cannot host its own build *and* a second product at once — registering a second repo overwrites the first. Every downstream AO workpackage (materialize the tree, produce a branch, isolate concurrent work) has nothing to bind against until a team owns a repository. The cost of not building it: HyperIdle stays a single-project instance and can never develop more than one codebase.

**What exists today.** Teams exist as first-class entities (`teams` table: `name`, `phase`, `briefPath`, `architecturePath`, …) and carry knowledge-doc paths. `create_team` accepts a `repoPath` input but maps it to `factoryDbPath` — the knowledge DB path, not a product code repo (a conflation, not a binding). The only git binding in the system is a **single global** config — `git_export.repo_path` / `remote_url` / `branch` stored as flat keys in `factory_settings` (no `teamId`), read by `git-export-config.ts` — and it targets a knowledge-export mirror, not product source. There is no per-team repository record and no surface to manage one.

**What's genuinely missing.** A per-team repository binding — the durable record that "team T develops repository R on branch B, with its own workspace settings" — and a surface to add, inspect, and remove it, distinct from the global knowledge-export config and from the `factoryDbPath` conflation.

**Depends on.** None — it is the foundation the rest of the track binds against.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Required — run /concept AO (track-level) then /concept AO1 first. Introduces a load-bearing noun (Repository / Codebase / Project) and its relationship to Team, git-export, and Sandbox — none of which is locked in docs/ today.`
- **Design:** `Required — a novel manage-a-team's-repository surface (bind, inspect, remove); /design multi-variant + human review.`

**Human design review.** Yes — introduces a new user-facing surface for binding and managing a team's repository; its shape and where it lives are what's being decided.

**Acceptance criteria.**
- A founder can bind a code repository to a team and afterward see it listed as that team's repository, with its branch and current binding state shown.
- A founder can change or remove a team's repository binding, and the change is scoped to that team only.
- Two teams can each have a different repository bound at the same time, and binding or changing one team's repository never alters another team's.
- A team's repository binding is distinct from, and does not overwrite, the instance-wide knowledge-export configuration.
- A repository binding records whether it is currently usable (e.g. reachable / authenticated), surfacing an unreachable or unauthenticated repository as needing attention rather than failing silently.

**Validation scenarios.**
- Given a team with no repository, when a founder binds one, then it appears as that team's repository with its branch and state.
- Given two teams each with a repository bound, when a founder changes team A's repository, then team B's repository is unchanged.
- Given a bound repository that cannot be reached, when a founder views the team's repository, then it is shown as needing attention.
- Given a team repository is bound, when the founder inspects the instance knowledge-export config, then it is a separate setting unaffected by the team binding.

**Plan calls.** Concept-introducing — run `/concept AO` (track-level, to lock the Repository noun and its relationship to Team/git-export/Sandbox) and `/concept AO1` before any architecture. Then `/design` the manage-a-repository surface (novel → human review; the direction forks — does the binding live on the team's Work surface vs Settings, single-repo vs multi-repo per team, how branch/state are presented — are decided by rendered variants, not prose). Standard `/architecture` after concept + design lock, moving repository/workspace config off the global `factory_settings` singleton onto a per-team scope.

**Contracts / constraints.** A team's repository binding is per-team and never global; one team's binding is never readable as another's. The instance-wide knowledge-export config remains a separate setting and is not merged with the product-repository binding. No secret required to *bind* a repository is ever exposed in any agent-facing surface (auth mechanics ride existing credential/connection infrastructure). Forward-only migration if the binding is persisted.

**Out of scope.** Materializing the repository into a session sandbox (AO2). Producing branches/PRs from agent work (AO3). Concurrent-project isolation guarantees (AO4). The credential/auth mechanism for reaching a private repo (rides existing credential-model / Track AN connections).

**Effort.** L (~5d)

---

### AO2 — Working-tree materialization into the agent sandbox

**Workpackage.** As the system running a coding session for a team, I want the agent's sandbox to contain a working tree of that team's bound repository — so that the coding harness can read, edit, and run the product's real source and tests instead of an empty directory with only knowledge documents. This is the keystone that turns an agent from a domain-object manipulator into something that can actually write code.

**Why this matters.** This is THE blocker to using HyperIdle to build software. Every agent, the founder, and the whole self-hosting goal benefit: today an agent session is a bare directory plus read-only knowledge files, so even though the Claude Code harness is detected and reports `fileEditing: true`, it has no source to edit, no tests to run, and produces no code change. With the bound repository's tree materialized into the sandbox, an agent can make real edits and run the product's checks. The cost of not building it: HyperIdle can plan and discuss software work but can never perform it — the "interact" step of plan→interact→review is hollow for code.

**What exists today.** Session provisioning (`session-provisioning.ts`) spawns a sandbox via the workspace adapter, whose `spawn()` (`local-sandbox-adapter.ts`) does `mkdir` and nothing more; context assembly then writes knowledge items + system prompt into that directory read-only. The sandbox adapter exposes `exec()` (run a shell command in the sandbox) and the Claude Code adapter runs with `cwd: sandboxPath`. A `GitRunner` abstraction exists (`git-export-runner.ts`) for the knowledge-export path. There is no step that clones, worktrees, or otherwise places a product repository into the sandbox during provisioning — verified by absence of any `clone`/`worktree`/`checkout` in the session path.

**What's genuinely missing.** A provisioning step that materializes the team's bound repository (AO1) as a working tree inside the session's sandbox before the harness runs, so the agent operates on real source — plus the decision of whether that is a fresh clone, a shared-repo worktree, or a reused persistent checkout.

**Depends on.** AO1 — there must be a per-team repository binding to materialize before a tree can be placed in the sandbox; without it there is no repository to clone.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — consumes the Repository noun locked by /concept AO/AO1 and the existing Session/Sandbox primitives (docs/process-layer/).`
- **Design:** `Not required — sandbox/runtime provisioning mechanism; no rendered surface.`

**Human design review.** No — backend provisioning mechanism; no new user-facing component.

**Acceptance criteria.**
- When a coding session starts for a team with a bound repository, the agent's sandbox contains a working tree of that repository at the team's branch, and the agent can read its files.
- The agent can modify files in the working tree and run the repository's own build/test commands against them within the session.
- A session for a team with no bound repository still provisions and runs (with no working tree), rather than failing.
- The working tree reflects the bound repository's current state at session start (not a stale or empty copy).
- Materializing the working tree does not place any repository credential or secret into the sandbox environment or files.

**Validation scenarios.**
- Given a team with a bound repository, when a coding session starts, then the sandbox contains the repository's files at the configured branch and the agent can list and read them.
- Given a running session with a materialized tree, when the agent edits a file and runs the project's test command, then the edit is present and the command executes against the working tree.
- Given a team with no bound repository, when a session starts, then it provisions successfully with no working tree and the agent's internal tools still work.
- Given a running session, when the sandbox environment and files are inspected, then no repository secret is present.

**Plan calls.** Skip `/design` (no surface). Standard `/architecture` pass — the materialization step in session provisioning, the clone-vs-worktree-vs-persistent-checkout decision (design-it-twice on the tree lifecycle), and how the bound branch is checked out. This is a live-proof workpackage: it must materialize and edit a real repository end-to-end in a session before it is `done` (a stub/fixture sandbox is not proof).

**Contracts / constraints.** No repository credential or secret enters the sandbox (consistent with the capability-split / no-secret-in-sandbox invariant Track AN holds). A session for a repository-less team degrades to today's behavior, not an error. The working tree is the bound repository at the bound branch. The materialization is driven by the per-team binding (AO1), never a global path.

**Out of scope.** Committing the agent's edits to a branch or opening a PR (AO3). Isolation guarantees between concurrent sessions/teams (AO4). The repository binding itself (AO1). Choosing or installing the coding harness (Track AM).

**Effort.** L (~5d)

---

### AO3 — Agent code output becomes a review-ready branch

**Workpackage.** As a founder reviewing what an agent built, I want an agent's edits in a session's working tree to be captured as a named branch (and, where a remote exists, a pull request) that I can open and review — so that the code an agent writes flows into the same plan→interact→**review**→repeat loop as everything else, instead of evaporating when the sandbox is destroyed. This closes the loop for code: an agent does the work, and its diff arrives as a reviewable artifact.

**Why this matters.** Without this, AO2's edits are lost when the ephemeral sandbox is torn down, and the review surfaces (Track AL) have no code artifact to gate. The founder and the reviewer benefit: the agent's actual diff becomes a first-class review object on a branch/PR, and AL7's review→act execution loop gets real code operations to approve. The cost of not building it: agents can edit code in a session but nothing durable comes out, so the work cannot be reviewed, merged, or shipped — the dogfooding loop never completes.

**What exists today.** AO2 materializes a working tree the agent edits. A `GitRunner` abstraction (`git-export-runner.ts`) already wraps a whitelisted set of git subcommands (init, add, commit, push, status) for the knowledge-export path. Sessions produce artifacts and an activity record (`SessionActivityPanel`, `useSessionActivity`). AL7 (review execution loop) defines how a staged operation is gated and executed. There is no path that turns a session's working-tree changes into a committed branch or a PR, and no review artifact representing an agent's code diff.

**What's genuinely missing.** A step that commits a session's working-tree changes to a branch named for the session/task, pushes it where a remote is bound, and surfaces the resulting diff/PR as a review artifact that the review surfaces and AL7 can act on.

**Depends on.** AO2 — there must be a materialized working tree with agent edits before there is anything to commit. AL7 — the resulting code change is reviewed and acted on through AL7's review→act execution loop; AO3's branch/PR is the operation AL7 gates, so the proof of "review-ready" runs through AL7's loop.

**Complexity.** L

**Pre-build gates.**
- **Concept:** `Not required — consumes the Repository noun (AO/AO1), the Session/Artifact primitives (docs/process-layer/, docs/blocks/), and AL7's Staged Operation.`
- **Design:** `Light — the agent's code diff renders through the existing review proof-family / artifact surfaces (AL2); placing the branch/PR artifact is a single-variant /design, no human-review park.`

**Human design review.** No — reuses the established review/artifact rendering; no new base component (a code-diff review canvas, if novel, is decided in Track AL, not here).

**Acceptance criteria.**
- When an agent makes changes in a coding session's working tree, those changes are captured on a branch identifiable to the session/task that produced them.
- Where the team's repository has a remote, the branch is pushed and a pull request (or equivalent change-request) is opened against the team's configured branch.
- The agent's diff is surfaced as a review artifact a founder can open from the work/review surfaces, showing what changed.
- A session that makes no changes produces no empty branch or spurious pull request.
- Acting on the reviewed change (approve/merge or reject) flows through the review→act loop rather than an ad-hoc path, with the agent never holding the merge credential.

**Validation scenarios.**
- Given a session in which the agent edited files, when the session completes, then a branch with those changes exists and is identifiable to that session/task.
- Given a team repository with a remote, when a session produces changes, then a pull request is opened against the team's branch and is reachable from the review surface.
- Given a session that changed nothing, when it completes, then no branch or pull request is created.
- Given an opened change, when a founder approves it through the review loop, then the merge is carried out by the system (not the agent) following AL7's gate.

**Plan calls.** Skip `/concept`. `/design` is light — place the code-diff review artifact in the existing review/artifact surfaces (single variant). Standard `/architecture` for the commit→branch→push→PR path and its wiring as an AL7-gated operation. Live-proof: prove a real session's edits become a real branch/PR end-to-end before `done`.

**Contracts / constraints.** The agent never holds the credential that pushes or merges — push/merge are system-performed, consistent with AL7's capability split. Acting on a code change inherits AL7's gate (at-most-once, outcome surfaced). No empty/no-op branches or PRs. The branch targets the team's bound branch (AO1). Diff rendering reuses the established review/artifact family — the invariant is that a code change is reviewed through the same loop as any other operation, not a bespoke side channel.

**Out of scope.** The review *experience* and any new code-specific review canvas (Track AL). Materializing the tree (AO2). The repository binding (AO1). CI status integration on the PR.

**Effort.** L (~5d)

---

### AO4 — Concurrent multi-project isolation

**Workpackage.** As a founder developing two or three products in one HyperIdle instance, I want each team's sessions, working trees, and exports to be isolated from every other team's — so that builds running at the same time for different products cannot collide, overwrite, or leak into each other. This makes "develop a second and third product alongside the first" actually safe, not just nominally possible.

**Why this matters.** Per-team repository binding (AO1) makes multiple products *configurable*; this makes running them *concurrently* safe. The founder benefits: today all sessions share one global sandbox base path and the export pipeline selects knowledge across all teams at once, so two simultaneous product builds can write into shared locations and a cleanup for one can delete files another needs. The cost of not building it: multi-project is a trap — it appears to work until two builds run together and corrupt each other.

**What exists today.** The sandbox base path is a single global (`HYPERIDLE_WORKSPACES_DIR` / one default), and the knowledge-export plan (`git-export.ts: computeExportPlan`) selects across all teams in one pass with no per-team filter; the git-export runner commits/pushes against the one global repo. AO1 introduces per-team repository binding and AO2 materializes per-session trees, but neither guarantees isolation of the workspace roots or the export between teams under concurrency.

**What's genuinely missing.** Per-team isolation of the workspace/sandbox root and of the export/commit path, so concurrent sessions and exports for different teams operate on disjoint locations and never interfere.

**Depends on.** AO1 — isolation is *per team*, which requires the per-team binding to exist. AO2 — the thing being isolated is the materialized working tree per session, which AO2 introduces.

**Complexity.** M

**Pre-build gates.**
- **Concept:** `Not required — consumes the Repository/Team scoping from AO1; no new noun.`
- **Design:** `Not required — runtime isolation mechanism; no rendered surface.`

**Human design review.** No — infrastructure isolation; no user-facing component.

**Acceptance criteria.**
- Two teams' coding sessions can run at the same time, each operating on its own working tree, with neither able to read or write the other's sandbox.
- Each team's repository export/commit path operates only on that team's bound repository and never on another team's.
- Tearing down or cleaning up one team's session or workspace never removes files belonging to another team's session.
- A knowledge or code export triggered for one team affects only that team's bound repository, not all teams at once.

**Validation scenarios.**
- Given two teams with concurrent sessions, when both agents write files, then each team's changes land only in its own working tree and neither can access the other's sandbox.
- Given two teams, when one team's session is destroyed, then the other team's session files remain intact.
- Given a per-team export is triggered, when it runs, then only that team's bound repository receives commits.

**Plan calls.** Skip `/design`. Standard `/architecture` — scope the workspace/sandbox root per team and filter the export/commit path by team. Prove the isolation property with a concurrent two-team scenario before `done`.

**Contracts / constraints.** Per-team and per-session isolation of workspace roots; no cross-team read/write. The export/commit path is filtered to a single team's bound repository (no all-teams-at-once commit). Cleanup is scoped so one team's teardown cannot delete another's files. Forward-only migration if workspace roots are persisted.

**Out of scope.** The repository binding (AO1). Tree materialization (AO2). Branch/PR output (AO3). Resource quotas / cost caps across concurrent teams (existing cost-cap machinery).

**Effort.** M (~1d)
