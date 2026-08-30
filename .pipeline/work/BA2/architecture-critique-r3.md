# BA2 — Architecture critique, round 3

Read cold against `interview-2026-08-25.md` → `founder-rulings.md` → `plan.md` → `requirements.md` →
`harness-research/`. `superseded/`, `architecture-critique-r1.md` and `-r2.md` were not read.
Every claim below was checked at its cited `path:line` in this checkout; enumerations are shown.

**Verdict: BLOCKED — 4 blocking findings.**

---

## BLOCKING

### BLK-1 — The verdict route the whole approval half hangs on has no production caller

`architecture.md:97` and `feasibility.md:54-61` (F2) claim `routes/threads.ts:1595-1707` is
"a mounted production route with a real UI caller (`core-ui/src/pages/review/ReviewPage.tsx:172-195`
and the in-thread verdict bar, `core-ui/src/ds/RichMessageCard.tsx:333`)". **False.** Both cited UI
sites go somewhere else:

- `RichMessageCard.tsx:330-334` → `onAction({kind:"verdict"})` → `ThreadShell.tsx:349-360`
  `handleCardAction` → `dispatchVerdict` → `onAppendMessage({type:"verdict", …})`.
- `ReviewPage.tsx:173-194` `handleSubmitVerdict` → `postVerdictHostMessage`.
- `core-ui/src/services/host-threads.ts:132-150` — the only client verdict function — POSTs
  `/api/threads/:id/messages` with `type:"verdict"`. Its own `@lore` at `:125-130`:
  *"The client only calls the canonical `POST /api/threads/:id/messages` with `type:"verdict"`."*

Enumeration of `/verdict` callers repo-wide (`rg -an "/verdict"`, excluding `.pipeline/` and `plans/`):
`layers/core-api/src/services/__tests__/agent-run-admission-failed-reengagement-migration.integration.test.ts:180`,
`layers/core-api/src/routes/__tests__/threads.reengagement-baked-emit.integration.test.ts:151,209,246`,
and one eslint fixture string. **Tests only. Zero production callers.**

And the route the UI *does* hit explicitly discards the decision —
`layers/core-api/src/routes/threads.ts:1534-1536`:

```
// AL7 trust-first: approve verdict handled by proposed-call workflow (Task 8).
// Tailored grant composed + proposed_call_granted emitted there.
void decision; // will be used by Task 8 implementation
```

Impact. §2.5.1, §2.9, §2.10 and the AC map (§3, AC4/AC6/AC7) all hang the clearance transition and the
resumption on the `/verdict` route. As specified, a human clicking Approve in the running app resolves
the review message and nothing else: no clearance cleared, no reengagement intent, no failure message.
§7 states "The review surface needs no design either", so no UI rewiring is planned either. AC4, AC6
and AC7 are unreachable through the real consuming path.

It also invalidates the named end-to-end evidence. §6 step 5 — "POST the real approve verdict" — posts
to the dead route, so the harness lane goes green on a chain no human can traverse. That is the
"hand-built arrangement mirroring the integration point" failure, on the flow the feature is named for.

Authority: AC4/AC6/AC7 (`plan.md:117-122`); the skill's requirement of end-to-end evidence "through its
real consuming path". Also note the two paths carry **different authz**: `/verdict` uses
`authorizeWrite` (participants, `threads.ts:1624-1629`); the messages route requires
`role === "founder"` and rejects self-verdict (`threads.ts:1366-1373`). Whichever path BA2 picks, that
difference has to be a decision, not an accident.

### BLK-2 — The five-verdict-enum finding (r2 N-2 / F30) rests on a false premise

`architecture.md:111,404-418` and `feasibility.md:632-642` claim: *"'Approve with comments' and 'Edit'
are rendered buttons that 400 today"*, and §2.5.1 adds route scope to fix it.

Verified false on the reachable path. The rendered buttons (`RichMessageCard.tsx:81-87`) post through
`POST /messages`, validated by `messageInputSchema`'s verdict arm
(`layers/core-api/src/routes/threads-schema.ts:186-190`) → `verdictPayloadSchema`
(`threads-schema.ts:166-170`), whose `decision` is `z.enum(VERDICT_DECISIONS)` — **all five accepted**.
The three-value `verdictInputSchema` (`threads.ts:1591-1594`) is on the route BLK-1 shows nothing calls.

