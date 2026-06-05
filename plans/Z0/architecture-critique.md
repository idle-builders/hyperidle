# Architecture Critique: Z0

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:N/A DM:N/A N:9 MD:9 FMC:7 S:9 V:6

## Dimension Scores

### 1. Spec Alignment — 9/10

Every AC maps to a plan task. The 8 ACs trace cleanly to Tasks 1-8. No scope-creep tasks -- the plan does not invent requirements. The three constraints (config alongside docs, additive-only, no custom Vue components) are all respected. The sidebar items match the 4 content pages in `docs/product/`. The plan correctly identifies that `docs/product/index.md` becomes the landing page.

Minor deduction: AC4 says "renders all existing product docs with working navigation between them." The plan's Task 6 verification says "Confirm all 4 content pages have corresponding HTML files" -- but there are 5 markdown files (index.md + 4 content pages), so 5 HTML files should be verified, not 4. This is cosmetic but imprecise.

### 2. Layer Integrity — 10/10

N/A for this workpackage -- VitePress is a standalone docs tool that does not touch any application layer. The plan correctly scopes it as a root devDependency with no workspace entry. No cross-package leakage. No application code touched.

### 3. API Contracts — N/A

No APIs introduced. Correctly omitted.

### 4. Data Model Alignment — N/A

No data model. Correctly omitted.

### 5. Naming — 9/10

`docs:dev` and `docs:build` follow npm script conventions and are self-documenting. The `.vitepress/` directory is VitePress convention. `custom.css` is honest. `outDir: '../../dist/docs'` places output at a logical location alongside existing build artifacts.

Minor: the plan title uses "factory-dark" interchangeably with "hearth-dark" in the spec context. The tailwind config calls it `hearth-dark`. The plan body correctly references Hearth throughout. No confusion in practice.

### 6. Module Depth — 9/10

Three files total (config.ts, theme/index.ts, custom.css) plus two script entries. The interface is exactly `npm run docs:dev` and `npm run docs:build`. Maximum simplicity. The theme override extends DefaultTheme with zero additions beyond CSS variables -- the shallowest possible customization layer. No unnecessary abstraction.

### 7. Failure-Mode Coverage — 7/10

The plan identifies 5 risks with mitigations. All are reasonable. However:

- **Biome lint on `.vitepress/` TypeScript files**: The plan says "these are simple config files with no violations" but does not verify this claim. The config.ts uses `defineConfig` from `vitepress` -- Biome's `noExplicitAny` and import rules could trigger on VitePress types. The plan correctly says "add exclusions only if needed" but should be more explicit that the builder MUST run `npm run lint:biome` after creating the config files and before proceeding to Task 8.
- **VitePress cache directory**: `.vitepress/cache/` and `.vitepress/dist/` are generated at build time. The plan adds `.vitepress/cache` to `.gitignore` but does not mention `.vitepress/dist/` -- however, `dist/` is already in `.gitignore` at the root level, so `docs/product/.vitepress/dist/` would NOT be caught by `dist/` (gitignore `dist/` matches any directory named `dist/` at any level, so it IS caught). The plan's `outDir` is `../../dist/docs` which routes output to the repo-root `dist/`, not `.vitepress/dist/`. So `.vitepress/dist/` should not exist. This is fine but not explicitly stated.
- **Missing failure mode**: What happens if VitePress encounters malformed frontmatter or broken markdown links in the existing docs? The plan assumes all existing markdown is VitePress-compatible but does not verify. The existing `index.md` uses relative `./file.md` links which the plan says VitePress handles natively -- this is correct, but a build-time verification step should confirm zero warnings.

### 8. Simplicity / Over-Engineering Risk — 9/10

Exemplary simplicity for an S-complexity workpackage. No abstractions, no feature flags, no plugin points, no auto-generation where static config suffices. The decision table in Section 2 justifies every choice concisely. Static sidebar for 5 pages is the right call. Local search over Algolia is the right call. The theme extension is minimal -- CSS variables only, no component overrides.

The `:root` block duplicating brand/tip/warning/danger variables that are also in `.dark` is the only whiff of redundancy, but the plan explains this: `:root` sets mode-independent values, `.dark` overrides backgrounds/text/borders. With `force-dark`, the `:root` brand values are technically redundant (`.dark` re-declares them), but VitePress's CSS specificity model makes this defensive rather than wasteful.

