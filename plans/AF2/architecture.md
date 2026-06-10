# AF2 — Type-green the shared foundation: architecture plan

Mechanical type-fixing across seven packages to zero own-errors under the AF1 gate, then drain each from `typecheck-debt.json`. Value is the **policy + categorization + ordering**, not prose. Tooling-only; no runtime behavior change except guarded fixes for genuine possibly-undefined bugs.

## Scope (gate-accurate own-error counts, measured 2026-06-10)

| Package | Own errors | Owner in debt.json |
|---|---|---|
| shared | 155 | AF2 (fix FIRST) |
| eslint-plugin-design | 72 | AF2 |
| eval | 20 | AF2 |
| design-system | 23 | AF2 |
| pipeline | 11 | AF2 |
| desktop | 3 | AF2 |
| db | 2 | AF2 |

Counts match `typecheck-debt.json` exactly. The spec's larger figures (shared ~286 etc.) predate AF1 drains — debt.json is the live truth. Gate-accurate = `tsc --noEmit -p packages/<pkg>/tsconfig.json` filtered of reference-noise codes TS6305/TS6307/TS6059 (the gate filters these; raw `tsc` overcounts).

## Error taxonomy (the real shape — NOT mostly test-strictness)

The spec framed the bulk as `noUncheckedIndexedAccess` test-strictness. **Measurement contradicts this.** Actual distribution:

| Category | Count | Where | Fix kind |
|---|---|---|---|
| **A. Config: node types missing** (`TS2591 node:*`, `TS2552 process`) | 19 | shared 7, eslint-plugin-design 12 | tsconfig `"types": ["node"]` — one-line config, clears clusters |
| **B. Config: JSX in test fixtures** (`TS17004/TS7026/TS2503`) | 30 | eslint-plugin-design test-fixtures | tsconfig `jsx` + JSX namespace |
| **C. Test-file index-access** (`TS2532/TS18048` in `*.test`/`__tests__`) | 99 | shared 91, pipeline 8 | **the policy decision below** |
| **D. Src index-access** (`TS2532/TS18048` in src) | 36 | shared 30, eslint-plugin-design 4, pipeline 1, design-system 1 | guarded fixes (genuine possibly-undefined) |
| **E. Genuine signature/type bugs** | ~75 | all packages | targeted per-site fixes |

Categories A+B (49 errors) are pure config and disappear with two tsconfig edits. Category C (99) is the policy question. D+E (~111) are real per-site work.

---

## 1. THE BINDING DECISION — test-file index-access policy

**Decision: (a) FIX every call site. Do NOT relax `noUncheckedIndexedAccess` anywhere — not even for tests.**

Binding on AF3, AF4, AF5. Recorded here as the single source of truth.

### Why — design-it-twice

**Option A — fix call sites (CHOSEN).** Guard, destructure, or non-null-assert each test-file `arr[0].foo`. In test files, a non-null assertion (`arr[0]!.foo`) or `expect(x).toBeDefined()` narrowing is acceptable and idiomatic — a test asserting on `arr[0]` *wants* to fail loudly if the element is missing, which is exactly what the assertion documents.
- Trade-off: ~99 mechanical edits in shared+pipeline. Bounded, one-time.
- Reject reason: tedium. But tedium is cheap and one-time; the volume is 99, not thousands.

**Option B — relax `noUncheckedIndexedAccess` for test files only.** Requires a per-package `tsconfig.test.json` that overrides the flag.
- Trade-off: the AF1 gate invokes exactly `packages/<pkg>/tsconfig.json` and nothing else (see `scripts/typecheck-gate.ts` `runPackage`). Tests live **under `src/`** and are caught by the same `include: ["src"]` glob the gate compiles. To relax only tests you must either (1) split tests into a separate config the gate does **not** run — which means **tests stop being type-checked entirely** (a regression: real test bugs like the eval `teamMembersId` mismatch would go unseen), or (2) make the gate run two configs per package and merge verdicts — a change to the AF1 gate, which the task forbids.
- Reject reason: every viable form of B either stops type-checking tests or modifies the frozen gate. Both unacceptable.

