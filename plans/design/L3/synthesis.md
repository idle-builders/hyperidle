# L3 — Artifact Primitive — Synthesis

**Step.** /design Phase 4 — synthesis.
**Inputs.** Variants A, B, C; their critiques; comparison matrix.

---

## The pick

**Base:** Variant B — four sibling components.
**Pulled in:** Variant C's first-class sub-primitive exports.
**Rejected:** Variant A's monolithic single-component approach; Variant C's composition-as-closure-enforcement.

The synthesis ships **four top-level layout components plus four reusable sub-primitives** — eight total exports.

```
// Top-level layout components (Tier 2 — one per closed view-family layout)
<ArtifactGalleryCard data={...} threadCount={...} onOpen={...} state="..."/>
<ArtifactStackItem   data={...} threadCount={...} onOpen={...} state="..."/>
<ArtifactPreview     data={...} discussionSlot={...} state="..."/>
<ArtifactEmbed       data={...} onOpen={...} state="..."/>

// Reusable sub-primitives (Tier 1 — first-class exports for cross-surface reuse)
<ArtifactKindBadge kind="code_diff" />
<ArtifactCostChip cost={{ money, tokens }} variant="full" | "compact" />
<ArtifactTimestamp value={isoString} />
<ArtifactPreviewSurface kind={kind} preview={preview} size="gallery" | "full" />
```

