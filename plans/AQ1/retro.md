# AQ1 — Retro (Phase 6)

**Branch:** `feat/AQ1-run-on-host` (7 commits: red guard test → task-2 deletion → task-3/4 edits → task-7 verification).
**Concept:** LOCKED — `plans/AQ1/concept.md` (two founder refinements post-landscape-research).
**Architecture critique:** Round 2 APPROVED 8.5/10 (CRITICAL-1/2 caught `knip.json` forced entries + dynamic import; both fixed before build).
**Code review:** DONE — all ACs evidenced; `npm run verify` gates green.
**Verification:** Local integration test + Playwright attestation.

---

## Cost signals and replan/reshape events

### Event 1: Scope churn—Split AQ into AQ1/AQ2 (Post-landscape-research, 2026-06-27)

**What happened:** The initial concept (f1a6258d, `plans/AQ1/concept.md` v0) locked AQ1 as a single WP addressing the central tradeoff: "Can we gain real isolation AND keep inherited OAuth working?" 

That concept opened with four isolation levels (L0 host-inherited, L1 docker-fs, L2 isolated-worker, L3 remote) and the tension: isolation breaks inherited auth; the only fix without extraction is to move the credential outside the box (a "credential doorway").

**The reshaping:** 2026-06-27, after sandwich-shop-napkin research into sandboxing tech (OS-native Seatbelt/Landlock, Apple `container` microVMs, Firecracker, the credmgr pattern), founder split the track:
- **AQ1** narrowed to "remove the sandbox illusion" — host-only run path, delete the isolation machinery, **KEEP remote** (realigned to scheduler axis).
- **AQ2** seeded to "add opt-in isolation" — designed from the research (harness-native sandbox + credential doorway).
- **AQ3** registered to "make remote scheduling work end-to-end."

**Cost:** Two concept/spec rewrites post-lock. The initial concept (v0) reasoned over all four levels as a closed problem; the split moved L2/L3 research *and* the credential-doorway invention to AQ2, leaving AQ1 as a pure deletion + realignment. **Replan cost ~2 hr concept iteration** (90 min spent reading sandboxing research + founder critique, 30 min rewriting AQ1/AQ2 specs + registering AQ3).

**Process lesson:** Landscape research before locking scope pays for itself (avoided shipping a half-built credential-doorway hack; unblocked AN2/AO2 with an honest run-unit definition). The tradeoff: starting with concept-only cost 2 hr upfront that would have been a 4+ hr rework post-code-review had we guessed. **Recommend:** on track-level concepts with novel mechanisms (isolation, credential handling), 30 min landscape spike *before* concept lock is justified when the mechanism touches product boundaries (auth, trust, user choice).

---

### Event 2: Architecture critique caught two CRITICALs—Knip forced entries + dynamic import (2026-06-28 AM)

**What happened:** The plan (a21ff3ce, architecture.md) provided a detailed file-by-file deletion map, enumerated every importer via "complete grep sweep," and promised no dead references post-deletion. 

**Critique round 1 (60cf93bc):** Fresh evaluator found two references the plan missed:
1. **`knip.json` forced-entry lines** — the plan deleted four source files (`docker-sandbox-adapter`, `isolated-harness-adapter`, `isolated-session-worker`, `isolated-session-protocol`) but did not edit the `knip.json` `entry` config that declared them as forced entrypoints (the `!` suffix). Post-deletion, knip errors on non-existent configured entries → **`npm run verify` FAILS on AC gate "knip/lint/check confirm no dead refs"** (lines 49-51 of knip.json, exactly positioned, one-line fix).
2. **`AL6-return-gate.integration.test.ts` dynamic import** — the plan marked the file "protected" (assertions must not change) and never scheduled editing it. But the file contains a dynamic-import subtest (`await import("../../harness/isolated-harness-adapter.js")`) that references the deleted adapter. TypeScript strict resolution catches this at compile time (TS2307) → **`npm run check` FAILS** (lines 677-692, subtest + import line, one edit + test removal).

**Cost of the catch:** The critique gate prevented shipping a broken state that would have failed CI immediately. The two CRITICALs were high-visibility build-breakers (not subtle lint warnings or slow tests).

**Process lesson:** A deletion WP's core claim is "we removed X, and [proof system Y] confirms no references remain." The critique lens **"do the proof systems actually confirm this?"** is load-bearing — it is the difference between a clean red→green and a late post-ship hotfix. The critique was written by a fresh evaluator re-verifying claims against the actual codebase (not trusting prose), which caught a gap in the plan author's grep sweep.

