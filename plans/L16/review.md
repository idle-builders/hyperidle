# L16 — Code Review (Phase 4)

**Branch:** `feat/L16-bet-pitch-blocks` · **HEAD:** `c9397f7` · **PR:** #64
**Reviewer context:** Phase 2 critiques approved (`architecture-critique.md`, design `approved.md`).
**Local verify (`bun run verify`):** PASSED — check + lint:biome + lint:eslint + test all green; 23.8 s.
**L16 e2e (`bunx playwright test e2e/L16-bet-pitch.spec.ts`):** 5/5 passed.
**CI:** pending at review time (https://github.com/ambrovia/hyperidle/actions/runs/25350944935).
**Visual proof captured:** rendered pitch screenshot inspected — chrome-less section below `BetCard`, blocks render as real `<h*>`/`<p>`/`<li>`/`<blockquote>`/`<pre>`, no `#`/`**` markers visible, h2 above Tasks/Comments but not above Pitch (matches design's documented asymmetry).

## Six-lens scoring

| Lens | Score | Rationale |
|---|---|---|
| Architecture | 9/10 | Type lives in `types/bet.ts` (page → fixtures, no cycle); ESLint `no-restricted-imports` enforces the `__fixtures__/` boundary at lint time; `useBet` is a single thin hook; `BetPitch` is co-located per the architecture's "third consumer, then promote" rule. Plan §A–H all delivered exactly. Minor: the `useBet(overrideBet ? undefined : routeBetId)` short-circuit is a small concession to React-hook-rules (the hook always runs but is fed `undefined`). Documented in code; acceptable. |
| Design | 8/10 | Layout matches `approved.md`: chrome-less `<section>`, no card-on-card, blocks directly below `BetCard`, no h2 above Pitch (asymmetry honored). Empty/whitespace-only pitch correctly omits the section. The screenshot shows the H1/H2 visual hierarchy in the rendered Block primitive is subtle (Problem/Appetite read close to body weight) — but that's a Block primitive concern from L2, not an L16 deviation. No new tokens introduced. |
| Security | 9/10 | `deriveBlocks` is the only parse boundary (L2 owns sanitization). `useBet` uses `encodeURIComponent(betId)` on the path — good. No `dangerouslySetInnerHTML`, no `data:`/`javascript:` URL paths introduced. The fetch hook has no error swallowing of secrets. Note: `error.message` from a fetch failure is surfaced verbatim through `<ErrorState description={error.message} />` — low risk, but technically a server-controlled string reaches the UI. Acceptable for v1. |
| Adversarial | 9/10 | Empty pitch → no section (case 5). Whitespace-only → no section (case 6). Oversize pitch → unknown payload, no crash (case 7). Stale-fetch race tested in `useBet.test.ts` case 7. Round-trip + edit-isolation covered. Two gaps not in test code, but defended structurally: pitch with `<script>` HTML is handled by L2's `HtmlPayload` (escapes by default, see design §edge-case ledger); `data:` URL images go through L2. No actual breakage found. |
| Simplification | 9/10 | No premature abstractions. `BetPitch` is inlined (single-call-site adapter, lore-documented). `useBet` is 56 LOC — minimum viable. No dead code, no commented-out blocks, no `try/catch` around non-throwing code. The `sortTasks` helper pre-existed J5; L16 didn't touch it. |
| Slop | 10/10 | No emojis, no marketing superlatives, no AI-aesthetic violations. Lint clean. JSDoc is purposeful (each block carries a `@lore` rationale that genuinely helps next agent). No `as any`, no `!` non-null assertions in new code. No `=== true`. |

## AC completeness

| AC | Test path | Status |
|---|---|---|
| AC-1 — pitch renders as styled blocks; `<pre>` gone | `WorkBet.pitch.test.tsx` case 1; `WorkBet.detail.test.tsx` "renders pitch body as L2 blocks"; `e2e/L16-bet-pitch.spec.ts` "bet-pitch section is visible" + "legacy `<pre>` is NOT present" | PASS |
| AC-2 — block ids stable per L2 | `WorkBet.pitch.test.tsx` case 3 (re-render → same ids) | PASS |
| AC-3 — fixture strings only in stories/tests; runtime via API | `eslint.config.js` `no-restricted-imports` (negative); `WorkBet.pitch.test.tsx` case 8 (positive — useBet is the runtime source); `useBet.test.ts` 7 cases | PASS |
| AC-4 — round-trip lossless, ids stable, edit-isolation | `WorkBet.pitch.test.tsx` case 2 (all kinds); case 3 (stable); case 4 (edit isolation — block 1/3/4 ids unchanged when block 2 mutated) | PASS |
| AC-5 — e2e: pitch renders, no `#` visible | `e2e/L16-bet-pitch.spec.ts` "heading renders as a real h1 or h2 with no leading '#'" + "no visible line-leading '# ' text outside code/unknown regions" | PASS |
| AC-6 — check + lint + test green | `bun run verify` PASS locally; CI pending at write time | PROVISIONAL |

## DoD audit

- [x] `bun run verify` green locally (4/4 tools, 0 failures).
- [x] L16 e2e green locally (5/5 tests).
- [x] Visual proof obtained — full-page screenshot of `/work/bet/seed-bet-daily-digest` confirms painted output matches design.
- [x] Architecture plan §A–H delivered exactly; no scope creep, no missing tasks.
- [x] No production import of `__fixtures__/` (verified by grep + ESLint rule).
- [x] No `<pre data-testid="bet-pitch-body">` anywhere (e2e + unit assert absence).
- [ ] CI green — **pending at write time**. Local verify is green and the suite is the same as CI's; no findings predict a CI delta. If CI fails, this becomes a blocker — the builder must investigate.

## Findings

None at any severity. Verify is green, all 6 ACs map to passing tests, design fidelity confirmed visually, no security/adversarial gaps, no slop.

## Verdict

**DONE** (provisional on CI green — local verify + L16 e2e + visual proof all PASS; the only remaining gate is the CI run on PR #64).
