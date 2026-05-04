# L23 — Architecture plan

Implementation plan for the Knowledge body renderer. Designer artefacts:
`plans/L23/concept.md`, `plans/L23/design/approved.md` (Variant A).

## 1. Surface area & files

### Added

| Path | Purpose |
|---|---|
| `packages/web/src/pages/knowledge/KnowledgeBody.tsx` | Page-local component. Calls `deriveBlocks` and maps to `<Block />`. ~40 LOC. |
| `packages/web/src/pages/knowledge/KnowledgeBody.css` (or one block in `packages/web/src/index.css`) | Scoped heading-hierarchy CSS for `[data-knowledge-body]`. ~25 lines. |
| `packages/web/src/pages/knowledge/__tests__/KnowledgeBody.test.tsx` | Vitest. Empty body, multi-block body, host-id pass-through, sanitiser pass-through. |
| `packages/web/src/pages/knowledge/__tests__/KnowledgeBody.id-stability.test.ts` | Vitest. Edit one section → other ids unchanged (pure `deriveBlocks` exercise wrapped in a regression test colocated with the renderer). |
| `packages/web/e2e/l23-knowledge-body.spec.ts` | Playwright. Open Knowledge entry with multi-section body, see styled rendering. |

### Changed

| Path | Change |
|---|---|
| `packages/web/src/pages/KnowledgeDetail.tsx` | Replace `<pre>` at lines 301–307 with `<KnowledgeBody body={savedContent} hostId={item.id} />`. Replace edit-mode `<pre>` preview at lines 284–289 with `<KnowledgeBody body={draft} hostId={item.id} testId="knowledge-edit-preview" />`. Delete `sanitize()` helper (lines 138–144) — no longer used. Delete `LEGACY_DETAILS`, `LEGACY_SOURCES`, and the `LEGACY_*` branches of `findDetail` **iff** the existing protected k1/k2 tests still pass against the live `MOCK_KNOWLEDGE_ITEMS` fixture; otherwise keep `LEGACY_DETAILS` content body strings only and delete the surrounding `<pre>` rendering — see § 8 Risk R1. |
| `packages/web/src/pages/KnowledgeDetail.tsx` (existing test) | The protected `KnowledgeDetail.test.tsx` referenced in the file's `@lore` comment must continue to pass. We update the **rendered-output** assertions in that test to look for paragraph blocks rather than `<pre>` text, but never change what content the test expects (the strings "company", "belief", the body sentences are still the assertions). |

### Not touched

- `packages/shared/src/blocks/**` — L2 deliverables. No change.
- `packages/design-system/src/Block.tsx`, `BlockHandle.tsx`, `BlockActionsPopover.tsx`, `block/*.tsx` — L2 deliverables. No change. Visual-parity rule.
- `packages/server/src/routes/knowledge.ts` — no API change.
- `packages/db/src/schema/**` — no schema change. `knowledge_items.body` stays `TEXT`.
- `packages/fabric/**` — no writeback change. The watcher already treats bodies as opaque markdown (`docs/blocks/where-derivation-attaches-in-the-pipeline.md`).

## 2. Types, schemas, API

**No new types.** `KnowledgeBodyProps` is a 3-field local interface. All Block types come from `@hyperidle/shared`.

**No new endpoints.** Knowledge bodies are already returned by `GET /api/knowledge/:layer/:id` (`packages/server/src/routes/knowledge.ts:203-222`) as plain text in the `body` column of the response.

**No DB columns.** No `body_sha`, no `parser_version` cache column, no `block_cache` table. `where-derivation-attaches-in-the-pipeline.md` says the cache is an optional optimisation. We ship without it. Re-derivation cost on a 256 KB cap body is sub-millisecond on commodity hardware. Adding caching is a follow-up if a profiler ever flags it.

**Existing API contract unchanged.**

```
GET /api/knowledge/:layer/:id → KnowledgeItem {
  id: string,
  layer: KnowledgeLayer,
  ...
  body: string,               // markdown text — what L23 renders
  format: string,             // "markdown" today; unchanged
  version: number,
  ...
}
```

