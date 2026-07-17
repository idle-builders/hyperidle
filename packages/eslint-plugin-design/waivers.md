# Design Lint Waivers (K8)

Per K8 acceptance criteria: rules in `packages/design-system/src/**` that fire
zero warnings post-K7 are promoted to `error`. Rules that still emit
warnings remain at `warn` and every surviving warning is documented here
with file:line + reason. The K6 plugin itself is unchanged — only
`eslint.config.js` per-path severity is adjusted.

Reviewed against the K7 baseline at commit `1f38497`.

## Rules promoted to `error` for `packages/design-system/src/**`

These rules fired zero warnings on the design-system package post-K7; they
are now hard errors there. They remain `warn` for `packages/web/src/**`
because consumer code (pages, shells) still has a small backlog.

- `design/no-hardcoded-color`
- `design/no-off-scale-radius`
- `design/no-off-scale-font-size`
- `design/no-raw-tailwind-color`
- `design/require-ds-attribute`
- `design/require-stories-sibling`
- `design/require-focus-on-interactive`

## Rules kept at `warn` for `packages/design-system/src/**` (with waivers)

### `design/no-off-grid-spacing`

Two surviving warnings, both documented designer-call exceptions per the
K1 spacing audit. Promoting this rule to `error` would force a token
refactor that is out of scope for K8.

- **`packages/design-system/src/KnowledgeRow.tsx:76`** — `py-[2px]` on the
  factory-mode version pill. 2px sub-grid is reserved for chip-internal
  geometry; the pill is a chip-shaped element and 4px would visibly
  bloat the row height past the K7 row-density target. K7 lore comment
  inline at line 72-75 cites AESTHETICS.md § Spacing & Density and the
  recommendation row "Letter-spacing for caps".

- **`packages/design-system/src/SearchField.tsx:41`** — `pr-[56px]` on the
  search input. K7 designer-call documented inline at line 58-61 of the
  source: "56px right-inset is the geometric minimum required to clear
  the clear-button + gap + kbd shortcut indicator." Audit B.1.5.

### `design/no-ai-aesthetic`

One surviving warning in design-system, also a documented exception.

- **`packages/design-system/src/SearchField.tsx:53`** — `&#x2715;` (×) used
  as the clear-button glyph. Unicode multiplication sign is the canonical
  cross-glyph for input-clear affordances across every major design
  system (Material, Carbon, Polaris). The lint flags it as
  "leading emoji" because it is a non-ASCII pictographic character; in
  this context it is a typographic symbol, not iconography. A Lucide
  `<X>` icon would require an extra wrapper SVG and disrupt the
  inline-text close button. Designer-call exception from the K7 review.

### `design/no-off-scale-font-size`

One waivered usage in design-system, suppressed inline with
`eslint-disable-next-line` and a reason.

- **`packages/design-system/src/ThreadRow.tsx:117`** — host-tag pill uses
  `text-[10px]` mono. L8 approved design §5.6 mandates 10px @ 1px×6px
  padding @ `--r-pill` radius for the host pill so it visually anchors to
  but does not compete with sibling primitives (StatusChip / Tag at 11px
  / 12px). Inline lore comment cites the spec; pixel-parity vs the L8
  mockup is enforced by the visual-parity tests. Promote to a shared
  `HostPill` primitive (with this waiver moved to that file) when a
  second consumer surfaces.

## Rules at `warn` for `packages/web/src/**` (no promotion)

The wider web codebase still has 5 documented warnings (not in scope for
K8 promotion):

- `design/require-focus-on-interactive` × 2 (`GlobalSearchPanel.tsx:255`,
  `SettingsPanel.tsx:359`) — both are dialog-overlay backdrops with
  click-outside-to-close handlers, not user-reachable interactive
  primitives. Tracked for J-track follow-up.
- `design/no-ai-aesthetic` × 2 (`PitchSelector.tsx:90, 115`) — emoji used
  in test-fixture mock data, not in shipped chrome. To be replaced when
  the pitch-selector ships real fixtures.
- `react-compiler/react-compiler` × 1 (`DesignSystem.tsx:88`) — story
  loader's `import.meta.glob` callback shape; non-blocking.

These remain `warn` so the noise stays visible without breaking lint
locally.

---

## LG1 Phase 4 waivers (promoted to error, inline-disabled with reason)

### `design/require-focus-on-interactive` — `packages/web/src/**`

Both surviving warnings are inline-disabled with `eslint-disable-next-line` +
reason comment at the site. They are NOT user-reachable interactive primitives:

- **`packages/web/src/components/GlobalSearchPanel.tsx:145`** — `aria-hidden="true"`
  scrim/backdrop div with `onClick={onClose}`. Keyboard close is handled by the
  Escape key in `useKeyboardNavigation` — the backdrop is purely visual. Already
  had a `biome-ignore lint/a11y/useKeyWithClickEvents` comment for the same reason.

