## 5. User Journeys

### 5.1 Morning check-in (3 minutes)

```
Open Factory
  → Glance at Rail (minimized): blocked count, cost burn, unread count <!-- @lore AD8a: historical — Rail removed in U6 -->
  → If blocked > 0: expand Rail → see which agents are stuck → click blocker → lands in Conversations review thread → use verdict actions to approve/request changes (15 seconds each) <!-- @lore AD8a: historical — Rail removed in U6 -->
  → Scan Submenu thread list: any blocking reviews? Handle them.
  → Check if assistant has posted (open overlay from Rail button if needed) <!-- @lore AD8a: historical — Rail removed in U6 -->
  → Done. Leave open on side screen.
```

### 5.2 Handle a review item (15 seconds — 5 minutes)

```
Submenu thread list shows blocking review (prominent indicator)
  → Click thread → Main shows review thread detail with rich messages inline
  → Read agent reasoning (always visible first)
  → Look at ArtifactView (text_diff / content_preview / visual_comparison / action_summary / data_metrics)
  → Simple case: click Approve (keyboard: A) → done
  → Complex case: leave inline comment on specific line → click Comment → agent revises → come back later → Approve with comments
  → High stakes: Reject or Request Changes → agent gets feedback, revises, re-submits in same thread
```

### 5.3 Weekly bet planning (15 minutes)

```
Click Work icon → Portfolio Overview loads (product cards with metrics)
  → Click product card → Product view (drill-down: Canvas + task list)
  → See Canvas with shaped pitches and committed bets (hard capacity cap)
  → Click "+" on Canvas → BetCreateDialog opens
  → Write markdown pitch, set appetite (money + tokens), create
  → Commit shaped pitches from Product Managers (capacity cap enforced)
  → Kill pitches that aren't worth reshaping
  → Click a committed BetCard → Bet Detail
  → Review pitch (rendered as styled markdown blocks), check task list with cost + status
  → Leave a comment via the thread section if scope needs adjusting
  → Navigate back to Product view → switch product → repeat
```

### 5.4 Weekly knowledge curation (20 minutes)

```
Click Knowledge icon → Submenu shows scope selector
  → Select Practice scope → pick "Building"
  → Switch to "Needs attention" sort (by attention score)
  → Open first item → read body (rendered as styled markdown blocks) → edit inline
  → Flag an item that looks wrong → facilitator will review
  → Switch to stale sort → archive items nobody uses
  → Click "+ New" → KnowledgeCreateDialog opens
  → Select scope (product, practice, or factory) → write markdown body → create
  → Switch to Product scope → browse recent items from agents
  → Done.
```

### 5.5 assistant monthly conversation (30 minutes)

```
Click assistant button (bottom-right of Rail) → overlay opens <!-- @lore AD8a: historical — Rail removed in U6 -->
  → Scroll through recent messages — cross-product patterns, obstacle report
  → Reply with thoughts on what's working, what to change
  → assistant proposes edit to PRINCIPLES.md → drafts it as a review thread
  → Review thread appears in Conversations Submenu list → use verdict actions to approve/comment/request changes
  → Approved changes are written back to factory knowledge
```

### 5.6 Respond to a blocker (reactive, 30 seconds)

```
Rail shows "2 blocked" (visually emphasized) <!-- @lore AD8a: historical — Rail removed in U6 -->
  → Expand Rail → see: "Pulse Hardware Agent: waiting on review verdict for PCB layout rev C (2h)" <!-- @lore AD8a: historical — Rail removed in U6 -->
  → Click → lands in Conversations on that review thread
  → Rich message shows: reasoning + ArtifactView (visual_comparison)
  → Review before/after visual, read reasoning
  → Click Approve → agent resumes immediately
```

### 5.7 Create and shape a pitch (5 minutes)

```
Click Work icon → Portfolio Overview → click product card → Product view
  → Click "+" on Canvas → BetCreateDialog opens
  → Write markdown pitch with: problem statement, solution sketch, rabbit holes, done condition
  → Set appetite (money budget + optional token budget)
  → Create → bet appears in shaped column
  → Optionally: open bet detail and leave a comment for the Product Manager
  → Next betting session: commit, reshape, or kill
```

### 5.8 Start a conversation with an agent (1 minute)

```
Press N → RecipientPicker opens in Submenu
  → Search or browse available agents (shows name, role, active session indicator)
  → Select recipient → type message → send
  → New thread appears in Conversations list
  → Agent responds asynchronously; thread updates via WebSocket
```

### 5.9 Observe a running session (2 minutes)

```
Press D → SessionActivityPanel opens
  → Select an active session to dial into
  → Activity stream shows: tool calls, reasoning steps, cost accumulating
  → Filter tabs: All | Tools | Reasoning | Cost
  → Read-only — observe without interfering
  → Press Escape to close
```

### 5.10 Mid-cycle bet check-in (5 minutes)

```
Click Work icon → Portfolio Overview → click product card → Product view
  → Scan task list: anything blocked? Any tasks piling up?
  → Click committed BetCard → Bet Detail
  → Review pitch (styled markdown blocks), check task list with cost columns
  → If behind: use bet actions (pause, adjust appetite) with consequence preview
  → If on track: leave a comment in the thread section ("looking good, keep going")
  → Check cost: actual money + tokens vs. appetite — any overrun?
  → Navigate back to Product view
```

---
