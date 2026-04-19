# Adversarial Design Review: HyperIdle Factory Synthesis
## Comprehensive Critique of Design Synthesis Documents

**Review Date:** 2026-04-19  
**Reviewer Role:** Adversary (fault-finding focus)  
**Scope:** ShellSynthesis.html, ConversationSynthesis.html, WorkSynthesis.html, KnowledgeSynthesis.html vs. canonical docs (UI_DESIGN.md, HUMAN_INTERFACE_LAYER.md, INFORMATION_ARCHITECTURE.md)

---

## 1. CONTRADICTIONS WITH EXISTING DOCS

### ADV-01: Settings as a Drawer Contradicts Modal Architecture

**Severity:** 🔴 blocks implementation  
**Category:** contradiction  
**Finding:** ShellSynthesis §06 proposes Settings as a "right-side drawer (w-[420px]) that slides in, pushing the Rail out". This contradicts two existing patterns:

1. **SettingsPanel already exists as a modal.** The codebase has `SettingsPanel.tsx` which opens as an overlay modal. The synthesis proposes replacing this with a drawer that interacts with the Rail layout.
2. **The Rail is declared immutable.** HUMAN_INTERFACE_LAYER §3.5 states the Rail is "a persistent sidebar on the right side of the window — the mirror of the IconRail on the left" and "always present, on every screen." A drawer that "pushes the Rail out" violates this invariant.

**Evidence:**  
- ShellSynthesis §06: "Settings is configuration, not a destination. But modal is too disruptive. Target: right-side drawer (w-[420px]) that slides in, pushing the Rail out..."
- HUMAN_INTERFACE_LAYER §3.5: "It's a proper layout zone that's always present, on every screen, regardless of which view is active."
- Codebase: `/packages/web/src/components/SettingsPanel.tsx` exists as a modal.

**Recommendation:** Either (A) keep Settings as a modal overlay (simplest, preserves Rail invariant), or (B) redesign as an overlay sheet that doesn't displace the Rail. The drawer-that-pushes-out pattern introduces a third layout state (expanded Rail, collapsed Rail, Rail-displaced-by-Settings) that isn't modeled anywhere. If a drawer is truly needed, it must live *inside* the Rail footprint or *replace* the Rail temporarily (like PitchSelector replaces Kanban).

---

### ADV-02: PitchSelector Layout Contradiction

**Severity:** 🟡 needs resolution during build  
**Category:** contradiction  
**Finding:** WorkSynthesis §04 says PitchSelector should "inline it between Canvas and Kanban while open" — but this contradicts both UI_DESIGN.md and the existing implementation.

**Evidence:**
- WorkSynthesis §04: "Keep B's overlay list, but do NOT replace the Kanban — inline it between Canvas and Kanban while open."
- UI_DESIGN.md Tier 3, item 8: "PitchSelector — filter Tags + scrollable list of PitchCards... Overlay that replaces the Kanban."
- INFORMATION_ARCHITECTURE.md §3.3a: "[PitchSelector is] triggered by clicking the Add bet (+) button on the Canvas. Shows available shaped pitches..."

The synthesis tries to have both states simultaneously: "don't replace Kanban" but also "inline between Canvas and Kanban." This means three vertical sections visible at once (Canvas + PitchSelector + Kanban), which conflicts with the "one job per zone" discipline in UI_DESIGN.md's credo.

**Recommendation:** Decide: either (A) PitchSelector replaces Kanban completely (current design), or (B) PitchSelector opens as a modal/drawer overlay *over* the full Team View. Don't try both.

---

### ADV-03: Reasoning Block Naming Inconsistency

**Severity:** 🟡 needs resolution during build  
**Category:** contradiction  
**Finding:** ConversationSynthesis calls it "Reasoning" block (a new component). But HUMAN_INTERFACE_LAYER §2.2 already defines "Agent reasoning block" in ReviewHeader context, and INFORMATION_ARCHITECTURE.md §2.2 shows it as "Agent reasoning block" with a collapsible state.

The synthesis treats it as NEW but it's structurally already defined. The ambiguity: is this a separate Tier-2 component called "ReasoningBlock" or just part of the ReviewHeader/ArtifactView combo?

**Evidence:**
- ConversationSynthesis §05: "New block. Every review opens with a collapsible Reasoning panel..."
- HUMAN_INTERFACE_LAYER §2.2 & INFORMATION_ARCHITECTURE.md §2.2: "Agent reasoning block" + "Confidence indicator" already documented.
- Codebase: `Message.reasoning?: string[]` exists in data shape; `MessageBubble.tsx` doesn't render it.

**Recommendation:** Clarify: the Reasoning block is NOT new—it's a *rendering gap* in existing MessageBubble. Update the component tree comment in UI_DESIGN.md to note "ReviewHeader + ReasoningBlock + ArtifactView" as a composition, not "NEW component."

---

### ADV-04: "Reasoning" ≠ "Chief-of-Staff Chat Grouped Messages"

**Severity:** 🟡 needs resolution during build  
**Category:** contradiction  
**Finding:** ConversationSynthesis mentions "grouped-message threading in the Chief-of-Staff chat" as new. But this is a *presentation detail* of existing ThreadRow rendering, not a new component. The synthesis conflates two separate things:

1. **Reasoning on individual agent messages** (what ADV-03 describes)
2. **Grouped chat thread rendering** (conversation history layout)

