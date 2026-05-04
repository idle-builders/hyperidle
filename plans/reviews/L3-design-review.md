# L3 Design Review — Artifact primitive

Read-only design review for L3 (`feat/L3-artifact-primitive`). Source-of-truth inputs:
- `docs/design-explorations/L3/approved.md`
- `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5
- `packages/design-system/html/Artifact*.html` (visual parity reference; see `.claude/rules/visual-parity.md`)
- `packages/design-system/PRINCIPLES.md`, `AESTHETICS.md`, `DESIGN.md`, `src/tokens.css`
- `.claude/rules/aesthetic-quality.md`, `.claude/skills/design-review/SKILL.md`

Scope:
- `git diff main..HEAD -- packages/design-system/ packages/web/src/pages/ArtifactPermalink.tsx` (8 components + 1 page).

Visual verification performed:
- Screenshots captured at `/tmp/L3-html-Artifact*.png` (HTML reference, 8 files).
- Started L3 web on port 5273; attempted to screenshot TSX stories via `/designsystem`. The catalog could not surface ANY of the new components (see B6 below), so direct TSX visual-parity comparison was not possible. Findings below are derived from HTML screenshots + code inspection of the diff. This is a verification gap — not a clean "looked at every state" pass.

Counts: **5 blocker, 8 major, 7 minor (20 findings total).**

---

## BLOCKERS — must fix before merge

### B1. Focus ring uses non-existent `--accent` token (a11y broken)
**Severity:** blocker (a11y regression).
**Files:**
- `packages/design-system/src/ArtifactGalleryCard.tsx:16`
- `packages/design-system/src/ArtifactStackItem.tsx:16`
- `packages/design-system/src/ArtifactEmbed.tsx:22`

Each component declares a focus ring using `var(--accent)`. The `--accent` custom property does not exist in `packages/design-system/src/tokens.css` (search confirms only `--primary`, `--primary-dim`, `--primary-hover`, `--ok`, `--danger` are defined). The CSS `outline-color: var(--accent)` falls back to the inherited/initial colour, which on dark Lucid is effectively invisible against `--surface-4`/`--surface-5`. Keyboard users lose the focus indicator.

This also violates approved.md §4 line 149 which mandates `outline: 1px solid var(--primary); outline-offset: -1px` (matching the `BetCard.html` precedent).

Spec also requires 1px outline; TSX uses `outline-2` (2px). Width-mismatch is minor; the colour bug is the blocker.

**Fix:** Replace `outline-[var(--accent)]` with `outline-[var(--primary)]`; replace `outline-2` with `outline-1`; add `outline-offset:-1px`. Apply to all three components (Gallery card, Stack item, Embed arrow).

---

### B2. ArtifactGalleryCard is missing the title row
**Severity:** blocker (visual-parity violation; spec violation).
**Files:**
- `packages/design-system/src/ArtifactGalleryCard.tsx:36-53`

Approved.md §2 (`ArtifactGalleryCard`) requires the layout to be:
> 1. Header (kind badge + producing task)
> 2. **Title:** derived from `kind + preview` … 15px / 500 weight / `--text-hi` / max 2 lines truncated.
> 3. PreviewSurface
> 4. Footer

The HTML reference (`packages/design-system/html/ArtifactGalleryCard.html` lines 29, 66, 80) renders the title row explicitly (`Welcome — onboarding sequence v2`, `Hero illustration`).

The TSX has NO title row at all. The card jumps from header (`DRAFTED EMAIL · Implement auth flow`) directly to the preview surface, then footer. The derived title (computed by `artifactDisplayTitle()`) — the most user-meaningful element of the card — is not displayed.

**Fix:** Insert a title element between header and `<ArtifactPreviewSurface />`:
```
<div className="text-[15px] font-medium text-[var(--text-hi)] leading-[1.3] line-clamp-2">
  {artifactDisplayTitle(data)}
