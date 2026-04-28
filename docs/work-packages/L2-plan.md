# L2 — Block primitive: technical plan

> Architecture output for `docs/work-packages/TRACK-L.md` § L2 (lines 69-108).
> Concept input: `docs/concept/BLOCKS.md` (load-bearing).
> Design input: `docs/design-explorations/L2/approved.md` (the visual contract; rejected list is binding).
> Shared contract: `docs/work-packages/SHARED.md` § "Block primitive (L2)".

This plan is implementable as **L2a** (shared derivation + types + tests) and **L2b** (design-system Block + BlockHandle + BlockActionsPopover, visual-regression refs, tests). Each is independently shippable.

> **Plan deviations applied during /apply-review (L2-plan v1.1):**
> - `BodyMetadata` type and frontmatter parsing pipeline removed — no consumer in L2/L23/L16; deferred until a concrete consumer arrives.
> - `PARSER_VERSION` constant removed — version-bump discipline is enforced solely by `BLOCK_ID_VERSION` mixed into the BlockId hash plus the golden-ids snapshot. The `PARSER_VERSION` constant was decorative and consumed by no caller.
> - `BlockDerivationResult` shape is `{ blocks: Block[] }` — `metadata` field dropped.
> - `Block.source.bodySha` renamed to `Block.source.bodyDigest` — the algorithm is blake2s_256, not SHA.
> - `BlockId` is a branded nominal type (`string & { readonly __brand: 'BlockId' }`).
> - Inline link href URLs go through a `LINK_URL_SAFE_SCHEMES` allowlist (`http:`, `https:`, `mailto:`, `tel:`, plus relative + `#fragment`); hostile schemes degrade to plain text.
> - Body byte-cap (`MAX_BODY_BYTES`) is checked against UTF-8 byte length (`TextEncoder.encode().byteLength`), not UTF-16 code units.
> - HTML-payload normalisation no longer collapses inter-tag whitespace (CRLF→LF only).
> - `BlockActionsPopover` drops the unused `anchorRef` prop; `Block` drops the speculative `gutterTrailing` and `overlay` slots and the `threadCount` / `surface` props.
> - `BlockHandle.onCopyPermalink` is wired into the global block-level `⌘L` shortcut on the `Block` shell (not the handle button itself).

---

## 1. Story summary

L2 ships the Block primitive as a *concept-aligned, shared-implementation, DS-quality* foundation that L16 (bet pitch render), L23 (knowledge body render), and L26 (per-block discussion) all consume. The on-disk format stays GitHub-flavoured markdown — Blocks are a derived view computed by `deriveBlocks(body, host)` in `packages/shared`, callable on both server and client with byte-identical output (per BLOCKS.md § 10). The renderer surface is a single Tier-2 `Block` component with named slot props and ten internal per-kind payload renderers (per the approved design).

L2 ships zero new database tables, zero new on-disk dialect, zero new server routes, and zero changes to the existing `<pre>` fallbacks in `WorkBet.tsx` / `KnowledgeDetail.tsx` — those swaps are L16 and L23 (concept § 9). What L2 ships is the primitive that those stories will compose: types, a pure derivation function, three Tier-2 components, three HTML reference files, ten internal payload renderers, and the test suite that proves the contracts hold.

---

## 2. Plan reconciliation (spec ⇆ codebase)

