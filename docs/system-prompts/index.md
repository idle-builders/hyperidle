# System Prompts

Runtime templates seeded by `factory-bootstrap.ts` (lines 186–216) into `system_template:<role>` rows at first boot; the live prompt for each agent is stored in `users.system_prompt` and assembled at session time. **Paths are frozen** — `factory-bootstrap.ts` references these files by literal path; never rename or move them.

Seven roles are wired (seeded on boot); `assistant.md` is an unwired draft (template declared in `agent-roles.ts` but not yet seeded — see the status note in that file).

- [product-manager.md](product-manager.md) — team agent coordinating the team that ships a single product; owns bet decomposition and PM judgment.
- [facilitator.md](facilitator.md) — strategy agent scoped to one community of practice (build/product/growth/ops/facilitation); organizes cross-product knowledge; **doubly frozen** (also referenced by literal path at `factory-bootstrap.ts:157`).
- [builder.md](builder.md) — team agent that writes code and ships features for a single product team.
- [designer.md](designer.md) — team agent owning UX research, interaction design, and visual polish for a single product team.
- [growth.md](growth.md) — team agent owning top-of-funnel (awareness, acquisition, activation) for a single product team.
- [ops.md](ops.md) — team agent owning deployment, reliability, and incident response for a single product team.
- [qa-engineer.md](qa-engineer.md) — team agent owning test plans, regression testing, and bug triage for a single product team.
- [assistant.md](assistant.md) — draft persona/guardrail template for the user's personal assistant agent; **not yet seeded by factory-bootstrap.ts** (wire-or-flip is an open work-package decision).
