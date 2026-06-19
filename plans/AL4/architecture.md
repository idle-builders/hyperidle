# AL4 — Architecture: Inline anchored review comments

DESIGN-CLASS: routine-low-conf. Build target is the approved design in `plans/AL4/design/approved.md` and the locked concept in `plans/AL4/concept.md`.

---

## 1. Required reading

| File | Why read it |
|---|---|
| `.pipeline/work-packages/TRACK-AL.md` §AL4 | Canonical ACs, validation scenarios, constraints, scope rules. |
| `plans/AL4/concept.md` | Locked nouns: `AnchorRef`, `AnchorTarget`, `Anchored Comment`. Hard rules (block identity, one global Thread, verdict neutrality). |
| `plans/AL4/design/approved.md` | Interaction grammar, hover/trigger/compose spec, visual treatment, orphan state, motion, accessibility. |
| `docs/human-interface-layer/review-primitive.md` | Review canvas registry / family-floor contract. |
| `docs/human-interface-layer/thread-primitive.md` | Thread / Message model, message types, verdict semantics, payload immutability. |
| `docs/blocks/canonical-shapes.md` | `BlockId`, `deriveBlocks`, content-following identity. |
| `docs/blocks/composition.md` | Difference between block anchors (`payload.blockId`) and block refs (`refs[].kind==="block"`). |
| `packages/shared/src/thread.ts` | `PlainPayloadWithBlockId`, `InlineRef`, `BlockRef`, message discriminant. |
| `packages/shared/src/blocks/types.ts`, `block-id.ts` | `BlockId` brand, `BlockKind`, `blockId()` primitive. |
| `packages/web/src/pages/review/review-composition.ts` | `ComposedReviewSubject`, `ReviewComment`, `ReviewCommentRef`, `ReviewCompositionProps`. |
| `packages/web/src/pages/review/review-composition.fixture.ts` | Canonical subject + conversation fixture. |
| `packages/web/src/pages/review/ReviewComposition.tsx` | Presentational surface (frame, pane, conversation, no-op composer). |
| `packages/web/src/pages/review/ReviewPage.tsx` | Route wrapper with `loader` prop / `defaultLoader`. |
| `packages/web/src/pages/review/review-artifact.ts` | `ReviewCanvasProps`, canvas kind union. |
| `packages/web/src/pages/review/ReviewCodeDiff.tsx` | Code canvas where most inline comments will land. |
| `packages/web/src/pages/review/ReviewRenderedInContext.tsx` | Prose canvas that can be block-anchored. |
| `packages/web/src/services/host-threads.ts` | `postPlainHostMessage` — supports `blockId`, no `spotLabel`/artifact-ref. |
| `packages/design-system/src/CommentRow.tsx`, `Composer.tsx` | Reusable comment row + composer. |
| `packages/server/src/routes/threads.ts` | `POST /api/threads/:id/messages` dual-writes `blockId`; mention resolution. |
| `packages/server/src/routes/threads-schema.ts` | `plainPayloadSchema` — currently strips unknown keys. |
| `packages/server/src/routes/reviews.ts` | AL3 scaffold endpoint; fixture has empty `artifacts`/`conversation`. |

---

## 2. Plan reconciliation: spec ⇆ codebase

| Spec assumption | What the code actually does | Plan adjustment |
|---|---|---|
| Anchored comments post to the review Thread. | `ReviewComposition` conversation + composer are presentational no-ops; `onSubmitVerdict` is the only callback. | Add `onPostComment`, `threadId` props to `ReviewComposition`; wire `ReviewPage` to `host-threads.ts`. |
| Each anchored comment carries block identity + artifact scope. | `ReviewCommentRef` only has `kind` + `label`; `ReviewComment` has no anchor field. | Add `AnchorRef` and optional `anchor` to `ReviewComment`; enrich `ReviewCommentRef`. |
| Code-diff canvas can create anchored comments. | `ReviewCodeDiff` gutter `+` button is a no-op comment. | Wire the button to an inline composer + `onAddAnchor`. |
| Server persists the anchor. | `PlainPayloadWithBlockId` has `blockId` but no `spotLabel`; `host-threads.ts` posts only `text` + `blockId`; Zod strips unknown payload fields. | Add optional `spotLabel` to `PlainPayloadWithBlockId` and to server `plainPayloadSchema`; post artifact-ref + `spotLabel`. |
| One global Thread per Review. | `HostKind` has no `review` value. | Review thread attaches to the work item being reviewed (`task` → `taskId`; fallback `bet` → `betId`). Flag as a known concept-follow-up if reviews become first-class hosts. |
| Subject-level verdict unchanged. | `ReviewComposition` verdict buttons already call `onSubmitVerdict` only. | Preserve exactly; AL4 adds no per-artifact verdict. |
| Family canvases render artifacts. | Existing canvas components only receive `artifact`. | Pass anchor context via React context so only interested canvases consume it; no breaking prop change for AL2 canvases. |

