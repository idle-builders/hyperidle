# Audit D — docs/process-layer + docs/knowledge-architecture

Checked at origin/main 92178fb93. Every claim below checked against code, not neighbouring docs.
Scope: 10 process-layer pages (1,011 lines) + 4 knowledge-architecture pages (280 lines) = 1,240 lines.

## Big picture

- "Process layer = four primitives (Task, Session, Team, Subscription)" no longer matches the code.
  The code's model is objects + actions: task, thread, document, user (+ session, platform/plugins),
  declared in `framework/domain-model/src/actions/{task,thread,document,user,session,platform}.ts`.
  Team is a name attribute on a user (`teams` = id, name, createdAt; set via `edit_user({team:{name}})`).
  Subscription is a field of user (`edit_user.subscriptions`, module `layers/core-api/user`).
  Thread, the second-most-central object, is not in this folder at all.
- "Knowledge architecture" as a separate layer (canonical store / fabric / sync) is three views of one
  object: the document. The mechanisms are real (manifest, watcher, 500 ms debounce, writeback,
  scoring, budget) but "fabric" / "canonical store" are not code concepts. Merge into document pages.
- Every page carries history (BB1 boxes, "what the merge cut", "why the second table went",
  "what subscriptions dropped", cost-cap @lore quote), track ids (AO1, AO2, AN, AN4, AO3, AO4, AL7,
  AC1, U1, O2, AU1, AU21, BB1), and founder-quote journals. All must go.

---

## docs/process-layer/index.md (15 lines) — REWRITE

- False: :3 "Task, Session, Team, Subscription" framing; :5 BB1 box (history + track id);
  :9 "HandoffMetadata, system-resolved roles" — HandoffMetadata no longer exists (0 hits in code),
  roles are not resolved (handoff = `edit_task` owner edit); :14 "owns the WIP ceiling ... record of the
  deleted cost-cap feature" (history); :15 "Money/TokenUsage as shipped ... ModelTierUnknownWarning"
  — Money type is gone, warning never existed.
- Replace with new folder index (see target structure).

## the-four-primitives.md (201 lines) — DELETE (content moves to task / session / user pages; ~25 lines survive)

False/stale:
- :5 BB1 box + founder quote — history.
- :20 "Product merged 1:1 into Team (U1: the teams table is the former products table)" — history.
- :32 "`PRINCIPLES` and `FOCUS` — canonical factory-scoped documents" — no such documents or
  names anywhere in code (`rg '\bPRINCIPLES\b|\bFOCUS\b'` → 0 hits). Invented.
- :68 "the goal is `doneCondition`; every task has one" — column nullable
  (`framework/db/src/schema.ts` tasks.done_condition; `actions/task.ts:78` `z.string().nullable()`).
  Also: the agent working a task is NOT given its own task's doneCondition — only its ancestors'
  (`layers/core-api/task/src/task-run-resolver.ts` bakeTaskContextBundle: `task:{id,title,description,state}`;
  `provisioner.ts` composeTaskInstruction). Code gap worth flagging.
- :82-93 "What the merge cut, and why" / "Before the merge this was incoherent" — history.
- :95-96 "Strategy signals (`riskTier`) live in `task_planning_signals` ... O2 kernel/strategy split"
  — table deleted (schema.ts:228 comment says so); tasks-and-sessions.md:38 says the opposite. Contradiction.
- :107 "AU1 made taskId optional so ... knowledge review requests" — knowledge review requests gone;
  real sources are work intents thread_turn, task_run, session_resume, subscription_run
  (`framework/domain-model/src/work-intent.ts`).
- :113 modelTier "tier vocabulary owned by model-routing-and-cost.md" — model routing removed (truth sheet).
- :114 session state "`active | paused | done | crashed`" — real: `active | done | stopped | crashed`
  (`framework/domain-model/src/actions/session.ts:38`).
- :115 SessionOutcome in `events.ts` — it is in `framework/domain-model/src/types.ts:245`.
- :118 "effectivenessScore — AC1 grading" — no production writer (only `tools/setup/src/demo-world/activity.ts`);
  the route that validated it (`layers/core-api/src/routes/sessions-routes.ts`) no longer exists.
- :168 "doesn't fit one of these five" — page says four.
- :199-201 anti-patterns point at WIP limits page; "hitting a WIP limit surfaces" — it silently
  re-queues the request (`run-orchestration/src/runtime.ts:441` releaseClaim → pending).
