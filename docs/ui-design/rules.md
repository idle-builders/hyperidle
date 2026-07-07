# Rules

Every component must justify its existence; merge near-duplicates before adding new ones.

1. **Don't wrap DaisyUI for the sake of wrapping.** Use `btn` directly in a page. Only create a Tier-1 primitive when it adds real semantics (state colour mapping, identity labels, label-value pairing, nav selection, standard search shape).
2. **Merge before you add.** If a new thing looks 80% like an existing Tier-2 block, make it a variant of that block, not a sibling.
3. **One shape per meaning.** One status chip, one card per domain object, one row per list context. Enforced by `design/no-local-status-builder`.
4. **Density over whitespace.** 9/12 px internal padding is the default on the 3px token grid (`--space-3` = 9 px, `--space-4` = 12 px). Whitespace is earned.
5. **Theme in one place.** All colour, radius, spacing changes happen in `packages/design-system/src/tokens.css` and the DaisyUI theme blocks in `packages/web/src/index.css`. Never in a component.
6. **One scroll pattern.** Every primary page root is `flex flex-col h-full`. `PageHeader` is `shrink-0` (pinned). The body region is `flex-1 overflow-y-auto`. The AppShell main pane is `overflow-hidden` — window-scroll is impossible, so every page that wants scrolling must own an internal scroll region.
7. **One h1 per page.** `PageHeader` renders the page's single `<h1>` (its `title` prop, `level` defaults to `1`). No other element on the page may be `<h1>`. Section headings are `<h3>` via `SectionLabel` (default `as="h3"`).
8. **No handrolled page headers.** Use `PageHeader`; use `SectionLabel`. The `eslint-plugin-design` rules `no-handrolled-page-header` and `no-undefined-font-heading` enforce this at error severity on `pages/**` (`eslint.config.ts:195-196`).

---
