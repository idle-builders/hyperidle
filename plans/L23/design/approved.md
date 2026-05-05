# L23 — Approved design (Variant A)

The body of a Knowledge item renders as bare structured prose. No card. No second container. Heading hierarchy comes from a scoped CSS rule that consumes existing density tokens. Edit mode reuses the same renderer for the live preview.

## Surface tree

```
KnowledgeDetail (existing page)
├── alert banner (existing — factory amendable)
├── h1 page title + Edit button (existing)
├── metadata bar — Tag, StatusChip, confidence, origin, timestamp (existing)
├── grid-cols-[1fr_14rem]
│   ├── body column
│   │   ├── editing === false:
│   │   │   <KnowledgeBody body={savedContent} hostId={item.id}
│   │   │                  data-testid="knowledge-body" />
│   │   └── editing === true:
│   │       <div data-testid="knowledge-edit-panel">
│   │         ├── grid grid-cols-1 md:grid-cols-2 gap-2
│   │         │   ├── <textarea data-testid="knowledge-edit-textarea" /> (existing)
│   │         │   └── <KnowledgeBody body={draft} hostId={item.id}
│   │         │                      data-testid="knowledge-edit-preview" />
│   │         └── Save / Cancel buttons (existing)
│   ├── ObservationLog (existing)
│   └── RelatedSidebar (existing)
```

## `KnowledgeBody` — the new component

**Path.** `packages/web/src/pages/knowledge/KnowledgeBody.tsx`

**Props.**

```ts
interface KnowledgeBodyProps {
  body: string;                 // raw markdown, may be empty
  hostId: string;               // knowledge item id, passed to deriveBlocks
  testId?: string;              // optional override (default: data-knowledge-body)
}
```

**Behaviour.**

1. `useMemo(() => deriveBlocks(body, { kind: "knowledge_item", id: hostId }), [body, hostId])`.
2. If `blocks.length === 0`:
   - Render `<p class="text-[var(--text-lo)] text-sm m-0">(no content yet)</p>` inside the wrapper. No card, no border.
3. Otherwise:
   - Render `<div data-knowledge-body data-testid={testId ?? "knowledge-body"} class="flex flex-col">{blocks.map(b => <Block key={b.id} id={b.id} payload={b.payload} sanitizeHtml={sanitizeHtml} />)}</div>`.
4. `sanitizeHtml = (raw) => DOMPurify.sanitize(raw)` — passed to Block so `kind: "html"` blocks degrade through the L2 contract (HtmlPayload → UnknownPayload if stripped).

**No state. No effects. Pure render.**

## Heading hierarchy — scoped CSS

Colocated `KnowledgeBody.css` (or appended to `packages/web/src/index.css` under a `@layer components`):

```css
[data-knowledge-body] :is(h1) {
  font-size: var(--density-text-h1);
  font-weight: 600;
  margin-top: 4px;
}
[data-knowledge-body] :is(h2) {
  font-size: var(--density-text-h2);
  font-weight: 600;
  margin-top: 4px;
}
[data-knowledge-body] :is(h3) {
  font-size: var(--density-text);
  font-weight: 600;
  margin-top: 4px;
}
[data-knowledge-body] :is(h4, h5, h6) {
  font-size: var(--density-text);
  font-weight: 600;
  color: var(--text-mid);
  margin-top: 4px;
}
```

**No `line-height` declarations** — `HeadingPayload` ships `leading-[1.2]` as a Tailwind utility, and Tailwind utilities cascade after `@layer components` (verified at `packages/web/src/index.css:4-6`), so any scoped `line-height` here would silently lose. Uniform `1.2` line-height from L2 carries through. See `architecture.md` § R6 for rationale.

Why scoped on `[data-knowledge-body]`: the same CSS would also work for the future Bet pitch host (L16) under a different attribute. We do **not** put global heading styles in the body — that would leak into UI chrome.

Token consumption is closed: `--density-text-h1`, `--density-text-h2`, `--density-text` already exist in `tokens.css` (lines 254–311). No new tokens. No `text-[Npx]`. AQ-004 honoured.

**margin-top 4 px** on each heading is the only spacing nudge. It joins the heading visually to the section it introduces (rather than the section above) and stays on the 4 px grid (AQ-001).

## Inter-block rhythm

`<KnowledgeBody>` wrapper is `flex flex-col` with **no `gap-*`**. Each `Block` already supplies `py-[6px]` (6 px top + 6 px bottom = 12 px between adjacent block centres). That is the entire vertical rhythm.

## Empty state

```
(no content yet)
```

- Selector: `[data-testid="knowledge-body"] > p`
- Class: `text-[var(--text-lo)] text-sm m-0`
- No card, no border, no padding, no italic. A single muted line.
- Same string as today's placeholder so existing tests that grep `(no content yet)` keep working.

**Deliberate departure from `EmptyState` design-system primitive.** The standard pattern for "no data here" is the `EmptyState` card. We inline a muted `<p>` instead because the AC forbids chrome around a 3-sentence body; the same forbids chrome around a zero-sentence body. Wrapping the empty case in an `EmptyState` card would re-introduce the very container (border, padding, centred icon slot) that L23 is removing. One line of muted text is the consistent expression of "no body" that matches the chrome-free expression of "some body".

## Edit mode preview

