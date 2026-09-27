# Founder interview — product core

Running record. Founder's words are verbatim and authoritative. My notes are marked.
Goal: find the product core worth rebuilding, before any design prompt is written.

**Frame set by founder (2026-08-17):** the existing codebase is the output of a failed
attempt to build an agentic software factory. It is **not** a record of founder intent.
It is material, not evidence. Do not infer product direction from it.

My role: new PM onboarding to save the product. Interview top to bottom until every
area has founder feedback.

---

## Q1 — Picture a Tuesday where HyperIdle earned its keep

> a real tuesday I would be able to do 80% of my work in hyperidle. Currently most teams
> have the trifecta of tools Linear, Notion, Slack, Claude or Codex. Right now I jump
> between a message here, referencing a document there, working on that document with an
> agent before putting it in a ticket in the third tool, when then gets fed again to
> another agent. constantly I am jumping between tools and there is no way for the system
> to self improve across all domains since its all gated in a different tool and I need to
> be the bridge. On a perfect tuesday I would get into the zone in this tool and fluently
> jump from chat to document to message to agent to task and back. On a perfect day I
> would open my laptop sink in for 4 hours and come out feeling hell yeah. And on wednesday
> morning the system would have self improved and my 4 hours would be done in 3:45 hrs.

### What's in this answer

- **Target:** 80% of the founder's work happens in HyperIdle. 20% stays outside — undefined.
- **Displaces:** Linear + Notion + Slack + Claude/Codex. Four categories: tickets, docs,
  messages, agents.
- **Named pain:** constant tool-jumping. Message → reference doc → work doc with agent →
  ticket in third tool → fed to another agent.
- **Deeper pain:** *"no way for the system to self improve across all domains since its all
  gated in a different tool and I need to be the bridge."* The founder is the integration
  layer, and therefore the only part of the loop that learns.
- **Flow:** chat → document → message → agent → task → back, fluently. 4 hours, sink in,
  "hell yeah."
- **Compounding, quantified:** Wednesday's 4 hours become 3:45. The founder stated a number.
  Improvement is expected to be *measurable*, not vibes.

### My read (to be confirmed or killed)

Causal chain, not a feature list: one surface → shared substrate → the system can see
everything → it can learn → next week costs less. Unification is the *precondition* for
compounding, not the product. **Asked founder to confirm.**

### Open threads from Q1

- What is the 20% that stays outside HyperIdle? (scope boundary — tells us what not to build)
- "Self-improve" — what concretely? Awaiting the fifteen-minutes example.
- What is carried across the bridge today, and what is lost at each handoff?
- What breaks the four hours today?
- "Hell yeah" — what produces that feeling? Volume shipped, or something else?
- Is the unit of self-improvement the org, the founder, or an individual agent?

---

## THESIS — confirmed by founder

> "Unification isn't the product. It's the precondition for the thing you actually want,
> which is a system that compounds."

Founder: *"yes yes yes well done that describes the higher level goal in a single sentence."*

And: **"flow and compounding are both important. flow is what gets you started, compound is
what keeps you in it."** Neither is subordinate. Flow = entry. Compounding = retention.

---

## Q2a — The fifteen minutes: what "self-improve" actually means

> Lets say Tuesday we started working on a new feature and it cost me plenty time to explain
> my taste for what a clean user feature looks like, but Wednesday the definition of a clean
> feature has become knowledge and the system the next day proposed a lot closer in my style.
> Or another example is the on Tuesday I had to draw connections between different pieces of
> a software because grep wouldn't cut it, but Wednesday the system had realised it needed to
> build a better trace and built it and now found the connections between software parts that
> grep couldn't find. All of those are real incidents that happen currently all the time. its
> mundane stuff that keeps repeating in getting a basic work to flow.

### My read — two distinct machines, different risk profiles

1. **Taste capture** — the system learns the *founder's standard*. Explained once, becomes
   knowledge, future proposals land closer to his style. System learns about *him*.
2. **Capability self-extension** — the system notices repeated friction, decides it needs a
   better tool, and **builds it**. System learns about *itself* and modifies its own toolset.

**Trigger for both: mundane friction that repeats.** So the system must detect repetition —
which requires seeing across all domains. This closes the loop back to the thesis: unification
is what makes repetition visible, repetition is what triggers compounding.

Founder stresses these are **real, current, constant** incidents — not aspiration.

---

## Q2b — What you carry across the bridge: CONTEXT and PROXIMITY

