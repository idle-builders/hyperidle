# Following an agent session — feature dossier (AM3)

What "following a live agent session" looks like in real apps, to anchor HyperIdle's AM3 Session view. Sources: t3code source (cloned, `t3code-source-findings.md`), AI SDK Elements (`elements.ai-sdk.dev`), 8 founder screenshots, secondary scan (Cursor / Claude Code / Copilot). Evidence-cited throughout. **Analysis only — no TSX, no variants.**

The founder's 5 primers are the spine. Verdict up front: **all 5 verified** against the references. The first AM3 attempt got the IA wrong (a form-heavy config slide-over) because it treated the session as a "controls + activity-log panel" instead of a **streaming human+agent conversation**. This dossier reframes it.

---

## 1. Mental model

**A session IS a streaming human+agent conversation** — same reading shape as a Conversation (AM1), but with exactly two participants (the human + one agent) and the agent doing most of the talking by *continuously appending and streaming* text and tool calls. This is the founder's primer 1, and it is exactly how t3code models it: the source is one append-only `TimelineEntry[]` stream — `message | work | proposed-plan` (`session-logic.ts:122`) — rendered top-to-bottom with the list auto-pinned to the bottom (`MessagesTimeline.tsx`, `LegendList maintainScrollAtEnd`). It is **not** a static activity-log panel.

**Reconciling with HyperIdle's Conversation/Session distinction** (MEMORY `project_conversation_not_session_am`; `docs/human-interface-layer/part-model.md`):
- A **Conversation** = deliberate threaded messages people/agents *choose* to send. Calm, embedding-rich, the everyday reading.
- A **Session** = the *lower-level dial-in* into one agent's live work — the same rendering structure, but it streams the agent's continuous output (text + tool calls + reasoning + diffs) at a finer grain. The session work-log is **never** promoted into the Conversation column (AM1 hard-rule 3); a Conversation links to a Session via a `session-reference` Embed only.
- The bridge is the **Part model** (`packages/shared/src/part.ts`): a Part is *source-agnostic* — `derivePartsFromMessages` (Conversation) and `derivePartsFromSession` (the AM3 stub at `part.ts:354`) both emit the SAME `Part[]`, rendered by the SAME `PartList`. AM3's job is to fill that adapter, not build a second renderer (concept hard-rule 4).

**How the session maps onto Parts** — the load-bearing design question. The current Part vocab is `prose | review | resolved | questionnaire | unknown` (`part.ts:34`). A streaming session needs more than `prose` can calmly carry. Two honest options:

| Option | What it means | Trade |
|---|---|---|
| **prose-only** (the first AM3 attempt) | every tool call → a `prose` Part | zero renderer change, but loses the compact tool-row anatomy, status glyphs, aggregation, diff chip — reads as a wall of text. **This is why attempt 1 was weak.** |
| **Extend the closed `PartKind` union** | add `tool` (+ keep diff via the existing `diff` Embed), and a `reasoning` Part (or a Fold variant) | one-time renderer extension (exhaustive dispatch + `unknown` fallback), but earns the calm compact rows the references all use |

The references are unanimous that tool calls, reasoning, and diffs are **distinct render kinds**, not prose (t3code `WorkLogEntry.tone`/`itemType`; AI SDK Elements has separate `Tool`, `Reasoning`, `Code Block`, `Task` components). **Recommendation: extend the closed union** (`tool`, `reasoning`) and reuse the existing `diff` Embed — the architecture-level call, but the dossier's evidence points firmly away from prose-only. Reasoning was already foreseen as a potential kind in `plans/AM3/design/approved.md` Q1.

---

## 2. Turn & message structure

Three actor-shaped row families, visually distinct:

| Row | Visual treatment | Evidence |
|---|---|---|
| **Human message** | right-aligned **bubble** — `max-w-[80%] rounded-2xl border bg-secondary p-3`. Collapses past 8 lines / 600 chars with a fade mask + "Show full message". | `MessagesTimeline.tsx:457` (`UserTimelineRow`), `:1016` collapse thresholds. Screenshots show the gray right-aligned bubbles. |
| **Agent turn** | **full-width, no bubble** — markdown body at `px-1`, append-only, streaming. The agent "owns the column". | `AssistantTimelineRow` (`:582`); screenshots — agent text spans the column, human text is bubbled. |
| **Work / tool calls** | compact indented rows *between* agent text, grouped by turn. | `WorkGroupSection` (`:715`). |

