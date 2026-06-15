# AK1 — Harness-vocabulary rename rollout — Architecture

**Type:** Cross-cutting, behaviour-preserving rename. No new concept, no new UI. The builder executes this inventory literally.

**Nouns locked** by `docs/architecture/kernel-strategy-split.md` §4 — do NOT re-litigate. Mapping:
- `soul` / `soulPrompt` / "soul prompt" → **system prompt** + **AGENTS.md** instruction file.
- `workspace` *as the run-unit* → **sandbox** (cwd stays `/workspace`).
- `skill-tools` (conflated) → split naming into **Skill** / **tool** / **MCP**.
- `materialize` / `composePrompt` / "materialization" / "prompt composition" → **context assembly**.
- KEEP unchanged: **harness**, **session**, **Fabric**, **Strategy**.

---

## Required reading (before implementing)
1. `docs/architecture/kernel-strategy-split.md` §4 (locked nouns) — the only source of truth for target names.
2. `.pipeline/work-packages/TRACK-AK.md` → `### AK1` (ACs + scope rails).
3. `scripts/nimmly-guard.ts` — the precedent for the dropped-terms static guard (copy its structure).
4. `packages/server/src/skill-tools/tool-registry.ts` — the registry whose *directory* and *terminology* carry "skill-tools" (the trickiest rename; see §RISKS).
5. `packages/fabric/src/prompt-composition.ts` + `materialization.ts` — the context-assembly surface and the AGENTS.md file-write (`writeWorkspaceCLAUDEmd`).
6. `packages/server/src/services/session-provisioning.ts` — agent-runtime, `gate: ci-required` sensitive; touches all four terms at once.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| `soulPrompt` is a `users` column | Confirmed: `users.soul_prompt` (text) AND a deprecated `users.soul_prompt_path` (X3 lore). | Forward-only rename BOTH columns (§Migrations). |
| "workspace" names the run unit | Confirmed for the `WorkspaceAdapter`/`WorkspaceHandle` family + `sessions.workspace_snapshot` column. BUT three OTHER meanings of "workspace" exist and MUST stay: (a) literal cwd `/workspace` (~98 hits), (b) npm "workspaces" / `@hyperidle/*` workspace imports (~50 hits), (c) external CLI flags `--workspace`/`{{workspace}}` for third-party harness tools (aider/goose). | Rename only the run-unit identifiers; explicit KEEP-list below. Guard allowlists the three retained meanings. |
| `skill-tools` is a registry | Confirmed: directory `packages/server/src/skill-tools/` + package.json export `./skill-tools` + ~33 term hits. The registry already separates `ToolDefinition` (tool) from MCP (`packages/server/src/mcp/`); "Skill" as a distinct concept does NOT yet exist in code. | Naming-only split — see §RISKS. Rename the dir/term to `tools`; do not invent a Skill subsystem. |
| `materialize`/`composePrompt` in fabric | Confirmed: `materialization.ts`, `prompt-composition.ts`, exports `materialize`, `composePrompt`, `MaterializationConfig`, `MaterializationResult`, `writeWorkspaceCLAUDEmd`. | Rename files + exports to context-assembly nouns (§Inventory). |
| AGENTS.md is new | The composed prompt is ALREADY written to the run dir as `CLAUDE.md` (X1 lore, `writeWorkspaceCLAUDEmd`). Verified: ALL adapters (Claude SDK + aider/goose/opencode) auto-discover CLAUDE.md; NONE verified to read AGENTS.md. | **Dual-write (DEFAULT):** write BOTH `AGENTS.md` (standard surface, satisfies AC) and `CLAUDE.md` (current harness auto-discovery, preserves behaviour). See §AGENTS.md. |
| `harnessType` column = "harness" (kept) | Confirmed `users.harness_type` — "harness" is RETAINED. | No change. Listed in KEEP so the guard does not false-positive. |

No `/concept` gap. No spec/doc contradiction.

---

## Inventory (shippable surface, excludes node_modules, dist, .git, docs/archive, drizzle/meta snapshots, plans/, .pipeline/)

Counts are occurrences / files — **estimates, not a checklist**. The guard (not a number) is the source of truth for completeness; do not chase an exact count. Historical migrations + drizzle snapshots are **allowlisted** (see §Guard) and excluded from these totals.