Trim: §1 and §5/§6 philosophy (workflow engine, "Not Jira") duplicates ETHOS/product docs — one short
"what this is not" paragraph max, on the task page.
Missing: thread; user as the owner of subscriptions/folders/connections; plugins.

## tasks-and-sessions.md (117 lines) — REWRITE (split: task half → task.md, session half → session.md)

False/stale:
- :11 "`accepted` — the team lead has accepted it" — teams have no lead.
- :12 dependency watcher "transitions this task to accepted and notifies the owner" — no notification;
  it is a plain `edit_task` call (`layers/core-api/task/src/dependency-watcher.ts:18-24`, :73).
- :38-42 "Why a boolean and not a risk tier" — history of `task_planning_signals`.
- :48 "exactly how an earlier version of this rule died silently" — history.
- :79 "read-only `context/` (factory, product, practices)" — real: `context/` holds only `session.toon`
  (`run-orchestration/src/context.ts:352`, :932); per-layer dirs were removed (context.ts:600).
- :81 "Writeback syncs knowledge/ and work/ back ... work/ (artifacts)" — anything in work/ except the
  two notes files is ignored (`run-orchestration/src/writeback-processor.ts:151`, rules table in sync doc).
- :93 "work/task-notes.md ... notes" and :106 "The task's notes (tasks.notes) — written continuously
  during the session (synced back via the file watcher)" — FALSE. Watcher writes `sessions.notes`
  (`writeback-processor.ts:568-572`), not `tasks.notes`. `tasks.notes` is only appended via
  `edit_task({appendNote})` (`task/src/task-actions.ts:720`).
- :67-69, :95, :106 "Agent A starts a new session, reads its previous notes, continues" — nothing puts
  previous notes into the next session: task-notes.md is created empty (`context.ts:659`), the baked
  bundle has no notes (`task-run-resolver.ts` bakeTaskContextBundle). The whole "session = working day,
  write notes before compaction, read them tomorrow" story is not implemented.
- :94 "pre-compaction trigger (builtin adapter: 0.8 context fraction → pre_compaction event,
  builtin-harness-adapter.ts)" — builtin adapter deleted; `preCompactionTrigger: false` for every adapter
  (`harness-registry/src/cli-harness-adapter.ts:1471`, `remote-harness-adapter.ts:214`).
- :73 "an outcome, and a cost" — sessions have no cost.
- :105 memory "Assembled into `context/` at session start" — own-scope documents go into `knowledge/`
  tree, not context/ (context.ts writeContextBundle).
- :14, :59, :117 "WorkTeam AgentRow health indicators surface blocked/held tasks" — AgentRow health is
  per-agent run health (WorkTeam.tsx:365-380 lore), not task blockers. Unverified as stated; drop.
Trim: §2 "working day" analogy, §1.1 "Why the flag exists" narrative, vocabulary note :57 (belongs in blocks).
Keep: state list, hold vs blocked, needsReview table, kill-cascade rules, dependency rules (all verified:
`task-actions.ts` killSubtreeInTx, `dependency-watcher.ts`).

## handoff-and-lifecycle-propagation.md (99 lines) — MERGE→task.md

False/stale:
- :9, :19-21 "Handoff used to be its own mechanism ... What is gone, deliberately" — history.
- :21 "dedicated `session_handoff_completed` event ... gone" — event type still declared
  (`framework/event-bus/src/events.ts:176`) and listened to (`run-orchestration/src/start-runtime.ts:321`)
  but never emitted — dead code, not a doc issue; doc should just not mention it.
- :25 dependency watcher "notifies its owner" — no (see above).
- :53 "Session ends with completed → Task transitions to `review`" — FALSE: `done` unless
  `needsReview` (`layers/core-api/policy/src/lifecycle-propagation.ts:132`). Contradicts tasks-and-sessions §1.1.
- :54 "Task has other active sessions still running → no transition — last completer triggers" —
  FALSE; that guard was deleted (lifecycle-propagation.ts:85-117 lore: first finisher flips the task).
- :62 "parent transitions to `review`" and "the parent is `in_progress`" — FALSE: target is done/review by
  needsReview (:239), and any non-terminal, non-review parent qualifies (:70, :221).