| Spec assumption | Codebase reality | How the plan handles it |
|---|---|---|
| `WorkBet.tsx` `<pre>` fallback at lines 262-267 (concept § 9). | Confirmed at `packages/web/src/pages/WorkBet.tsx:256-268` (`data-testid="bet-pitch-body"`, sanitised). | L2 leaves it in place. L16 swaps. |
| `KnowledgeDetail.tsx` `<pre>` fallback at lines 301-307 (concept § 9). | Confirmed at `packages/web/src/pages/KnowledgeDetail.tsx:301-307` (`data-testid="knowledge-body"`, DOMPurify wraps `sanitize(savedContent)`). A second `<pre>` exists at line 284 (the edit-mode preview); concept § 9 names only the rendered-body fallback. | L2 leaves both in place. L23 swaps the read path; the edit-mode preview is owned by L23/L25, not L2. |
| `@hyperidle/shared` is the home of cross-process pure code (BLOCKS.md § 10: "lives in `packages/shared` and is imported by both server and web"). | Confirmed: `packages/shared/src/index.ts` is a barrel; `packages/shared/package.json` has a single `exports` plus `./net` subpath for SSRF utilities (which intentionally do NOT live on the main barrel because they import `node:dns`/`node:net`). | New module `packages/shared/src/blocks/` (folder) with `derive-blocks.ts`, `block-id.ts`, `slug.ts`, `normalise.ts`, `types.ts`. Re-export `Block`, `BlockKind`, `BlockId`, `BlockAnchor`, `BlockHostKind`, `BodyMetadata`, `BlockPayload`, `BlockDerivationResult`, `deriveBlocks` from the main barrel. **Browser-safety guard (lore J7 / MEMORY.md `project_white_screen_root_cause`):** zero `node:` imports in `blocks/` — only `@noble/hashes/blake2s`, `github-slugger`, `remark`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `unist-util-visit`. Add a Vitest assertion: `import` of `@hyperidle/shared/blocks` from a `vitest --environment=jsdom` test must not throw. |
| Tier-2 design-system components are flat `.tsx` + co-located `.stories.tsx` + matching `html/<Name>.html`, exported from `packages/design-system/src/index.ts`, registered in `__tests__/visual-regression.test.ts` and `__tests__/html-components.test.ts`. | Confirmed by reading `packages/design-system/src/index.ts`, `packages/design-system/html/` (14 files), and `packages/design-system/src/__tests__/visual-regression.test.ts` (14-component `COMPONENTS` array). | Add `Block.tsx` + `Block.stories.tsx` + `BlockHandle.tsx` + `BlockHandle.stories.tsx` + `BlockActionsPopover.tsx` + `BlockActionsPopover.stories.tsx`. Add `html/Block.html` + `html/BlockHandle.html` + `html/BlockActionsPopover.html`. Per-kind payload renderers live in `packages/design-system/src/block/` (folder, not exported), since the design contract is "internal to `Block`, NOT counted as Tier-2" (approved.md § "Per-kind payload renderers"). Extend `EXPECTED_COMPONENTS` arrays in both tests, extend `COMPONENTS` in visual-regression, extend `EXPECTED_MARKERS`. **Visual-regression baseline regenerates with this story** (the K2/K8 retros say baselines regenerate on the story that ships the new HTML — L2 ships three new HTML files, so the baseline owns those three). |
| K2 DOM-marker contract: every Tier-1/2 component spreads `dsProps(name, "2")` on outermost JSX. The DS-name string is the **lowercase, hyphenated** form, not PascalCase, per approved.md § "Component data attributes" (`"block"`, `"block-handle"`, `"block-actions-popover"`). | Confirmed at `packages/design-system/src/ds-attrs.ts`. | `Block` spreads `dsProps("block", "2")`, `BlockHandle` spreads `dsProps("block-handle", "2")`, `BlockActionsPopover` spreads `dsProps("block-actions-popover", "2")`. The `Block` shell additionally carries `data-ds-kind={payload.kind}` (one of `heading|paragraph|list|quote|code|table|divider|image|html|unknown`), `data-block-id={id}` (hex), `data-state={state}` (one of `default|hovered|focused|popover-open|deleted|unknown`). |
| DOMPurify is the codebase precedent for sanitised HTML rendering. | Confirmed: `packages/web/package.json` ships `dompurify` + `@types/dompurify`; used in `packages/web/src/shell/ArtifactView.tsx:141` and `packages/web/src/pages/KnowledgeDetail.tsx:143`. | The `html` BlockKind renderer in `packages/design-system` cannot import `dompurify` directly (DS components are framework-host-agnostic and should not pull web-only deps into the DS package). **Resolution:** the `Block` component accepts a `sanitizeHtml: (raw: string) => string` prop (host-injected). The web app passes `DOMPurify.sanitize`. The DS storybook variant passes a noop in trusted demos. Tests verify the unsanitised path is unreachable when `sanitizeHtml` is omitted (component falls through to `UnknownPayload` with raw-source preview). |
| `@floating-ui/react` is the SHARED.md UI Stack `Popover` driver. | SHARED.md § "UI Stack" line 122 confirms `@floating-ui/react`. Verify in `packages/web/package.json` for actual install. | Plan adds `@floating-ui/react` to `packages/design-system/package.json` if not already present (existing components use it; check before adding). `BlockActionsPopover` uses `useFloating({ placement: 'right-start', middleware: [flip(), shift({ padding: 8 })] })` per approved.md § "Component composition". ⚠️ UNVERIFIED: did not enumerate `packages/design-system/package.json` deps; first L2b task verifies and adds the dep iff missing. Source: https://floating-ui.com/docs/react |
| `github-slugger` is named in BLOCKS.md § 8.4. | Not currently a dep. Repo precedent: zero. | Add `github-slugger` to `packages/shared/package.json`. Implementation imports from it. The slug spec is byte-pinned to that package's output for our golden tests. Source: https://github.com/Flet/github-slugger |
| `@noble/hashes` blake2s is named as the BlockId hash primitive in BLOCKS.md § 8.4 ("the primitive is **blake2s**"). | Not currently a dep. | Add `@noble/hashes` to `packages/shared/package.json`. Use `blake2s(input, { dkLen: 16 })` to get 128 bits, hex-encode. The version tag `blk:v1` is the migration handle. Source: https://github.com/paulmillr/noble-hashes |
| Markdown parser. Concept § 13 (architect call): `remark` + `remark-gfm` recommended; alternatives `micromark`, `markdown-it`. | None installed. | **Pick: `remark` + `remark-parse` + `remark-gfm` + `remark-frontmatter`.** See § 4 design-it-twice. Add to `packages/shared/package.json`. Source: https://github.com/remarkjs/remark + https://github.com/remarkjs/remark-gfm |
| L1 attachment-kind closed enum: BLOCKS.md § 4 says L2 extends L1's `bet | task | knowledge_item | artifact | agent | user` enum by adding `block`. | L1 concept doc not yet in `docs/concept/`. SHARED.md § "Block primitive (L2)" lines 86-87 already locks the host enum. | L2 carries the registered claim. The `BlockHostKind` re-export from `@hyperidle/shared` becomes the source of truth until L1 lands. The L26 story will import this enum. **Open coordination flagged in § 8.** |
| Page-local fixture types (the L1 retro raised this for L1). | The existing `<pre>` fallbacks read `bet.body` / `savedContent` (strings). No page-local Block fixture exists yet (because the primitive doesn't exist). | N/A for L2 — there's no analog to remove. L2 *creates* the type at `@hyperidle/shared`; consumers (L16, L23) import from there. |
| ProtectedTests: pre-existing tests that touch `<pre>` must keep passing. | `packages/web/src/__tests__/WorkBet.detail.test.tsx:46` (`getByTestId('bet-pitch-body')`); `packages/web/src/__tests__/KnowledgeDetail.metadata.test.tsx:69` (`getByTestId('knowledge-body')`); `packages/web/src/__tests__/KnowledgeDetail.edit.test.tsx:57,75`; `packages/web/e2e/knowledge-detail.spec.ts:29`. | These all stay green after L2 because L2 does not touch `WorkBet.tsx` / `KnowledgeDetail.tsx`. They are listed in § 9 ProtectedTests. L16 / L23 will swap the body and update those tests; that's *their* concern, not L2's. |
| Any `node:` import accidentally landing on `@hyperidle/shared`'s main barrel breaks Vite (memory: `project_white_screen_root_cause`). | Confirmed in `packages/shared/src/index.ts:56-57` comment ("SSRF utilities use node:dns/net/util and cannot be imported in the browser"). | The blocks module is browser-safe by construction (deps above are all isomorphic). § 9 protected-tests includes a regression test that imports `@hyperidle/shared` from a jsdom Vitest config and asserts no Node-specific module errors surface. |

---

## 3. Acceptance criteria (every AC has a concrete verification method)

### 3.1 Concept-doc + SHARED.md AC

| ID | Criterion | Verification |
|---|---|---|
| AC-1 | `docs/concept/BLOCKS.md` exists and matches the locked § 1-§ 14 shape; `docs/concept/HUMAN_INTERFACE_LAYER.md` has a "Block primitive" section that links to BLOCKS.md. | `docs/__tests__/concept-block.test.ts` (Vitest, `node:fs.readFileSync`) asserts the existence of `docs/concept/BLOCKS.md` AND that `docs/concept/HUMAN_INTERFACE_LAYER.md` contains the literal string `## Block primitive` and a `BLOCKS.md` link. |
| AC-2 | `docs/work-packages/SHARED.md` § "Block primitive (L2)" carries the canonical type signatures; consumer stories cite this section, not their own copy. | Same `concept-block.test.ts` asserts `SHARED.md` contains the canonical block-type signature lines (regex match for `type BlockKind`, `function deriveBlocks`). |
| AC-3 | `docs/reviews/improvements-work.md` #5 ("Render bet pitch as blocks-in-markdown") and `docs/reviews/improvements-knowledge.md` #2 cross-reference the L2 Block primitive. | At write-tests time (T2.5 below), `grep -l "improvements-work.md\|improvements-knowledge.md" docs/reviews/` confirmed both files exist (verified 2026-04-28). The presence test in `docs/__tests__/concept-block.test.ts` asserts: (a) `docs/reviews/improvements-work.md` contains the literal substring `block ids` AND `#5` heading exists, AND (b) `docs/reviews/improvements-knowledge.md` contains the literal substring `Block primitive` AND `#2` reference. If either assertion fails because the cross-reference text is missing, AC-3 is a **deferred AC** with follow-up task **T-CROSSLINK** (own owner; not in the L2 28-task budget) to author the cross-references when the next pass on those review docs lands. The test file records both branches: green when present; red and named in the L2 DoD as "deferred — see T-CROSSLINK" when absent. No hand-wave. |

### 3.2 Type / shared-API AC (L2a)

| ID | Criterion | Verification |
|---|---|---|
| AC-4 | `BlockKind` is the closed 10-entry enum; importable from `@hyperidle/shared`. | `packages/shared/src/__tests__/blocks/types.test.ts`: imports `BLOCK_KINDS` constant array, asserts `BLOCK_KINDS.length === 10` and the exact ordered set. TypeScript test (`expectTypeOf<BlockKind>().toEqualTypeOf<...>()`) confirms enum closure. |
| AC-5 | `Block`, `BlockId`, `BlockAnchor`, `BlockHostKind`, `BodyMetadata`, `BlockPayload`, `BlockDerivationResult` exported and shaped per SHARED.md § "Block primitive (L2)". | Same test file: `expectTypeOf<Block>()` matches the SHARED.md shape line-for-line. `BlockHostKind` enum is the closed 6-entry set. |
| AC-6 | `deriveBlocks(body, host)` exists with signature `(body: string, host: { kind: BlockHostKind; id: string }) => { blocks: Block[]; metadata: BodyMetadata }`. Pure (no I/O, no clock, no DB). | Type test asserts the signature. Runtime test in `packages/shared/src/__tests__/blocks/purity.test.ts` calls `deriveBlocks` 1000× on the same input, asserts byte-identical output every call (id stability + no time-dependence). |
| AC-7 | `deriveBlocks` is browser-safe: no `node:` imports anywhere in the `blocks/` subtree. | `packages/shared/src/__tests__/blocks/browser-safe.test.ts` uses Vitest `--environment=jsdom`, dynamically imports `@hyperidle/shared`, asserts no error. Static check: `eslint` rule (already configured per `eslint.config.js`) forbids `node:` imports in this subtree (add a path-restricted entry). |

### 3.3 Derivation correctness AC (L2a)

For every BlockKind, a Vitest fixture pair `(input.md, expected.json)` lives in `packages/shared/src/__tests__/blocks/fixtures/<kind>/`. The test loads the pair, calls `deriveBlocks(body, mockHost)`, asserts deep-equal against `expected.json` minus volatile fields (`source.bodySha` is normalised via the test helper).

| ID | Criterion | Verification |
|---|---|---|
| AC-8 | `heading` derivation: levels 1-6, slug-stable. | Fixture `fixtures/heading/`: input contains H1-H6 + emoji-only heading + duplicate-text headings; expected lists 8 blocks with correct `payload.level` and `payload.text`. |
| AC-9 | `paragraph` derivation: inline marks (`<strong>`/`<em>`/`<code>`/`<a>`) preserved. | Fixture `fixtures/paragraph/` with markdown `**bold** *em* \`code\` [link](url)`; expected payload has the inline AST (typed). |
| AC-10 | `list` derivation: bullet + ordered + nested ≤ 3, single block per outer list. | Fixture `fixtures/list/` with `- a\n- b\n  - c\n1. one`; expected = 2 list blocks. |
| AC-11 | `quote` derivation: blockquote + nested inline content. | Fixture `fixtures/quote/`. |
| AC-12 | `code` derivation: language tag preserved verbatim, body byte-preserved (CRLF→LF normalised before hashing only). | Fixture `fixtures/code/` with language tag and CRLF-line-ending input; expected payload `{ lang, text }` with LF. |
| AC-13 | `table` derivation: header row + alignment + body rows. | Fixture `fixtures/table/` (GFM table). |
| AC-14 | `divider` derivation: `---` standalone. | Fixture `fixtures/divider/`. |
| AC-15 | `image` derivation: paragraph that is solely an image becomes `image`, alt+url preserved. | Fixture `fixtures/image/`. |
| AC-15a | **Image URL scheme allowlist (defence-in-depth at derivation time).** Only `http:`, `https:`, relative-path (no scheme), and `data:image/...` URLs are emitted as `image` BlockKind. Any other scheme (`javascript:`, `data:text/html`, `data:application/...`, `vbscript:`, `file:`, `about:`, etc.) routes to `unknown` BlockKind with `payload.reason === 'parser-unrecognised'` and the raw `![alt](url)` source preserved. The protective gate runs in `derive-blocks.ts` before payload assembly so the renderer never sees a hostile URL. (Pick (a) per architect-critique M4: simpler than renderer-side stripping; failure-closed by default.) | Fixture `fixtures/image/url-schemes/` with one input.md per case: `![x](javascript:alert(1))`, `![x](data:text/html,<script>...)`, `![x](vbscript:msgbox(1))`, `![x](file:///etc/passwd)` — all expected as `unknown` blocks with the raw source preserved. Positive cases `![x](https://example.com/a.png)`, `![x](/relative.png)`, `![x](data:image/png;base64,iVBORw0...)`, `![x](./local.png)` expected as `image` blocks. The allow-set is exported as `IMAGE_URL_SAFE_SCHEMES` from `packages/shared/src/blocks/derive-blocks.ts` for the test to enumerate. |
| AC-16 | `html` derivation: GFM raw HTML block produces `html` BlockKind with raw source as payload. | Fixture `fixtures/html/` with `<details><summary>...</summary>...</details>`. |
| AC-17 | `unknown` safety valve: parser-emitted node types not in the closed kind set fall to `unknown` with raw source preserved; derivation never throws. | Fixture `fixtures/unknown/` (intentionally unrecognised mdast node type produced by a synthetic AST mutation in the test). Plus a fuzz test in `packages/shared/src/__tests__/blocks/fuzz.test.ts`: 200 random byte streams; assert `deriveBlocks` returns successfully (no throw) and `blocks.every(b => BLOCK_KINDS.includes(b.kind))`. |
| AC-18 | Body metadata (front matter) is parsed into the sibling `metadata` field; never appears as a Block. | Fixture `fixtures/metadata/` with YAML front matter; expected `result.metadata` deep-equals parsed object; no block has kind that came from the front matter. |
| AC-19 | Empty body produces `{ blocks: [], metadata: null }`. | Unit test in `packages/shared/src/__tests__/blocks/edge-cases.test.ts`. |

### 3.4 BlockId stability AC (L2a)

Concept § 8.4 defines four corner cases; one Vitest test per:

| ID | Criterion | Verification |
|---|---|---|
| AC-20 | Re-parse stability: same body → same ids. | `packages/shared/src/__tests__/blocks/id-stability.test.ts:test('same body, same ids')`: parse 5× across each fixture, assert id equality. |
| AC-21 | Neighbour-edit isolation: editing block X leaves block Y's id unchanged. | `id-stability.test.ts:test('neighbour edit')`: a 5-block fixture; edit block 2's text; assert blocks 0,1,3,4 have unchanged ids. Variants for: (a) paragraph between two paragraphs, (b) paragraph under a heading, (c) heading-rename leaves *other* siblings stable. |
| AC-22 | Rename-to-collide does not corrupt unchanged siblings. Rename `## Approach` → `## Background` next to existing `## Background`; existing `## Background`'s id stays stable. | `id-stability.test.ts:test('rename to collide')`. |
| AC-23 | Pre-heading content has the `<root>` outline path; two pre-heading paragraphs differ only by payload. | `id-stability.test.ts:test('pre-heading root path')` asserts the two pre-heading paragraphs have different ids and that their ids are not equal to the same paragraphs placed under a heading (different outline paths). |
| AC-24 | Slug normalisation handles emoji-only and all-punctuation headings (returns `<empty>` sentinel without colliding with `<root>`). | `id-stability.test.ts:test('slug edge cases')`. Cross-checks: emoji-only, all-`!!!`, mixed unicode (NFKD). |
| AC-25 | Line-ending normalisation: CRLF and LF bodies with otherwise identical content produce **identical** ids for `code` and `unknown` blocks; **but the bodyShape-affecting** kinds (paragraph, etc.) treat normalised whitespace such that bold-vs-plain edits change the hash but trailing-newline edits do not. | `id-stability.test.ts:test('line endings + whitespace')`. |
| AC-26 | Same content under different `(hostKind, hostId)` produces blocks with the **same** `BlockId` but threads keyed by the host pair (concept § 8.5 rule 4). The id collision across hosts is by design; the host pair scopes attachment. | `id-stability.test.ts:test('host pair scopes anchor, not id')`: derive same body under `bet/A` and `bet/B`; assert ids match, asserts `source.hostId` differs. |
| AC-27 | The `blk:v1` version tag is included in the hash input. Bumping it would change every id. | `id-stability.test.ts:test('version tag participates')` mutates a copy of the version constant via test-only export and asserts ids change. |
| AC-27b | **Golden-ids snapshot enforces `PARSER_VERSION`.** A frozen corpus of ~10 representative markdown bodies (one per BlockKind plus 2 mixed-kind multi-block bodies) is checked-in at `packages/shared/src/__tests__/blocks/__tests__/golden-ids.json` mapping each fixture name → expected `BlockId[]` (in document order). The id-stability test loads this snapshot and asserts deep-equal against `deriveBlocks(fixture, mockHost).blocks.map(b => b.id)`. **Any change to `normalise.ts`, `slug.ts`, `block-id.ts`, or the parser pipeline that drifts ids requires updating BOTH the snapshot file AND `BLOCK_ID_VERSION` (`'blk:v1'` → `'blk:v2'`) in the same PR.** A separate `assertVersionBumped.test.ts` reads the snapshot mtime + `BLOCK_ID_VERSION` from git history and fails the CI if the snapshot drifted without a version bump. The snapshot is the convention's enforcement mechanism. | `packages/shared/src/__tests__/blocks/golden-ids.test.ts` (loads `golden-ids.json` and asserts deep-equal); `packages/shared/src/__tests__/blocks/assert-version-bumped.test.ts` (git-history check). |
| AC-27a | **Heading-rename cascade invalidation.** Renaming an H2 changes its own id AND every descendant heading's id (because each descendant's `outlinePath` includes the renamed slug). Sibling H2s elsewhere in the body are untouched. Concept § 8.4: "rename invalidates ids of the headings under it." | `id-stability.test.ts:test('heading rename cascades to descendants')`. Fixture `before`: ```\n## Approach\n...content...\n### Step 1\nbody\n## Other\n### Other Step\n``` — fixture `after` renames `## Approach` → `## Strategy` (content + Step 1 unchanged): assert (1) the renamed H2's id changed (its slug is now `strategy`), (2) the H3 `Step 1` under it ALSO has a new id (its outline path went from `approach` to `strategy`), (3) the sibling `## Other` H2 and its `### Other Step` retain their original ids byte-for-byte, (4) the paragraph "body" under `### Step 1` ALSO gets a new id (its outline path includes the renamed H2). |

