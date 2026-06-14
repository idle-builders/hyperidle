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
| AGENTS.md is new | The composed prompt is ALREADY written to the run dir as `CLAUDE.md` (X1 lore, `writeWorkspaceCLAUDEmd`). AGENTS.md is the same file under the standard name. | Rename the written file `CLAUDE.md` → `AGENTS.md`; confirm harness auto-discovery (§AGENTS.md, ⚠️ VERIFY). |
| `harnessType` column = "harness" (kept) | Confirmed `users.harness_type` — "harness" is RETAINED. | No change. Listed in KEEP so the guard does not false-positive. |

No `/concept` gap. No spec/doc contradiction.

---

## Inventory (shippable surface, excludes node_modules, dist, .git, docs/archive, drizzle/meta snapshots, plans/, .pipeline/)

Counts are occurrences / files. Historical migrations + drizzle snapshots are **allowlisted** (see §Guard) and excluded from these totals.

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
| tool ctx | `ToolContext.workspacePath` → `sandboxPath` | `skill-tools/tool-registry.ts:47` + every consuming tool (`write-session-notes.ts`, etc.) |
| API/routes | `workspace*` fields on session/routine responses | `routes/sessions-routes.ts`, `routes/routines-routes.ts` |
| fabric fn arg | `writeWorkspaceCLAUDEmd(workspacePath,…)` → see AGENTS.md §; `materialize({workspacePath})` arg → `sandboxPath` | `fabric/src/prompt-composition.ts`, `materialization.ts` |
| temp dir name | `"hyperidle-workspaces"` → `"hyperidle-sandboxes"` | `server-factory.ts:249` |
| docs (internal) | "workspace adapter" prose | `docs/architecture/components.md`, `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md` |
| tests | all `*workspace*` adapter/provisioning test fixtures | ~50 test files |

**KEEP (do NOT rename — guard must allowlist):**
- Literal cwd `/workspace` string and `mountPath ?? "/workspace"` (`docker-*-adapter.ts:64`). The cwd stays `/workspace` per the locked nouns.
- npm workspaces: `"workspaces"` in package.json, `@hyperidle/*` workspace imports, "workspace import" in `.claude/rules/typescript.md`.
- External harness CLI contracts: `--workspace` flag and `{{workspace}}` template placeholder in `adapter-pool.ts` (225,235,244) — these are aider/goose/opencode's own flag names, not ours.

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

**Minimal real shape (no scope creep):**
- Rename the function `writeWorkspaceCLAUDEmd` → `writeSandboxAgentsMd` and write the file as `AGENTS.md` instead of `CLAUDE.md` in the sandbox root.
- The "system prompt" = the assembled prompt text (the `systemPrompt` field on the agent + assembled knowledge). AGENTS.md is its **on-disk delivery** to the harness. Same content, standard filename. This satisfies "system prompt + AGENTS.md" with zero behaviour change to *what* the agent reads.

**⚠️ VERIFY (source-driven, harness behaviour, ci-required area):** Confirm each harness adapter auto-discovers `AGENTS.md`:
- Claude Agent SDK: `settingSources` / instruction-file discovery — check `harness/claude-agent-sdk-adapter.ts` (X1 lore says it relies on CLAUDE.md auto-discovery). If the SDK does NOT yet read AGENTS.md, the behaviour-preserving move is to **write BOTH** `AGENTS.md` (the standard, satisfies the AC) and keep `CLAUDE.md` (what the SDK actually reads) until the SDK supports AGENTS.md — flag this as a residue, do not break the running agent.
- aider/goose/opencode flags in `adapter-pool.ts`: confirm they read AGENTS.md or are content-agnostic (they get the path, not the filename).

If verification shows any harness reads only CLAUDE.md, choose the dual-write fallback. The AC ("expressed as system prompt + AGENTS.md") is satisfied by AGENTS.md existing and being the named surface; it does not forbid a compatibility CLAUDE.md. Capture the decision as `@lore AK1`.

---

## Static guard against dropped terms (the "no dangling references" AC)

This AC is a **static codebase property**, enforced by a **grep-based guard script**, NOT a runtime test (per CLAUDE.md First Principle). Copy `scripts/nimmly-guard.ts` structure exactly.

**New file:** `scripts/harness-vocab-guard.ts` (+ `harness-vocab-guard:check` script). Wire into `verify` immediately after `nimmly-guard:check`.

**Banned patterns (regex, case-insensitive where appropriate):**
- `/\bsoul/i`
- `/materializ/i`, `/composePrompt/`, `/prompt[ -]composition/i`
- `/skill-tools/`, `/skillTools/`
- `workspace` **as run-unit** — this is the hard one. A blanket `/workspace/i` ban is wrong (it false-positives on npm workspaces, `/workspace` cwd, external CLI flags). Two-tier approach:
  - **Ban** the specific run-unit identifiers: `/WorkspaceAdapter/`, `/WorkspaceHandle/`, `/workspaceBasePath/`, `/workspaceSnapshot/`, `/workspaceHandle/`, `/[Ww]orkspaceReaper/`, `/workspace_snapshot/`.
  - **Do NOT** ban bare `workspace` (too noisy). The remaining bare-`workspace` run-unit vars (`workspacePath`, `workspace` deps field) are caught indirectly: after the rename they're gone, and the typed identifiers above being banned prevents the family from resurrecting. Rationale documented in the guard's `@lore`.

