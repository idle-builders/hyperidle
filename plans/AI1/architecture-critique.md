# Architecture Critique: AI1

ARCHITECTURE-SCORE: 8/10  rounds=2  score-line: SA:9 LI:10 AC:9 DM:7 N:9 MD:8 FMC:9 S:9 V:8

---

## ROUND 2 (revision e82bbcaf)

Verdict: **8 — Approved with one mandatory correction.** The CRITICAL and WARNING-1 are fully and verifiably resolved. The plan now runs the gate's own algorithm by hand, finds exactly the 20 dead tokens, maps the 19 live ones, and handles the comment-only `--bg-canvas` via a specified comment-stripping pass with a unit test. But the R2 rewrite over-corrected: its "byte-identical restoration" claim is **factually wrong for `--density-text-h1`** — the shipped default was **26px**, not the 24px the plan cites (the 24px comes from the out-of-scope `html/_tokens.css` mockup). h1 is a 2px reduction and a defensible design judgment, not the exact restoration R2 now asserts. Net: ship after correcting R2's claim. No round 3 required — the fix is a one-paragraph honesty correction, not a structural change.

### Round 1 findings — resolution status

**CRITICAL (two unaccounted dead tokens) — RESOLVED ✓**
Re-ran the gate's exact scan globs myself (`packages/{web,design-system}/src/**/*.{css,ts,tsx}` minus tests/stories/`__tests__`, `references − definitions`). Result: **20 distinct dead tokens, identical to the plan's §Full-scan-scope-sweep table.** Spot-checks all pass:
- `--surface-2` confirmed live at `SettingsAssistant.tsx:150` (`backgroundColor: "var(--surface-2)"`, no fallback). Now mapped → `--surface-container` (defined 3× in `tokens.css` per theme) and added to task T4. Correct semantic target (raised/inset fill, same token body-editor uses for `pre`/tables).
- `--bg-canvas` confirmed comment-only at `SettingsAppearance.tsx:37`, inside the `@lore W3` JSDoc. Handled by comment-stripping, not a mapping. Correct.
- All 17 distinct replacement targets confirmed defined in `tokens.css`.
- Excluded-names claim (§88) verified exactly: `--accent`, `--accent-on`, `--density`, `--density-pad-y`, `--surface-1`, `--r2` are dead **only** in test/story files and never enter scan scope. The exclusion list provably works.
The gate the plan builds will now exit 0 on the post-fix tree (AC1/AC6 honored). The root-cause fix — running the gate's inverse sweep by hand — is the right systemic correction, not a patch.

**WARNING-1 (comment handling unspecified) — RESOLVED ✓**
Gate spec step 2 now specifies length-preserving comment blanking before reference extraction: `/* */` for `.css`; `// …` + `/* */` for `.ts`/`.tsx`. `stripComments(text, lang)` is a named pure export with its own AC3 unit test asserting `var(--dead)` inside comments is NOT reported while a live styling reference still is. The string-literal-delimiter caveat is documented and correctly bounded (text-strip can only ever drop a reference, never invent one → worst case is a missed dead token, caught independently by the mapping table + `/review` grep). Durable choice over brittle "forbid var() in comments." Correct.

**WARNING-2 (R2 overstated risk) — RESOLVED IN THE WRONG DIRECTION ⚠ (now a new WARNING)**
Round 1 flagged R2 as overcautious ("unrecoverable / judgment call" when the values are in git). The revision swung to the opposite error and now **overclaims**. See new WARNING below. The provenance is real and h2/body/h3 restore exactly — but h1 does not, and the plan asserts it does.

### New WARNING (introduced by the R2 rewrite)

