# Huddles — concept

Status: concept, not refined. Written 2026-10-28 from main `28b79630b`.
Rewritten 2026-10-29: intent spelled out in full; agents answer in writing and
have no audio of their own. Same day: a huddle shows as one folded entry in the
thread; only people start huddles; talking to one agent is a record button, not
a huddle.

## Intent

### The problem today

Some things are faster said than typed: unblocking someone, deciding between two
options, thinking out loud, a quick check-in. HyperIdle has no way to talk. So
when a team needs to talk, it leaves — Slack huddle, Zoom, Meet, a phone call.

What is said there never comes back. The decision is not in the thread, not on
the task, not in anyone's knowledge. Someone has to type a summary afterwards,
or it is simply gone. And the agents — who are supposed to be teammates — are
left out of every spoken conversation. They only learn what someone bothers to
type for them.

### What we want

A **real voice call inside HyperIdle**, as easy as a Slack huddle. One press on
any conversation with other people in it, and they hear each other live, in
their own voices, like a phone call. Several people at once.

Two things make it HyperIdle's and not just another call button:

- **Agents take part like any teammate.** They can be on the call, they follow
  what is said, they answer when asked. No separate "AI mode", no special voice
  bot.
- **Nothing said is lost.** Everything said on the call is written into the
  conversation it belongs to, as it happens, by whoever said it. The call leaves
  a record without anyone doing anything.
- **…without drowning the thread.** A ten-minute call is a hundred short
  messages. In the thread the whole call shows as one folded entry; open it to
  read what was said.

### Moments it is for

1. **Two people unblock each other.** "Got a minute?" — press Huddle on the DM,
   talk for three minutes, hang up. The DM now holds what was said.
2. **A quick team sync.** A few people and the team's agents in a team thread.
   Someone asks out loud: "Builder, where is the deploy?" The answer appears in
   the thread on everyone's screen a few seconds later.
3. **Talking a task through on the task itself.** The huddle happens on the
   task's thread, so what was decided lands right on the task.
4. **Someone missed it.** They see one entry for the call in the thread, open it
   and read — or ask an agent "what did we decide?", which is just a normal
   message.

Not a huddle: **talking to one agent.** With only you and an agent there is no
call to have — nobody else to hear. What fits is a **record button**: press it,
talk, stop, and your words become a message. See "Record button" below.

Agents do not start huddles. An agent that needs people writes a message, as it
does today.

### What good feels like

- One press to start, one press to join. No link, no meeting, no other app.
- It sounds like a phone call: real voices, live, no robot in between.
- Agents never interrupt and never chatter. They stay quiet until someone says
  their name, then answer once.
- After the call, the thread shows one calm line for it — who was on it, how
  long — and opening it reads like a chat of what was said, who said what, in
  order. Nobody took notes.
- Built for small teams: a handful of people on a call is the normal case.

### What it is not

- Not a meeting tool: no scheduling, no invites by link, no webinars, no big
  rooms.
- No recording of the sound. Only the words are kept, in the thread.
- No "AI notes" feature. The thread is the notes; asking an agent to summarize
  or turn it into tasks is a normal message.
- No special voice brain for agents. The agent on the call is the same agent,
  with the same tools and the same memory, as in any thread.
- Not now: video, screen share.

### "Agents like normal users" — what that means on a call

| A person on a call… | An agent on a call… |
|---|---|
| joins and shows up in the call | joins and shows up in the call, the same way |
| hears what is said | reads what is said — it is written into the thread live |
| mostly listens | does nothing at all until called |
| answers when someone asks them | answers when someone says its name |
| talks | writes its answer into the thread, where everyone sees it |
| leaves | leaves |

The only difference: an agent "speaks" in writing — like a teammate who joined
from a noisy café and types. Everything else is the same action, by the same
rules, for both.

## The idea in two sentences

**A huddle is a live call attached to a thread. People talk; each person's own
app writes their words into the thread; agents read the thread and answer there
in writing, only when someone names them.**

