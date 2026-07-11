# AU10 — Plugin surface ownership correction — Architecture

## 1. Context

Track AU retires Strategy/Fabric as runtime concepts and enforces one boundary:
core app owns records/events/config; the agent layer owns every LLM run; plugins
+ built-ins are **configuration sources only**. AU9 (merged) made core→agent
handoff go through recorded intent/events. AU10 fixes the remaining plugin/default
**ownership** leak: the built-in `tool` capability defaults are projected by
*importing the runtime tool execution registry* (`ALL_TOOL_DEFINITIONS`). That is
config code depending upward on execution — the exact anti-pattern the track kills.

## 2. Constraints

- Preserve AU2/AU5 observable behavior exactly (no resolution semantics change).
- No new noun, no UI, no marketplace/signing/sandboxing/permissions tier.
- Built-ins keep flowing through the *same* config/provenance model as plugins.
- Guard must be mechanical, cross-platform, no Docker (mirror au6/au7/au9 guards).
- TypeScript strict; explicit return types; workspace imports; no `any`/unsafe casts.

## 3. Responsibility classification against the should graph

Classified against `as-should-dependency-graph.md` (Config catalogs table +
Boundary Checks) and `component-inventory.md` row 40.

| Concern | Owner (should) | Where it lives after AU10 | Must NOT |
|---|---|---|---|
| **Tool catalog metadata** (name, description, roles, reversibility) | Configuration source | NEW `packages/server/src/config/builtin-tool-catalog.ts` — pure data, zero runtime imports | import `tool-registry.ts` or any handler module |
| **Tool execution** (handler, inputSchema, ToolContext) | Agent layer (Tool Executor) | `packages/server/src/tools/tool-registry.ts` (unchanged) | be imported by plugin/default config code |
| **Config record projection** (seed built-in + plugin defaults) | Configuration source | `plugin-configuration.ts` (import catalog, not registry) | import any runtime execution module |
| **Config record resolution** (layer defaults + overrides, provenance) | Configuration source | `plugin-configuration.ts` `listResolvedConfiguration` (unchanged logic) | reach into runtime |
| **Config editing surface** | Configuration source | `agent-behavior-config.ts` (unchanged) | reach into runtime |
| **Runtime consumption of active config** | Agent layer | `trigger-resolution.ts` reads `listResolvedConfiguration` (unchanged) | be pushed to by config code |
| **Catalog↔registry consistency** (anti-drift) | Agent layer (runtime side) | `tool-registry.ts` imports catalog (allowed: runtime→config-data) + colocated unit test asserting name/metadata parity | let config import registry |

**Key inversion:** the dependency edge `plugin-configuration → tool-registry`
(config → execution, forbidden) is replaced by `tool-registry → builtin-tool-catalog`
(execution → config-data, allowed). Config and execution now both depend *down*
onto the same pure-data catalog; neither imports the other's behavior.

### Should-graph boundary checks this satisfies
- "Plugins must not call harness adapters directly." → guard forbids it.
- "Plugins seed typed config defaults only." → catalog is typed pure data.
- "Effective config feeds Agent layer decisions directly." → trigger-resolution reads resolved config (unchanged).

## 4. Files to touch

### New
1. `packages/server/src/config/builtin-tool-catalog.ts`
   - `export interface ToolCatalogEntry { readonly name: string; readonly description: string; readonly roles?: readonly UserRole[]; readonly reversibility?: Reversibility; }`
   - `export const BUILTIN_TOOL_CATALOG: readonly ToolCatalogEntry[]` — one entry per built-in tool currently in `ALL_TOOL_DEFINITIONS`. Pure data. Imports only types from `@hyperidle/shared` (`UserRole`, `Reversibility`). NO import of `tool-registry.ts` or any `./tools/*` handler module.
2. `scripts/au10-plugin-config-ownership-guard.ts` (mirror `au9-direct-handoff-guard.ts` structure: `inspect(root)`, AST transitive-import walk, embedded `--fixtures` self-check, `--check` mode).
3. `packages/server/src/tools/__tests__/builtin-tool-catalog-consistency.test.ts` — anti-drift unit test.

### Modified
4. `packages/server/src/services/plugin-configuration.ts`
   - Line 26: replace `import { ALL_TOOL_DEFINITIONS } from "../tools/tool-registry.js"` with `import { BUILTIN_TOOL_CATALOG } from "../config/builtin-tool-catalog.js"`.
   - Lines 477–488: iterate `BUILTIN_TOOL_CATALOG` instead of `ALL_TOOL_DEFINITIONS`; body is identical (already reads only `name`/`description`/`roles`/`reversibility`). `?? null` normalization preserved so `defaultValueJson` bytes are byte-identical → `defaultVersionHash` unchanged → provenance/override linkage stable (AC4).
5. `packages/server/src/tools/tool-registry.ts`
   - Add `import { BUILTIN_TOOL_CATALOG } from "../config/builtin-tool-catalog.js"` **only if** used by an in-module consistency assertion; otherwise the consistency test (file 3) imports both. Prefer the test-only approach to keep `tool-registry.ts` untouched. (Runtime→config-data import is allowed either way.)
6. `package.json` `lint` script — append `&& npx tsx scripts/au10-plugin-config-ownership-guard.ts --check`.
7. `packages/server/src/__tests__/configuration-projection-boot.integration.test.ts` — add assertion: a `tool` default resolves with `origin.type === "builtin"` (AC2/VS1).
8. `packages/server/src/services/__tests__/plugin-configuration.test.ts` — add VS2 case: seed a default, set an override, re-seed the default with a new value, assert `activeValue` still equals the override (override wins over default re-projection).

## 5. The guard (AC1 / AC6 mechanism)

