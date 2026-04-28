# Conversations — Journey Map (v3)

## What this view exists for
"This is where my agents reach me — to ask, to show, to decide, to chat, or just to keep me in the loop — and where I answer."

## The shapes Conversations takes
The shape of a thread is decided by the **initiator** (usually an agent, sometimes a human), not the responder. The human walks into a thread already shaped — review, survey, chat, feed, DM, coach — and plays the part that shape demands.

- **Review thread**: agent proposes a concrete action and waits for a verdict — analogue: GitHub PR review.
- **Question / survey**: agent asks one specific thing with a constrained answer (yes/no, pick one, short text) — analogue: CLI prompt.
- **Open chat / discussion**: back-and-forth with one or more agents, no verdict required — analogue: WhatsApp / Claude.ai.
- **Channel feed / status stream**: scroll-and-scan broadcast updates the human is copied on but doesn't owe a reply — analogue: Slack channel, GitHub notifications inbox.
- **DM with an agent**: 1:1 conversation initiated by either side, persistent, low-friction — analogue: Slack DM.
- **Coach thread**: the Chief of Staff's pinned, never-archived chat about how the factory is running — analogue: a recurring 1:1 with your COO.

## Reference apps — what we borrow
- **Slack**: core journey = scan unread → reply or react → reach inbox-zero. Borrows: pinned threads, mentions, presence, casual reply tone, distinct broadcast vs. DM affordances.
- **GitHub**: core journey = receive PR → read diff and reasoning → approve / comment / request changes. Borrows: 3-verdict model, inline comments anchored to artifact parts, audit log.
- **Linear inbox**: core journey = triage queue with keyboard → action → next. Borrows: J/K navigation, snooze with timer, status-state filtering, auto-advance.
- **WhatsApp / Claude.ai**: core journey = ask or read → reply or branch → leave. Borrows: low-stakes informality, no required verdict.
- **CLI survey**: core journey = read prompt → choose option → submit. Borrows: constrained answers rendered as buttons, single-shot completion, works on small screens.

## The five personas, in this view
- **Grandma**: wants to know what the agent did or asked and whether it's safe to answer; reads the whole thing before clicking. Comfortable with chat (it's WhatsApp). Frightened by review buttons.
- **Casual operator**: scans the agent's summary, agrees / pushes back / replies in plain words, gets on with running her product. Uses the same gesture for review as for chat.
- **Business person**: triages by risk and SLA; clears safe items; flags risky ones; reads the feed like a status email; replies short.
- **Power user**: chews the queue with the keyboard — read, decide, advance, reply, snooze — never touches the mouse. Wants the same shortcuts to work everywhere.
- **Hacker CTO**: wants the full reasoning chain and raw diff; rejects with a one-line note; treats chat as a serial-port debug session with the agent.

## Basics — top 3 jobs every persona does across every shape

### 1. Understand what the agent is saying
**Trigger:** A new item appears at the top of the list, the Rail badged them in, or they opened the thread directly.
**Outcome:** They can say in their own words what the agent wants — whether it's a proposal, a question, a status update, or just a message.
**Universal because:** No persona acts (or even reacts) before they understand. Grandma reads because she's careful, the CTO reads because he doesn't trust the model, the business person reads to triage. Reasoning, sender, and one-line summary are visible up front in every shape.
**Holds in:** review (read reasoning + artifact) ✓ feed (scan one-liner) ✓ chat (read message) ✓ survey (read prompt) ✓ DM (read message) ✓ coach (read summary)

### 2. Play your part in the shape the initiator chose
**Trigger:** They've read enough to know what the thread is asking — a verdict, a constrained answer, a reply, a quick acknowledgement, or nothing at all.
**Outcome:** The response the thread expects is recorded — verdict on a review, choice on a survey, message on a chat or DM, "seen" on a feed item, no action where none is required.
**Universal because:** The initiator (an agent, sometimes a human) launches a review, sends a survey, or opens a discussion. The shape is set before the human arrives. The human's job is to give the response that shape calls for, not to choose the shape. The pattern is the same across personas; only the gesture and tempo vary.
**Holds in:** review (approve/request-changes/reject/comment) ✓ feed (mark read) ✓ chat (reply/close/start-task) ✓ survey (pick option/submit) ✓ DM (reply) ✓ coach (reply)