- :70 team status derived in `WorkTeam.tsx` — derived in the `useTeam` hook (WorkTeam.tsx:22-27).
- :88-89 "No platform team ... dogfooding"; "Product Manager senses trajectory ... cost burn slope" — opinion/stale.
- :99 "escalation/review-item surface" — review items gone.
Missing: when a root task auto-completes, a "Confirm shipping?" review message is posted into its thread
by `system:propagation` (`lifecycle-propagation.ts:328-365`, called :247) — real behaviour, undocumented.
Keep (~30 lines into task.md): handoff = `edit_task` setting `ownerAgentId` on accepted/in_progress task →
second `task_dispatch_attempts` row `occasion:"owner_handoff"`, old run ended, new one started
(`task-actions.ts:781-808`); upward propagation rules; race = InvalidTransitionError swallowed;
failure = `propagation_failed` event.

## teams.md (55 lines) — MERGE→user.md (~15 lines survive)

False/stale:
- :9-10 "those went with the setup wizard's scaffold-tracking columns" — history.
- :17-19 "The welcome screen does this twice — once naming the founder's team, once naming the team's own
  agent" — FALSE: setup creates the person with a team name, then an owned assistant with no team name
  (it takes its owner's team) subscribed to all 9 events (`layers/core-ui/src/pages/SetupFlow.tsx:322-352`).
- :32-34 "muscle memory ... tenth faster than the second" — marketing claim, nothing in code measures it.
Keep: team = id+name, set by name (found-or-created), owned agent inherits owner's team, never deleted,
team scope on documents, folders registered per team.

## subscriptions-and-retros.md (126 lines) — REWRITE→user.md §subscriptions (~45 lines) + plugin page

Accurate (verified): event xor schedule; 9 events; schedule agent-only (`user-actions.ts:521`); 30 s tick
(`subscription-clock.ts:139`); cron AND of day-of-month and day-of-week (`user/src/cron.ts:129-133`);
no self-wake, reach rule, inbox row + `user:<id>` push (`subscription-fire.ts:15-23`, :209, :235);
plugin subscriptions table matches `plugins/document-management/plugin.json`.
Stale/trim:
- :8-9 "weekly knowledge sweep" wording fine; :33-34 "the founder's ruling" — journal.
- :60-70 "What subscriptions dropped" (routine humanReview/silent) — history.
- §6-§7 retros are plugin content, not core. Move to a plugin page (document-management plugin) or
  cut to one table. :115-117 "nested under knowledge/ at the team's own position in the tree" — assembly
  is by scope, not tree position (session-documents.ts:50).
- :126 links to knowledge-view.md — check that page separately.
Missing: `prompt_for_agents_only` refusal; the fresh-install assistant subscribed to all 9 events.

## artifact-primitive.md (152 lines) — MERGE→document.md (~20 lines survive)

False/stale:
- :15-28 "Why the second table went" — history.
- :45-49 "Only `task` and `thread` may be named by a client via edit_document's parent" — FALSE; clients
  may name `document` too (only agent/subscription are refused, `forbidden_parent_kind`,
  `core-api/document/src/document-actions.ts:646`). Contradicts :116-119 on the same page.
- :57-68 fenced-html measurement + "deciding argument against a payload column" — design journal.
- :145-148 "`artifacts:` remains a live key in ... the handoff filename array, ... the core-api port client"
  — handoff metadata and CoreApiPort are gone; only review canvas keys remain (`actions/thread.ts:124`).
- :140-143 restates the `artifact-is-not-a-storage-concept` governance rule — link, don't restate.
Keep: artifact = document with task/thread parent; `as` derived; three ways to make one; not in tree;
reparent to `document` to move into tree; provenance lives in `changes`.

## filesystem-primitive.md (117 lines) — REWRITE→folders.md (~45 lines)

False/stale:
- :1, :3, :7, :14, :23-25, :43, :57, :65, :83, :94, :113, :117 track ids (AO, AO1, AO2, AO3, AO4, AN, AN4, AL7).
- :7 "`filesystem_captures` table" and :76 "captured back before sandbox teardown into filesystem_captures —
  a git bundle ... snapshot dir" — FALSE; no such table (22 tables, truth sheet; 0 code hits). Mount is a
  git worktree/clone or a symlink straight into the sandbox; writes land in the real repo/folder
  (`run-orchestration/src/mounter.ts:78-160`). `writeback` is stored, not acted on in mounting.
- :7 "`layers/agent-orchestration/filesystem-mounting/`" — gone; mounter is `run-orchestration/src/mounter.ts`,
  registry `layers/agent-orchestration/filesystems/`.
- :28 "rejected at the Zod boundary on POST (`framework/filesystem-contract/...`;
  `layers/core-api/src/routes/filesystems.ts`)" — both paths gone. Kind is a closed enum `code|doc_set`
  in `actions/user.ts:237` (edit_user.folders), so :88-89 "kind is an open vocabulary" is FALSE.