The right pane in edit mode is `<KnowledgeBody body={draft} hostId={item.id} testId="knowledge-edit-preview" />`. Identical render path; only the source body and the `data-testid` differ. This means:

- The user sees what Save will render — heading sizes, list bullets, bold marks, the lot.
- We delete the `sanitize(draft)` `<pre>` branch wholesale.
- `DOMPurify` import remains — it is now passed to `Block` as `sanitizeHtml`, no longer used to wrap a `<pre>`.

The textarea side keeps its `font-mono` 14 px monospace as today; the sanitizer + `<pre>` shell is removed there too (it never wrapped the textarea, only the preview).

## What does NOT change

- Page header `<h1 class="text-sm font-semibold">{title}</h1>` — that is page chrome, not body. Unchanged.
- Metadata bar — Tag, StatusChip, confidence, origin, timestamp — unchanged.
- ObservationLog — unchanged in this story (L26 will replace it with a thread).
- RelatedSidebar — unchanged.
- Edit/Save/Cancel buttons + their state — unchanged in this story (L25 will rework Save).
- Banners (factory amendable) — unchanged.
- Route shape — unchanged.

## Dependency surface (design-side only)

- `@hyperidle/shared` → `deriveBlocks`, `BlockId` type. Already a workspace dep of `packages/web`.
- `@hyperidle/design-system` → `Block`. Already a workspace dep.
- `dompurify` → already a `packages/web` dep.

No new packages. No new tokens. No new components beyond `KnowledgeBody` (and `KnowledgeBody` is **not** a custom component for the 19-component budget — it is a page-local composition, lives under `pages/`, not `design-system/src/`).

## Hardcoded data deletion

`packages/web/src/pages/KnowledgeDetail.tsx` currently carries:

- `LEGACY_DETAILS` constant (lines 64–112) — pinned k1/k2 pre-J7 fixture data with hardcoded `content` strings.
- `LEGACY_SOURCES` constant (lines 118–121) — hardcoded source attributions.
- `MOCK_KNOWLEDGE_ITEMS` (imported via `fromFixture`) — fixture data.

Spec § L23 hard rule: "Hardcoded legacy detail text is removed; bodies come from the data layer; matching inventory rows from L6 are closed."

The plan deletes `LEGACY_DETAILS`, `LEGACY_SOURCES`, the `LEGACY_*` paths in `findDetail`, and switches `findDetail` to a real fetch via `GET /api/knowledge/:layer/:id` (the route already exists — see `packages/server/src/routes/knowledge.ts:203`). The `MOCK_KNOWLEDGE_ITEMS` import path remains as a fallback for unknown ids only if the existing test contract requires it; the **architect** confirms whether the hardcoded fixture has to stay for the protected k1/k2 tests, and if so the path becomes a deferred row in `plans/L23/follow-ups.md` rather than a live legacy carve-out. (See architecture.md § Risks for the call.)

## Validation walkthrough

**Scenario 1 — three-sentence belief.**

Input body:
```
JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes.

Refresh tokens last 7 days; rotation is automatic.

All tokens are stored in httpOnly cookies, never localStorage.
```

Expected DOM:
```
<div data-knowledge-body data-testid="knowledge-body" class="flex flex-col">
  <article data-ds-component="block" data-ds-kind="paragraph" ...>
    <p>JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes.</p>
  </article>
  <article data-ds-component="block" data-ds-kind="paragraph" ...>
    <p>Refresh tokens last 7 days; rotation is automatic.</p>
  </article>
  <article data-ds-component="block" data-ds-kind="paragraph" ...>
    <p>All tokens are stored in httpOnly cookies, never localStorage.</p>
  </article>
</div>
```

Three paragraph Blocks. No card, no border, no `<pre>`. AC met.

**Scenario 2 — five-section playbook.**

Input body (heading levels mixed):
```
# Onboarding playbook

Quick reference for new agent provisioning.

## Provisioning

Follow the runbook in /docs/runbooks/agent-provision.md.

## Permissions

Grant via the role-template, never ad hoc.

### Edge cases

Read-only routines need only `routines:run`.

## Verification

Confirm with `bun run check` and the smoke test.

## Rollback

`git revert` then re-run provisioning.
```

Expected DOM (heading hierarchy):
- `<h1>Onboarding playbook</h1>` at `--density-text-h1` (~26 px in default density).
- four `<h2>` and one `<h3>` at `--density-text-h2` and body-bold respectively.
- Hierarchy is visually distinct at default density.

**Scenario 3 — edit one section, other ids unchanged.**

The Vitest unit (architecture.md § Tests) builds two bodies that differ only in one paragraph and asserts every other block id is byte-identical. Pure L2 contract; we are confirming we feed `deriveBlocks` correctly and use `block.id` as the React key.

## Out of scope (filed)

- Per-block actions (copy permalink, open thread) — L26.
- Save-actually-persists, optimistic locking, manage verbs — L25.
- `[[id]]` chips, hover preview, backlinks panel — L24 (parked).
- Server-side block cache (`block_cache` table or in-memory) — `where-derivation-attaches-in-the-pipeline.md` says optional optimisation; L23 ships without it.
- Mobile-sheet adaptation of `BlockActionsPopover` (L2 follow-up FU-2) — not invoked by L23 since the popover isn't wired.
- Floating-ui positioning of `BlockActionsPopover` (L2 follow-up FU-1) — same reason.
