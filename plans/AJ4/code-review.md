# AJ4 — Phase 4 Code Review

**Verdict: NOT DONE** (one MAJOR functional defect in the PRIMARY hosting mechanic + zero live-proof of the upload/capture path, which the plan mandated as task 4/11). The pure logic is solid and all 55 unit tests pass green; the non-blocking invariant holds for `runCaptureEvidence`. But the headline deliverable — before/after evidence images reaching the PR — rests on a `gh api` call that is very likely broken and was never executed against a real PR.

Design lens: **SKIPPED** — no UI surface (markdown/prose output only). Confirmed correct, matches concept §/design-skip and arch-critique.

`npm run check` → 0 errors. `npm run test` (scripts-tests) → 55/55 pass. Biome → 3 `noExcessiveCognitiveComplexity` **warnings** (configured `level: "warn"`, exit 0 — does not fail lint). AJ1 net (`catalog-snapshot.test.tsx`) **untouched** — confirmed via diff; enumeration/non-empty guards frozen as required.

---

## AC completeness audit

| AC | Met? | Evidence |
|---|---|---|
| **AC1** design change ⇒ PR carries before/after of each changed component, sourced from the regression diff | **PARTIAL** | Detection is sound: `changedStories(branchSnap, baseSnap)` takes `.snap` text as its only input (structurally "from the regression diff, not manual"); covers changed/added/removed/first-intro/re-bless; escaped-backtick parser proven by fixture. `buildEvidenceReport` emits before+after links + markers + "+K more" overflow. BUT the **images** that back the before/after links depend on `uploadShots`, whose orphan-branch creation is likely broken (MAJOR-1) and unproven. Detection + report = met; *image delivery* = unproven. |
| **AC2** ship summary lists openable stories + screenshots | **PARTIAL** | `storyViewerUrl` + `summarySection` shape correct and tested; SKILL step 7a beat 6 wired with malformed-file guard. BUT `design-evidence.json` is written with `buildEvidenceReport(finalChanged, [])` — **empty hosted** (capture-evidence.ts:458), so the summary's `shots[].before/after` are always `undefined`. The summary lists stories but never real screenshot URLs. See MAJOR-2. |
| **AC3** no rendered-design impact ⇒ no screenshots, no design section | **MET** | `changed.length === 0` → `runCaptureEvidence` returns `prMarkdown:""`, no file written; CLI strips any stale block from PR body. Single boolean gates all emission. Unit-tested (identical snaps → `[]`, empty markdown). |
| **AC4** always-on, mode-independent; artifact not touchpoint | **MET** | Step 6a has NO `PIPELINE_INTERACTIVE` guard (structurally asserted, discriminating counter-proof on 7a passes). Non-blocking proven for `runCaptureEvidence` at renderStory + uploadShots seams. Minor residual: CLI `main().catch(process.exit(1))` (see MINOR-1). |

---

## CRITICAL

*(none — the non-blocking invariant holds for the orchestrator, so no failure path reds a green ship via the tested entry point.)*

## MAJOR

**MAJOR-1 — Orphan-branch creation is very likely broken; the PRIMARY hosting mechanic was never live-proven.**
`upload-assets.ts:75-84` creates the empty tree with `gh api --method POST .../git/trees -f tree=[]`. `gh api -f` sends form fields as **strings** — this transmits `tree` as the literal string `"[]"`, not a JSON array. GitHub's `POST /git/trees` requires `tree` to be an array of tree objects; a string value yields HTTP 422. On a first ship (orphan branch absent), branch creation fails → `uploadShots` throws → caught by the non-blocking wrapper → ship goes green but with a **link-only degraded note and no images**. The entire image-evidence feature (the point of AJ4) silently never works on first use.
The architecture mandated this be **live-proven**: task 4 ("open a scratch PR on this private repo … confirm the link opens") and task 11(a) ("ship → PR shows openable before/after"). `.pipeline/progress/AJ4.json` records no such proof; `currentStep: 4-review`. Per MEMORY "live-proof lanes run before ship," a real/live path must execute before DONE — stubs+review aren't proof.
**Fix:** create the empty tree via `gh api --input` with a JSON body (or `-F tree=@-`/`--raw-field` with proper JSON), or skip the empty-tree step and create the first commit with a single file. Then run the scratch-PR walkthrough (arch task 11a) and record the result.

