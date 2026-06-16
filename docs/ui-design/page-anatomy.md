# Page Anatomy

Every primary page in HyperIdle shares the same skeleton: a pinned header strip, a scrolling body, and a single `<h1>`. This page documents the two Tier-1 primitives that encode that standard — **PageHeader** and **SectionLabel** — and the scroll rule they depend on.

Source: `packages/design-system/src/PageHeader.tsx`, `packages/design-system/src/SectionLabel.tsx` (AI7).

---

## The scaffold

```tsx
// Every primary page root
<div className="flex flex-col h-full">
  <PageHeader title="Page Name" />          {/* shrink-0 — pinned */}
  <div className="flex-1 overflow-y-auto">  {/* scrolling body */}
    {/* page content */}
  </div>
</div>
```

The AppShell page-host is `overflow-hidden`. Window-level scroll is impossible. Every page that needs any scroll must own an internal `overflow-y-auto` region. The pinned `PageHeader` is the only pattern consistent with the host.

This scaffold applies to **every return branch** of a page component — loading, error, not-found, and populated — not just the happy path.

---

## PageHeader

**Tier 1 primitive.** The pinned top strip of a primary page.

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

// Editable title (KnowledgeCreate pattern)
<PageHeader
  title={
    <input
      className={`${pageTitleClassName} bg-transparent border-none outline-none flex-1 p-0`}
      aria-label="Document title"
      data-testid="knowledge-create-title"
    />
  }
/>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | `ReactNode` | required | Page title. Rendered with the canonical treatment; truncates on overflow. |
| `level` | `1 \| 2` | `1` | Heading tag for the title: `<h1>` or `<h2>`. Default 1 — every primary page's title is its single `<h1>`. Pass `level={2}` only for a sub-page whose title is not the document's top heading (none of the current 10 pages need this). |
| `leading` | `ReactNode` | — | Orientation row above the title (Breadcrumb + NavHistoryCluster). |
| `subtitle` | `ReactNode` | — | Meta line below the title row. |
| `actions` | `ReactNode` | — | Trailing cluster on the title row (StatusChip, Buttons). |
| `data-testid` | `string` | — | Passthrough to the `<header>` element. |

### Rendered structure

```
<header shrink-0 px-[24px] py-[18px] border-b border-[--border-subtle]>
  [leading row if present]
  <div flex items-center justify-between gap-[12px]>
    <h1 | h2   pageTitleClassName>  ← level prop
    [actions if present]
  </div>
  [subtitle if present]
</header>
```

### `pageTitleClassName`

Exported const: `"text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate"`.

The primitive's own title element uses this. Export exists so pages with an editable `<input>` title can import and compose the same string (identifier expression, not a repeated literal). The `no-handrolled-page-header` lint rule flags string literals — a `className` referencing `pageTitleClassName` is always compliant.

---

## SectionLabel

**Tier 1 primitive.** The uppercase opener of a content section in a page body.

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

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `ReactNode` | required | Uppercase label text. |
| `as` | `"h2" \| "h3" \| "h4"` | `"h3"` | Heading element for the document outline. Default h3 — one level below the `<h1>` PageHeader title. Pass `"h2"` where SectionLabel is the page's top body heading. |
| `trailing` | `ReactNode` | — | Same-row trailing slot (count, "New"/"Create" button). |
| `divider` | `boolean` | `false` | Adds a `border-b border-[--border-subtle]` rule below the label. |
| `data-testid` | `string` | — | Passthrough to the root heading element. |

### Rendered structure

```
<h3 | h2 | h4
  flex items-center justify-between gap-[12px]
  text-[13px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[--text-tertiary]
  mb-[9px]
  [pb-[6px] border-b border-[--border-subtle]  ← when divider=true]
>
  <span>{label}</span>
  [trailing if present]
</h3>
```

---

## Heading-level contract

| Element | Tag | Notes |
|---|---|---|
| Page title | `<h1>` | PageHeader, `level` defaults to 1. One per page. |
| Section opener | `<h3>` | SectionLabel, `as` defaults to "h3". Pass `as="h2"` when the section label is the page's top body heading. |

Every primary page has exactly one `<h1>` (the PageHeader title). No other element on the page may be `<h1>`.

---

## Enforcement

Two `eslint-plugin-design` rules enforce this standard. Both live in `packages/eslint-plugin-design/src/rules/`.

**`no-handrolled-page-header`** — Error on `packages/web/src/pages/**` (SettingsPage.tsx and SetupFlow.tsx are exempt pending their own migration). Flags the inline combination `text-[20px]` + `font-[600]` + `tracking-[-0.01em]` as string literals on any element whose name is not `PageHeader`. Composing `pageTitleClassName` as an identifier expression is always compliant.

**`no-undefined-font-heading`** — Error on `pages/**`, warn on the rest of `packages/web/src/**`. Flags `font-heading` (undefined Tailwind utility — a silent CSS no-op anywhere) and `tracking-wider` inside `pages/**` (0.05em, off the Hearth caps scale).

Run `npm run lint:eslint` to check both. A RuleTester unit test in `packages/eslint-plugin-design/src/__tests__/` exercises every arm of each rule.

---

## User-facing impact

AI7 is internal consistency work — it standardizes the page chrome that already existed but was expressed differently on each page. No page content, navigation, or behavior changed. Users see uniform page headers and section labels; no workflow or UI surface changed.

---

Next: [Our components](./our-components.md) · [Rules](./rules.md)
