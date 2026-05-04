# L11 — Simplification Scan (Step 7)

Read-only scan of the diff `main...feat/L11-rich-messages-inline`. Findings only — no code changes. Severity ranked.

Reference inputs:
- Plan: `/workspace/.worktrees/L11/docs/work-packages/L11-plan.md`
- 13 implementation commits (c48d240 → 1c52a9b)
- Spec authority for "necessary by spec" judgements: plan §3 (AC map) and §6 (files).

---

## CRITICAL — must fix before merge

### C1. Dead helper `verdictDecisionStatus` in `RichMessageCard.tsx`
**Location:** `packages/design-system/src/RichMessageCard.tsx:102-116`
**What:** `function verdictDecisionStatus(decision)` returns a `"done" | "blocked" | "behind" | "paused"` mapping. Grep across the file (and the rest of the repo) shows zero callers. The only `StatusChip` usage in the file is `<StatusChip status="blocked" />` at line 515 — a hard-coded literal, not derived from this helper.
**Why simpler:** It is dead code. The `CommentRow.tsx` file already owns an identical `verdictDecisionToStatus` helper (`CommentRow.tsx:47-61`) that is actually used. Two copies of the same mapping is the AI-slop "duplicated helper" smell the plan §11 process is meant to catch.
**Suggested change:** Delete `verdictDecisionStatus` from `RichMessageCard.tsx`.

### C2. Resolved-card synthesis is page-level concept leaking into `ThreadShell` — out of plan scope
**Location:** `packages/design-system/src/ThreadShell.tsx:234-253` (the `resolvedCardSubject` memo) and `ThreadShell.tsx:345-374` (the standalone resolved-card `<li>` rendered ABOVE the stream).
**What:** A second card is rendered at the top of the message list whenever there is no promoted unresolved candidate AND a verdict exists. The `resolvedCardSubject` memo walks the messages backwards, hunts for the most-recent resolved review/questionnaire, hunts AGAIN for its companion verdict by `resolvesMessageId`, then renders a SECOND `<RichMessageCard>` above the stream — outside the `groupedStream.map(...)` flow.
**Why simpler:**
  1. The plan never authorises this. Plan §3 AC-1/AC-7 say "render rich messages inline as part of the stream"; AC-6 says "at most one promoted card per thread". Plan §9 mentions "card animates to resolved single-line summary" — i.e. the SAME card transitions, it does not get cloned at the top of the list.
  2. The verdict is already rendered by `CommentRow` later in the stream (verdict path at `CommentRow.tsx:99-105`). The user now sees the same decision THREE times: synthetic resolved card at top, original review (where? — actually nowhere because the review collapses), and the verdict CommentRow. Reading the implementation, it's plausible the ordering is: top-of-stream resolved card + verdict row mid-stream — duplicate signal.
  3. Recreates exactly the "head above the stream" anti-pattern that approved.md §11 (rejection list 1, 2) and plan §1 set out to delete.
  4. The lookup (`ordered.find(v => v.type === "verdict" && ... v.payload.resolvesMessageId === m.id)` at `ThreadShell.tsx:243-246`) is O(n) inside a memo whose outer scan is also O(n) — easy to delete, hard to justify.
**Suggested change:** Delete the entire `resolvedCardSubject` memo and the resolved `<li>` block (`ThreadShell.tsx:234-253` + `ThreadShell.tsx:345-374`). If "continuity after Approve" is a real requirement, surface it through the existing card's `resolved` prop transition driven by `promotedRichMessageId` re-evaluation — which is already what `RichMessageCard` was designed for (props `resolved`, `RichMessageCardResolved`). The plan §9 "card animates to resolved" failure-mode entry expects exactly that path.

---

## WARNINGS — significant unjustified complexity

