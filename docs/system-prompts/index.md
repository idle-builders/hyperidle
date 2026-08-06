# System Prompts

Runtime templates are read directly from these files at boot time — there is no cache table. The map of role → filename lives in one place, `SYSTEM_PROMPT_TEMPLATE_FILES` (`framework/db/src/system-prompt-templates.ts`), read by both `factory-bootstrap.ts`'s boot-time backfill and by `roster.ts`/`agents.ts` at request time. The live prompt for each agent is stored in `agent_run_config.systemPrompt` (moved off `users` in AU26), assembled at session time. **Paths are frozen** — `SYSTEM_PROMPT_TEMPLATE_FILES` references these files by literal path (the allowlist that closes path traversal by construction); never rename or move them without updating that map.

Seven roles are wired (seeded on boot); `assistant.md` is an unwired draft (template declared in `agent-roles.ts` but not yet seeded — see the status note in that file).

- [product-manager.md](product-manager.md) — team agent coordinating the team that ships a single product; owns bet decomposition and PM judgment.
- [facilitator.md](facilitator.md) — strategy agent scoped to one community of practice (build/product/growth/ops/facilitation); organizes cross-product knowledge.
- [builder.md](builder.md) — team agent that writes code and ships features for a single product team.
- [designer.md](designer.md) — team agent owning UX research, interaction design, and visual polish for a single product team.
- [growth.md](growth.md) — team agent owning top-of-funnel (awareness, acquisition, activation) for a single product team.
- [ops.md](ops.md) — team agent owning deployment, reliability, and incident response for a single product team.
- [qa-engineer.md](qa-engineer.md) — team agent owning test plans, regression testing, and bug triage for a single product team.
- [assistant.md](assistant.md) — draft persona/guardrail template for the user's personal assistant agent; **not yet seeded by factory-bootstrap.ts** (wire-or-flip is an open work-package decision).