**Evidence:**
- ConversationSynthesis overview: "the grouped-message threading in the Chief-of-Staff chat"
- HUMAN_INTERFACE_LAYER §4.1: Chief of Staff is "just a chat thread — pinned at the top"
- INFORMATION_ARCHITECTURE.md §2.5: Chat threads already have a "Message list" with chronological rendering.

**Recommendation:** The Chief of Staff chat uses the existing ChatThread rendering. No new component needed. If "grouped messages" means visual clustering by sender or time, that's a CSS detail in ThreadRow/MessageBubble, not a new Tier component.

---

### ADV-05: Factory Scope Serif Accent Contradicts Token System

**Severity:** 🟡 needs resolution during build  
**Category:** contradiction / scope-creep  
**Finding:** KnowledgeSynthesis §06 proposes Factory scope items get "larger row height + serif accent on titles." This breaks the token system defined in UI_DESIGN.md and ShellSynthesis §01.

**Evidence:**
- KnowledgeSynthesis §06: "Factory items get... (b) larger row height + serif accent on titles"
- UI_DESIGN.md: "Theme in one place. All colour, radius, spacing changes happen in the factory-dark theme. Never in a component."
- ShellSynthesis §01 tokens: No serif variant defined. Only Inter (UI) and Space Grotesk (data) fonts are available.

**Recommendation:** Either (A) add a serif variant to the token system (in tailwind.config.ts) as a factory-scoped override, or (B) drop the serif accent and rely on density changes only (larger row height, different spacing). Option B is simpler and aligns with "no borders, tonal layering only" discipline.

---

## 2. COMPONENT BUDGET VIOLATIONS

### ADV-06: Unacknowledged New Tier-2 Component: ReasoningBlock

**Severity:** 🟡 needs resolution during build  
**Category:** budget  
**Finding:** The synthesis introduces a standalone "Reasoning" block that must be rendered in ReviewHeader context. UI_DESIGN.md lists 6 Tier-2 blocks; this makes 7. The budget says "19 custom components for the entire app" — we're at:

- Tier 1: 5 (StatusChip, Tag, KeyValue, NavItem, SearchField)
- Tier 2: 6 (ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow) + **ReasoningBlock = 7**
- Tier 3: 8
- Tier 4: 9

That's 29, not 19.

**Evidence:**
- UI_DESIGN.md: "Five only" for Tier 1, "Six. Each maps to a concrete recurring need" for Tier 2, "19 custom components for the entire app."
- ConversationSynthesis: treats Reasoning as a first-class block to surface before every artifact.

**Recommendation:** Either (A) acknowledge that ReasoningBlock is a new Tier-2 component and update the budget to 20, or (B) compose Reasoning *inside* ReviewHeader instead of as a separate component. Option B is tighter—ReviewHeader becomes "proposer identity + reasoning collapsible + verdict actions."

---

### ADV-07: CurationCard — New Tier-2 Component Not Budgeted

**Severity:** 🟡 needs resolution during build  
**Category:** budget  
**Finding:** KnowledgeSynthesis §04 introduces "Curation suggestions are first-class CurationCard components, not just row variants." This is a new Tier-2 block (appears on the Knowledge list page), but it's not listed in UI_DESIGN.md's 6 blocks.

**Evidence:**
- KnowledgeSynthesis §04: "Curation suggestions are first-class CurationCard components, not just row variants."
- UI_DESIGN.md Tier 2: Lists ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow. No CurationCard.
- KnowledgeSynthesis §02: "Triage is a sibling route to Curated, toggled via a 2-tab switcher... Curation suggestions are first-class CurationCard..."

**Recommendation:** Add CurationCard to the Tier-2 list, or prove it's a variant of KnowledgeRow. If it has a different structure (e.g., "merge these 3?" as an action card vs. a passive row), it's a new component and the budget must expand to 20+.

---

### ADV-08: KnowledgeGroup — New Tier-2 Component Not Budgeted

**Severity:** 🟡 needs resolution during build  
**Category:** budget  
**Finding:** KnowledgeSynthesis §02 introduces "KnowledgeGroup that renders the topic header + collapse affordance + count + stale indicator." This is explicitly a new wrapping component, not in the budget.

**Evidence:**
- KnowledgeSynthesis §02: "Wrap it in a new KnowledgeGroup that renders the topic header + collapse affordance + count + stale indicator."
- UI_DESIGN.md Tier 2: No mention of KnowledgeGroup. Lists row-level components only.

**Recommendation:** KnowledgeGroup should be acknowledged as a Tier-2 block. Or rename it to "KnowledgeSection" (a Tier-3 region that composes KnowledgeRows) and move it up a tier. Either way, the budget needs updating.

---

### ADV-09: Multiple Underspecified Modal/Drawer Components

**Severity:** 🟡 needs resolution during build  
**Category:** budget  
**Finding:** Synthesis introduces multiple overlays without clear Tier placement:
- Merge modal (KnowledgeSynthesis §06, mentioned but not fully specified)
- Settings drawer (ShellSynthesis §06)
- PitchSelector detail pane (WorkSynthesis §04)

UI_DESIGN.md lists PitchSelector but not the others. Are these Tier-3 regions or compositions of Tier-2 blocks?