### The deciding facts
1. **Volume is small and concentrated.** 99 errors, all in shared (91) + pipeline (8). Five of seven packages have **zero** test index-access errors. This is not a monorepo-wide tax worth a config carve-out.
2. **Gate shape forbids clean test-only relaxation.** Tests are inside the gate's single compilation unit. There is no test-config the gate reads.
3. **AF3–AF5 inherit it.** Fabric/server have far more test index-access errors; but the same reasoning holds — relaxing means un-checking tests under the frozen gate. The cost of "fix call sites" scales linearly and stays mechanical; the cost of "un-check tests" is silent test-type rot forever.
4. **Contract alignment.** `.claude/rules/typescript.md`: "Strict mode everywhere. No `any`." Relaxing a strictness flag for a whole file class is the spirit of that prohibition even if not the letter.

### What "fix" permits (binding sub-rules for builder + AF3–AF5)
- **Test files** (`*.test.ts(x)`, `*.spec.ts`, `__tests__/`, `test-utils.ts`, `test-fixtures/`): non-null assertion `!` on indexed access is ALLOWED. Prefer narrowing (`const first = arr[0]; expect(first).toBeDefined();`) where it reads cleanly, but `arr[0]!.foo` is acceptable — the test already asserts presence.
- **Source files** (category D): non-null assertion is NOT the default. Use a real guard (early return, `if (!x) throw`, default value) — a possibly-undefined deref in src is a genuine bug class. A `!` in src is permitted ONLY where an invariant makes it provably safe and a comment states why.
- **Never** `any`, `@ts-ignore`, `@ts-expect-error`, or `as unknown as T` to silence index-access. Forbidden by contract.

---

## 2. Two config fixes (do these FIRST — they clear 49 errors mechanically)

