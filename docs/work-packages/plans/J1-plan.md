# J1 — Token & Primitive Updates — Implementation Plan

Worktree: `/workspace/.worktrees/J1` (branch `feat/J1-token-primitive-updates`).

## 1. Context

J1 activates the design token system so downstream J-track stories inherit the correct visual foundation. Two surgical changes:

- **Density knob** — `SettingsData.appearance.density` (compact | default | comfortable) must change visible spacing/text-size when selected.
- **Tag kind** — optional `kind?: "pattern" | "decision" | "failure"` on `<Tag>` renders a subtle icon + muted tint; no kind means zero behavioural change.

## 2. Constraints & current state

- `Density` type today = `"comfortable" | "compact"` (SettingsPanel.tsx:36). J1 spec requires three values; `"default"` must be added.
- Fixture default today = `"comfortable"`. Story spec aligns density modes to `compact | default | comfortable` — the neutral middle state should be renamed `default`. `DEFAULT_SETTINGS` in `app-shell-data.ts` becomes `density: "default"`.
- `foundation.test.ts` enforces: `index.css` must contain **only** `@tailwind`, `@import`, `@layer base { :root { --foo: … } }`, and comments. Any new CSS must stay inside that envelope — no new class selectors. Density is implemented as **CSS variables only**, consumed via `var(--…)` on utility arbitrary values — we do NOT introduce new Tailwind utility classes.
- `no-base-content-text-tokens.test.ts` bans `text-base-content/XX`. No change needed.
- `bun run test` runs Vitest; every new component/variant needs a story entry at `/designsystem`.
- `lucide-react` is **not** a dependency. Other Tier-2 icons in the codebase are inline 16×16 SVGs (`shell-types.ts`). We follow that pattern — no new npm dep.
- 19-component budget: no new components. Only variant of existing `Tag`.
- `factory-dark` theme tokens only. Tag `kind` tints must reuse existing CSS vars (`--surface-3/4/5`, `--text-mid/lo`, and the semantic DaisyUI colours `--p`, `--wa`, `--er` that DaisyUI already emits from the theme). No new colour values.

### CONFUSION: density canonical name for middle value

Existing code uses `"comfortable" | "compact"` (compact being tighter). Spec lists `compact | default | comfortable` — three steps, with `default` in the middle.

Options:
A) Rename current `"comfortable"` → `"default"`, add a new `"comfortable"` that is roomier. Consequence: the current middle state keeps its current scale values (minimal visual churn), new `"comfortable"` is the airy variant. Fixture + tests that set `"comfortable"` must be updated to `"default"`.
B) Keep `"comfortable"` as its current scale, add a new `"default"` that sits between compact and comfortable. Consequence: three distinct scale sets; default fixture should switch to `"default"`; churn is two values instead of one name rename.

Proceeding with **(A)** because the current `"comfortable"` fixture + select value is the visual baseline all other components were designed against. Renaming that baseline to `"default"` keeps current rendering pixel-identical for the common case and adds a genuinely roomier option above it. Flag for review.

## 3. Design

### 3.1 Density → CSS variables

Add a single scale layer (no class selectors, variable assignments only) inside `index.css`:

```
@layer base {
  :root,
  [data-density="default"] {
    --density-pad-x: 0.75rem;   /* 12px  */
    --density-pad-y: 0.5rem;    /* 8px   */
    --density-gap:   0.5rem;    /* 8px   */
    --density-row-h: 2rem;      /* 32px  */
    --density-text:  0.875rem;  /* text-sm */
  }
  [data-density="compact"] {
    --density-pad-x: 0.5rem;    /* 8px   */
    --density-pad-y: 0.25rem;   /* 4px   */
    --density-gap:   0.25rem;   /* 4px   */
    --density-row-h: 1.75rem;   /* 28px  */
    --density-text:  0.8125rem; /* 13px  */
  }
  [data-density="comfortable"] {
    --density-pad-x: 1rem;      /* 16px  */
    --density-pad-y: 0.75rem;   /* 12px  */
    --density-gap:   0.75rem;   /* 12px  */
    --density-row-h: 2.25rem;   /* 36px  */
    --density-text:  0.9375rem; /* 15px  */
  }
}
```

Variable names introduced: `--density-pad-x`, `--density-pad-y`, `--density-gap`, `--density-row-h`, `--density-text`. (Five — intentionally small surface.)

