# AF16 — Approved design

```
DESIGN-CLASS: routine  ref=WorkBet stat card + ArtifactPreviewSurface  pattern=existing (ArtifactPreview.html, work surfaces)
```

Two routine treatments. Both are corrections inside existing components — no new design-system shape, no component-budget cost. Hearth tokens only. The remaining AF16 defects (dead buttons, breadcrumbs, search order, doc hygiene, retention) are **non-design**: they are handler/route/comparator/doc/schedule fixes with no visible surface decision and are deferred to `/architecture`.

---

## Treatment A — Bet progress: zero-value / empty-state

**User task.** A founder opens a bet that has zero tasks (or no `progress` data) and must read its progress at a glance without being misled.

**Defect.** `packages/web/src/pages/WorkBet.tsx:1222-1234`. The guard is `bet.progress ? … : "0%"`, but `bet.progress` is a truthy object even when `total === 0`. So `done/total = 0/0 = NaN` → renders the literal string **"NaN%"**, and the bar's `style={{ width: "NaN%" }}` is invalid CSS the browser drops, leaving the inner accent div at its default block width → a **full green bar**. This is the exact Z8-019/020 example in the spec.

**Treatment (single variant — "honest zero, no bar lie").**

Progress is only meaningful when there is a denominator. Compute a single safe ratio up front and branch on *task count*, not on object truthiness:

- **Has tasks (`total > 0`):** percent = `Math.round((done / total) * 100)`, clamped `[0,100]`. Render `NN%` (24px, tabular-nums) + the accent bar filled to that width. Unchanged behavior — this path was never broken.
- **Zero tasks (`total === 0`) or `progress` absent:** render a real empty-state, not a fake zero:
  - Value line: **"No tasks yet"** at `13px text-[var(--text-secondary)]` (not a big "0%" — a `0%` number falsely implies measured-zero-of-something).
  - **No progress bar at all.** A bar with no denominator is meaningless; an empty track reads as "0% done" which is also a lie for a bet that hasn't been scoped. Omit the track entirely.
  - Keep the "Progress" card label so the stat row stays three-up and aligned with Budget/Team.

**States.**
- Populated, tasks done: `66%` + bar at 66%.
- Populated, no tasks done yet but tasks exist (`done=0, total=5`): `0%` + empty track (legitimate measured zero — the track IS meaningful here).
- Zero tasks: "No tasks yet", no bar.
- `progress` undefined (API older shape): same as zero-tasks branch.

**Signature.** The card never shows a number it can't defend. The progress *bar only exists when a denominator exists.*

**Copy.** "No tasks yet" — terse, factual, Hearth register. No "0%", no "—", no "NaN".

**Sketch (drop-in for WorkBet.tsx stat card):**
```tsx
const total = bet.progress?.total ?? 0;
const done = bet.progress?.done ?? 0;
const hasTasks = total > 0;
const pct = hasTasks ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
// ...
{hasTasks ? (
  <>
    <span className="text-[24px] font-[600] tabular-nums text-[var(--text-primary)]">{pct}%</span>
    <div className="w-full h-[8px] bg-[var(--surface-container)] rounded-[var(--r-pill)] overflow-hidden mt-[9px]">
      <div className="h-full bg-[var(--accent-primary)] rounded-[var(--r-pill)]" style={{ width: `${pct}%` }} />
    </div>
  </>
) : (
  <span className="text-[13px] text-[var(--text-secondary)] mt-[3px]">No tasks yet</span>
)}
```

**Did we consider X / Y / Z (rejected directions):**
- **Show `0%` + empty track for zero-task bets** — rejected: a `0%` reads as "measured zero of N tasks" and the empty track reinforces it. False precision for an unscoped bet.
- **Show `—` placeholder** — rejected: the AC explicitly forbids "raw placeholder where a real value or clean empty-state belongs". "No tasks yet" is the real state.
- **Hide the whole Progress card when zero tasks** — rejected: breaks the three-up stat-row alignment (Progress / Budget / Team) and makes the row jump as tasks are added.

---

## Treatment B — Artifact rendering per kind + honest "no preview available"

**User task.** A user opens an artifact (permalink `/artifacts/:id`, or the inline preview surface) and sees the content rendered *as its kind* — an image as an image — or, when no preview exists, an honest "no preview available" affordance instead of misrepresented text.

**Defect.** Two layers disagree:
- `packages/web/src/kinds/` already has correct per-kind renderers (`ImageRenderer` → `<img>`, `CodeRenderer`, `DataRenderer`, etc.) wired through `renderer-registry.ts` / `getRenderer(kind)`.
- But `packages/design-system/src/ArtifactPreviewSurface.tsx` (the surface `ArtifactPreview` actually uses, and thus what `ArtifactPermalink` shows) ignores that registry. It calls `getKindDefinition(kind).summarize(preview)` for **every** kind, so an `image` artifact renders as the **text summary "400×300"** (its dimensions) instead of an `<img>`. That is Z8-026/027.
- Its no-preview affordance is also dishonest: `PlaceholderText` says `"PREVIEW NOT YET RENDERED"` / `"PREVIEW PENDING"` — implies a render is coming when often none ever will.

**Treatment (single variant — "registry dispatch + honest fallback").**

Make the embodied surface dispatch through the same per-kind renderers the rest of the app already uses, rather than maintaining a second, text-only render path.