## How it feels

1. Any thread with at least one other person in it (a DM, a team thread, a
   task's or a document's thread) has a **Huddle** button.
2. Press it: the call starts, you are in, mic on. Members of the thread get a
   ring ("Anna started a huddle — Join"); anyone who can read the thread can
   join.
3. You hear everyone live. A call strip shows who is on the call — people and
   agents side by side — with a ring while a person speaks, a muted mark, and a
   *thinking* mark while an agent works out its answer.
4. The thread stays open next to the call, with the huddle's entry open in it:
   what people say appears there as they say it; an agent's answer appears
   there too.
5. Add anyone, person or agent, by picking them from the member list.
6. Mute, change mic or speaker, leave. The last person out ends the call. The
   huddle's entry folds up; the thread keeps everything.

## How a huddle looks in the thread

Writing every sentence as its own message would bury the thread: a short call
is dozens of messages, and the conversation before and after it gets lost.

So **a huddle is one entry in the thread.** Everything posted while the call
runs sits inside it — what people said and what agents wrote back.

- **While the call runs**, the entry is open for those on it: the live
  transcript, growing as people talk. People in the thread who are not on the
  call see one line: "Huddle — Anna, Tom, Builder — live — Join".
- **When it ends**, it folds to one line: who was on it, when, how long.
  "Huddle · Anna, Tom, Builder · 12 min". Open it to read everything, in order,
  with names.
- **No automatic summary** on the folded line. That would mean a model reading
  every call nobody asked about. Anyone who wants a summary asks an agent in the
  thread — a normal message, under the entry like any other.
- **Folding is only how it looks.** The messages are all still there: agents
  read them in full when called, and search finds them.

## Agents think only when called

Founder ruling, 2026-10-28: until someone actually addresses an agent, nothing
goes to its model. It does not re-read the call after every sentence, does not
spend tokens, never has to decide whether it should speak. A person on a call
also just listens until someone asks them something.

It still has everything: the call is written into the thread as it happens, and
when it is called, it reads all of it.

Three rules, each one a person on a call already follows:

1. **You are called when someone says your name.** That is today's rule for
   when an agent wakes in a thread, unchanged: when it is mentioned. (Today's
   other case — a thread of just one person and that agent — never has a
   huddle; that is the record button.) Being on the call adds nothing.
2. **Names said out loud count.** People say "Builder, can you…", not
   "@Builder". The speaker's app turns the names of thread members into mentions
   before posting. Same mention, same effect as typing it.
3. **Let the person finish, then answer once.** People call a name and keep
   going: "Builder — can you check the deploy, and also the logs?" So the agent
   waits until that speaker pauses, then takes one turn. Named again while it is
   thinking: it answers once more afterwards, not once per mention. Its turn
   reads the thread as it is when the turn starts.

When it answers, it reads **"since you last spoke:"** and everything said after
its previous answer, in order, with names — then the earlier call for context.
Like a person who was half-listening and just heard their name.

**Speed.** An agent answers in seconds, not instantly — a colleague who thinks
before speaking. The *thinking* mark shows it is on it. Making it faster is a
later step (see notes for architecture).

## Why agents do not speak out loud

The earlier version gave each agent a real voice on the call: the app running
the agent would join the call for it and read each answer aloud. Dropped
(founder, 2026-10-29), because:

- Everything is written down anyway, and the agent works only in text. Speaking
  would just read out a message that is already on everyone's screen.
- It was the most complex part: a hidden call window per agent, a voice per
  agent, speech generation, waiting for a gap to speak, stopping when someone
  talks over it. All of that goes away.
- With no agent sound on the call, nobody's app can mistake an agent's voice for
  their own words.

The cost: people have to glance at the screen to see an answer. For a team at
their desks that is fine — and the answer stays there to re-read, which a spoken
answer does not. If people later want answers read aloud, each listener's app
could do that for them; not now, only if asked for.

## Writing the call down