---

## 3. Acceptance criteria

Copied from `TRACK-AL.md` §AL4.

| # | Acceptance criterion | Verification method | Test file |
|---|---|---|---|
| 1 | A reviewer can anchor a comment to a specific line, paragraph, block, or region of the artifact under review. | Component test: hover a code-diff line, click gutter `+`, type in inline composer, submit; assert `onAddAnchor` called with `artifactId`, `blockId`, and `spotLabel`. | `packages/web/src/pages/review/__tests__/ReviewCodeDiff.anchored.test.tsx` |
| 2 | Anchored comments render at their anchor point and support threaded replies. | Component test: render `ReviewCodeDiff` with anchored comments in `ReviewCanvasContext`; assert comment row appears directly after target line and a reply composer posts another message with the same anchor. | `packages/web/src/pages/review/__tests__/ReviewCodeDiff.anchored.test.tsx` |
| 3 | Anchors bind to content (block identity), not coordinates — a comment survives edits to surrounding content rather than orphaning. | Component test: derive line blockIds, change surrounding lines but keep target line content/hunk, re-render with same anchor; assert the comment is still attached (not in orphan state). | `packages/web/src/pages/review/__tests__/ReviewCodeDiff.anchored.test.tsx` |
| 4 | Anchoring works across at least code diffs and prose/block content. | Component test for code diff (above) + prose test: derive blocks from `RenderedInContextPayload.body`, hover block handle, submit; assert anchor uses derived `blockId`. | `packages/web/src/pages/review/__tests__/ReviewRenderedInContext.anchored.test.tsx` (new) |
| 5 | The Subject-level verdict flow is unaffected — a review with anchored comments still resolves via one verdict. | Component test: render `ReviewComposition` with anchored conversation, click **Approve**; assert `onSubmitVerdict` called once with `"approve"` and no secondary verdict UI. | `packages/web/src/pages/review/__tests__/ReviewComposition.anchored.test.tsx` |

Static verification: `npm run check` (types), `npm run lint`, `npm run test`.

---

## 4. Ordered task list