</div>
```
Match HTML: 15px / 500 / `--text-hi` / `line-height:1.3` / max 2 lines.

---

### B3. ArtifactGalleryCard cost-chip uses wrong variant
**Severity:** blocker (spec + visual parity).
**File:** `packages/design-system/src/ArtifactGalleryCard.tsx:45`

Approved.md §2 line 90: footer renders `<ArtifactCostChip variant="full" />`.
HTML reference (`ArtifactGalleryCard.html` line 69): `$0.42 · 12.4k · 12 min ago` — full variant (money + tokens + timestamp).
TSX uses `variant="compact"` — drops the token count. User loses the "tokens consumed" half of the cost story, which is the whole point of cost on a gallery card (money is a noisy proxy; tokens reflect work volume).

**Fix:** `<ArtifactCostChip cost={data.cost} variant="full" />`.

---

### B4. ArtifactPreview renders no-threads empty state incorrectly
**Severity:** blocker (spec + visual parity).
**File:** `packages/design-system/src/ArtifactPreview.tsx:46`

Approved.md §2 (`ArtifactPreview`, line 112): "Renders an empty state ('No threads') when slot is undefined."
HTML reference (`ArtifactPreview.html` line 46): `<div class="preview-discussion">No threads</div>`.
TSX: `{discussion ? <div className={DISCUSSION}>{discussion}</div> : null}` — when slot is empty, the discussion column collapses to nothing rather than showing the explicit "No threads" empty state. Users can't distinguish "no threads yet" from "loading" or "broken".

This also breaks the closed-grid layout: the right column disappears, so the preview body is no longer constrained to `1fr` — it stretches into the gap.

**Fix:**
```
<div className={DISCUSSION}>
  {discussion ?? <span>No threads</span>}
