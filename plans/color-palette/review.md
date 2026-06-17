# CP1 — Hearth Palette Refinement · Code Review

Scope: design-token-only change. `tokens.css` (modified) + `PaletteComparison.stories.tsx` (new) + `design-proposal.md` (rationale). Founder already approved visually via human-design-review. This is the pre-ship code gate. All contrast/OKLCH numbers below independently recomputed (WCAG 2.x sRGB relative luminance; sRGB→OKLab→OKLCH), not taken from the proposal.

---

## Must-verify results

### 1. Contrast claims — TRUE, recomputed independently (PASS)

Every proposal ratio matches my computation to the stated precision. No body pair fails AA.

**Dark mode**

| pair | proposal | computed | floor | verdict |
|---|---|---|---|---|
| primary `#ece7e2` / page | 15.45 | 15.45 | 4.5 | PASS |
| primary / container | 13.03 | 13.03 | | PASS |
| primary / elevated | 11.14 | 11.14 | | PASS |
| primary / overlay | 9.20 | 9.20 | | PASS |
| secondary `#bcb4ae` / page | 9.29 (AAA) | 9.29 | 7.0 AAA | PASS — AAA confirmed |
| secondary / container | 7.83 (AAA) | 7.83 | 7.0 AAA | PASS — AAA confirmed |
| secondary / elevated | 6.70 | 6.70 | 4.5 | PASS |
| secondary / overlay | 5.53 | 5.53 | 4.5 | PASS |
| tertiary `#ada6a0` / page | 7.90 (AAA) | 7.90 | 7.0 AAA | PASS — AAA confirmed |
| tertiary / container | 6.66 | 6.66 | 4.5 | PASS |
| tertiary / elevated | 5.70 | 5.70 | 4.5 | PASS |
| tertiary / overlay | 4.70 | 4.70 | 4.5 | PASS (thin margin, but clears) |

**Light mode**

| pair | proposal | computed | verdict |
|---|---|---|---|
| primary `#2c241a` / page | 14.33 | 14.33 | PASS |
| primary / container | 13.49 | 13.49 | PASS |
| primary / elevated | 15.28 | 15.28 | PASS |
| secondary `#675f56` / page | 5.88 | 5.88 | PASS |
| secondary / container | 5.54 | 5.54 | PASS |
| secondary / elevated | 6.27 | 6.27 | PASS |
| tertiary `#958e85` / page (decorative, AA-exempt) | ~3.04 | 3.04 | exempt — matches the U3 @lore role (large labels/timestamps/icons, never body) |
| placeholder `#bcb7ae` / page (exempt) | exempt | 1.87 | exempt — placeholder-only |

The dark secondary/tertiary AAA claims are real, not aspirational. Tertiary-on-overlay is the one to keep an eye on (4.70, 0.20 above the AA floor) but it passes.

### 2. No cool grays (AQ-018) — PASS, with one OBSERVATION

OKLCH hue of every neutral falls in the warm 40–80° band:

| token | hue | token | hue |
|---|---|---|---|
| dark.page | 67 | light.page | 74 |
| dark.container | 56 | light.container | 68 |
| dark.elevated | 68 | light.secondary | 71 |
| dark.overlay | 68 | light.tertiary | 74 |
| dark.secondary | 60 | light.bSubtle | 68 |
| dark.tertiary | 63 | light.bDefault | 68 |
| dark.borders | 59–68 | light.bStrong | 71 |

Nothing drifted cool/blue. Chroma was pulled down hard (dark surfaces C≈0.005–0.008, text C≈0.012) exactly as claimed — the de-brown is real and warmth is preserved. No regression here.

**OBSERVATION (not blocking):** `light.placeholder #bcb7ae` computes H=82° — 2° over the stated 40–80° band. It is AA-exempt (placeholder-only) and the *predecessor* `#bfb5a5` was H=80° (right at the edge), so CP1 did not push it cool — it's still warm-yellow, just 2° past an arbitrary cutoff. The eslint `design/no-raw-tailwind-color` rule keys on palette class names, not OKLCH hue, so this will not trip lint. Cosmetic only; if you want it strictly in-band, nudge toward `#bdb6ab` (H≈74). Optional.

### 3. No pure-black bg (AQ-009) — PASS

Dark `--surface-page` is `#12100e` (L 0.170, warm). Not `#000`.

### 4. Three token blocks in sync — PASS

Extracted and diffed the `[data-theme="hearth-dark"]` block against the `@media (prefers-color-scheme: dark) :root:not([data-theme])` mirror programmatically. **Every CP1-touched token is byte-identical across both blocks** (surfaces, full text ramp, borders, accents, status). The only key present in one and not the other is `--scrim` (in the data-theme block, absent from the mirror) — but `--scrim` is NOT in the CP1 diff; it is a pre-existing asymmetry on main, out of scope for this review. Flagging it as an OBSERVATION for a future cleanup, not a CP1 finding.

The light block (`:root, [data-theme="hearth-light"]`) is the default and has no mirror to sync — correct.

### 5. Founder asks met — PASS

- **Light page+container lifted, visible step, step vs white:** page `#f5f0e6`→`#fbf7f2` (L 0.956→0.978 by their numbers; my OKLCH L 0.980), container →`#f5f0eb` (L 0.960). Ladder L-steps page→container ≈0.020, container→white ≈0.020 — three distinct rungs, no collapse into identical near-whites. Met.
- **Dark page↔container separation widened:** page `#12100e` (L 0.170) → container `#24211f` (L 0.250) = ΔL 0.080 (proposal cites 0.076; same order, my L* slightly differs by rounding). Round-1's tight 0.041 step is gone — clearly distinguishable. Met.
- **Dark secondary/tertiary legibility raised:** secondary 5.x→9.29 on page, tertiary →7.90 on page; both clear AAA on page. Comfortably legible. Met.