1. **Red tests — anchored comment creation (code diff).** `ReviewCodeDiff.anchored.test.tsx`: assert line blockIds, gutter trigger, inline composer, `onAddAnchor` shape, orphan handling.
2. **Red tests — anchored comments on prose.** `ReviewRenderedInContext.anchored.test.tsx`: block derivation from body, anchor creation, resolution.
3. **Red tests — composition integrity.** `ReviewComposition.anchored.test.tsx`: global-thread anchor chip, pane jump, verdict still posts.
4. **Shared + server schemas.** Add `AnchorRef`, extend `PlainPayloadWithBlockId` with `spotLabel?`; update `threads-schema.ts` to accept + read back `spotLabel`; cap `blockId`/`spotLabel` lengths.
5. **Review type layer.** Update `review-composition.ts` (`AnchorRef`, `ReviewComment.anchor`, `ReviewCommentRef`, `ReviewCompositionProps`); update `review-artifact.ts` `ReviewCanvasProps` type via context (no breaking change).
6. **Anchor helpers + context.** New `review-canvas.ts`: block-id helpers for code lines and prose blocks, `ReviewCanvasContext` provider, `useReviewAnchors` hook, `InlineComposer` wrapper.
7. **Update fixture.** Add line blockIds to code artifact and at least one anchored comment + one prose anchor in `review-composition.fixture.ts`.
8. **Update `ReviewCodeDiff.tsx`.** Compute line blockIds, wire gutter `+`, render inline composer & anchored thread cards, resolve/unorphan via block identity.
9. **Update `ReviewRenderedInContext.tsx`.** Derive blocks from `body`, render block-hover handle, support anchor creation.
10. **Update `ReviewComposition.tsx`.** Wrap panes in `ReviewCanvasContext`, render global-thread anchor chips with jump+highlight, wire reply composer to `onPostComment`.
11. **Update `ReviewPage.tsx` + `host-threads.ts`.** Resolve/create review thread via `useHostThread`; map messages → `ReviewComment`s; pass `onPostComment` that posts `{ text, blockId, spotLabel, refs: [{ kind: "artifact", id: artifactId }] }`.
12. **Ground-truth doc update.** Adjust `docs/human-interface-layer/review-primitive.md` to describe anchored comments instead of the reference-chip placeholder.
13. **Green + verify.** Run `npm run check`, `npm run lint`, `npm run test`, `npm run test:integration`, fix failures.
14. **Visual verification.** Open design-system story `Review Anchored Comment` and `Review/Composition` storybook entry; confirm hover, composer, thread card, orphan states render per approved.md.

---

## 5. Type signatures / schemas

### 5.1 Shared — `packages/shared/src/thread.ts`

```ts
import type { BlockId } from "./blocks/types.js";

export interface AnchorRef {
  readonly artifactId: string;
  readonly blockId: BlockId;
  readonly spotLabel?: string;
}

// Extend the L18 scaffolding:
export interface PlainPayloadWithBlockId {
  readonly text: string;
  readonly refs?: ReadonlyArray<InlineRef>;
  readonly blockId?: string;
  readonly spotLabel?: string; // human-readable sub-block label; opaque to the server
}
```

Rationale: the wire shape stays minimal. `artifactId` is carried by an `InlineRef` of kind `"artifact"` in `refs[]`; `blockId` and `spotLabel` ride on the payload. This matches the approved design’s “reuse `PlainPayloadWithBlockId` + refs[] artifact label.”

### 5.2 Web review domain — `packages/web/src/pages/review/review-composition.ts`

```ts
import type { AnchorRef } from "@hyperidle/shared";

export interface ReviewCommentRef {
  readonly kind: "artifact" | "line" | "block";
  readonly label: string;
  readonly artifactId?: string;
  readonly blockId?: string;
  readonly spotLabel?: string;
}

export interface ReviewComment {
  readonly id: string;
  readonly author: string;
  readonly authorIsAgent: boolean;
  readonly body: string;
  readonly ago: string;
  readonly refs?: ReadonlyArray<ReviewCommentRef>;
  readonly anchor?: AnchorRef;
}

export interface ReviewCompositionProps {
  readonly subject: ComposedReviewSubject;
  readonly onSubmitVerdict: (decision: VerdictDecision, note?: string) => void | Promise<void>;
  readonly onOpenSourceLink?: (href: string) => void;
  readonly onPostComment?: (input: { text: string; anchor?: AnchorRef }) => Promise<void>;
  readonly threadId?: string;
  readonly initialOpenArtifactId?: string | null;
  readonly resolved?: boolean;
}
```

### 5.3 Web canvas context — `packages/web/src/pages/review/review-canvas.ts`

```ts
export interface ReviewCanvasContextValue {
  readonly anchors: ReadonlyArray<ReviewComment>;
  readonly readOnly: boolean;
  readonly onAddAnchor: (input: { artifactId: string; blockId: BlockId; spotLabel?: string; text: string }) => Promise<void>;
  readonly onJumpToAnchor: (anchor: AnchorRef) => void;
}

export function lineBlockId(
  artifactId: string,
  filePath: string,
  hunkIndex: number,
  line: CodeDiffLine,
): BlockId;

export function deriveProseBlocks(
  artifactId: string,
  body: string,
): { blocks: ReadonlyArray<Block>; text: string };

export function useReviewAnchors(): ReviewCanvasContextValue;
```

