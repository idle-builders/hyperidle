# Variant B — Single Create Locus, Title-Only Empty

**Core idea:** Same docking-filter mechanic as A, but resolve the redundant-create problem the opposite way: at zero bets, the header carries **only the title** (no header button); the *only* create affordance lives inside the EmptyState, large and centered. The header "New bet" button appears the moment the first bet exists — which is also the moment the EmptyState disappears. One create locus per state, never two in one viewport.

## Anatomy

### State 0 — Empty portfolio
```
┌─ header (px-24 py-18, border-b) ─────────────────────────────────────────┐
│  All bets                                                                 │  ← title only, no button
└───────────────────────────────────────────────────────────────────────────┘
  body (centered EmptyState):
        ◧  No bets yet
           Bets are time-boxed commitments… {pitch}
           [ + Create your first bet ]   ← the ONLY create affordance
```

### State 1 / 2 — Populated
```
┌─ header ─────────────────────────────────────────────────────────────────┐
│  All bets        {N bets · M teams}                      [ + New bet ]    │  ← button now present
│  [filter zone — same honest docking as Variant A]                         │
└───────────────────────────────────────────────────────────────────────────┘
  body: bet grid
```

Filter honesty rules, verdict gating, empty-result-set handling: **identical to Variant A** (status gated on ≥2 statuses, team on ≥2 teams, verdict on ≥1 recorded outcome; empty-result shows "no matches / clear filters").

## The cost this variant pays
The header **does** change between zero and one bet: the "New bet" button materializes. Critics of this variant will say that's exactly the "layout reassembles itself" failure AC-4 forbids. Counter-argument: AC-4 says the screen must *read as the same place* and controls should *appear as they become meaningful rather than the layout reassembling*. A primary action appearing in the top-right is the canonical "becomes meaningful" event (you can't act on bets that don't exist yet to need a persistent New-bet next to them — the EmptyState already owns that job). The title anchor and the page frame are unchanged; only one button enters. Whether that counts as "reassembly" or "meaningful appearance" is the crux of the A-vs-B decision.

## Why someone would pick B
- No double create button — cleaner zero state, unambiguous primary action.
- The EmptyState becomes the hero of the empty screen without competing with a header button.

## Why someone would pick A over B
- A's header frame is *literally invariant* — the New-bet button never moves or appears/disappears, which is the strongest possible reading of "same place." A user who creates the first bet sees the button they'll use forever already sitting where it will always sit.
- B's appearing header button is a (small) layout change at the 0→1 boundary, which is the exact transition AC-4 scrutinizes hardest.

## Rubric self-score
hierarchy 9 · spacing 9 · typography 9 · color 9 · coherence 8 (the 0→1 header shift costs a point) · states 9 · a11y 9 · anti-slop 9 · premium 8. **Mean 8.8** on most dims but the coherence dip is on the single most-scrutinized AC.
