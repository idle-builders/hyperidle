# AR4 — Architecture & Design Critique (reviewer, fresh cold read)

**Reviewer:** evaluator (different agent than planner). **Date:** 2026-06-30.
**Artifacts:** `plans/AR4/concept.md`, `plans/AR4/architecture.md`, `plans/AR4/design/design.md`,
`SettingsAssistant.stories.tsx` (planned). **Source of truth:** `.pipeline/work-packages/TRACK-AR.md` §AR4.
**Method:** every load-bearing claim re-verified against the live branch (not the prose).

---

## VERDICT

| Skill | Score | Gate (≥7 + no CRITICAL) | Result |
|---|---|---|---|
| **architecture-critique** | **5 / 10** | 1 CRITICAL | **REVISE** |
| **design-critique** | **8 / 10** | no CRITICAL | **APPROVED** |

The design is clean extraction and ships. **The architecture has one CRITICAL** — the single
load-bearing assumption (a conversational reply returns from the shared `provisionSession` path) is
**assumed, not proven, and the live code shows the return channel does not exist**. It will blow up in
AR4a's build exactly where the planner said the risk was, because the plan defers the proof instead of
designing the mechanism. Fixable with a scoped addition; must be fixed before AR4a starts.

---

## ARCHITECTURE-CRITIQUE — 9-dimension rubric

| Dim | Score | Note |
|---|---|---|
| 1. Problem framing | 9 | Crisp. Builtin-only path blocks CLI-only users; parallel reimpl of provisionSession; breaks AT1/AR7 symmetry. Correct and grounded. |
| 2. Concept soundness (the load-bearing call) | **3** | The "conversational mode on provisionSession" *composition* is right. But the **reply-return mechanism is unproven and contradicted by the code** (CRITICAL-1). The plan's central claim is half-built. |
| 3. Boundary integrity (strategy/kernel) | 9 | Founder lock respected; no harness/model smuggled into strategy. §4 + boundary table + rationale are exemplary. |
| 4. Symmetry / carve-out honesty | **4** | Removing `BUILTIN_ONLY_INTEGRATION` is only honest if the CLI turn truly works — which is precisely the unproven piece. As written, this risks *moving* the AT1 failure, not fixing it (CRITICAL-1 cascades here). |
| 5. Split soundness (AR4a/b/c) | 8 | Boundaries clean, ordering correct (risk first), dependencies honest. One coupling flagged (WARN-2). |
| 6. Verification plan (ACs→method) | 7 | Mostly real integration tests. AC4 leans on grep-guard (acceptable per CLAUDE.md static-property rule). AC1's "persisted reply row" test is the one that will expose CRITICAL-1 — good, but the plan doesn't say how the row gets populated. |
| 7. Symbol/reconciliation accuracy | **5** | Plan claims "every named symbol verified against the branch" — but `validateHarnessModelTriple` does not exist (real symbol: `validateAgentConfig`, **un-exported**) and the `:751`/`:179-236` line refs point at `services/` not the cited paths exactly. Verification-integrity miss (WARN-1, NIT-1). |
| 8. Risk register honesty | 6 | Correctly names AR4a transcript-via-prompt as the risk and isolates it. But under-scopes it: names the *input* risk (transcript reaching the model) and **misses the *output* risk entirely** (reply text returning) — the larger of the two (CRITICAL-1). |
| 9. Scope discipline / never-silent | 8 | Out-of-scope list tight; never-silent mapping preserved; triple-validation carried. Solid. |

**Overall architecture: 5/10 — REVISE (1 CRITICAL).**

---

### CRITICAL-1 — The conversational reply has no return channel on the shared path. Assumed, not proven; contradicted by live code.

**concept.md:206-209, architecture.md:104,118-119 (AR4a scope item 3 "map the result → persisted reply").**

The plan's load-bearing move: route the turn through `provisionSession` (conversational mode) and
"map the result → persisted reply or notice." **The live code provides no reply text to map.** Verified:

