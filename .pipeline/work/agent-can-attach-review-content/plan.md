# An agent can attach review content

## Problem, proven against the real schema

Two independent breaks made it impossible for an agent to attach evidence to
a review it submits.

### 1. Zero-overlap vocabularies

`create_artifact` (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`,
before this change) produces artifacts of one of six consolidated kinds:

```
ARTIFACT_KINDS = ["text", "code", "image", "data", "html", "url"]
```
(`framework/domain-model/src/kinds/registry.ts`)

`submit_review`'s `artifactRef.kind` and the matching write-arm schema in
`layers/core-api/src/routes/threads-schema.ts` validated against a
*different*, pre-consolidation vocabulary:

```
ARTIFACT_VIEW_SHAPES = ["text_diff", "content_preview", "visual_comparison",
                         "action_summary", "data_metrics"]
```
(formerly `framework/domain-model/src/thread.ts`)

```
ARTIFACT_KINDS ∩ ARTIFACT_VIEW_SHAPES = ∅
```

Any agent that referenced an artifact it had actually created with
`create_artifact` — i.e. did the obvious thing — was rejected by
`submit_review`/`POST /api/threads/:id/messages` on every call, 400
`INVALID_INPUT`. `ARTIFACT_VIEW_SHAPES` was a review-embed rendering
sub-vocabulary a prior work package (artifact-kind consolidation, AE6/AM5)
retired when the primitive collapsed to six kinds — the review side of the
codebase was never updated and was left stranded pointing at values nothing
emits any more.

### 2. A valid reference was never resolved

`GET /api/reviews/:reviewMessageId` (`layers/core-api/src/routes/reviews.ts`),
on the branch with no proposed call (every review this package writes today),
did:

```ts
return c.json({ ...reviewPayload });
```

`reviewPayload` is the review message's own JSON payload, parsed verbatim.
Nothing on this path ever read `reviewPayload.artifactRef` — so even a
correctly-shaped, valid reference to a real artifact never surfaced as
anything the human review UI could render. The reference wrote, but never
read back into anything.

### Silent-drop hazard

`submit_review`'s handler falls back silently: if neither `artifactRef` nor
`artifacts` produced a `type:"review"` message (schema rejected them, or the
array was dropped by an undeclared zod field), the call still succeeds by
falling back to a `type:"plain"` message — `result.success` is `true` either
way. A test asserting only on the return value cannot tell "created a review
with the evidence attached" from "silently created a plain message and threw
the evidence away." Every test in this slice that matters asserts on the
persisted row (`db.select().from(messages)`), not on `result.success` alone.

## The fix

Narrowly scoped to the artifact-reference and canvas-envelope channel only —
no thread-anchoring change, no action-gate/clearance change (both belong to
sibling work extracted from the same source branch).

1. **Write arm speaks the consolidated vocabulary.** `artifactRefSchema` (both
   copies — `tool-definitions.ts`'s `submit_review` input schema, and
   `threads-schema.ts`'s `POST /api/threads/:id/messages` schema) now
   validates `kind` against `z.enum(ARTIFACT_KINDS).optional()`. A retired
   value (`"text_diff"` etc.) is refused on write; a consolidated one
   (`"text"`, `"code"`, ...) is accepted.

2. **Read arm stays tolerant.** `threads-schema.ts` splits into a WRITE schema
   (`reviewPayloadSchema`, strict `ARTIFACT_KINDS`) and a READ schema
   (`reviewPayloadSchemaRow`, `z.string().optional()` on `artifactRef.kind`) —
   the same split pattern `plainPayloadSchemaWithToolCalls` already
   establishes for `toolCalls`. A row written before this change, still
   carrying a retired kind, parses on `GET /api/threads/:id` instead of
   throwing `messageRowSchema.parse()` and taking out the whole thread.
   `ArtifactRef.kind` in `framework/domain-model/src/thread.ts` is widened
   from the deleted `ArtifactViewShape` to `kind?: string` — never trusted by
   a reader, so a closed union buys no safety.

3. **The loader resolves the reference.** `routes/reviews.ts`'s no-proposed-
   call branch now reads `reviewPayload.artifactRef.id`, resolves it through
   `work.get(db, "artifact", id)` — the exact same lookup the proposed-call
   branch two dozen lines below it already performs — and **appends** the
   resolved entry to whatever `artifacts` the payload already carries (never
   replacing, never defaulting into an empty list when none existed). The
   resolved entry's `kind` comes from the real stored row, never echoes the
   client-supplied `artifactRef.kind` — proven by
   `reviews-loader-artifact-channel.integration.test.ts` deliberately seeding
   a stored kind (`"text"`) different from the payload's own
   `artifactRef.kind` (`"html"`) and asserting the resolved entry carries the
   real one. `ReviewArtifact` (`layers/core-ui/src/pages/review/review-artifact.ts`)
   requires `tool`/`app`/`title`/`payload` on every entry with no optionality
   — the review UI renders every entry through `ToolLogo`/`KindBadge`/a
   canvas component unconditionally, so omitting any of them crashes the
   page (`ToolLogo`'s `tool.slice(0, 1)` on `undefined`), not just looks
   incomplete. `tool`/`app` use the same self-attributed sentinel the
   fixtures already use for HyperIdle-native evidence with no per-tool
   provenance (`"hyperidle"`/`"HyperIdle"`, see `review-subject.ts`'s
   `outcomeArtifact`) rather than fabricating a false external identity;
   `title` falls back to the artifact's own id when it has no `label`;
   `payload` is `{}` (opaque, matching the proposed-call branch's own
   convention); `sourceHref` is the artifact's own real permalink.

4. **The canvas-envelope channel.** `submit_review` gains `artifacts?:
   ReviewCanvasArtifact[]` — an agent can attach evidence directly with no
   `create_artifact` producer at all. Each entry validates structurally
   (`id`, `tool`, `app`, `sourceHref`, `title`, `kind` against the nine
   `REVIEW_CANVAS_KINDS` — a different, unrelated vocabulary living on a
   different axis from `ARTIFACT_KINDS`: "how a review renders its evidence"
   vs. "what an artifact fundamentally is"); `payload` is `z.record(string,
   unknown())` — deliberately opaque. A malformed payload for a given kind is
   discovered at render time by the existing per-canvas fallback, not
   rejected here. `submit_review`'s branch condition becomes `if
   (input.artifactRef || input.artifacts?.length)` — a canvas-only review (no
   stored artifact) is still a review, not the plain-message fallback.

5. **Artifact ownership check.** Before attaching a stored `artifactRef`,
   `submit_review` now confirms the artifact exists and that
   `artifact.producingTaskId === ctx.taskId` — the exact binding
   `create_artifact` itself already enforces on write. A review may not claim
   proof it did not produce. Backed by a new `CoreApiPort.work.getArtifactById`
   seam method (mirrors `getTaskById`/`getBetById`, over the pre-existing
   `GET /artifacts/:id` route — no new backend route needed).

### Explicitly out of scope (left to sibling work, same source branch)

- Thread anchoring (`submit_review` still posts to the **bet's** host thread,
  not the task's) — a separate founder-ruling-driven change.
- `clearsRuleId` / `attachClearanceToReview` / `adjudicateAction` — the team
  action-gate integration.
- `provisionTeamRoutines`, `mergeKnowledgeItem`/`splitKnowledgeItem`/
  `runKnowledgeSweep` removal — unrelated cleanups bundled into the same
  monolithic source branch; left untouched here.
- Unifying `REVIEW_CANVAS_KINDS` with core-ui's pre-existing, identical
  `ReviewCanvasKind` (`layers/core-ui/src/pages/review/review-artifact.ts`) —
  the two now duplicate the same nine-value list; leaving core-ui's copy
  alone keeps this change inside `core-api`/`agent-orchestration`/
  `domain-model` only.

### Incidental compile fix, and the vocabulary migration this made necessary

Widening `ReviewPayload.artifactRef` to optional and `ArtifactRef.kind` to
`string | undefined` broke three `layers/core-ui` call sites that assumed
both were always present (`part.ts`'s `artifactRefToEmbed`, `ThreadShell.tsx`'s
`artifactSlot` prop type, used at two call sites). Both functions now accept
the `| undefined` case and render nothing for it (`changeSet: Embed | null`
already existed as the return shape).

That fix alone was not the whole story: `part.ts`'s `ARTIFACT_KIND_LABEL` and
its `artifactRefToEmbed` diff check still only recognized the retired
`ARTIFACT_VIEW_SHAPES` five values (`text_diff`, ...). Once the write arm
stops emitting those and starts emitting the six consolidated `ARTIFACT_KINDS`
instead (`tools/setup/src/demo-world/conversations.ts`'s own seed data changes
`visual_comparison`→`html` and `text_diff`→`code`, twice), every NEW review
chip fell through to the generic "Artifact" label and the diff embed became
unreachable — a real behavior change this branch's respell caused, not
"no behavior change for any thread that still always carries `artifactRef`"
as originally (wrongly) claimed here. Fixed by adding the six current-vocabulary
entries to `ARTIFACT_KIND_LABEL` and widening the diff check to `"text_diff" ||
"code"`, alongside — not replacing — the retired entries: no data migration
touches an already-persisted row, so a legacy `text_diff` value must keep
rendering correctly forever. Covered by
`layers/core-ui/src/components/parts/__tests__/part.artifact-kind.test.ts`.

## Files changed

Production:
- `framework/domain-model/src/thread.ts`, `index.ts` — retire
  `ARTIFACT_VIEW_SHAPES`/`ArtifactViewShape`; add `REVIEW_CANVAS_KINDS`/
  `ReviewCanvasKind`/`ReviewCanvasArtifact`; widen `ArtifactRef.kind` and
  `ReviewPayload.artifactRef`; add `ReviewPayload.artifacts`.
- `layers/core-api/src/routes/threads-schema.ts` — write/read arm split.
- `layers/core-api/src/routes/reviews.ts` — loader resolves `artifactRef`
  (my hunk only — `threadId`/adjudicate-action/attach-clearance routes on
  this same file belong to sibling work, untouched).
- `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` —
  `submit_review`'s schema respell, `artifacts` field, ownership check (my
  hunk only — thread anchoring, `clearsRuleId`, human participant seeding on
  this same file belong to sibling work, untouched).
- `framework/api-contract/src/core-api-port.ts`, `index.ts` — `ArtifactView`,
  `CoreApiWorkPort.getArtifactById`.
- `layers/agent-orchestration/src/services/core-api-port-composition.ts`,
  `tool-handlers-bindings.ts`, `layers/agent-orchestration/tool-handlers/src/ports.ts`
  — `getArtifactById` seam wiring (`GET /artifacts/:id`, already existed).
- `tools/setup/src/demo-world/conversations.ts` — retired-kind
  `artifactRef` seeds respelled; four previously-unexercised review canvases
  (`action_operation`, `field_change_set`, `rendered_in_context`, `batch`)
  get real demo rows.
- `layers/core-ui/src/components/parts/part.ts`,
  `layers/core-ui/src/ds/ThreadShell.tsx` — incidental compile fix, plus the
  vocabulary-migration fix above (`ARTIFACT_KIND_LABEL`/diff check now cover
  both the retired and the current vocabulary).
- `layers/core-ui/src/pages/review/review-artifact.ts` — `@lore` pointing at
  `REVIEW_CANVAS_KINDS`'s new single-homed location (the two lists are kept
  in sync by hand, never unified, per layer boundary).
- `layers/agent-orchestration/tool-handlers/src/__tests__/stub-ports.ts` —
  `getArtifactById: notImplemented` stub entry.
- `docs/process-layer/artifact-primitive.md`,
  `docs/information-architecture/conversations-view.md` — corrected to
  describe the respell instead of citing the deleted `ARTIFACT_VIEW_SHAPES`
  as live.

Tests (new, extracted from the source branch):
- `layers/core-api/src/routes/__tests__/review-artifact-kind-write-arm.integration.test.ts`
  — write-arm coverage, plus the read-arm tolerance test the file originally
  (wrongly) cited as covered by a file that exists on neither this branch
  nor `origin/main`.
- `layers/core-api/src/routes/__tests__/review-artifacts-envelope-write-arm.integration.test.ts`
- `layers/core-api/src/routes/__tests__/reviews-loader-artifact-channel.integration.test.ts`
  — including the nonexistent-artifact no-fabrication case, and full-shape
  (`tool`/`app`/`payload` present, not just `id`) assertions on every
  resolved entry.
- `layers/agent-orchestration/tool-handlers/src/__tests__/submit-review-artifact-ref.integration.test.ts`
  — including a persisted-row assertion on the happy path (previously
  `result.success` only).
- `layers/agent-orchestration/tool-handlers/src/__tests__/submit-review-canvas-artifacts.integration.test.ts`
- `tools/setup/src/__tests__/demo-world-canvas-kinds.integration.test.ts`
- `layers/core-ui/src/pages/review/__tests__/ReviewComposition.test.tsx` —
  renders a resolved stored-artifact entry (the reviews loader's actual
  output shape) through the real `ArtifactRow`/`ToolLogo` render path, not a
  canvas component in isolation.
- `layers/core-ui/src/components/parts/__tests__/part.artifact-kind.test.ts`
  — `derivePartsFromMessages`'s `artifactRef.kind` → embed mapping across
  both the retired and current vocabularies.

Tests (pre-existing, incidental retired-kind fixture updates — legitimate,
since the write arm now rejects them; kind-only edits, no behavior
assertions weakened):
- `layers/core-api/src/__tests__/submit-review.integration.test.ts`
- `layers/core-api/src/__tests__/R5-agent-work-loop.integration.test.ts`
  (kind + artifact-seed row only; the file's thread-anchoring assertions,
  present in the source branch, were NOT carried — out of scope)
- `layers/core-api/src/__tests__/M3-threads-coach-auth.integration.test.ts`
- `layers/core-api/src/__tests__/api-e2e.integration.test.ts`
- `layers/core-api/src/__tests__/conversations.integration.test.ts`
- `layers/core-api/src/routes/__tests__/threads.routes.integration.test.ts`

No database migration: the fields involved (`artifactRef`, `artifacts`) live
inside the existing `messages.payload` JSON column, not a new schema column.

## Proof

- `npm run check` — 0 errors across all 39 packages.
- `npm run lint` — 0 errors (governance-lint, Biome, ESLint all pass; only
  pre-existing WARN-level findings unrelated to this change).
- `npm run test:integration:service` — 312 files / 2442 tests passed, 4
  skipped (unchanged skip count from before this change).
- Targeted new/updated tests (20 tests across 7 files) pass in isolation.
- `layers/core-ui` full component suite: 343 files / 3465 tests passed.
- **Break → red → revert → green, byte-identical:** removed the
  `artifacts: z.array(reviewCanvasArtifactSchema).optional()` line from the
  write-arm schema (reintroducing the silent-drop). Reran
  `review-artifacts-envelope-write-arm.integration.test.ts`: it reddened with
  `expected undefined to deeply equal [...]` against `body.artifacts` — the
  exact silent-drop failure mode this test exists to catch, not a
  weak-assertion false pass. Restored the file from a pre-edit backup and
  reran: green again, `git diff --stat` against the pre-break commit shows
  only the intended feature diff remains (no residual change).
- **B1 fix, break → red → revert → green, byte-identical (round 2 review
  fixes):** reverted `reviews.ts`'s resolved entry to the pre-fix
  `{id, kind, sourceHref, title?}` four-field shape. Reran
  `reviews-loader-artifact-channel.integration.test.ts`: 3 of 4 tests
  reddened on `expectRenderableArtifact`'s `typeof row.tool` assertion
  (`expected 'undefined' to be 'string'`) — the exact under-shaped entry
  the original bug produced. Restored the file: `diff` against the pre-break
  version showed zero residual difference, and all 4 tests passed again.
- **The new core-ui render test itself, mutation-tested:** temporarily
  rewrote `ReviewComposition.test.tsx`'s new test to build `resolvedArtifact`
  from the ORIGINAL pre-fix four-field shape (no `tool`/`app`/`payload`).
  Reran: it reddened with the exact crash a real reviewer session hit —
  `TypeError: Cannot read properties of undefined (reading 'slice')` at
  `ToolLogo.tsx:84`. Restored the test file: `diff` against the pre-mutation
  version showed zero residual difference, and the file's 12 tests passed
  again. This proves the new render test is sensitive to the regression
  class it exists to catch, not a coincidental pass — it directly
  reconstructs the crash the review found on a real render, though it
  asserts against a hand-built literal (not a live call into `reviews.ts`);
  the `reviews-loader-artifact-channel.integration.test.ts` full-shape
  assertions above are what proves `reviews.ts` itself always emits that
  shape.
- **B2 fix, break → red → revert → green, byte-identical:** collapsed
  `reviewPayloadSchemaRow` back onto the strict write-arm schema (removing
  the read-arm's `.optional() string` tolerance). Reran
  `review-artifact-kind-write-arm.integration.test.ts`: the new read-arm
  test reddened with `expected 500 to be 200` — a whole-thread
  `GET /threads/:id` outage for a message carrying a retired
  `artifactRef.kind`, exactly the outage the read-arm split exists to
  prevent. Restored the file: zero residual diff, all 3 tests passed again.
