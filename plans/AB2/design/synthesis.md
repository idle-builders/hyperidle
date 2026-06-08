# AB2 Design Synthesis

## Winner: Variant B (Dense Row)

Variant B scores higher (72 vs 66) and aligns better with the page's emerging visual grammar. The team page already has two section types: cards (bets, R2) and flat rows (routines, R5). Agents are operational monitoring targets -- closer to routines than bets. Using the same flat-row pattern reinforces this.

The density advantage is decisive. A team with 6 agents takes ~264px in rows vs ~450px in cards. The team page has five sections (header, burn, bets, routines, agents, artifacts) -- vertical space is contested. Dense rows keep the page scannable.

## Elements pulled from Variant A

1. **Customize button retained.** Variant B initially considered dropping it, but losing quick-edit access from the team page is a regression from AB3. The Customize button stays as a ghost btn-xs at the far right of each row, with stopPropagation. Row click navigates to profile.

2. **Card Row 2 error detail.** Variant B's task column shows "5/6 sessions failed" for error agents, pulled from Variant A's error detail pattern. This is important -- the team lead needs to know WHY the agent is in error, not just that it is.

## Explicitly rejected

1. **Cards for agents.** Cards are for decision objects (bets). Agents in this context are monitoring targets. Flat rows are the right grammar.

2. **StatusChip for agent operational status.** StatusChip's vocabulary (healthy/behind/blocked/paused/done/error) doesn't map to agent operational states. "Paused" for idle is misleading. Plain colored text labels are clearer and denser.

3. **Category Tag on each row.** The existing AgentCard shows a category Tag (Strategy/Personal). In the dense row, this adds noise without aiding the primary task (anomaly detection). Category is visible on the agent profile page. Omitted from rows.

4. **Real-time status updates.** Per spec constraint. Status is fetched on page load via the existing team detail endpoint.

5. **Historical health trends.** Per spec constraint. Current state only.
