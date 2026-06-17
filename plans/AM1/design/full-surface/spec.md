# AM1 — Conversation v3: Full Surface (C) — Design Spec

Supersedes the rejected v1/v2 thin-column variants (QuietStream / Quiet Turns / Calm Document). This is the v3 foundation embodied in the real app container, per `plans/AM1/design/brief-v3.md`.

**Story:** `AM1 Conversation — Full Surface (C)` / `Populated`. Renders at desktop width on `--surface-page`.
**Component:** `packages/web/src/components/Am1ConversationSurface.tsx` (`data-ds-component="Am1ConversationSurface"`).

> **Revision (v3.1) — show HOW THREADS WORK.** Founder feedback on v3: "looks better, but I don't see how threads work." The settled model is NOT changed — it is made legible. A *thread* = a conversation attached to ONE host (bet/task/knowledge_item/artifact/agent/user/team/factory), flat, no sub-threads. You have MANY threads; you see/switch them via the **conversations inbox** (a sectioned, ordered thread list). "How threads work" in the UI = **the inbox (thread list) | the open thread (conversation)** — the canonical two-pane. This revision adds the inbox as the LEFT region.
>
> **The LEFT region is the conversations inbox / thread list — NOT the app-shell global nav.** It is the thread inbox that answers "what needs me / which thread is open." The app-shell global Conversations/Work/Knowledge nav + founder identity row is separate chrome that lives elsewhere and stays OUT of this design. The thread inbox is in-scope because it IS how threads work.

---

## User workpackage

A founder (A. Founder) opens the **Passkey login** conversation. A teammate (Mara) has flagged a constraint; the agent (Atlas) has done the work, summarized it deliberately, embedded the reviewable change set, cited its sources, attached a diagram, referenced the work session, and asked for a verdict. The founder reads the grouped exchange, opens the change set in the right pane, and approves. **Decision being made:** is this change set safe to ship to staging? The surface surfaces that decision (a single verdict on the change set) and never makes the founder do agent work (read the raw work-log inline).

---

## Two-region anatomy (+ on-demand pane)

| Region | Width | Role |
|---|---|---|
| **Conversations inbox / thread list** | ~300px | The sectioned, ordered thread list — how threads work. Compact search/jump field at top, then thread rows (emulate `ThreadRow`: unread dot · title · host pill · snippet · overlapping participant avatars [agent-tinted] · message-count badge · blocking badge · timestamp · selected/pinned). Sections + ordering = **assistant/pinned → blocking reviews → non-blocking reviews → chats → resolved** (conversations-view §2.1). Host pills span `user`/`bet`/`task`/`knowledge_item`/`team`/`agent`/`artifact` so multi-host threading is visible. The active row ("Passkey login", host: bet) renders `selected`. Own scroll. `--surface-container`. |
| **Conversation pane** | flex-1 | Primary. Conversation header (host chip + title + 3 participant avatars + actions ⋯) over the grouped message list (centered ~680px reading column) over the bottom-pinned composer. `--surface-page`. |
| **Change-set / diff pane** | 420px | **DEFAULT CLOSED.** Opens on demand when a change-set Embed is clicked (push/overlay): header (`auth/passkey.ts` +124/−18 + close), tab strip (Diff / Files / Session), syntax-gutter diff body. Closing it reclaims width for the conversation. `--surface-container`. The story renders the default state: inbox | conversation, pane closed; the CHANGE SET embed keeps its "opens →" affordance. |

The app-shell global nav (Conversations/Work/Knowledge + founder identity) is intentionally absent — that is app-shell chrome, distinct from the thread inbox here.

---

## Information hierarchy (numbered)