**Allowlist (legitimate occurrences — guard skips):**
- Dirs: `node_modules`, `.git`, `dist`, `build`, `.next`, `packages/desktop/out`, `packages/*/dist`, **`docs/archive`**, **`plans`**, **`.pipeline`**, **`packages/db/drizzle`** (historical migrations + meta snapshots — AC explicitly permits dropped terms in historical migrations/changelogs).
- Files: `scripts/harness-vocab-guard.ts` (self), `package.json` (script-name self-reference), the guard's own unit test (`AK1-harness-vocab-guard.test.ts` — contains banned strings as fixtures), `CHANGELOG*` if present, `.claude/rules/typescript.md` (the "workspace import" line, npm sense — but bare `workspace` isn't banned anyway).
- Retained-term safety: guard never bans `harness`, `session`, `Fabric`, `Strategy`, `/workspace` literal, `workspaces`, `--workspace`, `{{workspace}}`.

**Guard unit test:** `packages/*/src/__tests__/AK1-harness-vocab-guard.test.ts` (TDD red phase) imports `checkContent`/`runCheck`, asserts: banned strings flagged; allowlisted strings (`/workspace`, `harnessType`, `@hyperidle/db`) pass clean. This is a real runtime test of the guard FUNCTION (legit — it imports and asserts behaviour), distinct from the guard run itself.

---

## Ordered task list (red→green, tree stays compiling at each step)

Order is bottom-up by dependency: shared types → db → fabric → server → web → eval/desktop → docs → guard. Each step compiles before the next.

1. **Write the guard + its unit test (red).** Create `scripts/harness-vocab-guard.ts` with allowlist; write `AK1-harness-vocab-guard.test.ts`. Guard will RED against current tree (expected) — do not wire into `verify` yet. (Validation infra first, per First Principle.)
2. **Schema + migration.** Rename 3 columns in `schema.ts`; `npm run db:generate`; verify SQL is `RENAME COLUMN`. `npm run check` (db pkg). *Proof:* migration runs, `.schema` shows new columns.
3. **shared/** — rename any `workspace`/`soul` in `packages/shared` (harness-adapter type comment X1 `workspace`/CLAUDE.md ref, worker-protocol). Keep `harness`. `npm run check`.
4. **fabric/** — Term 4 + Term 2 (reaper, fn args): rename files, exports (`materialize`→`assembleContext`, `composePrompt`→`assemblePrompt`, types), `writeWorkspaceCLAUDEmd`→`writeSandboxAgentsMd` (+AGENTS.md write per §AGENTS.md verification), `workspace-reaper`→`sandbox-reaper`, `workspacePath` args→`sandboxPath`. Update `fabric/src/index.ts` barrel. `npm run check` (fabric).
5. **server/harness/** — Term 2: rename adapter files + classes (`WorkspaceAdapter`→`SandboxAdapter` etc.), `adapter-pool.ts`, `server-factory.ts` wiring + temp-dir name. Leave `/workspace` cwd, `--workspace`/`{{workspace}}` flags untouched. `npm run check`.
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
| Instruction surface = system prompt + AGENTS.md; "soul" gone from API/UI/code | Guard bans `/\bsoul/i` (green); integration test on `GET/PATCH /api/users/:id/assistant` + agents routes asserts response has `systemPrompt`, no `soulPrompt` key; provisioning test asserts `AGENTS.md` written in sandbox root. |
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
- `/architecture-review` greps these four files for residual old field names before sign-off.

## protectedTests (assertions must not change in value semantics — only identifiers/labels)
- `packages/server/src/routes/__tests__/AD8b-assistant.routes.integration.test.ts`
- `packages/server/src/routes/__tests__/X3-agents.integration.test.ts`
- `packages/db/src/__tests__/X3-agent-config.integration.test.ts`
- `packages/fabric/src/__tests__/materialization.integration.test.ts` (→ renamed file, same assertions)
- `packages/fabric/src/__tests__/prompt-composition.integration.test.ts` (→ renamed)
- `packages/server/src/__tests__/X3-session-provisioning.integration.test.ts`
- `packages/server/src/__tests__/AD2-task-dispatcher.integration.test.ts`

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

2. **`workspace` over-ban risk.** A blanket ban would break npm workspaces, the `/workspace` cwd, and external CLI flags. The two-tier guard (ban typed identifiers, not bare `workspace`) is the mitigation. Builder must NOT touch `/workspace`, `{{workspace}}`, `--workspace`, `"workspaces"`, `@hyperidle/*`.

3. **API wire-field rename is a contract break.** `soulPrompt`→`systemPrompt` changes JSON bodies. Internal-only (no external API consumers; web uses typed hono/client which recompiles). The typed client makes this safe — `npm run check` on web catches every stale field. No versioning needed.

4. **`soul_template:` factorySettings key.** `routes/agents.ts:187` reads `soul_template:${role}` from a settings store. Renaming the KEY (`system_template:`) requires the seeded settings rows to use the new key too (`factory-bootstrap.ts`). Rename key + seed together (task 8 + 11) or the template lookup returns empty (behaviour change). Verify the template-fetch test stays green.

5. **AGENTS.md vs CLAUDE.md harness compat (⚠️ VERIFY, ci-required).** Per §AGENTS.md — confirm harnesses read AGENTS.md; if any reads only CLAUDE.md, dual-write to preserve behaviour. This is the one place the rename brushes against runtime behaviour; treat with the ci-required caution the agent-runtime demands.

6. **Migration must be RENAME not DROP+ADD.** SQLite drizzle can emit drop+add for column renames → data loss. Inspect generated SQL; hand-author `ALTER … RENAME COLUMN` if needed. Forward-only (no down).

7. **Volume.** ~1100+ shippable occurrences across ~150 files. This is mechanical but large — the bottom-up step order (3→13) is what keeps `npm run check` green between steps. Do not rename top-down (web first) — it breaks compilation until the producers are renamed.