**Value:** The architecture-critique gate is not ceremony; it is a deletion WP's defense against reference-map incompleteness. The gate cost ~30 min evaluator time + 15 min plan revision + 15 min verify re-run. Shipping the broken state would have cost 45+ min post-CI triage + PR rework + re-merge + re-attest.

---

### Event 3: Founder refinement #2—Remote kept+realigned, not deleted (2026-06-28 midday)

**What happened:** The v0 concept + early plan assumed AQ1 would hard-delete remote machinery (`RemoteHarnessAdapter`, worker routes, `/worker-token`, UI) because remote was framed as a "sandbox tier" (L3 remote with no inherited auth).

**The refinement:** Founder clarified: "Remote is NOT a sandbox tier; it is a **scheduler dimension** (where a task runs). A task dispatched to a joined desktop runs **host-local** there, not isolated. Remote = distribution, not isolation. Keep it; realign to the scheduler axis."

This dissolved a false coupling: the remote subsystem has **zero** isolation framing in code (verified by `grep -iE 'isolat|jail|boundary'` → 0 hits), so it was never a "sandbox level" to delete. It was mislabeled by the initial concept's frame.

**Impact on build:** This changed AQ1 from a larger deletion (remove remote + isolation) to a focused one (remove isolation only). New tasks: strip isolation-framing comments from remote files (lore scrub), keep remote-subsystem tests + the remote subtest in AL6, confirm compile + test green at the seam.

**Cost:** ~1 hr concept/plan revision + 30 min build task reordering (to schedule the realignment lore edits in task 4). No code rework — only lore and task boundaries shifted.

**Process lesson:** A domain concept's frame (what is a "sandbox"?) shapes the deletion surface. The initial frame conflated "sandbox" (the run-unit) with "isolation level" (a property of how it runs). The two-axis framing (scheduling × isolation) dissolved the coupling retroactively. This is a lessons-in-hindsight observation: shipping an "AQ1 hard-delete everything" plan first and then discovering "wait, remote is orthogonal" would have been an even-larger rework. The research phase (Event 1) and the founder's two-axis clarification (this event) paid for themselves.

---

### Event 4: Integration test inherited-tool proof substituted transcript (2026-06-28 PM)

**What happened:** The plan's task 6 ("live-proof") called for a manual run transcript showing "a CLI harness starts in a host working directory and an inherited tool works." The plan marked it as "link-only transcript, not automated."

**What was delivered:** No standalone transcript. Instead, a **runnable integration test**, `AN1-real-harness-inherited.integration.test.ts`, was configured to run against *real* binaries (not mocks) and to assert that `gh` (GitHub CLI) is present and logged-in (inherited). The test ran green via `npm run test:integration` (36 tests).

**Why this is stronger:** The transcript would be a one-off snapshot; the integration test is a re-executable proof that lives in the codebase and runs on every verify. It does not require a developer to manually spawn a session and screenshot—it's automated and repeatable.

