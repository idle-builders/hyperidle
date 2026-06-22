# t3code source findings — the live agent-session surface

Clone: `git clone --depth 1 https://github.com/pingdotgg/t3code /tmp/t3code` (succeeded). All paths below are under `/tmp/t3code/apps/web/src/` unless noted. t3code is a multi-provider (Codex / Claude / OpenCode / Cursor / Grok) agentic coding client; its chat view IS exactly the "follow an agent session" surface AM3 redesigns. **The screenshots are this app.**

> Caveat: t3code is the founder's stated reference ("not building t3" — MEMORY `project_conversation_not_session_am`). It models a *coding-agent session* (worktrees, PRs, approvals). HyperIdle's session is the same streaming-conversation shape but a thinner dial-in. Use t3code for the **rendering vocabulary**, not its IA (route-per-thread, branch toolbar, PR plumbing are out of scope).

## The render tree (who renders what)

| Concern | File | Component / function |
|---|---|---|
| Message list owner (virtualized) | `components/chat/MessagesTimeline.tsx` | `MessagesTimeline` (memo). Uses `LegendList` (`@legendapp/list`) with `maintainScrollAtEnd`, `maintainVisibleContentPosition`, `initialScrollAtEnd`. |
| Row dispatch | same | `TimelineRowContent` — switches on `row.kind`: `message` (user/assistant) · `work` · `turn-fold` · `proposed-plan` · `working`. |
| User message bubble | same | `UserTimelineRow` — right-aligned, `max-w-[80%] rounded-2xl border bg-secondary p-3`. Collapsible past 8 lines / 600 chars (`CollapsibleUserMessageBody`, `shouldCollapseUserMessage`). |
| Agent (assistant) message | same | `AssistantTimelineRow` — **full-width, no bubble** (`px-1 py-0.5`), renders `ChatMarkdown` with `isStreaming={Boolean(row.message.streaming)}`. |
| Streaming markdown | `components/ChatMarkdown.tsx` | `ChatMarkdown` — takes `text`, `isStreaming`, `cwd`, `threadRef`, `skills`. Empty-while-streaming → `""`; settled-empty → `"(empty response)"` (`MessagesTimeline.tsx:584`). |
| Tool-call row group | `MessagesTimeline.tsx` | `WorkGroupSection` (memo) — wraps a run of `work` entries; aggregates + collapses. |
| Single tool-call row | same | `SimpleWorkEntryRow` (memo) — the compact icon+verb+target row. |
| Changed-files panel | same | `AssistantChangedFilesSection` → `AssistantChangedFilesSectionInner` → `ChangedFilesTree` (`components/chat/ChangedFilesTree.tsx`). |
| Per-file diff render | same + `lib/diffRendering.ts` | `FileDiff` from `@pierre/diffs/react`; `getRenderablePatch()` parses unified patch → `{kind:"files"|"raw"}`. |
| Composer | `components/chat/ChatComposer.tsx` (2582 lines) | model picker + mode/runtime pills + send/stop. |
| Send/Stop button | `components/chat/ComposerPrimaryActions.tsx` | `ComposerPrimaryActions` — `isRunning` → red square **Stop**; else arrow **Send**; pending-question → Next/Submit. |
| Session/work-log derivation | `session-logic.ts` (1393 lines) | `deriveTimelineEntries`, `WorkLogEntry`, tool success/fail/neutral heuristics. |
| Row derivation + aggregation | `components/chat/MessagesTimeline.logic.ts` (478) | `deriveMessagesTimelineRows`, `normalizeCompactToolLabel`, `MAX_VISIBLE_WORK_LOG_ENTRIES`. |

## Data shapes (the message-parts / tool model)

**`TimelineEntry`** (`session-logic.ts:122`) — the source stream is a union, NOT a message array:
```
| { kind:"message";  createdAt; message: ChatMessage }
| { kind:"proposed-plan"; proposedPlan: ProposedPlan }
| { kind:"work";    createdAt; entry: WorkLogEntry }     // tool calls + reasoning
```
This is the key insight: **a session is one heterogeneous append-only stream** of message / work / plan entries, derived (`deriveTimelineEntries`) then grouped into render rows. Maps cleanly onto HyperIdle's source-agnostic `Part[]`.

