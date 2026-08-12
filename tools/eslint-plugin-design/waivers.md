# Design Lint Waivers (K8)

Per K8 acceptance criteria: rules in `framework/design-system/src/**` that fire
zero warnings post-K7 are promoted to `error`. Rules that still emit
warnings remain at `warn` and every surviving warning is documented here
with file:line + reason. The K6 plugin itself is unchanged — only
`eslint.config.js` per-path severity is adjusted.

Reviewed against the K7 baseline at commit `1f38497`.

## Rules promoted to `error` for `framework/design-system/src/**`

These rules fired zero warnings on the design-system package post-K7; they
are now hard errors there. They remain `warn` for `layers/core-ui/src/**`
because consumer code (pages, shells) still has a small backlog.

- `design/no-hardcoded-color`
- `design/radius-token-only` (AZ7 renamed `no-off-scale-radius` → `radius-token-only` and tightened its allowlist; the design-system package remains at zero survivors under the new rule too)
- `design/no-off-scale-font-size`
- `design/no-raw-tailwind-color`
- `design/require-ds-attribute`
- `design/require-stories-sibling`
- `design/require-focus-on-interactive`

## Rules kept at `warn` for `framework/design-system/src/**` (with waivers)

### `design/no-off-grid-spacing`

Two surviving warnings, both documented designer-call exceptions per the
K1 spacing audit. Promoting this rule to `error` would force a token
refactor that is out of scope for K8.

- **`framework/design-system/src/KnowledgeRow.tsx:76`** — `py-[2px]` on the
  factory-mode version pill. 2px sub-grid is reserved for chip-internal
  geometry; the pill is a chip-shaped element and 4px would visibly
  bloat the row height past the K7 row-density target. K7 lore comment
  inline at line 72-75 cites AESTHETICS.md § Spacing & Density and the
  recommendation row "Letter-spacing for caps".

- **`framework/design-system/src/SearchField.tsx:41`** — `pr-[56px]` on the
  search input. K7 designer-call documented inline at line 58-61 of the
  source: "56px right-inset is the geometric minimum required to clear
  the clear-button + gap + kbd shortcut indicator." Audit B.1.5.

### `design/no-ai-aesthetic`

One surviving warning in design-system, also a documented exception.

- **`framework/design-system/src/SearchField.tsx:53`** — `&#x2715;` (×) used
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

- **`framework/design-system/src/ThreadRow.tsx:117`** — host-tag pill uses
  `text-[10px]` mono. L8 approved design §5.6 mandates 10px @ 1px×6px
  padding @ `--r-pill` radius for the host pill so it visually anchors to
  but does not compete with sibling primitives (StatusChip / Tag at 11px
  / 12px). Inline lore comment cites the spec; pixel-parity vs the L8
  mockup is enforced by the visual-parity tests. Promote to a shared
  `HostPill` primitive (with this waiver moved to that file) when a
  second consumer surfaces.

## Rules at `warn` for `layers/core-ui/src/**` (no promotion)

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
