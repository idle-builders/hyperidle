# Variant C — design-critique

## Scoresheet

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 6 | Verb row competes with title for visual weight. Five elements stacked + a verb row is six. The eye lands on the buttons as much as the title. |
| Spacing | 6 | ~36 px of vertical chrome per card. A 7-card column gains ~252 px, which on a 4-column board pushes the kanban below the viewport on a 13" laptop. |
| Typography | 8 | Verbs at 12 px medium read; primary verb's count badge 10 px is on the allowlist. |
| Color | 8 | Primary used only on the unread `Thread (n)` button. Danger reserved for `Kill`. |
| Coherence | 8 | Verb row matches the verdict-grammar pattern from review surfaces — one row of named verbs, primary highlighted. Strong consistency. |
| States | 8 | State-aware verb selection rule (Pause/Resume/Reopen by state) is deterministic. In-flight, disabled, hover, all defined. |
| Accessibility | 9 | Best of the three: 4 tab stops per card, all named verbs, no kebab-only reachability. Each verb is a `<button>` with a clear label. |
| Anti-slop | 7 | Risks AI-aesthetic: card with always-visible buttons is the stock SaaS look. The Lucid surface ladder + 28 px ghost buttons saves it, but it's near the line. |
| Discoverability | 10 | Best of the three. Founder onboarding cost is zero. |

**Overall: 7.8/10 → round 8/10.**

## Findings

- **F1 (high).** Verbose. Density tax is real — at the default density the kanban gets considerably taller and the value-per-card drops because every card carries the same row of buttons whether they're touched or not.
- **F2 (medium).** Stock SaaS look risk. The verb row reads like Jira / Trello / Asana. Mitigation: keep the primary `Thread` button as a ghost (not a filled accent), and ship the row only in `comfortable` density; in `default` and `compact`, fall back to Variant A's kebab. This becomes a hybrid — see synthesis.
- **F3 (medium).** "Reopen" verb on Done tasks is interesting but unclear what state it requests. Add wire copy.
- **F4 (low).** Mobile horizontal overflow logic is lossy: the visible buttons depend on viewport width, which means a founder's mental model "Pause is on the row" can break on smaller windows. Spec needs a hard rule about which 3 verbs survive the cut.

**Overall: 8/10. Advances.**