1. **`ProvisionSessionResult` has no reply-text field.** It carries `{ sessionId, outcome, totalCostCents, taskId, returnVerdict?, forceReturnCount }` (`session-provisioning.ts:295-324`). The task path returns *cost + return-gate verdict*, never the agent's completion text. The doc-comment even states `returnVerdict` is "Absent … on assistant turns" — i.e. the result shape was designed for task work, not chat.

2. **`runSession`'s drain loop never captures completion text.** The Phase-10 loop (`session-provisioning.ts:1058-1126`) branches on `cost_update`, `token_usage`, `tool_call`, `error` — and `returnGate.observe(event)`. **There is no `completion`-event branch.** The reply text a CLI harness emits (`cli-harness-adapter.ts:808,860` → `{ type: "completion", text }`; builtin `builtin-harness-adapter.ts:602` likewise) is *observed by the return gate and then discarded*. The task path doesn't need it — artifacts land via tool calls into the sandbox.

3. **`onBeforeTeardown` cannot carry it.** The seam the plan leans on (`architecture.md:74`) exposes only `BeforeTeardownContext = { sessionId, sandboxPath }` (`session-provisioning.ts:184-187`) — a *file-reading* test hook. A chat reply is stream text, not a sandbox file. AD2/R1 use this seam to read *files a task agent wrote*; a conversational reply writes no file.

**Consequence.** Contrast the deleted path: `runAssistantTurn` gets its reply from
`drainStreamEvents(...).text` (`assistant-turn.ts:475-514,~516`) — it owns the drain and captures the
completion text directly. The shared path **drains internally and returns a cost/verdict struct**. So the
conversational mode must, minimally:
- add a `completion`-event capture to `runSession`'s drain loop, AND
- add a reply-text (+ toolCalls) field to `ProvisionSessionResult` (or thread a capture callback),
- *without* polluting the task path's result contract.

None of this is in the plan's scope list. The plan says (concept §5, verbatim) "the architecture phase
reconciles the turn's reply-persistence … with `ProvisionSessionResult`" — and then **does not do that
reconciliation.** It is deferred to the build as prose. This is the exact hidden-CRITICAL pattern: the
one genuinely novel mechanism is named as "to be reconciled" and left unsolved, so AR4a's red test
(AC1: "assert a persisted reply row exists") will go red with no designed path to green, mid-build.

**The risk register confirms the blind spot.** `architecture.md:138` names the risk as
"transcript-via-prompt actually *reaching* a CLI model and the draft tools firing over MCP" — the
**input** half. The **output** half (reply text returning from the shared drain) is not mentioned in §6
or in AR4a's risk note at all. The input half is genuinely lower-risk: `cli-harness-adapter.ts:358-360`
shows AGENTS.md carries full context and the CLI binaries already run real turns through it (AD2/R1
prove this). The *output* half is the real unknown and it is unaddressed.

**Required revision (before AR4a starts).** Architecture must specify the reply-return mechanism
concretely: either (a) `runSession` captures the last/accumulated `completion` text and returns it on a
new optional `conversationalReply?: { text; toolCalls }` field on `ProvisionSessionResult` (present only
in conversational mode, absent for task/routine — mirrors the `returnVerdict?` optionality precedent), or
(b) a `onConversationalReply` capture callback threaded like `onBeforeTeardown`. Pick one, name the
drain-loop edit (`session-provisioning.ts:~1058-1126`), and make AR4a's first red test assert it. Until
then "map the result → persisted reply" describes a function whose input does not exist.

---

### WARNING-2 — AR4a↔AR4b coupling on the draft-tool surface is tighter than the split admits.

**architecture.md:104 (AR4a: "draft tools flow via the shared registry"), :150-152 (AR4b: formation answer carries the tool surface).**

AR4a must supply a draft tool surface to `buildToolRegistry` *now* (to run the 4-harness turn), but the
*source* of that surface (hardcoded `buildAssistantDraftRegistry` vs strategy formation answer) is AR4b.
The plan says AR4a reads tools "off the row" — but the draft tools (`create_bet`/`edit_bet`) are **not on
the row today**; they're built inline by `buildAssistantDraftRegistry` (`tools/assistant-draft-registry.ts`).
So AR4a must temporarily call that builder directly, then AR4b reroutes it through formation. That's a
real (small) seam churn the split glosses — name it so AR4a doesn't bake a shape AR4b has to unpick.

