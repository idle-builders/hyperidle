# Knowledge Journey Review

## The One Thing
Every user lands on /knowledge to see what their agents have learned and which items currently need a human eye. The base journey is: scan the list, recognise an item that needs review, click in to read it.

## IA tree
- Entry: `/knowledge` (Triage tab default; topic-grouped Curated tab; submenu has scope + topic browser)
- Second: `/knowledge/:id` (metadata bar, body, observation log, related sidebar)
- Drill-downs: in-page Edit toggle on detail (state-only, not a route)

## Top 10 (ranked by tree centrality — entry screen first)

### #1 Topic NavItems are dead clickable shapes — [ENTRY]
**Bug:** Architecture / Research / Component Library / Process render as full-width rows with hover affordance + count badges, but they are `<li><div>` with no onClick — clicking them does nothing.
**Hits:** Every user. The eye reads them as filter targets ("show me Architecture only"); clicking yields silence.
**Fix:** Either wire each topic to scroll-to / filter the list (clicking "Process" jumps to or filters to topic=Process), or render them as static labels (drop hover, drop count-as-badge, indent) so they stop pretending to be NavItems.
**Evidence:** `packages/web/src/layouts/AppShell.tsx:171-188` — `<li><div ...>` with no handler. Screenshot `01-entry-default.png` (left submenu).

### #2 "All / Needs review" pills are inert — [ENTRY]
**Bug:** Submenu segmented filter renders, accepts clicks, paints the active state, but the list does not change. Lore comment confirms: "rendered children currently ignore the filter value."
**Hits:** Every user. Selecting "Needs review" produces a styled pill that suggests success, while the visible list is unchanged — silent failure.
**Fix:** Either wire `submenuFilter` into KnowledgeList (when "needs-review", filter `status === "needs_human"`) or remove the pills entirely until they do something. Right now they are pure deception.
**Evidence:** `packages/web/src/layouts/AppShell.tsx:60-62` lore comment; `KnowledgeList.tsx` never reads `submenuFilter`. Screenshot `01-entry-default.png` top-left.

### #3 Scope shown twice; the right-hand `practice` chip is dead — [ENTRY]
**Bug:** The Submenu already has the Practice/Product/Factory segmented control. The main panel header shows another `practice` badge in the top-right that looks like a clickable chip but is a static `<span>`.
**Hits:** Every user. The badge is at the natural spot for a scope picker; users will try to click it.
**Fix:** Drop the right-side scope chip entirely — scope is already controlled in the submenu. Reclaim the space for the Triage/Curated tabs to right-align or for an actual action (Search, Refresh).
**Evidence:** `KnowledgeList.tsx:122-128`. Screenshots `01-entry-default.png`, `03-entry-product.png`, `04-entry-factory.png`.

### #4 Suggestion is shouting, the queue is whispering — [ENTRY]
**Bug:** The single curation Suggest card is wider, brighter, and visually heavier than the entire list of items needing attention. It dominates a row that exists to surface the queue.
**Hits:** Every user. The eye anchors to the Suggest card; the actual triage queue (the reason the page exists) becomes secondary.
**Fix:** Demote the suggestion card to match list-row height, drop the bordered/tinted background, place it at the top of the rows as one row in the same rhythm with a "SUGGESTION" leading chip. Or move it under the queue.
**Evidence:** `CurationSuggestionCard.tsx:27-32` (border, padding, primary-dim bg). Screenshot `01-entry-default.png` row 1.

### #5 KNOWLEDGE count badge lies — [ENTRY]
**Bug:** Submenu header shows "KNOWLEDGE 12" hardcoded regardless of scope. Practice has 7 items, Factory has 3. The `12` never changes.
**Hits:** Every user, every scope switch. The number is at eye-level above the segmented control; switching scope leaves it unchanged, breaking the model that scope is a true filter.
**Fix:** Compute the count from the active scope's item set, or remove the count entirely if it can't be made truthful at the row level (count is a power-user crumb, not core).
**Evidence:** `AppShell.tsx:51-53` hardcoded `count: 12`; verified across screenshots `01`, `03`, `04`.

