# BA2 — Architecture critique, round 4

**Reviewed:** `.pipeline/work/BA2/architecture.md` (revision 4) and `.pipeline/work/BA2/feasibility.md`.
**Against, in authority order:** `interview-2026-08-25.md` → `founder-rulings.md` → `plan.md` →
`requirements.md` → `harness-research/` → `.pipeline/BA.md`, `pipeline.config.yml`, `.claude/rules/*`,
`CLAUDE.md`, `ETHOS.md`, `tools/governance/README.md`, `tools/governance/table-owners.json`.

**Method.** Every claim below was opened at its cited `path:line`. `architecture-critique-r1/-r2/-r3.md`
were not read. `superseded/feasibility.md` was used for nothing — every fact I rely on I re-derived.
Enumerations were done with `rg -a` over the whole tree, excluding `.pipeline/` and `plans/`.

**Verdict: 2 blocking findings.** Both are narrow and both live inside material this document added in
revision 4. Neither needs a new mechanism, a new table, or any widening of scope; each is a paragraph in
a section that already exists plus one assertion in §6. Everything else I probed held up at the code.

---

## BLOCKING

### BLK-1 — T4b's retraction stops one hop short: the "Open review" button never renders for a task-hosted review, so the human path is still dead after T4b

§2.8 retracts "no new surface is needed" and names three fixes: the loader returns the review's own
`threadId`; `ReviewPage` uses it; the route and `open-handler.ts`'s `case "review"` gain a task-hosted
shape. T4b (line 865) lists exactly those three. All three claims about the broken state are true — I
reproduced each one. The fix set is incomplete: the button that fires the whole hop is gated **before**
`open-handler` ever runs, and nothing in §2.8 or T4b touches that gate.

**The gate.** `layers/core-ui/src/components/PartList.tsx:44-47`:

```
// UI-005: The "Open review" button is only available when the bet is resolvable.
// pageBetId (from thread context) or part.reviewTarget.betId (non-empty) both suffice.
const canOpen = (betId != null && betId !== "") || part.reviewTarget.betId !== "";
return <ReviewRequestPart part={part} onOpen={onOpen} canOpen={canOpen} />;
```

Both disjuncts are false for every BA2 review:

- `betId` here is `Conversations.tsx:480`'s `reviewBetId`, which the page itself sets to `null` for a
  task host: `const reviewBetId = data.thread.hostKind === "bet" ? data.thread.hostId : null;`
- `part.reviewTarget.betId` is **always the empty string**. `layers/core-ui/src/components/parts/part.ts:375`
  builds it unconditionally: `const reviewTarget: ReviewTarget = { betId: "", reviewId: message.id };`
  and `ReviewTarget` (`part.ts:103-106`) carries only `{ betId, reviewId }` — there is no field a task
  host could travel in.

`canOpen === false` means `ReviewRequestPart.tsx:63-71` never renders the `Button`. The user does not
see a disabled control; they see no control. `open-handler.ts:107-118` is never reached, so making it
"gain a task-hosted shape" changes nothing a human can observe.

**Impact.** After T4b exactly as written, a task-hosted BA2 review still has no human entry point:
no in-thread verdict control (§2.8's own first bullet, verified — `ThreadShell`'s sole production mount
is `AssistantOverlay.tsx:480`), and now no way to open the review page either. AC3 ("that review reaches
the human"), AC4 and AC7 remain unreachable through the real consuming path — the precise failure §2.8
says T4b exists to prevent ("the harness lane would go green on a chain no human can traverse").

**And the evidence would not catch it.** §6's named assertion for this finding is *"`ReviewPage`
rendered for a **task-hosted** review reaches a live approve control and its click issues the
messages-route POST"* — a component test that mounts `ReviewPage` directly. It goes green with the
entry point still invisible. Under the document's own standard ("what would have to break for this
green to go red"), this assertion cannot fail on the defect the section is about.

**What closes it.** Name the gate. Either widen `ReviewTarget` to carry the review's host (or its thread
id) so both `canOpen` and the new route resolve for a task, or delete the `canOpen` gate outright once
the route no longer needs a bet to be well-formed. Add `PartList.tsx`, `parts/part.ts` and
`Conversations.tsx`'s open-handler context to T4b's file list, and make §6's assertion a
`Conversations`-level one: a task-hosted thread holding an unresolved BA2 review renders a reachable
"Open review" affordance whose click navigates to the review route. That assertion is red today for two
independent reasons and would stay red if either half were skipped.

