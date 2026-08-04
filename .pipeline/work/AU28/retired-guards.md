# Retired guards — the record

**Every guard in the repo was deleted in AU28 (2026-08-04) under Ruling 10: clean slate.** The new
architectural governance is being built from first principles, starting with the
production/development split guard. Nothing here carries authority — this file exists so that when a
new rule is written we can check whether an old guard was covering something we have since lost.

**How to use this file:** when designing a new rule, scan the *Rule* column for anything the new set
does not cover, then decide deliberately whether it should. Do **not** treat a row as a rule to
reinstate. Ruling 10: *"you have to assume that all explicit or implicit rules in the past are
wrong."*

State at deletion: **all guards passed.** Two were structurally incapable of failing. Seven pairs
of them contradicted each other (§3).

**Correction applied at deletion time (2026-08-04):** §1 lists **16** guards, not 17 — the 17th was
`token-resolution-guard.ts`, which is in `verify`, not `lint`, and is listed in §2.

---

## 1. Guards in the `npm run lint` chain

| Guard | Rule it enforced | Why it went |
|---|---|---|
| `ag7-no-divergent-classes.ts` | 11 hardcoded settings files may not use literal `gap-4` / `text-sm` etc. | A one-off settings-consistency sweep frozen as a permanent check. |
| `honest-harness-guard.ts` | Harness-facing tests must use the real binary via `requireHarness`, never a stub; no raw caller imports. Shrink-only allowlist. | AR1. Rule may deserve re-derivation — see §2 signal 9 (ratchet) and the two-archetype testing rule. |
| `test-naming-guard.ts` | Test names may not contain work-package ids. ~300-entry legacy allowlist. | Cosmetic hygiene. |
| `au3-runtime-vocab-guard.ts` | Bans retired `strategy` / `fabric` vocabulary. | Guards vocabulary of packages deleted two tracks ago. Roots include the dissolved `packages/server`. |
| `au6-agent-boundary-guard.ts` | Agent-boundary rules scoped to files in `packages/server/src`. | **Structurally incapable of failing** — `SOURCE_ROOTS = ["packages/server/src"]`, a directory that no longer exists; `existsSync` guard returns `[]`. Printed `PASS` over zero files, 7th in the chain. |
| `au7-runtime-retirement-guard.ts` | Prevents re-introducing `packages/fabric`, `packages/strategy-minimal`, `strategy-port.ts`, `strategy-registry.ts`. | Zero hits; 2 of 6 scan roots dead. Nobody re-adds a package deleted two tracks ago. |
| `au9-direct-handoff-guard.ts` | Direct-handoff rules over `packages/server/src`. | **Structurally incapable of failing** — same dead root as au6. All 8 allowlist entries point at moved/deleted files. |
| `au18-kv-shape-guard.ts` | Forbids one exact `{key,value}` KV column shape. | 228 lines; its own docblock concedes `{id,data}` or `{slug,payload}` slip through. Guarded table already retired. |
| `table-ownership-guard.ts` | One owning Service per table; blocks foreign reads/writes, wildcard re-export, and `import * as db` namespace evasion. Load-time disjointness assertion. | **Signal-bearing.** Ruling 6 supersedes its `UNOWNED_SHARED_TABLES` exemption. Scan scope covered only nested Services + `core-api/src`, leaving 57 violations invisible. |
| `execution-boundary-guard.ts` | Only `agent-execution` may import a raw LLM/MCP SDK or `child_process`-spawn a harness CLI. | **Signal-bearing.** Its prose banned raw SDKs everywhere; `SCAN_LAYERS` excluded `eval`, so `eval/src/judges.ts:502`'s `@anthropic-ai/sdk` import was never flagged. |
| `composition-boundary-guard.ts` | Service isolation: a Service may declare only `{db, shared}`; Layer packages deliberately not scanned. | Directly contradicts Rulings 1 and 3 (§3). Still allow-listed `@hyperidle/server`. |
| `composition-edge-anti-regrowth-guard.ts` | `agent-orchestration → core-api` raw-port and hidden-composition edges must stay at zero. | **Signal-bearing.** AU21 Increment 14e deleted its exemption apparatus outright rather than emptying it — that deletion is signal 9. |
| `demo-fixture-guard.ts` | 4 forbidden importer paths for the demo fixture in `packages/db/src`. | 236 lines for a 5-path rule; 2 dead allowlist rows. |
| `harness-vocab-guard.ts` | Bans AK1-purged words (`soul`, `materializ`, `composePrompt`, `workspacePath`). | Only surviving hits repo-wide are inside the guard's own fixtures. |
| `ah5-no-mock-guard.ts` | No mocks in one AH5 proof spec. | Scans **1** file. |
| `ah6-no-mock-guard.ts` | No mocks in one AH6 spec; bans 2 literals from a deleted probe. | Scans **1** file plus 1,878 for two dead strings. |

