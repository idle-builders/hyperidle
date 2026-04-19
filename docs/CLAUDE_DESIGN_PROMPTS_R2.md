# Claude Design Prompts — Round 2: Synthesis

You have two inputs: (1) the fresh designs you just created from scratch, and (2) the existing frontend codebase in `web/`. Your job is NOT to pick a winner. Your job is to be a design director running a synthesis session — find what each version does better, resolve conflicts with intention, and produce one final unified design that is better than either input alone.

---

## Prompt R2-1: Design System & Shell Synthesis

```
You now have two versions of the HyperIdle design system and app shell:

VERSION A: The fresh designs you created from the written spec.
VERSION B: The implemented frontend codebase (web/).

HOW TO READ THE CODEBASE — The codebase is a working React + Tailwind + DaisyUI app with a custom `factory-dark` theme. Read it as an implemented design — the classes, spacing, and structure are deliberate. Key files:
- tailwind.config.ts + src/index.css — theme tokens (DaisyUI factory-dark theme + CSS custom properties --surface-0 through --surface-6, --text-hi/mid/lo)
- src/layouts/AppShell.tsx — the shell composition: IconRail | Submenu | Main (Outlet) | Rail. Manages view state, responsive breakpoints, settings panel, global search (⌘K).
- src/components/ — Tier 1 primitives: StatusChip.tsx (6 states + defensive unknown), Tag.tsx, KeyValue.tsx, NavItem.tsx, SearchField.tsx. Tier 2 blocks: ThreadRow.tsx, BetCard.tsx, PitchCard.tsx, TaskCard.tsx, KnowledgeRow.tsx, NotificationRow.tsx. Plus SettingsPanel.tsx, GlobalSearchPanel.tsx, ErrorBoundary.tsx.
- src/shell/ — Tier 3 regions: IconRail.tsx (48px, roving focus), Submenu.tsx (240px, collapsible), Rail.tsx (56px collapsed / 360px expanded, sole notification surface), ArtifactView.tsx (5 shapes: text_diff, content_preview, visual_comparison, action_summary, data_metrics), ReviewHeader.tsx (verdict buttons + keyboard shortcuts), Canvas.tsx, Kanban.tsx, PitchSelector.tsx.
- src/pages/ — Tier 4: ConversationsReview.tsx, ConversationsChat.tsx, WorkPortfolio.tsx, WorkTeam.tsx, WorkBet.tsx, KnowledgeList.tsx, KnowledgeDetail.tsx, NotFound.tsx.
- *.stories.tsx files next to each component — show all states and variations.
- src/hooks/ — useCommandK.ts (⌘K), useKeyboardNavigation.ts, useViewportBreakpoint.ts, useGlobalSearch.ts.
- 19 custom components total. Everything else uses DaisyUI directly (btn, badge, alert, skeleton, menu, modal, etc.).

Your task is to synthesize these into ONE final design. This is a design director's merge — not a compromise, not a pick-one. The goal is a unified design that takes the strongest elements from each.

STRUCTURED COMPARISON — go through each of these and note which version handles it better and why:

1. SURFACE TONES — Version B uses CSS custom properties (--surface-0 through --surface-6 plus --surface-ghost). How does your Version A handle tonal layering? Which creates clearer visual hierarchy between the four shell zones? Are the zone boundaries legible without borders?

2. ICONRAIL — Version B is 48px (w-12) with ghost buttons, roving focus keyboard nav, and an avatar at the bottom. Compare with your Version A. Which feels more like a professional tool's sidebar (think Linear, Figma, VS Code)?

3. SUBMENU — Version B is collapsible with a title, uses DaisyUI menu-sm with NavItems. It responds to viewport breakpoints (auto-collapses on narrow windows, remembers manual toggle). How does your Version A handle collapse behavior and responsive adaptation?

4. RAIL — Version B has two states: collapsed (w-14, badge counts only) and expanded (w-[360px], collapsible sections with SectionHeaders for Bets/Blockers/Cost, each with roving focus). It's the ONLY notification surface. Compare density, scannability, information hierarchy.

5. STATUSCHIP — Version B maps 6 states to DaisyUI badge classes with a 6px colored dot + uppercase mono text. It handles unknown/invalid statuses defensively (renders "UNKNOWN" chip). Compare with your Version A's treatment of status.

6. TYPOGRAPHY — Version B uses Inter for UI, Space Grotesk (font-heading) for section headers with uppercase + tracking-wider. Text colors use --text-hi/mid/lo. Compare hierarchy clarity.

7. DENSITY — Version B uses gap-0.5 to gap-3, p-2 to p-3 padding. Tight. How does your Version A compare? Which feels more like a Bloomberg terminal and less like a marketing page?

8. COMPONENT COMPOSITION — The codebase composes DaisyUI primitives directly (btn, badge, alert, skeleton, menu). Custom components only exist for domain semantics (StatusChip, ThreadRow, etc.). 19 custom components total. Does your Version A respect this budget?

SYNTHESIS DELIVERABLES:
1. Final unified design system sheet: all tokens, all primitives, all blocks — showing the merged treatment.
2. Final app shell showing the Conversations view active, with the synthesized IconRail, Submenu (thread list), Main (review thread), and Rail (collapsed).
3. Final Rail expanded state.
4. Annotated comparison: for each significant design decision, a brief note on what came from Version A, what came from Version B, and why.

DESIGN CRITIQUE — after completing the synthesis, put on your harshest critic hat and write a section called "Critique & Open Questions":
- What are the weakest parts of this synthesized design? Where did you make a call you're not fully confident in?
- What patterns might break at scale? (50+ threads, 20+ bets, 500+ knowledge items, 10+ products)
- What interaction patterns are underspecified? (transitions, micro-animations, focus management, keyboard flows you haven't fully thought through)
- What accessibility gaps remain? (color contrast on dark surfaces, screen reader flow through the shell zones, focus trap behavior)
- What edge cases haven't been designed? (first-run empty state, error recovery, offline behavior, extremely long content)
- What are 3-5 open design questions that should be explored in future iterations but don't need to be solved now?
Label each item with a severity: 🔴 must resolve before shipping, 🟡 resolve during build, 🟢 explore later.

CHANGE GUIDE — produce a structured change guide called "Implementation Delta" that maps every visual change from the current codebase (Version B) to the final synthesis:
- For each component or region that changes, list: WHAT changed (specific: "IconRail width 48px → 56px", "StatusChip dot size 6px → 8px", not vague "improved spacing"), WHY it changed (the design rationale from the comparison), and WHERE in the codebase it lives (file path).
- Group changes by: Token/Theme changes (tailwind.config.ts, index.css), Component changes (src/components/*), Region changes (src/shell/*), Layout changes (src/layouts/*), Page changes (src/pages/*).
- Mark each change as: [VISUAL] (CSS/class only), [STRUCTURAL] (markup/component tree change), or [NEW] (doesn't exist in Version B yet).
- If a component in Version B is already correct, explicitly say "NO CHANGE — Version B is correct" so engineers don't waste time reviewing it.

KEEP IN MIND:
- The codebase is real and shipping. Changes to it cost engineering time. If your Version A improves something meaningfully, great — call it out. If Version B already nails it, say so and keep it.
- "Looks nicer" is not a reason to change working code. "Clearer information hierarchy" or "faster scannability" or "better state differentiation" are reasons.
- The 19-component cap is non-negotiable. Do not introduce new components.
- The Rail is the ONLY notification surface. No exceptions.
```

