# Architecture Critique: AJ4

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:8 AC:8 DM:8 N:9 MD:9 FMC:7 S:8 V:7

`/design-critique` **skipped — confirmed correct.** AJ4 has no UI surface: output is GitHub-PR markdown + chat-prose ship-summary text. No design-system component, no viewer story, no rendered HyperIdle surface (spec: "introduces no component and no redesign"). Concept § "/design skip" records this. No design rubric applies.

This critique scores the **technical plan** (`architecture.md`) cold against the 9-dimension rubric. Codebase claims were verified against the worktree (viewer route, `.snap` key format, `ds:serve`/`ds:bless` scripts, `playwright screenshot` CLI, ship SKILL step ordering).

---

## Per-dimension scores

### 1. Spec Alignment — 9
All 4 ACs map to tasks; all tasks trace to an AC or a forced dependency (base-worktree render, idempotent strip). No scope creep — per-variant capture (B2), GC prune, web-package net are all explicitly deferred, not built. The plan correctly overrides the stale "golden TSX screenshot" spec premise per the founder relock (concept § relock) and re-grounds the AJ1 dependency as the *changed-set signal*, not an image source — verified accurate: the repo has a DOM-snapshot net (`catalog-snapshot.test.tsx`), no golden PNG baseline. Scope boundary (design-system stories only; web-shell restyle → no evidence) is stated three times (concept §1 IS-NOT, arch § scope boundary, risk §4) and surfaced in the PR header text — **not silent**, satisfies the founder no-silent-cap rule.

### 2. Layer Integrity — 8
Tooling/skill WP — the three-layer product rule barely applies. Logic correctly lives in `packages/design-system` (it owns the net + viewer + `discoverStories`) plus thin `/ship` wiring. No product layer is crossed. Minor: `capture-evidence.ts` shells out to `git`, `gh`, `npm run ds:serve`, and `npx playwright` — a wide I/O surface for one orchestrator, but appropriate for a ship-time script and isolated behind injectable seams (task 6). No cross-package private-API reach.

### 3. API Contracts — 8
Not an HTTP WP, so "routes" = function signatures + the two external contracts (`gh` upload, viewer URL). The pure-function signatures (`changedStories`, `storyViewerUrl`, `buildEvidenceReport`) and the `ChangedStory`/`RenderedShot`/`HostedShot`/`EvidenceReport` types are fully specified with field lists. The **external** contracts are the weak point: the `gh api` user-attachments upload endpoint is explicitly UNVERIFIED (see FMC) and the literal URL in the plan (`https://uploads.github.com/repos/.../...assets...`) is a placeholder, not a real path. Mitigated by the orphan-branch fallback contract, which IS concrete (`gh api .../contents/…` base64 PUT → `raw.githubusercontent.com/<owner>/<repo>/pr-evidence/<sha>/<file>.png`).

### 4. Data Model Alignment — 8
No DB schema. The "data model" is the `.snap` block format and the `design-evidence.json` run artifact. Verified against the real `.snap`: keys are `` `<title> > <variant> N` `` with ` > ` delimiter and trailing ` 1` index — exactly as the plan's parser §4 assumes. Block opener `` exports[`KEY`] = ` `` and closer `` `; `` confirmed. `design-evidence.json` shape = `EvidenceReport.summarySection`, sound. One gap: the plan does not specify the on-disk schema/versioning of `design-evidence.json` nor what step 7a does if it is malformed (vs absent) — minor.

### 5. Naming — 9
`changedStories`, `storyViewerUrl`, `buildEvidenceReport`, `renderStory`, `uploadShots` all honestly describe behavior. The concept's vocabulary-collision check is rigorous: "design-change evidence" is kept lexically distinct from the "visual regression" gate, and every AC1-guarded banned string (`golden`, `__screenshots__`, `toHaveScreenshot`) is consciously avoided in favor of `evidence`/`pr-shots`. No shadowing of product primitives. Strong.

### 6. Module Depth — 9
Small, sharp interfaces: detection is one pure function over two strings; emission is one pure builder. The I/O (render/upload) is isolated in thin modules behind one orchestrator. `uploadShots()` encapsulates the host-mechanic choice so `evidence-report.ts` stays host-agnostic — exactly the right seam. No one-function-per-caller bloat. Deep where it counts.

