# Adding a Review Surface

A **review surface** is a named React component that specializes one of the nine family review canvases for a specific case (e.g. a Stripe refund review). Two kinds exist:

- **Built-in surfaces** — shipped with the app. Adding one requires editing the repo and rebuilding.
- **Drop-in surfaces** — pre-built `.js` files that users drop into `~/.hyperidle/surfaces/` and restart. No app rebuild.

---

## Built-in surfaces (repo edit + rebuild)

Built-ins are wired at compile time. Adding one requires three edits then a rebuild.

### Step 1 — Write the component

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

### Step 2 — Register in the static map

Add one line to `packages/web/src/pages/review/review-surfaces.ts`:

```ts
import { StripeRefundReview } from "./surfaces/stripe-refund-review/StripeRefundReview.js";

export const REVIEW_SURFACE_REGISTRY: Record<string, ReviewCanvasComponent> = {
  "stripe-refund-review": StripeRefundReview as ReviewCanvasComponent,
  // add your surface here
};
```

### Step 3 — Add to the shared catalog

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

The `name` must exactly match the key in Step 2. This is the list the agent sees when calling `create_artifact`.

### Rebuild

```
npm run build
```

---

## Drop-in surfaces (end-user, no rebuild)

End users can install a pre-built `.js` surface file without rebuilding the app.

### Author workflow

1. Clone or fork the repo.
2. Write your surface component (a `.tsx` file) using the same `ReviewCanvasComponent` contract as built-in surfaces. Import `react` and `react/jsx-runtime` normally — they will be externalized by the build command.

   Optionally export a description string so the agent knows what the surface does:
   ```tsx
   export const description = "My custom ACME review surface";
   export default function AcmeReview(props) { ... }
   ```

3. Build it to a portable ESM `.js`:
   ```
   npm run build-surface -- path/to/AcmeReview.tsx --out /tmp/acme-output
   ```
   This bundles the `.tsx` to `AcmeReview.js` with `react` and `react/jsx-runtime` externalized. The output file is a single-file ESM module with no dependencies other than the host app's React.

4. Distribute `AcmeReview.js` to your users.

### User installation

1. Drop the provided `.js` file into `~/.hyperidle/surfaces/`.
2. Restart HyperIdle.
3. The surface is now available to agents by name (the filename without `.js`).

The AI agent will see the surface in its catalog when calling `create_artifact` with a `surface` parameter. The surface name is the filename without the `.js` extension (e.g. `AcmeReview.js` → `AcmeReview`).

### React sharing (single instance)

Drop-in surfaces share the host's React instance. The host exposes React on `window.__hyperidleReact` and `window.__hyperidleJsxRuntime`. An import map in `index.html` routes bare `"react"` and `"react/jsx-runtime"` imports inside the dropped module to shim files at `/api/surfaces/_shims/react.js` and `/api/surfaces/_shims/jsx-runtime.js`. These shims re-export from the window globals, ensuring a single React copy and valid hook calls.

---

## The floor always works

`getReviewSurface(name)` returns `undefined` for any absent, unknown, or failed surface name. The caller falls back to `getReviewCanvas(artifact.kind)` — the family canvas for that kind always renders. You never see a blank screen.

Built-in surfaces always win over drop-in surfaces with the same name.
