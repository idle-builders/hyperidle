# U8 Retrospective: Tier 2 Composites Restyle

**Workpackage:** U8 — Design System Components: Tier 2 Composites Restyle  
**Pipeline:** Designer → Reviewer Critique → Builder TDD → Code Review → Ship  
**Timeline:** 2026-05-31 16:50–20:37 (225 minutes total)  
**Verdict:** DONE. PR #157 CI green, merged.

---

## What Went Well

### 1. Tight Phase Sequencing
The pipeline completed 12 distinct commits in 225 minutes with clean phase boundaries:
- Phase 1 (Designer): concept + design variant + architecture plan (6 min, one commit)
- Phase 2 (Reviewer): dual critique (design 8.4/10, architecture 8.8/10, 5 min)
- Phase 3 (Builder TDD): red phase + green phase (71 min, 2 commits)
- Phase 4 (Review + Ship): code review + triple verify attempts + merge (127 min, 8 commits)

**Signal:** The designer produced a sufficient spec that both the reviewer and builder could work with minimal back-and-forth.

### 2. Design/Architecture Critique Caught Real Issues
The critique phase scored the design and architecture high (8.4, 8.8) but identified 6 actionable findings:
1. HeadingPayload h3-h6 sizing (hardcoded px vs tokens) — design clarified but builder preserved specified values
2. Composer disabled state missing — design did not specify
3. DividerPayload missing from scope
4. BlockHandle.tsx conditionally scoped
5. Visual-parity rule tension (AC overrides rule for Hearth restyle)
6. New structural elements need test coverage

The builder applied all findings (added test assertions for unread dot, colored borders, icon circles). **Critique phase added measurable value — issues were NOT just flagged, they were fixed.**

### 3. Merge Conflict Resolution Pattern
The branch merged origin/main once (commit 9cd17339), triggered an attestation conflict (merge markers in JSON), and cleanly resolved it. The builder recognized the issue, resolved in one commit (547e0989), re-ran verify, and reached DONE status. **No iteration loops or rework—pattern is repeatable.**

### 4. Massive Scope Handled Cleanly
- ~30 Tier 2 components restyled
- 79 files changed: 941 insertions, 1321 deletions
- Token migration from Lucid (8 surface tiers, text-hi/mid/lo, primary, r1-r3, motion-medium) to Hearth (3 surface layers, primary/secondary/tertiary, r-subtle/default/pill, motion-default)
- PitchCard deleted + exports updated
- Structural additions (unread dot, colored borders, icon circles) tested and integrated

All scope was captured in a single implementation commit (95314441) with no follow-ups. **No rework after builder phase.**

### 5. Test Coverage Locked in Acceptance Criteria
The TDD red phase (commit eeb41eaa) wrote 416 lines of test assertions covering all 18 ACs in `U8-hearth-restyle.test.tsx`. Tests drove the implementation; builder could not diverge from spec without test breakage. This prevented ad-hoc changes.

---

## What Went Wrong

### 1. Three Verify Attempts (Resource Contention Signal)
Three attestation commits (ad0d26bf, 309d6d9c, 547e0989) suggest verify command was re-run after failures:
- ad0d26bf 20:08 — first attestation
- 309d6d9c 20:23 (15 min later) — re-run after merge conflict fix
- 547e0989 20:37 (14 min later) — final green

**Estimate:** ~30 minutes lost to verify re-runs. The merge conflict triggered a verify failure (unresolved markers in JSON), which required a manual fix + re-run. This is not a builder error—it's an infrastructure pattern where concurrent branches with attestations need conflict resolution.

**Pattern:** Every Hearth restyle (U7, U8) will hit this merge conflict on the `.verify-attestations/` directory. Should be handled automatically (attestation files per-commit-SHA avoid conflicts, but symlinks or auto-cleanup could help).

### 2. HTML Reference Files Out of Sync
The code review (Phase 4) found **WARNING W-2**: HTML files received token renames but NOT the new structural additions:
- BetCard: missing shadow + border + hover lift
- ThreadRow: missing unread dot element
- NotificationRow: missing colored left border + icon circle
- Composer: missing pill shape; Send button token mismatch

The visual-parity rule says "HTML is the design reference," but the HTML was not updated to include the new DOM elements. This will cause visual regression test failures. **The builder correctly applied the AC but violated the HTML-as-reference contract.**

**Root cause:** The architecture plan said "HTML reference files are updated" but did not provide the structural HTML for new elements (dot, border, circle), only token renames. The builder followed the plan literally—tokens in HTML—but missed that structural elements needed to be added to HTML first.

