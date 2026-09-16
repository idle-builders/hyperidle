# Human + AI Collaboration

Agents execute. Humans validate. That is the collaboration model. Not zero-human autonomy. Not humans doing agent work. A specific division: agents handle execution, humans hold judgment. The gap between those two is where HyperIdle lives.

| Role | Responsibility | Example |
|------|---------------|---------|
| **Founders / team leads** | Render verdicts, review high-stakes artifacts, shape tasks, curate knowledge | Reviewing a deploy proposal, pruning stale practices |
| **Agents (team members)** | Pick up tasks, run sessions, ship artifacts, write to practice | Mika (Builder) implementing the Stripe webhook handler |
| **Strategy agents (facilitators)** | Organize what teams produce, [score attention](../knowledge-architecture/relevance-and-attention.md), route to the right eyes | Assistant drafting the monthly portfolio retro |

---

## Agents are team members, not tools

The Builder agent on the Acme team is a member of that team. It picks up tasks, runs sessions, ships artifacts, and writes to the practice when it learns something. It is not a tool the founder invokes. Agents initiate conversations with founders. They surface problems. They propose changes. They flag uncertainty.

**Example.** Mika is the Acme Builder. On Tuesday, she picks up "Implement Stripe webhook handler" as a subtask of the payments task. She works through the implementation and hits a product question: which webhook events does the product actually need? She hands the task to the founder — `edit_task({ id, ownerAgentId: founder.id })` — and posts to the thread: "I can implement all 27 Stripe event types or scope to the 4 we need for checkout. Which?"

The founder replies in the thread. Mika starts a new session with the answer and completes the task. When she finds that optimal retry logic conflicts with the growth practice docs, she writes a new practice item and flags the Growth Facilitator. That knowledge becomes available to every Builder the next time webhooks come up.

---

## Three agent categories

Agents come in three categories — `team | strategy | individual` (`AGENT_CATEGORIES`, `framework/domain-model/src/types.ts:134`; `users.agent_category` in `framework/db/src/schema.ts`). Full taxonomy, identity, and lifecycle: [agent model](../agent-layer/agent-model.md).

- **Assistant** — individual, one per human user, created at registration. Holds a persistent thread with its user. Proposes changes to factory-level documents (`PRINCIPLES.md`, `FOCUS.md`). Drafts the monthly portfolio retro (`builtin:portfolio-retro`).
- **Facilitators** — strategy agents, one per community of practice (build, product, growth, ops, facilitation). Each watches what all agents in its community learn, merges duplicates, resolves conflicts, surfaces items for human review.
- **Product Managers** — team agents, one per team. The team lead: coordinates handoffs, runs retros.

The matrix is explicit: each agent reports vertically to their Product Manager and belongs horizontally to a community (`communityForRole`, `framework/domain-model/src/agent-roles.ts`). A Builder on Ambrovia reports to the Ambrovia PM and belongs to the Build community. When the Build community learns something from a different product, the Ambrovia Builder gets it at the next session.

---

## Trust is earned from verdicts

Trust is not configured — it is computed. Every verdict a human renders on an agent's work feeds that agent's approval rate. The policy engine combines the approval rate with the risk tier of the work to decide how each agent-produced item routes: **push** to a human now, **queue** for later attention, or **auto-resolve** (`layers/core-api/policy/src/policy-engine.ts`).

An agent with a strong verdict history on low-risk work flows without interruption. A new agent, or high-risk work, reaches human eyes. Nothing is gated by default — review attaches where a human chose it or a learning earned it, never preemptively.

This is how HyperIdle transitions from "founder in every loop" on day one to "founder only in loops that matter" by month six — without reaching "founder in no loops."

Trust surfaces and mechanics: [review primitive](../human-interface-layer/review-primitive.md).

---

## Reviews pair intent with output

When an agent's work needs judgment, it becomes a review: artifact embedded, reasoning visible, verdict affordance present. The review pairs *what was asked* with *what was produced*, and one verdict resolves the whole subject — you do not approve twenty files one by one.

Five binding verdicts — approve, approve-with-comments, request-changes, edit, reject — and their blocking semantics are owned by the [thread primitive](../human-interface-layer/thread-primitive.md). The review experience — dual anchoring, rationale, block-bound comments — lives in the [review primitive](../human-interface-layer/review-primitive.md).

---

## Review canvases match what agents produce

Each artifact under review renders through a purpose-built canvas selected by its kind. Nine proof-family canvases ship (`layers/core-ui/src/pages/review/`): outcome summary, field change set, action/operation, rendered-in-context, metrics, visual diff, code diff, batch, and browser preview. An unknown kind still renders through a safe fallback — never blank, never crashing. The ReviewPage composes them: frame header, intent, result, risks, artifact opener rows, a global conversation thread, and a right detail pane for the selected artifact.

Kind registry and shared grounding (`ToolLogo`/`CanvasSourceHeader`): [review primitive](../human-interface-layer/review-primitive.md).

---

## What this model is not

- **Not "zero human companies."** Humans are in every loop that matters — exactly those loops, not the ones that do not matter.
- **Not workflow orchestration.** Agents decide at runtime what to do next and surface decisions through reviews.
- **Not humans doing agent work.** Humans shape tasks, create routines, and record outcomes in the Work view; agents run the subtasks and sessions underneath. Founders redirect execution through thread conversations, not by micro-editing task state.
- **Not unlimited autonomy over time.** Trust is per-agent verdict history — it grows as approvals accumulate and never becomes exemption from judgment on high-risk work.

---

Next: [How Knowledge Compounds](./how-knowledge-compounds.md) — the knowledge layers, practices, and the machinery that makes the tenth task faster than the first.
