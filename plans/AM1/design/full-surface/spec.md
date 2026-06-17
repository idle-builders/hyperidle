# AM1 — Conversation v3: Full Surface (C) — Design Spec

Supersedes the rejected v1/v2 thin-column variants (QuietStream / Quiet Turns / Calm Document). This is the v3 foundation embodied in the real app container, per `plans/AM1/design/brief-v3.md`.

**Story:** `AM1 Conversation — Full Surface (C)` / `Populated`. Renders at ~1440px desktop width on `--surface-page`.
**Component:** `packages/web/src/components/Am1ConversationSurface.tsx` (`data-ds-component="Am1ConversationSurface"`).

---

## User workpackage

A founder (A. Founder) opens the **Passkey login** conversation. A teammate (Mara) has flagged a constraint; the agent (Atlas) has done the work, summarized it deliberately, embedded the reviewable change set, cited its sources, attached a diagram, referenced the work session, and asked for a verdict. The founder reads the grouped exchange, opens the change set in the right pane, and approves. **Decision being made:** is this change set safe to ship to staging? The surface surfaces that decision (a single verdict on the change set) and never makes the founder do agent work (read the raw work-log inline).

---

## Three-region anatomy

| Region | Width | Role |
|---|---|---|
| **Left sidebar** | 264px | Conversation list — search, three section rows (Conversations active, badge 1), a "Recent" conversation list (host + last-message preview + time + unread/blocking dot), active row highlighted. Calm chrome on `--surface-container` so it recedes. Answers "where do I jump into a conversation." |
| **Center pane** | flex-1 | Conversation header (host chip + title + 3 participant avatars + actions ⋯) over the grouped message list over the bottom-pinned composer. `--surface-page`. |
| **Right contextual pane** | 420px | Open on the change-set embed: header (`auth/passkey.ts` +124/−18 + close), tab strip (Diff / Files / Session), syntax-gutter diff body. `--surface-container`. |

---

## Information hierarchy (numbered)

1. **The pending decision** — the Review part ("needs your decision") + verdict buttons is the heaviest unit (the only bordered+shadowed card in the stream). It is where the eye lands.
2. **The change set under review** — the diff embed inside the review, mirrored open in the right pane (accent border ties embed ↔ destination).
3. **Author groups** — avatar + name + time at each group head; the structural rhythm of the column.
4. **Agent summary content** — prose + work-Fold + embeds + citations, calm and foldable.
5. **Conversation framing** — header host chip ("Bet · Passkey login") + participants.
6. **Navigation** — sidebar conversation list (quiet, recessive).
7. **Composer chrome** — present and complete, but visually quiet until focused (shadow lifts on `focus-within`).

---

## How each annotated gap is addressed (maps to brief-v3 §"annotated gaps")

| # | Founder annotation | Fix in this design |
|---|---|---|
| 1 | "who wrote what / me vs them / multiple users" | Single column, NO bubbles. Identity (avatar + name + time) at each **author-group head**. 3 participants (A. Founder, Mara, Atlas). Human vs agent: agents get the green-tinted avatar + an "Agent" pill at the head. **Own-message cue:** A. Founder's groups carry a faint 3% accent tint + a quiet "You" label. Mara proves a second human reads distinctly from "me." |
| 2 | "spacing / grouping / structure / layering — everything; blobs; memory game" | Author-**grouping** is the structural unit (not per-line styling, not disconnected blobs). Consecutive same-author messages collapse under one head (Atlas 9:11→9:12 group). Consistent 6px intra-group / 6px inter-group rhythm on the Hearth grid; generous group padding (12px/9px). One alignment grid (avatar gutter + 760px reading column). No box-per-message. |
| 3 | "what's a thread vs a conversation; where would I jump in; why TASK floating alone" | Header shows host as a labeled chip **"Bet · Passkey login"** with the full participant set — the conversation IS the thread attached to one host, made legible. The sidebar conversation list (host + preview + time per row, active highlighted) is the "where do I jump in" answer. No cryptic bare "TASK" label. |
| 4 | "composer is a stub — no send/attach/format/tools; not centered" | Full composer anatomy: optional **banner** (Replying to Atlas ✕), **attachment-chip row** (auth-flow.png 82 KB, removable), input row `[ + | textarea "Message Atlas, Mara…" | Send ]`, a **formatting strip** (bold/italic/code/link · @mention · attach) + an Enter/Shift+Enter hint, real **Send** button (accent). Centered in a 760px column matching the message column. **No** model/effort/mode pills (those are AM3 dial-in). |
| 5 | "embeds — if I open this, where do I end up?" | Every embed names its kind ("Change set" / "Referenced item" / "Session") and has a defined destination (table below). The **diff embed opens the right contextual pane** — shown OPEN, with an accent border on both the embed and the pane header tying source↔destination. Citations are source chips; the attachment is a file chip; the session reference opens the AM3 dial-in (never inlines the work-log). |
| 6 | "message actions" | Hover toolbar (React · Reply · ⋯) anchored top-right of each group; shown live on the Atlas review group (`hovered`) so the founder sees it, and `group-hover/msg:flex` on the rest. Reactions render as a pill stack under Mara's message. |
| 7 | "show it in the real app container" | The whole surface is the three-region shell (sidebar + main + right pane) at 1440px, framed as the app window — not a floating column. |

