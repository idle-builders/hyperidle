# AD9 — Variant Comparison

Comparison board: `comparison-board.png` (full-page render of all three at `:8098/#AD9WorkOverview`, Hearth Light).

| Dimension | A — Switch-and-Overview | B — Attention-sorted | C — Active-team spotlight |
|---|---|---|---|
| Signature (one tell) | Perfect symmetry across 3 sections | List is pre-triaged; leading status dot | Problem team rides a sticky danger header |
| Component count | ItemList + Row + StatusChip + Button (4) | + RowDot (5) | + section headers (borrowed from ThreadSections) (5) |
| New shapes | 0 | 0 | 0 |
| Density | High, flat | High, flat | Medium (section headers add vertical breaks) |
| Eye lands first | Team name (left) | Leading status dot (left edge) | NEEDS ATTENTION danger band (top) |
| Primary action surface | Row click → team; New bet (header) | same | same |
| State strategy | One layout, server order | One layout, attention-sorted | Multi-section (3) + flat-collapse when all healthy |
| Motion budget | none (route nav only) | none | none (sticky header is layout, not motion) |
| Uniformity w/ other sections | Highest — matches Knowledge's flat list AND mirrors Conversations | High — flat like Knowledge, smarter order | Partial — matches Conversations' *sectioned* shape, diverges from Knowledge's flat |
| "Which team needs me?" answer | Read status column | Top row = most urgent | Top section = urgent, impossible to miss |
| Best at | Predictability; one rule for the whole shell | Zero-effort triage at 2-5 teams | Visual urgency at 4+ mixed-health teams |
| Worst at | Flat list weak at 6+ teams | Position instability; mild double-encoding (dot + chip) | Overhead for the common 1-3 healthy case; breaks "all sections identical" |

## Phase-2 critique (9-dim, 0-10 each)

### Variant A — Switch-and-Overview
- Hierarchy 8 — team name primary, status chip a clean right-anchored scan column; no competing focal point.
- Spacing 9 — pure Row/ItemList grid, on-grid by construction.
- Typography 9 — DS tokens only (20/600 title, 13 row, 11 mono cells, tabular nums on counts).
- Color 9 — StatusChip semantic tokens; warm agents-warning tone; no hardcoded color.
- Coherence 9 — literal sibling of Conversations/Knowledge overviews; one nav rule.
- States 8 — all five defined; flat list has no special overflow risk.
- A11y 9 — Row a11y inherited; status not color-only (chip carries label text).
- Anti-slop 9 — no dashboard, no metrics bar, no card grid; dense purposeful list.
- Premium polish 7 — correct but quiet; doesn't *help* the eye find the urgent team beyond reading the column.
- **Score: 8.6/10**

### Variant B — Attention-sorted
- Hierarchy 8 — leading dot pulls the eye left; good, but dot + right chip encode the same fact twice.
- Spacing 9 — Row grid; lead slot is a first-class Row affordance.
- Typography 9 — same token discipline.
- Color 8 — fine, but double status encoding spends two color signals on one fact.
- Coherence 8 — flat like Knowledge; attention sort is invisible structure (good) but the dual encoding is a minor incoherence.
- States 8 — five states; count sub-line suppression handled.
- A11y 9 — dot has tone; chip has label; not color-only.
- Anti-slop 9 — clean, no slop.
- Premium polish 8 — the always-triaged list feels considered; the redundancy holds it back from 9.
- **Score: 8.4/10**

### Variant C — Active-team spotlight
- Hierarchy 9 — strongest: danger band at top is an unmissable focal point; quiet teams dimmed.
- Spacing 8 — section headers add vertical rhythm; slightly less dense.
- Typography 9 — mono uppercase section headers match ThreadSections exactly.
- Color 9 — danger tint + accent edge encode urgency with tint AND position (not color-alone).
- Coherence 7 — matches Conversations' sectioned overview but DIVERGES from Knowledge's flat list, weakening AD9's "all three identical" promise.
- States 7 — three section states + flat-collapse + empty/loading/error; most surface area to get wrong.
- A11y 9 — proven ThreadSections treatment (already a11y-reviewed).
- Anti-slop 8 — sectioning is justified by Conversations precedent, not slop; but at 1-3 healthy teams it's structure with nothing to structure.
- Premium polish 9 — the most "designed" feel; urgent team is impossible to miss.
- **Score: 8.3/10**

## Read

Scores are close (8.6 / 8.4 / 8.3) — expected, since all three reuse the same primitives and the contest is narrow (nav grammar + ordering). The differentiators that matter for AD9's stated goal:

1. **Uniformity is the headline of the workpackage** ("Same interaction + visual rhythm for all three sections"). A is the only variant that is a literal sibling of *both* other overviews. C explicitly trades uniformity for urgency.
2. **The common case is 1-3 healthy teams** (and AD3 skips the overview entirely at 1 team). C's sectioning machinery earns its keep only at 4+ mixed-health teams — a case that, per the spec, is deferred ("cross-team dashboard deferred until 3+ team users exist").
3. **B's attention sort is a free, low-cost win** that does not break uniformity — it keeps the flat Knowledge-like shape but answers "which team needs me" by ordering.

→ Synthesis: A as the base (uniform, lowest cost, zero new shapes), pull in B's attention-sort as the default ordering. Reject C's sectioning for AD9 (revisit when 3+ team factories exist — it's the deferred dashboard).
