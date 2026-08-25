# BA1 §9 required red-able demonstrations

Both required by architecture.md §9 ("Static properties — lint and types, not tests") and
flagged as missing by review.md's "VERIFICATION GAPS AGAINST THE APPROVED §9". Performed
during the refinement pass that closed the review's two blocking findings. Both mutations
were reverted immediately after capturing output; `npm run check` is green before and after
(see final verification run in the same session).

## 1. `EVENT_TYPES` completeness assertion (B4)

Deleted `"bet_state_changed"` from `framework/event-bus/src/events.ts`'s `EVENT_TYPES` array,
ran `npm run check`, then restored the entry.

```
FAIL: "framework/event-bus" has 1 type error(s) and is not on the exception list.
framework/event-bus/src/events.ts(718,7): error TS2322: Type 'boolean' is not assignable to type '["EVENT_TYPES is missing", "bet_state_changed"]'.
typecheck-gate: FAIL — fix the issues above, then re-run npm run check.
```

The error message names the exact missing member (`"bet_state_changed"`), confirming the
`_EventTypesComplete` assertion is genuinely red-able, not a check that can never fail.

## 2. The two pinned routine source-kind spellings (NB1)

`layers/core-api/routine/src/routine-scheduler.ts`:

```ts
const SESSION_SPELLING: AgentSessionSourceKind = "routine";
const INTENT_SPELLING: AgentWorkIntentSourceKind = "routine_run";
```

Simulated a rename of `AgentSessionSourceKind`'s `"routine"` member (the union
`SESSION_SPELLING` is pinned against) by renaming it to `"routine_renamed"` in
`framework/domain-model/src/session-request.ts`'s `AGENT_SESSION_SOURCE_KINDS`, ran
`npm run check`, then restored the file from a pre-edit copy.

```
FAIL: "layers/core-api/routine" has 3 type error(s) and is not on the exception list.
layers/core-api/routine/src/routine-scheduler.ts(667,4): error TS2322: Type 'BakedRoutineRunRequest' is not assignable to type 'BakedWorkIntentRequest'.
layers/core-api/routine/src/routine-scheduler.ts(687,3): error TS2322: Type '"routine"' is not assignable to type '"assistant" | "explicit_session_start" | "knowledge" | "proposed_call" | "routine_renamed" | "task"'.
layers/core-api/routine/src/routine-scheduler.ts(719,7): error TS2322: Type '"routine"' is not assignable to type '"assistant" | "knowledge" | "proposed_call" | "routine_renamed" | "task"'.
```

Line 719 is the exact `SESSION_SPELLING: AgentSessionSourceKind = "routine"` pinned constant
— it fails to compile the moment the union it is checked against renames the member, exactly
as architecture.md's NB1 claims. (The rename also cascades into several other real call sites
across `run-orchestration`, `session-requests`, and `core-api` test files that assign the
literal `"routine"` to `AgentSessionSourceKind` — expected, since a real rename would need to
touch every one of them; the assertion under test, `SESSION_SPELLING`, is among the failures.)

Both mutations were single-purpose, reverted in the same session, and `npm run check` was
re-run to confirm a clean return to green (`typecheck-gate: PASS — all 39 packages checked.`)
before any other work continued.
