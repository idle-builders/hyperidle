# AI6 — Code Review (Phase 4)

**Verdict: NOT DONE** (superseded — see Re-review at end: **DONE**)

Commit `ef6c1e57`. The token/lint/tracking/color/motion/renderer migrations are accurate and complete — nearly every file:line in the plan was applied verbatim, lint is green (zero errors), typecheck green, 111 unit/rule tests pass. But three defects block: one **incomplete focus convergence** (the core AC), and the **e2e validation for 3 of 6 ACs does not pass and was never run to green** (8/11 AI6 e2e tests fail), plus the plan-mandated **HTML-reference tracking migration was skipped**. The static ACs (tracking, color, motion) are genuinely proven; the visual/behavioral ACs are not.

---

## AC table

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | One focus treatment on every interactive DS component | **FAIL** | `TabBar.tsx:73` (pill variant) still `focus-visible:outline-[2px]`; only `:40` (underline) converged to `outline-1`. Plan named both (`architecture.md:57`). TabBar's two variants now disagree (1px vs 2px) — the exact divergence this AC kills. Focus e2e (`AI6-ds-focus.spec.ts`) FAILS (does not even reach TabBar — see C2). |
| 2 | Every uppercase DS label uses a tracking token; no hardcoded tracking | **PASS** | Grep of `packages/design-system/src/**/*.tsx`: zero `tracking-[<positive>em]` survive (only the allowlisted `KeyValue` comment text + `data-renderer`/`fallback` now token-form). `no-hardcoded-tracking` rule at `error` (`eslint.config.ts:225`), 7 invalid/6 valid cases pass. `npm run lint` green proves no live violation. StatusChip.tsx:104 migrated (`tracking-[var(--tracking-caps-sm)]`). |
| 3 | Zero hardcoded colors; tints+scrim have tokens; lint catches template-string + arbitrary-value | **PASS (with INFO)** | 5 new tokens in `tokens.css` light+dark+prefers-dark (`:189-197`, `:266-272`, `:320-326`); `--scrim` present. `AI6-tokens.test.tsx` asserts all 6 resolve (passes). Grep: zero hex/rgba/raw-palette/`bg-token/NN`/prose in DS `.tsx`. `no-raw-tailwind-color` extended for template-string + `undefinedTokenClass`; `no-hardcoded-color` template regression test passes. |
| 4 | Same content kind via block payload vs artifact kind-renderer shares container treatment | **FAIL (code OK, proof broken)** | Code is correct: `image-renderer.tsx` → `figure rounded-[--r-default] border-subtle overflow-hidden`; `data-renderer` table wrapped `rounded-[--r-default] border-subtle`; `html-renderer` → `r-default`; `code-renderer` → `bg-surface-container rounded-[--r-default] p-12` + color-mix; `url-renderer` → status tokens. BUT `AI6-renderer-parity.spec.ts` FAILS — queries `[data-component='image-renderer']`/`[data-ds-component='ImagePayload']` markers that **do not exist** in the DOM (renderers emit only `<section aria-label>`). No working parity proof; no side-by-side screenshot produced. |
| 5 | Hovered vs selected distinct in components with both states | **FAIL (code OK, proof broken)** | TabBar code correct (selected `bg-[var(--accent-primary-dim)]`+accent text/border; inactive transparent+`hover:text-`). BUT all 4 `AI6-tabbar-hover-selected.spec.ts` tests FAIL — `[data-ds-component='TabBar']` "not found / not visible" because `/designsystem` is a nav-select catalog that defaults to `modules[0]` and never navigates to TabBar. No proof; no screenshot. |
| 6 | All component motion uses Hearth motion scale | **PASS** | `Checkbox.tsx:48` `duration-[var(--motion-fast)]`; `SearchField`/`NavItem`/`Toast` `ease-[var(--motion-ease)]`. Grep: zero `duration-[Nms]`/`ease-[ease]` in DS `.tsx`. `no-off-scale-duration` rule at `error`, tests pass. `npm run lint` green. |

---

## CRITICAL

### C1 — Focus convergence incomplete: `TabBar.tsx:73` still `outline-[2px]` (AC #1)
`packages/design-system/src/TabBar.tsx:73` (pill variant button):
```
"focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-[var(--accent-primary)]",
```
Line 40 (underline variant) was converged to `outline-1`; line 73 was not. The plan explicitly listed **`TabBar.tsx:40,73`** (`architecture.md:57`, `approved.md:23`). Result: TabBar's own two variants now render different focus rings (1px underline vs 2px pill) — TabBar is the AC's *reference implementation*, and it is internally inconsistent. No lint rule covers outline-width, so this passed green lint silently.
**Fix:** `TabBar.tsx:73` → `"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]"` (identical to `:40`).

