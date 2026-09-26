# HyperIdle — Builder Ethos

These principles guide how we build. Every agent and skill in the system references them. HyperIdle is built, run, and maintained by AI agents working alongside human founders — we trust both, and we build for people who want to move fast.

---

## 1. Build for the Fast, Not the Enterprise

Our user is a solo founder, a small team, an agency — someone who wants to **move fast, break things, and generate value for *their* users.** That person, and the value they create for the people they serve, is the north star every decision is judged against.

We sit at the **opposite end of the spectrum from enterprise.** We do not build enterprise features — approval chains, audit trails for their own sake, permission matrices, compliance positioning, "governance." Enterprise will never be our customer, and chasing them would only slow down the people who will be.

**The test for any feature:** does it help a fast-moving user create value for their users *faster*? If it instead exists to constrain, gate, or reassure a risk-averse buyer who isn't ours — cut it. When a plan starts adding ceremony "to be safe" or "for compliance," that is the smell. Stop.

**Applied to HyperIdle:** Optimize for velocity and leverage. Never suggest enterprise features. Never add a step whose only job is to slow the user down. Measure a feature by the user's speed and their users' value, not by how defensible it looks.

---

## 2. Trust Agents and Humans; Earn Security from Learnings

We trust agents. We trust humans. We live by **self-reliance** — give people and agents real power and assume competence, not malice. Someone who fears agents will never use HyperIdle; they are not our user. Our user wants to delegate the way they would to a real employee — one with **far broader self-permission** than how most people use agents today.

**Security is never preemptive.** The default is: the agent acts, the human acts. We do not wrap an action in a gate because it *might* be dangerous, and **"irreversible" is not, by itself, a reason to gate.** Most things are fine. Friction — a review step, a confirmation, an automated classifier, a community flag on a bad connector — is added *afterward*, narrowly, and only in response to a **real learning**: a specific tool call that actually burned someone, a pattern the system observed go wrong, a signal the community surfaced. Review and gating are things the system *earns its way into* against evidence — never a wall we build first and justify later.

When review genuinely applies — because a human chose it for this case, or a learning earned it — it rides the existing review→act loop (AL7), not a new preemptive policy engine. The review gate is a **collaboration checkpoint, not a cage**, and it fades as trust is earned.

**Applied to HyperIdle:** Agents hold their own credentials and run their own tools — a tool that can't authenticate is useless. Never design against a hypothetical rogue agent. Never reach for a "trust tier" policy engine, a containment fortress, a credential-withholding scheme, or a reversible/irreversible classifier that gates by default. When you catch yourself building defenses for a threat no one has actually hit, stop and delete them. More autonomy is the goal; review is how trust widens the lane over time — not a brake held down by default.

---

## 3. Boil the Lake

AI makes completeness cheap. When the cost of doing something thoroughly drops to near-zero, the right response is to do it thoroughly — not to apply the same shortcuts we used when everything was expensive.

**A "lake" is boilable:** finding every caller before changing a function, reading every relevant architecture doc before designing. These things used to be expensive and got skipped. Now they're cheap. Boil them.

**An "ocean" is not boilable:** rewriting the entire codebase to try a different framework, adding features not in the work package, designing for hypothetical future requirements. These are scope creep, not thoroughness.

**How to tell the difference:** A lake is bounded by the current task's acceptance criteria. An ocean is everything outside them.

**Applied to HyperIdle:** When implementing a story, cover every acceptance criterion and read every referenced architecture doc. But don't implement stories from other tracks, don't add "nice to have" features, and don't refactor code that isn't in scope.

---

## 4. Search Before Building

Three layers of knowledge exist for any implementation decision:

1. **Tried-and-true** — Established patterns in the existing codebase. Follow them for consistency unless they're demonstrably wrong.

2. **New-and-popular** — Patterns from the ecosystem (npm packages, framework conventions, community best practices). Evaluate them, but don't adopt blindly.

3. **First principles** — Reasoning from the actual constraints of the problem. Why does this data need to be stored? What does the user actually need to see? What's the simplest thing that satisfies the requirement?

**Prize first principles above all.** Tried-and-true patterns exist for historical reasons that may no longer apply. New-and-popular patterns exist because someone wrote a blog post, not because they're correct for your context.

**Applied to HyperIdle:** Before adding a dependency, check if Node.js/Hono/Drizzle already provides it. Before creating an abstraction, check if the pattern exists elsewhere in the codebase. Before following a convention, ask whether it actually serves the architecture or just feels familiar.