**A "turn"** = one agent response cycle: interleaved streaming text + work rows, optionally a proposed-plan, terminating when the agent yields. Completed turns fold to a one-line summary (`turn-fold` row, `:562`). The agent does most of the talking → the column is agent-text-dominant with human bubbles as punctuation. AI SDK Elements mirrors this with `Conversation` + `Message` (role-styled) + `Response`.

**Why the bubble/no-bubble split matters:** it's the cheapest possible signal of who's speaking in a two-party stream where one party dominates — no avatars-per-line, no labels-per-line. Calm.

---

## 3. Streaming text (primer 2a)

The agent's primary output is **progressively-rendered markdown**, streamed token-by-token, auto-pinned to bottom.

- **Progressive markdown**: `ChatMarkdown` takes `text` + `isStreaming` (`MessagesTimeline.tsx:589`). Renders headings, lists, inline code, links, fenced code blocks (screenshots show `## headings`, numbered lists, inline `curl`/`code`, bold). AI SDK Elements: `Response` (streaming markdown) + `Code Block` (syntax-highlit fences).
- **Empty-state discipline**: while streaming, empty text renders as `""` (no flash); settled-empty renders `"(empty response)"` (`:584`). Prevents a flicker of placeholder.
- **Cursor/typing affordance**: t3code uses no blinking caret on the text itself; the "working" signal lives in a **separate** `WorkingTimelineRow` — three pulsing dots + self-ticking **"Working for {Xs}"** (`:658`, `WorkingTimer` updates its own DOM node, no per-second React commit). This is more calm than an in-text caret. Screenshots show the orange spinner dot while working.
- **Auto-scroll**: list pins to the newest content (`maintainScrollAtEnd`) but **suppresses the pin during fold toggles** (`:199–234`) so expanding a section doesn't yank you to the bottom — and exposes a manual **"Scroll to bottom"** pill when you've scrolled up (visible in 5 of 8 screenshots).

---

## 4. Tool calls — THE core feature (primers 2b, 4)

Co-equal with streaming text. The single most-important calm-making engineering in the references. Anatomy of one row (`SimpleWorkEntryRow`, `MessagesTimeline.tsx:1542`):

```
[tone icon]  Heading   — target/preview (muted, truncated)   [▾ if expandable]  [✓/✗/– status]
```

- **Per-kind icon + verb** (`workEntryIconName`, `:1494`): command→terminal "Run command", file-read→eye "View"/"Read", file-change→square-pen "Edit", web_search→globe "Web search", mcp→wrench, sub-agent→hammer, reasoning→bot. Screenshots: `⌖ Ran command — sed -n …`, `◎ Web search`, `File change`. AI SDK Elements: `Tool` component (one per call).
- **Inline target / `# comment`**: the muted preview = `command ?? detail ?? firstChangedFile` (`workEntryPreview`, `:1441`); screenshots show `# Check ai-sdk/react version`-style inline comments and line counts.
- **Collapsed by default, click to expand** → mono `<pre>` output block, `max-h-64 overflow-auto`, indented under a left rule (`:1686`). Screenshot "Show more" on long output.
- **Status glyph** (trailing): success ✓ / failure ✗ (destructive) / neutral – , driven by `toolLifecycleStatus` + output-text heuristics (`session-logic.ts:202–260`, parses `ENOENT`, `exit code N`, "file not found").
- **Batch aggregation** (`WorkGroupSection`, `:715`): a run of tool rows collapses to **"N tool calls"** with a `+{hidden} previous tool calls` fold; only the last `MAX_VISIBLE_WORK_LOG_ENTRIES` show. Screenshots: **"Ran 4 commands, read a file ▾"** — an aggregate verb over the grouped entries. This is what keeps a 30-tool-call turn from being a wall.

**Must-build set:** compact row (icon+verb+target+status), collapse-by-default + expand-to-output, per-kind icon vocabulary, batch aggregation row. Without aggregation the view is noise.

---

## 5. Thinking / reasoning (primer 5)

