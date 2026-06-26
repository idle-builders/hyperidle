# AM5 — Phase 4 Code Review (Reviewer)

**Target:** `concept/AM5-artifact-view-open-contract`, PR #369, diff `origin/main...HEAD` (105 files, +6445/−2677).
**Verdict: NOT DONE.** Two blocking issues: (1) the K2b diff-core foundation move is **half-built** — the DS diff core is shipped but **no review chrome composes it**, leaving two parallel code-diff renderers (the exact duplication AM5 exists to kill, relocated into the diff layer); (2) `npm run lint` **fails with a real error** in an AM5-touched file. The collapse + purge + open-contract + fold are REAL and well-tested; the diff-core unification is NOT.

---

## What IS real (verified in code, not prose)

- **Kind-renderer collapse (K2/K5): REAL.** `kinds/{text,code,image,data,html,url,fallback}-renderer.tsx` + `renderer-registry.ts` + `getRenderer` are GONE from disk (only `compose-artifact-body.tsx` survives in `kinds/`). Barrel no longer exports them; `AE6-kind-renderers.test.tsx:82-84` asserts negative existence (`@ts-expect-error` + `toBeUndefined`). `ArtifactPreviewSurface` gate re-pointed to `composeArtifactBody`. `ArtifactView.tsx` + `.stories` + 2 tests + `AI6-renderer-parity.spec.ts` deleted.
- **`code` purge (K4b): REAL.** `code.ts` is pure `{kind,path,lang,text}`; `displayTitle→path`, `summarize→content one-liner` (no `+adds/-dels`). The `artifacts.ts` `code_diff→code` re-inject branch is DELETED (old `{file,hunks}` rows → null preview, pre-alpha-acceptable). `OLD_KIND_MAP` retained. Eval scenarios + integration tests re-shaped.
- **KPI + Sparkline extraction: REAL.** `KpiStat.tsx` + `Sparkline.tsx` exist, barrel-exported, stories back them; `data` artifact composes KpiStat + lifted rows-table + Sparkline (⚠️-DATA freeform-rows reading honored).
- **Open contract + H5 + block-anchor: REAL & well-tested.** `resolveHostRoute`: `artifact→/artifacts/:id`, `task→null` (BLOCKER-1 accepted, no AC needs task nav). Block-anchor uses **value-comparison** against `data-block-id` (no selector injection) + `encodeURIComponent`/`decodeURIComponent`/`scrollIntoView?.()` guard. Review-ref → `/work/bet/:betId/review/:id` with no-bet no-op (no dead URL). AC1/2/3/5/6 covered by `AM5-T7`/`T8` behavioral tests.
- **Fold/SplitView: REAL.** `SplitView` DS-owned, `surfaceKey` prop; `useUiPreference` localStorage-backed, clamp 0.2–0.8, NaN-safe, namespaced key. 3 splits reconciled.
- **Tests green:** 77 AM5 targeted + 119 review tests pass. `npm run check` PASS (13 packages).

---

## AC Completeness Audit

| AC | Proven-by | Status |
|---|---|---|
| AC1 — artifact ref from any surface → same view per kind | `AM5-T7-host-route.test.ts:51-56` (host(artifact)→/artifacts/:id); `composeArtifactBody` per-kind; `AM5-compose-artifact-body.test` | PASS |
| AC2 — block ref → Knowledge view at block | `AM5-T8-block-anchor.test.ts`; `KnowledgeDetail.tsx:507-520` hash-scroll; `open-handler.ts:66` `#block-<id>` | PASS |
| AC3 — review ref → review experience | `open-handler.ts:72-81` review route + no-bet no-op | PASS |
| AC4 — artifact reads consistently inline vs opened | `composeArtifactBody` text/code/image/html share block payloads w/ `KnowledgeBody`; convergence test in `AM5-compose-artifact-body` | PASS |
| AC5 — unknown kind → fallback, no crash/blank | `composeArtifactBody` default→`UnknownPayload`; `getDiffRenderer("mystery")→UnknownDiff` (`AM5-code-delta-renderer.test:118-131`) | PASS |
| AC6 — same ref opens identically regardless of surface | `AM5-T7:69-73` (surface-agnostic identical path) | PASS |
| AC-COLLAPSE (K5 negative existence) | `AE6-kind-renderers.test.tsx:82-84` barrel `getRenderer` undefined | PASS |
| AC-CLEANUP (§6b) | ArtifactSection onViewAll wired, BlockRefEmbed open-on-click, AssistantOverlay navigate, TaskSheet props verified, deferrals recorded | PASS (see C2 lint) |
| **K2b — diff core is a DS foundation; review chrome composes it; NO parallel content family** | **GAP** — DS core shipped but `ReviewCodeDiff.tsx` UNTOUCHED, composes nothing; renders its own `Hunk`/`DiffLine`. Two parallel diff renderers. | **FAIL** |