## 2. Guards / tools outside the `lint` chain

| Script | Purpose | Note |
|---|---|---|
| `layer-boundary-scan.ts` | AST cross-Layer import scanner; roles from `package.json` name; hard-throws on an unclassified package. | **618 lines, unwired, and the best detection technique in the repo** — mine before deleting (§2 of the audit). |
| `generate-dependency-graph.ts` | As-is dependency graph (ports, EventBus, hidden composition bundles). | **Not standalone-dead**: imported by `composition-edge-anti-regrowth-guard`, `layer-boundary-scan`, and **5 anti-regrowth tests** in `packages/core-api/src/__tests__/`. Those tests go with it. |
| `token-resolution-guard.ts` | Design-token resolution; runs in `verify`, not `lint`. | The only design check still live on `packages/web`. |
| `mock-inventory.ts` | Mock-data inventory. | |
| `test-coverage-check.ts`, `ah6-generate-cassette-keys.ts`, `fix-u1-test-schema.py`, `fix-u1-test-schema-v2.py` | Unreferenced anywhere. | Free deletions. |
| `surface-census.ts`, `scaffold-service.ts`, `check-version-sync.ts` | No code importers; referenced only from `plans/` and `docs/deployment/releases.md`. | |

**Kept — not guards:** `verify-attest.ts`, `check-attestation.ts`, `typecheck-gate.ts`, `obs.ts`,
`trace-collector.ts`, `validation-composition.ts` (imported by a web test), `mock-inventory.ts`,
`ah6-smoke-local.ts`, `knip-production-test-files.mjs`, `typecheck-debt.schema.json`,
`scripts/lib/*`.

`scripts/lib/honest-harness-predicate.ts` is **kept** despite `honest-harness-guard.ts` going: it is
also imported by `verify-attest.ts` and `check-attestation.ts` (the attestation agentic floor), which
survive. Its unit test `packages/db/src/__tests__/ar1-harness-predicate.test.ts` survives with it.

## 2.1 What else went with the scripts (recorded at deletion, 2026-08-04)

**Ten tests deleted** — every test whose subject was a deleted guard. Under Ruling 10 these encode
inherited rules with no authority; they go with their library rather than being re-pointed.

| Test | Imported |
|---|---|
| `core-api/src/__tests__/context-assembly-anti-regrowth.test.ts` | `generate-dependency-graph` |
| `core-api/src/__tests__/run-orchestration-filesystems-edge-closed.test.ts` | both dep-graph + anti-regrowth |
| `core-api/src/__tests__/run-orchestration-settings-routine-anti-regrowth.test.ts` | `generate-dependency-graph` |
| `core-api/src/__tests__/run-orchestration-users-edge-closed.test.ts` | both dep-graph + anti-regrowth |
| `core-api/src/__tests__/work-composition-anti-regrowth.test.ts` | `generate-dependency-graph` |
| `db/src/__tests__/AF17-demo-fixture-guard.test.ts` | `demo-fixture-guard` |
| `db/src/__tests__/AI1-token-resolution-guard.test.ts` | `token-resolution-guard` |
| `db/src/__tests__/AK1-harness-vocab-guard.test.ts` | `harness-vocab-guard` |
| `db/src/__tests__/ar1-honest-harness-guard.test.ts` | `honest-harness-guard` |
| `db/src/__tests__/ar2-coverage-guard.test.ts` | `honest-harness-guard` |

The first five are AU21's zero-edge end state; the record's §2 note that "those tests go with it" was
right about the count (5) and the location. The other five were **not** in the record and are the
correction it needed.

**Four allowlist JSONs deleted:** `honest-harness-guard.allowlist.json`,
`test-naming-guard.allowlist.json`, `coverage-debt.allowlist.json`, `model-import-debt.allowlist.json`.

**`package.json` unwiring.** `lint` collapsed to `biome check . --reporter=summary && npx eslint .
--quiet` (18 guard invocations removed). `verify` lost `demo-fixture-guard:check`,
`token-guard:check`, `harness-vocab-guard:check`, `ah5-mock-guard:check`, `ah6-mock-guard:check`.
Eight now-dead script aliases removed (`check:ag7-consistency`, the three `honest-harness-guard*`
entries, and the five just named). `mock-inventory:check` stays in `verify` — it is an inventory, not
a guard.

**Two live doc references corrected** (they named deleted scripts as active enforcement):
`CLAUDE.md`'s harness-test paragraph (dropped "the `honest-harness-guard` lint check") and
`packages/design-system/DESIGN.md:315` (token resolution is now stated as *not* machine-checked).

