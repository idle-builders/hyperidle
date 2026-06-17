# AM1 — Conversation v3: Full Surface (C) — Design Spec

Supersedes the rejected v1/v2 thin-column variants (QuietStream / Quiet Turns / Calm Document). This is the v3 foundation embodied in the real app container, per `plans/AM1/design/brief-v3.md`.

**Story:** `AM1 Conversation — Full Surface (C)` / `Populated`. Renders at desktop width on `--surface-page`.
**Component:** `packages/web/src/components/Am1ConversationSurface.tsx` (`data-ds-component="Am1ConversationSurface"`).

> **Revision (v3.2) — THE CONVERSATION IS THE SURFACE.** Scope = the OPEN conversation, i.e. the open thread's content. A **conversation IS a thread** — settled in the schema: `conversationId === threadId`; messages carry one `threadId` with no sub-thread / parent column. A thread attaches to exactly ONE host (bet/task/user/team/agent/artifact/knowledge_item/factory). There are **no Slack-style sub-threads**.
>
> **Navigating BETWEEN threads is the app sidebar (`SidebarV2`, AD9)** — app-shell chrome, NOT part of this design. The v3.1 left "inbox / thread-list" pane WAS that app sidebar and has been **removed**. What remains is the conversation itself: header (thread identity) · author-grouped messages · composer.

---

## v3.4 — round-3 detail refinements (founder annotations, this revision)

Five element-anchored founder notes on the `ComposerInsertBlock` / `Populated` states drove these changes. Confirmed in the `:8100` viewer (`plans/AM1/design/full-surface/screenshot.png`).

1. **Insert menu = a floating POPOVER; the composer never grows.** The Insert menu was inline in the composer flow, so opening it ballooned the box ("horrible"). It is now an **absolutely-positioned popover** anchored above the composer card, left-aligned to the "+ Insert" button (`style={{ bottom: "calc(100% + 6px)", left: 12 }}`, `--surface-overlay` + `--shadow-elevated`). It overlays the calm message area above the composer; the composer keeps its compact height open or closed. The popover is **shrunk to 228px** (was 300px), the redundant "INSERT" heading is **dropped** (the button already says Insert), and options are compact icon + label + tiny hint: **Block · Attach file · Mention · Reference item**. *(Note: Tailwind arbitrary `bottom-[calc(100%+6px)]` does NOT parse without underscores; inline `style` is used for the calc — see `@lore` in source.)*

2. **Inserted block = a compact PREVIEW card (not the inline rich editor); weird gap removed.** The composer's Insert-Block no longer renders the full rich code-block editor inline. It renders a **compact preview card consistent with the artifact/change-set Embed**: kind marker (`‹› CODE BLOCK · TS`) + a one-line snippet + "3 lines · inserted into this message" + an **"Open →"** hook that opens the full block/artifact in the **right slider delivered by track AL**. The old `grid-cols-[24px_1fr]` block-handle gutter (the "weird space") is gone; a single quiet remove ✕ sits at the row end. Same pattern applies to a block rendered inside a message.

3. **Questionnaire / QUICK ASK is now unmissable.** Wrapped in a bounded, accent-edged container (border + `border-l-[3px]` accent rule + faint 5% accent tint). A **"QUICK ASK · NEEDS YOUR ANSWER"** pill with a question glyph, the question text given weight (15px/600), and answer chips rendered as clearly tappable choices — the **recommended** option is a solid filled accent chip with a "RECOMMENDED" label, the others outlined on `--surface-elevated`. Calm but reads as a decision to make, not plain tags.

4. **Reply banner = a clean slim strip.** Refined from a stacked two-line block into a **single slim strip**: accent reply glyph · "Replying to **Atlas**" · quoted snippet (one line, truncated) · cancel, tied by a 2px accent left rule. With the popover fix the box no longer grows, so the banner reads clean at the composer top.