All TRACK-AM §AM5 ACs are met. The FAIL is against the **concept/architecture contract K2b**, which the work claims to satisfy but does not.

---

## Findings

### CRITICAL

**C1 — K2b half-built: the DS diff core has zero chrome consumers; two parallel code-diff renderers now coexist.**
- `packages/design-system/src/diff/code-delta-renderer.tsx` (`CodeDeltaRenderer` + `DiffLineRef`/`CodeDeltaProps` slot seam) + `select-diff.tsx` (`getDiffRenderer`) are built and barrel-exported (`index.ts:82-85`).
- **No consumer composes them.** `grep CodeDeltaRenderer|getDiffRenderer packages/web/src/pages/review/` → empty. `ReviewCodeDiff.tsx` (802 LOC) defines its OWN `Hunk` (`:44`) / `DiffLine` (`:31`) and renders hunks inline (`:381-388`).
- **`ReviewCodeDiff.tsx` and `canvas-registry.ts` were never modified on this branch** (`git diff --stat` empty). The 119 review tests pass *unchanged* precisely because the chrome still uses its own renderer.
- This directly contradicts `architecture.md` Task 2 (line 524: "**Wire `ReviewCodeDiff` to compose the DS core, filling the four slots**"), §4.3/4.4 S2 ("wire the `getReviewCanvas`-composes-`getDiffRenderer` pattern for `code_diff`"), and the pinned inverse-proof test (line 331/465: "reverting the slot wiring → RED"). Not even the S2-minimal scope (just `code_diff`) was done.
- **Effect:** the DS diff core is dead-but-barrel-exported (knip can't flag it — barrel export + own unit test mark it "used"). The "no parallel content family survives" (K2b) claim is false in code: the codebase now has MORE diff-rendering surfaces than before (the new DS core + the unchanged ReviewCodeDiff renderer), the exact duplication AM5 set out to eliminate, relocated one layer down.
- **Fix (pick one, do not ship without it):** (a) wire `ReviewCodeDiff.FileDiff` (`:345-388`) to compose `CodeDeltaRenderer`, filling `renderLineGutter`/`renderLineAffordance`/`renderLineBelow`/`renderTrailing` with the existing dual-gutter / `+` button / `InlineComposer` / `AnchoredThreadCard` JSX (DOM byte-preserved; re-bless only if it changes; inverse-prove RED). OR (b) if S2 fast-follow is a deliberate deferral, the architecture's K2b "no parallel family" claim must be **retracted in the PR/plan**, the DS diff core marked explicitly staged/unused-pending-S2, and AM5 cannot claim K2b satisfied. Silent half-build is the unacceptable state.

**C2 — `npm run lint` fails (validation gate red).**
- `packages/web/src/shell/__tests__/AH3-AssistantOverlay.notice.test.tsx:35` → `assist/source/organizeImports` error ("Sort these imports"). AM5 modified this file in T9 (+11/−6) and left imports unsorted.
- `npm run lint` → "Found 2 errors" (1 error + the gate). CLAUDE.md: `npm run lint` zero errors is a hard precondition for done.
- **Fix:** `npx biome check --write packages/web/src/shell/__tests__/AH3-AssistantOverlay.notice.test.tsx` (move `react-router-dom` import above `useAssistantThread`), re-run `npm run lint` to confirm zero errors.

### WARNING

**W1 — Dead `DiffHunk` export with a false comment (purge slop).**
- `packages/shared/src/types/artifact.ts:37-41` keeps `interface DiffHunk` with comment "DiffHunk is preserved — used by CodePreview consumers." This is false: `CodePreview` is now `{path,lang,text}` and references no `DiffHunk`. Real diff types are local (`review-artifact.ts:157 CodeDiffHunk`, `code-delta-renderer.tsx:29 DiffHunk` — both their own). Nobody imports the shared `DiffHunk` (`index.ts:449` re-exports it; zero non-dist consumers).
- Knip won't catch it (barrel-exported). It's leftover from the `{file,hunks}` purge that should have been deleted.
- **Fix:** delete `DiffHunk` from `artifact.ts:37-41` + `index.ts:449`, OR if a future consumer is intended, correct the comment to name it — the current comment lies.

**W2 — Stale comment block in `artifacts.ts:84-97`.**
- The doc block above `rowToArtifact` still says "code kind: old code_diff preview {file, hunks} is **compatible** with new code schema" — directly contradicted by the new inline comment at `:123-125` (old `{file,hunks}` rows now yield **null** preview). Doc staleness inside the same function.
- **Fix:** update the `:84-97` block to state old `code_diff` previews are nulled at read (pre-alpha, no migration), matching `:123-125`.

### NIT

- **N1 — `select-diff.tsx:17` uses `delta: any`** (biome-ignored). Localized to the diff-renderer prop union; acceptable for a varies-by-kind payload but worth a `unknown` + per-renderer narrow once C1 is wired (the `CodeDiffAdapter:42` already narrows).
- **N2 — `KnowledgeDetail.tsx:718,730`** use `querySelector(\`[data-block-id="${blockId}"]\`)` (string-concat selector). Pre-existing (internal `openBlockId` state path, not the new external-hash path which is correctly value-compared at `:514`). Not an AM5 regression; flagged for consistency — the internal path could adopt the same value-comparison guard.
- **N3 — `composeArtifactBody` per-arm presence guards** (`if (!url)`, `if (!sanitizeHtml)`, `blocks.length === 0`) read as K0b violations at a glance but are legitimate `unknown`→typed narrowing + K1 content fallbacks (the gate guarantees `preview != null`, not field validity). Correct, but a one-line comment distinguishing "field-shape narrowing" from "absence state" would stop the next reviewer re-flagging it.

---

## Snapshot re-bless judgment

`catalog-snapshot.test.tsx.snap`: +1329/−489. Enumeration floors lowered `:73`→52, `:223`→51 (−9 kinds stories deleted), matching the architecture's recomputation rule (`−9 + 0 + 0`). Floors stay conservatively below the 70 actual modules (no vacuous weakening). The diff reflects the real DOM changes (kind-story removals + new KpiStat/Sparkline/SplitView markup) — not a blind `-u`. ACCEPTABLE.

## Sanity-break results

- Deletions confirmed real on disk (not just claimed): kinds renderers, registry, ArtifactView, AI6 spec all GONE.
- `composeArtifactBody` handles every kind; the gate (`ArtifactPreviewSurface:82-88`) guarantees non-null before calling — no unguarded caller survives.
- `code` purge: no orphaned `{file,hunks}` PRODUCTION consumer (E2E `*.spec.ts` still carry `code_diff`/`hunks` fixtures — local-only lanes, builder re-points on next run per plan; acceptable but un-updated).
- AE6 negative-existence test would go RED if `getRenderer` returned (`@ts-expect-error` + runtime `toBeUndefined`). Real.
- Inverse-proof for the diff core (C1): the pinned `ReviewCodeDiff` inverse test the architecture promised does not exist because the wiring does not exist.

---

## Bottom line

The **collapse and purge are REAL and clean.** The **open-contract + fold unification is REAL and the best-tested part of the WP.** But the **diff-core unification (K2b) is NOT real** — it's a built-but-unwired foundation with a parallel renderer still live, which is a load-bearing contract failure, plus a red lint gate. Fix C1 + C2 (and ideally W1/W2) before ship.