---

### WARNING-1 — "Every named symbol verified against the branch" is false for the triple validator.

**architecture.md:8-9 ("Every named symbol in §3 was verified"), :67, concept.md:50, design.md:86.**

`validateHarnessModelTriple` (cited 4×) **does not exist.** The real validator is `validateAgentConfig`
(`routes/agents.ts:~109`), and it is **not exported** (`function validateAgentConfig(...)`, file-local).
The plan's "reused by the assistant config save … shared with agents.ts" (AR4c scope item 2) therefore
requires *extracting/exporting* it first — a real task, currently invisible. Low blast radius, but it
contradicts the verification claim and AR4c under-scopes the save wiring by one step.

---

### NIT-1 — Line-ref drift.

Cited locations are approximately right but a few drift: routine assembly branch is at
`services/session-provisioning.ts:751` (plan says the same — fine), but the `routineId` field is `:275`
(plan §3 says `:275` — fine) and `onBeforeTeardown` is `:179-236` (matches). The path label "harness/
session-provisioning.ts" implied in places vs the real `services/session-provisioning.ts` — keep paths exact.

### NIT-2 — `ProvisionSessionResult.taskId` always present.

In conversational mode the `taskId` is a stub FK (routine precedent). The result will surface a
meaningless stub taskId to the assistant-turn caller. Harmless, but document that the caller ignores it
(mirror the routine `@lore`), so a future reader doesn't treat it as a real task linkage.

---

## DESIGN-CRITIQUE — 9-dimension rubric

| Dim | Score | Note |
|---|---|---|
| 1. Extract-vs-invent classification | 10 | Correct `routine`/extract call. Pattern lifted verbatim from `SettingsAgents.renderEditForm` (`SettingsAgents.tsx:597-642`: `flex gap-[9px] flex-wrap`, `min-w-[140px]`, Select from `/api/harnesses` + MODEL_CATALOG). Zero invention. Verified against source. |
| 2. Placement decision | 9 | Extend `SettingsAssistant` over un-excluding into `SettingsAgents` is sound and well-argued: avoids dropping a user-scoped row into the team table's delete/role/max-session affordances; keeps the `role!=="assistant"` filter (`SettingsAgents.tsx:~750`) that prevents the dual-edit hazard. Rejection recorded. Correct call. |
| 3. States coverage | 8 | Populated (rendered) + loading/saving/saved/422/harness-unavailable all enumerated; deferral of skeleton/error to build matches MEMORY rule. StatusChip `status="behind"` reuse verified in source. |
| 4. Token / grid fidelity | 9 | All values on the 6px grid, lifted (`gap-[9px]`, `gap-[18px]`, `min-w-[140px]`); no new tokens; `eslint-plugin-design` already passes the extracted pattern. |
| 5. Accessibility | 8 | Native `<select>` keyboard inheritance; inline 422 `role="alert"`; no focus steal; `max-md:text-[16px]` iOS-zoom carryover (AQ-005). Honest about inherited behavior. |
| 6. Validation contract | 7 | Requires the validated `(harness,provider,model)` triple before write — correct. Loses a point: cites the validator by a name that doesn't exist (`validateHarnessModelTriple`; real = `validateAgentConfig`, un-exported) — same WARN-1 as architecture. The *contract* is right; the *symbol* is wrong. |
| 7. Render artifact | 8 | `Configured` story via the `globalThis.fetch` mock pattern from `SettingsAgents.stories` — the right design artifact, renders the populated real state only. |
| 8. Scope discipline | 9 | Explicitly excludes team-table/max-session/filesystem controls; low blast radius; only-new-copy is the intro reword. |
| 9. Anti-slop | 9 | No gradients/hero/3-col; warm tokens; native controls. Clean. |

**Overall design: 8/10 — APPROVED.** Fold the validator-symbol correction (WARN-1) into AR4c when it
lands; it does not block the design.

---

## ANSWERS TO THE SIX SCRUTINY QUESTIONS

