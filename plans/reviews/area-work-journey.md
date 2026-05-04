# Work Journey Review

## The One Thing
Every user lands on Portfolio to answer: "what's the state of my products and which one needs me right now?" They scan four product cards, identify one with trouble, and click into it.

## IA tree
- Entry: `/work/portfolio` (AppShell.handleViewChange picks first submenu item — `AppShell.tsx:271`)
- Second: `/work/team`
- Drill-downs: `/work/bet/:betId` (e.g. `/work/bet/b1`)

## Top 10 (ranked by tree centrality — entry screen first)

### #1 Product cards are inert — [ENTRY]
**Bug:** Product cards (HyperIdle Core, Knowledge Fabric, etc.) are styled like cards but have no onClick, no role, no tabIndex. Cursor stays `auto`. The Rail's bet rows in the same view DO navigate, so the inconsistency is visible side-by-side.
**Hits:** Every user. The base journey is "spot the troubled product, click in" — there is no click target. They have to find a different path (Rail item, Team Board, search) to reach a bet.
**Fix:** Make each product card open `/work/team` filtered to that product (or a `/work/product/:id` route). Wire `onClick`, set `role="button"`, give a `pointer` cursor.
**Evidence:** `WorkPortfolio.tsx:85-121` (no handler); `Rail.tsx:317-329` (Rail bets navigate). Probe: `cardCursor: "auto", cardTabIndex: -1, cardRole: null`.

### #2 Product names truncate by default — [ENTRY]
**Bug:** At the default desktop width (1440×900) with the Rail expanded (default state), every product name renders truncated: "Hyperidle C…", "Knowledge F…", "Review Wor…", "Agent Runti…". Names render in full only when the Rail is collapsed.
**Hits:** Every user, on first paint. The single piece of identifying text on each card is unreadable; they cannot tell products apart without hovering for a tooltip (none provided) or collapsing the Rail.
**Fix:** Either drop to 2 columns at this width, increase the card title to wrap to 2 lines, or shrink lead-avatar/StatusChip to give the title more room.
**Evidence:** `docs/reviews/screenshots/work/01-entry-portfolio-default.png` vs `07-entry-rail-collapsed.png`. Probe: title `scrollWidth=104, clientWidth=95` for "HyperIdle Core" in default state.

### #3 KPI numbers on cards are dead — [ENTRY]
**Bug:** "Active bets: 4", "Shipped: 12", "3/5" progress all look like data but click nothing. The user reads them, then has nowhere to go to see those 4 bets or those 12 shipped.
**Hits:** Every user. Reading a number that promises drill-in but doesn't deliver is the canonical clickability lie.
**Fix:** Make "Active bets: N" link to `/work/team?product=X`, "Shipped: N" link to a shipped list (or omit if no list exists). The progress count `3/5` should at minimum tooltip what it represents.
**Evidence:** `WorkPortfolio.tsx:102-107` (KeyValue components, no onClick). Same probe as #1 — entire card has no handler.

### #4 Rail bet count contradicts cards — [ENTRY]
**Bug:** Rail shows "Active Bets: 2" but the four cards sum to 10 active bets (4+2+1+3). Same screen, same word "active bets", two different numbers, no explanation.
**Hits:** Every user. Either the Rail is wrong, the cards are wrong, or "active" means two different things — none of which the UI explains.
**Fix:** Pick one definition of "active bet" and show one number, OR rename the Rail section ("Bets needing your attention", "My queue") so the difference is legible. Counts must agree across the page.
**Evidence:** `app-shell-data.ts:33-36` (Rail mock = 2 bets) vs `portfolio-data.ts:23-64` (4 products totalling 10 active bets). Probe: `totalActiveBetsAcrossCards: 10`.

### #5 Cycle 12 stripe is dead chrome — [ENTRY]
**Bug:** A 60px-tall band sitting under the cards just says "CYCLE 12" and "9 days remaining". No drill-in, no expand, no link to bets-this-cycle, no edit. It uses prime real estate (full row width) for a label and a static countdown.
**Hits:** Every user; the entry already feels half-empty (everything below this stripe is whitespace) and this is one of two non-card elements consuming that space.
**Fix:** Either cut it (move "Cycle 12 · 9d left" to the page heading next to "PORTFOLIO") or make it a real surface — clickable to a cycle dashboard, expandable to show cycle bets.
**Evidence:** `WorkPortfolio.tsx:125-138`; screenshot `01-entry-portfolio-default.png` rows 410-440 vs the empty space below 460.