> typically its context. With all these different tools you are able to set everything up that
> connections exist and are built correctly but thats not by design. I want something that has
> this context construction built in by design. stuff is connected by design and the conntext
> is rich by design. If I give an agent access to my notion he will be able to search thousands
> of documents and only 3 referenced. But what really happens that the knowledge or the relevant
> conversations live in proximity to the task, and this proximity is something we need to design
> for, this is only possible if each pieces (work, knowledge, agent, ...) can understand and
> learn what is currently "close" to me, this closeness is predictive in context and this context
> conslidation across all these domains is what the system can heavily speed up. I know this is
> a bit fuzzy but that the entire machinery behind what knowledge consolidation for a session and
> the entire idea of all conversations are threads and tasks are organized around sessions are
> about, like this everything is always in proximity in the first instance this is data structure
> prosimity since thats what the easiest copy of neural proximity was.

### Key claims

- The carried thing is **context**.
- Today connections *can* be built, but **not by design** — manual construction every time.
- Wanted: **connected by design, rich by design.**
- **Search is the wrong model.** Thousands of Notion docs, 3 relevant. Retrieval over a large
  corpus ≠ context.
- **Relevant knowledge and conversations live in proximity to the task.** Proximity is the
  thing to design for.
- Requires every piece (work, knowledge, agent, …) to **understand and learn what is currently
  "close" to me."**
- **"this closeness is predictive in context"** — proximity predicts relevance.
- Existing machinery (knowledge consolidation per session; all conversations are threads; tasks
  organized around sessions) was an attempt at exactly this.
- **Critical admission:** *"this is data structure proximity since thats what the easiest copy
  of neural proximity was."* → the current model is a **first approximation the founder settled
  for**, not the intended end state. Biggest open architectural question in the product.

### Open on proximity

- Structural closeness (same thread/session/task) vs learned closeness (recurrence, behavioral,
  semantic)? **Asked.**
- Is proximity indexed **per-person** ("close to me") or a property of the work? **Asked.**
- When closeness is wrong, does the founder want to inspect and correct it? **Asked.**

---

## Q2c — What breaks the four hours: the handoff contract

> Something new comes in and requires attention but the handoff two an agent or another tool is
> so expensive or so likely to be forgotten that the best solution is to quickly do it, that
> 30min context change is what rips me out of what I am doing. If that brainless handoff was a
> 20sec action now and a thoughtfull return in 4 hours is so easy and and seemless thats what
> would allow me to stay in context.

### The requirement — two-sided, and the sharpest thing said so far

- **OUT: ~20 seconds, brainless.** Must be cheaper than doing it yourself. Must be trustworthy
  enough that the founder doesn't fear it being dropped — **fear of it being forgotten does as
  much damage as the cost itself.**
- **BACK: four hours later, thoughtful, seamless.**
- Failure mode today: handoff too expensive/unreliable → "I'll just do it" → 30 min context
  switch → out of the zone.

### My read — derived design principle (asked founder to confirm)

If the return is thoughtful and four hours later, then **returns must be deferred and batched
by design**. The return path is **pull, not push**. Nothing an agent produces may reach the
founder mid-flow. Open: what, if anything, is allowed to break in.

---

## Q3a — Deferred/batched returns? "yes and no" — the real answer is FEAR

> yes and now, what is really behind this is that the agentic times have changed how you work
> suddenly you have a multitude of assistants or lets say extensions of yourself. You can split
> of a part of your braing and later consolidate back with that part of the brain. Where your
> though sits right now is to some part subjective prioritization. And in that prioritization
> currently sits a lot of fear not to forget that. currently in the agentic world it has gotten
> even harder to not forget since the agent won't finish and also wont come back to you in the
> place where interrupte work sits. Conversations are what bring interruptions "can you quickly
> do this", Work is what is longer term mechanical work planning , And Knowledge is actual human
> deep work where thought goes. if interruptions or planned efforts would easily flow from the
> correct scope to another then subjective prioritization would be less driven by "don't forget
> about this" and more about "this is the most value now", because you know nothing is forgotten.
> Everything is either what you are already working on or done an dealt with until you have a
> empty slot to return to i.

### THE ENEMY IS NAMED: fear of forgetting

Prioritization today is driven by **"don't forget about this."** The product's job is to make it
driven by **"this is the most value now."** The mechanism is guaranteed non-loss.

End state: *"Everything is either what you are already working on, or done and dealt with, until
you have an empty slot to return to it."*

### Agents made forgetting WORSE — two distinct failure modes

1. The agent **won't finish.**
2. The agent **won't come back to you in the place where the interrupted work sits.**

→ **Corrects my earlier read.** The return is not merely "deferred and batched." Failure mode 2
says the return must **reattach to the site of the interrupted work**, not arrive in a separate
inbox. A queue is the wrong shape. Restoration-in-place is the right shape.

### THE THREE PRIMITIVES ARE COGNITIVE MODES, NOT CONTENT TYPES

| Primitive | What it actually is |
|---|---|
| **Conversations** | Where **interruptions** arrive — "can you quickly do this" |
| **Work** | Longer-term **mechanical** work planning |
| **Knowledge** | **Actual human deep work, where thought goes** |

This is a taxonomy of *kinds of thinking*, not of content. Nothing like the current app's
chat / tickets / docs split.