### Term 1 — `soul` → system prompt / AGENTS.md  (≈687 occ / 113 files)
| Kind | Identifier (old → new) | Location |
|---|---|---|
| schema column | `soul_prompt` → `system_prompt`; drizzle field `soulPrompt` → `systemPrompt` | `packages/db/src/schema.ts:68` |
| schema column (deprecated) | `soul_prompt_path` → `system_prompt_path`; `soulPromptPath` → `systemPromptPath` | `packages/db/src/schema.ts:41` |
| API field (wire) | `soulPrompt` JSON field → `systemPrompt` in request/response bodies | `packages/server/src/routes/agents.ts` (51,63,82,224,286,302,389), `routes/assistant.ts` (43,313,353,397,403) |
| API const | `SOUL_PROMPT_MAX_LENGTH` → `SYSTEM_PROMPT_MAX_LENGTH` | `routes/assistant.ts` |
| API route comment | "soul prompt CRUD", "soul-template" → "system prompt" | `routes/agents.ts:8,187` (`soul_template:` factorySettings key — see RISK note), `routes/assistant.ts` headers |
| runtime var | `soulPromptText` → `systemPromptText` | `services/session-provisioning.ts` (234,288,490,535,604,690) |
| skill-tool | `soulPrompt` field in add-agent / create-team payloads | `skill-tools/add-agent.ts`, `skill-tools/create-team.ts` |
| UI state+label | `soulPrompt` state, `setSoulPrompt`, labels "Soul Prompt", id `soul-prompt`, placeholders | `web/src/settings/SettingsAssistant.tsx`, `settings/SettingsAgents.tsx` (461-471,704-708), `pages/AgentEditDialog.tsx`, `pages/AgentAddDialog.tsx`, `pages/AgentProfile.tsx`, `hooks/useTeamAgents.ts` |
| seed/bootstrap | `soulPrompt` field set on seeded agents | `db/src/factory-bootstrap.ts`, `db/src/demo-fixture.ts`, `eval/src/seeding.ts` |
| eval scenario | `soul` references | `eval/src/scenarios/session.ts`, `scenarios/composed-prompt.ts` |
| docs (internal) | "soul" in agent docs | `docs/agent-layer/agent-structure.md`, `agent-identity.md` |
| tests | all `*soul*` test fixtures + assertions (X3, AD8b, AB3, AF11, AF17, etc.) | ~40 test files — rename in lockstep with their subjects |

### Term 2 — `workspace` (run-unit) → sandbox  (rename ≈778 occ / 132 files; KEEP-list below)
| Kind | Identifier (old → new) | Location |
|---|---|---|
| type | `WorkspaceAdapter` → `SandboxAdapter` | `harness/workspace-adapter.ts` (file → `sandbox-adapter.ts`) + ~all consumers |
| type | `WorkspaceHandle` → `SandboxHandle` (`workspaceId` field → `sandboxId`) | same file |
| impl files | `local-workspace-adapter.ts`→`local-sandbox-adapter.ts`, `docker-workspace-adapter.ts`→`docker-sandbox-adapter.ts`, `disabled-workspace-adapter.ts`→`disabled-sandbox-adapter.ts` | `harness/` |
| impl class | `LocalWorkspaceAdapter`/`DockerWorkspaceAdapter`/`DisabledWorkspaceAdapter` → `*SandboxAdapter` | `server-factory.ts` (17-19,243-245), `adapter-pool.ts` |
| fabric service | `workspace-reaper.ts`→`sandbox-reaper.ts`, `WorkspaceReaper`→`SandboxReaper` | `fabric/src/services/workspace-reaper.ts` |
| schema column | `workspace_snapshot` → `sandbox_snapshot`; `workspaceSnapshot` → `sandboxSnapshot` | `db/src/schema.ts:228` (sessions) |
| runtime var/param | `workspace` (deps), `workspaceBasePath`, `workspaceHandle`, `workspacePath` → `sandbox*` | `services/session-provisioning.ts` (170,182,236-237,277,394-462,492-538,560-915), `session-lifecycle.ts`, `server-factory.ts` (64-65,243-305) |
| **shared type field** (CRITICAL-2) | `SessionConfig.workspacePath` → `sandboxPath` | `packages/shared/src/harness/harness-adapter.ts:23` — THE run-unit field on the shared adapter contract, consumed by EVERY adapter. The docstring at :24-27 ("written as CLAUDE.md in the workspace") also updates per §AGENTS.md. |
| **cli harness adapter** (CRITICAL-2) | `config.workspacePath` reads → `config.sandboxPath` | `cli-harness-adapter.ts:170` (template-var map value), `:192` (`cwd: config.workspacePath` → `cwd: config.sandboxPath`). NOTE: `cwd` VALUE stays the literal `/workspace`-rooted path — only the field name changes. The `{{workspace}}`→`{{sandbox}}` token on :29/:170 renames per the RENAME block above. This file was absent from the prior inventory and step 5 — it carries BOTH the second `workspacePath` and the `{{workspace}}` token; both move here. |
| **claude-sdk + docker adapters** | `config.workspacePath` reads → `config.sandboxPath` | `claude-agent-sdk-adapter.ts:156` (`cwd: config.workspacePath`), `docker-workspace-adapter.ts` + `local-workspace-adapter.ts` consumers of the field. Field name only; `/workspace` cwd value untouched. |
| tool ctx | `ToolContext.workspacePath` → `sandboxPath` | `skill-tools/tool-registry.ts:47` + every consuming tool (`write-session-notes.ts`, etc.) |
| API/routes | `workspace*` fields on session/routine responses | `routes/sessions-routes.ts`, `routes/routines-routes.ts` |
| fabric fn arg | `writeWorkspaceCLAUDEmd(workspacePath,…)` → see AGENTS.md §; `materialize({workspacePath})` arg → `sandboxPath` | `fabric/src/prompt-composition.ts`, `materialization.ts` |
| temp dir name | `"hyperidle-workspaces"` → `"hyperidle-sandboxes"` | `server-factory.ts:249` |
| docs (internal) | "workspace adapter" prose | `docs/architecture/components.md`, `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md` |
| tests | all `*workspace*` adapter/provisioning test fixtures | ~50 test files |

