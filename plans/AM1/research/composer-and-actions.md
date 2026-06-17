# Composer & Per-Message Actions — Critical Inventory

Research dossier for AM1 (Conversation Experience). Scope: the **message composer (input)** and **per-message action** patterns across team chat (Slack, Teams, Discord) and AI chat (ChatGPT, Claude, Cursor). Web-sourced + critically questioned. Ends with an opinionated minimum-viable composer anatomy for HyperIdle's deliberate, agent-teammate conversation.

> **HyperIdle framing (load-bearing).** The composer sends a **deliberate Message** within a Thread (concept-locked: `plans/AM1/concept.md`). It is NOT a session control surface. Model / reasoning-effort / mode / permission are **session dial-in** controls (AM3), rendered from the AM2 capability descriptor — they do **not** belong on the everyday composer. AM1's composer is for *writing and embedding*, not *configuring a run*. Today's stub is `packages/design-system/src/Composer.tsx`: a textarea + Send button, Cmd/Ctrl+Enter only, no attach / format / mention / slash / emoji / draft / autosize. That is the gap this dossier sizes.

> **Source-trust note.** Vendor help-center pages (Slack, Claude, OpenAI, Teams) are authoritative for *their own* current behavior and are cited as such. Third-party blogs/forum posts are corroborating only and were cross-checked against vendor docs where a claim was load-bearing. AI-tool UI churns fast (ChatGPT/Claude composer was re-laid-out repeatedly through 2025) — treat specific control names as snapshots, the *patterns* as durable.

---

## PART A — THE COMPOSER

Each control: **what · user job · how rendered · essential/optional · keyboard**.

### A1. Send affordances

| Control | What · user job | How rendered | Essential? | Keyboard |
|---|---|---|---|---|
| **Send button** | Commit the message. The terminal action. | A button at the trailing (right) edge of the input row. Two idioms: a **labeled pill** ("Send") in team chat / form-ish UIs; an **icon** (paper-plane ↑, or a filled arrow circle) in AI chat (ChatGPT, Claude). Hearth stub uses a labeled pill ("Send"). | **Essential** | — (clickable; primary path is the key) |
| **Enter-to-send vs Shift+Enter newline** | The single most-contested composer decision. One key both sends and breaks lines; the product must choose which Enter does and give the other a modifier. | No visible chrome — a behavior. **Slack default: Enter sends, Shift+Enter = newline.** User-flippable in Preferences → Advanced → "When writing a message, press Enter to…" with two options: *Send the message* / *Start a new line*. | **Essential** (pick one; offering the toggle is **optional** but expected by power users) | Enter / Shift+Enter |
| **Cmd/Ctrl+Enter to send** | The escape hatch when Enter = newline. Always sends regardless of the Enter setting. | No chrome. | **Essential as the alternate** (Slack: when "Enter = new line" is chosen, ⌘/Ctrl+Enter sends). Hearth stub currently makes this the *only* send key — a bug-shaped gap (no plain-Enter send). | ⌘+Enter (Mac) / Ctrl+Enter (Win/Linux) |
| **Disabled-when-empty** | Prevent empty sends; signal readiness. | Send button `disabled` + dimmed when `text.trim()` is empty (or only attachments queued → enabled). Hearth stub does this correctly. | **Essential** | — |
| **Sending / optimistic state** | Reassure the message left; keep the input responsive. | Two schools: (1) **optimistic** — clear the input immediately, render the message in the list with a "sending…" tick, reconcile on ack (Slack, iMessage, Teams). (2) **disable-and-wait** — disable input + button, show "Sending…", clear on success (Hearth stub: `submitting` flag, "Sending…" label, no optimistic echo). Optimistic feels instant but needs a failed-send recovery affordance (retry, red badge). | **Essential** (some feedback); optimistic is **optional but strongly preferred** for a calm feel | — |

**Critical read:** the stub's "Cmd/Ctrl+Enter is the only send" is below the floor for a chat product — every team-chat user expects plain Enter to send (or the explicit toggle). Pick the Slack model (Enter sends by default + a preference toggle + ⌘/Ctrl+Enter as the always-send). For an agent-teammate conversation where messages are *deliberate* and often multi-line, defaulting to **Enter=send with Shift+Enter=newline** matches user muscle memory; the toggle covers the rest.