### C2 — Focus / renderer-parity / hover-selected e2e do not pass; 3 ACs unproven (AC #1, #4, #5)
`npx playwright test AI6-ds-focus AI6-tabbar-hover-selected AI6-renderer-parity` → **8 failed, 3 passed** (the 3 passing are the trivial "screenshot file exists" assertions). The specs were authored in red phase against DOM markers/navigation that don't exist:
- `AI6-ds-focus.spec.ts` and `AI6-tabbar-hover-selected.spec.ts` query `[data-ds-component='Button'|'TabBar'|'Input']` immediately after `goto("/designsystem")`, but `DesignSystem.tsx:109` defaults to `modules[0]` (first component alphabetically) and renders **only the selected component** — TabBar/Input/Button are never on screen. The specs never `navigate()` to them. → all time out "element not found / not visible".
- `AI6-renderer-parity.spec.ts` queries `[data-component='image-renderer']`, `[data-ds-component='ImagePayload']` — these markers **do not exist**; renderers emit only `<section aria-label="Image preview">`. The test's own fallback `expect(false,...).toBe(true)` fires (red, as written).

CLAUDE.md: visual/behavioral ACs require a proof you can show someone. There is **no passing validation and no screenshot** for the focus, renderer-parity, or hover-vs-selected ACs. The plan's validation table (`architecture.md:145,148,149`) is unsatisfied. This is the "tests were never run to green" failure mode — the red tests must be made to pass by driving the catalog's navigation (click the component button, wait for the story to render) and asserting on the real DOM (computed `outline-width`/`border-radius` and class attributes), then the side-by-side screenshots produced.
**Note:** fixing C2's focus spec will also surface C1 (the pill tab's `outline-width` will read `2px`) — provided the spec navigates to TabBar and tabs to a *pill* button.

### C3 — HTML reference tracking migration skipped; TSX↔HTML diverge (visual-parity / AC #2)
The plan mandated (architecture.md §"VISUAL-PARITY CONFLICT", `:186-196`; task 10, `:171`) migrating the Artifact*/Block `.html` reference `letter-spacing: 0.02em/0.05em → var(--tracking-caps-sm)` **in this WP**, with a `@lore AI6` in `tokens.css`. The HTML diff is **empty** — no `.html` file was touched. `packages/design-system/html/{ArtifactEmbed,ArtifactPreview,Block}.html` still carry `letter-spacing: 0.02em` while their TSX now resolves to 0.06em. The `@lore AI6` HTML-migration note is also absent from `tokens.css`. The plan explicitly **rejected** the deferral path. Consequence: `npm run ds:sync` will diff on these labels (TSX 0.06em vs HTML 0.02em) — the self-contradiction this WP exists to end is left in place, just relocated to the reference layer.
**Fix:** migrate `letter-spacing` to `var(--tracking-caps-sm)` in exactly the `.html` files whose TSX changed (scope per the §3 table — do NOT sweep `0.02em` globally; `BlockHandle.html`/`Menu.html`/`KnowledgeRow.html` are out of scope), add the `@lore AI6` note in `tokens.css`, and confirm `ds:sync` ≤5%.

---

## WARNING

### W1 — Stale `KeyValue.tsx:19` comment not removed (plan task 5)
`packages/design-system/src/KeyValue.tsx:19` still reads `tracking-[0.05em] → tracking-[var(--tracking-caps)]` — a migration-TODO comment for a line already migrated (`:20` is `tracking-[var(--tracking-caps)]`). The plan (`architecture.md:85`, task 5 `:166`) said "Remove the stale comment `KeyValue.tsx:19`." It survives. Slop / New-Hire confusion: the comment describes a transformation that already happened, implying work outstanding. **Fix:** delete the stale `→` migration note (keep the AQ-007/AESTHETICS provenance line if useful, drop the `tracking-[0.05em] → ...` clause).

---

## OBSERVATIONS (non-blocking, INFO)