### 2a. shared — add node types
`packages/shared/src/net/ssrf.ts` and `derive-blocks.ts` use `node:dns/net/util` and `process`. shared's tsconfig sets no `types`, so node globals are absent (TS2591/TS2552). `@types/node` is already installed at the root.
- Edit `packages/shared/tsconfig.json` → add `"types": ["node"]` to `compilerOptions`.
- Clears 7 errors. `derive-blocks.ts` already guards `process` with `typeof process !== "undefined"` — config fix alone makes it type-check; no code change.
- ⚠️ Verify shared genuinely depends on node at runtime (ssrf does — it's server-side). It does; shared is consumed by server/fabric, not only web. Adding `node` types does not pull node into the web bundle (types are erased). Safe.

### 2b. eslint-plugin-design — node types + JSX for fixtures
- 12 node-types errors in `src/**/__tests__` (`node:fs/path/url`) → add `"types": ["node"]`.
- 30 JSX errors in `test-fixtures/*.tsx` (`JSX.Element`, `JSX.IntrinsicElements`, `--jsx` flag) → the tsconfig has no `jsx` setting. Add `"jsx": "react-jsx"` (matches pipeline's choice) and provide a JSX namespace. Fixtures use `JSX.Element` with no React dep in the package.
  - Preferred: add `@types/react` as a devDependency and `"jsx": "react-jsx"` — fixtures are JSX-syntax test inputs for the ESLint rules, so they need a JSX-aware type env. Confirm `@types/react` resolves from the root (web has it). If adding a dep is undesirable for a lint-plugin package, the fallback is a one-line ambient `declare namespace JSX { interface IntrinsicElements { [k: string]: unknown } interface Element {} }` in a `test-fixtures/jsx-shim.d.ts` plus `"jsx": "preserve"`. Builder picks the lighter option that compiles; **prefer the shim** to avoid a runtime-irrelevant React dep on a lint package.
- Clears ~42 of eslint-plugin-design's 72.

After 2a+2b, re-measure shared and eslint-plugin-design before touching call sites.

---

## 3. Per-package fix strategy + ordering

**Order: shared FIRST** (everything imports it). design-system, eval, pipeline, desktop, db import shared types; fixing shared's exported signatures may auto-resolve downstream errors. **Re-measure every package after shared lands** before estimating remaining work.

**Magnitude note:** this fix-all (no-suppress) policy propagates to AF3–AF5, where server alone carries ~3780 errors. The per-error cost is real and accepted — AF2 sets the pattern the larger packages inherit.

### shared (155 → 0) — FIRST, gates all others
- **Config (2a):** `types: ["node"]` → −7.
- **`agent-roles.ts:9` TS2304 `AgentCategory`:** line 1 is `export { ... type AgentCategory } from "./types.js"` — a re-export does not bind the name locally for use in the same file. Fix: add a real `import type { AgentCategory } from "./types.js"` alongside the re-export. Genuine bug (category E).
- **`event-bus.ts:106` TS2352:** `EventHandler<union>` → `EventHandler<T>` cast neither overlaps. Investigate the handler-map typing; fix the generic, do NOT cast through `unknown`. If it needs a mapped-type lookup, tighten it. (E)
- **`ssrf.ts`:** `b`/`a` possibly-undefined (D, guard), and `:90` TS2345 `string | undefined` → `string` (E — guard or narrow the split result). These are security-path; guarded fixes only, no behavior change.
- **`blocks/derive-blocks.ts` + `derive-payloads.ts`:** `img`/object possibly-undefined (D). These are production parsing paths — guard with early-return or default, do not `!`. Verify each guard preserves current output (the golden-ids snapshot test is the proof).
- **Test files (91, category C):** apply policy — narrow or `!`. Bulk-mechanical. `artifact-types.test.ts` TS2344 and `agent-roles.test.ts` TS2322 are test-type mismatches (the type-level test util) — fix the test's expected type, do not loosen the exported type.
- **toon-codec:** shared's TOON codec errors fall under the same per-package policy above (the spec names toon-codec explicitly) — test-file index-access → policy (C); any src narrowing → genuine (E). No separate strategy needed.
- Drain shared from debt.json once `tsc -p packages/shared/tsconfig.json` is clean.

### db (2 → 0)
- `test-utils.ts:169` TS2345 `HyperIdleDb` vs `PgliteDatabase<schema>`: the test util passes the union DB type where a pglite-specific type is required. Narrow the parameter type or the call to the correct branch. Genuine — do not `as`. (E)
- `seed.integration.test.ts:13` TS6133 unused `FACILITATOR_ROLES`: remove the unused import. (trivial)

### design-system (23 → 0)
- Mostly src (19) + 4 test. No node/JSX config issue (already a JSX package).
- `inline.tsx:9`, `render-payload.tsx:23` TS2366 "lacks ending return": add the missing return / exhaustive default. (E)
- `BetCard.tsx:185` TS2345 `BadgeVariant | undefined`: narrow/guard the variant before passing. (E)
- `BetCard.tsx:125` TS6133 unused `team`: remove or use. (trivial)
- `CommentRow.tsx` TS7006 implicit-any params (`seg`, `i`, `payload`): add explicit param types from the mapped element type. (E)
- `__tests__/*.test.tsx` TS2769 no-overload (4): fix the test render call args. (C-adjacent, real)

### desktop (3 → 0)
- `app-menu.ts:105` TS2345 `MenuTemplate[]` vs Electron `MenuItemConstructorOptions[]`: align the local `MenuTemplate` type to Electron's expected shape, or map. (E)
- `credential-validator.ts:41` TS2322 `CredentialName` not assignable to `never` + TS6133 `_exhaustive`: the exhaustive switch is non-exhaustive — a `CredentialName` member is unhandled. **Genuine bug:** add the missing case (the `_exhaustive` never-check is correctly catching a real gap). Investigate which credential is unhandled; this may be a behavior-relevant fix — if adding the case changes runtime, note it but the case is required for correctness. (E)

### eslint-plugin-design (72 → 0)
- **Config (2b):** node types + JSX shim → −42.
- `rules/*.ts` TS2551 `getFilename`: **delete the dead fallback.** All 7 sites already read `const filename = context.filename ?? context.getFilename();` — verified against `@typescript-eslint/utils@8.60.0`: `filename` exists and `getFilename()` is deprecated and absent from the in-scope `RuleContext` (that absence is the actual TS2551 error). Fix = drop the `?? context.getFilename()` tail, leaving `const filename = context.filename;`. Mechanical, 7 sites. (E)
- `no-mock-data-symbol.ts:159` TS2352 `VariableDeclarator[]` → `AnyNode[]` cast: fix the node-type narrowing, no `unknown`. (E)
- `no-ai-aesthetic.ts` TS2532/TS7006: guard + type the `node` params. (D + E)
- Remaining test `node:*` covered by config fix.

### eval (20 → 0)
- `scenarios/session.ts` ×3 TS2353 `teamMembersId` not in `ScenarioSeedResult`: **genuine** — either the seed result type is missing the field (add it) or the scenario references a wrong field name. Investigate `ScenarioSeedResult`; if scenarios legitimately produce `teamMembersId`, add it to the type (tightening, allowed). Do not cast. (E)
- 17× TS7006 implicit-any params (`t`, `m`, `i`, `c`, `l`) in `scenarios/*.ts`: add explicit param types from the array element type. Mechanical but real. (E)

### pipeline (11 → 0)
- 8 test-file index-access (`otel.test.ts`, `runner-otel.test.ts`) → policy (C): narrow/`!`.
- `runner-otel.test.ts` TS2352 ×2 SystemMessage cast: the test constructs a message object cast to `SystemMessage` that doesn't overlap (a field type mismatch — `task_type: string | undefined`). Fix the test fixture to match `SystemMessage`, or fix the type if the field is genuinely optional. (E)
- `skill-frontmatter.ts:17` TS18048 `body` possibly-undefined (src, D): guard. (E)

---

## 4. Debt-list drain procedure (single source of truth)

`typecheck-debt.json` is the only source of truth. The AF1 stale-ratchet (`scripts/lib/typecheck-verdict.ts` `staleExcepted`) **forces** removal: a package on the list with zero own-errors makes the gate FAIL. So the drain is not optional bookkeeping — it is gate-enforced.

Procedure, per package, in the same commit that clears it:
1. Confirm clean: `npx tsc --noEmit -p packages/<pkg>/tsconfig.json 2>&1 | grep -E "packages/<pkg>/.*error TS" | grep -vE "error (TS6305|TS6307|TS6059)"` → empty.
2. Delete the package's entry from `typecheck-debt.json`:
   `jq 'del(.packages["<pkg>"])' typecheck-debt.json > tmp && mv tmp typecheck-debt.json`
3. Run `npm run check` — the package now appears as PASS (not QUARANTINED, not STALE).

Drain incrementally as each package clears (don't batch all seven into one final delete — a per-package commit keeps the diff reviewable and the gate green at each step). After all seven, `typecheck-debt.json` retains only fabric/server/web (AF3/AF4/AF5).

**Ordering constraint:** shared must clear and drain before re-measuring the rest, because shared's signature fixes may change downstream counts. db/design-system/eval/pipeline/desktop/eslint-plugin-design can be drained in any order after shared.

---

## 5. Ordered task list (builder executes)

1. **shared config:** add `"types": ["node"]` to `packages/shared/tsconfig.json`. Re-measure shared.
2. **shared genuine bugs:** `agent-roles.ts` import, `event-bus.ts` generic, `ssrf.ts` guards+narrow, `derive-blocks.ts`/`derive-payloads.ts` guards. Verify golden-ids snapshot test still passes (proves no behavior change).
3. **shared test files:** apply index-access policy (narrow/`!`) across `src/__tests__/**`. Fix `artifact-types`/`agent-roles` test-type mismatches at the test side.
4. **shared → zero.** Drain shared from debt.json. `npm run check` shows shared PASS.
5. **Re-measure all remaining six** against the now-green shared. Record any auto-resolved errors.
6. **db:** fix `test-utils.ts` param type + remove unused import → 0 → drain.
7. **desktop:** fix menu template type + add missing credential case → 0 → drain.
8. **pipeline:** test index-access (policy) + SystemMessage fixtures + `skill-frontmatter` guard → 0 → drain.
9. **eval:** `ScenarioSeedResult.teamMembersId` + explicit param types → 0 → drain.
10. **design-system:** missing returns + variant guards + CommentRow param types + test overloads + unused → 0 → drain.
11. **eslint-plugin-design config:** node types + JSX (prefer ambient `jsx-shim.d.ts` + `"jsx": "preserve"` over a React dep). Re-measure.
12. **eslint-plugin-design:** `getFilename`→`filename` (verify API first), node-type narrowing, `node` param types → 0 → drain.
13. **Final:** `npm run check` (all seven PASS, only fabric/server/web quarantined) + `npm run lint` + `npm run test` + `npm run test:integration` (db/eval/pipeline have integration tests — confirm green; type fixes must not break runtime) → `npm run verify`.

Each of steps 4,6–12 is its own commit (per-package, drain included). Verify gate green after every drain.

## 6. Contracts (restated — binding)

- **No `any`, no `@ts-ignore`/`@ts-expect-error`, no `as unknown as T`** as a convenience fix. Tighten types; don't erase them.
- **No exported signature loosened** to `any`/`unknown` to silence a caller. Where a test exposes a wrong exported type (e.g. `artifact-types.test.ts`), fix the test's expectation, not the export — UNLESS the export is genuinely wrong, in which case tighten it.
- **No runtime behavior change** except guarded fixes for genuine possibly-undefined dereferences (category D) and the desktop missing-credential-case (genuine correctness). Each behavior-touching fix is called out above; the golden-ids snapshot + existing unit/integration tests are the proof of no regression.
- **Tooling-only workpackage.** No new features, no new runtime code paths.
- **Frozen:** do not modify `scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts`, or the gate's invocation. AF1 owns the gate.
- **Test-strictness policy (binding on AF3–AF5):** fix call sites; never relax `noUncheckedIndexedAccess`. `!` allowed in test files, guarded fixes in src.

## Acceptance criteria → verification

| AC | Verification |
|---|---|
| All seven packages compile with zero own-errors | `npm run check` → each shows PASS in the summary table (not QUARANTINED/STALE/FAIL) |
| All seven removed from debt.json | `jq '.packages \| keys' typecheck-debt.json` → only `fabric`, `server`, `web` remain |
| No exported signature loosened to any/unknown | grep diff for new `any`/`@ts-ignore`/`as unknown` in changed files = none; `npm run lint` (no-explicit-any rule) green |
| Single documented test-strictness policy, applied consistently | This doc §1; builder applies uniformly; AF3–AF5 cite it |
| `npm run verify` passes | run it; green end-to-end |
| Adding a type error to a cleared package fails the gate | regression: inject `const x: string = 123` into e.g. `packages/db/src/index.ts`, `npm run check` → FAIL naming db (db no longer quarantined) |
| No runtime regression from guarded fixes | `npm run test` + `npm run test:integration` green; golden-ids snapshot unchanged |

## Risks / ambiguities

- **eslint-plugin-design `getFilename`→`filename`** is version-dependent. ⚠️ UNVERIFIED — builder must confirm against the resolved `@typescript-eslint/utils` `RuleContext` type before bulk-replacing. If `filename` isn't on the typed context, the real fix differs.
- **eslint-plugin-design JSX env:** prefer ambient shim over a React devDep on a lint package. Either compiles; shim keeps the dependency graph honest.
- **shared `event-bus.ts` generic cast** may need real mapped-type work, not a one-liner. Budget for it; do not fall back to `unknown`.
- **desktop missing credential case** is a genuine correctness gap the never-check caught — the added case may have runtime meaning. Flagged; correct handling required, not suppression.
- **Re-measure after shared** is mandatory — downstream counts (design-system/eval) may drop once shared exports are sound.

## Required reading (builder)
- `scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts` — gate mechanics (read-only; do not modify).
- `typecheck-debt.json` — drain target.
- `.claude/rules/typescript.md` — strict-mode contract.
- `packages/shared/src/{agent-roles.ts,event-bus.ts,net/ssrf.ts,blocks/derive-blocks.ts,blocks/derive-payloads.ts}` — shared genuine bugs.
- This plan §1 (policy) — binding on AF3–AF5.

## sharedFiles
- `typecheck-debt.json` — also drained by AF3/AF4/AF5. AF2 removes only its seven entries; merge order matters if AF3–AF5 run concurrently (they should not — they depend on AF2).
- `packages/shared/tsconfig.json`, `packages/eslint-plugin-design/tsconfig.json` — config edits.
- `packages/shared/src/index.ts` and exported type modules — signature-touching; AF3–AF5 import these.

## protectedTests
- `packages/shared/src/__tests__/blocks/golden-ids.test.ts` — snapshot proof that derive-blocks guard fixes change no output. Assertions must not change.
- All existing `*.test.ts(x)` assertions: index-access policy edits may add `!`/narrowing but MUST NOT change what is asserted.

## Security & abuse cases
- N/A for most — tooling/type workpackage, no new routes, inputs, or credentials.
- `ssrf.ts` is touched (guarded undefined fixes). The fixes must preserve the SSRF blocklist semantics exactly — a guard that changes which URLs are rejected is a security regression. Verify against `ssrf` unit tests; the guard adds presence checks only, never widens what passes. Applicable + addressed (preserve behavior, tests prove).

## route-checklist
- N/A — no routes.

## Migrations
- N/A — no symbol renames/moves. `typecheck-debt.json` entry deletions are the only "migration"; procedure in §4.
