# AB3 — Design Comparison

## Side-by-side

| Dimension | A: Inline Accordion | B: Dialog Stepper |
|---|---|---|
| **Signature** | Wizard grows inline in the roster section. No context switch. | Dedicated modal dialog with stepper dots and review step. |
| **Component count** | 0 new custom components. Local component in WorkTeam. | 0 new custom components. Local component `AgentSetupDialog`. |
| **Density** | Compact -- 7px padding on inputs, 12px step padding. Fits the existing page density. | Spacious -- 10px padding on inputs, 24px body padding. Feels like the onboarding card. |
| **Primary action surface** | "Next"/"Create" pill buttons right-aligned in each step body. | Fixed footer with Cancel/Back/Next/Create. Always visible. |
| **State strategy** | Accordion steps: completed = collapsed summary line, active = expanded form, pending = header only. Four distinct visual states per step. | Stepper dots: done (green), active (filled), pending (gray). Body swaps per step. Two states: dot state + body content. |
| **Motion budget** | No motion beyond native collapse (CSS). Steps snap open/closed. | Step content could cross-fade (opacity 120ms). Stepper dots have no motion. |
| **Best at** | Preserving context. Team lead sees the roster, the existing agents, and the wizard in one view. No cognitive load from a mode switch. Fast for repeat use. | Focusing attention. The dialog blocks everything else. The review step (Step 4) shows the full config before creation -- good for catching mistakes. Clean separation of concerns. |
| **Worst at** | Long pages. With the soul prompt textarea expanded, the wizard pushes everything else off-screen. Competes with roster and bets for visual attention. | Overengineered. Four fields (role, name, harness, tier) wrapped in a 4-step dialog with stepper dots and review panel is more ceremony than the task warrants. Context is lost -- can't see the roster. |

## In-session critique scores (0-10)

### Variant A: Inline Accordion

| Criterion | Score | Notes |
|---|---|---|
| Visual hierarchy | 7 | Step numbers establish clear progression. But the wizard border competes with the roster section visually. |
| Spacing & density | 8 | Matches the existing page density well. 7px/12px padding is consistent with SettingsAgents. |
| Typography | 7 | Hearth section headers, appropriate scale. Step summaries in mono are a nice touch. |
| Color & theme | 8 | Uses semantic tokens correctly. Selected role card green tint is subtle. |
| Coherence | 9 | Follows established SettingsAgents inline-expand pattern exactly. No new visual vocabulary. |
| States coverage | 7 | All wizard states covered. But the empty-state-to-wizard transition could be jarring. |
| A11y | 7 | Keyboard nav works. But accordion pattern needs aria-expanded, aria-controls, role attributes. Focus management on step transition is critical. |
| Anti-slop | 8 | No AI aesthetic. Dense, purposeful. No decorative elements. |
| Premium polish | 6 | Functional but not memorable. The accordion pattern feels utilitarian. |
| **Average** | **7.4** | |

### Variant B: Dialog Stepper

| Criterion | Score | Notes |
|---|---|---|
| Visual hierarchy | 8 | Stepper dots at top, form in center, buttons at bottom. Clear spatial hierarchy. Review step is effective. |
| Spacing & density | 7 | The 24px body padding and 15px inputs feel generous but risk the "onboarding screen" feeling. Slightly loose for a tool surface. |
| Typography | 8 | 20px dialog title, 13px labels, 12px hints -- good scale separation. Review section KeyValue layout is clean. |
| Color & theme | 8 | Warm cream surface, green stepper dots, subtle tints. Matches Hearth. |
| Coherence | 7 | Dialog pattern matches BetCreateDialog. But the stepper dots + review step add complexity that BetCreateDialog doesn't have. |
| States coverage | 8 | All states covered. The review step adds a state (review-before-confirm) that A doesn't have. Success state inside dialog is clean. |
| A11y | 8 | Native `<dialog>` provides focus trap. Step progression is linear and predictable. ARIA stepper role is well-documented. |
| Anti-slop | 6 | The stepper dots + review sidebar risk looking like "every AI SaaS onboarding wizard." The review step showing data the user just typed is potentially decorative. |
| Premium polish | 7 | The review step and stepper dots give a polished feel. But it's a lot of chrome for four fields. |
| **Average** | **7.4** | |

## Tie-breaking analysis

Both variants score 7.4. The tie-break comes down to:

1. **Component-budget cost:** Both are 0 new custom components. Tie.
2. **Complexity:** A is simpler to implement (no dialog lifecycle, no stepper state, no review step). A wins.
3. **Coherence with existing patterns:** A follows the SettingsAgents inline pattern. B follows BetCreateDialog. Both are precedented. Tie.
4. **User task fit:** The user is on the team page managing their team. The wizard is an extension of that management surface. A keeps them in context. But B's review step catches mistakes before creation. B has a slight edge for first-time users; A has a slight edge for repeat use.
5. **Anti-slop:** B's stepper dots and review step trend toward "SaaS wizard" AI aesthetic. A is more restrained.

**Recommendation: Synthesize from A with one element from B.**
