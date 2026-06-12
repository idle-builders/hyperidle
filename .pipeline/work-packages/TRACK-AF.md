# Track AF: Launch Remediation

Make HyperIdle actually launch-ready. The Z8 deep audit (June 2026) traced every interactive and display element from the DOM to the database, then live-tested each in a real browser. It found **165 confirmed defects** (14 critical, 37 high, 51 medium, 63 low) and one root cause that hid them all: the typecheck gate verifies nothing, so the codebase accumulated **~1,861 type errors** and a large body of built-but-never-wired automation without any signal. This track fixes the gate first, drives the type errors to zero, then closes the functional defects in coherent subsystem groups.

**Source of truth:** `plans/Z8/master-flag-register.md` (every defect with a stable `Z8-NNN` id, file:line, and fix-shape), `plans/Z8/FINAL-AUDIT-REPORT.md` (executive summary + roadmap), `plans/Z8/typecheck-errors.txt` (the full `tsc -b` dump), and `plans/Z8/traces/` + `plans/Z8/test-results/` (the per-domain code traces and live-test evidence). Every workpackage below lists the specific `Z8-NNN` ids it closes; `/architecture` reads those register entries for the file:line detail.

**Ordering principle.** AF1 makes the gate real. AF2–AF5 drive each package cluster to zero type errors against that real gate. AF6 onward fix behavior — each grouped by subsystem and gated behind the relevant package being type-green, so functional work lands on a verified foundation. No functional fix is trusted until it can be type-checked.

**Constraint:** `npm run verify` must pass after every workpackage merges (same rule as Tracks AD/AE). Because AF1 makes the typecheck part of `verify` real, later workpackages are held to a standard the earlier history never was. Open source, no enterprise features. See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AF1 — Make the typecheck gate real and self-protecting

**Workpackage.** As any contributor — human or agent — I want `npm run check` to actually typecheck the entire monorepo, so that a type error I introduce is caught before it merges instead of shipping silently. Today the gate runs `tsc -p` against a root config whose file list is empty, so it compiles nothing and always passes; it also never reaches the web frontend at all. After this workpackage, the gate type-checks every package including the web app, a new error anywhere outside an explicit and shrinking known-debt exception list fails both `npm run check` and CI, and `npm run verify` still passes (the ~1,861 pre-existing errors are quarantined in that exception list, to be drained by AF2–AF5).

**Why this matters.** This is the single highest-leverage fix in the entire audit. Every other defect in this track persisted because the gate was blind — a developer or agent ran `npm run check`, saw green, and merged broken types. The runtime tester proved it by injecting `const x: string = 123` into a source file: the gate still exited 0. Until the gate tells the truth, no fix in AF6–AF16 can be trusted to stay fixed, and the codebase will re-accumulate exactly the debt this track is paying down. The founder benefits directly: green stops being a lie.

**What exists today.** The root `tsconfig.json` is a solution-style config: `"include": []` plus a `references` array of 9 packages. The `check` script runs `tsc --noEmit -p tsconfig.json` — project mode, which only compiles the (empty) root file list and ignores `references` entirely, so it checks nothing and exits 0. Even the correct invocation (`tsc -b`) omits `packages/web`, which is `composite: false` and absent from the root `references`, so the frontend is unreachable from the root gate. Web has its own `check` (`tsc --noEmit`) that is never invoked by the root or by `verify`. `npm run verify` chains `check` and is therefore equally blind.

**What's genuinely missing.** A root gate that (a) actually visits all ten packages including web, (b) fails on any new error, and (c) stays green today despite ~1,861 known errors — by quarantining exactly those known-broken units in a tracked, enumerable exception list that later workpackages shrink to empty. The mechanism (build-mode references vs. per-package fan-out vs. an allowlist file) is an architecture decision; the outcome is a gate that is real for everything not explicitly excepted. Closes Z8-001 (the root-cause vacuous-gate defect that hid every type error in this track).

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- `npm run check` type-checks every package in the monorepo, including the web frontend, not an empty file set.
- A type error introduced in any file that is not on the known-debt exception list causes `npm run check` to exit non-zero, and causes CI to fail.
- The known-debt exception list enumerates exactly the units (packages or files) that are broken today and nothing else; an observer can read it and know precisely what debt remains.
- `npm run verify` passes on the branch immediately after this workpackage, with no regression to the existing suite.
- Removing a unit from the exception list while that unit still has type errors causes the gate to fail — i.e. the list cannot be used to hide new debt in an already-cleared unit.

**Validation scenarios.**
- Given the merged gate, when a contributor adds `const x: string = 123` to any non-excepted file and runs `npm run check`, then the command exits non-zero and names that file.
- Given the merged gate, when the same error is added to a file inside an excepted unit, then `npm run check` still passes (that unit is known-broken) — but the unit remains on the list.
- Given the merged gate, when `npm run verify` runs on the clean branch, then it passes end to end.
- Given a contributor removes a still-broken package from the exception list, when `npm run check` runs, then it fails, surfacing that package's errors.

**Plan calls.** Pure build/tooling infrastructure — skip `/design`. Standard architecture pass focused on: the correct multi-package typecheck invocation (including web's non-composite config), the shape of the exception/quarantine mechanism, and the CI wiring. No new runtime code.

**Contracts / constraints.**
- `verify` must remain green the moment this merges — the quarantine is mandatory, not optional.
- The exception list must be a single source of truth, machine-readable, and diff-reviewable.
- No production runtime behavior changes in this workpackage — tooling only.
- Do not suppress errors with `@ts-ignore`/`@ts-expect-error` sprinkling as the quarantine mechanism; the exception must be at the unit level so progress is measurable.

**Out of scope.** Fixing any of the ~1,861 errors (that is AF2–AF5). Lint or test-gate changes. Changing `noUncheckedIndexedAccess` or other strictness flags (AF2–AF5 decide per-cluster whether to fix or relax in test configs).

**Effort.** M (~4h)

---

### AF2 — Type-green the shared foundation: shared, db, and leaf packages

**Workpackage.** As a contributor relying on the now-real typecheck gate, I want `@hyperidle/shared`, `@hyperidle/db`, `@hyperidle/design-system`, `@hyperidle/eval`, `@hyperidle/desktop`, and `@hyperidle/eslint-plugin-design` to compile with zero type errors, so that the type definitions every other package imports are themselves sound and these clusters can be removed from the AF1 quarantine. These are the foundation packages: `shared` exports the types `server`, `fabric`, and `web` all consume, so its correctness gates theirs.

**Why this matters.** `shared` alone has ~286 errors and exports the core domain types (events, money, blocks, artifact kinds) that the entire system builds on; if those signatures are wrong, every downstream fix inherits the rot. Draining these clusters first means AF3/AF4/AF5 start from correct shared types instead of chasing moving targets. The contributor benefits: once these clear, importing a shared type means importing a *checked* type.

**What exists today.** Per `plans/Z8/typecheck-errors.txt`: shared ~286, design-system ~63, eslint-plugin-design ~81 (incl. test-fixtures), db ~21, eval ~15, desktop ~2. A large share are `TS2532`/`TS18048` "possibly undefined" from `noUncheckedIndexedAccess` concentrated in `__tests__` files; the remainder are genuine signature mismatches (e.g. `ssrf.ts` passing `string | undefined` where `string` is required, `test-utils.ts` DB-type mismatch). The AF1 quarantine currently excepts all of these.

**What's genuinely missing.** Zero type errors across these six packages, and their removal from the quarantine. Where the bulk of errors are test-file index-access strictness, the architecture pass decides whether to fix call sites or relax that one flag for test configs — a policy choice this workpackage settles for the whole monorepo so AF3–AF5 inherit it.

**Depends on.** AF1 — the gate must be real before "this package has zero errors under the gate" is a verifiable outcome.

**Complexity.** L

**Acceptance criteria.**
- `@hyperidle/shared`, `@hyperidle/db`, `@hyperidle/design-system`, `@hyperidle/eval`, `@hyperidle/desktop`, and `@hyperidle/eslint-plugin-design` each compile with zero type errors under the real gate.
- All six packages are removed from the AF1 known-debt exception list.
- No exported type signature is loosened to `any`/`unknown` solely to silence an error; fixes preserve or tighten type precision.
- A single, documented policy governs how test-file index-access strictness is handled, applied consistently across the monorepo.
- `npm run verify` passes.

**Validation scenarios.**
- Given the merged workpackage, when `npm run check` runs, then none of the six packages report errors and none appear on the exception list.
- Given a contributor adds a type error to any of the six packages, when `npm run check` runs, then it fails (the package is no longer quarantined).
- Given the test-strictness policy, when a new test file is added, then it is held to the same documented standard.

**Plan calls.** Backend/tooling — skip `/design`. Standard architecture pass; the one real decision is the test-file `noUncheckedIndexedAccess` policy (fix vs. relax-in-test-config), which must be settled here and recorded for AF3–AF5.

**Contracts / constraints.**
- No `any` casts or blanket `@ts-ignore` as a fix of convenience; tighten types, don't erase them.
- No runtime behavior change — type-level only, except where a genuine bug (e.g. a real possibly-undefined dereference) demands a guarded fix.
- The test-strictness policy decided here is binding on AF3/AF4/AF5.

**Out of scope.** server, fabric, web type errors (AF3/AF4/AF5). Any functional/behavioral defect (AF6+).

**Effort.** L (~3d)

---

### AF3 — Type-green the fabric package

**Workpackage.** As a contributor, I want `@hyperidle/fabric` to compile with zero type errors so the knowledge-fabric and automation services it houses can be safely reworked in AF6–AF9 on a typed foundation. Fabric is where the scheduler, dispatcher, notification, materialization, and cost-cap services live — exactly the code the automation workpackages will modify — so its types must be sound first.

**Why this matters.** Fabric's ~309 errors cluster in the precise files the audit flagged as broken automation: `routine-scheduler.ts`, `assistant-dispatcher.ts`, `notifications/dispatcher.ts`, `materialization.ts`, `lifecycle-propagation.ts`. The type errors and the behavioral defects are the same rot. Fixing types here both clears the gate and surfaces the real mistakes (e.g. `materialization.ts` reading a `.path` that doesn't exist on `Dirent`) before AF6–AF9 build on top.

