# Q2 Design Comparison

| Dimension | A: Dialog Form | B: Inline Expand |
|---|---|---|
| Signature | Modal dialog with scope picker (mirrors existing action dialogs) | Inline section that expands on the page (no overlay) |
| Component count | 2 new page-level components (KnowledgeCreateDialog, ScopeChangeDialog). Both are page-local, not design-system. | 1 new page-level component (KnowledgeCreateSection, reused inline on 3 pages). ScopeChangeDialog same as A. |
| Density | Dialog has comfortable breathing room (min-w-400px). Scope picker has full vertical space. | Compact -- form shares vertical space with the list. Scope row is a single horizontal line. |
| Primary action surface | Dialog footer (Cancel + Create buttons, same as existing dialogs) | Inline at the end of the form row (Create button on the scope row) |
| State strategy | Open/closed binary (dialog lifecycle). Form state lives only while dialog is open. | Expanded/collapsed toggle. Form state lives in parent page state. |
| Motion budget | Native dialog modal (no custom animation needed) | Instant mount/unmount (no height animation per AQ-014) |
| Focus management | Native dialog focus trap (showModal() + cancel event handling -- proven pattern) | Manual focus management (no native trap; must implement focus-to-title on expand, focus-return on collapse) |
| Contextual creation consistency | Same dialog opens from any trigger -- identical form everywhere | Inline form adapts to each context (KnowledgeList: full form; WorkBet: reduced; TaskSheet: minimal) -- three variations of one component |
| Best at | Familiar pattern, proven focus management, consistent form across all entry points, comfortable for longer body text | Fastest capture (no dialog chrome), keeps list context, compact |
| Worst at | Dialog interrupts flow (overlay dims background), adds an open/close cycle to every creation | Cramped in TaskSheet, three layout variations to maintain, manual focus management |
| Implementation cost | Low. Follows ConsequencePreviewDialog pattern exactly. | Medium. Must handle expand/collapse state in 3 parent components, adapt layout per context, implement manual focus management. |
| Critique score | 7.5/10 | 6.5/10 |

## Critique notes

### Variant A: 7.5/10

- **Hierarchy (8/10):** Clear -- dialog centers attention on the form. Title field is primary, body secondary, scope tertiary.
- **Density (7/10):** Dialog has comfortable space but adds modal overhead (dimmed backdrop, chrome) for a simple 3-field form.
- **States (8/10):** All states clean (empty, filling, submitting, error, success). Lifecycle is the well-tested dialog pattern.
- **Coherence (8/10):** Matches the system's existing dialog patterns (Consequence, Appetite). The scope picker is the only new interaction; everything else is standard DaisyUI form elements.
- **Anti-slop (8/10):** No AI-aesthetic tells. The dialog is utilitarian DaisyUI chrome with semantic tokens.
- **A11y (8/10):** Native dialog provides focus trap, Escape handling (blocked), aria-modal. Proven.
- **Premium polish (7/10):** Functional but not distinctive. A dialog for a 3-field form is adequate but not elegant.

### Variant B: 6.5/10

- **Hierarchy (7/10):** Good in KnowledgeList (form is prominent at the top). Weaker in TaskSheet (form competes with thread and request sections).
- **Density (8/10):** Compact -- no dialog chrome overhead. But this advantage becomes a liability in TaskSheet (too cramped).
- **States (7/10):** Expand/collapse is clean. But three layout variations (full, reduced, minimal) increase the states matrix.
- **Coherence (6/10):** Does not match existing patterns. No other page in HyperIdle uses an inline-expand creation form. Introduces a new interaction grammar for one feature.
- **Anti-slop (7/10):** Clean. But the "New" button toggling to "Cancel" is a pattern not used elsewhere.
- **A11y (6/10):** Manual focus management is error-prone. No native dialog trap. Must implement focus-return manually.
- **Premium polish (6/10):** The inline form on KnowledgeList is clean. On TaskSheet, it looks squeezed.