- :26, :34, :88, :107 gdrive/Drive as a working source — cloud sources are refused at mount
  (`CloudNotBuiltAdapter`, mounter.ts:53, :68).
- :71 lifecycle "registered → reachable ⇄ needs_attention" — states are `attached|reachable|needs_attention`.
- :53, :99 "knowledge-export target/config" — no export exists (canonical-store.md:79 says so).
- :56, :87, :92, :109 `{ agent_user_id, filesystem_id }` — fine as table, but reached only through
  `edit_user.folders.give/take` now; page never says so.
- §Vocabulary table, §Contracts "Hard rules" 1-8, "Forward-only migration" — journal/contract noise.
Keep: team-registered, given to 0..N agents; filesystem vs tool (connection) vs document; code vs doc_set;
needs_attention when unreachable; agents get their own credentials.
Code comment pointing here: `layers/agent-execution/harness-registry/src/cli-mcp-config.ts:154`.

## wip-and-cost-limits.md (27 lines) — DELETE (3 lines → session.md)

False/stale:
- :5 cost-cap @lore with founder quote — history.
- :9 "At the limit, new task assignments queue or get reassigned to a teammate" — no reassignment; the
  request is released back to pending (`run-orchestration/src/runtime.ts:441`, `start-runtime.ts:105-125`).
- :9 `ConcurrencyLimitError (framework/domain-model/src/errors.ts)` — lives in
  `layers/agent-orchestration/run-orchestration/src/errors.ts:30`.
- :13 `layers/core-api/work/src/task-state-machine.ts` — package gone.
- :21-27 duration doctrine + "rejected by this section" — policy essay about a thing that doesn't exist.
Keep: "each agent runs at most `maxConcurrentSessions` (default 1) at once; extra requests wait."

## canonical-shapes.md (51 lines) — DELETE

False/stale:
- :5-14 Money section — FALSE. `Money`, `WireMoney`, `CURRENCY_SCALE`, `addMoney`, `compareMoney`,
  `CURRENCY_CODES` do not exist; `framework/domain-model/src/types/money.ts` holds only `TierTokenCount`
  and `TokenUsage` (and the file name is now misleading).
- :16-22 ModelTierUnknownWarning "contract ... the spec to build toward" — a plan, never built; path
  `framework/harness-protocol/src/harness/harness-event-normalization.ts` wrong
  (real: `layers/agent-execution/harness-registry/src/harness-event-normalization.ts:334`).
- :37 BetOutcomeVerdict deleted in BB1 — history.
- :44 effectiveness range rejected in `layers/core-api/src/routes/sessions-routes.ts` — file gone; no writer.
- :48 "migration 0038; @lore AO1 — Track AN may add the FK" — history + track ids.
- :49 "HyperIdle classifies, routes to review" — nothing classifies; agents ask for review themselves.
- :50 "Filesystem" is a one-line pointer — yet code cites "canonical-shapes.md §Filesystem", a section that
  does not exist.
Surviving facts: outcome verdict 4 values + meanings → task.md; TokenUsage per-tier sparse → session.md (1 line).
Code comments pointing here: `layers/agent-orchestration/filesystems/src/filesystem-shape.ts:14`,
`layers/core-ui/src/settings/SettingsFilesystems.stories.tsx:9`, `:50`.

---

## knowledge-architecture/index.md (11 lines) — DELETE (folder dissolves into document pages)

- :3 "two projection layers" framing; :11 archive pointers — history. CLAUDE.md:113 still says
  "five storage layers" — also stale.

## the-canonical-store.md (79 lines) — MERGE→document.md (mostly accurate; ~55 lines survive)

