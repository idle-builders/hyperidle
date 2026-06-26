# Writing a Review Surface

A review surface is a React component (plus a small manifest) that specializes one of the nine base canvases for a specific tool and task. It is code — not a config blob, not a DSL. Contributors are devs; AI writes one cheaply; maintainers audit it like any PR.

This guide covers: the component contract, the manifest shape, the two layering modes (wrap / eject), publishing to the registry, and the hard rules the lint enforces.

## The two humans

**Contributor** — writes a React component that fills a base canvas's slots (or forks it) for their tool/task, then publishes it to a registry with a manifest descriptor.

**Team** — browses the registry, previews the surface, and adopts the one they want for a situation. The system renders the **adopted** surface; it never auto-selects among candidates at render time.

## Core concepts

| Term | Definition |
|---|---|
| **Base canvas** | One of the nine AL2 generic review components (`ReviewActionOperation`, `ReviewFieldChangeSet`, etc.). The floor every surface specializes and the always-present fallback. |
| **Wrap** | Compose over the base canvas via its declared slots. Upgrade-safe — you never copy the base's internals. |
| **Eject** | Copy the base canvas source into your surface file and own it. Total control; you own upgrades when the base changes. |
| **Adoption** | A `surfaceAdoptions` DB row binding `(teamId, tool, kind) → surfaceId`. At-most-one per situation (enforced by unique index). |
| **Provenance** | `"first-party"` (HyperIdle) or `"community"` (anyone). Same registry mechanism; this field distinguishes. |
| **Trust tier** | `"vetted"` (reviewed by HyperIdle) or `"community"` (reviewed by the adopting team). Reused from AN Connectors — not redefined. |

## Step 1 — Choose a base canvas and layering mode

A surface specializes **exactly one** base canvas. Pick the family that fits:

| Kind | Base canvas | When to use it |
|---|---|---|
| `action_operation` | `ReviewActionOperation` | Staged action receipts (refunds, merges, sends) |
| `field_change_set` | `ReviewFieldChangeSet` | Record field diffs |
| `outcome_summary` | `ReviewOutcomeSummary` | Agent run summaries |
| `code_diff` | `ReviewCodeDiff` | Code changes |
| `rendered_in_context` | `ReviewRenderedInContext` | Email / document previews |
| `metrics_moved` | `ReviewMetricsMoved` | KPI roll-forwards |
| `visual_diff` | `ReviewVisualDiff` | UI before/after |
| `batch` | `ReviewBatch` | Multi-item rollups |
| `browser_preview` | `ReviewBrowserPreview` | Live URL previews |

Check which slots the base canvas supports via `slotPermission(kind, slotName)` from `slot-policy.ts`. As of AL5, only `action_operation` has wired wrap seams (`header`, `lead`, `detail`, `footer`; `aside` is forbidden). Other canvases are eject-only until their seams are wired.

```ts
import { slotPermission } from "../pages/review/slot-policy.js";

slotPermission("action_operation", "lead");   // → "wrap"
slotPermission("action_operation", "aside");  // → "forbidden"
slotPermission("outcome_summary", "lead");    // → "eject" (seam not yet wired)
```

## Step 2 — Write the manifest

In `packages/shared/src/review-surface.ts`, the `SurfaceManifest` shape is defined. First-party manifests are added to `FIRST_PARTY_SURFACE_MANIFESTS` in that file (the single source of truth shared by both the web registry and the server validator).

```ts
// packages/shared/src/review-surface.ts — add to FIRST_PARTY_SURFACE_MANIFESTS
{
  id: "stripe-refund-review",          // stable registry id; namespaced for community: "@acme/x"
  title: "Stripe Refund Review",
  description: "Specializes action_operation for Stripe refunds.",
  author: "HyperIdle <hi@hyperidle.com>",
  version: "1.0.0",                    // semver; adoptions pin this
  baseCanvas: "action_operation",      // the floor this surface specializes
  layering: "wrap",                    // "wrap" | "eject"
  provenance: "first-party",           // "first-party" | "community"
  trustTier: "vetted",                 // "vetted" | "community"
  situations: [{ tool: "stripe", kind: "action_operation" }], // discovery hint, NOT auto-apply
  sampleFixture: "stripe-refund",      // fixture id for the .stories.tsx preview
}
```

For an in-repo first-party surface, the manifest file under the surface directory re-exports from `FIRST_PARTY_SURFACE_MANIFESTS`:

```ts
// surfaces/stripe-refund-review/manifest.ts
import { FIRST_PARTY_SURFACE_MANIFESTS } from "@hyperidle/shared";
const entry = FIRST_PARTY_SURFACE_MANIFESTS.find((m) => m.id === "stripe-refund-review");
if (!entry) throw new Error("manifest missing");
export const stripeRefundReviewManifest: SurfaceManifest = entry;
```

## Step 3 — Write the component (wrap mode)

The component receives the **full prop set of its base canvas** plus optional `slots?: CanvasSlots`. For `action_operation`, that means the AL7 trust-first props (`status`, `outcome`, `proposedCall`) must flow through — dropping them silently removes the OutcomeBand (executed / failed state). Always forward them.

```tsx
// surfaces/stripe-refund-review/StripeRefundReview.tsx
import { ReviewActionOperation, type ActionOperationCanvasProps } from "../../ReviewActionOperation.js";

export function StripeRefundReview(props: ActionOperationCanvasProps): JSX.Element {
  const { artifact, status, outcome, proposedCall } = props;
  return (
    <ReviewActionOperation
      artifact={artifact}
      status={status}          // forwarded — never drop AL7 props
      outcome={outcome}
      proposedCall={proposedCall}
      slots={{
        lead: <RefundLead payload={artifact.payload} />,
        footer: <RefundRoutingNote />,
      }}
    />
  );
}
```