---

## Component composition (production reuse mapping)

Hand-rolled here for guaranteed standalone render in the viewer. The builder maps each slot to the catalogued component:

| Hand-rolled slot | Production component | Notes |
|---|---|---|
| Left sidebar shell + section rows + search | `shell/Sidebar.tsx` + `SearchField` | Reuse the real shell. Conversation-list rows = a new `ConversationListRow` (host + preview + time + dot) replacing the current title-only `FastNavItem`, OR extend `ThreadRow`. Used in 2+ contexts (sidebar + Conversations list page) → justifies the component. |
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

**New components introduced:** `ConversationListRow`, `ReactionBar`, `Fold`, `SessionRefEmbed`, `CitationChips`, `AttachmentChip`, `ContextPane`. Each is reused in 2+ contexts or is a concept primitive (Fold, the Embed satellite) — within the component budget. No new tokens.

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

## Mobile adaptation (3 regions → 3-tab layout)

Per `docs/information-architecture/` (mobile = three tabs):

- **Tab 1 (Conversations list):** the left sidebar becomes the full-screen list view. Tapping a row pushes the conversation.
- **Tab 2 (the conversation):** the center pane fills the screen. Header collapses host chip + participants into one line. The composer stays bottom-pinned (formatting strip behind the `+`/`Aa` to save height; ≥16px input font per AQ-005; ≥44px touch targets per AQ-015).
- **Right pane → sheet:** opening an embed pushes the contextual pane as a full-screen route (or a bottom sheet for short content), not a side-by-side column. Back returns to the conversation.
- Author-grouping, identity, own-message cue, verdict, and embeds are unchanged — the reading column already is the mobile column.

---

## Trade-offs

- **Hand-rolled shell vs importing `Sidebar`/`Composer`:** chose hand-rolled for a guaranteed standalone render in the viewer (no router/AppShell context). Cost: the spec must carry the reuse mapping (above) so the builder doesn't ship the hand-rolled copies. Benefit: the founder reviews the real composition without infra risk.
- **Right pane shown open by default:** answers the founder's "where do I end up" directly, at the cost of not also showing the closed/2-region state. Acceptable — the populated-only rule plus the source↔destination accent tie makes the relationship the point.
- **Reactions/attachments rendered though schema-absent:** per inventory §9 these need Message-schema growth beyond AM1's render scope. Shown here as the design target (spec scenarios may name surfaces not yet reachable — [[memory]]); the builder gates them behind the schema work, not this story.
- **Own-message cue = faint tint, not a bubble:** keeps the no-bubbles Slack model (annotation 1) while still answering "what's mine." Risk: 3% tint is subtle in light mode; paired with the "You" label so it never relies on color alone.
- **Density:** 12px/9px group padding, 6px rhythm — denser than v2's barren wall, calmer than per-message cards. The single bordered card (the review) earns its weight as the one decision.

---

## Render risk (could not verify — viewer not run)

- `color-mix(in oklab, var(--accent-primary) 3%, transparent)` own-message tint may read as near-invisible in light mode; the "You" label is the non-color fallback. Builder should confirm in the `:8100` viewer and bump to 4% if needed (4% is the established sidebar-hover value).
- Inline `✕` close glyphs are text, not icons — acceptable for a design embodiment; production uses an icon button.
- The hand-rolled icon `d` paths (bold/italic/code/link/at) are approximations for render; production reuses real DS/Heroicon glyphs.
