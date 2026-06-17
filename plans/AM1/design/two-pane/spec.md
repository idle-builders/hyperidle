# AM1 Conversation — Variant B: "Two-Pane / embeds open to the side"

Power-density embodiment of the locked Part model. Files: `packages/web/src/components/Am1ConversationTwoPane.tsx` + `.stories.tsx`.

## User workpackage
The founder scans a dense agent+human thread and pulls a referenced thing (diff, plan, session) into a side panel to inspect it — without losing their place in the column.

## Component composition (production reuse mapping)
Hand-rolled here for render reliability; each slot maps to a catalogued component the builder wires in green:

| Slot (this file) | Production component | Notes |
|---|---|---|
| `PartRow` (avatar gutter + sender line + body) | `CommentRow` (`packages/design-system`) | The Part renderer for `plain`/`verdict`; sender-grouped, mention-aware. |
| `ReviewPart` (titled card + folded reasoning + verdict bar) | `RichMessageCard` | `state.phase` idle/saving/error; `resolved` echo; `verdictDecisionLabel`/`verdictDecisionToStatus`. |
| `Fold` | generalized fold device (NEW small) | Lift `RichMessageCard`'s reasoning fold to any Part. UI-local state, never persisted. |
| `Avatar` | `Avatar` / `AvatarGroup` | Agent tint via accent token. |
| `ReferenceChip` | NEW small (the variant signature) | Composes `Tag` + `KeyValue` shapes; one chip per embed kind. |
| Chip "Approved" / kind pill | `StatusChip` / `Tag` + `TAG_KIND_ICONS` | |
| `PanelDiff` | `ArtifactEmbed` + `ArtifactPreview` + `kinds/code-renderer` | Full `text_diff` view lives in the panel. |
| `PanelBlock` | `BlockRefEmbed` (web) → `Block` + `renderPayload` | Referenced knowledge item, rendered. |
| `PanelSession` | NEW small (Session-reference) | Composes `KeyValue` + `Button` (+ `LiveDot` if live). Reference card + "Open dial-in" — NOT `SessionActivityPanel` (that is AM3's stream). |
| `ContextualPanel` chrome + tabs | `TabBar` (underline) + SessionActivityPanel `<aside>` chrome | Mirror the existing right-pane border/header pattern. |
| `Composer` | `Composer` | textarea + send, Cmd/Enter; NO model/effort pills. |
| `HostBanner` | `ThreadHostBanner` | |
| `StateMessage` | `EmptyState` / `SkeletonList` / `ErrorState` | |

## Information hierarchy
**Left column (scannable index):**
1. Host banner — kind pill + host title + participant count (terse).
2. Founder ask (plain Part) — body text, time hover-revealed.
3. Atlas work (plain + Fold) — folds to one line "Worked for 1m 12s · 14 steps".
4. Atlas + artifact-diff chip — one-line "auth/passkey.ts · +124 −18".
5. Atlas + referenced-block chip — "Auth migration plan · §2".
6. Atlas + session-reference chip — "Session · Atlas · Opus 4.8 · $0.42 · 14".
7. Review Part — Review pill + title; folded reasoning; diff chip; verdict bar.
8. Founder verdict — one-line "Approved · note" (review resolves).
9. Composer — pinned bottom.

**Right contextual panel (substance):**
1. Header — "Reference" label + close (×).
2. Tab bar — Diff / Plan / Session (addressable, thread-scoped).
3. Body — full diff (Diff) / rendered block §2 (Plan) / reference card + meta + "Open dial-in" (Session).

## All states
- **Empty** — `EmptyState`: "No messages yet" / "Start the conversation — send a message below." Panel closed. Composer present.
- **Loading** — three skeleton Part rows (avatar circle + 2 lines). Panel closed.
- **Error** — "Couldn't load this conversation" + Retry. Panel closed.
- **Populated · panel-closed** — full column, full width, no panel; chips inactive.
- **Populated · panel-open** (story default, tab=Diff) — column narrows, panel shows full diff; the opening chip + review diff chip carry the active accent border/fill.
- **Overflow** — column scrolls independently (`overflow-y-auto`); panel body scrolls independently; long agent units Fold to one line; embeds stay one-line chips so the column never becomes a wall.

## Behavior
- **Hover** — Part row gets `--surface-container`; sender time fades in (`--motion-fast`); chip chevron opacity rises.
- **Chip → panel selection** — clicking a `ReferenceChip` sets the panel tab to that embed kind and opens the panel; the active chip shows accent border + `--accent-primary-dim` fill (`aria-pressed`). Re-clicking another chip switches the tab in place.
- **Panel slide** — panel mounts with `transition-transform duration-[var(--motion-default)]`; close (×) unmounts. Tabs switch with no slide (instant content swap).
- **Fold** — chevron rotates 90° (`--motion-fast`); expands reasoning/work body; collapses by default.
- **Keyboard / focus** — all chips, tabs, verdict buttons, close, send are real `<button>`/`<textarea>` → native tab order column-then-panel; Composer Cmd/Enter (production `Composer`); panel close returns focus to the triggering chip (builder).
- **Verdict bar** — Approve (filled accent) / Request changes / Reject; resolved review shows the "Approved by … · 0 min ago" echo instead.

## Mobile adaptation (critical for this variant)
The two-pane layout cannot coexist on the 3-tab mobile shell. The contextual panel **promotes to a full-screen overlay sheet**, not a side column: a chip tap pushes the panel over the column (slide-up or slide-from-right, `--motion-default`); the header × (or back) returns to the column with focus restored to the chip. The column stays the single scroll surface; chips and Folds keep the column short enough that the overlay is the only place heavy content renders — which is exactly the desktop contract, just stacked instead of side-by-side. No content is lost; only the simultaneity is.

## Signature
The right contextual panel + chip→panel embedding: the column stays a terse scannable index of Parts, and the substance (full diff, rendered plan, session reference) lives in an addressable tabbed panel to the side. Maximum messages-per-screen; embeds never bloat the column.

## Trade-offs
- **Needs a wide layout** — two panes want ≥~1024px; below that the panel must overlay (mobile contract above), losing side-by-side context.
- **Extra surface** — one more region to render, focus-manage, and keep in sync with the column's active chip; more state (open + tab) than the single-column siblings.
- **Mobile cost** — the side-by-side affordance degrades to a modal sheet; the "pull it up without losing place" benefit is weaker on mobile than on desktop, where it is strongest. The variant is desktop-optimal by design.