---

## Prompt R2-2: Conversations View Synthesis

```
Synthesize the two versions of the Conversations view into one final design.

VERSION A: Your fresh Conversations design.
VERSION B: The implemented code in web/ — specifically:
- src/pages/ConversationsReview.tsx — ReviewHeader + ArtifactView composition, mock review items with text_diff and data_metrics shapes
- src/pages/ConversationsChat.tsx — message list + reply input, mock messages with reasoning blocks
- src/shell/ReviewHeader.tsx — verdict buttons (approve/request-changes/reject/comment/snooze/escalate) with keyboard shortcuts A/R/X/S, proposer info row
- src/shell/ArtifactView.tsx — polymorphic renderer with discriminated union props. 5 shapes: text_diff (mono font, colored bg-success/10 and bg-error/10 lines, hunk headers), content_preview (DOMPurify-sanitized HTML + KeyValue metadata), visual_comparison (2-column grid with surface-4 panels), action_summary (ordered KeyValue list), data_metrics (3-col KeyValue grid + inline SVG sparklines). Each shape has loading skeleton, error alert, and empty states.
- src/components/ThreadRow.tsx — avatar + title + caption + StatusChip + timestamp
- src/components/StatusChip.tsx — 6 states mapped to DaisyUI badge classes, defensive unknown handling
- src/shell/Submenu.tsx — collapsible 240px panel, title + children slot, responsive breakpoint collapse
- src/layouts/AppShell.tsx — shell composition, SUBMENU_CONFIG maps Conversations to "Review Queue" (count: 3) + "Chat" (count: 1) NavItems

STRUCTURED COMPARISON:

1. THREAD LIST — How does each version differentiate blocking reviews vs non-blocking vs chat? Version B uses ThreadRow with StatusChip + avatar + title + caption. Which version makes triage faster? Can you tell in under 1 second which threads are blocking?

2. REVIEWHEADER — Version B has a row with proposer info + verdict buttons. The 10 verdict actions (approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate) with keyboard shortcuts A/R/X/S. Which version makes the verdict bar feel more decisive without being overwhelming?

3. ARTIFACT SHAPES — Version B implements all 5:
   - text_diff: mono font, colored lines (bg-success/10, bg-error/10), hunk headers
   - content_preview: DOMPurify-sanitized HTML + KeyValue metadata
   - visual_comparison: 2-column grid with surface-4 panels
   - action_summary: ordered KeyValue list
   - data_metrics: 3-column KeyValue grid + inline SVG sparklines
   Which version makes each shape more legible? Are inline comments well-placed? Does the diff view feel like GitHub?

4. AGENT REASONING — The spec says reasoning is "always visible, always first, collapsible but expanded by default." How does each version handle this? Which treatment builds trust without eating screen space?

5. CONVERSATION HISTORY — Below the artifact, messages thread chronologically. Version B is minimal (the chat page has messages, the review page focuses on artifact). Which version handles long back-and-forth threads better?

6. CHAT VS REVIEW — Version B has separate pages (ConversationsReview vs ConversationsChat). The Chief of Staff thread is a chat, review items are review threads. Which version makes the distinction clearer at both the list level and the detail level?

7. EMPTY/LOADING/ERROR — Version B handles all three with skeletons, alert-error, and empty text. Which version handles these edge states more gracefully?

SYNTHESIS DELIVERABLES:
1. Final thread list design showing: Chief of Staff pinned, 2 blocking reviews (visually urgent), 3 non-blocking reviews, 2 chats
2. Final review thread: text_diff shape with ReviewHeader, reasoning block, inline comments
3. Final review thread: content_preview shape (blog post review)
4. Final review thread: data_metrics shape (performance report with sparklines/charts)
5. Final review thread: action_summary shape (deployment proposal)
6. Final review thread: visual_comparison shape (two design revisions)
7. Final chat thread: the Chief of Staff long-running conversation
8. For each deliverable: one sentence on what changed from Version A, one on what was kept from Version B

DESIGN CRITIQUE — after the synthesis, write a "Critique & Open Questions" section:
- Where is the Conversations design weakest? What would a staff designer push back on?
- Thread list at scale: does the design hold up with 50+ threads? 200+? How does scrolling, filtering, and visual grouping perform?
- Review thread flow: is the reasoning → artifact → verdict → conversation sequence always the right order? When might it feel wrong (very simple reviews, very complex multi-file reviews)?
- Inline comments: is the interaction model clear enough? How do you distinguish thread-level comments from inline artifact comments visually?
- The 5 ArtifactView shapes: are any of them too similar? Too different? Does switching between shapes feel jarring or natural?
- Verdict muscle memory: will founders develop fast keyboard habits with A/R/X/S, or are there conflict risks with browser/OS shortcuts?
- What interactions are still vague? (bulk operations, snooze duration picker, escalation flow, "approve with comments" vs "comment")
- 3-5 open questions for future exploration.
Label each: 🔴 must resolve before shipping, 🟡 resolve during build, 🟢 explore later.

CHANGE GUIDE — produce an "Implementation Delta" section:
- For each component/region that changes from Version B, list: WHAT changed (specific CSS/markup), WHY (design rationale), WHERE (file path).
- Group by: ThreadRow changes, ReviewHeader changes, ArtifactView changes (per shape), Chat page changes, Layout/composition changes.
- Tag each: [VISUAL], [STRUCTURAL], or [NEW].
- Explicitly mark unchanged components as "NO CHANGE."
```

