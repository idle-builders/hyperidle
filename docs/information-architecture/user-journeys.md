## 5. User Journeys

### 5.1 Morning check-in (3 minutes)

```
Open Factory
  → Glance at Rail (minimized): blocked count, cost burn, unread count
  → If blocked > 0: expand Rail → see which agents are stuck → click blocker → lands in Conversations review thread → use ReviewHeader to approve/request changes (15 seconds each)
  → Scan Submenu thread list: any blocking reviews? Handle them.
  → Glance at Chief of Staff pinned thread — any new messages?
  → Done. Close or leave open on side screen.
```

### 5.2 Handle a review item (15 seconds — 5 minutes)

```
Submenu thread list shows blocking review (prominent indicator)
  → Click thread → Main shows review thread detail with ReviewHeader
  → Read agent reasoning (always visible first)
  → Look at ArtifactView (text_diff / content_preview / visual_comparison / action_summary / data_metrics)
  → Simple case: click Approve in ReviewHeader (keyboard: A) → done
  → Complex case: leave inline comment on specific line → click Comment → agent revises → come back later → Approve with comments
  → High stakes: Reject or Request Changes in ReviewHeader → agent gets feedback, revises, re-submits in same thread
```

### 5.3 Weekly bet planning (15 minutes)

```
Click Work icon → Portfolio Overview loads (default)
  → Glance at product status cards — any decisions pending?
  → Click product card → Team View for that product
  → See Canvas (committed BetCards) + Kanban below
  → Click "+" (Add bet) on Canvas → PitchSelector overlay replaces Kanban
  → Scan available pitches → expand one to read full pitch body
  → Click "Commit" on best 2-3 PitchCards (capacity cap enforced)
  → Kill pitches that aren't worth reshaping
  → Close PitchSelector → Kanban returns with new bet tasks populating
  → Click a committed BetCard → Bet Detail → review TaskCard table
  → Leave a comment if scope needs adjusting
  → Breadcrumb back to Team View → switch product in Submenu → repeat
```

### 5.4 Weekly knowledge curation (20 minutes)

```
Click Knowledge icon → Submenu shows scope selector
  → Select Practice scope → pick "Building"
  → Switch to "Needs attention" view → see KnowledgeRows sorted by attention score
  → Open first item → read body → edit inline to sharpen wording → auto-saves
  → Flag an item that looks wrong → facilitator will review
  → Switch to "Stale" view → archive 3 items nobody uses
  → Merge two duplicate items on the same topic
  → Switch to Product scope → Pulse → check recent items from hardware agents
  → Done.
```

### 5.5 Chief of Staff monthly conversation (30 minutes)

```
Submenu thread list → click pinned Chief of Staff thread (always at top)
  → Scroll through recent messages — cross-product patterns, obstacle report
  → Reply with thoughts on what's working, what to change
  → Chief of Staff proposes edit to PRINCIPLES.md → drafts it as a review thread
  → Review thread appears in Submenu list → use ReviewHeader to approve/comment/request changes
  → Approved changes are written back to factory knowledge
```

### 5.6 Respond to a blocker (reactive, 30 seconds)

```
Rail shows "2 blocked" (visually emphasized)
  → Expand Rail → see: "Pulse Hardware Agent: waiting on review verdict for PCB layout rev C (2h)"
  → Click → lands in Conversations on that review thread
  → Companion layout opens: conversation + ReviewHeader left, ArtifactView (visual_comparison) right
  → Review before/after visual, read reasoning
  → Click Approve in ReviewHeader → agent resumes immediately
```

### 5.7 Create and shape a pitch (10 minutes)

```
Click Work icon → Portfolio Overview → click product card → Team View
  → Click "+" (Add bet) → PitchSelector overlay opens
  → Click "New Pitch" button in PitchSelector
  → Fill in: title, appetite (1w/2w/6w), problem statement, solution sketch, rabbit holes, done condition
  → Save → pitch appears in PitchSelector list
  → Optionally: pitch creates a review thread in Conversations for feedback from Chief of Staff
  → Close PitchSelector (or immediately commit the pitch)
  → Next betting session: open PitchSelector again → commit, reshape, or kill
```

### 5.8 Mid-cycle bet check-in (5 minutes)

```
Click Work icon → Portfolio Overview → click product card → Team View
  → Scan Kanban: anything blocked? Any tasks piling up in "Planned"?
  → Click committed BetCard → Bet Detail
  → Read progress card, check TaskCard table states
  → If behind schedule: click "Sync" → flag blocker or request scope reduction
  → If on track: leave a comment ("looking good, keep going")
  → Check cost card: actual vs. appetite — any overrun?
  → Breadcrumb back to Team View
```

---