**What exists today.** Per the error dump, ~309 fabric errors: real signature mismatches in the scheduler (`string | undefined` passed as `string`, multiple sites), `assistant-dispatcher.ts` referencing `event.hostId` that does not exist on `ThreadMessageAppendedEvent` (Z8-007/Z8-051 territory), `session-context.ts` assigning `string | null` to `string`, plus test-file index-access strictness. Quarantined under AF1.

**What's genuinely missing.** Zero type errors across fabric and its removal from the quarantine, with the genuine logic bugs the type checker exposes either fixed or explicitly handed to the relevant AF6–AF9 workpackage via the register.

**Depends on.** AF2 — fabric imports `@hyperidle/shared` and `@hyperidle/db` types; their signatures must be correct before fabric's errors stabilize.

**Complexity.** L

**Acceptance criteria.**
- `@hyperidle/fabric` compiles with zero type errors under the real gate and is removed from the exception list.
- Every genuine bug the type checker reveals (not mere strictness) is either fixed in place or recorded against its `Z8-NNN` register entry for the owning automation workpackage, with no silent suppression.
- No service signature is loosened to `any`/`unknown` to pass the gate.
- `npm run verify` passes.

**Validation scenarios.**
- Given the merged workpackage, when `npm run check` runs, then fabric reports zero errors and is off the exception list.
- Given the `assistant-dispatcher`/`event.hostId` mismatch, when fabric compiles, then the event payload is accessed through a field that actually exists on the event type.
- Given a new type error added to fabric, when `npm run check` runs, then it fails.

**Plan calls.** Backend — skip `/design`. Standard architecture pass; flag any type error that is actually a behavioral bug and route it to AF6–AF9 rather than papering over it.

**Contracts / constraints.**
- Follow the test-strictness policy fixed in AF2.
- No `any`/`@ts-ignore` convenience fixes.
- A type fix that would change runtime behavior must be deferred to the owning functional workpackage, not silently altered here.

**Out of scope.** Wiring the automation at boot (AF6–AF9). server/web types (AF4/AF5).

**Effort.** L (~3d)

---

### AF4 — Type-green the server package

**Workpackage.** As a contributor, I want `@hyperidle/server` to compile with zero type errors so that every API route and service — the layer the functional workpackages AF10–AF16 modify — rests on sound types. Server is the largest cluster (~762 errors) and the seam where most FE/BE contract drift surfaces.

**Why this matters.** Server holds every route handler and validation schema; ~762 errors here mean the request/response contracts the frontend depends on were never verified, which is the direct cause of the FE/BE mismatches the audit found (portfolio `title`, task `owner`, knowledge `accessCount`). Clearing server types makes those contracts checkable, so AF10–AF16 can fix behavior without re-introducing drift.

**What exists today.** ~762 server errors per the dump: Zod-schema/middleware generic mismatches (`validate.ts`, `mcp-bridge.ts`), index-access strictness in `__tests__`, and assorted real mismatches. Server imports `shared` and `db` types throughout. Quarantined under AF1.

**What's genuinely missing.** Zero type errors across server and removal from the quarantine, with genuine route/contract bugs the checker exposes fixed or routed to the owning functional workpackage.

**Depends on.** AF2 — server depends on `@hyperidle/shared` and `@hyperidle/db` types being correct first.

**Complexity.** L

**Acceptance criteria.**
- `@hyperidle/server` compiles with zero type errors under the real gate and is removed from the exception list.
- Request/response types for routes consumed by the web app are sound (no `any` escape hatches at the route boundary).
- Genuine contract bugs revealed by the checker are fixed or recorded against their `Z8-NNN` entry for the owning functional workpackage.
- `npm run verify` passes.

**Validation scenarios.**
- Given the merged workpackage, when `npm run check` runs, then server reports zero errors and is off the exception list.
- Given a route handler returning a payload, when server compiles, then its response type matches its declared contract without `any`.
- Given a new type error in a route file, when `npm run check` runs, then it fails.

**Plan calls.** Backend — skip `/design`. Standard architecture pass; route genuine behavioral bugs to AF10–AF16.

**Contracts / constraints.**
- Follow the AF2 test-strictness policy.
- No `any`/`@ts-ignore` convenience fixes at route boundaries.
- Behavior-changing fixes deferred to the owning functional workpackage.

**Out of scope.** fabric/web types (AF3/AF5). Functional route behavior (AF10–AF16).

**Effort.** L (~4d)

---

### AF5 — Type-green the web frontend

**Workpackage.** As a contributor, I want `packages/web` to be type-checked by the real gate and to compile with zero errors, so the entire React frontend — the layer AF13–AF16 rework — is verified. Web was invisible to even the corrected gate (it is `composite: false` and unreferenced), and has ~322 of its own errors, weighted toward genuine mismatches.

**Why this matters.** The frontend is where users live, yet it was the *least* checked surface — the gate never reached it, and its 322 errors skew real (props mismatches `TS2741`/`TS2739`, assignment `TS2322`, argument `TS2345`, missing properties `TS2339`) rather than mere strictness. The confirmed live bug Z8-084 (a `density` property that no longer exists, shipping in `useSettings.ts`) is exactly this category. Until web is type-green and wired into the gate, every UI fix in AF13–AF16 is unverifiable.

**What exists today.** `packages/web/tsconfig.json` extends root but sets `composite: false`, so it cannot be a `tsc -b` reference target and is absent from the root `references`. Web has its own `check` (`tsc --noEmit`, ~322 errors) that nothing invokes from the root gate. Error mix: `TS2322` 65, `TS2345` 55, `TS2741` 43, `TS2532` 43, `TS18048` 35, `TS2339` 19. Quarantined under AF1 (AF1 wires web into the gate; AF5 drains it).

**What's genuinely missing.** Zero type errors across web, its inclusion in the real root gate confirmed, and removal from the quarantine — including fixing the shipped `density` leftover (Z8-084).

**Depends on.** AF2 — web imports `@hyperidle/shared` and `@hyperidle/design-system` types; AF4 — web consumes server response contracts, which must be sound so web-side fixes target correct shapes.

**Complexity.** L

**Acceptance criteria.**
- `packages/web` compiles with zero type errors and is checked by the root `npm run check` gate, not only a per-package script.
- web is removed from the AF1 exception list.
- The `density`-removal leftover (Z8-084) and other property-existence errors are fixed, not suppressed.
- Component prop contracts are sound (no missing-required-prop `TS2741`/`TS2739` remaining).
- `npm run verify` passes.

