# L2 Block primitive — Variant B: Self-contained block

> Power-density rethink. Each BlockKind owns its own micro-layout, including kind-specific chrome that helps the power user. The persistent corner-button group (`block-action-strip`) is the variant's chrome — `permalink` icon + thread-count chip. Optimised for the 80% task: scan a long body, deep-link a specific block to a teammate.

---

## 1. User story

A founder reading a knowledge body or a bet pitch needs to (a) scan the prose at speed, (b) act on a specific region — copy a deep-link to the heading the team is debating, copy the code snippet a teammate asked for, jump to a thread already attached — *without* leaving keyboard flow or losing their reading position. Variant B gives every block a self-contained, kind-specific micro-toolbar so any of those moves takes one keystroke or one hover.

---

## 2. Component composition

The renderer is a single React component family `BlockView` with a per-kind switch. Existing design-system pieces it composes from:

| Concern | Component | Notes |
|---|---|---|
| Unsupported-block pill | `StatusChip` | New status `"unsupported"` mapped to the `warn` token track (no new colour). |
| Block-deleted strip | `StatusChip` (status `error`) + monospaced strikethrough | The strip itself is **not** a new design-system component — it composes a `StatusChip`, a `<s>` element, and a right-aligned thread-count `Tag`. |
| Thread-count chip | `Tag` | Variant `count` (mono, ghost background, leading icon). The chip lives inside `block-action-strip` so it does not enter the budget as a separate block-level component. |
| Code block language label | inline pill that follows the `Tag` token shape (mono, ghost) | Not a new component — kind-internal chrome. |
| Image zoom indicator | inline button styled with `--surface-ghost` overlay + 14×14 inline SVG | Per `tag-kinds.tsx` precedent, codebase uses inline SVG instead of `lucide-react` for one-off chrome. |
| Inline marks (`code`/`strong`/`em`/`a`) | unstyled HTML, themed via tokens | No component — these are render-time text spans. |
| Heading anchor permalink | inline button inside `block-action-strip` | Inline 12-px SVG (link glyph). |
| Action strip container | new HTML/CSS pattern keyed by `data-ds-component="block-action-strip"` | Not a new Tier 1 component — a CSS pattern + role wrapper reused by every block. K2 DS-DOM markers cover it via the data attribute. |

**Net additions to the component budget: zero.** `block-action-strip` is a pattern, not a component (no React surface above what each `BlockView` needs anyway). The `Tag` `count` variant is a new kind-prop, not a new Tier 1.

---

## 3. Information hierarchy

For every block, the eye should land in this order:

1. **Body content first.** The block's own prose / list / table / code is at full text weight (`--text-hi`) and scale. The action strip is hidden (opacity 0) until the user signals intent.
2. **Block kind chrome second.** Code shows its language pill + copy button on the strip's left; tables show their sticky-header bar + scroll fade; quotes carry their tinted background; images carry their zoom overlay. This chrome is *part of the block*, not floating above it.
3. **Action strip third.** Top-right corner. `permalink` + thread-count chip. Reveals on hover/focus; sticks visible whenever a thread is already attached (because at that point its discovery value is high enough to earn permanent chrome).

Body-level metadata (front matter) is **not** rendered by `BlockView` — per BLOCKS.md §6 it is a sibling field, surfaced (or not) by the host surface. Variant B does not paint it.

---

## 4. States (every block kind, every kind-specific affordance)

