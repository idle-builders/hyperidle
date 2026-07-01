# AR4 — Phase-4 Code Review (the assistant is a normal agent)

**Reviewer:** pipeline:review · **Diff:** `git diff origin/main...HEAD` (AD2/R1 shipped + AR4a/b/c)
**Contracts:** `.pipeline/work-packages/TRACK-AR.md` §AR4 · `plans/AR4/{concept,architecture,design/design}.md`
**State at review:** check + lint + 3682 tests reported green; `honest-harness-guard --check: clean` re-verified.

## Verdict: DONE

Every AC is evidenced by real code + a real test through the shared `provisionSession` path.
No CRITICAL findings. The conversational reply channel, the 4-harness real lanes, the formation
persona seam, the triple-validated Settings save, and never-silent all hold. The WARNINGs below are
honesty/test-depth defects (debt-list mislabel, stale lore, content-assertion gaps, a non-functional
tool-surface half) — none falsify an AC, but the debt-list mislabel is exactly the class of erosion
Track AR exists to kill and should be fixed before this pattern is copied.

---

## Findings

### WARNING-1 — AH3/AK4/AH6 parked on `coverage-debt.allowlist.json` is a mislabel (the flagged concern, confirmed)
`scripts/lib/honest-harness-predicate.ts:76` empties `BUILTIN_ONLY_INTEGRATION`; the three assistant
real files are instead listed in `EXPLICIT_HARNESS_INTEGRATION` (:52-54) **and** on
`scripts/coverage-debt.allowlist.json`. `coverage-debt` is documented as *"stages subset-covered files
until their conversion lands … shrink monotonically as conversions land"* (honest-harness-guard.ts:461-464,
625; testing.md "both shrink monotonically"). But AH3/AK4/AH6-real are **permanently** builtin-only by
design — their 4-harness duty is delegated to `AR4a-conversational-reply-row` — so they will **never**
convert and will sit on a "will-reach-4" list forever. That defeats the monotonic-shrink-to-zero contract
and lets the guard stay green while the debt is permanent. This is the precise honesty erosion AR exists
to prevent.
The builder's own lore (honest-harness-predicate.ts:66-74) says these "test service behavior … not harness
capability." If true, they should not be harness-facing integration at all (drop from
`EXPLICIT_HARNESS_INTEGRATION` + coverage-debt; fold their unique assertions into deterministic service
`.integration.test.ts`). But `AH3-assistant-turn-real` H3 actually drives a real OpenRouter model and
asserts `PONG` (lines 90-121) — so they ARE real-builtin harness tests, just a deliberate subset.
**Fix (pick one, honestly):** (a) demote the three to deterministic service tests (no real model) and let
`AR4a-conversational-reply-row` be the sole harness-capability proof; or (b) introduce a distinct
"covered-elsewhere / permanent-builtin-subset" category instead of the monotonic-shrink debt list. Do not
leave permanent residents on `coverage-debt.allowlist.json`.

### WARNING-2 — `AR4a-conversational-reply-row` asserts only non-empty/non-notice, not the real completion text
`packages/server/src/harness/__tests__/AR4a-conversational-reply-row.integration.test.ts` — all four lanes
assert `payload.notice === undefined` + `text.length > 0` (e.g. :99-104, :153-158, :207-212, :265-270).
Architecture §4 AC1 specifies *"assert the persisted assistant reply row **contains the model's real
completion text**"*. Consequences:
- The claude double-count fix (WARNING-3 / `conversationalReply` last-non-empty, session-provisioning.ts:1295)
  is **unguarded** — a regression to blind `+=` would produce a doubled reply that still passes `length>0`.
- The opencode `text`-delta capture (see WARNING-3 below) is unguarded for truncation.
- Content correctness ("message reached the model") is asserted **only on builtin** (`AH3-real` H3 PONG);
  claude/codex/opencode have **no content assertion anywhere**.