### W1. `buildRichSlots` in `ThreadShell.tsx` duplicates `RichMessageCard`'s rendering
**Location:** `packages/design-system/src/ThreadShell.tsx:127-205`
**What:** A second copy of "render REVIEW tag + title + reasoning ol; render QUESTION tag + title + question + answer-buttons" lives inside `ThreadShell`. The card itself already has `renderReasoning`, `renderQuestionnaireBody`, `renderActionFooter` doing the same thing with the same Tailwind classes. The questionnaire `actions` block at `ThreadShell.tsx:185-200` even hand-rolls primary/ghost button styles that already exist in `RichMessageCard`'s `BUTTON_CLASS_BASE` + `toneClass` (lines 118-130).
**Why simpler:** Two visual implementations of the same review/questionnaire metadata strip means two places to drift. The CommentRow rich-row variant is, by spec (plan §5.4), a downgraded form of the card — not an independent renderer. The natural composition is to expose a small public sub-component from `RichMessageCard` (e.g. `RichMessageMeta`, `RichMessageActions`) that BOTH paths consume, OR to render the second-and-later unresolved candidates by mounting `<RichMessageCard>` itself with a `compact` flag.
**Suggested change:** Either (a) extract a `RichMessageMeta` + `RichMessageActions` sub-export from `RichMessageCard.tsx` and reuse them inside `buildRichSlots`, OR (b) render non-promoted unresolved rich messages via `<RichMessageCard>` with a new `density="compact"` prop. Today's implementation pays a duplicate-render-tree cost without owning the visual contract once.

### W2. Questionnaire `richActions` buttons in `ThreadShell.tsx` are dead-click — no `onClick`
**Location:** `packages/design-system/src/ThreadShell.tsx:185-200`
**What:** The buttons rendered for the rich-row questionnaire variant have no `onClick`. Plan §5.6 CONFUSION-C says "questionnaire dispatch is render-only at the page level for L11", but here they aren't even wired upward. They are visually present but functionally inert — and there is no `disabled` state, no `aria-disabled`, no visual cue that nothing happens.
**Why simpler:** Either remove the buttons entirely until track-L wires answers (plan §12 item 3), or render them as `disabled` so the user gets honest feedback. Visible but inert clickable elements are the worst of both worlds.
**Suggested change:** Add `disabled` + `aria-disabled="true"` and a tooltip/title until a real handler exists; or drop the `actions` slot for questionnaire rows entirely and let the promoted card carry all answer interactions.

### W3. Dead helper `hasMostRecentUnresolvedReview` in `ThreadShell.tsx`
**Location:** `packages/design-system/src/ThreadShell.tsx:106-116`, exported from `packages/design-system/src/index.ts:82`
**What:** Plan §6.2 explicitly says the "Unresolved review · acting required ↑" link is REMOVED. The helper that powered it (`hasMostRecentUnresolvedReview`) is no longer called anywhere in production code (no `Composer` consumer; ThreadShell never calls it). It only survives because four scenarios in `ThreadShell.test.tsx:328-372` still test it.
**Why simpler:** The doc-comment at lines 107-110 even says "after L11 the composer no longer renders the legacy 'Unresolved review' link". Keeping the helper + tests + index export costs API surface area for a function with zero callers.
**Suggested change:** Delete the helper, the `index.ts` re-export, and the four test cases under the `describe("hasMostRecentUnresolvedReview ...")` block.

### W4. `RichMessageCardProps.blocking` is set to a literal `false` in one of two callers
**Location:** `packages/design-system/src/ThreadShell.tsx:354` (`blocking={false}`) and `ThreadShell.tsx:386` (`blocking={blocking}`)
**What:** The resolved-card path passes `blocking={false}` unconditionally (because by definition resolved means not blocking). This is a configuration prop whose only non-trivial value is supplied by exactly one call site. With C2 above resolved (resolved-card synth deleted), the prop has exactly one real producer.
**Why simpler:** If the resolved-state branch in C2 is removed, this prop has a single caller's truth source. The prop remains useful for the live card. Acceptable to keep — flagged only because the plan §6.2 CONFUSION-A intentionally simplified `promotedRichMessageId` to drop sessionState; the same simplification should reach the consumer side.
**Suggested change:** No change required if C2 is fixed. If not fixed, evaluate whether `blocking` is two booleans masquerading as one.

### W5. `generateClientKey` non-crypto fallback path is unreachable in test + prod
**Location:** `packages/design-system/src/RichMessageCard.tsx:181-189`
**What:** The "fallback for pre-secure-context test environments" branch exists for jsdom < v22. The repo already runs Vitest with modern jsdom (the codebase ships `@hyperidle/shared` with `crypto.randomUUID` calls elsewhere). The fallback is defensive against a configuration that does not exist. Worse, it's `Math.random()` which is NOT cryptographically random — meaning a real fallback would silently introduce a weak idempotency key.
**Why simpler:** Either (a) call `crypto.randomUUID()` directly and let it throw if unavailable (loud failure surfaces the misconfig immediately), or (b) document the contract that `crypto.randomUUID` is required and remove the weak fallback. The current code optimizes for an environment that doesn't exist.
**Suggested change:** Replace the body with `return globalThis.crypto.randomUUID();` and delete the fallback.