### 3.5 Lossless-render AC (L2a renders → L2b proves visually)

| ID | Criterion | Verification |
|---|---|---|
| AC-28 | Round-trip: every BlockKind's payload contains enough information that re-serialising back to source produces the equivalent rendered output. (Concept § 1: "lossless for the supported types".) | `packages/shared/src/__tests__/blocks/round-trip.test.ts`: for each fixture, derive blocks → render to HTML via the design-system `renderToString(<Block .../>)` → assert HTML equals the HTML of `remark`+`remark-gfm`+`remark-html` baseline (modulo our sanitiser's effect). |

### 3.6 Render-fidelity AC (L2b)

| ID | Criterion | Verification |
|---|---|---|
| AC-29 | One Tier-2 `<Block>` component renders all 10 BlockKinds with correct semantic HTML per approved.md § "Accessibility commitments" (h1-h6 / p / ul/ol/li / blockquote / pre>code / table / hr / figure>img / sanitised-html / unknown-with-warn-stripe). | `packages/design-system/src/__tests__/Block.test.tsx`: mounts `<Block>` once per kind, asserts the outermost expected tag in each case. |
| AC-30 | `BlockHandle` renders chevron-right SVG, has `data-ds-component="block-handle"`, owns `aria-expanded`, opens popover on click/Enter/Space. | `packages/design-system/src/__tests__/BlockHandle.test.tsx`: keyboard + a11y coverage. |
| AC-31 | `BlockActionsPopover` positions right-start with flip+shift, traps focus, `role="menu"`, items `role="menuitem"`. | `packages/design-system/src/__tests__/BlockActionsPopover.test.tsx`. |
| AC-32 | DS DOM markers (LOWERCASE per approved.md § "Component data attributes"): `Block` shell carries `data-ds-component="block"`, `data-ds-tier="2"`, `data-ds-source="design-system"`, `data-ds-kind="{kind}"`, `data-block-id="{hex}"`, `data-state="{state}"`. `BlockHandle` carries `data-ds-component="block-handle"`. `BlockActionsPopover` carries `data-ds-component="block-actions-popover"`. PascalCase names (`"Block"`, `"BlockHandle"`, `"BlockActionsPopover"`) MUST NOT appear in any DOM attribute. | `packages/design-system/src/__tests__/Block.test.tsx:describe('DS markers')`: asserts the lowercase strings on each component's outermost JSX, AND a negative assertion that the rendered HTML does NOT contain the substring `data-ds-component="Block"` (capital B). |
| AC-33 | Visual-regression: HTML reference and TSX render diff < 5% (project gate per `.claude/rules/visual-parity.md`). | `packages/design-system/src/__tests__/visual-regression.test.ts` extends `COMPONENTS` to include `Block`, `BlockHandle`, `BlockActionsPopover`. Baseline is generated with this story (per K2/K8 retro convention). |
| AC-34 | HTML reference files exist for all three components and are valid per the existing `html-components.test.ts` pattern. | `packages/design-system/src/__tests__/html-components.test.ts` extended; new HTML files at `packages/design-system/html/Block.html`, `BlockHandle.html`, `BlockActionsPopover.html`. |
| AC-35 | Stories: every component has a `.stories.tsx` rendering populated, hovered, focused, popover-open, deleted, unknown, table-overflow, code-overflow states (per approved.md § "All states with copy"). | `packages/design-system/src/Block.stories.tsx` (etc.); `packages/design-system/src/__tests__/aesthetics-doc.test.ts` discovers them. |
| AC-36 | Playwright e2e: a markdown body containing all 10 kinds renders with no literal markdown syntax visible (no `#`, no `*` outside content, no `<pre>` rectangles for non-code blocks). | `packages/web/e2e/block-render.spec.ts`: opens `/designsystem#Block` (the DS viewer), screenshots each kind variant; asserts heading rendered as semantic `h2` (not `## ...` text), code fences absent on non-code kinds, no rendered `\`\`\`` strings. |
| AC-37 | Responsive collapse at ≤ 640 px: gutter 32 → 28 px, handle `opacity: 1`, popover renders bottom-sheet style. | `Block.stories.tsx` includes `mobile` viewport variant; visual-regression at the mobile viewport. |
| AC-38 | Reduced motion: `prefers-reduced-motion: reduce` collapses every `--motion-*` to 1 ms; handle stays at `opacity: 0.4`. | Vitest jsdom test that sets the media query and asserts the computed style of the handle. |