- **[plan §Risks R2 / line 294] R2's "byte-identical restoration" claim is false for `--density-text-h1`, and it cites the wrong file as evidence.**
  Verified against `3d33c170~1`:
  - The shipped default-density block lived in **`tokens.css`**, not `body-editor.css`. `body-editor.css` only *referenced* `--density-text-h1` (L27) — it never defined it. R2's parenthetical ("`git show 3d33c170~1:packages/design-system/src/body-editor.css` confirms these were the live default-density values") is therefore wrong: that file defines none of these tokens.
  - In `tokens.css`, the live default block (`:root, [data-density="default"]`, L280-293) was: `--density-text: 15px`, `--density-text-h2: 20px`, **`--density-text-h1: 26px`**. The `24px` R2 quotes is from `packages/design-system/html/_tokens.css:78` — the **unshipped mockup the plan itself ruled out of scope** (§86).
  - So the restoration is exact for **body (15→`--text-base`=15)**, **h2 (20→`--text-xl`=20)**, and **h3 (`calc(--text-xl*0.9)`=18 → former `calc(--density-text-h2*0.9)`=18)** — but **h1 is 26→24, a 2px reduction.**
  The 24px choice is *defensible* — it keeps h1 inside the closed type scale below `--text-3xl`=30px (the plan's own AQ-004 argument at line 156), and the next scale step up overshoots. But that is a **design judgment**, exactly what R2 claims it is not. The contradiction is internal: line 156 justifies 24px on type-scale grounds while line 294 claims 24px is a pixel-exact restoration that needs no judgment.
  **Fix (mandatory, non-structural):** correct R2 to state h1 is a deliberate 26→24 normalization onto the closed scale (cite the real source: `tokens.css` default block, not body-editor.css / not the mockup); keep the exact-restoration claim only for h2/body/h3. AC2's visual proof for h1 is then a design confirmation (24px reads correctly as the top heading), not a pixel-diff against 26px. This is the one item to fix before build.

### Dimension score deltas (R1 → R2)

| Dim | R1 | R2 | Why |
|---|---|---|---|
| SA (spec alignment) | 6 | 9 | Full scan-scope sweep closes the CRITICAL gap; every dead token in the gate's domain now reconciled. |
| FMC (failure-mode coverage) | 6 | 9 | Comment-stripping false-positive class now specified + unit-tested; gate no longer reds on clean tree. |
| DM (data/value mapping) | 8 | 7 | R2's incorrect byte-identical claim for h1 and wrong-file citation lower confidence in the mapping's self-assessment (the mappings themselves are right; the justification is now inaccurate). |
| V (validation) | 7 | 8 | AC3 strengthened to assert line numbers + `stripComments` test; `.html` boundary made explicit. |
| LI 10, AC 9, N 9, MD 8, S 9 | — | unchanged | No relevant change. |

**Overall: 7 → 8.** The headline blocker is gone; one honesty correction remains.

### Verdict

**APPROVED — build may proceed after the R2 correction.** No round 3. The remaining WARNING is a one-paragraph factual fix in a risk note, not a change to the gate, the mapping, the task list, or any AC. Recommend the builder also drop a `@lore` on the body-editor h1 rule recording the deliberate 26→24 scale normalization so the next agent doesn't "restore" 26px.

---

## ROUND 1 (original plan)

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:6 LI:10 AC:9 DM:8 N:9 MD:8 FMC:6 S:9 V:7

Verdict: **7 — Good, ships with mandatory pre-build fixes.** The mapping table is accurate (all 18 dead tokens confirmed undefined; all 18 targets confirmed defined; the W2 density values are recoverable from git and *exactly* validate the h1/h2/body mappings — see What's Working Well). The gate-mechanism decision is sound and well-argued. But the reconciliation scanned only the spec-named offenders, not the gate's own scan scope — and the gate's scope contains **two additional dead tokens the plan never accounts for**, one of which (`--surface-2`) is a live reference that violates AC1 and breaks the gate on a clean tree. The plan builds a gate that fails against the tree it certifies clean. That is the headline.

---

### CRITICAL

- **[plan §Plan reconciliation / §Token mapping / §39] Two dead tokens in the gate's scan scope are unaccounted — `--surface-2` and `--bg-canvas`. The gate will exit 1 on a "clean" tree, breaking AC1 + AC6.**
  Independent sweep of the plan's exact scan globs (`packages/{web,design-system}/src/**/*.{css,ts,tsx}`, minus tests/stories) found two undefined `var(--…)` references the plan's reconciliation table, mapping table, and §115 "18 distinct dead tokens" count all miss:
  1. **`--surface-2`** at `packages/web/src/settings/SettingsAssistant.tsx:150` — a live `backgroundColor: "var(--surface-2)"` on the persona textarea. Undefined in `tokens.css`. The plan *touches this exact file* (for `--color-error`/`--color-success`) yet never noticed the third dead token in it. This directly violates **AC1** ("zero dangling references remain") and the gate the plan builds will `process.exit(1)` on it, violating **AC6** ("verify green, allowlist surface empty"). Resolving token integrity here is in AI1's dimension (not AH3's textarea-shape restyling), so it is in scope.
     **Fix:** add `--surface-2 → --surface-container` to the mapping table (semantically the raised/inset fill, matching the body-editor `pre`/table usage) and to task T4; re-run the 18→19 count.
  2. **`--bg-canvas`** at `packages/web/src/settings/SettingsAppearance.tsx:37` — appears only inside a `@lore W3` doc comment as illustrative text (`var(--bg-canvas)`), not a live reference. But the gate's regex (§74) scans **raw file text with no comment-stripping**, so it *will* match and fail. The plan's exclusion list (§73) excludes test/story files only — not comments. This is a false-positive class the gate design does not handle, and it breaks AC6 on the clean tree.
     **Fix:** the gate must strip CSS/JS/TSX comments before reference extraction (or the plan must rewrite that one `@lore` comment to not contain a literal `var(--…)`). Spell out the chosen approach in §Gate spec step 2. Comment-stripping is the durable fix — future `@lore` comments will reference dead tokens by name again.
  Root cause: §39 only checked the 18 named tokens for *false-negatives* ("no hidden definition"). It never asked the inverse — "what else in scan scope is dead?" — which is exactly what the gate enforces. Re-run a full scan-scope sweep and reconcile every hit before T1.

---

### WARNING

- **[plan §Gate spec step 2 / §86] The gate scans `.tsx`/`.ts` raw text and will match `var(--…)` inside comments and inside string literals that are documentation, not styling.** Same root as CRITICAL #2 but broader: any future `// border-[var(--foo)]` example in a JSDoc/`@lore`/code comment will red the gate. The regex-over-text choice is correct for coverage (well-argued in §54), but "text" includes comments. Decision needed and recorded: strip comments (robust, ~10 lines per language) vs. accept comment false-positives and forbid `var(--…)` in comments (brittle). Pick one in the plan; do not leave it to the builder.

- **[plan §Risks R2 / §218] R2 overstates the risk — the original W2 density pixel values ARE recoverable and they *exactly* match the proposed mappings; the "judgment call / unrecoverable" framing is wrong and should be corrected so the reviewer doesn't demand visual sign-off for a provably-exact restoration.** `git log -S` on the removed density tokens shows `--density-text: 15px`, `--density-text-h1: 24px`, `--density-text-h2: 20px` — identical to the plan's `--text-base` (15px), `--text-2xl` (24px), `--text-xl` (20px). The mapping is not "*a* heading scale" — it is *the* original scale, recovered. This strengthens AC2 (the restoration is provably faithful, not a re-design). Correct R2 to cite the git provenance; downgrade the "flag for reviewer visual sign-off" to a confirmation rather than a judgment call. (Not blocking — the mappings are right; only the plan's self-assessment is overcautious.)

---

### SUGGESTION

- **[plan §Gate spec step 2 / §73] `.html` reference/mock files are out of scan scope by extension — confirm intentional.** The globs are `.css`/`.ts`/`.tsx` only. If any shipped `.html` (e.g. design-system reference mockups) carries `var(--…)`, the gate won't see it. Likely fine (mockups aren't shipped styling), but state it explicitly alongside the test/story exclusion rationale so the scope boundary is a decision, not an omission.

- **[plan §AC3 / §125] AC3's unit test should assert the *line number* and *file-relative path* are reported, not just the token name.** The AC requires the gate name "the file and the token." The plan's `findUndefinedReferences` returns `{line, token}` (good) but the AC3 test description only asserts "both reported with token name." Add an assertion on `line` so the file+line+token contract is actually proven, matching the CLI's `<relpath>:<line>` output (§77).

- **[plan §protectedTests / §200] The protected-test lockstep plan is correct — note for the record it strengthens, not weakens.** Verified `ThreadSections.conversations.test.tsx:210` asserts `/3px solid var\(--danger\)/`; changing the matcher to `var(--status-error)` while keeping the structural assertions (L211 `color-mix`, L213-215 sticky/top-0) preserves the contract against a *defined* token. The DoD audit instruction (only the token name in the `borderLeft` matcher may change) is exactly right. No change needed.

---

### What's Working Well

- **The gate-mechanism design-it-twice is genuine, not theatre.** Option A (eslint rule) is rejected for a real, verified constraint — ESLint's design globs are `*.{ts,tsx}` and cannot see `body-editor.css`/`index.css` where 16 of the dead tokens live, so a rule would catch half the surface and silently pass the worse half (the exact "passes but broken" failure the AC forbids). The standalone-guard choice reuses a proven, thrice-precedented pattern (`nimmly-guard`/`demo-fixture-guard`) with a unit-testable `checkContent` export and `verify`-tier wiring. Boring technology, correctly chosen. Confirmed `nimmly-guard.ts` provides exactly the template claimed (walker, `--check` CLI, exclusion patterns, pure exports).

- **The token mapping is semantically accurate and verifiable.** Every one of the 18 dead tokens confirmed undefined in `tokens.css`/`index.css` `:root`; every replacement confirmed defined. The runtime-allowlist-from-tokens.css discovery (parse `--name:` declarations into a Set) is the right call — single source of truth, auto-tracks AI6's future additions, kills the two-lists-drift bug class AI1 exists to eliminate. The auto-updating allowlist is the architectural high point.

- **Scope discipline is clean on the dimensions checked.** No new tokens; `tokens.css` read-only; Settings files touched only for AI1's token dimension; the path-traversal security note (§184) is correctly Applicable+Addressed (hardcoded roots, no input-derived paths) and the rest correctly N/A. The CLAUDE.md static-property rule is honored — AC1/AC3 are enforced by the guard + unit tests on imported logic, not `readFileSync` filesystem tests.
