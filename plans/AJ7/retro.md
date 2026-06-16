# AJ7 — Retro (Phase 6)

**Workpackage:** Annotator v2 — devtools-style element inspector for design review
**Track:** AJ — Design-system & viewer infrastructure
**Status:** COMPLETE through Phase 6 (retro); ship pending (founder-approved, never auto-merge)
**Run shape:** Founder-directed INTERACTIVE pipeline (not autonomous). designClass=novel, complexity=M, gate=local-green.

## Summary

AJ7 evolved AJ5's broken "review pill" annotator into a devtools-style element inspector
(hover-highlight → select → breadcrumb retarget → comment in a docked rail → notes panel with
re-highlight-on-hover). The whole run — concept through docs — took ~1h36m wall-clock (23:01 → 00:37),
11 commits, single session, zero infrastructure churn (no rebases, no CI loops, no attestation thrash).
Two design-critique CRITICALs about frozen-box drift drove the load-bearing architecture decision:
**the engine stores `HTMLElement` refs and computes rects only in `useElementRect`, making the
founder-rejected frozen-rect state structurally unrepresentable.** A load-bearing AJ5 wiring bug
(`storyRoot` null at the mount render) was correctly sequenced as build task #1. Code review passed
15/15 ACs DONE first pass with 0 MUST-FIX, 3 SHOULD-FIX (all fixed in one round). The founder cleared
the `/human-design-review` hard gate by DELEGATING ("anything that doesn't occlude the components
works"), and injected an in-flight cleanup (remove dead density switcher). AJ7 was never registered in
the manifest — concept + approved-design served as the spec.

---

## Phases & Timeline

| Phase | Outcome | Evidence |
|-------|---------|----------|
| 1 — Concept + Design | 3 working prototypes scored (A devtools-rail 8.5, B floating-editor 7.6, C inspector-strip 7.7); A approved (quieted) | `6c97fb4b` (23:01) |
| 2 — Design-critique | 8/10, 2 CRITICAL (frozen-box drift, off-screen re-highlight under-specified) + 4 WARNING + open-question recs | `a88005b9` (23:05, ~4 min later) |
| 2.5 — Human-design-review | CLEARED — founder DELEGATED the design decision (no annotate-in-browser loop) | progress log |
| Architecture + approved finalize | Engine-holds-refs design; resolved every prior CRITICAL/WARNING; additive `anchor` contract | `4b0fbe02` (23:29) |
| Architecture-critique | 8/10, 0 CRITICAL, 4 WARNING (variants[0] data-correctness, snapshot-axis mistargeted, live-track failure modes, grep-as-test) | `2b53a285` (23:32, ~3 min later) |
| 3 — Build (tasks 1–10) | check + lint clean; 1196 DS tests + snapshot net green | `4bd6431a` (23:48, ~16 min) |
| 3 — Live-proof (task 11) | Found rail header under viewer Toolbar (arm click intercepted); `top:48px` fix; full loop verified live | `239e2097` (23:53) |
| 3 — Artifact hygiene | gitignore + biome-exclude compiled `viewer/annotations/*.js/.d.ts` | `174a6971` (23:55) |
| 4 — Code review | DONE 8.5/10, 15/15 ACs MET, 0 MUST-FIX, 3 SHOULD-FIX, 4 NICE | `861a49c4` (00:01, ~13 min) |
| 4 — Review fix-loop | SF-1/2/3 fixed in one round (+ tests + live proof) | `85fa960b` (00:13) |
| extra — Density removal | Founder in-flight cleanup of dead density switcher (separate MEMORY task) | `dc9c6bb6` (00:27) |
| 5 — Docs | As-built docs; prototype story deleted; snapshot re-blessed (60→59 modules); plans retired | `76e3f962` (00:37) |
| 6 — Retro | This file | this commit |
| ship | PENDING — rebase fresh origin/main, verify, attest, push, PR, CI green, STOP for human merge | — |

---

## Cost Signals

### Productive Work (wall-clock, single session ~1h36m)
- **Concept + design (3 working prototypes):** prior to 23:01 (delivered as one commit). The 3-variant interactive prototype (`AnnotatorV2.stories.tsx`, 763 lines) was the heaviest design artifact — genuinely interactive in the viewer, scored in-session.
- **Critique passes:** ~4 min (design) + ~3 min (architecture) AFTER each production commit — the reviewer ran fast and in parallel with the founder's design review.
- **Architecture:** ~24 min (402-line plan, resolved all prior CRITICAL/WARNING).
- **Build:** ~16 min for tasks 1–10 (TDD, 89 AJ7 tests, green first pass on logic ACs).
- **Live-proof + review + fix:** ~13 min review + ~12 min fix-loop.
- **Docs + retire + density:** ~24 min.

### Infrastructure Overhead
- **Near-zero in the toolchain.** No stale-base rebases, no CI rerun loops, no attestation churn, no permission prompts in the pipeline phases.
- **Non-zero in the LIVE-PROOF environment** (the friction was the dev viewer, not the pipeline) — see Friction below: port-8098 contention + stale shadow on another worktree's viewer caused the founder to hit a blank annotator.

### Why fast + clean
- Concept locked the domain (no new primitive — additive optional `anchor` only) and named the load-bearing AJ5 wiring bug up front, so it became build task #1 instead of a Phase-4 surprise.
- The critique→revision loop pinned every CRITICAL/WARNING into the architecture before write-tests, so the builder got a clean spec (the 8/10 arch plan had 0 CRITICAL).
- The "engine holds refs, never rects" decision made the highest-stakes failure mode unrepresentable rather than guarded — fewer states to test, fewer to regress.

---

## Successes (what worked)

1. **"Make the rejected state structurally unrepresentable."** The founder's load-bearing rejection
   (no pins / no drift) became an architecture invariant: `usePicker` exposes only `HTMLElement`
   refs; rects exist only inside `useElementRect` ("there is no rect in the engine to go stale").
   The frozen-box drift the founder rejected is not *avoided* — it is *impossible to express*. The
   `SUPERSEDES PROTOTYPE` annotations made the intent auditable against the prototype's `{target, rect}`.

2. **Critique ran in parallel while the founder reviewed.** Design-critique landed ~4 min after the
   design commit, architecture-critique ~3 min after the arch commit. The reviewer persona did not
   block on the founder's human-design-review; the two evaluation streams overlapped, compressing the
   critical path.

3. **Live-proof caught geometry bugs jsdom structurally cannot.** Two real defects were found ONLY at
   the `:8098` run: (a) the rail header/arm button sat under the viewer Toolbar and the theme/density
   pills intercepted the arm click (task-11 `top:48px` fix); (b) the held box gluing through scroll and
   rail collapse/expand was proven with measured deltas (elΔ100/boxΔ100). The review explicitly routed
   AC2/AC3 geometry + AC7 scroll + AC15 real-POST to live and called out jsdom's blind spot honestly.

4. **Two critique CRITICALs paid for themselves.** Design-critique CRITICAL #1 (frozen box) drove the
   refs-not-rects engine; CRITICAL #2 (off-screen vs not-in-DOM conflation) drove the clean
   `resolveAnchor→null` (not-in-DOM = "not visible") vs `offscreen→scrollIntoView({block:center})` split.
   Both would have been Phase-4 or live-proof rework without the pre-build critique.

5. **Additive contract verified end-to-end.** `anchor` is genuinely optional: `validateBody` extends
   additively, `appendAnnotation` spreads `input.target` so the field persists with zero store change,
   and AJ5 annotations without anchor degrade to "not visible" (never error). Confirmed against real
   AJ5 source, no breaking change to persisted data or tests.

6. **Code review found 0 spec-mismatch defects.** All 3 SHOULD-FIX were robustness/quality (no-occlusion
   reflow, `!isConnected` ghost, duplicate-sibling fallback), not "builder built the wrong thing." The
   spec precision from the critique loop held through the build.

---

## Friction / Cost Signals

1. **Founder hit a BLANK annotator — stale shadow + port contention on :8098.** Multiple viewers were
   fighting for port 8098 across worktrees; a stale shadow from a DIFFERENT worktree's viewer was being
   served, so the founder opened the annotator and saw nothing wired. This is environment friction
   (dev-server state), not a code defect, but it cost a confused round-trip during the interactive run.
   **Pattern candidate:** shared fixed dev port across worktrees → wrong/stale app served. (3rd+ occurrence
   territory — see AJ6 "artifact shadow: stale discovery.js" and the AJ5 viewer state notes.)

2. **AJ7 was never registered in the manifest.** `grep AJ7` returns nothing in
   `.pipeline/work-packages/pipeline-manifest.yaml`. The 15 ACs were self-authored against
   concept + approved-design rather than traced to an upstream workpackage spec. The architecture-critique
   flagged this (CC-007 reconcile cannot run; no external AC source). Acceptable for a founder-directed
   dev-tool follow-up, but `/review` and `/retro` had no manifest entry to find — this retro had to
   reconstruct the run from progress JSON + git history because the plan artifacts were already retired
   in Phase 5. **Pattern candidate:** founder-directed follow-ups skip work-planning → no manifest/track
   row → downstream phases lose their spine.

3. **Prototype story needed pre-ship removal.** `packages/design-system/src/AnnotatorV2.stories.tsx`
   (763 lines, 3 variants) was a design-gate fixture that rendered as a real catalog component (module
   count 60). It had to be deleted at Phase 5 and the snapshot re-blessed (60→59, one obsolete
   VariantADevtoolsRail entry, 79 deletions). This is the SAME class as AJ6 CatalogAxis, W2 token-gallery,
   AJ5 overlay-mockups: **design-phase embodiment stories leaking into the snapshot net and needing a
   deletion trigger before ship.** This is now a clear 4th+ occurrence.

4. **In-flight founder cleanup interleaved with the pipeline.** The dead density-switcher removal
   (`dc9c6bb6`, a separate MEMORY `project_density_removal` task) was committed between review-fix and
   docs, on the AJ7 branch. The review correctly scoped it OUT of AJ7 (it pre-exists on origin/main), but
   it now rides AJ7's PR. Mild scope-bleed from the interactive run; harmless but muddies the PR's story.

5. **Two architecture-critique WARNINGs were "accepted in plan but absent in code."** SF-2
   (`!isConnected` → 0×0 ghost box at origin) was named in arch-critique, accepted in the plan resolution,
   but NOT implemented in the build — code review caught it as a SHOULD-FIX and the fix-loop closed it.
   The plan-says-yes / code-says-no gap is a real signal: a critique resolution recorded in prose is not
   a guarantee it lands in code. (Caught by review here; worth a checklist trace.)

6. **Compiled artifacts in the worktree.** `viewer/annotations/*.js/.d.ts/.js.map` exist on disk
   (gitignored via `174a6971`). They are excluded, but their presence is the same build-artifact-hygiene
   smell flagged in AJ6 (stale `discovery.js` shadow). Source dirs accreting compiled output is recurring.

7. **Stale doc figures left in place.** Progress notes call out `design-review-viewer.md:73` and
   `catalog-snapshot.test.tsx:3` header as stale-but-out-of-scope. Minor known debt carried forward.

---

## Patterns worth feeding to /compound (3+ occurrence candidates)

- **[embodiment-story-lifecycle]** Design-phase fixture stories rendered into the snapshot net, needing a
  deletion trigger before ship. Occurrences: AJ7 `AnnotatorV2.stories.tsx`, AJ6 `CatalogAxis.stories.tsx`,
  W2 token-gallery, AJ5 overlay-mockups. **4+ occurrences — ripe.** Mitigation already proposed in AJ6
  retro (plan names fixture + deletion trigger; code review verifies deletion). AJ7 confirms the pattern
  holds and the existing mitigation worked (removed cleanly at Phase 5), but it is still manual every time.

- **[dev-viewer-port-contention / stale-shadow]** A fixed dev port (8098) shared across worktrees serves a
  stale/other-worktree app; founder/agent sees a blank or wrong surface. Occurrences: AJ7 blank annotator
  (this run), AJ6 stale `discovery.js` shadow, AJ5 viewer-state. **3 occurrences.** Candidate mitigation:
  per-worktree port derivation, or a pre-live-proof "is this MY worktree's viewer?" probe.

- **[manifest-skip on founder-directed follow-ups]** Founder-directed dev-tool evolutions skip
  `/work-planning`, so there is no manifest/track row; downstream `/review`, `/retro`, and CC-007 lose
  their external AC anchor and must reconstruct from concept + git history. Occurrences: AJ7 (this run);
  worth checking AJ5/AJ-track follow-ups for the same shape. Candidate: a lightweight "register the
  concept+approved-design pair as the spec" stub even for delegated runs.

- **[critique-resolution-not-implemented]** A critique WARNING accepted in the plan resolution but absent
  in the shipped code (AJ7 SF-2 `!isConnected`). Single confirmed occurrence here, but a structural risk
  in the critique→plan→build chain: prose resolutions are not executable. Candidate: code review should
  trace each accepted critique resolution to a code site, not just to the plan.

- **[delegated-human-design-review]** The novel-design hard gate was cleared by founder delegation
  ("anything that doesn't occlude the components works") rather than the annotate-in-browser loop. Worked
  here (the no-occlusion principle became binding and drove SF-1), but it means the gate's intended
  artifact (browser annotations driving TSX revisions) was skipped. Worth tracking how often the gate is
  delegated vs exercised.

---

## Notes for ship

- Founder approved ship. After retro: rebase fresh origin/main, verify, attest, push, open PR, wait CI
  green, STOP for human merge (constraints: shipApprovedByFounder, neverAutoMerge).
- PR #328 (white-screen fix) is independent/open.
- Density-switcher removal rides this branch (out-of-scope-but-committed); acknowledge in PR body.
- Stale doc figures (design-review-viewer.md:73, catalog-snapshot.test.tsx:3) noted, out of scope.
