# AI1 — Every styling token resolves — Architecture Plan

**Workpackage:** AI1 (Track AI — Style Consolidation). Complexity M (~6h).
**Branch:** `feat/AI1-token-resolution`.
**Scope:** Resolve ~30 dangling `var(--…)` references to existing tokens (restore intended rendering) + add a static gate that fails the build when any referenced custom property is undefined. **No new tokens** (AI6's scope). **No restyling** beyond what the dead token was meant to do.

---

## Required reading (engineer reads before implementing)

- `packages/design-system/src/tokens.css` — the single token source; the gate's allowlist is derived from here.
- `packages/design-system/src/body-editor.css`, `packages/web/src/index.css` — the two shipped CSS files with dead tokens.
- `packages/eslint-plugin-design/src/util.ts` (`collectClassStringsFromExpression`) and `src/rules/no-hardcoded-color.ts` — the AST-walk patterns; the gate reuses the *concept* (Tailwind arbitrary value + template + cn()) but is a standalone script, not an eslint rule (see Gate decision).
- `scripts/nimmly-guard.ts` — the canonical standalone-guard template (file walker, `checkContent` export for unit testing, `--check` CI mode, `verify` wiring).
- `.claude/rules/aesthetic-quality.md` — AQ-008/AQ-018 (no hardcoded colors / cool grays) so replacements stay on-palette.
- `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` (lines 202-211) — the protected `--danger` test, updated in lockstep.

---

## Plan reconciliation (spec ⇆ reality)

Every spec assumption verified against the tree at file:line. Findings:

| Spec claim | Reality | Handling |
|---|---|---|
| `body-editor.css` "≈20 refs" of dead tokens | Confirmed. Dead refs: `--ui`(1), `--density-text`(3 incl. tables), `--density-text-h1`(1), `--density-text-h2`(3 incl. h3 calc), `--leading-heading`(3), `--fw-emphasis`(4), `--border-emphasis`(1), `--mono`(2), `--surface-ghost`(1), `--r1`(4), `--primary`(1), `--primary-dim`(1). Live tokens in same file (`--text-primary`, `--leading-body`, `--surface-container`, `--border-subtle`, `--border-default`, `--text-secondary`, `--text-tertiary`) are fine. | Replace each dead ref; leave live refs. |
| `TaskSheet.tsx` `--border-lo` ×6 | Confirmed at lines 180, 391, 395, 407, 426, 474 (all inside `border-[var(--border-lo)]` arbitrary values). | Replace ×6 → `--border-subtle`. |
| `index.css` `--density-text*` ×4 | **Found 5, not 4**: `--density-text-h1`(L42), `--density-text-h2`(L47), `--density-text`(L52, L57) = 4 distinct + the h4-6 block reuses `--density-text` at L57 → 4 lines, 5 occurrences if counting L52+L57 separately. The `[data-knowledge-body]` headings hardcode `font-weight:600` already. | Replace all; weights already literal, leave them. |
| `KnowledgeRow.tsx` `--mono` ×3 | Confirmed L121, L128, L137 (`font-[var(--mono)]`). | Replace ×3 → `--font-mono`. |
| `ThreadSections.tsx` `--danger` ×3 | Confirmed L350 (`text-[var(--danger)]`), L362 (color-mix bg), L363 (`borderLeft 3px solid var(--danger)`). L356-358 carry a `@lore U9` comment claiming protected tests forbid migration. | **Migrate anyway** — see Protected tests. The U9 comment is stale; resolving to a *defined* token is the AC. Update lore + test in lockstep. |
| `CurationSuggestionCard.tsx` `--border-emphasis`, `--primary-dim` | Confirmed L28 (`border-[var(--border-emphasis)] bg-[var(--primary-dim)]`). | Replace → `--border-strong`, `--accent-primary-dim`. |
| `AgentProfile.tsx` `--surface-base` | Confirmed L246 (`bg-[var(--surface-base)]`). | Replace → `--surface-page`. |
| `CredentialsTab.tsx` `--border` | Confirmed L145 (`border-[var(--border)]`). | Replace → `--border-default`. |
| `SettingsAssistant.tsx` `--color-error`, `--color-success`, **`--surface-2`** | Confirmed L158 (`style={{ color: "var(--color-error, red)" }}`), L164 (`var(--color-success, green)`), **L150 (`backgroundColor: "var(--surface-2)"` on the persona textarea)**. Note the **literal `red`/`green` fallbacks** — these are what render today; `--surface-2` has no fallback (textarea fills with nothing → degraded). | Replace → `var(--status-error)`, `var(--status-success)`, **`var(--surface-container)`**, drop the literal fallbacks. |
| `SettingsAppearance.tsx` `--bg-canvas` (comment-only) | Confirmed L37 — appears **only inside the `@lore W3` doc comment** (`var(--bg-canvas)` as illustrative prose), no live reference. | **No mapping.** The gate strips comments before scanning (see Gate spec step 2) → never flagged. Comment left intact. |

**Discrepancies surfaced:**
1. `index.css` count is 4 lines (spec "×4" correct by lines; 5 by occurrences). Immaterial — all replaced.
2. The U9 lore comment in `ThreadSections.tsx` asserts the protected test *blocks* migration. The test asserts the literal string `var(--danger)`. The AC explicitly requires resolving `--danger` to a defined token **with the test updated in lockstep**. The lore is therefore superseded by AI1; the plan updates both.
3. **All 19 live dead tokens confirmed undefined** in both `tokens.css` and `index.css` (`:root` blocks) — no hidden definition anywhere. The gate will not false-negative on any of them.

### Full scan-scope sweep (every dead token in the gate's domain — not just spec-named)

The first draft only checked the spec-named offenders for false-negatives ("is this hidden-defined?"). The gate enforces the inverse — *every* `var(--…)` in scan scope must resolve — so this revision sweeps the entire scan scope and reconciles every hit.

**Method (reproducible):** the gate's exact scan globs, dead set computed as `references − definitions`:
```
# 1. Reference set: every var(--name) in scan scope (tests/stories/spec EXCLUDED — the gate excludes them)
find packages/design-system/src packages/web/src \
  \( -name '*.css' -o -name '*.ts' -o -name '*.tsx' \) \
  ! -name '*.stories.tsx' ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '*.spec.ts' \
  -not -path '*/__tests__/*' \
  | xargs grep -hoE 'var\(\s*--[a-zA-Z0-9_-]+' | grep -oE '\-\-[a-zA-Z0-9_-]+' | sort -u  # 183 files
# 2. Definition set: --name: declarations in tokens.css
grep -oE '^\s*--[a-zA-Z0-9_-]+\s*:' packages/design-system/src/tokens.css | grep -oE '\-\-[a-zA-Z0-9_-]+' | sort -u
# 3. Dead = comm -23 references definitions
```

**Result — 20 distinct dead-token NAMES matched as text in scan scope.** Two of them are *comment-only* (the gate must not flag them — see comment handling); the live count is **19**:

| Dead token | Live sites | Comment-only sites | Disposition |
|---|---|---|---|
| `--ui` | body-editor.css:19 | — | mapped |
| `--mono` | body-editor.css:91,113; KnowledgeRow.tsx:121,128,137 | — | mapped |
| `--density-text` | body-editor.css:20,134; index.css:52,57 | body-editor.css:8 (@lore T1) | mapped; comment stripped |
| `--density-text-h1` | body-editor.css:27; index.css:42 | — | mapped |
| `--density-text-h2` | body-editor.css:36,46; index.css:47 | body-editor.css:7 (@lore T1) | mapped; comment stripped |
| `--leading-heading` | body-editor.css:28,37,47 | — | mapped |
| `--fw-emphasis` | body-editor.css:29,38,171 | — | mapped |
| `--border-emphasis` | body-editor.css:83; CurationSuggestionCard.tsx:28 | — | mapped |
| `--surface-ghost` | body-editor.css:93 | — | mapped |
| `--r1` | body-editor.css:95,103,159 | — | mapped |
| `--primary` | body-editor.css:165; extensions.ts:44 | — | mapped |
| `--primary-dim` | body-editor.css:191; CurationSuggestionCard.tsx:28 | — | mapped |
| `--border-lo` | TaskSheet.tsx:180,391,395,407,426,474 | — | mapped |
| `--surface-base` | AgentProfile.tsx:246 | — | mapped |
| `--border` (bare) | CredentialsTab.tsx:145 | — | mapped |
| `--danger` | ThreadSections.tsx:350,362,363 | ThreadSections.tsx:358 (`//` comment) | mapped; comment stripped |
| `--color-error` | SettingsAssistant.tsx:158 | — | mapped |
| `--color-success` | SettingsAssistant.tsx:164 | — | mapped |
| **`--surface-2`** | **SettingsAssistant.tsx:150** | — | **NEWLY FOUND — mapped → `--surface-container`** |
| **`--bg-canvas`** | — | **SettingsAppearance.tsx:37 (@lore W3)** | **NEWLY FOUND — comment-only, stripped, no mapping** |

**Reconciliation:** the two newly-found tokens (`--surface-2`, `--bg-canvas`) are exactly the gap the first draft missed by only checking spec-named tokens. `--surface-2` is a live reference and MUST be mapped or the gate reds on a "clean" tree (AC1/AC6). `--bg-canvas` is comment-only and is handled by comment-stripping, not a mapping. Every other dead token was already in the plan. **Live dead tokens to map: 19. Comment-only (stripped, never mapped): `--bg-canvas`, plus the three in-comment occurrences of already-mapped tokens (`--density-text`, `--density-text-h2`, `--danger`).**

**`.html` boundary (decision, not omission):** design-system reference mockups live in `packages/design-system/html/**` — *outside* the scan globs (which are `src/**`). They carry `var(--…)` but are unshipped mockups, not styling the app renders. Intentionally out of scope, same rationale as the test/story exclusion.

**Names that appeared in the raw `references − definitions` diff but are NOT in gate scope** (live only in excluded test/story files, proving the exclusion list works): `--accent`, `--accent-on`, `--density`, `--density-pad-y`, `--surface-1`, `--r2`. The gate never sees these.

---

## Gate decision (the one architecture call — design-it-twice)

The spec flags this explicitly: eslint-plugin-design rule **vs** build script. The deciding constraint is **coverage of `.css` files**.

**Option A — new eslint rule (`design/no-undefined-token`).**
Shape: a rule that parses the token allowlist from `tokens.css` at load, walks `.tsx` for `var(--x)` inside className arbitrary values / template strings / `style={{}}` / `cn()`, reports unknown names.
Trade-off: integrates with the existing plugin + test-fixture harness; same `eslint .` invocation.
**Reject:** ESLint's `eslint.config.ts` design globs are `*.{ts,tsx}` only, and ESLint cannot parse `.css` natively (no CSS processor configured; Biome handles CSS formatting but has no custom-property-resolution lint). **The two worst offenders — `body-editor.css` (12 dead tokens) and `index.css` (4) — live in `.css` files an eslint rule structurally cannot see.** A rule would catch the `.tsx` half and silently miss the CSS half — exactly the "passes but still broken" failure the AC forbids ("the gate's allowlist/exception surface is empty"). Secondarily: design rules run as `"warn"` and `eslint . --quiet` suppresses warnings, so a rule would need `"error"` severity to gate at all.

**Option B — standalone build script (`scripts/token-resolution-guard.ts`). CHOSEN.**
Shape: one script that (1) parses the defined-token set from `tokens.css`, (2) walks shipped CSS + TSX, (3) extracts every `var(--name)` reference via one regex over file text, (4) fails naming file+token for any reference not in the defined set. Wired into `verify` next to the existing guards (`nimmly-guard`, `demo-fixture-guard`) and exposed as `token-guard:check`.
Trade-off: a second lint surface outside ESLint (one more script in `verify`); does not get ESLint's AST precision (regex over text, not AST). Mitigation: `var(--…)` is unambiguous in text — the regex `/var\(\s*(--[a-zA-Z0-9-]+)/g` matches in CSS, Tailwind arbitrary values (`border-[var(--x)]`), template strings, and `style={{}}` identically, because they are all *text* containing `var(--x)`. No AST needed; the token name is the same token in every context.
**Reason to pick:** it is the only mechanism that covers `.css` + `.tsx` with one source of truth, and the repo already has three precedent guards wired exactly this way (proven pattern, `verify` integration, unit-testable `checkContent` export). Boring technology over a clever eslint rule that can't see half the surface.

**Synthesis:** none needed — Option B subsumes A's coverage. We do **not** also add an eslint rule (component-budget / surface discipline: one gate, not two).

### Gate spec (precise)

**File:** `scripts/token-resolution-guard.ts` (sibling of `nimmly-guard.ts`, same shape).

**1. Discover defined tokens.**
Read `packages/design-system/src/tokens.css`. Collect every custom-property **definition** — lines matching `/^\s*(--[a-zA-Z0-9-]+)\s*:/` (a `--name:` at declaration position). Build `defined: Set<string>`. This is the allowlist; it auto-updates when AI6 adds tokens (zero maintenance, no second list to drift). Also seed `defined` with `tokens.css` itself being the only definition source — do **not** treat references as definitions (the regex anchors on `:` after the name, which `var(--x)` references lack).
- Edge: `@property --x` at-rules and JS-set props don't exist in this repo — N/A. If introduced later, extend the definition regex.

**2. Scan referenced tokens.**
Walk shipped style/component files. Scan set (exact globs):
- `packages/design-system/src/**/*.css`
- `packages/web/src/**/*.css`
- `packages/design-system/src/**/*.{ts,tsx}`
- `packages/web/src/**/*.{ts,tsx}`
Exclude: `**/*.stories.tsx`, `**/__tests__/**`, `**/*.test.*`, `**/*.spec.*`, `node_modules`, `dist`. (Test/story files may legitimately assert on or document dead-token strings; shipped source is the gate's domain. The ThreadSections protected test is excluded for this reason — it is updated by hand in lockstep, not policed by the guard.) `.html` mockups under `packages/design-system/html/**` are outside `src/**` and therefore out of scope by glob — intentional (unshipped reference mockups, not rendered styling).

**Strip comments before reference extraction (DECIDED — see WARNING-1 resolution below).** Comments are documentation, not styling; a `@lore`/JSDoc comment that names a dead token by example (`var(--bg-canvas)`, the h3 `@lore T1` notes) must not red the gate. The scan pre-processes each file's text to blank out comments, *then* runs the reference regex. Stripping (not regex-after-the-fact filtering) is the durable fix: future `@lore` comments will reference dead tokens by name again.

Comment-stripping is per-file-type, applied to the file text before the reference regex runs:
- **`.css`** — strip block comments only: replace `/\/\*[\s\S]*?\*\//g` with an equal-length run of newlines/spaces (preserve line count so reported line numbers stay accurate). CSS has no line comments.
- **`.ts` / `.tsx`** — strip line comments `/\/\/[^\n]*/g` **and** block comments `/\/\*[\s\S]*?\*\//g`, same line-count-preserving blanking.
  - Caveat (acceptable): this is text-level stripping, not a full JS tokenizer, so a `//` or `/* */` sequence *inside a string or regex literal* would be wrongly blanked. In this repo every legitimate `var(--…)` lives in a className/style string with **no** comment delimiters inside it, so no false-negative occurs. The replacements preserve length, so even a wrongly-blanked region only removes a reference (can never invent one) — the failure mode is a missed dead token, which the mapping table + `/review` grep catch independently. A full AST strip is rejected as over-engineering for a guard whose inputs are this constrained. `@lore` this caveat in the guard.

For each (comment-stripped) file, extract every reference via `/var\(\s*(--[a-zA-Z0-9-_]+)\s*(?:,[^)]*)?\)/g`. The capture group is the token name; the optional `,[^)]*` swallows fallback values (`var(--x, red)` → token `--x`, fallback ignored — and a fallback does **not** exempt the token: `var(--color-error, red)` is still a dead `--color-error` and must fail, which is precisely the SettingsAssistant case).

**3. Report.**
For each referenced token not in `defined`: collect `{ file, line, token }`. On any miss, print one line per offense (`<relpath>:<line>  undefined token <name>`) and `process.exit(1)`. Clean → exit 0, silent (or one-line summary).
Export `checkContent(css: string): Set<string>` (defined-token extractor), `stripComments(text, lang): string` (comment blanker), and `findUndefinedReferences(text, defined): Array<{line, token}>` (reference checker) as pure functions for unit testing per CLAUDE.md (static-property ACs → guard logic tested via imports, not `readFileSync` in the test). The CLI composes them per file: pick `lang` from extension (`.css`→`"css"`, `.ts`/`.tsx`→`"ts"`), `stripComments` then `findUndefinedReferences`.

**4. Wiring.**
- `package.json` scripts: add `"token-guard:check": "npx tsx scripts/token-resolution-guard.ts --check"`.
- `verify` chain: insert after `demo-fixture-guard:check`:
  `… && npm run demo-fixture-guard:check && npm run token-guard:check && npm run build …`.
- Not added to `lint` (lint stays Biome+ESLint); it joins the guard tier in `verify`, matching nimmly/demo-fixture precedent. This satisfies "introducing an undefined token causes the verification gate to fail" — `verify` is the gate.

**Why this catches all three required contexts (AC3):** `var(--x)` is identical text in `.css` rules, `className="border-[var(--x)]"` Tailwind arbitrary values, and `` className={`text-[var(--x)]`} `` template strings. One regex over (comment-stripped) file text covers all three. Verified against the real offenders: `border-[var(--border-lo)]` (TaskSheet, arbitrary value), `font-[var(--mono)]` (KnowledgeRow), `var(--ui)` (body-editor, plain CSS), `color: "var(--color-error, red)"` and `backgroundColor: "var(--surface-2)"` (SettingsAssistant, style-object strings — one with fallback, one without).

---

## Token mapping (every dead ref → existing token)

No new tokens. Each maps to the semantically nearest **defined** token in `tokens.css`. Justification per row.

| Dead token | Sites | Replacement | Justification |
|---|---|---|---|
| `--ui` | body-editor.css ×1 | `--font-sans` | UI font family; `--font-sans` is the only sans family token (system-ui stack). |
| `--mono` | body-editor.css ×2, KnowledgeRow.tsx ×3 | `--font-mono` | The defined mono family token. |
| `--density-text` | body-editor.css ×3, index.css ×2 | `--text-base` (15px) | Body/base size; `--text-base` is the Hearth body size, matches former density-default. |
| `--density-text-h1` | body-editor.css ×1, index.css ×1 | `--text-2xl` (24px) | Largest editor/knowledge heading → top of closed type scale below page-title `--text-3xl`. Keeps headings within the closed scale (AQ-004). |
| `--density-text-h2` | body-editor.css ×3 (incl. h3 `*0.9` calc), index.css ×1 | `--text-xl` (20px) | Second heading level; h3 stays `calc(var(--text-xl)*0.9)` preserving the T1 intent (within-scale h3). |
| `--leading-heading` | body-editor.css ×3 | `--leading-tight` (1.25) | Headings want tight leading; `--leading-tight` is the tight line-height token. |
| `--fw-emphasis` | body-editor.css ×4 | `--fw-semibold` (600) | Heading/bold emphasis weight. Matches `index.css` knowledge-body headings which already hardcode `600`. |
| `--border-emphasis` | body-editor.css ×1, CurationSuggestionCard.tsx ×1 | `--border-strong` | Emphasized/blockquote/card border → the strongest defined border tone. |
| `--surface-ghost` | body-editor.css ×1 | `--surface-container` | Inline-code background = subtle raised fill → `--surface-container` (already used for `pre`/tables in the same file). |
| `--r1` | body-editor.css ×4 | `--r-subtle` (10px) | Small element radius (inline code, images, code blocks) → smallest non-zero Hearth radius. AQ-011: old `--r0/1/2/3` naming replaced by `--r-none/subtle/default/pill`. |
| `--primary` | body-editor.css ×1 (link color) | `--accent-primary` | Brand/link accent → the defined accent token. |
| `--primary-dim` | body-editor.css ×1 (selection), CurationSuggestionCard.tsx ×1 (bg) | `--accent-primary-dim` | Dim accent tint (selection / suggestion bg) → the defined dim-accent token. |
| `--border-lo` | TaskSheet.tsx ×6 | `--border-subtle` | Low-emphasis section dividers → the subtlest defined border. (Restores the invisible TaskSheet dividers — the headline bug.) |
| `--surface-base` | AgentProfile.tsx ×1 | `--surface-page` | Base page surface → defined page surface. (`--surface-base` was the old name pre-Hearth.) |
| `--border` (bare) | CredentialsTab.tsx ×1 | `--border-default` | Generic row divider → default border tone. |
| `--danger` | ThreadSections.tsx ×3 | `--status-error` | Error/danger tone → the defined error status token. Protected test updated in lockstep. |
| `--color-error` | SettingsAssistant.tsx ×1 | `--status-error` | Error feedback text → defined error status token; drop `, red` fallback. |
| `--color-success` | SettingsAssistant.tsx ×1 | `--status-success` | Success feedback text → defined success status token; drop `, green` fallback. |
| `--surface-2` | SettingsAssistant.tsx ×1 (L150, persona textarea fill) | `--surface-container` | Inset/raised textarea fill → the defined container surface (same token body-editor uses for `pre`/tables). Restores the textarea's intended background — currently fills with nothing (no fallback). |

**Count:** **19 distinct LIVE dead tokens**, ~34 reference sites, across 10 files (3 CSS + 7 TSX). All replacements are existing tokens; zero new tokens. (`--bg-canvas` is the 20th token name matched in scan scope but is comment-only — handled by comment-stripping, not mapped.)

---

## Acceptance criteria → verification method

| # | AC | Verification |
|---|---|---|
| AC1 | Zero dangling references remain | Run the new `token-guard:check` against the post-fix tree → exits 0 with empty output. (Static property → guard, not a `readFileSync` test, per CLAUDE.md.) |
| AC2 | Broken surfaces render intended styling (editor typography, TaskSheet dividers, knowledge-body headings, assistant-settings feedback) | Playwright screenshots per the track proof bar — see Validation plan. Visual diff vs pre-fix baseline. |
| AC3 | Undefined-token reference anywhere in web/design-system fails the gate, naming file+token | Unit test imports `findUndefinedReferences` + a multi-line fixture (`border-[var(--does-not-exist)]` on one line, `var(--nope)` in CSS form on another) → asserts both reported **with the correct token name AND the correct 1-based line number** (proving the `<file>:<line> <token>` contract, not just the token). Separate test imports `stripComments` → asserts `var(--dead)` inside `/* */` (css) and `// …` / `/* */` (ts) is removed so it is NOT reported, while a live `var(--dead)` on a styling line still is — directly proves the `--bg-canvas`/`@lore` false-positive is handled. Plus an integration assertion that `checkContent` parses `tokens.css` definitions. Tests the **logic**, not the filesystem. |
| AC4 | Status feedback renders in Hearth status colors, never literal `red`/`green` | Covered by AC1 (the dead `--color-error`/`--color-success` are resolved and fallbacks dropped) + AC2 screenshot of assistant-settings error/success states showing on-palette color. |
| AC5 | `--danger` resolved in coordination with protected tests — tests still pass, still assert rendered error treatment against a defined token | Update `ThreadSections.conversations.test.tsx` L210 assertion `var\(--danger\)` → `var\(--status-error\)`; run `npm run test` → green. The test still asserts the 3px border-left + color-mix error treatment, now against a defined token (strengthened, not weakened). |
| AC6 | Full lint/verify on clean branch passes (empty allowlist/exception surface) | `npm run verify` green end-to-end; the guard has no waiver/allowlist file. |

---

## Ordered task list

1. **Add the gate (red-first).** Write `scripts/token-resolution-guard.ts` with pure exports `checkContent` (definition extractor) + `findUndefinedReferences`. Write `scripts/__tests__/token-resolution-guard.test.ts` (or co-located per repo convention) asserting AC3 logic on fixtures. Tests fail until the script exists → green once implemented. Add `token-guard:check` to `package.json`. **Do not wire into `verify` yet** (the tree still has dead tokens).
2. **Resolve CSS dead tokens.** Edit `packages/design-system/src/body-editor.css` (12 tokens) + `packages/web/src/index.css` (4) per mapping table. Update the file-level `@lore T1` comment in body-editor.css (h1/h2/h3 now reference `--text-2xl`/`--text-xl`/`calc(--text-xl*0.9)`).
3. **Resolve TSX arbitrary-value dead tokens.** Edit `TaskSheet.tsx` (×6), `KnowledgeRow.tsx` (×3), `CurationSuggestionCard.tsx` (×2), `AgentProfile.tsx` (×1), `CredentialsTab.tsx` (×1) per mapping.
4. **Resolve SettingsAssistant tokens.** `var(--color-error, red)` → `var(--status-error)`, `var(--color-success, green)` → `var(--status-success)` (drop literal fallbacks), **`var(--surface-2)` (L150) → `var(--surface-container)`**. (`SettingsAppearance.tsx` `--bg-canvas` is comment-only — left untouched; the gate's comment-stripping prevents a false positive.)
5. **Resolve `--danger` + protected test in lockstep.** Edit `ThreadSections.tsx` (×3 → `--status-error`), rewrite the stale `@lore U9` comment to record the AI1 migration. Update `ThreadSections.conversations.test.tsx` L210 assertion to `--status-error`. Run `npm run test` (ThreadSections suite green).
6. **Wire the gate into `verify`.** Now that the tree is clean, add `&& npm run token-guard:check` after `demo-fixture-guard:check`. Run `token-guard:check` → exits 0 (AC1, AC6).
7. **Visual proof (AC2/AC4).** Playwright screenshots: rich-text editor (headings/code/quote), TaskSheet dividers at desktop + mobile, knowledge-body headings, assistant-settings error+success states. Compare against pre-fix baseline; reviewer judges styling restored.
8. **Final `npm run verify`** green.

Dependencies: T1 before T6 (gate must exist to wire). T2-T5 before T6 (tree must be clean or the gate reds). T2-T5 independent of each other (parallelizable). T7 after T2-T5.

---

## Design-it-twice — secondary decision (token-definition discovery)

**A. Parse `tokens.css` at runtime (CHOSEN).** Regex `--name:` declarations into a Set. Single source of truth; auto-tracks AI6's future token additions; zero drift.
Reject reason for alt: —

**B. Hardcode the allowlist in the guard.** A literal `Set<string>` of every token name.
Reject: duplicates the token list, drifts the instant AI6 adds/renames a token, reintroduces the exact "two lists disagree" class of bug AI1 exists to kill. Rejected.

---

## Type signatures / contracts

```ts
// scripts/token-resolution-guard.ts
/** Extract defined custom-property names from tokens.css text (--name: …). */
export function checkContent(cssSource: string): Set<string>;

/**
 * Blank out comments before reference extraction, preserving line count so
 * reported line numbers stay accurate. lang selects the comment grammar:
 *   "css" → block comments only; "ts" → line (//) + block comments.
 */
export function stripComments(text: string, lang: "css" | "ts"): string;

/**
 * Find var(--x) references whose token is not in `defined`. Line-numbered.
 * Runs over comment-stripped text — callers pass the stripped text, or the CLI
 * strips per file extension before calling this.
 */
export function findUndefinedReferences(
  fileText: string,
  defined: ReadonlySet<string>,
): Array<{ line: number; token: string }>;

// CLI: token-resolution-guard.ts --check → exit 1 on any miss, naming <file>:<line> <token>.
```

No new runtime types, schemas, routes, or DB changes. CSS/TSX edits only + one script.

---

## Security & abuse cases

| Surface | Status |
|---|---|
| New POST/PATCH endpoints | **N/A** — no API surface; CSS/TSX + a lint script only. |
| Agent-authored input / trust boundary | **N/A** — no user/agent input path touched. |
| Secret handling | **N/A** — CredentialsTab edit is a CSS border token only, no secret logic. |
| Path traversal | **Applicable** — the guard walks the filesystem. Addressed: hardcoded glob roots under the repo, reuse nimmly-guard's `EXCLUDED_DIR_PATTERNS` walker; no path comes from input. |
| SSRF / outbound URL | **N/A** — no network. |

---

## route-checklist

**N/A** — no routes/middleware. The analogous "every site covered" checklist is the **token mapping table** (10 files, 19 live tokens, ~34 sites) plus the **comment-only set** (`--bg-canvas` + the 3 in-comment occurrences) which must stay unmapped and unflagged; `/review` greps each listed file:token against the implementation to confirm none missed, confirms the comment-only refs are untouched, and `token-guard:check` exits 0.

---

## protectedTests

```
packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx
```
The `--danger`-asserting test (L202-211). Its assertion changes from `var(--danger)` → `var(--status-error)` **in lockstep** with the source migration (AC5). It is not deleted or weakened: it still asserts the 3px border-left + color-mix danger-tint error treatment, now against a *defined* token. DoD audits this file's diff: the only permitted change is the token name in the `borderLeft` matcher; the structural assertions (sticky, top-0, color-mix, 3px solid) stay.

---

## sharedFiles

```
package.json                              # verify chain + token-guard:check script
packages/web/src/index.css                # shipped global CSS (knowledge-body headings)
packages/web/src/settings/SettingsAssistant.tsx # AH3 owns persona-surface restyle; AI1 touches only 3 token refs (--color-error/-success/--surface-2)
packages/design-system/src/tokens.css     # READ ONLY (allowlist source — not modified here; AI6 owns additions)
```
`package.json` and `index.css` are infra other AI-track workpackages may touch — flag for merge ordering. `SettingsAssistant.tsx` overlaps **AH3** (persona-surface restyle) — AI1 changes only token references (its own dimension), not textarea shape; flag for merge coordination. `tokens.css` is read, not written.

---

## Risks / ambiguities

- **R1 — stale U9 lore.** The `ThreadSections.tsx` `@lore U9` comment claims protected tests forbid `--danger` migration. The AI1 AC overrides this. Resolution: rewrite the lore to record AI1's migration; this is the load-bearing reconciliation — `/review` should confirm the comment no longer asserts a false constraint.
- **R2 — RESOLVED: the density→type mapping is a faithful restoration for body/h2/h3 and a deliberate 2px scale normalization for h1.** The first draft wrongly claimed the pre-W2 pixel values were "unrecoverable." They are recoverable from git. Evidence — commit **`3d33c170` ("W2: replace density tokens with literal Hearth values")** deletes the default-density `:root` block from **`packages/design-system/src/tokens.css`** (`git show 3d33c170~1:packages/design-system/src/tokens.css`; `body-editor.css` only consumed these tokens, it never defined them): `--density-text: 15px`, `--density-text-h1: 26px`, `--density-text-h2: 20px`. Against the proposed targets — `--text-base: 15px`, `--text-2xl: 24px`, `--text-xl: 20px` (confirmed in `tokens.css`):
  - **Exact restorations:** body 15→15, h2 20→20, h3 `calc(--text-xl * 0.9) = 18px` matching the pre-strip `calc(--density-text-h2 * 0.9) = 18px`.
  - **Deliberate normalization:** h1 **26→24**. The shipped default was 26px; 24px (`--text-2xl`) is the closest step on the current closed Hearth type scale, which has no 26px step — inventing one would violate this plan's own no-new-tokens contract and AQ-004 (see line 156's rationale). The 24px figure quoted in the first revision came from `html/_tokens.css` — the static mockup this plan ruled out of scope — not from the shipped tree.
  **AC2 visual proof therefore confirms exact restoration for body/h2/h3 and signs off the single 2px h1 normalization** — one bounded judgment, on-scale, documented here for the reviewer.
- **R3 — gate regex on minified/odd CSS.** `var(--x , red)` with internal spaces — regex tolerates `\s*` after `(` and the `,[^)]*` fallback clause. Nested `var(--a, var(--b))` — outer match captures `--a`, inner `--b` is caught on the global pass (both reported if undefined). Acceptable.

- **R4 — RESOLVED (WARNING-1): comments in scan scope.** The reference regex runs over raw file text, which includes `@lore`/JSDoc/`//` comments that name dead tokens by example (confirmed live: `--bg-canvas` in `SettingsAppearance.tsx:37`, `--density-text`/`--density-text-h2` in body-editor.css `@lore T1`, `--danger` in a `ThreadSections.tsx //` comment). Left unhandled, the gate reds on a clean tree (breaks AC6). **Decision: strip comments before extraction** (not "forbid `var(--…)` in comments" — that is brittle and would force rewriting valid `@lore` documentation). Mechanism specified in Gate spec step 2: per-file-type blanking (`/* */` for `.css`; `// …` + `/* */` for `.ts`/`.tsx`), length-preserving so line numbers stay accurate, text-level not AST (caveat documented there: can only ever drop a reference, never invent one, so worst case is a missed dead token caught independently by the mapping table + `/review` grep). Proven by the `stripComments` unit test (AC3).

- **R5 — RESOLVED (CRITICAL): two dead tokens the first draft missed.** A full scan-scope sweep (see §Full scan-scope sweep) found `--surface-2` (live, SettingsAssistant.tsx:150) and `--bg-canvas` (comment-only, SettingsAppearance.tsx:37) beyond the 18 spec-named tokens. `--surface-2` is now mapped → `--surface-container` (T4); `--bg-canvas` is handled by R4 comment-stripping. Without both, the gate built by this plan would `exit 1` on the very tree it certifies clean (AC1/AC6). Root cause of the original miss: the first draft only checked the *named* tokens for false-negatives; it never ran the inverse sweep the gate itself enforces. The sweep is now in the plan and is the gate's own algorithm run by hand.