**Evidence:**
- KnowledgeSynthesis §02: "Merge modal" mentioned in tab nav but content not detailed.
- ShellSynthesis: Settings drawer is a new layout zone.
- WorkSynthesis §04: PitchSelector "expanded detail pane" is new.

**Recommendation:** For each overlay, define: (A) is it a Tier-3 region or a DaisyUI `modal`/`drawer` directly? (B) what Tier-1/2 components does it compose? (C) when does it open/close? This is currently vague.

---

## 3. UNDERSPECIFIED INTERACTIONS

### ADV-10: Settings Drawer Open/Close State — Not Specified

**Severity:** 🔴 blocks implementation  
**Category:** interaction  
**Finding:** ShellSynthesis §06 says "Closes on Esc or outside-click" for Settings drawer, and "the useCommandK pattern already models this." But there's no specification for:

1. **What is the enter state?** Avatar click (existing)? Or a new ⚙️ icon in the IconRail?
2. **Keyboard navigation inside the drawer.** Tab order? Trap focus?
3. **Stacking order.** If a Settings drawer opens and the user presses ⌘K, what happens? Does CommandK close the drawer or open on top?
4. **Mobile behavior.** Settings as a drawer on desktop works; on mobile (per HUMAN_INTERFACE_LAYER), Settings isn't even a mobile view. How does this interact with the mobile shell?

**Evidence:**
- ShellSynthesis §06: "Closes on Esc or outside-click — the useCommandK pattern already models this." But useCommandK is for GlobalSearchPanel, not Settings.
- HUMAN_INTERFACE_LAYER §3.2: No mention of Settings on mobile. Settings is desktop-only.
- INFORMATION_ARCHITECTURE.md §1.5: Settings is accessed "via user avatar" — click the avatar. No mention of a drawer that "pushes the Rail out."

