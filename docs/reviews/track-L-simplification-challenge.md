# Track L — Simplification (v3)

**Reframe.** Simplification removes over-specification from acceptance criteria — it describes what the user achieves at the journey level and leaves the *how* (component shapes, exact behaviors, micro-interactions, error paths, action groupings) to the designer and architect, who are the ones who can judge details. Foundational reusable primitives (Thread, Block, Artifact) get **more** design effort, not less: multiple versions, comparison, design critique, proper review.

---

## Reusable primitives — build once, reuse everywhere

These three primitives appear across multiple stories. Each gets a deliberate design pass with multiple versions and a critique before settling.

### Thread + messages
A thread is a container with metadata (who, attached-to, blocking-or-not, sync-or-async). Messages live inside it. Most messages are plain text. Some messages are **rich** — they carry their own inline UI: a review message embeds an output artifact and a decision affordance; a questionnaire message embeds a constrained answer set. This is the generative-UI pattern that every modern AI chat interface uses; we build on it, we don't reinvent it. **DM, coach-thread, and feed are configurations of a thread (visibility, membership, pinning), not message shapes.** Define only the message types that ship in this track's journeys; designer + architect explore multiple versions, compare, run a design critique. Stories L1, L7, L18, L21, L26 consume this primitive. (L11 dissolves into this — see below.)

### Block primitive
A reusable building block for any rich body content the user reads or edits. Knowledge entries (L23), bet pitches (L16), and any future place we render structured prose. The on-disk format stays GitHub-flavoured markdown — the block view is derived during file-watcher ingestion, never a new dialect. **DS-quality. Multiple versions. Critique.**

### Artifact view family
The function-agnostic surface for "what the agent has made" — code diff, deck, contract, dashboard, screenshot, drafted email, etc. **Artifacts live on tasks** — every artifact is produced by a task; no other level produces them. Higher-level views (Bet detail, Portfolio gallery) aggregate from tasks. The Artifact view family renders one artifact in different layouts: gallery card, stack item, single full preview, and the embedded "output" of a review message. **DS-quality. Multiple versions. Critique.**

---

## Per-story — journey outcome + what to remove

For each story: (a) the one-sentence journey outcome the user gets, (b) what's currently over-specified and should move out of acceptance criteria into the designer/architect plan.

### Spec stories
- **L1 — Thread + messages concept.** *Outcome:* the architect and designer have one shared spec for what a thread is, what messages it can carry, and where it can attach, so every consumer in the track works against one model. *Add:* the spec frames a thread as a container, messages as the things with shapes, and rich messages (review, questionnaire) as the generative-UI pattern. *Remove:* the locked thread-shape vocabulary (DM/coach/feed are thread *configurations*, not shapes). *Plan calls:* designer + architect explore multiple versions, compare, run a design critique before settling on the message vocabulary.
- **L2 — Block primitive concept.** *Outcome:* one reusable block model that turns any markdown body into a styled, navigable, comment-able view — derived during ingestion, never a new on-disk dialect. *Remove:* the listed block types, the renderer recommendation, the anti-pattern lecture. *Plan calls:* designer + architect explore multiple block-model designs, compare, run a design critique.
- **L3 — Cost & Tokens concept.** *Outcome:* the system measures bet appetite, story caps, and session cost in money + tokens (not duration). *Remove:* the suggested currency default, tier names, example formula. *Keep:* the no-Duration-as-budget rule (founder-level decision).
- **L4 — Knowledge relevance concept.** *Outcome:* the architect has one model for how relevance is computed from real measurements. Recency + frequency ship as data contracts. **Citation is evaluated by the architect and designer during planning** — they assess feasibility (harness contracts, reliability of agent self-reporting, access tracking) and decide whether to ship it now or stage it. Don't pre-defer; evaluate. *Remove:* the half-life numbers, the suggested weights, the citation-table contract.