**KEEP (do NOT rename — guard must allowlist):**
- Literal cwd `/workspace` string and `mountPath ?? "/workspace"` (`docker-*-adapter.ts:64`). The cwd stays `/workspace` per the locked nouns.
- npm workspaces: `"workspaces"` in package.json, `@hyperidle/*` workspace imports, "workspace import" in `.claude/rules/typescript.md`.
- External harness CLI flag: goose's bare `--workspace` flag (`adapter-pool.ts:235`) — this is goose's own flag name, not ours. Aider/opencode use `--dir` / positional, not `--workspace`. KEEP the literal `--workspace` string; the VALUE it carries (the `{{sandbox}}` token, see below) is ours and renames.

**RENAME — `{{workspace}}` is OURS, not an external contract (CRITICAL fix; was mis-bucketed as a third-party flag).**
Verified false that `{{workspace}}` belongs to aider/goose/opencode: `packages/server/src/harness/cli-harness-adapter.ts:29` defines `type TemplateVar = "{{workspace}}" | "{{model}}" | ...` — HyperIdle's OWN substitution DSL, resolved by `resolveTemplates` (line 108, pure string-match `split(key).join(value)`) against `SessionConfig.workspacePath` (line 170). It names the run-unit → it renames under the locked nouns.
**Decision: rename `{{workspace}}` → `{{sandbox}}`.** Behaviour-preserving because the resolver matches whatever key string the args use — the `TemplateVar` union key and the arg-string token move together in one edit; the *resolved value* (the actual sandbox path) is unchanged. Exact edits:
- `cli-harness-adapter.ts:29` — `TemplateVar` union: `"{{workspace}}"` → `"{{sandbox}}"`.
- `cli-harness-adapter.ts:170` — map key: `"{{workspace}}": config.workspacePath` → `"{{sandbox}}": config.sandboxPath` (field rename, see CRITICAL-2 below).
- `cli-harness-adapter.ts:36-37` docstring listing template vars: `{{workspace}}` → `{{sandbox}}`.
- `adapter-pool.ts` `CLI_TOOL_CONFIGS` arg strings: `aider` (225) `"{{workspace}}"` → `"{{sandbox}}"`; `goose` (235) `"--workspace", "{{workspace}}"` → `"--workspace", "{{sandbox}}"` (flag stays, token moves); `opencode` (244) `"--dir", "{{workspace}}"` → `"--dir", "{{sandbox}}"`.
- `X5-cli-harness-adapter.test.ts` — assertion strings `{{workspace}}` → `{{sandbox}}` (lines 27, 91, 96, 105, 250). This is a name change in the test's *expected token spelling*, NOT a value-semantics change — it is the permitted kind of test edit (see §protectedTests). The test still asserts "token resolves to the path and is absent from final argv"; only the token's spelling changes.

### Term 3 — `skill-tools` → split naming (tool / Skill / MCP)  (≈33 occ / 20 files) — NAMING-ONLY
| Kind | Identifier (old → new) | Location |
|---|---|---|
| directory | `packages/server/src/skill-tools/` → `packages/server/src/tools/` | dir move (28 files) |
| package export | `"./skill-tools"` export map + `@hyperidle/server/skill-tools` import path → `./tools` | `packages/server/package.json`, all importers |
| prose/comment | "skill tool", "skill-tools registry" → "tool" (or "tool/Skill/MCP" where a comment explains the catalogue) | `tool-registry.ts` docstrings (29,51,177), `app.ts`, `services/direct-thread.ts`, `mcp/mcp-bridge.ts`, `harness/builtin-harness-adapter.ts`, `services/session-provisioning.ts:1` |
| import sites | `from "../skill-tools/…"` → `from "../tools/…"` | every file importing the dir (server + tests) |
See §RISKS for the scope boundary on this term.

### Term 4 — `materialize` / `composePrompt` → context assembly  (≈297 occ / 59 files)
| Kind | Identifier (old → new) | Location |
|---|---|---|
| file | `materialization.ts` → `context-assembly.ts` | `fabric/src/` |
| file | `prompt-composition.ts` → `context-assembly-prompt.ts` (or fold into above; keep two files to minimise churn) | `fabric/src/` |
| export fn | `materialize` → `assembleContext` | `fabric/src/index.ts:371`, `session-provisioning.ts:13,424` |
| export fn | `composePrompt` → `assemblePrompt` | `fabric/src/index.ts:400`, `session-provisioning.ts:9,618` |
| export type | `MaterializationConfig` → `ContextAssemblyConfig`; `MaterializationResult` → `ContextAssemblyResult` | `fabric/src/index.ts:368-369` |
| var | `composedPrompt` → `assembledPrompt` | `session-provisioning.ts:618,626` |
| fabric internals | `materializ*` in `writeback.ts`, `session-context.ts`, `file-watcher.ts`, `services/cost-cap.ts`, `promotion-pipeline.ts` | per-file |
| eval scenario file | `scenarios/materialized-knowledge.ts` → `scenarios/assembled-context.ts`; `scenarios/composed-prompt.ts` → `scenarios/assembled-prompt.ts` | `eval/src/scenarios/` + `scenarios/index.ts` |
| docs (internal) | "materialization"/"prompt composition" prose | `docs/knowledge-architecture/the-materialization-budget.md` (consider file rename → `the-context-assembly-budget.md`), `the-knowledge-fabric-how-knowledge-moves.md`, `the-sync-protocol.md`, `architecture/components.md`, `architecture/decisions.md`, `process-layer/tasks-and-sessions.md`, requirements docs, `guides/developer/project-structure.md` |
| tests | `materialization.integration.test.ts`, `prompt-composition.integration.test.ts`, `X3-prompt-composition.test.ts`, `routine-prompt-composition.test.ts` → renamed | `fabric/src/__tests__/` |

