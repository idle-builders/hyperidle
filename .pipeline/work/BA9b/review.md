# BA9b — Implementation review (independent, read-only)

Reviewed `ed59f9443..HEAD`. Gates verified by the reviewer: `npm run check` exit 0 (39 packages),
`npm run lint` exit 0 (only pre-existing misplacement-ledger warnings).

## Verdict: NOT-DONE

## BLOCKING

### B1 — Agent-file binding never runs in production (AC4)

Agent-file items are user-scoped (`scopeKind='user'`, `scopeId=agentId`). `fetchCapabilityItems`
(`layers/core-api/knowledge/src/session-knowledge-assembler.ts:293-347`) only adds the user-scope branch
**when `input.agentId` is provided**, and `agentId` is optional (`:258`).

None of the three real session bundle-builders pass it — `layers/core-api/work/src/task-run-resolver.ts:141`,
`layers/core-api/routine/src/routine-service.ts:485`,
`layers/core-api/review/src/proposed-call-workflow.ts:333` all call `assembleSessionKnowledge` with
`{teamId, agentRole, taskDescription}` and no `agentId`, so it silently defaults to `undefined`.

A canonically bound agent_file therefore reaches **no one**. AC4's "only that agent receives it" is
vacuously true. The passing integration test only shows the assembler *can* filter, because it passes
`agentId` explicitly — a mode production never invokes. All three resolvers already have `agent.id` in
scope.

### B2 — Plugin MCP servers reach only claude-code (AC6)

`mergePluginMcpContributions` (`provisioner.ts:604-646`) writes plugin servers only into `.mcp.json`. CLI
harnesses do not read that file for MCP — the provisioner's own comment (`:1419-1420`) says codex,
opencode and cursor get it through their `cliMcpDialect` translation, and `writeCliMcpConfig` (`:1465`)
only ever writes the tool-bridge entry. Plugin MCP servers are never translated into `codex-toml`,
`opencode-json` or `cursor-json`.

Also unimplemented from the spec: `${PLUGIN_DATA}` is not expanded (`expandPluginVars` at `:577` handles
only `${PLUGIN_ROOT}`), `command` is not resolved as a single executable token, and cwd does not default
to the plugin root.

The bridge entry itself is not clobbered — that half is correct.

### B3 — The harness-lane test is a passenger (AC3, AC5)

`layers/agent-execution/harness-registry/src/__tests__/BA9b-skill-dirs-harness.integration.test.ts`
imports **zero** run-orchestration code and **hardcodes** `.claude/skills` / `.agents/skills` in its own
`writeSkill` helper. It never touches `HARNESS_SKILL_DIRS`, `writeSkillItem`, or `assembleAgentContext`.

The reviewer ran the sanity-break: repointed production `HARNESS_SKILL_DIRS` at a dead directory and
re-ran the lane. **Baseline 3 passed / 1 skipped; broken 3 passed / 1 skipped — identical green**, with
real LLM calls in both. Tree restored and confirmed clean.

So the test re-proves the *harness's* read behaviour, which the evidence file already established. It
does not prove production writes skills where the harness reads. The production→sandbox link exists only
in a pure unit test that runs no harness. The two halves are never joined in one execution, so the
founder's bar — a skill **a plugin installed** being used by an agent in a real session — is met only
for a hand-written file.

### B4 — The opencode case proves file existence, not skill discovery (AC5)

`BA9b-skill-dirs-harness.integration.test.ts:258-319` puts the token in the **directory name**, gives the
SKILL.md a body of `"Test probe for BA9b."`, then asks opencode to list `.agents/skills/`. The model runs
`ls` and echoes the directory name. Any directory would satisfy that. The other three harnesses use
secret-in-body and are valid.

Already disproven independently: with a prompt that gives the model a reason to reach for the skill,
opencode invokes its skill tool and returns a token that exists only in the body —
`→ Skill "probe-claudedir"` then `TOKEN-CLAUDEDIR-4417`. OpenCode loads skills **on demand**, so the
skill's `description` is what decides whether it is ever used.

### B5 — The MCP merge test asserts against a copy of itself

`ba9b-mcp-merge.test.ts:16-32` copy-pastes `expandPluginVars` / `expandMcpConfigValue` into the test file
and asserts on the copy, importing no production code. Its own header admits it duplicates the private
helper. It proves nothing about `mergePluginMcpContributions`. With B2, AC6 has no real evidence on any
harness.

## Non-blocking

- **Unrelated churn.** `framework/event-bus/src/events.ts` (`_EventTypesComplete` → `EventTypesComplete`)
  and De Morgan rewrites in `RoutineCreateDialog.tsx:122` / `RoutineDetailPane.tsx:207` read as a stray
  autofix. Not feature creep, but noise in the diff.
- **team-scoped agent_file reaches no one.** `toBakedContextKnowledgeItems`
  (`framework/domain-model/src/work-intent.ts:233`) derives `agentBindingId` from `scopeId` for any
  `role==='agent_file'` regardless of `scopeKind`, so a team-scoped one yields a `teamId` that never
  equals an `agentId`. Latent, scopeKind-blind derivation.
- **Uninstall hard-deletes user edits.** `routes/plugins.ts:279` hard-deletes every row carrying the
  plugin topic, including a skill a person edited. Contradicts D5's detach-and-restore spirit — founder
  call.
- **No budget guard on capability items** (`session-knowledge-assembler.ts:388-394`) — permitted by AC8's
  escape clause, but a large plugin skill can blow the context window unchecked.
- **AC2 untested** — nothing exercises "a plugin skill a person edited → the session gets the edited
  version", nor that editing bumps version and writes an edit-log entry.

## Checks out

- **No compat shim.** `SessionKnowledgeItemLike` (`work-intent.ts:193-211`) makes `role` and `scopeId`
  required, every caller supplies real values, `agentBindingId` is always derived. The new absolute rule
  is satisfied.
- **Migrations safe on a populated database.** `0062` adds `role NOT NULL DEFAULT 'ordinary'` then a CHECK
  all rows satisfy; `0063` adds a nullable column. Pure DDL, no data-dependent backfill — not the BA9a
  defect class.
- **Ordinary knowledge genuinely unchanged**, path containment guards skill reads, and the governance
  boundary is respected: settings cannot write `knowledgeItems`, so skill sync is bridged through the
  core-api route, and the provisioner reads plugin MCP through an injected port. The DI addition is
  warranted by AC6, not unrelated refactoring.