- **`packages/web/src/shell/Sidebar.tsx:607`** — wrapper div around `<SearchField>`
  that supplements pointer click for the Cmd+K hint. `SearchField` inside is the
  real keyboard-accessible interactive target. Already had two
  `biome-ignore lint/a11y/...` comments for the same reason.

### `design/no-ai-aesthetic` — `packages/web/src/**`

Waivers for typographic symbols and deliberate fake-browser-chrome design. All
inline-disabled with `eslint-disable-next-line` + reason at the site.

- **`packages/web/src/components/ReviewBrowserPreview.tsx:256`** — `✓` (U+2713)
  inside the rendered fake pricing-page content, `aria-hidden="true"`. The file
  header (lines 1-16) explicitly states that the rendered page is "the one place
  neutral page styling is allowed — it must read as a real web page." The symbol
  is page content, not product chrome.

- **`packages/web/src/components/ReviewBrowserPreview.tsx:375`** — `🔒` (lock emoji)
  in the URL bar of the fake browser chrome, `aria-hidden="true"`. Part of the
  deliberately-designed fake-browser simulation; the file header cites this pattern.

- **`packages/web/src/components/ReviewComposition.tsx:667`** — `✕` (U+2715) in a
  close button with `aria-label="Close artifact"`. Typographic symbol (same pattern
  as the K8-waivered `SearchField.tsx:53` `×` clear-button glyph).

- **`packages/web/src/components/ReviewMetricsMoved.tsx:382`** — `✓` in a
  `<span aria-hidden="true">` with explicit `color: var(--status-success)` token.
  Typographic symbol as status indicator, accessible label via parent element.

- **`packages/web/src/components/ReviewOutcomeSummary.tsx:317`** — `✓` in a
  `<span aria-hidden="true">`. Same pattern.

- **`packages/web/src/settings/SettingsHarnesses.tsx:347`** — `✕` in a `<Button>`
  with `aria-label="Close detail"`. Typographic symbol (same pattern as above).

- **`packages/web/src/shell/TaskSheet.tsx:409`** — `✕` in a `<button>` with
  `aria-label="Close"`. Typographic symbol. (TaskSheet:400 `shadow-lg` was a real
  fix — changed to `shadow-[var(--shadow-elevated)]` per AQ-012.)

---

## LG1 Phase 9a waivers (design/no-hardcoded-color — browser-chrome mockup files)

### `design/no-hardcoded-color` — AL1 fake browser/inbox chrome family

Both files are waived in their entirety via a scoped `eslint.config.ts` override block
(see the "LG1 Phase 9a" comment block near the end of `eslint.config.ts`). The rule
is turned **off** for these two file paths only. All other `packages/web/src/**` files
remain covered.

**Rationale:** These files deliberately hand-build fake browser or inbox chrome with
neutral, email-safe-style inline styling (white backgrounds, neutral borders, subtle
grays). Converting those values to Hearth semantic tokens would fight the founding
design intent: the rendered page/email IS the artifact under review and must look like
a real web page or email — not like Hearth chrome.

The REVIEW CHROME wrapper elements (header bar, URL bar, verdict pills) in both files
already use Hearth/CP1 tokens by name (AQ-008 compliant). Only the rendered
page/email body contains the deliberate neutral colors. The distinction is documented
inline in each file's header.

**File-level founding rationale (quoted directly from each file's header comment):**

- **`packages/web/src/pages/review/ReviewBrowserPreview.tsx`** (27 findings waived) —
  lines 1-16: *"The REVIEW CHROME (header, URL bar, verdict pills) uses Hearth/CP1
  tokens by name only (AQ-008); the rendered page is the one place neutral page
  styling is allowed, because that IS the artifact under review (it must read as a
  real web page)."* Founder direction (human-design-review round 1): *"not all stuff
  will be combined and fancy — some things will be a simple browser window to look
  at."*

- **`packages/web/src/pages/review/ReviewRenderedInContext.tsx`** (11 findings waived)
  — lines 9-15: *"The email body is hand-built from divs with neutral, email-safe
  inline styling... the REVIEW CHROME around it uses Hearth/CP1 tokens by name only
  (AQ-008); the email body is the one place neutral email styling is allowed, because
  that IS the artifact under review (it must look like an email, not like Hearth
  chrome)."*

**What is NOT waived:** any hardcoded colors outside these two specific files in the
AL1 review-canvas family (e.g. `ReviewComposition.tsx`, `ReviewVisualDiff.tsx`) are
NOT part of this waiver and must use semantic tokens.