### #6 Cost panel is locality-mismatched — [ENTRY]
**Bug:** Rail's COST section ($12.40 Today, $50 budget, $84.20 Week) sits next to the Portfolio cards but is a different visual frame entirely — no shared header, no per-product breakdown. The user reads cost numbers and has no way to see which product is burning the budget.
**Hits:** Every user once they ask "where's the spend going?" — the answer is split across two regions that don't reference each other.
**Fix:** Either add a Cost line to each product card (so cost lives next to the product it belongs to) or label the Rail panel as "Portfolio cost" and show top-spending product inline.
**Evidence:** `01-entry-portfolio-default.png` cards (left) and Rail Cost (right) — zero visual or data linkage. `Rail.tsx:368+` renders Cost without product context.

### #7 BetCard cursor lies on Team Board — [SECOND]
**Bug:** On `/work/team`, BetCards in the Canvas show `cursor: pointer` (because they're draggable wrappers) but clicking does nothing — they neither open the bet detail nor commit. Same page, same Rail-bet rows DO navigate to detail.
**Hits:** Every user. Pointer cursor + no click action = the worst clickability mismatch.
**Fix:** Wire the BetCard click to `/work/bet/${id}` (drag remains via the drag handle / attributes). The single click is the obvious affordance for the most common action.
**Evidence:** `Canvas.tsx:83-96` (DraggableBetCard wraps BetCard, no onClick passed); probe: `betCursor: "pointer", betTabIndex: -1`.

### #8 TaskCard cursor lies on Team Board — [SECOND]
**Bug:** Identical to #7 for TaskCards in Kanban — pointer cursor on every card, but clicking does nothing. There is no path from Team Board to a task drill-down at all.
**Hits:** Every user. The Kanban is the densest interactive surface in Work and clicking a task does nothing.
**Fix:** Wire TaskCard click to a task detail (or Bet detail anchored to the task). At minimum, a click should open something — an inline panel, a modal, a route.
**Evidence:** `Kanban.tsx:138-157` (DraggableTaskCard, no onClick); probe: `taskCard cursor: "pointer", tabIndex: -1`.

### #9 Canvas + Kanban don't share columns — [SECOND]
**Bug:** Top half is Shaped/Committed (2 wide bet columns); bottom half is Planned/Blocked/In Progress/Done (4 narrow task columns). The "Auth migration" bet at the top doesn't visually align with its tasks below — eye must scan across 200px of vertical empty space and switch column-count to find them.
**Hits:** Every user. The mental model "this bet has these tasks" is the entire reason the page exists, and the layout breaks it.
**Fix:** Pick one organizing axis. Either remove the Canvas (rely on the bet-tag groups already present in Kanban) or make Canvas-bet-cards link/anchor-scroll to their bet group below.
**Evidence:** `02-second-team-default.png` — Auth migration card at y≈110, its tasks (Implement login, JWT refresh, Write auth tests) start at y≈315 across three different columns.

### #10 Task table rows are inert — [DRILL]
**Bug:** On `/work/bet/b1` the Tasks table shows three task rows but they're plain `<tr>` cells — no cursor, no tabIndex, no click. The drill-down has no further drill-down.
**Hits:** Every user who reaches the bet detail. They see "Implement login endpoint · DONE · Dev Agent 1 · $4.20" and have no way to open the task.
**Fix:** Wire a row click to a task detail (modal or route). At minimum let the title cell be a button.
**Evidence:** `WorkBet.tsx:316-325` (no handler on `<tr>`); probe: `rows: [{cursor:"auto",tabIndex:-1}, …]`.

## What would die simplest
- **Cycle 12 stripe.** Bury the label inline next to the page title; reclaim a full row.
- **Rail Cost section while on Portfolio.** Either fold spend into each product card or relegate Cost to a Settings/global panel — it doesn't belong as a fixed sibling of the per-product summary.

## Adversary kill log
- **Status pills filter affordance** — power-user feature, not base journey. CUT.
- **Lead avatars opening agent detail** — agent navigation is expert flow. CUT.
- **Markdown rendering as raw `# Problem` on bet detail** — drill-down depth budget is 2 items; row inertia (#10) is more central. CUT.
- **PORTFOLIO h1 is too small** — vague "make it bigger", not a missing interaction. CUT.
- **Submenu Work icon has no badge count** — chrome-global; same shape on every view. CUT.