## 3. Where the deriver runs

**Client-side, render-time.** Single `useMemo(() => deriveBlocks(body, host), [body, host.id])` inside `KnowledgeBody`. Same code path on both saved view and edit-mode preview.

**Why not server-side.**

- `where-derivation-attaches-in-the-pipeline.md` § "two-process derivation" makes both client and server first-class derivers. The architecture invariant is *correctness via shared `deriveBlocks`*, not *single-place execution*.
- The function is pure, has no I/O, no clock, no DB, costs <1 ms on bodies inside the 256 KB cap. There is no measurable benefit to pre-deriving.
- A pre-derived JSON envelope on the API would tempt callers to bypass `deriveBlocks` and treat the wire shape as canonical, breaking L2's "GFM only on disk" hard rule (8.5#1) by stealth.
- L25 will introduce optimistic-locking and persistent Save. Those are server-side concerns. L23 keeps server purely as a body store.

**Why not the file watcher / writeback.** Per `where-derivation-attaches-in-the-pipeline.md`: "the watcher does not need to derive on write. Derivation runs when a UI surface (or its API) asks for the body." The watcher's job is body persistence, not block emission.

## 4. Block-id stability proof

**The contract.** L2 § 8.4 says: "Editing block X does not change the id of block Y when Y's normalised content and outline position are unchanged."

**The proof in this story.** We do **not** re-prove the L2 contract; that is `packages/shared/src/blocks/__tests__/golden-ids.test.ts`'s job. We prove that **L23's renderer feeds `deriveBlocks` correctly and uses `block.id` as the React key** so the contract is honoured at the DOM.

Two tests:

1. **`KnowledgeBody.id-stability.test.ts` (Vitest unit).** Construct two bodies that differ in one section's body content only. Call `deriveBlocks` twice. Assert that for every block whose `outlinePath` and normalised content are unchanged, the `id` is byte-identical. This is a regression test that catches a future change to `KnowledgeBody` that accidentally rewraps the body or shifts ids.
2. **`KnowledgeBody.test.tsx` (RTL).** Render `<KnowledgeBody>` with body A, capture `data-block-id` attributes off the rendered `<article>` shells. Re-render with body B (one section edited). Assert the unaffected blocks' `data-block-id`s are unchanged.

The `data-block-id` attribute is already emitted by `Block.tsx:108`.

## 5. Tests (red phase)

The TDD agent (`/write-tests`) writes these before any implementation lands.

### Vitest

| Test ID | File | What it asserts | AC mapped |
|---|---|---|---|
| T1 | `KnowledgeBody.test.tsx` | Empty body renders `<p>(no content yet)</p>` with `text-[var(--text-lo)]` and **no** `<pre>`, **no** `<article data-ds-component="block">` shells. | spec § "(no content yet)" + AC#1 |
| T2 | `KnowledgeBody.test.tsx` | A 3-paragraph body renders 3 `<article data-ds-component="block" data-ds-kind="paragraph">` with no enclosing card/border/`<pre>`. | AC#1 + validation scenario 1 (three-sentence belief) |
| T3 | `KnowledgeBody.test.tsx` | A body with `# A`, `## B`, `### C`, `paragraph` produces 4 blocks with `data-ds-kind` heading×3 + paragraph×1. The `<h1>`, `<h2>`, `<h3>` semantics are present. | validation scenario 2 (heading hierarchy) |
| T4 | `KnowledgeBody.test.tsx` | `<KnowledgeBody>` passes `sanitizeHtml = DOMPurify.sanitize` to each Block — verified by rendering a `kind: "html"` body and asserting the `<div>` payload renders the sanitised HTML, not the UnknownPayload fallback. | round-trip lossless on supported kinds |
| T5 | `KnowledgeBody.test.tsx` | When `body` and `hostId` change, `deriveBlocks` is re-invoked (memo-keyed). Use a spied `deriveBlocks` via vi.mock or just compare rendered DOM across re-renders. | (regression guard) |
| T6 | `KnowledgeBody.id-stability.test.ts` | Edit one section's body content; the OTHER sections' block ids are byte-identical. (Snapshot of unchanged-block ids.) | AC#2 + validation scenario 3 |
| T7 | `KnowledgeBody.id-stability.test.ts` | Round-trip: feed `body` → `deriveBlocks` → confirm the `block.kind` set covers the supported kinds in a fixture body (heading, paragraph, list, quote, code, table, divider, image, html). | AC#4 (round-trip lossless) |
| T8 | `KnowledgeDetail.test.tsx` (update existing) | `data-testid="knowledge-body"` resolves to a `<div data-knowledge-body>`, NOT a `<pre>`. Existing legacy-text assertions (k1 source string, "company"/"belief" tags) still pass. | AC#1 (`<pre>` is gone), regression for protected legacy assertions |
| T9 | `KnowledgeDetail.test.tsx` (update existing) | Edit-mode preview pane is a `<KnowledgeBody>` instance with `data-testid="knowledge-edit-preview"` — not a `<pre>`. | edit-flow continuity |
| T10 | `KnowledgeDetail.test.tsx` (update existing) | `LEGACY_DETAILS` and `LEGACY_SOURCES` constants are gone (grep test or import-graph assertion). Note: gated on R1 — see § 8. | spec hardcoded-data deletion clause |