**Validation scenarios.**
- Given the merged workpackage, when `npm run check` runs from the repo root, then it type-checks web and reports zero errors.
- Given the `useSettings` density leftover, when web compiles, then no reference to the removed `density` property remains.
- Given a new prop mismatch added to any component, when the root `npm run check` runs, then it fails.

**Plan calls.** Frontend types — skip `/design` (no visual change). Standard architecture pass; the structural decision is how web joins the root gate given its non-composite, JSX config.

**Contracts / constraints.**
- Follow the AF2 test-strictness policy.
- No `any` casts to silence prop mismatches; fix the prop contracts.
- No visual or behavioral change — type-level only (behavioral UI fixes are AF13–AF16).

**Out of scope.** Any UI behavior change (AF13–AF16). server/fabric types (AF3/AF4).

**Effort.** L (~4d)

---

### AF6 — Start the automation: routine scheduler and event-driven routines actually fire

**Workpackage.** As a founder relying on HyperIdle's "the system does work without being asked" promise, I want the built-in routines (daily digest, knowledge decay, portfolio retro, post-bet retro, practice meeting) to fire automatically on their schedules and triggers, so the autonomous backbone the product is sold on actually runs. Today the scheduler is never started at boot, so no cron routine ever fires; only manual "Trigger Now" works, and even that is fragile.

**Why this matters.** This is the product's core premise and it is entirely inert. The audit confirmed (three independent tracers) that `startRoutineScheduler` has no boot caller, every active cron routine shows `nextRunAt=null`, the daily digest depends on a `routine_fired` event the never-started scheduler is the only emitter of, and event-routines read the routines table once at registration. A founder who installs HyperIdle gets none of the autonomous work that distinguishes it from a chat tool.

**What exists today.** `packages/fabric` contains `startRoutineScheduler`, the five seeded routines, `routine_runs` schema, and the post-bet-retro event path. The scheduler function is complete but never invoked from `createServer`/`createApp`/boot. UI-created routines lack the trigger config the scheduler expects, and the kernel-fallback Trigger path can leave zombie sessions. Closes Z8-003, Z8-006, Z8-029, Z8-032, Z8-101, Z8-102.

**What's genuinely missing.** A boot path that starts the scheduler; correct trigger configuration on routines created through the UI; a scheduler that reads routine state freshly rather than once at registration; and a Trigger path that cannot leave a routine bricked by a zombie session. Per-run and monthly budget enforcement that actually gates execution.

**Depends on.** AF3 — the scheduler and its services live in `@hyperidle/fabric`, which must be type-green so this rework lands on verified types and the now-real gate protects it.

**Complexity.** L

**Acceptance criteria.**
- Built-in cron routines fire automatically on their schedule without any manual action; their next-run and last-run times reflect real execution.
- Event-driven routines react to current routine state, not a snapshot frozen at registration.
- Manually triggering a routine never leaves it in a state that blocks future automatic or manual runs.
- Routine execution is bounded by its configured per-run and monthly budgets; exceeding a budget is recorded as a budget-related outcome rather than silently overrunning.
- A founder can observe, from the existing routine surfaces, that a routine has run on its own (run history populates without manual triggers).

**Validation scenarios.**
- Given a seeded cron routine and a running server, when its schedule elapses, then a run is recorded and next-run advances — with no user action.
- Given a routine created through the UI, when its trigger condition is met, then it fires (its trigger configuration is complete).
- Given a routine triggered manually, when the trigger completes or crashes, then the routine remains eligible for its next scheduled run.
- Given a routine that exceeds its per-run budget, when it runs, then the run terminates with a budget outcome and the overrun is visible.

**Plan calls.** Backend automation — skip `/design`. Heavy architecture pass on the boot/start sequence, the scheduler's state-read model, trigger-config completeness for UI-created routines, and budget enforcement. If the team concludes the routine execution/trigger model is a load-bearing concept being reshaped (not merely wired), pause and run `/concept` on the automation execution model before proceeding.

**Contracts / constraints.**
- The scheduler must be observable: a started scheduler and each fire must be visible in logs/state, not silent.
- No new scheduling dependency (no BullMQ/Redis) unless `/architecture` justifies it against the existing in-process model; CLAUDE.md's BullMQ claim is currently false (Z8-165) and must not be cargo-culted.
- Budget enforcement must use the real cost figures fixed in AF10 — coordinate so the two do not contradict.

**Out of scope.** Task auto-dispatch (AF7), notification delivery (AF8), fabric knowledge sweeps (AF9), cost-accounting correctness itself (AF10).

**Effort.** L (~4d)

---

### AF7 — Start the automation: task auto-dispatch and session execution

**Workpackage.** As a founder, I want a ready task to automatically provision an agent session that runs to completion and reports back, so work actually gets done without me hand-triggering each session. Today task auto-dispatch (AD2) is dead in production — the dispatcher never receives its dependencies, the dispatch queue is always empty — and session provisioning has correctness and isolation problems.

**Why this matters.** Auto-dispatch is the mechanism that turns "a task exists" into "an agent did the work." The audit confirmed the dispatcher is never wired (`GET /api/dispatch-queue` always empty, `dispatcherDeps` never passed to `bootstrapFabric`), `POST /api/sessions` blocks for the entire session, concurrent builtin-harness sessions can swap tool contexts, and `PATCH /api/sessions/:id` can desync the DB from the runtime. Without this, HyperIdle cannot autonomously execute work — the entire value proposition.

**What exists today.** `bootstrapFabric`, the dispatcher, `setProvisionSessionFn` (test-only today), `provisionSession`, the seven harness adapters, and the dispatch-queue route all exist. The dispatcher is simply never given its deps at boot; the production session path runs only the `sh -c` local-workspace adapter; and the lifecycle-propagation engine (session completion → task → bet → team) retries incorrectly. Closes Z8-004, Z8-039, Z8-047, Z8-048, Z8-050, Z8-092, Z8-093, Z8-094, Z8-095, and the dispatch half of Z8-010.

**What's genuinely missing.** A boot path that wires the dispatcher; a non-blocking session-provision request; isolation so concurrent sessions cannot swap tool/registry context; a session-state update path that keeps DB and runtime consistent; handoff that actually stops the prior session; lifecycle-propagation retry semantics that neither double-log nor mark a succeeded retry as failed; and cleanup of crashed/abandoned workspaces.

**Depends on.** AF3 (fabric type-green — dispatcher/session services live there) and AF4 (server type-green — the sessions routes live there). Both must be verified before this rewires execution.

**Complexity.** L

**Acceptance criteria.**
- A task reaching the ready state results in an automatically provisioned session without manual triggering, visible in the dispatch surface.
- Requesting a session returns promptly; the caller is not blocked for the full duration of the agent's work.
- Two sessions running concurrently never observe each other's tool or registry context.
- A session's recorded state stays consistent with its actual runtime state across its lifecycle; there is no path that leaves a zombie session.
- Handing a task off to another agent stops the prior session's tool access; the prior agent cannot keep acting after handoff.
- Abandoned or crashed session workspaces are cleaned up rather than accumulating indefinitely.

**Validation scenarios.**
- Given a task transitioned to ready, when the dispatcher is running, then a session is provisioned for it automatically and appears in the queue/surface.
- Given two concurrent sessions, when each calls its tools, then neither sees the other's context.
- Given a session that crashes, when it ends, then its DB state reflects the crash and its workspace is reclaimed.
- Given a task handed off mid-session, when the handoff completes, then the original session's tools are revoked.

**Plan calls.** Backend automation/runtime — skip `/design`. Heavy architecture pass on dispatcher boot-wiring, async session provisioning, per-session isolation of the harness registry, the DB/runtime state-sync contract, handoff semantics, and workspace lifecycle. Coordinate the "task ready → dispatch" seam with AF12 (lifecycle).

**Contracts / constraints.**
- Remote/docker/isolated adapters that are architecturally incoherent today (Z8-050) must either be made coherent or explicitly marked unsupported — not left as silent dead paths.
- No credential exfiltration via the session/worker path — coordinate with AF11 (the worker-token issue Z8-014 is owned there).
- Session cost recording must use the corrected accounting from AF10.

