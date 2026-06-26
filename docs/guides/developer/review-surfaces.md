# Writing a Review Surface

A review surface is a React component (plus a small manifest) that specializes one of the nine base canvases for a specific tool and task. It is code — not a config blob, not a DSL. Contributors are devs; AI writes one cheaply; maintainers audit it like any PR.

This guide covers: the component contract, the manifest shape, the two layering modes (wrap / eject), installing from the registry, and the hard rules the lint enforces.

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

## Discovery model

HyperIdle ships with a curated **official catalog** (`OFFICIAL_REGISTRY_INDEX` in `packages/shared/src/registry-index.ts`), which wraps `REGISTERED_SURFACE_MANIFESTS` — the single source of truth for first-party and installed community manifests.

A team can also add a **community registry** by URL — any server hosting a `RegistryIndex` JSON. `loadRegistryIndex(url)` fetches and validates the catalog (name, version, surfaces[]). The browse dialog shows catalog entries from any loaded index. An uninstalled community surface shows "install via `add …`" — browsing a catalog is read-only; no code runs until the surface is installed and rebuilt.

## Installing a surface (`npm run surface:add`)

Community surfaces are installed at **build time** — no runtime eval, no dynamic import of fetched code. The `add` command copies source files to disk for you to review, commit, and rebuild.

```
npm run surface:add -- <source>
```

where `<source>` is one of:

| Form | Example |
|---|---|
| HTTPS URL to `registry-item.json` | `https://example.com/surfaces/foo/registry-item.json` |
| GitHub shorthand | `github:owner/repo/surfaces/foo` |
| GitHub URL | `https://github.com/owner/repo/tree/main/surfaces/foo` |
| Local path | `./local-surface` |

The command runs four steps:

1. **Copies source files** into `packages/web/src/pages/review/surfaces/<surfaceId>/` — the directory the app resolves surfaces from. The surface's `registry-item.json` lists the files to copy; a path-traversal guard (`basename()` + strip `../`) prevents escape.
2. **Generates `register.ts`** in that directory. The generated file imports the surface component and calls `registerSurface()` from `surface-registry-api.ts` so the surface is wired into the registry at module-load time after rebuild.
3. **Appends an import line** to `packages/web/src/pages/review/surfaces/surface-registry.generated.ts` so `surface-registry.ts` picks up the new registration automatically.
4. **Appends the manifest** to `REGISTERED_SURFACE_MANIFESTS` in `packages/shared/src/review-surface.ts` (before the `/* surface:add inserts above */` sentinel) so the server registry accepts adoption POSTs for this surface.

After install, review all changed files, commit, and rebuild:

```
git add packages/
git commit -m "feat: install <surfaceId> surface"
npm run build
```

After rebuild the surface appears in **Settings → Review surfaces** and can be adopted.

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

In `packages/shared/src/review-surface.ts`, the `SurfaceManifest` shape is defined. First-party manifests are added to `REGISTERED_SURFACE_MANIFESTS` in that file (the single source of truth shared by both the web registry and the server validator).

```ts
// packages/shared/src/review-surface.ts — add to REGISTERED_SURFACE_MANIFESTS
{
  id: "stripe-refund-review",          // stable registry id; namespaced for community: "@acme/x"
  title: "Stripe Refund Review",
  description: "Specializes action_operation for Stripe refunds.",
  author: "HyperIdle <hi@hyperidle.com>",
  version: "1.0.0",                    // semver; adoptions pin this
  baseCanvas: "action_operation",      // the floor this surface specializes
  layering: "wrap",                    // "wrap" | "eject"
  provenance: "first-party",           // "first-party" | "community"
  situations: [{ tool: "stripe", kind: "action_operation" }], // discovery hint, NOT auto-apply
  sampleFixture: "stripe-refund",      // fixture id for the .stories.tsx preview
}
```

For an in-repo first-party surface, the manifest file under the surface directory re-exports from `REGISTERED_SURFACE_MANIFESTS`:

