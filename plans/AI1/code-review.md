# AI1 — Code Review (Phase 4)

> **FINAL VERDICT (Round 2): DONE.** All three round-1 visual-proof gaps resolved by commit `531fc228` (screenshots only, **zero code change** since round-1 HEAD `d213e49e` — `git diff d213e49e..HEAD -- ':!plans'` empty). Round-1 body retained below for trail; see **Round 2** section at bottom for resolution.

---

## Round 1 (verdict at the time: NOT DONE)

**Verdict: NOT DONE** — code is correct and contract-faithful; the **required visual proof for AC2 (TaskSheet dividers) and AC4 (assistant-settings feedback) is missing or captures the wrong surface.** Track proof bar is explicit: "consistency proven by LOOKING at screenshots." Two of the four AC2 surfaces are not visually proven. Code-level findings are all NOTE — no CRITICAL/WARNING in the code itself. The gap is evidence, not implementation.

Reviewer-run verification (live tree, not builder claims):
- `token-guard:check` → **exit 0, clean** (AC1/AC6).
- Inject `var(--does-not-exist-zzz)` into `index.css` → gate **exit 1**, output `packages/web/src/index.css:64  undefined token --does-not-exist-zzz` (file+line+token) (AC3).
- `tokens.css` diff vs origin/main → **empty** (no new tokens, contract honored).
- All 17 replacement targets confirmed defined in `tokens.css`.
- `npm run test -- AI1-token-resolution-guard ThreadSections.conversations` → **56 passed**.
- `npm run check` → exit 0. `biome check` on changed source → clean. knip clean on guard exports.
- No live dead tokens remain in shipped non-test src (grep): only two residual hits, both inside comments (`@lore U9` documenting `var(--danger)`, `@lore T1` documenting `var(--density-text)`) — stripped by the gate, confirmed by clean exit.

---

## AC Table

| AC | Verdict | Evidence |
|---|---|---|
| **AC1** — zero dangling refs | **PASS** | Gate run by reviewer: exit 0 clean. Full grep of shipped non-test src: no live dead tokens; mapping applied at every site from the plan's table (KnowledgeRow `--mono`→`--font-mono` ×3, TaskSheet `--border-lo`→`--border-subtle` ×6, body-editor 12 tokens, index.css `--density-text*` ×4, CurationSuggestionCard ×2, AgentProfile, CredentialsTab, SettingsAssistant ×3 incl. `--surface-2`, ThreadSections ×3). |
| **AC2** — broken surfaces render intended styling, **verified visually** | **FAIL (partial)** | Editor typography: PASS (`01-body-editor-typography.png` shows headings/bold/italic in DS viewer). Knowledge headings: PARTIAL — `04-knowledge-row-signals.png` proves `--font-mono` signal line, but the `index.css [data-knowledge-body]` h1/h2/h3 typography surface (the actual AC2 target) is **not** captured. TaskSheet dividers desktop+mobile: **FAIL** — `02-tasksheet-desktop.png` / `03-tasksheet-mobile.png` show the empty "No bets yet" Work page, **not an open TaskSheet** with Sessions/Task/Discussion dividers. The headline bug fix (`--border-lo`→`--border-subtle` restoring invisible dividers) is **not visually proven**. |
| **AC3** — undefined-token ref fails gate, names file+token | **PASS** | Reviewer injection test: exit 1, `<file>:<line> undefined token <name>`. 56-test unit suite asserts token+1-based line + comment-strip false-positive handling. |
| **AC4** — status feedback in Hearth colors, never literal red/green | **PASS (code) / PARTIAL (visual)** | Code: PASS — `--color-error, red`/`--color-success, green` fallbacks dropped → `--status-error`/`--status-success` (gate proves resolution; grep confirms no `var(--color-*)` remains). Visual: `02-settings-assistant.png`/`04-settings-page.png` show page-level error text in on-palette muted brick-red (Hearth `--status-error`), corroborating. But the *specific* `SettingsAssistant` save-error/save-success `<p>` states are not captured; `05-settings-assistant.png` is a 404 "Page not found", not the assistant section. |
| **AC5** — `--danger` resolved in lockstep w/ protected test | **PASS** | `ThreadSections.tsx` ×3 → `--status-error`; protected test diff is **one line** (token name in `borderLeft` matcher); structural assertions intact (`color-mix`, `sticky`, `top-0`, 3px). `@lore U9` rewritten to record AI1 migration (no longer asserts false constraint). `01-conversations-blocking-section.png` shows the on-palette red border-left + "Blocking" label rendering correctly. Test passes. Strengthened, not weakened. |
| **AC6** — full verify on clean branch passes, empty allowlist | **PASS** | `token-guard:check` wired into `verify` after `demo-fixture-guard:check`. Gate exits 0 on clean tree. No waiver/allowlist file exists. `check` + lint clean. |