1. **The load-bearing concept call.** Composition (conversational mode = third branch beside task/routine,
   transcript via assembled prompt/AGENTS.md, *not* `config.messages` into CLI) is **right and the routine
   branch genuinely provides the precedent** (`session-provisioning.ts:751` stub-taskId, sandbox-based,
   all 4 harnesses). The *input* path (transcript reaching a CLI model) is sound — AGENTS.md carries full
   context (`cli-harness-adapter.ts:358-360`), proven by AD2/R1. **BUT the *reply-return* path is the
   hidden CRITICAL** (CRITICAL-1): the shared drain discards completion text and the result struct has no
   reply field. The plan **assumes** the reply returns; the code says it doesn't. Not proven — and the
   plan defers the one reconciliation it most needed to do.

2. **Founder-locked boundary respected.** Yes. Cleanly. No harness/model smuggled into strategy; §4 +
   boundary table + `AgentScaffoldSpec` @lore citation are exemplary. No finding.

3. **4-harness symmetry resolution is real?** **Conditionally — and the condition is currently unmet.**
   Removing the assistant from `BUILTIN_ONLY_INTEGRATION` (`honest-harness-predicate.ts:70-74`) is honest
   *only after* CRITICAL-1 is solved and a real CLI conversational reply is proven end-to-end. As written
   the plan would delete the carve-out on the strength of an unproven return path → risks relocating the
   AT1 failure rather than closing it. The carve-out's own @lore states the precondition (real sandbox +
   MCP bridge); the plan satisfies *that* but not the reply-return precondition it didn't notice.

4. **The split.** Boundaries clean, ordering correct (risk in AR4a), each independently CI-green-able.
   One under-named coupling (WARN-2: draft-tool surface source) and one missing step (WARN-1: export the
   validator in AR4c). Split is sound; tighten these two.

5. **Design extract.** Correct EXTRACT, not invent — verified verbatim against `SettingsAgents.tsx`.
   Rejecting un-exclude-into-team-table is well-reasoned (affordance mismatch + dual-edit hazard the
   existing filter prevents). Approved.

6. **never-silent + triple validation.** never-silent mapping preserved and correctly mapped onto the
   shared path's failure classes. Triple validation carried — but via a symbol that must first be
   *exported* (WARN-1); the contract holds, the wiring is one step short.

---

## WHAT MUST CHANGE BEFORE AR4a BUILDS

1. **CRITICAL-1** — specify the conversational-reply return mechanism concretely (new optional result
   field OR capture callback), name the `runSession` drain-loop edit, and make AR4a's first red test
   assert reply-row population. The carve-out removal moves into AR4a *only after* this is green on all 4
   harnesses.
2. **WARN-1** — export/extract `validateAgentConfig` (the real validator) and correct the symbol name
   everywhere; add the export as an explicit AR4c step.
3. **WARN-2** — name the AR4a→AR4b draft-tool-surface seam so AR4a doesn't bake a shape AR4b unpicks.

Design ships as-is (fold WARN-1 symbol fix into AR4c).

---

# ROUND 2 — re-critique of the revised architecture (CRITICAL-fix verification)

**Reviewer:** evaluator (same persona, fresh code re-read). **Date:** 2026-06-30.
**Scope:** verify the round-1 CRITICAL (reply has no return channel) + WARN-1 + WARN-2 are really
fixed against live code — not cosmetically. Design already APPROVED (8/10), not re-reviewed.

## VERDICT (round 2)

| Skill | Round-1 | Round-2 | Gate (≥7 + no CRITICAL) | Result |
|---|---|---|---|---|
| **architecture-critique** | 5/10 (1 CRITICAL) | **7/10 (0 CRITICAL, 1 WARNING)** | met | **APPROVED** |

The round-1 CRITICAL is **genuinely fixed**, not cosmetic: the reply-return channel is now designed
concretely against the real code, every cited line number checks out, and the mechanism is provably
inert for the task/routine path. **Build can start with AR4a.** One WARNING remains — the accumulation
strategy (`+=`) double-counts on the claude stream-json dialect — but it is a build-time correctness
detail with a clear fix, not an architectural blocker. Two NITs.

## CRITICAL-1 (round 1) — VERIFIED FIXED