| State | Treatment |
|---|---|
| **Empty body** | Renderer outputs zero blocks. Host surface renders an `EmptyState` ("No content yet"). The renderer never paints a placeholder block. |
| **Loading** | Host surface shows a `Skeleton` matching the average block rhythm: 1× h1, 2× paragraph, 1× code, 1× paragraph. The skeleton uses the existing `SkeletonCard` shape inside the body container. The renderer does not own loading. |
| **Error parsing one block** | Derivation never throws (BLOCKS.md §6) — the offending node falls into `unknown`. The `unknown` block is the error UI: dashed border, mono "unsupported block" pill (warn track), node-kind hint, raw source preview in a 11-px monospaced block. Reader can copy the source verbatim. |
| **Populated** | All nine kinds render with their own chrome. See §6. |
| **Very long body — code** | `code` blocks taller than **20 lines** auto-collapse to a `--collapsed` body capped at `20 × 1.5em`. Bottom of the collapsed region shows an "+ Show N more lines" expand affordance using `--mono` and `--text-mid`. Reader keystroke `O` (or click) toggles. |
| **Very long body — table** | `table` blocks scroll horizontally inside `.table-wrap`. Header is `position: sticky` so column labels persist while reading rows. A right-edge gradient fade signals "more columns to the right". Vertical overflow caps at 260 px before the scroll container takes over. |
| **Very long body — paragraph** | Paragraphs **never** truncate on desktop. On mobile, a paragraph longer than 5 lines clamps to 5 with a "Show more" inline link below it (webkit-line-clamp pattern, gracefully degrading). |
| **Block-with-attached-thread** | Action strip stays *visible* (opacity 1) as long as `data-active` is on the chip. Discovery > tidiness when discussion already exists. |
| **Block-deleted indicator** | An inline strip replaces the missing block: dashed danger-tinted border, mono `DELETED` pill, the original anchor text struck through (preserved verbatim from the last successful derivation), thread-count metadata aligned right. The host body remains scrollable past it; the strip is not focus-trapping. |
| **Hovered (block)** | Action strip transitions opacity 0→1 in `--motion-fast` (80 ms). Strip is `position: absolute; top: 2px; right: 0`, `box-shadow: var(--float)`. |
| **Hovered (action button)** | Button background → `--primary-dim`, color → `--text-hi`. No transform / no scale. |
| **Focused (block)** | `tabindex="0"` on every block. `:focus-visible` paints a 2-px `--primary` ring with 2-px offset, radius `--r1`. Strip simultaneously reveals (focus-within). |
| **Focused (button)** | 1-px `--primary` outline, `outline-offset: -1px`. |
| **Copy-success (transient)** | Copy button text rotates `copy → copied`, icon swaps clipboard → check, `color: var(--ok)`. Transient: 1500 ms then reverts (no JS in mockup; styled state is shown). `aria-live="polite"` so screen-reader users hear the success. |
| **Copy-success (permalink)** | Same pattern: button label `permalink → copied`, ok-coloured. The clipboard payload is a URL whose fragment is the BlockId hex (e.g. `#blk-3a7f9b2c`), never a slug. |
| **Reduced-motion** | All `--motion-fast/medium/slow` collapse to 1 ms (per `tokens.css`). Action strip reveal becomes instant. No spurious motion. |

---

## 5. Behavior

### 5.1 Hover

- Strip reveal: opacity 0 → 1 in `--motion-fast`, easing `--motion-ease`.
- Stays visible whenever the block has `data-active` thread chip (count ≥ 1).
- Hover never moves the block — strip is absolutely positioned, has no layout impact.

### 5.2 Focus

- Every block is focusable (`tabindex="0"`).
- `:focus-visible` paints the ring; `:focus` (mouse) does not, per platform conventions.
- Focus rings are 2-px `--primary`, offset 2 px, radius `--r1`. Strip reveals via `:focus-within`.

### 5.3 Keyboard

| Key | Behavior |
|---|---|
| `J` | Focus the next block (document order). Wraps at bottom. |
| `K` | Focus the previous block. |
| `Enter` | Focus the current block (no-op if already focused; on a `code` block scrolls into view if the body was offscreen). |
| `⌘L` / `Ctrl-L` | Copy permalink of the focused block to clipboard (URL with `#blk-<id>` fragment); button rotates to "copied" briefly. |
| `⌘C` / `Ctrl-C` | When the focused block is `code`, copy the code-body text. Otherwise default browser copy. |
| `O` | When the focused block is `code` and collapsed, toggle expanded. |
| `Escape` | Blur the focused block. |

`J/K` step the focus across all visible blocks including the `block-deleted` indicator (so a teammate can permalink the deleted-anchor strip itself if they need to point a colleague at the missing region). Step ordering uses document order, not visual order — there is no two-column traversal of the variant-B mockup; the live host surface is single-column.

### 5.4 Focus management

- Focus never enters the block from inside the strip (Tab order: block → strip buttons → next block).
- On a copy-success transient, focus stays on the originating button (no jumps).
- On `block-deleted` strip: focus is allowed but strip is not interactive beyond the focus ring; Enter and Space do nothing.

### 5.5 Transitions (per tokens)

| Prop | Token | Curve |
|---|---|---|
| Strip opacity | `--motion-fast` (80 ms) | `--motion-ease` |
| Button hover (`background`, `color`) | `--motion-fast` | `--motion-ease` |
| Code expand/collapse | `--motion-medium` (150 ms) on `max-height` is **forbidden** by AQ-014. Variant uses `display: block` → `display: contents` swap with no animated `height`. The expand button itself fades out in `--motion-fast`. |
| Image zoom-in (lightbox) | `--motion-medium` for `opacity` + `transform: scale()` only. |
| Reduced-motion fallback | All durations → 1 ms (token-driven). |

### 5.6 Reduced-motion

Strip reveal becomes instant. Code copy success no longer animates the icon swap — the icon swaps in one frame and reverts in one frame. Image zoom opens with no motion.

