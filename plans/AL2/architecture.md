# AL2 — Review proof-family canvases (architecture)

**Workpackage:** AL2 — build the 9 founder-approved review canvases + registry + a production review route that exercises them.  
**Inputs (locked, do not re-litigate):** `plans/AL1/concept.md`, `plans/AL1/design/approved.md`, `plans/AL1/design/tool-ecosystem-and-canvases.md`, `plans/AL1/design/components-brief.md`.  
**Status:** Pre-implementation plan. No code written yet.

---

## Required reading (the engineer must read before implementing)

- `.pipeline/work-packages/TRACK-AL.md` lines 52-87 — AL2 spec and acceptance criteria.
- `plans/AL1/design/approved.md` — locked visual/interaction contract (two layers, 3-tier canvas selection, rejection list).
- `plans/AL1/design/components-brief.md` — per-canvas L1/L2/L3 contract.
- `docs/process-layer/artifact-primitive.md` — shape of the `Artifact` primitive; kind is open vocabulary; preview determines renderer.
- Existing code:
  - `packages/design-system/src/kinds/renderer-registry.ts` + `fallback-renderer.tsx` — existing primitive renderer pattern (not reused directly, but the mental model is the same).
  - `packages/web/src/pages/review/*.{tsx,stories.tsx}` — the 9 prototype canvases.
  - `packages/web/src/router.tsx` — where the review route lands.

---

## Plan reconciliation: spec assumptions vs. actual codebase

| Spec assumption | Reality in `/Users/tg/hyperidle/.worktrees/AL1` | Plan handling |
|---|---|---|
| Thin per-kind renderers exist in `packages/design-system/src/kinds/`. | Confirmed: `renderer-registry.ts`, `code-renderer.tsx`, `data-renderer.tsx`, `text-renderer.tsx`, `image-renderer.tsx`, `html-renderer.tsx`, `url-renderer.tsx`, `fallback-renderer.tsx`. | Leave untouched. AL2 creates a *review canvas* registry in `packages/web/src/pages/review/`, separate from the primitive renderer registry. |
| Richer canvas prototypes exist in `packages/web/src/pages/review/`. | Confirmed: all 9 components + `ToolLogo` + `CanvasSourceHeader` + stories, no tests. | Refactor prototypes to consume a uniform `ReviewArtifact` prop; keep presentational internals and stories; add tests. |
| Each canvas accepts an artifact payload prop. | **False.** Prototypes are fixture-embedded. `ReviewCodeDiff` only exposes `initialExpandedPath`; others expose no props or a bespoke set (e.g., `ReviewOutcomeSummaryProps`). | Introduce `ReviewCanvasProps<TPayload>` and refactor every canvas to receive `artifact: ReviewArtifact<TPayload>`. Inline fixtures become typed payload fixtures. |
| A review-canvas registry maps `kind → component`. | **False.** Only the primitive `renderer-registry.ts` exists. | Create new `canvas-registry.ts` in `packages/web/src/pages/review/` mapping `ReviewCanvasKind` → component, with a fallback canvas for unknown kinds. |
| A shared `ReviewArtifact` type exists (`tool`, `app`, `sourceHref`, `title`, `kind`, `payload`). | **False.** `packages/shared/src/types/artifact.ts` defines the `Artifact` primitive with `id/producingTaskId/kind/label/preview/cost`. | Define `ReviewArtifact` locally in `packages/web/src/pages/review/review-artifact.ts` for AL2. Leave the primitive `Artifact` type unchanged. |
| A fallback canvas exists for unclassified artifacts. | **Partial.** `FallbackRenderer` exists for primitive previews, but there is no review-family fallback. | Create `ReviewUnknownCanvas.tsx` in `packages/web/src/pages/review/` — renders source header + safe JSON dump, never crashes/blank. |
| A `ReviewPage` exists at `/work/bet/:betId/review/:reviewId`. | **False.** `router.tsx` has no review route. | Add route and create `ReviewPage.tsx` that renders a fixture `ReviewSubject` through the registry so the canvases are mounted by the router. |
| Tests exist for the canvases. | **False.** No tests in `packages/web/src/pages/review/`. | Add `canvas-registry.test.ts` + one `*.test.tsx` per canvas + a `ReviewPage.test.tsx`. No integration tests. |
| Hearth token-only styling is already in place. | **Mostly true.** All canvases use `var(--*)` tokens. The only raw hex is in `ToolLogo.tsx` for provider-brand marks, which is explicitly exempt (trademark identity, nominative use per AQ-008). | Keep `ToolLogo` brand colors; forbid new raw hex/arbitrary colors in canvas implementations. |
| `npm run verify` must pass. | Baseline passes on main; this branch will add code + tests and must still pass check/lint/knip/test. | Final gate is `npm run verify`. |

