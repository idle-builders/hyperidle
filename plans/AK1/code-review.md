# AK1 — Harness-vocabulary rename — Phase 4 Code Review

**Branch:** `feat/AK1-harness-vocabulary-rename` · **Base:** `origin/main` · **Scope:** 270 files, behaviour-preserving rename to locked nouns.

Reviewed against: `plans/AK1/architecture.md`, `.pipeline/work-packages/TRACK-AK.md → AK1`, `docs/architecture/kernel-strategy-split.md §4`.

---

## AC Completeness Audit

| # | Acceptance criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Instruction surface = system prompt + AGENTS.md; "soul" gone from API/UI/code | **MET** | `grep -rniE '\bsoul'` over `packages/`+`docs/` (excl. allowlist) = **zero hits**. Routes expose `systemPrompt` (`assistant.ts:43,313,403`, `agents.ts:51,224,389`), `SYSTEM_PROMPT_MAX_LENGTH`, `system_template:` key. UI labels all "System Prompt" (`SettingsAssistant.tsx`, `AgentEditDialog.tsx:179`). Dual-write impl at `context-assembly-prompt.ts:277-279` writes BOTH `AGENTS.md` + `CLAUDE.md`; invoked at `session-provisioning.ts:626`. Proof: `AK1-dual-write.test.ts` 6/6 pass; `AK1-renamed-fields.integration.test.ts` 5/5 pass (asserts response has `systemPrompt`, NOT `soulPrompt`, incl. PATCH rejection of old field). |
| 2 | Run env = sandbox; cwd `/workspace`; "workspace" no longer names the unit | **MET (1 minor residual, see M1)** | `WorkspaceAdapter`/`Handle`/`Reaper` families renamed to `Sandbox*` (git renames confirmed). `SessionConfig.workspacePath → sandboxPath` (`harness-adapter.ts:28`). cwd literal `/workspace` retained (correct). `npm run check` PASS — old types no longer exported. **Residual:** `SandboxHandle.workspaceId` field NOT renamed (see M1). |
| 3 | Skills / tools / MCP distinct; "skill-tools" gone | **MET** | Dir `skill-tools/ → tools/` (git renames confirmed); export map updated; zero `skill-tools`/`skillTools` hits in shippable code. MCP stays separate module. Skill-as-subsystem correctly deferred per plan RISK 1 (`@lore AK1`). |
| 4 | Knowledge assembly = context assembly | **MET (1 minor, see M2)** | `materialize → assembleContext`, `composePrompt → assemblePrompt`, types → `ContextAssembly*` (`fabric/src/index.ts:341-355`). Files renamed. Zero `materializ`/`composePrompt`/`prompt-composition` hits in shippable code. **Residual:** doc *filename* `the-materialization-budget.md` (see M2). |
| 5 | harness / session / Fabric / Strategy retained | **MET** | Guard allowlists them; `harnessType` column + `*-harness-adapter.ts` + `@hyperidle/fabric` intact; `npm run check` PASS. |
| 6 | No dangling refs; verify passes; behaviour unchanged | **MET** | Guard exists (`scripts/harness-vocab-guard.ts`), wired into `verify` after `token-guard:check` (`package.json:32`), runs clean (**exit 0**). Migration is forward-only `RENAME COLUMN` (not drop+add). Protected tests value-frozen (see below). |

**Overall: all 6 ACs MET.** Two MINOR residuals (M1, M2) — neither blocks the AC; both are name-hygiene gaps a perfectionist would close.

---

## Adjudication of the 3 builder-flagged "noticed but not touching" items

**(a) `context-assembly-prompt.integration.test.ts:507` only checks CLAUDE.md — ACCEPTABLE.**
The separate `packages/fabric/src/__tests__/AK1-dual-write.test.ts` genuinely covers AGENTS.md: it asserts AGENTS.md exists with exact content (`test:46-53`), CLAUDE.md exists with exact content (`:55-62`), AND that the two are byte-identical (`:64-71`). Ran it: 6/6 pass. AC1's dual-write requirement is proven. The integration-test gap is harmless duplication, not a coverage hole.

**(b) `SandboxHandle.workspaceId` still named `workspaceId` — FINDING (MINOR, M1).**
This is the identity field of the run-unit (`sandbox-adapter.ts:8`), consumed everywhere as `handle.workspaceId`, with local vars `workspaceId` and ID prefixes `local-ws-`/`docker-ws-` (`local-sandbox-adapter.ts:75-103`, `docker-sandbox-adapter.ts:71-137`). It is the ID **of the sandbox** — i.e. "workspace" still names the run-unit, the exact thing AC2 forbids. The plan explicitly listed this rename (`architecture.md:63`: "`WorkspaceHandle → SandboxHandle` (`workspaceId` field → `sandboxId`)"). The builder renamed the type but missed the field. It is purely internal (no wire/DB/UI exposure), and the guard does not ban bare `workspaceId` (only `workspacePath` + typed identifiers), so it slipped through. **Classify MINOR** — internal-only, behaviour-neutral, but it is a plan-specified rename left undone and a literal AC2 residual. Builder should finish it: `workspaceId → sandboxId` on the field + all consumers + ID prefixes.