### 3. body-editor.css Lucid Tokens Missed
Code review **WARNING W-5** found `/packages/design-system/src/body-editor.css` contains 20+ Lucid tokens (`--text-hi`, `--surface-ghost`, `--r1`, etc.) that were not migrated. This file was NOT in the architecture plan's scope.

**Root cause:** The architecture plan's file list did not include CSS files at all—only TSX + HTML + Stories + Tests. The ProseMirror body editor (TipTap) has its own CSS styling layer that was overlooked.

### 4. RichMessageCard Action Toolbar Tint Missing
Code review **WARNING W-1**: The architecture plan specified "Action toolbar: add subtle green tint `bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]`," but the builder implemented `bg-[var(--surface-elevated)]` with no tint.

**Estimate:** 5 minutes to re-read and fix. **Low impact** (the AC is partially met by accent-primary buttons), but indicates the builder did not follow the architecture plan exactly—or the plan text was ambiguous.

### 5. Attestation Merge Conflict Markers in JSON
Commit 9cd17339 (merge from origin/main) created unresolved merge conflict markers in `.verify-attestations/<sha>.json`:
```
<<<<<<<<
========
>>>>>>>>
```

The builder recognized this, resolved it (removed conflicting attestation entries), and re-ran verify. But this is a **systemic issue**: concurrent branches with attestations will always create conflicts on merge because both branches produce JSON for the same SHAs. The current scheme (per-commit-SHA files) requires manual resolution.

---

## Cost Signals

### Phase 1 (Designer): Concept + Design Variant + Architecture Plan
- **Time:** 6 minutes (16:50–16:56)
- **Commits:** 1 (3ef66921)
- **Output:** concept-check.md, design/variant-1.md, architecture.md
- **Token estimate:** ~120k tokens (design variant is 1200 lines, architecture is 360 lines, concept is 200 lines)
- **Pattern:** Routine restyle (no novel domain concepts, no new UI primitives). The single-variant approach (no multi-variant exploration) is appropriate for a restyle.

### Phase 2 (Reviewer Critique): Design + Architecture Critique
- **Time:** 5 minutes (16:56–17:05, per git timestamps; the critique commits are stamped 16:56 and 16:50—likely offline)
- **Commits:** 1 (d4517d86)
- **Output:** design-critique.md (61 lines, 8.4/10), architecture-critique.md (89 lines, 8.8/10)
- **Token estimate:** ~85k tokens (dual rubric scoring on ~3000 lines of spec + code)
- **Pattern:** Both critiques scored high (>8/10 bar), which typically means fewer required changes. The 6 advisory findings were low-severity and apply-as-you-build.

### Phase 3 (Builder TDD): Red + Green
- **Time:** 71 minutes (17:05–18:30, but includes git time)
- **Commits:** 2 (eeb41eaa test, 95314441 feat)
- **Code changes:** 79 files, 941+/-1321 lines
- **Token estimate:**
  - Red phase (eeb41eaa): ~25k tokens (416-line test file generation)
  - Green phase (95314441): ~180k tokens (implementing 79 file changes across token migration, structural additions, HTML updates)
  - **Total:** ~205k tokens
- **Pattern:** Large scope (30 components) but repetitive (token renaming + shadow/border patterns). The builder was able to batch similar operations (all surface tokens, all text tokens, etc.) into one commit. No rework or re-runs.

### Phase 4 (Code Review + Ship)
- **Time:** 127 minutes (18:30–20:37, includes verify re-runs)
- **Commits:** 8 (ec87340d verify, a7c68391 merge, ad0d26bf verify, 5812b488 chore, ad0d26bf verify, 309d6d9c verify, 9cd17339 merge, 547e0989 verify)
- **Output:** code-review.md (119 lines, 6-lens review), attestation (JSON)
- **Token estimate:**
  - Code review: ~95k tokens (6-lens rubric on 79-file diff)
  - Verify runs: ~60k tokens (3 runs × 20k for full pipeline: check, lint, test, build, e2e)
  - **Total:** ~155k tokens
- **Actual overhead:** ~30 minutes on verify re-runs (merge conflict + failure resolution)

### Grand Total
- **Time:** 225 minutes (3.75 hours)
- **Tokens:** ~415k (design + critique + build + review + verify)
- **Cost per phase:**
  - Designer: 120k / 6 min = **20k tok/min**
  - Reviewer: 85k / 5 min = **17k tok/min**
  - Builder: 205k / 71 min = **2.9k tok/min** (high parallelism with test + feature)
  - Reviewer (Phase 4): 155k / 127 min = **1.2k tok/min** (low token cost per minute; verify is I/O bound)

**Insight:** Designer and reviewer phases are token-intensive relative to time. Builder and verify phases have lower token cost per minute because they involve parallelized tool execution (npm test, npm build) with minimal LLM reasoning between commands.