### Retained terms (guard KEEP-list, must NOT trip)
`harness` (incl. `harnessType` column, `*-harness-adapter.ts`, `@hyperidle` harness pkg), `session`, `Fabric`/`fabric` (package), `Strategy`.

---

## Migrations (forward-only Drizzle)

Three column renames, all on existing tables, all behaviour-neutral. **Forward-only** per spec — no down-migration, no backfill needed (rename preserves data).

1. `users.soul_prompt` → `system_prompt`
2. `users.soul_prompt_path` → `system_prompt_path`
3. `sessions.workspace_snapshot` → `sandbox_snapshot`

**Approach.** Edit `schema.ts` field+column names first, then `npm run db:generate`. Drizzle emits an `ALTER TABLE … RENAME COLUMN` migration for SQLite and Postgres (rename, not drop+add — verify the generated SQL says `RENAME COLUMN`, not `DROP`/`ADD`; if Drizzle proposes drop+add for SQLite, hand-author the migration as `ALTER TABLE users RENAME COLUMN soul_prompt TO system_prompt` — SQLite ≥3.25 supports it). ⚠️ VERIFY the generated migration SQL before committing — a drop+add would lose data and violate "behaviour unchanged".

**Allowlist:** all prior migration files under `packages/db/drizzle/` and `drizzle/meta/*.json` snapshots keep the old column names (historical record) — guard excludes them.

`sharedFiles`: `packages/db/src/schema.ts` (schema is shared infra — AK2 also touches it; serialize merge order).

---

## AGENTS.md file convention (minimal, behaviour-preserving)

**What exists:** `writeWorkspaceCLAUDEmd(workspacePath, composedPrompt)` writes the assembled prompt to `<rundir>/CLAUDE.md` (X1 lore). Harness adapters (Claude Agent SDK, aider, goose, opencode) auto-discover `CLAUDE.md`.

**What the AC requires:** the instruction surface is "system prompt + **AGENTS.md** instruction file". AGENTS.md is the Linux-Foundation cross-vendor standard (kernel-strategy-split.md §4).

**Decision: DUAL-WRITE is the DEFAULT (WARNING-2 fix — was "fallback").** Write BOTH `AGENTS.md` AND `CLAUDE.md` to the sandbox root, same content. This is the behaviour-preserving choice and removes the single largest behaviour-change risk in the WP.

**Why dual-write, not AGENTS.md-only — verified against the code (not deferred to the builder):**
- `prompt-composition.ts:10-17` lore: the composed prompt is auto-discovered as **CLAUDE.md** by the Claude Agent SDK AND by aider/goose/opencode, all from the workspace/cwd root.
- `claude-agent-sdk-adapter.ts:167-170`: the SDK adapter relies on CLAUDE.md auto-discovery and sets NO `systemPrompt` — it reads CLAUDE.md from cwd as a system-reminder. There is no positive evidence ANY adapter reads `AGENTS.md` today.
- Writing AGENTS.md *only* would therefore stop every harness from seeing the assembled prompt = a behaviour change (the load-bearing AC forbids this). Writing BOTH: every harness keeps reading CLAUDE.md (behaviour preserved), AND AGENTS.md exists as the named standard surface (AC satisfied). The AC ("system prompt + AGENTS.md") is satisfied by AGENTS.md existing; it does NOT forbid a compatibility CLAUDE.md.

**Minimal real shape (no scope creep):**
- Rename the function `writeWorkspaceCLAUDEmd` → `writeSandboxAgentsMd` (`prompt-composition.ts:257`); arg `workspacePath` → `sandboxPath`.
- Inside it, write BOTH files: `path.join(sandboxPath, "AGENTS.md")` AND `path.join(sandboxPath, "CLAUDE.md")`, identical content (`composedPrompt` / `assembledPrompt`). Update the `:254-259` docstring + lore to state "dual-write: AGENTS.md (standard surface) + CLAUDE.md (current harness auto-discovery), pending universal AGENTS.md adoption".
- The "system prompt" = the assembled prompt text. AGENTS.md/CLAUDE.md are its **on-disk delivery** to the harness. Same content, two filenames. Zero behaviour change to *what* the agent reads.

