# AL5 — Architecture: Review surfaces (code, registry-distributed, deliberately adopted)

**Workpackage:** AL5 (Track AL). **Inputs (fixed):** `plans/AL5/concept.md` (LOCKED), `plans/AL1/concept.md`, `plans/AN/concept.md`, the AL2 base canvases in `packages/web/src/pages/review/`, the AN1 connections surface (`SettingsConnections.tsx` + `routes/connections.ts` + `connection.ts`), the `kinds/registry.ts` pattern.
**Design:** `plans/AL5/design/adopt-surface.md` (DESIGN-CLASS routine).
**Date:** 2026-06-25.

> **Concept→spec reconciliation note (for the reviewer/orchestrator).** The TRACK-AL.md AL5 ACs still carry the word "sandboxed" from the superseded draft 1. The **locked concept explicitly supersedes** that: trust = adopt-time code review + ownership, **NOT** a runtime sandbox (concept §Phase 2 "an untrusted sandboxed plugin", hard-rule #1). This architecture honors the **concept** as authoritative. I therefore read AC4 ("renders safely — sandboxed, with a trust tier — and cannot compromise the host") as **"renders behind an error boundary + carries a trust tier; a malformed/failed surface degrades to the base canvas and cannot break the host review"** — same safety property (host never breaks), achieved by the concept's mechanism (floor fallback + adopt-time provenance), not an iframe. Flagged rather than edited; if the founder wants literal runtime sandboxing, that contradicts the locked concept and must go back to `/concept`.

---

## 0. Shape in one breath

A **review surface** is a React component (+ a `surface-manifest` descriptor) that **wraps** or **ejects** a base canvas. Surfaces are listed in a **registry** (a JSON index of manifest entries; first-party shipped in-repo, community pointed-to by URL). A team's **adoption** is a committed, version-pinned `(situation → surface)` row in the DB (echoing `serviceConnections`). At review render, `ExaminePane` asks a pure `resolveSurface(situation, adoptions, registry)` which returns **exactly one** of: the adopted surface component, or the base canvas (the floor) — **no scoring**. The chosen surface renders inside an **error boundary**; any throw falls through to the base canvas. The worked proof vehicle is a first-party `stripe-refund-review` surface wrapping `action_operation`.

The render site adds **no screen** — it is the existing `<Canvas artifact={…}/>` slot in `ReviewComposition.tsx`. The only new pixels are the adopt/browse Settings surface + the in-review "rendered by X · swap" line (design doc).

---

## 1. The base-canvas slot/extension API (`wrap | eject | forbidden`)

### 1.1 What the base canvases are today

Each base canvas is a `ReviewCanvasComponent<TPayload> = ComponentType<{ artifact: ReviewArtifact<TPayload> }>` (`review-artifact.ts`). `getReviewCanvas(kind)` (`canvas-registry.ts`) maps the 9 `ReviewCanvasKind`s to components; unknown → `ReviewUnknownCanvas`. They render a self-contained card and **take no children/slots today.** That is the gap AL5 fills minimally.

### 1.2 The slot contract — additive, typed, opt-in

A base canvas exposes wrap points by accepting an **optional `slots` prop**. A surface that *wraps* passes slot nodes; the base composes them at declared seams. A base that declares no slots can still be *ejected*. We do **not** retrofit slots into all 9 canvases in AL5 — only into the **`action_operation`** canvas (the proof vehicle) + define the contract for the rest. (Task list §8 scopes this.)

New shared types in **`packages/web/src/pages/review/surface-slots.ts`** (web, because slots are React nodes):

```ts
// The seams a base canvas may expose. CLOSED per-canvas; OPEN as a vocabulary
// (each canvas declares its own subset). Names are stable contract.
export type SlotName =
  | "header"        // above the canvas card body (after CanvasSourceHeader)
  | "lead"          // the canvas's primary summary region
  | "detail"        // the main body / receipt / change-set region
  | "aside"         // a right/secondary column
  | "footer";       // below the body, before card edge

export type SlotPermission = "wrap" | "eject" | "forbidden";

// A base canvas declares, per slot, how a surface may extend it.
export type SlotPolicy = Readonly<Partial<Record<SlotName, SlotPermission>>>;

// What a wrapping surface passes in. A node OVERRIDES the base region;
// absence => the base renders its own default. `forbidden` slots are type-rejected
// at author time via the per-canvas policy (see 1.4) + lint (§9).
export type CanvasSlots = Readonly<Partial<Record<SlotName, React.ReactNode>>>;
```

Extend `ReviewCanvasProps` (additive, optional — every existing call site keeps compiling):

```ts
export interface ReviewCanvasProps<TPayload = unknown> {
  readonly artifact: ReviewArtifact<TPayload>;
  readonly slots?: CanvasSlots;            // NEW — undefined => base renders defaults
}
```

### 1.3 How a base canvas consumes slots (the seam)

A base renders `slots?.<name> ?? <its own default>` at each seam it supports. Minimal helper in `surface-slots.ts`:

```ts
export function slot(slots: CanvasSlots | undefined, name: SlotName, fallback: React.ReactNode): React.ReactNode {
  return slots?.[name] ?? fallback;
}
```

For AL5, `ReviewActionOperation` gains seams at `header`, `lead`, `detail`, `footer` (its existing structural regions) and declares `aside: "forbidden"`. The other 8 canvases keep `slots` optional+ignored in AL5 and declare a policy stub (their slot wiring is a fast follow, out of AL5's proof scope — concept allows the floor to render unchanged).

### 1.4 Declaring the policy (`wrap | eject | forbidden`)

Each canvas exports a `SlotPolicy`. Collected in a new **`packages/web/src/pages/review/slot-policy.ts`**:

```ts
import type { ReviewCanvasKind } from "./review-artifact.js";
import type { SlotPolicy } from "./surface-slots.js";

export const SLOT_POLICY: Readonly<Record<ReviewCanvasKind, SlotPolicy>> = {
  action_operation: { header: "wrap", lead: "wrap", detail: "wrap", footer: "wrap", aside: "forbidden" },
  // AL5 stubs — eject allowed, no wrap seams wired yet:
  outcome_summary:  { /* eject-only until seams wired */ },
  field_change_set: {},
  rendered_in_context: {},
  metrics_moved: {},
  visual_diff: {},
  code_diff: {},
  batch: {},
  browser_preview: {},
};

export function slotPermission(kind: ReviewCanvasKind, name: SlotName): SlotPermission {
  return SLOT_POLICY[kind][name] ?? "eject"; // unlisted seam: not a wrap point → eject to change it
}
```

**Wrap** = surface passes `slots`; base composes (upgrade-safe — surface never copied base internals). **Eject** = surface copies a base canvas's `.tsx` source into its own file and owns it (a base upgrade must be hand-migrated). **Forbidden** = the base type-rejects a slot node there (lint §9 + the policy lookup); a surface needing that region must eject. This is the Docusaurus Safe/Unsafe/Forbidden taxonomy, made a typed per-canvas declaration.

> **Trade-off (quantified).** Full slot-wiring of all 9 canvases = ~9 components × ~4 seams of churn + 9 policy entries + re-bless of 9 snapshots. AL5 wires **only `action_operation`** (1 component) and declares policy for all 9 (cheap), proving the contract end-to-end while keeping the surface area of the build small. Cost deferred: 8 canvases can only be **ejected** (not wrapped) until their seams are wired — acceptable because eject is a first-class mode and no first-party surface beyond the proof vehicle ships in AL5.

---

## 2. The Review surface unit (component + manifest)

### 2.1 The component contract

A surface is an ordinary `ReviewCanvasComponent<TPayload>` — **same signature as a base canvas** (`{ artifact, slots? }`). This is deliberate: a surface *is* a canvas (a specialized one), so the existing render site, the `ReviewCanvasProvider` anchor context, and `ExaminePane` need no new component type. A **wrap** surface internally renders its base canvas with `slots` it supplies; an **eject** surface renders its own forked tree.

The proof vehicle (`packages/web/src/pages/review/surfaces/stripe-refund-review/StripeRefundReview.tsx`):

```ts
import { ReviewActionOperation } from "../../ReviewActionOperation.js";
import type { ReviewCanvasProps, ActionOperationPayload } from "../../review-artifact.js";

// WRAP: render the action_operation base, overriding the `lead` seam with a
// refund-specific summary (refund id, charge, customer, reversibility window).
export function StripeRefundReview({ artifact }: ReviewCanvasProps<ActionOperationPayload>): JSX.Element {
  return (
    <ReviewActionOperation
      artifact={artifact}
      slots={{ lead: <RefundLead payload={artifact.payload} />, footer: <RefundRoutingNote .../> }}
    />
  );
}
```

It never touches the verdict, staged action, or AL7 gate — it is presentation. (Concept hard-rule #5. AC5 — actions route back through the existing connection — is satisfied structurally: the surface renders `ReviewActionOperation`, whose action affordances already route through HyperIdle's review→AL7→connection path; the surface adds *no* new execution path. See §6.4.)

### 2.2 The manifest (`SurfaceManifest`) — echoes shadcn registry-item + `KindDefinition`

New shared type **`packages/shared/src/review-surface.ts`** (shared because both the web registry loader and the server adoption resolver reference the *shape*; the **component** stays in web):

```ts
import { TRUST_TIERS, type TrustTier } from "./connection.js";

/** Where the surface sits on its base canvas. CLOSED (concept). */
export const LAYERING_MODES = ["wrap", "eject"] as const;
export type LayeringMode = (typeof LAYERING_MODES)[number];

/** Who authored it. CLOSED. Distinct from TrustTier (vetted|community). */
export const SURFACE_PROVENANCE = ["first-party", "community"] as const;
export type SurfaceProvenance = (typeof SURFACE_PROVENANCE)[number];

/**
 * The descriptor that accompanies a review-surface component. Mirrors a shadcn
 * registry-item.json: an id, the base canvas it specializes (registryDependency),
 * npm deps, provenance/trust, version, and bundled sample data for preview.
 * @lore AL5: NO component reference here — shared has no React. The registry
 * (web) joins manifest.id → component. Same split as KindDefinition (schema in
 * shared, renderer in web).
 */
export interface SurfaceManifest {
  /** Stable registry id, namespaced for community: "stripe-refund-review" | "@acme/figma-review". */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** "Name <email>" (shadcn author convention). */
  readonly author: string;
  /** semver. Adoptions PIN this. */
  readonly version: string;
  /** The base canvas it specializes — the shadcn `registryDependencies` of the floor. */
  readonly baseCanvas: ReviewCanvasKind;      // imported from review-artifact-kinds (see 2.3)
  readonly layering: LayeringMode;
  readonly provenance: SurfaceProvenance;
  readonly trustTier: TrustTier;              // {vetted, community} — reused from AN, not redefined
  /** npm runtime deps, shadcn-style "pkg@1.2.3". Informational at AL5 (in-repo build). */
  readonly dependencies?: readonly string[];
  /** The (tool, kind) situations this surface is BUILT for — discovery hint, NOT auto-apply.
   *  Adoption is still an explicit human choice; this only pre-filters the browse dialog. */
  readonly situations: readonly SurfaceSituation[];
  /** Bundled sample fixture id for the preview (renders the surface's .stories.tsx). */
  readonly sampleFixture: string;
}

/** The addressable review situation: a (tool, kind) pair. */
export interface SurfaceSituation {
  readonly tool: string;        // "stripe"
  readonly kind: ReviewCanvasKind; // "action_operation"
}
```

> **`ReviewCanvasKind` lives in `packages/web` today.** To reference it from `shared`, move the **kind union string literal** (not the components) into a tiny new `packages/shared/src/review-surface.ts` co-located `REVIEW_CANVAS_KINDS` const, and have web's `review-artifact.ts` re-export it. Cheap, no behavior change, keeps the import direction legal (web → shared). (Task §8 A2.)

### 2.3 The registry entry binds manifest → component (web)

**`packages/web/src/pages/review/surfaces/surface-registry.ts`** — echoes `kinds/registry.ts` (a `Map`, not `import.meta.glob`, so it works in tests; concept-cited shadcn behavior is "fetch by id", which a Map models for first-party):

```ts
export interface SurfaceRegistryEntry {
  readonly manifest: SurfaceManifest;
  readonly component: ReviewCanvasComponent;
}

const FIRST_PARTY: ReadonlyArray<SurfaceRegistryEntry> = [
  { manifest: stripeRefundReviewManifest, component: StripeRefundReview },
];

// id → entry. Community URL-registries layer on top (§3.2).
const REGISTRY = new Map(FIRST_PARTY.map((e) => [e.manifest.id, e]));

export function getSurfaceEntry(id: string): SurfaceRegistryEntry | undefined {
  return REGISTRY.get(id);
}
export function listSurfaces(): ReadonlyArray<SurfaceRegistryEntry> {
  return [...REGISTRY.values()];
}
```

---

## 3. Registry / distribution

### 3.1 First-party (in-repo) — the floor of the mechanism

First-party surfaces are entries in `surface-registry.ts` (above), shipped in the bundle. Their manifests are the canonical example of the shape. This is "shippable, don't over-build": the mechanism works end-to-end with zero network.

### 3.2 Community (pointed-to) — addressable, not over-built

A deployment may register **community registry pointers**: a URL serving a `surface-registry.json` index (an array of `SurfaceManifest` + a resolvable component module URL). AL5 ships the **data shape + the "add a registry URL" seam**, mirroring AN1's mcp-oauth "point at a server URL" — but **does not** fetch+eval remote component code at runtime (that would reintroduce the untrusted-runtime problem the concept rejects). Instead, a community surface is **adopted by copying its source into the repo** (shadcn "the source is yours") — the registry URL is the *discovery + provenance* source, the adopted code is owned/in-repo. So:

- **Registry index shape** (served by anyone): `{ url, manifests: SurfaceManifest[] }`. Type in `review-surface.ts`.
- **Adopting a community surface** in AL5 = recording the adoption (id + version + provenance=community + trustTier=community) against an in-repo entry the team added to `surface-registry.ts`. The browse dialog can *display* remote manifests (read-only metadata + provenance/trust) and link to their source; the build-time copy is the team's deliberate act.

> **Trade-off (quantified).** Live remote-code loading (eval a remote ESM module per render) would cost: a runtime fetch/eval path, a CSP/SRI story, a remote-failure render path, and — fatally — it puts unreviewed code in the render loop, violating concept hard-rules #1/#2. Cost of the chosen path: community surfaces require a build-time copy step (one PR) before they're active. That is exactly shadcn's model and the concept's intent (own the source). **We pay one PR; we avoid an entire runtime-sandbox subsystem.** AL5 scope = first-party registry working end-to-end + the community-pointer data shape + browse-display of remote manifests. Live remote module loading is explicitly out of scope (and arguably never wanted).

---

## 4. Adoption — store + deterministic resolution

### 4.1 The store (server/db — echoes `serviceConnections`)

New table **`surfaceAdoptions`** in `packages/db/src/schema.ts`:

```ts
export const surfaceAdoptions = pgTable(
  "surface_adoptions",
  {
    id: text("id").primaryKey(),                  // sa-<uuid>
    // Adoption is a DEPLOYMENT/team-owned choice, not per-user. Scope = team.
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),                 // situation.tool  ("stripe")
    kind: text("kind").notNull(),                 // situation.kind  ("action_operation")
    surfaceId: text("surface_id").notNull(),      // manifest.id
    pinnedVersion: text("pinned_version").notNull(), // manifest.version at adopt time
    provenance: text("provenance").notNull(),     // "first-party" | "community"
    trustTier: text("trust_tier").notNull(),      // {vetted, community}
    adoptedBy: text("adopted_by").notNull().references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    // EXACTLY ONE adopted surface per (team × situation) — enforces concept "0..1 adopted".
    uniqueIndex("surface_adoptions_team_situation_idx").on(t.teamId, t.tool, t.kind),
    index("surface_adoptions_team_idx").on(t.teamId),
  ],
);
export type SurfaceAdoptionRow = typeof surfaceAdoptions.$inferSelect;
```

The unique index is the structural guarantee of concept hard-rule #2 (no runtime competition: at most one adoption per situation; the DB *cannot* hold two). "Default adoptions" = **the absence of a row** ⇒ the base canvas (the floor) — we do **not** seed base-canvas rows (the floor is the default-by-absence; a row only ever names a *surface*). First-party surfaces are *available* by default but **not auto-adopted** (concept: even first-party runs only by deliberate adoption) — except an optional, explicit seed of marque first-party adoptions (e.g. seed one `stripe-refund-review` adoption for the demo team) recorded as real adoption rows so "who chose it = the seed/installer" stays answerable.

### 4.2 Resolution — pure, deterministic, no scoring

The render-time resolver lives in **`packages/web/src/pages/review/surfaces/resolve-surface.ts`** (web — it returns a component):

```ts
export interface ResolvedSurface {
  readonly component: ReviewCanvasComponent;
  readonly source: "adopted" | "base";
  readonly manifest?: SurfaceManifest;       // present when source==="adopted"
  readonly degraded?: "missing-surface" | "version-mismatch"; // why we fell to base despite an adoption
}

export function resolveSurface(
  situation: SurfaceSituation,
  adoption: AdoptionView | undefined,         // the team's row for this situation, fetched by the loader
  base: ReviewCanvasComponent,                // getReviewCanvas(situation.kind)
): ResolvedSurface {
  if (!adoption) return { component: base, source: "base" };
  const entry = getSurfaceEntry(adoption.surfaceId);
  if (!entry) return { component: base, source: "base", degraded: "missing-surface" };
  // version pin is informational at AL5 (in-repo single version); record mismatch, still render the entry.
  const degraded = entry.manifest.version !== adoption.pinnedVersion ? "version-mismatch" as const : undefined;
  return { component: entry.component, source: "adopted", manifest: entry.manifest, degraded };
}
```

**Determinism = a Map lookup keyed by the explicit adoption row.** There is no candidate set, no ranking, no `situations`-matching at render. `situations` on the manifest only pre-filters the *browse dialog*. This is the literal implementation of "NO runtime auto-apply."

### 4.3 Where it plugs in (the render site — NO new screen)

In `ReviewComposition.tsx` `ExaminePane`, today:
```ts
const Canvas = getReviewCanvas(artifact.kind);     // → replaced
```
becomes:
```ts
const base = getReviewCanvas(artifact.kind);
const resolved = resolveSurface(
  { tool: artifact.tool, kind: artifact.kind },
  adoptionFor(artifact.tool, artifact.kind),       // from adoptions prop passed down from the loader
  base,
);
const Canvas = resolved.component;
```
`adoptions` is loaded once by the review loader (one GET, §5) and threaded through `ReviewComposition` props (additive optional prop `adoptions?: AdoptionView[]`; default `[]` ⇒ everything resolves to base — every existing story/test keeps passing). The `action_operation` special-case branch in `ExaminePane` stays, but now `resolveSurface` may return a wrapping surface that *itself* renders `ReviewActionOperation` with `status/outcome/proposedCall` forwarded via its slots.

### 4.4 Error boundary (the host-safety guarantee, AC4)

Wrap the resolved canvas in **`packages/web/src/pages/review/surfaces/SurfaceBoundary.tsx`** — a React error boundary (class component, the only React way) that, on any throw during the surface's render, renders the **base canvas** instead and surfaces a `degraded` reason to the "rendered by X" line. This is the concept's floor-always-works made literal: a malformed surface **cannot break the host review** because the host catches it and renders the floor. No iframe, no sandbox — an error boundary + the floor.

```tsx
<SurfaceBoundary fallback={<Base artifact={artifact} />} onCaught={() => markDegraded("threw")}>
  <Canvas artifact={artifact} slots={…} />
</SurfaceBoundary>
```

### 4.5 Swap

Swap = `UPSERT` the `surfaceAdoptions` row for `(team, tool, kind)` to a new `surfaceId` + re-pin version (the unique index makes it a replace, not an accumulate). Reset-to-base = `DELETE` the row (absence ⇒ floor). Both are ordinary mutations; reversible; never touch a verdict.

---

## 5. Server API — adoptions (echoes `routes/connections.ts`)

New **`packages/server/src/routes/surface-adoptions.ts`**, registered in `app.ts` (`api.route("/surface-adoptions", createSurfaceAdoptionRoutes(options.db))`), same `requireBoundary` + `authorizeRead/Write` + rate-limit pattern as connections, scoped by **teamId** (membership-checked, not userId-self):

| Method | Path | Body / result |
|---|---|---|
| `GET` | `/api/surface-adoptions?teamId=…` | `AdoptionView[]` — the team's adopted rows (never a secret; pure config). |
| `GET` | `/api/surface-registry` | `SurfaceManifest[]` — first-party manifests + any configured community-pointer manifests (read-only metadata). Powers the browse dialog. |
| `POST` | `/api/surface-adoptions` | `{ teamId, tool, kind, surfaceId }` → upsert, pin current registry version, 201 `AdoptionView`. Validates `surfaceId` exists in registry (else 400) and is build-time available. |
| `DELETE` | `/api/surface-adoptions/:id` | reset-to-base; cross-team → 404 (don't leak). 204. |

`AdoptionView` (shared, `review-surface.ts`): `{ id, tool, kind, surfaceId, pinnedVersion, provenance, trustTier, surfaceTitle, baseCanvas }` — a flat display shape, server-joined against the registry for `surfaceTitle/baseCanvas`. The review loader (`/api/reviews/:id`) is **extended** to include the resolved adoptions for the subject's artifact situations, so the composition needs one fetch, not N.

> **Boundary (AL5 ⟂ AN4).** This route owns review-surface adoption only. The connector registry (AN4) is separate. A connector manifest (AN4) *may* carry a `preferredSurfaceId` referencing a `SurfaceManifest.id` — a reference, not ownership. AL5 builds none of AN4.

---

## 6. The worked example — `stripe-refund-review` end-to-end

1. **Manifest** (`surfaces/stripe-refund-review/manifest.ts`): `id: "stripe-refund-review"`, `baseCanvas: "action_operation"`, `layering: "wrap"`, `provenance: "first-party"`, `trustTier: "vetted"`, `version: "1.0.0"`, `situations: [{ tool: "stripe", kind: "action_operation" }]`, `sampleFixture: "stripe-refund"`.
2. **Component** (`StripeRefundReview.tsx`): wraps `ReviewActionOperation`, overriding `lead` (refund id / charge / customer / reversibility window) + `footer` (a routing note: "Approving refunds via your Stripe connection"). Has a `.stories.tsx` rendering it against the sample fixture → the preview the browse dialog iframes from `:8098`.
3. **Registry**: the entry is in `FIRST_PARTY` → `getSurfaceEntry("stripe-refund-review")` resolves it.
4. **Adoption**: team owner opens Settings → Review surfaces → Browse → previews → **Adopt for `Stripe · action_operation`** → `POST /api/surface-adoptions` writes the row pinned at `1.0.0`.
5. **Render**: a Stripe refund artifact (`tool:"stripe", kind:"action_operation"`) opens in `ExaminePane`; the loader supplied the adoption; `resolveSurface` returns `StripeRefundReview`; `SurfaceBoundary` renders it; the "Rendered by stripe-refund-review @1.0.0 · First-party · vetted" line shows.
6. **Floor proof**: a `tool:"github", kind:"action_operation"` artifact has no adoption ⇒ `resolveSurface` returns the base `ReviewActionOperation`; line shows "Base canvas (action_operation)".
7. **Degrade proof**: force a throw inside `StripeRefundReview` (test) ⇒ `SurfaceBoundary` renders the base; line shows "Base canvas · surface unavailable". Host review intact.

### 6.4 AC5 — actions route through the existing connection

The surface renders `ReviewActionOperation`; it adds **no** `fetch`/mutation of its own. The refund's execute path is the existing review→verdict→AL7→broker→connection chain (untouched). The surface only changes the *presentation* of that staged action. A lint guard (§9) forbids a surface module from importing `apiFetch` / issuing network calls, structurally enforcing "lens, never the decision" + AC5.

---

## 7. States

| State | Behavior |
|---|---|
| Adopted surface present + loads | surface renders (wrap or eject) |
| No adoption | base canvas renders (floor) |
| Adoption names a missing/unbuilt surfaceId | base renders; `degraded: "missing-surface"` shown |
| Surface throws at render | `SurfaceBoundary` → base renders; `degraded` shown |
| Version pin ≠ registry version | renders entry; `degraded: "version-mismatch"` noted (informational AL5) |

Loading/empty/error of the *Settings surface* itself: builder-owned (design doc defers them).

---

## 8. Ordered task list (file paths; split into two buildable units)

### Unit A — slot contracts + surface component model + the example (web + shared)
- **A1** `packages/web/src/pages/review/surface-slots.ts` — `SlotName`, `SlotPermission`, `SlotPolicy`, `CanvasSlots`, `slot()` helper. *(web)*
- **A2** `packages/shared/src/review-surface.ts` — `SurfaceManifest`, `SurfaceSituation`, `LayeringMode`, `SurfaceProvenance`, `AdoptionView`, registry-index shape, `REVIEW_CANVAS_KINDS` const (move the kind union here). Re-export from `packages/shared/src/index.ts`. *(shared)*
- **A3** `packages/web/src/pages/review/review-artifact.ts` — add optional `slots?: CanvasSlots` to `ReviewCanvasProps`; re-export kinds from shared. *(web)*
- **A4** `packages/web/src/pages/review/slot-policy.ts` — `SLOT_POLICY` (all 9) + `slotPermission()`. *(web)*
- **A5** `packages/web/src/pages/review/ReviewActionOperation.tsx` — wire 4 slot seams (`header/lead/detail/footer`) via `slot()`; declare `aside` unused. *(web — re-bless its snapshot)*
- **A6** `surfaces/stripe-refund-review/{manifest.ts, StripeRefundReview.tsx, StripeRefundReview.stories.tsx}` + sample fixture. *(web)*
- **A7** `surfaces/surface-registry.ts` — `SurfaceRegistryEntry`, `REGISTRY` Map, `getSurfaceEntry`, `listSurfaces`. *(web)*
- **A8** `surfaces/resolve-surface.ts` + `surfaces/SurfaceBoundary.tsx`. *(web)*

### Unit B — adoption store + resolution wiring + adopt UI (db + server + web)
- **B1** `packages/db/src/schema.ts` — `surfaceAdoptions` table + types; `npm run db:generate` migration. *(db)*
- **B2** `packages/server/src/routes/surface-adoptions.ts` + register in `app.ts`. *(server)*
- **B3** review loader (`/api/reviews/:id` builder, server) — include resolved `adoptions` for the subject's situations. *(server)*
- **B4** `ReviewComposition.tsx` — accept `adoptions?` prop; replace `getReviewCanvas` call in `ExaminePane` with `resolveSurface` + `SurfaceBoundary`; add the "Rendered by X · swap" line (design doc Surface 2). *(web — re-bless composition snapshot)*
- **B5** `packages/web/src/settings/SettingsReviewSurfaces.tsx` (+ `.stories.tsx`) — adopt/browse surface (design doc Surface 1), composed from `Row/ItemList/SectionLabel/StatusChip/Tag/Button/Dialog/Select/Menu`; preview iframe to `:8098`. *(web)*
- **B6** wire `SettingsReviewSurfaces` into the settings nav. *(web)*

**Dependency order:** A before B (B's resolver imports A's registry/types). Within A: A2→A3→(A1,A4)→A5→A6→A7→A8. B1→B2→B3→B4; B5→B6 parallel to B2–B4.

---

## 9. Validation method per AC / scenario

| AC / scenario | Method | Where |
|---|---|---|
| AC1/AC2 — adopted (first-party **or** community) surface renders instead of base | **runtime component test**: render `ExaminePane`/`resolveSurface` with an adoption row → asserts the surface component renders (its testid), not the base. | `surfaces/__tests__/resolve-surface.test.tsx` |
| AC3 — no adoption ⇒ base canvas (floor) | **runtime test**: `resolveSurface(situation, undefined, base)` → `source:"base"`, base testid renders. | same |
| AC4 — malformed/failed surface cannot break host (concept reading: error boundary + floor) | **runtime test**: a surface stub that throws → `SurfaceBoundary` renders base; host composition still renders verdict/conversation. | `surfaces/__tests__/SurfaceBoundary.test.tsx` |
| AC5 — actions route through existing connection (no re-impl) | **lint rule** (static): a module under `surfaces/**` may not import `apiFetch`/issue network calls → enforces "lens, never decision" structurally. Plus a runtime test that the surface renders the base's action affordance (which uses the existing path). | `eslint` rule + component test |
| Scenario: version pin / degrade visibility | **runtime test**: adoption with stale `pinnedVersion` → `degraded:"version-mismatch"`; missing surfaceId → `degraded:"missing-surface"`; the line text asserts. | `resolve-surface.test.tsx` |
| Adoption store: at-most-one per situation; swap replaces; reset deletes | **integration test** (`*.integration.test.ts`, `{db, app}`): POST twice for same situation → one row, second replaces; DELETE → absence; cross-team → 404. | `surface-adoptions.integration.test.ts` |
| Per-slot `wrap|eject|forbidden` policy is typed/declared for all 9 | **type test** + **unit test**: `slotPermission(kind, name)` returns the declared value; `forbidden` slot rejected. | `slot-policy.test.ts` |
| Slot contract is additive (no existing canvas/story breaks) | `npm run check` (optional prop) + the **catalog DOM-snapshot net** re-bless showing only the intended `action_operation` + composition diffs. | check + snapshot |
| Manifest shape mirrors registry-item; provenance/trust closed sets | **type test** asserting `SurfaceManifest` field presence + `TrustTier`/`SurfaceProvenance` closed unions. | `review-surface.test.ts` |
| Visual: surface renders in the slot; "rendered by X" line; floor | `.stories.tsx` for `StripeRefundReview` + a composition story with an adoption → the snapshot net + `:8098` viewer (design proof). | stories + snapshot |

> **Note (builder, not designer):** all tests/check/lint/snapshot-bless are the builder's green phase. This section is the **plan**, not executed work.

---

## 10. Risks / open decisions for the reviewer to scrutinize

1. **The "sandboxed" AC vs the locked concept (§0 reconciliation note).** Highest-stakes item. I architected to the concept (error boundary + floor + adopt-time trust), not a runtime sandbox. If the founder reads AC4 literally (iframe/worker isolation), it contradicts the locked concept and is a concept reopen, not an architecture fix. **Flag, don't silently resolve.**
2. **Adoption scope = team, not user.** I chose `teamId` (a deployment/team owns its review surfaces; the design says "the team adopts"). If adoption should be per-user or per-deployment-singleton, the table key changes. Cheap to change now, expensive after the migration ships.
3. **Slot wiring limited to `action_operation` in AL5.** The other 8 canvases are eject-only until their seams are wired. Is proving the contract on one canvas + policy-for-all sufficient for AL5, or must all 9 expose wrap seams? (I argue one is enough — concept allows the floor unchanged; quantified in §1.4.)
4. **Community = build-time copy, no live remote eval.** I deliberately scoped out runtime remote-module loading (it reintroduces the untrusted-runtime problem the concept rejects). If the founder expects community surfaces to "just work" from a URL at runtime, that is a different (and concept-contradicting) build. **Confirm the build-time-copy model is the intent.**
5. **`ReviewCanvasKind` move to shared.** Small but cross-package; verify no circular import (`review-artifact.ts` re-exporting from shared is the safe direction).
6. **Version pinning is informational at AL5** (single in-repo version per surface). Real multi-version registries + the shadcn `diff`/migration tooling are deferred. Confirm that's acceptable AL5 scope.