### #6 Item rows hide the one thing the user cares about — [ENTRY]
**Bug:** In Triage, the "why now" reason ("3 new observations since review") is the load-bearing signal — but it's rendered as a 12px low-contrast caption underneath layer/kind/status chips that sit on the prime title row.
**Hits:** Every user. The chips (L1, principle, BEHIND) repeat across rows and stop differentiating; the unique "why now" line is what drives the click. Hierarchy is inverted.
**Fix:** Pull "why now" up next to the title (right-aligned, before the timestamp) or boost it to body weight. Demote layer/kind to a single grouped chip (or hide layer entirely behind hover). Keep status visible — it earns its place.
**Evidence:** `KnowledgeRow.tsx:70-93`; `KnowledgeList.tsx:186` (`caption={truncateReason(item.whyNow)}`). Screenshot `01-entry-default.png`.

### #7 Tags inside rows look like filter chips, do nothing — [SECOND, also ENTRY]
**Bug:** `L1`, `pattern`, `decision` Tag pills are visually identical to filter pills elsewhere in the app. Click → nothing. On the detail page these tags re-appear in the metadata bar with the same dead affordance.
**Hits:** Every user. After scanning the list, the natural drill-in is "click L1 to see all L1 items". Mismatch repeats on the detail page metadata bar.
**Fix:** Decide once: either tags filter (clicking `pattern` filters the list to kind=pattern), or tags read-only (drop pill chrome, render as inline mono caption text). Apply to both list rows and the detail metadata bar in one stroke.
**Evidence:** `KnowledgeRow.tsx:76-78`; `KnowledgeDetail.tsx:254-256`. Screenshots `01-entry-default.png`, `02-detail-k1.png`.

### #8 Detail page has no breadcrumb / no way back — [SECOND]
**Bug:** Once on `/knowledge/k1`, there is no breadcrumb, no "Back to Knowledge", no header link. The Submenu is the only return path; users on smaller viewports (submenu collapsed) are stranded short of using the browser back button.
**Hits:** Every user who drills in. The detail title sits where a breadcrumb belongs ("Knowledge / Architecture / Auth Strategy") and gives them context.
**Fix:** Add a 1-line breadcrumb above the title: `Knowledge / {topic} / {title}` with the topic segment linking to /knowledge filtered to that topic (couples with #1 and #6).
**Evidence:** `KnowledgeDetail.tsx:245-252` — only an `<h1>` and an Edit button; no Link to `/knowledge`. Screenshot `02-detail-k1.png`.

### #9 Observation log columns are unreachable info — [SECOND]
**Bug:** Each observation entry shows `agent | text | timestamp` in three columns. The agent name is not a link; clicking the entry does nothing; users cannot pivot to "what else has Security Agent observed?".
**Hits:** Casual + power user reading the log. The agent attribution is the ONE pivot the log invites; offering it without making it actionable wastes the locality.
**Fix:** Make the agent name a link to a filtered Knowledge view (or to a future agent profile). At minimum, group observations by agent visually, or align timestamps right-edge so the eye scans entries by recency without back-and-forth.
**Evidence:** `KnowledgeDetail.tsx:336-353`. Screenshot `02-detail-k1.png`.

### #10 Edit button is invisibly placed and silently lossy — [DRILL]
**Bug:** "Edit" is a `btn-ghost` ghost text in the top-right of the detail page — nearly invisible against the surface. The Edit/Save flow is local-state only: refresh discards the change with no warning. There is no "saved/dirty" indicator.
**Hits:** Anyone who tries to edit. They click, type, refresh or navigate away, and silently lose their work.
**Fix:** (1) Promote Edit to a visible secondary button next to the metadata bar, not floating top-right. (2) Show a "draft, not saved" pill while editing. (3) Until backend writes exist, honestly disable Edit with a tooltip "Editing returns in J9".
**Evidence:** `KnowledgeDetail.tsx:248-251` (placement), `:213-232` (state-only persistence). Screenshot `02-detail-k1.png` top-right "Edit".

## What would die simplest
1. The right-hand `practice` scope badge in the page header — 0 affordance, redundant with submenu segmented control.
2. The Suggest card's separate visual treatment (border, tinted background) — fold the suggestion into a normal row with a leading "SUGGESTION" chip.

## Adversary kill log
- "Submenu density / spacing tweaks" — vague; cut per "specific & fixable".
- "Detail page Related sidebar should also show kind icons" — feature-add, not a fix; cut per "no proposing new features".
- "Loading skeleton not visible by default" — edge state, ENTRY only on slow nets; cut per "tree position / base journey".
- "Empty state copy could be more inspiring" — vagueness + base-journey miss (only triggered when no items in scope); cut.
- "Detail page is editable when it should be read-only" — that's the reverse of what UX wants and overlaps with #10's real bug; consolidated into #10.