**⚠ Contradiction with the current product:** Knowledge today is a triage queue of validated
facts with confidence percentages — a memory store. The founder describes it as the surface where
*he thinks*. Those are different products. **Flagged to founder.**

### The central verb: FLOW BETWEEN SCOPES

*"if interruptions or planned efforts would easily flow from the correct scope to another"* —
an interruption in a Conversation must be able to become Work, or become Knowledge, cheaply.
This is the mechanic the whole promise rests on. **Asked founder to define it.**

### Split / consolidate

Agents are **extensions of self**: *"You can split off a part of your brain and later consolidate
back with that part of the brain."* Split and consolidate are the fundamental operations — of
attention, not just of work.

---

## Q3b — What makes something close

> I think thats a complex question and actual links (think google page rank) is only a part of it,
> how often its been looked at in the same time frame is another, content similarity also plays a
> role. context assembly can become an ever further optimized thing.
> Close means relevant. And close means it was there for you (or the agent) you didn't have to
> search it it was sitting right there next to the other knowledge document that was linked.
> Imagine you open a document in notion and start working on it somehow your brain knows if you
> click 2 folders further there was that other document useful for it even though it wasnt linked,
> somehow it was closely related for your brain even though not directly linked.

- **Close = relevant.** Multi-signal, not one mechanism:
  1. **Link graph** (PageRank-like) — only *part* of it
  2. **Co-access in the same time frame** — behavioral
  3. **Content similarity** — semantic
- **"context assembly can become an ever further optimized thing"** → proximity itself compounds.
- **ACCEPTANCE TEST, in his words:** *"you didn't have to search it, it was sitting right there."*
  **No-search is the design goal.** If the founder or agent had to search, proximity failed.
- Indexed **per actor** — "for your brain", "there for you (or the agent)". Human and agent each
  have a proximity field. (Strongly implied; not yet explicitly confirmed.)
- The target intuition: the unlinked-but-related document your brain knows is two folders away.
  **Proximity must find what the link graph cannot.**

---

## Q3c — When closeness is wrong

> I want the system to correct it themselves. Just like I learn to ignore that document the
> context assembly should learn to not include that document

- **No manual correction UI.** Kills an entire class of bookkeeping surface.
- Correction signal is **behavioral** — he ignored it, so the system learns to stop including it.
- Open: the system must therefore *observe what he ignores*. Not yet probed.

---

## Q3d — Self-extension and supervision → this is what REVIEW is for

> Yeah thats the other part or where the review aspect sits, agents need reviews and guidance at
> the right point in time, else everything drifts. The agent should ask for guideance but the
> structure of the work (bet to tasks) should make it most efficient for agents to not be
> completely blocked. thats work planning and reviews.

- **Review = drift control**, not a permission gate. Without guidance at the right moment,
  everything drifts.
- The agent **asks** for guidance — pull from the agent, not policing by the human.
- **Work structure (bet → tasks) exists to keep agents unblocked while a question is pending.**
  Its job is to make agent progress **resilient to founder latency**.
- This is what makes the handoff contract survivable: out in 20s, back in 4h, and meanwhile
  nothing stalls.

---

## Q4a — CORRECTION: I over-interpreted the three primitives

> no those are not the right names for the wrong reason or not completely. those actually map
> against a content type you already know how to use. since in the end these are surfaces for a
> user. chat is alignment and interruption, but as people with agents are able to do more by
> themselves it is typically interruption where you must reach out to someone. knowledge work has
> come down to coediting documents, And work has come down to slicing work down to tasks that
> agents can reliably execute without intervention. certain content types have proven to be
> efficient in the agentic world.
> don't over interpret here the goal here is really to merge slack, linear, notion into a
> beautiful and easy to use tool that is for the flow aspect and the the learning curve. We don't
> exit in isolation but even a consolidated system lives in an ecosystem and certain standards
> have established as efficient.

**Standing instruction: DON'T OVER-INTERPRET.** Reflect less, ask more concretely.

The familiar content types are **deliberate**, for two reasons: **learning curve** (users already
know how to use them) and **ecosystem** (these formats are established standards; HyperIdle does
not exist in isolation). Do **not** invent a novel primitive taxonomy.

| Surface | Familiar type | What it has become in the agentic era |
|---|---|---|
| Chat | Slack | Alignment + interruption — specifically **where you must reach out to someone** (agents absorbed the rest) |
| Knowledge | Notion | **Co-editing documents** |
| Work | Linear | **Slicing work into tasks agents can reliably execute without intervention** |

The innovation is the connective tissue and the compounding — **not** the nouns.

---

## Q4b — Knowledge: SECI, and why triage went wrong

