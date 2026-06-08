## 5. Bets: Shape, Commit, Change, Ship

### 5.1 Shape

Shaping happens before commitment. A Product Manager (sometimes with the assistant for portfolio-level bets) writes a pitch — problem, appetite, sketches, rabbit-hole notes, no-gos. The pitch lands on the Work view as a `shaped` card. Pitches accumulate on the canvas during the cycle; only the founder can move them into the betting zone.

Shaping is *not* decomposition. The pitch describes what success looks like, not what tasks will produce it. Decomposition happens *after* commitment, by the team, decentralized.

### 5.2 Commit

The founder drags a pitch into the betting zone on the Work view (`HUMAN_INTERFACE_LAYER.md` §4.3). At this moment:

1. The pitch becomes a Bet object with status `committed`.
2. The team for the product picks it up — the bet is added to the team's `active_bets`. Most of the time this is the team's only active bet (focus is the goal). Sometimes a team carries more than one in parallel — when work doesn't touch all functions, when something urgent has to ship alongside the main thrust, when two independent threads of work both need to move. Multiple parallel bets are allowed but treated as a cost on focus, not a default.
3. The assistant drafts an explicit `done_condition` based on the pitch and posts it as a review thread for the founder. The founder can approve as-is, edit, or reshape.
4. Once the done condition is approved, the bet moves to `in_progress` and the team begins decomposition.

The `done_condition` is non-negotiable in one sense: the bet is not in `in_progress` until it has one. But it's revisable in another sense: the team can propose changes to it as they learn (see §5.4).

### 5.3 Decompose (decentralized, by the team)

This is the part that most agent frameworks get wrong. They assign decomposition to a planner agent. We don't. **Each team member decomposes the part of the bet that belongs to their work stream**, using knowledge from their own practice (L3) to know what tasks are typical for this kind of work.

Concretely:

1. The bet enters `in_progress`. Every team member is notified through the bet's thread.
2. Each member reads the pitch and the done condition.
3. Each member queries their practice (L3) for the patterns they know about. The Writer queries the writing practice for "what tasks does shipping a landing-page copy bet typically involve?" The Frontend Builder queries the frontend practice. The Growth Analyst queries the growth practice.
4. Each member proposes the tasks they'll own as `proposed` Task objects on the bet, with dependencies on other members' tasks where needed.
5. The Product Manager (the team lead) reviews the assembled task list, dedupes overlap, identifies gaps, and either accepts or asks for revision. This is intra-team — not a human review.
6. Once accepted, tasks move to `accepted` and members begin sessions on them.

This is plan-and-execute, but the *plan* is collectively authored by the team using practice knowledge as the source of patterns. Replanning is expected: as members work, they discover new tasks (added as `proposed`), retire stale ones (moved to `killed`), and revise dependencies. Each change is a small event the team handles internally. The bet's task list is *the current plan*.

The Product Manager does not micromanage. Its role is to keep the bet honest against the done condition and to flag when the team is drifting.

### 5.4 Change (bets are allowed to evolve)

The single most important property of a bet is that it's allowed to change. Pretending bets never need replanning is dishonest, and the Shape Up purist position ("kill it and shape a new one") punishes learning.

So bets can change, with discipline:

- **Done condition revision** — the team realizes the original done condition was wrong (premise broken, scope discovered larger, scope discovered smaller). The Product Manager drafts the revision and the *reasoning*, posts it as a review thread to the founder. Founder approves, comments, requests changes, or rejects (in which case the bet continues toward the original done condition or gets killed). Approved revisions are appended to `revision_log` with timestamp and reasoning.
- **Hypothesis revision** — same mechanism. Changing the hypothesis is changing what we believe will be true after this. Often a sign the bet should pivot.
- **Task graph changes** — internal to the team. The Product Manager handles these without human review unless they're large enough to bump the bet against its appetite.
- **Appetite revision** — extending or contracting the timebox. Always a human review item. Extending is a smell; killing is often the right answer instead.
- **Kill** — sometimes the right answer is to abandon the bet. The Product Manager drafts the kill with reasoning, posts to the founder, and on approval the bet moves to `killed`. The team writes a kill retro into the practice (failures teach more than successes).

The discipline is the *audit trail*. Every change is reviewed and logged. Changes are visible. The point is not to prevent change; it's to keep change honest.

### 5.5 Ship

A bet ships when its done condition is met *and* its high-risk artifacts have passed review.

1. Tasks transition through `in_progress` → `review` → `done`. Tasks tagged risk-tier ≥ medium produce a review thread when they hit `review` (per `HUMAN_INTERFACE_LAYER.md` §7 routing rules).
2. When all tasks are `done` and the Product Manager confirms the done condition is met, the bet transitions to `review`.
3. The bet itself produces a final review thread to the founder summarizing what was done, what was learned, and what artifacts shipped.
4. On founder approval, the bet moves to `shipped`. The team is between bets. The retro process begins (§11).

Shipping is not "all tasks done" — it's "the done condition is met." The two should be the same most of the time, but when they diverge the done condition wins. Teams that ship by completing the task list rather than meeting the condition are gaming themselves.

---
