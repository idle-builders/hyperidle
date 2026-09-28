# UI design

## Stack

- **React** with Vite
- **Tailwind CSS 4** — utility-first, token-driven
- **DaisyUI 5** — component layer on top of Tailwind
- **Tiptap 3** — rich text editing

## Themes

Two themes: `hearth-light` (pale warm cream) and `hearth-dark` (deep warm with a lemon whisper). Light is the default. The active theme is stored in `localStorage` and applied as `data-theme` on the root. With no `data-theme`, `prefers-color-scheme` decides.

Token source of truth: `layers/core-ui/src/ds/tokens.css`.

## Components

Design system components live in `layers/core-ui/src/ds/`, re-exported from `ds/index.ts`. Shell and region components live in `layers/core-ui/src/shell/`. There is no separate design-system package.

Three tiers:
- **Tier 1** — foundational primitives (e.g. `Row`, `PageScaffold`, `PageHeader`)
- **Tier 2** — composed DS components
- **Tier 3** — page-local components promoted to the design system

Every DS component has a `.stories.tsx` file — that file is the design artifact.

Before adding a component, read `ds/index.ts`. If an existing export does the job, use it.

## PageScaffold and the scroll contract

`PageScaffold` is the one place a page declares its scroll contract. Two body modes:

- **`scroll`** (default) — the scaffold owns the scroll region
- **`managed`** — the child owns its own scrolling (split panes, conversation surfaces)

In both modes the scaffold guarantees the child a bounded flex column (`flex flex-col h-full`). The `AppShell` main area is `overflow-hidden`. A scrolling body must be a flex item of a bounded flex column — hand-writing the combination of classes that achieves this is an error (lint: `design/no-handrolled-page-scaffold`).

`frame="page"` wraps children in a centred `PageFrame`. `frame="local"` (default) leaves layout to the child.

One `h1` per page, always via `PageHeader`.

## Status colour meaning

`StatusChip` colour meanings: blue for calm/informational states, amber for attention states. Do not use colour to mean success/failure on neutral status rows — use the chip's text.

## Lint rules

The design lint rules live in `tools/eslint-plugin-design/`. Hard rules are documented in `.claude/rules/aesthetic-quality.md`. Component and token conventions are in `.claude/rules/design-system.md`. Do not restate them here — link to the rules.

Two lint scopes: `ds/**` (building the system) and everything else in `layers/core-ui/src` (using it). Severity differs per scope. See `tools/eslint-plugin-design/src/hearth-config.ts` for the full table.
