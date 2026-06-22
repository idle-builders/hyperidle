# AK8 — Concept probe

**No new load-bearing noun.** AK8 introduces nothing new; it relocates an existing behaviour behind an already-locked seam.

Reuses, unchanged:
- **Kernel "work to decompose" event** — the Kernel-emits-occasion pattern locked in `docs/architecture/kernel-strategy-split.md` §2a (Trigger=Kernel) and realised by AK7's `work_selection_requested` precedent (§3b). AK8 adds one sibling event of the same shape; no new concept.
- **Strategy handler seam** — the Strategy Port (`packages/shared/src/strategy-port.ts`), already a 4-method interface (AK2/AK6/AK7). AK8 adds a 5th method of the same character (Kernel hands occasion → Strategy returns a knowledge decision); identical authority/closure/cardinality contracts as `selectAgent`.
- **AK3 decomposition path** — `runBetDecomposition` + the four-state bet surface + CAS idempotency + crash recovery. §4 already declares AK3-as-built *is* the Minimal Strategy's default fallback. AK8 makes that declaration real in code; the concept was locked at boundary-refinement time (2026-06-15, §2a bullet 3).

**Vocabulary check:** "decompose" / "breakdown" / "task list" already in use (AK3, `DecompositionTaskInput`). No collision, no rename. The new event name is `work_decompose_requested` — parallels `work_selection_requested` (AK7) so the two Kernel work-occasion events read as a family.

**Authority (confirmed, not new):** Kernel owns the trigger + mechanism (emit, sandbox, cost-cap, persist tasks, CAS, crash sweep); Strategy owns the decision (which decomposer agent, what knowledge context, the task breakdown shape, owner assignment). This is the §2a three-way cut applied to decomposition — settled concept, not reopened here.

**Conclusion:** proceed straight to architecture. No `docs/` ground-truth reshape needed beyond an as-built §3c append (architecture task).
