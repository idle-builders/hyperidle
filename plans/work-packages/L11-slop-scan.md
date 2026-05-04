# L11 — Slop Scan (Step 8)

Read-only scan of the diff `main...feat/L11-rich-messages-inline` for AI-specific
code anti-patterns. Findings only — no code changes. Severity ranked.

Reference inputs:
- Plan: `/workspace/.worktrees/L11/docs/work-packages/L11-plan.md`
- Step 7 simplification scan: `/workspace/.worktrees/L11/docs/work-packages/L11-simplification-scan.md`
- 15 commits (`8069d56` → `711ef2a`)

Step 7 already covered: dead `verdictDecisionStatus`, the `resolvedCardSubject`
synthesis in `ThreadShell`, `buildRichSlots` duplicating the card,
`hasMostRecentUnresolvedReview` dead helper, dead-click questionnaire buttons,
weak `crypto.randomUUID` fallback, `resolveArtifactSlot` 5-arm switch, stale K2
`@lore` block. Those are not re-litigated below.

---

## CRITICAL — must fix before merge

### S1. Production-path mock data shipped to the user
**Location:** `/workspace/.worktrees/L11/packages/web/src/pages/ConversationsReview.tsx:87-110`, `:112-145`
**What:** `emptyDataForShape(kind)` and `resolveArtifactSlot(ref)` build a real
`<ArtifactView>` with literal placeholders (`hunks: []`, `html: ""`, `before:
{ label: "before", src: "" }`, `after: { label: "after", src: "" }`,
`actions: []`, `headlines: [], charts: []`) and mount it inside every promoted
`RichMessageCard`. The `@lore` block at lines 81-86 shrugs at this — "follow-up
story wires real fetch" — but the literals are SHIPPED on the production page,
not in a story or fixture.
**Why this is slop:** `before:"", after:""` will render an empty `<img src="">`
which most browsers treat as "fetch the current document URL", spamming the
server with self-requests. `html:""` runs through `DOMPurify.sanitize("")`
fine, but the placeholder is now a load-bearing user-visible artifact.
The plan §5.6.1 explicitly chose this path; the slop is that there is no
visible "preview unavailable" state — the user sees a blank panel with no
explanation.
**Suggested change:** Replace the body of `resolveArtifactSlot` with a single
`<EmptyState title="Artifact preview unavailable" description="Preview wiring lands in a follow-up." />`.
That keeps the metadata strip honest, drops 33 lines + the cast ladder, and
removes the `before:"" / after:""` self-request risk.

---

## WARNINGS — significant unjustified complexity

### S2. Comments narrate the code instead of explaining the why
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.tsx:298`,
`/workspace/.worktrees/L11/packages/design-system/src/ThreadShell.tsx:219`
**What:**
- `// Reasoning toggle (review variant only). Default closed for long, open is irrelevant for short (rendered inline without the toggle).` — restates what the next two lines literally say.
- `// Sort ASC for the predicate; rendering is also ASC for natural reading.` — the next line is a `localeCompare` sort. Either drop it or capture the actual non-obvious bit ("createdAt ties broken by id for stability").
- `// answer / retry intentionally render-only at the page level for L11` (`ThreadShell.tsx:304-305`) is OK — it explains why the handler stub returns early. Keep that one.
**Suggested change:** Delete the two narrating comments; keep the
"intentional render-only" one.

### S3. Comment lies about the call surface
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/CommentRow.tsx:32-37`
**What:** The doc-comment on `richHeader` says "Defensive — supplied slots are
ignored for plain/verdict messages". The implementation at line 130-131
(`isRich && (richHeader || ...)`) does not "ignore" anything — it just gates
the `data-variant` and the rich-block render branch. If a caller passes
`richHeader` for a `plain` message, the slot is silently dropped (no warn, no
type error). The comment dresses up "we drop it" as "defensive".
**Suggested change:** Either make the `CommentRowRichSlots` type only valid on
review/questionnaire messages via a discriminator, or remove the misleading
"defensive" framing and document the actual behaviour ("ignored without
warning").

### S4. `as never` cast launders the discriminated-union type
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/ThreadShell.tsx:291`
**What:** `decision: action.decision satisfies VerdictDecision` is fine but
the larger pattern in `ConversationsReview.resolveArtifactSlot` uses
five `as TextDiffData` etc. casts to placate the discriminated union.
TypeScript rule (`/workspace/.worktrees/L11/.claude/rules/typescript.md`)
explicitly forbids `any`, `@ts-ignore`, "unsafe `as` casts". Five `as` casts
to coerce empty literals into branded data shapes are unsafe casts.
**Suggested change:** Either refactor `ArtifactView` to widen its prop
contract (one cast at the boundary, not five), or — paired with S1 above —
delete the resolver entirely and render an `EmptyState`. The cast ladder is
not load-bearing once the placeholder mounting is deleted.

