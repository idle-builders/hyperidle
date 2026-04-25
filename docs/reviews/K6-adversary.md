# K6 — Adversary Review

Story: K6 — Design Linter ESLint Plugin + `/design-lint` skill.
Reviewer: adversary.
Date: 2026-04-25.

## Summary

- 9 ESLint rules shipped, plugin loads via flat config, RuleTester passes, lint runs against the codebase and surfaces 10 design/* warnings.
- Several **rule-correctness vs. AESTHETICS.md drifts** are present and should be fixed before K7 consumes this — they will either drown K7 in false positives or hide real violations.
- The `no-ai-aesthetic` rule is materially under-scope vs. the K1 catalogue (5 of 15 tells covered) and contains one source-of-truth violation (the gradient-bg regex extension is a legitimate fix but undocumented).
- Several rules have dead-easy bypasses (`cn()`/`clsx()`, template literals, multi-line attributes via curly-brace expression) that K7 will hit immediately.

---

## CRITICAL (SEV-1)

### 1. `no-off-grid-spacing` allowlist drifts from AESTHETICS.md (SEV-1, SOURCE-OF-TRUTH)
**File:** `packages/eslint-plugin-design/src/util.ts:16-18`
**AESTHETICS.md row (line 61):** Grid base unit lint hint allowlist is `{4,8,12,16,20,24,32,40,48}` for the literal regex *but the spec also explicitly admits 0 as an implicit case* and says "2px allowed only inside StatusChip and Tag". The util constant `SPACING_ALLOWLIST = {4,8,12,16,20,24,32,40,48}` does not include `0`. Today no test trips this because nobody writes `p-[0px]`, but a developer who does will get an off-grid warning for a value the spec explicitly permits.
**Fix:** Add `0` to `SPACING_ALLOWLIST`. One-line change. Source: AESTHETICS.md table line 61 (the "Grid base unit" recommended value treats 0/4/8/… as a closed set; 0 is implicit but real).

### 2. `no-off-scale-radius` regex misses Tailwind named-radius shorthands (SEV-1, FALSE NEGATIVE)
**File:** `packages/eslint-plugin-design/src/rules/no-off-scale-radius.ts:12`
**Regex:** `/\brounded(?:-[a-z]+)?-\[(\d+)px\]/g` — only catches **arbitrary-value** brackets. The K1 spec `AESTHETICS.md:172` allowlist is `{0,4,8,12,9999}`, but Tailwind's named radii also map to off-scale values (`rounded-md` = 6px, `rounded-lg` = 8px ✓, `rounded-xl` = 12px ✓, `rounded` = 4px ✓). `rounded-md` (6px) — silently passes the lint. The spec explicitly lists "rounded-2xl/3xl" in `no-ai-aesthetic` but `rounded-md` (6px) and `rounded-xl` (12px ok by happenstance) and most importantly `rounded-sm` (2px) all bypass `no-off-scale-radius`.
**Fix:** Either add a named-radius allowlist (`rounded`, `rounded-lg`, `rounded-full`, `rounded-none`) OR explicitly flag named-radius classes that don't resolve to {0,4,8,12,999}. Document the decision either way.

### 3. `no-ai-aesthetic` catalogue coverage is 5 of 15, contradicting K6 acceptance criteria (SEV-1, SCOPE)
**File:** `packages/eslint-plugin-design/src/rules/no-ai-aesthetic.ts`
**Spec (TRACK-K.md:189):** "class-name match against the K1 anti-pattern list (the list comes from K1)". AESTHETICS.md catalogues 15 tells; this rule covers tells #1, #2, #7, #10, #13. Missing **regex-detectable** tells per AESTHETICS.md lint-hint column: #3 oversized padding `p-(8|10|12|14|16)` (regex column says `yes`), #6 `text-center` outside EmptyState/Modal (`partial` but tractable), #11 Lorem ipsum (`yes`), #12 marketing copy (`partial` but a regex), #9 `grid-cols-3 ... gap-(6|8|10|12)` near `.map(` (`partial`).
The skipped tells #11 (Lorem ipsum) and #12 (marketing copy) are explicitly tagged `Lintable: yes` — there is no excuse to omit them. AQ-103, AQ-106, AQ-108, AQ-109, AQ-110 in `aesthetic-quality.md` are listed as `design/no-ai-aesthetic` rule IDs but have no implementation.
**Fix:** Either (a) implement the missing yes-lintable tells in `no-ai-aesthetic.ts`, or (b) explicitly downscope K6 in TRACK-K.md and `aesthetic-quality.md` to the 5 covered tells, naming the deferred rules and the K-track that will land them. Without this, K7's PR description claim of "passes design lint" is meaningless for two-thirds of the AI-aesthetic catalogue.

### 4. `no-ai-aesthetic` heavy-shadow filename heuristic is too leaky (SEV-1, FALSE NEGATIVE)
**File:** `packages/eslint-plugin-design/src/util.ts:87` + `no-ai-aesthetic.ts:64,92`
**Regex:** `/(Modal|Dialog|Popover|Tooltip)/` against the FULL filename path. Any file path containing one of those substrings — `MyDialogStyles.tsx`, `pages/PopoverDocs.tsx`, `tests/ModalShouldNotShadow.tsx`, even the directory name `app/dialog-bar/Card.tsx` — is exempted. The spec at `AESTHETICS.md:177` says "outside files matching `/Modal|Dialog|Popover|Tooltip/`" so the regex matches the spec literally — but the spec is itself loose. Worse: `BetCardModalSummary.tsx` shadows EVERYTHING (including the BetCard surface), defeating the rule.
**Fix:** Anchor to the basename and require an exact match: `/^(Modal|Dialog|Popover|Tooltip)(\..*)?\.tsx$/.test(basename(filename))`. If the spec's intent is broader, document the chosen heuristic in `AESTHETICS.md` with examples of what does and does not match.

### 5. `no-hardcoded-color` fires on hex inside non-styling string contexts (SEV-1, FALSE POSITIVE)
**File:** `packages/eslint-plugin-design/src/rules/no-hardcoded-color.ts:42-63`
The rule fires on **every** string `Literal` in a `.tsx` file, not just on JSX style attributes / className. A JSX text node like `<code>#ff0000</code>` (rendering an example), a test snapshot string, a comment in `aria-label="Picker for #ff0000"`, an `id="user-#abc123"` will fire. The bad-fixture only proves it triggers on a top-level constant, which is the easy case. The good-fixture is the only safety net and it doesn't exercise edge cases (URL fragments, color-name documentation, hex IDs, `data-` attributes).
**Fix:** Either (a) restrict to `style={{ ... }}` literal values + `className` literal values + tagged-template `css\`\`` content, or (b) add an allowlist of attribute names that exempt the literal (`aria-label`, `data-*`, `id`, `href`). Without this, K7 will hit cascading false positives in any component that documents tokens or names colors in copy.

---

## WARNINGS (SEV-2)

### 6. `RuleTester.describe`/`.it` static-mutation hack is fragile across files (SEV-2)
**File:** every test file in `src/rules/__tests__/*.test.ts:6-7`
Each test file mutates the shared `RuleTester` static globals after import. With Vitest's parallel test running, the order of imports is non-deterministic; the first file that imports both `RuleTester` from eslint and `describe/it` from vitest wins the assignment, and subsequent assignments overwrite. This works today because the assignments are idempotent, but if any test customizes `RuleTester.it.only`, the leak will surface. Move the mutation into `setup.ts` (`ruleTester` already lives there) so it happens exactly once per worker.

### 7. Bad-fixture file count assertion is brittle (SEV-2)
**File:** `packages/eslint-plugin-design/src/__tests__/fixtures.test.ts:62-75`
The assertion uses `expect(ids).toEqual([...].sort())` against a sorted list of unique rule IDs, but the bad-fixture triggers exactly **one violation per rule** (line 11 → no-hardcoded-color, line 14 → require-focus, etc.). If a future rule starts double-firing on this fixture, the assertion gives a misleading diff because it deduplicates by ID. Use `expect(ids).toEqual(sorted(allExpected))` AND assert `ids.length === expected.length` to catch double-fires. The fixture also doesn't trigger the `bg-clip-text + text-transparent` AI tell or `backdrop-blur` AI tell — both are covered by the rule but absent from the bad-fixture, so the integration test never proves they fire end-to-end.

### 8. `no-ai-aesthetic` gradient-bg extension is undocumented value invention (SEV-2, K1 AMENDMENT NEEDED)
**File:** `packages/eslint-plugin-design/src/rules/no-ai-aesthetic.ts:33-35`
The dev added two extra regexes (`GRADIENT_DIRECTION` + `GRADIENT_AI_STOP`) beyond the AESTHETICS.md literal because "the literal never matches real code". This is the right call — the AESTHETICS.md regex `bg-gradient-(to|from|via)-(indigo...)` is wrong (Tailwind v3 splits direction and stop classes). However, this is a value/regex invention against the spec rule "no rule encodes a value that isn't already in AESTHETICS.md". The lore comment in the file explains it but the spec is not updated.
**Fix:** File a K1 amendment to fix the regex in AESTHETICS.md table line 288, then point the lore comment at the amendment. Don't ship the extension without a paper trail — K8's "rules promoted to error" gate becomes silently inconsistent with the spec.

### 9. `no-raw-tailwind-color` palette regex includes false-positive prefixes (SEV-2)
**File:** `packages/eslint-plugin-design/src/rules/no-raw-tailwind-color.ts:14-17`
The prefix list includes `to`, `via`, `from` as standalone class prefixes (`to-blue-500` etc.). These are legitimate **gradient stop** classes; flagging them under `no-raw-tailwind-color` overlaps with `no-ai-aesthetic` (which already flags the stop in conjunction with the bg-gradient direction). A team that legitimately uses a non-AI gradient color stop (e.g., `from-emerald-500` for a chart) will get **two** lint errors for the same code, with different fix instructions ("use Lucid semantic class" vs. "this is an AI tell"). Also: `outline-blue-500` is not actually how Tailwind v3 expresses outline colors (it's `outline-blue-500` ✓ but `accent-blue-500` requires the named property — these are real). Verify the prefix list against the actual Tailwind utility set.

### 10. `require-ds-attribute` does not handle `React.forwardRef` / `memo` wrappers (SEV-2, FALSE NEGATIVE)
**File:** `packages/eslint-plugin-design/src/rules/require-ds-attribute.ts:101-130`
The rule handles `export default function Foo()`, `const Foo = () => ...; export default Foo`. It does NOT handle:
- `export default forwardRef((props, ref) => <div ... />)`
- `export default memo(Foo)`
- `export default React.memo(forwardRef(...))`
Any design-system component that uses `forwardRef` (which is normal for Tier-1 primitives that need to expose refs to consumers) silently passes the rule with no marker. The bad-fixture does not exercise these forms.
**Fix:** Walk through `CallExpression` arguments when the default-export expression is a call to `forwardRef`/`memo` and recurse on the inner function.

### 11. `require-focus-on-interactive` accepts `onClick` even when handler is dummy (SEV-2)
**File:** `packages/eslint-plugin-design/src/rules/require-focus-on-interactive.ts`
The rule fires on `<div onClick={...}>`. But a developer who passes `onClick={undefined}` or `onClick={isReadonly ? undefined : handler}` still trips the rule even though the runtime element is non-interactive. More importantly, the rule treats `tabIndex` of any value as sufficient — `tabIndex={-1}` (deliberately non-tab-stop) still counts. That's a real a11y bug.
**Fix:** Reject `tabIndex={-1}` literal as evidence of focusability; treat only `tabIndex={0}` or any non-negative value as proof.

### 12. `require-stories-sibling` fires per Program node — quietly broken on parallel ESLint workers (SEV-2)
**File:** `packages/eslint-plugin-design/src/rules/require-stories-sibling.ts:60-69`
The rule calls `existsSync` synchronously at module import via the closure inside `create()`. On every lint run, it reads the FS once per file. This is fine for correctness but: in CI with `--cache`, ESLint caches by file hash; a sibling story added later won't invalidate the cached result for the component file (the component file's hash didn't change). Document this gotcha or add a `lore` comment so K7 knows to invalidate cache after adding stories.

### 13. Plugin `peerDependencies` claims ESLint ^10 / TypeScript ^6 (SEV-2)
**File:** `packages/eslint-plugin-design/package.json:14-17`
ESLint 10.x and TypeScript 6.x do not exist as of 2026-04-25 (latest stable: ESLint 9.x, TS 5.x). The plugin runs only because Bun ignores peer-dep checks. This will block any external publish and is misleading documentation.
**Fix:** Set realistic peer ranges (`eslint": ">=9"`, `typescript": ">=5"`).

---

## OBSERVATIONS (SEV-3)

### 14. All className extraction is literal-only — `cn()`/`clsx()`/template-literal class strings invisible (SEV-3)
**File:** `packages/eslint-plugin-design/src/util.ts:96-105` + every rule that calls `getClassNameLiteral`
The dev explicitly documents this: "We intentionally do not chase template literals or `clsx()` — those are out of scope". Fine — but document the bypass in the rule docs and the SKILL.md so K7 doesn't believe `bun run lint:design` is exhaustive. Today every dynamic class composition (the common case in real components) silently passes. The `/design-lint` skill says "Higher-level checks the AST cannot easily do" but doesn't mention that the AST also doesn't catch dynamic class composition.

### 15. `no-off-scale-font-size` uses `\btext-\[\d+px\]` only — misses `text-[1rem]`, `text-[14pt]`, `text-[1em]` (SEV-3)
**File:** `packages/eslint-plugin-design/src/rules/no-off-scale-font-size.ts:12`
A developer who writes `text-[1rem]` (= 16px) bypasses the rule. The spec allowlist is in pixels; the rule should either normalize rem→px or explicitly forbid non-px units in arbitrary text classes.

### 16. Codebase baseline (10 design warnings) looks correct (SEV-3, INFO)
The 10 surfaced warnings are all real: 5 off-grid spacing (px-[10px], px-[6px], py-[2px], px-[5px], pr-[56px]), 3 off-scale font (text-[10px] x3), 2 div-onClick. None look like false positives. K7 can act on this list directly. The dev's claim of 10 warnings checks out.

### 17. SKILL.md higher-level-check section is too vague to act on (SEV-3)
**File:** `.claude/skills/design-lint/SKILL.md:33-56`
"Same role, same treatment" is a judgment call with no example of input/output beyond one toy line. "Cross-component AI-aesthetic count" tells the agent to "look at the page-level rendering or the storybook snapshot" without specifying how to obtain a screenshot or a tractable algorithm. Compare to slop-scan which has concrete heuristics. Either downscope these to "the AST-detectable rules + a flag for human review" or specify the actual algorithm (e.g., "render `/designsystem` page in Playwright, take screenshot, check 5 named tells via vision call").

### 18. Bad-fixture violates JSX rules (SEV-3, COSMETIC)
**File:** `test-fixtures/bad-fixture.tsx:13`
The fixture declares `(): JSX.Element` return type but doesn't import React/JSX. It works because TypeScript's parser is forgiving and the file is never compiled, but the file should declare its intent. Also a future agent who runs `bun run check` on the package will get an error.

### 19. Plugin runs from `.ts` source (no build step) — relies on Bun executing TS directly (SEV-3, COMPATIBILITY)
**File:** `packages/eslint-plugin-design/package.json:7-9` (`"exports": "./src/index.ts"`)
This requires `bunx --bun eslint` to execute the plugin's TypeScript source through Bun's loader. The root `package.json` `lint:design` script uses `bunx --bun eslint` — good. But the standard `bun run lint` (root) calls plain `eslint` which goes through Node and will fail to load `./src/index.ts`. Verify by running `bun run lint` (not `bun run lint:design`) and confirm the plugin loads. If it doesn't, document the gotcha (`@lore` comment) and add a check in CI that exercises both paths.

### 20. `require-stories-sibling` runs only on filesystem paths, not virtual fixtures (SEV-3)
**File:** `packages/eslint-plugin-design/src/rules/__tests__/require-stories-sibling.test.ts`
The test ships only ONE invalid case (NoStories.tsx) and three valid cases. The minimum is "3 cases per rule"; this test has 4 valid + 1 invalid and the invalid set does not cover (a) component file in `packages/web/src/components/` path, (b) lowercase-named file (which should be exempt — does it?), (c) PascalCase file ending in `.test.tsx` (should be exempt). Add at least two more invalid cases.

---

## VERDICT

**REVISE**

Critical issues 1–5 must be addressed before K7 starts the spacing-audit step:
- #1 will give K7 a false off-grid hit on any 0px utility.
- #2 will let off-scale `rounded-md` (6px) and `rounded-sm` (2px) ship.
- #3 means "passing design lint" only proves 5 of 15 AI-aesthetic tells; K8's promotion-to-error gate is unsafe to ship without either implementing the missing yes-lintable tells or formally downscoping the spec.
- #4 will exempt every file with "Modal" / "Dialog" / "Popover" / "Tooltip" anywhere in its path — including directories. K7 will accidentally ship `shadow-xl` on cards in any such tree.
- #5 will produce false positives on legitimate code (color documentation, hex IDs, aria labels) that K7 cannot fix without rewriting copy.

Warnings 6–13 are fixable in a follow-up apply-pass before the K8 promotion-to-error gate; they don't block K7 starting.

Plugin packaging works (verified — `bunx --bun eslint` produced 10 design/* warnings against the codebase). The 10-warning baseline is real and correct.