Reasoning is shown **distinctly from answer text**, collapsed by default.

- t3code models reasoning as a work entry with `tone:"thinking"` → bot icon, and **excludes it from success glyphs** (`session-logic.ts:235`); `task.progress` also maps to thinking (`:713`).
- Screenshots show a dedicated **"Thought for 14s"** collapsible block — a one-line summary that re-expands to muted/italic reasoning prose, the same collapse-to-summary device as a turn fold. It is *not* mixed into the answer markdown.
- AI SDK Elements has **two** first-class components here: **`Reasoning`** (the collapsible "thought for Ns" block) and **`Chain of Thought`** (step-by-step). This confirms reasoning is industry-standard as a *separate, collapsed-by-default* unit.
- **When shown**: only when the model emits separate reasoning tokens (Claude extended thinking, GPT reasoning effort). Default collapsed; the elapsed-time summary ("Thought for Ns") is the resting state. Calm.

**For AM3:** a `reasoning` Part (or a `prose` Part wrapped in a Fold whose label is "Thought for Ns") rendered visually quieter than the answer. Maps to the `Fold` device already in the Part model (`part-model.md` §Fold).

---

## 6. File diffs — reuse the review diff view (primer 4)

Two surfaces, both already solved in HyperIdle's review code:

1. **Inline edit row** — a `file-change` work row with a `+N/−N` `DiffStatLabel` and the changed path (screenshots "Edit concept… +10/−1", "File change"). Click expands to the file list. This is just a tool row (§4) with diff-stat chrome.
2. **Per-turn Changed-files panel** — `AssistantChangedFilesSection` (`MessagesTimeline.tsx:862`): header `Changed files (N) • +X/−Y` + **`Collapse all`/`Expand all`** + **`View diff`**; body is a `ChangedFilesTree` (directory tree, per-file `+/−` badges — screenshot 12.58.16 nested `data/…/json` tree). `View diff` opens the full diff. **Screenshots match exactly**: "CHANGED FILES (3) +X/−Y  Collapse all  View diff".

t3code renders the actual diff with **one** `FileDiff` renderer (`@pierre/diffs/react`) reused across both the session changed-files panel AND inline review-comment cards (`UserMessageReviewCommentCard`, `:1298`). **This confirms primer 4: don't invent a diff renderer — reuse the review one.**

**HyperIdle's review diff component to reuse: `ReviewCodeDiff`** (`packages/web/src/pages/review/ReviewCodeDiff.tsx`; visual variant `ReviewVisualDiff.tsx` same dir). It already does the three-layer drill-down (L1 header +X/−Y / L2 relevance-ranked file cards with +/− badges + reviewed checkbox / L3 expand-to-hunks with gutter + inline-comment "+"), and shares `add/del/ctx` line tints with `CodeRenderer`. The session's changed-files Embed should open / inline this, NOT a new renderer. (The Part model already has a `diff` Embed kind for exactly this — `part.ts:115`.)

---

## 7. Human-message queuing (primer 3)

The founder's model: **the human sends a message while the agent works → it queues until the agent has time to look at it; it does NOT interrupt/restart the agent.** This is a deliberate divergence from t3code.