5. **Review card: spacing restored, still AL's (compact hook only).** The review message uses an even 12px-rhythm `flex-col` (`gap-[12px]`) so it no longer looks broken: marker · bold proposal line · change-set Embed · single "Open review →" button. The **full review card / verdict bar / diff is owned by track AL** — not designed here.

Stray text `✕` glyphs were replaced with a proper `ICON_REMOVE` svg across the reply banner, attachment chip, and inserted-block remove for consistency.

---

## v3.3 — round-3 detail refinement (prior revision)

Round-2 founder comments + the explicit scope boundary drove six refinements. The headline change is the **scope cut**: the review/artifact experience is owned by a parallel worktrack.

### Review / artifact = track AL (NOT designed here)
The **review experience — artifact review, the verdict flow, and the right slider/diff pane — is owned by track AL.** This design does **not** build it. Consequences:

- **The change-set / diff context pane is REMOVED.** There is no diff body, no tab strip, no `ContextPane`, no `paneOpen` state in this surface.
- A change-set/artifact appears only as a **compact Embed card that is a HOOK**: it carries an **"Open →"** affordance and "opens the artifact in a right slider" delivered by AL. The embed renders kind + filename + `+N/−M` and nothing more.
- The **review message stays compact**: the agent proposes X (one title line + the change-set hook) with a single **"Open review →"** button into AL's verdict flow. No verdict bar (Approve / Request changes / Reject), no reasoning detail, no diff — those are AL's. The two workstreams piece together later: AM1 emits the hook, AL delivers the destination.

### Composer Insert-Block capability (the conversation composer's unique power)
The composer can **insert a knowledge Block** (heading / list / code / table / quote) with the **same rich block editing as Knowledge blocks** (production: DS `Block` + `BodyEditor` / TipTap). The story renders this concretely in two states at once:

- **The open "+" Insert menu** — attached above the input row, listing **Insert block** (the key, accent-highlighted affordance) plus Attach file · Mention · Reference item, each labeled with a hint. `/` slash-commands are reserved (not shown as a tool).
- **A draft that already contains an inserted, rich-edited Block** — a code Block sitting in the composer draft above the text line, with a **block handle** (drag/reorder + block actions, mirrors DS `BlockHandle`), a **kind chip** (`Code · ts`, changeable inline), a remove ✕, and the **same code render** as a Knowledge code block. The label "inserted block — edits like a knowledge block" makes the mechanic explicit.

**Composer toolbar fix (round-2: "this icon seems broken" / "what does this icon do?"):** every tool is a legible, single-purpose icon with an `aria-label` + `title` tooltip. The bottom strip set: **Attach** (paperclip) · **Insert block** (blocks/stack glyph) · **@ Mention** (at) · **Format** (a clean `Aa` mark → bold/italic/code) · **Emoji** (face). No mystery/broken glyphs. The broken bold-`d` path was replaced with a proper `Aa` format mark.

**Resting composer anatomy** (top→bottom): reply banner → inserted-block / attachment draft area → open Insert menu (when "+" active) → input row `[ + Insert | textarea | Send ]` → formatting strip + "Enter to send · Shift+Enter for newline".

### Reply-to-a-specific-message (round-2: "I cannot tell to which message I am replying")
- The composer **reply banner** references the specific message, not just the person: "Replying to **Atlas**" + a **Slack-style quoted snippet** of that message ("Added WebAuthn registration and the dual-auth window. Existing password sessions stay valid…").
- One message in the thread renders **as a reply**: the founder's 9:14 message carries a quoted **`ReplyReference`** above its body (↩ **Atlas** · "How long should the password fallback stay enabled?") so a reader sees what the reply refers to — answering both the writer's and the reader's need.

### Questionnaire / quick-answer agent message (the AM1-relevant agent message type; review = AL)
Added an **agent questionnaire message** (Atlas 9:13): a scoped "QUICK ASK" question with **constrained answer options rendered as inline answer chips** the human picks ("Keep through phase 2" recommended/accent · "Drop now" · "Decide later"). Calm, teammate-style — a quick ask, not a heavy form. Drawn from AI-chat quick-replies + Slack. Message types covered in the fixture: **plain · questionnaire · review (hook) · verdict** (echo).