**Out of scope.** The scheduler (AF6), notifications (AF8), cost-accounting correctness (AF10), the worker-token security fix (AF11), bet/task state-machine semantics (AF12).

**Effort.** L (~5d)

---

### AF8 — Notifications: define the model (concept), then deliver them

**Workpackage.** As a founder, I want the notifications the system decides to send me — review requests, cost alerts, blocker alerts, the daily digest — to actually reach me, so I'm not silently unaware of work needing my attention. Today the notification queue has no drain loop, the `notification` event has zero listeners, and the factory cost sentinel watches a value nothing writes, so no notification is ever delivered automatically. But the deeper gap is that the notification *model* itself is undefined: which events warrant a notification, through which channels, with what user controls, urgency, and quiet-hours semantics, and how proactive notifications relate to the in-app awareness surfaces (sidebar badges, blocking chips) and the Settings notification toggles. "The notifications the system decides to send" is not yet a well-specified set, so this workpackage cannot be safely scoped until that model is locked.

**Why this matters.** Notifications are how a human-in-the-loop product tells the human something needs them. The audit confirmed deferred/pending notification rows stay pending forever (no drain loop outside a manual flush endpoint), `notification` events are emitted into the void (no `.on("notification")` anywhere), and the factory cost sentinel reads `factory_settings.cost_actual`, a key nothing ever writes. A founder gets zero proactive signal; every alert the system "raises" vanishes.

**What exists today.** The `notification_queue` table, silence/quiet-hours policy, multiple adapters (ntfy, SMTP, console), and a manual `POST /api/notifications/flush` endpoint all exist. The policy engine and dependency watcher emit `notification` events. What is missing is the notification model itself (see below) plus a running drain and the listener that turns events into queued, then delivered, notifications. Closes Z8-005, Z8-007, Z8-008, Z8-098, Z8-099.

**What's genuinely missing.** First, a defined notification model (the subject of the required concept): which event categories notify, where a notification *surfaces* (an in-app notification surface, the originating thread/conversation, an OS/web push channel, email), what a "channel" is and how the user chooses among them, how a notification maps back to the thread or conversation that produced it, and how urgency/quiet-hours/silence interact. Then, given that model: a drain loop that delivers pending notifications respecting the policy; a listener that actually consumes `notification` events; recovery of stuck notification leases outside the manual flush; and a factory cost signal sourced from a value that is actually written (coordinate with AF10).

**Depends on.** AF3 — the notification services live in `@hyperidle/fabric` and must be type-green first. (The notification concept is an upstream `/concept` prerequisite, not a workpackage dependency — see Plan calls.)

**Complexity.** L

