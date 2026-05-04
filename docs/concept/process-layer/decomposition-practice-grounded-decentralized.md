## 7. Decomposition: Practice-Grounded, Decentralized

This section is short but it's the heart of the doc. Most agent frameworks decompose centrally — a planner agent reads the goal and generates the task graph. We don't.

### 7.1 Each agent decomposes their stream

When a bet is committed, every team member reads the pitch and the done condition, and *each one independently proposes the tasks in their work stream*. The Writer proposes copy tasks. The Frontend Builder proposes UI tasks. The Growth Analyst proposes measurement and analytics tasks. The Backend Builder proposes data and API tasks.

Each member uses their practice (L3) as the source of patterns. Practices contain accumulated knowledge about *what tasks typically belong to this kind of work*. The writing practice knows that "ship a landing-page copy" usually involves: research the audience, draft the headline, draft the body, A/B variants, tone review, brand-voice check, accessibility pass, ship. The Frontend practice knows what UI shipping involves. Etc.

This is why the Practice layer matters so much for the process layer. It's not just a knowledge wiki — it's the *source of decomposition patterns* for the agents in that discipline.

### 7.2 The Product Manager integrates

After each member proposes their tasks, the Product Manager integrates the task list:

- Identifies dependencies between members' tasks (X must be done before Y).
- Spots gaps (no one proposed a task for the security review and the bet needs one).
- Spots overlap (two members proposed the same task; assign one).
- Confirms the integrated list will reach the done condition.

The Product Manager is *not* decomposing on behalf of the team. It's editing the team's collective decomposition. If it has to add tasks the team didn't propose, that's a signal the team's practice knowledge is missing something — and the missing piece becomes a Practice item to capture.

### 7.3 Replanning is normal — facilitator judgement decides when humans get pulled in

Decomposition is not a one-shot event. As work progresses, team members discover new tasks (added as `proposed`), retire stale ones, and revise dependencies. Each change is small and handled internally. The plan is *the current state of the task list*, not a separate document.

The question of "when does a replanning event become big enough to need a human in the loop" is **the Product Manager's judgement call**. The facilitator is watching the trajectory of the bet — what the team is doing, what they're learning, how the task graph is evolving — and notices when the trajectory has shifted in a way the founder should know about. When it has, the facilitator drafts a review thread for the human and posts it.

We deliberately don't define a numerical threshold for this ("more than 3 new tasks added per day → human review"). Numerical thresholds invent the wrong incentives. The facilitator's job is to feel the trajectory and decide when to surface it. As facilitators get better at the call (and as the human approves or pushes back on the calls they make), the judgement sharpens. This is how trust gets built between the facilitator and the founder over time.

The things that *always* surface to the human, no judgement required:

- A change to the bet's `done_condition`.
- A change to the bet's `hypothesis`.
- A change to the bet's `appetite`.
- A proposal to kill the bet.
- Any cross-team task that lands in or out of the bet.

Everything else is the facilitator's call. The audit trail captures every change so the founder can always look back if a call surprises them in retrospect.

### 7.4 Why this matters

Centralized decomposition has two failure modes: the planner doesn't know the discipline well enough to decompose accurately (most common), or the planner over-decomposes and produces a bureaucratic task list nobody can actually work from (also common).

Decentralized decomposition by practice-grounded specialists matches how actual flat-company teams work. The writer knows what writing tasks look like; the engineer knows what engineering tasks look like; the integrator's job is to weave them together, not to specify them.

---
