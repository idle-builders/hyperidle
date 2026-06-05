# AA1 Design Comparison

## Side-by-side

| Dimension | Variant A (Parallel Rows) | Variant B (Integrated Status Table) |
|-----------|---------------------------|-------------------------------------|
| **Signature** | Routine section is a visual twin of bets -- same row shape, same container bg, same padding | Flat status table inside a container card -- visually distinct from elevated bet rows |
| **Component count** | 0 new (reuses BetRow pattern exactly) | 0 new (flat rows + container card use existing Hearth patterns: hairline separators like ThreadRow, container bg like burn-vs-cap section) |
| **Density** | 18px padding per row, same as BetRow -- moderate density | 36px fixed row height, 12px container padding -- higher density, 4 routines fit in less vertical space than 4 bet rows |
| **Information hierarchy** | Name first, status second, metadata tertiary | Status dot first (leftmost), name second, metadata right-aligned |
| **Detail surface** | Inline accordion expansion below the row | Side drawer (360px, slides from right) |
| **State strategy** | Same layout in all states; status communicated through StatusChip in the row | Same layout in all states; status communicated through leading dot color |
| **Motion budget** | Expansion: height animate on detail panel (motion-default 240ms) | Drawer: translateX slide-in (motion-default 240ms) |
| **Best at** | Visual consistency -- zero learning curve from bet rows; simple implementation | Fast health scanning -- 2-second "are all routines ok?" check; clear visual separation between bets (decisions) and routines (infrastructure) |
| **Worst at** | Bets and routines look too similar on a quick scan; detail expansion feels cramped for long run histories | Side drawer is a new interaction pattern in WorkTeam (bets navigate to full pages); the flat table style feels foreign compared to the elevated-card aesthetic |

## Phase 2 — In-session Critique

### Scoring rubric (0-10 per dimension)

**Variant A:**

| Dimension | Score | Notes |
|-----------|-------|-------|
| Hierarchy | 6 | Name-first hierarchy is correct for "find a specific routine." But indistinguishable from bet rows at a glance -- the section heading does all the differentiation work. |
| Spacing | 8 | All values on Hearth 6px grid. 18px padding, 12px gaps, 6px row gaps. No violations. |
| Typography | 8 | xs mono for metadata, 13px medium for name, StatusChip for status. Matches existing BetRow exactly. |
| Color | 8 | Semantic tokens throughout. StatusChip handles status color. Run dots use status tokens. No hardcoded colors. |
| Coherence | 9 | Perfect coherence -- the routine section is indistinguishable from the bet section in structure. This is both the strength and the weakness. |
| States | 7 | Empty, loading, populated, error states specified. Accordion expansion for detail. But run history in inline expansion may overflow the main scroll area. |
| Accessibility | 7 | Focus-visible outline. Button semantics. Keyboard nav for rows. But accordion pattern needs aria-expanded, aria-controls for screen readers. |
| Anti-slop | 8 | No AI aesthetic tells. Warm tokens. No gradients, no purple, no oversized padding. |
| Premium polish | 6 | Functional but not distinctive. The "routine section looks like bet section" uniformity lacks the intentional differentiation that marks mature design. |
| **Total** | **67/90** | |

**Variant B:**

| Dimension | Score | Notes |
|-----------|-------|-------|
| Hierarchy | 8 | Status-dot-first hierarchy is correct for "scan health of recurring work." Clear visual distinction from bets communicates intent. Agent avatars add a recognizable anchor per row. |
| Spacing | 8 | 36px row height (on grid as 6*6), 12px container padding, 9px gaps. All values on Hearth 6px grid. |
| Typography | 8 | 13px name, 11px mono for schedule/lastrun/cost. Agent avatar at 24px with green tint (AQ-012). Section heading matches. |
| Color | 8 | Semantic tokens. Status dots use --status-success/error/info. Container bg is --surface-container. No hardcoded colors. |
| Coherence | 7 | The flat table style diverges from the elevated-card-per-item aesthetic used by bets and roster. But it parallels the burn-vs-cap section (also a container with flat content). This is deliberate differentiation, not inconsistency -- Hearth Principle 4 (mixed hierarchy) permits both strategies. |
| States | 8 | All states specified. Side drawer provides ample space for run history. Empty state inside container. Drawer interaction well-defined with focus trap and escape. |
| Accessibility | 7 | Focus-visible on rows. Button semantics. Drawer needs focus trap + aria-modal. Escape to close. Agent avatars carry aria-labels. |
| Anti-slop | 8 | No AI aesthetic tells. Flat table is actually more HyperIdle-native than card-per-item for infrastructure status. |
| Premium polish | 8 | The visual distinction between "decision items" (elevated card rows) and "infrastructure status" (flat table in container) is a deliberate design decision that communicates hierarchy of attention. Agent avatars add a warm, recognizable element per row. |
| **Total** | **71/90** | |

## Verdict

Variant B scores higher (71 vs 67). The key differentiators:

1. **Hierarchy**: Status-first scanning is correct for routines. You want to answer "is everything healthy?" not "which routine is this?"
2. **Premium polish**: The deliberate visual distinction between bets and routines communicates that these are different kinds of work requiring different levels of attention.
3. **States**: The side drawer provides more space for detail content than inline accordion.

Variant A's strength (zero learning curve from bet rows) is also its weakness -- the uniformity makes it harder to scan the page and immediately know "these are bets, those are routines."
