# AL3 — Architecture: Review composition surface

Source of truth: `.pipeline/work-packages/TRACK-AL.md` (lines 90-124) and the approved design `plans/AL1/design/approved.md`.

## High-level shape

Productionize `ReviewCompositionRefined` from the AL1 design seed, reusing the AL2 canvas registry and family canvases already on `main`.

```
route /work/bet/:betId/review/:reviewId
  └─ ReviewPage (data loader + chrome)
      └─ ReviewComposition (presentational, pure props)
          ├─ FrameHeader
          ├─ center column
          │   ├─ TaskSection
          │   ├─ ResultSection
          │   ├─ NeedsSection
          │   ├─ ArtifactsSection
          │   └─ ConversationSection
          └─ ExaminePane (right pane; renders the selected artifact via AL2 registry)
```

## Files / modules

| Path | Role |
|------|------|
| `packages/web/src/pages/review/review-composition.ts` | New types: `ComposedReviewSubject`, `ReviewComment`, `ReviewKpi`, `ReviewNeed`, `ReviewIntentCondition`, `ReviewVerdictState`. |
| `packages/web/src/pages/review/ReviewComposition.tsx` | The production composition component. Replaces the design-seed `ReviewCompositionRefined.tsx`. |
| `packages/web/src/pages/review/ReviewPage.tsx` | Route component. Fetches (or receives) a `ComposedReviewSubject` and renders `ReviewComposition`. Keeps the existing route path. |
| `packages/web/src/pages/review/review-subject.fixture.ts` | Updated canonical fixture implementing `ComposedReviewSubject`; used by tests and as a safe default for the route. |
| `packages/web/src/pages/review/ReviewComposition.stories.tsx` | Design-system stories mirroring `Overview` / `Examining` states; uses the fixture. |
| `packages/web/src/pages/review/__tests__/ReviewComposition.test.tsx` | Component tests covering all ACs. |
| `packages/web/src/pages/review/__tests__/ReviewPage.test.tsx` | Route-level test: uses `/work/bet/:betId/review/:reviewId` via `createMemoryRouter`. |
| `packages/server/src/routes/reviews.ts` (new) | `GET /api/reviews/:reviewId` returning `ComposedReviewSubject`. For AL3 the response can be a fixture-backed stub; the route shape is real so Phase-4 AC completeness has a surface to verify. |
| `packages/web/src/router.tsx` | No path change; `ReviewPage` is already wired to `/work/bet/:betId/review/:reviewId`. |

## Data shapes

AL2's `ReviewSubject` is intentionally artifact-only. AL3 extends it without breaking AL2 canvases.

```ts
// packages/web/src/pages/review/review-composition.ts
import type { VerdictDecision } from "@hyperidle/shared";
import type { ReviewArtifact, ReviewSubject } from "./review-artifact";

export interface ReviewCommentRef {
  readonly kind: "artifact" | "line";
  readonly label: string; // e.g. "PromoField.tsx:118" or "packages/billing/promo-webhook.ts"
}

export interface ReviewComment {
  readonly id: string;
  readonly author: string;
  readonly authorIsAgent: boolean;
  readonly body: string;
  readonly ago: string;
  readonly refs?: ReadonlyArray<ReviewCommentRef>;
}

export interface ReviewKpi {
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
  readonly good?: boolean;
}

export interface ReviewNeed {
  readonly id: string;
  readonly kind: "blast-radius" | "over-authority" | "unhandled-exception" | "unverified-claim";
  readonly label: string;
  readonly detail: string;
  readonly artifactId?: string;
}

export interface ReviewIntentCondition {
  readonly text: string;
  readonly met: boolean;
}

export interface ReviewVerdictState {
  readonly decision?: VerdictDecision;
  readonly note?: string;
  readonly resolvedAt?: string;
}

export interface ComposedReviewSubject extends ReviewSubject {
  readonly betId: string;
  readonly betTitle: string;
  readonly taskId?: string;
  readonly taskTitle?: string;
  readonly prompt: string;
  readonly authorName: string;
  readonly reviewerName: string;
  readonly blocking: boolean;
  readonly producedAgo: string;
  readonly costMoney: string;
  readonly costTokens: string;
  readonly tools: ReadonlyArray<string>;
  readonly outcome: string;
  readonly resultKpis: ReadonlyArray<ReviewKpi>;
  readonly intent: ReadonlyArray<ReviewIntentCondition>;
  readonly needs: ReadonlyArray<ReviewNeed>;
  readonly conversation: ReadonlyArray<ReviewComment>;
  readonly verdict?: ReviewVerdictState;
}
```

## Canvas selection

Use the existing AL2 registry unchanged:

```ts
import { getReviewCanvas } from "./canvas-registry";
const Canvas = getReviewCanvas(artifact.kind);
```

The composition does **not** add a new canvas kind. It renders whichever AL2 canvas the artifact already declares.

## Route / placement

- Canonical route already exists: `/work/bet/:betId/review/:reviewId`.
- `ReviewPage` reads `useParams<{ betId: string; reviewId: string }>()`.
- For AL3, `ReviewPage` fetches `GET /api/reviews/${reviewId}`; if the fetch is slow or fails it shows loading / error states. The happy path passes the loaded subject into `ReviewComposition`.
- To keep tests fast and avoid requiring a running server, `ReviewComposition` is prop-driven; `ReviewPage` accepts an optional `loader` prop for tests.

