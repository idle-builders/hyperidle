# AJ1 Code Review — TSX is the single design source of truth

**Reviewer:** Phase 4 (warm from Phase 2 plan critique). **PR:** #287 (`feat/AJ1-tsx-source-of-truth`, title "feat(AJ1): WIP").
**Verdict: NOT DONE.** Two CRITICALs: the visual gate silently skips 57% of the catalog (AC2 vacuous), and CI is red on stale attestation (AC4-CI fails). The inversion mechanics (HTML deletion, viewer simplification, guard, wiring, docs) are correct and the no-restyle / keep-stories constraints are honored — but the replacement safety net does not actually protect "every catalogued component," which is the entire point of the workpackage.

---

## AC completeness table

| AC | Status | Evidence |
|---|---|---|
| **AC1** One TSX source of truth; no `.html` refs; no rule/skill/script names HTML-as-reference | **MET (with caveat)** | `packages/design-system/html/` deleted (65 files). `design-source-guard.ts` runs in `verify`, scans `.claude/skills|rules` + filesystem, exits 1 on violation; clean on tree. Guard exemptions (`viewer/index.html`, `playwright-report/`) are legitimate tooling artifacts, not reference files. **Caveat:** guard pattern set is narrower than AC1's text — `mockup.html` HTML-as-design-reference language survives in `/design` + `/design-critique` and the guard does not catch it (WARNING-1). |
| **AC2** Visual regression protects EVERY catalogued component; names the drifted component | **NOT MET (vacuous)** | **39 of 69 catalogued components (57%) render 0 `.demo-section` in the gate's bulk loop and are silently `continue`-skipped** — reproduced exactly (`visual-regression.test.ts:193-203`). 34 of 69 have **zero committed baseline PNGs**, including 11+ primitives the retired gate explicitly covered (`Avatar, EmptyState, ErrorState, Skeleton, TabBar, Toast, Progress`). CI's visual step is green *because* it covers only ~30 components, not because the catalog is protected. CRITICAL-1. |
| **AC3** Viewer renders only TSX; HTML mode/toggle/iframe gone; every component reachable + renders | **MET** | `viewer/main.tsx`: `htmlGlobs`/`HTML_AVAILABLE_TITLES`/`RenderMode`/`HtmlComponentView`/HTML-TSX pill all removed; `isComponentPage` always renders `<TsxComponentView>`. `vite.config.ts` `publicDir` removed. Catalog enumerates 69 components, all reachable. Toggle-absence test present (`visual-regression.test.ts:320`). Caveat: the rewritten `workbench.spec.ts` + `thread-components.spec.ts` that assert "no HTML toggle" are **orphaned** — no script/CI runs them (WARNING-2), so AC3's "no toggle" is proven only by the one test inside the visual gate. |
| **AC4** `npm run verify` passes on inverted tree, no skipped/weakened visual checks | **NOT MET** | CI run 27512505513 **FAILED** at "Validate test attestation": *"tracked source differs from the attested run."* Attestation was generated, then 3 fix commits pushed (console-lint, playwright-report exemption), invalidating it (violates MEMORY "verify commit order"). Also: AC4 says "no skipped visual checks" — the gate skips 39 components (see AC2). CRITICAL-2. |
| **AC5** 5 skills + `design-system.md` describe TSX-first; `visual-parity.md` removed; `visual-regression.md` added | **MET (with caveat)** | `visual-parity.md` deleted; `visual-regression.md` created (accurate). `design-system.md` rewritten to TSX-only. `/review`, `/product-deep-review`, `/visual-polish` re-pointed off `visual:compare`. Caveat: `/design` + `/design-critique` still contain `mockup.html` authoring language — plan deliberately deferred this to AJ3, but it is HTML-as-design-reference text living in a skill (WARNING-1). |

---

## CRITICAL findings

### CRITICAL-1 — Visual gate is vacuous: 57% of the catalog is silently unprotected (AC2)
`packages/design-system/src/__tests__/visual-regression.test.ts:187-222`.