---

## 6. Per-kind chrome (the variant's signature)

| Kind | Chrome owned by the block |
|---|---|
| `heading` (h1/h2/h3+) | Hover-only `permalink` button in the action strip. Permalink payload is the BlockId hex (`#blk-3a7f9b2c`), never the slug. h1 = `--density-text-h1`, h2 = `--density-text-h2`, h3 = 1 rem `--text-mid`. h4–h6 collapse to h3-style with progressively dimmer colour. |
| `paragraph` | Action strip only when hovered or thread-attached. Inline marks: `code` (mono pill), `strong`, `em`, `a` (underline using `--border-emphasis`). |
| `list` | bullet `::marker` uses `--text-lo`; ordered list uses `font-variant-numeric: tabular-nums` on the marker. Nested lists indent 20 px (closed scale). The whole list is one block. |
| `quote` | Slightly tinted background (`--surface-2`), 2-px `--border-emphasis` left border. Reads as a callout, not a clone of the body. Action strip on hover. |
| `code` | Top bar with `--surface-3` background carrying language label (mono, lowercase, leading 6-px `--ok` dot to signal "language detected") + copy button. Body in `--mono`, 12 px, `1.5` line-height, `tab-size: 2`. Bodies > 20 lines collapse with a "Show N more lines" affordance. Token highlighting: 5-class set (`tok-kw`, `tok-str`, `tok-com`, `tok-fn`, `tok-num`) using monochrome + `--ok` only — no rainbow palette. |
| `table` | Wrapper `.table-wrap` carries the right-edge fade. Sticky header (`position: sticky`) on `--surface-3`. Mono uppercase 11-px header labels with `--tracking-caps`. Tabular numerals on body cells. Vertical overflow caps at 260 px. |
| `divider` | A 1-px `--border-subtle` rule with `12 px` top/bottom margin. No content, no chrome. |
| `image` | `--r2` rounded `figure` with overlay zoom indicator at top-right (28×28 button on `--surface-0` 75 %). Click opens lightbox (host-side, not part of L2). Action strip overlays at top-right *below* the zoom indicator (right-aligned, separated by 8 px). Alt text is read by SR. |
| `html` | Sanitised raw HTML rendered inside a `--surface-2` container with `--r1` radius. The default mockup styles `<details>` + `<summary>` with a custom rotating chevron. If the sanitiser drops the HTML entirely, the host falls back to an `unknown` block carrying the raw source. |
| `unknown` | Dashed `--border-emphasis` border, "UNSUPPORTED BLOCK" mono pill (warn-tracked StatusChip), node-kind hint (e.g., `parser produced node kind footnoteDefinition`), and a raw-source preview in `--surface-3` mono pre. Always copyable, never throws. |

---

## 7. Mobile adaptation (≤ 640 px)

- Two-up layout collapses to a single column. Body padding drops to 8/12 px (compact-band tokens).
- Action strip is **always visible** but reduced to a single overflow button (`...`). Tapping the overflow opens an actions sheet (DaisyUI `bottom-sheet` on the host side) with `Copy permalink`, `Open thread`, `Copy block contents` (kind-dependent).
- Code block bodies render at 11 px, still mono, still `1.5` line-height; horizontal scroll affordance gets a heavier right-edge shadow.
- Tables show a more visible right-edge fade and a horizontal-scroll cue.
- Long paragraphs clamp to 5 lines with "Show more" (single-tap reveal).
- Auto-density flips to `comfortable` at viewport ≤ 1024 px (per AQ-016) — touch targets clear the AQ-015 44-px floor.
- Heading h1/h2 grow proportionally via `--density-text-h*`.

---

## 8. Signature

Each block kind is a self-contained micro-component with kind-specific affordances visible right where the user is reading. The body reads like a stack of small, opinionated widgets — closer to Linear's issue body than a markdown page. Action strips at the right edge are the consistent through-line: every block is a permalinkable, threadable region of prose.

---

## 9. Trade-offs

- **More chrome → more visual noise.** Even though strips are hover-only, the kind-specific bars (code language pill, table sticky header, quote tint, image zoom) are always visible. A reader who *just* wants to read prose pays a small attention tax. Mitigation: every chrome element uses `--text-mid` or `--text-lo` and recedes by Linear's S1 rule.
- **More components to maintain.** Per-kind chrome means the `BlockView` switch grows by ~10 small render branches plus their CSS partials. Variant A (single container with a unified gutter) is simpler to keep aligned.
- **Strip competes with prose at narrow widths.** On 540-px Knowledge bodies the action strip overlays the first ~100 px of the right margin. We accept this because the strip is hidden by default; it only competes when the user is hovering the block, which is when they want chrome.
- **Per-block focus → 100s of tab stops on a long body.** Mitigated by `J/K` navigation; `Tab` users still pay. Acceptable for power-user flow.
- **Two opacity-driving rules** on the strip (hover/focus *and* `[data-active]`) mean the rendered visibility depends on data state, not just interaction state. Easy to misread in code review; the `data-state="pinned"` attribute is the canonical override that should appear in tests.

