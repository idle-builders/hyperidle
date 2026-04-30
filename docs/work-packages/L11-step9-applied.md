# L11 — Apply-review Step 9 (summary)

Inputs:
- Step 7: `/workspace/.worktrees/L11/docs/work-packages/L11-simplification-scan.md`
- Step 8: `/workspace/.worktrees/L11/docs/work-packages/L11-slop-scan.md`
- Plan (binding): `/workspace/.worktrees/L11/docs/work-packages/L11-plan.md`

## Disposition

| ID | Source | Disposition | Notes |
|---|---|---|---|
| C1 | step7 | applied | dead `verdictDecisionStatus` deleted; verdict vocabulary unified in `@hyperidle/shared` (also covers S6) |
| C2 | step7 | applied | `resolvedCardSubject` synth + duplicate `<li>` deleted; ThreadShell now picks ONE `cardSubject` and the card's `resolved` prop transitions naturally as `promotedRichMessageId` re-evaluates |
| W1 | step7 | deferred | extracting `RichMessageMeta`/`RichMessageActions` is a sizable refactor; with W2 disabling the rich-row buttons and S11 dropping the per-call styling ternary, the divergence between the two render paths is much smaller. Leave for a follow-up that owns the visual contract once. |
| W2 | step7 | applied | rich-row questionnaire buttons in `ThreadShell.buildRichSlots` now `disabled` + `aria-disabled` + tooltip + all-ghost (matches S11). |
| W3 | step7 | applied | `hasMostRecentUnresolvedReview` helper, its index re-export, and four test cases deleted. |
| W4 | step7 | superseded by C2 | with C2 applied the resolved-card branch no longer exists, so the `blocking={false}` literal call site is gone. |
| W5 | step7 | applied | `generateClientKey()` calls `globalThis.crypto.randomUUID()` directly; weak `Math.random()` fallback removed. |
| W6 | step7 | deferred (plan-contradiction) | plan §5.6.1 explicitly chose decision (A) — mount `<ArtifactView>` per `ref.kind` with empty data. The 5-arm switch is the implementation of that decision. Refactoring `ArtifactView`'s prop contract is out of L11 scope. |
| W7 | step7 | applied | stale K2 `@lore` block + tautological L11 lore collapsed into a single load-bearing comment on `ArtifactView`'s wrapper-div. |
| O1 | step7 | superseded by C2 | the empty-string fallback for `resolved.timestamp` was inside the deleted resolved-card synth. The single remaining caller passes `m.resolvedAt ?? ""`; observation flagged but not blocking. |
| O2 | step7 | deferred | narrowing `RichMessageCardProps.message` to `Message & { type: "review" \| "questionnaire" }` is correct but ripples into all the call sites that still pass `Message` directly; out of scope for this round. |
| O3 | step7 | observation only | already correct, no action needed. |
| O4 | step7 | observation only | three audit attrs each have a real consumer; no action. |
| O5 | step7 | deferred | folding `resolved` into the state union is a 5-min change but touches every caller's `state={...}` spread; will pair with W1's sub-component extraction. |
| O6 | step7 | out of scope | track-K cleanup. |
| S1 | step8 | deferred (plan-contradiction) | plan §5.6.1 + AC-8 verification both require `<ArtifactView>` to mount inside the card. Replacing it with `EmptyState` would break the AC-8 check and the e2e `card.locator("[data-component='ArtifactView']")` assertion. The empty `<img src="">` self-request risk is real but should be addressed in the artifact-fetch follow-up that the plan defers. |
| S2 | step8 | applied | two narrating comments in `RichMessageCard` / `ThreadShell` removed. |
| S3 | step8 | applied | `CommentRow` rich-slot doc-comment now honestly says the slots are silently dropped for plain/verdict messages. |
| S4 | step8 | superseded by W6 | the `as` cast ladder lives in the artifact resolver that S1+W6 would have deleted; deferred with them. |
| S5 | step8 | deferred | `decodeThreadDetail` + `ThreadDetailDecodeError` are imperfect but the plan (§6.2) accepted the trust-the-zod-boundary path. Replacing with a re-exported zod schema is a separate cleanup; the existing class is small and contained. |
| S6 | step8 | applied | covered by C1's commit — `verdictDecisionLabel` and `verdictDecisionToStatus` now live in `@hyperidle/shared`. |
| S7 | step8 | deferred (plan-contradiction) | plan §5.6.1's verification text references `data-shape='<ref.kind>'`. No test asserts it today, but dropping it would conflict with the plan-as-written. Leave for a track-K cleanup pass. |
| S8 | step8 | superseded by S1 | the "before" / "after" labels live inside the resolver that S1 would have deleted; carries with S1. |
| S9 | step8 | observation only | stories cosmetics, not load-bearing. |
| S10 | step8 | observation only | story-only mock, no production impact. |
| S11 | step8 | applied | `idx === 0 ? primary : ghost` heuristic replaced with all-ghost in BOTH `RichMessageCard` and the `ThreadShell.buildRichSlots` rich-row variant. |
| S12 | step8 | applied | `data-promoted='true'` attribute removed from the live card; `data-message-id` is the honest test. |
| S13 | step8 | out of scope | inline `ChevronDown` SVG is a pre-existing pattern; track-K candidate. |

## Test rewrites

- `packages/web/src/__tests__/ThreadShell.test.tsx` — removed the import of `hasMostRecentUnresolvedReview` and the four test cases under `describe("hasMostRecentUnresolvedReview ...")`. The helper itself was deleted (W3); the tests cannot exist without their subject. No production behaviour was being verified — the helper had no callers.

No other tests were rewritten. The C2 unification (single `cardSubject` render path) is behaviourally equivalent to the previous double-mount approach for every existing test scenario:
- promoted unresolved review → card with `state={cardState}`, no `resolved` prop (same as before)
- only-resolved review with verdict → card with `resolved` prop (same as before)
- only-resolved review without verdict → no card (same as before)
- no rich messages → no card (same as before)

## Final verification

- `bun run check` — green (`tsc --noEmit -p tsconfig.json`, exit 0).
- `bun run test` — `Test Files  287 passed | 1 skipped (288)`, `Tests  2989 passed | 3 skipped (2992)`.
- `bun run lint` — pre-existing failures in unrelated files (`Rail.tsx`, `Submenu.tsx`, `Conversations.tsx`, db tests). No new errors introduced by the apply-review changes; verified by linting each touched file individually (`RichMessageCard`, `ThreadShell`, `CommentRow`, `ConversationsReview`, `ArtifactView`, `shared/thread.ts`) — only design-warnings and the project-known `no-raw-actor-fetch` pre-existing on `ConversationsReview`.

## Commits (apply-review step 9)

1. `b678ffe` — `refactor(L11): unify verdict vocabulary in shared` — C1 + S6
2. `11b6052` — `refactor(L11): drop hasMostRecentUnresolvedReview helper` — W3
3. `60d1d87` — `refactor(L11): unify card render through single subject` — C2
4. `1311616` — `fix(L11): polish — buttons, lore, comments, redundant attrs` — W2, W5, W7, S2, S3, S11, S12