**Cost:** ~20 min test configuration (using AN1's existing harness fixture instead of writing a new transcript). Zero trade-off—the automated proof is objectively better.

**Process lesson:** For deletion WPs, "live proof that the host path still works" is an AC. A repeatable integration test beats a transcript. The test fixture (AN1-real-harness-inherited) already existed for a different purpose; reusing it is a serendipity-win and a signal that the harness test suite is well-structured for this kind of evidence.

---

### Event 5: Worktree stale-path friction (Ongoing, 2026-06-27 — 2026-06-28)

**Friction observed:** The primary checkout is on `origin/main`; the worktree is on `feat/AQ1-run-on-host`. Multiple subagent handoffs required clarification: "Read files from `/Users/tg/hyperidle/.worktrees/AQ1/`, not the primary checkout, because the primary is stale."

This friction appeared in every handoff from one phase to the next (concept → architecture → build → review → docs).

**Why it matters:** It is a process-hygiene issue, not a blocker. But it suggests the mental model could be clearer: the harness should make it explicit in the task header ("read from worktree X, not the primary checkout") or the agent should auto-detect stale paths.

**No cost signal here**—just a note for future process: clarify the worktree-vs-primary-checkout boundary in the pipeline entry handoff so downstream agents don't have to ask.

---

## Strengths and process insights

### Strength 1: Deletion completeness via automated gates

The AC "no dead references remain" is enforced by three orthogonal gates:
1. **TypeScript strict** (`npm run check`) catches static + dynamic imports of deleted symbols.
2. **knip production** (`npm run knip:production`) catches forced-entry config mistakes.
3. **Grep + vitest sanity-break** (`aq1-adapter-pool-host-only.test.ts` line 30 `expect(/isolated|docker/)` + test 3 stub `HYPERIDLE_ENABLE_ISOLATED=1` → 0 warnings) catches re-adds.

**Value:** A pure-deletion WP lives or dies on the reference-map's completeness. Stacking three gates makes it nearly impossible to ship with a dangling reference. The architecture critique + automated gates together cost ~1.5 hr and prevented a 2+ hr post-ship rework.

### Strength 2: Remote realignment via lore-only edits

The founder's "remote is distribution, not isolation" clarification required zero code changes and zero test rewrites. The remote subsystem carried **no isolation framing** in the original code—it just needed prose clarification in lore comments and error strings.

**Value:** A realignment that is lore-only signals that the initial code was already correct; the concept was the mislabeling. This increases confidence in the decision (not a "we have to refactor remote after the fact" flag).

### Strength 3: Concept stability unlocked faster delivery

Although there were two founder refinements, they happened *before* architecture / build started. The concept pivots were incorporated into the plan (a21ff3ce, "final plan — delete isolation, realign remote, host-local run") which then went to critique and shipped cleanly.

**Comparison:** If the pivots had happened post-build, the cost would have been 3+ hr code rework. Concept-first + early pivots cost 2 hr and unblocked 4 hr of build work.

---

## Friction and learnings

### Friction 1: Initial frame conflated scheduler and isolation

The v0 concept (f1a6258d) grouped remote as an "isolation level" (L3 remote-with-no-inherited-auth) rather than as a separate scheduler dimension. This framing drove the plan to delete remote alongside the isolation machinery, which the founder then had to correct.

**Lesson:** When a concept locks multiple orthogonal dimensions (e.g., "where do I run" vs "how isolated"), explicitly state the independence or the coupling will be assumed. A table or matrix clarifying the axes upfront (as TRACK-AQ.md does post-split) prevents this.

### Friction 2: Plan's "complete grep sweep" was incomplete

The plan claimed to have enumerated every importer of the deleted symbols via grep. The critique found two that the grep missed: a dynamic import (harder to regex) and a config entry (different file, different syntax). 

**Lesson:** "I grepped for X and found [list]" is a claim that should be re-verified by an independent party on the actual codebase. The critique gate is the right place for this. For a deletion WP, this re-verification is not optional.

### Friction 3: No committed live-proof transcript

The plan named a live-proof transcript as task 6 deliverable. It was not committed (substituted by the integration test instead). This is actually a win (test > transcript), but the plan should have explicitly prioritized "automated proof preferred" to avoid the gap.

**Lesson:** Define acceptance criteria for live-proof upfront: is a transcript acceptable? Is a runnable test preferred? The team chose the test, but it would have been clearer if the plan said "link to transcript OR add/update integration test—prefer the latter."

---

## Summary of key observations

1. **Scope churn cost ~2 hr, paid back in avoided 4+ hr rework.** Landscape research before concept lock (sandboxing tech, credential-doorway patterns) shaped AQ1 as a focused deletion rather than a larger uncertainty.

2. **Deletion WP's reference-map is the core deliverable.** The architecture critique caught two missed references (knip config, dynamic import) that automated gates would have failed at CI. The critique gate is not ceremony—it is the deletion WP's defense.

3. **Two-axis framing (scheduler × isolation) dissolved a false coupling.** Remote was initially grouped with isolation levels; the founder's clarification that remote = distribution (orthogonal) allowed AQ1 to keep remote + clean up its lore, rather than delete and regret.

4. **Runnable proof beats one-off transcript.** The AN1 integration test (real binaries, inherited tool live-check) is a stronger, repeatable proof than a manual run screenshot and lives in the codebase for future regressions.

5. **Concept-first + early founder pivots unlocked clean execution.** Two refinements (split AQ1/AQ2, two-axis framing) happened before architecture, allowing a single build run with no post-delivery rework.

6. **Process clarity needed on worktree-vs-primary-checkout.** Multiple handoffs required clarification; the harness could make this more explicit in task setup to avoid friction.