> Yeah this is right but I would say "Knowledge as where WE think collaboratively". the triage
> stuff is really a knowledge management pattern that has become far to prominent. What was really
> behind this is the idea of how knowledge cumulates. Knowledge goes from your idea (S), to
> something we discussed (E) and wrote down in a refined version (C), to finally something that the
> next agent or person build upon. Essentially the SECI cycle of knowledge. But the triage took a
> weird form. It came from the issue of agents speed running the SECI cycle without human oversight
> which leads to very weird stuff. What is probably should really be is draft and published and
> some notifications. PRs to some extend enforce this in code, but then PRs themselves are also to
> rigid of a process. So yeah Knowledge is where we think and create verified knowledge.

> both, thats the beautiy of it. documents are beautiful for thinking and great memory store. the
> main aspect is usability on one side and knowledge management processes on the other side.

- **"Knowledge as where WE think collaboratively."** Collaborative, not solo.
- Underlying model: **SECI** (Nonaka). Idea (S) → discussed (E) → written down refined (C) →
  built upon by the next agent or person.
- **Why triage exists:** agents **speed-run the SECI cycle without human oversight**, which
  produces weird results. Triage was a *defensive* response — and it over-grew.
- **Replacement, in his words: "draft and published and some notifications."**
- PRs enforce something like this for code but are **too rigid** to copy.
- Documents are **both** a thinking surface **and** a memory store — that duality is the point.
- Two design concerns: **usability** on one side, **knowledge-management process** on the other.

**Open design problem:** the lightest process that gives humans oversight of agent-generated
knowledge without PR rigidity.

---

## Q4c — Scope flow: it's a LOOP anchored on the conversation

> not sure i understand your proposals, but essentially since everything is connected and all
> flows through the same flow if something reaches you and you assign it to an agent (in 20 sec)
> it automatically becomes work, and if that work requires thinking a piece of knowledge will
> automatically come up, in the end a review of the result will happen which flows back into that
> conversation until work is done. Since with the agentic are every work can be finished in hours
> nothing ever needs delaying forever its just delayed until I finish what I currently focus on.
> Right now we break focus to not forget, what I want is to finish one thing and then turn attention.

**The loop:**
something reaches you (conversation) → you assign it to an agent **in 20 seconds** → it
**automatically becomes work** → if the work needs thinking, **a knowledge piece automatically
comes up** → a **review** of the result happens → **flows back into that conversation** → until
done.

- **The conversation is the anchor.** The result returns to where the interruption arrived.
  Confirms: return reattaches to the site of the interrupted work.
- No manual scope assignment. Becoming-work and surfacing-knowledge are **automatic**.
- **Delay is bounded, not indefinite** — agent work finishes in hours, so nothing is deferred
  forever, only until the current focus ends.
- **"Right now we break focus to not forget. What I want is to finish one thing and then turn
  attention."** → the rhythm is **finish → turn**, not interrupt → return.

---

## Q4d — Why things get forgotten today: THE TRANSLATION STEP

> No not everything is stored. Linear only remebers what we actively moved from slack to linear as
> a workpackage. notion only remebers what we turned into a notion document. In my world all work
> is a work element, and all .md documents are knowledge and the syncing take care of the rest. no
> matter where you work on this since everything is connected it will always in the end by where it
> belongs without you or an agent having to work correctly the stuff that needs connection is built
> in by design.

**Corrects my premise.** Nothing is reliably stored today, because storage requires **an act of
translation**: Slack → "actively moved" → Linear workpackage; a thought → "turned into" → Notion
doc. **That translation step is where forgetting happens.**

His guarantee: **no translation step.**
- **All work is a work element.**
- **All .md documents are knowledge.**
- **Syncing takes care of the rest.**
- *"no matter where you work on this"* — implies working **outside the app** (editor, repo) still
  lands correctly.
- *"without you or an agent having to work correctly"* — **correctness must not depend on
  discipline**, human or agent.

→ Suggests markdown/filesystem as substrate and HyperIdle riding existing artifacts rather than
being a walled garden. **Not yet confirmed — asked.**

---

## Q5a — Who is "we": a real small company, humans AND agents

> both humans and agents. think of a small startup with 10 employees and dozens of agents. there
> will be a few that focus on one product, or practice which focues on software, and so on that is
> the layer above where teams and communities of practice came from (i think called scopes in
> knowledge). Knowledge is typically scoped to something and that scoping is a strong leve to what
> is close. The think is its a team of people with agents where agents have assigned "owners"
> (thats the org hierachy aspect) but like in a real company you can still talk to someone who is
> not in your line, in this case another persons agent.

**Kills my solo-founder assumption.** Target shape: **~10 humans + dozens of agents.**

- Layer above individuals: **teams** and **communities of practice** (a few focused on one product,
  a practice focused on software, etc.). He believes these are called **scopes** in knowledge.
- **Knowledge is scoped, and scope is a strong lever on what is close.**
  → **SCOPE IS A PROXIMITY SIGNAL.** Direct link between the org model and the proximity mechanism.