**Acceptance criteria.**
- A founder receiving a notification can tell what it is about and reach its source — it surfaces in the **notification popover** (the locked concept's in-app surface) and its persisted **source link** routes back to the originating thread *or* place (e.g. cost detail).
- A notification the system decides to send is delivered automatically through a configured channel, without anyone calling a manual flush endpoint.
- Quiet-hours/silence policy and retry-deferral are honored by the automatic delivery path.
- A `notification` event raised by the policy engine or dependency watcher results in a queued and (subject to policy) delivered notification.
- Stuck or expired notification leases are recovered automatically.
- Cost-threshold alerting reacts to a cost value that is actually written by the system, not a perpetually-zero field.
- The Settings notification controls map to the notification **types** defined by the concept (per-type, per-user mute, not editorial categories); muting a type suppresses its notifications, and the Settings list lets the user re-enable any type. (AF15 owns the per-user persistence.)

**Validation scenarios.**
- Given a pending notification and a running server, when delivery conditions are met, then it is delivered with no manual flush.
- Given quiet hours are active, when a non-urgent notification is due, then delivery is deferred per policy and later delivered.
- Given the policy engine emits a `notification` event, when the listener is running, then a corresponding notification is enqueued.
- Given a cost threshold is crossed, when the sentinel runs, then it sees the real accumulated cost and alerts.

**Concept — LOCKED.** The notification model is defined in **`plans/AF8/concept.md`** (ground truth: **`docs/human-interface-layer/notification-primitive.md`**). Locked decisions: a notification is a discrete record surfaced in a **lightweight ephemeral popover** anchored by the sidebar avatar (not the rail); it carries a persisted **source link** that routes back to a thread *or* a place; the mutable unit is the notification **type** (per-type, per-user mute, exposed both on the popover and as a full type list in Settings); `digest` is an egress delivery mode and `agent.health.degraded`/auto-unblock are ambient (§4.2), not notifications; push/email are a dormant egress tier (the popover is the near-term surface). `/design` is **required** for the popover + Settings type-list before architecture.

**Plan calls.** Notification is a load-bearing noun — `/concept` is DONE (see above). Do not start build until `/design` produces the popover surface. Historical guidance (for reference): the concept had to answer which events notify, where a notification surfaces, how it routes back, how it relates to ambient surfaces (§4.2) and the Settings toggles (AF15), and the urgency/quiet-hours/silence semantics. The concept must answer: which event categories notify; where a notification surfaces (a dedicated in-app surface, the originating thread/conversation, OS/web push, email) and what a "channel" means; how a notification references and routes back to its source thread/conversation/entity; how it relates to the existing in-app awareness surfaces (sidebar badges, blocking chips) and the Settings notification toggles (AF15); and the urgency/quiet-hours/silence semantics. After the concept is locked: `/design` for any new in-app notification surface, then a standard architecture pass on the drain loop, event-listener wiring, lease recovery, and the cost-signal source (coordinate with AF10).

**Contracts / constraints.**
- The drain must respect existing silence/quiet-hours policy; do not bypass it for convenience.
- Coordinate the cost-signal source with AF10 so the two define cost identically.

**Out of scope.** The scheduler (AF6), the cost-accounting fix itself (AF10), retention/TTL cleanup of operational tables (moved to AF16), UI for notification history/test-send (a future workpackage if justified).

**Effort.** L (~3d)

---

### AF9 — Make the knowledge fabric learn: relevance, promotion, and search

**Workpackage.** As a founder whose agents accumulate knowledge, I want the fabric to actually score relevance, promote validated items, and support practice search, so the knowledge base gets smarter instead of being a static list. Today relevance scoring is dead (its trigger event has no subscriber), the auto-promotion sweep has no caller, and full-text search is never set up so the `query_practice` tool throws at runtime.

**Why this matters.** "The company gets smarter over time" is a stated HyperIdle differentiator, and the machinery for it is inert. The audit confirmed `knowledge_accessed` has zero subscribers (so access never updates relevance), `runAutoPromotionSweep` has no caller (validated knowledge never rises), and `setupFts` never runs (so `query_practice`/`ftsSearch` throw "column does not exist" the moment an agent uses them). Attention-sorted triage is therefore a no-op, and a core agent tool is broken at runtime.

**What exists today.** Materialization and the file-watcher writeback run per-session and work. Attention scoring exists as an on-demand skill tool. `runAutoPromotionSweep`, the relevance scorer, and `setupFts` all exist but have no caller/trigger. The `knowledge_strategy_fabric` columns and access/edit logs exist. Closes Z8-009, Z8-037, Z8-038, Z8-071, Z8-137 (topic assignment is related), Z8-153.

**What's genuinely missing.** A subscriber that updates relevance on knowledge access; a trigger that runs the auto-promotion sweep; FTS setup that runs so practice search works; and relevance/attention scores that are non-null for normally-created items so attention-sorted triage actually orders.

**Depends on.** AF3 — the fabric services must be type-green first.

**Complexity.** M

**Acceptance criteria.**
- Accessing a knowledge item updates its relevance signal; relevance is not permanently null for items created through normal use.
- Validated knowledge is promoted automatically by a sweep that actually runs on a trigger or schedule.
- Practice/full-text search returns results instead of throwing; the agent practice-query tool succeeds at runtime.
- Attention-sorted triage orders items by a real, populated score rather than a constant.

**Validation scenarios.**
- Given a knowledge item is accessed, when the relevance subscriber runs, then its relevance signal changes.
- Given a validated item, when the promotion sweep runs, then the item is promoted.
- Given an agent invokes the practice-search tool, when it runs, then it returns results without a "column does not exist" error.
- Given several triage items with differing access patterns, when sorted by attention, then their order reflects real scores.

**Plan calls.** Backend fabric — skip `/design`. Standard architecture pass on the access→relevance subscriber, the promotion-sweep trigger (event vs. schedule — coordinate with AF6's scheduler), and where/when FTS setup runs (migration vs. boot).

**Contracts / constraints.**
- FTS setup must be deterministic and idempotent (safe on every boot/migration).
- If the promotion sweep is scheduled, it must use the AF6 scheduler rather than a second scheduling mechanism.

**Out of scope.** Knowledge authoring/editing UX (AF13). The scheduler itself (AF6).

**Effort.** M (~2d)

---

### AF10 — Cost accounting integrity

**Workpackage.** As a founder watching spend, I want every cost figure — per session, per routine, per bet, per team, factory-wide — to be accurate, so budgets mean something and the money I see in the UI is real. Today session cost over-counts quadratically (a running total is recorded as if it were a per-event delta), routine and team cost have no write path at all (so they always show "—"/"--"), and several surfaces hardcode currency and formatting.

**Why this matters.** Cost is load-bearing: it gates budgets, drives the cost sentinel's alerts, and is shown all over the Work surfaces. The audit confirmed `session-provisioning` passes the running total to the cost-increment function on every event (deltas of 10,5,5 record 45 instead of 20 — quadratic inflation), `routines.costActualMinor` and team cost caps have no writer, CLI-harness sessions are invisible to cost accounting entirely, and money is rendered with hardcoded `$`/`/100` and a hardcoded "USD". Every budget decision built on these numbers is wrong.

**What exists today.** `recordCostAndCheck`, the `cost-cap` service, per-agent/team/bet cost accumulators, and the `routine_runs.cost_minor` field exist. The bug is in what value is passed (total vs. delta) and which fields are never written. A shared `formatMoney` exists but is bypassed by several surfaces. Closes Z8-002, Z8-030, Z8-031, Z8-049, Z8-088, Z8-119, Z8-124, Z8-127, Z8-162.

**What's genuinely missing.** Cost recorded as deltas, not running totals; write paths for routine and team cost; CLI-harness session cost captured; artifact cost surfaced (not silently swallowed); and consistent currency-aware formatting via the shared helper across every money surface.

**Depends on.** AF3 (fabric cost services type-green) and AF4 (server cost routes type-green).

**Complexity.** L

**Acceptance criteria.**
- Accumulated session cost equals the sum of true per-event deltas — no quadratic inflation across multiple cost events in one session.
- Routine cost and team cost caps are written and reflect real spend, rather than displaying a permanent placeholder.
- Cost incurred by every harness type, including CLI sessions, is captured in accounting.
- Artifact cost is recorded and surfaced rather than silently dropped.
- Every money value in the UI is formatted through the shared currency-aware helper; no surface hardcodes the symbol, divisor, or currency code.

**Validation scenarios.**
- Given a session with cost events of 10, 5, and 5, when accounting records them, then the session total is 20, not 45.
- Given a routine that runs and incurs cost, when its detail surface loads, then it shows the real cost, not "—".
- Given a CLI-harness session that incurs cost, when it completes, then that cost appears in the relevant aggregates.
- Given any money value, when rendered, then it uses the shared formatter and the configured currency.

**Plan calls.** Backend + light frontend (formatting) — skip `/design`. Standard architecture pass on the delta-vs-total contract at the cost-recording boundary, the missing write paths, and consolidating money formatting on the shared helper. Coordinate the written cost value with AF6 (budgets) and AF8 (cost sentinel).

**Contracts / constraints.**
- The cost-recording boundary must take deltas; any caller passing a total is a bug.
- A single shared money-formatting helper is the only allowed render path for currency.
- The value the AF8 cost sentinel reads must be one this workpackage actually writes.

**Out of scope.** Budget *enforcement* in the scheduler (AF6 consumes these numbers). Notification delivery (AF8).

**Effort.** L (~3d)

---

### AF11 — Authorization and credential hardening

**Workpackage.** As a founder running HyperIdle for a team, I want a user or agent to only read and write what they're authorized to, and I want secrets stored and transmitted safely, so the system is safe to run with more than one human. The audit found four confirmed holes: any authenticated identity can read any thread's full messages (IDOR), a spoofed identity header lets one user read and write another's assistant soul prompt (exploited live), the shared worker token enables org-wide credential exfiltration, and an API key was found in plaintext on disk.

**Why this matters.** These are the issues that make multi-user deployment unsafe today. The audit *exploited* the soul-prompt spoof live (wrote `PWNED_BY_SPOOF_TEST` into another user's prompt), confirmed `GET /api/threads/:id` applies no participant check while the list endpoint does, and found a plaintext key in the PGlite WAL. For an open-source product people will self-host for real teams, shipping these is a serious breach of trust.

**What exists today.** The list-threads endpoint already has a correct participant guard (the `@lore AD1` IDOR fix) that the detail endpoint lacks — a model to extend. Credentials use AES-256-GCM at rest in `server_credentials`, but openai-compatible keys are also written in plaintext into a `server_config` JSON blob. Auth resolves identity from an `X-Identity` header in local mode, which the assistant routes trust over the authenticated user. The worker protocol uses a single shared static token. Closes Z8-012, Z8-013, Z8-014, Z8-079, Z8-080, Z8-082, Z8-090, Z8-096, Z8-146, Z8-159, Z8-163, and the credential parts of Z8-161.

**What's genuinely missing.** A coherent authorization model applied consistently: thread detail (and the `session:<id>` WS topic, and artifacts) enforce the same scoping as their list endpoints; the assistant self-only guard derives identity from the authenticated principal, not a client-supplied header; the worker token cannot be used to exfiltrate org credentials or hijack a worker identity; and no secret is ever persisted in plaintext.

**Depends on.** AF4 — the auth middleware and affected routes live in `@hyperidle/server` and must be type-green so the security rework is verified.

**Complexity.** L

**Acceptance criteria.**
- Reading a thread's messages requires the same authorization as listing it; a non-participant cannot read a participant-scoped thread's detail.
- The assistant self-only guard derives the acting identity from the authenticated principal; a client-supplied identity header cannot grant access to another user's data.
- The worker connection cannot be used to read credentials it was not issued, nor to act as a different worker identity.
- No credential is ever stored in plaintext at rest; secrets are encrypted wherever they are persisted.
- Endpoints that mutate or expose per-user/per-team data enforce an ownership/scope boundary rather than accepting any valid key.
- Authorization is **default-deny**: every data route declares its access boundary through the single chokepoint; an undeclared data route fails closed rather than serving any authenticated caller. All ~36 data routes are retrofitted to explicit declarations.
- Static guardrails (custom ESLint rules) fail the build on obviously-wrong patterns: a client-supplied identity header reaching an authorization decision, a data route with no boundary declaration, or a raw DB query in a route bypassing the policy function.

**Validation scenarios.**
- Given a participant-scoped thread, when a non-participant requests its detail, then access is denied (matching the list endpoint's behavior).
- Given the assistant soul-prompt route, when a request presents another user's identity via a header but is authenticated as someone else, then it cannot read or write that user's prompt.
- Given a worker token, when it is used to request credentials beyond its issuance, then the request is refused.
- Given an openai-compatible API key is saved, when storage is inspected, then the key is encrypted, not plaintext.

**Plan calls.** Backend security — skip `/design`. This reshapes the system's authorization/identity trust boundary across threads, sessions, artifacts, the assistant, and workers. **Concept is locked** — `/architecture` reads `plans/AF11/concept.md` (Principal, Access boundary, Trust mode, Worker, Secret) and the ground-truth `docs/architecture/authorization-model.md` (default posture, enforcement layer, hard rules) as fixed input; do not re-litigate. Sequence: build the single fail-closed policy chokepoint → fix the four audited holes → retrofit all ~36 data routes to explicit boundary declarations (flip the global default to fail-closed only once every data route declares) → add the custom ESLint rules as the regression gate.

**Contracts / constraints.**
- Host-scoped threads (bet/task/knowledge/artifact discussions) must remain readable per host visibility; the fix must not over-restrict them while closing participant-scoped leaks.
- Local single-founder mode must keep working without friction; the model must distinguish local-trust from multi-user-trust explicitly.
- No secret in plaintext anywhere it is persisted or logged.

**Out of scope.** Full role-based access control / enterprise auth (out of product scope). Session execution wiring (AF7) beyond the credential/worker-token boundary owned here. Postgres Row-Level Security — deferred to a future managed multi-tenant deployment (see `docs/architecture/authorization-model.md` § Enforcement layer); the server-layer chokepoint is the boundary for now.

**Effort.** XL (~8d — grew from L when the founder scoped the full system-wide deny-by-default retrofit + lint enforcement into AF11, beyond the four audited holes).

---

### AF12 — Complete the bet and task lifecycle

**Workpackage.** As a founder managing work as bets, I want to move a bet through its full lifecycle from the UI — set its appetite, activate it, and have killing it actually stop the work — and I want task state and sessions to be real, so the core work-management loop functions end to end. Today a UI-created bet can never be activated (no control exists), "Adjust appetite" always fails with a 400, killing a bet halts nothing despite promising to, and the task sessions endpoint doesn't exist.

**Why this matters.** Bets and tasks are the product's work primitive, and the loop is broken at multiple points. The audit confirmed: no UI path transitions draft→active (bets stay draft forever), "Adjust appetite" sends a duration string against a money schema (guaranteed 400), the kill dialog promises "All active tasks will be halted" but nothing cascades (a killed bet leaves `in_progress` tasks running), `GET /api/tasks/:id/sessions` 404s so the sessions pane and Dial-in are permanently dead, and task transitions have no concurrency guard while bets do. A founder cannot actually run work through the system.

**What exists today.** The bet state machine (`draft|active|completed|killed`) with CAS and capacity checks, the `/commit`/`/ship`/`/kill` endpoints, the task state machine, `ConsequencePreviewDialog`, and `TaskSheet` all exist. The gaps are: missing UI controls for activation, an appetite input that sends the wrong shape, a kill that propagates upward only (never downward to tasks/sessions), a missing task-sessions endpoint, and task transitions lacking CAS. Closes Z8-010, Z8-022, Z8-023, Z8-024, Z8-025, Z8-051, Z8-061, Z8-062, Z8-063, Z8-064, Z8-065, Z8-116, Z8-121, Z8-122, Z8-123, Z8-126.

**What's genuinely missing.** A UI path to activate a draft bet; an appetite editor that sends the correct money shape; a kill that actually halts downstream tasks and sessions (matching the dialog's promise) or dialog copy that tells the truth; a working task-sessions surface; task transitions guarded against concurrent writes; and correct propagation-log labels.

**Depends on.** AF4 — the bet/task routes and state machines live in `@hyperidle/server` and must be type-green so the lifecycle rework is verified.

**Complexity.** L

**Acceptance criteria.**
- A founder can activate a draft bet from the UI and see it transition to active.
- A founder can set or adjust a bet's appetite from the UI and have it persist (no schema-mismatch failure).
- Killing a bet halts its in-flight tasks and sessions; either the downstream work actually stops or the confirmation copy accurately describes what happens — there is no false promise.
- A task's sessions are viewable from the task surface, including active-session indicators; the surface is not permanently empty.
- Concurrent attempts to transition the same task do not corrupt its state.
- The propagation record for a lifecycle transition labels the transition correctly.

**Validation scenarios.**
- Given a draft bet, when the founder activates it from the UI, then it becomes active.
- Given an active bet, when the founder adjusts its appetite, then the new appetite persists without a 400.
- Given a bet with an in-progress task, when the bet is killed, then that task no longer runs (or the dialog accurately states it will keep running).
- Given a task with sessions, when its surface loads, then the sessions appear with correct active/completed status.

**Plan calls.** Backend + frontend — `/design` for the new activation control and appetite editor (small surface, routine classification). Architecture pass on the kill-cascade contract, the task-sessions endpoint, and task-transition CAS. The kill-cascade decision (does killing a bet stop downstream work, and how) is a domain-semantics choice; if it reshapes the bet/task lifecycle contract rather than completing it, run `/concept` on the lifecycle model first.

**Contracts / constraints.**
- Dialog copy must match actual behavior — no promising a cascade that does not happen.
- Task transitions must be as concurrency-safe as bet transitions already are.
- Appetite is money; it must use the money contract (coordinate with AF10's formatting).

**Out of scope.** Auto-dispatch of sessions (AF7 owns the "ready → session" seam). Cost accounting itself (AF10).

**Effort.** L (~5d)

---

### AF13 — Knowledge authoring and curation that works

**Workpackage.** As someone building the knowledge base, I want to create an item and immediately be able to edit it, sort the list and have it actually reorder, change scope without a spurious conflict, and trust the metadata shown, so knowledge management is usable rather than a set of dead controls. Today an item created with the default scope is immediately uneditable, the sort pills are placebo, the scope-change dialog 409s after any edit, and several metadata fields are permanently empty or wrong.

**Why this matters.** Knowledge is a core surface and its authoring loop is broken in ways a user hits on their very first item. The audit confirmed: the default "Shared" scope maps to `factory`, which hides the Edit button (you cannot edit what you just created); the create endpoint ignores the requested status and always makes a draft, so activating your own item requires Triage — which then hides it until reload; sort pills change the URL but not the order; the scope-change dialog sends a stale version and always 409s after an autosave; "Access count" is always 0 and Backlinks always empty because the detail endpoint omits the fields the UI declares.

**What exists today.** Knowledge CRUD, the autosave state machine, the triage flow with keyboard shortcuts, the scope-change dialog, `BodyEditor`, and the fabric signal columns all exist. The defects are wrong default-scope→editability coupling, a non-functional sort, a version-tracking bug in scope change, and detail-response fields the UI expects but the route omits. Closes Z8-034, Z8-035, Z8-036, Z8-072, Z8-073, Z8-074, Z8-075, Z8-076, Z8-077, Z8-132, Z8-133, Z8-134, Z8-135, Z8-136, Z8-138, Z8-139, Z8-140, Z8-141.

**What's genuinely missing.** Default-created items that are editable; a create flow whose status request is honored; sort pills that actually reorder; a scope-change that uses the current version; a triage flow whose validated items remain findable; and detail metadata (access count, backlinks, editor identity, kind, topic) sourced correctly so the displayed values are real.

**Depends on.** AF4 (knowledge routes type-green) and AF5 (knowledge UI type-green).

**Complexity.** L

**Acceptance criteria.**
- An item created through the default flow can be edited immediately by its creator.
- Choosing a sort order actually reorders the knowledge list.
- Changing an item's scope after editing its body succeeds without a spurious version conflict.
- After validating an item in triage, the item remains findable (it does not vanish from every tab until reload).
- Knowledge detail metadata (access count, related items, editor, kind, topic) reflects real data rather than permanent placeholders.
- The team scope is selectable where the product intends it to be (not permanently disabled by mistake).

**Validation scenarios.**
- Given a user creates an item with the default scope, when they open it, then an edit affordance is available and editing persists.
- Given a populated list, when the user switches sort from relevance to recency, then the order changes accordingly.
- Given a user edits a body then changes scope, when they confirm, then the scope change succeeds.
- Given a user validates a triage item, when they return to the list, then the item is present in the appropriate tab without a reload.

**Plan calls.** Frontend + backend — `/design` for the default-scope/editability and triage-visibility flows (routine classification; the surfaces exist). Architecture pass on the create-status contract, the scope-change version handling, sort implementation, and the detail-response fields.

**Contracts / constraints.**
- Scope vocabulary shown to users must follow the established AD6/AE1 label rules (no leaking raw scope-kind enums).
- The detail endpoint must return the fields the UI hook declares, or the UI must stop declaring them — no permanent placeholders.

**Out of scope.** Relevance/promotion/FTS fabric mechanics (AF9). Merge/split as new UI surfaces (only fix what exists; net-new surfaces need their own justified workpackage).

**Effort.** L (~3d)

---

### AF14 — Conversations correctness and live updates

**Workpackage.** As someone coordinating through threads, I want my inbox ordered by recency with readable titles, my messages to stay visible after I send them, new replies to appear without a manual reload, and the filter chips and overlays to actually work, so conversations are usable. Today the list sorts by UUID, assistant-overlay messages vanish after sending, open threads never live-update, the Unread/Blocking chips can never match, and the wrong assistant overlay is mounted so tool-call summaries never render.

**Why this matters.** Conversations is the primary surface — the first thing users land on — and it is broken in ways that make the inbox "effectively unusable" (the tester's words): UUID-stub titles plus a sort that parses a relative-time string to `NaN` and falls back to id-compare, so recency is scrambled. Messages sent in the assistant overlay persist to the DB but disappear from view until the overlay is reopened. Nothing subscribes to the per-thread live channel, so an agent's reply to the thread you're reading is invisible until reload. The rebuilt `AssistantOverlay` (with tool-call summary rows) exists but the stale `CocOverlay` is mounted instead.

**What exists today.** The thread list, detail, composer, `RecipientPicker`, the review verdict toolbar (which works), the WebSocket infrastructure with per-thread topics, and both the stale `CocOverlay` and the rebuilt `AssistantOverlay` all exist. The defects are a broken sort comparator, no optimistic/refetch after overlay send, no per-thread WS subscription, filter fields that are never populated, and the wrong overlay component wired in. Closes Z8-011, Z8-015, Z8-016, Z8-017, Z8-018, Z8-052, Z8-053, Z8-054, Z8-055, Z8-056, Z8-057, Z8-058, Z8-059, Z8-060, Z8-103, Z8-104, Z8-105, Z8-106, Z8-107, Z8-108, Z8-109, Z8-110, Z8-111, Z8-112.

**What's genuinely missing.** Recency-ordered lists with human-readable titles; assistant-overlay sends that stay visible; live updates in open threads and the list via the existing WS channel; filter chips that match real state (or are removed if the state is never produced); the correct overlay mounted so tool-call summaries render; and dedup so the same recipient does not spawn duplicate DM threads.

**Depends on.** AF4 (thread/conversation routes type-green) and AF5 (conversations UI type-green).

**Complexity.** L

**Acceptance criteria.**
- The thread list is ordered by recency, and threads show human-readable titles rather than raw identifiers.
- A message sent in the assistant overlay remains visible immediately after sending, without reopening the overlay.
- A reply that arrives in the thread the user is currently reading appears without a manual reload.
- Filter chips reflect real thread state — they match the threads they claim to, or they are not shown when the underlying state is never produced.
- The assistant overlay that renders tool-call summaries is the one mounted in production.
- Starting a conversation with a recipient who already has a direct thread reuses it rather than creating a duplicate.

**Validation scenarios.**
- Given several threads with known recent activity, when the list renders, then the most recently active is first.
- Given the assistant overlay, when the user sends a message, then it stays visible in the stream.
- Given an open thread, when another participant posts to it, then the new message appears without reload.
- Given a recipient with an existing direct thread, when the user starts a new conversation with them, then the existing thread opens.

**Plan calls.** Frontend + light backend — `/design` only if the title/empty-state treatment needs exploration (routine; surfaces exist). Architecture pass on the sort comparator, the WS subscription for open threads and the list, the overlay-send refresh, the filter-field population (or chip removal), and DM dedup. Resolve the half-landed `CocOverlay`→`AssistantOverlay` rename.

**Contracts / constraints.**
- Live updates must use the existing per-thread WS channel, not polling, unless `/architecture` justifies otherwise.
- If a filter cannot be backed by real state, remove the control rather than ship a chip that never matches.
- Complete the overlay rename rather than leaving two divergent components.

**Out of scope.** Session dial-in's deeper session-activity content (depends on AF7 producing real sessions). Search (AF16).

**Effort.** L (~4d)

---

### AF15 — Settings reachability and persistence

**Workpackage.** As a user configuring HyperIdle, I want every settings section to be reachable and every setting I change to persist correctly and safely, so configuration actually works. Today several built sections are mounted nowhere, the Models autosave silently wipes a stored API key, the Backend section always reports the wrong mode, re-running setup creates duplicate teams, and some toggles never persist.

**Why this matters.** Settings is where the user makes the product theirs, and large parts of it are unreachable or actively destructive. The audit confirmed `SettingsWorker` and `SettingsAgents` are fully built and tested but imported nowhere (so worker registration and agent config are unreachable from Settings), the Models autosave's full-replacement write silently erases a stored openai-compatible key when an adjacent tier is edited, the Backend section reads the wrong bridge field and always says "Local (laptop)", setup re-submission creates duplicate teams with full rosters, and the "Email digests" toggle never persists.

**What exists today.** `SettingsPage` mounts eight sections; `SettingsWorker` and `SettingsAgents` exist and are tested but unmounted; `SettingsTeams` is referenced but has no component. Model config persists to a `server_config` JSON blob via a full-replacement PATCH. Org-chart team edges, notification toggles, and credential status all exist with the specific defects above. Closes Z8-040, Z8-041, Z8-042, Z8-043, Z8-044, Z8-045, Z8-078, Z8-081, Z8-083, Z8-142, Z8-143, Z8-144, Z8-145.

**What's genuinely missing.** The built-but-unmounted sections reachable (or explicitly removed if not intended for launch); a Models save that preserves other tiers' stored keys; a Backend section that reports the real mode; an idempotent setup that does not duplicate teams; toggles that persist what they claim to; and org-chart team edges that can actually be created from the UI.

**Depends on.** AF4 (settings/model-gateway/org/credential routes type-green) and AF5 (settings UI type-green).

**Complexity.** M

**Acceptance criteria.**
- Every settings section intended for launch is reachable from the Settings navigation; sections not intended for launch are removed rather than left as dead nav.
- Editing one model tier does not erase another tier's stored credential.
- The Backend section reports the actual backend mode.
- Re-running setup does not create duplicate teams or rosters.
- A settings toggle that presents as persistent actually persists across reload; any toggle that cannot persist is not presented as if it does.
- A first org-chart relationship can be created from the UI.

**Validation scenarios.**
- Given the Settings nav, when the user opens it, then every launch section is reachable and no dead/ghost section is shown.
- Given a stored openai-compatible key on one tier, when the user edits another tier, then the first tier's key survives.
- Given setup has already completed, when it is re-submitted, then no duplicate team is created.
- Given a persistent-looking toggle, when toggled and the page reloaded, then the new state remains.

**Plan calls.** Frontend + backend — `/design` for mounting/removing sections and the settings nav (routine). Architecture pass on the Models partial-update contract (stop full-replacement key wipes), setup idempotency, the Backend mode source, and toggle persistence.

**Contracts / constraints.**
- A control that cannot persist must not present as persistent.
- Setup must be idempotent for teams as it already is for users.
- Model-config saves must be field-level safe — never clobber unrelated stored secrets. Coordinate plaintext-at-rest with AF11.

**Out of scope.** The deeper credential-security model (AF11). Worker runtime behavior (AF7) beyond making its settings section reachable.

**Effort.** M (~2d)

---

### AF16 — Display correctness, dead controls, and project hygiene

**Workpackage.** As any user, I want the surfaces to show real values instead of "NaN%"/"--", every visible button to do something, and the project's own docs/naming to tell the truth, so the product feels finished rather than half-wired. This is the consolidated cleanup of the remaining confirmed display bugs, no-op controls, and documentation/naming-hygiene defects that don't belong to a functional subsystem above.

**Why this matters.** These are the rough edges a user hits constantly: a bet stat card rendering literal "NaN%" with a full green progress bar, an artifact "image" rendering as the text "400×300", buttons with no `onClick`, a breadcrumb linking to a route that 404s, search results in unpredictable order, and the codebase's own CLAUDE.md claiming a BullMQ stack that doesn't exist. Individually small, collectively they are the difference between "polished" and "broken." Grouping them avoids spinning up a dozen tiny pipelines.

**What exists today.** All the relevant surfaces exist; the defects are localized rendering/handler/label bugs and stale documentation. Closes Z8-019, Z8-020, Z8-021, Z8-026, Z8-027, Z8-028, Z8-033, Z8-046, Z8-066, Z8-067, Z8-068, Z8-069, Z8-070, Z8-085, Z8-086, Z8-087, Z8-089, Z8-113, Z8-114, Z8-115, Z8-117, Z8-118, Z8-120, Z8-125, Z8-128, Z8-129, Z8-130, Z8-131, Z8-147, Z8-148, Z8-149, Z8-150, Z8-151, Z8-152, Z8-154, Z8-155, Z8-156, Z8-157, Z8-158, Z8-160, Z8-164, Z8-165, the observability-default item Z8-100, the unbounded-table retention item Z8-097, and the naming-purge item Z8-091 (banned "CoC").

**What's genuinely missing.** Zero "NaN%"/placeholder leakage on populated and empty states; no visible control without an action (every button does something or is removed); correct navigation targets; deterministic, relevance-ordered search; real artifact rendering per kind (or an honest "no preview" affordance); routine/team data that refreshes after mutation; consistent money/label formatting; banned-term and false-claim removal from docs (Rail/CoC purge, BullMQ claim, fictional `file_leases`); a sane observability default (tracing configured rather than silently off with console/noop only); a retention/TTL sweep so operational tables that currently grow without bound (login sessions, invite codes, the notification queue, access logs, propagation log) are pruned on a schedule; and the smaller a11y/UX consistency fixes.

**Depends on.** AF4 (server routes type-green) and AF5 (web type-green) — this touches many UI surfaces and their routes and must land on verified types.

**Complexity.** L

**Acceptance criteria.**
- No surface renders "NaN%", a misleading progress bar, or a raw placeholder where a real value or a clean empty-state belongs, on both populated and empty data.
- Every visible interactive control performs an action or is removed; no button is a no-op, and no breadcrumb/link targets a non-existent route.
- Search returns results in a deterministic, relevance-aware order, and its candidate set is not arbitrary.
- Artifacts render appropriately for their kind, or show an honest "no preview available" affordance rather than misrepresenting content as text.
- After creating a routine or agent, the relevant surface reflects it without a manual reload.
- Project documentation contains no banned terms (Rail, CoC) and no false claims (BullMQ/Redis stack, a `file_leases` mechanism) that the audit disproved.

**Validation scenarios.**
- Given a zero-task bet, when its detail loads, then the progress shows a real value/empty-state, not "NaN%".
- Given any page, when every visible button is clicked, then each performs an action (none is a silent no-op).
- Given a search query, when run twice, then the result order is stable and relevance-aware.
- Given an image artifact, when its permalink loads, then it renders as an image or shows an explicit no-preview affordance.

**Plan calls.** Frontend + docs + light backend — `/design` for the artifact-rendering and empty-state treatments (routine). Standard architecture pass; this workpackage is broad and `/architecture` is expected to split it into a few sub-batches (work-surface display, search, artifact rendering, doc/naming hygiene) — that split is welcome.

**Contracts / constraints.**
- Honor the Hearth design system and the Rail/CoC purge directives (no banned terms reintroduced).
- Money and label formatting must use the shared helpers from AF10/AF13.
- Documentation claims must match the code (no aspirational infrastructure described as present).

**Out of scope.** Anything already owned by AF6–AF15. Net-new features (this is correctness and hygiene only).

**Effort.** L (~4d)

---

### AF17 — Seed factory split and Nimmly purge

**Workpackage.** As a HyperIdle user — on desktop or on the shared backend — I want a freshly-set-up environment to come with its complete factory layer (system identities, facilitator agents, agent soul templates, factory principles) and only *my own* team and agents, so the strategy and automation layer actually works and I never see another product's demo data. Today the desktop runs no seed at all (so it silently lacks the factory layer), the only seed path plants a fake "Nimmly" team, founder, and demo agents, and the shared backend ships with an empty database. After this, the genuine factory bootstrap is applied automatically and idempotently in both environments, a user's team and its automation are created by onboarding (not pre-seeded), and the word "Nimmly" — a separate product — appears nowhere in the codebase.

**Why this matters.** The desktop app limps today: because it skips the seed it has no facilitators, no built-in routines, and no soul templates, and is one foreign-key failure away from breaking when a bet enters review (the propagation system identity is missing). The shared backend deploys as an empty shell, so the release cycle produces something nobody can use. And "Nimmly," a real and separate product, is smeared across ~148 places including the production seed — cross-product contamination that misleads every reader and ships demo rows into real databases. The founder and every end user benefit: the app stops silently degrading, the deployed backend becomes usable, and the codebase stops claiming to be a different product. Not building this leaves the desktop subtly broken and the shared-backend release cycle with no working payload.

**What exists today.** `packages/db/src/seed.ts` seeds everything in one function — genuinely team-agnostic factory data (the `system:propagation` user, a system assistant, facilitator agents per community of practice, soul-prompt templates, a factory principle, cost settings) **welded to** demo data (a "Nimmly" team `seed-product-1`, a "Founder" human, demo builder/PM agents, a daily-digest bet/task/routine) and the built-in routines (`post-bet-retro`, `portfolio-retro`, `knowledge-decay`, `practice-meeting`), which are scoped to that demo team. `setup-cli` runs the full seed; **desktop runs no seed** and relies on onboarding — `SetupFlow` calls create-user (which creates the human plus their assistant) and create-team (which generates an agent roster from the team's functions). The shared backend (`deploy.yml` + Helm chart + `migrate-pg.ts`, all on `main`) migrates but does not seed. ~10 db integration tests call `seed()` directly.

**What's genuinely missing.** The factory layer never reaches a real user's database (desktop skips the seed; the deploy never seeds), so both environments run without it. There is no seam that applies *only* the factory bootstrap, no path that provisions a team's built-in routines when the team is created (they are hard-wired to the demo team instead), and no boundary keeping demo/example data out of production seeds and out of a product that is not "Nimmly."

**Depends on.** None. Builds on the already-merged shared-backend deploy (`deploy.yml`, Helm chart, `migrate-pg.ts` exist on `main`).

**Complexity.** L

**Acceptance criteria.**
- A freshly-set-up desktop environment has the complete factory layer present (system identities, facilitator agents per community of practice, agent soul templates, factory principles) without any manual step.
- A freshly-deployed shared backend has that same factory layer applied automatically; re-applying it changes nothing (idempotent).
- A user's own team and its automation — agent roster and built-in routines — are created when the team is created at onboarding, owned by that team's own agents, in both local and shared environments.
- A real user's database (desktop or shared) contains no demo or example team, user, or agent — the user sees only their own.
- A bet entering review never fails because the propagation / review-thread system identity is missing, in any environment.
- The product contains no reference to "Nimmly" anywhere — code, seed, tests, stories, or docs; any example data that remains in tests uses a neutral, clearly-fictional name.

**Validation scenarios.**
- Given a brand-new desktop install, when the user finishes onboarding, then facilitators, soul templates, and the user's team-scoped built-in routines all exist and the user's database has no second/demo team.
- Given a freshly-deployed shared backend, when the deploy completes, then the factory layer is present; and when the deploy runs again, then no rows are duplicated or changed.
- Given a bet that transitions into review on a freshly-set-up environment, when the review thread is authored, then it succeeds because the system author exists.
- Given the whole repository, when searched for "nimmly" (any case), then there are zero matches.

**Plan calls.** Backend + data + light desktop/deploy wiring — skip `/design` (no UI surface). Standard architecture pass with one load-bearing decision to lock: the factory-vs-team-vs-test-fixture boundary (which rows are team-agnostic factory bootstrap, which are provisioned per-team at onboarding, and which are demo fixtures for tests / `setup-cli` only). `/architecture` is expected to split this into coherent sub-batches (seed split + factory wiring into desktop and deploy; per-team routine/roster provisioning at team creation; Nimmly purge across code/tests/docs) — that split is welcome. Built-in routines have `team_id` and `owner_agent_id` NOT NULL, so they cannot be factory-level — plan their creation at team-creation time.

**Contracts / constraints.**
- No demo or example data in any production seed path; example data lives only in test / `setup-cli` fixtures under a neutral, clearly-fictional name.
- No reference to "Nimmly" anywhere (hard purge, same class as the Rail/CoC directives); add a guard so it cannot be reintroduced.
- The factory bootstrap must be idempotent (safe to re-run on every desktop launch and every deploy).
- Onboarding remains the sole creator of a user's team, human identity, and assistant in both local and shared modes — the seed never creates a user-facing team.
- `npm run verify` passes after merge (Track AF constraint).

**Out of scope.** External reachability of the shared backend (Cloudflare tunnel / ingress host — separate infra task). Distribution of the shared API key to clients. Any redesign of onboarding UX beyond making it the owner of team/routine provisioning. Purging other example names not covered here.

**Effort.** L (~3d)
