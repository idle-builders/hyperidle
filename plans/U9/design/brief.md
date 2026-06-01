# U9 Design Brief

DESIGN-CLASS: routine  ref=Conversations.tsx,WorkPortfolio.tsx,WorkTeam.tsx,WorkBet.tsx,KnowledgeList.tsx,KnowledgeDetail.tsx,BetCreateDialog.tsx  pattern=BetCard.html,ThreadRow.html,KnowledgeRow.html,ThreadShell.html

## User task

The founder opens any of the three main views (Conversations, Work, Knowledge) or Settings and sees a warm, consistent Hearth aesthetic. Pill filters at the top of each view enable quick filtering. The Work view shows bet cards in a grid (not the old Canvas/Kanban). The sidebar from U6 drives navigation; the main pane is the content area.

## What's being designed

This is a restyling + restructuring of six existing page components plus Settings:

1. **Conversations page** — already works with ThreadSections + ThreadShell. Needs: Hearth token migration on wrapper classes, pill filter styling, "New Thread" button styling.
2. **WorkPortfolio** — major restructure. Currently shows team cards + Canvas. New design: flat 2-column bet grid with team pill filters. Canvas removed.
3. **WorkTeam** — minor restyle. Currently shows team header + bet rows. Keep structure, apply Hearth tokens, add team pill header.
4. **WorkBet** — minor restyle. Currently shows BetCard + task table + thread section. Apply Hearth tokens to page chrome (sections, headings, cards).
5. **KnowledgeList** — minor restyle. Add scope pill filters alongside existing Triage/Curated tabs.
6. **KnowledgeDetail** — minor restyle. Hearth tokens on elevated surface + metadata.
7. **Settings pages** — apply Hearth inputs, toggles, cards to all settings sections.
8. **BetCreateDialog** — already uses description (not pitch). Apply Hearth styling.

## Key design decisions (settled)

- 2-column bet grid on Portfolio replaces team cards + Canvas
- Team pill filters at top of Portfolio (clicking = filtering by team)
- Scope pill filters at top of Knowledge list
- Pill filters use `btn btn-xs` with `btn-primary`/`btn-ghost` toggle (pill shape from DaisyUI theme: `--rounded-btn: 9999px`)
- "New bet" and "New Thread" buttons use forest green accent (`btn-primary`)
- Canvas.tsx and its @dnd-kit dependency are removed (or the Canvas import is removed from WorkPortfolio)
- All surfaces use `--surface-elevated` (white/warm) for content cards with `--shadow-default`
- Section headings use mono uppercase pattern already in the codebase
- Status dots use the 4-color Hearth status system (green/amber/red/blue)

## Rejected directions

1. **Keep the Canvas with Hearth styling.** Rejected because U0 concept explicitly removes the pitch ceremony and Canvas/Kanban views. The bet grid is simpler and matches the "filter, not drag" interaction grammar.
2. **3-column bet grid.** Rejected because at 200px sidebar + typical viewport (1440px), 2 columns give bet cards enough width to show progress bars, avatars, and budget without cramming. 3 columns on smaller viewports would crush cards.
3. **Separate team page with bets vs flat portfolio.** The spec says "All Bets (Portfolio): 2-column grid of BetCard components. Team pill filters at top." This is a flat view of all bets, not a team-first hierarchy. The team view (WorkTeam) still exists for drill-down.
4. **Tabs instead of pill filters.** Rejected because pill filters are the established pattern from U0 concept (sidebar sub-item = pre-applied filter, main pane pills = filter controls). DaisyUI tabs have a different visual grammar (underline tabs); pill buttons are more consistent with the Hearth pill aesthetic.
5. **Sidebar scope filters instead of main-pane pills.** The U0 concept explicitly says: "Filters move from the submenu into the main pane as pill tab bars." Sidebar sub-items are shortcuts, not the primary filter surface.
