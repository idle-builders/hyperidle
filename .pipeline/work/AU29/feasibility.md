# AU29 — Feasibility

Every probe below was **executed** in this worktree (`/Users/tg/hyperidle/.worktrees/pipeline-AU29`,
branch `pipeline/AU29` @ `f9b0dbe1`, code identical to `origin/main` @ `bbe82e9a`), 2026-08-08,
Node v26.4.0 (`export PATH=/opt/homebrew/bin:$PATH`). Scratch scripts live in
`.pipeline/work/AU29/probes/` and are re-runnable as written.

## 1. Census reproduction — the baseline ground truth is live, not remembered

- **Question:** does the live tree still match the requirements' census (221 production + 67
  development known violations; exactly 4 `db:unknown` symbols)?
- **Method:** `npx tsx scripts/governance-lint.ts` from the worktree root.
- **Result:** `PASS — 3291 tracked files (789 production, 2502 development), 33 packages, 8100
  crossings, 18 rules, 221 production + 67 development known violation(s) at warn.` The NOTE lists
  exactly `readSystemPromptTemplate`, `readSystemPromptTemplateForRole`,
  `SYSTEM_PROMPT_TEMPLATE_FILES` (module unmapped) and `seed` ("not present in the database
  package's re-export list"). All §4.2 group counts in `architecture.md` match
  `governance/baseline.json` site-by-site.
- **Verdict:** census confirmed; the plan's clearing list is exact.

## 2. The `agentRunConfig` feasibility flag (requirements §4) — RESOLVED, no plan amendment

- **Question:** can `writeAgentRunConfig` (`layers/agent-orchestration/agent-run-config/src/`
  `agent-run-config-store.ts:121`) express `factory-bootstrap.ts:33-55`'s upsert-with-patch
  semantics without any new `agentRunConfig` crossing site?
- **Method:** `npx tsx .pipeline/work/AU29/probes/run-config-equivalence.ts` — two clean PGlite
  databases with identical `users` rows; database A runs a **verbatim copy** of the bootstrap's
  `upsertRunConfig` through the three patch shapes the bootstrap uses (fresh AH2-defaults insert;
  systemPrompt-only backfill on an existing row; AH2 patch over a pre-existing operator-configured
  row — the upgrade path); database B runs the same patches through the real
  `writeAgentRunConfig`; full `agent_run_config` row sets are dumped and compared.
- **Result:** `VERDICT: PASS — row sets identical.` Including the upgrade path: both writers leave
  a pre-existing `modelTierPreference: "workhorse"` untouched (patch-keys-only update semantics),
  and both produce `modelTierPreference: null` on fresh insert (`writeAgentRunConfig` writes the
  null explicitly; `upsertRunConfig` omits the column and the schema default is null —
  `schema.ts:116` has no default clause on that nullable column, so both land null).
- **Type-level:** `writeAgentRunConfig` takes `exec: WriteExecutor`, and `WriteExecutor` is the
  union `HyperIdleDb | <tx handle>` (`framework/db/src/write-executor.ts:29`) — the boot-time
  `HyperIdleDb` handle passes directly, no adapter.
- **Crossing-level:** the only `agentRunConfig`-touching code on the path remains
  `agent-run-config-store.ts` (already baselined under `service → db:table (unowned)`); the face
  passes only local values (`db`, roster-derived literals) into it, and the DI detector records a
  crossing only when an **imported identifier** is passed into a foreign package's call
  (`scripts/lib/crossing-detectors.ts:949-973`, `origins.get(identifier)` gate) — verified by
  source read of the detector. No baselined count can rise.
- **Verdict:** the reuse shape in `architecture.md` §2.5.3 is feasible as specified. The fallback
  (pull forward AU30's one-line `agentRunConfig` owner assignment) is **not needed** and is not
  proposed.

## 3. First-boot control + the AC 7 comparison harness — proven end-to-end today

- **Question:** can first-boot row-identity be verified by *running* both paths, and what is the
  control?
- **Method:**
  1. `npx tsx .pipeline/work/AU29/probes/first-boot-capture.ts --bootstrap --out
     .pipeline/work/AU29/probes/first-boot-control.json` — clean PGlite dir + migrations +
     `applyFactoryBootstrap` (the function both production paths call at `bbe82e9a`), dumping
     `users` / `knowledge_items` / `knowledge_app_projection` / `agent_run_config` ordered by key
     with `createdAt`/`updatedAt` normalised to `"<ts>"` (they are `new Date().toISOString()` and
     cannot be byte-stable across runs; every other column is compared byte-exact).
  2. `npm run setup -- --db-path <scratch>` — the **real CLI path**, end to end — then
     `first-boot-capture.ts --data-dir <scratch>` and `diff` against the control.
- **Result:** control captured and committed at
  `.pipeline/work/AU29/probes/first-boot-control.json` — 7 users (`system:propagation`,
  `seed-agent-cos`, 5 facilitators), 1 knowledge item (`seed-ki-1`), 1 projection (`seed-ksf-1`),
  6 `agent_run_config` rows (all `builtin`/`claude-sonnet-4-6`/`anthropic`/max 1; the 5
  facilitators carry the 1661-char `facilitator.md` template as `systemPrompt`; `seed-agent-cos`
  carries `null` — `assistant` is deliberately absent from `SYSTEM_PROMPT_TEMPLATE_FILES`, and the
  end state must preserve that null). The CLI-path dump **diffed empty** against the control.
- **Deployment condition confirmed by the run:** the template read resolves `docs/` from
  `process.cwd()` — the capture (and any relocated face caller) must run from the repo root, which
  is how both production paths already behave (`system-prompt-templates.ts:75-79` lore).
- **Branch protocol (task F):** re-run mode 1 with the two faces substituted for
  `applyFactoryBootstrap` (the switch is marked inline in the capture script — the same statements
  `applications/desktop/src/main.ts` will execute), and re-run mode 2 through the relocated
  `npm run setup`; both dumps must diff empty against the committed control. The harness itself is
  proven — the diff-empty result above is the control twin.
- **Verdict:** AC 7 is verifiable exactly as the plan demands, and the control is frozen before any
  code moves.

## 4. Smaller load-bearing claims, verified against the live tree

| claim | method | result |
|---|---|---|
| `toolsForRole` has **three** production callers | `rg -n "toolsForRole" --type ts` | `tool-provider-bindings.ts:65` (baselined [di] site), `harness-registry/src/tool-registry.ts:70` (parameter value — not flagged), `tool-handlers/src/tool-definitions.ts:1646` (local value — not flagged); `mcp-bridge.ts:141` is a comment. Requirements' caller list corrected in `architecture.md` header. |
| the five legal `db:util` service importers | `rg -ln "escapeLikePattern|resolveAgentScaffoldSpecs" layers/` | `knowledge-repository.ts`, `user-store.ts`, `work-service.ts`, `dependency-watcher.ts`, `tool-definitions.ts` — matches critique defect №1. |
| route-file consumer split | grep of the five route files | `search.ts`/`threads.ts` = `escapeLikePattern`; `teams-routes.ts`/`assistant.ts` = `resolveAgentScaffoldSpecs`; `users.ts` = both. |
| `demo-fixture.ts` does **not** import `seed-fixtures.ts` | read of its import block (`demo-fixture.ts:18-21`) | imports drizzle/connection/schema/`readSystemPromptTemplateForRole` only; `COMMUNITY_DISPLAY_NAMES`' sole consumer is `factory-bootstrap.ts:6`. Requirements §3.5(3) corrected. |
| `seed` phantom | read `framework/db/src/index.ts` (no `seed`); `migrate.test.ts:28-36,63-69` | the mock invents the export; assertion guards a function that cannot exist. |
| decided-rules rows to delete = exactly 6 | JSON scan of `governance/decided-rules.json` | 3 rows target `db:util`, 3 target `db:bootstrap`, no others; totals 124 → 118, model-test literals at `governance-model.test.ts:167-219`. |
| attack anchors that break | grep of `scripts/lib/governance-attacks.ts` | `:428-431` + `:456` (db:util re-export attack + control), `:605` (`readSystemPromptTemplate` deep-import). Property 3/4 of the attack harness fail loudly if the builder misses one. |
| app → layer manifest is legal precedent | `applications/remote-server/package.json:19,23` declares both layers; neither appears in any baseline group | desktop adding the same two deps creates no entry. |
| tool CLIs' new home needs no registry edit | `architecture.json:23-26` already maps `tools/*` → `tooling`; `governance/README.md:129` | new workspace entry only. |
| knip/vitest wiring that must move | `knip.json` (framework/db workspace entries `src/bootstrap-pg.ts!`, `src/__testing__/seed-pg-cli.ts!`), `vitest.config.ts:17-28` (`tools/eval` project precedent) | both files need the `tools/setup` additions named in `architecture.md` §2.6. |
| guards + dispatcher types keep production consumers after the moves | `rg` for `isAgentWorkIntent*` and `@hyperidle/shared/observability` | guards: both services; observability sub-barrel: only `core-api/src/observability-runtime.ts` (which becomes co-located with the dispatcher). |
| `agent_run_config.agentUserId` FK → `users.id` | `schema.ts:110-113` | ordering constraint: core-state face before run-config face. |

## 5. Environment notes for the builder

- Default `node` on PATH is v22; the repo requires ≥24 — prefix every command with
  `export PATH=/opt/homebrew/bin:$PATH` (v26.4.0 verified).
- `npm ci` fails on main (lock out of sync); use `npm install` if reinstalling.
- The governance lint on this machine may report `no-stale-build-artifacts` errors from untracked
  local `scripts/lib/*.js|.d.ts` files — machine state, not repo state (noted by the refine
  critique; the run in §1 was clean here).
- Run everything from the worktree root: shell cwd resets between invocations, and the template
  reader resolves `docs/` from cwd (§3).
