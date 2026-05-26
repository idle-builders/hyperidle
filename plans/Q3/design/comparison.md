# Q3 Design Comparison

**Classification:** routine (single variant)

## Variant: Modal Dialog (KnowledgeCreateDialog pattern)

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 8 | Clear reading order. Product before pitch is defensible (required context). |
| Spacing | 9 | Follows KnowledgeCreateDialog exactly. All on 4px grid. |
| Typography | 9 | Closed type scale. iOS zoom mitigation. Tabular nums on money input. |
| Color | 10 | Semantic tokens only. No new colors. Monochrome philosophy preserved. |
| Coherence | 9 | Pattern-identical to KnowledgeCreateDialog. Instantly familiar. |
| States | 8 | All states covered. Optimistic failure is slightly complex but the right call. |
| Accessibility | 9 | Native dialog focus trap, role=alert errors, aria-labels, 44px targets. |
| Anti-slop | 10 | No AI-aesthetic tells. Dense, functional, monochrome. |
| Premium polish | 7 | Title preview is good. No markdown preview (consistent with Q2, deferred). |
| **Overall** | **8.8** | |

## Rejected directions (not scored, explicitly rejected)

1. **Slide-over panel** — disproportionate to a 4-field form
2. **Inline form in column** — conflicts with dnd-kit drop zones
3. **PitchSelector integration** — conflates browsing with creation
4. **Separate title field** — drift risk vs server derivation
5. **Full-page creation route** — overkill for 4 fields
6. **MoneyInput design-system component** — premature abstraction (single consumer)