Every claim in §4a re-checked against the branch:

- **(a) `completion` event exists and falls through unmatched.** CONFIRMED. Emitted by all four harness
  paths — builtin (`builtin-harness-adapter.ts:589,601,656,757,795,906`) and cli
  (`cli-harness-adapter.ts:808,860` + `preMapClaudeEvent`). The drain loop
  (`session-provisioning.ts:1056-1108`) branches on `cost_update`/`token_usage`/`tool_call`/`error` only,
  after `returnGate.observe(event)` at `:1058`. **No `completion` branch today** — it is consumed solely
  by the gate and discarded. The plan's premise is real.
- **(b) Guard byte-for-byte inert for task/routine.** CONFIRMED. The new branch is gated on
  `isConversational`; false for task/routine → nothing accumulates → existing four branches untouched.
  The completion event is *currently unmatched*, so adding a guarded branch after the existing ladder
  cannot perturb cost/token/tool/error handling. No AD2/R1 regression path.
- **(c) `:1283` is the completed-outcome return site; failure sites carry no reply.** CONFIRMED. The four
  return sites are `:1204` (crashed), `:1224` (budget_exhausted), `:1265` (not_returned), `:1283`
  (`outcome:"completed"`, last in `runSession`). Threading `conversationalReply` onto **only `:1283`**
  means a crashed/budget/not_returned conversational turn leaves it `undefined` → maps to a never-silent
  notice, not a fake reply. Exactly right.
- **(d) AR4a's first red test has a designed path to green + carve-out gated AFTER green.** CONFIRMED in
  §5 AR4a tests + the Constraints block (`architecture.md:51-53`): the four-lane persisted-reply-row
  assertion is the gate; `BUILTIN_ONLY_INTEGRATION` removal (`honest-harness-predicate.ts:70`) is
  explicitly sequenced **only after** that assertion is green on all four harnesses. The carve-out's own
  `@lore` precondition (real sandbox + MCP) is named as necessary-but-not-sufficient; reply-return is the
  added sufficiency condition.

**Gate/capture interaction — no conflict.** `returnGate.observe` (`return-gate.ts:34-38`) inspects
**only `tool_call`** events; it never reads, mutates, or consumes `completion` events. A new completion
accumulator observes an orthogonal event type. **No double-count, no ordering issue** between the gate and
the capture — the plan's placement (capture *after* `observe`, alongside the existing four branches) is
sound. The "does capturing completion text conflict with returnGate.observe" question resolves cleanly: it
does not.

## WARNING-3 (NEW) — `+=` accumulation double-counts on the claude stream-json dialect

**architecture.md:162-168 / §4a step (2); concept.md:216.**

The plan accumulates: `conversationalReplyText += event.text` across **all** completion events to
stream-exhaust. This diverges from **both** existing completion-text consumers, which first-capture-and-
return: `drainStreamEvents` (`assistant-turn.ts:690-697`, the deleted path's own reply capture) and
`drainForCompletion` (`bet-decomposition.ts:634`). The divergence is **correct for the CLI text lane**
(cli emits one `completion` per stdout line — `cli-harness-adapter.ts:808,860` — so multi-line replies
MUST be concatenated; first-capture would truncate to line 1). Good instinct.

But it is **wrong for the claude stream-json dialect.** `preMapClaudeEvent`
(`harness-event-normalization.ts:85-117`) maps each `assistant` line → `completion{text: block.text}`
(the answer **as deltas**, `:104`) AND the terminal `result` line → `completion{text: input.result}`
(the **full final answer restated**, `:111-112`). Naive `+=` over both yields **duplicated reply text**
(every delta + the full result re-stating them). The intervening `system`/lifecycle lines map to empty
completions (`:117,206`) which are harmless (`+= ""`), but the delta+result double-emission is a real
double-count — the exact hazard the sanity-check probed, located not in the gate but in the accumulation
strategy itself.

**Why WARNING not CRITICAL:** it does not block AR4a starting and has a bounded, well-understood fix —
the mechanism must be dialect-aware: prefer the terminal `result`/final completion text (or capture the
last non-empty completion) rather than blind concatenation. AR4a's first red test (persisted reply ==
real completion text on the **claude** lane) will catch a doubled reply immediately, so the gate that
proves the channel also proves this. But the plan currently *specifies* the wrong accumulation and should
name the dialect-aware capture before the builder bakes `+=`. Builtin is unaffected (`runChatTurn`
emits exactly one completion — `:601`, with the AK4 force-return exemption `:576` preventing intermediate
`AL6_FORCE_RETURN_MESSAGE` completions for the task-free 2-tool registry).