1. **Visual kinds render visually.** For `full` size (the permalink surface), `ArtifactPreviewSurface` dispatches to the kind renderer (`ImageRenderer`, `CodeRenderer`, `DataRenderer`, `HtmlRenderer`, `UrlRenderer`, `TextRenderer`) when a preview is present — an image becomes `<img>`, code becomes a code block. The dimension caption ("400 × 300") stays as a *caption under the image*, never as the whole render.
2. **Gallery size stays a summary.** The small `gallery` thumbnail (min-h-96px) keeps the terse `summarize()` text — it is a list-cell, not a content viewer. Dispatching full renderers into a 96px cell would be wrong. So: `size==="full"` → renderer dispatch; `size==="gallery"` → summary text (unchanged).
3. **Honest "no preview available" affordance — also the error/loading fallback (WARNING-4).** Replace `PlaceholderText`'s aspirational copy with a neutral, true statement, and route ALL non-paintable cases — not just `preview == null` — to the same honest affordance:
   - `full`: **"No preview available"** (not "not yet rendered").
   - `gallery`: **"No preview"**.
   - Same `--surface-container` chrome, `--text-tertiary`, mono 11px uppercase, centered — the existing placeholder styling is correct; only the *copy* and the *trigger* change.
   - **Trigger set (all collapse to the same affordance):** (a) `preview == null`; (b) the kind renderer **throws** during render — wrap the `getRenderer(kind)` dispatch in an error boundary whose fallback IS this same affordance; (c) a non-null but malformed preview the renderer can't display (e.g. an `image` preview missing `url`) — the renderer returns/falls through to the fallback rather than rendering a broken `<img>`. One honest affordance for null, error, and bad-preview alike. No distinct error chrome (a thrown renderer is, to the user, simply "no preview available").
   - **Image `alt` (WARNING-4).** The `<img>` carries `alt` sourced from `preview.alt ?? "${width}×${height} image"` (the existing `ImageRenderer` already does this — confirmed at `packages/web/src/kinds/image-renderer.tsx:21`). The dimension **caption** under the image is decorative and is NOT the alt. Where the surface has the artifact title available, prefer passing it as `preview.alt` so the alt is meaningful (title) rather than dimensional; the dimensional string remains the fallback when no title/alt is supplied. Pin: routing the permalink through `getRenderer` must NOT lose `alt` — it inherits `ImageRenderer`'s `alt`.

**States (full size).**
- `image` + valid preview → `<img>` (with `alt`, see below) + dimension caption.
- `code`/`data`/`html`/`url`/`text` + preview → respective renderer.
- Registered kind, `preview == null` → "No preview available".
- Registered visual kind, preview present but **renderer throws** → error boundary fallback → "No preview available" (WARNING-4 — same affordance, no separate error chrome).
- Registered visual kind, preview present but **malformed** (e.g. `image` missing `url`) → renderer falls through → "No preview available".
- Unregistered kind, preview present → `FallbackRenderer` key-value table (already honest).
- Unregistered kind, `preview == null` → "No preview available".
- Loading: the surface itself does not own async load (preview is passed in by the parent already-resolved); while the parent has no preview yet it passes `preview == null` → "No preview available" is the honest interim. No separate spinner state introduced (the surface is synchronous over its props).

**Signature.** One render path for artifacts. The surface that *embodies* an artifact reuses the same `getRenderer(kind)` registry as the inline renderers — no second, lying text path.

**Copy.** "No preview available" / "No preview". Removes "PREVIEW NOT YET RENDERED" and "PREVIEW PENDING".

**Component mapping.** Reuse existing `packages/web/src/kinds/renderer-registry.ts` (`getRenderer`). `ArtifactPreviewSurface` (design-system) imports it for the `full` path. No new component. `.stories.tsx` for `ArtifactPreviewSurface` and `ArtifactPreview` updated to cover: image-with-preview, image-no-preview, code, unregistered-no-preview.

**Architect open question.** `renderer-registry.ts` lives in `packages/web/src/kinds/`; `ArtifactPreviewSurface` lives in `packages/design-system`. Design-system must not depend on `packages/web`. `/architecture` to decide: (a) move the registry into `packages/design-system` (renderers are presentation primitives — natural home), or (b) inject the renderer-lookup via a prop from `packages/web`. Recommend (a): co-locate renderers with the embodied surface that dispatches them; it also collapses the duplicate text path.

**Did we consider X / Y / Z (rejected directions):**
- **Keep `summarize()` text everywhere, just fix image** — rejected: leaves two render paths that drift; the next visual kind re-breaks. Single dispatch path is the durable fix.
- **Dispatch full renderers into gallery thumbnails too** — rejected: a 96px cell can't host a code block or `<img>` at full size; thumbnails are summaries by design.
- **Keep "PREVIEW PENDING" copy** — rejected: dishonest. AC requires "honest no-preview available affordance rather than misrepresenting content."

---

## Non-design defects (deferred to `/architecture`, listed for traceability)

- **Dead controls / no-op buttons** — handler wiring, no visible-shape decision.
- **Broken breadcrumbs** — `to="/work"` in `WorkTask.tsx`/`WorkBet.tsx` 404s (no `/work` route). Route-target fix, not a layout change. (Recommend → `/work/portfolio`.)
- **Search determinism/relevance** — comparator/ordering in `search.ts`; no UI surface.
- **Post-mutation refresh** — `WorkTeam.tsx` routine create doesn't refetch; data-flow fix, no visual change.
- **Doc/naming hygiene + retention** — non-UI entirely.

## Mobile adaptation

Both treatments live inside existing responsive surfaces (the bet stat row already wraps; the artifact preview already fills width). No mobile-specific layout change. The progress card's empty-state line and the artifact image both reflow within the existing three-tab content column. Mobile inputs unaffected (AQ-005 N/A — no inputs added).