- **Agents have assigned owners** — that is the org-hierarchy aspect.
- **Cross-line contact is allowed:** like in a real company you can talk to someone outside your
  line — here, **another person's agent**. Hierarchy is *ownership*, not access control.

---

## Q5b — Where the truth lives: BLOCKS IN THE DATABASE

> In the knowledge as blocks in the database. when we turn the into files in a agent workspace or
> the UI or somehwere else that is always just a mirror of that with the necessary syncing and
> consolidation mechanisms back.

- **Authoritative store: blocks in the database.** Not the filesystem.
- Files in an agent workspace, the UI, or anywhere else are **mirrors**, with syncing and
  consolidation back to the blocks.
- **Kills my markdown/filesystem-substrate guess.** ".md documents are knowledge" (Q4d) means
  markdown is a *projection*, not the source of truth.
- "Blocks" is an existing noun in the codebase (`docs/blocks/`, `framework/block-derivation`,
  `Block.tsx`) — it survives the restart.

---

## Q5c — Draft → published: ONE sequence, varying EXPOSURE

> Thats what was in that risk ranking aspect. like in a real company some decisions escalate up and
> some don't and the reason is typically exposure / risk / ownership. the same goes here for
> knowledge but also work / reviews. The agent judges how far does this travel, i.e the agent
> deciding this low level service is called email service doesn't really matter to the human, but
> the agent deciding we call the entire product my beautiful email system in our user facing
> marketing very much needs human attention. the sequence doesn't change what changes is the exposure

- **The sequence never changes. Exposure changes.** One draft → published path for everything.
- Escalation criteria, as in a real company: **exposure / risk / ownership.**
- **The agent judges: "how far does this travel?"** Blast radius, not security risk.
- Worked example: naming an internal service `email service` → no human needed. Naming the whole
  product in user-facing marketing → needs human attention.
- **Applies uniformly to knowledge, work, and reviews.** Not three mechanisms — one.
- Consistent with ETHOS (no preemptive gating, no gate-by-default) and with the existing
  riskTier/approval machinery.

---

## Q6a — When exposure is misjudged: retro → knowledge

> mistakes or annoying stuff happens and thats where retros and that stuff came from. we learn from
> it write it into knowledge and know next time.

- **No preventive mechanism.** Mistakes are expected; correction runs through **retro → written
  into knowledge → known next time.**
- Matches ETHOS: security is never preemptive, it is *earned from real learnings*.
- **Calibration learning is an explicit written artifact, not a hidden weight.** Answers my worry
  about the system quietly learning its way past the one thing that mattered — the learning is
  visible knowledge, reviewable like anything else.

---

## Q6b — NO FLOOR. There is a DIAL of human involvement.

> The previous attempt failed horribly because we gave to much autonomy and to little checks. I
> think complete autonomous change are still not realistic, everything will pass through human
> hands just again at what intensity. in some change you might just quickly be asked should I
> deploy witha 3 line explain and you say yes, in other cases you are deeply involved along ever
> step from refinement, task splitting & program planning, design, reviews, ... again it depends on
> the scope and exposure. Maybe in the future there are things that can be done alone but right now
> the question must never leave your hands isn't really that relevant.

**Why the previous factory failed: too much autonomy, too little checks.**

- **"complete autonomous change are still not realistic, everything will pass through human hands —
  just at what intensity."**
- **There is no forbidden list.** My "what must never leave your hands" framing is the wrong
  question — he says so directly.
- The variable is **intensity of human involvement**, governed by **scope and exposure**.
  - Low intensity: *"should I deploy?"* + a 3-line explanation → yes.
  - High intensity: involved at every step — **refinement → task splitting & program planning →
    design → reviews → deploy.**

**→ MAJOR DESIGN CONSEQUENCE.** Human review is **the main path, not an exception path**. The
product is not "autonomous agents with guardrails"; it is "everything returns to a human, at
varying depth." The supervision surface is the centre of the product.

---

## Q6c — The day has a shape

### 9am — handover from the night shift

> You jump in and see all the work that finished over night, a bit like if you have teams working
> aronud the globe you come to the work from the previous time zone and there is already messages
> lined up for you to go through and results to look at before you settle into your focus time for
> some of them, or decide to open complete new bets.

- Morning = **arriving to the previous time zone's output.** Follow-the-sun handover.
- On screen: **work that finished overnight · messages lined up · results to look at.**
- Then a choice: **settle into focus time** on some of them, **or open completely new bets.**

### 6pm — load the night shift

> You drafted a lot of new knowledge and bets and now have them all ready to be handed over to be
> worked on during the night. the hell yeah is actually if you notice that your 6-8 hours of deep
> thinking and planning led to actual 24 hours of productive work else where. that that is probably
> more a volume aspect since the hard stuff cracked happens during the deep thinking & planning
> hours rarely during the unsupervised hours.

