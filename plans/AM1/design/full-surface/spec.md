# AM1 — Conversation v3: Full Surface (C) — Design Spec

Supersedes the rejected v1/v2 thin-column variants (QuietStream / Quiet Turns / Calm Document). This is the v3 foundation embodied in the real app container, per `plans/AM1/design/brief-v3.md`.

**Story:** `AM1 Conversation — Full Surface (C)` / `Populated`. Renders at desktop width on `--surface-page`.
**Component:** `packages/web/src/components/Am1ConversationSurface.tsx` (`data-ds-component="Am1ConversationSurface"`).

> **Revision (v3.2) — THE CONVERSATION IS THE SURFACE.** Scope = the OPEN conversation, i.e. the open thread's content. A **conversation IS a thread** — settled in the schema: `conversationId === threadId`; messages carry one `threadId` with no sub-thread / parent column. A thread attaches to exactly ONE host (bet/task/user/team/agent/artifact/knowledge_item/factory). There are **no Slack-style sub-threads**.
>
> **Navigating BETWEEN threads is the app sidebar (`SidebarV2`, AD9)** — app-shell chrome, NOT part of this design. The v3.1 left "inbox / thread-list" pane WAS that app sidebar and has been **removed**. What remains is the conversation itself: header (thread identity) · author-grouped messages · composer · an on-demand right context pane (default closed).

---

## User workpackage

A founder (A. Founder) opens the **Passkey login** conversation. A teammate (Mara) has flagged a constraint; the agent (Atlas) has done the work, summarized it deliberately, embedded the reviewable change set, cited its sources, attached a diagram, referenced the work session, and asked for a verdict. The founder reads the grouped exchange, opens the change set in the right pane, and approves. **Decision being made:** is this change set safe to ship to staging? The surface surfaces that decision (a single verdict on the change set) and never makes the founder do agent work (read the raw work-log inline).

---

## Anatomy — the conversation (+ on-demand pane)

The surface IS the open conversation. It fills the app main pane (to the right of the app sidebar, which this design does NOT render). One flex column: header · scrolling message list · pinned composer. The diff pane opens to the right on demand.

| Region | Width | Role |
|---|---|---|
| **Conversation header** | full pane | Carries thread identity so "what is this conversation" is clear without a sidebar: host chip **"Bet · Passkey login"** + title + 3 participant avatars (A. Founder, Mara, Atlas) + quiet actions ⋯. Header content is centered to the reading column. `--surface-page`. |
| **Message list** | reading column ~740px, centered | Primary. Author-grouped messages (avatar + name + time at group heads; human vs agent distinct; own-message cue for A. Founder), @mentions, a reaction, the work-Fold, the CHANGE SET embed (opens → + citation sources), referenced-item embed, attachment chip, review → verdict. Own scroll (`minHeight:0; overflowY:auto`). `--surface-page`. |
| **Composer** | reading column ~740px, centered | Bottom-pinned. Reply banner · attachment chip · `+` · textarea · Send · formatting strip · Enter hint. `shrink-0` so it never scrolls away. |
| **Change-set / diff pane** | 420px | **DEFAULT CLOSED.** Opens on demand when a change-set Embed is clicked (push/overlay): header (`auth/passkey.ts` +124/−18 + close), tab strip (Diff / Files / Session), syntax-gutter diff body. The story renders the default state: pane closed; the CHANGE SET embed keeps its "opens →" affordance. `--surface-container`. |

**Thread navigation (between conversations) is the app sidebar (`SidebarV2`, AD9) — out of this design's scope.** The earlier inbox / thread-list left pane was that sidebar and is removed.

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
| 2 | "spacing / grouping / structure / layering — everything; blobs; memory game" | Author-**grouping** is the structural unit (not per-line styling, not disconnected blobs). Consecutive same-author messages collapse under one head (Atlas 9:11→9:12 group). Consistent 6px intra-group / 6px inter-group rhythm on the Hearth grid; generous group padding (12px/9px). One alignment grid (avatar gutter + 740px reading column). No box-per-message. |
| 3 | "what's a thread vs a conversation; where would I jump in; why TASK floating alone" | Header shows host as a labeled chip **"Bet · Passkey login"** with the full participant set — the conversation IS the thread attached to one host, made legible. No cryptic bare "TASK" label. ("Where do I jump in" — the conversation-list navigation — is the app shell's job, out of this design's scope.) |
| 4 | "composer is a stub — no send/attach/format/tools; not centered" | Full composer anatomy: optional **banner** (Replying to Atlas ✕), **attachment-chip row** (auth-flow.png 82 KB, removable), input row `[ + | textarea "Message Atlas, Mara…" | Send ]`, a **formatting strip** (bold/italic/code/link · @mention · attach) + an Enter/Shift+Enter hint, real **Send** button (accent). Centered in a 740px column matching the message column. **No** model/effort/mode pills (those are AM3 dial-in). |
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

**New components introduced:** `ReactionBar`, `Fold`, `SessionRefEmbed`, `CitationChips`, `AttachmentChip`, `ContextPane`. Each is reused in 2+ contexts or is a concept primitive (Fold, the Embed satellite) — within the component budget. No new tokens. **Thread navigation (the conversation/thread list) is NOT in this design** — it is the app sidebar (`SidebarV2`, AD9), owned by the app shell.

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

- **Thread navigation excluded — the conversation IS the surface:** the inbox / thread-list (navigating between threads) is the app sidebar (`SidebarV2`, AD9), app-shell chrome that lives elsewhere. The v3.1 left pane was that sidebar; v3.2 removes it so the design is just the open conversation. Cost: this story does not show the "where do I jump in" navigation — correct, the app shell owns it; here the conversation header carries thread identity instead. Benefit: the conversation reading column + contextual pane get the full main-pane width and are judged as the focused surface they are in production.
- **Hand-rolled chrome vs importing `Composer`/DS components:** chose hand-rolled for a guaranteed standalone render in the viewer (no router/AppShell context). Cost: the spec must carry the reuse mapping (above) so the builder doesn't ship the hand-rolled copies. Benefit: the founder reviews the real composition without infra risk.
- **Change-set / diff pane DEFAULT CLOSED:** v3 shipped it open, which crowded the surface. It now defaults closed and opens on demand when the CHANGE SET embed is clicked (push/overlay), with the source↔destination accent tie shown on open. Cost: the story no longer shows the open diff state by default — acceptable, the embed's "opens →" affordance plus the open-destinations table carry the relationship.
- **Reactions/attachments rendered though schema-absent:** per inventory §9 these need Message-schema growth beyond AM1's render scope. Shown here as the design target (spec scenarios may name surfaces not yet reachable — [[memory]]); the builder gates them behind the schema work, not this story.
- **Own-message cue = faint tint, not a bubble:** keeps the no-bubbles Slack model (annotation 1) while still answering "what's mine." Risk: 3% tint is subtle in light mode; paired with the "You" label so it never relies on color alone.
- **Density:** 12px/9px group padding, 6px rhythm — denser than v2's barren wall, calmer than per-message cards. The single bordered card (the review) earns its weight as the one decision.

---

## Render risk (could not verify — viewer not run)

- `color-mix(in oklab, var(--accent-primary) 3%, transparent)` own-message tint may read as near-invisible in light mode; the "You" label is the non-color fallback. Builder should confirm in the `:8100` viewer and bump to 4% if needed (4% is the established sidebar-hover value).
- Inline `✕` close glyphs are text, not icons — acceptable for a design embodiment; production uses an icon button.
- The hand-rolled icon `d` paths (bold/italic/code/link/at) are approximations for render; production reuses real DS/Heroicon glyphs.
