# Page Anatomy

Every primary page shares the same scaffold: a pinned header strip, a scrolling body, and a single `<h1>`. **PageHeader** and **SectionLabel** encode that standard.

Source: `framework/design-system/src/PageHeader.tsx`, `framework/design-system/src/SectionLabel.tsx` (AI7).

---

## Scaffold

```tsx
// Every primary page root
<div className="flex flex-col h-full">
  <PageHeader title="Page Name" />          {/* shrink-0 — pinned */}
  <div className="flex-1 overflow-y-auto">  {/* scrolling body */}
    {/* page content */}
  </div>
</div>
```

The AppShell page-host is `overflow-hidden` (`AppShell.tsx`). Window-level scroll is impossible — every page that needs any scroll must own an internal `overflow-y-auto` region. Applies to **every return branch** (loading, error, not-found, populated), not just the happy path.

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

Two `eslint-plugin-design` rules live in `tools/eslint-plugin-design/src/rules/`.

**`no-handrolled-page-header`** — Error on `layers/core-ui/src/pages/**`. Flags the inline literal combination `text-[20px]` + `font-[600]` + `tracking-[-0.01em]` on any element that is not `PageHeader`. Composing `pageTitleClassName` as an identifier expression is always compliant. SettingsPage.tsx and SetupFlow.tsx are exempt via `eslint.config.ts:184-185` pending their migration.

**`no-undefined-font-heading`** — Error on `pages/**`, warn on the rest of `layers/core-ui/src/**`. Flags `font-heading` everywhere (undefined Tailwind utility — silent CSS no-op). Flags `tracking-wider` only on heading elements (h1–h6) inside `pages/**` (`inPages && isHeading`, `no-undefined-font-heading.ts:105`).

Run `npm run lint:eslint` to check both. RuleTester unit tests: `tools/eslint-plugin-design/src/__tests__/AI7-no-handrolled-page-header.test.ts` and `AI7-no-undefined-font-heading.test.ts`.

---

Next: [Our components](./our-components.md) · [Rules](./rules.md)
