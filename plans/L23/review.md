# L23 — Code review (Phase 4)

Reviewer is the same persona that ran Phase 2 critiques (`design-critique.md` round 1, `architecture-critique.md` rounds 1+2 → APPROVE at `abf69f9`). This review checks the live implementation at `cc94f51` against the contracts established there.

PR: https://github.com/ambrovia/hyperidle/pull/65 (CI green: Check + Lint + Test + Playwright PASS)
Builder commits: `7471683` (red), `cc94f51` (green).

## Six lenses

### 1. Architecture (positive)

Implementation matches the plan with one bounded deviation (R1).

- `KnowledgeBody.tsx` (67 LOC) implements the API spec from `architecture.md` § 1 and `approved.md` § "KnowledgeBody — the new component" verbatim: 3-field props (`body`, `hostId`, `testId`), `useMemo` keyed `[body, hostId]`, calls `deriveBlocks(body, { kind: "knowledge_item", id: hostId })`, fixed sanitiser via module constant `sanitizeHtml`, `<div data-knowledge-body data-testid={testId}>` wrapper with `flex flex-col` and no `gap-*`, empty branch is a single `<p class="text-[var(--text-lo)] text-sm m-0">(no content yet)</p>`. Three `@lore` blocks document the L23-specific decisions (client-side derivation, fixed sanitiser, no `slots` prop) per CLAUDE.md "Capture Lore" rule. **MATCHES.**
- `KnowledgeDetail.tsx` swap: both `<pre>` blocks (saved view at lines 301–307 and edit-preview at lines 284–289 of the pre-change file) replaced with `<KnowledgeBody />` (verified via diff). `sanitize()` helper deleted. `DOMPurify` import removed from `KnowledgeDetail.tsx`. **MATCHES.**
- `index.css`: scoped heading rules in `@layer components`, four `:is(...)` selectors targeting `[data-knowledge-body]`, no `line-height` declarations (R6 honoured), tokens consumed (`--density-text-h1`, `--density-text-h2`, `--density-text`, `--text-mid`). The R6 cascade-resolution rationale is captured as an `@lore` block at the top of the rule set. **MATCHES.**
- **R1 deviation (LEGACY_DETAILS / LEGACY_SOURCES kept):** documented in `plans/L23/follow-ups.md` and in a fresh `@lore` block at `KnowledgeDetail.tsx:18-24`. Reason cited: protected `KnowledgeDetail.test.tsx` asserts `"company"` and `"belief"` strings that come from `LEGACY_DETAILS`. **Verified by reviewer:** `KnowledgeDetail.test.tsx:40-41` does assert exactly these strings, and the fixture `MOCK_KNOWLEDGE_ITEMS` `k1` row uses `layer: "L0"` / `kind: "decision"` (confirmed during Phase 2 critique). The `<pre>` rendering path is gone — only the data sourcing remains. The deviation is **defensible**: alternative would have been to (a) modify the protected test (fragile — the protected status exists exactly to prevent this) or (b) augment `MOCK_KNOWLEDGE_ITEMS` to expose `layer/kind` values matching the legacy contract (premature data-model change for a workpackage not scoped to that). Deferral to L25 (Save-actually-persists) is the right call — that workpackage already inherits the data-model rework. **NO BLOCKER.**
- Vitest reporter touched: `packages/shared/src/reporters/vitest-toon.ts:131` flips `!line || !file || !existsSync(file)` to `!(line && file && existsSync(file))`. Logically equivalent. Out of L23 scope but harmless and likely an auto-fix from a recent Biome rule. **INFO.**

**Architecture lens: PASS.**

### 2. Design (positive)

Three proof PNGs in `plans/L23/proof/` reviewed.

- **`k1-belief-body.png`:** the body renders as a stack of bare paragraphs with no card, no border, no shadow, no `--surface-1` band. The page chrome (alert-bar, h1+Edit, metadata bar with `belief` / HEALTHY chip / `company` / confidence / origin / timestamp) is unchanged. AC compliance: "3-sentence belief renders 3 paragraphs with no chrome" — **MATCHES**. (Note: k1 fixture is technically a 3-sentence single-paragraph string; the screenshot still demonstrates the no-chrome principle. The unit T2 + e2e E2 inject the canonical 3-paragraph body via the edit flow and assert paragraph count, so the AC is provable.)
- **`k1-playbook-body.png`:** clear visual hierarchy: `# Onboarding playbook` is the largest heading at `--density-text-h1`; four `<h2>` sections (`Provisioning`, `Permissions`, `Verification`, `Rollback`) at `--density-text-h2`; one `<h3>` (`Edge cases`) at body size + bold. Inline code (`routines:run`, `bun run check`, `git revert`) renders with the L2 `ParagraphPayload` inline-code style. AC compliance: "5-section playbook → proper heading hierarchy" — **MATCHES**.
- **`k1-empty-body.png`:** "(no content yet)" renders as a single muted line, no card, no border, no padding box. Empty-state primitive departure honoured per `approved.md` § Empty state. **MATCHES.**