**`WorkLogEntry`** (`session-logic.ts:63`) — the tool-call/reasoning unit:
```
id, createdAt, turnId, label, detail?, command?, rawCommand?,
changedFiles?: string[], tone: "thinking"|"tool"|"info"|"error",
toolTitle?, toolData?: unknown, itemType?: ToolLifecycleItemType,
requestKind?: "command"|"file-read"|"file-change",
toolLifecycleStatus?: "inProgress"|"completed"|"failed"|"declined"|"stopped",
sourceActivityKind?
```
- `tone` carries reasoning vs tool vs error (`thinking` = reasoning).
- `toolLifecycleStatus` drives the row's trailing status glyph (check / x / minus).
- `changedFiles` is how a tool row links to the diff panel.

**Tool-kind → icon** (`workEntryIconName`, `MessagesTimeline.tsx:1494`): `requestKind:"command"`→terminal, `"file-read"`→eye, `"file-change"`→square-pen; `itemType`: `web_search`→globe, `image_view`→eye, `mcp_tool_call`→wrench, `dynamic_tool_call`/`collab_agent_tool_call`→hammer. Reasoning (`tone:"thinking"`)→bot. This is the **per-kind verb vocabulary** the screenshots show (Run command / View / Edit / Find / Web search).

**Status heuristics** (`session-logic.ts:142–260`): `workLogEntryIsToolLike`, `workEntryIndicatesToolFailure` (parses output text for `ENOENT`, `exit code N`, "file not found", etc.), `...Success`, `...NeutralStatus`. Failure/success/neutral → trailing X (destructive) / Check / Minus glyph (`SimpleWorkEntryRow`, lines 1643–1681).

## Tool-row anatomy (`SimpleWorkEntryRow`, lines 1542–1699)

One row = `[tone icon] [Heading] [— preview/target, muted truncated] [chevron if expandable] [status glyph]`.
- **Heading**: `toolWorkEntryHeading` → capitalized `normalizeCompactToolLabel(toolTitle ?? label)`.
- **Preview/target**: `workEntryPreview` → `command` ?? `detail` ?? first changedFile (`path +N more`). Suppressed when it equals the heading.
- **Collapsed by default.** `canExpand = expandedBody !== null`; click/Enter/Space toggles. Expanded body (`buildToolCallExpandedBody`, line 1466) = raw command + detail + changed-file list, in a `<pre>` mono block `max-h-64 overflow-auto` (lines 1686–1696). This is the screenshot "Show more" mono output.
- **Indented left rule** on expansion: `ms-7 border-s ps-3`.

## Aggregation ("Ran 4 commands, read a file")

`WorkGroupSection` (lines 715–815):
- Filters out neutral/empty entries (`nonEmptyEntries`).
- Group label: if every entry is tool-like → `"1 tool call"` / `"N tool calls"`; else `"Work Log"` (`groupLabel`, line 735).
- **Overflow collapse**: shows only the last `MAX_VISIBLE_WORK_LOG_ENTRIES`; the rest behind a `+{hiddenCount} previous tool calls` / `Show fewer tool calls` toggle (lines 791–812). Collapsed view keeps newest visible; expand appends *upward* with scroll-anchor compensation (`anchorBottomBeforeToggleRef` + `useLayoutEffect`, lines 741–771).
- The screenshot "Ran 4 commands, read a file ▾" is this fold label (an aggregate verb derived from the grouped entries).

## Turn folding ("Thought for / older turns collapse")

`turn-fold` row (`TurnFoldTimelineRow`, line 562) — a one-line `{label} ▸/▾` button that folds an entire completed turn's work. `expandedTurnIds` set in `MessagesTimeline`; a *running* turn that gets interrupted stays expanded (lines 238–263); the previous turn auto-folds when a new turn starts. **Calm device #1: completed work collapses to a one-line summary.**

## Streaming + "working" affordance