**Recommendation:** Specify: (1) Avatar-click opens drawer, (2) focus trap inside drawer, (3) Esc/outside-click closes, (4) ⌘K from inside drawer closes drawer first, then opens search (or search doesn't work while settings is open). (5) Mobile: Settings is a dedicated Settings view, not a drawer — or it doesn't exist on mobile. Choose.

---

### ADV-11: PitchSelector — Multiple Unspecified States

**Severity:** 🟡 needs resolution during build  
**Category:** interaction  
**Finding:** WorkSynthesis §04 proposes a detail pane inside PitchSelector that shows pitch body before committing. But the interaction is underspecified:

1. **Click a pitch → detail pane appears.** Is the main list still visible, or does it slide left?
2. **What if the user clicks another pitch while a detail pane is open?** Swap the detail pane? Or close it?
3. **"Add to canvas" button.** Is it on the pitch row, or only visible in the detail pane?
4. **Closing the selector.** Close button, Esc, or just click outside? The synthesis doesn't say.

**Evidence:**
- WorkSynthesis §04: "Add an expanded detail pane when one pitch is selected, showing the full pitch body (problem / appetite / solution / rabbit holes) before committing."
- UI_DESIGN.md: "PitchSelector — filter Tags + scrollable list of PitchCards + 'Add to canvas' action. Overlay that replaces the Kanban." No detail pane.

**Recommendation:** Specify the full interaction: (1) PitchSelector is a modal overlay over the full Team View, (2) click a pitch → slide to detail pane (or open detail as a side panel if room), (3) "Add to canvas" is only in detail pane or visible on list row (choose one), (4) Esc or X button closes the entire selector, (5) once added, selector closes automatically.

---

### ADV-12: Knowledge Triage Tab Switcher — Underspecified

**Severity:** 🟡 needs resolution during build  
**Category:** interaction  
**Finding:** KnowledgeSynthesis §04 proposes a Triage/Curated tab switcher but doesn't specify:

1. **Location.** Is it in the Submenu or above the list in Main?
2. **Persistence.** Which tab is the default? "Default to Triage when any items have status === 'needs_human'."  But what about on subsequent page visits? Does it remember the user's last choice?
3. **Filter interaction.** If the user is on Curated and clicks a Triage-only filter, what happens?
4. **Count display.** Do both tabs show counts (e.g., "Triage (5) | Curated (23)")?

**Evidence:**
- KnowledgeSynthesis §04: "Triage is a sibling route to Curated, toggled via a 2-tab switcher on the list page. Default to Triage when any items have status === 'needs_human'."
- No existing Triage view in the codebase.

**Recommendation:** Specify: (1) Tabs live above the list, in the Main pane header, (2) default to Triage if any items have needs_human, else Curated, (3) remember user's choice in localStorage, (4) switching tabs resets filters, (5) both tabs show count bubbles.

---

### ADV-13: Inline Comment Anchoring in text_diff — Underspecified

**Severity:** 🟡 needs resolution during build  
**Category:** interaction  
**Finding:** ConversationSynthesis §02 mentions "inline comment anchoring in text_diff" as new, but there's no spec for:

1. **How does the anchor work?** Click a line → comment opens? Or is there a comment icon?
2. **Threading.** Can there be multiple comments on one line?
3. **Editing.** Can the user edit a comment after posting?
4. **Resolution.** Can the agent resolve an inline comment, or does it just stay?
5. **Context.** If the diff changes between iterations, do old inline comments follow the line or stay anchored to the original line number?

**Evidence:**
- ConversationSynthesis overview: "the inline comment anchoring in text_diff"
- HUMAN_INTERFACE_LAYER §2.2: "Inline comment input on specific artifact parts (diff lines, paragraphs, plan steps)"
- No detailed UX spec for diff inline comments.

**Recommendation:** Specify: (1) Hover line → comment icon appears, click to open inline comment box, (2) multiple comments per line allowed, threaded, (3) human can edit/delete own comments, agent can resolve theirs, (4) comments are anchored by line number; if the diff changes, old comments show a warning "original line 42, now line 38" and user can re-anchor or delete.

---

### ADV-14: Factory Knowledge Item Version Pill — Underspecified

**Severity:** 🟡 needs resolution during build  
**Category:** interaction  
**Finding:** KnowledgeSynthesis §06 proposes "a version pill on every row" for Factory scope items, but there's no spec for:

1. **What does the pill show?** "v1.2"? "Rev 3"? A timestamp?
2. **Is it clickable?** Does it open a version history?
3. **How does editing work?** "No inline edit — changes go through a pull-request-style review." But how does the user propose a change? A button? A context menu?
4. **Approval workflow.** After proposing a change, who approves? The Chief of Staff? A named reviewer?

**Evidence:**
- KnowledgeSynthesis §06: "a version pill on every row... no inline edit — changes go through a pull-request-style review"

**Recommendation:** Specify: (1) version pill shows semantic version (e.g., "v2.1") or revision count, (2) clicking opens a version history timeline, (3) "Edit" button on Factory items opens a diff view (not inline edit), (4) "Propose change" shows a modal with before/after diffs, routes to a Conversations review thread for approval, (5) once approved, the item updates and version increments.

---

### ADV-15: Knowledge Attention Reason Line — Underspecified

**Severity:** 🟡 needs resolution during build  
**Category:** interaction  
**Finding:** KnowledgeSynthesis §07 introduces "a one-line reason under the title... 'Why now'" but doesn't specify:

1. **Truncation.** If the reason is long, does it wrap or ellipse?
2. **Interactivity.** Is it clickable? Does it explain the scoring?
3. **Localization.** Are reasons hardcoded or generated by a rule engine?
4. **Guidance.** Where does the format come from? Example: "'3 new observations since review'" — is this template-based?

**Evidence:**
- KnowledgeSynthesis §07: "Every Triage row gets a one-line reason under the title ('3 new observations since review' / 'contradicted by kb-c1' / 'unused for 2 cycles'). This IS the attention model made legible."

**Recommendation:** Specify: (1) reasons are max 60 characters, truncate with ellipsis if longer, (2) reasons are not clickable (they're explanatory, not actionable), (3) reasons are generated by the attention-scoring backend, returned in the API, (4) use template format: "{count} {event_type} since {reference_date}" (e.g., "3 new observations since 2026-04-15").

---

## 4. SCOPE CREEP RED FLAGS

### ADV-16: Settings Drawer Is a New Interaction Pattern (Cost Not Modeled)

**Severity:** 🟡 needs resolution during build  
**Category:** scope-creep  
**Finding:** ShellSynthesis proposes a drawer that "pushes the Rail out" as a novel layout pattern. This is expensive:

1. **Layout coordination.** The Rail is a fixed layout zone on every page. A drawer that displaces it requires coordination across multiple zones (IconRail, Submenu, Main, Rail all need to know about the drawer state).
2. **Responsive rework.** The existing breakpoint system (`useViewportBreakpoint`) manages Rail collapse/expansion. A drawer adds a third state. On mobile, is the drawer full-width? Does it replace the entire view?
3. **Animation complexity.** The drawer must slide in, push the Rail, animate both. This is more complex than a modal overlay.

**Evidence:**
- ShellSynthesis §06: "right-side drawer (w-[420px]) that slides in, pushing the Rail out and leaving the Submenu + Main visible."
- Current pattern: `AppShell.tsx` uses a fixed `Rail` component that doesn't change width mid-interaction.
- Codebase: `useViewportBreakpoint` handles Rail state; no drawer pattern exists.

**Recommendation:** Reassess the cost. A modal overlay is simpler:
- Modal doesn't require coordinating all four shell zones.
- Responsive behavior is clear: modal is always full-viewport on mobile.
- Animation is simpler (overlay fade-in vs. rail-resize + drawer-slide).

Unless there's a strong UX reason for the drawer (e.g., Settings are frequently toggled while scanning conversations), use a modal and accept that it's "disruptive." The synthesis says modal is "too disruptive," but offers no evidence. Test it first.

---

### ADV-17: Knowledge Merge Modal — Mentioned but Not Designed

**Severity:** 🟡 needs resolution during build  
**Category:** scope-creep  
**Finding:** KnowledgeSynthesis mentions "merge modal" in the tab nav but provides no design, spec, or interaction detail. This is a placeholder, not a commitment, yet it's presented as part of the synthesis.

**Evidence:**
- KnowledgeSynthesis nav: "button class='synth-nav-tab' data-tab='k6'>06 Merge modal"
- No content provided for k6 slot.

**Recommendation:** Either (A) complete the merge modal design before shipping the synthesis, or (B) remove the tab and defer merge to a later phase. Don't ship incomplete designs in the synthesis document.

---

### ADV-18: "Reasoning Block" Conflates Two Features

**Severity:** 🟡 needs resolution during build  
**Category:** scope-creep  
**Finding:** The Reasoning block in ConversationSynthesis tries to do too much:

1. **Show the agent's reasoning steps.** Render `reasoning[]` as a numbered list.
2. **Show a confidence indicator.** HUMAN_INTERFACE_LAYER mentions "Confidence indicator (e.g., 'High confidence' / '62% confident')."

These are separate concerns. Combining them into one Reasoning block makes it harder to reuse. If the agent has no steps but high confidence, what renders? If there are steps but no confidence score, does it look broken?

**Evidence:**
- ConversationSynthesis §05: "Every review opens with a collapsible Reasoning panel listing the numbered steps from reasoning[]."
- HUMAN_INTERFACE_LAYER §2.2: "Agent reasoning block ... Confidence indicator (e.g., 'High confidence' / '62% confident')."

**Recommendation:** Split concerns: (1) ReasoningBlock renders reasoning steps only, (2) ConfidenceIndicator is a separate Tier-1 primitive (or a variant of Tag). ReviewHeader can compose both: "ReviewHeader → [ConfidenceIndicator] → ReasoningBlock → ArtifactView."

---

### ADV-19: Factory Knowledge Items Add "Seq Variant" — Density Tax Not Modeled

**Severity:** 🟡 needs resolution during build  
**Category:** scope-creep  
**Finding:** KnowledgeSynthesis §06 proposes Factory items get "larger row height + serif accent on titles" as a visual distinction. But this adds complexity:

1. **KnowledgeRow has two sizes now.** Tier-2 component becomes polymorphic (Practice size vs. Factory size).
2. **Serif font requires a new token.** Today: only Inter (UI) and Space Grotesk (data). Adding a serif variant breaks the token simplicity.
3. **Copy/paste debt.** Rendering Factory items requires custom code separate from Practice items, even though they're the same component.

**Evidence:**
- KnowledgeSynthesis §06: "Factory items get... larger row height + serif accent on titles"
- UI_DESIGN.md: "Theme in one place. All colour, radius, spacing changes happen in the factory-dark theme."

**Recommendation:** Use density/spacing only, no serif. Keep KnowledgeRow polymorphic on scope (render `scope: 'factory' | 'practice'`) but use only spacing tokens, not new fonts. Example: Factory rows get `py-4` (vs. Practice `py-2`), that's it.

---

### ADV-20: "Amendable Under Review" Banner — New Ui Pattern

**Severity:** 🟡 needs resolution during build  
**Category:** scope-creep  
**Finding:** KnowledgeSynthesis §06 proposes an "Amendable under review" banner on Factory items. This is a new UI pattern not in the design system:

1. **Where does it appear?** On every row? Only on edited items? Only in the detail view?
2. **Is it a banner (top of page), a badge (inline), or something else?**
3. **How does it interact with the version pill?** "v2.1" + "under review" — is that redundant?
4. **Can the user dismiss it?** Or is it always visible while under review?

**Evidence:**
- KnowledgeSynthesis §06: "Factory items get (a) a permanent 'Amendable under review' banner"
- UI_DESIGN.md lists no "banner" pattern. Alert is available (DaisyUI), but no factory-specific variant.

**Recommendation:** Use a DaisyUI `alert` with `alert-info` (neutral, not warning). Show only when `status === 'needs_human'` and `scope === 'factory'`. Place it above the row in list context, or above the title in detail context. No dismiss — it's informational.

---

## 5. EFFORT TRAPS

### ADV-21: "2px Left-Edge Rail Indicator" Costs More Than It Looks

**Severity:** 🟡 needs resolution during build  
**Category:** effort-trap  
**Finding:** ShellSynthesis §02 proposes adopting "the 2px left-edge active indicator on IconRail items." This looks trivial but requires:

1. **Layout rework.** NavItem (used in IconRail, Submenu, and Rail) currently uses daisyUI button classes. Adding a 2px left bar means custom padding + custom border, or repositioning content.
2. **Responsive behavior.** On collapsed Rail (56px wide), does the 2px bar stay? If Rail is 56px and the bar is 2px, that leaves 54px for icon + padding. Tight.
3. **Test coverage.** Every NavItem variant (active, hover, disabled) needs the bar correctly positioned.

**Evidence:**
- ShellSynthesis §02: "Adopt the 2px edge-rail and the unread dot — these map directly to real product signal"
- UI_DESIGN.md Tier 1 NavItem: "a menu li<a> restyled with Icon + Text + optional count badge, with a selected state (surface-4 fill + 2 px primary left bar)."
- Codebase: NavItem.tsx exists but doesn't render the 2px bar.

**Recommendation:** This is already documented in UI_DESIGN.md but not implemented. Mark it as a **known debt**: "NavItem.selected state must include 2px left bar; test on all breakpoints and states."

---

### ADV-22: "Unread Dot" on Collapsed Rail Items — Small Change, Big Footprint

**Severity:** 🟡 needs resolution during build  
**Category:** effort-trap  
**Finding:** ShellSynthesis proposes "6px notification dot for inactive views with unread" on the IconRail. This requires:

1. **New data shape.** IconRail icons need an `unreadCount` or `hasUnread` flag. Where does this come from? The Rail already tracks unread in the expanded state; does IconRail have its own subscription?
2. **Positioning.** A 6px dot on a 40×40 icon button leaves little room. Where's the dot placed? Top-right corner? Overlays the icon? Needs precise spec.
3. **Animation.** Does the dot appear/disappear smoothly, or pop? If the user clicks the Conversations icon to see a thread, the dot should disappear. That's a state update.
4. **Accessibility.** A red dot is not semantic. ARIA label: "5 unread conversations"? Or is the dot purely decorative?

**Evidence:**
- ShellSynthesis §02: "Also shows a 6px notification dot for inactive views with unread."
- Current IconRail.tsx: NavItems for each view, no unread indicator.

**Recommendation:** This is scope creep on the IconRail. The Rail already shows unread counts (expanded). Is the dot redundant? If not, spec it clearly: (1) placement (top-right corner, 6px diameter), (2) color (error red, not amber), (3) data flow (pulled from the same source as Rail unreadCount), (4) ARIA label ("N unread conversations").

---

### ADV-23: "Collapsed Rail with Three Semantic Pills" — Layout Math Doesn't Work

**Severity:** 🔴 blocks implementation  
**Category:** effort-trap  
**Finding:** ShellSynthesis §03 proposes a collapsed Rail (56px wide) showing "three semantic pills — BLK (error), REV (primary), PSD (neutral) — plus a click-to-expand chevron." The math:

- Rail width: 56px
- Three pills (let's say 24px each) + chevron (16px) = 88px
- But the pills are *stacked vertically*, so width isn't the issue. **Height is.** Three pills + chevron + padding = ~120px minimum.
- Typical desktop window height: 800–1200px. A 120px + padding widget on a 56px rail is reasonable, but it must scroll or the pills must shrink.

**Evidence:**
- ShellSynthesis §03: "Three semantic pills — BLK (error), REV (primary), PSD (neutral) — plus a click-to-expand chevron."
- Current Rail.tsx: collapsed state shows two badges (bet count + blocker count), not three pills.

**Recommendation:** (A) Mockup the collapsed Rail with actual typography and spacing to prove it fits. (B) If it doesn't fit without scrolling, cut it back to two pills (BLK + REV; drop PSD) or redesign as a stacked icon layout (not pills). (C) Spec what "click-to-expand" does — does it expand the Rail to full width, or open an overflow menu?

---

### ADV-24: Inline Edit Toggle on Knowledge Detail — Missing State Spec

**Severity:** 🟡 needs resolution during build  
**Category:** effort-trap  
**Finding:** KnowledgeSynthesis §05 proposes "Edit mode is a state toggle on the same page, not a separate route." This requires:

1. **Two render paths.** KnowledgeDetail renders either a read view or an edit view. Both must be tested independently.
2. **Conflict with Factory items.** Factory items "No inline edit — changes go through pull-request review." So KnowledgeDetail.tsx needs to check `scope` and conditionally disable edit mode.
3. **Unsaved state.** If the user is in edit mode and navigates away, what happens? Lose changes? Prompt to save?
4. **Concurrent edits.** If two users edit the same knowledge item, one locally (Practice) and one via PR (Factory), how are conflicts resolved?

**Evidence:**
- KnowledgeSynthesis §05: "Edit mode is a state toggle on the same page, not a separate route."
- KnowledgeSynthesis §06: "Factory items... no inline edit"

**Recommendation:** Spec the edit toggle fully: (1) LocalStorage or state variable tracks editMode: boolean, (2) edit mode only available if `scope !== 'factory'`, (3) unsaved changes stay in React state; no persistence until Save button clicked, (4) Save calls PATCH /knowledge/:id, updates the item, resets editMode to false, (5) if the item changes server-side while user is editing, show a conflict banner and offer "reload" or "keep editing."

---

## 6. CROSS-DOCUMENT CONTRADICTIONS

### ADV-25: "Artifact Kind" as a Visual Treatment vs. Data Shape

**Severity:** 🟡 needs resolution during build  
**Category:** contradiction  
**Finding:** ConversationSynthesis and INFORMATION_ARCHITECTURE.md describe "artifact kind" (text_diff, content_preview, visual_comparison, action_summary, data_metrics) as a data field that determines rendering. But the synthesisintroduces a "kind-badge chip" as a visual element on every review.

1. **Who provides the kind?** The agent or the system?
2. **Can it be wrong?** If the agent marks something as text_diff but it's actually action_summary, what happens?
3. **Is the kind badge decorative or actionable?** Can the user change it?

**Evidence:**
- ConversationSynthesis §01: "the kind-badge chip"
- INFORMATION_ARCHITECTURE.md §2.3: "Each review thread carries exactly one ArtifactView shape... The agent specifies the artifact shape when creating a review item via the proposed_action.type field."

**Recommendation:** Spec: (1) kind is a data field provided by the agent (via proposed_action.type), (2) the kind badge is non-interactive (read-only label), (3) system validates the kind matches the artifact data before rendering (fail loud if mismatch), (4) kind badge is small, mono, placed above or next to the artifact title.

---

### ADV-26: "Inline Comments" on Multiple Artifact Kinds — Spec Per Kind

**Severity:** 🟡 needs resolution during build  
**Category:** contradiction  
**Finding:** ConversationSynthesis mentions "inline comments" apply to multiple artifact kinds (text_diff, content_preview, visual_comparison, etc.) but the mechanism differs per kind:

1. **text_diff:** Comments anchor to a line number. Clear.
2. **content_preview:** Comments anchor to a paragraph. How is a paragraph identified? By text content? By DOM position?
3. **visual_comparison:** Comments anchor to a region. How are regions defined? Can the user draw a region, or click predefined zones?
4. **action_summary:** "Thread-level, potentially with region annotation." What's a region here? A step in the action list?

**Evidence:**
- INFORMATION_ARCHITECTURE.md §2.3: Different anchor mechanisms per kind (line, paragraph, region, proposal-level).

**Recommendation:** For each artifact kind, spec the inline comment anchor:
- **text_diff:** Line number (absolute, not affected by future edits that shift lines).
- **content_preview:** Paragraph by index (1st para, 2nd para, etc.), not by content hash (content can change).
- **visual_comparison:** Annotation overlay (user clicks to place a marker, then types comment).
- **action_summary:** Comments are thread-level only; no inline regions.
- **data_metrics:** Comments attach to specific recommendations (by index or by recommendation text fragment).

---

### ADV-27: Verdict Keyboard Shortcuts — Not Specified

**Severity:** 🟡 needs resolution during build  
**Category:** underspecified interaction  
**Finding:** ConversationSynthesis mentions "keyboard-shortcut overlays on verdict buttons" but doesn't define the shortcuts. HUMAN_INTERFACE_LAYER §4.1 hints at them:

- approve = ? (A?)
- request changes = ? (R?)
- reject = ? (X?)

But there's no full spec, and no mention of conflicts with OS-level or browser-level shortcuts.

**Evidence:**
- ConversationSynthesis §01: "the keyboard-shortcut overlays on verdict buttons"
- HUMAN_INTERFACE_LAYER §4.1: "use keyboard shortcuts (A, R, X, S)."

**Recommendation:** Confirm the shortcuts: A=Approve, R=Request Changes, X=Reject, S=Snooze. Test for conflicts with:
- Browser shortcuts (Cmd+A = select all, Cmd+R = reload, etc.)
- OS shortcuts (Cmd+X = cut, etc.)
- Accessibility tools (screen reader shortcuts)
If conflicts exist, reassign. Doc in a `KeyboardShortcuts.ts` constant file.

---

## 7. WHAT'S GOOD

### ADV-28: Section Ordering in Conversations List (Pinned → Blocking → Reviews → Chats → Resolved)

**Severity:** 🟢 minor / explore later  
**Category:** positive  
**Finding:** ConversationSynthesis's adoption of "attention economy beats taxonomy" is excellent. Organizing by blocking status, not kind, means the most urgent items float to the top naturally.

**Evidence:**
- ConversationSynthesis §01: "Adopt A's section ordering — Pinned first, then Blocking (all kinds), then Reviews, then Chats, then Resolved 24h. Blocking outranks kind because attention economy beats taxonomy."

**Recommendation:** This is the right call. Implement it. Add a test that verifies blocking reviews appear before non-blocking reviews, regardless of kind.

---

### ADV-29: Two-Lane Canvas (Shaped vs. Committed) — Correct Shape Up Interpretation

**Severity:** 🟢 minor / explore later  
**Category:** positive  
**Finding:** WorkSynthesis correctly rejects a four-lane Kanban and keeps the two-lane Canvas (Shaped + Committed). This is faithful to Shape Up methodology.

**Evidence:**
- WorkSynthesis §02: "Two lanes IS the Shape Up metaphor — the 'bet' is the decision to commit capacity."

**Recommendation:** Protect this in tests. Verify Canvas always has exactly two lanes, that Kanban is separate (four columns), and that PitchSelector feeds into the Shaped lane.

---

### ADV-30: "Show the Reason, Hide the Score" for Knowledge Triage Attention

**Severity:** 🟢 minor / explore later  
**Category:** positive  
**Finding:** KnowledgeSynthesis §07's decision to surface the *reason* for attention (e.g., "3 new observations since review") rather than a raw score is sensible UX. It makes the scoring logic legible to humans.

**Evidence:**
- KnowledgeSynthesis §07: "Show the reason, hide the score... Every Triage row gets a one-line reason under the title."

**Recommendation:** This is good. Document it: the attention scoring algorithm exists, but the UI surfaces reasons, not scores.

---

### ADV-31: Proposer-Led Review Header

**Severity:** 🟢 minor / explore later  
**Category:** positive  
**Finding:** ConversationSynthesis's choice to lead the review header with the proposer (agent identity, role) rather than the artifact title is correct for a multi-agent system. The "who?" is more important than the "what?" when context switches between agents.

**Evidence:**
- ConversationSynthesis §03: "Proposer-led: agent avatar + name + role on the left... in a multi-agent system the 'who' is more informative than the 'what.'"

**Recommendation:** Keep this. Test that ReviewHeader always leads with proposer identity, not artifact title.

---

### ADV-32: Blocked = Warning (Amber), Not Error (Red) — Consistent Across Domains

**Severity:** 🟢 minor / explore later  
**Category:** positive  
**Finding:** Both ConversationSynthesis and WorkSynthesis correctly reaffirm that `blocked = warning (amber)`, not `error = red`. This is consistent semantics across the app.

**Evidence:**
- ConversationSynthesis §02: "B wins. Red is reserved for error. Blocked = amber."
- WorkSynthesis §07: "Preserve amber for blocked everywhere."

**Recommendation:** Add a linter rule or test that flags any StatusChip color assignment that maps `blocked` to `error` (red). This should never happen.

---

### ADV-33: No Serif Font Variant (Factory Items Use Density, Not Typography)

**Severity:** 🟢 minor / explore later  
**Category:** positive  
**Finding:** Recommendation ADV-05 correctly identifies that serif fonts break the token system. Density changes (spacing) are a better lever.

**Recommendation:** This is a good catch. Don't add serif. Use spacing tokens only.

---

## 8. MISSING SPECS

### ADV-34: Mobile PitchSelector — Not Specified

**Severity:** 🟡 needs resolution during build  
**Category:** underspecified interaction  
**Finding:** WorkSynthesis and INFORMATION_ARCHITECTURE.md describe PitchSelector as an overlay in the Team View. But there's no spec for mobile. Is PitchSelector available on mobile Work view? Or only on desktop?

**Evidence:**
- HUMAN_INTERFACE_LAYER §3.2: "Mobile: ... Work. A read-only view of active bets and tasks with nudge-up/nudge-down ordering. On mobile you can reorder and react, not reshape."
- WorkSynthesis: "PitchSelector" doesn't mention mobile.

**Recommendation:** Clarify: (A) PitchSelector is desktop-only, and adding a new bet on mobile is not supported, or (B) PitchSelector on mobile is a bottom sheet overlay. Recommend (A) — "shape bets on desktop" is a reasonable constraint.

---

### ADV-35: Knowledge Scope Switching — URL or UI Component?

**Severity:** 🟡 needs resolution during build  
**Category:** underspecified interaction  
**Finding:** KnowledgeSynthesis §01 proposes a scope selector (Practice / Product / Factory) but doesn't specify if it's:

1. **A segmented control in the Submenu?** (visual component)
2. **URL-based routing?** (/knowledge/practice, /knowledge/product, /knowledge/factory)
3. **Both?** (URL + visual indicator)

Also, does switching scope reset filters and selection?

**Evidence:**
- KnowledgeSynthesis §01: "Adopt A's full browser. Three-scope segmented control at the top of the submenu"

**Recommendation:** Implement as both: (A) segmented control in Submenu header, (B) route params `/knowledge?scope=practice&product=ambrovia`. Switching scope resets list selection and filters.

---

### ADV-36: Review Thread Linked Issues — Not Specified

**Severity:** 🟡 needs resolution during build  
**Category:** underspecified interaction  
**Finding:** INFORMATION_ARCHITECTURE.md §2.2 mentions "Linked threads indicator: Related threads addressing the same issue (e.g., hardware change + firmware workaround)." But there's no spec for:

1. **How are threads linked?** Automatic (system detects related changes) or manual (user adds a link)?
2. **Display.** Where do linked threads appear? In the ReviewHeader? Below the artifact?
3. **Navigation.** Clicking a linked thread — does it close the current thread or open a split view?

**Evidence:**
- INFORMATION_ARCHITECTURE.md §2.2: "Linked threads indicator"

**Recommendation:** Defer this feature. It's not mentioned in the synthesis. If it's needed, spec it fully before implementation.

---

## 9. ACTIONABLE SUMMARY

| Category | Count | Severity 🔴 | Severity 🟡 | Severity 🟢 |
|---|---|---|---|---|
| Contradictions | 5 | 1 | 4 | — |
| Budget violations | 4 | — | 4 | — |
| Underspecified interactions | 10 | 2 | 8 | — |
| Scope creep | 5 | — | 4 | 1 |
| Effort traps | 4 | 1 | 3 | — |
| Cross-doc contradictions | 2 | — | 2 | — |
| Missing specs | 3 | — | 3 | — |
| Positive findings | 6 | — | — | 6 |
| **Total** | **39** | **4** | **28** | **7** |

---

## 10. BLOCKERS (🔴) THAT MUST BE RESOLVED BEFORE BUILD

1. **ADV-01:** Settings drawer contradicts Rail invariant. Clarify: modal or drawer-inside-rail?
2. **ADV-10:** Settings drawer open/close state not specified. Define trigger, stacking, mobile behavior.
3. **ADV-23:** Collapsed Rail with three pills — layout math doesn't work. Mockup with real typography.

---

## 11. RECOMMENDATIONS FOR NEXT PHASE

1. **Resolve all 🔴 blockers** before writing any work packages.
2. **Complete the merge modal spec** (KnowledgeSynthesis §06) or defer it.
3. **Clarify the difference** between "Reasoning block" (new component) and "reasoning field" (existing data).
4. **Add CurationCard and KnowledgeGroup** to the Tier tree, or prove they're variants of existing Tier-2 blocks.
5. **Test PitchSelector layout** (inline vs. overlay) with real content before committing to the pattern.
6. **Mockup the collapsed Rail** with actual typography to verify three pills fit without scrolling.
7. **Spec keyboard shortcuts** (A, R, X, S) and test for conflicts with OS/browser shortcuts.
8. **Defer "linked threads" feature** — not in synthesis; will add complexity.

---

## 12. TRACKING

- Review date: 2026-04-19
- Document versions reviewed:
  - ShellSynthesis.html (REV 01)
  - ConversationSynthesis.html (REV 03)
  - WorkSynthesis.html (REV 01)
  - KnowledgeSynthesis.html (REV 01)
  - UI_DESIGN.md (Version 0.2)
  - HUMAN_INTERFACE_LAYER.md (§1–4.1)
  - INFORMATION_ARCHITECTURE.md (§1–3.3)