### A2. Rich text & formatting

| Control | What · user job | How rendered | Essential? | Keyboard |
|---|---|---|---|---|
| **Inline marks** (bold, italic, strikethrough, code, link) | Emphasis + inline code without leaving the keyboard. | Two delivery models: **(a) markdown shortcuts** — type `*bold*`, `_italic_`, `` `code` ``, `~strike~` (Slack's mrkdwn) — zero chrome; **(b) WYSIWYG toolbar** — a row of icon buttons revealed by an **Aa** toggle (Slack), shown above or below the input. Slack ships *both*: live WYSIWYG rich-text editor + markdown shortcuts. | **Essential** (bold / italic / code / link at minimum); the toolbar UI itself is **optional** if markdown shortcuts + a small affordance exist | ⌘B / ⌘I / ⌘⇧X (strike) / ⌘⇧C (code) / ⌘⇧K or ⌘K (link) — Slack's set |
| **Block formatting** (code block, blockquote, ordered/unordered list) | Structure multi-line content — paste a snippet, quote, enumerate. | Toolbar buttons (Slack's formatting bar has: bold, italic, strike, code, code-block, link, ordered list, bulleted list, blockquote) and/or markdown (` ``` `, `>`, `1.`, `-`). | **Essential** for code-block (agents emit code); list/quote **optional-but-cheap** | ⌘⇧8 (bulleted), ⌘⇧7 (ordered), ⌘⇧9 (quote), ⌘⌥⇧C (code block) — Slack |
| **Formatting toolbar layout** | Discoverability for non-markdown users. | A single horizontal **inline icon row**, grouped: [marks: B I S `code`] · [block: quote, code-block, lists] · [link]. Slack toggles it with **Aa** so it doesn't clutter the resting state. Modern AI composers (ChatGPT/Claude) largely **omit** a formatting toolbar — they assume markdown and render it on send. | Toolbar = **optional**; markdown rendering of sent messages = **essential** | — |
| **Preview / WYSIWYG** | See the formatted result before sending. | Slack's editor is live-WYSIWYG (you see bold *as* bold while typing). Markdown-only tools render only after send. A separate "Preview" tab is heavier and rare in chat. | **Optional** (live WYSIWYG is the premium version; render-on-send is the floor) | — |

**Critical read:** AM1 must render markdown in *messages* (the message list already does via `RichMessageCard` markdown tests). For the *composer*, the cheap, calm answer is **markdown shortcuts + a minimal "Aa"/format affordance**, not a always-on toolbar. A heavy WYSIWYG bar fights the "calm" mandate. Code-block support is non-negotiable because agents paste code.

### A3. Attachments & media

| Control | What · user job | How rendered | Essential? | Keyboard |
|---|---|---|---|---|
| **File upload (button)** | Attach a document/image via picker. | A **paperclip / "+"** button at the leading edge of the input (Slack: paperclip in the formatting/actions row; Claude: "Attach a file" to the right of the box; ChatGPT: "+" menu). Opens OS file picker. | **Essential** | — |
| **Drag-and-drop** | Drop a file onto the input/conversation. | A drop zone over the composer (and often the whole conversation) with a highlighted overlay on dragenter. Universal across modern chat. | **Essential** (expected) | — |
| **Paste (image / file)** | ⌘V an image from clipboard straight into the message. | Clipboard `paste` handler turns image blobs into queued attachments. Common bug (cited): pasted images mis-rendered as a paperclip+filename instead of an inline thumbnail — get the preview right. | **Essential** for images; **optional** for arbitrary files | ⌘V / Ctrl+V |
| **Attachment chips / preview** | See and manage what's queued before send. | A **row of chips/thumbnails above the input** (inside the composer card). Image → thumbnail; file → tile with name + size + type icon. Each chip has a **remove (×)** and, during upload, a **progress** indicator. Canonical queue-item state (per assistant-ui / CometChat patterns): `{ id, file, name, size, previewURL, status: queued|uploading|done|error }`. | **Essential** (chips + remove); progress **essential** only if upload is async | — |
| **Remove / progress** | Cancel a queued/uploading attachment; show upload state. | × on the chip; spinner / progress bar / percentage; `error` state with retry. | **Essential** (remove); progress **conditional** | — |

**Critical read:** for HyperIdle, attachments overlap the **Embed** concept (concept doc: artifact / block / diff / session-reference embeds). An *attachment* is a raw file the user adds; an *Embed* is the rendered reference once sent. The composer needs an attachment **queue** (chips above input, drag/paste/picker) that, on send, becomes message content. Don't conflate "attach a file" with "@-reference an artifact" — they're different jobs (A3 vs A4).

### A4. Mentions & references

| Control | What · user job | How rendered | Essential? | Keyboard |
|---|---|---|---|---|
| **@people / @agents** | Address / notify a participant. | Type `@` → **autocomplete popover** above the caret listing people + agents (avatar + name + handle), filtered as you type. Selecting inserts a styled mention token. In HyperIdle agents are first-class participants → `@agent` is the *primary* addressing mechanism. | **Essential** | `@` opens; ↑/↓ navigate; Enter/Tab select; Esc dismiss |
| **#channel / #thread** | Cross-reference another conversation. | `#` autocomplete (Slack). For HyperIdle maps to threads/hosts (bets, tasks). | **Optional** (valuable; not v1-critical) | `#` opens; same nav |
| **@-file / @-context** | Pull a specific entity into scope (Cursor's `@file`, `@folder`, `@docs`). | `@` (or a dedicated picker) → searchable list of files/artifacts/blocks; inserts a **reference token** that the message embeds. Cursor: "@ mentions give precise scope control"; skip if unsure and let the agent find context. | **Essential for HyperIdle** — this is the **Embed** authoring path (reference an artifact / block / session into a deliberate message) | `@` opens; same nav |
| **Link / entity references** | Paste a URL or reference an entity → rich inline card. | Auto-detected on paste / on send → unfurls to an Embed. | **Essential** (HyperIdle's whole "embed beautifully" thesis) | — |
| **Autocomplete popover** | The shared substrate for all `@`/`#`/`/` triggers. | A floating list anchored to the caret. **Keyboard contract (the part teams get wrong):** ↑/↓ move a single highlight; Enter or Tab commits the highlight; Esc closes without committing; typing filters; the highlight state must be visually distinct from hover state (documented pitfall in MUI/PrimeVue/MudBlazor); IME composition must not be hijacked by arrow keys (documented bug). | **Essential** (one popover serves @, #, /) | ↑/↓/Enter/Tab/Esc |

**Critical read:** the autocomplete popover is a single reusable primitive that should serve `@` (people/agents), `@`/picker (context/artifacts → Embeds), and `/` (commands). Build it once with a correct keyboard contract. For HyperIdle, **`@agent` and `@artifact/@block` are the load-bearing triggers** — the first because agents are teammates, the second because it's the Embed authoring path the concept demands.

### A5. Commands & tools

| Control | What · user job | How rendered | Essential? | Keyboard |
|---|---|---|---|---|
| **Slash commands (`/`)** | Invoke an action from the input (Slack `/giphy`, `/remind`; Discord app commands; Cursor/AI `/` skills). | `/` at line start → autocomplete list of commands (name + description + optional args). Selecting can either run immediately or stage an argument form. | **Optional for v1** (powerful; not floor) — but the *trigger* should be reserved | `/` opens; ↑/↓/Enter |
| **"+" / tools menu** | A single overflow for the less-frequent insert/attach/create actions. | The modern AI pattern: a **"+" button** at the leading edge opens a popover — *Attach file, Add from connectors/apps, Create image, Tools (web search, deep research, canvas, agent mode)*. ChatGPT consolidated its AI tools behind this "+"; Claude has a Connectors directory + composer tool entry. Team chat's analog is Slack's **shortcuts (lightning) + paperclip** cluster. | **Optional** (consolidation device; only worth it once there are ≥3 secondary actions) | — |
| **Emoji picker** | Insert emoji into the message body (distinct from reacting to a *received* message). | A 🙂 button in the composer actions row → grid picker with search + recents + skin tone; `:name:` typeahead inline. Discord clusters emoji/GIF/sticker next to the box. | **Optional** (nice-to-have; `:shortcode:` typeahead is the cheap version) | `:` typeahead |
| **GIF / sticker** | Lightweight expressive media. | Discord/Slack: dedicated pickers next to emoji. | **Skip for HyperIdle** (productivity/agent context; not a social chat) | — |

**Critical read:** the "+/tools menu" is a *consolidation* pattern — it earns its place only when you have several secondary actions to hide. For AM1's floor, attach + format + mention cover the need; a `/` trigger and a "+" menu are the right *growth path* but optional in the minimum. Note that AI "tools" (web search, deep research, canvas) are model-capability toggles — in HyperIdle those map to **session dial-in (AM3)**, not the everyday composer.

### A6. AI-specific composer controls — *session dial-in, NOT the everyday composer*

These are inventoried because t3code/ChatGPT/Claude/Cursor put them *on* the composer, and the founder flagged them. **For HyperIdle they are lower-level session-dial-in controls (AM3), rendered from the AM2 capability descriptor — explicitly OFF the AM1 conversation composer.**

| Control | What · how rendered (in the field) | HyperIdle placement |
|---|---|---|
| **Model picker** | Dropdown of model names (Claude: model menu next to send; ChatGPT: picker in composer on web; Cursor: dropdown at top of input, ⌘/ to cycle). | **AM3 dial-in** (per-session / per-agent default; `modelTierPreference` exists) |
| **Reasoning effort** | A select/pill: ChatGPT "Medium / High / Extra High"; Claude effort setting; t3code "High · Normal · 200k". | **AM3 dial-in** (`reasoning` exists) |
| **Mode (plan / build / ask)** | A toggle/pill: Cursor "Ask / Edit / Agent"; t3code "Build / Plan". | **AM3 dial-in** |
| **Web-search / deep-research toggle** | A pill or a "+"-menu item that flips a capability on. | **AM3 dial-in** (capability toggle) |
| **Permission level** | t3code "Full access / Supervised"; tool-approval policy. | **AM3 dial-in** |

How they render *as a pattern* (for AM3's later use): **capability-derived pills** in a row beneath/within the input — each pill is a `select` (choices) or `boolean` (toggle) rendered generically from a declared option descriptor (the AM2 model). t3code is the reference: pills for model / effort+context / mode / permissions, all generated from the per-backend descriptor.

**Critical read:** putting these pills on the AM1 composer would silently rebuild t3's "the composer configures a run" model — exactly the rejection line. Keep AM1's composer about *the message*; keep the dials in the session surface.

### A7. Quality-of-life

| Control | What · user job | How rendered | Essential? | Keyboard |
|---|---|---|---|---|
| **Drafts / autosave** | Never lose unsent text on navigation/refresh. | Slack: unsent text auto-saves as a per-conversation **draft** (and a Drafts list). Persist composer text per-thread (local + ideally server). | **Essential** (low cost, high trust) | — |
| **Edit-last-message (↑)** | Fast-fix the message you just sent without mousing. | Slack: **↑ from an empty composer** opens your last message for edit (preference-flippable to "move focus to last message"). | **Essential** (cheap power-user win); guard: only when composer is empty | ↑ (empty input) |
| **Scheduled send** | Send later. | Slack: a caret next to the send button → schedule picker. | **Optional / later** | — |
| **Multiline autosize** | Input grows with content, capped, then scrolls. | `textarea` auto-grows from 1 row to a max (~6–10 rows) then internal scroll. Universal. Hearth stub is `rows={1}` + `resize-none` but **does not auto-grow** — a gap. | **Essential** | — |
| **Character / format hints** | Show limits or a "Shift+Enter for newline" hint. | Subtle helper text below the input (e.g. ChatGPT/Claude show small hints; Slack shows format hint). | **Optional** | — |
| **Mobile composer** | Touch-first input. | Bottom-pinned; ≥44px touch targets; **≥16px font to prevent iOS zoom** (Hearth AQ-005); collapse secondary actions behind "+". | **Essential** (Hearth has hard rules) | — |
| **Accessibility / focus** | Keyboard + SR usability. | Auto-focus on thread open; visible focus ring (Hearth stub has `focus-visible` ring); ARIA on send/format/picker buttons; popover `role=listbox`/`option` + `aria-activedescendant`; error via `role=alert` (stub does this). | **Essential** | full keyboard path |

**Critical read:** drafts + autosize + edit-last (↑) are the three QoL wins with the highest trust-per-effort ratio and are missing from the stub. They're table stakes for "feels like a real chat."

### A8. Layout / anatomy

How the pieces sit relative to each other, synthesized across Slack / ChatGPT / Claude / Cursor:

- **Bottom-pinned card.** The composer is a single bordered/elevated **card** pinned to the bottom of the conversation column, sitting *inside* the reading column's max-width (Hearth: ~768px calm column), **not** edge-to-edge. The founder's "not centered" complaint = the stub isn't constrained/centered to the reading column.
- **Vertical stack inside the card** (top→bottom):
  1. *(optional)* contextual banner — "Replying to…", "Editing…", unresolved-review link (Hearth stub already has the unresolved-review link slot).
  2. *(conditional)* **attachment chips row** — thumbnails/tiles with remove + progress.
  3. **the input row** — leading actions (+ / attach / format-Aa / emoji) · the **auto-sizing textarea** (flex-1) · trailing **Send** (+ optional schedule caret).
  4. *(optional, AM3 only)* capability-pill row — model / effort / mode (HyperIdle: NOT here; lives in session dial-in).
  5. *(optional)* helper/hint line.
- **Formatting toolbar**: either a togglable row directly above the input (Slack "Aa") or omitted in favor of markdown.
- **Autocomplete popover** (@ / # / /): floats *above* the input, anchored to the caret, overlapping the conversation.
- **Centering / max-width**: the input row's textarea is `flex-1`; the whole card is centered within the column. Send is right-aligned and equal-height to the input (Hearth stub already does `items-stretch`).

ASCII (resting state, HyperIdle target):

```
        ┌──────── calm reading column (~768px, centered) ────────┐
        │  … conversation messages …                              │
        ├─────────────────────────────────────────────────────────┤
        │  [Editing your last message ·  ✕]            (banner)    │  ← conditional
        │  ┌──────┐ ┌──────────────┐                               │
        │  │ img▸ │ │ spec.md  12kb✕│   (attachment chips)         │  ← conditional
        │  └──────┘ └──────────────┘                               │
        │  ┌───────────────────────────────────────────────────┐  │
        │  │ ＋  Aa │  Message your team or @agent…          │ ▸ │  │
        │  │  📎 😊 │  (auto-sizing textarea, flex-1)        │Send│  │
        │  └───────────────────────────────────────────────────┘  │
        │      ⏎ to send · ⇧⏎ newline                  (hint)      │  ← optional
        └─────────────────────────────────────────────────────────┘
```

---

## PART B — PER-MESSAGE ACTIONS (hover toolbar + overflow menu)

The pattern across Slack / Teams / Discord / Linear: a **hover toolbar** of 2–4 high-frequency actions appears at the message's top-right on hover/focus; everything else lives behind a **"⋯ More" overflow menu**. PatternFly/Primer guidance: **show ≤3–4 actions inline; relegate the rest to overflow.** Same set is reachable via right-click context menu (Teams) and keyboard.

| Action | What · user job | Essential? | Placement |
|---|---|---|---|
| **React (emoji)** | One-tap acknowledgment / sentiment without a reply. Slack shows 1-click reactji + an "Add reaction" opener. | **Essential** | Hover toolbar (front) |
| **Reply / Reply-in-thread** | Respond, optionally branching a sub-thread. | **Essential** (reply); thread-reply **essential** in a threaded model | Hover toolbar |
| **Copy text** | Grab the message body. | **Essential** | Overflow |
| **Copy link** | Deep-link to the message. | **Essential** (shareable references) | Overflow |
| **Edit** | Fix your own sent message (author-only; ↑ shortcut, see A7). | **Essential** (author scope) | Overflow + ↑ shortcut |
| **Delete** | Remove your own message (author/admin; confirm). | **Essential** (author scope) | Overflow |
| **Quote** | Insert the message as a quoted reference in the composer. | **Optional** (overlaps reply + Embed) | Overflow |
| **Forward / Share** | Send the message elsewhere (Teams "Share to Outlook"; Slack forward). | **Optional** | Overflow |
| **Pin** | Pin to the conversation for everyone. | **Optional** | Overflow |
| **Save / Bookmark** | Personal "read later" marker (Slack Save, Teams Save). | **Optional** | Overflow |
| **Mark unread** | Re-flag for later attention. | **Optional** | Overflow |
| **More (⋯)** | The overflow opener itself. | **Essential** (container) | Hover toolbar (end) |

**Hover-toolbar layout** (synthesized): a small floating pill of icon buttons anchored top-right of the message, revealed on hover/focus, in frequency order — typically: **[😊 React] [↩ Reply] [⋯ More]** — sometimes a 1-click reactji or two. Everything secondary is in the **⋯ menu** (a vertical list with icon + label, grouped: edit/delete for author at the bottom, often destructive-styled). On touch: long-press → action sheet (no hover). Must be keyboard-reachable (focus the message → toolbar focusable) and screen-reader labeled.

**Critical read for HyperIdle:** the essentials are **React, Reply(-in-thread), Copy, Copy-link, Edit (author), Delete (author)**. Everything else (pin, save, forward, mark-unread, quote, schedule) is a later overflow addition. The destructive author actions (edit/delete) belong in overflow, not the front toolbar, to avoid mis-clicks. Reactions double as the lightweight "agent acknowledged / human approved" signal in an agent-teammate context.

---

## OPINIONATED MINIMUM-VIABLE COMPOSER — for a deliberate, agent-teammate conversation

**Design stance.** The composer's job is to *write a deliberate message and embed what it refers to* — nothing about configuring a run. Everything model/effort/mode/permission is **session dial-in (AM3)**, off this surface. Keep it calm: one card, one input row, secondary actions quiet until needed.

### In the everyday composer (the floor)

1. **Auto-sizing textarea** — grows 1→~8 rows then scrolls; placeholder "Message your team or @agent…". *(fixes stub's `rows=1` no-grow)*
2. **Send** — labeled pill, trailing edge, equal-height, **disabled when empty**, "Sending…" state (optimistic echo preferred). **Enter sends · Shift+Enter newline · ⌘/Ctrl+Enter always-sends**, with a user preference toggle. *(fixes stub's ⌘Enter-only)*
3. **Attach** — paperclip/"+" (leading) + **drag-drop + paste-image**; queued **attachment chips** above the input with remove (+ progress if async).
4. **Format** — markdown shortcuts (bold/italic/code/**code-block**/link/quote/list) + a minimal **Aa** toggle for a togglable icon row. No always-on heavy toolbar.
5. **Mention / reference** — **`@`** opens one autocomplete popover for **@people, @agents, and @artifact/@block** (the Embed authoring path). Correct keyboard contract: ↑/↓/Enter/Tab/Esc.
6. **Slash / tools trigger** — reserve **`/`** (and a "+" menu as the growth home for less-frequent inserts). Optional in v1, but reserve the triggers.
7. **Emoji** — `:shortcode:` typeahead (cheap); a picker button is optional.
8. **QoL** — per-thread **draft autosave**; **↑ to edit last message** (empty input); auto-focus + visible focus ring + ARIA; ≥44px touch / ≥16px mobile font (Hearth rules).
9. **Layout** — one bottom-pinned **card**, centered within the ~768px calm column (fixes "not centered"); banner slot (replying/editing/unresolved-review) on top; chips row; input row [+ Aa | textarea | Send].

### NOT in the everyday composer — elsewhere

- **Model picker / reasoning-effort / mode (plan-build-ask) / web-search-deep-research toggles / permission level** → **session dial-in (AM3)**, rendered as capability-pills from the **AM2 descriptor**. Putting them here rebuilds t3's rejected "composer = run config" model.
- **GIF / sticker pickers** → skip (not a social-chat product).
- **Scheduled send, pin/save/forward** → later/overflow, not the floor.

### Minimum essential per-message actions

Hover toolbar: **React · Reply(-in-thread) · ⋯More**. Overflow: **Copy · Copy-link · Edit (author) · Delete (author)**. Everything else later.

### The biggest gap a stub composer creates

A stub composer (textarea + Send, ⌘Enter-only, no attach/format/mention/slash/emoji/draft/autosize, edge-to-edge) silently tells users **this conversation isn't a real place to do work** — they can't bring a file, address a teammate, embed the artifact/spec/session they're talking about, format a code snippet, or trust that an unsent draft survives. In HyperIdle specifically the **missing `@agent`/`@artifact` path is the most expensive gap**: without it the conversation can't *author Embeds*, which is the entire AM1 thesis ("messages that beautifully embed the things they refer to"). The composer is where intent enters the system — a stub here caps the ceiling of everything downstream (agents get bare text instead of scoped references), and the "not centered, no send affordances" presentation reads as unfinished, undercutting trust on the surface the founder spends 90% of their time in.

---

## Sources

Team chat — Slack:
- [Set your Enter key preference](https://slack.com/help/articles/115005523006-Set-your-Enter-key-preference) — Enter-send vs newline + ⌘/Ctrl+Enter.
- [Format your messages in Slack](https://slack.com/help/articles/202288908-Format-your-messages) / [with markup](https://slack.com/help/articles/360039953113-Format-your-messages-in-Slack-with-markup) — Aa toolbar, marks, blocks, mrkdwn.
- [Use emoji and reactions](https://slack.com/help/articles/202931348-Use-emoji-and-reactions) / [one-click reactions](https://slack.com/help/articles/360056881694) — hover reactji.
- [Slack keyboard shortcuts](https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts) + [How to edit with the Up Arrow](https://www.howtogeek.com/677798/) — ↑ edit-last, drafts, schedule.
- [Edit or delete messages](https://slack.com/help/articles/202395258-Edit-or-delete-messages).

Team chat — Microsoft Teams:
- [Like or react to messages](https://support.microsoft.com/en-us/office/834681bf-ad45-4c12-a384-82db7208d5c8) / [React to and Save Messages (CustomGuide)](https://www.customguide.com/course/microsoft-teams/react-to-and-save-messages) — hover menu, ⋯ overflow (Reply/React/Save/Share/More).

Team chat — Discord:
- [Discord Commands, Shortcuts & Navigation](https://support.discord.com/hc/en-us/articles/31232432266647) + [Adding Emojis](https://support.discord.com/hc/en-us/articles/360041139231) — `/` autocomplete, emoji/GIF/sticker cluster.

AI chat — ChatGPT / OpenAI:
- [ChatGPT model + thinking levels](https://help.openai.com/en/articles/11909943-gpt-5-in-chatgpt) — composer model picker, "+" tools menu, Thinking levels.
- [ChatGPT App: Prompt Composer new UI for AI tools (BGR)](https://www.bgr.com/tech/chatgpt-got-a-makeover-but-all-of-your-ai-tools-are-still-there/) — "+" consolidation of tools.
- [Introducing deep research](https://openai.com/index/introducing-deep-research/).

AI chat — Claude / Anthropic:
- [Change the model, effort, and thinking settings](https://support.claude.com/en/articles/8664678) — model menu next to send, effort, thinking toggle, Attach a file.

AI chat — Cursor:
- [Prompting agents (@ mentions)](https://cursor.com/docs/agent/prompting) + [Cursor 2.0 changelog](https://cursor.com/changelog/2-0) — `@file`/`@folder` context, Ask/Edit/Agent modes, model picker ⌘/.

Patterns / design guidance:
- [PatternFly — Overflow menu guidelines](https://www.patternfly.org/components/overflow-menu/design-guidelines/) — ≤3–4 inline, rest in overflow.
- [assistant-ui — File Attachments](https://www.assistant-ui.com/docs/guides/attachments) + [CometChat Message Composer](https://www.cometchat.com/docs/ui-kit/react/message-composer) — attach/drag/paste, chip queue state.
- [MUI Autocomplete keyboard-nav issues](https://github.com/mui/material-ui/pull/35160) / [PrimeVue IME issue](https://github.com/primefaces/primevue/issues/6644) — popover keyboard pitfalls.

> All vendor pages verified for *their own current behavior*; third-party blogs/forums used only as corroboration and cross-checked against vendor docs where load-bearing. AI-composer UIs churn — control names are June-2026 snapshots; the patterns are durable.