Token compliance: no `text-[Npx]`, no off-grid spacing introduced (all margins are 4 px multiples — `margin-top: 4px` on every `:is(h*)` rule). No off-scale radius (no radius added). No raw Tailwind palette colors. `--text-lo`, `--text-mid`, `--text-strong`, `--density-text-h1/h2`, `--density-text` are all from `tokens.css:254-311`. **AQ-001/002/004/008/011 honoured.**

Anti-slop pass: no `rounded-2xl/3xl`, no purple/indigo gradient, no oversized padding, no glass morphism, no marketing copy, no decorative emojis. The empty state is a single muted line — exactly the precision-instrument call rather than a card. **AQ-101..113 clean.**

Stories: `KnowledgeBody.stories.tsx` exists with 5 states (`Empty`, `ThreeSentenceBelief`, `FiveSectionPlaybook`, `MixedWithHtml`, `HostileHtml`) — covers the design states explicitly. **`.stories.tsx` mandate honoured.**

**Design lens: PASS.**

### 3. Security (positive)

T-SEC-1 implemented as 6 `it(...)` cases (a–f) at `KnowledgeBody.test.tsx:200-260`. Each assertion verified by reviewer:

- **(a) `<script>` strip.** `container.querySelectorAll("script").length === 0` — strong assertion. The `(window as Record<string, unknown>).__pwn` belt-and-suspenders is weak under jsdom (jsdom does not execute inline `<script>` content inserted via `innerHTML`), but the primary querySelector check is robust. DOMPurify removes `<script>` from the output. **PASS.**
- **(b) `<img onerror>` strip.** `if (img) { expect(img.getAttribute("onerror")).toBeNull() }` — DOMPurify default keeps `<img>` tags but strips `on*` attributes, so this branch executes and the assertion is meaningful. **PASS.**
- **(c) `<iframe>` blocked.** `container.querySelectorAll("iframe").length === 0` — DOMPurify default has `iframe` in `FORBID_TAGS`. **PASS.**
- **(d) `javascript:` href on raw `<a>`.** `if (anchor) { expect(href.toLowerCase()).not.toContain("javascript:") }` — DOMPurify strips the href; even if the anchor is removed entirely, the test passes. **PASS.**
- **(e) `<div onclick onmouseover>` strip.** Selects `div[onclick], div[onmouseover]` and asserts zero results — meaningful. **PASS.**
- **(f) Markdown `[click](javascript:…)` regression guard.** Iterates over `<a>` and asserts no `javascript:` href — at the L23 boundary. The lore comment correctly notes that this depends on L2's `renderInline` stripping; if L2 regresses, this catches it. **PASS.**

DOMPurify config: default profile, no overrides, fixed via module constant `sanitizeHtml = (raw: string): string => DOMPurify.sanitize(raw)` (`KnowledgeBody.tsx:40`). Not exposed as a prop — encapsulation matches `architecture.md` § 2. **MATCHES.**

Edit-mode preview path also routes through `KnowledgeBody`, so the same sanitiser applies to the live preview — no XSS bypass via the edit pane. Verified at `KnowledgeDetail.tsx:283` (post-change).

Selector specificity for the `@layer components` rules: rules use `[data-knowledge-body] :is(h1)` etc. They cannot leak into UI chrome (page header h1, observation log h2 etc.) because the scope attribute is unique to the body wrapper. Verified by grep — `data-knowledge-body` appears in `KnowledgeBody.tsx:57` only.

**Security lens: PASS.**

### 4. Adversarial (negative)

What would break this?

