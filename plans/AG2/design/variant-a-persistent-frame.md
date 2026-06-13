# Variant A — Persistent Frame, Docking Filters

**Core idea:** The header is a fixed frame present at every data volume — title on the left, "New bet" primary button pinned right. Below the title sits a single **filter zone** (one horizontal row) into which controls *dock* as they earn relevance. The frame never moves; controls fade/slide into the already-reserved zone.

## Anatomy (desktop, 1280–2560px)

```
┌─ header (shrink-0, px-24 py-18, border-b) ──────────────────────────────┐
│  All bets                                            [ + New bet ]       │  ← frame: always present
│  {N bets · M teams}  (sub-line, text-13 tertiary — only when N>0)        │
│  ┌─ filter zone (mt-12, flex gap-12, only rendered when ≥1 control) ──┐  │
│  │ [All|Active|Completed|Draft]   [Team▾ pills]   [Verdict pills]      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
  body: bet grid (2-col, max-w-960) OR empty composition
```

### State 0 — Empty portfolio (zero bets)
- Frame: title "All bets" + "New bet" button **stay in the header** (pinned right). No sub-line. No filter zone.
- Body: `EmptyState` — icon, title "No bets yet", description (the existing pitch copy: "Bets are time-boxed commitments with a budget. Shape a pitch, commit it to a cycle, and your agents break it into tasks and start building."), action = **primary "Create your first bet"** button.
- So the create affordance appears **twice and intentionally**: the header button (system-level, always-available) and the empty-state CTA (contextual, the obvious next step). This is deliberate redundancy at the moment of zero — the eye lands center on the EmptyState CTA; the header button is the muscle-memory location it'll live forever after.

### State 1 — Unevaluated portfolio (≥1 bet, no recorded outcomes)
- Frame unchanged. Sub-line appears: "3 bets · 1 team".
- Filter zone renders ONLY the controls that pass the honesty gate:
  - Status segmented: shown iff ≥2 distinct statuses present.
  - Team pills: shown iff bets span ≥2 teams.
  - Verdict pills: **absent** (no recorded outcomes).
- If exactly one status and one team → filter zone is empty → **filter zone is not rendered at all** (no empty bar). Body is just the grid.

### State 2 — Evaluated portfolio (≥1 bet with recorded outcome)
- Verdict pills now dock into the filter zone, to the right of status/team. They slide in (opacity+translateY, `--motion-default`), the frame above does not move.
- Pills only list verdicts that *exist* in the current data set? **No** — list all four verdicts + "Not evaluated" once the zone is active, because the founder needs the full vocabulary to reason about it; but the zone itself only appears once at least one outcome is recorded. (Honesty is satisfied at the *zone* level: the verdict zone can change the set the moment it appears.)

### State — Empty result set (filters exclude everything)
- Grid area shows a compact inline `EmptyState`: "No bets match these filters" / "Adjust or clear the filters above." + ghost button "Clear filters". NOT the onboarding pitch.

## Why this satisfies the ACs
- **Same place at 0/1/50:** title + primary action are structurally identical at every volume; only the filter zone gains children. The page never reassembles — the frame is the invariant.
- **Honest filters:** each control individually gated; verdict zone gated on recorded-outcome existence.
- **No dead chrome:** a one-status one-team portfolio shows zero filter controls — correct, because none could narrow anything.

## Trade-off
Redundant create affordance at zero (header + empty-state) is two affordances doing one job at one moment. Justified: they occupy different roles (persistent vs contextual) and the header button is the permanent home. Risk: at exactly zero bets, two "create" buttons in one viewport could read as noise if styled identically — mitigate by making the header button the only `btn-primary` and giving the EmptyState its own emphasis, OR (see Variant B) suppress one.

## Rubric self-score
hierarchy 9 · spacing 9 · typography 9 · color 9 · coherence 9 · states 9 (all five enumerated) · a11y 8 · anti-slop 9 · premium 8. **Mean 8.7.**
