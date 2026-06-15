# AD9 — Synthesis

**Strongest base: Variant A (Switch-and-Overview).** It is the literal embodiment of AD9's headline — one uniform nav grammar, the Work overview a visual sibling of the Conversations and Knowledge overviews, zero new shapes, lowest cost.

**Pull in from B:** the **attention-sort default ordering** of the team list (`blocked → behind → agentHealthWarning → healthy`, tie-break name asc). It costs one client-side sort, keeps the flat Knowledge-like shape, and answers "which team needs me first" without sectioning. Do NOT pull in B's leading RowDot — the right-anchored `StatusChip` already carries status with both color and label; a second status glyph is redundant double-encoding (the one thing B scored down on).

**Rejected (and why — do not re-litigate):**
- **C's sectioning (NEEDS ATTENTION / ACTIVE / QUIET).** It breaks the "all three overviews identical" promise (Work would mirror Conversations' sectioned shape but diverge from Knowledge's flat list), and its machinery only pays off at 4+ mixed-health teams — exactly the multi-team case the spec defers ("cross-team dashboard deferred until 3+ team users exist"). When that day comes, C is the blueprint to revisit.
- **B's leading status dot** — redundant with the StatusChip; spends a second color signal on one fact.
- **Any filter/tab/metrics-bar on the Work overview** — retired with the portfolio grid (concept rejection list). The team list has no cross-team bet vocabulary to filter.
- **A "second click to reveal" sidebar sub-list step** — the current model (active section reveals its sub-list) is correct; AD9 changes only the header *destination* (overview, not deep-link), not the reveal model.

**Net chosen direction:** Variant A's uniform grammar + flat team list, ordered by B's attention sort. Status pill right-anchored; agents `active/total` cell with warning tone on `agentHealthWarning`; progress `done/total` cell (hidden < 640px). AD3 1-team shortcut preserved.