---

## Acceptance criteria + verification methods

Copied from `TRACK-AL.md` AL2 (lines 68-73). Each criterion gets a concrete verification method.

### AC-1 — Each artifact kind renders through its purpose-built family canvas
> Each artifact kind (code · record/field-change · action/operation · rendered document/email · metrics/data · visual · batch) renders through its purpose-built family canvas; a reviewer grasps the result without opening raw output.

The TRACK-AL.md text lists the seven *proof families* AL2 must cover. AL1's approved design adds two utility canvases to the implementation set: `ReviewOutcomeSummary` (the frame lead) and `ReviewBrowserPreview` (a basic “just look at it” escape hatch). They are part of the locked design (`plans/AL1/design/approved.md`) and ship with AL2.

- **Verification:****
  - `packages/web/src/pages/review/__tests__/canvas-registry.test.ts` imports `getReviewCanvas` and, for each `ReviewCanvasKind`, renders the returned component with a typed fixture artifact and asserts the canvas renders expected L1 text (e.g., `ReviewCodeDiff` shows the PR title, `ReviewActionOperation` shows the amount).
  - `packages/web/src/pages/review/__tests__/ReviewPage.test.tsx` renders `<ReviewPage />` with a fixture `ReviewSubject` containing one of each kind and asserts all 9 canvas headings/bodies are present (or their `data-ds-component` / `aria-label` markers).

### AC-2 — Every canvas shows its source tool and a link back
> Every canvas shows its source tool (a recognizable mini-logo) and offers a link back to the original record.

- **Verification:**
  - Per-canvas `*.test.tsx`: query for `ToolLogo` mark and for the `"Open in <app>"` link (`<a>`) with `href` equal to `artifact.sourceHref`.
  - `ReviewOutcomeSummary` shows the tool mini-logo row; if `sourceHref` is present it also renders a source link. Other 8 canvases use `CanvasSourceHeader` directly.

### AC-3 — Three-layer drill-down with relevance ordering and trivia collapsed
> Each canvas reads at three layers — a one-glance summary, the structured proof, on-demand detail — with trivia collapsed and the most-relevant/outlier surfaced first.

- **Verification:**
  - Per-canvas `*.test.tsx`: assert L1 summary element exists, L2 proof body exists, and at least one L3 expand/detail affordance exists.
  - `ReviewCodeDiff.test.tsx`: assert the minor/generated section is collapsed by default and that logic-band files precede test-band files.
  - `ReviewBatch.test.tsx`: assert flagged items render before collapsed routine items.
  - Populated `.stories.tsx` files remain the visual baseline (reviewed by `npm run dev` at the design viewer).

### AC-4 — The code canvas is excellent
> The code canvas is excellent: relevance-ranked changes (logic before generated), the meaningful change summarized, minor/generated changes clearly separated, checks shown inline.

- **Verification:**
  - `ReviewCodeDiff.test.tsx` asserts:
    - Files are ordered logic → tests → minor/trivia.
    - The agent change summary (PR message) is rendered.
    - CI checks row is visible.
    - The trivia band is initially collapsed.
    - Per-file rationale is rendered for logic files.

### AC-5 — Unknown kind renders through a generic fallback, never breaking
> An artifact whose kind has no tailored canvas still renders through a generic fallback (never breaks).

- **Verification:**
  - `canvas-registry.test.ts` asserts `getReviewCanvas('totally_unknown_kind')` returns `ReviewUnknownCanvas`.
  - `ReviewUnknownCanvas.test.tsx` renders `getReviewCanvas('unknown')` with an arbitrary JSON payload and asserts it renders the source header + a safe preview dump without throwing and with no blank container.

