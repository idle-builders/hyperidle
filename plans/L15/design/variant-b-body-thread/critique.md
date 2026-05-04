# Variant B — design-critique

## Scoresheet

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 7 | Title is primary, but the bottom strip + Request button compete for attention because the strip introduces a second horizontal divider line on every card. |
| Spacing | 7 | The bottom strip adds ~24 px chrome per card, gated by a top border — borders-as-hierarchy is a smell (PRINCIPLES.md §2: borders/shadows are last resort). |
| Typography | 8 | Mono 11 px counts in the strip are aligned with KeyValue; title and owner unchanged. |
| Color | 8 | Primary used for unread-thread strip text only — disciplined. Danger only on `Kill`. |
| Coherence | 6 | Two grammars on one card: card-as-button + button-on-card. The cognitive model is "click body for thread, click button for change" but a user mid-drag reflex may mis-click the body when they intended Request. |
| States | 8 | NEW THREAD / N MSG / N UNREAD strip-state vocabulary is concrete; in-flight, hover, focus all defined. |
| Accessibility | 7 | Two tab stops per card (card-link, then Request). Card-link uses `<button>` semantics so Enter/Space work. Click-stopping the inner button is a known pattern but trips screen readers if the inner control is not in a clear nested DOM. |
| Anti-slop | 8 | No AI tells. Hover-tint on body is a Linear convention, not a marketing affectation. |
| Discoverability | 8 | Pointer cursor + hover-tint signal "click me"; founders have seen this in Linear / Notion / GitHub Issues. |

**Overall: 7/10**

## Findings

- **F1 (high).** The bottom strip with its top-border is borders-as-hierarchy. The strip should sit on `--surface-3` slightly recessed below the card, not separated by a divider. Or: drop the divider, separate by spacing only.
- **F2 (medium).** The whole-card-as-button means the title text is no longer selectable (browser default for `<button>` content). For founders quoting a task title in a chat, this is a real loss.
- **F3 (medium).** Two grammars conflict at small density: at compact density the strip shrinks to `28 px` but the Request button stays 28 px and the strip collapses too tight. Compact-density behaviour needs a stronger spec.
- **F4 (medium).** "NEW THREAD" copy fires for every card without messages — that's 70 % of cards on day one. Reads like noise.

This score is below the 8 bar. Variant B has more structural compromises than A or C. Could iterate, but the trade-offs are inherent to the body-as-link choice.

**Overall: 7/10. Advances but as the second-best.**
