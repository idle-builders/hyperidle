# Knowledge — Journey Map (v3)

## What this view exists for
"Show me what the factory has learned — the small notes, the hard rules, the playbooks, the documents, the connections — and let me read, refine, or rely on any of it. Surface the items that matter most based on what's been touched, used, and proven."

Knowledge is **long-lived**. It accumulates and refines over months and years. It is not urgent. The signal is **relevance**, not "what's red right now."

## The shapes Knowledge takes
- **Small learning / belief / observation**: a few sentences captured by an agent — analogue: Notion bullet, Roam block.
- **Decision / principle**: a committed statement with rationale and date — analogue: ADR, factory PRINCIPLES line.
- **Pattern / skill / playbook**: reusable how-to with parameters and anti-patterns — analogue: function-doc, KCS article.
- **Architecture / concept document**: multi-section prose, sometimes a sub-tree of pages — analogue: Confluence space, Notion sub-tree.
- **Graph of related items**: interconnected items navigated by edges (topic, evidence, contradiction) — analogue: Obsidian graph, MS Academic Graph.
- **Table of records**: structured rows under a topic with typed fields (kind, status, confidence, last-used) — analogue: Airtable view, Notion database.

## How relevance is computed
Relevance is the load-bearing signal here. It is **not urgency** — it is a derived score from three first-class metadata dimensions:

- **Recency** — when was this last validated, edited, or used? An item touched yesterday outranks one untouched for six months.
- **Frequency** — how often is this referenced, accessed, or cited? An item pulled into 30 sessions outranks one pulled into 2.
- **Impact** — how much value does this generate when applied? Citations from high-status items, decisions cited, bets shaped, hours saved.

These three drive ranking, sorting, and surfacing across every shape. They are also exposed directly: the user can sort by any one of them, filter by thresholds, and save views combining them. Most apps don't compute relevance from a graph this way — this is where the differentiated value lives.

## Continuity loop — the shape of the work
Knowledge is not built in a single sitting. It accumulates: capture → review → refine → promote / merge / split / deprecate. Items get sharpened over time as more evidence arrives, get linked as the corpus grows, get retired when superseded. This is the long-lived loop that distinguishes Knowledge from queue-style Conversations or project-style Work. The view exists to support this slow, compounding curation — not a fix-what's-broken-today queue.

## Reference apps — what we borrow
- **Notion**: open page → read or edit → link/share. Borrows: every item is both a row and a document; views as filtered perspectives on the same data.
- **Obsidian**: write or open → link to others → traverse via backlinks. Borrows: the graph emerges from the links; backlinks are first-class.
- **Airtable**: open record → see in multiple views → filter and sort. Borrows: typed metadata and saved views — but ours are recency / frequency / impact, not just "recent."
- **Confluence / Wikipedia**: read → edit → save → see history. Borrows: collective authorship with audit trail; topic as the browsable mid-level.
- **Microsoft Academic Graph / Roam**: land on a node → follow edges → discover. Borrows: related-items sidebar, citation-driven impact ranking, contradiction surfacing.
- **Guru / KCS**: card-based knowledge with verification status. Borrows: status lifecycle as a credibility signal.

## The five personas, in this view
- **Grandma**: peeks at "what the agents wrote down". Reads titles. Won't act on first visit. Will read one short item end-to-end.
- **Casual operator**: weekly skim. Dismisses what doesn't apply. Reads a brief or a principle, rarely a full doc.
- **Business person**: hunts for decisions and principles, on any shape they appear. Ignores patterns. Cares about authorship and citation count.
- **Power user**: works the queue across all six shapes. Sorts by recency, frequency, impact. Edits, merges, links.
- **Hacker CTO**: audits the substrate. Traverses the graph by impact. Compares versions. Hunts contradictions and stale items that are still being cited.

## Basics — top 3 jobs every persona does across every shape

### 1. Surface the most relevant items
**Trigger:** lands on `/knowledge` with a question, a topic in mind, or just curiosity.
**Outcome:** within seconds they see items ranked by relevance — recency × frequency × impact — either as the default surface or after one filter / sort.
**Universal because:** relevance is the right answer regardless of intent. Grandma sees what's most touched and most cited (so she knows what's "real"). The CTO sees what's most impactful (so they know what's load-bearing). Both are the same act, surfaced through the same scoring.
**Holds in:** belief (top of topic list by score) ✓ decision (highest-cited first) ✓ skill (most-used patterns first) ✓ doc-tree (the brief opens to the most-referenced section) ✓ graph (highest-impact node decoration) ✓ table (default sort is the relevance score) ✓.

### 2. Tell what's trusted from what's still moving
**Trigger:** an item or a list is in front of them; they need to know which is settled, which is provisional, which is decaying.
**Outcome:** within ~3 seconds they can point at status, confidence, last-validated, and citation count — without opening anything.
**Universal because:** the credibility signals are pre-language. Grandma reacts to a status chip the same way the CTO does. Without this, every shape is just nouns: a list of beliefs with no weight, a doc with no signature, a graph node with no mass.
**Holds in:** belief (status chip + last-used) ✓ decision (date + author + confidence) ✓ skill (validated vs provisional + citation count) ✓ doc-tree (last-edited + last-validated per page) ✓ graph (node decoration: trusted / provisional / stale / conflict) ✓ table (status + confidence columns) ✓.

