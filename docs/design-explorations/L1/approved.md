# L1 Thread primitive — Approved design

**Status.** Locked. Input contract for `/architecture` (TRACK-L L1 Phase 9). The architect does NOT re-decide visual hierarchy, component vocabulary, or interaction grammar — they decide types, schemas, endpoints, and ordered tasks.

**Sources.** Concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5. Variants: `slack-shaped/`, `linear-shaped/`, `slate-shaped/`. Comparison: `comparison.md` (B 78/90, A 60/90, C 64/90). Synthesis rationale: `synthesis.md`.

---

## 1. Chosen base + pulls

**Base:** Variant B (`linear-shaped`) — issue-shape with `ThreadHostBanner` + `ThreadHead` + sticky `ReviewVerdictBar` (or `QuestionnaireAnswerBar`) + `CommentStream` + `Composer`.

**Pull-in 1 (from Variant A):** When the thread has **no unresolved review or questionnaire message**, `ThreadHead` does not mount and the thread renders as a pure single-column flow (A's chat-shape). The `ThreadHostBanner` and `Composer` always render; the head is the conditional element. Decision is data-driven (off the messages), not a `kind` column.

**Pull-in 2 (from Variant C, bounded):** When the artifact in the head is heavy (multi-file `text_diff`, full-page `content_preview`, or `visual_comparison` with multiple variants), the user can promote it to a canvas+dock view via L11's `Open full artifact` affordance. The promoted view reuses B's `ReviewVerdictBar` as the verdict surface — slate's `CanvasEdgeToolbar` is rejected. Default render is always issue-shape; canvas is a *promoted state*, not a default mode.

---

## 2. Component family (the L1 deliverable)

These components ship in `packages/design-system/src/` at DS quality (storybook + tests + token-driven). The architect picks final filenames; the names below are the design contract.

### 2.1 `ThreadHostBanner` (always renders)

The top-of-thread strip. Communicates *what this thread is about* and *whether it needs action*.

| Slot | Source | Render |
|---|---|---|
| Host attachment label | `thread.host_kind` + resolved entity title | `BET · Pricing overhaul (Nimmly)` (mono caps, `--text-mid`) |
| Blocking indicator | `thread.blocking` (derived) | `StatusChip` with `blocked` status, plus a 2px `--danger` left border on the banner card |
| Resolved indicator | `thread.resolvedAt != null` | `Tag` reading `resolved` (`--text-mid`) |
| Pinned indicator | `thread.pinned` | inline pin glyph (lucide `pin`, 12px, `--text-mid`); never an emoji |
| Participants summary | `thread.participants[]` | up to 3 avatar circles, then `+N` |
| Right-aligned actions | n/a | a single `MoreActions` overflow button (snooze, escalate, archive — sidecar workflow ops, not message-emitting) |

Surface = `--surface-1`. Padding = `var(--density-pad-y) var(--density-pad-x)`. Bottom border = `--border-subtle`. The banner is sticky-positioned to the top of the scroll container so the host context stays visible during long scrolls.

### 2.2 `ThreadHead` (conditional — see §3 head-collapse predicate)

The substance message of an issue-shape thread. Mounts when an unresolved review or questionnaire message exists. Renders the substance message expanded with full structure.

| Slot | Source | Render |
|---|---|---|
| Sender chip | `message.sender` (resolved to identity + role) | avatar + name + role `Tag` |
| Posted-at + index | `message.created_at`, position in stream | `posted 18 min ago · message #N in thread` (`--text-lo`) |
| Title | `message.payload.title` | `--density-text-h2` weight 600, `--text-hi` |
| `REASONING` block | `message.payload.reasoning[]` (numbered) | mono caps label + numbered list (mono counters in `Tag` style, body in `--density-text` weight 500) |
| `ARTIFACT` block | `message.payload.artifact` (a ref handed to L11's `ArtifactView`) | mono caps label + the `ArtifactView` slot. L11 fills the slot (text_diff / content_preview / visual_comparison / action_summary / data_metrics). When the slot's content is heavy, L11 surfaces an `Open full artifact →` link inside the slot. |
| `QUESTION` block (questionnaire only) | `message.payload.question` | mono caps label + the question body, then the constrained answer set as primary buttons inside the head |

Surface = `--surface-2`. Padding = `var(--density-card-pad)` (8/12/16 across compact/default/comfortable per the K11 density tokens). `--r2` corner radius. The head is a single visual block — no internal shadows, no stacked cards.

### 2.3 `ReviewVerdictBar` / `QuestionnaireAnswerBar` (conditional, sticky)

The action surface for a head with an unresolved review or questionnaire. Sticks to the bottom of the head's scroll viewport so it stays one click away no matter how long the discussion grows.

`ReviewVerdictBar` slots (left-to-right):

| Group | Actions | Visual weight |
|---|---|---|
| **Verdict** label | `VERDICT` mono caps label | `--text-lo` |
| **Binding** | `Approve` (filled `--primary`) · `Approve with comments` (outline) · `Request changes` (outline) · `Edit` (outline) · `Reject` (outline + `--danger` text) | primary buttons; tabular order, 4px gap |
| **Reply** label | `REPLY` mono caps label | `--text-lo` |
| **Message-emitting non-binding** | `Comment` (ghost) · `Inline-comment` (ghost) · `Reply` (ghost) | ghost buttons; visually quieter |
| **Right-aligned sidecar** | `Snooze` (text-only link) · `Escalate` (text-only link) | tertiary text-only |

Sticky behavior: bar pins to the bottom edge of the scroll container while the head's `ARTIFACT` block is in view; releases (scrolls with content) once the user scrolls past the head into the comment stream. This is design's call; the architect picks the IntersectionObserver / scroll-position implementation.

`QuestionnaireAnswerBar` mirrors the structure but with the constrained answer set as primary buttons (one button per option, equal weight) and no Reject. Snooze/Escalate available.

A binding verdict click commits a `verdict`-payload message append (per concept §4.5.8) AND sets `resolvedAt` on the underlying review/questionnaire message. The bar collapses on resolve; the resolved verdict re-renders as a `CommentRow` in the stream with a `StatusChip` (`approved` / `rejected` / `requested-changes`).

### 2.4 `CommentStream` (always renders, takes full width when no head)

Chronological list of messages NOT in the head. Renders all plain messages, all comment / inline-comment / reply messages from review actions, and resolved verdict messages.

`CommentRow` slots (per message):

| Slot | Source | Render |
|---|---|---|
| Sender avatar + name | `message.sender` | 24px avatar, name in `--text-hi` weight 500 |
| Sender role | resolved | `Tag` (small) |
| Status badge (verdict messages only) | `message.payload.verdict` | `StatusChip` (`approved` / `rejected` / `requested-changes` / `non-binding`) |
| Timestamp | `message.created_at` | `--text-lo`, `tabular-nums`, `--mono` font |
| Body | `message.payload.text` (plain) or rendered markdown | `--density-text`, `--text-hi`, leading-body |
| Inline-comment anchor (inline-comment type only) | `message.payload.anchor` | mono caps `INLINE COMMENT ON: <anchor>` label above body, linking to the artifact location |

Sender-grouping rule (borrowed from A): consecutive messages from the same sender within 5 minutes show the sender header once and stack indented body blocks below. Date separators (`TODAY`, `YESTERDAY`, `MAR 12`) appear when the day changes.

Surface = `--surface-1`. Row padding = `calc(var(--density-pad-y) * 0.75) var(--density-pad-x)`. No row borders; spacing is the separator.

Overflow / older messages: when the stream exceeds 50 rows, the top is replaced with a `Show N earlier comments` row (mono, `--text-mid`). Click expands in-place.

### 2.5 `Composer` (always renders, pinned at floor)

The plain-message input. Always available — even on review threads, even on coach threads. Composer's affordances do NOT change per thread shape; the same composer renders everywhere.

Slots:
- A `<textarea>` with placeholder `Reply to thread…`. Auto-grows up to 6 lines, then scrolls.
- A right-aligned primary `Send` button (filled `--primary`).
- A small `attach` icon button (lucide `paperclip`) opens the inline-reference picker (knowledge item / task / artifact). The pick inserts a structured embed pill into the textarea.
- Below the textarea, when the most recent message is a review (and the user hasn't already verdict-ed), a single line: `Unresolved review · acting required ↑` — links the user back to the sticky `ReviewVerdictBar`. (Borrowed from A's mitigation; useful even with B's sticky bar for very tall mobile viewports where the bar may scroll out of view.)

Composer height ≈ `var(--density-row-h) * 2` minimum; expands on focus.

### 2.6 `ThreadShell` (the wrapper)

The composition root. Mounts `ThreadHostBanner` + (`ThreadHead` if predicate true) + `CommentStream` + `Composer` in a single scrollable column. Manages:
- Scroll-position memory across mount/unmount.
- The sticky behaviors of `ThreadHostBanner` (top) and `ReviewVerdictBar` (head-edge → released).
- The canvas-promotion transition: when L11 fires `onPromoteArtifact`, `ThreadShell` reflows from `single-column` to `canvas + dock` layout. The dock renders `CommentStream` + `Composer`; the canvas renders L11's full `ArtifactView` + the now-floating `ReviewVerdictBar` (still sticky to the dock's top, not the canvas).

The shell exposes a clear close affordance for promoted state (top-right `×` button on the canvas, or `Esc` key — `Esc` is keyboard-as-control, not a verb shortcut, so it's allowed).

---

## 3. Information hierarchy

When `ThreadHead` mounts (issue-shape):

1. **Title** of the head message — heaviest weight, largest type, top of the head block.
2. **Reasoning bullets** — numbered, easy to skim.
3. **Artifact preview** — the meat of what's being decided.
4. **Verdict bar** — sticky to the head's bottom edge until scrolled past.
5. **Comment stream** — quieter, chronological, a row per message.

When `ThreadHead` does NOT mount (chat-shape):

1. **Latest unread message** in the stream — sender + body, no group label.
2. **Older messages** — chronological, sender-grouped.
3. **Composer** at the floor.

The `ThreadHostBanner` is always visible above; it's the chrome that says *what this thread is about* and *whether it's blocking*. It does not compete with the substance.

---

## 4. All states

| State | Trigger | Render |
|---|---|---|
| **Empty (chat-shape, no messages)** | New thread, no messages yet | `ThreadHostBanner` + `EmptyState` ("No messages yet · be the first to post") + `Composer`. |
| **Empty (no thread selected — Conversations queue context)** | Submenu is open but nothing picked | Owned by L9 (the detail-route logic), not L1. L1's empty is "thread loaded, zero messages". |
| **Loading** | Initial fetch in flight | `ThreadHostBanner` skeleton + 3 `SkeletonRow`s in the stream area. The `ThreadHead` skeleton mounts only after the `messages` payload arrives (we don't know yet whether the head should mount). |
| **Error** | Fetch failed | `ThreadHostBanner` skeleton (the banner needs the host data) + `ErrorState` ("Failed to load thread · retry"). Composer hidden. |
| **Populated (issue-shape)** | head-collapse predicate true | The whole family. |
| **Populated (chat-shape)** | head-collapse predicate false | Banner + stream + composer; head omitted. |
| **Populated (resolved)** | `thread.resolvedAt` set, no further unresolved review/questionnaire | Banner shows `resolved` tag; head (if present) shows the original substance message with `RESOLVED` strip in place of the verdict bar; stream and composer render normally. The thread is reopen-able by appending a new review/questionnaire. |
| **Populated (overflow, >50 messages)** | stream length >50 | `Show N earlier comments` collapse row at top of the stream; later messages render normally. |
| **Promoted artifact (canvas+dock)** | L11 fires `onPromoteArtifact` | Two-column layout: canvas (~68% width) renders `ArtifactView` full; dock (~32%) renders `CommentStream` + `Composer`; sticky `ReviewVerdictBar` on dock top. Close button on canvas or `Esc`. |

---

## 5. Behavior

| Aspect | Spec |
|---|---|
| Hover | rows lift to `--surface-4` background on hover with `var(--motion-fast)` transition. Composer focus ring at `--primary` 1px. |
| Focus | every interactive element has a visible focus ring (`outline: 1px solid var(--primary)` with `outline-offset: -1px`). Tab order: HostBanner actions → head verdict bar → comment composer → stream rows (interactive only — verdict messages, inline-comment anchors). |
| Focus return | (a) when the head **mounts** mid-stream (a review/questionnaire arrives), focus stays where the user had it — focus is NOT stolen to the new head. (b) when the head **collapses** because its review resolves (binding verdict committed), focus moves to the just-emitted verdict `CommentRow` in the stream so the user keeps a reading anchor. (c) when the canvas **promotes**, focus moves to the canvas's close button. (d) when the canvas **closes**, focus returns to the `ArtifactView` slot inside the head. All four transitions announce via `aria-live="polite"`. |
| Scroll | the scroll container is the `ThreadShell`. The `ThreadHostBanner` and `ReviewVerdictBar` are sticky within it. Initial scroll position: bottom (latest) for chat-shape, top (head visible) for issue-shape. Subsequent mounts restore previous scroll position. |
| Transitions | layout shape change (head mount/unmount, canvas promote/demote) animates over `var(--motion-medium)` using `transform` + `opacity` only. `prefers-reduced-motion: reduce` swaps to instant. `aria-live="polite"` announces shape changes. |
| Keyboard | NO verb shortcuts (founder-rejected). `Esc` closes promoted canvas. `Tab` navigates as above. `Cmd+Enter` (or `Ctrl+Enter`) submits the composer — this is universal-app convention, not a verb shortcut. |
| Optimistic UI | NONE. Composer disables on submit, enables on server ack, surfaces a clear error on failure. Verdict bar same — no optimistic checkmarks. (Founder-rejected.) |

---

## 6. Mobile adaptation

Mobile = the Conversations tab in the three-tab mobile layout (`docs/concept/HUMAN_INTERFACE_LAYER.md` §3.2).

- Default thread render: single column, full width.
- `ThreadHostBanner` collapses to one row (host label + blocking indicator + overflow menu).
- `ThreadHead` (when present) renders full-width with reasoning, artifact, and verdict bar stacked vertically. Verdict bar pins to the floor (above the composer) instead of the head's bottom edge — the head fills the screen and the verdict is always reachable.
- `CommentStream` flows below.
- `Composer` always at the floor; expands on tap.
- Promoted artifact: triggers a two-tab segmented control at the top — `Artifact` | `Discussion (N)`. The verdict bar rides into the Artifact tab as a bottom action bar with binding verdicts horizontally laid out.
- Touch targets ≥44px on every interactive element (verdict buttons, sender names, inline-comment anchors).

---

## 7. Component mapping (existing DS components)

| L1 component | Existing DS components used |
|---|---|
| `ThreadHostBanner` | `StatusChip` (blocking), `Tag` (resolved), avatar primitive, `IconButton` (overflow) |
| `ThreadHead` | `Tag` (sender role, REASONING/ARTIFACT/QUESTION labels) |
| `ReviewVerdictBar` | DaisyUI `btn` (primary/outline/ghost), `Tag` (mono caps labels) |
| `QuestionnaireAnswerBar` | DaisyUI `btn`, `Tag` |
| `CommentRow` | `StatusChip` (verdict status), `Tag` (sender role), avatar primitive |
| `Composer` | DaisyUI `textarea`, `btn`, `IconButton` |
| `ThreadShell` | `EmptyState`, `ErrorState`, `SkeletonList` (loading) |

ThreadRow (already in DS) is unchanged — it's the Submenu list-row primitive, not part of L1's detail family.

---

## 8. Behavior contracts and invariants

These are design-level contracts. The architect implements them; they cannot be relaxed.

1. **The shape decision reads off the messages.** The `Thread` row carries no `kind` column. `ThreadHead` mounts iff there exists a message in the thread of type `review` or `questionnaire` whose `resolvedAt` is null AND that message is the most recent of its kind in the thread.
2. **A binding verdict click emits a `verdict`-payload message** (concept §4.5.8). The verdict surface (sticky bar) collapses on resolve; the resolved verdict re-renders as a `CommentRow` with a `StatusChip`. The bar does not preserve "approve" state across renders — what the user sees is the message stream.
3. **Sender-grouping in the stream is presentational** — the underlying messages remain individually addressable for inline-comment anchors and audit ids.
4. **The composer's "Unresolved review · acting required" rule appears iff** the most recent message in the thread is an unresolved review/questionnaire. It is NOT a duplicate of the sticky bar; it is a fallback when the sticky bar has scrolled out of view (rare on desktop, common on mobile).
5. **The host-attachment label is a link.** Clicking the label navigates to the host's detail surface (the bet, the task, the knowledge item, the artifact). For `host_kind = user`, no navigation — it's the user's own coach thread.
6. **Pinning is a configuration, not a verdict.** A pinned thread sorts to the top of any list rendering it; pinning is mutated by an explicit `Pin / Unpin` action in the `MoreActions` overflow.

---

## 9. Open questions deferred to the architect

These come from `synthesis.md` §"Three open questions for the architect" — listed here so they don't get forgotten. The architect resolves each in the L1 plan.

1. **Head-collapse predicate type contract.** TypeScript predicate; edge cases for resolved-review-still-mounted vs re-collapse, and for multiple unresolved review messages.
2. **Inline `ArtifactView` slot prop contract.** Whether L1 passes `artifact_ref` and L11 fetches, vs. L1 fetching and passing the rendered preview. Plus the focus return contract on canvas close.
3. **Mobile fallback when canvas is requested.** Whether `Open full artifact` exists on mobile or the artifact always promotes; verdict bar's behavior in the Artifact tab.

---

## 10. What this design does NOT specify (architect decides)

- Exact field names on the `messages` and `threads` rows (the schema in `ARCHITECTURE.md` §2.1 and SHARED.md is illustrative; architect picks final shapes).
- Endpoint paths for fetching threads, listing messages, posting messages, commiting verdicts.
- The TypeScript discriminant exhaustiveness implementation for message-type dispatch.
- The IntersectionObserver / scroll-position implementation for sticky behaviors.
- Any specific React state library or query strategy.
- The migration sequencing for legacy `responses` table → verdict-payload messages (the SHARED.md migration policy is the rule; the architect picks step ordering).

---

## 11. Locked rejection list (do not re-litigate)

- Any thread `kind` discriminant.
- Verdict surface = anything other than B's sticky `ReviewVerdictBar` (no inline-only, no seam toolbar, no per-mode forks).
- Canvas+dock as a default render.
- Keyboard verb shortcuts.
- Optimistic UI.
- Emoji reactions / iconography.
- Drag-reorder of messages or threads.
- Customizable view kits / saved layouts.

The L11/L12/L18/L26 stories that consume L1 inherit this rejection list; do not introduce any of these in downstream stories without a concept-doc update first.
