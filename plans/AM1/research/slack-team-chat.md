# Slack / Team-Chat Conversation Surface — Inventory & Critique

**For:** AM1 Conversation Experience redesign. **Purpose:** map what a real threaded team conversation actually needs, so HyperIdle's conversation surface takes what's load-bearing and rejects Slack-specific bloat.

**Confidence legend:** **[H]** = corroborated by official Slack help/docs + my own knowledge; **[M]** = single source or my knowledge, plausible but not double-checked; **[L]** = inferred / marketing-flavored, treat skeptically. The web is noisy — I flagged where sources were thin (esp. message-grouping internals, which Slack does not document; that's **[M]** from direct product knowledge).

**HyperIdle framing carried in (from `plans/AM1/concept.md`):** Conversation = the *deliberate-messaging reading* of a Thread. Messages are chosen, not a firehose. Agents are first-class equal participants. Session work-activity is NEVER first-class conversation content — only referenced. Every "essential vs skippable" call below is made against that frame, not against "be Slack."

---

## 1. The IA model — channel / conversation / thread / reply (THE CRUX)

This is where the founder is confused, so be precise. Slack has **two different axes** that people conflate:

### Axis A — the *container* hierarchy (where messages live)

```
Workspace                         (the org / tenant — one company, one URL, one member directory)
└── Conversations (Slack's umbrella term for any message container):
    ├── Public channel            (#general — anyone in workspace can find/join/read; in workspace search)
    ├── Private channel           (🔒 — invite-only; content only in members' search)
    ├── Direct Message (DM)       (1:1 with one person)
    └── Group DM (MPDM)           (an ad-hoc 3–9 person DM — NOT a channel, no name, no topic, can't add via @)
        │
        └── Messages              (the chronological posts inside any of the above)
            │
            └── Threaded replies  (a sub-conversation hanging off ONE parent message)
```

**Precise definitions [H]:**

- **Workspace** — the top tenant. One company. Owns the member directory, channels, emoji, settings. (Enterprise Grid stacks multiple workspaces under an org; ignore for our purposes.)
- **"Conversation"** is Slack's *internal/API umbrella noun* for "any place messages live" — public channel, private channel, DM, or group DM are all "conversation types" (`conversations.*` API). **This is the trap:** in Slack, "conversation" ≠ "thread." It means the container. *(HyperIdle redefines "Conversation" as the rendered reading of a Thread — a deliberate, opposite choice. Flag this rename explicitly in design docs so it doesn't get crossed with Slack's meaning.)*
- **Channel** — a named, persistent, topic/project-scoped room. Public (discoverable, joinable, transparent, in workspace search) or private (invite-only). The org's durable shared spaces.
- **DM** — a 1:1 private conversation. No name, no topic.
- **Group DM (MPDM)** — 3–9 people, ad-hoc, no name/topic, can't be @-mentioned as a group, can't add a member without starting a *new* group DM. Deliberately lightweight and second-class to channels — Slack nudges you toward a private channel when a group DM "grows up." **[H]**
- **Message** — one post in a container. Has author, timestamp, body, optional attachments/reactions.

### Axis B — the *thread* (a message tree on top of the flat list)

- A channel's main view is a **flat chronological list of messages** (the "channel timeline"). **[H]**
- Any message can sprout **threaded replies**. The moment a message gets its first reply, it becomes a **parent message**; the responses are **threaded replies / child messages**. **[H]**
- **How you ENTER a thread:** the parent message in the channel shows a **"N replies" affordance** (reply count + tiny avatars of repliers + "Last reply …"). **Clicking that opens the thread pane** — a dedicated column that slides in on the right (desktop). The thread pane shows: the parent message at top, then all replies in their own chronological list, then a composer scoped to that thread. **[H]**
- **Where does a thread live?** Replies live **inside the parent message**, NOT in the channel's flat list. This is the key behavior: a thread keeps a sub-discussion **out of the main channel timeline**, so the channel stays readable. The thread is "attached to" exactly one parent message in exactly one channel — it has no independent existence. **[H]** *(This maps cleanly to HyperIdle's "a Thread is attached to one host" — Slack's thread is the same shape, minus the host being a Bet/Task.)*
- **"Also send to channel" checkbox [H]:** when replying in a thread, an opt-in checkbox lets the reply *also* appear as a fresh message in the channel's flat list (a "broadcast"). **Default = OFF.** Used to surface a thread conclusion ("decision: we ship Friday") back to people not following the thread. Misused (e.g., bots that broadcast every reply), it re-floods the channel and defeats threading — a documented anti-pattern.

### Unreads / notifications — channel vs thread (the asymmetry that confuses people) **[H]**

- **Channel unread:** new top-level messages bold the channel name in the sidebar. A **numbered badge** appears only if you were @-mentioned.
- **Thread unread is deliberately quieter and separate:** a new reply in a thread you're following does **NOT** bold/light up the channel name in the sidebar. Instead it surfaces in the **Threads view** (now folded into the **Activity** view → Threads tab) at the top of the app. *Rationale (Slack's own):* people not in the thread shouldn't be disturbed; people in the thread get a dedicated, low-noise inbox. **[H]**
- **Who auto-follows a thread:** you follow a thread (and get its reply notifications) if you started it, replied to it, or were @-mentioned in it. In a 1:1 DM you're notified of all replies. **[H]**

