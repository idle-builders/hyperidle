# Architecture Critique: T3

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:10 AC:9 DM:9 N:9 MD:9 FMC:7 S:8 V:7

---

## Dimension Scores

### 1. Spec Alignment — 8/10

Every AC maps to a plan task. AC-1 (BodyEditor for mutable statuses) maps to Task 3. AC-2 (read-only blocks for immutable) maps to Task 3's conditional rendering. AC-3 (BetCreateDialog BodyEditor) maps to Task 4. AC-4 (auto-save via PATCH) maps to Tasks 2+3. AC-5 (saving indicator) maps to Task 3. AC-6 (block actions in read-only) maps to Task 3's BetPitch fallback.

The spec uses old status names (shaped, committed, in_progress, etc.) and old field name (`pitch`). The plan correctly identifies the U1 rename to `description` and the simplified 4-status enum. The plan adds Task 1 (rename pitch->description in BetDetail type) which is not an explicit AC but is a forced dependency -- the auto-save cannot work without aligning the field name. This is legitimate scope, not creep.

Minor gap: the spec's AC-4 says `field: "pitch"` but the server expects `field: "description"`. The plan addresses this in section 2 and section 4. However, the plan does not explicitly call out that the spec validation scenarios reference `field: "pitch"` in the PATCH call (line 120 of TRACK-T.md) and note that the builder should use `field: "description"` per the codebase reality. This is addressed in the self-critique section 11 but should be in section 3 (API Contract) for builder clarity.

### 2. Layer Integrity — 10/10

All changes are in `packages/web` (Human Interface layer). No server changes. No schema changes. No cross-layer reaches. The plan explicitly states "No API changes" and "No schema changes" upfront. The new hook calls `apiFetch` (the existing HTTP boundary) -- correct layer access.

### 3. API Contracts — 9/10

The plan precisely specifies the PATCH request shape: `{ field: "description", value: string, reason: string }`. It names the Zod schema (`updateBetDescriptionSchema`, lines 88-92). It specifies response codes (200, 400, 404) with error body shapes. It correctly notes the absence of 409 conflict handling (bets have no version column).

The plan references exact line numbers in `bets.ts` for the PATCH handler (lines 603-635) and the mutability constant (line 110). I verified these: `DESCRIPTION_MUTABLE_IN_STATUSES` is at line 110, and the PATCH route handler is at line 603. Both match.

Minor: the plan says response 200 is "the updated bet row" but doesn't specify which fields. The `patchDescription` function returns the raw DB row (line 263: `return { ok: true, row: updated as unknown as Record<string, unknown> }`). The hook doesn't need to parse the response body (it only checks res.ok), so this is acceptable.

### 4. Data Model Alignment — 9/10

No schema changes needed. The plan correctly identifies that the `bets` table already has `description` (not `pitch`) and there is no `version` column on bets. The `BetDetail` type rename from `pitch` to `description` aligns the frontend type with the API wire format. All claims verified against the actual source.

The plan does not mention the `product: string` field on `BetDetail` which also appears to be a U2 mismatch (server comment says "product field removed" at line 513 of bets.ts, but `BetDetail` still has `product` and `WorkBet.tsx` uses it at lines 836, 856). This is pre-existing and outside T3 scope, so not a plan deficiency -- but worth noting as a SUGGESTION for follow-up.

### 5. Naming — 9/10

`useBetDescriptionSave` is honest and specific. `BetSaveStatus` mirrors `AutoSaveStatus` but without `conflict` (correct -- bets have no version). `canEditDescription` is clear. `BET_DESCRIPTION_MUTABLE_STATUSES` mirrors the server's `DESCRIPTION_MUTABLE_IN_STATUSES`. `handleDescriptionChange` follows existing handler naming patterns. The BetPitch prop rename from `pitch` to `description` aligns with the field rename.

No name conflicts with existing primitives.

### 6. Module Depth — 9/10

The `useBetDescriptionSave` hook has a small interface (3 options, 2 return values) hiding the debounce, PATCH, status machine, and cleanup logic. The decision to create a separate hook rather than generalizing `useAutoSave` is well-reasoned -- the payload shapes genuinely differ and bets lack version/conflict handling. The plan's section 4 design-it-twice analysis is substantive, not theatre.

No unnecessary exports. The hook is consumed by one component (WorkBet) but earns its separation from WorkBet.tsx through testability and the debounce/timer lifecycle complexity.

### 7. Failure-Mode Coverage — 7/10

The plan covers: non-200 responses (status=error), 400 (status not mutable), timer cleanup on unmount, and the dirty-check to prevent spurious saves.

Missing items:

- **No rate-limiting mention.** The PATCH endpoint is called via auto-save with debounce (1500ms). The plan specifies debounce but does not mention whether the server has rate-limiting on PATCH /api/bets/:id. If a malicious user bypasses the frontend debounce, they could hammer the endpoint. This is a pre-existing concern not specific to T3, but the plan's hook is the first auto-save consumer of this endpoint and should at least note the assumption.