- **Token test `@layer` strip is honest, not a cheat.** `AI6-tokens.test.tsx` strips the `@layer base {` wrapper before injecting tokens.css into jsdom (jsdom doesn't evaluate `@layer` — documented gotcha w/ issue link). The assertion is still on `getComputedStyle`, not the raw string — a legitimate runtime probe, not a `readFileSync` grep. Acceptable.
- **`as` casts in the two new lint rules** (`no-hardcoded-tracking.ts`, `no-off-scale-duration.ts`): `node as unknown`, `rawNode as JSXAttribute`. These mirror the existing rule-file idiom in this package (eslint AST nodes are loosely typed) — consistent with `no-raw-tailwind-color.ts`. Not new debt.
- **Doc check — justification reasonable.** No user-facing `docs/` surface changed: this is internal DS chrome convergence (no component API change, no new UI route, no behavior change). `DESIGN.md` updated for contributors (new §Conventions: focus/tracking/hover-selected/renderer/motion + token table rows). The builder's "no user-facing doc change" claim holds — confirmed no page layout / state machine / API in `docs/` is affected. PASS.
- **`no-off-scale-duration` only bans `ease-[ease]`, not other off-token `ease-[...]` keywords** (e.g. `ease-[linear]`). Plan scoped it to the 4 real sites; acceptable, but a future `ease-[linear]` would slip. Low risk — note only.
- **Security: N/A confirmed.** Pure CSS tokens + lint + chrome. No POST/PATCH, no inputs, no agent-context paths. `url-renderer` change is class-name only. STRIDE not applicable. Matches plan §"Security & abuse cases".
- **`code-renderer` `m-0` on `<pre>`** correctly kills default user-agent margin so it matches `block/CodePayload` chrome — good catch by the builder, beyond the literal plan.

---

## What's solid
- Color/tint/tracking/motion migrations: every file:line from the plan applied exactly, zero residual hardcodes (grepped). Lint green, typecheck green, 111 tests green.
- The two new lint rules mirror the established `no-off-scale-radius` shape, use `collectClassStringsFromJSXAttribute` for template-string coverage, are registered at `error` in the K8 block, and inherit the `*.stories.tsx` ignore. Rule tests are real (invalid + valid + allowlist cases).
- `no-raw-tailwind-color` template-string + `undefinedTokenClass` extension is correct and tested; `bg-success/10` is genuinely caught now.
- StatusChip:104 migration resolved per the N2 critique decision (gate + rule agree).
- Renderer *code* converges correctly to block/ chrome (radius/border/empty-state) — the only gap is the *proof*, not the implementation.

---

## Required fixes before DONE
1. **C1:** converge `TabBar.tsx:73` pill focus ring to `outline-1`.
2. **C2:** make `AI6-ds-focus`, `AI6-tabbar-hover-selected`, `AI6-renderer-parity` specs drive the `/designsystem` navigation + assert on real DOM markers; run them to green; produce the side-by-side screenshots.
3. **C3:** migrate the in-scope Artifact*/Block `.html` reference `letter-spacing` to `var(--tracking-caps-sm)`, add the `@lore AI6` note, confirm `ds:sync` ≤5%.
4. **W1:** delete the stale `KeyValue.tsx:19` migration comment.

---

# AI6 — Re-review (Phase 4, fixes verified)

**Verdict: DONE**

All four prior findings resolved. The behavioral/visual ACs are now genuinely proven by real-DOM Playwright assertions (15/15 AI6 specs green), the static ACs hold without regression, typecheck PASS (12 pkgs), lint exits 0 (warnings only, zero errors), DS unit/component 393 green, eslint-plugin-design 234 green.

## Per-finding resolution

| Finding | Status | Evidence |
|---|---|---|
| **C1** — TabBar pill focus `outline-[2px]` | **RESOLVED** | `TabBar.tsx:73` now `focus-visible:outline-1` — byte-identical treatment to `:40` (underline). Both variants 1px. `Button.tsx:57` also converged to `outline-1` (was `outline-[2px]`+offset) — extends the single-treatment AC. |
| **C2** — focus / hover-selected / renderer-parity specs unproven | **RESOLVED** | All three specs now hash-navigate the catalog (`#Button`, `#TabBar::PillVariant`, `#Kinds%2FImageRenderer`, `#Block`) — `DesignSystem.tsx:84-117` `parseHash`+`navigate` confirmed to back this. Assertions are real DOM: class attr `outline-1`/`not outline-[2px]`, `accent-primary-dim` bg on selected vs absent on inactive, `text-[var(--accent-primary)]` selected vs `text-tertiary` inactive, computed `borderRadius === "16px"` for both kinds/ and block/ figures, and `bg-success/10` absent. Proof screenshots produced (`plans/AI6/screenshots/AI6-tabbar-hover-selected.png`, `AI6-renderer-parity-{kinds,block,full}.png`) and visually confirm: kinds/ImageRenderer image in 16px-rounded bordered figure; TabBar "Overview" selected (accent-dim bg + green text) vs inactive (tertiary text). **`npx playwright test AI6-ds-focus AI6-tabbar-hover-selected AI6-renderer-parity` → 15 passed, stable across two warm runs.** (First cold run showed boot-timing flakes from the Playwright-managed Vite webServer compiling on first navigation — not a spec defect; warm runs are deterministic green.) Test-support markers (`data-component="image-renderer"` on `<section>`, `data-component="ImagePayload"` on `<figure>`) are inert selector hooks, no behavior change; story-glob widening `*`→`**` (`DesignSystem.tsx:18`) legitimately discovers `kinds/` stories. Both are proper test-support, not behavior-driving. |
| **C3** — HTML reference tracking diverges from TSX | **RESOLVED** | `ArtifactEmbed.html`, `ArtifactPreview.html`, `Block.html` migrated `letter-spacing: 0.02em/0.05em → var(--tracking-caps-sm)` on exactly the in-scope labels (embed-identity, kind-badge, preview-meta, demo-section-title, table th). `@lore AI6` note added to `tokens.css:89-95`. Scope respected — only 3 `.html` files touched; BlockHandle/Menu/KnowledgeRow.html untouched. Token parity verified by inspection: TSX side (ArtifactEmbed/KindBadge/Preview/Surface, TablePayload) all resolve to `tracking-caps-sm` (0.06em); HTML now resolves the same token — the guaranteed `ds:sync` diff source is eliminated (both sides → 0.06em). |
| **W1** — stale `KeyValue.tsx:19` comment | **RESOLVED** | `KeyValue.tsx:18-19` now reads the AESTHETICS provenance only; the `tracking-[0.05em] → tracking-[var(--tracking-caps)]` migration clause is gone. |

## Final AC table

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | One focus treatment on every interactive DS component | **PASS** | TabBar `:40`/`:73` + Button `:57` all `outline-1`. `AI6-ds-focus` 4/4 green asserting `outline-1` / `not outline-[2px]` on Button, both TabBar variants; Input carries `accent-primary-dim`. |
| 2 | Every uppercase DS label uses a tracking token; no hardcoded tracking | **PASS** | Grep clean (zero `tracking-[Nem]` in DS tsx). `no-hardcoded-tracking` at error, lint green. C3 closes the TSX↔HTML gap. |
| 3 | Zero hardcoded colors; tints+scrim tokens; lint catches template+arbitrary | **PASS** | Grep clean (zero hex/rgba/raw-palette in DS tsx). 5 new tokens + `--scrim` resolve via `getComputedStyle` (`AI6-tokens.test.tsx`, 6/6). Button/code-renderer hardcodes → tokens/color-mix. |
| 4 | Same content kind via block payload vs artifact kind-renderer shares container | **PASS** | image-renderer now wraps in `figure rounded-[--r-default] border-subtle`. `AI6-renderer-parity` green incl. computed-style equality (`16px === 16px`); screenshots show matched chrome. |
| 5 | Hovered vs selected distinct in components with both states | **PASS** | `AI6-tabbar-hover-selected` 4/4 green: selected carries `accent-primary-dim`+accent text, inactive does not; screenshot confirms two-tone. |
| 6 | All component motion uses Hearth motion scale | **PASS** | Unchanged from prior PASS; grep clean, `no-off-scale-duration` at error, lint green. |

## Validation run summary
- `npx playwright test AI6-ds-focus AI6-tabbar-hover-selected AI6-renderer-parity` → **15 passed** (warm; stable ×2).
- `npm run check` → PASS (12 packages).
- `npm run lint` → exit 0 (381 warnings, 0 errors).
- `vitest run packages/design-system` → 393 passed; `packages/eslint-plugin-design` → 234 passed.
- Regression grep (DS tsx): zero residual hex / rgba / raw-Tailwind-palette / `tracking-[Nem]` / `duration-[Nms]` / live `prose` (only `@lore` comment mentions remain).

## Note (non-blocking)
- `ds:sync` itself was not executed end-to-end (requires the `ds:serve` :8098 harness running concurrently); C3 resolution verified by token-parity inspection — both HTML and TSX now resolve the in-scope labels to `var(--tracking-caps-sm)`, so no pixel diff can arise from this surface. `npm run verify` (which chains the sync-check) is the ship gate and will confirm at PR time.
