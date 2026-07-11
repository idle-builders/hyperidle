# AU10 Architecture Critique — Round 1

**Verdict: PASS. Score 8.5/9.** 0 CRITICAL, 1 WARNING (carried from refine, resolved by guidance), 2 NOTES. No planner loop required.

## Dependency-inversion soundness
The core move — replace `plugin-configuration → tool-registry` (config→execution, forbidden) with `tool-registry → builtin-tool-catalog` (execution→config-data, allowed), both depending *down* onto pure data — is the correct textbook inversion and matches the should-graph "Tool Catalog: core + plugin tool definitions" row and Boundary Check "Plugins seed typed config defaults only." Byte-stability discipline (`?? null` preserved so `defaultValueJson`/`defaultVersionHash` are byte-identical → override linkage stable, AC4) is exactly right and is backed by the mandatory consistency test. Verified against source: the `:477-488` loop reads only the four fields the catalog carries, so the loop body is genuinely unchanged.

## Should-graph classification (§3) — accurate
Each row lands in the right owner; the classification table + guard together constitute the AC6 should-graph audit groundwork the Phase-4 reviewer needs (reviewer runs guard `--check` + reads §3). Adequate; nothing separate required.

## Guard scope vs AU8 — justified, not scope creep
AC1 requires a static enforcement mechanism and AC6 a mechanical audit; AU10 must ship *some* static gate. A plain `no-restricted-imports` ESLint rule catches only the DIRECT import — but the anti-pattern is precisely transitive execution-graph drag (VS3 fixture (c): config→wrapper→provisioning). Transitive detection needs the AST reachability walk. The narrow 3-file guard is the minimal thing that satisfies AC1+AC6 now; the "first tile AU8 generalizes" framing is correct. Keep it.

## TDD split — defensible per testing.md
Static AC1 → guard (lint, not a test). Runtime ACs → real import-based tests: consistency test imports both and asserts (genuine unit); AC2 via real-DB projection integration; AC5 via validator. RED (tasks 1-3: guard self-test, catalog-referencing tests compile-fail, projection/override red) precedes GREEN (4-6). No implementation authored in the red phase. Sound.

## WARNING (W1 — carried, builder-actionable, no rewrite)
See refine-critique W1: `validateConfigurationValue` is not exported (`plugin-configuration.ts:184`). §4 file-8 / §7 AC5 artifact must either export it or (preferred) prove AC5 by seeding the catalog through `loadBuiltInConfigurationDefaults` (validator runs at `:222`). Architecture-neutral.

## NOTE (N1 — guard reachability semantics ≠ au9's)
§5 says "reuse au9's `Unit`/`reaches` machinery." au9's `reaches`/`symbolReaches` is **symbol-call-oriented** (does an exported symbol transitively *call* a forbidden symbol like `provisionSession`). AU10 needs **module-import reachability** (does a config-source file transitively *import* any module whose basename/path is forbidden) — a simpler graph walk over `localModule` edges. Reuse au9's parsing/`Unit` scaffolding and the `moduleBase`/`localModule` helpers, but do NOT copy the call-graph `visit`/`forbiddenSymbols` logic — the predicate is "reached module path ∈ forbidden set," not "reached symbol is called." Builder should not over-engineer a call-graph.

## NOTE (N2 — real-tree RED is a free bonus)
Because `agent-behavior-config.ts` transitively imports `plugin-configuration.ts`, running the guard against the real tree BEFORE the rewire would flag BOTH files (transitive `tool-registry` reach) — a real-tree red proof beyond the `--fixtures` self-check. Optional but cheap; worth capturing as the VS3 real-code demonstration.

## Trade-off (catalog + consistency test vs full 20-file inversion)
Correctly chosen: duplication (~4 fields × ~24 tools) fully gated by the un-shippable-drift consistency test; full per-handler inversion is over budget for M and higher-risk. Right call.