Verified: columns (schema.ts documents), 4 statuses, 5 slots, 5 parent kinds, no FK on parent,
singular-slot unique index (`doc_parent_slot_uq`), `documentAs` rules, `canReadDocument` predicate,
depth 32 (`document-store.ts:55`), scope-narrowing cascade (`document-actions.ts:840-883`), default team
scope when author has a team (`document-actions.ts:406-424`), `stale` problem on version mismatch,
read counters only on open, `changes` as history, pushes on `document:<id>` + `documents`.
Stale/trim:
- :3 PGlite/postgres-js paragraph — belongs in deployment/architecture, not the document page.
- :35 "there is no drag-to-reorder interface; the column exists so one can be added later" — plan talk.
- :55 "Adding a scope kind requires a concept-doc update first" — process rule, drop.
- :57 "on the founder's own reasoning" — journal.
- :77-79 "Git is an export, never the source of truth / Not implemented" — heading claims a thing then says
  it doesn't exist. Replace with one line: "The database is the only store."
- "knowledge object" wording throughout → "document".

## the-knowledge-fabric-how-knowledge-moves.md (122 lines) — MERGE→documents-in-sessions.md (~60 lines)

Verified: `assembleSessionDocuments` (`core-api/document/src/session-documents.ts:456`), factory + team +
own ordinary docs, capability docs by slot, weights 0.55/0.20/0.15, 30-day recency, 200k × 0.2 = 40k
budget, factory docs always included, usage bump; sandbox layout, `knowledge/rules`, `_<id8>` names,
`index.md` for ancestors, `.claude/skills` + `.agents/skills`, context/ chmod 0444, manifest shape
(`run-orchestration/src/manifest-types.ts`).
False/stale:
- :106 "scored against the task description" and :110 "Tag match 0.55 ... vs task tags" — FALSE in effect:
  `assembleSessionDocuments` always passes `taskTags: []` and never uses `taskDescription`
  (session-documents.ts:470-473), and `computeTagMatch` returns 0 for empty tags. Ranking is
  recency (0.20) + confidence (0.15) only; 55% of the weight is dead. Doc should say so (or code fixed).
- :47 "the task-run resolver, the subscription resolver, the knowledge-action resolver" — no
  knowledge-action resolver; callers are `task/src/task-run-resolver.ts:149` and
  `user/src/subscription-wake.ts:139` only.
- Missing: assistant/thread turns and resumed sessions get NO knowledge tree — empty manifest, a plain
  key-value `session.toon` (`run-orchestration/src/context.ts:1013-1044`). Only task runs and subscription
  wakes get documents.
- :82 work/ "Captured back at session end (see run-unit-model.md)" — FALSE; work/ is ignored except the notes
  files (writeback-processor.ts:151); run-unit model has no code.
- :118 "codec at `framework/toon-codec/src/toon-codec.ts`" — package deleted; encoder inlined in
  `run-orchestration/src/context.ts:98-110`, and it writes flat key-path lines, not the linked TOON spec.
  Call it "a small read-only summary file".
- :57, :81 session.toon holds "subscription state" / "task (with its subtree context)" — it holds task,
  ancestors, agent, team (task-run-resolver.ts bake) or subscription/agent/team.
- :22 "If a file is human-readable, a human will actually read it" — principle essay; drop.
- :24-26 Document → task promotion — real (`DocumentDetail.tsx:539`, `sourceDocumentId`) but belongs on task.md.
- §4 "Why context assembly, not FUSE" and :284 run-unit link — design journal.

## sync-and-conflict-resolution.md (68 lines) — MERGE→documents-in-sessions.md (~30 lines)

Verified: `fs.watch(dir,{recursive:true})` on knowledge/ and work/ (`run-orchestration/src/file-watcher.ts:146`),
500 ms debounce (:32), no polling, one `sandbox_writeback_changes_detected` per flush, writeback order and
rules table, move by id suffix, stale edit discarded + manifest fast-forward, deletes don't delete docs,
notes → `sessions.notes`.
Stale/trim:
- :18 "`context/` ... today just `session.toon`" fine; :36 "Batch pairing ... was rejected" — journal.
- :38 duplicate of websocket push (canonical store owns it).
- :42 "(founder ruling ...)" — journal. §4 and §5 duplicate the canonical store's history/stale text.
- §7 "Why continuous sync, not session-boundary" ("The original design was...") — history.
- §8 "Why not CRDTs or OT" and §9 "Deferred: real-time co-editing ... Still not built" — plan/journal.
- §6 step 2 "CAS-write terminal state" and step 3 "Remove the sandbox directory" — belongs on session page;
  verify removal (sandbox dir is reused on resume per context.ts:998-1005 lore, so "removed" is at least incomplete).

---

## Proposed target structure

Replace both folders with one folder named for the product model, e.g. `docs/objects/` (or keep the
`process-layer/` path and retitle it "The objects") — one page per real object. Thread already has a home
in `docs/human-interface-layer/thread-primitive.md` (outside this audit); link it, don't copy.