### 3.2 Applying density

Flow: user picks density in `AppearanceTab` → `SettingsPanel` saves → `AppShell` reads persisted value → applies `data-density="…"` to the outer shell `<div>` → CSS vars cascade to consumers.

Current gap: `AppShell` does NOT read `DEFAULT_SETTINGS.appearance.density` today — it only passes `DEFAULT_SETTINGS` into `<SettingsPanel />`. Two changes:

- Lift density to `AppShell` local state (`useState<Density>(DEFAULT_SETTINGS.appearance.density)`), seeded from `DEFAULT_SETTINGS`, updated in `handleSettingsSave`.
- Apply `data-density={density}` to the root `<div className="flex h-screen …">` in `AppShell`.

No persistence to server is introduced in J1 (explicitly out of scope; `handleSettingsSave` today is a mock). The live toggle must still re-render on Save — that is sufficient for acceptance criterion "changing density visibly affects padding, gap, and text sizing".

Consumers that must move to density variables in J1 to *prove* the pipeline works (the ones the validation scenario "visibly tighter than default" can observe):

1. `AppShell` main content container: `p-3` → arbitrary `p-[var(--density-pad-y)_var(--density-pad-x)]` (or split into `px-[...] py-[...]`).
2. `Submenu` header row and list gap — swap `gap-*` hard values for `gap-[var(--density-gap)]`.
3. `NavItem` row vertical padding — one utility swap.
4. `Tag` padding driven by DaisyUI `badge-sm` (unchanged). Tag text size, however, adapts via `text-[length:var(--density-text)]` so the primitive picks up density without needing variants.

Everything else can stay on fixed Tailwind utilities for J1; downstream J2/J4/J5 will adopt further. J1's obligation is only that **some observable spacing changes** when the knob is flipped, and that the scale exists for reuse.

### 3.3 Tag `kind` variant

Extend `TagProps`:

```
type TagKind = "pattern" | "decision" | "failure";
export interface TagProps {
  label: string;
  kind?: TagKind;
}
```

When `kind` is undefined: render identical to today (`badge badge-neutral badge-sm border-0` wrapping label only). No DOM changes.

When `kind` is set: render `<span class="badge badge-sm border-0 {tintClass}">{icon}{label}</span>` where `icon` is the SVG from `TAG_KIND_ICONS[kind]` sized `w-3 h-3` and tinted via DaisyUI semantic text colour.

#### 3.3.1 Single centralised kind map

New file: `packages/web/src/components/tag-kinds.tsx`.

```
import type { ReactNode } from "react";

export type TagKind = "pattern" | "decision" | "failure";

export interface TagKindMeta {
  icon: ReactNode;   // inline SVG, 12x12, fill="currentColor"
  tintClass: string; // Tailwind class string applied to the badge span
  ariaLabel: string; // screen-reader prefix ("Pattern: foo")
}

export const TAG_KIND_ICONS: Record<TagKind, TagKindMeta> = {
  pattern:  { icon: <svg …/>, tintClass: "bg-[var(--surface-4)] text-[var(--text-mid)]", ariaLabel: "Pattern" },
  decision: { icon: <svg …/>, tintClass: "bg-[color-mix(in_srgb,var(--p)_12%,var(--surface-3))] text-[var(--p)]", ariaLabel: "Decision" },
  failure:  { icon: <svg …/>, tintClass: "bg-[color-mix(in_srgb,var(--er)_15%,var(--surface-3))] text-[var(--er)]", ariaLabel: "Failure" },
};
```

Icon choices (minimal 12×12 glyphs, `currentColor` so tint cascades):

| kind     | glyph               | rationale                                   |
|----------|---------------------|---------------------------------------------|
| pattern  | three stacked lines | represents recurring structure              |
| decision | check-in-diamond    | commitment / gate                           |
| failure  | triangle with slash | muted warning (not full `alert-error` red)  |

⚠️ UNVERIFIED: `color-mix()` has broad 2024+ browser support but confirm against the target matrix during code review. If unacceptable, fall back to a hard-coded muted tint using `bg-[var(--surface-4)]` with semantic `text-[var(--p)]`/`text-[var(--er)]` only (still no new tokens). Recorded as risk R4.

#### 3.3.2 Why a separate file

Keeps the map importable by tests without pulling `Tag.tsx`'s React render. Also satisfies constraint "icon map is a SINGLE constant — not scattered".

