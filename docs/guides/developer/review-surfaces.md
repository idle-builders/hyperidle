# Adding a Review Surface

A **review surface** is a named React component that specializes one of the nine family review canvases for a specific case (e.g. a Stripe refund review). It is a plain component — same shape as the family canvases — wired into a static map. No CLI, no DB, no manifest, no install step.

Adding one requires three edits, then a rebuild.

## Step 1 — Write the component

Create the component under `packages/web/src/pages/review/surfaces/<name>/`. It receives the same props as the family canvas it specializes. Forward all props the canvas expects, including the AL7 trust-gate props (`status`, `outcome`, `proposedCall`) if wrapping `ReviewActionOperation`.

```tsx
// packages/web/src/pages/review/surfaces/stripe-refund-review/StripeRefundReview.tsx
import { ReviewActionOperation, type ActionOperationCanvasProps } from "../../ReviewActionOperation.js";

export function StripeRefundReview(props: ActionOperationCanvasProps): JSX.Element {
  return (
    <ReviewActionOperation
      {...props}
      // override or augment presentation here
    />
  );
}
```

Add a `.stories.tsx` file next to it for the design-system viewer.

## Step 2 — Register in the static map

Add one line to `packages/web/src/pages/review/review-surfaces.ts`:

```ts
import { StripeRefundReview } from "./surfaces/stripe-refund-review/StripeRefundReview.js";

export const REVIEW_SURFACE_REGISTRY: Record<string, ReviewCanvasComponent> = {
  "stripe-refund-review": StripeRefundReview as ReviewCanvasComponent,
  // add your surface here
};
```

The key is the stable surface name. `getReviewSurface(name)` does a plain Map lookup — unknown names return `undefined` (silent fallback, no throw).

## Step 3 — Add to the shared catalog

Add one entry to `REVIEW_SURFACES` in `packages/shared/src/review-surface.ts`:

```ts
export const REVIEW_SURFACES: ReadonlyArray<ReviewSurfaceCatalogEntry> = [
  {
    name: "stripe-refund-review",
    description: "Specializes the action_operation canvas for Stripe refunds.",
  },
  // add your entry here
];
```

The `name` field must exactly match the key you added in Step 2. This is the list the agent sees when calling `create_artifact` with a `surface` param.

## Rebuild

```
npm run build
```

After rebuild the surface is live. No settings UI, no adoption step — the agent names the surface on the artifact, the review renders it.

## The floor always works

`getReviewSurface(name)` returns `undefined` for any absent or unknown name. The caller falls back to `getReviewCanvas(artifact.kind)` — the family canvas for that kind always renders. You never see a blank screen.