**(c) `docs/knowledge-architecture/the-materialization-budget.md` filename — FINDING (MINOR, M2).**
Content is updated; only the filename retains "materialization". The guard scans content, not filenames, so it passed. No `index.md` or other doc links to the old slug (grep = zero refs), so nothing is broken today. AC4/AC6 target "code and internal docs" and "no dangling references"; a filename with a dropped term is a weak dangling reference. The plan flagged it as optional ("consider file rename → `the-context-assembly-budget.md`"). **Classify MINOR** — not load-bearing, no broken link, but the term should not survive anywhere. Builder should `git mv` it for consistency.

---

## Behaviour-preservation check

- **Migration:** `packages/db/drizzle/0033_AK1_harness_vocab_rename.sql` is hand-authored, three `ALTER TABLE … RENAME COLUMN` statements (users.soul_prompt→system_prompt, soul_prompt_path→system_prompt_path, sessions.workspace_snapshot→sandbox_snapshot). **No DROP/ADD — no data loss.** Active dialect is PostgreSQL (`drizzle.config.ts`); SQLite is archived/frozen at 0020, no parallel migration needed. CORRECT.
- **Protected test `X5-cli-harness-adapter.test.ts`:** diff is only token spelling (`{{workspace}}→{{sandbox}}`) + field (`workspacePath→sandboxPath`) + label text. Assertion logic frozen — still proves "token resolves to path and is absent from final argv" (`.not.toContain("{{sandbox}}")`). PERMITTED edit.
- **Protected test `docker-*-adapter.security.test.ts`:** diff is ONLY class-name/import/describe-label rename (`DockerWorkspaceAdapter→DockerSandboxAdapter`). Every S5/S6 shell-injection assertion is byte-identical. NOT weakened.
- **Disabled adapter:** pure identifier + comment rename; `fail()`/reject logic unchanged (git rename-detection diff noise).
- **No logic disguised as rename:** scanned all non-test `.ts` diffs for conditional/SQL/control-flow changes outside the rename set — none found.

---

## Lens findings

**Architecture** — Clean. Layer integrity preserved. Barrel exports correctly renamed (`fabric/src/index.ts`). `system_template:` factory-settings KEY renamed on BOTH the route lookup (`agents.ts:187`) and the seed (`factory-bootstrap.ts:185`) — RISK 4 handled, no empty-template regression.

**Security** — No new surface. `systemPrompt` inherits the exact `.max(50_000)` validation. AGENTS.md write uses identical `path.join(sandboxPath, …)` as the prior CLAUDE.md write — no new path input. N/A on rate-limit/SSRF/secrets per plan §Security. PASS.

**Adversarial / Simplification / Slop** — Nothing material. `@lore AK1` comments are accurate and load-bearing (explain dual-write rationale + the three-tier guard design). Minor cosmetic: `sandbox-adapter.ts:4` lore comment reads `"SandboxAdapter → SandboxAdapter"` (a copy-paste artifact — should read `WorkspaceAdapter → SandboxAdapter`); harmless, OBSERVATION only.

**Design (UI)** — Labels renamed honestly to "System Prompt" across SettingsAssistant/SettingsAgents/AgentEditDialog/AgentAddDialog; stories updated. No behaviour/layout change. PASS.

**Docs** — `npm run check` PASS (12/12 packages). User-facing docs updated. One stale user-doc line: `docs/guides/user/agents.md:19` "Gets a assembled **workspace** (code, context, knowledge)" — this is the run-unit described to users with the dropped term; should be "sandbox" (M3, MINOR — guard doesn't catch bare `workspace`). (`getting-started.md:27` "npm workspace" is the npm sense — correctly kept.)

---

## Findings summary

- **CRITICAL:** none.
- **MAJOR:** none.
- **MINOR:**
  - **M1** — `SandboxHandle.workspaceId` field (+ all consumers, ID prefixes `local-ws-`/`docker-ws-`) not renamed to `sandboxId`. Plan-specified rename left undone; literal AC2 residual (internal-only). `sandbox-adapter.ts:8`, `local-sandbox-adapter.ts:75-103`, `docker-sandbox-adapter.ts:71-137`.
  - **M2** — doc filename `docs/knowledge-architecture/the-materialization-budget.md` retains "materialization" (content updated; no broken links). `git mv` → `the-context-assembly-budget.md`.
  - **M3** — `docs/guides/user/agents.md:19` describes the run-unit as "workspace"; should be "sandbox".
- **OBSERVATION:** `sandbox-adapter.ts:4` lore typo `"SandboxAdapter → SandboxAdapter"` (should be `WorkspaceAdapter → SandboxAdapter`).

---

## Verdict

All 6 acceptance criteria are MET with proof (guard exit 0, `npm run check` 12/12, dual-write 6/6, renamed-fields API 5/5, migration is RENAME-not-drop, protected tests value-frozen). The three remaining items are MINOR name-hygiene gaps, none of which breaks an AC, the build, or behaviour. M1 is the one worth closing before merge (a plan-specified rename that was missed and is a literal AC2 residual), but it is internal-only and non-blocking.

**Verdict: DONE**

Recommended (non-blocking) follow-ups for the builder: M1 (`workspaceId → sandboxId`), M2 (doc filename), M3 (user-doc "workspace"→"sandbox"), and fix the M-OBS lore typo. If the pipeline treats AC2 strictly, fold M1 into this PR; M2/M3/OBS can ride along trivially.