### 3.4 Updated Tag component

```
import { TAG_KIND_ICONS, type TagKind } from "./tag-kinds";

export interface TagProps { label: string; kind?: TagKind; }

export function Tag({ label, kind }: TagProps): JSX.Element {
  if (!kind) {
    return <span className="badge badge-neutral badge-sm border-0">{label}</span>;
  }
  const meta = TAG_KIND_ICONS[kind];
  return (
    <span
      className={`badge badge-sm border-0 inline-flex items-center gap-1 ${meta.tintClass}`}
      aria-label={`${meta.ariaLabel}: ${label}`}
    >
      <span aria-hidden="true" className="inline-flex">{meta.icon}</span>
      {label}
    </span>
  );
}
```

Invariant: when `kind === undefined`, the returned JSX is byte-identical to the current component. This is what guarantees **zero regressions** for existing Tag tests (which assert `badge-neutral`, no `badge-outline`, SPAN element — all still true for the default path).

## 4. Files to create / modify

Create:
- `packages/web/src/components/tag-kinds.tsx` — `TagKind` type, `TAG_KIND_ICONS` constant + `TagKindMeta` interface.
- `packages/web/src/__tests__/tag-kinds.test.ts` — asserts map completeness + structure.
- `packages/web/e2e/density-toggle.spec.ts` — Playwright smoke: toggle density, assert computed padding changes on `[data-testid="main-content"]`.

Modify:
- `packages/web/src/index.css` — add density `@layer base` block (variables only, no selectors that emit CSS rules beyond `:root`/`[data-density=…]`).
- `packages/web/src/components/Tag.tsx` — accept `kind?: TagKind`; delegate styling.
- `packages/web/src/components/Tag.stories.tsx` — add `Pattern`, `Decision`, `Failure`, and `KindGroup` stories.
- `packages/web/src/components/SettingsPanel.tsx` — widen `Density` to `"compact" | "default" | "comfortable"`; add `"default"` option to `<select>`; relabel `"Comfortable"` option (optional string polish).
- `packages/web/src/fixtures/app-shell-data.ts` — `density: "default"` (was `"comfortable"` — per CONFUSION resolution A).
- `packages/web/src/layouts/AppShell.tsx` — local density state, `data-density` on root, update on save.
- `packages/web/src/__tests__/foundation.test.ts` — extend `index.css` strip regex to allow `[data-density=…]` variable blocks (the existing strip only allows `@layer base { :root { … } }`). Write the extension narrowly: still forbid selectors that contain `.`, `#`, or direct element names.
- `packages/web/src/__tests__/SettingsPanel.test.tsx` — add a case for `density === "default"` round-trip; update type fixture if needed (the existing "comfortable" test stays valid — both values are legal).

Do NOT modify:
- `Tag.test.tsx` — acceptance criterion explicitly requires it passes **unmodified**. Our no-kind branch preserves exact markup.
- `StatusChip.test.tsx`, `KeyValue.test.tsx`, `NavItem.test.tsx`, `SearchField.test.tsx` — no behaviour change. Verify untouched.

## 5. Test plan

### Density wiring (≥ 3 new tests)

1. **foundation.test.ts (new case)** — reads `index.css`, asserts the three variable blocks `[data-density="compact"]`, `[data-density="default"]`, `[data-density="comfortable"]` exist and each defines the five `--density-*` vars.
2. **AppShell.test.tsx (new case)** — renders `<AppShell>`, asserts root `<div>` carries `data-density` attribute. Default value matches `DEFAULT_SETTINGS.appearance.density`.
3. **AppShell.test.tsx (new case)** — open Settings → change density to "compact" → Save → `data-density` on shell root updates to `"compact"`. Uses RTL + `userEvent`.
4. **E2E density-toggle.spec.ts** — Playwright: open app, open Settings, pick Compact, Save; `getComputedStyle` of main content reports a smaller `padding-left` than the default snapshot. (Proves the variable actually reaches the DOM.)

### Tag kind (≥ 3 new tests)

5. **Tag.test.tsx (new cases, added alongside existing — existing 4 unchanged)**
   - `renders with no kind → output identical to baseline` (re-asserts badge-neutral path).
   - `kind="pattern"` renders a child `<svg>` with `aria-hidden`.
   - `kind="decision"` applies decision tint class and `aria-label` starting with "Decision".
   - `kind="failure"` applies failure tint class.