</div>
```

---

### B5. ArtifactEmbed does NOT delegate to `ArtifactView` (spec violation)
**Severity:** blocker (architectural — spec calls this out specifically).
**File:** `packages/design-system/src/ArtifactEmbed.tsx:25, 40`

Approved.md §2 line 120-121:
> 2. Delegated `<ArtifactView>` mount with shape derived from `getArtifactViewProps(artifact)`.

Approved.md §7 row 4 says `ArtifactEmbed` "Composes sub-primitives 1–3 + delegated `ArtifactView`".

§4.5 of the concept doc explicitly distinguishes `ArtifactView` (the existing renderer) from the L3 primitive — and the embed is the place where the two meet. Without the delegation, the embed renders a single grey-on-grey one-line summary string from `summarizePreview()` — losing the visual richness of the existing five `ArtifactView` shapes (text_diff, content_preview, visual_comparison, action_summary, data_metrics) when an artifact's kind maps to one.

The HTML reference (`ArtifactEmbed.html` line 48) keeps a placeholder `[ delegated ArtifactView mount ]` exactly to mark the integration point.

The current behaviour means a `code_diff` artifact in a review message shows literally the file path as plain text instead of an inline diff with `+`/`−` colours. That's the user value of the L11 review experience — gone.

**Fix:** Either implement delegation now (architect's open-question §8 #4 and concept §4.5 require this) via a `getArtifactViewProps(artifact)` helper that maps L3 kinds → ArtifactView shapes, OR document explicitly in this PR that the delegation lands in L11 (the consuming story) and add a TODO comment with `@lore` tag. The current state is silent regression.

---

## MAJOR

### M1. State prop is functionally a no-op — `loading` and `error` render identically to populated
**Severity:** major (spec coverage gap).
**Files:** all four layout components.

Approved.md §3 specifies a 5×4 state matrix:
- Loading: full skeleton silhouette per layout (header skeleton, title skeleton, preview-surface skeleton, footer skeleton; `skeleton-pulse`).
- Error: header + title render; preview-surface renders inline error block ("Preview unavailable" + Retry button).

TSX implementations only set `data-state={state}` on the root element. There is NO branching on `state` — loading and error states render an indistinguishable populated card. The only test coverage is `ArtifactGalleryCard.test.tsx:133-157` which asserts `state="loading"` "doesn't throw" — that is the textbook anti-pattern called out in `.claude/rules/testing.md`'s anti-rationalization table ("Never write tests that only assert `not.toThrow()`").

The package already exports `Skeleton` (`packages/design-system/src/Skeleton.tsx`) — there's a primitive ready to be composed.

**Fix:** Implement loading/error rendering for each layout per §3 of approved.md. Add stories that exercise each state. Add tests that assert presence of skeleton chrome and absence of populated content for `loading`, and presence of the error block for `error`.

---

### M2. ArtifactPreview header ID is not truncated, not right-aligned via spec semantics
**Severity:** major (spec).
**File:** `packages/design-system/src/ArtifactPreview.tsx:41`

Approved.md §2 line 108: "ID truncated (mono `--text-lo`, right-aligned)".
HTML reference: `<span class="id">art_01HM…</span>` — explicitly truncated with ellipsis, mono, `--text-lo`, `margin-left:auto`.

TSX uses `ml-auto text-[var(--text-lo)] normal-case` — `ml-auto` is correct. But:
- Renders the full `data.id` raw (e.g. `art_01HABCDEFGHIJKLMNOPQRSTUVW`) with no truncation. With long IDs the meta row wraps catastrophically and pushes the title down.
- Missing `font-mono` — falls back to the default `font-sans` of the meta row's parent.

**Fix:** Add `font-mono max-w-[160px] truncate` and slice with an ellipsis (e.g. `art_01HM…` first 8 chars). HTML shows the visual target.

---

### M3. ArtifactGalleryCard footer doesn't collapse cleanly when cost is null
**Severity:** major (visual parity / state coverage).
**File:** `packages/design-system/src/ArtifactGalleryCard.tsx:43-52`

HTML reference no-preview card (lines 74-85) renders the footer as just `—` (single em-dash) when cost is null. The TSX renders `— · 12 min ago` (dash, then separator, then timestamp). This is defensible, but the visual delta against the design ref is real — and worse, the dot-separator becomes orphaned when the cost is just an em-dash, producing `— · 12 min ago` which reads as "negative twelve min ago" to a scanner.

**Fix:** Either match the HTML (suppress timestamp when cost is null), or always group `cost · timestamp` together but suppress the separator when cost is just `—`. Pick one and align HTML + TSX.

---

### M4. ArtifactPermalink page is dead code (unwired route)
**Severity:** major (the only consumer surface for `ArtifactPreview` is unreachable).
**Files:**
- `packages/web/src/pages/ArtifactPermalink.tsx` (new)
- `packages/web/src/router.tsx` (unchanged — should mount `/artifacts/:id`)

The new permalink page imports `ArtifactPreview` and is the ONLY runtime consumer of it in this PR. But `router.tsx` lines 23-44 do NOT register `/artifacts/:id`. Navigating to that URL hits the catch-all NotFound. The acceptance criterion "Playwright e2e: at least one of each layout renders against real data" (approved.md §10) cannot pass for the single_full_preview layout.

**Fix:** Add `{ path: "artifacts/:id", element: <ArtifactPermalink /> }` to the AppShell children in `router.tsx`. Add an E2E test that navigates to the route and asserts the preview renders.

---

### M5. Stories coverage is far below spec — only 13 stories across 8 components
**Severity:** major (DS rule violation).
**Files:**
- `ArtifactKindBadge.stories.tsx` — 1 story
- `ArtifactCostChip.stories.tsx` — 3 stories
- `ArtifactTimestamp.stories.tsx` — 2 stories
- `ArtifactPreviewSurface.stories.tsx` — 4 stories
- `ArtifactGalleryCard.stories.tsx` — 4 stories
- `ArtifactStackItem.stories.tsx` — 1 story
- `ArtifactPreview.stories.tsx` — 2 stories
- `ArtifactEmbed.stories.tsx` — 1 story

Approved.md §8 row 8: "8 new components × at least 4 variants each (populated, loading, error, no-preview). 32 stories minimum." Actual count: ~18 distinct variants (well below 32). Specifically missing:
- `ArtifactStackItem`: no Loading / Error / NoPreview / NoCost / NoThreads / WithPill stories.
- `ArtifactPreview`: no Loading / Error / WithDiscussion stories.
- `ArtifactEmbed`: no Loading / Error / NoPreview / Disabled-arrow stories.
- `ArtifactKindBadge`: only one story (`All`); missing per-kind, missing each of the 12 kinds rendered individually.

`.claude/rules/design-system.md`: "Every custom component must have a `.stories.tsx` file… Stories are a required deliverable, not optional documentation." `.claude/rules/testing.md`: "A component without stories is not verifiable in isolation."

**Fix:** Add the missing variants. Each layout must at minimum cover {Populated, Loading, Error, NoPreview, CostPending}.

---

### M6. ArtifactStackItem always renders labelled pill — never the numeric-only collapse
**Severity:** major (spec mobile/density rule).
**File:** `packages/design-system/src/ArtifactStackItem.tsx:45`

Approved.md §3 line 139 ("Thread-pill pluralization spec") mandates: stack-row variant collapses to numeric-only (`"N"`) when the row's right cluster cannot fit the labelled form.
HTML reference (`ArtifactStackItem.html` line 35): `<span class="thread-pill">3</span>` — numeric-only on stack rows.

TSX: `count === 1 ? "1 thread" : `${count} threads`` — labelled, always. Spec calls "the labelled form is preferred when space permits" — but on the tight 44px stack row with task-title (200px) + derived title + cost + timestamp, "5 threads" is rarely "fitting". The HTML reference picked numeric-only as the default for a reason.

**Fix:** On `ArtifactStackItem`, always use the numeric-only form (`{count}`) — the parent stack list is the width-constrained layout. Reserve the labelled form for `ArtifactGalleryCard` and `ArtifactPreview` (which have the budget).

---

### M7. Embed identity strip allows arrow to wrap onto its own line
**Severity:** major (visual parity / behaviour).
**File:** `packages/design-system/src/ArtifactEmbed.tsx:18, 36`

Approved.md §2 line 118 says identity strip is "single line, mono 11px". The container uses `flex items-center` with no `flex-nowrap` and no `whitespace-nowrap`. Long producing-task titles will wrap the strip across two lines and push the `→` arrow under the timestamp. The arrow has `ml-auto` which only positions it within the flex line — once it wraps, it reads as a stray button.

Additionally, the arrow's `px-[6px] py-[4px]` clickable surface is well below the 44px touch-target minimum (AQ-015) on mobile. With viewport ≤1024px, AQ-016 promotes the comfortable density tier — the arrow should grow.

**Fix:** Add `flex-nowrap min-w-0` to the identity strip; add `truncate` on the producing-task title span. Bump arrow tap target on mobile (`min-h-[44px] min-w-[44px]` at viewport ≤1024px, or use `--density-tap-min` token if present).

---

### M8. Off-grid spacing in ArtifactKindBadge / ArtifactCostChip / ArtifactStackItem
**Severity:** major (AQ-001 / AQ-002 violation).
**Files:**
- `ArtifactKindBadge.tsx:10` — `px-[8px] py-[2px]`
- `ArtifactCostChip.tsx:11` — `gap-[6px]`
- `ArtifactStackItem.tsx:21-22` — `gap-[8px] py-[1px] px-[6px]`
- `ArtifactGalleryCard.tsx:18` — `gap-[6px]`
- `ArtifactPreview.tsx:20` — `gap-[6px]`

AQ-001: padding/gap/margin must be a 4px multiple from the closed allowlist; 2px is reserved for chip/icon internals. AQ-002: density tokens for component internals — `var(--density-pad-*)`, `var(--density-gap)`, `var(--density-row-h)`. Many of these will be flagged by `design/no-off-grid-spacing` and `design/use-density-tokens` once K6 lands.

The `2px` chip-vertical padding is allowed (chip internal). But `6px` gap appears repeatedly with no token backing — should be `var(--density-gap)` or `8px` from the 4-grid.

**Fix:** Replace hardcoded gap/pad values with density tokens (e.g. `gap-[var(--density-gap)]`, `p-[var(--density-card-pad)]`). Where token doesn't exist, round to the nearest 4px multiple (`gap-[8px]` instead of `gap-[6px]`).

---

## MINOR

### m1. ArtifactKindBadge `Tag` reuse missed
**Severity:** minor (component-budget concern).
**File:** `ArtifactKindBadge.tsx`

Approved.md §7 says: "`Tag` — base of `ArtifactKindBadge`'s appearance. Kind-badge has fixed kind-specific labels but inherits Tag's chrome — pill shape, mono caps, `--surface-ghost`, `--text-mid`."

The TSX duplicates Tag's chrome (`bg-[var(--surface-ghost)] text-[var(--text-mid)] font-mono text-[11px] tracking-[0.02em] uppercase rounded-[var(--r2)]`) instead of composing `<Tag kind="…">`. Two sources of truth for the same chrome — when Tag changes, KindBadge drifts.

**Fix:** Compose `<Tag>` (or extract a shared `<UpperLabelChip>` primitive). Cite the Tag API to confirm it accepts arbitrary text.

### m2. Tags row separator `·` inserted as 4 inline siblings is fragile
**Severity:** minor (code quality + a11y noise).
**Files:** `ArtifactGalleryCard.tsx:39`, `ArtifactStackItem.tsx:48`, `ArtifactPreview.tsx:35-39`, `ArtifactEmbed.tsx:30-34`

The dot separator `·` is inserted as a discrete `<span>` between every meta element. Screen readers announce each one. AT also can't tell `BADGE · TASK · COST · 12 min ago` apart from "BADGE dot TASK dot COST dot 12 min ago". The tabular meta line should be a single semantic group.

**Fix:** Either (a) wrap the meta in `<div role="group" aria-label="Artifact metadata">` and hide the `·` from AT (`aria-hidden="true"`), or (b) build the separator with CSS `::after` content so it's not in the accessible tree at all.

### m3. ArtifactTimestamp falls back silently when ISO is invalid
**Severity:** minor.
**File:** `ArtifactTimestamp.tsx:18, 28`

When `Date.parse(value)` returns NaN, the function returns the raw input string. That input string then renders as the timestamp — could be anything. Consider `??` or render `—` to align with the cost-pending discipline.

### m4. `ArtifactTimestamp` has no `time` element semantics
**Severity:** minor (a11y / SEO).
**File:** `ArtifactTimestamp.tsx:42`

Renders `<span title={value}>`. Convention for a date is `<time dateTime={value}>` so AT and crawlers can parse the underlying ISO. The `title` tooltip is a poor a11y substitute.

**Fix:** Use `<time dateTime={value}>{text}</time>`.

### m5. Embed arrow uses unicode `→` instead of an icon component
**Severity:** minor (consistency).
**File:** `ArtifactEmbed.tsx:38`

The codebase uses `lucide-react` for icons elsewhere. A literal `→` glyph renders inconsistently across fonts/OS, lacks visual centring, and disagrees with the icon-rail aesthetic. Replace with `<ArrowRight size={12} />` (or whichever lucide icon matches), with `aria-hidden="true"` and the `aria-label="Open artifact"` on the button.

### m6. ArtifactPreviewSurface placeholder grammar — gallery says "PREVIEW PENDING", full says "PREVIEW NOT YET RENDERED"
**Severity:** minor (copy register).
**File:** `ArtifactPreviewSurface.tsx:17`

Both strings come from approved.md §3, so this matches spec. But the two phrasings disagree in voice ("pending" vs "not yet rendered"). For a precision-instrument aesthetic both should be terse and parallel: e.g. "PREVIEW PENDING" + "PREVIEW PENDING — NO RENDER YET". Or use the same string and just scale it. Worth a copy-pass with the designer.

### m7. ArtifactPreview body uses `--surface-2` / `ArtifactPreviewSurface` uses `--surface-3` — mismatch with HTML
**Severity:** minor (visual parity).
**Files:** `ArtifactPreview.tsx:23`, HTML ref `ArtifactPreview.html:22`

HTML reference has `.preview-body { background: var(--surface-2) }`. TSX renders `<ArtifactPreviewSurface>` which uses `--surface-3` (different tone). Both come from the same source, but the TSX delegation skips the `--surface-2` rule from the HTML ref. Choose one; if HTML wins (per visual-parity rule), `ArtifactPreviewSurface` needs a `surface` prop or `ArtifactPreview` wraps with the override.

---

## OBSERVATIONS (out of scope but flagged)

### O1. /designsystem catalog cannot surface the new components
**Severity:** out-of-scope (pre-existing bug; not introduced by L3).
**File:** `packages/web/src/designsystem/DesignSystem.tsx:10-13`

`import.meta.glob('../../../../design-system/src/*.stories.tsx')` resolves to `<repo>/design-system/src/*.stories.tsx` — but the repo path is `<repo>/packages/design-system/src/`. The glob is one level too high. The catalog returns zero modules from the design-system package — verified visually: only `web/src/components/*` and `web/src/shell/*` stories appear in the left nav. None of the 8 new L3 stories is reachable through the design-system route, so /designsystem-based visual review is impossible. This blocks the `.claude/rules/design-system.md` discoverability requirement.

This bug pre-dates L3 (existing components like BetCard, Tag, StatusChip are also invisible). Fix is a one-line glob path correction, but should land in its own PR with verification it doesn't break ds:sync.

### O2. Closed-view-family test file is excellent
The protected test at `packages/design-system/src/__tests__/closed-view-family.test.ts` correctly enforces both the export-boundary closure and the file-system closure. Solid hard-rule lock against regressions. Keep.

### O3. ArtifactEmbed chrome-less assertion is correctly implemented
The runtime test at `packages/design-system/src/__tests__/ArtifactEmbed.test.tsx:47-58` directly asserts no `bg-/border-/rounded-/shadow-` class fragments on the embed root. The TSX implementation respects this. This is the L3 hard-rule per concept §4.5 + design hard rule — confirmed clean.

### O4. No emojis, no per-kind colour, no fake thumbnails — all confirmed
Spot-checks across `ArtifactPreviewSurface.tsx` (no emoji, no per-kind colour switch), `ArtifactCostChip.tsx` (em-dash, never `$0.00`), and `ArtifactPreview.tsx` (placeholder text, no synthesised image) — the four hard rules from concept §4.5 are honoured at the implementation level.

---

## Acceptance summary

| Check | Status |
|---|---|
| Closed view family — 8 components, no extras, no `Artifact`/`ArtifactCard` | PASS (verified by both source-listing and `closed-view-family.test.ts`) |
| ArtifactEmbed root has no chrome | PASS (verified by source + protected test) |
| No fake thumbnails | PASS (placeholder text used; no synthesised images) |
| No emojis, no per-kind colour | PASS |
| Focus rings reachable + visible | **FAIL** (B1) |
| Gallery card title row visible | **FAIL** (B2) |
| Cost-chip variant per spec | **FAIL** (B3) |
| Empty discussion state in preview | **FAIL** (B4) |
| Embed delegates to ArtifactView | **FAIL** (B5) |
| Loading/error states render distinct chrome | **FAIL** (M1) |
| Stories cover {populated, loading, error, no-preview} per layout | **FAIL** (M5) |
| Permalink route works | **FAIL** (M4) |
| Visual parity vs HTML reference | **FAIL** (B2, B3, M2, m7) |

---

## Recommended order to fix

1. **B1** (one-line per file × 3) — restores a11y.
2. **B2** + **B3** (gallery card title row + cost variant) — restores visual parity to HTML.
3. **B4** (preview empty state) — easy.
4. **M4** (route wiring) — one line in router.tsx + an E2E test.
5. **B5** (embed delegation) — design call: implement now, or document deferral to L11 with `@lore`.
6. **M1** (loading/error rendering) — biggest implementation work.
7. **M5** (stories), **M2**, **M3**, **M6**, **M7**, **M8** — polish + density compliance.
8. **All minors** — clean-up pass.

---

## Visual evidence captured

HTML reference screenshots (design source of truth):
- `/tmp/L3-html-ArtifactGalleryCard.png`
- `/tmp/L3-html-ArtifactStackItem.png`
- `/tmp/L3-html-ArtifactPreview.png`
- `/tmp/L3-html-ArtifactEmbed.png`
- `/tmp/L3-html-ArtifactPreviewSurface.png`
- `/tmp/L3-html-ArtifactKindBadge.png`
- `/tmp/L3-html-ArtifactCostChip.png`
- `/tmp/L3-html-ArtifactTimestamp.png`

TSX rendered screenshots: NOT CAPTURED. Catalog discovery is broken (O1 above) and the permalink route is unwired (M4). Visual parity claims in this review are derived from code inspection against HTML refs, not from side-by-side TSX renders. Once O1 and M4 are fixed, a follow-up screenshot-comparison pass is mandatory before merge.