### S5. Naming inflation: `decodeThreadDetail` plus `ThreadDetailDecodeError` plus `isObject` for one call site
**Location:** `/workspace/.worktrees/L11/packages/web/src/pages/ConversationsReview.tsx:36-79`
**What:** A bespoke `class ThreadDetailDecodeError extends Error` plus a private
`isObject` helper plus a 30-line `decodeThreadDetail` that ends with three
`as unknown as Thread / Message[]` casts AND a comment admitting "Server already
validates `thread` and each `message` via zod. We trust the shape here". If you
trust the shape, the decoder is theatre — it validates `value.thread` is an
object, then casts to `Thread` without checking any field of `Thread`. The error
class is thrown in three places and caught by a single `catch (cause)` that
turns it back into a string.
**Why this is slop:** Either decode honestly (use the zod schema that already
exists in `packages/server/src/routes/threads-schema.ts` — re-export and parse
client-side) or trust the boundary and drop the error class + `isObject` +
the half-decoder. The current code pays the surface area of a real decoder
for none of the safety.
**Suggested change:** Replace with a single zod `parse` at the fetch site, OR
collapse to `const body = await res.json() as ThreadDetail` and delete the
class + helper. Pick one.

### S6. Two near-identical `verdictDecisionLabel` functions
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.tsx:88-100` and `/workspace/.worktrees/L11/packages/design-system/src/CommentRow.tsx:63-75`
**What:** Byte-identical 5-arm switch returning `"APPROVED" | "REJECTED" |
"CHANGES REQUESTED" | "EDITED"`. Same mapping, same strings, two files.
Step 7's C1 found `verdictDecisionStatus` duplicated; this is the second pair
in the same vicinity. Both files import `VerdictDecision` from
`@hyperidle/shared` — the natural home for the label mapping is shared.
**Suggested change:** Move both `verdictDecisionLabel` and
`verdictDecisionToStatus` to `packages/shared/src/thread.ts` next to
`VerdictDecision` and import from there. Net: -26 lines, single source of
truth for the verdict vocabulary.

### S7. Redundant `data-shape` attribute on `ArtifactView` — already discriminated by `data-component`
**Location:** `/workspace/.worktrees/L11/packages/web/src/shell/ArtifactView.tsx:346-353`
**What:** The L11 patch adds BOTH `data-component="ArtifactView"` (for the AC-8
verification query) AND `data-shape={props.shape}`. Plan §3 only references
`data-component`. Grep across the repo: nothing reads `data-shape`. The K2
inspector reads `data-ds-shell`. So `data-shape` is committed audit cruft with
zero consumer.
**Suggested change:** Drop `"data-shape": props.shape` from the spread at
line 351. If a future test needs to discriminate, use the existing
`data-ds-shell` or add the attr lazily.

### S8. Empty placeholder copy in committed source — AQ-109 violation
**Location:** `/workspace/.worktrees/L11/packages/web/src/pages/ConversationsReview.tsx:101-104`
**What:** `before: { label: "before", src: "" }, after: { label: "after",
src: "" }`. Aesthetic-rules AQ-109 forbids "Lorem ipsum or `Click here`
placeholder copy in committed source"; lower-case "before" / "after" as
visible image labels are the same flavour of placeholder slop.
**Suggested change:** Subsumed by S1 (delete the resolver). Flagged
separately so reviewers see the rule hit.

---

## OBSERVATIONS — discuss but do not block

### S9. `RichMessageCard.stories.tsx` re-uses the same `reviewMsg(longReasoning)` literal seven times
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.stories.tsx:97-170`
**What:** Idle, Saving, Error, ResolvedHarness, LongReasoningCollapsed all call
`reviewMsg(longReasoning)`; only `ShortReasoningInline` differs by data and
`IdleQuestionnaire` differs by message kind. Stories file is 171 lines and
80% of it is JSX boilerplate spelling out `onAction={(): void => undefined}`,
`blocking={false}`, etc.
**Suggested change:** Extract a `defaults` constant `{ sender, onAction:
() => undefined, state: { phase: "idle" } }` and spread it at each call
site. Cosmetic — stories file size is not a correctness issue, but copy-paste
JSX is the slop the skill targets.