- `WorkingTimelineRow` (line 658): three pulsing dots + self-ticking **"Working for {Xs}"** (`WorkingTimer`, line 687, updates its own text node via `setInterval` — no React re-commit per second). Matches the screenshot spinner-while-working.
- Streaming text: `AssistantTimelineRow` passes `isStreaming` into `ChatMarkdown`; the list auto-pins to bottom via `maintainScrollAtEnd` (suppressed during fold toggles, lines 199–234, so expanding doesn't yank scroll).

## Reasoning / thinking

Reasoning is modeled as a `WorkLogEntry` with `tone:"thinking"` (NOT a separate message). `task.progress` activities also map to `thinking` (`session-logic.ts:713`). It renders as a work row with the bot icon and is **excluded from success glyphs** (`workEntryIndicatesToolSuccess` returns false for thinking, line 235). The screenshots also show a distinct **"Thought for 14s" collapsible reasoning block** with the reasoning body in muted italic prose — i.e. reasoning gets the same collapse-to-summary treatment as a turn fold, separate from the answer text.

## Changed-files / diff panel (REUSE TARGET for primer 4)

`AssistantChangedFilesSectionInner` (lines 862–924) renders **per-turn**, attached under the assistant message:
- Header: `Changed files (N) • +X/−Y` (`DiffStatLabel`, `summarizeTurnDiffStats`) + **`Collapse all`/`Expand all`** + **`View diff`** buttons (lines 882–913). Matches screenshot "CHANGED FILES (3) +X/−Y  Collapse all  View diff".
- Body: `ChangedFilesTree` — a directory tree of files with per-file `+/−` badges (screenshot 12.58.16 shows the nested `data/` `json/` tree with `+N/−N` per leaf).
- `View diff` → `onOpenTurnDiff(turnId, path)` opens the full diff panel (`DiffPanel.tsx`).
- Per-file diff uses `FileDiff` from `@pierre/diffs/react` via `getRenderablePatch` (`lib/diffRendering.ts`). The **same** `FileDiff` renderer is reused inline for review-comment cards (`UserMessageReviewCommentCard`, lines 1266–1317). **This is t3code reusing one diff renderer across session + review** — primer 4 confirmed.

Inline single-edit row (screenshot "Edit concept… +10/−1", "File change") = a `work` row whose `requestKind:"file-change"` / `changedFiles` drives a square-pen icon + `+N/−N` `DiffStatLabel`; clicking expands to the changed-file list, and the turn's `Changed files` panel hosts the full diff.

## Composer pills (primer 8 mapping)

`ChatComposer.tsx` footer (lines 2480–2576): a left scroll-strip of controls + right Send/Stop.
- **Model picker**: `ProviderModelPicker` (line 2490) — `descriptor.models` equivalent; shows provider+model (screenshot "GPT-5.5", "Claude Opus 4.6", "Opus 4.8").
- **Interaction mode**: `interactionMode === "plan" ? "Plan" : "Build"` (`ChatComposer.tsx:240`) — screenshot "Build" / "Interactive" pill.
- **Runtime / permission mode** (`runtimeModeConfig`, lines 130–149): `approval-required`→**"Supervised"** (lock), `auto-accept-edits`→**"Auto-accept edits"** (pen), `full-access`→**"Full access"** (open lock). Screenshot "Full access" / "Accept edits".
- **Effort**: `selectedPromptEffort` (e.g. "Medium · Normal") on the model picker.
- Compact viewport collapses these into `CompactComposerControlsMenu`.
- **Send/Stop**: `ComposerPrimaryActions` — `isRunning` → red square Stop (`onInterrupt`); pending question → Next/Submit; else arrow Send.

## Queued / pending input

t3code does NOT free-queue an arbitrary message while running; instead the agent *requests* structured input and the composer shows a **pending panel** (`ComposerPendingUserInputPanel.tsx`, `PendingUserInput` in `session-logic.ts:96`) — questions with options, answered inline, advanced with Next/Submit. Approvals work the same (`ComposerPendingApprovalPanel`, `PendingApproval` requestKind command/file-read/file-change). So t3code's model is *agent-pulls-input* rather than *human-pushes-queued-message*. HyperIdle's primer 3 (human pushes a message, it queues until the agent looks) is a **deliberate divergence** — the closest t3code analog is this pending-panel chrome (a banner above the composer), and AI SDK Elements has a first-class **Queue** component for exactly the push-queue case.

## Bottom status bar

Screenshots (Bild 6/7) show a bar above the composer: **`Background N` · `Artifacts N`** (Bild 6) and **`Changes +10683/−179` · `PR #8885` · `Background 1`** (Bild 7) — counts of background tasks, generated artifacts, aggregate diff stat, and the linked PR, with `Ready for review` as the turn-complete CTA (top-right). These are session-scoped status chips, separate from the per-turn `Changed files` panel.
