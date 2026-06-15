# AJ1 REDO — Code Review (vitest DOM-snapshot net)

**Reviewer:** Phase 4 (warm from Phase 2 plan critique). **Branch:** `feat/AJ1-tsx-redo`. **PR:** #287.
**Scope:** The screenshot/Playwright net was reverted off main; this REDO replaces it with a **vitest jsdom DOM-snapshot net**. Review for correctness + AC completeness against the LOCKED Option-A approach — NOT to reopen the approach decision.

> **Note:** This file previously held the OLD screenshot-era review (PR #287, three rounds, screenshot gate). That review is superseded — its verdict referred to the Playwright golden-PNG net that was reverted (#298). This document is the authoritative AJ1 REDO review.

**Verdict: DONE.** Every AC is genuinely (non-vacuously) met. The snapshot net is proven to catch a one-class restyle and name the component+variant; it is deterministic across runs; baselines are committed; the hard constraints (no Playwright/screenshots/PNGs/Docker in the net, verify chain, or CI) hold. No unresolved CRITICAL.

---

## THE critical check — is the snapshot net non-vacuous?

**1. Code inspection — no silent skip; both guards present and meaningful.**
`packages/design-system/src/__tests__/catalog-snapshot.test.tsx`:
- Enumerates via `discoverStories(import.meta.glob("../*.stories.tsx",{eager:true}), import.meta.glob("../kinds/*.stories.tsx",{eager:true}))` — the viewer's own enumerator, covering BOTH `src/` (49) and `src/kinds/` (7) = 56.
- **Enumeration guard (lines 65–73):** module-level `expect(modules.length).toBeGreaterThan(0)` AND `>= 56` with descriptive messages. A glob returning `{}` (the exact failure mode that made the prior Playwright glob vacuous) fails LOUDLY at collect time. Present and meaningful.
- **Per-variant non-empty guard (lines 253–258):** `expect(serialized.length).toBeGreaterThan(0)` before every `toMatchSnapshot()`. A portal-only / comment-only / broken-serializer tree FAILS rather than snapshotting empty. Present and meaningful.
- The render→serialize→`toMatchSnapshot()` loop has **no `continue`, no try/catch swallow, no conditional skip** (contrast the reverted Playwright gate's silent `if (sections.length===0) continue`). Every variant of every module is rendered and snapshotted.
- `serializeStoryDom` runs `normalizeIds` unconditionally (no early-return path bypasses it).

**2. Empirical proof (the proof AC2 is real) — I restyled a component and the net FAILED.**
- Injected `ZZZ-REVIEW-PROBE` into `StatusChip.tsx`'s dot-span className.
- `npx vitest run --project design-system catalog-snapshot` → **33 tests FAILED**. The diff named `StatusChip > AllStatusVariants/WithLabelProp/UnknownFallback/InContextDemoCard` directly AND every composing component (`BetCard > Active/AtRisk/Draft/Completed/Killed/...`, TaskCard, etc.), each showing `+ <span class="... ZZZ-REVIEW-PROBE ...">`. The net catches a single-class change and propagates it through the composition graph, naming each component+variant.
- **Reverted** the probe → `255 passed`, `git status` clean. (No probe change committed.)

**3. Determinism.** Two consecutive runs both `255 passed`; `git diff` of `__snapshots__/` after the second run is **empty** — byte-identical, no churn. `normalizeIds` covers React 19 `useId` (`_r_N_`), legacy `:rN:`, ISO-8601 timestamps, and 13-digit ms epochs — all the nondeterministic output the DS stories emit (confirmed timestamps render in ArtifactTimestamp/Embed/Preview/Gallery/Stack via `title=`). No flake risk.

**4. Baselines committed.** `packages/design-system/src/__tests__/__snapshots__/catalog-snapshot.test.tsx.snap` is git-tracked, 7552 lines / ~485 KB, text-diffable. All 7 `Kinds/*` stories confirmed present in the baseline — the net covers MORE than the viewer (which does not glob `src/kinds/`).

**Conclusion: the net is non-vacuous and protects the catalogued components.** This is the property the prior attempt failed; the REDO holds it.

---

## AC completeness table

| AC | Status | Evidence |
|---|---|---|
| **AC1** One TSX source of truth; no `.html` refs under DS; no rule/skill/script names HTML/Playwright/screenshots as reference | **MET** | `packages/design-system/html/` gone; no stray `.html` (viewer/index.html exempt). `design-source-guard:check` clean; **empirically non-vacuous** — injected `toHaveScreenshot`/`golden PNG baselines` into a rule file, guard exited non-zero naming file:line+pattern, clean after revert. Guard bans HTML-as-reference AND screenshot-regression language (`golden png/baseline`, `toHaveScreenshot`, `__screenshots__`, `ds:sync…screenshot/pixel/baseline`) while deliberately NOT banning bare "screenshot"/"Playwright" (manual review acts survive — correct). Wired into `verify`. |
| **AC2** Visual regression protects catalogued components via the snapshot net; a rendered change is caught + names the component | **MET (proven)** | See empirical proof above: restyle → 33 failures naming `StatusChip` + all composers. Enumeration guard `>=56` + per-variant `>0` guard both present and meaningful. Auto-enumeration via `discoverStories` (no hand-listing). 56 modules / 255 variant snapshots. |
| **AC3** Viewer renders only TSX; no HTML mode/toggle/iframe; every catalogued component reachable | **MET** | `viewer/main.tsx`: no `RenderMode`/`HtmlComponentView`/HTML-TSX toggle; `isComponentPage` always renders `<TsxComponentView>`. `vite.config.ts` `publicDir:"../html"` removed. `catalog.test.tsx` (AC3 smoke, 256 passed) asserts ≥29 modules, every module ≥1 variant, every variant renders ≥1 DOM element in jsdom — reachability + render proven by import+render, not file-grep. |
| **AC4** `npm run verify` passes locally, no Docker, no skipped/weakened checks; net runs in `test`/`test:all`; `ci.yml` has no Playwright/visual/Docker | **MET** | `verify` chain has NO `ds:sync`/`ds:workbench`/Playwright — runs `…build && desktop build && verify-attest` where `verify-attest` runs `test:all` (root vitest `projects` includes `packages/design-system` → the net runs). `ci.yml` (67 lines): checkout → setup-node → `npm ci` → check → lint → knip → mock-inventory → build(web) → build(desktop) → check-attestation. **No `npx playwright install`, no visual step, no Docker, no deleted-script call.** Net runs inside the attested `test:all`; cannot be bypassed (Z8-166 fix intact). Fast gates reported green by build; I confirmed guard + knip + the two new test files green locally on macOS, no browser/Docker invoked. (Full `test:all`+attestation is the orchestrator's to run.) |
| **AC5** 5 skills + rules describe TSX + vitest-snapshot reality; no Playwright/screenshot/golden-PNG/ds:sync remnants; `visual-parity.md` gone; `visual-regression.md` describes the snapshot net | **MET** | `visual-parity.md` deleted. `visual-regression.md` rewritten to describe the vitest DOM-snapshot net (file, `discoverStories` enumeration, custom serializer + id/ts normalization, committed `.snap`, re-bless via `vitest -u`/`ds:bless`, honest blind-spot statement, "never skip the enumeration/non-empty guard" rules). `design-system.md` gate paragraph rewritten. Grep across `.claude/skills` + `.claude/rules` for `ds:sync\|ds:workbench\|sync-check\|test:visual\|test:workbench` = **zero**. Remaining `ds:bless` references all point at `vitest run -u` (legitimate). Manual `npx playwright screenshot` review acts in `/review`,`/product-deep-review`,`/design`,`/design-critique`,`/visual-polish` correctly preserved (they cover the net's pure-paint blind spot). |

---

## Per-lens findings

**Architecture.** Net reuses `discoverStories()` so net and viewer agree by construction; covers the full DS catalog incl. `src/kinds/`. Serializer is a self-contained custom DOM walk (deterministic attr ordering, class-token order verbatim, data-ds-*/aria-* sorted) — no RTL `prettyDOM` coupling, as the plan chose. No cross-package coupling (DS test globs DS stories only). `verify` is pure script chaining; net rides the attested `test:all`. `vitest.config.ts` `pool:"forks"` retained; the `**/visual-regression*` + `tests/**` excludes are gone (deleted files). Wiring is end-to-end correct.

**Design.** No component `.tsx` source changed and no `.stories.tsx` deleted (the no-restyle / keep-stories constraints honored). The three edited existing tests are benign: `Menu.test.tsx` adds an `act()` flush (stabilizes a focus assertion under parallel load — does NOT weaken the assertion), `U8`/`W2` are comment-only rewordings dropping `.html`/`ds:sync` references. Snapshot baselines are the as-is appearance (no re-bless of a restyle).

**Security.** N/A as planned — no endpoints/inputs/secrets/path/SSRF surface. CI integrity preserved: the net moved from a live CI step into the attested `test:all`, whose real exit code is recorded by `verify-attest` and validated by `check-attestation` (Z8-166). Removing the live Playwright CI steps does not weaken this. Guard filesystem exemptions (`viewer/index.html`, `playwright-report/`) are tooling artifacts, no traversal hole.

**Adversarial.** The saboteur's classic move here would be a silent `continue` or a vacuous enumeration — both are explicitly guarded (and I broke the net on purpose to confirm it bites). The new-hire test: the snapshot file is plain DOM text, readable in PR diff, named by component+variant — far better than the binary PNGs it replaces. The auditor: PR claim ("vitest DOM-snapshot net, no screenshots") matches the diff — Playwright fully out of DS, kept only in web.

**Simplification.** Serializer is ~80 lines, boring and explicit — no premature generics, no dead branches. `normalizeIds` covers exactly the observed nondeterminism (ids + timestamps), nothing speculative. `.gitignore` lines 60–65 ignore only compiled viewer outputs (`*.js/*.d.ts/*.map`) — `discovery.ts` source is NOT ignored (correct; confirmed tracked).

**AI slop.** Comments are heavy (extensive `@lore`/`N-2`/`W-4` block headers) but accurate and load-bearing for the next agent (they document the determinism contract). The `act()` stderr warnings during the run are noise from components with effects — tests pass; not a defect.

---

## Removal completeness

Grep sweep `ds:sync|ds:bless|ds:workbench|toHaveScreenshot|__screenshots__|test:visual|sync-check|test:workbench|visual:compare|golden|pixelmatch|pngjs` across `package.json`, `packages/*/package.json`, `.github/workflows`, `knip.json`, `.claude/rules`, `.claude/skills`, `packages/design-system`:
- All hits are legitimate: `ds:bless` → `vitest run -u`; visual-regression.md / design-system.md / visual-polish.md describe the snapshot net; `design-source-guard.ts` contains the ban strings by design.
- `@playwright/test` removed from DS, kept in `packages/web` (e2e) — exactly as specced. No DS `playwright*.config.ts`, no `tests/` dir, no `html/` dir.

---

## WARNING (non-blocking)

- **W-1 (cosmetic):** `packages/design-system/tsconfig.json` still lists `"html"` in `exclude` though the dir is gone. Harmless dead config; remove for cleanliness.
- **W-2 (out of AJ1 scope):** `packages/design-system/research/critique-results.md:177` contains a historical `bun run test:visual` line. It is a tracked research doc, NOT a skill/rule (outside the guard's scan scope and outside AC5's "5 skills + rules"). Not a remnant that affects the gate; leave or clean opportunistically.
- **W-3 (not in tree):** A stale compiled `packages/design-system/dist/__tests__/visual-regression.test.js` exists on the local disk but is **gitignored / not tracked** (`dist/` ignored) — it will not ship. No action; a local `rm -rf packages/design-system/dist` clears the confusion.

## NICE-TO-HAVE

- `viewer/main.tsx` retains the density toggle (`compact/default/comfortable`) — correctly untouched per plan (density removal is a separate effort).
- The 33-failure blast radius on a StatusChip restyle (vs 4 direct) is a feature, not noise — it surfaces every consumer affected by a primitive change.

---

## Verdict

**DONE.** All five ACs are genuinely met: the snapshot net is empirically non-vacuous (restyle → named failures), deterministic, with committed baselines; the AC1 guard is empirically non-vacuous (screenshot/HTML language → named guard failure); the viewer is TSX-only with every catalogued component reachable; `verify`/`ci.yml` carry no Playwright/screenshot/Docker and the net rides the attested `test:all`; the 5 skills + rules describe the vitest-snapshot reality with no screenshot-regression remnants. Three non-blocking WARNINGs (all cosmetic / out-of-scope). No unresolved CRITICAL.

Ship-ready pending the orchestrator's full `test:all` + attestation run on the clean tree.