---

## Findings by lens

### Architecture — clean
- Gate decision (standalone script over eslint rule) correctly implemented; covers `.css` + `.tsx` with one `tokens.css`-derived allowlist (auto-tracks AI6). No layer violations (presentation-only).
- Guard test location `packages/db/src/__tests__/` is **correct precedent** — `AF17-nimmly-guard.test.ts` and `AF17-demo-fixture-guard.test.ts` live there. Not a finding.
- DESIGN.md updated with the Token Enforcement Gate section (contributor-facing gate doc). Justification for **no user-facing docs** is reasonable: AI1 changes nothing in the user-visible feature surface, API, or workflow — it restores intended rendering and adds a build gate. No user doc describes these dead-token internals. Correct funnel call.

### Design (UI changed — lens applies)
- All replacements are token→token, on-palette, within the closed Hearth scale. h1 26→24 normalization rendered as planned; `@lore` recording the deliberate 26→24 step is present in `body-editor.css:12-13` (R2 critique correction applied).
- **NOTE** — visual proof gaps (see AC2/AC4 above). No restyling beyond restoring dead-token intent observed in the diff.

### Security — N/A
- No API/input/secret surface. Guard walks hardcoded glob roots under repo, no input-derived paths (path-traversal note from plan honored). Correct.

### Adversarial
- **NOTE [New Hire]** `checkContent(cssSource): Set<string>` is a misleading name — it extracts *defined* token names, it does not "check" anything. Inherited verbatim from the plan's contract signature, so it matches the agreed contract, but the name lies about behavior. Harmless; flag for any future rename.
- No `any`/`as`/`!`/`@ts-ignore` introduced in the guard. `as HTMLElement` casts in the protected test are pre-existing, unchanged.
- Test quality: the 56-test suite genuinely exercises line numbers, fallback non-exemption, nested var(), and the comment-strip false-positive class (the `--bg-canvas`/`@lore` case) — not happy-path-only. Real coverage.

### Simplification
- **NOTE** `runCheck` is exported but consumed only by the in-file CLI block. Matches `nimmly-guard.ts` precedent (also exports an internally-used `runCheck`); not a new smell. Leave for pattern consistency.

### AI Slop — none material
- `@lore AI1 WARNING` comment in the guard documents the real text-strip caveat (legitimate, not filler). Comments restate intent where non-obvious, not the code. No tell-tales.

---

## Required to reach DONE

1. **Capture an actually-open TaskSheet** at desktop + mobile showing the Sessions / Task / Discussion section dividers now rendered via `--border-subtle` (the AC2 headline). Current `02-`/`03-tasksheet-*.png` show the empty Work page — the TaskSheet never opened (no task to open it over). Seed a task or mock the task route so the sheet renders, then screenshot.
2. **Capture the `index.css [data-knowledge-body]` heading typography** (h1/h2/h3 in a rendered knowledge body) — distinct from the KnowledgeRow signal line already captured.
3. **Capture the SettingsAssistant save-error and save-success feedback** `<p>` states (the literal AC4 target), or explicitly document that the page-level on-palette error rendering in `02-/04-settings-page.png` is accepted as equivalent proof. Replace the `05-settings-assistant.png` 404 shot.

All three are evidence-capture, not code changes. Code is correct and the gate works.

---

## Round 2 — visual-proof resolution (verdict: DONE)