1. **The pending decision** — the Review part ("needs your decision") + verdict buttons is the heaviest unit (the only bordered+shadowed card in the stream). It is where the eye lands.
2. **The change set under review** — the diff embed inside the review, mirrored open in the right pane (accent border ties embed ↔ destination).
3. **Author groups** — avatar + name + time at each group head; the structural rhythm of the column.
4. **Agent summary content** — prose + work-Fold + embeds + citations, calm and foldable.
5. **Conversation framing** — header host chip ("Bet · Passkey login") + participants.
6. **Composer chrome** — present and complete, but visually quiet until focused (shadow lifts on `focus-within`).

(Navigation between conversations is owned by the app shell, out of this design's scope.)

---

## How each annotated gap is addressed (maps to brief-v3 §"annotated gaps")

| # | Founder annotation | Fix in this design |
|---|---|---|
| 1 | "who wrote what / me vs them / multiple users" | Single column, NO bubbles. Identity (avatar + name + time) at each **author-group head**. 3 participants (A. Founder, Mara, Atlas). Human vs agent: agents get the green-tinted avatar + an "Agent" pill at the head. **Own-message cue:** A. Founder's groups carry a faint 3% accent tint + a quiet "You" label. Mara proves a second human reads distinctly from "me." |
| 2 | "spacing / grouping / structure / layering — everything; blobs; memory game" | Author-**grouping** is the structural unit (not per-line styling, not disconnected blobs). Consecutive same-author messages collapse under one head (Atlas 9:11→9:12 group). Consistent 6px intra-group / 6px inter-group rhythm on the Hearth grid; generous group padding (12px/9px). One alignment grid (avatar gutter + 760px reading column). No box-per-message. |
| 3 | "what's a thread vs a conversation; where would I jump in; why TASK floating alone" | Header shows host as a labeled chip **"Bet · Passkey login"** with the full participant set — the conversation IS the thread attached to one host, made legible. No cryptic bare "TASK" label. ("Where do I jump in" — the conversation-list navigation — is the app shell's job, out of this design's scope.) |
| 4 | "composer is a stub — no send/attach/format/tools; not centered" | Full composer anatomy: optional **banner** (Replying to Atlas ✕), **attachment-chip row** (auth-flow.png 82 KB, removable), input row `[ + | textarea "Message Atlas, Mara…" | Send ]`, a **formatting strip** (bold/italic/code/link · @mention · attach) + an Enter/Shift+Enter hint, real **Send** button (accent). Centered in a 760px column matching the message column. **No** model/effort/mode pills (those are AM3 dial-in). |
| 5 | "embeds — if I open this, where do I end up?" | Every embed names its kind ("Change set" / "Referenced item" / "Session") and has a defined destination (table below). The **diff embed opens the right contextual pane** — shown OPEN, with an accent border on both the embed and the pane header tying source↔destination. Citations are source chips; the attachment is a file chip; the session reference opens the AM3 dial-in (never inlines the work-log). |
| 6 | "message actions" | Hover toolbar (React · Reply · ⋯) anchored top-right of each group; shown live on the Atlas review group (`hovered`) so the founder sees it, and `group-hover/msg:flex` on the rest. Reactions render as a pill stack under Mara's message. |
| 7 | "show it in the real app container" | The surface is the conversation pane + contextual right pane, framed inside the app window — not a floating column. (The app-shell sidebar that wraps it is out of this design's scope; see Scope note.) |

---

## Component composition (production reuse mapping)

Hand-rolled here for guaranteed standalone render in the viewer. The builder maps each slot to the catalogued component:

| Hand-rolled slot | Production component | Notes |
|---|---|---|
| Avatar / participant group | `Avatar` + `AvatarGroup` (DS) | Drop-in; agent tint already in `Avatar agent`. |
| Conversation header | `PageHeader` + `Tag` (host chip) + `AvatarGroup` | `PageHeader` subtitle already renders `Tag + host link` (see `Conversations.tsx`). Add the participant `AvatarGroup` to `actions`. |
| Message group head + body | `ThreadShell` + `CommentRow` | `computeSenderGrouping` (already exported from `ThreadShell`) drives author-grouping. `CommentRow` renders identity + body; needs the **own-message cue**, **Agent pill**, and **hover toolbar** added (new, but reused across every conversation → in-budget). |
| Prose / mention | `CommentRow` + `MentionRef` segment render | `segmentMentions` already exists (per `thread.ts` AE5 lore). |
| Reactions | **New `ReactionBar`** | Needs Message-schema work (out of AM1 render scope per inventory §9); render-only here. Used on every message → in-budget. |
| Fold (work summary) | **New `Fold`** device | The concept's load-bearing calm device; reused in conversation + session view (AM3). |
| Embed (diff / block / session) | `ArtifactEmbed` (diff), `BlockRefEmbed` (referenced item), **new `SessionRefEmbed`** | Concept's closed Embed set. Diff → `ArtifactEmbed` `text_diff`; block → existing `BlockRefEmbed`; session → new satellite Embed. |
| Citation chips | **New `CitationChips`** | Source/provenance row. Reused wherever an agent cites (conversation + knowledge) → in-budget. |
| Attachment chip | **New `AttachmentChip`** | File/image attachment. Reused in composer + message → in-budget. |
| Review part + verdict buttons | `RichMessageCard` + `Button` | `RichMessageCard` already owns the review card + verdict bar + `verdictDecisionLabel`. Reuse directly. |
| Verdict echo | `CommentRow` verdict terminator | Existing. |
| Composer | `Composer` (DS) | Extend with banner + attachment-chip row + formatting strip. The DS `Composer` is the single owner — do not hand-roll a second one. |
| Right contextual pane | `shell/ArtifactView` + `TabBar` | `ArtifactView` already renders kind-dispatched previews; `TabBar` for Diff/Files/Session. Mounts in a 420px right region (new `ContextPane` shell wrapper, mirrors the existing dial-in split in `Conversations.tsx`). |

| Conversations inbox / thread row | `ThreadRow` (DS) in a scroll column | The inbox rows are a hand-rolled mirror of the catalogued `ThreadRow` (unread dot · title · `hostTag` host pill · snippet · `avatars` overlapping group · `messageCount` badge · `blocking` badge · `selected`/`pinned` · timestamp). The builder maps each row back to the real `ThreadRow`; the section headers + search/jump field wrap it. This is the thread inbox, NOT the app-shell global nav. |

**New components introduced:** `ReactionBar`, `Fold`, `SessionRefEmbed`, `CitationChips`, `AttachmentChip`, `ContextPane`. Each is reused in 2+ contexts or is a concept primitive (Fold, the Embed satellite) — within the component budget. The inbox reuses the existing `ThreadRow` (no new row component). No new tokens. (The app-shell global Conversations/Work/Knowledge nav is out of scope — owned by the app shell; the inbox here is the thread list.)

---

## Embed open-destinations table

| Embed kind | Renders | Opens (destination) |
|---|---|---|
| Change set (diff) | `auth/passkey.ts` +124/−18 | **Right contextual pane** — Diff/Files/Session tabs (shown open). |
| Referenced item (block) | Plan §2 title + snippet | The referenced item in place (Knowledge / host surface). |
| Session reference | Atlas · Opus 4.8 · 1m 12s · 14 tool calls | **AM3 session dial-in** (lower-level). NEVER an inlined work-log. |
| Citation / source chip | Numbered source label | The source (external URL or internal doc). |
| Attachment (file/image) | File chip + size | Preview / download. |
| @mention | Inline accent chip | The mentioned identity (profile / agent). |

---

## Behavior

- **Hover:** message group reveals the React · Reply · ⋯ toolbar (top-right). Embed reveals its open-arrow at full opacity. Demo renders the toolbar live on the review group.
- **Focus:** composer card lifts shadow on `focus-within`; verdict + tool buttons have `focus-visible` accent outline.
- **Keyboard (production target):** composer Enter sends · Shift+Enter newline · ⌘/Ctrl+Enter always-send · ↑ edits last; `@` opens mention autocomplete, `/` opens command menu, `:` opens emoji typeahead. Right pane closes on Escape.
- **Composer:** disabled-when-empty Send; attachment via `+`, drag-drop, paste; formatting strip toggles markdown.
- **Fold:** collapsed by default showing the one-line summary ("Worked for 1m 12s"); expands to the summary detail with a left rule. UI-local state, never persisted (concept hard rule 2).
- **Right pane:** open state driven by the active embed; the source embed and the pane header share an accent border so the source↔destination link is visible.

---

## Mobile adaptation (conversation → tab; right pane → sheet)

Per `docs/information-architecture/` (mobile = three tabs). This design owns only the conversation tab and its contextual pane; the conversation-list tab is the app shell's:

- **The conversation:** the conversation pane fills the screen. Header collapses host chip + participants into one line. The composer stays bottom-pinned (formatting strip behind the `+`/`Aa` to save height; ≥16px input font per AQ-005; ≥44px touch targets per AQ-015).
- **Right pane → sheet:** opening an embed pushes the contextual pane as a full-screen route (or a bottom sheet for short content), not a side-by-side column. Back returns to the conversation.
- Author-grouping, identity, own-message cue, verdict, and embeds are unchanged — the reading column already is the mobile column.

---

## Trade-offs

- **Sidebar excluded from this design:** the app-shell sidebar (conversation list + nav) is app-shell chrome that lives elsewhere, not part of the conversation. Dropped here so the conversation gets the viewer width (the design-system viewer can't accommodate the full app-shell width). Cost: this story does not show the "where do I jump in" navigation — acceptable, the app shell owns it. Benefit: the conversation reading column + contextual pane get the room they need to be judged at real density.
- **Hand-rolled chrome vs importing `Composer`/DS components:** chose hand-rolled for a guaranteed standalone render in the viewer (no router/AppShell context). Cost: the spec must carry the reuse mapping (above) so the builder doesn't ship the hand-rolled copies. Benefit: the founder reviews the real composition without infra risk.
- **Change-set / diff pane DEFAULT CLOSED:** v3 shipped it open, which crowded the surface into too-wide a 3-region layout. v3.1 defaults it closed and reclaims that width for the inbox + conversation; it opens on demand when the CHANGE SET embed is clicked (push/overlay), with the source↔destination accent tie shown on open. Cost: the story no longer shows the open diff state by default — acceptable, the embed's "opens →" affordance plus the open-destinations table carry the relationship.
- **Inbox over app-shell nav:** the LEFT region is the conversations inbox (thread list), the literal answer to "how threads work" — many threads, across hosts, sectioned/ordered, with the open one highlighted. The app-shell global nav stays out. Cost: ~300px of width; benefit: the founder sees the inbox | conversation two-pane that IS the thread model.
- **Reactions/attachments rendered though schema-absent:** per inventory §9 these need Message-schema growth beyond AM1's render scope. Shown here as the design target (spec scenarios may name surfaces not yet reachable — [[memory]]); the builder gates them behind the schema work, not this story.
- **Own-message cue = faint tint, not a bubble:** keeps the no-bubbles Slack model (annotation 1) while still answering "what's mine." Risk: 3% tint is subtle in light mode; paired with the "You" label so it never relies on color alone.
- **Density:** 12px/9px group padding, 6px rhythm — denser than v2's barren wall, calmer than per-message cards. The single bordered card (the review) earns its weight as the one decision.

---

## Render risk (could not verify — viewer not run)

- `color-mix(in oklab, var(--accent-primary) 3%, transparent)` own-message tint may read as near-invisible in light mode; the "You" label is the non-color fallback. Builder should confirm in the `:8100` viewer and bump to 4% if needed (4% is the established sidebar-hover value).
- Inline `✕` close glyphs are text, not icons — acceptable for a design embodiment; production uses an icon button.
- The hand-rolled icon `d` paths (bold/italic/code/link/at) are approximations for render; production reuses real DS/Heroicon glyphs.