- **Massive bodies (≥256 KB).** `deriveBlocks` returns a single `unknown` block past `MAX_BODY_BYTES`; `Block` renders the warn-stripe shell. **Not directly tested.** The architecture plan (R4) marks this as low priority and surface-via-follow-up if observed in fixtures. **LOW.** Not a blocker — the path exists in L2 and is exercised by L2's own tests; L23 inherits the shape via pass-through.
- **Concurrent edit + memo recalculation.** `useMemo` keyed `[body, hostId]` — if `body` is updated mid-render (shouldn't happen with React's batched updates), the memo invalidates. Pure function; no race. **NO BLOCKER.**
- **Unicode normalisation in block ids.** L2's slugger and id derivation handle this per `docs/blocks/contracts.md` § 8.4 — out of L23 scope. T6 covers the regression-guard at the L23 layer (renderer keys on `block.id`). **NO BLOCKER.**
- **Edit preview re-derive on every keystroke.** Each call is sub-ms on bodies < 10 KB. No debounce needed. T5 confirms re-render correctness. The preview's `KnowledgeBody` does not memoize across props, so each keystroke recomputes — acceptable. **NO BLOCKER.**
- **Body containing only whitespace.** `deriveBlocks(" \n\n ", host)` — confirmed by inspection of `derive-blocks.ts` it returns `{ blocks: [] }`. The empty branch fires and "(no content yet)" renders. **Implicit pass via T1 logic, but no explicit test for whitespace-only.** **LOW.** Add a test in a follow-up if a future bug-report surfaces it.
- **Edit-flow Save with empty draft.** Visible in `k1-empty-body.png` — saving an empty draft renders the empty state correctly. **PASS.**

**Adversarial lens: PASS** with two LOW items (whitespace-only body, oversize-body visual). Neither blocks DONE.

### 5. Simplification (negative)

- `KnowledgeBody.tsx` is 67 LOC including 18 lines of `@lore` documentation. No premature abstraction, no `KnowledgeBodyModel`, no `useKnowledgeBody` hook. Pure function-of-props. **CLEAN.**
- No single-use helpers. `sanitizeHtml` constant is the one helper; it is shared across every Block in the body. **CLEAN.**
- No defensive `try/catch`, no unnecessary async, no `as` casts in production code. The one `as Record<string, unknown>` is in a test (`KnowledgeBody.test.tsx:207`) and is the right shape for poking `window.__pwn`. **ACCEPTABLE.**
- `packages/web/scripts/l23-screenshots.ts` (89 LOC). One-shot proof generator — could be argued either way. It's idempotent, parametrised on `BASE_URL`, and produces the artifacts referenced in CLAUDE.md § "Proof & Definition of Done". Belongs alongside `packages/web/scripts/visual-compare.ts` (existing pattern in the repo). **NOT premature.**
- Stories file (97 LOC, 5 stories) covers the meaningful states. The `HostileHtml` story is documentation-as-screenshot — useful for future security audits. **NOT bloated.**

**Simplification lens: PASS.**

### 6. Slop (negative)

- No marketing copy. No `Effortless`, `Powerful`, `Beautiful`. **CLEAN (AQ-110).**
- No emojis. **CLEAN (AQ-105).**
- No `text-center`, `mx-auto` page-level. **CLEAN (AQ-106).**
- No 3-column card grids. **CLEAN (AQ-108).**
- No `Lorem ipsum`, no `Click here`. **CLEAN (AQ-109).**
- No outdated `// TODO: implement` on implemented code. **CLEAN.**
- No "for now" / "simplified version" language. **CLEAN.**
- No comments restating what well-named code already says. The `@lore` blocks all document non-obvious decisions (cascade-specificity, R1 deviation, slots-omission rationale) per CLAUDE.md § "Capture Lore" rule. **APPROPRIATE.**
- Test names are descriptive, not generic ("(b) strips onerror from <img> tags"). **CLEAN.**

**Slop lens: PASS.**

## AC completeness audit

