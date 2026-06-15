# Variant C — Active-team spotlight (sectioned)

**User task.** Same entry point, but the Work overview is not a flat equal list — it splits teams into "Needs attention / Active" and "Quiet" sections, borrowing Linear's active-vs-backlog grammar, so the founder's eye goes straight to the team with a problem.

## Nav grammar (the signature)

Header grammar is identical to A (symmetric switch + surface overview; AD3 1-team exception preserved). C's divergence is entirely in **the Work overview's internal structure**, mirroring how Conversations' overview already sections threads (Blocking / Active / Resolved via `ThreadSections`). C makes Work's overview structurally parallel to Conversations' *sectioned* overview rather than to Knowledge's flat list — leaning on the strongest existing analog.

## Work overview — sectioned team list

Same frame (fixed header + scroll body). Body uses two labelled sections (same `<h3>` mono-uppercase section-header treatment as `ThreadSections`):

- **`NEEDS ATTENTION`** (tone danger) — teams where `status !== "healthy"` OR `agentHealthWarning`. Silently absent when empty.
- **`ACTIVE`** — teams with `activeBets > 0` and healthy. Always rendered; shows a "Quiet — no active bets" line when empty (mirrors ThreadSections' Active "Quiet" line).
- **`QUIET`** — healthy teams with 0 active bets. Silently absent when empty; rows dimmed (`opacity-70`, like Resolved threads).

Within each section, `ItemList variant="flush"` of team `Row`s. Row composition same as A (status chip + agents cell + progress).

```
section NEEDS ATTENTION   (danger header, sticky)
  Row  team.name  · StatusChip(blocked)  · agents  ← attention teams
section ACTIVE
  Row  team.name  · StatusChip(healthy)  · "3 bets" · agents
section QUIET (dimmed)
  Row  team.name  · "—"
```

- **Header:** `Teams` title + `New bet` Button. No count sub-line (the section counts carry it, as in ThreadSections' `data-thread-section-count`).

## States

- **empty (0 teams):** single `EmptyState` (no sections), same copy as A.
- **loading:** `SkeletonList rows={4}` (no sections during load).
- **error:** `ErrorState`.
- **populated:** sectioned as above. A factory where every team is healthy+active shows only ACTIVE — degrades gracefully to a near-flat list (which is the common 2-3 team healthy case).
- **overflow:** within-section truncation per `Row`.

## Behavior / motion / keyboard

- Sticky danger section header for NEEDS ATTENTION (reuses ThreadSections' `sticky top-0` + 10% danger tint + 3px left accent — already a proven, a11y-checked treatment).
- `⌘1/2/3` unchanged. No new verbs.
- Motion: none beyond existing.

## Mobile

Three-tab; Work tab shows the same sections stacked full-width. Sticky attention header carries to mobile scroll.

## Signature

**The problem team is impossible to miss.** A blocked team rides a sticky danger-tinted header at the very top; quiet teams are dimmed at the bottom. The Work overview reads like the Conversations overview's sibling — both sectioned by attention.

## Trade-offs (what C is bad at)

- Most machinery of the three — sectioning logic, three section states, sticky header. Highest component/logic cost (though all borrowed from ThreadSections, none new).
- For the dominant 1-3 healthy-team case, the sectioning is overhead that collapses to a single ACTIVE section — the structure earns its keep only at 4+ teams with mixed health.
- A sectioned Work overview is structurally parallel to Conversations but *divergent from Knowledge's flat list* — so "all three sections look identical" (A's promise) is partially broken: Work matches Conversations' shape, not Knowledge's. Mild violation of the uniformity thesis.