Impact. §2.5.1 adds scope ("the route's enum accepts all five") and §9 raises a founder question, both
to fix a defect that does not exist on any path a human reaches. And the sentence it justifies itself
with — "a human clicking a visible Approve button on a BA2 review would get nothing" — is true, but for
BLK-1's reason, not this one. Restate or strike; do not carry the false diagnosis into the build.

### BLK-3 — The re-keyed resolver reads a table `review` does not own

`architecture.md:396-398`: *"The resolver is re-keyed to `(db, reviewMessageId)`: load the message, read
`taskId` from the payload, resolve the sender…"*. The resolver is `resolveReengagementRequest`
(`layers/core-api/review/src/proposed-call-workflow.ts:303-376`), which §2.11 keeps inside `review`
(renamed `clearance-workflow.ts`).

`messages` is owned by `conversation` (`tools/governance/table-owners.json:26`), and ownership covers
reads as well as writes (`table-owners.json:3` — *"the ONE service that may read and write it"*;
crossings are computed in `tools/governance/src/lib/crossings.ts:128-180`). `@hyperidle/review` cannot
import `@hyperidle/conversation` either: it is a **devDependency only**
(`layers/core-api/review/package.json:20-26`), so a production import is a prod→dev violation on top of
the ownership one.

The document declares every other new contract it needs — `toolProvider.buildActionGate` (N1),
`CoreApiPort.review.adjudicateAction` and `attachClearanceToReview` (N3), the three bridge widenings
(N2) — and §2.1 states the ownership rule as "reads and writes, no exceptions". This one read is left
implicit on the day-one flow's critical path. The remedy is small (an injected `getReviewMessage` dep,
the shape `getTaskById`/`getBetById`/`resolveOrCreateCallingThread` already use at
`proposed-call-workflow.ts:303-306` and `service-bootstrap.ts:379+`) — but it must be declared, and the
same question must be answered for §2.10's `reviewMessageId → thread` resolution.

### BLK-4 — `ReviewPayload.taskId` as a required field breaks read-back of every existing review message

`architecture.md:344-347`: *"`ReviewPayload` … gains `taskId: string`"* — non-optional — and the §2.5
trap box instructs adding both new fields to `reviewPayloadSchema`.

`reviewPayloadSchema` (`threads-schema.ts:155-159`) is used on **both** sides:
- write: `messageInputSchema`'s review arm (`threads-schema.ts:186-190`);
- read-back: `messageRowSchema`'s review arm (`threads-schema.ts:218-221`), consumed by
  `rowToMessage` at `layers/core-api/src/routes/threads.ts:593-596` via `.parse()` — which **throws**,
  and by `routes/coach.ts:84` and `routes/assistant.ts:99`.

A review row written before BA2 has `{title, reasoning, artifactRef}`. With `taskId` required, both
arms of the review union fail, `.parse` throws, and listing the thread that holds it fails. That is a
concrete regression on existing data, introduced by the change, with no migration story.

It is also internally contradictory: §2.5.1 (`architecture.md:400-402`) specifies a fallback for
*"no `taskId` on the payload"*, a state a required field makes unreachable — while the re-key's
correctness argument (`architecture.md:394-395`, `feasibility.md:583-584`) depends on
*"All three always exist"*. Decide which: optional field plus a real fallback, or required field plus a
backfill/migration. As written a builder will pick one and silently break the other half.

---

## NON-BLOCKING DEFECTS