### Playwright

| Test ID | File | Scenario | AC mapped |
|---|---|---|---|
| E1 | `l23-knowledge-body.spec.ts` | Navigate to a Knowledge entry whose body is a 5-section markdown playbook. Assert a `<h1>` with `font-size` >= `--density-text-h2` (computed style), at least four `<h2>` children inside `[data-knowledge-body]`, and no `<pre>` inside `[data-testid="knowledge-body"]`. | spec § AC ("Playwright e2e: open a Knowledge entry with a multi-section body → see styled rendering") |
| E2 | `l23-knowledge-body.spec.ts` | Navigate to k1 (3-sentence belief). Assert exactly 3 `[data-ds-component="block"][data-ds-kind="paragraph"]` rendered with no enclosing card / border / shadow / `--surface-1` background on the body container. | validation scenario 1 (no chrome) |
| E3 | `l23-knowledge-body.spec.ts` | Click Edit, type into the textarea, observe the right-pane preview re-renders as Blocks (not `<pre>`), with `data-testid="knowledge-edit-preview"`. | edit-mode preview reuse |

### Verify gate

```
bun run verify
```

Must be green at the end of every task in § 6.

## 6. Ordered task list

Each task is ≤ 30 minutes for an LLM agent and verifiable.

1. **T-RED-1.** Write T1, T2, T3 in `KnowledgeBody.test.tsx`. Run `bun run test` — confirm three failures (file does not exist yet).
2. **T-RED-2.** Write T4, T5 in `KnowledgeBody.test.tsx`. Confirm five failures.
3. **T-RED-3.** Write T6, T7 in `KnowledgeBody.id-stability.test.ts`. Confirm seven failures.
4. **T-RED-4.** Update `KnowledgeDetail.test.tsx` for T8, T9, T10 (gate T10 on the R1 decision in § 8). Confirm three additional failures.
5. **T-RED-5.** Write E1, E2, E3 in `l23-knowledge-body.spec.ts`. `bun run e2e` — confirm three failures.
6. **T-GREEN-1.** Create `KnowledgeBody.tsx`. Implement empty-body branch. Implement deriveBlocks call. Render `<Block />` array with `block.id` as React key + sanitiser pass-through. Stop. Run `bun run test` — T1–T7 should pass.
7. **T-GREEN-2.** Create `KnowledgeBody.css` (or append to `packages/web/src/index.css` under `@layer components`). Add the four `[data-knowledge-body]` heading rules from `approved.md`. Run `bun run test` — no behaviour change in unit tests, but heading hierarchy now visually correct.
8. **T-GREEN-3.** In `KnowledgeDetail.tsx`: replace the `<pre data-testid="knowledge-body">` (lines 301–307) with `<KnowledgeBody body={savedContent} hostId={item.id} />`. Replace `<pre data-testid="knowledge-edit-preview">` (lines 284–289) with `<KnowledgeBody body={draft} hostId={item.id} testId="knowledge-edit-preview" />`. Delete `sanitize()` helper. Run `bun run test` — T8, T9 should pass.
9. **T-GREEN-4.** Decision-gate on R1 — if the protected k1/k2 tests can pass against the existing `MOCK_KNOWLEDGE_ITEMS` fixture or against a server fetch, delete `LEGACY_DETAILS`, `LEGACY_SOURCES`, and the `LEGACY_*` branches in `findDetail`. Otherwise keep the constants but only their `content` field is consumed (LEGACY_DETAILS rows already contain markdown — they render through Blocks unchanged). Either way, T10 should reach a determinate state. Run `bun run test`.
10. **T-GREEN-5.** Run the Playwright suite — `bun run e2e`. E1, E2, E3 should pass.
11. **T-VERIFY.** Run `bun run verify` (the orchestrated check + lint + test). Zero failures. Zero new lint warnings. **Visual proof step:** capture a screenshot of `/knowledge/k1` and `/knowledge/<multi-section-playbook-id>` per CLAUDE.md § "Proof & Definition of Done". Attach to the PR description.
12. **T-LORE.** Replace the obsolete `@lore J7 markdown:` comment in `KnowledgeDetail.tsx` (lines 13–15) with a new lore note pointing at `KnowledgeBody.tsx` + L23 plan. Replace `@lore J7 edit mode:` (lines 17–19) only if R1's decision changed the edit flow; otherwise leave it.
13. **T-COMMIT.** Conventional commit, one logical change. `feat(L23): render Knowledge body as Blocks (closes <pre> at KnowledgeDetail.tsx:301-307)`.
14. **T-PUSH.** `git push` to feature branch. Pipeline opens the draft PR.