### AC-6 — `npm run verify` passes
> Implicit from `TRACK-AL.md` top matter and `CLAUDE.md` validation rules.

- **Verification:** Run `npm run verify` after all implementation and tests; must exit 0 (check + lint + knip + test:all + build + attestation).

---

## Design-it-twice (non-trivial decisions)

### Decision 1 — Where does the review-canvas registry live?
- **Option A: extend `packages/design-system/src/kinds/renderer-registry.ts`.** Reuse the existing registry, add review canvases as "rich renderers".
  - *Trade-off:* Collapses the review experience into the design-system layer. Review canvases import `ToolLogo`, `CanvasSourceHeader`, page-local fixtures, and later conversation/verdict primitives — dependencies that would leak upward from web into design-system, violating the three-layer rule.
- **Option B: keep the registry in `packages/web/src/pages/review/`.**
  - *Trade-off:* Two registries exist side-by-side, but each registry owns a different layer (primitive preview vs. review proof surface). Downward dependency is preserved.
- **Decision:** **Option B.** AL2 creates a new `canvas-registry.ts` under `packages/web/src/pages/review/`. The primitive renderer registry remains untouched.

### Decision 2 — Typed canvas props: uniform `ReviewArtifact<TPayload>` vs. bespoke per-canvas props
- **Option A: bespoke props per canvas** (e.g., keep `ReviewOutcomeSummaryProps`, `ReviewCodeDiffProps`).
  - *Trade-off:* Lets each canvas keep its current prop vocabulary, but prevents a generic registry from dispatching by `kind` without a wrapper adapter per canvas.
- **Option B: uniform `ReviewCanvasProps<TPayload>`** where every canvas receives `artifact: ReviewArtifact<TPayload>`.
  - *Trade-off:* Requires a one-time refactor of prototypes to pull payload from `artifact.payload`. Enables the registry to dispatch directly and makes AL3 composition trivial.
- **Decision:** **Option B.** A single generic contract is simpler for dispatch, testing, and composition.

---

## Ordered task list

1. **Define review artifact vocabulary and payloads**  
   Files: `packages/web/src/pages/review/review-artifact.ts`  
   Dependencies: read `docs/process-layer/artifact-primitive.md`, `components-brief.md`.  
   Output: `ReviewCanvasKind`, `ReviewArtifact<TPayload>`, per-family payload types, a minimal `ReviewSubject` shape.

2. **Define the common canvas component contract**  
   File: `packages/web/src/pages/review/review-canvas.ts`  
   Dependencies: task 1.  
   Output: `ReviewCanvasProps<TPayload>`.

3. **Create the fallback canvas**  
   File: `packages/web/src/pages/review/ReviewUnknownCanvas.tsx`  
   Dependencies: task 2.  
   Output: safe fallback rendering source header + kind label + JSON preview dump.

4. **Refactor the 9 canvases to consume `ReviewCanvasProps`**  
   Files:
   - `packages/web/src/pages/review/ReviewOutcomeSummary.tsx`
   - `packages/web/src/pages/review/ReviewFieldChangeSet.tsx`
   - `packages/web/src/pages/review/ReviewActionOperation.tsx`
   - `packages/web/src/pages/review/ReviewRenderedInContext.tsx`
   - `packages/web/src/pages/review/ReviewMetricsMoved.tsx`
   - `packages/web/src/pages/review/ReviewVisualDiff.tsx`
   - `packages/web/src/pages/review/ReviewCodeDiff.tsx`
   - `packages/web/src/pages/review/ReviewBatch.tsx`
   - `packages/web/src/pages/review/ReviewBrowserPreview.tsx`
   Dependencies: task 2, shared `ToolLogo.tsx`, `CanvasSourceHeader.tsx`.  
   Notes:
   - Keep existing presentational internals (L1/L2/L3, collapse behavior, relevance ordering).
   - Move inline fixture data into typed payload fixtures per canvas or a shared `review-fixtures.ts` so stories + tests reuse them.
   - Update each `.stories.tsx` to pass the new artifact prop.
   - Ensure `ReviewOutcomeSummary` uses the tool-logo row and, when `sourceHref` is present, a source link.