- **No network failure specifics.** The plan says "On non-200: sets status to error" and the catch block handles network errors, but does not specify behavior for timeouts, offline state, or connection drops mid-save. The existing `useAutoSave` hook also doesn't handle these, so this is consistent -- but the "error" state has no retry mechanism and no user guidance beyond "Save failed." The user could lose content if they navigate away during an error state.

- **No mention of the `reason` field's content.** The plan hardcodes `reason: "Edited by user"` which is fine for audit, but does not discuss whether the reason should include a timestamp or user identifier. The server's `patchDescription` function records the actor from auth context, so this is adequate -- the reason is supplementary.

### 8. Simplicity / Over-Engineering Risk — 8/10

The plan avoids over-engineering well. Key decisions that demonstrate restraint:

- Separate hook instead of premature generalization of `useAutoSave` (correct tradeoff).
- No Edit/Done toggle (concept doc says "click-to-type anywhere").
- No conflict handling (bets have no version column -- the plan correctly omits what isn't needed).
- Inline saving indicator JSX instead of a reusable component (single call site).

The `BET_DESCRIPTION_MUTABLE_STATUSES` Set duplicates the server's `DESCRIPTION_MUTABLE_IN_STATUSES`. This is acceptable (defense in depth -- the UI hides the editor, the server rejects the PATCH) but the plan should note that if the server's mutable statuses change, both must be updated. It does not.

### 9. Verifiability — 7/10

The test strategy in section 7 is structured with specific test names and what each verifies. The E2E tests in section 7.3 cover the critical user flows. The TipTap/JSDOM mitigation (mock BodyEditor in page tests) is proven from T2.

Gaps:

- **No protected-tests list.** The plan modifies existing tests (WorkBet.pitch.test.tsx, WorkBet.detail.test.tsx, etc.) but does not enumerate which test contracts are frozen and must not regress. The pitch->description rename touches at least 7 test files.

- **No explicit failing-test-first ordering.** Section 8 lists implementation tasks but does not specify that tests are written before implementation in each task. The project's CLAUDE.md requires "Write the failing tests that prove the criteria (red phase). Only then begin implementation." The plan's tasks should note this.

- **The test for "no conflict handling" (section 7.1, last row) is a negative verification** -- it asserts absence of a code path. This is correct but should specify how: does the test verify there is no 409 branch in the hook? Or that the hook does not export a `conflict` status? The assertion is underspecified.

---

## CRITICAL

None.

## WARNING

- [plan section 7, section 8] **No protected-tests list.** The plan modifies 7+ existing test files for the pitch->description rename but does not list which test contracts must not regress. The builder needs to know that existing tests for read-only BetPitch rendering (WorkBet.pitch.test.tsx), block actions (WorkBet.detail.test.tsx), and session columns (WorkBet.session.test.tsx) are frozen contracts. Add a protected-tests block listing the test files and the specific assertions that must survive the rename.

- [plan section 4] **Dual-source mutable-status set.** `BET_DESCRIPTION_MUTABLE_STATUSES` in the frontend duplicates `DESCRIPTION_MUTABLE_IN_STATUSES` on the server. If the server adds or removes a mutable status, the frontend set becomes stale. The plan should note this coupling and recommend either importing from `@hyperidle/shared` or adding a lore comment referencing the server constant.

## SUGGESTION

- [plan section 5.3b] **BetDetail.product field.** The plan fixes `pitch`->`description` but does not mention that `BetDetail.product` is similarly misaligned -- the server's GET /bets/:id response no longer includes a `product` field (removed in U2), yet `BetDetail` declares `product: string` and `WorkBet.tsx` uses `bet.product` in the breadcrumb (line 836) and BetCard prop (line 856). This is a pre-existing bug outside T3 scope, but the plan should note it as a follow-up item to avoid the builder accidentally fixing it (scope creep) or being confused by it.

- [plan section 7.1] **"No conflict handling" test assertion.** Specify the concrete assertion: verify that `BetSaveStatus` type does not include `"conflict"` and that the hook's status machine never transitions to a conflict state. Currently the test description is vague.

- [plan section 8, Task 1] **Rename scope completeness.** The plan lists 7 test files to grep for `pitch` references but does not mention `packages/web/src/__tests__/Canvas.q3.test.tsx` which references "New pitch" button (a UI label, not a field name -- should NOT be renamed). The builder should be warned to distinguish field-name references (`bet.pitch`, `pitch:` in fixtures) from UI copy references ("New pitch" button label) during the grep.

---

## What's Working Well

- **Section 2 (Critical Discovery) is excellent.** The pitch/description mismatch is a real production bug. The plan identifies it precisely, proposes two options with a cost table, and makes a clear decision. This is the kind of discovery that justifies the architecture phase.

- **The design-it-twice analysis in section 4 (useAutoSave adaptation) is substantive.** Three options evaluated with genuine tradeoffs. The decision to create a purpose-built hook over premature generalization is the right call, and the rationale (payload shape difference, no version/conflict, ~60 lines of duplication vs coupling cost) is concretely argued.

- **Section 11 (Self-Critique) is honest.** The plan identifies its own potential over-engineering and under-engineering risks and counters them with specific reasoning. The note about AC-6 block actions mapping to immutable statuses is a non-obvious interpretation that the plan calls out transparently.
