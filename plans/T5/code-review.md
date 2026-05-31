# Code Review: T5 — Block Discussion Completion

**Reviewer:** Phase 4 (code review, 6 lenses + AC completeness)
**Branch:** `feat/T5-block-discussion-completion`
**Commits reviewed:** 4 (schema, server, anchor-lost indicator, block-scoped filter) + 2 fix commits (`b5a29aaa`, `d26d3011`)

---

## Re-Review: Fix Verification (6 findings from initial review)

### Blocking Finding 1: KnowledgeDetail.tsx wired — RESOLVED

`packages/web/src/pages/KnowledgeDetail.tsx:566` now passes `filterBlockId={threadPrefill?.blockId}` to `HostThreadSection`. The prop flows correctly: when the user clicks "Discuss" on a block, `threadPrefill` is set with `blockId`, which is forwarded as the filter. When no block is selected, `threadPrefill` is undefined, so `filterBlockId` is undefined (no filter). Correct.

### Blocking Finding 2: WorkBet.tsx anchor-lost indicator — RESOLVED

`packages/web/src/pages/WorkBet.tsx` now has:
- `anchorLost?: boolean` added to `AnchoredMessagesProps` (line 118)
- `anchorLost = false` destructured with default (line 123)
- Conditional `<span data-testid="anchor-lost-indicator">` rendered when `anchorLost` is true (lines 128-132)
- Orphan catch-all at line 231 passes `anchorLost` (shorthand for `anchorLost={true}`)

The implementation is structurally identical to the KnowledgeBody.tsx pattern. Same CSS classes (`text-xs text-[var(--text-lo)] italic`), same test ID (`anchor-lost-indicator`), same text ("anchor lost"). Consistent. AC-2 now covers both knowledge items and bet pitches.

### Blocking Finding 3: E2E test created — RESOLVED

`packages/web/e2e/T5-block-discussion.spec.ts` (479 lines) covers:
- AC-1/AC-5: 4 tests — page renders blocks + thread section, Space opens BlockActionsPopover with Discuss option, clicking Discuss pre-fills composer, posting message appears in thread
- AC-2: 1 test — orphan message shows `anchor-lost-indicator`
- AC-5: 1 test — filter shows only block-specific messages, "Show all messages" restores full list

Total: 6 E2E test cases (the claim of 7 was slightly generous — AC-5 has one test with two assertions, not two tests). The coverage is adequate. The test strategy is hermetic (page.route() mocks, no DB seeding). The lore comments explaining the approach are valuable.

### Non-blocking Finding 4: `as` cast replaced with type guard — RESOLVED

`isPlainPayloadWithBlockId()` type guard at line 87-94 replaces the inline `as PlainPayloadWithBlockId` cast. The guard checks `typeof payload === "object"`, `payload !== null`, `"text" in payload`, and `typeof payload.text === "string"`. This correctly narrows `unknown` to `PlainPayloadWithBlockId`.

Note: The type guard itself contains `(payload as { text: unknown }).text` at line 92. This `as` cast is inside a type guard after an `in` check — an accepted TypeScript pattern for runtime narrowing of `unknown`. The `in` check on the line above already proves `text` exists; the `as` is needed syntactically to access the property with a type annotation. This is not the unsafe `as` pattern the rule targets. Acceptable.

Usage at line 209: `if (!isPlainPayloadWithBlockId(msg.payload)) return false;` then `msg.payload.blockId` — clean narrowing, no cast. Correct.

### Non-blocking Finding 5: showAll resets on filterBlockId change — RESOLVED

`useEffect(() => { setShowAll(false); }, [filterBlockId]);` at lines 130-132. Correct dependencies — only `filterBlockId`. The biome-ignore comment for `useExhaustiveDependencies` is appropriate since this effect intentionally reacts only to `filterBlockId` changes and does not use any other reactive values.

Unit test at `HostThreadSection.filter.test.tsx:291-335` verifies the behavior: renders with `filterBlockId="block-filter-A"`, clicks "Show all", rerenders with `filterBlockId="block-filter-B"`, asserts only block-B messages are visible and the "Show all" button reappears. This is a proper behavioral test — it checks the user-visible consequence, not the implementation detail.

### Non-blocking Finding 6: block_id max-length guard — RESOLVED

`threads.ts:293-296` rejects `rawBlockId.length > 128` with 400 and `validation_error` code. The limit of 128 is reasonable — block IDs are Blake2s hashes (~64 chars), so 128 provides headroom without allowing abuse. The comment at line 287 documents the rationale.

Integration test at `threads.blockId.test.ts:377-389` verifies a 129-char `block_id` returns 400 with `code: "validation_error"`. Correct.

---

## Lens Re-checks (abbreviated — only items affected by fixes)

### Architecture — PASS

All plan tasks are now implemented. No plan deviations remain. The two `AnchoredMessages` components (KnowledgeBody.tsx and WorkBet.tsx) are still not shared, but they are small (15-20 lines) and co-located with their call sites. Extracting a shared component would be premature — the plan does not require it, and the duplication is minimal.

### Security — PASS

The max-length guard closes the last security note from the initial review. Input validation chain for `block_id` is now: reject undefined-but-empty (line 289), reject >128 chars (line 293), pass through as parameterized Drizzle query. Complete.

### Adversarial — PASS

No remaining `as` casts outside the type guard internals. The `showAll` reset effect is tested. The E2E tests are hermetic and cover the critical user flows.

### AI Slop — one minor note

The `@lore T5: same pattern as KnowledgeBody.tsx AnchoredMessages` JSDoc comment in WorkBet.tsx (line 116-117) is a 4-line block for a boolean prop. Slightly verbose for a single prop, but the cross-reference is genuinely useful for the next agent who encounters two `AnchoredMessages` components and needs to understand they should stay in sync. Not a finding.

---

## AC Completeness Audit (updated)

| AC | Implemented? | Tested? | Edge cases? | Status |
|----|-------------|---------|-------------|--------|
| 1. blockId in structured queryable field | Yes — `block_id` column + dual-write | Yes — 4 unit + 1 E2E | Covered: null case, both POST endpoints | PASS |
| 2. "anchor lost" when blockId no longer resolves | Yes — `anchorLost` prop in both KnowledgeBody.tsx and WorkBet.tsx | Yes — 8 unit + 1 E2E | Both surfaces covered | PASS |
| 3. Indicator does not distinguish deleted vs edited | Yes — single "anchor lost" text, no conditional logic | Yes — 2 unit tests (deleted vs edited produce same text) | Adequate | PASS |
| 4. Anchored messages outlive their block | Yes — no FK, no cascade, no cleanup job | Yes — 1 unit test | Adequate (structural: no cascade possible since blocks are derived) | PASS |
| 5. Block-scoped thread view | Yes — `filterBlockId` wired from KnowledgeDetail.tsx, showAll reset on change | Yes — 7 unit + 1 E2E | showAll reset, empty-string rejection, max-length guard | PASS |

---

## Verification Status

- `npm run check`: PASS (0 type errors)
- `npm run lint`: PASS (0 lint errors)
- `npm run test -- --all`: PASS (11 passed, 0 failed, 0 skipped)

---

## Overall Verdict: DONE

All 3 blocking findings are resolved correctly. All 3 non-blocking findings are addressed. All 5 ACs pass implementation and test coverage checks. Typecheck, lint, and full test suite are green.