The context keeps the existing `ReviewCanvasComponent` type unchanged. Only canvases that support anchoring (`ReviewCodeDiff`, `ReviewRenderedInContext`) opt-in via `useReviewAnchors`.

### 5.4 Server schema — `packages/server/src/routes/threads-schema.ts`

```ts
const plainPayloadSchema = z.object({
  text: z.string().max(16_384),
  refs: z.array(inlineRefSchema).optional(),
  blockId: z.string().max(128).optional(),
  spotLabel: z.string().max(128).optional(), // AL4
});

export const plainPayloadSchemaWithToolCalls = plainPayloadSchema.extend({
  toolCalls: z.array(toolCallSummarySchema).optional(),
  notice: assistantNoticeSchema.optional(),
});
```

No DB migration: `messages.payload` is JSON; `messages.blockId` structured column already exists. The read-back schema must include `spotLabel` so older-missing values are tolerated and newly-written values survive round-trip.

### 5.5 Service — `packages/web/src/services/host-threads.ts`

Extend `postPlainHostMessage` (or add `postAnchoredComment`) to accept:

```ts
export interface AnchoredCommentInput {
  threadId: string;
  text: string;
  clientKey: string;
  artifactId: string;
  blockId: string;
  spotLabel?: string;
}
```

Wire it as `POST /api/threads/:id/messages` with `type: "plain"`, payload containing `text`, `blockId`, `spotLabel`, and `refs: [{ kind: "artifact", id: artifactId }]`.

---

## 6. File-by-file plan

### `packages/web/src/pages/review/review-composition.ts`
- Add `AnchorRef` import + enrich `ReviewComment`/`ReviewCommentRef`.
- Add optional `onPostComment` and `threadId` to `ReviewCompositionProps`.
- Keep existing fields so `ReviewComposition.test.tsx` still compiles without changes.

### `packages/web/src/pages/review/review-composition.fixture.ts`
- Import `lineBlockId` (or duplicate the helper temporarily) to compute real `blockId`s for the code artifact lines.
- Add one anchored comment on `PromoField.tsx:118` with `artifactId: "artifact:code:1"`, generated `blockId`, `spotLabel: "PromoField.tsx:118"`.
- Add one prose anchored comment on `rendered_in_context` body (derive its first paragraph block).

### New `packages/web/src/pages/review/review-canvas.ts`
- `lineBlockId`: build a `BlockPayload` of kind `"code"` (lang from file extension, text = line text) and hash via `blockId({ kind: "code", outlinePath: "${filePath}#hunk${hunkIndex}", normalisedPayload })`.
- `deriveProseBlocks`: call `deriveBlocks(body, { kind: "artifact", id: artifactId })`.
- `ReviewCanvasContext`, `ReviewCanvasProvider`, `useReviewAnchors`.
- `InlineComposer`: small wrapper around design-system `Composer` (pass a static `threadId="inline"`, transform submit to `(text) => onAddAnchor({ ..., text })`); render optional `spotLabel` chip.
- `AnchoredThreadCard`: top comment `CommentRow` with `inlineAnchor`, replies stacked without sender header, optional reply composer.

### `packages/web/src/pages/review/ReviewCodeDiff.tsx`
- In `mapCodeDiffPayload`, pass `artifactId` into line construction so lines carry `blockId`.
- Enrich `DiffLine` with `blockId: BlockId` and `spotLabel: string` (e.g., `${filePath}:${newNo ?? oldNo ?? "new"}`).
- Wire gutter `+` button to open inline composer for that line.
- Render `AnchoredThreadCard`s after lines whose `blockId` matches an anchor in context.
- Orphan state: when an anchor has no matching line, render a muted card not attached to a line (or at the file header with `source changed` badge).
- `readOnly` from context hides all `+` buttons and reply composers.

### `packages/web/src/pages/review/ReviewRenderedInContext.tsx`
- Derive blocks from `payload.body` if it is a string.
- Wrap body render with blocks; each paragraph/heading block gets a hover handle + “Comment on this block” action.
- Inline composer opens below the selected block.
- Render anchored comment cards adjacent to resolved blocks.
- If `body` is absent or empty, render without anchor support (graceful degradation).