---

## Prompt R2-3: Work View Synthesis

```
Synthesize the two versions of the Work view into one final design.

VERSION A: Your fresh Work design.
VERSION B: The implemented code in web/ — specifically:
- src/pages/WorkPortfolio.tsx — portfolio overview with product status cards (name, lead, status, active bets, shipped count, velocity sparkline), cycle management card (phase indicator, advance button), past cycle summaries. Uses fixtures/portfolio-data.ts for mock data.
- src/pages/WorkTeam.tsx — Canvas (top) + Kanban (bottom) + PitchSelector (overlay toggle). Canvas shows committed bets with capacity indicator. Kanban has 4 columns with task state mapping via COLUMN_TO_STATE. PitchSelector opens when "+" clicked, shows selectable PitchCards.
- src/pages/WorkBet.tsx — bet detail with breadcrumb, bet header (title + Tag + StatusChip + appetite + cycle), pitch body (rendered markdown), task table (TaskCards with state/owner/cost), comment thread with reply input.
- src/shell/Canvas.tsx — two-lane layout: shaped (available) vs committed. BetCards per lane. Capacity indicator ("X/Y committed"). Drag support for moving bets between lanes.
- src/shell/Kanban.tsx — four columns mapping to task states (accepted → in_progress → review → done). Keyboard drag via Alt+Arrow. Each column has header with count. TaskCards are the items.
- src/shell/PitchSelector.tsx — filterable pitch list. Each PitchCard shows title, appetite KeyValue, StatusChip, hypothesis. Select/deselect interaction. Close button returns to Kanban.
- src/components/BetCard.tsx — product Tag + title + StatusChip + progress bar (done/total) + appetite label + owner avatar
- src/components/TaskCard.tsx — title + StatusChip + optional bet Tag + owner + cost. Lightweight card.
- src/components/PitchCard.tsx — title + appetite KeyValue + StatusChip + hypothesis text. Selectable with visual selected state.

STRUCTURED COMPARISON:

1. PORTFOLIO OVERVIEW — This is the landing page. How does each version display 4 products at a glance? Version B has product cards with status, active bets, velocity sparklines, cycle management. Which is more scannable for a "15-second morning check"?

2. CANVAS — Version B splits into two lanes: shaped (available pitches to consider) and committed (bets in progress). Capacity indicator shows "X/Y committed." The "+" interaction opens PitchSelector. Compare: which version makes the Shape Up betting metaphor clearer? Is the capacity constraint visually obvious?

3. KANBAN — Version B has 4 columns mapping to task states (accepted → in_progress → review → done). Tasks are draggable via keyboard (Alt+Arrow). Each TaskCard shows owner, cost, bet Tag. Compare column headers, card density, blocked-task treatment.

4. PITCHSELECTOR — Version B shows as an overlay list when "+" is clicked, with PitchCards that are selectable. Compare: does it feel like browsing a menu of options to bet on? Is the commit action clear?

5. BET DETAIL — Version B shows bet header + pitch body (rendered markdown) + task table + comment thread. This is a drill-down page. Compare information density and the flow from "scan" to "understand" to "act."

6. BETCARD vs TASKCARD — These are the two most seen cards. Version B's BetCard is heavier (progress bar, appetite, product Tag) while TaskCard is lighter (just status + owner + cost). Is the visual weight difference right? BetCards are 1-6 week commitments; TaskCards are atomic work units.

7. STATE TRANSITIONS — Version B maps task states through COLUMN_TO_STATE for keyboard drag. Canvas has shaped↔committed. Are the state changes visually clear? Can you tell at a glance what state everything is in?

SYNTHESIS DELIVERABLES:
1. Final Portfolio Overview with 4 product cards + cycle management
2. Final Team View: Canvas (3 committed bets, capacity 3/4) + Kanban (tasks spread across 4 columns, at least one blocked)
3. Final PitchSelector overlay (replacing Kanban area): 4 pitches, one expanded showing full pitch body
4. Final Bet Detail: full pitch + task table + comment thread
5. For each: what was improved from Version A and what was kept from Version B

DESIGN CRITIQUE — after the synthesis, write a "Critique & Open Questions" section:
- Canvas at scale: what happens with 6+ committed bets? Does the layout scroll, wrap, paginate? What about products with zero bets?
- Kanban density: when a single bet has 15+ tasks, does the board become unusable? Should there be a collapsed/summarized mode?
- PitchSelector to Kanban transition: is the swap (overlay replaces Kanban) disorienting? Would animation help or is it unnecessary chrome?
- Cycle transitions: what does "Advance Cycle" actually look like? Where do shipped bets go? How are expired pitches handled visually?
- Drag interactions: keyboard drag (Alt+Arrow) is implemented but is the discoverability sufficient? Do touch/mouse drag and keyboard drag feel equivalent?
- Portfolio Overview: is the cycle management card pulling too much attention from the product cards? Should it be secondary?
- BetCard progress bar: is a thin bar enough to communicate "week 4 of 6, 60% tasks done"? Or does it need more resolution?
- 3-5 open questions for future exploration.
Label each: 🔴 must resolve before shipping, 🟡 resolve during build, 🟢 explore later.

CHANGE GUIDE — produce an "Implementation Delta" section:
- For each component/region that changes from Version B, list: WHAT changed, WHY, WHERE (file path).
- Group by: Portfolio page, Canvas region, Kanban region, PitchSelector region, BetCard/TaskCard/PitchCard components, Bet Detail page.
- Tag each: [VISUAL], [STRUCTURAL], or [NEW].
- Explicitly mark unchanged components as "NO CHANGE."
```