**Hard rule:** surfaces under `surfaces/**` must not import `apiFetch`, anything from `/services/`, or `@hyperidle/server`. The `design/no-surface-network-import` ESLint rule enforces this. Surfaces render from props only — the host (`ReviewComposition` / `ReviewPage`) fetches and forwards all data.

## Step 4 — Write the stories file

Every surface needs a `.stories.tsx` file in the same directory. This powers the dev-mode preview in the browse dialog (the iframe at `:8098`).

```tsx
// surfaces/stripe-refund-review/StripeRefundReview.stories.tsx
export const Default = () => (
  <StripeRefundReview artifact={STRIPE_REFUND_FIXTURE} />
);
export const Executed = () => (
  <StripeRefundReview
    artifact={STRIPE_REFUND_FIXTURE}
    status="executed"
    outcome={{ status: "ok", receipt: "ch_abc123", executedAt: "2 min ago" }}
    proposedCall={STRIPE_PROPOSED_CALL_FIXTURE}
  />
);
```

The `sampleFixture` field in the manifest should match the story id the `:8098` viewer serves for the default preview.

## Step 5 — Register the surface

In `packages/web/src/pages/review/surfaces/surface-registry.ts`, add an entry to `FIRST_PARTY`:

```ts
const stripeRefundEntry: SurfaceRegistryEntry = {
  manifest: stripeRefundReviewManifest as SurfaceManifest & { baseCanvas: "action_operation" },
  component: StripeRefundReview,
};

const FIRST_PARTY: ReadonlyArray<SurfaceRegistryEntry> = [stripeRefundEntry];
```

The registry uses a `SurfaceRegistryEntry` discriminated union keyed on `baseCanvas`. The `action_operation` discriminant carries `ComponentType<ActionOperationCanvasProps>` so TypeScript knows the component's full AL7 prop shape. Generic canvases use `ReviewCanvasComponent`.

## Eject mode

When wrap slots can't express the specialization you need (structural rearrangement, or the base canvas doesn't have wired seams yet), use eject:

1. Copy the base canvas's `.tsx` source into your surface directory.
2. Modify it freely — you own the file.
3. Set `layering: "eject"` in the manifest.
4. When the base canvas upstream changes, hand-migrate your copy (no automatic upgrade).

## Community surfaces

Community surfaces follow the same manifest shape and component contract. They are published to a community registry URL (a `CommunityRegistryIndex` JSON index). Adoption still requires a build-time copy into the repo — the registry URL is discovery + provenance, not a live remote-eval path (that would reintroduce the untrusted-runtime problem the concept rejects). The adopting team reviews the source before it runs.

## Slot policy reference

`SLOT_POLICY` in `slot-policy.ts` declares, per `ReviewCanvasKind`, which slots are `"wrap"`, `"eject"`, or `"forbidden"`. Slots not listed default to `UNLISTED_SLOT_DEFAULT = "eject"`.

```ts
export const SLOT_POLICY: Readonly<Record<ReviewCanvasKind, SlotPolicy>> = {
  action_operation: {
    header: "wrap", lead: "wrap", detail: "wrap", footer: "wrap",
    aside: "forbidden",
  },
  // All other canvases: eject-only until seams are wired in a fast-follow
  outcome_summary: {}, field_change_set: {}, /* … */
};
```

## Hard rules summary

| Rule | Enforcement |
|---|---|
| Surfaces render from props only — no `apiFetch`, no `/services/` imports | `design/no-surface-network-import` ESLint rule |
| Closed `LayeringMode`: `"wrap"` or `"eject"` | TypeScript union |
| Closed `TrustTier`: `"vetted"` or `"community"` | TypeScript union (from `@hyperidle/shared/connection`) |
| Closed `SurfaceProvenance`: `"first-party"` or `"community"` | TypeScript union |
| At-most-one adoption per `(teamId, tool, kind)` | DB unique index `surface_adoptions_team_situation_idx` |
| Base canvas always renders on surface failure | `SurfaceBoundary` React error boundary wrapping every resolved surface |
| AL7 `OutcomeBand` preserved through wrapped surfaces | `status`/`outcome`/`proposedCall` forwarded in the `action_operation` render branch |
| Every surface has a `.stories.tsx` | Code review convention |

## File layout

```
packages/
  shared/src/
    review-surface.ts                  # SurfaceManifest, AdoptionView, FIRST_PARTY_SURFACE_MANIFESTS
  web/src/pages/review/
    surface-slots.ts                   # SlotName, CanvasSlots, slot() helper
    slot-policy.ts                     # SLOT_POLICY, slotPermission()
    surfaces/
      resolve-surface.ts              # resolveSurface() — pure Map lookup
      SurfaceBoundary.tsx             # React error boundary (floor fallback)
      surface-registry.ts             # getSurfaceEntry(), listSurfaces(), SurfaceRegistryEntry
      stripe-refund-review/
        manifest.ts                   # re-export from FIRST_PARTY_SURFACE_MANIFESTS
        StripeRefundReview.tsx
        StripeRefundReview.stories.tsx
  db/src/schema.ts                     # surfaceAdoptions table
  server/src/routes/surface-adoptions.ts  # GET/POST/DELETE endpoints
  web/src/settings/
    SettingsReviewSurfaces.tsx         # adopt/browse UI
  eslint-plugin-design/src/rules/
    no-surface-network-import.ts       # AC5 lint guard
```