The "every catalogued component renders demo sections" test loops the runtime-enumerated catalog on a **single reused page**, navigating hash routes (`#Avatar` → `#Button` …) with `waitUntil:"networkidle"` + `waitForTimeout(300)`, then:
```ts
if (sections.length === 0) {
  console.warn(`[AJ1] ${component}: 0 .demo-section found ... Skipping.`);
  continue;   // ← no assertion, component drops out of coverage
}
```
**Reproduced (this review, local Mac):** the exact bulk loop yields **39 zero-section components** out of 69:
`NotificationPopover, T4/BlockRefEmbed, TaskSheet, ThreadHostBanner, ThreadShell, ToastRegion, AG6/RowDot, AI2/Dialog, AI2/DialogPortalRoot, AI2/DiscardConfirmStrip, ArtifactSection, ArtifactThreadsSummary, Avatar, Breadcrumb, Button, Checkbox, CredentialsTab, CurationSuggestionCard, EmptyState, ErrorBoundary, ErrorState, GlobalSearchPanel, Input, KnowledgeTopicGroup, LiveDot, Menu, Progress, ReasoningBlockView, RecipientPicker, ScopePicker, Select, SessionActivityPanel, Shell/NavHistoryCluster, Shell/Sidebar, Skeleton, TabBar, ThreadSections, Toast, Toggle`.

This is **not** the "needs a Router context" case the `@lore` comment rationalizes. Navigated **individually on a fresh page** with a 400ms wait, `Avatar`(3), `Button`(4), `EmptyState`(8), `Skeleton`(6), `Toast`(2) all render their sections fine. The skip is a **race**: hash-route SPA navigation does not fire a network request, so `networkidle` resolves instantly and `waitForTimeout(300)` is insufficient for React to re-render the new route's `.demo-section`s before `.count()` reads 0. The set is non-deterministic across machines/CI load.

Consequences:
- **34 of 69 components have zero committed baselines** (`__screenshots__/` prefixes confirm). A restyle of `Avatar`, `Breadcrumb`, `Menu`, `Progress`, `Skeleton`, `Toast`, `TabBar`, `EmptyState`, `ErrorState`, `ThreadShell`, `ThreadHostBanner` etc. is **not caught** — AC2's "every catalogued component" and the "equivalent coverage to the retired gate" constraint are both violated.
- **Coverage regression vs the retired gate:** `origin/main` `COMPONENTS[]` explicitly protected `EmptyState, ErrorState, Skeleton, Avatar, TabBar, Toast, Progress` (verified `git show origin/main:…visual-regression.test.ts:50-76`). All 7 now have no baseline. The safety net was *weakened*, not replaced 1:1.
- The gate is **green in CI precisely because the skipped components produce no assertion** — green here proves the gate runs, not that the catalog is protected. The `catalog enumerates at least 25` floor test (line 171) passes regardless, masking the hole.

**Fix:** Replace the silent `continue` with a deterministic readiness wait + hard failure. Either (a) `await page.locator(".demo-section").first().waitFor({ state: "attached", timeout })` after each navigation and fail (not skip) if a component the catalog lists renders 0 sections, or (b) navigate each component on a fresh page/context. Then re-bless on Linux so all 69 (minus a documented, explicitly-allowlisted set of genuinely context-dependent components like `NotificationPopover`/`AssistantOverlay`) have baselines. A skip must be an explicit allowlist entry, never a silent timing artifact. Then add a guard test asserting `skippedCount <= ALLOWLIST.length` so the hole cannot silently regrow.

### CRITICAL-2 — CI red: stale attestation blocks merge (AC4)
CI run 27512505513 step "Validate test attestation": `check-attestation: tracked source differs from the attested run — re-run npm run verify and commit the new attestation`. Exit 1.

The "Visual regression (TSX baselines)" CI step itself **passed** (good — confirms the cross-platform 5% risk did not materialize; Mac-committed baselines survive Linux). But the attestation was signed against an earlier tree, then commits `31302aba`, `18a56a9c`, `8ecc0a03` landed, invalidating it. AC4 requires `verify` green on the inverted tree on **both** paths; CI is red. **Fix:** per MEMORY "verify commit order" — commit all code first, run `npm run verify` foreground on the clean tree, commit the fresh attestation last, push. PR title is still "WIP".

---

## WARNING findings

### WARNING-1 — AC1 guard is narrower than AC1's text; `mockup.html` HTML-as-reference survives in skills
`scripts/design-source-guard.ts:42-71` scans only for `visual:compare`, `pixel-for-pixel`, `html/themes/`, `Dual representation…html`, `HTML is the design source/reference`, `ds:sync compares HTML`. It does **not** match `mockup.html`. `/design` SKILL.md:154-155,222-230 and `/design-critique` SKILL.md:38,163 still say *"mockup.html (preferred) — a self-contained HTML file that embodies the variant … The mockup IS the variant"* — literal HTML-as-design-reference. The plan deliberately scoped mockup-authoring to AJ3, so this is a known deferral, **but** AC1 reads "no skill names HTML as the design reference," and the guard passes anyway. The guard therefore does not enforce the full AC1 property — a future regression that reintroduces `html/` reference *language* phrased as `mockup.html` would not be caught. Decide explicitly: either accept the AJ3 deferral and note AC1's skill-clause is partially satisfied-by-plan, or broaden the guard. Not a code defect, but the AC1 "guard catches violations / no escape hatches" scrutiny point lands here.