---

## Prompt R2-4: Knowledge View Synthesis

```
Synthesize the two versions of the Knowledge view into one final design.

VERSION A: Your fresh Knowledge design.
VERSION B: The implemented code in web/ — specifically:
- src/pages/KnowledgeList.tsx — flat list of KnowledgeRows with loading/error/empty states. Mock data with 5 items across layers L0-L2, kinds (decision, pattern, brief, principle, reflection), statuses (active, stale, provisional). Simple header + list, no grouping or filtering yet.
- src/pages/KnowledgeDetail.tsx — detail page with: breadcrumb, editable title, metadata bar (kind/status/layer Tags, confidence bar, timestamps, origin agent), action bar (flag/archive/move buttons), rendered markdown body with inline edit mode + toolbar, observation logs (collapsible, read-only facilitator comments), related items sidebar, edit history timeline.
- src/components/KnowledgeRow.tsx — title + layer Tag + kind Tag (using shared KnowledgeKind type: pattern, anti_pattern, decision, failure, brief, principle, reflection, focus) + status indicator + timestamp. Clickable row.
- Submenu for Knowledge in AppShell.tsx: currently just a single "All Items" NavItem with count. No scope selector, no topic browser.
- Types from @hyperidle/shared: KnowledgeKind, KnowledgeLayer, KnowledgeStatus used across components.

IMPORTANT CONTEXT: Version B's Knowledge view is the LEAST complete part of the codebase. It has basic list + detail but is missing:
- Scope selector (Practice / Product / Factory)
- Topic grouping within scopes
- Curated vs Triage view switching
- Curation suggestion cards
- Merge/Split modals
- Knowledge gap indicators
- Attention scoring / sort by attention
- Edit history / version timeline

This means your Version A likely has MORE design surface here. The synthesis should heavily favor Version A's structure while keeping Version B's patterns (how it handles states, its use of DaisyUI classes, its component density, its typography).

STRUCTURED COMPARISON:

1. SCOPE BROWSER (SUBMENU) — Version A should have a full scope selector (Practice/Product/Factory) with topic lists. Version B's Submenu for Knowledge just has a single "All Items" NavItem. The synthesis needs the full scope browser. How should it look given the established Submenu patterns from Conversations and Work?

2. KNOWLEDGE LIST — Version B is a flat list of KnowledgeRows. Version A should have topic-grouped sections with collapsible headers. Compare: the flat list works for a few items but won't scale to 50+ items per practice. The grouped view with topic headers is necessary. Keep Version B's row component design but add Version A's grouping structure.

3. KIND + STATUS TAGS — Version B's KnowledgeRow shows layer and kind as Tags, plus a status indicator. The spec defines 8 kinds (pattern, anti_pattern, decision, failure, brief, principle, reflection, focus) and 5 statuses (captured, provisional, active, stale, archived) each with distinct visual treatment. Which version differentiates these better?

4. TRIAGE VIEW — Version A should have this, Version B doesn't. This is the founder's weekly curation to-do list. Items sorted by attention score, curation suggestion cards from facilitator agents. It should feel actionable — "here's what needs you this week."

5. KNOWLEDGE DETAIL — Version B has a detail page with metadata bar (kind/status/layer Tags, confidence, timestamps), action bar (flag/archive/move buttons), rendered markdown body, optional edit mode with toolbar, observation logs (collapsible), and related items sidebar. Compare with your Version A. Which handles the editorial workflow better?

6. FACTORY SCOPE — Very few items (5-15), the company constitution. These should feel visually different from the dense practice lists. More weight, more gravity. Neither version may handle this well yet. Propose a treatment.

7. MERGE/SPLIT FLOWS — Version A should have modals for these. They're essential for knowledge curation. The merge flow: pick target from same-topic list → preview combined result → confirm. The split flow: select text → promote to new item → auto-link both.

SYNTHESIS DELIVERABLES:
1. Final Knowledge list: Practice scope, "Building" practice, 3 topics expanded with KnowledgeRows showing kind and status Tags
2. Final Triage view: attention-scored items with a curation suggestion card
3. Final Knowledge detail: metadata bar, markdown body, observation logs, related items sidebar
4. Final Knowledge detail in edit mode
5. Final Factory scope view: the constitution items with appropriate visual weight
6. Final Merge modal
7. For each: what came from Version A (likely structure and missing features), what came from Version B (component patterns and density), and where you went beyond both

DESIGN CRITIQUE — after the synthesis, write a "Critique & Open Questions" section:
- Scope switching: does switching between Practice/Product/Factory feel like navigating within one view or like jumping to a different app? How do you maintain context?
- Topic management: topics are created/merged/split by facilitator agents AND manually by founders. Is the topic structure discoverable? Can founders easily reorder or rename topics?
- Triage vs Curated: will founders actually use both views, or will they default to one? Is the switch discoverable? Should triage be the default if items need attention?
- Attention scoring: the score drives triage ordering but is invisible to the user. Should there be a visible "why this needs attention" indicator? Or would that add noise?
- Inline editing: clicking markdown to edit is powerful but discoverable only by accident. How does the user know they can edit? What about accidental edits?
- Merge preview: combining two knowledge items is a destructive operation. Is the preview sufficient to catch errors? Should there be an undo?
- Factory scope weight: making constitutional items feel heavier risks making them feel like a different product. How much visual differentiation is enough without breaking coherence?
- Long-form content: some knowledge items are full architecture documents (2000+ words). Does the detail view handle scroll, outline navigation, and reading comfort?
- 3-5 open questions for future exploration.
Label each: 🔴 must resolve before shipping, 🟡 resolve during build, 🟢 explore later.

CHANGE GUIDE — produce an "Implementation Delta" section:
- For each component/region that changes from Version B, list: WHAT changed, WHY, WHERE (file path).
- Group by: Submenu/scope browser changes, KnowledgeList page changes, KnowledgeRow component changes, KnowledgeDetail page changes, New features (triage view, merge modal, split modal, curation suggestions, factory scope treatment).
- Tag each: [VISUAL], [STRUCTURAL], or [NEW].
- Mark unchanged components as "NO CHANGE."
- Note: since Version B's Knowledge view is the least complete, most items here will be [NEW] or [STRUCTURAL]. That's expected.
```

