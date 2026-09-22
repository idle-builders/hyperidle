# Human + AI Collaboration

Agents execute. Humans validate. That is the collaboration model. Not zero-human autonomy. Not humans doing agent work. A specific division: agents handle execution, humans hold judgment. The gap between those two is where HyperIdle lives.

| Role | Responsibility | Example |
|------|---------------|---------|
| **Founders / team leads** | Render verdicts, review high-stakes artifacts, shape tasks, curate knowledge | Reviewing a deploy proposal, pruning stale documents |
| **Agents (team members)** | Pick up tasks, run sessions, ship artifacts, write to the team's knowledge | Mika (Builder) implementing the Stripe webhook handler |
| **Curation routines (any role, plugin-provided)** | Triage and decay documents on a schedule, by judgement — no fixed "facilitator" role or scoring engine | The document-management plugin's librarian agent running its weekly `document-triage` |

---

## Agents are team members, not tools

The Builder agent on the Acme team is a member of that team. It picks up tasks, runs sessions, ships artifacts, and writes to the team's knowledge when it learns something. It is not a tool the founder invokes. Agents initiate conversations with founders. They surface problems. They propose changes. They flag uncertainty.

**Example.** Mika is the Acme Builder. On Tuesday, she picks up "Implement Stripe webhook handler" as a subtask of the payments task. She works through the implementation and hits a product question: which webhook events does the product actually need? She hands the task to the founder — `edit_task({ id, ownerAgentId: founder.id })` — and posts to the thread: "I can implement all 27 Stripe event types or scope to the 4 we need for checkout. Which?"

The founder replies in the thread. Mika starts a new session with the answer and completes the task. When she finds that optimal retry logic conflicts with an existing document, she writes an updated one with `edit_document`. That knowledge becomes available to every Builder the next time webhooks come up.

---

## Two agent categories

Agents come in two categories — `team | individual` (`AGENT_CATEGORIES`, `framework/domain-model/src/types.ts`; `users.agent_category` in `framework/db/src/schema.ts`). There is no fixed role catalog — role is an open string, and the roster flexes with the work. Full taxonomy, identity, and lifecycle: [agent model](../agent-layer/agent-model.md).

- **Team agents** — bound to a team, any role. Most of the workforce: builders, whatever role a team names.
- **Individual agents** — the Assistant (one per human user, created at registration; holds a persistent thread with its user, proposes changes to factory-scoped documents) or a plugin-provided agent that serves the whole factory or one team, like the document-management plugin's librarian.

There is no hardcoded "Facilitator" or "Product Manager" role, and no per-community reporting matrix — a role is whatever string the team or a plugin gave the agent.

---

## Trust is earned from verdicts

Trust is not configured — it is computed. Every verdict a human renders on an agent's work feeds that agent's approval rate (`layers/core-api/policy/src/approval-rate.ts`), shown on the agent's profile as a track record. It is not used to route, queue, or auto-resolve anything: every review a human is asked for still waits for that human's own verdict. Nothing is gated by default — review attaches where a human chose it or a learning earned it, never preemptively.

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

Next: [How Knowledge Compounds](./how-knowledge-compounds.md) — the document tree and the machinery that makes the tenth task faster than the first.