### WARNING-2 — Rewritten AC3 specs are orphaned (dead) — never executed
`packages/design-system/playwright.l1.config.ts` + `tests/visual/L1/thread-components.spec.ts` and `tests/workbench.spec.ts` were rewritten to drop HTML-toggle/`existsSync` assertions and assert TSX-only render. But: `playwright.l1.config.ts` is referenced by **no** npm script and **no** CI step (orphaned). `test:workbench` exists in the ds `package.json` but is not in `verify` or `ci.yml`. These specs give the appearance of AC3 coverage ("no HTML toggle," "markers present") but never run. Either wire them into `verify`/CI or delete them (the plan flagged L1-config consolidation as a judgment call — the builder rewrote instead of deleting, leaving dead test files). Knip does not flag playwright configs, so they sit silently.

### WARNING-3 — Marker-presence test is near-tautological (40/69 lack markers)
`visual-regression.test.ts:265-316`. The test collects components without `[data-ds-component]`/`[data-ds-shell]` markers, `console.warn`s the list, and asserts only `withMarkers > 0` — it passes if a **single** component has a marker. With ~40/69 lacking markers (builder's own note, consistent with the 0-section skips), this is not a meaningful gate; it would pass even if markers were stripped from all but one component. The dual-selector logic is correct, but the assertion floor is `> 0`. Tighten to a per-component allowlist or assert the marked set does not shrink vs a committed baseline count, mirroring the CRITICAL-1 fix shape.

### WARNING-4 — `serve -- -- --port 8197` double-dash in workbench config is suspect
`playwright.workbench.config.ts:26`: `npm run -w @hyperidle/design-system serve -- -- --port 8197`. `serve` = `vite --config vite.config.ts` (no positional pass-through marker). The `-- --` is fragile arg-forwarding through two npm hops; it was never validated (the spec is orphaned per WARNING-2, so it never runs). Low impact while orphaned, but if WARNING-2 is fixed by wiring the spec in, this port override must be verified to actually reach vite, else it collides with the visual gate on `:8098`.

---

## NICE-TO-HAVE

- `viewer/main.tsx:78-99` retains the **density toggle** (`compact/default/comfortable`) — correctly left untouched per plan (MEMORY density-removal is a separate effort). No action for AJ1.
- `visual-regression.test.ts` comments are heavy but accurate; the `@lore` at :194-203 rationalizes the skip as "needs Router context" — that rationalization is **wrong for most of the 39** (they render fine in isolation) and should be corrected when CRITICAL-1 is fixed, so the next agent isn't misled.
- `pascalToTitle`/`CatalogWrapper`/`ComponentWrapper` in `main.tsx` are unchanged from pre-AJ1 — fine.
- Dead-dep check: no `pixelmatch`/`pngjs` references remain in source (only in comments). `serve:static`, `k13-capture`, `visual:compare` scripts fully removed from all `package.json`. Clean.

---

## Per-lens summary

- **Architecture:** Wiring is correct — `design-source-guard:check` + `ds:sync` inserted into `verify` chain; CI gains `Install Playwright` + `Visual regression` steps before attestation; `snapshotPathTemplate` is platform-agnostic and matches the committed `__screenshots__/` dir; vitest project excludes `**/visual-regression*` so the Playwright file isn't run by `vitest`. The bun→npm `webServer.command` swap landed in all 3 configs. No layer violations (infra-only WP). The gate's *enumeration* is architecturally sound (runtime catalog DOM, per plan); its *assertion completeness* is the failure (CRITICAL-1).
- **Design:** No component `.tsx` source changed and no `.stories.tsx` deleted — the "no restyle" and "stories stay the catalog contract" constraints are honored (verified via diff). CI visual step green confirms the surviving baselines match Linux render.
- **Security:** N/A as planned — no endpoints, inputs, secrets, or path/SSRF surface. Guard exemptions reviewed: no traversal hole. CI integrity preserved (visual gate runs live, not attested).
- **Adversarial (Saboteur):** The silent `continue` is a textbook silent-regression — a green gate that protects half what it claims, hidden behind a plausible `@lore` rationalization and a `console.warn` no one reads in CI. This passes tests, lint, and a skim review. Caught only by enumerating the catalog and counting baselines.
- **Simplification:** Orphaned L1/workbench configs + specs (WARNING-2) are dead weight — either wire or delete.
- **AI slop:** Over-narrated comments; the misleading "needs Router context" lore; the `> 0` tautological marker assertion (WARNING-3).

---

## What must change before DONE

1. **CRITICAL-1:** Make the gate fail (not skip) when a catalogued component renders 0 sections; add deterministic readiness wait; bless baselines for all components (explicit allowlist for genuinely context-dependent ones); add a regression guard on skip/marker count. Target: real coverage of all 69 minus a documented allowlist, restoring the retired gate's 25-component floor.
2. **CRITICAL-2:** Regenerate the attestation on the final clean tree (verify foreground → commit code → commit attestation last → push); get CI fully green; drop "WIP" from the PR title.
3. **WARNING-2:** Wire `workbench.spec.ts` + L1 spec into `verify`/CI, or delete the orphaned config + spec.
4. **WARNING-3:** Tighten the marker assertion beyond `> 0`.
5. **WARNING-1 / WARNING-4:** Decide guard-scope vs AJ3 deferral; validate or remove the `-- --port` forwarding if the workbench spec is kept.

**Verdict: NOT DONE.**

---

# Re-review (round 2)

**Reviewer:** Phase 4, round 2 (verifying builder's fixes to the 2 CRITICALs + 4 WARNINGs). Reproduced each finding — did not trust the report. Ran `ds:sync`, `ds:workbench`, `design-source-guard:check` locally; pulled the live CI logs.

**Verdict: NOT DONE.** One CRITICAL remains. **CRITICAL-1 is genuinely fixed and proven non-vacuous.** All four WARNINGs are resolved. But **CRITICAL-2 is NOT resolved: CI verify FAILED** (run 27513994386) at the "Visual regression (TSX baselines)" step — the baselines were blessed on **Mac, not Linux**, and a 1-pixel dimension mismatch on Linux (`976×160` expected vs `976×161` received) fails `toHaveScreenshot` outright. Dimension mismatches bypass the 5% `maxDiffPixelRatio` (the ratio only applies to same-size images), so the cross-platform tolerance the design relies on does not save it. This is the exact cross-platform risk the round-1 review flagged as "the real risk now." It also violates the project's own `.claude/rules/visual-regression.md` ("CI/Linux is the blessing authority … Do NOT commit Mac-rendered PNGs as canonical baselines") and the `@lore` in `playwright.config.ts`.

## Updated AC table

| AC | Status | Evidence (round 2) |
|---|---|---|
| **AC1** One TSX source of truth; no `.html` refs; no skill names HTML-as-reference | **MET** | `design-source-guard:check` clean. Guard now catches `mockup.html (preferred)` / `The mockup IS the variant` / `mockup.html embodies the variant` (`scripts/design-source-guard.ts:78-85`) — **verified by injecting a violation file**: guard exits non-zero and names each hit; clean again after revert. `/design` SKILL.md:154 rewritten to `variant.tsx` ("The TSX sketch IS the variant"); `/design-critique` SKILL.md:39 now says "reference variant.tsx, not mockup.html". WARNING-1 resolved — guard is now broader than AC1's text, not narrower. |
| **AC2** Visual regression protects EVERY catalogued component; names the drifted component | **MET (non-vacuous)** | The silent `continue` is gone. `navigateAndWaitForSections` (`visual-regression.test.ts:163-185`) does a deterministic `waitFor({state:"attached"})` + full-reload-and-retry on React-crash contamination. 0-section non-allowlisted components are pushed to `failedComponents` and the test **hard-fails naming them** (`:339-360, :384-390`). Allowlist is **exactly 2** (`NotificationPopover`, `TaskSheet`) — both genuine `useNavigate()`-without-Router crashes, documented per-entry; coverage guard (`:293-318`) asserts `ALLOWLIST_SIZE === 2` and fails on silent growth. **342 committed baselines** (was 182); all 7 previously-unprotected primitives now covered (avatar 3, emptystate 8, errorstate 7, skeleton 6, tabbar 3, toast 2, progress 3). Allowlisted comps correctly have **zero** baselines. **Proven by running `ds:sync` locally: 27 passed, 2 skipped — the coverage test passed, exercising every non-allowlisted component against a real golden PNG.** The 39-zero-section race from round 1 is gone. |
| **AC3** Viewer renders only TSX; toggle gone; every component reachable | **MET** | No-HTML-toggle test passes (`:553`). Workbench spec (now wired) re-asserts toggle absence on a component page — passes. |
| **AC4** `npm run verify` passes on inverted tree; no skipped/weakened visual checks | **NOT MET** | **CI run 27513994386 FAILED** at "Visual regression (TSX baselines)": `ai2-dialogportalroot-mount-effect.png` — `Expected an image 976px by 160px, received 976px by 161px. 1 failed, 26 passed`. Baselines are Mac-rendered (fix commit `ea097891` has no docker/Linux blessing). The visual step never reaches the workbench or attestation step. Local Mac `ds:sync` passes only because the baselines match the Mac render they were blessed from. CRITICAL-2. (Commit order itself is correct — attestation `2e815db7` is HEAD, no commits after; PR title no longer "WIP". The blocker is the gate, not the attestation.) |
| **AC5** 5 skills + `design-system.md` TSX-first; `visual-parity.md` removed; `visual-regression.md` added | **MET** | Confirmed round 1; round-2 spot-check of `design-system.md`, `visual-regression.md`, `/design`, `/design-critique` all TSX-first. |

## CRITICAL findings (round 2)

### CRITICAL-2 (UNRESOLVED) — CI red: visual baselines blessed on Mac, fail on Linux
`CI run 27513994386`, step "Visual regression (TSX baselines)", exit 1:
```
Snapshot: ai2-dialogportalroot-mount-effect.png
Expected an image 976px by 160px, received 976px by 161px.
1 failed
26 passed (1.9m)
```
Root cause: the 342 baselines were generated with `npm run ds:bless` on **macOS** (the builder's local machine), not in a Linux container. `AI2/DialogPortalRoot`'s `mount-effect` section renders **161px tall on Linux vs 160px on Mac** — a sub-pixel font/layout-metric difference. When the captured image's **dimensions** differ from the baseline, Playwright's `toHaveScreenshot` fails immediately; `maxDiffPixelRatio: 0.05` only governs per-pixel color diffs on **same-size** images. So the cross-platform tolerance the whole design leans on (one baseline set for Mac+Linux) does not absorb dimension drift.

This is not a one-off flake — it is the predictable consequence of blessing on the wrong platform. Today 1 of ~330 baselines drifts by 1px; any other component whose Linux render height differs will fail the same way, and re-running will not fix it.

**Fix (per `.claude/rules/visual-regression.md`, which the builder authored):** re-bless ALL baselines on Linux — `npm run ds:bless` inside `mcr.microsoft.com/playwright:v<version>` (or let CI bless), commit the Linux PNGs, then confirm CI's visual + workbench + attestation steps all go green on the final tree. Do **not** raise the ratio or special-case the one component — that masks the platform-mismatch root cause.

## WARNING findings (round 2)

- **WARNING-1 — RESOLVED.** Guard catches mockup-as-reference language (verified by injection). Skills reference `variant.tsx`.
- **WARNING-2 — RESOLVED (one cosmetic residue).** `playwright.l1.config.ts` + `thread-components.spec.ts` deleted; `workbench.spec.ts` wired into `verify` (`package.json:31` `ds:workbench`) and CI (`ci.yml:72-75`). **Verified `ds:workbench` runs and passes locally (3/3).** Residue: `knip.json:39` still lists the deleted `playwright.l1.config.ts` in the design-system playwright config array — harmless (knip tolerates a missing config-list entry; `npm run knip` passes), but it is dead config; remove for cleanliness. Minor: `workbench.spec.ts:45` test title says "ThreadShell tile loads" but the body navigates to `#StatusChip` — misleading name, not load-bearing.
- **WARNING-3 — RESOLVED.** Marker test now hard-fails if any of the 31 `MUST_HAVE_MARKERS` components loses its marker (`:534-539`) and floors `withMarkers >= 31` (`:543-548`). Not tautological — 11 components currently lack markers (down from ~40); the floor would catch a mass-strip. The hard regression guard is the meaningful part. Confirmed: none of the 11 missing are in `MUST_HAVE_MARKERS` (test passed).
- **WARNING-4 — RESOLVED.** Workbench config uses port 8098 + `reuseExistingServer: true` (`playwright.workbench.config.ts:39-40`); the `-- --port` double-dash is gone. **Verified it boots a fresh viewer standalone and passes.**

## What must change before DONE
1. **CRITICAL-2:** Re-bless all visual baselines on **Linux** (CI container / playwright Docker image), commit the Linux PNGs, get CI fully green (visual → workbench → attestation). This is the only blocker.
2. **(NICE-TO-HAVE, not blocking)** Remove the stale `playwright.l1.config.ts` entry from `knip.json:39`; fix the `workbench.spec.ts:45` test title.

**Verdict: NOT DONE** — CRITICAL-2 (CI red, Mac-blessed baselines) unresolved. Everything else is genuinely fixed.