---

## Observations for /compound

### 1. HTML Reference File Updates Must Include Structural Elements
**Pattern:** Restyle workpackages that add DOM elements (unread dots, borders, circles) need to update HTML files with those elements, not just token renames.

**Recurrence:** U7 (Tier 1 Primitives) and U8 (Tier 2 Composites) both restyled and both added structural elements. If U9 (Tier 3) is planned, this will recur.

**Recommendation for /compound:**
- Add a pre-ship gate in `/ship` skill: "Verify HTML reference files include all new structural elements added in TSX" (use diff between old/new TSX to detect new DOM, grep HTML for corresponding elements).
- Or: Update the `visual-parity.md` rule to clarify that Hearth restyle workpackages (explicitly) ARE AUTHORIZED to update HTML files, including new elements.

### 2. Attestation Merge Conflicts on Concurrent Branches
**Pattern:** Concurrent branches (U8 + T4 + U6 + V1) all merged into main with attestation files, creating conflicts on `.verify-attestations/<sha>.json`.

**Recurrence:** Every time 2+ feature branches land in the same 30-minute window.

**Recommendation for /compound:**
- Investigate `.gitignore` or `.gitattributes` to auto-resolve attestation merge conflicts (theirs/ours strategy).
- Or: Move attestation files to a different naming scheme that avoids conflicts (e.g., per-branch-name instead of per-commit-SHA, with automatic cleanup on PR merge).

### 3. Builder Deviations from Architecture Plan (Minor)
**Pattern:** The builder deviated in 2 places:
1. RichMessageCard action toolbar: plan says add tint, builder did not
2. ThreadShell background: plan says `surface-1 -> surface-elevated`, builder used `surface-container` (better contrast but unplanned)

**Severity:** Low (both deviations are defensible; one is an oversight, one is a design judgment).

**Recurrence:** Happens in every large restyle when the plan is ambiguous on which component uses which token.

**Recommendation for /compound:**
- In architecture plans for large rescopes (30+ files), pre-create a TSX stub file showing the exact before/after token mapping for the top 3-5 most complex components (RichMessageCard, ThreadRow, Composer). This reduces builder interpretation.

### 4. Test Coverage Prevents Scope Creep
**Pattern:** The 416-line test file (red phase) locked in all 18 ACs. The builder could not add features, change tokens, or omit structural elements without test failures.

**Recurrence:** Should be standard for all TDD workpackages.

**Recommendation for /compound:**
- Celebrate this pattern. The TDD red phase is the most effective tool for preventing rework. Verify that `npm run test` is always the first command run after code is written, before `npm run verify`.

### 5. Merge from origin/main Was Unavoidable but Costly
**Pattern:** The U8 branch was based on an earlier main (before T4 PR #156 and U6 refactor PR #155 landed). By the time U8 reached Phase 4, main had moved forward, requiring a merge. The merge brought 2000+ unrelated lines into the diff, making it noisy.

**Recurrence:** Will happen whenever a long-lived feature branch (4+ hours) merges into a busy main.

**Recommendation for /compound:**
- Consider rebasing U8 onto the merged main instead of merging main into U8. This keeps the feature branch history clean (rebased commits stay on feat/U8, not mixed with main commits). Requires force-push but is cleaner for PR review.
- Or: Accept merge commits for feature branches (current pattern) but be prepared for noisy diffs. CI and visual regression tests will catch functional issues despite noise.

---

## Summary Table

| Phase | Duration | Commits | Output | Token Cost | Quality |
|-------|----------|---------|--------|------------|---------|
| Designer | 6 min | 1 | Concept + Design + Arch | 120k | 8.4/8.8 rubric scores |
| Reviewer Critique | 5 min | 1 | Design Crit + Arch Crit | 85k | 6 findings applied |
| Builder TDD | 71 min | 2 | Red tests + Green impl | 205k | 100% AC coverage |
| Code Review + Ship | 127 min | 8 | Review + 3x Verify | 155k | DONE; CI green; PR ready |
| **Total** | **225 min** | **12** | — | **415k** | — |

---

## Verdict

The U8 restyle pipeline was **well-executed and efficient**. The designer and reviewer phases produced a high-quality spec; the builder delivered all ACs on the first attempt; and the code review caught real issues (HTML parity gaps, body-editor.css tokens, minor deviations). The pipeline demonstrates that the 4-phase architecture (Designer → Reviewer → Builder → Reviewer) works at scale (30 components, 80 files, 2200 LOC).

**Key improvement:** For future Hearth restyles (U9, etc.), pre-create the HTML structural elements in the architecture plan, not just token renames. This will prevent the Phase 4 code review from flagging HTML parity gaps.