### Conversations
- **L5 — Hardcoded-data inventory.** *Outcome:* every runtime fixture is mapped to a real source so downstream stories know what they own. *Remove:* nothing.
- **L6 — Verdict commit + agent-side automation.** *Reframe:* this is NOT about UI auto-advance or undo. The journey outcome is: when the user responds to a thread (review, questionnaire, open question), the response persists AND the event unblocks the agent waiting on that response (sync), or is recorded for the agent to consume on its next pickup (async). The whole point of a response is to unblock a tool call. *Remove:* auto-advance to next thread, the 5-second undo window, section-ordering rules. *Add:* the architect specifies the response-as-event contract that connects the thread response to the agent harness.
- **L7 — Thread + messages primitive in shared.** *Outcome:* the data primitive from L1 is implemented at DS quality and the three areas (Conversations, Work, Knowledge) all consume one shape. The message-type vocabulary supports plain text plus the rich types in this track's journeys (at minimum: review, questionnaire). *Add:* this is a foundational reusable component built directly into the design system, not as a per-area component. Designer + architect take multiple passes, compare designs, run a critique.
- **L8 — Thread sections in the Conversations queue.** *Outcome:* the user can see and pick from the actual list of threads, grouped sensibly. *Remove:* the section names, the "blocking outranks kind" rule, count-derivation specifics. Designer call.
- **L9 — One Conversations route.** *Outcome:* the user has a single Conversations entry point; the page renders whichever thread the user picked. *Remove:* the redirect specifics, per-tool body component naming.
- **L10 — Filter chips actually filter.** *Outcome:* the controls in the Submenu mean what they look like they mean. *Remove:* the explicit chip set. *Add:* the real filter axis is **blocking vs non-blocking** (= sync vs async — same axis, two names) — not the message format. Designer + architect resolve the chip vocabulary against that axis.
- **L11 — Render rich messages inline.** *Reframe (per founder):* drop the "ThreadActionBar" abstraction entirely. There is no separate action bar. A thread is a thread; some messages are rich (review = artifact + action; questionnaire = constrained answers). Rich messages render their affordances inline as part of the message stream — generative UI, just like every modern AI chat interface. *Outcome:* the floating top toolbar (today's `ReviewHeader`) is gone; the review's artifact + verdict-action live inline with the review message; questionnaires render constrained answers inline. *Plan calls:* designer + architect implement the initial rich-message types inside the L7 primitive.

### Work
- **L12 — Artifact view across Work surfaces.** *Reframe:* artifacts live on tasks. Higher-level surfaces (Bet detail, Portfolio gallery) aggregate from tasks; they don't own artifacts. *Outcome:* on every Work surface that benefits, the user sees what the team's tasks have actually produced. *Add:* the Artifact view is a DS-quality reusable family — designer + architect explore multiple versions (gallery, stack, single-card, embedded-in-review-message), compare, run a critique. *Remove:* per-level row specs.
- **L13 — Product=Team drill-down.** *Outcome:* the user can click into a product (= a team) to see that team's work, in line with the 5-level hierarchy: **portfolio > product > bet > task > session.** *Keep:* drill-down (founder direction). *Remove:* legacy redirect specifics, breadcrumb wording.
- **L14 — Bet-level human actions.** *Reframe:* drop the explicit five-action list ("downvote" never made sense). *Outcome:* the user can act on a bet — what acting means (pause, stop, adjust, comment, etc.) is for the designer + architect to choose with simplicity as the bias. The consequence preview ("what stops, what's saved") is a journey requirement before any destructive act. *Remove:* the explicit action list, modal-vs-drawer choice, revision-log column specifics.
- **L15 — Strip Kanban drag + give humans a way to act on a task.** *Outcome:* humans never reorder tasks (agent-team-owned), but they can request a state change or open a discussion thread on the task they care about. *Remove:* the drop-down structure, per-action message format. Designer chooses the affordance.
- **L16 — Bet pitch as blocks.** *Outcome:* the bet pitch is readable, navigable prose — no more raw `<pre>`. *Add:* uses the L2 Block primitive. *Remove:* deep-link URL scheme, highlight behavior, "stable id" worked example (already in L2).
- **L17 — Cost + Tokens wired into Work.** *Outcome:* every Work surface that shows cost shows it in money AND tokens — never strings, never duration as a budget. Tokens come basically free from the model; the load-bearing technical work is **getting the harness to report cost reliably**. *Remove:* per-table column inventory, formatter specifics. *Add:* the architect must resolve the harness-integration contract for cost reporting — that's the hard part, not the UI.
- **L18 — Threads attached to bets, tasks, knowledge.** *Outcome:* the discussion lives where the work lives — every bet, task, and knowledge item carries its own thread. *Remove:* artifact-attached threads (founder pushed back: artifacts live on tasks; the discussion belongs on the task). *Add:* uses the L7 thread primitive.
- **L19 — Harness jump-out.** *Outcome:* a user wanting to inspect what an agent actually did can pop into the agent harness from the task. *Remove:* explicit field list, new-tab-vs-same-tab choice. Designer call.
- **L20 — Lifecycle propagation across the 5 levels.** *Reframe:* this is not about cycles. It's about events propagating up the 5-level hierarchy (portfolio > product > bet > task > session). A session can start or end a task; a finished task can close a bet; a bet closing affects the product; a product closing affects the portfolio. *Outcome:* when work below completes, the level above reflects it without manual filing — the system tracks and propagates lifecycle events natively. *Add:* the architect specifies the propagation rules in a concept-doc update; the data layer implements them. *Plan calls:* designer + architect decide which transitions are automatic vs. require human confirmation, and how the user observes propagation.
- **L21 — CoC overlay.** *Outcome:* the user can summon the Chief of Staff from anywhere in the app, ask anything, and add visible items as context — without disrupting the agents working on bets. *Keep:* bottom-right placement (founder direction). *Add:* the experience is a chatbox-style thread with the CoC; designer + architect think the "add as context" affordance, the placement on smaller viewports, and the for-the-record landing in Conversations through during planning. *Remove:* drag-anything-as-context mechanics.

### Knowledge
- **L22 — Three relevance signals as data.** *Outcome:* the most relevant items are surfaced first, by signals that are real measurements. Recency + frequency ship as data contracts. **Citation is evaluated by designer + architect during planning** (per L4) — if feasible to capture reliably from the harness, ship it; otherwise stage it transparently with absent values. *Remove:* the explicit column inventory, sort UI specifics, tunable-weight defaults.
- **L23 — Knowledge body as blocks.** *Outcome:* the user reads a knowledge entry as proper prose — a 3-sentence belief and a multi-section playbook are no longer pixel-identical. *Add:* uses the L2 Block primitive. *Remove:* highlight behavior, per-block-type styling rules.
- **L24 — Wiki-link + backlinks.** *Status:* defer out of this track. At today's corpus scale it isn't journey-critical. Park as its own spec when the corpus grows.
- **L25 — Knowledge-item actions (manage vs edit).** *Outcome:* two distinct journeys — the user manages an item (approve, refine, deprecate — review-like) AND the user edits and saves the body (must actually persist; today's Save lies). *Remove:* the six-verb list, "promote" (founder: meaningless here), merge / split (founder: no value yet). *Add:* designer + architect arrange the affordances; one or two manage-verbs ship now, the rest follow when there's a journey for them.
- **L26 — Per-block discussion on Knowledge.** *Outcome:* the user can leave a discussion or note attached to a knowledge entry — and, where the entry is long enough to want it, attached to a specific block. *Remove:* the dependency on L24 (linking) — independent. *Add:* uses the L7 thread primitive; the block-anchor is the L2 Block primitive's own affordance.
- **L27 — Knowledge-lifecycle status.** *Outcome:* knowledge items show their own lifecycle (captured / provisional / validated / active / stale / archived) — not borrowed Work-status chips that lie. *Remove:* monochrome rule, "only stale is colored" specifics. Designer call.
- **L28 — Knowledge shape differentiation.** *Status:* re-spec inside the story, not in the track header. The kinds (decision / belief / pattern / brief) and the representations (table / graph / doc-tree) live on different levels — they aren't six orthogonal shapes. *Add:* designer + architect concept this as part of the story; explore multiple variants; resolve the right axis. The acceptance criterion is "the architect + designer have produced a layered shape model that reads naturally for the user and the content; the result is recorded as a concept update".

### Audit
- **L29 — Final sweep.** *Outcome:* every runtime fixture is gone, an enforcement rule keeps it that way, and the test suite has the coverage to catch the next regression. *Remove:* explicit five-test list, lint-rule-shape directive. Designer + architect decide what tests close which gaps.

---

## Summary of v3 corrections from v2

- **Thread + messages, not "thread shapes".** Threads are containers; messages have shapes. DM / coach / feed are thread *configurations* (visibility, membership, pinning), not message shapes. Review and questionnaire are *rich message types* — generative UI inline, not a separate action-bar concept.
- **L11 dissolves the ThreadActionBar.** Rich messages render their affordances inline. We don't reinvent what every AI chat interface already does.
- **L6 reframed around agent unblocking.** A response is an event for the agent waiting on it (sync) or recorded for next pickup (async). It is not about UI auto-advance.
- **L10 axis collapsed.** Sync = blocking, async = non-blocking — one axis, two names. Not two axes.
- **L12 artifacts live on tasks.** Higher views aggregate; they don't own.
- **L13 confirms five levels:** portfolio > product > bet > task > session.
- **L14 drops "downvote"** and the explicit action list. The user can act on a bet — designer + architect choose what acting means, with simplicity as the bias.
- **L20 reframed as lifecycle propagation across the 5 levels** (not cycles). Sessions move tasks, finished tasks close bets, bets affect products, products affect the portfolio. Native to our kanban model.

## Apply?

If this v3 framing reads right, mark accept (or counter inline) and I will rewrite TRACK-L.md in one pass before opening the PR.
