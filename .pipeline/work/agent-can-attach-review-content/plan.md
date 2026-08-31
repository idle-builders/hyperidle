# An agent can attach review content

## Two independent breaks

**Zero-overlap vocabularies.** `create_artifact` produces one of six consolidated `ARTIFACT_KINDS`
(`text`, `code`, `image`, `data`, `html`, `url`), but `submit_review`'s `artifactRef.kind` and the
matching write-arm schema validated against a *different*, pre-consolidation vocabulary —
`ARTIFACT_VIEW_SHAPES` (`text_diff`, `content_preview`, `visual_comparison`, `action_summary`,
`data_metrics`). The intersection is **empty**, so any agent that referenced an artifact it had
actually created was rejected on every call with 400 `INVALID_INPUT`. `ARTIFACT_VIEW_SHAPES` was a
review-embed rendering sub-vocabulary the artifact-kind consolidation (AE6/AM5) retired when the
primitive collapsed to six kinds; the review side was never updated.

**A valid reference was never resolved.** `GET /api/reviews/:reviewMessageId`, on the
no-proposed-call branch — every review this package writes — returned `{ ...reviewPayload }`
verbatim and never read `artifactRef`. A correctly shaped reference to a real artifact wrote, and
never read back into anything the UI could render.

**The silent-drop hazard that hid both.** `submit_review` falls back silently: if neither
`artifactRef` nor `artifacts` produced a `type:"review"` message — schema rejected them, or the
array was dropped as an undeclared zod field — the call still succeeds by writing a `type:"plain"`
message, and `result.success` is `true` either way. **A test asserting only on the return value
cannot tell "created a review with evidence attached" from "silently threw the evidence away."**
Every test here that matters asserts on the persisted row.

## The fix

1. **The write arm speaks the consolidated vocabulary.** Both copies of `artifactRefSchema` validate
   `kind` against `z.enum(ARTIFACT_KINDS).optional()`, refusing a retired value on write.
2. **The read arm stays tolerant.** `threads-schema.ts` splits into a WRITE schema (strict
   `ARTIFACT_KINDS`) and a READ schema `reviewPayloadSchemaRow` (`z.string().optional()` on `kind`),
   the split `plainPayloadSchemaWithToolCalls` already establishes for `toolCalls`. **Without it,
   one row written before this change takes out the whole thread** on `GET /api/threads/:id`.
   `ArtifactRef.kind` widens to `kind?: string`: a reader never trusts it, so a closed union buys
   none.
3. **The loader resolves the reference.** `routes/reviews.ts` reads `reviewPayload.artifactRef.id`
   and resolves it through `work.get(db, "artifact", id)` — the lookup the proposed-call branch
   already performs — then **appends** to whatever `artifacts` the payload carries, never replacing
   and never defaulting into an empty list. The resolved `kind` comes from the stored row.
4. **A resolved entry must be renderable, not merely present.** `ReviewArtifact` requires `tool`,
   `app`, `title` and `payload` with no optionality, because the review UI renders each through
   `ToolLogo`/`KindBadge`/a canvas unconditionally — omitting any **crashes the page** (`ToolLogo`'s
   `tool.slice(0, 1)` on `undefined`), it does not merely look incomplete. `tool`/`app` use the
   `"hyperidle"` self-attributed sentinel the fixtures already use for native evidence rather than
   fabricating a false external identity; `title` falls back to the artifact id.
5. **The canvas-envelope channel.** `submit_review` gains `artifacts?: ReviewCanvasArtifact[]`, so
   an agent can attach evidence with no `create_artifact` producer at all. Each entry validates
   structurally, `kind` against the nine `REVIEW_CANVAS_KINDS` — **a different vocabulary on a
   different axis** from `ARTIFACT_KINDS`: how a review renders its evidence, versus what an
   artifact is. `payload` is deliberately opaque; one malformed for its kind is found at render time
   by the per-canvas fallback. The branch condition becomes `if (input.artifactRef ||
   input.artifacts?.length)`, so a canvas-only review is a review.
6. **Artifact ownership.** Before attaching a stored `artifactRef`, `submit_review` confirms the
   artifact exists and that `artifact.producingTaskId === ctx.taskId`, the binding `create_artifact`
   already enforces on write. **A review may not claim proof it did not produce.** Backed by a new
   `CoreApiPort.work.getArtifactById` seam over the existing `GET /artifacts/:id`.

**The migration this forced, which the first version of this plan denied.** Widening
`ReviewPayload.artifactRef` and `ArtifactRef.kind` broke three core-ui call sites assuming both were
always present; they now render nothing for the `undefined` case. That compile fix was not the whole
story: `part.ts`'s `ARTIFACT_KIND_LABEL` and its `artifactRefToEmbed` diff check still recognised
only the five retired values, so once the write arm emitted the six consolidated kinds, **every new
review chip fell through to the generic "Artifact" label and the diff embed became unreachable** — a
real behaviour change the respell caused, not the "no behaviour change" this plan originally
claimed. The fix adds the six current entries **alongside**, not replacing, the retired ones. No
data migration touches a persisted row, so **a legacy `text_diff` value must render forever.**

**Out of scope, left to sibling work from the same source branch.** Thread anchoring —
`submit_review` still posts to the **bet's** host thread, not the task's — is a separate
founder-ruling-driven change, as are `clearsRuleId` / `attachClearanceToReview` / `adjudicateAction`
and the knowledge merge/split/sweep removals bundled into the same branch. `REVIEW_CANVAS_KINDS` is
also **not** unified with core-ui's identical `ReviewCanvasKind`: the two duplicate one nine-value
list, kept in sync by hand with a `@lore` at core-ui's copy, because leaving it alone keeps this
change inside `core-api`, `agent-orchestration` and `domain-model`.

No database migration — `artifactRef` and `artifacts` live inside the existing `messages.payload`
column.

## How the tests were proven sensitive

Each of the four repairs was broken deliberately, watched go red, and restored byte-identically,
with `diff` showing zero residual change:

- Removing the `artifacts` line from the write-arm schema reintroduced the silent drop, reddening
  the envelope test with `expected undefined to deeply equal [...]`.
- Reverting the resolved entry to its pre-fix four-field shape reddened 3 of 4 loader tests on
  `typeof row.tool`, the under-shaped entry the original bug produced.
- Rewriting the new `ReviewComposition` test to build its fixture from that four-field shape
  reproduced the crash a real reviewer session hit: `TypeError: Cannot read properties of undefined
  (reading 'slice')` at `ToolLogo.tsx:84`. It asserts against a hand-built literal, proving the
  render path is sensitive to the regression class; the loader full-shape assertions prove
  `reviews.ts` emits it.
- Collapsing `reviewPayloadSchemaRow` back onto the strict write schema reddened the read-arm test
  with `expected 500 to be 200`, the whole-thread outage the split exists to prevent.

The loader test also seeds a stored kind (`"text"`) different from the payload's (`"html"`) and
asserts the resolved entry carries the real one, and covers the nonexistent-artifact no-fabrication
case. Six pre-existing fixtures carrying retired kinds were respelled — kind-only edits, no
assertion weakened — and the demo seeds move `visual_comparison`→`html` and `text_diff`→`code`.