### 9. Verifiability — 6/10

This is the weakest dimension. The verification table (Section 8) lists verification methods per AC, but several are vague:

- AC2: "Run command, verify it binds to a port (check stdout for local URL)" -- how? The builder needs to know: start the process in the background, grep stdout for the URL pattern, then kill it. Or use `timeout` + check exit code. The plan does not specify.
- AC5: "Visual inspection of dev server" -- this is appropriate for a visual property, but the plan does not specify HOW visual inspection happens in an autonomous agent context. Should the builder use a screenshot tool? Curl the page and check for sidebar HTML elements?
- AC6: "Visual inspection: search modal opens" -- same issue. How does an autonomous agent verify search works? The search index is built at build time; the builder could verify the search index file exists in the build output as a proxy.
- AC7: "Visual inspection: backgrounds are warm earth tones" -- the CSS variables are hardcoded in the plan. The verification should be: "verify custom.css contains the specified variable values" (static property, not visual). Visual verification is a bonus, not the gate.

The plan correctly notes "No automated tests needed -- this is tooling configuration, not application logic" which aligns with CLAUDE.md's principle that tests are for runtime behavior. But the verification methods need to be concrete enough for an autonomous builder to execute without interpretation.

Additionally: no protected-tests list, but this is appropriate -- no application tests are affected by this workpackage.

## CRITICAL

None.

## WARNING

1. **[plan Section 8, AC2/5/6/7]** Verification methods for visual/interactive ACs are underspecified for autonomous execution. The builder agent cannot "visually inspect" without concrete instructions. Fix: for AC2, specify "start `docs:dev` in background, curl the local URL, verify HTTP 200 and HTML contains sidebar markup, then kill the process." For AC5, specify "verify the built HTML contains the 4 sidebar link texts." For AC6, specify "verify the build output contains a search index file (`.vitepress/dist/` or equivalent searchindex)." For AC7, specify "verify `custom.css` contains `--vp-c-bg: #1a1510` and `--vp-c-brand-1: #2eaa7a`" as the static gate, with optional visual screenshot as bonus.

2. **[plan Section 9, Task 6]** Task 6 says "Confirm all 4 content pages have corresponding HTML files" but there are 5 markdown files (index.md + 4 content pages = 5 HTML outputs). The count should be 5, or the task should say "all content pages" without a number.

## SUGGESTION

1. **[plan Section 6, Biome]** Add an explicit step in Task 2 or Task 3: "Run `npm run lint:biome` after creating the `.vitepress/` files to verify no lint violations. If violations appear, add `!docs/product/.vitepress` to `biome.json` `files.includes`." The current plan defers this to Task 8, which is fine for correctness but means a potential rework loop. Catching it early is cheaper.

2. **[plan Section 3, CSS]** The `:root` block declares brand/tip/warning/danger variables that `.dark` immediately redeclares with identical values. Since `force-dark` means `.dark` is always active, the `:root` declarations for these specific variables are dead code. Consider removing the `:root` block entirely or adding a comment explaining why it exists (VitePress CSS loading order? Specificity fallback?). The plan's existing note partially addresses this but could be sharper.

3. **[plan Section 4]** The port conflict note says "VitePress auto-detects occupied ports and increments." Consider specifying an explicit port in the `docs:dev` script (e.g., `vitepress dev docs/product --port 5174`) to avoid user confusion when both `npm run dev` and `npm run docs:dev` are running. This is low-priority but improves DX.

## What's Working Well

1. **Tooling isolation analysis is thorough.** Section 6 systematically walks through every tool in the verify pipeline (TypeScript, Biome, ESLint, Vitest, Knip, Build, .gitignore) and explains why each is unaffected. Every claim I verified against the actual config files was accurate. This is the right level of diligence for a "does not break existing tooling" AC.

2. **Decision rationale table is excellent.** Section 2's table (static sidebar, local search, force-dark, outDir placement) gives the "why" for every non-obvious choice. Each rationale is one sentence and defensible. This is what good architecture plans look like -- decisions are traceable, not assumed.