5. **Create the canvas registry**  
   File: `packages/web/src/pages/review/canvas-registry.ts`  
   Dependencies: tasks 3 and 4.  
   Output: `getReviewCanvas(kind: string)` returning the mapped component or `ReviewUnknownCanvas`.

6. **Add a safe source-link guard**  
   File: `packages/web/src/pages/review/source-link-guard.ts`  
   Dependencies: task 2.  
   Output: `isSafeSourceHref(href: string): boolean` returns true only for `http://` or `https://`. Used by `CanvasSourceHeader`.

6. **Create the review fixture Subject**  
   File: `packages/web/src/pages/review/review-subject.fixture.ts`  
   Dependencies: task 1.  
   Output: one `ReviewSubject` containing at least one artifact per `ReviewCanvasKind`, using realistic tool fixtures aligned with `components-brief.md`.

7. **Create a minimal integration page**  
   File: `packages/web/src/pages/review/ReviewPage.tsx`  
   Dependencies: tasks 2 and 5.  
   Output: a thin page that renders the fixture `ReviewSubject`, maps each artifact through `getReviewCanvas`, and mounts every canvas so AL2's canvases are reachable in production code.  
   // @lore This is an AL2 integration scaffold only. The full dual-anchor composition (frame, intent, rationale, conversation, verdict) is explicitly owned by AL3 (`ReviewCompositionRefined`) and will replace/extend this page. Keep the page small and fixture-driven; do not build composition chrome here.

8. **Add the review route**  
   File: `packages/web/src/router.tsx`  
   Dependencies: task 7.  
   Output: `/work/bet/:betId/review/:reviewId` mounted with `<ReviewPage />`. Both params are display tokens only; the fixture subject ignores them.

9. **Write unit tests for the registry**  
   File: `packages/web/src/pages/review/__tests__/canvas-registry.test.ts`  
   Dependencies: task 5.  
   Output: asserts known-kind resolution and unknown-kind fallback.

10. **Write component tests for every canvas**  
    Files: `packages/web/src/pages/review/__tests__/*.test.tsx` (or co-located `*.test.tsx`).  
    Dependencies: tasks 3, 4, 6.  
    Output: each canvas accepts a typed artifact, renders without error, shows source tool/link, and exposes L1/L2/L3. `ReviewCodeDiff.test.tsx` specifically verifies relevance ordering, summary, CI checks, and collapsed trivia.

11. **Write a test for the review page**  
    File: `packages/web/src/pages/review/__tests__/ReviewPage.test.tsx`  
    Dependencies: tasks 7, 10.  
    Output: page renders all canvases from the fixture subject.

12. **Typecheck and lint**  
    Commands: `npm run check`, `npm run lint`.  
    Iterate until zero errors.

13. **Run fast tests**  
    Command: `npm run test`.  
    Iterate until green.

14. **Run full verify**  
    Command: `npm run verify`.  
    Iterate until green.

---

## Type signatures / schemas / component contracts

### Review canvas kind vocabulary

```ts
export type ReviewCanvasKind =
  | "outcome_summary"      // frame lead
  | "field_change_set"     // record/field change-set
  | "action_operation"     // staged action/operation receipt
  | "rendered_in_context"  // email/docs render
  | "metrics_moved"        // metrics/data-diff
  | "visual_diff"          // visual before→after
  | "code_diff"            // code diff (must-win)
  | "batch"                // batch/per-item container
  | "browser_preview";     // basic browser view
```

### Core artifact contract

```ts
export interface ReviewArtifact<TPayload = unknown> {
  readonly id: string;
  readonly tool: string;       // e.g. "stripe", "github", "figma"
  readonly app: string;        // human app name, e.g. "Stripe"
  readonly sourceHref: string; // deep link back to source record
  readonly title: string;      // artifact title
  readonly kind: ReviewCanvasKind;
  readonly payload: TPayload;
}
```

### Common canvas props

```ts
export interface ReviewCanvasProps<TPayload = unknown> {
  readonly artifact: ReviewArtifact<TPayload>;
}

export type ReviewCanvasComponent<TPayload = unknown> =
  ComponentType<ReviewCanvasProps<TPayload>>;
```

Each canvas component has a payload narrowed to its family:

| Canvas | Payload type | Key payload fields (summary) |
|---|---|---|
| `ReviewOutcomeSummary` | `OutcomeSummaryPayload` | `agentName`, `agentInitials`, `reviewerName`, `achieved`, `tools`, `costUsd`, `tokens`, `standing`, `doneConditions`, `needsYou` |
| `ReviewFieldChangeSet` | `FieldChangeSetPayload` | `recordLabel`, `fields: {label, old, new, provenance, changed?}[]`, `unchangedCount` |
| `ReviewActionOperation` | `ActionOperationPayload` | `verb`, `amountWire: WireMoney`, `irreversible`, `reversible`, `blastRadius`, `receiptFields` |
| `ReviewRenderedInContext` | `RenderedInContextPayload` | `inboxRow`, `body`, `renderMode`, `flags` |
| `ReviewMetricsMoved` | `MetricsMovedPayload` | `period`, `headlines`, `rows`, `tieOut`, `exceptions` |
| `ReviewVisualDiff` | `VisualDiffPayload` | `before`, `after`, `diffRegions`, `overlayMode` |
| `ReviewCodeDiff` | `CodeDiffPayload` | `prTitle`, `description`, `checks`, `files` (logic/test/trivia), `triviaSummary` |
| `ReviewBatch` | `BatchPayload` | `rollup`, `flagged`, `auto`, `drafted`, `approveAllExcept` |
| `ReviewBrowserPreview` | `BrowserPreviewPayload` | `url`, `title`, `previewBody` |
| `ReviewUnknownCanvas` | `unknown` | raw kind + JSON preview dump |

### Registry contract

```ts
export const REVIEW_CANVAS_REGISTRY: Record<
  ReviewCanvasKind,
  ReviewCanvasComponent
> = {
  outcome_summary: ReviewOutcomeSummary,
  field_change_set: ReviewFieldChangeSet,
  action_operation: ReviewActionOperation,
  rendered_in_context: ReviewRenderedInContext,
  metrics_moved: ReviewMetricsMoved,
  visual_diff: ReviewVisualDiff,
  code_diff: ReviewCodeDiff,
  batch: ReviewBatch,
  browser_preview: ReviewBrowserPreview,
};

export function getReviewCanvas(kind: string): ReviewCanvasComponent;
export function getReviewCanvas(kind: ReviewCanvasKind): ReviewCanvasComponent;
export function getReviewCanvas(kind: string): ReviewCanvasComponent {
  return (REVIEW_CANVAS_REGISTRY as Record<string, ReviewCanvasComponent>)[kind]
    ?? ReviewUnknownCanvas;
}
```

### Review subject (used by `ReviewPage`, forward-compatible with AL3 composition)

```ts
export interface ReviewSubject {
  readonly id: string;
  readonly title: string;
  readonly artifacts: readonly ReviewArtifact[];
  // AL3 will add intent, rationale, needsYou, verdict, conversation here.
  // AL2 stamps the shape but only populates artifacts.
}
```

---

## Route checklist

| Route | Component | File to touch | Notes |
|---|---|---|---|
| `/work/bet/:betId/review/:reviewId` | `<ReviewPage />` | `packages/web/src/router.tsx` | Add inside the `/` AppShell children block, after `/work/bet/:betId/task/:taskId`. Both params are read-only display tokens in AL2 (fixture subject). |

---

## Security & abuse cases

| Concern | Applicable? | How addressed |
|---|---|---|
| Rate-limit on mutating endpoints | N/A | AL2 is read-only; no new POST/PATCH endpoints. |
| Input-trust boundary for agent-authored fields | Yes | `artifact.title`, `artifact.payload`, `artifact.sourceHref` are treated as untrusted content. No `eval()` or `dangerouslySetInnerHTML`. Fallback canvas renders JSON with `JSON.stringify`. |
| Secret-handling | N/A | No new credential surface. |
| Path traversal | N/A | Route params are displayed, never used for filesystem access. |
| SSRF | N/A | No outbound requests from the review page. |
| Malicious `sourceHref` | Yes | `CanvasSourceHeader` uses `isSafeSourceHref`: only `http://`/`https://` links are rendered as `<a target="_blank" rel="noopener noreferrer">`; all other schemes render as disabled text. `canvas-registry.test.ts` includes a test for `ReviewUnknownCanvas` with a `javascript:` href that the safe link guard neutralizes. |
| HTML email rendering | Future risk | AL2 does **not** use `dangerouslySetInnerHTML` for `ReviewRenderedInContext`; use plain-text / structured fixture content. Add a `@lore` comment explaining why raw HTML is deferred to a later security review. |

