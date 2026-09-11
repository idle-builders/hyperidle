# Census — UI actions

**306 actions. 79 touch the API; 227 are client-only.**

Most of the 227 are UI mechanics — expand a fold, resize a split, move focus, open a menu.
Those are not capabilities under the rule ("one thing a person would say they're doing").
The capability-bearing subset is the 79, plus the reads behind page loads.

By area: Work 31 · Knowledge 38 · Conversations 17 · Review 13 · Agents/Org 11 ·
Settings 14 · Notifications 10 · Shell 8 · Setup 13.

## Dead controls — render live, do nothing

- **"+ Add filesystem"** (`settings/SettingsFilesystems.tsx:139`) — no `onClick` at all.
  A filesystem can only be registered during Setup.
- **"Approve all except flagged"** and **"Hold"** (`pages/review/ReviewBatch.tsx:211,340`) — no handlers.
- **"Open preview in a new tab"** (`pages/review/ReviewBrowserPreview.tsx:221`) — calls `preventDefault()`.
- **Composer Insert menu** (`components/ConversationSurface.tsx:242`) — 6 items (block, file,
  mention, reference, format, emoji) that close the menu and nothing else.
- **Session composer Insert** (`components/SessionView.tsx:582`) — no handler.
- **`⌘L` copy block permalink** (`ds/Block.tsx:44`) — no caller supplies `onCopyPermalink`.
- **`ds/BlockHandle.tsx`** — never rendered; no consumer passes `Block`'s `gutterLeading` slot.

## Decorative verdicts

`ReviewCanvasProps` (`pages/review/review-artifact.ts:41`) declares **only** `artifact`.
Three canvases accept `onApprove` / `onRequestChanges` that nothing ever supplies:
`ReviewActionOperation.tsx:238,246` · `ReviewRenderedInContext.tsx:416,428` ·
`ReviewBrowserPreview.tsx:251,263`. `ReviewFieldChangeSet.tsx:104,300` — per-field approve and
"Approve all fields" — mutates a local `Set` that nothing reads or submits.

Verified: the props are genuinely undeclared, not merely unpassed.

## Orphaned event

`shell/AssistantOverlay.tsx:142,163` dispatch `CustomEvent("navigate-settings")` when the
assistant has no API key or no harness. **Nothing listens.** The two remediation paths out
of a broken assistant are no-ops.

## Surfaces with suspiciously little

- **WorkTask has zero actions of its own.** No assign, no retry, no cancel, no state change —
  only a discussion composer. `WorkTask.tsx:220` records that the overflow menu was removed
  because no task-level actions were defined. This is the code matching the doc line
  *"Humans do not drag tasks between states."*
- **AgentProfile is read-only.** 619 lines; every affordance is a link out.
- **The Conversations filter can be cleared but never set.** `Conversations.tsx:614` records
  that the Blocking/Unread chips were deleted because they never matched real state.
- **Knowledge has no delete** — archive only.

## Duplicate surfaces

- **Three ways to create an agent**: `pages/AgentAddDialog.tsx`, `settings/SettingsAgents.tsx`,
  and Setup — on top of the agent's own `add_agent` tool. Four paths to one act.
- **Two agent editors with different powers**: `pages/work/AgentDetailPane.tsx` (team side pane)
  and `settings/AgentEditor.tsx`. Only the Settings one can edit role, model options and
  filesystem injections.
- **Two human verdict paths**: `ReviewPage` and the assistant overlay's message cards
  (`ds/ThreadShell.tsx:350` → `dispatchVerdict` → `POST /threads/:id/messages`). Both hit the
  same route, so both fail to grant.
- `SettingsModels` is mounted inside `SettingsHarnesses`, so system default models are only
  reachable by clicking into the built-in backend's detail pane.

## Undiscoverable

`d` dial in · `n` new thread · `v`/`x`/`j`/`k`/`o` knowledge triage · `⌘L` (dead) ·
`⌘[`/`⌘]` · `⌘1/2/3`. **There is no shortcut help surface anywhere in the app.**