- Evening = **drafted knowledge and bets, ready to hand over for the night.**
- **THE "HELL YEAH" IS A LEVERAGE RATIO:** *6–8 hours of human deep thinking and planning →
  ~24 hours of productive work elsewhere.* And he wants to **notice** it.
- **Explicit division of labour:**
  - **Human hours = where the hard stuff gets cracked** (thinking, planning, deciding).
  - **Unsupervised agent hours = volume**, rarely breakthroughs.

### The daily cycle

**Morning: harvest the night shift → Day: deep thinking + planning (the valuable part) →
Evening: load the night shift.**

---

## Q7a — Same day for everyone, different domain. And CONVERSATIONS ARE THE TRANSPORT.

> yeah everyone opens bets and everyone does deep thinking but everyone in a different domain, even
> with rounders think a CEO, CTO, COO, CMO each one has agents in their domain and hard challenges
> and bets to think through in their domain. Some goes if you have layer below the have hard
> problems in their domain to think through and bets to make and work through.
> what does come in here is again the hierachy from the org, i.e you need something from another
> team i.e product team 1 from infra team suddenly you might cross ownership. Or product team 2 has
> something that affects all teams and neads a review from the layer above, or a founder is suddenly
> stuck on a review he cannot judge and needs to hand down to team A. these dependencies in the
> organisation show how things can flow up, down or sideway. Conversations (including Reviews) are a
> natural form how stuff flows and is handed over. conversation carries context and can lead to a
> back and forth.

**One shape, replicated per domain and per level — fractal, not role-differentiated UI.**
Founders (CEO/CTO/COO/CMO) each have agents, hard challenges and bets *in their domain*. Same for
every layer below.

**The org hierarchy generates flow.** Three worked examples:
- Product team 1 needs something from infra team → **cross-ownership** (sideways)
- Product team 2 has something affecting all teams → **review from the layer above** (up)
- A founder is **stuck on a review he cannot judge** → **hands it down to team A** (down)

> **"Conversations (including Reviews) are a natural form how stuff flows and is handed over.
> conversation carries context and can lead to a back and forth."**

- **Reviews are a kind of conversation**, not a separate surface.
- Conversations are the **transport layer of the organization** — work moves up, down and sideways
  through them, because a conversation carries context and supports back-and-forth.
- **Review routes to whoever can actually judge** — including *downward*. Not an approval chain.

---

## Q7b — The review is COMPOSED per question, not templated

> This is not a single answer and this is why the review surface has such a diverse set in what it
> can display. this answer is different every time and the agent has to think this through and
> design a review for exactly this question. this can mean a document, an email, a live running
> preview, a screenshot, a dashboard, ... or just an explanation.

- **There is no generic 3-line format.** The answer differs every time.
- **The agent must think it through and *design a review* for exactly this question.**
- Vocabulary: document · email · live running preview · screenshot · dashboard · or just an
  explanation.
- → The canvas set is a **composition vocabulary**, not a list of templates. Must be extensible.
- Explains and justifies the existing `ReviewComposition` / `canvas-registry` machinery.

---

## Q7c — Do NOT build a leverage dashboard

> no hell yeah is a subjective feeling. you hopped for things to finish and they did. achieving
> real 24 hour work cycles is in practice soo hard that the numbers will often be underwhelming
> for the human.

- **"Hell yeah" = hope met.** You wanted things to finish; they finished.
- Real 24h cycles are hard in practice — **a displayed number would usually disappoint.**
- **My leverage-metric idea is killed.** The morning should *confirm expectations were met*, not
  display a score.

---

## Q8a — Review = conversation + a display of a result

> think of reviews like in github, the power of the PR review is not the diff but really the ability
> to talk about it with comments ... thats as well a conversation so a review is inherently a
> conversation about a display of a result. so review is conversation + display of a result. And
> this works far beyond code review.

**REVIEW = CONVERSATION + DISPLAY OF A RESULT.**
The power is the *talking about it*, not the artifact. The diff is not the point; the comments are.
Generalizes far beyond code.

---

## Q8b — ★ THE ARCHITECTURE: three spines that repeat endlessly

> conversation is a very essential surface. but all three are relevant or more so what is underneath.
> In the old app thats whats called a thread (like in slack), a work item (like in linear), a
> knowledge block (line in notion). These three are the spines and repeat endless. every bet, task,
> knowledge, review has a thread attached and every thread also shows up in your conversations so it
> doesn't matter when someone asked a question on a bet you see it in your conversations and can
> answer there with the context displayed. The same goes for work item, the moment you assigned an
> agent to rework a piece of the knowledge document or to deal with this message it ends up being a
> work item that needs taking care of and you can always go to work and find that work item again and
> see the context there. The last part is the block a knowledge document is a set of blocks, a
> description in a task or bet is a block and every rich description in a conversation or review is a
> block.