---

### BLK-2 — the resumption step can throw, and when it does nothing reaches the human: not the thread, not the browser

`plan.md:97-98` (Constraints): *"A failure between approval and the agent resuming must reach the human
who approved, in the thread they approved in. Silent failure is a defect this package may not
reproduce."* AC6 restates it. §2.5.1 handles the failure surface in one sentence:

> **If resumption is impossible** — no `taskId` on the payload, or the agent is not runnable — a plain
> message goes into that same thread saying the verdict was recorded and the agent could not be brought
> back, and why. Never a silent success.

Those are the two *predicate* failures. The third case — the bake or the intent record **throws** — is
not covered, and the placement makes it the likely one.

**Where the code runs.** §2.5.1 correctly puts BA2's verdict work at the `void decision` site,
post-commit: the transaction closes at `threads.ts:1460` and the block runs at `threads.ts:1521-1537`.
The precedent that region establishes is throw-on-failure, stated in its own `@lore` at
`threads.ts:1473-1489` about the sibling site 5:

> "On a failed submit here, the message is committed with no turn intent; this handler throws (no
> try/catch — same as `knowledge.ts`'s site 4), the caller sees a 5xx…"

A builder copying the neighbouring site gets: verdict message committed, review resolved
(`resolveMessageIfUnresolved` ran inside the transaction), clearance possibly already `cleared`, agent
never resumed, **nothing written to the thread**.

**And the browser swallows it.** `postVerdictHostMessage` (`host-threads.ts:145-150`) converts only 409
and 403 into outcome values; every other non-OK status throws. `ReviewPage.tsx:173-196`'s
`handleSubmitVerdict` has no `try`/`catch`, so the throw rejects inside the click handler, the
`hostThread.refresh()` and the `loader(...)` re-fetch after it never run, and the page's `error` state
(`ReviewPage.tsx:145-152`) is loader-only and never set. The human clicks Approve and sees the page
unchanged, with no toast and no error row.

That is "the work is left silently looking approved-but-not-done", which AC6 forbids by name. Note this
is a state BA2 creates: today the same line is `void decision;` and cannot fail.

**§6 does not prove otherwise.** Its AC6 coverage is *"a terminal `agent_run_admission_failed` on a
reengagement, and a session-end second no-show, both post into the approving thread"* — both downstream
of a resumption that was successfully recorded. Nothing drives a failure at the verdict site itself.

**What closes it.** Two sentences and one assertion. In §2.5.1: the post-commit clear-and-resume block
is wrapped, and *any* failure — predicate or thrown — takes the same cannot-resume branch (a plain
message in the thread the human approved in), with the verdict POST still returning success carrying a
recorded-but-not-resumed outcome the page can render. In §6's CI-runnable half: with the intent recorder
forced to throw, assert the verdict is still resolved, a message lands in the approving thread, and the
response is not a 5xx. Cheap, and it is the one branch of AC6 currently unproven.

---

## NON-BLOCKING DEFECTS