**Optional simplification (future, NOT this WP):** if a later WP positively verifies every registered adapter auto-discovers `AGENTS.md`, drop the CLAUDE.md write. Until then, dual-write stays. Capture the decision + the "drop CLAUDE.md once adapters adopt AGENTS.md" trigger as `@lore AK1` at the write site.

---

## Static guard against dropped terms (the "no dangling references" AC)

This AC is a **static codebase property**, enforced by a **grep-based guard script**, NOT a runtime test (per CLAUDE.md First Principle). Copy `scripts/nimmly-guard.ts` structure exactly.

**New file:** `scripts/harness-vocab-guard.ts` (+ `harness-vocab-guard:check` script). Wire into `verify` immediately after `nimmly-guard:check`.

**Banned patterns (regex, case-insensitive where appropriate):**
- `/\bsoul/i`
- `/materializ/i`, `/composePrompt/`, `/prompt[ -]composition/i`
- `/skill-tools/`, `/skillTools/`
- `workspace` **as run-unit** — this is the hard one. A blanket `/workspace/i` ban is wrong (it false-positives on npm workspaces, `/workspace` cwd, external CLI flags). Three-tier approach:
  - **Ban** the specific run-unit identifiers: `/WorkspaceAdapter/`, `/WorkspaceHandle/`, `/workspaceBasePath/`, `/workspaceSnapshot/`, `/workspaceHandle/`, `/[Ww]orkspaceReaper/`, `/workspace_snapshot/`.
  - **Ban `/workspacePath/` WITH an explicit allowlist** (WARNING-1 fix — was previously "caught indirectly", which is false: a bare `workspacePath` string field is compiler-happy and the typed-identifier bans miss it; a surviving `workspacePath` IS a dangling reference, exactly the AC this guard enforces). Allowlist entries for `/workspacePath/`: NONE expected after the rename — every `workspacePath` (SessionConfig field + all adapter consumers + ToolContext + session-provisioning vars) renames to `sandboxPath`. If `db:generate` snapshots or historical migrations under `packages/db/drizzle` contain it, those dirs are already dir-allowlisted below. Add a per-occurrence allowlist comment ONLY if a genuine kept case surfaces during the rename (none known) — otherwise `/workspacePath/` bans clean to zero.
  - **Do NOT** ban bare `workspace` (too noisy — npm workspaces, `/workspace` cwd, `--workspace` flag). The `{{workspace}}` token is renamed to `{{sandbox}}` (§Inventory Term-2 RENAME) so it does not need a guard exception; if any straggler bare-`workspace` run-unit field exists that isn't `workspacePath` or a typed identifier, it is caught by the §route-checklist grep (below), NOT by the guard. The guard does not over-claim full bare-`workspace` coverage. Rationale documented in the guard's `@lore`.