6. **tag-kinds.test.ts** — map has exactly three keys, each with `icon`, `tintClass`, `ariaLabel`; no duplicate `ariaLabel`s; every `tintClass` is a non-empty string and does NOT contain `text-base-content/` (token hygiene).

### Regression proof

- Run full `bun run test`. All pre-existing Tag/StatusChip/KeyValue/NavItem/SearchField tests must pass with **no modification**. CI diff check: `git diff --name-only` on those `__tests__` files should be empty for everything other than Tag.test.tsx (additions only; existing assertions untouched).

## 6. Trade-offs

- **Choosing** inline SVG + single constant over `lucide-react`: zero new dependency, matches existing icon pattern in `shell-types.ts`, avoids tree-shake/bundle weight. **Giving up** a richer pre-drawn icon set — but only three icons are needed for J1.
- **Choosing** `data-density` attribute + CSS vars over a React Context `DensityProvider`: smaller blast radius, no subscription plumbing, works for every consumer without a hook call. **Giving up** the ability to read density from JS without a DOM query — acceptable because the spec is about CSS output, not logic.
- **Choosing** renaming `"comfortable"` → `"default"` and adding a new `"comfortable"` above: preserves current look. **Giving up** label stability for the one fixture entry. Mitigation: only one fixture + two tests touch it.
- **Choosing** local density state in `AppShell` (no persistence): matches current mock `onSave`. **Giving up** cross-reload persistence — explicitly deferred (J1 is tokens + primitive, not settings persistence).

## 7. Risks

- **R1 — Foundation test breaks.** Current `foundation.test.ts` strip regex assumes only `:root` inside `@layer base`. Adding `[data-density="…"]` blocks will make the regex flag class-like definitions as leftover. Mitigation: extend the strip to tolerate attribute selectors and assert the final scan only rejects real class/id selectors. This test edit is intentional and scoped.
- **R2 — Density values collide with DaisyUI badge sizes.** `badge-sm` has fixed height. Mitigation: Tag uses `text-[length:var(--density-text)]` for label sizing only; DaisyUI badge paddings are not overridden.
- **R3 — Tailwind JIT arbitrary-value support for `var(…)`.** Tailwind 3.4+ supports `text-[length:var(--x)]` and `p-[var(--x)]`. Already in use (`bg-[var(--surface-4)]` appears throughout). Low risk.
- **R4 — `color-mix()` browser support.** If the target browser matrix predates Chromium 111 / Safari 16.2, fall back to flat `bg-[var(--surface-4)]` for all three kinds (differentiated only by `text-*` colour + icon). Cheap swap, decided at review.
- **R5 — "No new fonts / no new colour tokens" bleed-through.** We introduce five *spacing/text-size* tokens, zero colour tokens. Tag tints reuse `--p`, `--er`, `--surface-*` that DaisyUI already emits from `factory-dark`. Compliant.
- **R6 — Playwright E2E flakiness on computed padding.** Read `getComputedStyle(el).paddingLeft` and assert *less than* the default snapshot rather than an exact px value — robust against future scale tweaks.

## 8. Open questions

- Should density persist across reloads in J1 or is mock-save sufficient? **Assumed mock-save** (matches existing `handleSettingsSave`). Flag for designer if they want localStorage in J1.
- Should the `Density` type live in `@hyperidle/shared` so the server/API can consume it later? **Deferred** — not needed for J1; move when J3/J8 wire persistence.
- Final icon glyphs for pattern/decision/failure — prose describes shapes. Exact paths are an implementation detail; adversary review can veto at PR time.

## 9. Order of operations (TDD)

1. Write failing tests (1, 2, 3, 6) + extend Tag.test.tsx with kind cases.
2. Add `tag-kinds.tsx` + update `Tag.tsx` — test cases 5, 6 go green.
3. Add density CSS block + `data-density` on AppShell — test cases 1, 2, 3 go green.
4. Widen `Density` type + SettingsPanel select + fixture update.
5. Add `density-toggle.spec.ts` Playwright → run against `bun dev`.
6. Update `foundation.test.ts` strip regex (case 1 passes).
7. Run `bun run check` + `bun run lint` + `bun run test`. All green.
8. Add Tag stories (`Pattern`, `Decision`, `Failure`, `KindGroup`). Verify `/designsystem`.
