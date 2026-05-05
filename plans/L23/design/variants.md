# L23 — Design exploration

## Routine vs novel

**Classification: routine.** The rendering language (the 10 Block payload components) is fixed by L2. There is no new component shape, no new interaction grammar, no new color or motion need. The only design surface is the **container** — how a sequence of `<Block />` elements sits inside the existing `KnowledgeDetail` page chrome, what overrides the body needs (heading hierarchy, prose density), and how the rendered view relates to the edit textarea.

Per the routine path: one primary variant + a "did we consider X / Y / Z" check. Two thin alternates considered, one promoted to a second variant for explicit comparison.

## The decisions in scope

1. **Heading hierarchy.** L2's `HeadingPayload` applies the same class for every level (`h1..h6`) — semantic only, no visual size differentiation. AC § L23 says "5-section playbook with proper heading hierarchy". The hierarchy must come from somewhere. Visual-parity rule forbids editing `HeadingPayload`. So the styling lives in the **container** as a scoped descendant rule using existing density tokens (`--density-text-h1` = `1.625rem`, `--density-text-h2` = `1.25rem`).
2. **Inter-block spacing.** `Block.tsx` itself owns `py-[6px]` — vertical rhythm comes from the Block shell. The container provides only the column.
3. **Empty body.** Spec says "(no content yet)" today is the placeholder. We need a no-chrome empty state — a single `--text-lo` line, no card, no border.
4. **Edit-mode relationship.** Today the rendered view becomes a side-by-side textarea + sanitised-`<pre>` preview when the user clicks Edit. L23 must keep edit flow working but the **preview** column should also render as Blocks (otherwise "edit and see what it'll look like" lies). Save behaviour is L25's problem — we do not touch it.
5. **Body width.** Today's grid is `grid-cols-[1fr_14rem]` (body + 14rem related sidebar). Body column inherits the rest. No change.
6. **Headings outside narrative prose.** Knowledge titles already render as `<h1 class="text-sm font-semibold">` for the page header. The body's first heading might be `# Title` — duplicating the page title. This is an authoring concern, not a renderer concern. We render whatever the body contains. Document the convention in commits, not in code.

## Variant A — primary: scoped prose container, no chrome

**Shape.**

```
KnowledgeDetail body column
├── (existing) page header h1 + meta bar
├── <KnowledgeBody body={savedContent} hostId={item.id} />
│       └── <div data-knowledge-body class="flex flex-col">
│            └── <Block /> × N    (one per derived block)
└── (existing) ObservationLog
```

`KnowledgeBody` is a new component in `packages/web/src/pages/knowledge/`. It:

- Calls `deriveBlocks(body, { kind: "knowledge_item", id: hostId })` once via `useMemo` keyed on `body`.
- Renders empty body as a single `<p class="text-[var(--text-lo)] text-sm m-0">(no content yet)</p>` — no border, no card, no padding box. Pure prose absence.
- Renders the block array as `<Block id={b.id} payload={b.payload} key={b.id} />`. Nothing else. No wrapping card. No outer border.
- Wraps the block list in a `<div data-knowledge-body>` whose CSS scope applies heading-size differentiation **without modifying L2**. The scope is the only new CSS in this story.

**Container CSS (scoped, token-only).**

```css
[data-knowledge-body] :is(h1) {
  font-size: var(--density-text-h1);
  line-height: 1.2;
  font-weight: 600;
}
[data-knowledge-body] :is(h2) {
  font-size: var(--density-text-h2);
  line-height: 1.3;
  font-weight: 600;
}
[data-knowledge-body] :is(h3) {
  font-size: var(--density-text); /* body-size, but bold */
  line-height: 1.4;
  font-weight: 600;
}
[data-knowledge-body] :is(h4, h5, h6) {
  font-size: var(--density-text);
  line-height: 1.4;
  font-weight: 600;
  color: var(--text-mid);
}
```

(Implemented as a single `<style>` block colocated with `KnowledgeBody.tsx`, or via a Tailwind layer in `index.css` — architect picks; both honour AQ-004 by sourcing only existing tokens. No `text-[Npx]`. No new tokens.)

**Inter-block rhythm.** Block ships its own `py-[6px]`. We add no extra `gap` — `flex flex-col` with no `gap-*` class. Between adjacent blocks the rhythm is two `py-[6px]` stacked = 12 px. That matches the 4 px grid (AQ-001) and reads as one paragraph break.

**Edit mode.** When `editing === true`:

- Left pane: existing `<textarea data-testid="knowledge-edit-textarea">` (keep verbatim — L25 will rework save).
- Right pane: replace the `<pre data-testid="knowledge-edit-preview">{sanitize(draft)}</pre>` with a second `<KnowledgeBody body={draft} hostId={item.id} />` instance. Same rendering path as the saved view; shows what Save will render. The `data-testid` stays on the wrapper for test continuity.

**Validation against AC.**