---

## Usage Notes

**Sequence:** Run R2-1 first (it establishes the merged design system). Then R2-2, R2-3, R2-4 in any order.

**Give Claude the codebase:** Before each prompt, make sure Claude Design has access to (or has been shown) the relevant source files from `web/src/`. The prompts reference specific files and patterns.

**Each prompt produces three outputs:**
1. **Final designs** — the synthesized visual deliverables
2. **Critique & Open Questions** — honest self-assessment with severity labels (🔴/🟡/🟢), areas to explore later, unresolved design tensions
3. **Implementation Delta** — a structured change guide mapping every difference from the current codebase, tagged [VISUAL]/[STRUCTURAL]/[NEW], grouped by file, with explicit "NO CHANGE" for components that stay as-is

**Between prompts:** Run an Opus design critique on each synthesis output before moving to the next section. The critique should stress-test: (a) is the synthesis genuinely better than either input? (b) does it still respect the 19-component cap and design system tokens? (c) are there regressions from Version B's already-working patterns? (d) do the open questions from the Critique section feel honest or are they hand-waving over real problems?

**After all 4 prompts:** Collect the 🔴 items from all Critique sections. Those are your pre-build blockers. Collect the Implementation Deltas into one master change list — that becomes the engineering brief for updating `web/`.