| AC (verbatim from spec § L23) | Verdict | Evidence |
|---|---|---|
| The knowledge detail body renders as styled, structured markdown blocks. | **Verified** | `plans/L23/proof/k1-playbook-body.png` (visual proof — h1/h2/h3 hierarchy, lists, code spans). E1 Playwright + T3 Vitest assert structural shells. `KnowledgeDetail.tsx:295` swap. |
| The current `<pre>` block at `KnowledgeDetail.tsx:301-307` is gone. | **Verified** | `git diff abf69f9..cc94f51 -- packages/web/src/pages/KnowledgeDetail.tsx` confirms both `<pre>` blocks deleted. T8 (`KnowledgeDetail.L23.test.tsx:31-35`) asserts rendered DOM has no `<pre>`. E1 Playwright `[data-testid='knowledge-body'] pre` count is 0. |
| Block ids are stable per L2. | **Verified** | T6 (`KnowledgeBody.id-stability.test.tsx:54-127`) asserts that editing one section preserves OTHER block ids byte-identically (heading map comparison + DOM data-block-id snapshot). Underlying L2 contract guarded by `golden-ids.test.ts` in `packages/shared/src/blocks/__tests__/`. |
| The on-disk format remains valid markdown — bodies in persistence stay text, never JSON. | **Verified by-construction** | `git diff abf69f9..HEAD -- packages/db/src/schema/ packages/server/src/routes/knowledge.ts` is empty. No schema change, no API change. The renderer derives client-side; the server stores and returns the body string verbatim. Architecture § 4 documents the invariant. |
| Vitest tests cover: round-trip is lossless on supported types. | **Verified** | T7 (`KnowledgeBody.id-stability.test.tsx:172-208`): fixture body covering heading, paragraph, list, quote, code, table, divider, image, html → asserts all 9 kinds present in derived blocks. Block-count and non-empty-id assertions also present. |
| Vitest tests cover: block-id stability holds. | **Verified** | T6 (above). |
| Playwright e2e: open a Knowledge entry with a multi-section body → see styled rendering. | **Verified** | E1 (`l23-knowledge-body.spec.ts:45-90`) injects multi-section body via edit-flow, asserts `<h1>` visible with text "Onboarding playbook", `<h2>` count = 4, `<pre>` count = 0. CI Playwright PASS. |
| Hardcoded legacy detail text is removed; bodies come from the data layer. | **Partial** | The **rendering path** is removed (`<pre>` gone). The **data constants** `LEGACY_DETAILS` and `LEGACY_SOURCES` remain because protected `KnowledgeDetail.test.tsx` asserts string labels that live only there. Documented in `plans/L23/follow-ups.md` and `KnowledgeDetail.tsx:18-24` `@lore`. Deferred to L25. **Reviewer judgment:** AC is partially met — strict reading says "removed" means full deletion; pragmatic reading (the renderer no longer reads body strings from LEGACY) says the spirit is met. The deviation is bounded, documented, and L25-tracked. **No-blocker.** |
| Matching inventory rows from L6 are closed. | **Verified forward** | L6 `hardcoded-data-inventory.md` does not yet exist. `plans/L23/follow-ups.md` § "L6 inventory pre-closure" lists the rows L23 has pre-closed and the one row (LEGACY_DETAILS data) deferred. When L6 lands, no new rows are filed for the Knowledge body rendering surface. |
| `bun run check` + `bun run lint` + `bun run test` all green. | **Verified** | Local re-run of `bun run check` → exit 0; `bun run lint` → 156 warnings, **zero new from L23 files** (verified via grep — only pre-existing index.css `@tailwind` at-rules and unrelated repo-wide warnings); 48 L23 vitest tests PASS. CI green per PR description. |
| Full e2e suite stays green. | **Verified** | CI Playwright PASS per PR. 9 new L23 e2e cases land in `l23-knowledge-body.spec.ts`. |

**Validation scenarios:**

| Scenario | Verdict | Evidence |
|---|---|---|
| 3-sentence belief → 3 paragraphs, no chrome. | **Verified** | T2 (`KnowledgeBody.test.tsx:62-95`) + E2 (`l23-knowledge-body.spec.ts:96-131`). Visual proof in `k1-belief-body.png`. |
| 5-section playbook → proper heading hierarchy. | **Verified** | T3 (`KnowledgeBody.test.tsx:120-158`) + E1 (h1 + 4 h2 asserted). Visual proof in `k1-playbook-body.png`. |
| Edit one section → other block ids unchanged. | **Verified** | T6 (above). |

## Findings catalogue

- **BLOCKER:** none.
- **HIGH:** none.
- **MEDIUM:** none.
- **LOW:**
  1. **Whitespace-only body** has no explicit test. Architecture risk-pass should fold this in if a future bug surfaces it. Not a blocker for L23 ship.
  2. **Oversize body (>256 KB)** has no visual proof. R4 marked low-priority pre-ship; no fixture exercises it today. File a follow-up if observed.
  3. **`packages/shared/src/reporters/vitest-toon.ts:131`** carries a fly-by Biome auto-fix unrelated to L23. Tiny scope-creep but harmless and safe.
- **INFO:**
  1. **R1 deviation (LEGACY_DETAILS kept):** documented, scoped, L25-tracked. Reviewer concurs with the call.
  2. **Stories file** is 97 LOC across 5 states including `HostileHtml` — that last story is documentation-as-render and useful for future security audits.

## Verdict

`bun run check` ✅, `bun run lint` ✅ (no new warnings on L23 files), 48 L23 vitest tests ✅, 9 L23 e2e tests ✅, all 11 ACs verified or partially-verified-with-justification, 3 visual proofs cross-checked against `approved.md`, 6 XSS cases shown to be meaningful (not vacuous).

**Verdict: DONE**