---

## protectedTests

```json
{
  "protectedTests": [
    "packages/web/src/pages/review/__tests__/canvas-registry.test.ts",
    "packages/web/src/pages/review/__tests__/ReviewUnknownCanvas.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewCodeDiff.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewFieldChangeSet.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewActionOperation.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewRenderedInContext.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewMetricsMoved.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewVisualDiff.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewBatch.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewBrowserPreview.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewOutcomeSummary.test.tsx",
    "packages/web/src/pages/review/__tests__/ReviewPage.test.tsx",
    "packages/web/src/pages/review/source-link-guard.test.ts"
  ]
}
```

AL2's correctness depends on the registry dispatch, every canvas's L1/L2/L3 assertions, the source-link guard, and the page integration test. These must not be removed without a replacement test that proves the same runtime behavior.

---

## Migrations

None. AL2 adds new files and props, but does not rename, remove, or move existing files/symbols. The existing primitive renderer registry and `Artifact` type are intentionally unchanged.

---

## sharedFiles

Files this workpackage modifies that other workpackages (notably AL3) are likely to touch:

- `packages/web/src/router.tsx` — shared routing surface.
- `packages/web/src/pages/review/review-artifact.ts` — canonical review artifact/subject shapes for AL3 composition.
- `packages/web/src/pages/review/canvas-registry.ts` — the kind→canvas lookup AL3 composition will use.
- `packages/web/src/pages/review/source-link-guard.ts` — shared source-link safety helper for any canvas that links out.
- `packages/web/src/pages/review/ReviewPage.tsx` — AL2 integration scaffold; AL3 (`ReviewCompositionRefined`) will replace/extend.
- `packages/web/src/pages/review/ToolLogo.tsx` — shared mini-logo primitive.
- `packages/web/src/pages/review/CanvasSourceHeader.tsx` — shared source-attribution header.

---

## Risks / ambiguities

1. **Review canvas kind vs. Artifact primitive kind mismatch.** The `Artifact` primitive has an open vocabulary of 6 fundamental kinds (`text`, `code`, `image`, `data`, `html`, `url`). The review experience needs 9 proof-family canvases. AL2 does **not** build the derivation layer from primitive `Artifact` → `ReviewCanvasKind`; it uses a review-specific kind enum for fixtures and registry dispatch. AL3/AL5 must own the canonical mapping.
2. **`ReviewOutcomeSummary` is a frame lead, not a single-source artifact.** The design brief shows it without a `CanvasSourceHeader`. To satisfy AC-2, the plan gives it a tool-logo row and an optional source link when `sourceHref` is present, without violating the locked frame layout.
3. **Fixture data is currently inlined in components.** Refactoring to typed payload fixtures will touch every `.stories.tsx`; stories must remain valid visual baselines.
4. **No real review id / Subject data fetch.** The new route receives `betId` and `reviewId`, but `ReviewPage` will render a fixture subject. We must add a prominent `@lore` comment that the page is intentionally fixture-driven in AL2 and that real data wiring is AL3.
5. **ToolLogo brand colors are raw hex.** This is the only allowed exception (tool identity marks). AL2 must not introduce any other raw hex or Tailwind arbitrary colors.
6. **Visual diff / rendered context may tempt raw HTML injection.** AL2 defers HTML rendering to plain fixture structures; the plan requires an explicit `@lore` comment blocking `dangerouslySetInnerHTML` in these canvases.
7. **AL3 overlap on `ReviewPage.tsx`.** `ReviewPage.tsx` and the `/work/bet/:betId/review/:reviewId` route are intentionally minimal AL2 scaffolding so the canvases are reachable in production code. The full dual-anchor composition (frame, intent, rationale, conversation, verdict) is explicitly owned by AL3 (`ReviewCompositionRefined`) and will replace/extend this page. The page is deliberately fixture-driven; do not grow composition chrome here.