**Not one primary surface. THREE SPINES that repeat endlessly** — and what matters is what's
*underneath* the surfaces, not the surfaces.

| Spine | Familiar analogue | Attaches to | Aggregated in |
|---|---|---|---|
| **Thread** | Slack | **every** bet, task, knowledge doc, review | Conversations |
| **Work item** | Linear | created the moment an agent is assigned — from a message, a doc, anything | Work |
| **Block** | Notion | every rich description anywhere — knowledge doc, bet/task description, conversation, review | Knowledge |

**The composition rules — this is what "connected by design" actually means:**

1. Every bet, task, knowledge doc and review **has a thread attached**, and every thread **also
   appears in your Conversations**. Someone asks a question on a bet → you see it in Conversations
   → you answer there, **with the context displayed**.
2. Assigning an agent — to rework part of a knowledge doc, to deal with a message — **creates a
   work item**. You can always go to Work and **find it again with its context**.
3. A knowledge document **is a set of blocks**. A bet/task description **is a block**. Every rich
   description in a conversation or review **is a block**.

→ Three objects compose everywhere; each has a home view that aggregates every instance. No
translation step, no manual linking. **This is the answer to "context construction built in by
design."**

---

## Q8c — ★ The 20 seconds, verbatim

> user A: "we have this and that problem"
> me: "@builder-agent can you take a look at this and propose a fix"
> builder-agent joined thread, builder-agent: "yes will take care end respond back when I have a
> solution ready"
> work item created for builder agent
> ... time goes by ...
> builder agent requested a review

**The whole handoff is an @-mention in a thread.** No form, no picker, no scope choice. Then:

1. The agent **visibly joins the thread**.
2. The agent **acknowledges and commits** — *"yes, will take care and respond back when I have a
   solution ready."* ← **this is the mechanism that kills the fear of forgetting.**
3. A **work item is created automatically**, as a side effect. The human never files it.
4. Time passes.
5. The agent **requests a review**, which lands back in the same thread.

The human never leaves the conversation.
*(Mobile / away-from-laptop question went unanswered — re-ask.)*

---

## Q8d — The 20% outside: uncoupled exploration

> socialising, creative sessions, random browsing, ... . the super diverse set of other things that
> are not so closely coupled to core work, and when they will be coupled I will have to structure my
> thoughts first and as a result write a concept or a bet.

- Outside: **socialising, creative sessions, random browsing** — things **not closely coupled to
  core work**.
- **The doorway back in is authoring: structure your thoughts → write a concept or a bet.**
- → **Do not build a catch-all inbox or scratchpad for unstructured exploration.** Entry to the
  system is an act of structuring.

---

## Q9a — The firehose: SESSION contains the noise, and the product is not for enterprises

> yeah thats where the abstraction of the session comes in a thread is not the agent session, once
> the agent is done it will actively reply back to the chat the inbetween talk is just in the sesion.
> And yeah highlighting and notifications for mentions keep it survivable. but yeah this surely needs
> tuning. But the entire system is setup for a future where people mostly help themselves, not for a
> enterprise org where chatting up other people is the main business for most people. its not build
> for the 10k people or its valuable for small team orgs with fewer intra meetings.

**Thread ≠ session.** The session is the agent's working transcript and stays hidden. **When the
agent is done it actively replies back to the chat.** In-between talk never reaches the thread.
→ Explains why `sessions` is a separate concept in the codebase; it is the noise container.

Survivability: **highlighting + notifications for mentions.** Founder: *"this surely needs tuning."*

**POSITIONING, explicit:**
- Built for a future where **people mostly help themselves** (via their own agents).
- **Not** for an enterprise where *"chatting up other people is the main business."*
- **"its not build for the 10k people"** — valuable for **small team orgs with fewer intra meetings**.
- → **Low human-to-human chatter is a design assumption, not an accident.** Matches ETHOS
  "Build for the Fast, Not the Enterprise."

---

## Q9b — Form factor: DESKTOP APP

> its a desktop app clearly, which currently also comes as a web app due to the advantage of electron
> apps. It can run in desktop standalone (just you and agents) and shared backend mode (team and
> agents). At some point we would probably want a mobile app which is in the best scenario also just
> a hybrid app around the web app, but who knows.

- **Desktop app, clearly.** Web app comes along for free via Electron.
- **Two modes:**
  - **Standalone** — just you and your agents (no other humans). The product must work with zero colleagues.
  - **Shared backend** — team and agents.
- **Mobile: deferred.** Best case a hybrid wrapper around the web app. *"but who knows."*
- → **Design target: desktop. Do not design mobile in this round.**

---

## Q9c — Done is asymmetric; @-mention is universal

> Its done when the work item is marked as done which happens when the agent decides that his session
> is finished, for me as a user its is most likely done with the review. If I cannot judge i do the
> same as before with the agent @userA and hand it over.