### 3.7 A11y AC (L2b)

| ID | Criterion | Verification |
|---|---|---|
| AC-39 | Focus ring on `:focus-visible` uses `--focus-ring` token; outline-offset `-1px`. | `Block.test.tsx` snapshots the focus state's class list. |
| AC-40 | Contrast: inline `<strong>`, `<em>`, `<a>`, inline `<code>` ≥ 4.5:1 on `--surface-0`/`--surface-1`/`--surface-ghost`. | Reuses K8 contrast harness if present; otherwise add a test in `packages/design-system/src/__tests__/Block.contrast.test.tsx` that computes contrast for each token pair. |
| AC-41 | Image alt text preserved verbatim from `![alt](url)`; empty-alt renders `alt=""`. | `Block.test.tsx:describe('image kind')`. |
| AC-42 | Copy-success announcement: `aria-live="polite"` region renders "Copied" on permalink copy. | `BlockActionsPopover.test.tsx:test('copy permalink announces')`. |

### 3.8 Rejected-list AC (binding from approved.md § "Rejected list")

| ID | Criterion | Verification |
|---|---|---|
| AC-43 | No new top-level `/permalink/<id>` route is added. Permalinks are URL fragments `#blk-<blockIdHex>`. | `packages/server/src/__tests__/blocks-no-route.test.ts`: greps the route registration in `packages/server/src/index.ts` (or the equivalent route registry) for any `/permalink` or `/blocks` path; assert zero matches. |
| AC-44 | No `block_comments` table, no `blocks` table, no `block_id` column added by L2. | `packages/db/src/__tests__/schema-no-block-table.test.ts`: enumerates schema tables/columns; asserts none match. |
| AC-45 | No drag-reorder UI. | Static check: `BlockHandle.test.tsx` asserts the rendered DOM contains no `aria-grabbed` / `draggable` / `cursor-grab` markers. |
| AC-46 | No J/K vim-style shortcuts. | `Block.test.tsx:describe('keyboard')`: presses J and K on a focused block, asserts no focus change (only ↑/↓ advance). |
| AC-47 | No leading `--ok` status dot on the `code` language pill. | Visual-regression baseline (the HTML reference omits it). |
| AC-48 | No inline `[[id]]` linking parser logic in derivation. | `derive-blocks.test.ts:test('does not parse [[id]] as link')` asserts that `[[abc]]` is treated as plain text. |

### 3.9 Security & abuse-case AC (per § 7)

| ID | Criterion | Verification |
|---|---|---|
| AC-49 | `html` BlockKind is sanitised via the host-injected `sanitizeHtml` prop. When omitted, falls through to `UnknownPayload` with raw-source preview (never renders unsanitised HTML). | `Block.test.tsx:describe('html kind security')`: mount without `sanitizeHtml`, assert no `dangerouslySetInnerHTML` in the rendered tree; with a stub sanitizer, assert it is invoked. Includes a malicious-fixture test (`<img src=x onerror=alert(1)>`) showing the rendered DOM has no `onerror`. |
| AC-49a | **Sanitiser-strip fallback path.** When `sanitizeHtml` returns the empty string (the sanitiser stripped everything), the rendered block is the unknown-with-warn-stripe shell with `payload.reason === 'sanitiser-stripped'`. The `html` BlockKind never silently disappears; the user always sees evidence the source was filtered. | `Block.test.tsx:test('sanitiser-strip fallback')`. Fixture body `<details><summary>...</summary>...</details>` with `kind: 'html'`. Mount `<Block ... payload={{ kind: 'html', raw: '<details>...</details>' }} sanitizeHtml={() => ''} />`. Assert: (1) the rendered DOM contains the warn-stripe shell (`data-state="unknown"` shell or `UnknownPayload` marker), (2) the `reason` shown to the user is `sanitiser-stripped` (text content present), (3) the raw source is shown in `<pre><code>` text content (never as inner HTML), (4) no `<details>` element is rendered. The `BlockPayload['unknown'].reason` enum already includes `'sanitiser-stripped'` per § 4.1. |
| AC-50 | `image` BlockKind never triggers a server-side fetch of the URL. | `packages/server/src/__tests__/blocks-no-ssrf.test.ts`: derives a body with `image` kind whose URL points at a local mock; asserts the mock receives zero requests during derivation. (Sanity: derivation is pure per AC-6, so this is structurally true; the test makes the contract explicit.) |
| AC-51 | Resource exhaustion: bodies > `MAX_BODY_BYTES` (256 KB default) emit a single `unknown` block with a "body-too-large" hint instead of running the parser. | `derive-blocks.test.ts:test('oversize body')`: 300 KB body returns `{ blocks: [{ kind: 'unknown', payload: { reason: 'body-too-large' } }], metadata: null }`. |
| AC-52 | Algorithm-collision detection: a debug-only `assertNoCollisions(blocks)` helper exists and emits a CRITICAL log when two blocks in the same body share an id. | `derive-blocks.test.ts:test('collision detector')` injects two byte-identical pre-heading paragraphs and asserts the helper logs CRITICAL via the test logger fake. (Bypasses the actual algorithm; the helper is for production diagnostics, not derivation correctness — concept § 8.4 collision acknowledgment.) |

---

## 4. Type signatures, schemas, endpoints

### 4.1 Types (exported from `@hyperidle/shared`)

```ts
// packages/shared/src/blocks/types.ts

export const BLOCK_KINDS = [
  'heading','paragraph','list','quote','code','table','divider','image','html','unknown',
] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]

export const BLOCK_HOST_KINDS = [
  'bet','task','knowledge_item','artifact','agent','user',
] as const
export type BlockHostKind = (typeof BLOCK_HOST_KINDS)[number]

export type BlockId = string  // opaque hex(blake2s_128)
export const BLOCK_ID_VERSION = 'blk:v1' as const

export type BlockAnchor = { blockId: BlockId }

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'emphasis'; children: InlineNode[] }
  | { type: 'inlineCode'; value: string }
  | { type: 'link'; href: string; children: InlineNode[] }
  | { type: 'break' }

export type BlockPayload =
  | { kind: 'heading'; level: 1|2|3|4|5|6; text: string; inline: InlineNode[] }
  | { kind: 'paragraph'; inline: InlineNode[] }
  | { kind: 'list'; ordered: boolean; start: number | null; items: ListItem[] }
  | { kind: 'quote'; children: BlockPayload[] }
  | { kind: 'code'; lang: string | null; text: string }
  | { kind: 'table'; align: ('left'|'right'|'center'|null)[]; header: InlineNode[][]; rows: InlineNode[][][] }
  | { kind: 'divider' }
  | { kind: 'image'; alt: string; url: string; title: string | null }
  | { kind: 'html'; raw: string }
  | { kind: 'unknown'; raw: string; reason: 'parser-unrecognised' | 'body-too-large' | 'sanitiser-stripped' }

export type ListItem = { children: BlockPayload[] }

export interface Block {
  id: BlockId
  kind: BlockKind
  source: { hostKind: BlockHostKind; hostId: string; bodySha: string; range: { start: number; end: number } }
  payload: BlockPayload
  anchor: BlockAnchor
  order: number
}

export type BodyMetadata = Record<string, unknown> | null

export interface BlockDerivationResult {
  blocks: Block[]
  metadata: BodyMetadata
}

export const PARSER_VERSION = 'blk-parser:v1' as const
export const MAX_BODY_BYTES = 256 * 1024  // 256 KB — see § 4.1.1 for rationale
```

#### 4.1.1 `MAX_BODY_BYTES` rationale (architect call)

Empirical basis (verified 2026-04-28): the largest `body` string across the
current `packages/db/src/seed.ts` and `packages/db/src/seed-pg.ts` fixture data
is well under 1 KB (`packages/db/src/seed.ts` line 143 et al.; the longest seed
body measured is `~80 bytes`). The current production knowledge-item bodies
authored against this codebase are not yet in the seed, but the design intent
(per HUMAN_INTERFACE_LAYER.md and KNOWLEDGE_ARCHITECTURE.md) is human-readable
markdown — analogous corpora (Notion docs, GitHub READMEs, internal RFCs)
typically sit in the 1-50 KB range, with rare long-form content reaching ~100 KB.