- **N-1 — §2.1 and §2.7 disagree on the table count.** §2.1 (`architecture.md:127-135`): *"Two new
  tables … loses three rows and gains two under the same owner; `totals.tables` 37 → 36"*, listing only
  `teamActionRules` and `actionClearances`. §2.7 (`:502-506`) adds `teamActionGateChecks` — *"the third
  and last table"*. Correct arithmetic against `tools/governance/table-owners.json:4-8,35-37` is −3/+3,
  totals unchanged at 37, and `teamActionGateChecks` needs its own owner row (the file's own note: *"A
  table absent from this file is a build error"*).

- **N-2 — §2.3 overclaims what the heartbeat makes visible.** `architecture.md:222-223`: *"Anything
  else, or an unreachable bridge, is treated by every shim as **allow** … and §2.7 is what makes it
  visible."* Not for a failure that arrives **after** the session-start heartbeat has landed: the
  `(teamId, harness)` row already reads fresh, so a mid-session bridge outage or a crashed hook
  fails open while the permission list says "Checked 2 minutes ago". §9 (`:921-922`) concedes exactly
  this for cursor-agent; §2.3 states it generally. Narrow the claim to the class it does cover.

- **N-3 — the heartbeat proves transport, not adjudication.** It advances on *allow* as well as deny
  (`architecture.md:467-468`). A gate whose matcher is broken (pattern never matches) heartbeats
  normally, so the display reads healthy for a gate that blocks nothing. Worth one sentence next to
  "Why this is detectable", since the display is the only reader.

- **N-4 — `feasibility.md`'s task numbers are off by one against §5.** F7 (`:156,163`), F8 (`:173,181`)
  and F9 (`:186,191`) assign opencode to **T9**; §5 assigns opencode to **T10** and cursor-agent to T9
  (`architecture.md:736-737`). F10 (`:202-205`) says codex is proven by **T7** and cursor by **T8**;
  §5 makes T7 the claude proof lane, T8 codex, T9 cursor. F7 carries the red-phase check that must run
  *before* opencode's new assertions; as written it lands on the wrong builder.

- **N-5 — the delete list misses the only non-test callers of the three `/proposed-calls*` routes.**
  §2.11 (`architecture.md:606-607`) names `core-api-port.ts:757-761` and `routes/reviews.ts:185-206`,
  but not `layers/agent-orchestration/src/services/core-api-port-composition.ts:309` (the client type
  declaration) and `:807,815,824` (the three method implementations). Enumerated with
  `rg -an "proposed-calls"`: those four lines plus the routes plus two test files, nothing else.

- **N-6 — rename site list imprecision.** `rg -ln "proposed_call"` (production) returns three files the
  §2.11 rename table does not name: `framework/domain-model/src/work-intent.ts:335`,
  `layers/agent-orchestration/session-requests/src/service.ts:993,1010`,
  `layers/agent-orchestration/run-orchestration/src/errors.ts:20`. Two further points: the
  `ProposedCallGrantedEvent` row cites `framework/domain-model/src/events.ts` as a site, but that file
  contains no `ProposedCallGranted` symbol (only `ProposedCallExecutedEvent` at `:564`); and the
  session-source rename needs a migration on **`agent_work_intents`** as well —
  `framework/db/src/schema.ts:403` enumerates `'proposed_call'` in a check constraint and `:422` binds
  `kind='reengagement'` to `sourceKind='proposed_call'`.

- **N-7 — no stated ordering between the deny response and the `blocked` row write.** §2.2 defines the
  row and §2.3 the response, but not which commits first. If the row write fails after a deny, the
  agent is blocked, its review attaches nothing, and the human is shown *"nothing matching it was
  blocked, so approving clears nothing"* (§2.5) — a true sentence describing a false situation, with
  the agent looping. One sentence fixes it; the deny path is the only place a clearance is ever born.

- **N-8 — `phase` is not in the declared port surface.** §2.1 says the seam gains two ops replacing
  three; §2.3's wire shape carries `phase: "session-start" | "action"`. The session-start heartbeat
  therefore rides `adjudicateAction`, which is derivable but never stated. Say it in T1/T2.

---

## What was checked and holds

- **Heartbeat sources both cross the seam.** Shim → `POST {mcpUrl}/action-check` (sibling of
  `/return-status`, `mcp-route.ts:81-152`, mounted pre-auth, token→session via
  `bridgeRegistry.lookup` returning `{sessionId}` at `:16-19`) → the per-session gate closure built in
  `buildToolProvider` (`run-orchestration-composition.ts:318-322`, where
  `buildProposedCallWorkflowPort(coreApiTransport)` sits today and is deleted) →
  `CoreApiPort.review` → `@hyperidle/review`. `agent-execution` gains no DB. The three declarations
  that must widen (`mcp-bridge.ts:163`, `mcp-route.ts:16-19`, `mcp/index.ts:63-68`) are correctly
  called a widening, not a precedent. The row is genuinely bounded: PK `(teamId, harness)`, four
  harness values, no growth with sessions.
- **The reasoning for dropping the per-session alarm is sound.** `SessionEndedEvent`
  (`framework/event-bus/src/events.ts:151-190`) carries no harness; `agentRunConfig.harnessType`
  (`framework/db/src/schema.ts:115-125`) is the only per-agent harness fact and `agentRunConfig` is
  owned by `run-orchestration` (`table-owners.json:44`), as is `sessions` (`:43`). No core-api-readable
  table carries the harness. The three workarounds F29 rejects are the real ones. A per-session alarm
  is not constructible review-side without an orchestration carry or a cross-owner read.
- **r2 BLK-1/2/3/4's underlying facts** all reproduce: `closeMcpBridge` at `provisioner.ts:1577` ahead
  of the `transitionRun` calls; `openMcpBridge` returning `{token,url}` only (`:253-263`);
  `returnEnforcementChannel` optional at `cli-harness-adapter.ts:121` with one shared
  `getCapabilities` and a `?? deriveCliChannel` fallback; `resolveReengagementRequest` keyed on a
  proposed call and its grant (`proposed-call-workflow.ts:303-376`); `agentSessionRequests.sourceId`
  `notNull` (`schema.ts:292`); `proposedCallSessionRequestInputSchema` requiring
  `proposedCallId` (`session-request.ts:95-104`).
- **AC5 is structural.** No path creates an `actionClearances` row except a real block; the unique
  `(ruleId, taskId, agentId) where state='blocked'` makes a repeated block idempotent; the row is
  scoped by agent, so no clearance ever crosses agents; a rule deleted between block and approval takes
  its clearance with it by cascade. Two agents, two sessions, a rule added afterwards, and a clearance
  never spent all leave "was it blocked?" answered by a row that only a block writes.
- **The opencode isolation is the correct lever.** `buildSandboxedEnv`
  (`cli-harness-adapter.ts:313-329`) copies `process.env[key]` per allowlist entry and then applies
  `resolvedEnvMap` over it; the repo states the identical rule for `CODEX_HOME` at `:522-533`.
  `XDG_DATA_HOME` in opencode's allowlist (`adapter-pool.ts:384`) is a different mechanism, correctly
  flagged as not-to-be-copied. `--pure` is at `adapter-pool.ts:366` and again at
  `cli-harness-adapter.ts:825`. §6's assertion is non-vacuous only because r2 N-5 sets
  `process.env.XDG_CONFIG_HOME` before spawning — that step is correct and load-bearing.
- **The deletions are safe.** `sessionWorkflow` has no constructor anywhere outside `__tests__`
  (independently enumerated: `harness-adapter.ts:129`, `tool-types.ts:139`,
  `run-orchestration-composition.ts:332`, `runtime.ts:450`, `contracts.ts:49,257`,
  `tool-registry.ts:86,91`, `provisioner.ts:304,321,789,1195,1211,1469` — all type or pass-through).
  Neither `proposed_call_executed` nor `proposed_call_granted` has a production subscriber. The
  liveness net is genuinely live (`service-bootstrap.ts:379` → `session-review-creator.ts:34-66` →
  `handleUnconsumedGrantOnSessionEnd` at `proposed-call-workflow.ts:737-770`) and the reported
  pre-existing bug is real: that function forwards six deps to `applyLivenessRetry` and drops
  `resolveOrCreateCallingThread` (`:758-766`).
- **Per-harness mechanics match phase 1.** The §2.3 table's gotchas — `user_message` not
  `agent_message`, `failClosed: true`, `--dangerously-bypass-hook-trust`, never `"ask"`, the `MCP:`
  exclusions — each trace to `FINDINGS.md` §4/§5 and the per-harness files. The provisioning precedents
  are real: `provision-return-hook.ts:61-85` (channel switch), `:139-142` (`return-check.sh`),
  `:154-168` (the `.claude/settings.json` object carrying `Stop`), `:392-437` (the opencode plugin,
  whose `export default { setup }` shape is correctly called not-opencode's-API and left unfixed);
  `cli-mcp-config.ts:168-190` (`writeCursorJson`); `cli-harness-adapter.ts:558-561`
  (`cwd: config.sandboxPath`).
- **Evidence lane shape.** `requireHarness` exists
  (`layers/agent-execution/harness-registry/src/__tests__/require-harness.ts:91`) and the named
  precedent file `real-harness-return-enforcement-realbinary.integration.test.ts` exists. The
  positive assertions r2 BLK-5 asked for are present and are genuine: a live gate advances the
  heartbeat, a broken gate lets the action through **and** leaves the row un-advanced. The doc names
  its own falsifier ("write the heartbeat from provisioning or teardown") and asserts against it.
  Two honest concessions are stated rather than hidden: cursor-agent's dead-gate case is proven by the
  blocked action, not the heartbeat; T11's builtin lane cannot go red if the feature breaks.
- **Rulings.** None of the seven is reopened. Ruling 1 (nothing pre-marked) holds by the empty list;
  ruling 2 (`enabled` is BA9's) is untouched; ruling 4 (hooks) is the mechanism; ruling 5 (no inline
  hold) is not resurrected; ruling 6 (two pieces) shapes §2.6 and §2.3, and the seed-prompt constant is
  wired through the three real assemblers (`context.ts:352`, `:481`, `provisioner.ts:491`) with
  `literalToolNamerForAdapterType` (`return-actions.ts:183-196`); ruling 7 (builtin out) is stated as a
  fact on the list rather than an alarm.
- **Scope for `mvp`.** No classifier, no capture, no per-agent rules, no canvas rework. `requirements.md`'s
  "taken, not confirmed" decline assumption is restored and flagged to the founder, not reversed.

---

## Judgement the founder asked for: does the heartbeat satisfy "a gate that fails open must be detectable"?

**Partly, and for the class the constraint's own sentence names.** `plan.md:96` grounds the constraint
in the three silent structural failures phase 1 proved: a `PreToolUse` entry that is not there, codex
without `--dangerously-bypass-hook-trust`, opencode under `--pure`. Every one of those produces **zero**
heartbeats for that harness, so the `(teamId, harness)` row never appears or goes stale on the exact
screen where a human forms the belief that a rule is enforced. For that class the mechanism does what
the sentence asks.

It does **not** cover three things, and the founder should decide with them in view:
1. **Per-session.** One healthy claude session keeps the row fresh while another claude session's gate
   is dead. `FINDINGS.md:85-87` asked for a *per-session* proof; this is a per-team-per-harness proof.
2. **Mid-session.** Anything that breaks after the session-start heartbeat has landed — a bridge
   outage, cursor's crashed hook — fails open under a row that reads fresh (see N-2).
3. **Adjudication correctness.** The row advances on allow, so a broken matcher looks healthy (N-3).

It is also a pull, not a push, with no freshness threshold: it works only if a human opens the page
*and* knows which harnesses their agents run on. The document states trade (1) and the pull honestly in
§2.7 and §9 and keeps the founder question open; (2) and (3) are stated only partially. My read is that
this is a legitimate `mvp` trade for a feature whose list is empty by default and whose stated value is
learning rather than enforcement — but it is a weaker guarantee than phase 1 recommended, and it should
be accepted as such explicitly, not inherited by silence.

---

## Verdict

**BLOCKED.** BLK-1 is the one that matters: the approval half of the feature is specified against a
route no human path reaches, and the end-to-end evidence would go green while the product does nothing.
BLK-2 removes scope built on a false diagnosis, BLK-3 declares one missing contract, BLK-4 resolves a
contradiction that otherwise becomes a data regression. The rest of the document — ownership,
the seam, the shims, AC5, the opencode isolation, the deletions, the evidence design — held up under
enumeration and needs no rework.
