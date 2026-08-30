# Track R: Journey Bliss

Make the end-to-end user journey work — from install to daily rhythm. No new features: wire what exists, strip what is unnecessary, verify that what is built actually functions.

**Constraint.** After each package merges, `npm run dev` must work — the app runs in dev mode at every merge boundary.

**Shipped.** R1–R8 are all merged. R9 is the one package that never finished.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| R9 | Action prominence audit: on every page, the two most important actions are the most visually prominent and accessible elements | frontend | M | R2 (shipped) | **unfinished — stopped at write-code and never resumed.** Design, design-critique, architecture, architecture-critique and write-tests are all done; the tests exist and are red. Write-code, review and retro were never run. See `work/R9/plan.md`. Two things a resumer needs: the design and design-critique were done pre-pipeline with direct user review, so they are not in the usual artifact shape; and R9's declared dependency R2 had not merged when work started — the founder directed proceeding anyway, and the tests were written against that assumption, so re-check that call. **Constraints:** no new components — this is adjustment of existing visual weight (size, colour, position, contrast) within the existing tokens; irrelevant actions are de-emphasized, not hidden; empty states guide toward the #1 action; desktop viewport only. **Re-scope first:** the audited page list names surfaces that have since changed (the Portfolio page was removed by AD9), and track AZ has since closed the visual system and carries ~110 bug-list items in the same area. |

## Dependency graph

- `R9` → `R2` (shipped): R2 redesigned the landing and setup surfaces R9 audits — auditing them before that landed would have produced throwaway findings. R2 has since merged, so the ordering concern is closed, but see the row's note about the tests written before it did.
- Cross-track: track AZ (`.pipeline/AZ.md`) owns UI coherence and its bug list overlaps R9's territory. Reconcile the two before resuming rather than fixing the same surfaces twice.
