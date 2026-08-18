# Accepted Survivors

Rows that were convicted by the AU20 audit but cannot be removed without violating an enforced
architectural boundary. Each entry records the row, the boundary, and what would need to change
for a future deletion to succeed.

---

- `BakedWorkIntentRequest` — deleting the local mirror forces session-requests to import @hyperidle/work-intent-port, whose enforced audience excludes it. The duplication is real but the fix is a boundary change, not a deletion.

- `BakedContextKnowledgeItem` — local mirror of the same type in @hyperidle/work-intent-port; same boundary constraint as BakedWorkIntentRequest above. Cannot be deleted independently (BakedContextBundle references it).

- `BakedContextBundle` — local mirror of the same type in @hyperidle/work-intent-port; same boundary constraint as BakedWorkIntentRequest above. Used internally by BakedWorkIntentRequest.

- `triggerResolutionHistory` — table row (bundle-01, row 45). Table deletion is stage 3 only, after every reader and writer is gone. The type aliases `TriggerResolutionHistoryRow` and `NewTriggerResolutionHistoryRow` were deleted in this bundle; the table itself waits for the stage-3 pass.

- `filesystemCaptures` — table row (bundle-01, row 46). Table deletion is stage 3 only. The type aliases `FilesystemCaptureRow` and `NewFilesystemCaptureRow` were deleted in this bundle; the table and its INSERT site in mounter-registry wait for the stage-3 pass.

- `extractBuiltinKind` — bundle-05, routine row 15. Cannot delete: `fireBuiltinRoutine` (PLUGIN, BA9) calls it directly (`const kind = extractBuiltinKind(routineId)`). Deletes when BA9 removes `fireBuiltinRoutine`.

- `BuiltinRoutineId` — bundle-05, routine row 16. Cannot delete: return type of `extractBuiltinKind` (survivor above). Deletes with `extractBuiltinKind`.

- `RunBuiltinResult` — bundle-05, routine row 17. Cannot delete: return type of `fireBuiltinRoutine` (PLUGIN, BA9). Deletes when BA9 removes `fireBuiltinRoutine`.

---

## Coverage lost, worth re-establishing

Not survivors — these are gaps the pass created and did not fill.

- **Review participant routing** (`AD1-session-review-routing.integration.test.ts`, deleted). It covered
  adding human reviewers to a thread's participants via team edges, deduplicating and sorting them.
  The risk-tier review creation it was built around is correctly gone, but participant routing itself
  **survives** — the org re-audit kept `resolveReviewRecipients`, rescoped to the agent's team. That
  behaviour now has no integration coverage. Whoever finishes the approve-then-act loop should
  re-establish it against the surviving producer.
- **Session-review unsubscribe** (`session-review-creator.integration.test.ts`, deleted). Five of its
  six tests covered the risk-tier gate and died correctly with it. The sixth asserted that the
  subscriber returns a working unsubscribe function; the liveness subscriber it now guards is live and
  is part of the approval loop being finished.

- **`POST /api/harnesses/redetect` now has no throttle.** Not a survivor and not a coverage gap — a
  security posture change worth stating on its own. That route spawns roughly ten CLI probes, each
  with a fifteen-second timeout, and carried a dedicated one-call-per-five-seconds limiter for exactly
  that reason. The limiter died with the rest of the rate-limiting middleware, which was convicted
  fairly: it ran pre-auth, was principal-blind, and behind a proxy collapsed a whole team into one
  bucket. But the two uses were different in kind — the global limiter was a wall built first, this
  one guarded a real amplification path in the product's own design. If redetect ever becomes a
  problem, that is the learning that earns a narrow guard back, and it should be scoped to the route
  rather than reinstated globally.