**N-1 — approving a review that BA2 did not write now posts a message asserting something false.**
`taskId` is optional (correctly — BLK-4's fix is right), so the cannot-resume branch fires for every
review row that predates BA2 or was written by another producer. Reachable set includes
`tools/setup/src/demo-world/conversations.ts:410,595,764` and any pre-upgrade `submit_review` row.
Today approving one does nothing (`void decision`); after BA2 the human gets *"the agent could not be
brought back"* on a review where no agent was ever waiting. Suggest gating the message on the review
having a BA2 origin (a clearance row, or a `taskId`) and staying silent otherwise — "never a silent
success" only needs to hold for reviews this feature created.

**N-2 — there is a second approval path the document does not mention, and it bypasses the route.**
`layers/core-api/policy/src/policy-engine.ts:148-175` (`auto_resolve`) writes a `verdict` message with
`deps.conversation.insertMessage` directly, targeting *"the most recent review-typed message in that
thread"*. It never touches `POST /threads/:id/messages`, so it would approve a BA2 review with no
clearance transition and no resumption. Reachability is narrow today — `handoff-protocol.ts:165-169`
mints a fresh thread per review item, so the auto-resolve target is an empty thread — but it is a real
second door onto the same state. One line in §9 rather than a fix.

**N-3 — §2.8's fix (2) needs a hook that does not exist.** `useHostThread(hostKind, hostId)`
(`useHostThread.ts:61-93`) resolves a thread *by host*, and `ReviewPage`'s `handlePostComment`
(`:159-171`) also leans on `hostKind`/`hostId` through `resolveOrCreateHostThread`. Using the loader's
`threadId` means fetching `GET /api/threads/:id` directly (the URL the hook already builds at `:88-91`).
Small, but unnamed; T4b should say so.

**N-4 — §2.4 counts three widening declarations; there are four.** `openMcpBridge`'s own options object
(`provisioner.ts:253-263`) must carry the gate before `createMcpSession` / `lookup` / `bridge.open` can.
Compiler-caught, so a budget note only.

**N-5 — the `"rev-1"` deletion has a test consumer §2.11 does not list.**
`layers/core-api/src/routes/__tests__/reviews.routes.integration.test.ts:22-45` asserts the fixture path
returns 200. It will go red loudly, so this is scope accounting, not a risk.

**N-6 — the heartbeat is a database write on the agent's hot path, and the document does not price it.**
§2.7 step 1 says the heartbeat advances on *every* adjudication, allow included, and §2.4 says the read
"must be live, per call". So every `Bash`/`Write`/`Edit` in every gated session costs an HTTP round trip
to the bridge, a rule query, and an upsert — on a team whose rule list is empty. AC1's "behaves exactly
as it does today" holds behaviourally; it does not hold in cost, and nothing in §4 or §9 says so.

**N-7 — §1 calls the `session_ended` liveness net "live"; it is wired but has never fired.**
`registerReviewSubscriptions` (`session-review-creator.ts:34-66`, wired at `service-bootstrap.ts:379`)
is real, and I confirmed the net is the only thing it does — so §2.10's rewrite takes no other live
behaviour with it. But its trigger reads `tailoredGrants`
(`proposed-call-workflow.ts:741-751`), and §1 itself proves nothing writes that table in production.
"Live" overstates it in the same way revisions 1–3 overstated `/verdict`. The decision is unaffected.

**N-8 — the heartbeat is a weaker guarantee than phase 1 asked for, and that needs an explicit founder
yes, not a silent inheritance.** `FINDINGS.md:85-87` asks for *"a positive, per-session proof that the
gate is live"*. §2.7 delivers per-team-per-harness. §9 lists the three resulting gaps honestly and asks
for explicit acceptance. That is the right handling — I am naming it so the coordinator carries it to
the founder rather than treating §9 as read.

---

## What I checked and found sound

Reported because thoroughness is the point, and because several of these are exactly the shapes that
failed in earlier rounds.

**The re-anchored approval path (priority 1).** All of it holds.
- `void decision; // will be used by Task 8 implementation` is at `threads.ts:1535-1537`, inside
  `if (input.type === "verdict" && resolvesMessageRow)`, **after** the transaction closes at `:1460` and
  after `thread_resolved` is emitted at `:1521-1528`. "Post-commit, durable before anything acts" is
  accurate.
- Zero production callers of `/verdict`: `rg -an "/verdict"` over the tree returns tests, docs and the
  eslint fixture `tools/eslint-plugin-design/src/rules/__tests__/no-raw-actor-fetch.test.ts:59`. The
  browser's only verdict call is `postVerdictHostMessage` (`host-threads.ts:132-150`) and its `@lore` at
  `:125-131` says so. Deleting the route (`threads.ts:1583-1707`) takes no live behaviour: its emit
  (`proposed_call_granted`) has no production subscriber, and its `if (!pcView) return ok` branch
  (`:1631-1636`) is the silent one B4 already convicted.
- Authorization: `threads.ts:1362-1373` rejects a `resolvesMessageId` outside the thread, requires
  `senderAgent?.role === "founder"`, and rejects a self-verdict. It is genuinely stronger than the dead
  route's `authorizeWrite`. Adopting it unchanged is the right call and is correctly stated as a
  decision.
- All five decisions arrive: `verdictPayloadSchema.decision` is `z.enum(VERDICT_DECISIONS)`
  (`threads-schema.ts:166-170`), `VERDICT_DECISIONS` has five members (`domain-model/src/thread.ts:38-44`).
  The three-value enum is on the dead route (`threads.ts:1591-1594`). r3 BLK-2's correction is right and
  the withdrawal in §9 is right.
- Ordering under a race is better than the document claims: `resolveMessageIfUnresolved` inside the
  transaction (`threads.ts:1441-1451`) gives first-verdict-wins with a 409, on top of the
  `verdict:<messageId>` idempotency key.

**The resumption re-key.** `resolveReengagementRequest` is keyed on a proposed-call id
(`proposed-call-workflow.ts:299-370`); `agentSessionRequests.sourceId` is `notNull` (`schema.ts:292`);
`proposedCallSessionRequestInputSchema` requires `proposedCallId` (`session-request.ts:98-107`). All
three confirmed, so the re-key onto the review message id is necessary, and the message id does exist on
every verdict. The migration list is complete: `agent_work_intents_source_kind_ck` (`schema.ts:403`) and
`agent_work_intents_kind_source_compat_ck` (`:422`) are the only check constraints naming
`proposed_call`; `agent_session_requests` has no source-kind check (`schema.ts:318-345`). The resumed
session takes the generic branch (`provisioner.ts:1273-1281` → `assembleTaskFreePrompt`, whose
`Correlation: <raw JSON>` line is at `:516-518`) and still carries a `taskId`, so it is itself gated —
which is what makes §6 step 7 ("attempt once more; assert it blocks again") meaningful.

**The optional payload fields (priority 3).** `reviewPayloadSchema` (`threads-schema.ts:155-159`) is
used by both `messageInputSchema` (`:186-190`) and `messageRowSchema` (`:218-221`), and `rowToMessage`
`.parse()`s it (`threads.ts:593-596`) — it throws, it does not strip. A required `taskId` really would
break read-back of every pre-BA2 review row. Optional is the right fix, the fallback is genuinely
reachable, and the stripping trap (`@lore` at `threads-schema.ts:209-211`) is correctly carried. See N-1
for the one consequence I would shape differently.

**The injected `getReviewMessage` dep (priority 4).** `messages` → `conversation` in
`tools/governance/table-owners.json`; `@hyperidle/review` lists `@hyperidle/conversation` under
`devDependencies` (`review/package.json:20-26`). The injection shape matches exactly what `ReviewPorts`
already does — `resolveOrCreateCallingThread` (`review/src/ports.ts:139-145`) carries the identical
`@lore` ("`review` cannot import `@hyperidle/conversation` directly"). The implementation site is
legitimate: `routes/threads.ts:14-15` already imports `findMessage` from `@hyperidle/conversation`, and
`calling-thread-bindings.ts:35-38` is the standing precedent.

**Ownership and totals.** `table-owners.json` has 37 tables; `proposedCalls`/`tailoredGrants`/
`operationOutcomes` are all owned by `review`, so three out and three in keeps `totals.tables` at 37.
r3 N-1's correction is right.

**The delete list.** No production constructor of `sessionWorkflow` exists — I enumerated every
non-test hit and each is a type, a field or a pass-through, matching §1's list. `ProposedCallExecutedEvent`
exists in both copies (`event-bus/src/events.ts:575`, `domain-model/src/events.ts:564`) with union
entries at `:645` and `:634`. `proposed_call_granted` has no production subscriber; the `@lore` at
`events.ts:587` names a `handleProposedCallGranted` that no longer exists. `classifyReversibility` /
`identityHash` / `destructiveHint` / `idempotentHint` have no reader outside the workflow router being
deleted. `"rev-1"` has no non-test consumer beyond the doc line T14 already owns.

**The harness half.** Every cited line is where the document says it is: `provision-return-hook.ts:152-165`
writes the `.claude/settings.json` object carrying `Stop` (so a `PreToolUse` sibling is a real
extension); `adapter-pool.ts:359-368` carries `--pure` and `cli-harness-adapter.ts:825` carries it again
on re-engage; `envAllowlist` forwards `process.env[key]` and `resolvedEnvMap` is applied over it
(`cli-harness-adapter.ts:313-328`), with the repo's own `CODEX_HOME` rule at `:523-533` — so §2.3.1's
"inject, never allowlist" is the correct lever and the research (`opencode.md:164-179`) proved both
halves live. `returnEnforcementChannel` is optional (`:121`) and all four CLI harnesses share one
`getCapabilities` (`:947-964`), so dropping the per-harness declaration in favour of a heartbeat is
right — there is genuinely nothing to forget. `vitest.integration.config.ts:21-45` is an explicit list
and `action-gate-realbinary.integration.test.ts` matches neither glob; F37 is a real catch.
`mcp-route.ts:16-19` types `lookup` as returning `{sessionId}` only, so N2's widening is honest.
`buildToolProvider(coreApiTransport, …)` at `run-orchestration-composition.ts:318-322` really does build
`buildProposedCallWorkflowPort(coreApiTransport)` — one port member in, one out, as claimed.

**Evidence quality.** §6 has assertions for *firing*, not only for silence: step 8 requires
`lastSeenAt` to advance and `checks` to increase, and the dead-gate pair requires the gated action to
*happen* while the row does *not* advance. The red table names a break per harness and admits the one
harness (cursor-agent) where the heartbeat cannot prove it. The `no server-side path writes the row`
assertion is paired with a positive, not standing alone. `requireHarness`, real binary, real PGlite,
real Hono app, no stub — matches `.claude/rules/testing.md:67`, including a builtin lane, with the
document itself flagging that the builtin lane cannot go red.

**Consistency with the authorities.** Founder ruling 1 (nothing pre-marked) is structural — empty list ⇒
no match ⇒ allow. Ruling 2 (`enabled` is BA9's) is honoured; `configurationOverrides` is untouched.
Ruling 4 (hooks, not native permissions) matches FINDINGS §1. Ruling 5 (no inline hold) is not
resurrected. Ruling 6 (two pieces) is honoured, with the seed-prompt constant added at all three real
assembler sites (`context.ts:352`, `context.ts:481`, `provisioner.ts:491` — all verified). Ruling 7
(builtin excluded) is honoured and its consequence is asserted rather than papered over.
`requirements.md`'s one recorded-but-unconfirmed assumption (a decline may be re-argued) is **restored**
and flagged for the founder, not reversed. Migration filenames stay free of work-package ids. No WP id
leaks into code.

**Proportionality for `mvp`.** Three tables, one pre-auth route, one port member in / one out, four
generated shims, one settings screen, one subscriber. The third table earns itself: it is the entire
substrate of a constraint `plan.md` writes in its own words, and the alternative (a timestamp per rule
row) loses the per-harness split that makes the display diagnostic. The bulk of the diff is the phase-4
deletion and rename, which `plan.md` mandates. Nothing here is built beyond what an AC or a founder
ruling asks for.

---

## On design

**No design pass is needed. This follows approved patterns end to end — say it plainly.**

The settings surface: I opened all three cited precedents and they are what the document says —
`SettingsAgentBehavior.tsx:62` (list + detail), `SettingsConnections.tsx:81,392,420` ("+ Add …" dialog
and per-row delete), `SettingsFilesystems.tsx:1-8,92-96` (`?teamId=` scoping). Four fields and a status
line assembled from three shipped patterns is not a design question.

The review entry point — the one place §7 says a designer might earn their time — is the same answer. The
"Open review" affordance already exists and is already the approved way a human leaves a conversation for
the review page (`ReviewRequestPart.tsx:63-71`, under AM1's decision that the decision UI lives on the
review page). What BLK-1 exposes is not a missing design; it is a missing conditional: today that button
is hidden unless a bet can be resolved. Deciding that it should also appear for a task-hosted review is a
one-line rule, and the rendered result is a button that already has an approved appearance. AM1's
decision is untouched either way, and no new layout, component or canvas is involved.

So: skip the designer, and instead spend that attention on BLK-1's file list. If the coordinator wants a
second opinion on anything visual here, the cheaper question is the settings screen's "Checked by
claude-code 2 minutes ago · codex 1 hour ago" line — and even that is an existing copy pattern.

---

## Judgement

**Implementation may not start yet — but it is close, and the gap is small.**

BLK-1 and BLK-2 are both inside revision 4's new material and both are closed by editing sections that
already exist: add the render gate to §2.8/T4b and one `Conversations`-level assertion to §6; add one
sentence to §2.5.1 about wrapping the post-commit resumption and one service-lane assertion to §6. No new
table, no new seam, no new scope, no founder question. Fold in the non-blocking notes at the author's
discretion — N-1 and N-6 are the two worth a line each.

Everything else I probed — the whole re-anchored approval path, the ownership answer, the re-key, the
optional-field decision, the delete and rename lists, the harness plumbing, and the evidence's ability to
go red — held at the code. This document is materially better than the shape its own revision table
describes, and the two findings above are the last hop of a retraction it made honestly and mostly
completely.
