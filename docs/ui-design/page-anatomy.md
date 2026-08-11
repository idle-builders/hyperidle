# Page Anatomy

Every primary page shares the same scaffold: a pinned header strip, a scrolling body, and a single `<h1>`. **PageScaffold** owns the scroll contract; **PageHeader** and **SectionLabel** encode the header/section-opener treatment.

Source: `framework/design-system/src/PageScaffold.tsx`, `framework/design-system/src/PageHeader.tsx`, `framework/design-system/src/SectionLabel.tsx` (AI7, AZ2).

---

## Scaffold

Before AZ2, this section documented a *pattern* — a class-string combination every page hand-copied. That prose was correct but incomplete: it showed the scrolling body as a direct child of the root and never said it had to be. Three pages inserted a plain block between them, and one of the three (`WorkTeam`) went a full release with its Agents roster and Artifacts section completely unreachable below the fold — no scroll container on the page at all. The fix isn't a better sentence; it's a component the prose can't be pasted around.

```tsx
import { PageScaffold, PageHeader } from "@hyperidle/design-system";

// Every primary page root
<PageScaffold header={<PageHeader title="Page Name" />}>
  {/* page content — the scaffold owns the scroll region */}
</PageScaffold>
```

`PageScaffold` takes two body modes:

- **`body="scroll"`** (default) — the scaffold owns the scroll region itself: `flex-1 overflow-y-auto`, marked `data-page-scroll` so e2e evidence and tests can find it without pinning a class literal.
- **`body="managed"`** — the child owns its own scrolling (`SplitView`, `ConversationSurface`, a detail pane like `RoutineDetailPane`/`AgentDetailPane`). The scaffold still guarantees the child a bounded flex column to size against: `flex-1 min-h-0 flex flex-col overflow-hidden`. This is the exact shape the WorkTeam defect was missing — a block wrapper (`overflow-hidden`, no `flex-col`) gives a flex-1 child nothing to size against, so it grows to its full content height instead of clipping/scrolling.

**The real invariant** (proven in headless Chromium, not asserted): *a scrolling body must be a flex item of a flex column whose own height is bounded.* Three ways to break it, all fixed by routing through `PageScaffold` instead of hand-writing the classes: a block wrapper between root and body; a root that never fixes its own height (missing `h-full`); an intermediate flex column with visible overflow and no `min-h-0` reset.

**`min-h-0` does *not* belong on the scroll body.** This surprises people, so it's worth stating plainly: a headless-Chromium probe proved it is a no-op there — an element whose computed `overflow-y` is not `visible` already receives an automatic flex-item minimum size of zero, so `overflow-y-auto` supplies the reset by itself. `min-h-0` earns its keep in exactly one place, the **managed** body's wrapper, which is an intermediate flex column that does not set its own overflow and therefore needs the explicit reset. If you're tempted to add `min-h-0` to a scroll body to fix a clipping bug, it won't — the real fix is almost always a missing bounded flex column ancestor (route through `body="managed"` or fix the wrapper between root and body).

The AppShell page-host is `overflow-hidden` (`AppShell.tsx`). Window-level scroll is impossible — every page that needs any scroll must own an internal scroll region via `PageScaffold`. Applies to **every return branch** (loading, error, not-found, populated), not just the happy path.

A page with no title strip (e.g. `ArtifactPermalink`) omits `header` entirely — `PageScaffold` renders the scroll body directly under the root.

---

## PageHeader

**Tier-1 primitive** (`@hyperidle/design-system`). The pinned top strip of a primary page. Props and defaults are documented in JSDoc at `PageHeader.tsx:40-68`.

```tsx
import { PageHeader, pageTitleClassName } from "@hyperidle/design-system";

// Minimal
<PageHeader title="Work / Portfolio" />

// Full
<PageHeader
  title="HyperIdle Core"
  leading={<Breadcrumb … />}
  subtitle="Phase: build · Lead: Dana"
  actions={<><StatusChip … /><Button … /></>}
/>

// Editable title — compose pageTitleClassName on an <input> (KnowledgeCreate.tsx:142)
<PageHeader
  title={
    <input
      className={`${pageTitleClassName} bg-transparent border-none outline-none flex-1 p-0`}
      aria-label="Document title"
    />
  }
/>
```