Every call is written into its thread, with or without agents on it (founder
ruling).

- **Each person's own app writes down only that person's words** and posts them
  as that person's message. Nobody's app writes down anybody else. So who said what is always right, and no one ever posts in someone
  else's name.
- **On the person's own computer.** No server receives sound, no outside speech
  service, no key to manage. The shared backend never touches audio.
- **A pause ends a message.** When you stop for about two seconds, what you just
  said becomes one message. That pause is also how an agent waits for you to
  finish.
- **Muted means nothing is sent and nothing is written.**

## Record button

For talking to one agent — or to anyone, when talking is easier than typing.

- The message box in every thread gets a **record** button.
- Press it and talk. Press stop. Your words, written down on your own computer
  the same way as on a huddle, go into the message box.
- Fix anything it got wrong, then send. It is your normal message.
- In a thread with just you and an agent, the agent answers it as it answers
  any message today.

No call, no sound sent anywhere, nothing kept but the words. It reuses the
writing-down part of the huddle, so it costs little once that exists.

## Where it fits what exists

No new object, no new action, no new event.

| Need | Uses |
|---|---|
| Start | `send_message` posts a huddle entry into the thread (like a review card) |
| Join / leave / end | `adjust_thread` changes that entry: who is on, when it ended |
| Tell others it started / who joined | The existing live update for the thread |
| Ring someone | The existing inbox: a new huddle entry concerns the other people in the thread |
| Hear each other | Live audio between people's apps (plumbing, like the websocket) |
| The record, and how agents follow | `send_message` — plain messages |
| An agent answering | `send_message`, exactly as in any thread |
| The folded entry in the thread | Each message posted while a call runs is marked with it; the thread shows them inside the entry |
| Record button | Only the message box; the result is a normal `send_message` |

## Order

1. **The call between people.** Huddle button, ring, call strip, live audio,
   mute and leave, mic permission, writing each person's words into the thread,
   and the folded huddle entry. Useful on its own, with no agent anywhere.
2. **Agents on the call.** Agents show in the strip, spoken names become
   mentions, wait for the speaker to pause, one answer at a time.
3. **Record button.** Uses the same writing-down.

All three together are "done". How to build it, and two missing foundations
found on 2026-10-31 (people are not told apart on a shared server; a shared
server runs no agents): [build-plan.md](build-plan.md).

## Founder rulings

- 2026-10-28 — Agents speak only when named; until called, nothing is sent to
  their model.
- 2026-10-28 — Any person can start a huddle.
- 2026-10-28 — Every call is written into its thread, with or without agents.
- 2026-10-29 — Agents answer in writing only; they have no audio on the call.
- 2026-10-29 — A full transcript must not flood the thread: a huddle shows as one
  folded entry that opens to the full call.
- 2026-10-29 — Agents do not start huddles; they write messages.
- 2026-10-29 — Talking to one agent is not a huddle; it is a record button.

## Sources

- Codebase facts: the file references above (main `28b79630b`).
- [Claude Code voice dictation docs](https://code.claude.com/docs/en/voice-dictation)
  — harness voice features are mic-to-text for a person at a keyboard; agents
  could not take sound directly anyway.
- [Mesh limits (discuss-webrtc)](https://groups.google.com/g/discuss-webrtc/c/Kvv2LfSr1jY)
  — direct connections are fine for small audio calls.
- [Apple SpeechAnalyzer vs whisper.cpp, Mac test](https://dev.to/iravoice/apple-speechanalyzer-vs-whispercpp-a-40-speaker-mac-benchmark-40i4)
  — early, informal; test on real call audio before deciding.
- [Electron speech recognition fails with "network"](https://groups.google.com/a/chromium.org/g/chromium-dev/c/RBZXqc0Zvmc)
  — why the browser's speech-to-text is out.
- [When2Speak (arXiv 2605.05626)](https://arxiv.org/pdf/2605.05626) — agents
  that talk at every pause are the failure; speaking only when asked avoids it.