### `packages/web/src/pages/review/ReviewComposition.tsx`
- In `ExaminePane`, wrap `<Canvas />` with `<ReviewCanvasContext.Provider value={{ anchors, readOnly: resolved, onAddAnchor, onJumpToAnchor }}>`.
- `anchors` = `subject.conversation` filtered to entries whose `anchor?.artifactId === activeArtifact.id`.
- `onAddAnchor` = if `onPostComment` provided, call it and optimistically rely on parent re-render; otherwise no-op.
- `onJumpToAnchor` = open the artifact (if not active), then scroll + pulse the target line/block.
- Update `CommentItem` to render chip from `comment.anchor.spotLabel` or enriched `refs`; on click call `onJumpToAnchor`.
- Replace the no-op global `<Composer />` with the design-system `Composer` wired to `onPostComment` (no anchor).

### `packages/web/src/pages/review/ReviewPage.tsx`
- Load subject via `loader` (unchanged).
- `useHostThread(hostKind: subject.taskId ? "task" : "bet", hostId: subject.taskId ?? subject.betId)`.
- Map `messages` → `ReviewComment`:
  - author / `authorIsAgent` from `identities`.
  - `ago` from `message.createdAt` via `clockTime` or relative formatter.
  - `anchor` extracted from `message.payload.blockId` + spotLabel + first `refs` entry of kind `"artifact"`.
- Implement `onPostComment`:
  - For anchored: call `postPlainHostMessage` (or new helper) with `blockId`, `spotLabel`, artifact ref.
  - For unanchored: call `postPlainHostMessage` with only text.
  - After resolve, call `refresh()`.
- Pass `threadId`, `conversation`, `onPostComment`, `onSubmitVerdict` to `ReviewComposition`.
- Keep `loader` prop for tests.

### `packages/web/src/services/host-threads.ts`
- Add `postAnchoredComment` (or overload `postPlainHostMessage`) that constructs the artifact ref and spotLabel payload.
- Keep existing `postPlainHostMessage` signature unchanged for current callers.

### `packages/server/src/routes/threads-schema.ts`
- Add `spotLabel: z.string().max(128).optional()` to `plainPayloadSchema` and `plainPayloadSchemaWithToolCalls`.
- Optionally add `max(128)` to `blockId` for defense-in-depth.

### `docs/human-interface-layer/review-primitive.md`
- Replace the reference-chip placeholder line with the content-following anchored comment contract.
- Add one-line pointer to `AnchorRef` definition.

---

## 7. Route / API checklist

No new routes. All existing:

| Method / path | Reused for | Files that touch it |
|---|---|---|
| `GET /api/reviews/:reviewId` | Load review Subject for `ReviewPage.defaultLoader`. | `packages/server/src/routes/reviews.ts`, `packages/web/src/pages/review/ReviewPage.tsx` |
| `GET /api/threads?host_kind=...&host_id=...` | Resolve the review thread. | `packages/web/src/hooks/useHostThread.ts` |
| `GET /api/threads/:id` | Fetch thread + messages. | `packages/web/src/hooks/useHostThread.ts` |
| `GET /api/threads/:id?block_id=...` | Existing block-filter, not required for AL4 composition but available. | `packages/server/src/routes/threads.ts` |
| `POST /api/threads/:id/messages` | Post anchored plain messages and unanchored replies. | `packages/server/src/routes/threads.ts`, `packages/web/src/services/host-threads.ts` |

---

## 8. Security & abuse cases