**Allowlist (legitimate occurrences — guard skips):**
- Dirs: `node_modules`, `.git`, `dist`, `build`, `.next`, `packages/desktop/out`, `packages/*/dist`, **`docs/archive`**, **`plans`**, **`.pipeline`**, **`packages/db/drizzle`** (historical migrations + meta snapshots — AC explicitly permits dropped terms in historical migrations/changelogs).
- Files: `scripts/harness-vocab-guard.ts` (self), `package.json` (script-name self-reference), the guard's own unit test (`AK1-harness-vocab-guard.test.ts` — contains banned strings as fixtures), `CHANGELOG*` if present, `.claude/rules/typescript.md` (the "workspace import" line, npm sense — but bare `workspace` isn't banned anyway).
- Retained-term safety: guard never bans `harness`, `session`, `Fabric`, `Strategy`, `/workspace` literal, `workspaces`, `--workspace` (goose's flag). NOTE: `{{workspace}}` is NO LONGER retained — it renames to `{{sandbox}}` (§Inventory Term-2 RENAME), so the guard does not allowlist it; after the rename it should not appear at all (a residual `{{workspace}}` is a dangling reference). The guard MAY optionally ban `/\{\{workspace\}\}/` to catch a missed token, but `/workspacePath/` already covers the field it resolves against.

**Guard unit test:** `packages/*/src/__tests__/AK1-harness-vocab-guard.test.ts` (TDD red phase) imports `checkContent`/`runCheck`, asserts: banned strings flagged; allowlisted strings (`/workspace`, `harnessType`, `@hyperidle/db`) pass clean. This is a real runtime test of the guard FUNCTION (legit — it imports and asserts behaviour), distinct from the guard run itself.

---

## Ordered task list (red→green, tree stays compiling at each step)

Order is bottom-up by dependency: shared types → db → fabric → server → web → eval/desktop → docs → guard. Each step compiles before the next.

1. **Write the guard + its unit test (red).** Create `scripts/harness-vocab-guard.ts` with allowlist; write `AK1-harness-vocab-guard.test.ts`. Guard will RED against current tree (expected) — do not wire into `verify` yet. (Validation infra first, per First Principle.)
2. **Schema + migration.** Rename 3 columns in `schema.ts`; `npm run db:generate`; verify SQL is `RENAME COLUMN`. `npm run check` (db pkg). *Proof:* migration runs, `.schema` shows new columns.
3. **shared/** — rename any `workspace`/`soul` in `packages/shared`. **Explicitly: `SessionConfig.workspacePath` → `sandboxPath`** (`harness/harness-adapter.ts:23`) — this is THE shared run-unit field every adapter reads; renaming it here forces step 5 to fix all consumers (compiler-enforced). Also the X1 docstring CLAUDE.md ref → AGENTS.md per §AGENTS.md, `soulPromptPath`→`systemPromptPath` field at :25, worker-protocol. Keep `harness`. `npm run check`.
4. **fabric/** — Term 4 + Term 2 (reaper, fn args): rename files, exports (`materialize`→`assembleContext`, `composePrompt`→`assemblePrompt`, types), `writeWorkspaceCLAUDEmd`→`writeSandboxAgentsMd` (**dual-write AGENTS.md + CLAUDE.md per §AGENTS.md — DEFAULT, not conditional**), `workspace-reaper`→`sandbox-reaper`, `workspacePath` args→`sandboxPath`. Update `fabric/src/index.ts` barrel. `npm run check` (fabric).
5. **server/harness/** — Term 2: rename adapter files + classes (`WorkspaceAdapter`→`SandboxAdapter` etc.), `adapter-pool.ts`, `server-factory.ts` wiring + temp-dir name. **Update every `config.workspacePath` consumer to `config.sandboxPath`** (compiler points at them after step 3): `cli-harness-adapter.ts:170,192`, `claude-agent-sdk-adapter.ts:156`, `docker-workspace-adapter.ts`, `local-workspace-adapter.ts`. **Rename the `{{workspace}}`→`{{sandbox}}` token** in `cli-harness-adapter.ts:29` (`TemplateVar` union), `:36-37` + `:170` (map), and `adapter-pool.ts` `CLI_TOOL_CONFIGS` arg strings (225/235/244) — per the RENAME block in §Inventory Term-2. Leave UNTOUCHED: the literal `/workspace` cwd value, the `mountPath ?? "/workspace"` default, and goose's bare `--workspace` flag string (235). Freeze the S5/S6 argv-not-shell value semantics in `docker-workspace-adapter.security.test.ts` (rename `workspace`→`sandbox` in identifiers/filename only — see §protectedTests). `npm run check`.
6. **server/skill-tools → server/tools/** — Term 3: `git mv` the dir, update `package.json` export map, update every import path, rename "skill tool" prose. `ToolContext.workspacePath`→`sandboxPath`. `npm run check`. **(ci-required-sensitive — registry feeds the harness.)**
7. **server/services/session-provisioning.ts + session-lifecycle.ts** — all four terms converge here: `soulPromptText`→`systemPromptText`, `workspace*`→`sandbox*`, `materialize`/`composePrompt` call sites, `skill-tools` import. **(agent-runtime, ci-required — change names only; the phase order/logic is untouched.)** `npm run check`.
8. **server/routes/** — Term 1 wire fields (`soulPrompt`→`systemPrompt` in agents.ts + assistant.ts request/response zod schemas + handlers + `SOUL_PROMPT_MAX_LENGTH`), session/routine `workspace*` response fields. `factorySettings` key `soul_template:` → `system_template:` (see RISK). `npm run check`.
9. **web/** — Term 1 UI: `soulPrompt` state/setters/labels/ids/placeholders across SettingsAssistant, SettingsAgents, AgentEditDialog, AgentAddDialog, AgentProfile, useTeamAgents; any session `workspace*` field reads. Typed hono/client picks up renamed API fields automatically (verify `npm run check` web). User-visible labels: "Soul Prompt" → "System Prompt"; helper copy updated.
10. **eval/ + desktop/** — rename scenario files + `soul`/`workspace`/`materializ` references; `scenarios/index.ts`; `desktop-worker-client` `soul` refs. `npm run check`.
11. **db seed/bootstrap/fixtures** — `factory-bootstrap.ts`, `demo-fixture.ts`, `eval/src/seeding.ts`: `soulPrompt`→`systemPrompt` field on seeded rows.
12. **tests** — rename every `*soul*`/`*workspace*`/`*materializ*`/`*prompt-composition*` test file + their assertions/fixtures in lockstep with the subjects renamed above (already partly done per-step; this step sweeps the remainder). DB integration tests referencing old columns.
13. **docs (internal)** — Term 1/2/4 prose in `docs/agent-layer/`, `docs/architecture/`, `docs/knowledge-architecture/`, `docs/process-layer/`, `docs/requirements/`, `docs/guides/developer/`. Consider doc file rename `the-materialization-budget.md` → `the-context-assembly-budget.md` (update `index.md` links). User-facing `docs/guides/user/agents.md`.
14. **Wire + green the guard.** Add `harness-vocab-guard:check` to `verify`. Run it; fix any residue it surfaces. Guard now GREEN. Guard unit test GREEN.
15. **Full verify.** `npm run verify` (check + lint + knip + all guards + test:all + build). All green. Behaviour-equivalence proof: §Validation.

---

## Acceptance criteria → verification method

| AC | Verification |
|---|---|
| Instruction surface = system prompt + AGENTS.md; "soul" gone from API/UI/code | Guard bans `/\bsoul/i` (green); integration test on `GET/PATCH /api/users/:id/assistant` + agents routes asserts response has `systemPrompt`, no `soulPrompt` key; provisioning test asserts BOTH `AGENTS.md` AND `CLAUDE.md` written in sandbox root with identical content (dual-write, §AGENTS.md). |
| Run env = sandbox, cwd `/workspace`, "workspace"-as-unit gone | Guard bans the WorkspaceAdapter family (green); session-provisioning integration test asserts `SandboxAdapter.spawn` returns handle with cwd `/workspace`; type-level: `WorkspaceAdapter` no longer exported (`npm run check`). |
| Skills/tools/MCP distinct, "skill-tools" gone | Guard bans `/skill-tools/`,`/skillTools/` (green); `@hyperidle/server/tools` import resolves, `./skill-tools` export removed (`npm run check`). |
| Knowledge assembly = context assembly | Guard bans `/materializ/i`,`/composePrompt/` (green); `assembleContext`/`assemblePrompt` importable from `@hyperidle/fabric` (`npm run check`); existing fabric integration tests pass under renamed exports (behaviour unchanged). |
| harness/session/Fabric/Strategy retained | Guard allowlist; `harnessType` column + `*-harness-adapter` + `@hyperidle/fabric` still present (`npm run check`). |
| No dangling refs; verify passes; behaviour unchanged | `npm run harness-vocab-guard:check` exits 0; `npm run verify` green; **behaviour-equivalence**: the full pre-existing test suite (renamed in lockstep, assertions on *values* unchanged) stays green — no test's logical assertion changes, only identifier spellings (see protectedTests). |

## Behaviour-equivalence proof (the load-bearing AC)
The rename is green ONLY if `npm run verify` passes with **no logical-assertion change** to any pre-existing test. The only permitted test edits: identifier spellings (column/field/type/function names), filenames, and label strings. Any test whose *expected value semantics* change is a behaviour change → reject. DoD audits this via `git diff` on the test corpus.

---

## Security & abuse cases
- Rate-limit on POST/PATCH: **N/A** — no new endpoints; existing rate-limits on agents/assistant routes unchanged (field rename only).
- Input-trust boundary (agent-authored field): **N/A** — `systemPrompt` inherits the exact validation `soulPrompt` had (`SYSTEM_PROMPT_MAX_LENGTH`, same `.max()` zod). Verify the max-length 400-path test is renamed, not weakened.
- Secret-handling: **N/A** — no new credential surface.
- Path-traversal: **applicable, addressed by preservation** — `AGENTS.md` write goes to `path.join(sandboxPath, "AGENTS.md")`, identical join logic to the prior `CLAUDE.md` write. No new path input from user. The X3 lore notes the soul-prompt-PATH file-read attack surface was already removed (inline DB storage); renaming `soul_prompt_path`→`system_prompt_path` does not reintroduce it (column unused at runtime, deprecated).
- SSRF: **N/A** — no outbound URL.

## route-checklist (field renames per route file)
- `packages/server/src/routes/agents.ts` — POST/PATCH agent, GET templates: `soulPrompt`→`systemPrompt` in body schema + response.
- `packages/server/src/routes/assistant.ts` — GET/PATCH `/api/users/:userId/assistant`: `soulPrompt`→`systemPrompt`, `SOUL_PROMPT_MAX_LENGTH`→`SYSTEM_PROMPT_MAX_LENGTH`.
- `packages/server/src/routes/sessions-routes.ts` — session response `workspace*`/`materializ*` → `sandbox*`/assembled.
- `packages/server/src/routes/routines-routes.ts` — routine `workspace*` → `sandbox*`.
- **`packages/shared/src/harness/harness-adapter.ts`** — `SessionConfig.workspacePath` → `sandboxPath` (the shared field).
- **`packages/server/src/harness/cli-harness-adapter.ts`** — `config.workspacePath` reads → `config.sandboxPath`; `{{workspace}}`→`{{sandbox}}` token.
- **`packages/server/src/harness/claude-agent-sdk-adapter.ts`, `docker-workspace-adapter.ts`, `local-workspace-adapter.ts`** — `config.workspacePath` consumers → `config.sandboxPath`.
- **Builder MUST run `grep -rn 'workspacePath' packages/ --include='*.ts' | grep -v drizzle` and confirm zero hits** before sign-off — `workspacePath` is the bare run-unit field the guard now bans (see §Guard); this grep is the human-readable cross-check. The guard `/workspacePath/` ban is the deterministic gate; this grep is the route checklist for review.
- `/architecture-review` greps all the above files for residual old field names (`workspacePath`, `{{workspace}}`, `soulPrompt`) before sign-off.

## protectedTests (assertions must not change in value semantics — only identifiers/labels)
- `packages/server/src/routes/__tests__/AD8b-assistant.routes.integration.test.ts`
- `packages/server/src/routes/__tests__/X3-agents.integration.test.ts`
- `packages/db/src/__tests__/X3-agent-config.integration.test.ts`
- `packages/fabric/src/__tests__/materialization.integration.test.ts` (→ renamed file, same assertions)
- `packages/fabric/src/__tests__/prompt-composition.integration.test.ts` (→ renamed)
- `packages/server/src/__tests__/X3-session-provisioning.integration.test.ts`
- `packages/server/src/__tests__/AD2-task-dispatcher.integration.test.ts`
- `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts` — asserts `{{workspace}}` token resolution + `workspacePath` config. **Renaming `{{workspace}}`→`{{sandbox}}` updates this test's expected token spellings (lines 27, 91, 96, 105, 250) and `workspacePath`→`sandboxPath` (lines 41, 269, 275). This is a NAME change in the test's expectations — the permitted kind of edit, NOT a value-semantics/behaviour change. The test still proves "token resolves to the sandbox path and is absent from the final argv"; only the token's spelling moves with its subject. Builder IS allowed to make these edits.**
- `packages/server/src/harness/__tests__/docker-workspace-adapter.security.test.ts` — S5/S6 argv-not-shell-interpolation invariant. **VALUE SEMANTICS MUST NOT CHANGE.** Only the filename (`docker-workspace-adapter`→`docker-sandbox-adapter`) and `workspace`→`sandbox` identifiers may change; every `expect(...).not.toBe(true)` (no `shell: true`) and every "metacharacter stays as one argv element" assertion is frozen by value. A change to any S5/S6 assertion is a behaviour change → reject.

## sharedFiles (overlap with concurrent WPs — serialize merge)
- `packages/db/src/schema.ts` (AK2 also touches — schema)
- `packages/server/src/services/session-provisioning.ts` (AK2 cuts the Strategy port here)
- `packages/server/src/harness/adapter-pool.ts`, `server-factory.ts`
- `packages/fabric/src/index.ts` (barrel)
- `packages/server/package.json` (export map)
- `eslint.config.ts` / `package.json` `verify` script (guard wiring)
> AK1 must merge BEFORE AK2 (TRACK-AK dependency order) — AK2 cuts the port in the final vocabulary.

---

## RISKS / boundary notes

1. **skill-tools split is naming-only, NOT structural (flagged residue).** The locked nouns split `skill-tools` into three *concepts*: Skill, tool, MCP. In the code today: **tools** exist (`ToolDefinition` registry), **MCP** exists (`packages/server/src/mcp/`). **Skill (Agent Skill / packaged procedural know-how) does NOT exist as a subsystem.** Building a Skill subsystem would be a *behaviour change* — out of scope (spec: "names only, never logic"). **Decision:** rename the conflated `skill-tools` directory/term to `tools` (the registry IS a tool registry), keeping MCP as its already-separate module. Do NOT invent a Skill concept. **Residue flagged:** the third concept "Skill" is named in the locked vocabulary but has no code home yet; this WP satisfies "skill-tools name is gone, tool/MCP are distinctly named" but leaves "Skill" as a future structural workpackage. This is the correct minimal scope — note it in `@lore AK1` so AK2+ knows Skill is unbuilt, not missed.

2. **`workspace` over-ban risk.** A blanket ban would break npm workspaces, the `/workspace` cwd, and external CLI flags. The three-tier guard (ban typed identifiers + ban `/workspacePath/` with allowlist, not bare `workspace`) is the mitigation. Builder must NOT touch: the literal `/workspace` cwd VALUE, `"workspaces"` (npm), `@hyperidle/*` imports, goose's bare `--workspace` flag string. Builder MUST rename: `{{workspace}}`→`{{sandbox}}` (it's our DSL token, CRITICAL-1) and `SessionConfig.workspacePath`→`sandboxPath` (CRITICAL-2).

3. **API wire-field rename is a contract break.** `soulPrompt`→`systemPrompt` changes JSON bodies. Internal-only (no external API consumers; web uses typed hono/client which recompiles). The typed client makes this safe — `npm run check` on web catches every stale field. No versioning needed.

4. **`soul_template:` factorySettings key.** `routes/agents.ts:187` reads `soul_template:${role}` from a settings store. Renaming the KEY (`system_template:`) requires the seeded settings rows to use the new key too (`factory-bootstrap.ts`). Rename key + seed together (task 8 + 11) or the template lookup returns empty (behaviour change). Verify the template-fetch test stays green.

5. **AGENTS.md vs CLAUDE.md harness compat (ci-required) — RESOLVED: dual-write default.** Verified no adapter reads AGENTS.md today; all read CLAUDE.md (`prompt-composition.ts:10-17`, `claude-agent-sdk-adapter.ts:167-170`). Therefore `writeSandboxAgentsMd` writes BOTH files unconditionally (§AGENTS.md). This is the one place the rename brushes against runtime behaviour; dual-write makes it ship-safe with zero behaviour change. A provisioning integration test asserts BOTH `AGENTS.md` and `CLAUDE.md` exist in the sandbox root with identical content.

6. **Migration must be RENAME not DROP+ADD.** SQLite drizzle can emit drop+add for column renames → data loss. Inspect generated SQL; hand-author `ALTER … RENAME COLUMN` if needed. Forward-only (no down).

7. **Volume.** ~1100+ shippable occurrences across ~150 files. This is mechanical but large — the bottom-up step order (3→13) is what keeps `npm run check` green between steps. Do not rename top-down (web first) — it breaks compilation until the producers are renamed.
