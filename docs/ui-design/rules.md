# Rules

Every component must justify its existence; merge near-duplicates before adding new ones.

1. **Don't wrap DaisyUI for the sake of wrapping.** Use `btn` directly in a page. Only create a Tier-1 primitive when it adds real semantics (state colour mapping, identity labels, label-value pairing, nav selection, standard search shape).
2. **Merge before you add.** If a new thing looks 80% like an existing Tier-2 block, make it a variant of that block, not a sibling.
3. **One shape per meaning.** One status chip, one card per domain object, one row per list context. Enforced by `design/no-local-status-builder`.
4. **Density over whitespace.** 9/12 px internal padding is the default on the 3px token grid (`--space-3` = 9 px, `--space-4` = 12 px). Whitespace is earned.
5. **Theme in one place.** All colour, radius, spacing changes happen in `framework/design-system/src/tokens.css` and the DaisyUI theme blocks in `layers/core-ui/src/index.css`. Never in a component.
6. **One scroll pattern, one component.** Every primary page composes `<PageScaffold>` — it is the only place a page declares its scroll contract, not a class-string pattern to copy (that split is exactly what let three pages drift and one, `WorkTeam`, ship with its Agents roster and Artifacts section unreachable — see `page-anatomy.md`). `PageScaffold`'s root is `flex flex-col h-full`; `header` (normally `PageHeader`) is `shrink-0`; the default `body="scroll"` owns `flex-1 overflow-y-auto` (marked `data-page-scroll`); `body="managed"` hands a self-scrolling child (`SplitView`, a detail pane) a bounded flex column instead. **No `min-h-0` on the scroll body** — proven redundant; see `page-anatomy.md`. The AppShell main pane is `overflow-hidden` — window-scroll is impossible, so every page that wants scrolling must own an internal scroll region via `PageScaffold`.
7. **One h1 per page.** `PageHeader` renders the page's single `<h1>` (its `title` prop, `level` defaults to `1`). No other element on the page may be `<h1>`. Section headings are `<h3>` via `SectionLabel` (default `as="h3"`).
8. **No handrolled page headers or scaffolds.** Use `PageHeader`; use `SectionLabel`; use `PageScaffold`. The `eslint-plugin-design` rules `no-handrolled-page-header`, `no-handrolled-page-scaffold`, and `no-undefined-font-heading` enforce this at error severity on `pages/**` (`eslint.config.ts`).

---
