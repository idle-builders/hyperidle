# Conversations Journey Review

## The One Thing
Land on a review, understand what an agent did, and approve / request changes / reject — without leaving the keyboard. After deciding, advance to the next review in the queue.

## IA tree
- Entry: `/conversations/review` — landing route for the whole app (`router.tsx:28`).
- Second: `/conversations/chat`
- Drill-downs: none reachable. There is no list of reviews to click into; `setSelectedId` is `void`'d (`ConversationsReview.tsx:130`). The "drill-down" tier is structurally absent.

## Top 10 (ranked by tree centrality — entry screen first)

### #1 No queue, no next review — [ENTRY]
**Bug:** Submenu shows "Review Queue 3" but the main pane only ever renders `MOCK_REVIEWS[0]`; there is no list, no Next button, no keyboard advance, and `setSelectedId` is voided.
**Hits:** Every user — after deciding on review 1 of 3, they have no way to reach review 2. The core loop dead-ends.
**Fix:** Render a thread list inside the Submenu (the "3" maps to actual rows) and add `J/K` or `Cmd+Enter→next` on commit so the queue auto-advances.
**Evidence:** `ConversationsReview.tsx:121-130`; `01_entry_review_default.png` (no list visible anywhere).

### #2 Review has no title — [ENTRY]
**Bug:** `MockReviewItem.title` ("Auth flow implementation") is on the data but never rendered. Header shows only `Developer Agent` + `2m ago`.
**Hits:** Every user — they read the diff to figure out *what* they're approving. Casual users won't make the leap.
**Fix:** Render `selected.title` as the primary `<h1>` in `ReviewHeader`, proposer + timestamp drop to a sub-line.
**Evidence:** `ConversationsReview.tsx:38, 192-220`; `01_entry_review_default.png`.

### #3 "More" overflow menu collides into itself — [ENTRY]
**Bug:** Open the More menu and labels stack on top of each other ("Approve with comments" overlaps "Comment", "Inline comment" overlaps "Edit"). The menu is unusable.
**Hits:** Every user trying any secondary verdict — labels are literally unreadable.
**Fix:** Set explicit `min-width` + `flex-direction: column` with row gap on the menu container; constrain kbd hints to `flex-shrink:0` on the right.
**Evidence:** `ReviewHeader.tsx:254-268`; `05_more_open.png` (labels overlap visibly).

### #4 Reasoning is collapsed by default — [ENTRY]
**Bug:** "REASONING 5 steps" panel ships closed. The reasoning is the *whole point* of human-as-validator yet it requires an extra click on every review.
**Hits:** Every user — collapsed reasoning trains the user to approve without reading. That's the failure mode this product exists to prevent.
**Fix:** `defaultOpen={true}` for the reasoning block on the review screen. Let the user collapse if they want; default is open.
**Evidence:** `ReasoningBlock.tsx:18`; `ConversationsReview.tsx:209`; `01_entry_review_default.png` (only "5 steps" affordance visible).

### #5 Verdict toolbar wraps on blocking reviews — [ENTRY]
**Bug:** At default 1440px width, primary verdicts + Pause + More don't fit on one row. "Pause" drops to a second row, "More" sits orphaned in row 1.
**Hits:** Power users hitting blocking reviews (the most urgent kind) — the toolbar geometry breaks exactly when stakes are highest.
**Fix:** Shorten labels ("Changes" instead of "Request changes"), or move kbd-hints into the tooltip rather than next to the label, so 5 buttons + More fit on one row.
**Evidence:** `ReviewHeader.tsx:222-233`; `01_entry_review_default.png` (Pause in row 2).

### #6 Decision and evidence are split far apart — [ENTRY]
**Bug:** Top→bottom layout is: verdict buttons → reasoning → metadata strip (status / SLA / routing) → diff → related history. To approve, the eye scans 600px down and back up. The SLA "2h left" — the strongest decision input — is mid-page.
**Hits:** Every user — they read at the bottom and act at the top. Locality is gone.
**Fix:** Inline status / SLA / routing into the `ReviewHeader` next to proposer; promote reasoning above metadata so the order is read-then-act, not act-then-read-then-jump-back.
**Evidence:** `ConversationsReview.tsx:208-217`; `ArtifactView.tsx:278-303`.

### #7 Related history reads as a link list, isn't clickable — [ENTRY]
**Bug:** "Previous login spike", "Auth design doc" render as `<span>` with default cursor. Users expect "click to open the prior context" — clicking does nothing.
**Hits:** Every user reaching for context before approving. The very items that exist to inform the decision are dead text.
**Fix:** Render each entry as a `<button>` (or anchor) with `cursor:pointer`, hover underline; click opens that review/doc in the same pane.
**Evidence:** `ArtifactView.tsx:317-319`; probe output: `History label: tag= SPAN cursor= auto`.

### #8 Proposer name and avatar look clickable, aren't — [ENTRY]
**Bug:** "Developer Agent" + circular avatar at top-left scream "filter by this agent" or "open profile". Both are static spans, default cursor.
**Hits:** Casual + power users — every product they've ever used makes this clickable.
**Fix:** Either remove the avatar (make it a flat text label) or wire it to filter the queue by proposer.
**Evidence:** `ReviewHeader.tsx:198-220`; probe output: `Proposer name tag= SPAN cursor= auto`.

### #9 Filters do nothing — [ENTRY/Submenu]
**Bug:** "All / Needs review / Chats / Resolved" chips are visible at the top of the Submenu. They update local state but no consumer reads it. Visible chrome that doesn't act.
**Hits:** Every user — they will click "Needs review" expecting a filtered list and see no change.
**Fix:** Either wire the filter to the (yet-to-exist) thread list from #1, or hide the filter row until it does something.
**Evidence:** `AppShell.tsx:367-374`; `01_entry_review_default.png` (chips visible above empty submenu body).

### #10 Chat artifact preview reads as tappable, isn't — [SECOND]
**Bug:** In a chat thread the inline `CONTENT_PREVIEW Cycle-7 pitch deck` block looks like a card. It is a `<div>` with default cursor, no hover state. Users expect inline expansion.
**Hits:** Every user trying to open the artifact the agent attached. The thing the message exists to share is unreachable.
**Fix:** Make the preview a `<button>` that toggles an inline `ArtifactView`, or routes to that artifact's review.
**Evidence:** `ConversationsChat.tsx:170-179`; probe output: `Artifact preview tag= DIV cursor= auto`; `02_chat_default.png`.

## What would die simplest
- The "Conversations 4" caps-lock title bar above the Submenu — duplicates the IconRail's selected-view signal. Cut.
- The metadata strip's redundant `status pending` label — kind badge + SLA carry the load; "status" is filler text. Cut.

## Adversary kill log
- "Verbose verdict labels" — same root cause as #5 (toolbar overflow). Consolidated.
- "Submenu shows route navigators not threads" — same root cause as #1. Consolidated.
- "Pending verdict mid-flow banner eats a row" — only appears for ~2s mid-action; fails real-evidence priority. Cut.
- "Chat sender label takes its own row" — chat-only, base-journey weak. Cut.
- "Chat title isn't actionable" — speculative; `<h2>` is a defensible default. Cut.
- "Send button placement is power-user friction" — Enter-to-send works; fails common-denominator. Cut.