**Coverage genuinely lost, and named as lost:** design-token resolution
(`token-resolution-guard`), the harness-honesty static check (`honest-harness-guard` — the
attestation floor still runs), table-ownership ACLs, the execution boundary, service composition
isolation, AU21's zero-edge anti-regrowth, and the demo-fixture import allowlist. Ruling 10 is
explicit that none of these is inherited; each must be re-derived if it belongs in the new set.

---

## 3. Contradictions found at deletion time

Evidence that the inherited set was never one coherent rule system:

1. **Two guards in the same chain disagree about `@hyperidle/db`.** `composition-boundary-guard:61`'s `ALLOWED_HYPERIDLE` grants *every* Service a blanket right to import `db`; `table-ownership-guard` says only the owning Service may touch a table. They ran back-to-back.
2. **`UNOWNED_SHARED_TABLES` vs Ruling 6.** Exempted 4 tables because many Services touch them; Ruling 6 says that *is* the violation.
3. **`composition-boundary-guard` vs Ruling 1.** `CORE_UI_ALLOWED_HYPERIDLE` permitted `packages/web/src` → `@hyperidle/core-api`, a cross-Layer import. Also still listed `@hyperidle/server`.
4. **All 17 violate Ruling 5** — every one derives scope and role from directory paths.
5. **`execution-boundary-guard`'s prose ≠ its enforcement** — banned raw LLM SDKs "never Anthropic, never OpenAI" while excluding `eval` from its scan.
6. **`table-ownership-guard` claimed a completeness it lacked** — 39 owner rows against 44 `pgTable` definitions + 4 declared unowned.
7. **The visual net was off for the shipping UI.** `eslint-plugin-design` rules are `error` only for `packages/design-system/src`; for `packages/web/src` they are `warn`, and `lint` runs `eslint . --quiet`, which suppresses warnings — so **zero design rules were enforced on the product's actual UI**, despite `.claude/rules/visual-regression.md` describing it as a net.

---

## 4. Signals worth considering when writing new rules

Ranked by how likely the pain is to recur. **Evidence, not authority.**

1. **A rule that scans nothing must be a build error, not a pass.** `au6` and `au9` both no-op'd. This single failure mode is what killed the old set.
2. **Declared dependencies and actual imports are different facts — check both.** Hoisting resolves any `@hyperidle/*` from anywhere regardless of `package.json`; an import can also be added without touching the manifest.
3. **Shared mutable state is a cross-Layer channel with no import.** `sessions`: 34 files, 8 areas, 3 Layers, zero imports between them. Import-graph analysis is blind to it by construction.
4. **A `Deps`-shaped interface declared in package A but composed in package B is a real edge** that port-scanning misses. AU21 found 22.
5. **A barrel that re-exports raw tables defeats any ACL behind it** — both wildcard re-export and `import * as db` namespace access.
6. **Ownership maps must be complete-by-construction or they rot.**
7. **Test/tooling code leaks through production entry points**, not through file paths — `shared/src/index.ts:333` exported `MockHarnessAdapter`; `db/src/index.ts` exported `createTestDb`.
8. **Reaching past a Layer barrel into a nested Service** is distinct from Layer→Layer and survives any "may import X" rule.
9. **Any exemption apparatus gets re-populated.** What held was *deleting the mechanism*, not emptying it.
10. **A `child_process` spawn bypasses every import-based ban.**

## 5. Detection techniques worth reusing

| Technique | Was demonstrated in | Lesson |
|---|---|---|
| `ts.isImportDeclaration` / `isExportDeclaration` + dynamic `import()`, never regex | `layer-boundary-scan.ts` | Covers multi-line, aliased, namespace, mixed type/value and re-export **by construction**. |
| Role from the package's own `package.json` name; unclassified package = **hard throw** | `layer-boundary-scan.ts` | "An unrecognized package makes noise, not silence." |
| Never *infer* who satisfies a declared interface — read what the source literally says | `layer-boundary-scan.ts` | Name-voting produced, in one session: a type-alias blind spot, 3 dead overrides, and one interface collapsing 5–7 real deps into one mis-attributed edge. |
| `--fixtures` self-test over a synthetic tree, asserting each classification *and* each evasion | `table-ownership-guard`, `execution-boundary-guard` | Proves the detector still works independently of whether the live tree is clean. **The only thing that would have caught `au6`/`au9` going no-op.** |
| Monotonic-shrink ledger, incl. `clean + still-listed → FAIL` and `path missing → FAIL` | `honest-harness-guard`, `test-naming-guard` | Self-cleaning debt; fails in both directions. |
| Load-time invariant assertion before any scan | `table-ownership-guard` | Config contradictions fail at load, not silently. |
| Pure exported `inspect(root)` separated from the CLI entry | most guards | Makes the rule unit-testable without CLI side effects. |
| Regex-blindness postmortem | `demo-fixture-guard` `@lore AF17-R2` | Original pattern matched `../demo-fixture` but not `./demo-fixture` — the form every sibling used. *"The guard was green by blindness."* |