## WARNING-1 (round 1) — VERIFIED FIXED (one residual cross-artifact NIT)

`validateAgentConfig` is the real validator (`routes/agents.ts:109`, called `:262,385,454`) and is
**un-exported** (`function validateAgentConfig(`, no `export`). Confirmed. AR4c step 2
(`architecture.md:305-306`) adds an explicit **export** step. `validateHarnessModelTriple` is purged from
`architecture.md` (only corrective "does not exist" mentions remain). Fix is real.

**Residual NIT-3:** the revised `concept.md:50` and `design/design.md:86` **still cite
`validateHarnessModelTriple`** as if it were the real symbol. The build contract for AR4c is
`architecture.md` (which is correct), so this does not gate — but the symbol fix is incomplete across the
artifact set. Sweep both before AR4c lands.

## WARNING-2 (round 1) — VERIFIED FIXED

The AR4a→AR4b draft-tool seam is now named (§3b, `architecture.md:103-117`). `buildAssistantDraftRegistry`
(`tools/assistant-draft-registry.ts:196`, called inline at `assistant-turn.ts:425`) is the provisional
source. AR4a passes the draft surface as a **caller-supplied discriminator value**
(`conversational:{…,draftRegistry}`); `provisionSession` forwards it to `buildToolRegistry` without
reaching into the builder; AR4b reroutes the **single call site** (where `runAssistantTurn` computes the
surface) from the inline builder to the formation answer, discriminator + plumbing untouched. AR4a bakes
nothing AR4b must unpick. Clean seam. Fixed.

## NITs (round 2)

- **NIT-3** (above): `validateHarnessModelTriple` still in `concept.md:50` + `design.md:86`.
- **NIT-4 (builtin dispatch is `messages`-gated).** Builtin routes to `runChatTurn` **only when
  `config.messages` is non-empty** (`builtin-harness-adapter.ts:397-398`); otherwise it falls to
  `runPlanningTurn`→`runExecuteTurn` (the task path, multiple completions). The plan treats
  `config.messages` as an optional builtin convenience (§5 AR4a item 3, "Builtin may additionally
  receive `config.messages`") while the **contract** is the assembled prompt. That is fine for CLI, but
  the **builtin lane must still set `config.messages`** to hit `runChatTurn` — if the conversational mode
  delivers transcript via prompt only and drops `messages`, builtin falls into the task planning path and
  `+=` concatenates plan text + final answer into a garbled reply. Not a blocker (the existing path
  already sets `messages`; AR4a's builtin reply-row test catches a garbled reply), but make
  `messages`-for-builtin load-bearing in AR4a scope, not "additionally."

## SCORE RATIONALE (architecture 5 → 7)

- Dim 2 (concept soundness) 3 → **8**: the reply-return mechanism is now designed against real code; the
  one residual is the dialect-accumulation detail (WARNING-3), not a missing mechanism.
- Dim 4 (carve-out honesty) 4 → **8**: removal explicitly gated after the four-lane reply-row green.
- Dim 7 (symbol accuracy) 5 → **7**: `validateAgentConfig` corrected + export step added; −points for the
  residual concept/design `validateHarnessModelTriple` NIT.
- Dim 8 (risk honesty) 6 → **8**: the OUTPUT (reply-return) risk is now named the primary unknown and
  front-loaded ahead of carve-out removal.

**Overall architecture: 7/10 — APPROVED (0 CRITICAL).** Build can start with AR4a. Fold WARNING-3
(dialect-aware capture, not blind `+=`) into AR4a's reply-return scope before the builder writes the
drain edit; sweep NIT-3/NIT-4 alongside.