The closed view family (§4.5 hard rule #2) is enforced at the export boundary — there is no fifth `Artifact*` top-level component. Adding one requires touching the package's index, which trips both review and an architecture-doc update.

---

## Why this synthesis (one paragraph)

Variant B's per-layout components win the closure-enforcement battle for the most load-bearing rule in the L3 concept. Variant A's monolithic approach has appeal for budget hygiene, but the embed's "no chrome" rule is too important to express via a string-prop branch — it deserves its own file with a lint guard. Variant C's slots pattern is a step backward on enforcement; the *good* idea inside C — exposing the sub-primitives as first-class — survives by being grafted onto B. The synthesis adds zero new chrome ideas; it's an architecture-and-API decision implemented with the visual language all three variants converged on.

---

## What we DO

| Decision | Rationale |
|---|---|
| Four top-level components, one per closed layout | Hard-enforces the closed-view-family rule via export boundary. |
| Four first-class sub-primitive exports | Reuse on notifications, knowledge mentions, search results. Single source of truth for kind/cost/time rendering inside L3 family. |
| ArtifactPreviewSurface owns the kind→preview switch | One file to read when adding a new kind renderer. Variant A's spec already had this; B made it a sub-primitive; we expose it. |
| Embed contributes only an identity strip + delegates to ArtifactView | Hard rule: the embed is a guest in review-message chrome. Lint rule (eventual): `ArtifactEmbed` root className must not contain `bg-`/`border-`/`rounded-`/`shadow-`. |
| Single full preview reserves a 320px right rail for the L1 thread | Future L11 mounts here. The slot is on the L3 component; the L1 thread is L11's job. |
| `ArtifactCostChip` has `variant="full"` and `variant="compact"` | Stack rows drop the token count; gallery shows both. Variant B critique flagged this; we pre-resolve it. |
| `cost === null` renders `—` (em-dash); never `$0.00` | Aligned with the L4 "render — not a fake number" discipline. |
| `preview === null` renders `PREVIEW PENDING` placeholder via `ArtifactPreviewSurface` | Hard rule #4: no fake thumbnails. The placeholder is owned by ArtifactPreviewSurface, so consumers can't accidentally re-implement it. |
| `kind` enum: 12 canonical kinds + catch-all renderer | Per Phase-0 §4. The architect closes the enum in /architecture; the design works regardless. |
| Thread count surfaced on gallery + stack only; never on embed; full thread on single_full_preview | Per Phase-0 §3, with rationale: the embed lives in a thread already; doubling would confuse. |

---

## What we explicitly DO NOT do (rejection list)

| Rejected | Variant of origin | Why we reject |
|---|---|---|
| Single `<Artifact layout="..." />` monolith | A | Loses the per-layout enforcement of "no chrome on embed". Single file becomes a switch-statement dump. |
| Slot-based `<ArtifactSurface variant="..." preview={...}>` | C | The closed-view-family rule (§4.5 hard rule #2) becomes a docs concern — anyone can compose a new recipe. The hard rule deserves an export boundary. |
| Per-kind color (e.g. green for verification, blue for code_diff) | proposed in critique | Lucid principle: color reserved for danger. Kind is text. |
| Per-kind iconography (a Lucide icon next to each `Tag`) | implicit slot | AQ-113 (over-iconification). Kind labels are mono uppercase text. Decorative icons don't earn their place. |
| Bundling thread-count rendering into ArtifactStackItem's chrome (always-on) | spec's first draft | Surface only when count > 0. Aligns with discipline of "earned, not given" footer chrome. |
| Hover state on the embed's identity strip | considered, then dropped | The embed lives inside a hovered review-message; double-hover state confuses. ArtifactView (delegated) owns its own preview hover. |
| A new component for the discussion sidebar inside `ArtifactPreview` | spec's first draft | This is L11's territory (rich review messages → threads). L3 reserves the slot, doesn't fill it. |
| `composition-tag` chrome that exposes API names on the visual surface | C's mockup | Promotional chrome. Premium UI doesn't expose the API. |
| Five-shape closure for ArtifactPreviewSurface that mirrors the existing ArtifactView | considered | The five ArtifactView shapes are render strategies for review-message payloads; ArtifactPreviewSurface dispatches by Artifact `kind`. They are different vocabularies and stay independent. |
| Decorative purple/indigo gradients, hero sections, oversized padding, etc. | none — never proposed | AESTHETICS.md AQ-101..AQ-113. |

---

## Component mapping (eight new exports)

### Tier 2 — top-level layout components (4)

| Component | Composes | Replaces / collides with |
|---|---|---|
| `ArtifactGalleryCard` | `ArtifactKindBadge`, `ArtifactPreviewSurface` (gallery), `ArtifactCostChip`, `ArtifactTimestamp`, optional thread-count chip | nothing — net new |
| `ArtifactStackItem` | `ArtifactKindBadge`, `ArtifactCostChip` (compact), `ArtifactTimestamp`, optional thread-count chip | nothing — net new |
| `ArtifactPreview` (single_full_preview) | `ArtifactKindBadge`, `ArtifactCostChip`, `ArtifactTimestamp`, `ArtifactPreviewSurface` (full), discussion slot | nothing — net new; reserves slot for L11/L1 thread |
| `ArtifactEmbed` | `ArtifactKindBadge`, `ArtifactCostChip`, `ArtifactTimestamp`, delegated `ArtifactView` (one of 5 shapes) | nothing — net new; consumes existing `ArtifactView` |

### Tier 1 — sub-primitive exports (4)

| Component | Use cases beyond L3 |
|---|---|
| `ArtifactKindBadge` | NotificationRow when notification mentions an artifact; search-result rows |
| `ArtifactCostChip` | Cost tally on bet detail page; session cost summaries (L4 territory) |
| `ArtifactTimestamp` | Generic relative-time renderer wherever artifacts are referenced |
| `ArtifactPreviewSurface` | Knowledge-row that links to an artifact; notification-row preview area |

### Existing components reused (no new components)

- `Tag` — *not* used directly; ArtifactKindBadge is a specialized-shape Tag. The kind label has stable styling that warrants its own component (e.g. `kind="code_diff"` produces `CODE DIFF` consistently).
- `ArtifactView` (existing Tier 3) — composed inside `ArtifactEmbed` and (when kind maps cleanly) inside `ArtifactPreview`'s body via `ArtifactPreviewSurface`.

---

## Total budget impact

- **+4 Tier 2** (the four layout components).
- **+4 Tier 1** (the four sub-primitives).
- **0 new Tier 3** (delegate to existing `ArtifactView`).

The the canonical-shapes contracts under docs/ baseline gains 8 new exports. Within the "no strict count enforced" policy, the count is justified by:
1. Each layout has a concrete consumer surface (Bet detail, Stack list, permalink page, review message).
2. Each sub-primitive has documented reuse beyond L3.

---

## Open questions surfaced for the architect (Step 3)

1. **`preview` field type closure.** The concept treats `preview` as polymorphic (text excerpt / structured payload / thumbnail-reference / null). The architect closes this as a discriminated union keyed by `kind`. The design assumes that closure exists.
2. **`kind` enum closure.** 12 canonical kinds proposed in Phase-0 §4. The architect decides if the enum is closed (TS literal union, fewer kinds = clearer downstream) or open (string with a default catch-all renderer). The design works either way; the catch-all renderer in `ArtifactPreviewSurface` is the safety net.
3. **Producing-task title denormalisation.** All four layouts need the producing-task's title — not just its ID. The fetching contract (§4.5) returns the canonical Artifact shape; the architect must decide whether to extend the response with `producing_task_title` (denormalised) or expose a separate batched task-title fetch. The design assumes the former.
4. **`ArtifactView`-shape derivation.** The embed delegates preview rendering to `ArtifactView`. The mapping `kind → ArtifactView shape` (e.g. `code_diff → text_diff`, `dashboard → data_metrics`) and the `kind + preview → ArtifactView payload` transformation must be specified somewhere. The design assumes a `getArtifactViewProps(artifact): { shape, payload }` helper lives in shared code.
5. **Thread-count fetching.** The fetching contract returns the canonical Artifact shape; thread-count is *not* in the canonical shape. The aggregation surfaces (gallery, stack) need it for the footer chip. Architect decides: is `thread_count` a denormalised field on the gallery/stack response, or a separate per-artifact lookup?
6. **`cost_from_session` shape.** The L4 spec (Cost & Tokens) is concurrent with L3. The design assumes `{ money, tokens }` as a `{ string | null, string | null }` for display purposes; the architect aligns with L4's actual money + token-usage type when L4 lands.
7. **State machine on `state` prop.** The design uses `state="populated" | "loading" | "error"` per layout. The architect decides whether this is a prop on each layout component or driven entirely by data shape (e.g. missing `preview` → loading; presence of an error field → error).
8. **Storybook / catalog story** for each of the eight new exports. The package convention (every custom component must have `.stories.tsx`) requires 8 story files. The architect plans the build order; design suggests: sub-primitives first, then layouts.

---

## Mobile adaptation summary (across all four layouts)

| Layout | < 1024px (auto-density flips) | < 640px | < 480px |
|---|---|---|---|
| `ArtifactGalleryCard` | density=comfortable; pad 12→16px | gallery grid drops to 1 column | thread-pill drops to footer's right edge; cost-chip stays |
| `ArtifactStackItem` | density=comfortable; row 44→56px | – | right cluster wraps: timestamp drops to second line under cost |
| `ArtifactPreview` | discussion sidebar drops below body | header meta wraps | – |
| `ArtifactEmbed` | inherits review-message container | inherits | inherits |

---

## Anti-pattern policing summary

The synthesis avoids:
- AQ-101 `rounded-2xl`/`rounded-3xl` (uses `--r1` / `--r2` only).
- AQ-102 indigo/purple gradients (none).
- AQ-103 oversized padding (uses `--density-card-pad` 8/12/16).
- AQ-105 emoji as iconography (kind labels are mono uppercase text).
- AQ-107 glass morphism (none — solid surfaces from ladder).
- AQ-108 3-column identical card grid (galleries demonstrate kind variance).
- AQ-109 lorem ipsum (all content from §6 of HUMAN_INTERFACE_LAYER.md).
- AQ-110 marketing superlatives (none).
- AQ-113 over-iconification (no decorative icons; the embed `→` arrow is the only icon and it's an affordance).

The screenshot-rubric tells (#1, #2, #4, #5, #7, #10, #13, #14, #15) all clear.