---

## 10. Open questions for the architect

1. **Permalink URL shape.** The variant promises the fragment is `#blk-<hex>`. Is the host route `/work/bet/:betId#blk-…` or does the renderer accept a `permalinkFor(block)` prop that the surface customises? Either works; the contract is "one URL per block, fragment is BlockId hex".
2. **Lightbox provenance.** The image zoom indicator hints at a lightbox; that lightbox is host-side (not in `BlockView`). Does the host wire it up for L16 / L23 in the same story, or is it deferred?
3. **Sanitiser policy + boundaries.** When the sanitiser drops a `<script>`/`<iframe>` from a `html` block, do we render an `unknown` block carrying the original source, or a tiny "removed by policy" notice? BLOCKS.md §6 says fall back to a paragraph showing the original source — variant follows that.
4. **Per-block focus + scroll position.** When the user permalink-copies block X, the URL fragment changes — should the host scroll-into-view? (Likely yes; same mechanic as a markdown anchor jump.)
5. **Code-block highlight policy.** The variant ships a 5-class monochrome highlight set. The architect decides whether highlighting runs server-side (deterministic, hashable) or client-side (per render, no cache). BLOCKS.md §8.4 normalisation does not include highlight markup (highlights are renderer-only) — confirm.
6. **`data-state="pinned"` for tests.** Should the variant export a `pinned: boolean` prop on `BlockView` to make Playwright tests trivially deterministic about strip visibility? (Variant A may not need this.)
7. **Mobile actions-sheet provenance.** The overflow opens a sheet; that sheet is presumably the host's existing pattern (DaisyUI `drawer` or a Tier-3 sheet). L2's renderer should expose an `onActionsRequested(blockId)` hook rather than owning the sheet.

---

## 11. Self-critique scores

Same 9 dimensions as Variant A. Scored 0–10.

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Concept-fidelity (BLOCKS.md §6/§8/§8.5) | 9 | All 9 kinds + `unknown` rendered. BlockId-hex permalink correct. No on-disk dialect introduced. The renderer is purely the read-side. |
| 2 | Information hierarchy & density | 9 | Body first; chrome second; strip last. Power-density goal hit — every block is scan-and-act in one move. Slight noise penalty for always-visible kind chrome (code bar, quote tint). |
| 3 | State coverage (empty/loading/error/populated/long/deleted/hover/focus/copy-success) | 9 | Every required state spec'd; reduced-motion + copy-success transient both addressed. -1 for not specifying loading skeleton geometry pixel-exact (deferred to host). |
| 4 | Component-budget discipline | 8 | Adds zero Tier-1/2/3 components; `block-action-strip` is a pattern. -2 for the implicit `Tag` `count` variant + StatusChip `unsupported` status, which need budget-sign-off in spec time. |
| 5 | Token discipline (no off-grid, no off-scale, AQ-101..AQ-113) | 9 | All spacing 4-px aligned, all radii from `--r0..--r3` + `--r-pill`, all motion from `--motion-*`, no purple/indigo gradient, no oversized padding, no rounded-2xl, no decorative icons, no hero, no marketing copy, no glass morph (slight backdrop-blur on the image-zoom overlay — kept inside the figure, not page chrome). |
| 6 | Keyboard / a11y | 9 | J/K/Enter/⌘L/⌘C/O/Escape all defined. Focus rings, focus-within reveals, aria-live on copy success, tabindex on every block. -1 for the volume of tab stops on long bodies — relies on J/K to be fast. |
| 7 | Mobile adaptation | 8 | Single column, sheet for actions, code/table overflow shadows, paragraph clamp, auto-density. -2 because the desktop chrome (kind-bars, quote tint) is unaltered on mobile, which can crowd narrow bodies. |
| 8 | Signature distinctiveness | 9 | Self-contained widgets, persistent corner strip, kind-specific micro-toolbars — clearly distinct from a markdown-page rendering and from a unified-gutter container variant. |
| 9 | Architect-readability of the spec | 9 | Tables, kind-by-kind matrix, explicit transitions table, explicit keyboard table, open-questions list. -1 for the remaining founder-call on permalink URL shape (deferred). |

**Total: 79 / 90.** All dimensions ≥ 8 — no fix needed.