### S10. `mockArtifact` in stories simulates an ArtifactView shell on the production-styled page
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.stories.tsx:64-72`
**What:** A `<div data-component="ArtifactView" data-shape="text_diff" ...>`
fake. This is fine in a story — but it duplicates the audit attributes the
real ArtifactView ships with, so a future selector test that tries to count
"how many ArtifactView mount" against the design-system route will hit this
mock too.
**Suggested change:** Add `data-mock="true"` so audits can exclude. Story-only
risk; not a merge blocker.

### S11. `[idx === 0 ? "primary" : "ghost"]` heuristic is undocumented spec divergence
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.tsx:436` and the duplicate at `/workspace/.worktrees/L11/packages/design-system/src/ThreadShell.tsx:191-194`
**What:** "First answer option is primary, rest are ghost" — there is no plan
or approved.md cite for this. It happens to render OK for "Yes / No" but
gives a false visual hierarchy on neutral-choice questionnaires (e.g. picking
a segment). For multi-option questionnaires, no answer is preferred —
all-ghost is the honest design.
**Suggested change:** Replace with all-ghost: drop the `idx === 0` ternary in
both files. If a "preferred" answer ever becomes spec-required, surface it
explicitly on the payload (`payload.preferredOption`).

### S12. `data-promoted="true"` on the live card has no consumer
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.tsx:502`
**What:** Only the live (non-resolved, non-redacted) branch sets
`data-promoted="true"`. Plan §3 verification queries don't read it; tests
filter by `data-state` and `data-message-id`. Either every variant should
carry it (with the value flipping false for resolved) or none should.
**Suggested change:** Drop the attr. If the AC-1 verification query later
needs "is this card the promoted one", `data-message-id === promotedId` from
the consumer is the honest test.

### S13. `RichMessageCard` reads `ChevronDown` as an inlined component when one exists
**Location:** `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.tsx:191-208`
**What:** A bespoke ChevronDown SVG inside the card. Grep across the repo:
several other components inline their own chevrons too (Composer,
ThreadHostBanner). This is pre-existing and not introduced by L11, so flagged
for retro / track-K cleanup only.
**Suggested change:** Out of scope for L11. Track-K candidate.

---

## VERDICT

**REVISE.** One critical issue (S1: production-path mock data + empty
`<img src="">` slot risk) blocks merge. The remaining warnings (S2–S8)
describe code-narrating comments, lying doc-comments, unsafe `as` casts,
half-built decoder theatre, duplicated verdict-vocabulary helpers, and
committed audit cruft. Each is small individually; together they signal
the implementation accreted the surface area of "the proper version" without
actually doing the proper version.

S1 + S5 + S6 are the highest-leverage fixes — together they delete ~70 lines
across two files and remove a real user-visible self-request risk.

After step 7's C1+C2 and this scan's S1, the L11 PR is on track for ~150-200
lines of net deletion in the consumer pages. That's the right shape for a
"remove abstractions" story.

Files referenced (absolute):
- `/workspace/.worktrees/L11/packages/web/src/pages/ConversationsReview.tsx`
- `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.tsx`
- `/workspace/.worktrees/L11/packages/design-system/src/ThreadShell.tsx`
- `/workspace/.worktrees/L11/packages/design-system/src/CommentRow.tsx`
- `/workspace/.worktrees/L11/packages/web/src/shell/ArtifactView.tsx`
- `/workspace/.worktrees/L11/packages/design-system/src/RichMessageCard.stories.tsx`