| AC | How A satisfies |
|---|---|
| 3-sentence belief → 3 paragraphs, no chrome | `deriveBlocks` produces three `paragraph` payloads; `Block.tsx` renders three `<p>` with body type, one after another inside `flex flex-col`. No card, no bg, no border around the list. |
| 5-section playbook → proper heading hierarchy | Container's scoped CSS applies `h1` = `--density-text-h1`, `h2` = `--density-text-h2`, `h3` = body+bold, `h4..h6` = body+bold+`text-mid`. Levels are visually distinct. |
| Edit one section → other section block ids unchanged | Pure L2 contract. We prove it with a Vitest unit (see architecture.md § Tests). Renderer keys on `block.id`, so React reconciles minimally. |
| `<pre>` at `KnowledgeDetail.tsx:301-307` is gone | The whole branch is replaced by `<KnowledgeBody />`. Test asserts `queryByTestId("knowledge-body")` resolves to a `[data-knowledge-body]` div, not a `<pre>`. |
| Empty body | "(no content yet)" line, no chrome. |

## Variant B — alternate: card-wrapped body

Same as A but the body sits inside a `<section class="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--r2)] p-[12px]">…</section>` shell. This is the "playbook in a card" instinct.

**Why considered.** Today's `<pre>` has `bg-base-200 rounded p-3` chrome. Removing it might feel like the page lost structure.

**Why rejected.**

- AC § L23 explicitly: "3-sentence belief renders 3 paragraphs with no chrome." A card is chrome.
- A card around the body forces a second visual container inside the existing page chrome (h1 + meta-bar already separate the body from page surrounds). Two nested containers is over-engineered.
- Linear, Notion, GitHub all render Knowledge-equivalent bodies as bare prose under a metadata bar. Card-wrapping the body is a precision-instrument anti-pattern (AESTHETICS.md § AI-Aesthetic — "stock card grids" is the family).

## Variant C — discarded: server-side derivation with rendered HTML in API

The render-time call to `deriveBlocks` runs client-side. Variant C would have the server pre-derive blocks and ship a JSON `Block[]` alongside the body in `GET /api/knowledge/:layer/:id`.

**Why considered.** Reduces client work; matches "derived during ingestion" phrasing in `where-derivation-attaches-in-the-pipeline.md`.

**Why rejected.**

- That doc explicitly says **two-process derivation is the architecture**: both client and server derive from the same `deriveBlocks` in `@hyperidle/shared`. The cache is an optimisation, not a placement decision.
- L23's body sizes are tiny (knowledge entries are paragraphs to playbooks; ≤ 256 KB hard cap from L2). Client derivation cost is sub-millisecond.
- Adding a server endpoint or response shape is scope creep. Spec says "no per-knowledge customization" and "matching inventory rows from L6 are closed" — pointing at deletion, not addition.
- A JSON Block envelope on the API would tempt callers to bypass `deriveBlocks` and treat the wire shape as canonical, breaking L2's purity.

## Did-we-consider checklist

- [x] **Code-block highlighting.** Out of scope. `CodePayload` already renders mono with optional language tag; syntax colours are a future story.
- [x] **Markdown frontmatter.** `deriveBlocks` ignores nothing; if a body starts with `---\n…\n---`, the parser treats it as content. Knowledge bodies have no frontmatter convention; if one ever shows up, it renders as a thematic-break + paragraph + thematic-break, which is acceptable.
- [x] **Image sizing.** `ImagePayload` renders `max-w-full h-auto`. Acceptable until a designer-call comes for max-height.
- [x] **TOC sidebar.** Considered: an outline of headings in the right rail. Rejected — the right rail is already occupied by `RelatedSidebar` and a TOC is a Notion idiom that hides density. Skim-by-scroll on a 14px body is fast.
- [x] **Hover-anchor affordance.** L2's `BlockHandle` exists but L23 does not wire it. L26 will. No regression: `Block.tsx` already exposes `slots.gutterLeading` so wiring later is a one-line addition.
- [x] **Sanitiser for raw HTML payload.** `Block` requires a `sanitizeHtml` callback for `kind: "html"` to render — otherwise it falls through to UnknownPayload. Knowledge bodies are markdown; raw `<html>` blocks are rare. We pass `DOMPurify.sanitize` (already a dep — used by today's `sanitize()` in `KnowledgeDetail.tsx`).

## Self pre-score (9-dimension rubric)

(Score 0–10. The reviewer's `/design-critique` will rescore in Phase 2.)

| Dimension | A | B | Notes |
|---|---|---|---|
| Hierarchy | 8 | 6 | A: heading scale + body type carry the structure with no extra chrome. B: card around body adds a second, redundant container layer. |
| Spacing | 8 | 7 | Both consume the 4 px grid; B adds a `p-[12px]` shell that competes with the existing page padding. |
| Typography | 8 | 8 | Both use the same `--density-text-h*` scope. Even tie. |
| Color | 9 | 7 | A: zero new colors. B: introduces a `--surface-1` band that splits the page visually. |
| Coherence (with L2 + KnowledgeDetail) | 9 | 6 | A composes Block as-is. B forces Block to live inside a card it wasn't designed for. |
| States (empty/edit/long-body) | 8 | 7 | Empty state in A is a single muted line; in B is a card with a single line in it. Awkward. |
| Accessibility | 8 | 8 | Heading levels are semantic in both. Even tie. |
| Anti-slop (AI-aesthetic) | 9 | 5 | B trips AQ-103 (oversized padding instinct) and edges toward the "card grid" smell. |
| Premium polish | 8 | 7 | A reads as Linear/Notion. B reads as a generic admin panel. |
| **Total / 90** | **75** | **61** | |

**Winner: Variant A.** Locked in `approved.md`.