`scripts/au10-plugin-config-ownership-guard.ts`:

- **Config-source set** (files that must stay execution-free):
  - `packages/server/src/services/plugin-configuration.ts`
  - `packages/server/src/config/builtin-tool-catalog.ts`
  - `packages/server/src/services/agent-behavior-config.ts`
- **Forbidden runtime modules** (direct OR transitive import ⇒ finding), matched by module basename:
  `tool-registry`, `session-provisioning`, `agent-session-runtime`, `agent-run-boundary`, `agent-session-requests`, `connection-provisioning`, plus any specifier under `harness/`, `mcp/`, or `app-runtime/services/`.
- **Algorithm:** parse each config-source file with the TS compiler API (as au9 does), follow local relative imports transitively, flag if any reachable module is forbidden. Namespace + named + default imports all covered (reuse au9's `Unit`/`reaches` machinery).
- **Embedded `--fixtures` self-check** (VS3, the red proof): temp dir with
  (a) a config-source file importing `tool-registry` → expect a finding;
  (b) a config-source file importing another clean local module → expect no finding;
  (c) a transitive case (config-source → wrapper → `session-provisioning`) → expect a finding.
- **`--check` mode:** print findings to stderr, `exit(1)` if any; wired into `npm run lint`.

Scope note vs AU8: AU8 will add the *global* should-graph guard. AU10's guard is
the **narrow, plugin-surface-scoped** seam — same shape, small forbidden set. It
is not superseded by AU8; it is the first tile AU8 generalizes.

## 6. Anti-drift: catalog ↔ registry consistency (closes the refine −1)

`builtin-tool-catalog-consistency.test.ts` (runtime side, imports both — allowed):

- `new Set(BUILTIN_TOOL_CATALOG.map(e => e.name))` **equals** `new Set(ALL_TOOL_DEFINITIONS.map(t => t.name))` (no orphan catalog entry, no unlisted tool). `return-status-tool` stays excluded from both, consistent with today.
- For every name, catalog `description`/`roles`/`reversibility` **deep-equal** the registry tool's — so metadata cannot silently diverge.
- This is genuine runtime behavior (`import → expect`), a real unit test per testing.md, not a lint dressed as a test.

If a future tool is added to the registry without a catalog entry (or vice
versa), this test goes red. That is the only thing preventing the split from
rotting; it is mandatory, not optional.

## 7. Acceptance criteria → concrete verification

| AC | Method | Artifact |
|---|---|---|
| AC1 | lint guard | `scripts/au10-plugin-config-ownership-guard.ts --check` (in `npm run lint`) |
| AC2 | integration test | `configuration-projection-boot.integration.test.ts` — `tool` default has builtin provenance |
| AC3 | guard + existing test | AC1 guard + `trigger-resolution.test.ts` (unchanged) |
| AC4 | regression (unchanged) | `plugin-configuration.test.ts` full suite stays green; `defaultVersionHash` byte-stable |
| AC5 | unit test | consistency test + a `validateConfigurationValue("tool", entry.key, entry.value)` pass over the catalog |
| AC6 | guard is the audit | reviewer runs guard + reads §3 classification table |

Every criterion verified by `npm run verify` (`check` + `lint` (incl. new guard) +
`test:all` (incl. new + existing suites) + `build`).

## 8. Ordered task list (TDD)

1. **RED — guard self-test.** Write `au10-plugin-config-ownership-guard.ts` with `inspect()` + `--fixtures`. Run `--fixtures`: must correctly catch the fixture leak and pass the clean fixture. (Guard proves itself before guarding real code.)
2. **RED — consistency + catalog-validation tests.** Write `builtin-tool-catalog-consistency.test.ts` and the catalog-validation assertion referencing `BUILTIN_TOOL_CATALOG` (does not exist yet → red / compile-fail).
3. **RED — projection + override tests.** Add the AC2 builtin-provenance assertion and the VS2 override-survives-reseed case. Red against current import.
4. **GREEN — create `builtin-tool-catalog.ts`.** Author `BUILTIN_TOOL_CATALOG` entries mirroring current `ALL_TOOL_DEFINITIONS` metadata. Consistency + validation tests go green.
5. **GREEN — rewire `plugin-configuration.ts`.** Swap import (line 26) + loop source (477–488). Projection/override/existing suites go green; `defaultVersionHash` unchanged.
6. **GREEN — wire the guard into `npm run lint`** (`--check`). Run guard against the real tree: `plugin-configuration.ts` now passes (no runtime import).
7. **VERIFY.** `npm run check && npm run lint && npm run test:all` green; then full `npm run verify`. Capture output as proof.

## 9. Trade-offs & open questions

- **Manifest + consistency-test vs full inversion.** Full inversion (metadata lives *only* in the catalog; each handler module imports its own metadata from the catalog) removes duplication entirely but touches ~20 tool files — over budget for M/2d and higher regression risk. Chosen: a pure-data catalog + a runtime consistency test that makes drift un-shippable. Duplication cost is ~4 fields × ~20 tools, fully gated. Full inversion is a clean follow-up if the catalog proves painful.
- **Catalog location: `server/src/config/` vs `@hyperidle/shared`.** Tool names/roles are server-specific; putting it in shared would export server capability data into the type package for no consumer. Server `config/` keeps it next to `server-config.ts` and lets the guard scope stay in `packages/server/src`.
- **Guard set membership.** Kept tight (3 files) to avoid false positives. `agent-defaults/resolvers.ts` legitimately imports `app-runtime` execution and is AU11's territory, so it is deliberately excluded. If the reviewer wants the guard to also cover `server-config.ts`/`team-default-harness.ts`, both are clean today so adding them is a free ratchet — but they are app/runtime config, not plugin/default capability config, so they are left out by default.
