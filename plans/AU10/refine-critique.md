# AU10 Refine Critique — Round 1

**Verdict: PASS. Score 9/10.** 0 CRITICAL, 1 WARNING (resolved by guidance), 1 NOTE.

## Factual verification against source (@ worktree)
Every load-bearing claim in `requirements.md` verified TRUE against real code:

- **Leak location** — `plugin-configuration.ts:26` imports `ALL_TOOL_DEFINITIONS` from `../tools/tool-registry.js`; consumed at `:477-488` reading only `name/description/roles/reversibility`. Exact. ✓
- **Completeness (the load-bearing claim)** — AC1 names five forbidden categories; requirement found ONE leak. Independently confirmed the other four are genuinely clean:
  - The plugin/default **config-source surface** is exactly two production files: `plugin-configuration.ts` (the only production seeder; `loadPluginConfigurationDefaults`/`backfillLegacyConfigurationDefaults`) and `agent-behavior-config.ts` (thin settings surface over it, imports only `db` type, `shared`, and `plugin-configuration.js`).
  - `server-factory.ts` calls the seeder but is the composition root (boot wiring), not a config source — correctly not guarded.
  - `plugin-configuration.ts` imports: `node:crypto`, `@hyperidle/db`, `@hyperidle/shared`, `drizzle-orm`, `zod`, `tool-registry`. Only `tool-registry` is runtime. No harness / mcp / provisioning / agent-execution import anywhere in the surface.
  - `strategy-minimal` / `fabric` seed nothing.
  - **Conclusion: the "one violation" claim is correct, not a gap.** ✓
- **`agent-defaults/resolvers.ts`** imports `app-runtime/roster` + `app-runtime/services/agent-selection` — genuinely runtime, genuinely the AU11 shell, genuinely not a plugin/default config source. Exclusion is correct and leaves no AU10 AC unsatisfied. ✓
- **AC2 already structurally satisfied** — built-in defaults already flow through the same table + provenance as plugins: `backfillLegacyConfigurationDefaults` → `loadBuiltInConfigurationDefaults` → `loadPluginConfigurationDefaults(BUILTIN_PLUGIN_SOURCE)`; `originFor` stamps `type:"builtin"` when `plugin.id === BUILTIN_PLUGIN_ID`. The import fix does NOT change provenance representation — it only removes the execution-graph drag. The AC2 integration assertion (`origin.type==="builtin"`) is a correct regression pin. ✓
- **AC3** — consumption direction already correct (`trigger-resolution.ts:243` reads `listResolvedConfiguration`). The only "push-like" edge is a metadata *read* of `ALL_TOOL_DEFINITIONS`; removing it satisfies AC3. No additional work needed. ✓
- **`return-status-tool` excluded from both** — confirmed: not in `ALL_TOOL_DEFINITIONS`. ✓
- **`reversibility`** is a static optional field on `RegisteredTool` — a pure-data catalog can mirror it; deep-equal consistency test is sound. ✓

## WARNING (W1 — resolved by guidance, no plan rewrite)
AC5's verification artifact ("every `BUILTIN_TOOL_CATALOG` entry passes `validateConfigurationValue('tool', …)`") calls a function that is **not exported** (`plugin-configuration.ts:184` is a bare `function`). As literally specified the unit test will not compile. Builder resolution (either is acceptable; no architecture change): export `validateConfigurationValue`, OR prove AC5 by seeding the catalog through the real projection path (`loadBuiltInConfigurationDefaults`, which invokes the validator internally at `:222`) and asserting no throw. The latter is preferable — it exercises the shipped path, not a helper.

## NOTE (N1)
Refine self-assessment −1 (catalog↔registry drift) is the right residual and is genuinely closed by the mandatory consistency test in `architecture.md`. Good.