- **t3code's model is agent-pull, not human-push**: while running, the composer's primary action becomes a **Stop** (red square, `ComposerPrimaryActions.tsx:126`); to get input mid-run the *agent requests* it — a pending panel above the composer (`ComposerPendingUserInputPanel.tsx`, `PendingUserInput` `session-logic.ts:96`) with questions/options answered inline (Next/Submit). Approvals use the same chrome (`PendingApproval`, requestKind command/file-read/file-change). So t3code surfaces *agent-requested* input as a banner, not *human-queued* messages.
- **AI SDK Elements has a first-class `Queue` component** — "displays pending/queued messages." This is the exact pattern for primer 3 and the strongest reference for it.
- **Secondary (Claude Code / Cursor):** Claude Code lets you type while it works and **queues** the message (shown as a pending line that's picked up at the next turn boundary); Cursor similarly queues follow-ups. So push-queue is real and typical — t3code is the outlier.

**Surfacing pattern for AM3** (synthesized): a queued human message renders as a **pending chip/row** distinct from sent messages — e.g. a muted right-aligned bubble with a "Queued · will send when the agent finishes" affordance and a **dequeue/cancel ✕** (and optionally "send now / interrupt"). It must read as *not-yet-delivered* (lower opacity / dashed / clock icon), and convert to a normal human bubble once the agent consumes it. The composer stays usable while the agent streams (unlike t3code's Stop-only state). Cancel removes it from the queue without touching the running turn.

---

## 8. Composer & session controls (primer 8)

The composer is a text input + a left strip of **pills that render from the harness capability descriptor** (AM2), + a right Send/Stop. Pill → descriptor field mapping (`packages/shared/src/harness/harness-capability-descriptor.ts`):

| Pill (screenshots) | t3code source | AM2 descriptor field |
|---|---|---|
| **Model** ("GPT-5.5", "Opus 4.8") | `ProviderModelPicker` (`ChatComposer.tsx:2490`) | `descriptor.models` (`HarnessModelDescriptor[]`), filter `selectable`; label/provider/contextWindow |
| **Effort** ("Medium · Normal") | `selectedPromptEffort` | a `HarnessModelOptionDescriptor` with `control.kind:"select"` (e.g. key `reasoningEffort`), `choices` |
| **Mode** ("Build" / "Interactive" / "Plan") | `interactionMode` (`:240`) | an option descriptor (`select` over plan/build) — `scope:"launch"` |
| **Permission** ("Full access" / "Accept edits" / "Supervised") | `runtimeModeConfig` (`:130`): approval-required / auto-accept-edits / full-access | an option descriptor (`select`), lock/pen/open-lock semantics |

**Key principle (already locked in `approved.md`): controls are descriptor-driven, never per-backend-branched.** Render one control per declared `HarnessModelOptionDescriptor`: `select`→pill row, `boolean`→toggle, `number`/`text`→input. A model that declares no effort option → no effort pill (the AC2 proof). This is correct and survives the redesign — but it belongs as a *compact pill strip on the composer*, not a foldable "Configuration band" zone (see §12).

**Working / stop state**: while streaming, Send → red square **Stop** (`onInterrupt`, `ComposerPrimaryActions.tsx:130`). Idle → arrow Send. Pending agent question → Next/Submit answer. Sending → spinner.

---

## 9. Status & navigation affordances

| Affordance | Source | Notes |
|---|---|---|
| **Scroll to bottom** | screenshots (5/8); `LegendList` isAtEnd state (`MessagesTimeline.tsx:288`) | pill appears when scrolled up; auto-pin otherwise |
| **Working for {Xs}** | `WorkingTimer` (`:687`) | live elapsed, self-ticking |
| **Bottom status bar** | screenshots Bild 6/7 | `Changes +X/−Y` · `PR #N` · `Background N` · `Artifacts N`; `Ready for review` CTA top-right. Session-scoped roll-ups, separate from per-turn diff panel. |
| **Per-turn changed-files** | `AssistantChangedFilesSection` (`:862`) | scoped to one turn, inline |
| **Stop / interrupt** | `ComposerPrimaryActions` | the only mid-run control t3code offers |

**Entry / exit (the open design axis):** the Conversation links to a session via a `session-reference` Embed; opening fires `onOpen({route:"session", sessionId})` (`part.ts:138`, currently a no-op until AM3). The first attempt opened a **non-modal right slide-over** (panel state on the conversation page, not a URL route — rejecting a `/session/:id` route as "too first-class"). That entry mechanism is sound (dismissible, conversation stays readable, Escape closes); the *contents* were wrong. Keep the entry axis; redesign the contents around the stream.

---

## 10. Calm-rendering principles

What makes these surfaces read calmly vs as a noisy wall — every one is in the references and compatible with Hearth/`AESTHETICS.md` (no token changes, MEMORY `feedback_visual_regression_no_screenshots` + part-model hard-rule 6):

1. **Collapse-by-default + fold-to-summary.** Tool rows collapsed; completed turns fold to one line; reasoning folds to "Thought for Ns"; long human messages fade-collapse. The single biggest calm device (`part-model.md` §Fold).
2. **Aggregation over enumeration.** "N tool calls" / "Ran 4 commands, read a file" instead of N visible rows (`WorkGroupSection`).
3. **Monochrome restraint.** Tone via icon + muted text, not color floods. Status is a tiny ✓/✗/– glyph; only failure uses destructive color (`SimpleWorkEntryRow` icon classes). Hearth is already monochrome-forward.
4. **Whitespace + truncation.** Targets truncate; output capped at `max-h-64` with scroll; one reading column `max-w-3xl` centered (`:355`).
5. **No per-line chrome.** Bubble/no-bubble carries authorship; no avatars/labels per line; metadata (timestamp, copy) appears on hover only (`opacity-0 group-hover:opacity-100`, `:603`).
6. **Stable scroll.** Auto-pin to bottom, but suppress the pin during user-initiated expands so the view never jumps under you (`:199–234`, `anchorBottomBeforeToggleRef`).
7. **Quiet working signal.** Pulsing dots + elapsed timer in muted micro-text, not a loud spinner or in-text caret.

---

## 11. Feature priority table

| # | Feature | Priority | Primer | Source evidence |
|---|---|---|---|---|
| 1 | Append-only streaming conversation stream (agent full-width text, human bubble) | **Must** | 1,2a | t3code `MessagesTimeline` `AssistantTimelineRow`/`UserTimelineRow`; AISDK `Conversation`/`Message`/`Response` |
| 2 | Progressive streaming markdown + auto-pin-to-bottom + Scroll-to-bottom | **Must** | 2a | `ChatMarkdown isStreaming`; screenshots "Scroll to bottom" |
| 3 | Compact tool-call row (icon+verb+target+status), collapse→expand output | **Must** | 2b | `SimpleWorkEntryRow`; AISDK `Tool`; screenshots |
| 4 | Batch aggregation ("N tool calls" / "Ran 4 commands…") | **Must** | 2b | `WorkGroupSection`; screenshot "Ran 4 commands, read a file" |
| 5 | Reasoning shown separately, collapsed "Thought for Ns" | **Must** | 5 | `tone:"thinking"`; AISDK `Reasoning`/`Chain of Thought`; screenshots |
| 6 | Changed-files panel + diff via reused `ReviewCodeDiff` | **Must** | 4 | `AssistantChangedFilesSection`+`FileDiff` reuse; `ReviewCodeDiff.tsx`; `diff` Embed |
| 7 | Queued human message (pending chip + dequeue) while agent streams | **Must** | 3 | AISDK `Queue`; Claude Code/Cursor queue; (t3code uses pull-panel) |
| 8 | Descriptor-driven composer pills (model/effort/mode/permission) + Send/Stop | **Must** | 8 | `ChatComposer` footer; `harness-capability-descriptor.ts`; screenshots |
| 9 | "Working for {Xs}" live indicator | **Should** | 2a | `WorkingTimer` |
| 10 | Turn fold (collapse a completed turn) | **Should** | 1 | `TurnFoldTimelineRow` |
| 11 | Per-row status glyph (✓/✗/–) + failure detection | **Should** | 2b | `workEntryIndicates*` heuristics |
| 12 | Session status bar (Changes/PR/Background/Artifacts) | **Should** | 9 | screenshots Bild 6/7 |
| 13 | Hover-only metadata (timestamp, copy, revert) | **Should** | calm | `AssistantTimelineRow` hover meta |
| 14 | Agent-requested input / approval panel | **Nice** | 3 | `ComposerPendingUserInputPanel` (HyperIdle approval flow may differ) |
| 15 | Proposed-plan card | **Nice** | — | `ProposedPlanCard` (t3code coding-specific) |
| 16 | Image attachments / preview-annotation cards | **Nice** | — | t3code; out of AM3 core |

---

## 12. Anti-patterns — why the FIRST AM3 attempt was wrong

The first attempt (`plans/AM3/design/approved.md`; `SessionDialIn{Side,Route,Overlay}.stories.tsx`; `sessionDialInFixtures.tsx`) was a **non-modal right slide-over with three zones: header · a foldable "Configuration band" of dial-in controls · an activity column of prose Parts.** It is the documented anti-pattern. Concrete pitfalls to avoid:

1. **Treated the session as "controls + activity log," not a conversation.** The center of gravity was a *Configuration band* (one control per harness option) with activity as a secondary column. The references put the **streaming conversation first**; controls are a thin pill strip on the composer. (MEMORY `project_am1_conversation_full_surface`: a session, like AM1, is a *full chat surface* — threads/actions/composer — not thin calm-rendering.)
2. **Prose-only activity.** "Each tool-call entry renders as one calm agent `prose` Part" (`approved.md:11,31`) throws away the compact tool-row anatomy, per-kind icons, status glyphs, aggregation, and diff chips that every reference uses. Result: a wall of undifferentiated text. → **extend the Part union** (§1).
3. **No streaming model.** The design renders "populated only" (MEMORY `feedback_no_skeleton_error_in_initial_designs` is about *initial design*, but the attempt never modeled the *append-and-stream* dynamic at all) — no streaming text, no working indicator, no auto-scroll/scroll-to-bottom.
4. **No human-message queue.** Primer 3 is absent; there's no queued-message affordance, no Stop state — the composer is the everyday "Send a message," ignoring the running-agent case.
5. **No reasoning treatment.** "Thought for Ns" / separate reasoning block is absent (deferred as an open question, `approved.md:53`).
6. **Diff deferred away.** "No diff Embed this WP (no edit/diff entry in the stream)" (`approved.md:31`) — but diffs are a Must-have and the renderer already exists (`ReviewCodeDiff`). Deferring it gutted a core feature.
7. **Config band as a first-class zone** competes with the activity for height and reads as a settings form. Controls belong as **composer pills** (descriptor-driven, §8), foldable into a compact menu — not a top-of-panel form.
8. **460px slide-over may be too narrow** for full-width agent text + diffs + tool output. The reading column wants room (t3code uses `max-w-3xl`). Reconsider width / consider the route option's affordances without making it feel "first-class."

What to keep: the **entry mechanism** (open from `session-reference`, dismissible, conversation stays mounted, Escape-close) and the **descriptor-driven, never-per-backend-branched** control rule.

---

## 13. Mapping to HyperIdle

| Must-have | Existing primitive / component | Genuinely new for AM3 |
|---|---|---|
| Streaming conversation stream | **`PartList`** (`packages/web/src/components/PartList.tsx`) — the AM1↔AM3 reuse seam; `derivePartsFromSession` adapter (`part.ts:354` stub) | fill the adapter: session events → `Part[]`; add streaming/append handling |
| Agent full-width text + human bubble | Part `prose` kind + author grouping (`groupParts`, `part.ts:158`) | two-party styling (bubble vs full-width) in the renderer |
| Tool-call row | — (no Part kind today) | **extend closed `PartKind` with `tool`** (icon+verb+target+status+collapse); exhaustive dispatch + `unknown` fallback |
| Reasoning block | `Fold` device (`part-model.md` §Fold) | **`reasoning` Part** (or prose+Fold labeled "Thought for Ns") |
| Aggregation | — | grouping/aggregation logic in the session adapter ("N tool calls") |
| File diff | **`ReviewCodeDiff`** (`pages/review/ReviewCodeDiff.tsx`) + `diff` Embed kind (`part.ts:115`) | wire the changed-files panel → `diff` Embed → open/inline `ReviewCodeDiff`; NO new diff renderer |
| Queued human message | the composer (AM1) | **new**: queued-message chip + dequeue, running-agent composer state, Stop |
| Composer pills | **`HarnessCapabilityDescriptor`** (`harness-capability-descriptor.ts`) — `models` + `HarnessModelOptionDescriptor[]` | descriptor→pill renderer (select/boolean/number/text), Send/Stop state |
| Open/exit | `session-reference` Embed + `OpenTarget{route:"session"}` (`part.ts:138`) + the slide-over entry from attempt 1 | bind the no-op `session` route to open the redesigned surface |
| Status bar | — | Changes/PR/Background/Artifacts roll-ups (Should-have) |

**Net new work:** (a) `derivePartsFromSession` real adapter with streaming + aggregation; (b) extend the closed `PartKind` union (`tool`, `reasoning`) + their renderers; (c) the queued-message affordance + running-agent composer; (d) descriptor→pill strip. **Reused unchanged:** `PartList` renderer, `ReviewCodeDiff` diff view, `HarnessCapabilityDescriptor`, the `session-reference`/`OpenTarget` open seam, the `Fold` device, Hearth tokens.