### 3. Move on — clear the current item, see the next
**Trigger:** They just responded, or they decided this one can wait.
**Outcome:** The current item is cleared from their queue (resolved, snoozed, archived, or muted) and the next thing that wants them is in front of them, with the prior context they need to act on it.
**Universal because:** No one comes here for a single item — there's always more. Grandma scrolls; the CTO hits J. Snooze, archive, mute, and auto-advance let every persona reach a quiet inbox without reading what they don't need to. **This basic only works if each thread carries forward the prior context the human needs — the previous thread on this artifact, the previous session, the prior decision. Without that, the human re-orients on every item and the queue burn collapses.**
**Holds in:** review (next thread) ✓ feed (scroll past) ✓ chat (close/snooze) ✓ survey (next prompt) ✓ DM (archive/mute) ✓ coach (leave open, return later)

## Value-adds — most personas, less often

- **Reply with a clarifying question instead of deciding** — review-shape; grandma, casual, business, power; CTO usually rejects with a note instead.
- **Open a related prior thread for context** — review and coach-shape; business, power, CTO; casual occasionally; grandma rarely.
- **Inline comment on a specific part of an artifact** — review-shape; CTO and power use heavily; business occasionally; casual rarely; grandma never.
- **Tap a preformatted quick-reply** — review, survey, feed, DM-shape; the initiator presents 2–4 contextual buttons (e.g., "Looks good", "See above", "Pause this", "Bring me the spec") so the human can answer in one tap without typing. Grandma, casual, business lean on these; power and CTO use them when faster than the keyboard. This is the agent-to-human equivalent of an emoji react — structured, machine-readable, action-bound.
- **Filter or jump-search the list** — every shape; business, power, CTO use it to find one thread; grandma and casual use whatever loaded.
- **See which product / bet / agent this is from** — every shape; drives "is this even mine?" for business and CTO; casual notices it; grandma trusts the sender name.
- **Pause or mute a noisy agent** — feed and chat-shape; business, power, CTO; casual and grandma won't think to.

## Delighters — occasional, loved when present
- **One-line plain-English summary at the top of every item** — across all shapes; grandma and casual stop fearing the page; business gets a triage line.
- **Start a task from the conversation** — chat and DM-shape; turns "hey, can you also..." into a tracked task; business and power use it; grandma and casual rarely think to.
- **Auto-advance to the next item after a verdict or reply** — power user's whole day; CTO appreciates it; casual finds it pleasant; grandma prefers to confirm — make it a setting.
- **"Approve similar from this agent" bulk action** — review-shape only; power and business love it on Mondays; CTO uses it on safe routine items.

## What's NOT here
- **Starting a new piece of work from scratch** — that belongs in Work (a new Bet or Pitch). Conversations is for items the agent has already produced or initiated.
- **Browsing the company's accumulated docs / lore** — that belongs in Knowledge. Conversations only links out to it as context.
- **Cost of a decision** — Work owns cost (per-bet, per-task, per-session). Conversations doesn't try to price an individual verdict.

## Sanity check
For each Basic, the test is: would grandma still come back tomorrow if THIS BASIC was broken on the most demanding shape (the review thread)?
- **Basic 1 (understand):** if broken, grandma can't tell what the agent did or asked. She would not come back. Stays.
- **Basic 2 (play your part):** if broken, no verdict, no answer, no reply gets through. The whole premise (humans validate, agents talk to humans) collapses. Stays.
- **Basic 3 (move on with context):** if broken, the queue dead-ends or the human re-orients on every thread. Grandma reloads, then gives up after the second time. Stays.

## Founder's edits addressed
- Reframed Basic 2 from "respond appropriately for the shape" to "play your part in the shape the initiator chose" — the shape is set by the initiator (agent or human), not picked by the responder.
- Tightened Basic 3 to make prior-context retrieval part of the basic itself: moving on only works if the thread carries forward previous threads, sessions, and decisions on the same artifact.
- Replaced "react with an emoji" with "tap a preformatted quick-reply" — agent-to-human structured replies, not human-to-human social emojis.
- Removed the streaming-responses value-add — table stakes when LLMs answer mid-token, not a delighter.
- Removed the cost-of-this-decision delighter — cost isn't knowable per verdict, and Work owns cost. Added an explicit "not here" line to make the boundary clear.