## 7. L6 inventory rows

L6 (`hardcoded-data-inventory.md`) **does not yet exist** in `plans/reviews/`. The spec sentence "matching inventory rows from L6 are closed" must therefore be honoured *forwards* — when L6 lands, it should not need to file new rows for the Knowledge body. Concretely:

- `LEGACY_DETAILS` (lines 64–112 of `KnowledgeDetail.tsx`) — deleted in T-GREEN-4 (or carved down to data-only if R1 forces it).
- `LEGACY_SOURCES` (lines 118–121) — same treatment.
- The `<pre>` rendering — deleted in T-GREEN-3.

When L6 ships and walks the codebase, the Knowledge body rows are pre-closed. We add a follow-up file `plans/L23/follow-ups.md` only if R1 forces a partial deletion.

## 8. Risks & open questions

### R1 — Protected legacy k1/k2 test contract

The `@lore` comment on `KnowledgeDetail.tsx:6-12` says: "legacy k1/k2 entries keep their pre-J7 free-form `layer`/`kind` values (the protected `KnowledgeDetail` tests depend on 'company' and 'belief' string labels) while everything else is sourced from `fixtures/knowledge-data.ts`." The protected test asserts those exact strings appear in the rendered output for `k1` and `k2`.

If the strings come from `MOCK_KNOWLEDGE_ITEMS` (or a server fetch) **and** the layer/kind are preserved there, deletion is safe. If they live only inside `LEGACY_DETAILS`, deletion breaks the protected test.

**Mitigation.** T-GREEN-4 reads the protected test to determine the call. Worst case: keep `LEGACY_DETAILS` (data only — the constants stay) but delete the `<pre>` rendering and the legacy-source `<p>` shim; mark `LEGACY_DETAILS` for L25's manage-and-edit-actually-persists rework, where the proper fix lives. File the deferred deletion in `plans/L23/follow-ups.md`.

**Builder action.** Before T-GREEN-4, read `packages/web/src/pages/__tests__/KnowledgeDetail.test.tsx` (or wherever the protected suite sits) and decide. Document the call in the commit message.

### R2 — L2 follow-ups (FU-1, FU-2)

Per the prompt: L2-FU-1 (floating-ui wiring on `BlockActionsPopover`) and L2-FU-2 (mobile sheet adaptation) were called out as hard prereqs.