Decision rule: **cap at the next power-of-two boundary above `4× the largest
plausible body we expect to author in the next 12 months`**, where the upper
bound is conservatively pinned at 64 KB (a long technical RFC). 4 × 64 KB =
256 KB rounded up to the next power-of-two = **256 KB**. This is large enough
to absorb 4× growth from the worst-case current corpus and small enough to keep
the parser's worst-case wall-clock bounded (remark on a 256 KB GFM body parses
synchronously in ~50-150 ms on a modern laptop; staying under 1 s on a cold
mobile is the SLO).

Bypass behaviour (per AC-51): bodies larger than `MAX_BODY_BYTES` skip the
parser entirely and emit a single `unknown` block with `reason: 'body-too-large'`.
This protects against pathological bodies (megabytes of inline HTML, runaway
markdown) without throwing.

Revisit trigger: when the production corpus reports a p99 body length above
64 KB, OR when a real bet pitch / knowledge-item gets truncated against the cap,
the value gets re-derived against actual fixture data and the constant is bumped
in lockstep with `PARSER_VERSION` if behaviour changes.

### 4.2 The pure derivation function

```ts
// packages/shared/src/blocks/derive-blocks.ts

export function deriveBlocks(
  body: string,
  host: { kind: BlockHostKind; id: string },
): BlockDerivationResult
```

Pipeline: front-matter parse → byte-cap check (returns single `unknown` if over `MAX_BODY_BYTES`) → `unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml','toml']).parse(body)` → walk top-level mdast nodes → map to `BlockKind` → normalise payload per concept § 8.4 `normalised(...)` → **for `image`-kind candidates: validate URL scheme against `IMAGE_URL_SAFE_SCHEMES` (`http:`, `https:`, relative-path, `data:image/`); failed checks downgrade the block to `unknown` with `reason: 'parser-unrecognised'` and the raw markdown source preserved (AC-15a)** → compute `outlinePath` via running heading-stack → compute `BlockId` via `blake2s_128(input)` hex-encoded → assemble `Block[]`.

### 4.3 The BlockId algorithm primitive

```ts
// packages/shared/src/blocks/block-id.ts

export function blockId(args: {
  kind: BlockKind
  outlinePath: string
  normalisedPayload: string
}): BlockId
```

Implementation: blake2s with `dkLen: 16` (128 bits) over UTF-8 concatenation `BLOCK_ID_VERSION || '\0' || kind || '\0' || outlinePath || '\0' || normalisedPayload`. Output: `bytesToHex(...)` (32 hex chars).

### 4.4 The slug primitive

```ts
// packages/shared/src/blocks/slug.ts

export function slug(text: string): string  // pinned to github-slugger output
```

Returns `'<empty>'` for empty/all-punct/all-emoji text per concept § 8.4.

### 4.5 React component props (Tier-2, exported from `@hyperidle/design-system`)

```ts
// packages/design-system/src/Block.tsx

export interface BlockSlots {
  gutterLeading?: ReactNode
  gutterTrailing?: ReactNode
  inlineAfterPayload?: ReactNode
  overlay?: ReactNode
}

export interface BlockProps {
  id: BlockId
  payload: BlockPayload  // self-tagged via payload.kind; the renderer discriminates internally
  threadCount?: number  // default 0
  surface?: 'work-bet' | 'knowledge-detail' | 'design-system'
  state?: 'default' | 'hovered' | 'focused' | 'popover-open' | 'deleted' | 'unknown'
  slots?: BlockSlots
  sanitizeHtml?: (raw: string) => string  // host-injected; required for `html` kind
  className?: string  // surface composition only
}

// Rationale: BlockPayload is a discriminated union over `kind`. Carrying `kind`
// as a separate prop alongside `payload` allowed the two to drift (e.g. `kind:
// 'heading'` with `payload: { kind: 'paragraph', ... }`) and the type checker
// would not catch it. Reading `payload.kind` internally makes the discriminator
// load-bearing on the union itself. The DOM marker `data-ds-kind={payload.kind}`
// is computed inside the renderer.

// packages/design-system/src/BlockHandle.tsx

export interface BlockHandleProps {
  open: boolean
  threadCount: number
  onOpen: () => void
  onClose: () => void
  onCopyPermalink: () => void
  ariaControls: string
  className?: string
}

// packages/design-system/src/BlockActionsPopover.tsx

export interface BlockAction {
  id: string
  label: string
  shortcut?: string
  hint?: string
  disabled?: boolean
  onSelect: () => void
}