Builder pushed `531fc228`: replaced `02/03-tasksheet-*`, added `04-knowledge-body-headings`, `05-settings-assistant-{error,success}`, plus `capture-screenshots.mjs`. Reviewer re-verified:

- **No code regression.** `git diff d213e49e..HEAD -- ':!plans'` → **empty**. Only screenshots + capture script changed. Round-1 code findings (all PASS/NOTE) stand unchanged.
- **Capture method legitimate.** `capture-screenshots.mjs` drives the **real app** via Playwright — real React components, real `index.css` / `body-editor.css` rules, real markdown renderer. Not synthetic HTML. TaskSheet via `/designsystem#TaskSheet::OpenNoIntent`; KnowledgeBody via real `/knowledge/:id` page with mocked item; SettingsAssistant via `/conversations?settings=open` with mocked PATCH 500 / 200. Proof surfaces are the actual AC targets.

| Gap (round 1) | Resolution | Evidence |
|---|---|---|
| **AC2 — TaskSheet dividers, desktop** | **RESOLVED** | `02-tasksheet-desktop.png` shows an **open** TaskSheet (TASK "Implement login endpoint"). Hairline `--border-subtle` dividers visible between TASK / SESSIONS / DISCUSSION / REQUEST section headers — the `--border-lo`→`--border-subtle` fix renders the previously-invisible dividers. Status text ("Couldn't load sessions.", "Failed to load thread / HTTP 500") on-palette muted brick-red. |
| **AC2 — TaskSheet dividers, mobile** | **RESOLVED** | `03-tasksheet-mobile.png` (390px) — same open sheet, same section hairlines visible at narrow width. |
| **AC2 — knowledge-body heading typography** | **RESOLVED** | `04-knowledge-body-headings.png` — real KnowledgeDetail render of `[data-knowledge-body]`. Descending Hearth scale: h1 (largest) → h2 → h3 → h4 (smallest, muted), monochrome ink on canvas — **not** browser-default serif h1-h6. `--mono`→`--font-mono` corroborated by mono metadata-panel values. Distinct from round-1 KnowledgeRow signal-line shot. |
| **AC2 — editor typography** | **PASS (carried)** | `01-body-editor-typography.png` (round 1) + heading scale in `04-` both corroborate the body-editor token migration. Adequate. |
| **AC4 — assistant save-error** | **RESOLVED** | `05-settings-assistant-error.png` — "Could not save soul prompt. Please try again." renders in on-palette muted brick-red (`--status-error`), same desaturated family as the Save button's green. Not browser `red`. The literal SettingsAssistant `<p role="alert">` state, captured. |
| **AC4 — assistant save-success** | **RESOLVED** | `05-settings-assistant-success.png` — "Saved" renders in muted Hearth green (`--status-success`) + disabled "Saved" pill. Not browser `green`. |

### Final AC Table

| AC | Verdict | Basis |
|---|---|---|
| **AC1** — zero dangling refs | **PASS** | Round 1: gate exit 0, full grep clean, mapping applied at every site. |
| **AC2** — broken surfaces render intended styling, verified visually | **PASS** | All four surfaces now visually proven: TaskSheet dividers desktop+mobile (`02/03`), knowledge-body heading scale (`04`), editor typography (`01`). |
| **AC3** — undefined-token ref fails gate, names file+token | **PASS** | Round 1: injection test exit 1 with `<file>:<line> undefined token <name>`; 56-test suite. |
| **AC4** — status feedback in Hearth colors, never literal red/green | **PASS** | Code PASS (round 1) + visual PASS: save-error muted brick-red (`05-error`), save-success muted green (`05-success`), both on-palette. |
| **AC5** — `--danger` resolved in lockstep w/ protected test | **PASS** | Round 1: ThreadSections ×3 → `--status-error`; one-line protected-test diff, structural assertions intact; `01-conversations-blocking-section.png`. |
| **AC6** — full verify on clean branch, empty allowlist | **PASS** | Round 1: gate wired into `verify`, exit 0 clean tree, no waiver file. |

**All 6 ACs PASS. Verdict: DONE.** Code clean since round 1; evidence gaps closed; no new findings.