**Status of FU-1 (floating-ui).** `@floating-ui/react@^0.27.19` is already a `packages/web` dep (verified at `packages/web/package.json:16`). `BlockActionsPopover` itself does **not** consume it yet — the comment at `BlockActionsPopover.tsx:23-27` says "Built without `@floating-ui/react` in the unit-test path; positioning is host-side via absolute/fixed CSS in the live UI." So FU-1 is unwired but the dep is present.

**Status of FU-2 (mobile sheet).** No code path adapts the popover to a bottom-sheet on small viewports.

**Impact on L23.** **None.** L23 does not wire `BlockActionsPopover`. The popover is invoked only when the per-block actions surface ships in L26. L23 ships `<Block />` with no `slots.gutterLeading`, so `BlockHandle` doesn't render, so `BlockActionsPopover` never opens. FU-1 and FU-2 stay open as L26 prereqs and are noted in `plans/L23/follow-ups.md` (created if R1 also forces it; otherwise the noted-here mention is sufficient).

**Builder confirms.** Before T-GREEN-1, grep the implementation for `BlockHandle` / `BlockActionsPopover` references. There should be zero. If a refactor adds them, FU-1 and FU-2 become live blockers.

### R3 — Heading hierarchy in dark theme

The scoped CSS uses `--density-text-h1` and `--density-text-h2`. Both are defined inside the density blocks at `tokens.css:254-311`. They are theme-independent (sizes, not colours). Dark/light parity is automatic.

### R4 — Long bodies (near 256 KB)

`deriveBlocks` enforces `MAX_BODY_BYTES = 256 * 1024` and emits a single `unknown` block for oversize bodies (`derive-blocks.ts:300-325`). `KnowledgeBody` does no special handling — `Block` renders the unknown payload via `UnknownPayload`, which has its own warn-stripe shell. T2/T3 don't exercise this; T7 implicitly does not either. Low priority — Knowledge bodies in practice are kilobytes, not hundreds of kilobytes. Surface in `follow-ups.md` if oversize bodies are observed in fixtures.

### R5 — Heading-with-margin-top inside `flex flex-col`

The scoped CSS adds `margin-top: 4px` on every heading. Combined with `Block`'s `py-[6px]`, the cumulative top space above a heading is 4 + 6 = 10 px, vs 6 px above a paragraph. Acceptable — visually a heading should breathe. The 4 px stays on the AQ-001 grid. If a designer-call rejects it, drop the margin-top and let `py-[6px]` carry the rhythm uniformly; visuals will look slightly tighter.

## 9. Definition of Done

| AC (verbatim) | Verification |
|---|---|
| The knowledge detail body renders as styled, structured markdown blocks. | Manual screenshot proof (T-VERIFY) + E1, E2 Playwright. |
| The current `<pre>` block at `KnowledgeDetail.tsx:301-307` is gone. | T8 Vitest grep on rendered DOM (`data-testid="knowledge-body"` resolves to `[data-knowledge-body]`, not `<pre>`). |
| Block ids are stable per L2. | T6 Vitest unit on `<KnowledgeBody>` re-render with one-section edit. Underlying L2 contract guarded by `golden-ids.test.ts` in `packages/shared/src/blocks/__tests__/`. |
| The on-disk format remains valid markdown — bodies in persistence stay text, never JSON. | No DB schema change (verified by reading `packages/db/src/schema/`); no API change to `routes/knowledge.ts`. |
| Vitest tests cover: round-trip is lossless on supported types. | T7. |
| Vitest tests cover: block-id stability holds. | T6. |
| Playwright e2e: open a Knowledge entry with a multi-section body → see styled rendering. | E1. |
| Hardcoded legacy detail text is removed; bodies come from the data layer. | T-GREEN-4 + T10 (gated on R1). |
| Matching inventory rows from L6 are closed. | L6 inventory does not exist yet; § 7 documents that L23 pre-closes the future Knowledge-body rows. |
| `bun run check` + `bun run lint` + `bun run test` all green. | T-VERIFY. |
| Full e2e suite stays green. | T-VERIFY. |