> **The one-paragraph mental model to hand the founder:** A *workspace* is the company. Inside it are *containers* (channels, DMs, group DMs). A container holds a flat list of *messages*. Any message can grow a *thread* — a sub-list of *replies* that hangs off that one message and stays out of the main list unless you "also send to channel." "Channel/DM" = WHERE, "thread" = a fold-out branch off one message, "reply" = a leaf in that branch. Slack's word "conversation" = the container (channel/DM), which is NOT the same as a "thread."

**Essential vs skippable for an agent-teammate product:**
- **Essential:** message → threaded-reply branching; entering a thread via a "N replies" affordance into a focused pane; thread-stays-out-of-main-list; the quiet, separate thread-unread surface; the broadcast-back escape hatch.
- **Skippable / reframe:** Slack's *four* container types. HyperIdle threads are hosted on Bets/Tasks/etc., not on user-named rooms. We don't need public-vs-private-channel discovery mechanics, group-DM-as-second-class, or workspace-vs-Enterprise-Grid. The container in HyperIdle is the work primitive, not a chat room.

---

## 2. Message identity & grouping

- **Who wrote what [H/M]:** each message renders **avatar + bold display name + timestamp**, then the body below. Click name/avatar → profile card.
- **Consecutive-message grouping [M — Slack doesn't document the algorithm; from direct product knowledge]:** when the **same author** posts again within a short window (~minutes, and uninterrupted by another author), Slack **collapses** the repeat: it shows the avatar + name + timestamp only on the *first* message of the run; follow-ups render as tight body-only lines under it (timestamp appears on hover). This is the single biggest "calm" device in Slack's reading rhythm — it turns a rapid-fire burst into one visual block instead of N stamped rows.
- **"Me vs them" treatment — IMPORTANT [H]:** **Slack does NOT use chat bubbles and does NOT left/right-align your own messages vs others'.** Every message is **left-aligned in one column**, regardless of author. Your own messages look identical to everyone else's (no bubble, no color, no right-justify). This is a deliberate "document/log, not iMessage" choice — it reads as a shared record, not a 1:1 SMS chat. *(Directly relevant: HyperIdle's calm single reading-column matches this; do NOT bubble.)*
- **Bot / app / integration messages [H]:** posted by an app show the app's name + a small **"APP" tag** badge next to the name, distinguishing automated posts from humans. Often carry Block Kit cards. *(For HyperIdle: agents are first-class teammates — they should look like *teammates* with an agent indicator, NOT like a Slack "APP" bot relegated to second-class. Take the *distinguishability*, reject the second-class "bot" framing.)*
- **System messages [H]:** centered, muted, italic-ish meta lines ("X joined the channel", "Y pinned a message", "renamed the channel"). No avatar. Low-emphasis, woven into the timeline.

**Essential:** avatar+name+timestamp identity; consecutive-author grouping (huge calm win); single left-aligned column / NO bubbles; clear human-vs-agent distinguishability; muted system lines.
**Skippable:** the "APP" second-class framing.

---

## 3. Multi-user / presence

- **Member list [H]:** per-channel member roster (count in header → opens member list); workspace directory separately.
- **Presence dots [H]:** a small colored circle per person — **green = active** (at least one client sending heartbeats), **hollow/grey = away**. Shown in sidebar, DMs, member lists, profile cards. Plus a custom **status** (emoji + text, e.g. "🍔 lunch", "📅 in a meeting") that can auto-expire.
- **Typing indicators [H/M]:** "X is typing…" shown in the composer footer of the active conversation/thread while someone types. Ephemeral, not stored.
- **@mentions [H]:** `@user` (notifies one person), `@here` (notifies *active* members of the channel), `@channel` (notifies *all* members), `@everyone` (#general only). **User groups** (`@designers`, `@oncall`) — admin-defined named sets that expand to notify all members. Mentions are *the* attention-routing primitive.
- **Read state [H — strong]:** **Slack deliberately has NO read receipts.** It does not show who has read a message in any conversation type. Each person manages their own unread state; the design philosophy is async-first ("read at your own pace, no social pressure"). The *only* read-ish signal is presence + the fact that unreads are personal.

**Essential for HyperIdle:** @mentions as the attention-routing primitive (incl. mentioning agents); presence/status for *agents* especially (idle / working / blocked is hugely informative for an agent teammate); per-conversation participant list.
**Skippable / reconsider:** human typing indicators (low value in a deliberate-message product, and meaningless for agents — though an "agent is working…" affordance is a *different, valuable* thing that lives in the session view, not the conversation). `@here`/`@everyone` are firehose tools at odds with "deliberate." **No read receipts is the right default** — keep it.

---

## 4. Message-level actions (hover toolbar + more-actions menu)

On hover, a message shows a **floating action toolbar** (top-right of the row); the **"⋮ More actions"** button opens the full menu. **[H]**

| Action | What it does | Essential for agent-teammate? |
|---|---|---|
| **Emoji reaction** | Add 😀 react; 1-click recent-3 + full picker; reactions tally with reactor avatars on hover | **Essential** — lightweight ack/vote/sentiment without a reply; perfect "agent acknowledged" + human "approve" affordance. Highest value/cost ratio. |
| **Reply in thread** | Opens/creates the thread on this message | **Essential** — this IS the branching primitive (§1). |
| **Edit** | Author edits own message; shows "(edited)" tag | **Essential**, with caveat: HyperIdle messages may be event-sourced/immutable — edit may need to be an amend/correction event, not a mutate. |
| **Delete** | Author/admin removes message | Essential but governed (audit trail for agent actions). |
| **Pin** | Pins to the conversation's pinned-items list (per-channel) | **Useful** — "the decision / the spec link for this room." Keep, lightweight. |
| **Save / "Save for later"** (now **Later**) | Personal bookmark into your Later list | **Useful** personal triage; lower priority. |
| **Copy link** | Permalink to the exact message (deep-link) | **Essential** — stable addressable message permalinks are load-bearing for referencing/linking across the product. |
| **Forward / share message** | Re-post a message into another conversation with optional note | Nice-to-have; reframe as "reference this message" (Embed) rather than copy-paste. |
| **Remind me about this** | Slackbot DMs you about this message at a set time | Skippable (belongs to task/reminder system, not chat). |
| **Mark unread** | Resets read pointer to here | **Useful** — personal triage, cheap. |
| **More actions / app actions** | Extensible menu (apps inject "create ticket", "add to canvas", etc.) | **Strategically essential** — this is the extension seam where an agent-teammate product wires message → action (e.g., "turn into a task", "ask an agent", "review this"). |

**Essential core:** react, reply-in-thread, edit, delete, copy-link (permalink), mark-unread, and an extensible action menu (message→action seam).
**Skippable/defer:** remind-me, forward (reframe as reference/embed), pin & save (keep but low priority).

---

## 5. Composer (enumerate only — another agent goes deep)

Surface inventory, no depth: **[H]**

- Rich-text WYSIWYG toolbar (`Aa`): bold / italic / strike / **inline code** / **code block** / link / ordered+bulleted lists / blockquote.
- Markdown-ish **`mrkdwn`** typed shortcuts (`*bold*`, `_italic_`, `~strike~`, `` `code` ``, ``` ```block``` ```, `>quote`) — NOT standard CommonMark (single-asterisk bold, no `[text](url)`).
- **@mention** autocomplete; **`:emoji:`** shortcode autocomplete + picker.
- **Attach**: files, images, drag-drop, paste, snippet, "+" menu (canvas, list, etc.).
- **Slash commands** (`/remind`, `/giphy`, `/dm`, app-provided `/...`) — typed intents.
- **Schedule send** (post later at a chosen time).
- **Drafts** (auto-saved per conversation; a dedicated **Drafts & sent** view).
- Thread composer has the **"Also send to channel"** checkbox (§1).

*(Defer all depth. For HyperIdle: rich-text + mention + emoji + attach + slash/intent + schedule + draft are the plausible take-list; "deliberate message" elevates **schedule/draft** and the **intent/slash** seam more than casual chat does.)*

---

## 6. Content types (what can appear inside a message / conversation)

| Type | What it is | Render/interaction | Essential? |
|---|---|---|---|
| **Text** | Plain + `mrkdwn` formatted body | Inline | **Essential** |
| **Code block / snippet** | Fenced code (inline render) or **Snippet** (titled, syntax-highlighted, line-numbered file-like object with its own preview + download) | Snippet = expandable card | **Essential** (code blocks); snippets useful for agent-emitted code/logs |
| **File attachment** | Any uploaded file; preview + download; lives in Files browser | Inline card/thumb | **Essential** (artifacts) |
| **Image** | Inline thumbnail, click → lightbox | Inline | **Essential** |
| **Link unfurl / preview** | Auto-expanded rich preview of a pasted URL (title, desc, image); apps can custom-unfurl their own URLs (`chat.unfurl`) | Inline attachment under the message | **Essential as a *device*** — this is exactly HyperIdle's **Embed**: render the referenced thing legibly inline, not a bare link. Custom-unfurl ≈ first-class Embeds for our own entities (artifacts, blocks, sessions). |
| **Block Kit card** | App-built structured UI: sections, fields, buttons, selects, datepickers, images — interactive | Rendered card with working controls | **Essential pattern** — agents post **interactive cards** (approve/reject, pick option, verdict). The "agent renders an actionable card" is core to agent-teammate UX. (HyperIdle's `review`/`questionnaire`/`verdict` message types are this idea, native.) |
| **Poll** | Quick vote (via app/workflow; not strictly native) | Card with reaction-style tallies | Nice-to-have (a verdict/questionnaire covers most of it). |
| **List** | Slack **Lists** — lightweight structured tracker (rows/fields/status) inside Slack | Embedded table-ish surface | Skippable for chat surface (HyperIdle has Work/Bets/Tasks for this). |
| **Canvas** | **Slack Canvas** — a persistent doc attached to a channel/DM (text, files, embeds, no-code workflows). Block Kit NOT supported in canvas. | A doc surface, not a message | Out of scope for the *conversation* surface (HyperIdle = Notion-layer/Knowledge). Note: a canvas-per-conversation "shared durable doc" is a real pattern worth knowing exists. |
| **Huddle** | Lightweight live audio/video room inside a channel/DM | Live ephemeral session | **Skip** — real-time AV is not our product. |
| **Clip** | Recorded audio/video message | Inline player | **Skip** for v1. |
| **Workflow** | No-code automation triggered in/around a conversation | Buttons/forms | Reframe — HyperIdle's automation is Routines/agents, not chat workflows. |

**Take:** text, code/snippets, files, images, **unfurl→Embed**, **Block Kit→interactive agent cards**. Skip huddles, clips, lists, canvas (other product layers own these), polls/workflows (covered by primitives).

---

## 7. Navigation & retrieval

- **Sidebar [H]:** left rail listing conversations. **Custom sections** (collapsible groups; paid) — drag to organize, rename, emoji. Unreads bold the name; mention count = numbered badge. Stars/favorites pin to top.
- **Activity view [H]:** consolidated inbox with tabs — **Unreads** (everything new), **Mentions** (where you were @'d), **Threads** (replies in threads you follow). This is the modern triage hub (replaces the old separate Threads/Mentions views).
- **Later (saved) [H]:** personal bookmark inbox with tabs (In progress / Archived / Completed); save any message/file, set reminder, jump to source, mark done.
- **Search [H]:** global search with **operators** — `in:#channel`, `from:@user`, `before:`/`after:`/`on:`, `has:link`/`has:file`/`has:reaction`/`has:pin`, `filetype:pdf`, `is:saved`, `during:`. Results filterable by messages/files/channels/people.
- **Files browser [H]:** all files, filterable by type/channel/person.
- **Pins [H]:** per-conversation pinned items (header → pinned list).
- **Jump-to / quick switcher [H]:** **Cmd/Ctrl+K** — fuzzy quick-switch to any channel/DM/person; the primary keyboard navigation primitive.

**Essential for HyperIdle:** an Activity-style **consolidated triage inbox** (Unreads / Mentions / Threads — maps to "what needs me"); **Cmd-K jump-to** (table stakes); **search with operators** (find-the-decision); per-conversation pins. Less critical: sidebar custom sections (HyperIdle nav is the work hierarchy, not a freeform room list), Files browser as a top-level surface (Knowledge layer owns files), Later (nice personal triage, lower priority).
**The big lift:** Activity's "Threads" tab + Mentions tab is the model for "an agent/teammate's queue of things that actually need a deliberate reply" — extremely aligned with "deliberate, not a firehose."

---

## 8. Notifications & status

- **Unread counts [H]:** bold name = unread; numbered badge = mentions; per-channel.
- **App/dock badge [H]:** red dot = some unread notification; number = count of mentions/DMs/followed-thread-replies (configurable).
- **What triggers a notification (default) [H]:** a DM, an @mention (incl. `@here`/`@channel`), a **keyword** match, a reply in a followed thread. NOT every channel message.
- **Do Not Disturb (DND) [H]:** pause all notifications (bell icon → snooze for X / custom / schedule). Honors quiet hours; others see a "notifications paused" zzz indicator. **Notification schedule** for working hours.
- **Keywords [H]:** user-defined words ("highlight words") that trigger a notification + yellow highlight even in channels you'd otherwise skim. A personal interrupt-on-topic.
- **Per-conversation overrides [H]:** mute a channel (no bold, no badge — except direct mentions still badge); set "all messages / mentions only / nothing"; mobile-vs-desktop split.
- **Notification granularity [H]:** global default → per-channel override → thread-level ("get notified of all replies / mute thread").

**Essential for HyperIdle:** mention-driven (not message-driven) notifications by default — perfectly matches "deliberate"; DND/quiet-hours (humans need it; agents are 24/7 so the *human's* DND is what matters); per-conversation mute/override; keyword highlights (cheap, high value — esp. for routing topics to the right agent/human).
**Skippable:** mobile/desktop split complexity for v1.

---

## What an agent-teammate product MUST take vs can skip (opinionated)

Filtered against HyperIdle's frame: messages are **deliberate** (not a firehose), agents are **first-class equal teammates**, conversation hangs off a **work host** (Bet/Task), and **session work-activity is never first-class conversation content**.

### MUST TAKE (load-bearing)
1. **The flat-list + thread-branch model.** Messages in a calm chronological list; any message can sprout a focused thread that stays OUT of the main list. The single best idea in Slack for keeping a shared space readable. Enter via "N replies" → focused pane. This is the backbone of the surface.
2. **Single left-aligned reading column — NO bubbles, no me/them sides.** It reads as a shared record/document, not a 1:1 SMS. Directly matches HyperIdle's calm reading-column. (Founder note: resist any instinct to bubble agent-vs-human left/right.)
3. **Consecutive-author grouping.** Collapse same-author runs to one stamped header + tight body lines. The biggest "calm" lever; turns agent bursts into one block.
4. **Avatar + name + timestamp identity, with clear human-vs-agent distinguishability** — but agents look like *teammates*, not second-class "APP" bots.
5. **@mention as the attention-routing + notification primitive**, including mentioning **agents**. Notifications are **mention/DM/followed-thread-driven, NOT every-message-driven** — this IS "deliberate, not firehose," enforced.
6. **Reactions.** Highest value/cost ratio — lightweight ack/approve/vote without a reply. Maps to "agent acknowledged" and human "approve."
7. **Embed = unfurl done right.** Render the referenced thing (artifact, block, diff, session reference) legibly inline, not a bare link. Custom-unfurl is the proof this generalizes. (HyperIdle's Embed/Part model is exactly this — Slack validates the device.)
8. **Interactive agent cards (Block Kit pattern).** Agents post actionable structured messages (approve/reject, choose, verdict). HyperIdle's `review`/`questionnaire`/`verdict` message types are native versions — keep them first-class.
9. **Stable message permalinks (copy link).** Addressable messages are load-bearing for cross-referencing across the product.
10. **A consolidated triage inbox (Activity → Unreads / Mentions / Threads).** "What actually needs a deliberate reply from me." The async, low-pressure spine.
11. **Cmd-K jump-to** + **search with operators** + **per-conversation pins.** Retrieval table stakes.
12. **No read receipts.** Keep Slack's async-no-social-pressure default.
13. **The message→action seam (extensible more-actions).** Wire "turn into task / ask an agent / review this" off any message. The agent-product's leverage point.
14. **Quiet, separate thread-unread surface** (thread reply doesn't shout in the main list) + the **"also send to channel" broadcast escape hatch** for surfacing a thread's conclusion.

### CAN SKIP / Slack-specific bloat
- **Four container types + workspace/Grid mechanics.** HyperIdle's container is the work host (Bet/Task), not a user-named chat room. Drop public-vs-private-channel discovery, group-DM-as-second-class, Enterprise Grid.
- **`@here` / `@everyone` / `@channel` firehose mentions** — antithetical to "deliberate." At most keep a governed `@channel`.
- **Human typing indicators** — low value in deliberate messaging. (An "agent is working…" affordance is valuable but it lives in the **session view**, not the conversation — never inline the work-log.)
- **Huddles, Clips** (real-time AV / recordings) — not our product.
- **Slack Lists, Canvas, Workflows, Polls** — other HyperIdle layers (Work/Bets, Knowledge, Routines, verdict/questionnaire) own these jobs.
- **Remind-me, Forward** — reframe (reminders → task system; forward → "reference" Embed).
- **Sidebar custom sections, top-level Files browser, Later** — lower priority; nav is the work hierarchy, files live in Knowledge.

### Biggest insight
Slack's whole readability comes from **two orthogonal devices, not chat bubbles: (a) consecutive-author grouping that turns bursts into calm blocks, and (b) the thread that pulls a sub-discussion OUT of the main list.** An agent-teammate product where messages are deliberate should lean *harder* on both — because agents naturally produce bursts (grouping saves you) and naturally produce deep work tangents (threads + a session-*reference* keep that work out of the conversation entirely). The line HyperIdle must hold is the one Slack never had to: **the thread/conversation is deliberate human+agent messages; the agent's actual work-log is a referenced session, never inlined.** Take Slack's reading grammar; refuse its "every event is a message" instinct.

---

## Sources
Official Slack help/docs (primary): Use threads to organize discussions; What is a channel; Mentions; User presence and status; Format messages with markup / Formatting message text; Code snippets; Block Kit / chat.unfurl; Canvases; Save for later; Guide to Slack notifications; Activity view; Search/find information; Adjust sidebar preferences. Secondary/critiqued (treated skeptically): Atlassian "how/why to use Slack threads", Suptask thread guide, Zapier red-dot guide, Idle Pilot presence guide. **Lower-confidence items explicitly flagged [M]** are the message-grouping algorithm internals and typing-indicator mechanics, which Slack does not publicly document — drawn from direct product knowledge, not a citable doc.
