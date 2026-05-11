# N3 Retro — Agent Execution Scope Decision

**Date:** 2026-05-11  
**Branch:** N3 (4 commits)  
**Outcome:** DONE — decision shipped, follow-up workpackage registered  

---

## What Went Well

**Spike was low-cost and high-signal.** The spike script (`run-spike.ts`) avoided full server bootstrap by importing `provisionSession` directly from the service module (not from `index.ts`). This enabled a clean proof-of-concept that ran in ~2 minutes without external API keys, reducing friction. The two-adapter swap (Phase B → Phase C) correctly demonstrated that the harness abstraction holds — changing one assignment, no DB or workspace changes.

**Threat model caught critical finding.** The threat model identified T4 (env var exfiltration) as the actionable gap: `ClaudeAgentSdkAdapter` sandboxes env vars, but `LocalWorkspaceAdapter.exec()` inherits the full `process.env`. This finding drove the concrete mitigation (allowlist in workpackage N3a). The desktop context re-evaluation was honest and appropriately scoped the risk (single user, no privilege escalation).

**Reviewer caught evidence inconsistency and fixed it.** The code review (Phase 4) identified that `results.txt` Phase E section was stale (contradicted both the spike script and actual Phase B/C output). The builder regenerated `results.txt` in commit fc5c0c8, resolving A1. This shows the review process caught something the builder missed.

**Documentation was self-contained.** The decision document includes the extension point spec (section 8) covering what changes and what doesn't when adding a new harness adapter. The reader can implement without re-reading the source code.

---

## What Went Wrong

**Spike phase D was incomplete.** Phase D (real `ClaudeAgentSdkAdapter`) was skipped due to missing `ANTHROPIC_API_KEY`. The spike was still valuable, but testing with the actual vendor adapter would have caught any SDK surprises. Workaround: phase D can run later in a CI environment with credentials, but this is a follow-up, not a blocker.

**Architecture plan was not written.** `plans/N3/architecture.md` does not exist. The reviewer had to check acceptance criteria against the TRACK-N.md spec directly (per code-review.md Lens 1). For a decision workpackage, this is lower-impact than for a code workpackage, but it broke the "plan before any artifact" rule. Cause: N3 is labeled as "decision + spike" so the builder may have assumed architecture planning was optional. It wasn't.

**Surface audit is hardcoded, not observed.** Phase E of `run-spike.ts` contains hardcoded console.log statements with static file references and line numbers (run-spike.ts:348-420). If `local-workspace-adapter.ts` changes, the audit becomes stale with no signal. This is a spike limitation (observational cost), not a correctness issue, but the decision doc should not present the Phase E claims as "dynamically captured from the spike" — they are manual source readings from spike-writing time.

**N3a scope creep risk.** The follow-up workpackage (N3a) includes server wiring + Settings UI credential entry. This is appropriate, but the Settings UI touch depends on N4 (Electron shell) being partially done to understand the desktop UX. If N4 is delayed, N3a's UI work stalls. The dependency graph shows `N3a depends: [N3, N4]` — correct, but the UX coupling is tight.

---

## Surprises

**Unknown tool call was handled gracefully.** The spike predicted that a `read_file` tool_call for an unregistered tool would cause `outcome: "crashed"` (per architecture preconceptions). Actual result: both Phase B and Phase C completed with `outcome: "completed"`. The evidence suggests `registry.invoke` returns an error result rather than throwing. This is better than expected — it means the provisioning loop's error handling is more resilient. Finding was documented in code-review.md A3, and the builder clarified it in the regenerated `results.txt`.

**Bun's native sqlite driver is a viable DB abstraction test.** The spike used `bun:sqlite` with Drizzle ORM instead of `better-sqlite3` (the production driver). This was a pragmatic choice to avoid Bun runtime incompatibility, with a type cast (`as unknown as HyperIdleDb`). The cast worked, and the spike proved Drizzle's abstraction is driver-agnostic. This finding parallels the harness abstraction proof — both are strengthened by showing substitutability.

**Reviewer re-review was fast.** After the builder fixed A1, A3 in commit fc5c0c8, the reviewer re-checked within the same day (2026-05-11) and issued DONE verdict. This suggests the rework was surgical and the review gate was not onerous.

---

## Cost Signals

**Branch: 4 commits, single review cycle.**
```
12b98cb  chore(N3): open WIP — pipeline scaffolding
5a31890  feat(N3): spike script + decision document + N3a follow-up  
fc5c0c8  fix(N3): regenerate results.txt, fix stale Phase C comment, accept T1/T2 risk
3c7eb89  chore(N3): reviewer verdict DONE — all findings addressed [skip ci]
```