Non-empty does prove the real channel carries text (zero stubs → the only text source is the real drain),
so AC1 is functionally MET — but the test is weaker than the contract it claims to be "the CRITICAL gate"
for. **Fix:** assert the seeded one-word answer (PONG) on each lane, or at least an exact equality to the
captured `result.conversationalReply` to lock the double-count/truncation behavior.

### WARNING-3 — opencode `text`-event capture may truncate multi-chunk replies (verify)
`packages/shared/src/harness/harness-event-normalization.ts:202-218` newly maps opencode `text` events to
`{type:"completion", text: part.text}` (good — fixes the empty-reply bug; scoped to `preMapOpencodeEvent`,
does not touch codex/claude/builtin or opencode tool/lifecycle handling). But the lore calls these
"streaming text **deltas**," and the drain captures **last-non-empty** completion
(session-provisioning.ts:1295-1296). Last-non-empty is correct for claude (terminal `result` restates the
full answer), codex (`item.completed` full text), and builtin (single completion) — each has a terminal
full-text event. For opencode the lore states `step_finish` carries **no** text (only `text` events do):
if those events are incremental deltas with no terminal full restatement, a multi-sentence reply collapses
to its **final fragment**. The PONG/non-empty test cannot detect this. **Fix:** confirm opencode
`run --format json` emits cumulative (not incremental) `text`, or accumulate opencode text across the turn;
add a multi-token reply assertion.

### WARNING-4 — the tool-surface half of the formation seam is non-functional (persona half is real)
`AssistantFormation.assistantDraftSurface` is typed as the single literal `"standard"`
(strategy-port.ts:341), and the consuming ternary has **identical branches**
(assistant-turn.ts:563-566: both call `buildAssistantDraftRegistry(...)`, the `else` annotated
`// future: other surfaces`). So a strategy **cannot** change the assistant's tool surface today — the
type forbids any other value and both branches are byte-identical dead code. AC3's persona half is
genuinely wired (`systemPromptOverride` → `effectivePersona` → `composeAssistantPrompt` →
AGENTS.md/builtin prompt, session-provisioning.ts:887-903) and proven by `AR4b-formation-seam`. The tools
half is a placeholder seam. Acceptable as a seam given one surface exists in-product, but it is currently
cosmetic — label it honestly and collapse the identical ternary (SLOP). AC3 met via persona.

### WARNING-5 — stale "builtin-only by construction" lore now contradicts shipped AR4a
Two comments assert the OPPOSITE of what AR4a shipped (runAssistantTurn now delegates to
`provisionSession`, which provisions a real sandbox + `.mcp.json` bridge and runs all four harnesses):
- `packages/server/src/harness/__tests__/provision-real-session.ts:713-714` — *"runAssistantTurn is
  builtin-only by construction (no sandbox cwd, no .mcp.json bridge → CLI harnesses cannot start)."*
- `packages/server/src/routes/__tests__/AH3-assistant-turn-real.integration.test.ts:4-7` — same claim,
  citing the now-empty `BUILTIN_ONLY_INTEGRATION` carve-out as load-bearing.
A new-hire reading these would believe the carve-out is still real. **Fix:** reword to "this runner
*chooses* builtin; the path itself runs all four (proven by AR4a-conversational-reply-row)."

### WARNING-6 — AC3 end-to-end (persona reaches the model) is proven by construction, not by test
`AR4b-formation-seam.test.ts` mocks `provisionSession` and captures `systemPromptOverride` at the call
site (:64-94, :239) — it proves the seam is consulted and the field differs by strategy, but **not** that
the override reaches the assembled prompt the model sees. The real 4-harness `AR4a` test runs
`minimalStrategy` (persona `null`), so no test exercises a non-null persona override flowing into a real
turn. The wiring (session-provisioning.ts:887-892) is correct on read. **Fix (optional):** one assertion
that a non-null formation persona appears in the assembled prompt / AGENTS.md.

### NIT-1 — empty PATCH body builds an empty Drizzle update set
`routes/assistant.ts` — with all fields now optional, a `PATCH` carrying `{}` reaches
`db.update(users).set({})` (updateSet starts empty, no field provided). Drizzle may throw "No values to
set." The UI always sends fields, so latent. Guard with an early return when `updateSet` is empty.