### 7. Failure-Mode Coverage — 7
Strong on the non-blocking invariant *intent* and on `.snap` edge cases (added/removed/first-introduction/re-bless all enumerated and mapped). Teardown of viewers + base worktree is `finally`-bound. **But three failure surfaces are under-specified — see WARNINGs:** (a) the non-blocking guarantee is asserted but the test design (task 6) only injects a failing `uploadShots`, not a failing viewer-boot or Playwright-render or base-worktree-add — the broadest failure modes are unproven; (b) port-8099 collision / a pre-existing `_aj4-evidence-base` worktree from a crashed prior run has no recovery step; (c) `.snap`-body parsing assumes no escaped backticks in bodies — Vitest escapes `` ` `` and `${` in snapshot bodies, which a naive `(.+?)` block regex can mis-split.

### 8. Simplicity / Over-Engineering Risk — 8
Lean. Reuses the committed `.snap` as the detector input (no second `discoverStories` run for detection) — the simplest correct source. B1 (per-module image, no viewer change) chosen over B2 to avoid touching the viewer. Design-it-twice is genuine, not theatre: stash-vs-worktree (rejects A with a real reason), three hosting mechanics in a comparison table with concrete reject reasons. One mild risk: the base-worktree-on-8099 machinery is heavy for an artifact; if the user-attachments path were verified the before-shot could in principle come from a cheaper source — but no cheaper correct source exists (origin/main render genuinely needs origin/main code), so the cost is essential, not gold-plating.

### 9. Verifiability — 7
The three pure functions get real import-and-assert unit tests (AC1/AC2/AC3 detection + report) — correctly tests, not file-greps. **But the load-bearing behaviors of this WP are verified by manual founder walkthrough, not runtime tests**, and at least two of them *could* be runtime-tested:
- AC4 mode-independence is "verified by manual read that step 6a has no `PIPELINE_INTERACTIVE` guard." This is a static property of a SKILL.md file — it cannot be a runtime unit test (SKILL prose isn't importable), so manual read / a grep-lint is the honest method. Acceptable, but the plan should name it as a **lint/structural assertion** (grep step 6a region for `PIPELINE_INTERACTIVE` → must be absent), not a soft "manual read."
- The non-blocking invariant (the single most important property, risk §6) is only partially tested (upload-failure injection). The viewer-boot-failure and render-failure paths — the most likely real failures — are verified only by walkthrough. At least the orchestrator's top-level "any thrown I/O → log + exit 0" wrapper SHOULD have a unit test injecting a throwing `renderStory`, not only a throwing `uploadShots`.
- AC1's "sourced from the regression diff not a manual capture" is verified by a "lint/knip check that capture-evidence reads `.snap` via git show and never a hand-authored image list" — this is asserted but the check is not specified concretely (which lint rule? knip cannot assert *that* a file is read). Under-specified.

Protected-tests list: the plan does not enumerate which existing test contracts must not drift. AJ4 touches the `.snap` *reader* not the net itself, so the risk is low, but the plan should explicitly state "AJ1's `catalog-snapshot.test.tsx` enumeration + non-empty guards are frozen; AJ4 reads the `.snap` output, never modifies the net" as a protected contract (the visual-regression.md rule forbids weakening those guards).

---

## CRITICAL

*(none — no structural defect blocks the plan; the UNVERIFIED endpoint is correctly de-risked by a concrete guaranteed-workable fallback, and the non-blocking invariant is architecturally sound even where its test coverage is thin.)*

## WARNING

- **[arch § Hosting / risk §1]** The user-attachments `gh api` endpoint is UNVERIFIED *and* the literal URL in the plan (`https://uploads.github.com/repos/<owner>/<repo>/...assets...`) is a placeholder, not a real reachable path — there is no public documented `gh`-reachable user-attachments upload API; the web UI uses an internal multi-step `github.com/upload/...` flow that is not part of `gh`. **Fix:** demote user-attachments to "spike may discover a path; do NOT plan on it," and make the **orphan `pr-evidence` branch the primary, default mechanic** in the plan (it is the only one verified-workable: `gh api .../contents` + `raw.githubusercontent.com`). The spike (task 4) should be time-boxed and default-to-fallback on any doubt. Confirm the orphan branch is created with `--orphan` semantics via `gh api` (no local checkout) and that `raw.githubusercontent.com` URLs on a non-default branch render in a PR for a **private** repo (they require the viewer's auth cookie — verify this renders for the founder; if the repo is private this is the same auth concern that killed the draft-release option).
- **[arch § Capture parse algorithm, step 1]** The `.snap` block-split regex must handle **escaped backticks and `${` sequences inside serialized DOM bodies** — Vitest's snapshot serializer escapes `` ` ``→`` \` `` and `$`→`\$` in template-literal bodies. A naive `` /exports\[`(.+?)`\] = `…` /m `` non-greedy match can terminate a body early at an escaped backtick. **Fix:** specify parsing by anchored line delimiters (`^exports\[\`` … `^\`;$`) consuming everything between, not a single non-greedy regex; add a unit-test fixture whose body contains an escaped backtick to prove the parser.
- **[arch § Capture step 3 / risk §3]** No recovery for a **stale/colliding ephemeral worktree or port 8099** left by a crashed prior ship. **Fix:** before `git worktree add`, `git worktree remove --force .worktrees/_aj4-evidence-base` (ignore-error) and prune; pick the before-port dynamically (probe for a free port) rather than hardcoding 8099, since `ds:serve` on 8098 + a second instance on 8099 can collide with a developer's already-running viewer. State the teardown is idempotent.
- **[arch § AC4 verification / §6a]** AC4 mode-independence is verified by "manual read." **Fix:** make it a concrete structural assertion — a grep/lint check that the step-6a region of `ship/SKILL.md` contains no `PIPELINE_INTERACTIVE` token (contrast step 7a which must). This turns the most important AC (always-on, both modes) from a soft eyeball into a repeatable gate.
- **[arch § task 6 / risk §6]** The non-blocking unit test only injects a failing `uploadShots`. The **most likely** real failures are viewer-boot failure and Playwright-render failure. **Fix:** the orchestrator's exits-0 wrapper test should inject a throwing `renderStory` (and ideally a failing viewer boot) too, asserting the orchestrator resolves and writes the degraded PR note in each case. Otherwise the headline invariant ("capture failure never reds the ship") is only proven for one of three failure sources.

## SUGGESTION

- **[arch § Verifiability / AC1]** Specify the "not a manual capture" guard concretely. Knip proves reachability, not data-flow. The honest enforcement is: `changedStories(branchSnap, baseSnap)` has the `.snap` text as its *only* input (already true by signature) + a grep-lint that `capture-evidence.ts` obtains `baseSnap` via `git show origin/main:…` and contains no inline image-path array. Name that lint rule or drop the structural claim and rely on the type signature alone.
- **[arch § design-evidence.json]** Specify behavior when the JSON exists but is malformed (vs absent). Step 7a's "no file ⇒ omit section" is clear; "corrupt file ⇒ ?" is not. Recommend: treat parse failure as absent (omit section), never throw into the summary.
- **[arch § task 5 / latency, risk §5]** State an explicit upper bound or guard on ship latency: two viewer boots + N×2 screenshots. For a large changed-set (e.g. a token re-map touching many modules → dozens of changed keys) the before/after capture could add minutes. Consider a cap (e.g. first K modules imaged, remainder link-only) so a wide design change does not stall every ship. At minimum, state the worst-case is bounded by changed-module count and is acceptable.
- **[concept/arch protected-tests]** Add an explicit one-line protected-contract note: AJ1's `catalog-snapshot.test.tsx` enumeration (`≥56`) + non-empty guards are frozen; AJ4 only reads the `.snap` output and must not modify the net or its guards (per `visual-regression.md` non-negotiables).

## What's Working Well

- **Honest scope + relock discipline.** The plan refuses the dead "golden screenshot" spec premise, re-grounds the AJ1 dependency as the changed-set signal, and states the design-system-only boundary in the PR output itself so the limitation is legible, not silent. This is exactly the founder's no-silent-cap bar.
- **Single-switch emission.** `changed.length > 0` gates every emission site (PR body, summary section, strip-on-empty) with one boolean and one code path — no parallel detector, no drift risk between "is there a change?" and "what do we show?". The idempotent HTML-comment-marker block making re-ship a replace (and an empty set a strip → AC3) is a clean, correct design.
