## 2. Conversations View

> **Reframe note (added with TRACK-L L1, the Thread primitive).** This section uses "Review Thread Detail" / "Chat Thread Detail" as a UI shorthand. Per `HUMAN_INTERFACE_LAYER.md §4.5`, there is one Thread primitive and the differences live on the *messages* (review / questionnaire / plain) and on the thread's *configuration*. "Review Thread Detail" reads as "the detail surface when the thread contains a review message"; "Chat Thread Detail" reads as "the detail surface when the thread does not (yet) contain a review or questionnaire message". The two converge to a single detail surface in TRACK-L L9.

**Purpose:** Messaging and reviews. The founder spends ~90% of their time here.

<!-- @source packages/web/src/pages/Conversations.tsx -->

**Shell structure:** Sidebar | Main (Thread Detail). The detail pane adapts to the messages in the selected thread; it is one surface, not two routes.

### 2.1 Submenu (Thread List)

The founder's inbox. Answers: "What needs me right now?"

| Component | Information | Actions |
|---|---|---|
| **Search/jump bar** | Input with "Jump to..." placeholder | Type to filter threads |
| **Filter bar** | Filters: product, agent, type (review/chat), status (blocking/open/snoozed/resolved) | Click filters; multi-select; clear all |
| **Pinned section header** | "Pinned" label | — |
| **assistant thread item** | Name, first-line preview, unread badge | Click to open thread |
| **Active threads section header** | "Active Threads" label | — |
| **Thread list item (review)** | Sender (agent name + role), product tag, subject line, timestamp, review indicator, blocking indicator (if agent paused), estimated review time | Click to open in main pane |
| **Thread list item (chat)** | Sender, subject line, timestamp | Click to open in main pane |
| **Thread state actions** | — | Right-click or swipe: Snooze (with timer), Archive, Mute |
| **Estimated review time** | Agent-estimated complexity tag ("~2 min", "~15 min") shown on each thread item | Read-only; helps triage |
| **Bulk actions button** | — | Click to show batch operations (approve-similar, snooze-all, mark-read) |

**Ordering:** assistant pinned at top → blocking reviews → non-blocking reviews → chats → resolved.

### 2.2 Main Pane: Review Thread Detail

A review thread = reasoning → artifact → verdict. The structure is always the same; the ArtifactView varies by shape.

| Component | Information | Actions |
|---|---|---|
| **Thread header** | Thread title, agent name, timestamp, thread type badge | — |
| **Agent reasoning block** [^reasoning-block-vs-primitive] | Agent's explanation of why this action is proposed. Always visible, always first. Confidence indicator (e.g., 'High confidence' / '62% confident'). | Collapsible (but expanded by default) |

[^reasoning-block-vs-primitive]: The "agent reasoning block" is a UI element that renders the agent's reasoning inline in the conversation surface. It is NOT the `Block` content primitive defined in [`BLOCKS.md`](BLOCKS.md); it shares the English word "block" and nothing else.
| **ArtifactView** | Content varies by type (text_diff, content_preview, visual_comparison, action_summary, data_metrics) — see §2.3 | Inline comments, scroll, zoom |
| **Conversation history** | Chronological messages: agent proposal, founder comments, agent revisions. Each: sender, avatar, timestamp, content | Reply |
| **Verdict action bar** | Primary: Approve, Request Changes, Reject, Snooze. Overflow menu (⋮): Edit, Escalate, Delegate, Comment Only | Click primary button or use keyboard shortcuts (A, R, X, S). Overflow for less-common actions. |
| **Linked threads indicator** | Related threads addressing the same issue (e.g., hardware change + firmware workaround) | Click to navigate to linked thread |
| **Inline comment input** | Text input on specific artifact parts (diff lines, paragraphs, plan steps) | Type and submit |
| **Comment input** | Thread-level reply input at bottom | Type and send |

### 2.3 ArtifactView Shapes (5 types)

Each review thread carries exactly one ArtifactView shape:

**text_diff** (code, config, schemas, hardware design files):

| Component | Information | Actions |
|---|---|---|
| **File header** | File path, change summary | — |
| **Diff viewer** | Side-by-side or inline: line numbers, additions (green), deletions (red), context lines | Inline comment on specific lines |
| **Check results** | Tests passed/failed, lint, security scan, DRC results | Read-only |

**content_preview** (blog posts, emails, CRM sequences, product manuals):

| Component | Information | Actions |
|---|---|---|
| **Rendered output** | Content as the reader will see it — formatted text, not markdown source | Inline comment on paragraphs |
| **Email sequence cards** | Per email: subject, body preview, send timing, audience segment, sentiment tag | Expand individual emails |
| **Metadata sidebar** | Word count, target audience, publish date, SEO keywords | Read-only |

**visual_comparison** (UI mockups, CAD renders, PCB layouts, enclosure designs):

| Component | Information | Actions |
|---|---|---|
| **Before/after viewer** | Side-by-side images with labels (Rev B / Rev C) | Drag slider to compare |
| **Annotation overlays** | Numbered circles/rectangles highlighting changed regions | Hover for callout detail |
| **Annotation legend** | Numbered list of changes with descriptions | Scroll, click to highlight |
| **Zoom controls** | Current zoom level, zoom in/out | Click/scroll to zoom |

**action_summary** (deploys, ops changes, procurement, vendor config):

| Component | Information | Actions |
|---|---|---|
| **Summary card** | What's changing, why, expected impact, rollback plan, checks passed, timeline, cost | Read-only; comment on whole proposal |

**data_metrics** (performance reports, A/B tests, acoustic measurements):

| Component | Information | Actions |
|---|---|---|
| **Headline metrics** | Key numbers with trend indicators (up/down arrows) | — |
| **Charts** | Line, bar, frequency response — inline SVG with axis labels, legend | Hover for values; export button |
| **Narrative insights** | Agent's text analysis of the data | Inline comment |
| **Recommendations** | Agent's proposed next actions | Comment on specific recommendations |

### 2.4 ReviewHeader & Companion Layout (Complex Artifacts)

**ReviewHeader:** The approve/request-changes/reject bar that anchors the verdict actions.

When an ArtifactView is complex, the main pane splits into companion layout:

| Zone | Content |
|---|---|
| **Left: conversation** | Thread messages, reasoning, ReviewHeader (verdict actions) |
| **Right: artifact** | Full ArtifactView (multi-file diff, full page preview, detailed dashboard, PCB layout) |
| **Toggle** | Button to switch between inline and companion layout |

### 2.5 Chat Thread Detail

| Component | Information | Actions |
|---|---|---|
| **Message list** | Chronological messages, each with sender avatar, name, timestamp, content | Scroll |
| **Agent reasoning** | Collapsible reasoning on agent messages | Expand/collapse |
| **Reply input** | Text input at bottom | Type and send |
| **Action buttons** | Start a task, Close, Escalate | Click |

---
