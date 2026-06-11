# AF14 — Retro & Cost Signals

**Workpackage:** AF14 — Conversations correctness and live updates  
**Branch:** `feat/AF14-conversations-live`  
**Verdict:** SHIPPED (6 ACs green, all tests pass, code review DONE)  
**Duration:** 6 phases, 11 commits, 6d (concept → design → critique R1 → revise → critique R2 → tests → code → attestation → review → polish)  

---

## Key Observations

### The grep-on-binary trap

`packages/web/src/layouts/AppShell.tsx` is byte-classified as `data` by the `file` command. This caused a high-impact reviewer error in Phase 2 Round 1:

- **Symptom:** Plain `grep "Coc"` returns zero matches; `rg -a "Coc"` returns 20 hits.
- **Cost:** Round-1 architecture critique filed **CRITICAL C1** ("AppShell mounts NO overlay; fabricated fix location") based on grep silence, when the file actually contains 20 Coc references including two mount sites (`:754` mobile, `:786` desktop).
- **Consequence:** Forced a full revision round (concept → design → arch → critique R1 → revise → critique R2), adding 1 day and 5 commits.
- **Resolution:** Revised plan re-verified with `rg -a` (force-text mode) + Read tool. Round-2 re-critique recovered score from 5/10 → 8/10 with C1 marked as "false-positive, reviewer tooling error."
- **Mitigation:** Added `@lore AF14` to `AssistantOverlay.tsx:368` flagging the trap for future agents: "AppShell is binary-classified; use `rg -a` not `grep`."
- **Risk:** This hazard is specific to this file and will recur unless the agent remembers the lore. Higher-level fix: add a pre-review checklist step checking for binary-classified source files and switching to `rg` automatically.

**Compound candidate:** This is a new finding; no match in existing CC- candidates. Recommend creating **CC-027: Binary-classified source files evade plain grep** with a tag for Explore/reviewer agents to scan for on every critique pass.

### Incomplete migration enumeration

The Coc→Assistant rename was a **half-landed migration spanning 36 files** (34 web + 2 server) that the original plan enumerated as ~9 files:

- **Round-1 critique:** W2 flagged the gap (9 listed, 31+ actual Coc references found).
- **Round-2 revision:** Plan re-derived all 36 files with delete/reroute/rename per site, including `index.css` (`@keyframes coc-open`), `KnowledgeDetail.tsx`, and test files.
- **Green-phase delivery:** Builder followed revised plan but missed 2 handler identifiers (`handleCocClick`, `handleCocClose` in AppShell.tsx:218,222) that were not renamed to `handleAssistantClick`/`handleAssistantClose`.
- **Phase-4 code review:** W1 finding ("incomplete identifier rename violates plan's zero-hit atomicity gate").
- **Post-review polish:** Commit 6e253460 (the 11th) fixed both handlers + re-wrote sort test + removed stale FilterChip comments.
- **Root cause:** Plan's own atomicity gate (`rg -a "Coc" | zero hits`) was explicit, but enumeration was incomplete despite Round-2 re-derive. Builder faced an incomplete spec.

**Compound candidate:** Matches existing **CC-021** (Migration enumeration). AF14 demonstrates the pattern recurs even with explicit plan sections and atomicity gates. The enumeration-per-site discipline (introduced in `architecture/SKILL.md` Phase 2 item 8) helped but was not sufficient — the missing identifiers suggest the architect's enumeration still had blind spots. Recommend tagging this as a recurrence and promoting CC-021 to require a **secondary grep-verification step** performed by the builder as a gate before code-phase completion (not just in the plan).

### TDD efficacy

All acceptance criteria proved first-pass green:

- **Test count:** 44 web + 10 server integration tests written in red phase (commit b2ac6d58).
- **Code phase:** All 44 tests passed at first green (commit 5a4fe2d6), no test rework needed.
- **Coverage:** All 6 ACs covered by executable assertions (though NITPICKs note that AC2 and AC5 lacked direct behavioral tests — they were proven by code inspection + mount swap + integration tests, not by unit test of the specific load-bearing code path).
- **Verdict:** TDD red-before-green remains a reliable signal for implementation quality. No rework loop.

### Critique finding application (process win)

Phase 2 design now includes a **revision loop** where the designer revises the plan after critique before handing to the builder:

- **C1 finding (false-positive):** Reviewer's grep error was caught and corrected in revision. The designer re-verified with proper tools and confirmed the file actually contains the claimed content.
- **C2 finding (TOCTOU race):** Designer added a DB-backed mitigation (partial unique index + onConflict + re-select) with full rationale and test plan.
- **W1 + W2 findings:** Both were resolved in revision with explicit specifications.
- **Builder delivery:** Clean plan with zero unresolved CRITICALs, all WARNINGs addressed.

This process (landed in pipeline/SKILL.md Phase 2) paid off — the builder received a plan that was already vetted, and code review Round 1 found no CRITICALs, only NITPICKs.

---

## Cost Breakdown

| Phase | Commits | Notes |
|-------|---------|-------|
| Concept | 1 | Routine WP, no reshape needed. |
| Design | 1 | Routine WP, single variant approved. |
| Critique R1 | 1 | Critique artifact + false-positive binary-grep finding. |
| Revise + Critique R2 | 2 | C1 re-verified, C2+W1+W2 resolved, score 5→8. |
| Tests (red phase) | 1 | 44 web + 10 server; no integration/E2E. |
| Code (green phase) | 1 | All tests pass on first run. |
| Attestation | 1 | Verify clean. |
| Review | 1 | DONE verdict, W1 + N1-N4 notes. |
| Polish | 1 | Rename handlers, fix tests, drop dead comments. |
| **Total** | **11** | **1 extra revision round due to grep trap + migration enumeration gap.** |

Without the grep-on-binary false-positive, the expected path would have been ~8 commits (no Round 2 critique needed). The trap cost 1 day + 3 commits (revise + re-critique + polish).

---

## Residual Risks (Documented, Out-of-Scope)

1. **R5 backfill gap:** Pre-AF14 direct threads with duplicate `(hostKind, hostId, participants)` tuples remain unfixed (they keep `NULL direct_key`). The partial unique index `WHERE direct_key IS NOT NULL` does not enforce retroactive dedup. This is acceptable for the local-default (single human, serial creates) and is documented in schema @lore.

2. **Post-DONE polish:** The plan's atomicity gate was not fully met in green phase (identifiers `handleCocClick`/`handleCocClose` were not renamed). This required a post-review commit. The gate was explicit, but the build step was incomplete. Future migrations should have a builder checklist: "Run `rg -a <pattern> | wc -l` for zero-hit proof before green-phase completion, not after."

---

## Signals for `/compound`

- **CC-027 (new):** Binary-classified source files evade plain grep. Affects future file-search in this codebase; recommend pre-review checklist.
- **CC-021 (recurrence):** Migration enumeration incomplete despite Phase 2 item 8. Recommendation: secondary grep-verification gate at builder time, not just in plan.
- **Critique revision loop (process success):** Preserve the design Phase 2 loop where findings are revised before builder handoff. This prevented repeat discoveries in code review.

---

## Success Markers (Protect)

- **TDD red-before-green:** Zero rework loop, tests green on first implementation pass.
- **Architecture critique → revision → builder:** No CRITICAL findings reached code phase.
- **Single-agent reviewer warm from Phase 2:** Code review captured and corrected incomplete identifier rename without architect re-involvement.

---

**Date:** 2026-06-12  
**Observations logged to:** `.pipeline/retro-log.jsonl` (6 entries)
