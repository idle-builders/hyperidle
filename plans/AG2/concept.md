# AG2 — Concept probe

**Verdict: no new or reshaped primitives.** AG2 governs *when* existing portfolio filter controls appear and how the screen reads on arrival. It does not change what any noun means. This is a presentation/journey workpackage; the concept probe runs light by design.

## New nouns introduced
None.

## Reshaped nouns
None. Bet, Outcome verdict, Team, Status, and Portfolio all keep their existing identity, properties, lifecycle, and authority. AG2 only changes the visibility rules of controls that filter over them.

## Relevant existing concepts (unchanged, but load-bearing here)

- **Bet** — the time-boxed commitment object of the process layer. AG2 renders the existing flat bet list (`useBets()`); it adds, removes, and renames nothing on the Bet. A Bet *has* a `status` (`active` / `completed` / `killed` / `draft`) and an optional `outcomeVerdict`.
- **Outcome verdict** — the result recorded on a Bet *after* it completes or is killed: `validated` / `refuted` / `partial` / `inconclusive`, plus the UI-only `not_evaluated` sentinel (DB stores `null`). Recorded through the existing evaluation flow. **AG2 must not touch the verdict vocabulary or the recording flow** — it only decides whether the verdict *filter* surfaces. Key invariant the design hangs on: a verdict is only ever present on a completed/killed Bet, so a young portfolio has zero recorded verdicts, which is exactly why the verdict filter is dead chrome today.
- **Portfolio** — the cross-team work overview at `/work/portfolio`. Not a stored entity; a *view* over all Bets across all Teams. It is "the same place" regardless of how many Bets it holds — this identity is the spine of AC-4 ("reads as the same place at 0/1/50 bets").
- **Team** — Bets belong to Teams; team filter pills scope the view. Unchanged.
- **Filter control** — not a primitive, a UI affordance. The probe-worthy claim AG2 asserts: *a filter control earns its place only when it can change the visible result set given current data.* This is the honesty rule. It is a presentation contract, not a domain concept.

## What this WP is NOT
- NOT a change to outcome semantics, the verdict vocabulary, or the evaluation/recording flow (explicit contract).
- NOT a new filter dimension (no cost/date filters — out of scope).
- NOT bet-evaluation UX or bet-authoring (AG3) — only filter *visibility* and arrival composition.
- NOT sidebar nav behavior or the skip-portfolio-when-one-team rule (AG4 owns journey coherence).
- NOT a new bespoke control — filter controls reuse shared dropdown/control primitives where applicable (AG5 boundary).

## Constraining contracts (carried into design + architecture)
1. Verdict vocabulary and outcome-recording flow are frozen. AG2 reads `outcomeVerdict`; it never writes it or reinterprets it.
2. Hearth aesthetic rules (`.claude/rules/aesthetic-quality.md`) apply to every reworked state.
3. Reuse shared dropdown/control primitives; no new bespoke chrome.
4. Existing portfolio tests are updated, not deleted.

## Vocabulary collisions
- "Filter" appears in three layers — status filter (segmented), team filter (pills), verdict filter (pills). All three are *result-set narrowing* affordances; the honesty rule applies uniformly. No collision, but the design must keep the three visually coherent as one filter grammar rather than three styles.
- "Empty" is overloaded: empty *portfolio* (zero bets — needs purpose + create affordance) vs empty *result set* (filters exclude everything — needs a "no matches, clear filters" affordance, not the onboarding pitch). The design must distinguish these two empties.

## Probe conclusion
No concept work required downstream. The single non-obvious truth to carry forward: **verdict presence is a function of bet lifecycle stage, not of bet existence** — so verdict filters must gate on "≥1 bet has a recorded outcome," never on "≥1 bet exists." Everything else is composition and visibility.
