# Design Critique: AF14 — Conversations correctness and live updates

DESIGN-CRITIQUE: variant=approved score=8/10  rounds=1  axes: H:8 S:8 T:8 C:8 Co:9 St:7 A:8 AS:9 PP:8

**Nature of this design.** AF14 is a correctness/bugfix WP. The design artifact is a *decision spec* (chip removal + a server-resolved title ladder + "keep empty/loading as-is"), not a set of visual variants with a mockup. There is no new component, no new pixel surface — `ThreadRow` renders unchanged; only the *value* of `title` changes and two chip instances are deleted. Scoring is therefore on the soundness of the design decisions against the rubric, not screenshot fidelity. No mockup exists, correctly (zero new surface).

---

## Pivotal call 1 — REMOVE chips vs hide/disable: CORRECT

The spec contract is explicit: "If a filter cannot be backed by real state, remove the control rather than ship a chip that never matches" (TRACK-AF.md:565). The concept finding (concept.md §3) establishes that *unread has no backing primitive at all* — there is no `read_at` / per-participant watermark anywhere in the locked Thread model — and *blocking's* backing state is not produced until AF7. A greyed/disabled chip is a permanently-inert control: it occupies a tab stop and header space, signals an affordance that never fires, and trains the user that the control is broken. Removal is the right call. The design's rationale (§3 "a control that's always inert is noise in a density-first inbox") is sound and matches the Hearth density-first credo. The decision to **keep the `blocking`/`unread` fields and the `FilterChip` component** (only the two Conversations instances go) is the correct forward-compatible scope — re-introducible when AF7 lands. No finding.

## Pivotal call 2 — Title ladder completeness: TWO GAPS

The ladder (design §1) is: assistant → DM other-participant name → host title → group host/participant-join → fallback `hostId`. Two unhandled cases:

1. **Multi-participant DM / 2-participant where the "other" is an agent without a `users` row.** Rung 2 says "the *other* participant's `users.name`." But a DM can be host=`agent` with a participant id like `ast-<id>` or an agent principal that may NOT have a row in `users`. If the other participant id has no `users` match, the name map lookup returns undefined and the ladder must fall through — the design does not state the fall-through. WARNING: specify that an unresolved participant name falls to rung 4/5, never renders `undefined` or a bare id.

2. **Deleted / missing host entity (dangling hostId).** Rung 3 resolves bet→`deriveTitle(description)`, task→`title`, ki→`title`. If the host row was deleted (thread outlives its host), the batched query returns no row for that hostId → null title. The design does not say what happens: it must fall to rung 5 (`hostId` fallback), and `hostId` for a deleted bet is a raw id — arguably the very "raw identifier" AC1 forbids. WARNING: define deleted-host behavior; a raw `hostId` for a dangling host re-introduces the AC1 defect ("threads show human-readable titles rather than raw identifiers"). Consider a typed human fallback (e.g. `"Deleted bet"`) over a bare uuid.

These are completeness gaps in the spec, not wrong decisions — but the architect inherits them and the design left them implicit.

## Empty / loading / error: CORRECT (verified)

Design §2 keeps existing `EmptyState` / `SkeletonList` / `ErrorState` as-is and argues filtered-empty is now unreachable from the flat Conversations path (no client filter can empty a non-empty list after chip removal). This is internally consistent. The `ThreadSections` section-grouped filter path is explicitly retained for other callers — correct scoping; it avoids collateral damage to non-Conversations consumers.

---

### CRITICAL
- None.

### WARNING
- [approved.md §1 rung 2] Title ladder does not specify fall-through when the DM "other participant" has no `users.name` (agent/assistant participant ids without a users row). Must fall to a human fallback, never render `undefined`/raw id.
- [approved.md §1 rung 3+5] Title ladder does not handle a deleted/dangling host entity. Falling to rung 5 (`hostId`) yields a raw uuid — re-introduces the exact AC1 defect ("readable titles rather than raw identifiers"). Define a typed human fallback for missing hosts.

### SUGGESTION
- [approved.md §1 rung 4] Group/feed participant-join (`"Aria, Maverick +2"`) is best-effort and acceptable for AF14 (no group-creation flow in scope), but the join order should be deterministic (sorted) so the title is stable across renders — otherwise the same thread can show different names first on reload.
- [approved.md §3 a11y] Removing two `aria-pressed` chips is a net a11y simplification (one fewer tab-stop pair) — good. Confirm the New-thread button retains a visible focus ring after the chip cluster is gone (no regression from layout reflow).

### What's Working Well
- The "remove, don't fake" decision is grounded in a *concept* finding (no backing primitive), not taste — exactly the right justification, and it forecloses a future agent silently re-faking unread.
- Forward-compatible scoping: keeping the `blocking`/`unread` fields + the `FilterChip` component while deleting only the two live instances is precisely the minimum-blast-radius move. Zero new components, zero budget impact.