## Server side (stub, shape-is-real)

`packages/server/src/routes/reviews.ts`:

```ts
app.get("/api/reviews/:reviewId", (c) => {
  const reviewId = c.req.param("reviewId");
  // AL3 returns the fixture subject keyed by reviewId. The endpoint shape
  // is real; back-filling DB persistence is out of scope for AL3.
  return c.json(buildFixtureReviewSubject(reviewId));
});
```

- Error contract: `404` if `:reviewId` is missing/empty; body `{ error: "review_not_found" }`.
- Register in `packages/server/src/app.ts` (follow the existing `app.route(...)` mounts).
- No DB migration for AL3; fixture data is keyed by the route param so the route returns deterministic JSON for tests.

## Verdict resolution

- The frame header renders the five verdict decisions via the shared `VerdictDecision` type from `@hyperidle/shared`.
- `ReviewComposition` receives `onSubmitVerdict: (decision: VerdictDecision, note?: string) => void | Promise<void>`.
- `ReviewPage` wires `onSubmitVerdict` to `POST /api/threads/:threadId/messages` with a `verdict` payload (use the existing thread message API shape from `@hyperidle/shared`).
- For AL3 tests, assert the callback is called with the chosen decision; do not require actual server round-trip in unit tests.
- The verdict resolves the whole Subject; no per-artifact `onSubmitVerdict` is passed to canvases.

## Progression states

- `Overview` — right pane closed; center full-width.
- `Examining` — right pane open on a selected artifact.
- `Resolved` — a verdict was posted; optional resolved banner; verdict controls disabled.
- Loading / error states on the route are handled by `ReviewPage`.

## Motion / interaction

- Right pane width managed with CSS transitions on a container class; no library drag.
- `Esc` closes the pane (keyboard listener on the composition container).
- Clicking an artifact row opens the pane; clicking ✕ or pressing `Esc` closes it.
- A need item with `artifactId` jumps to and opens that artifact.

## Lore / gotchas

- `@lore` The approved design (`plans/AL1/design/approved.md` §Open Questions) intentionally keeps the conversation thread lightly styled — it will adopt the AM-track conversation redesign later. AL3 therefore uses a local `ReviewComment` array as the conversation model, not the full `Thread` fetch, to avoid duplicating work that AM will replace.
- `@lore` AL2 canvases must keep their existing props; do not change `ReviewCanvasProps`. New composition fields live only on `ComposedReviewSubject`.
- `@lore` The pane is not a separate route; it is local UI state so the back button leaves the review rather than stepping through pane history.

## AC → verification mapping

| Acceptance criterion | Verification |
|----------------------|--------------|
| Open one review and see bet/task + prompt + outcome + visible result | Component test: `ReviewComposition.test.tsx` renders overview, queries for prompt, outcome, KPI labels, and visible proof. |
| Surface derived gaps/risks/blockers linking to relevant artifact | Component test: need items render; clicking a need opens the linked artifact in the pane. |
| Open any artifact to examine it at full size; close returns | Component test: click row → selected canvas renders in pane; close button / `Esc` removes it. |
| Discussion is one global conversation; comment can reference artifact/spot | Component test: conversation comments render; reference chips rendered with label. Type system: comments do not introduce per-artifact threads. |
| Resolve Subject with one binding verdict, reachable without obscuring content | Component test: verdict buttons render and call `onSubmitVerdict` with correct decision; component does not show sticky bar over content. |
| (Design constraint) No per-artifact verdicts | Lint / type: `ReviewComposition` does not import or render per-canvas verdict affordances. Only `VerdictDecision` type in frame. |
| Canvas selection by kind | Existing `canvas-registry.test.ts` already covers; composition test verifies code artifact opens `ReviewCodeDiff` in pane. |

## Implementation tasks (ordered)

1. **Types** — add `packages/web/src/pages/review/review-composition.ts` with shapes above.
2. **Fixture** — extend `review-subject.fixture.ts` to implement `ComposedReviewSubject`, keep IDs stable for tests.
3. **Build `ReviewComposition.tsx`** — refactor the AL1 design seed into prop-driven sections; wire right pane to `getReviewCanvas`; ensure AL2 canvas imports are retained.
4. **ReviewPage refactor** — switch to `ReviewComposition`; add fetcher/useLoader; keep route path.
5. **Server stub route** — add `GET /api/reviews/:reviewId` with fixture response; register in server app.
6. **Stories** — add `ReviewComposition.stories.tsx` for Overview and Examining visual regression.
7. **Tests** — write `ReviewComposition.test.tsx` covering AC table; update `ReviewPage.test.tsx` for the composition.
8. **Run `npm run verify`**, fix failures until green.

## Risks / gotchas

- `@lore` AL2 canvases may assume they are the only consumer of `ReviewArtifact`. Do not change their props shape; extend via `ComposedReviewSubject`.
- `@lore` The design seed used local `useState` and no data. Keep presentation pure so tests can drive state via props.
- `@lore` Verdict buttons must not float or obscure content. Keep them in the top-right of `FrameHeader` (not a fixed position bar).