| Page | Purpose (one line) | Built from | Lines before → after |
|---|---|---|---|
| index.md | The six things: task, thread, document, user, session, plugin — one paragraph each, links, the 18 actions. | the-four-primitives §3 headers, both index.md | 26 → 30 |
| task.md | Task tree, states, done-or-review, dependencies, kill, handoff (= owner edit), upward completion + ship-confirmation message, outcome verdict, promote from document. | tasks-and-sessions §1, handoff-and-lifecycle-propagation, canonical-shapes verdict, four-primitives §3.1 | ~290 → 110 |
| document.md | One `documents` table: parent/slot/scope, `as` (memory/artifact/document), tree rules, visibility, versions + `stale`, history in `changes`, live push. | the-canonical-store, artifact-primitive | 231 → 110 |
| documents-in-sessions.md | Which sessions get documents, how they are picked (scope, recency+confidence, 40k budget), sandbox `knowledge/` layout, manifest, watcher and writeback rules. | knowledge-fabric, sync-and-conflict-resolution | 190 → 80 |
| session.md | One agent run: the four intent kinds, states/outcomes, per-agent concurrency cap, sandbox zones (context/knowledge/work), notes → `sessions.notes`, token counts on the task, end/stop. | tasks-and-sessions §2-3, wip-and-cost-limits, four-primitives §3.2 | ~110 → 70 |
| user.md | Person or agent: team (a name), owner, subscriptions (event/schedule, reach, firing, inbox), folders given, connections. | teams, subscriptions-and-retros §1-5 | 181 → 90 |
| folders.md | Team-registered code repos / doc folders given to agents; mounted by worktree/symlink; needs-attention; not a tool, not a document. | filesystem-primitive | 117 → 45 |
| (plugins page, outside scope) | document-management (librarian, decay, triage, post-task retro) + role-personas. | subscriptions-and-retros §6-7 | — |

Total ≈ 1,240 → ≈ 535 lines. Deleted outright: the-four-primitives, wip-and-cost-limits, canonical-shapes,
handoff-and-lifecycle-propagation, teams, artifact-primitive, subscriptions-and-retros, all of
knowledge-architecture/ (merged, not lost).

## What must be repointed if pages move

Code comments:
- `layers/agent-orchestration/filesystems/src/filesystem-shape.ts:14` → canonical-shapes.md §Filesystem (section doesn't exist today either) → folders.md
- `layers/core-ui/src/settings/SettingsFilesystems.stories.tsx:9`, `:50` → same → folders.md
- `layers/agent-execution/harness-registry/src/cli-mcp-config.ts:154` → filesystem-primitive.md → folders.md
- `CLAUDE.md:110` ("five primitives (Teams, Bets, Tasks, Sessions, Routines)") and `:113` ("five storage
  layers ...") — stale already; update. `.claude/rules/docs.md` folder list names both folders.

Docs outside scope linking in (files to rewrite links in; count of files):
- tasks-and-sessions.md: 17 (incl. website-rendered `docs/product/how-work-flows.md`, `docs/guides/user/*`)
- the-canonical-store.md: 12 · artifact-primitive.md: 11 · sync-and-conflict-resolution.md: 9
- subscriptions-and-retros.md: 8 · wip-and-cost-limits.md: 7 · canonical-shapes.md: 6 (blocks/*, agent-layer)
- the-knowledge-fabric…md: 6 · the-four-primitives.md: 3 · handoff…md: 3 · teams.md: 3 · filesystem-primitive.md: 0
- Website: `applications/website` renders docs/product + docs/guides; their links into these folders become
  GitHub links (`applications/website/src/__tests__/doc-links.test.ts:40,115` uses `docs/knowledge-architecture/`
  as a fixture — update if the folder goes).

## Code issues noticed (not doc fixes — flag separately)

1. Ranking ignores the task: `taskTags: []`, `taskDescription` unused (`session-documents.ts:470`).
2. Agent never sees its own task's `doneCondition` (`task-run-resolver.ts` bake; `provisioner.ts` composeTaskInstruction).
3. Session notes go to `sessions.notes` and are never handed to the next session.
4. `session_handoff_completed` listened to but never emitted (`start-runtime.ts:321`).
5. `sessions.effectivenessScore` has no production writer.
6. `framework/domain-model/src/types/money.ts` holds no money.
