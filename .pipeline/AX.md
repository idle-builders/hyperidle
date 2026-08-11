# Track AX: Demo World

Fill a fresh HyperIdle instance with a lived-in world so the product can be seen, tested, and demoed. Every surface — Conversations, Work, Knowledge — currently greets an empty shell, which makes UI work slow (every change is judged against empty states) and demos impossible. This track builds the demo dataset and the opt-in seeding at database creation, and keeps it coherent with the product's own model of what a small team's usage produces: bets across their full lifecycle, threads with real reviews and verdicts, a knowledge corpus that grew out of completed work, sessions and routines with history.

**Key narrative.** The demo world is the product story told through data: a small flat team — humans and agents as equals — mid-flight on real work. One bet is blocked on the founder's review, one just completed and compounded into knowledge, one was killed honestly. Nothing in the dataset may contradict the process-layer docs (no costs, no boards, agent-owned tasks, threads not channels).

**Constraint.** Demo data is opt-in at database creation, never silent, never on a normal boot path of a non-demo instance. The existing Acme skeleton (`demo-*` ids) is extended, never replaced. `npm run verify` must pass after each work package merges.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AX1 | Lived-in demo world seeded at database creation (dev setup + desktop first-run opt-in) | tooling/data | M | — | planned — registered 2026-08-11, founder-requested. Founder, verbatim: *"Currently testing our application and improving the UI is really hard because there is nothing in there to see."* Settled founder decisions: dev `setup --demo` AND desktop first-run opt-in (bending AF17 explicitly for this), fake active sessions included, full richness, extend the existing Acme cast. See `work/AX1/plan.md`. |

## Dependency graph

- `AX1` depends on nothing: it extends the existing demo fixture (`tools/setup/src/demo-fixture.ts`) and the setup/desktop boot paths as they exist on `main` today. No shared files with any active AU or Z work package.
