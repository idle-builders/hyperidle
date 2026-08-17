# Delete batch — `fw-factory-defaults`

5 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `AgentScaffoldRequest` | interface · INTERNAL — zero external importers; callers pass literals | An exported request shape nobody imports; a 7-field union where every call null-pads 4 fields — fold into per-trigger parameters when the resolver moves. |
| 2 | `FactorySystemAssistantSpec` | interface · INTERNAL — types the literal only | The assistant is machinery, not ritual — Ruling 3 does not apply. Two fields typing one inlined literal; zero external importers. |
| 3 | `FactoryRosterSpec` | interface · INTERNAL — only non-package mention is a doc comment | The AK6 injection seam that never injects; factory-state.ts hardcodes the value it pretends to receive. A hardcoded seam is fiction — the plugin surface replaces it; nobody wants this shape in any form. |
| 4 | `FactoryAgentRef` | interface · BOOTSTRAP (factory-state.ts → factory-run-config.ts handoff) | A {id, role} pair does not justify a package hop — inline the structural type in each face; duplicating two fields beats importing them. |
| 5 | `SYSTEM_PROMPT_TEMPLATE_FILES` | const · factory-run-config.ts backfill loop (dead with facilitators out of core) + tests | Export dies: sole surviving caller is readSystemPromptTemplateForRole in-module; the backfill loop it feeds can never match the assistant-only core roster by design. Map becomes module-internal; the facilitator row's fate rides the domain-model verdict on the role catalog. |