The exported `pageTitleClassName` constant lets pages with an editable title reuse the same typographic treatment without repeating the literal string. Composing it as an identifier expression is always compliant with the `no-handrolled-page-header` lint rule.

`level` defaults to `1` (`<h1>`). Pass `level={2}` only for a sub-page whose title is not the document's top heading — none of the current pages need this.

---

## SectionLabel

**Tier-1 primitive** (`@hyperidle/design-system`). The uppercase opener of a content section. Props and defaults are documented in JSDoc at `SectionLabel.tsx:28-42`.

```tsx
import { SectionLabel } from "@hyperidle/design-system";

// Minimal
<SectionLabel label="Team members" />

// With trailing action
<SectionLabel label="Tasks" trailing={<Button size="xs">New</Button>} />

// With divider (WorkBet/WorkTask style)
<SectionLabel label="Context" divider />

// As h2 (KnowledgeDetail sidebar — SectionLabel is the top body heading)
<SectionLabel label="Backlinks" as="h2" />
```

`as` defaults to `"h3"` — one level below the `<h1>` PageHeader title. Pass `as="h2"` where SectionLabel is the page's top body heading (KnowledgeDetail sidebar pattern).

---

## Heading-level contract

| Element | Tag | Rule |
|---|---|---|
| Page title | `<h1>` | PageHeader `level` defaults to 1. One per page — no other element may be `<h1>`. |
| Section opener | `<h3>` | SectionLabel `as` defaults to `"h3"`. Pass `as="h2"` when the section label is the page's top body heading. |

---

## Enforcement

Three `eslint-plugin-design` rules live in `tools/eslint-plugin-design/src/rules/`.

**`no-handrolled-page-scaffold`** (AZ2) — Error on `layers/core-ui/src/pages/**`. A flat prohibition: a page may not hand-write a scrolling body — only `PageScaffold` may. Two arms: a class string combining `flex-1` with a vertical scroll overflow (`overflow-y-auto`, `overflow-auto`, `overflow-y-scroll`); or `flex-1` with `overflow-hidden` **without** `flex-col` (the exact `WorkTeam.tsx:709` shape the live defect traced to). Reads static `className` string literals only, the same documented limit as `no-handrolled-page-header` below.

**`no-handrolled-page-header`** — Error on `layers/core-ui/src/pages/**`. Flags the inline literal combination `text-[20px]` + `font-[600]` + `tracking-[-0.01em]` on any element that is not `PageHeader`. Composing `pageTitleClassName` as an identifier expression is always compliant. SettingsPage.tsx and SetupFlow.tsx are exempt via `eslint.config.ts:184-185` pending their migration.

**`no-undefined-font-heading`** — Error on `pages/**`, warn on the rest of `layers/core-ui/src/**`. Flags `font-heading` everywhere (undefined Tailwind utility — silent CSS no-op). Flags `tracking-wider` only on heading elements (h1–h6) inside `pages/**` (`inPages && isHeading`, `no-undefined-font-heading.ts:105`).

Runtime evidence for the scroll contract (a real browser, not a lint rule) lives in `layers/core-ui/__e2e__/AZ2-page-scroll.spec.ts` — per route × viewport (1440×900, 1024×768, 375×812): scroll-container count, clipped-content measurement, and the last content element's reachability by scrolling to the end.

Run `npm run lint:eslint` to check the static rules. RuleTester unit tests: `tools/eslint-plugin-design/src/__tests__/AZ2-no-handrolled-page-scaffold.test.ts`, `AI7-no-handrolled-page-header.test.ts`, and `AI7-no-undefined-font-heading.test.ts`.

---

Next: [Our components](./our-components.md) · [Rules](./rules.md)