### NIT-2 — `createAssistantSoulRoutes` cognitive complexity 41 > 25 (biome warning, unsuppressed)
`routes/assistant.ts` PATCH handler. Non-blocking (warning), but unaddressed. Extract the triple-validation
+ update-set assembly into a helper, or add a justified `biome-ignore` like the rest of the codebase.

---

## Risk audit (the 7 hard-scrutiny items)

1. **Conversational reply real on 4 harnesses** — YES, channel is real (last-non-empty capture handles
   claude double-count by construction; builtin routes to `runChatTurn` via load-bearing `messages`,
   session-provisioning.ts:1178). Test depth weak (WARNING-2/3).
2. **opencode `text` fix** — correct + scoped; real product bug the honest test surfaced. Truncation
   caveat (WARNING-3).
3. **Carve-out → coverage-debt** — **mislabel confirmed (WARNING-1).** `assertHarnessSymmetry` IS
   satisfied (AR4a contributes balanced 4-harness counts); the defect is the debt-list semantics, not
   the floor.
4. **Formation seam real** — persona genuinely reaches the prompt (real); tools half non-functional
   (WARNING-4). Founder boundary holds: `AssistantFormation` carries only persona+surface, never
   harness/model (strategy-port.ts:298-341); turn reads harness/model off the row.
5. **Settings + triple validation** — `validateAgentConfig` exported + reused; 422 no-write proven
   (AR4c); authz intact (`principal-self` + explicit 403 before any read/write, assistant.ts:347-358);
   no secret leak; UI matches design extraction.
6. **Never-silent** — preserved; `conversationalReply` undefined on crashed/budget/not_returned sites;
   empty completion → provider_error notice; `mapErrorToNotice` never echoes secrets.
7. **No task/routine regression** — conversational branch guarded by `isConversational`; reply spread
   only on the completed conversational return; AD2/R1 real tests retained.

---

## AC Completeness

| AC | Status | Evidence |
|---|---|---|
| AC1 — answers through configured harness (builtin/claude/codex/opencode); CLI-only user gets a reply not `missing_key` | MET | `conversational` mode in `provisionSession`; `AR4a-conversational-reply-row` 4 lanes, `requireHarness` hard-fail, zero stubs (WARNING-2/3 on assertion depth) |
| AC2 — harness+model configurable from Settings, triple-validated, drives next reply | MET | `SettingsAssistant.tsx` selects + dirty; PATCH route + `validateAgentConfig`; `AR4c` 200/422-no-write/GET; turn reads row |
| AC3 — persona+tools strategy-decided at turn time; switching strategy changes form | MET (persona) | `formAssistant` seam; persona → `effectivePersona` → assembled prompt; `AR4b` call-site capture. Tools half non-functional placeholder (WARNING-4); e2e persona-to-prompt by construction (WARNING-6) |
| AC4 — same machinery; no assistant-only adapter branch / builtin couplings | MET | `runAssistantTurn` delegates to `provisionSession`; `setSessionToolRegistry`/`sandboxPath:""` removed from the turn; `messages` kept as builtin convenience only |
| AC5 — assistant real-harness tests symmetric across 4; removed from `BUILTIN_ONLY_INTEGRATION`; satisfies `assertHarnessSymmetry`, no carve-out | MET | `BUILTIN_ONLY_INTEGRATION` empty; AR4a 4 lanes; symmetry satisfied. Debt-list mislabel + stale lore (WARNING-1/5) |
| AC6 — never-silent; no secret in a notice | MET | reply-or-notice on every branch (assistant-turn.ts:637-699); secret-free `mapErrorToNotice` |
| AC7 — AD2/R1 + minimalStrategy + onBeforeTeardown retained and passing | MET | `AD2-task-dispatcher-real` / `R1-wire-agent-execution-real` present; `onBeforeTeardown` seam intact; conversational branch inert for task/routine |