```ts
// surfaces/stripe-refund-review/manifest.ts
import { REGISTERED_SURFACE_MANIFESTS } from "@hyperidle/shared";
const entry = REGISTERED_SURFACE_MANIFESTS.find((m) => m.id === "stripe-refund-review");
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

## Step 5 — Register the surface (first-party only)

First-party surfaces register directly in `packages/web/src/pages/review/surfaces/surface-registry.ts` by calling `registerSurface()`:

```ts
registerSurface(
  stripeRefundReviewManifest as SurfaceManifest & {
    readonly baseCanvas: "action_operation";
  },
  StripeRefundReview as ReviewCanvasComponent,
);
```

Community surfaces installed via `surface:add` are registered automatically via the generated `register.ts` + `surface-registry.generated.ts` — no manual wiring needed.

## Eject mode

When wrap slots can't express the specialization you need (structural rearrangement, or the base canvas doesn't have wired seams yet), use eject:

1. Copy the base canvas's `.tsx` source into your surface directory.
2. Modify it freely — you own the file.
3. Set `layering: "eject"` in the manifest.
4. When the base canvas upstream changes, hand-migrate your copy (no automatic upgrade).

## Lint guards

Two ESLint rules enforce the structural invariants:

| Rule | File scope | What it forbids |
|---|---|---|
| `design/no-surface-network-import` | `surfaces/**` (non-test, non-story) | `apiFetch`, `/services/` imports, `@hyperidle/server` |
| `no-restricted-imports` (eslint.config.ts) | `surfaces/**/register.ts`, `surfaces/**/*.generated.ts` | Any relative path resolving to `surface-registry.ts` — must import `registerSurface` from `surface-registry-api.ts` only |

The second guard is the **TDZ cycle guard**: `surface-registry.ts` → `surface-registry.generated.ts` → `<id>/register.ts`. If `register.ts` imported from `surface-registry.ts`, the ESM cycle would trigger a ReferenceError (`REGISTRY` in the temporal dead zone) on a fresh Node process. `surface-registry-api.ts` is the cycle-free leaf — it holds `REGISTRY` and `registerSurface` with no imports from `surface-registry.ts`.

## Hard rules summary

| Rule | Enforcement |
|---|---|
| Surfaces render from props only — no `apiFetch`, no `/services/` imports | `design/no-surface-network-import` ESLint rule |
| `register.ts` / `*.generated.ts` import only from `surface-registry-api` | `no-restricted-imports` in `eslint.config.ts` |
| Closed `LayeringMode`: `"wrap"` or `"eject"` | TypeScript union |
| Closed `SurfaceProvenance`: `"first-party"` or `"community"` | TypeScript union |
| At-most-one adoption per `(teamId, tool, kind)` | DB unique index `surface_adoptions_team_situation_idx` |
| Base canvas always renders on surface failure | `SurfaceBoundary` React error boundary wrapping every resolved surface |
| AL7 `OutcomeBand` preserved through wrapped surfaces | `status`/`outcome`/`proposedCall` forwarded in the `action_operation` render branch |
| Every surface has a `.stories.tsx` | Code review convention |

## File layout

```
packages/
  shared/src/
    review-surface.ts                  # SurfaceManifest, AdoptionView, REGISTERED_SURFACE_MANIFESTS, sentinel
    registry-index.ts                  # RegistryIndex, OFFICIAL_REGISTRY_INDEX, loadRegistryIndex()
    add-install.ts                     # parseAddSource(), installSurface(), generateRegistrationFile(),
                                       #   updateRegistryGeneratedIndex()
  web/src/pages/review/
    surface-slots.ts                   # SlotName, CanvasSlots, slot() helper
    slot-policy.ts                     # SLOT_POLICY, slotPermission()
    surfaces/
      surface-registry-api.ts         # REGISTRY Map, SurfaceRegistryEntry, registerSurface() — TDZ-safe leaf
      surface-registry.ts             # getSurfaceEntry(), listSurfaces(), listRegisteredManifests()
      surface-registry.generated.ts   # AUTO-GENERATED — imports installed surface register.ts files
      resolve-surface.ts              # resolveSurface() — pure Map lookup
      SurfaceBoundary.tsx             # React error boundary (floor fallback)
      stripe-refund-review/
        manifest.ts                   # re-export from REGISTERED_SURFACE_MANIFESTS
        StripeRefundReview.tsx
        StripeRefundReview.stories.tsx
      <community-id>/                  # created by surface:add
        registry-item.json            # source manifest
        <Component>.tsx               # surface component
        <Component>.stories.tsx       # preview stories
        register.ts                   # AUTO-GENERATED — calls registerSurface()
  db/src/schema.ts                     # surfaceAdoptions table
  server/src/routes/surface-adoptions.ts  # GET/POST/DELETE endpoints
  web/src/settings/
    SettingsReviewSurfaces.tsx         # adopt/browse UI
  eslint-plugin-design/src/rules/
    no-surface-network-import.ts       # AC5 lint guard
scripts/
  surface-add.ts                       # `npm run surface:add` entry point
```