- **System done** = work item marked done = **the agent decides its session is finished.**
- **Human done** = **the review.** The two are different moments — design for both.
- **Handing a review to a person is the same gesture as handing work to an agent: `@userA`.**
  **The @-mention is universal — humans and agents are addressed identically.** Matches "flat teams
  of humans and AI agents."
- *(Unanswered: what he does when a proposal is simply wrong. Presumably comment → revise, since
  review is a conversation. Low priority.)*

---

## Q10a — Day one is thin on purpose, and there is a PLUGIN ECOSYSTEM

> you start the desktop app and discover the locally installed agent harness or setup the built in
> one. like this you can start going and talking with agents and creating stuff. as you go along you
> can connect file systems (github, gdrive, local folder, ...), as well as other MCPs and connectors.
> And since you connect local harnesses you get all their connectors for free as well. What also
> happens during first startup is that a team is created, for the second user thats not necessary
> anymore but an option. Depending on the plugin setup or the deployment setup you might also get a
> couple team mates auto created and a couple of remove worker servers assigned. thats where the
> system becomes a power house a plugin ecosystem where another developer or you can customize the
> setup with routines (basically crons that trigger an agent) or agents listening to triggers (any
> state change or action event in the application that triggers and agent) as well as personas and
> tools and so on like a super charged version of the harness plugins. And remote workers are just
> that the ability to deploy the worker agent else where.

**Setup is minimal:** discover the locally installed harness (or configure the built-in one) → start
talking to agents and creating things immediately. Everything else is **progressive**:
filesystems (github, gdrive, local folder), MCPs, connectors. **Connecting a local harness brings
all of its connectors for free.**

First startup also **creates a team**. Optional for the second user.

**★ NEW SURFACE AREA — the plugin ecosystem. "thats where the system becomes a power house."**
A developer (or the user) customizes the setup with:
- **Routines** — crons that trigger an agent
- **Agents listening to triggers** — *any state change or action event in the app* triggers an agent
- **Personas**, **tools**, and more — "a super charged version of the harness plugins"
- **Remote workers** — deploy the worker agent elsewhere (this is how the night shift scales)

Plugin/deployment setup can **auto-create teammates** and **assign remote worker servers**.

→ Extensibility is strategic, not incidental. Connects to self-extension (the system building
itself a better trace tool). **Scope for this design round: asked.**

---

## Q10b — Dark mode stays

> we currently already have a dark mode and we should keep that, with design tokens thats basically
> free these days.

- **Dark mode is required.** Founder considers it near-free via design tokens.
- **Caveat to solve in the prompt (not a disagreement):** in this language, structure is carried by
  a **3px black border** and a **hard black offset shadow** on paper/white. Neither survives a naive
  inversion — black-on-black has no border and no shadow. The design must decide what carries
  structure in dark. Not free, but tractable.

---

## Q10c — ★ CATALOGUE: nothing gets deleted. The features are lean; the DESIGN is the problem.

> I think our UI is still very lean we have few features designed, the issue is more that they are
> designed horribly. Some things that were a failure is that costs and agent tracking where way to
> hard build in for a while, the same goes for the knowledge system stuff that was far to hard wired
> into the system and obstructed the core aspects of conversation, work, knowledge.

**Corrects my deletion-hunting instinct.** The UI is **lean** — few features, designed **horribly**.
The restart is a **design** restart, not a feature cull.

**Two named over-builds to unwind:**
1. **Costs and agent tracking** — "way too hard built in for a while."
2. **The knowledge system** — "far too hardwired into the system and **obstructed the core aspects
   of conversation, work, knowledge**."

→ The triage / confidence / decay / promotion machinery is the hardwiring. Consistent with Q4b
("triage took a weird form", replacement = **draft + published + some notifications**).

---

## Q11 — in flight

1. Is the plugin/extensibility layer (routines, event-triggered agents, personas, tools, remote
   workers) in scope for this design round?
2. Costs and agent tracking — what is the light version that survives?
3. De-hardwired knowledge — does confidence / decay / promotion survive at all, or is it strictly
   draft → published → notifications?

---

## Still uncovered

The 20% that stays outside · what the actual scopes are and how teams vs communities of practice
differ · what owning an agent means day to day · rules for talking to someone else's agent ·
block granularity · how the system observes what he ignores · what "done" means · what happens
when the system learns something wrong · money/pricing · desktop vs web · what would make him
abandon it · which existing surfaces he'd miss if deleted · dark mode · the marketing site.

---

## Areas not yet covered

The 20% that stays outside HyperIdle · who else uses it besides the founder · solo vs team vs
agency · what he must never lose control of · when an agent should ask vs proceed · how the
system observes what he ignores · what "done" means · money/pricing · desktop vs web · what
"hell yeah" is made of · what would make him abandon it · which existing surfaces he'd miss if
deleted · what happens when the system learns something wrong · dark mode · the marketing site.
