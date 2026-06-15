# Phase 3 — Synthesis + rejected directions

**Chosen base:** "Honest task state" (the single routine variant). 8.4/10. Zero new components.

## Rejected directions (did we consider X / Y / Z?)

- **X — A dedicated `BlockerBanner` / new component for the no-agent case.** Rejected: violates the component budget (used in exactly 1 context). `EmptyState` already has `icon` + `action` slots that carry the blocker cleanly. A new component would need to prove 2+ contexts; it can't.
- **Y — Use `ErrorState` for the blocker.** Rejected: `ErrorState` is `role="alert"` with retry semantics for *API failures*. A no-eligible-agent blocker is an honest product state with a recovery path, not an app error. Using it would mis-signal "the app broke" and put a retry button where "add an agent" belongs.
- **Z — A progress bar / "2 of N tasks planned" during decomposition.** Rejected: there is no N until the breakdown lands (v1 is one PM turn, not a streamed graph). A fake denominator is dishonest; `LiveDot` + "Planning the work" is the truthful bounded signal.
- **W — A toast on commit ("Work started / Couldn't start work").** Rejected as the *primary* surface: a toast is ephemeral; the founder who returns to the bet later must still see the truth in-place. The bet surface is the source of truth (a toast may be added later by a notification workpackage, out of scope here).
- **V — A retry-decomposition button on the blocked-empty state.** Rejected: re-triggering decomposition is re-committing, which is governed by the existing bet controls. AK3 adds no new action verb; "Couldn't plan the work" points the founder back to the existing commit/refine controls. (Could be revisited when an explicit re-plan affordance is specced.)

## What gets pulled in from siblings
N/A — single variant. The `LiveDot`-as-planning-signal and amber-not-red blocker color are the two judgment calls carried into approved.md.