**MAJOR-2 — `design-evidence.json` is written with empty hosted shots, so AC2's "screenshots in the summary" are always absent.**
`capture-evidence.ts:455-459`: the file the ship summary reads is built as `buildEvidenceReport(finalChanged, [])` — hosted is hardcoded empty, with the comment "live links need the upload result." The actual `hostedShots` computed earlier in `runCaptureEvidence` are **never threaded into the on-disk artifact**. Result: step 7a's design beat can list story URLs but every `shots[].before/after` is `undefined` — the interactive summary never surfaces the actual screenshot links. AC2 ("lists openable stories **+ screenshots**") is only half-met.
**Fix:** `runCaptureEvidence` should return the `EvidenceReport` (or the hosted shots) and `main()` should persist *that* report, not recompute with `[]`.

## MINOR

**MINOR-1 — CLI `main().catch(process.exit(1))` is a non-zero-exit surface the non-blocking prose forbids.** `capture-evidence.ts:505-507`. Realistic failures (Playwright/gh/worktree) are all individually caught inside `main()` and exit 0, so this only fires on an unexpected fatal (e.g. a built-in dynamic import rejecting). Low real risk, but step 6a's contract is "never block the ship"; a defensive `process.exit(0)` (with a logged warning) in the fatal handler would make the invariant total rather than near-total.

**MINOR-2 — `buildEvidenceReport` computes the same hosted-shot lookup three ways (source of the complexity-36 warning).** It builds `hostedByTitleSide` (module/title+side), then `variantShotMap` (per-variant), then *again* `hosted.find(...)` for `variantBeforeShot`/`variantAfterShot` in the imaged loop (evidence-report.ts:44-48, 64-72, 111-123). The B1 "per-module" path (75-82) only fires when `variantShotMap.size === 0`, but since `uploadShots` always emits per-variant shots, that branch is effectively dead in the real flow. Refactorable to one variant-keyed index → drops complexity under 25 and removes the dead module-level branch. Intrinsic complexity is low; this is accidental.

**MINOR-3 — `captureRealShots` complexity-40 is largely intrinsic but partly refactorable.** The worktree-setup + dual-viewer-boot + dual-render-loop + upload + finally-teardown is genuinely a lot of sequenced I/O, but the two near-identical before/after render loops (capture-evidence.ts:291-303 and 311-330) can be extracted to one `renderSide(origin, side, outDir)` helper, cutting branches meaningfully. Worth doing alongside MAJOR-1/2 since that file is being touched anyway.

**MINOR-4 — Real `.snap` bodies are wrapped in surrounding `"…"` quotes by the serializer** (verified against the live snap: `exports[...] = \`\n"<div …>\n"\n\`;`). The line-delimited parser handles this correctly (the quote lines are inside the body, identical on both sides) and the closer is always a lone `` `; `` at column 0 (254/254 keys confirmed). No defect — noting that the test fixtures use unquoted bodies, so the quote-wrapping is exercised only by the real file, not by a test. Optional: add one fixture mirroring the real quoted-body shape.

## Slop check
Clean. No TODOs-on-implemented-code, no "for now"/"simplified version" tells, no fake assertions. The `@lore` comments are substantive (private-repo finding, B1 vs B2, column-0 closer rationale). The "⚠️ UNVERIFIED" tag on the Playwright CLI invocation (render-story.ts:57-59) is honest and appropriate per the TS rules. Tests genuinely import and assert on behavior; `ship-step6a-mode-independence.test.ts` is a legitimate structural check of the artifact under test (correctly classified as lint-not-behavioral).

## Security check
- **Branch/path injection:** `prNumber` is `Number.parseInt`'d (numeric); `safeTitle`/`variant` derive from `.snap` keys (repo-internal, trusted, not attacker-controlled). `execFile` (not `exec`) with arg arrays — no shell interpolation. No injection surface.
- **Playwright invocation:** `execFile("npx", [...args])` with the URL as a discrete arg — no shell, title is URL-encoded. No command injection.
- **`git show origin/main:<path>`** — fixed path constant, no interpolation. Safe.
- **Secrets:** none logged; degraded notes carry only error `.message` strings. OK.

---

## Summary for the builder fix loop
1. **MAJOR-1:** fix the `gh api` empty-tree call (`-f tree=[]` sends a string → 422); then live-prove the upload on a scratch PR (arch task 4/11a) and record it. This is the gating item.
2. **MAJOR-2:** persist the *real* `EvidenceReport` (with hosted shots) to `design-evidence.json`, not `buildEvidenceReport(finalChanged, [])`.
3. MINOR-1 (fatal handler exit 0), MINOR-2/3 (refactor the triple-lookup + extract render-side helper → clears the complexity warnings), MINOR-4 (optional quoted-body fixture).