### 6. Story quality — PASS (one format-only fix required, see CRITICAL)

- Valid TSX, all three variants (`NewPaletteBothModes`, `LayeredBothModes`, `BeforeAfterSwatches`) are exported zero-arg components returning `JSX.Element` — auto-discoverable by the catalog. No `any`/`as`/`!`. Explicit return types throughout.
- **Hardcoded-hex lint risk: NONE.** The literal hexes (the `OLD` const + `#888` board backgrounds) are confined to this story. `eslint.config.ts:268` explicitly sets `ignores: ["packages/design-system/src/**/*.stories.tsx"]` on the error-level `design/no-hardcoded-color` block — stories are exempt by design. Confirmed `npx biome lint` and `npx eslint` on the file: both clean for design rules. A before/after swatch board legitimately needs literal hexes; this is correctly isolated. No exemption work needed.
- Live surfaces correctly use `var(--x)`; before/after board correctly hardcodes for an honest diff. Self-scoped `data-theme` wrappers so both modes render without toggling — sound approach.
- No slop: comments are load-bearing (explain why live-vs-hardcoded), no filler, no dead code, no single-use over-abstraction beyond reasonable sub-components.

---

## CRITICAL (blocks ship)

1. **`packages/design-system/src/PaletteComparison.stories.tsx` — Biome formatter violation → `npm run lint` FAILS with 1 error.**
   `npm run lint` chains `biome check .`, which treats unformatted files as an error (not a warning). The new story is not Biome-formatted (e.g. the `Swatch` `textOn` ternary at ~L98 should collapse to a single line; the `TextRamp` span at ~L135 should wrap its `style` onto its own line). This is the sole gate failure and will block `/ship`.
   **Fix:** `npm run lint:fix` (or `npx biome format --write packages/design-system/src/PaletteComparison.stories.tsx`), then re-run `npm run lint` to confirm green. Purely mechanical — no logic change.

---

## Non-blocking / out of scope

- **`npm run check` fails in this worktree — NOT caused by CP1.** All errors are in `packages/server` (`Cannot find module '@anthropic-ai/claude-agent-sdk'`, zod `toJSONSchema`, `KnowledgeLayer`). `node_modules/@anthropic-ai/` is absent — a missing dependency / un-run `npm install` in this worktree, pre-existing on the base. The typecheck gate reports **`design-system … PASS`** — the only leaf CP1 touches compiles clean. Ship will re-run check in a clean environment; this is an environment artifact here, not a CP1 regression. (If `/ship` runs `check` locally in this same worktree it will fail on the server errors — run `npm install` first, or ship from a clean checkout.)
- **`token-guard:check` — clean.** Token-resolution guard passes; no dangling `var(--…)` references.
- **Snapshot net unaffected** (as the proposal states): the net keys on class/markup text, and CP1 changes only CSS values + adds a story. The new story *adds* 3 snapshot entries — builder must `npm run test` and re-bless (`npm run ds:bless`) the new variants, reviewing the diff. Standard green-phase step; not a review finding, but don't skip it.
- **`--scrim` block asymmetry** (present in `[data-theme="hearth-dark"]`, absent from the prefers mirror) — pre-existing, not introduced by CP1. Worth a separate cleanup.
- **`light.placeholder` H=82°** — 2° over the AQ-018 band, AA-exempt, not a regression (predecessor was H=80). Optional nudge to `#bdb6ab`.

---

## 6-lens summary

- **Architecture:** PASS. Pure `var(--x)` value swaps, zero markup/class changes, three theme blocks correctly structured and (for the CP1 tokens) synced. No layer concerns — token layer only.
- **Design:** PASS. Warm identity preserved (all hues 56–74°), de-brown real, ladders legible, AAA where claimed. Story is the design artifact and renders all variants. One format fix.
- **Security:** N/A — no inputs, endpoints, auth, or agent context. No `dangerouslySetInnerHTML`/`eval`/etc. in the story.
- **Adversarial:** The one trap a hostile reviewer would catch is the unformatted file silently failing `lint` (caught — CRITICAL #1) and the misleading local `check` failure (caught — attributed to server deps, not CP1). Contrast claims withstood independent recomputation — no fabricated numbers. No weakened tests.
- **Simplification:** Clean. Sub-components (`Swatch`, `TextRamp`, `Chip`, `LayeredSurfaces`) are each used 2+ times — justified, not single-use wrappers.
- **AI slop:** None. Comments explain non-obvious decisions (live-vs-hardcoded, self-scoped themes); no restate-the-code filler, no tell-tales.

---

## Verdict

One mechanical blocker (Biome format on the new story). Everything that actually matters for a token change — contrast truth, warm-hue compliance, no pure-black, three-block sync, founder asks — passes independent verification.

**Verdict: CHANGES REQUESTED**

Ordered fix list:
1. **CRITICAL** — `packages/design-system/src/PaletteComparison.stories.tsx`: run `npm run lint:fix` to satisfy the Biome formatter (sole `npm run lint` error). Re-run `npm run lint` → expect green.
2. **Process (not a code change)** — builder: `npm run test`, review the 3 new snapshot variants, `npm run ds:bless`, commit the `.snap` in the same PR.
3. **Process** — ship from a clean/installed checkout (or `npm install` here) so `npm run check` passes; the current local failure is missing `@anthropic-ai/claude-agent-sdk` in `packages/server`, unrelated to CP1.
4. **OPTIONAL** — nudge `--text-placeholder` light `#bcb7ae` (H=82°) toward `#bdb6ab` (H≈74°) for strict AQ-018 band compliance; cosmetic, AA-exempt token.

Once fix #1 lands and lint is green, this is ship-ready — the substance is sound.