| Case | Risk | Mitigation |
|---|---|---|
| Client forges sender | Participant-only write enforced by `authorizeWrite` using `c.get("userId")`. | No change; rely on existing AF11 guard. |
| Spam / oversized anchor metadata | `blockId`/`spotLabel` can grow arbitrarily. | Add Zod `max(128)` to both in `threads-schema.ts`. |
| Malicious `spotLabel` rendered as HTML | `CommentRow` renders `inlineAnchor` as plain text (no `dangerouslySetInnerHTML`). | Ensure label is always escaped/text-rendered. |
| Anchor to non-existent block / artifact | Server treats `blockId` as opaque; orphan state renders muted card. | No exploit surface; UI must degrade gracefully. |
| One participant overwhelms thread with anchors | Same as any message flood; no new rate limit introduced in this WP. | Existing user/team boundaries apply; consider per-thread rate limit in follow-up if needed. |
| Coordinate-based anchoring | Rejected by concept hard rule; no `x/y/offset` persisted. | Code review must ensure no pixel/line-number coordinate enters `AnchorRef`. |
| Verdict bypass | Anchored comments are plain messages; verdict authorization unchanged. | `threads.ts` founder-only verdict guard remains the only resolver. |
| Resolved review bypass | New anchor affordance must be hidden when review is resolved. | `readOnly` from context disables gutter `+` and reply composers. |

---

## 9. protectedTests

Assertions in these existing tests must stay green after AL4 changes:

- `packages/web/src/pages/review/__tests__/ReviewComposition.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewPage.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewCodeDiff.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewActionOperation.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewBatch.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewBrowserPreview.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewFieldChangeSet.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewMetricsMoved.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewOutcomeSummary.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewRenderedInContext.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewVisualDiff.test.tsx`
- `packages/web/src/pages/review/__tests__/ReviewUnknownCanvas.test.tsx`
- `packages/web/src/pages/review/__tests__/canvas-registry.test.ts`
- `packages/web/src/pages/review/__tests__/source-link-guard.test.ts`

New tests authored during implementation should not replace these files.

---

## 10. sharedFiles

Files that cross workpackage boundaries and may conflict with concurrent branches:

- `packages/shared/src/thread.ts` — adds `AnchorRef` and extends `PlainPayloadWithBlockId`.
- `packages/server/src/routes/threads-schema.ts` — widens `plainPayloadSchema`/`plainPayloadSchemaWithToolCalls`.
- `packages/server/src/routes/threads.ts` — possible blockId length guard addition; otherwise untouched.
- `packages/web/src/pages/review/review-artifact.ts` — new canvas context keeps type surface backward-compatible, but type file changes.
- `packages/web/src/pages/review/review-composition.ts` — core `ReviewComment` / props shape.
- `packages/web/src/pages/review/review-composition.fixture.ts` — shared fixture data.
- `packages/web/src/services/host-threads.ts` — new helper for anchored comments.
- `packages/web/src/pages/review/ReviewPage.tsx` — host thread integration; loader prop preserved.
- `docs/human-interface-layer/review-primitive.md` — ground-truth update.

---

## 11. Risks or ambiguities

1. **Missing `review` host kind.** `HostKind` is `bet | task | knowledge_item | artifact | agent | user | team | factory`. A review is not a host. AL4 will attach the review thread to `task` (if `subject.taskId`) else `bet`. If multiple reviews exist for the same work item they will share one thread, which may or may not match the AL1 “one global Thread per Subject” semantics. Follow-up concept act if a dedicated `review` host kind is required.

2. **Synthetic block IDs for diff lines.** Code-diff lines are not markdown. Line blockIds will be derived from a synthetic `outlinePath` (`filePath#hunkIndex`) and a `code` payload of the line text. Surrounding edits that move the line into a different hunk or file rename will orphan the anchor; edits that insert/delete nearby lines but keep the hunk envelope will not. This is acceptable for the current iteration but should be treated as technical debt if code review becomes a long-term canvas.

3. **Prose anchoring requires a textual body.** `ReviewRenderedInContext` will derive blocks from `payload.body`; artifacts without a parseable body (metrics, visual diff, action operation) cannot be prose-anchored without additional canvas-specific design. This satisfies AC4 (“at least code diffs and prose/block content”) but leaves other families for follow-up work.

4. **Schema widening.** Adding `spotLabel` to the read-back Zod schema is safe because it is `optional`, so pre-existing messages without it remain valid. However, any concurrent workpackage writing its own plain-payload validation must be made aware of the new optional field.

5. **Visual verification dependency.** The inline composer and anchored thread card styling rely on the design-system `Composer` and `CommentRow`; if those components change, the AL4 visual output will change. Keep the `ReviewAnchoredComment.stories.tsx` story exercised.