The 4-commit pattern reflects the minimal rework: initial WIP scaffold, main spike + decision + follow-up, one remedial fix (regenerate artifact + clarify T1/T2), and the ready-flip. This is lean for a decision workpackage.

**One NOT DONE → DONE cycle.** The reviewer raised 6 findings (A1, A2, A3, S1, S2, SL1). Three were fixed (A1, A3 as blocking; SL1 was shortened). Three were accepted as non-blocking (A2 spike limitation; S1, S2 design/state trade-offs acceptable). No major rework, no architecture redesign. The cycle closed in one pass.

**Phases 1 & 2 were skipped.** The workpackage is labeled "decision + spike (S complexity, ~1.5d)". The pipeline's Phase 1 (/concept) and Phase 2 (/design-critique) were omitted because the decision was pre-determined by the Finding 1 from N2's concept work. This skip was appropriate — the architecture had already been reviewed, and the decision was a "which option to ship" choice, not an open design problem. The spike was the evidence phase, Phase 3 was production-mode builder feedback, Phase 4 was review, Phase 5 was ready-flip.

**Estimated effort was accurate.** ~1.5d mapped to 4 commits over ~12 hours (spike writing, decision doc, one fix cycle, ready flip). The low rework cost validates the estimate.

---

## Process Observations

**Decision workpackages with spikes should mandate architecture planning.** Even though the architecture was pre-existing (from earlier concept work), writing `plans/N3/architecture.md` would have made the spike's scope and target explicit and given the reviewer a clear reference point. The review was conducted against TRACK-N.md directly, which is acceptable but less rigorous than a dedicated plan. Recommendation for future: always write the architecture plan, even for decision workpackages.

**Spike + decision + follow-up is a valid pattern for harness-level decisions.** The pattern worked well here: spike proves the abstraction (in isolation), decision documents the threat model and mitigations (in detail), follow-up registers the implementation work (in the pipeline). The three artifacts are distinct and each serves a clear purpose.

**Skip Phases 1 & 2 when the design space has been fully explored.** N3 skipped /concept and /design-critique because Finding 1 (from N2's workpackage concept review) had already identified the problem and narrowed the design space to three pre-evaluated options. The skip was appropriate; attempting to re-open the design would have been wasteful.

**One-shot review (no re-design cycle needed) is possible when the spec is tight.** N3's AC was clear (spike it, threat model it, decide, register follow-up), and the builder delivered against the spec directly. The rework was surgical (regenerate stale artifact, clarify residual risk). This suggests tight acceptance criteria + low ambiguity = fewer review cycles.

---

## Findings for /compound

**Pattern 1: Artifact regeneration after review (2+ occurrences expected in future).** A1 (stale spike output) required the builder to regenerate `results.txt` to match the current script. This pattern — "an artifact's content drifted from the source, review caught it" — will likely recur if spikes are frequently re-run or if builders hand-tweak spike output. Mitigation: mark spiky outputs as "auto-generated, do not edit by hand" and add a script to regenerate them.

**Pattern 2: Hardcoded audit claims in spike outputs (learning).** Phase E of `run-spike.ts` is entirely `console.log` with static claims, not dynamic inspection. Future spikes that perform audits should either (a) make the audit dynamic (inspect at runtime), or (b) explicitly document that claims are manual source readings at spike-writing time. Current spike did neither, creating ambiguity.

**Pattern 3: High asymmetry between adapter implementations.** The spike proved the adapter abstraction by creating a second stub (`StubHarnessAdapter`), but the stub is trivially similar to the existing mock (S1 in code-review.md). Future spikes testing abstractions should either (a) create stubs with meaningfully different behavior, or (b) document that the abstraction proof doesn't require behavioral diversity. Current choice (trivial stub, proof holds regardless) was correct but not fully justified in the code.

**Pattern 4: Threat model matured during review.** The initial threat model identified T1/T2 (filesystem escape) but didn't explicitly accept them as residual risk for the desktop context. The reviewer prompted for this acceptance + Seatbelt/chroot rationale, and the builder added it in fc5c0c8. This suggests a pattern: threat models are incomplete until they explicitly *accept* the threats they don't mitigate. Future: make "acceptance rationale" a required section of threat models.

---

## Summary

N3 delivered a tight decision with strong evidence. The spike correctly isolated the harness abstraction (proved via adapter swap), the threat model identified T4 as the critical mitigatable gap, and the follow-up workpackage (N3a) is properly scoped and sequenced. One artifact (results.txt) was stale and required regeneration; one process gap (no architecture.md) broke the "plan before any artifact" rule but didn't prevent delivery. The cost was low (4 commits, 1 review cycle) and the pattern (spike → decision → follow-up) is suitable for future harness decisions.