### W6. `ConversationsReview.resolveArtifactSlot` is a 5-arm switch that all do the same thing
**Location:** `packages/web/src/pages/ConversationsReview.tsx:112-145`
**What:** Five `case` branches each return `<ArtifactView shape={X} data={emptyDataForShape(X) as TypeX} />`. The only thing that varies is the literal — the `shape` is `ref.kind` and the `data` is derived from the same `emptyDataForShape(ref.kind)`. The only reason the switch exists is to satisfy the discriminated union in `ArtifactViewProps` — the cast `as TextDiffData` etc. is doing the type narrowing the switch is supposed to provide.
**Why simpler:** Either collapse to a single branch with a `as` cast at the top (no worse than the per-branch casts), or — better — refactor `ArtifactView` to accept a `(kind, data)` tuple-equivalent without forcing each call site to re-discriminate. The five-line `as` ladder offers zero type safety over a one-line cast.
**Suggested change:** Replace the switch with:
```ts
return <ArtifactView shape={ref.kind} data={emptyDataForShape(ref.kind) as never} />;
```
or invert the discriminator so `ArtifactView` does the narrowing internally. Today this resolver is N callers wide for one task: "mount an empty artifact". (Note: `as never` is a smell too — see W7 — the real fix is to widen `ArtifactView`'s prop contract.)

### W7. `ArtifactView` `cloneElement → wrapper-div` lore is rationalising a leak
**Location:** `packages/web/src/shell/ArtifactView.tsx:376-388`
**What:** Three stacked `@lore` comments (K2, L11) explain why a wrapper `<div>` had to be reintroduced where a `cloneElement` once lived. The L11 lore says `cloneElement(body, shellAttrs)` was setting attrs as PROPS on a function component that drops them on the floor. That was the bug. The fix is correct — wrap in a div. But the K2 lore at lines 377-380 still warns future readers "if a future renderShape branch wraps in a DS primitive at the root, switch to a wrapper div instead" — except they already did, so the warning is stale.
**Why simpler:** A `@lore` comment that documents a complexity that has been removed is just noise. The K2 comment now describes a path that no longer exists.
**Suggested change:** Delete the K2 `@lore` block at lines 377-380; keep the L11 lore (it explains the current `<div>`-wrap and is still load-bearing). Better yet, delete both and let the obvious `<div>` stand on its own — the wrapper is self-explanatory once `cloneElement` is gone.

---

## OBSERVATIONS — discuss but do not block

### O1. `RichMessageCardResolved.timestamp` typed as `string` with no contract
**Location:** `packages/design-system/src/RichMessageCard.tsx:59`, used at `ThreadShell.tsx:366` (`timestamp: resolvedCardSubject.message.resolvedAt ?? ""`)
**What:** When `resolvedAt` is null, an empty string is passed and rendered verbatim as `· ` (line 243 of `RichMessageCard.tsx`). The empty-string fallback is silent garbage.
**Suggested change:** Make `timestamp` non-optional and let the caller fail loudly if it's missing, or render conditionally. Becomes moot if C2 is applied.

### O2. `RichMessageCard` tag-label fallback `"MESSAGE"` is unreachable
**Location:** `packages/design-system/src/RichMessageCard.tsx:349`
**What:** `const tagLabel = isReview ? "REVIEW" : isQuestionnaire ? "QUESTION" : "MESSAGE";`. By the time this line runs the four early-return branches above (resolved×2, redacted×2, plus the `null` returns from `deriveReview`/`deriveQuestionnaire` for non-rich types) have eliminated every path where neither `isReview` nor `isQuestionnaire` is true — except `deriveReview` returns `null` if `message.type !== "review"`, and same for questionnaire. So a `plain` or `verdict` message routed here returns `null` from both derive helpers, both `isReview` / `isQuestionnaire` are false, and rendering proceeds with `tagLabel="MESSAGE"`, `title=""`, no slots. Component never receives non-rich messages today, but the silent "MESSAGE" fallback is dead defence.
**Suggested change:** Narrow the prop type so `RichMessageCardProps.message` is `Message & { type: "review" | "questionnaire" }`, and delete the fallback.

### O3. `RichMessageCard` reads `message.id` with a fallback `key` even though message is required
**Location:** `packages/design-system/src/RichMessageCard.tsx:434`, `:474`
**What:** `key={\`${message.id}-opt-${opt}\`}` and `key={\`${message.id}-r-${i}\`}` — fine. Just confirming this isn't a problem; `message.id` is a required field on `Message`.
**Suggested change:** None — listed for completeness.

### O4. `dsProps("RichMessageCard", "2")` AND `data-component="RichMessageCard"` AND `data-testid="rich-message-card"` — three audit attrs that say the same thing
**Location:** `packages/design-system/src/RichMessageCard.tsx:223-225`, `:272-273`, `:496-497`
**What:** The component carries `data-ds-component`, `data-component`, AND `data-testid` — three different selectors all pointing at "this is the card". Plan §3 verification queries use `[data-component="RichMessageCard"]`; tests use `[data-testid="rich-message-card"]`. The K2 inspector consumes `data-ds-*`. So all three have a real consumer — it's not over-instrumentation, just three audiences.
**Suggested change:** None — flagged so reviewers don't trim them mistakenly.

### O5. `state.phase` is a discriminated union used additively
**Location:** `packages/design-system/src/RichMessageCard.tsx:51-54`, consumed at `:374-402`
**What:** The `idle | saving | error` discriminator is held separately from `resolved`. Resolved and idle/saving/error are mutually exclusive — you can't be saving AND resolved — but the type permits it. Today the call site (`ThreadShell.tsx`) always passes `state={cardState}` AND `resolved={...}` for the resolved-card path. Today's resolved branch is reached early (line 304) so this works, but the type system isn't enforcing the invariant.
**Suggested change:** Fold `resolved` into the state union: `{ phase: "idle" } | { phase: "saving" } | { phase: "error"; reason } | { phase: "resolved"; ... }`. Five-minute change, removes a foot-gun.

### O6. Plan §6.1 says `RichMessageCard.test.tsx` lives under `packages/web/src/__tests__/` — but the component is in `packages/design-system/src/`
**Location:** `packages/web/src/__tests__/RichMessageCard.test.tsx`
**What:** A design-system component's primary tests live in the consumer package. Existing convention seems mixed (`ThreadShell.test.tsx` is also in `packages/web`), so this isn't introduced by L11. Flag for retro: the design-system has no test-co-location and that's been true for a while.
**Suggested change:** Out of scope for L11. Worth a track-K cleanup story.

---

## VERDICT

**REVISE.** Two critical issues block clean merge:
1. C1 (dead `verdictDecisionStatus`) — trivial fix, mandatory.
2. C2 (out-of-plan resolved-card duplicate) — recreates exactly the "head above the stream" pattern L11 set out to delete; high risk of being interpreted by `/check-definition-of-done` as a violation of approved.md §11 rejection items 1 & 2 and AC-1.

Six warnings (W1–W7 minus none) describe duplicated rendering, dead exports, dead branches, and stale lore. Each is small individually; together they signal the implementation accreted scaffolding that the plan didn't ask for. Apply all warnings before ship.

After C2 is removed and W1 is collapsed, expect ~80–120 lines of net deletion in `ThreadShell.tsx`. That alone is worth the round-trip.

Files referenced (absolute):
- `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.tsx`
- `/workspace/.worktrees/L11/packages/design-system/src/ThreadShell.tsx`
- `/workspace/.worktrees/L11/packages/design-system/src/CommentRow.tsx`
- `/workspace/.worktrees/L11/packages/design-system/src/index.ts`
- `/workspace/.worktrees/L11/packages/shared/src/thread.ts`
- `/workspace/.worktrees/L11/packages/web/src/pages/ConversationsReview.tsx`
- `/workspace/.worktrees/L11/packages/web/src/shell/ArtifactView.tsx`
- `/workspace/.worktrees/L11/packages/web/src/__tests__/ThreadShell.test.tsx`