### 3. Open one item and read its body
**Trigger:** something earned the click — a high-relevance score, a familiar topic, an author whose work the user trusts.
**Outcome:** they land on the item's body — paragraph, ADR, playbook, full doc, graph node card, or record detail — see what it says, who said it, when, how often it's cited, and can leave without committing.
**Universal because:** every triage, every audit, every curiosity loop terminates in reading exactly one item end-to-end. The shape varies; the act doesn't.
**Holds in:** belief (a paragraph) ✓ decision (statement + rationale) ✓ skill (steps + anti-patterns) ✓ doc-tree (rendered markdown) ✓ graph (the focused node's card with edges) ✓ table (a record's full detail) ✓.

- **Refine an item's body** — done by power and CTO often, by business and casual occasionally, by grandma rarely (she leaves a note rather than edits prose). Lives in every shape, but the affordance differs: inline edit on a belief, structured field edit on a decision, paragraph edit on a doc, edge tweak on a graph node, cell edit on a table row. The continuity loop runs on this — refinement over time is how items earn their score. Demoted from basic because grandma still comes back tomorrow if editing is broken; she came to peek, not to fix.
- **Search across all knowledge** — done by everyone except grandma. Cross-cuts every shape. Results ranked by the same relevance score.
- **Flag an item for the facilitator** — done by everyone including grandma (a one-line note for a CoS or practice lead). The wiki "leave a note" affordance — explicit, low-stakes, available on every shape.

## Value-adds — most personas, less often
- **Sort by recency** — what's been touched, validated, or used most recently. Done by power and CTO weekly; casual when checking what's fresh.
- **Sort by frequency** — what's most cited, accessed, or linked-to. Done by business and CTO when hunting load-bearing items.
- **Sort by impact** — what's shaped the most decisions or bets. Done by power and CTO when auditing leverage.
- **Filter to "stale"** — recency below threshold AND frequency low. The decay-candidate list — items that may need retirement or refresh. Done by power and CTO.
- **Filter to "rising"** — frequency rising over the last cycle. Items earning their way toward promotion. Done by power and CTO.
- **Switch scope (practice / product / factory)** — done by casual, business, power, CTO. Skipped by grandma.
- **Filter to a single topic** — done by business, power, CTO. The browsable mid-level structure.
- **Merge / split / move / archive** — done by power and CTO. Structural maintenance that keeps the corpus from rotting.
- **Follow related items from one node to its neighbours** — done by power and CTO; business when chasing a decision. The graph-shape's killer move.
- **Create a new item or a new topic** — done by power and CTO; business for principles. Rare, but unblocks the corpus when there's a gap.

## Delighters — occasional, loved when present

- **A line that says "why this is showing up now"** — valued by everyone, especially business and casual. Names the relevance signal in plain language ("cited 12× this cycle", "validated last week", "shaped 3 bets").
- **Confidence + citation count shown next to authorship** — loved by CTO and business. Lets them weight an item without opening it.
- **Surfacing a contradiction between two items** — loved by power and CTO. The graph shape's serendipity moment.
- **Topic health at a glance in the side nav** — loved by power and CTO running the area. Shows the recency / frequency / impact distribution per topic.
- **Read the observation log to see who validated what** — done by business, power, CTO. Casual glances; grandma skips. (Founder's edit, kept here.)

## What's NOT here
- **Approving / rejecting work or PRs.** Belongs to Conversations (review threads). Knowledge holds what was learned, not what is being shipped.
- **Chatting with an agent or asking it to do something.** Belongs to Conversations. Knowledge is agent-free — humans curate, agents propose elsewhere.
- **"Right now" urgency framing.** Knowledge is long-lived. Urgency belongs to Conversations and Work.

## Sanity check

For each basic: would grandma still come back tomorrow if THIS BASIC was broken on the SMALLEST shape (a single belief) AND on the LARGEST shape (a multi-page architecture doc)?

- **Basic 1 (Surface most relevant):** if the belief topic shows items in random order, grandma has nothing to anchor on. If the architecture doc isn't ranked by what's actually cited, the CTO can't audit leverage. Broken on either end → page is dead. Stays a basic.
- **Basic 2 (Trusted vs moving):** if the belief row has no status or confidence, every row looks identical and grandma loses the cue. If the doc has no last-validated or citation count, the CTO can't trust it. Broken on either end → trust collapses. Stays a basic.
- **Basic 3 (Open and read):** if the single belief never opens, grandma never gets her payoff. If the multi-page doc never renders, the CTO leaves. The list is a teaser; the read is the payoff for every persona on every shape. Stays a basic.
- **Refine (demoted):** if grandma can't edit on her first visit, she still comes back — she came to peek. The job powers the continuity loop but isn't load-bearing for return. Stays in value-adds.

## Founder's edits addressed
1. **Long-lived framing.** Basic 1 is now "Surface the most relevant items" — no "right now" anywhere. Urgency framing removed throughout; "right now" called out explicitly in What's NOT here.
2. **Recency × frequency × impact ranking.** New "How relevance is computed" section makes the three signals first-class. Each is exposed as a sort and a filter in value-adds. Basics 1 and 2 reference them directly. Delighters surface them in plain language ("cited 12× this cycle").
3. **Continuity loop.** New "Continuity loop" section names the capture → review → refine → promote / merge / split / deprecate cycle as the shape of the work. The "Refine" item in value-adds is explicitly tied to this loop.