### Density + agent-vs-human legibility (round-2: more space; "certain people will want to know" who is an agent)
- **Inter-group rhythm bumped to 18px** (from 6px) — more breathing room between message groups; calmer vertical rhythm, not crammed.
- **Agent vs human reads at a glance without reading the name:** agent groups carry a **left accent rule (2.5px) + a faint 4% accent tint** behind the whole group, plus the existing green-tinted avatar + "AGENT" pill (now with a check glyph). **Humans are plain.** The **own ("You")** group keeps a subtle 3% warm tint + the "You" label (color-independent).

### Header avatars (round-2: "these weirdly overlap")
Participants render as a clean overlapping **`ParticipantGroup`** (production: DS `AvatarGroup`): consistent 2px `--surface-page` ring, even -9px overlap, descending `z-index` so each reads cleanly; the agent avatar's green ring distinguishes it. Followed by the participant count and the ⋯ actions. No broken overlap.

### Per-message hover controls (round-2: founder liked them, "not too big")
Kept as-is: the React · Reply · ⋯ hover toolbar, compact (26px targets), anchored top-right of each group; shown live on the Atlas review group and `group-hover/msg:flex` on the rest.

---

### v3.1 anatomy note (superseded for the diff pane)

What remains is the conversation itself: header (thread identity) · author-grouped messages · composer. The **on-demand right context pane referenced below is removed in v3.3** — artifact review is track AL.

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
| Review message (compact hook) | `RichMessageCard` (compact) + `Button` | v3.3: AM1 renders only the **compact review hook** — title + change-set Embed + a single "Open review →" button. The **verdict bar + artifact/diff view are track AL's** — do NOT build them here. |
| Questionnaire (quick ask) | **New `QuickAskPart`** (answer chips) | Agent message type: scoped question + constrained inline answer chips (recommended chip accented). Reused wherever an agent asks a quick scoped question → in-budget. |
| Verdict echo | `CommentRow` verdict terminator | Existing. |
| Inserted-block draft (preview) | `BlockRefEmbed` / `ArtifactEmbed` pattern | v3.4: the composer's Insert-Block renders a **compact preview card** (kind marker + snippet + "Open →"), NOT the inline rich editor. It reuses the same Embed/preview-card shape as the artifact embed; "Open →" opens the full block in the right slider (track AL). The full `Block` + `BodyEditor` (TipTap) editing happens in that slider / on the canonical block, not inline in the composer. |
| Insert menu (popover) | DS `Menu` / `Popover` | v3.4: a **floating popover** anchored above the "+ Insert" button — overlays, never grows the composer. Compact items (Block · Attach file · Mention · Reference item). Map to the DS menu/popover primitive; do not render it in the composer's flow. |
| Composer | `Composer` (DS) | Extend with a slim reply banner (reply + quoted snippet) + inserted-block-preview / attachment draft area + the **floating "+" Insert popover** (overlay, not in flow) + formatting strip. The DS `Composer` is the single owner — do not hand-roll a second one. |
| ~~Right contextual pane~~ | **Track AL** | REMOVED from this design (v3.3). Artifact review / the right slider is owned by track AL. The change-set Embed is only a hook into it. |

**New components introduced:** `ReactionBar`, `Fold`, `SessionRefEmbed`, `CitationChips`, `AttachmentChip`, `ContextPane`. Each is reused in 2+ contexts or is a concept primitive (Fold, the Embed satellite) — within the component budget. No new tokens. **Thread navigation (the conversation/thread list) is NOT in this design** — it is the app sidebar (`SidebarV2`, AD9), owned by the app shell.

---

## Embed open-destinations table

| Embed kind | Renders | Opens (destination) |
|---|---|---|
| Change set (diff) | `auth/passkey.ts` +124/−18 | **Track AL's review experience** (right slider) — a HOOK only; "Open →". AM1 does not render the diff/pane. |
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