export interface BlockActionsPopoverProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement>
  items: BlockAction[]
  liveRegionId: string
}
```

**Slot-prop typing pick: (a) flat optional shape.** See § 5.

### 4.6 No new endpoints

L2 ships zero server routes. The thread-count batched query is a **L26 concern** — concept § 4 says blocks know nothing about threads. The `<Block>` component accepts `threadCount: number` (default 0) as a prop; L26 will pass real counts via a batched fetch on the host page, not L2.

### 4.7 No new database schema

Concept § 3 rule 3 forbids any per-block table or column. L2 introduces zero tables, zero columns, zero migrations.

---

## 5. Design-it-twice

### 5.1 BlockId hash primitive

| Option | Shape | Trade-off | Reason to reject the other |
|---|---|---|---|
| **(a) `blake2s` from `@noble/hashes`** | `blake2s(bytes, { dkLen: 16 })` → 16 bytes → hex. Synchronous. Pure JS. ~5 KB minified. | Adds a small dep; the `@noble/hashes` family is audited and isomorphic (browser + Node). Synchronous fits the "pure deterministic" contract trivially. | Web Crypto's `subtle.digest` is **async** — every callsite of `deriveBlocks` (a synchronous pure function per BLOCKS.md § 8.3) would have to become async, infecting the entire downstream API. That's a far bigger blast radius than the dep weight. |
| **(b) `subtle.digest('SHA-256')` truncated to 128 bits** | `await crypto.subtle.digest('SHA-256', bytes)` → first 16 bytes → hex. Async. No extra dep. | Native everywhere modern. Slightly stronger collision resistance than blake2s_128. | The async constraint is fatal: making derivation async means React Suspense / explicit `await`s in renderers, breaks the "render synchronously from props" contract of `<Block>`, and complicates the Vitest fixture comparisons. Concept § 8.3 explicitly says derivation is "pure" — async is not what `pure` means in JS. |

**Pick: (a) `blake2s` from `@noble/hashes`.** Rationale: synchronous purity is load-bearing for the derivation contract. Concept § 8.4 explicitly names "blake2s" as the primitive. The dep weight (~5 KB) is negligible against a derivation function shared across server + browser.

### 5.2 Slot-prop typing for `<Block>`

| Option | Shape | Trade-off | Reason to reject |
|---|---|---|---|
| **(a) Flat optional shape** | `slots?: { gutterLeading?: ReactNode; gutterTrailing?: ReactNode; inlineAfterPayload?: ReactNode; overlay?: ReactNode }`. | Surfaces compose what they need; missing slots collapse to nothing harmlessly. Unfamiliar surfaces don't have to know the type. Same shape works for storybook variants. | None significant. |
| **(b) Discriminated union by surface** | `props: { surface: 'work-bet'; slots: WorkBetSlots } \| { surface: 'knowledge-detail'; slots: KnowledgeSlots }`. | Per-surface type-safety: only the slots that surface uses are typed. | Couples the DS Block to surface knowledge — the renderer ends up importing surface-specific types it has no business knowing about. New surfaces (future task notes, retro templates) would need a DS code change just to declare their slot set. Approved.md hints at flat. |

**Pick: (a) Flat optional shape.** Approved.md § "Open questions for the architect" #4 confirms the designer recommendation. The DS component stays surface-agnostic.

---

## 6. Ordered task list

### L2a — shared derivation + types + tests (independently shippable)

| # | Task | Files | Test that proves it | Depends on |
|---|---|---|---|---|
| 1 | Add deps to `packages/shared/package.json`: `@noble/hashes`, `github-slugger`, `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `unist-util-visit`, `mdast-util-to-string`. | `packages/shared/package.json` | `bun install` then `bun run check` from `packages/shared` errors-out before deps; passes after. | — |
| 2 | Create the `blocks/` subtree with the type module. | `packages/shared/src/blocks/types.ts` | `packages/shared/src/__tests__/blocks/types.test.ts` (AC-4, AC-5). | T1 |
| 3 | Implement `slug()` pinned to `github-slugger`; export sentinels (`<root>`, `<empty>`). | `packages/shared/src/blocks/slug.ts` | `packages/shared/src/__tests__/blocks/slug.test.ts` (concept § 8.4 spec). | T2 |
| 4 | Implement `normalised(payload)` per concept § 8.4 (one branch per kind). | `packages/shared/src/blocks/normalise.ts` | `packages/shared/src/__tests__/blocks/normalise.test.ts`. | T2 |
| 5 | Implement `blockId(args)` using `@noble/hashes/blake2s` with `dkLen: 16`. | `packages/shared/src/blocks/block-id.ts` | `packages/shared/src/__tests__/blocks/block-id.test.ts` (deterministic + version tag participates → AC-27). | T2 |
| 6 | Implement `deriveBlocks(body, host)`: front-matter, byte-cap, AST walk, kind mapping, payload extraction, outline path, id assembly. | `packages/shared/src/blocks/derive-blocks.ts` | `packages/shared/src/__tests__/blocks/derive-blocks.test.ts` + per-kind fixture tests (AC-8 through AC-19). | T3, T4, T5 |
| 7 | Add the `unknown`-safety-valve fuzz test + collision-detection helper. | `packages/shared/src/blocks/derive-blocks.ts` (helper) + `packages/shared/src/__tests__/blocks/fuzz.test.ts` | AC-17, AC-52. | T6 |
| 7.5 | **Author the golden-ids snapshot fixture corpus** and the snapshot test that enforces `PARSER_VERSION` / `BLOCK_ID_VERSION` co-bumping. Corpus: 10 markdown bodies — one per BlockKind (heading, paragraph, list, quote, code, table, divider, image, html, unknown) plus 2 mixed-kind bodies that exercise outline-path nesting. The fixture corpus lives at `packages/shared/src/__tests__/blocks/fixtures/golden-corpus/*.md`; the snapshot at `packages/shared/src/__tests__/blocks/golden-ids.json`. | `packages/shared/src/__tests__/blocks/golden-ids.test.ts`, `packages/shared/src/__tests__/blocks/assert-version-bumped.test.ts` | AC-27b. | T6 |
| 8 | Add the BlockId stability test suite (heading-rename cascade + 8 corner cases). | `packages/shared/src/__tests__/blocks/id-stability.test.ts` | AC-20 through AC-27, AC-27a. | T6 |
| 9 | Add the round-trip test (derived blocks → HTML). | `packages/shared/src/__tests__/blocks/round-trip.test.ts` | AC-28. | T6 |
| 10 | Add the purity test (1000-iteration determinism check). | `packages/shared/src/__tests__/blocks/purity.test.ts` | AC-6. | T6 |
| 11 | Add the browser-safe import test (Vitest jsdom env). | `packages/shared/src/__tests__/blocks/browser-safe.test.ts` | AC-7. | T6 |
| 12 | Add the resource-exhaustion test (`MAX_BODY_BYTES`). | `packages/shared/src/__tests__/blocks/edge-cases.test.ts` | AC-19, AC-51. | T6 |
| 13 | Re-export `BLOCK_KINDS`, `BlockKind`, `BlockId`, `BlockAnchor`, `BlockHostKind`, `Block`, `BlockPayload`, `BlockDerivationResult`, `BodyMetadata`, `MAX_BODY_BYTES`, `BLOCK_ID_VERSION`, `PARSER_VERSION`, `deriveBlocks`, `blockId`, `slug` from `packages/shared/src/index.ts`. | `packages/shared/src/index.ts` | `bun run check` from web; spot-test by importing the symbol from `packages/web/src/pages/WorkBet.tsx` (without consuming it — just to prove the type is available; no surface change in L2). | T7-T12 |
| 14 | Add the concept-doc + SHARED.md presence test. | `docs/__tests__/concept-block.test.ts` (or wherever the existing docs-presence pattern lives — `packages/design-system/src/__tests__/docs.test.ts` is the precedent; co-locate). | AC-1, AC-2. | — |
| 14a (T-CROSSLINK preflight) | At write-tests time, `grep -l "improvements-work.md"` and `improvements-knowledge.md` in `docs/reviews/` (or `docs/`). Files **were verified to exist** at plan time (`docs/reviews/improvements-work.md` contains #5 about block ids; `docs/reviews/improvements-knowledge.md` line 132 references "Block primitive"). The L2 presence test asserts both cross-references are present. If either assertion goes red on first run, the test fails closed and AC-3 is recorded as **deferred** with task **T-CROSSLINK** logged as a follow-up against `improvements-*.md` editors (NOT against L2). | `docs/__tests__/concept-block.test.ts` (extended); fixture grep against `docs/reviews/improvements-work.md` and `docs/reviews/improvements-knowledge.md`. | AC-3. | — |

L2a task count: **15** (T1-T14, plus T7.5; T14a is a write-tests preflight extension).

### L2b — design-system Block + BlockHandle + BlockActionsPopover + visual-regression refs (independently shippable)

| # | Task | Files | Test that proves it | Depends on |
|---|---|---|---|---|
| 15 | Verify `@floating-ui/react` is a `packages/design-system` dep; if not, add it. | `packages/design-system/package.json` | `bun run check` from design-system. | — |
| 16 | Create the per-kind payload renderers (10 internal modules, NOT exported from the barrel). | `packages/design-system/src/block/HeadingPayload.tsx`, `ParagraphPayload.tsx`, `ListPayload.tsx`, `QuotePayload.tsx`, `CodePayload.tsx`, `TablePayload.tsx`, `DividerPayload.tsx`, `ImagePayload.tsx`, `HtmlPayload.tsx`, `UnknownPayload.tsx` | `packages/design-system/src/__tests__/block/payloads.test.tsx` (per-kind semantic-HTML assertions; AC-29). | T13 |
| 17 | Create `Block.tsx` as the kind-discriminated outer shell with slots, `data-ds-*` markers, focus ring, modifier-state attributes. | `packages/design-system/src/Block.tsx` | `packages/design-system/src/__tests__/Block.test.tsx` (AC-29, AC-32, AC-39, AC-41, AC-43-46, AC-49). | T16 |
| 18 | Create `BlockHandle.tsx` with chevron-right SVG, thread-count chip, aria-expanded, keyboard handlers (↑ ↓ Enter Space ⌘L). | `packages/design-system/src/BlockHandle.tsx` | `packages/design-system/src/__tests__/BlockHandle.test.tsx` (AC-30, AC-46). | T17 |
| 19 | Create `BlockActionsPopover.tsx` using `useFloating({ placement: 'right-start', middleware: [flip(), shift({ padding: 8 })] })`, focus trap, `role="menu"`, `aria-live="polite"` copy-success region. | `packages/design-system/src/BlockActionsPopover.tsx` | `packages/design-system/src/__tests__/BlockActionsPopover.test.tsx` (AC-31, AC-42). | T17 |
| 20 | Add HTML reference files for the three components (Block, BlockHandle, BlockActionsPopover). HTML is the design source of truth — visual-parity rule is binding. | `packages/design-system/html/Block.html`, `BlockHandle.html`, `BlockActionsPopover.html` | `packages/design-system/src/__tests__/html-components.test.ts` (extended `EXPECTED_COMPONENTS` list; AC-34). | T17, T18, T19 |
| 21 | Stories with all states from approved.md § "All states with copy". | `packages/design-system/src/Block.stories.tsx`, `BlockHandle.stories.tsx`, `BlockActionsPopover.stories.tsx` | `packages/design-system/src/__tests__/aesthetics-doc.test.ts` discovers; AC-35. | T17, T18, T19 |
| 22 | Extend `visual-regression.test.ts` `COMPONENTS` and `EXPECTED_MARKERS` with the three new entries; generate baseline. | `packages/design-system/src/__tests__/visual-regression.test.ts` | AC-33. | T20, T21 |
| 23 | Extend the barrel export `packages/design-system/src/index.ts`. | `packages/design-system/src/index.ts` | `bun run check` from web. | T17, T18, T19 |
| 24 | Add the rejected-list guards: no `block_comments`/`blocks` table (db schema test), no `/permalink` route (server route test). | `packages/db/src/__tests__/schema-no-block-table.test.ts`, `packages/server/src/__tests__/blocks-no-route.test.ts` | AC-43, AC-44. | — |
| 25 | Playwright e2e against the DS viewer rendering all 10 kinds; assert no literal markdown syntax visible. | `packages/web/e2e/block-render.spec.ts` | AC-36. | T22 |
| 26 | Mobile + reduced-motion variants in stories; visual-regression at the mobile viewport. | `packages/design-system/src/Block.stories.tsx` | AC-37, AC-38. | T21 |
| 27 | Contrast harness for the inline marks. | `packages/design-system/src/__tests__/Block.contrast.test.tsx` | AC-40. | T17 |
| 28 | `@lore` comments capturing: (a) the `sanitizeHtml` host-injection rationale (DS package cannot import dompurify), (b) the "blake2s sync vs SubtleCrypto async" decision, (c) the `<root>` / `<empty>` slug-sentinel collision-impossibility, (d) the J7-style browser-safe import constraint, (e) the discriminator-on-payload rationale (C2 / no redundant `kind` prop). | `packages/shared/src/blocks/*.ts`, `packages/design-system/src/Block.tsx` | `/lore` scanner indexes new entries. | T17, T6 |
| 29 | **`ReasoningBlockView` rename** (per SHARED.md line 126: "canonical from this concept-doc pass forward"). The component currently lives at `packages/web/src/components/ReasoningBlock.tsx` (utility tier, not DS Tier-2). Rename the file, the exported component, the `ReasoningBlockProps` type, the stories, and update every importer. Verified call sites (2026-04-28): `packages/web/src/components/ReasoningBlock.tsx`, `packages/web/src/components/ReasoningBlock.stories.tsx`, `packages/web/e2e/keyboard-nav.spec.ts:78`, `packages/web/e2e/conversations.spec.ts:25`, plus any `packages/web/src/**` consumer. No `.test.tsx` file exists for this component at plan time. The rename is mechanical: `ReasoningBlock` → `ReasoningBlockView` everywhere. The L2-name-conflict guard (concept § 7) becomes truthful only after this rename. **Do not skip; do not defer.** | `packages/web/src/components/ReasoningBlockView.tsx` (renamed from `ReasoningBlock.tsx`), `ReasoningBlockView.stories.tsx`, importers in `packages/web/src/`, e2e specs. | (1) `packages/web/src/__tests__/reasoning-block-view-name.test.ts` asserts `ReasoningBlockView` is exported and `ReasoningBlock` is NOT; (2) existing tests at `packages/web/e2e/keyboard-nav.spec.ts:78` and `packages/web/e2e/conversations.spec.ts:25` updated to reference the new name; (3) `bun run check` + `bun run lint` clean. | — |

L2b task count: **15** (T15-T29). **Total: 30** including T14a as a write-tests preflight (which is a test extension, not a new task slot — it does not consume budget); strict task count = **29** under the 30-task ceiling.

---

## 7. Risks & ambiguities

1. **Parser-version negotiation across processes.** Concept § 10 anticipates this. The plan ships `PARSER_VERSION = 'blk-parser:v1'` as a constant; if server and client ever drift, the `body_sha` cache invalidates automatically and re-derivation produces a deterministic id under the new parser version. **Risk:** the `parser_version` does not yet participate in the BlockId hash (only the `blk:v1` content-shape version does). If the parser implementation changes such that `normalised()` output drifts but the version tag does not bump, ids will silently drift. **Mitigation:** the round-trip + id-stability test suites freeze the algorithm. Bumping `PARSER_VERSION` requires bumping `BLOCK_ID_VERSION` per § 4.6 of this plan.
2. **Cache placement.** Plan defers any persistent cache. Server-side derivation runs per-request; client-side runs per-render. React Query (already present) covers the client; an in-memory `LRUCache<bodySha, BlockDerivationResult>` keyed by `(bodySha, PARSER_VERSION)` may be added at the server edge in a follow-up if a hot path emerges. L2 ships zero `block_cache` table.
3. **L1 attachment-vocabulary coordination.** BLOCKS.md § 4 says L2 carries the registered claim that L1's closed enum gains a seventh `block` kind. The L1 concept doc does not yet exist in `docs/concept/`. **Mitigation:** SHARED.md § "Block primitive (L2)" already locks the host enum at line 86-87; the `BlockHostKind` const becomes the authoritative source until L1 lands. When L1's concept doc is drafted, its closed attachment-vocabulary MUST include `block`. Flagged in § 8 open question (i).
4. **Visual-regression baseline ownership.** The K2 / K8 retros (per the brief's Phase 1 reconciliation note) say baselines regenerate only on the story that ships the new HTML. L2 ships three new HTML files → L2 owns the new baseline images. The existing 14-component baseline must remain unchanged. **Risk:** any drive-by edit during L2b that touches existing components silently regenerates their baselines. **Mitigation:** the L2b PR diff is asserted to touch only the new HTML files + the test config arrays.
5. **`html` BlockKind sanitiser scope.** Approved.md § "Open questions" #8: the allowlist must permit `<details>`, `<summary>`, `<kbd>`, `<sub>`, `<sup>`. **Mitigation:** L2 does not pin the allowlist — the host injects `sanitizeHtml`. Whichever story (L23) first wires the HTML rendering on KnowledgeDetail will pin DOMPurify's `ADD_TAGS` config for those entities. Documented in `@lore` on `Block.tsx`'s `sanitizeHtml` prop.

---

## 8. Open questions (parked for human / architect review)

1. **L1 attachment-enum coordination.** When the L1 concept doc (currently absent from `docs/concept/`) is drafted, who confirms that `block` is the seventh entry? Plan recommends: the L1 concept-doc author treats SHARED.md's Block primitive entry as binding and copies the host enum.
2. **`improvements-work.md` / `improvements-knowledge.md` cross-link AC.** AC-3 is N/A if these files don't exist in repo. If they do, plan ensures the substring `L2` lands. (Confirmed at write-tests time.)
3. **Front-matter exposure to readers.** Approved.md § "Open questions" #12: do KnowledgeDetail / WorkBet show metadata as a chip in the body header? L2 leaves the data sibling-available; L23 / L16 designers decide the surface chrome.

---

## 9. Route checklist

**Not applicable for L2; no new server routes are introduced.**

Reasoning: BLOCKS.md § 9 names the consumer surfaces (WorkBet, KnowledgeDetail) and § 10 fixes derivation as a *read-side* concern that runs in-process on both server and client. The thread-count batched query is L26's concern (concept § 4 — blocks know nothing about threads). Permalinks are URL fragments per approved.md § "Rejected list" #6. AC-43 makes the no-route claim auditable.

---

## 10. Security & abuse cases

| Vector | Status | Mitigation | AC |
|---|---|---|---|
| Input-trust boundary (agent-authored markdown) | **Applicable + addressed.** | `html` BlockKind is sanitised via host-injected `sanitizeHtml` callback; falls through to `UnknownPayload` if absent. The DS package never imports DOMPurify directly. | AC-49 |
| Path traversal | **N/A.** No path inputs. Bodies are strings; `host.id` is opaque to derivation. | — | — |
| SSRF | **Applicable + addressed.** `image` BlockKind URLs are rendered as `<img src=...>` only; derivation never fetches them server-side. The pure-function contract (AC-6) makes this structurally true. | AC-50 makes it explicit. | AC-50 |
| Rate limit | **N/A.** No new endpoints (§ 9). | — | — |
| Secret handling | **N/A.** No credentials introduced. | — | — |
| Resource exhaustion | **Applicable + addressed.** Bodies > `MAX_BODY_BYTES` (256 KB) bypass the parser and emit a single `unknown` block. | Cap at the derivation entry point. | AC-51 |
| Algorithm-collision integrity | **Applicable + addressed.** Concept § 8.4 acknowledges 128-bit collisions are a CRITICAL signal. A debug-only `assertNoCollisions(blocks)` helper logs CRITICAL when two blocks of the same body share an id. Real collisions trigger a `BLOCK_ID_VERSION` bump. | `parser_version` rides alongside the version tag. | AC-52 |
| HTML-injection through `unknown` raw-source preview | **Applicable + addressed.** `UnknownPayload` renders raw source in `<pre><code>` (text content, not `dangerouslySetInnerHTML`). | Standard React text-escape. | AC-29 (`UnknownPayload` semantic test). |
| Slug-sentinel collision | **Considered + addressed.** `<root>` and `<empty>` sentinels would collide with literal heading text if the slug function did not strip angle brackets. The slug spec (concept § 8.4 step 3) strips punctuation including `<` and `>`, so neither sentinel can be the output of `slug()` on real input. | Test asserts a heading literally titled `<root>` does not collide. | AC-24. |

---

## 11. ProtectedTests

These tests must remain green throughout L2 implementation. Their assertions must not change:

```
packages/web/src/__tests__/WorkBet.detail.test.tsx
packages/web/src/__tests__/WorkBet.test.tsx
packages/web/src/__tests__/WorkBet.j8.test.tsx
packages/web/src/__tests__/KnowledgeDetail.test.tsx
packages/web/src/__tests__/KnowledgeDetail.metadata.test.tsx
packages/web/src/__tests__/KnowledgeDetail.edit.test.tsx
packages/web/src/__tests__/KnowledgeDetail.factory.test.tsx
packages/web/src/__tests__/KnowledgeDetail.related.test.tsx
packages/web/e2e/knowledge-detail.spec.ts
packages/design-system/src/__tests__/visual-regression.test.ts (assertions on existing 14 components — only the COMPONENTS array extension is permitted)
packages/design-system/src/__tests__/html-components.test.ts (assertions on existing 14 components — only the EXPECTED_COMPONENTS array extension is permitted)
packages/design-system/src/__tests__/ds-attrs.test.ts
packages/design-system/src/__tests__/density-tier.test.ts
packages/design-system/src/__tests__/tokens.test.ts
packages/design-system/src/__tests__/themes.test.ts
```

DoD audit method: `git diff --name-only main..HEAD` against the protected set; the test bodies of pre-existing components must not change (only the array extensions in `visual-regression.test.ts` / `html-components.test.ts` are permitted). The `<pre>` `data-testid` selectors (`bet-pitch-body`, `knowledge-body`) must continue to resolve.

---

## 12. Plan score self-check

Per `/architecture-critique`'s nine dimensions (0-10 each, 7 threshold per dim, 63 total threshold):

| Dimension | Score | Rationale |
|---|---|---|
| 1. Spec alignment | 9 | Every TRACK-L L2 AC mapped to ≥ 1 verification AC; concept §§ 1-14 contracts are all addressed; approved.md states + rejected list both audited; lowercase `data-ds-component` casing fixed (C1). |
| 2. Layer integrity | 9 | Pure derivation in `@hyperidle/shared` (browser-safe); DS components in `packages/design-system`; zero new endpoints; zero new tables. No layer reaches past its neighbour. |
| 3. Contracts | 10 | Type signatures concrete; `BlockHostKind` enum closed; `BlockKind` closed-with-`unknown` sentinel; the `blockId` algorithm is byte-pinned; `sanitizeHtml` is host-injected; **`BlockProps` discriminator now load-bearing on `payload.kind`** (no redundant `kind` prop, C2 fix); image-URL allowlist is part of the derivation contract (M4); golden-ids snapshot enforces version co-bump (M5). |
| 4. Data model | 8 | Zero schema change. `Block` shape is the cross-cutting type. Body-metadata sibling field is honoured. **`MAX_BODY_BYTES` = 256 KB now has a concrete fixture-derived rationale and a revisit trigger (M6).** (–1: any future cache table is parked, not designed.) |
| 5. Naming | 10 | `Block` (cap-B content primitive) is rigorously distinct from `block`/`blocked`/`blocking` workflow words. **`ReasoningBlockView` rename is now a discrete L2b task (T29) with verified call sites and a name-conflict guard test (M1).** `*Payload` suffix isolates internal renderers. Lowercase DS component name strings match approved.md. |
| 6. Depth | 9 | 29 tasks (under the 30 ceiling), every one with file path + verifying test + dependency. Three nontrivial design-it-twice picks (BlockId primitive, slot-prop typing, sanitiser injection). T7.5 (golden-ids snapshot) and T14a (cross-link preflight) are concrete, scheduled steps not afterthoughts. |
| 7. Failure-mode coverage | 9 | Unknown-safety, oversize body, sanitiser-stripped HTML (with explicit unknown fallback, M3), collision detection, browser-safety, line-ending normalisation, **image URL scheme allowlist at derivation time (M4)**, **heading-rename cascade invalidation explicit (M2)**. (–1: parser-version negotiation across processes is identified but the ergonomic invalidation flow is still TBD beyond the snapshot enforcement.) |
| 8. Simplicity | 8 | One function, three components, ten internal renderers, no new tables, no new routes, no new tokens. (–2: the per-kind payload normaliser branches add genuine complexity per concept § 8.4 — paid intentionally.) |
| 9. Verifiability | 10 | 56 ACs (was 52: +AC-15a, +AC-27a, +AC-27b, +AC-49a), each with a concrete file + assertion. **Golden-ids snapshot is the convention's enforcement mechanism (M5).** Cross-link AC has a concrete grep + deferred-task fallback (C3). Visual-regression + Playwright + Vitest + jsdom-import test together cover surface, semantics, and module-graph safety. |

**Total: 82 / 90.** Average **9.1 / 9 → PASS** (above the 7.0 average threshold).

### 12.1 Architecture-critique fix audit (CC-007 prevention)

| Finding | Status | Evidence in plan |
|---|---|---|
| C1 — `data-ds-component` casing mismatch | Fixed | § 2 reconciliation row + AC-32 enforce lowercase; negative assertion bans PascalCase. |
| C2 — `BlockProps` discriminator not enforced | Fixed | § 4.5 `BlockProps` drops redundant `kind`; `payload.kind` is the discriminator. |
| C3 — AC-3 cross-link AC silently disarmed | Fixed | AC-3 is now concrete with a write-tests-time grep against `docs/reviews/improvements-{work,knowledge}.md`; deferred-AC fallback named **T-CROSSLINK** if the cross-references are missing. T14a tracks the preflight. |
| M1 — `ReasoningBlockView` rename surface | Fixed | T29 renames `packages/web/src/components/ReasoningBlock.{tsx,stories.tsx}` (no `.test.tsx` exists at plan time, verified) and updates importers including the e2e specs at `keyboard-nav.spec.ts:78` and `conversations.spec.ts:25`; new name-conflict guard test at `packages/web/src/__tests__/reasoning-block-view-name.test.ts`. |
| M2 — Heading-rename cascade-invalidation AC | Fixed | AC-27a with the concrete fixture (`## Approach` → `## Strategy` cascading to `### Step 1`). |
| M3 — Sanitiser-strip fallback path AC | Fixed | AC-49a: empty-string sanitiser returns unknown shell with `reason: 'sanitiser-stripped'`. |
| M4 — Image URL scheme validation | Fixed | AC-15a + § 4.2 pipeline note: `IMAGE_URL_SAFE_SCHEMES` allowlist gates at derivation time; hostile schemes route to `unknown`. |
| M5 — `PARSER_VERSION` enforcement via golden-ids snapshot | Fixed | T7.5 + AC-27b: `golden-ids.json` snapshot with version-bump CI guard. |
| M6 — `MAX_BODY_BYTES` justification | Fixed | § 4.1.1 fixture-derived rationale (4 × 64 KB worst-case → 256 KB power-of-two) with an explicit revisit trigger. |

---

## 12.2 DoD verdict (post-implementation, attempt 1)

`/check-definition-of-done` ran on 2026-04-28 after `/apply-review` resolved the 6-perspective review findings. Verdict: **PASS-WITH-FOLLOWUP**.

Every AC has a test or an explicit deferral. Tests: 2817/2817 pass (was 2625 baseline). 0 type errors, 0 lint errors. ProtectedTests untouched outside the named extension points (`COMPONENTS` array in `visual-regression.test.ts` extended with the three L2 components per § 11).

Eight follow-up items must land in subsequent stories. Two are **hard prerequisites** for L16 / L23 consumption.

| ID | Item | Source | Verdict | Track in |
|---|---|---|---|---|
| **L2-FU-1** | Wire `@floating-ui/react` (`useFloating({ placement: 'right-start', middleware: [flip(), shift({ padding: 8 })] })`) on `BlockActionsPopover`. AC-31 spec-binding. | architecture-review C11; design-review CRITICAL | **HARD prereq for L16/L23** | Follow-up story before L16 / L23 |
| **L2-FU-2** | Mobile (≤640px) adaptation per approved.md: handle always-visible at low opacity, gutter shrinks to 28px, popover renders as bottom sheet, touch target ≥ 44px. AC-37 has no test today. | design-review M5 | **HARD prereq for L23 mobile** | Follow-up story before L23 |
| **L2-FU-3** | Update `BLOCKS.md` § 6 + § 10 to remove `BodyMetadata` references (frontmatter pipeline removed in apply-review M2 because no consumer exists). Mark AC-18 obsolete in this plan. | DoD audit | Concept / impl drift | Doc-only follow-up |
| **L2-FU-4** | Replace tautological AC-27 version-tag-participation test with one that re-runs the hash with a stub `BLOCK_ID_VERSION` (test-only override) and asserts ids change. Hash-integrity contract. | adversary CRITICAL; DoD audit | Test-quality follow-up | Bundled with L2-FU-1 |
| **L2-FU-5** | Replace tautological AC-28 round-trip test with a real derive → render → assert against a `remark-html` (or equivalent) baseline. Lossless-render guarantee L23 relies on. | adversary CRITICAL; DoD audit | Test-quality follow-up | Bundled with L2-FU-1 |
| **L2-FU-6** | Add AC-38 reduced-motion vitest test (computed-style assertion). | DoD audit | Test-quality follow-up | Bundled with L2-FU-2 |
| **L2-FU-7** | Strengthen AC-42: assert "Copied" text appears in the live region after the copy invocation (today only the region's existence is asserted). | DoD audit | Test-quality follow-up | Bundled with L2-FU-1 |
| **L2-FU-8** | Capture Playwright (block-render.spec.ts) + visual-regression run output as proof-of-execution for AC-33 / AC-36. The specs exist; CI hasn't logged a run yet. | DoD audit | CI / proof-of-execution | Once CI re-baselines for K-track land |

Apply-review residuals not surfaced as DoD blockers (defensible follow-ups):
- **M1**: token replacement of hardcoded `p-[Npx]` / `text-[Npx]` literals across L2 components — design-lint warning, not error. K11 density-allowlist update bundled.
- **M6 partial**: code-block copy button + table right-edge scroll fade — story-level polish.
- **M18**: golden-ids corpus expansion — current 12 fixtures cover the algorithm corner cases per concept §8.4; richer fuzz inputs are nice-to-have.

---

## 13. Self-adversary challenge (Phase 4)

- **"Is every AC verifiable with a concrete test?"** Yes — every AC names a test file (or extends an existing one) with concrete assertions.
- **"Does the plan re-litigate any rejected-list item?"** No. AC-43 through AC-48 explicitly *guard* the rejections (no `/permalink` route; no `block_comments` table; no drag UI; no J/K shortcuts; no `--ok` dot on code pill; no `[[id]]` parsing).
- **"Does any task depend on a not-yet-existing dependency or table?"** No. All deps are public npm packages or workspace packages that already exist; the L1 enum coordination is flagged as an open question (§ 8) but does not block L2 (SHARED.md is authoritative until L1 lands).
- **"Are protected tests listed by file path?"** Yes — § 11.
- **"Does the data flow respect concept § 8.5 hard rules?"** Yes: GFM-only on disk (rule 1: deps + plan never write a dialect), pure derivation (rule 2: AC-6, AC-7), anchor as primitive's own affordance (rule 3: `BlockAnchor = { blockId }` only), threads via L1 (rule 4: no comment table — AC-44).
- **"Is the plan ≤ 30 tasks?"** Yes — 28.
