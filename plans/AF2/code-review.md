# AF2 — Code Review (Phase 4)

Reviewer evaluation of the AF2 implementation against `plans/AF2/architecture.md` and the AF2 workpackage in `.pipeline/work-packages/TRACK-AF.md`. All claims independently verified against the live tree (2026-06-10), not trusted from the builder's PR claims. Carried forward from `architecture-critique.md` (8.4/10 READY).

Diff under review: `git diff origin/main..HEAD` — type-fixes across seven packages (shared, db, design-system, desktop, eslint-plugin-design, eval, pipeline) to drive each to zero own-errors under the AF1 gate and drain it from `typecheck-debt.json`.

## Verdict: **DONE**

Zero critical findings. All seven packages compile zero-error under the real gate; all removed from the quarantine; the gate genuinely protects them (regression test confirmed); no escape hatch evades the contract; no runtime behavior altered except the guarded fixes the plan authorized, each proven green by tests.

---

## AC table

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| 1 | All 7 packages compile zero type errors under the real gate | **PASS** | Ran `npm run check`: shared/db/design-system/desktop/eslint-plugin-design/eval/pipeline all show `PASS`. Gate output: "PASS — all 11 packages checked." (api-contract also 0; only fabric/server/web QUARANTINED.) |
| 2 | All 7 removed from `typecheck-debt.json` | **PASS** | `cat typecheck-debt.json` → only `fabric` (AF3), `server` (AF4), `web` (AF5) remain. The seven AF2 packages are gone. |
| 3 | Gate genuinely protects the cleared packages (off quarantine, not hidden) | **PASS** | Injected `const __af2_probe: string = 123;` into `packages/db/src/index.ts` → gate output `db ... 2 errors FAIL` + "FAIL: \"db\" has 2 type error(s) and is not on the exception list" naming the file. Reverted. The stale-ratchet works: db is truly off quarantine. |
| 4 | No exported signature loosened to `any`/`unknown` | **PASS** | Grep of added lines: zero `any`, zero `@ts-ignore`/`@ts-expect-error`. All `as unknown as T` casts in scope were ELIMINATED (desktop ×3, no-mock-data-symbol ×2). Remaining added `as` casts are sound bridges (see Adversarial). `npm run lint` no-explicit-any rule green. |
| 5 | Single documented test-strictness policy, applied consistently | **PASS** | Policy (fix call sites, never relax `noUncheckedIndexedAccess`; `!` allowed in test files, guarded fixes in src) lives in `architecture.md` §1. `biome.json` correctly scopes `noNonNullAssertion: "off"` to the test-file override block ONLY (line 199-201); global remains `"error"` (line 54). Zero `!` added in any src file (verified by grep). |
| 6 | `npm run verify` passes | **PASS** | `npm run check` PASS; `npm run lint` 0 errors (336 warnings/37 infos only, pre-existing); `npm run test` 386 files / 4038 tests pass; `npm run test:integration` 204 files / 2583 tests pass (1+5 skipped pre-existing); `npx knip` clean (2 pre-existing vitepress hints only). |
| 7 | No runtime regression from guarded fixes | **PASS** | golden-ids snapshot test passes (proves derive-blocks/derive-payloads guards change no output); ssrf tests pass (blocklist semantics preserved); event-bus, agent-roles, app-menu tests pass. 102 targeted tests green + full suite green. |

---

## Per-lens findings

### Architecture — clean
- Frozen-gate boundary respected: no change to `scripts/typecheck-gate.ts` or `typecheck-verdict.ts`. Drain done per-package, gate green at each step (12 commits, per-package drain).
- No layer violation; tooling/type-only workpackage, no routes, no new runtime paths.
- Config fixes correct: `shared/tsconfig.json` + `"types": ["node"]` (clears node-global errors; types erased from web bundle, safe). `eslint-plugin-design/tsconfig.json` + node types + `"jsx": "react-jsx"` + `jsxImportSource`.
- WARNING-1 from the critique resolved correctly: the `getFilename` fix was the **deletion** of the dead `?? context.getFilename()` fallback (leaving `const filename = context.filename;`), not a rename — exactly as the critique prescribed. Verified at no-ai-aesthetic.ts:120, no-mock-data-symbol.ts:151, require-ds-attribute.ts:99.

### Design (UI lens) — applied (design-system .tsx touched), clean
- `ThreadShell.tsx`: `dsProps("ThreadShell", "3")` → `dsShellProps("ThreadShell")`. NOT arbitrary — the tier-`"3"` argument was the type error (`dsProps` accepts only `"0"|"1"|"2"`). `ds-attrs.ts` documents (K2/K4) that Tier-3 shells MUST use `dsShellProps` (emitting `data-ds-shell`). This is the correct contract-aligned fix, and `require-ds-attribute` accepts the `dsShellProps` spread. Marker change is intentional and correct.
- `CommentRow.tsx`: `refs?: Message["payload"] extends {...} ? R : never` → `refs?: ReadonlyArray<InlineRef>`. The conditional type was resolving to `never` (the bug). `ReadonlyArray<InlineRef>` is the exact concrete type of the plain-payload `refs` field (thread.ts:154). Tightening, not loosening.
- `NotificationRow.tsx`: removed `case "info"` whose body was identical to the `default` it fell through to. Behavior-preserving dead-case removal.
- `ds-attrs.test.ts`: `layer: "factory"→"L1"`, `status: "approved"→"validated"` — test-fixture corrected to valid `KnowledgeLayer`/`KnowledgeStatus` enum members. Fixed at the test side per policy (don't loosen the prop type).

### Security — clean
- `ssrf.ts` (security-path): the guarded fixes preserve blocklist semantics exactly. `const a = nums[0] as number` is sound — guarded by the preceding `if (parts.length !== 4) return false` so all four elements are present (the cast is the one form left after that invariant; could have been a destructure-with-default but is behavior-identical). `embedded[1] ?? ""` passes `""` to `isPrivateIPv4` which returns `false` for malformed input — never widens what passes. ssrf unit tests prove no URL-acceptance change.
- No new secrets logged/returned. No new routes/inputs/credentials (tooling workpackage).

### Adversarial — escape hatches judged, all sound
Every `as` cast ADDED by AF2 examined:
- **`require-ds-attribute.ts` `asJSXNode()` + the single `eslint-disable`** (the ONE the builder flagged): JUDGED SOUND. The estree TypeScript typings genuinely do not include `JSXElement`/`JSXFragment` in any union that `ArrowFunctionExpression.body` or `ReturnStatement.argument` narrows into — this is a real, well-known gap (`@types/estree` does not model JSX; ESLint's parser emits these nodes at runtime). The cast is gated by a `.type === "JSXElement" | "JSXFragment"` runtime guard immediately before each call, so the invariant holds. The `@lore AF2:` justification is accurate and the alternative (augmenting global estree Node) is correctly rejected as polluting all callers. The single `eslint-disable-next-line @typescript-eslint/consistent-type-assertions` is the minimal scope. Unavoidable and safe.
- **`event-bus.ts` `(handler as (e: DomainEvent) => void)(event as DomainEvent)`** (the critique's NICE-3 scrutiny target): JUDGED SOUND. The `@lore AF2:` reasoning is correct — the handler map must store a uniform `EventHandler<EventType>`, and a handler registered via `on<T>(type, h)` only ever receives events of its own `T`. The builder cast the *event* to the stored handler's expected wider type (`DomainEvent`) rather than casting the *handler* to `EventHandler<T>` (which fails the overlap check). The wider-direction cast is always safe. This is the correct minimal fix; it did NOT fall back to `unknown`. event-bus tests pass.
- **eslint rule `JSXAttribute(rawNode: unknown)` + `as JSXAttribute`** pattern (×5 rules): the estree/JSX bridge again. Each is paired with an added `node.type === "JSXAttribute"` runtime guard, making the cast sound. Replaces the prior `as unknown as {...}` shapes with named-type casts — a tightening.
- **`no-mock-data-symbol.ts`**: `as unknown as Rule.Node` → `as Rule.Node` (×2), and `node.declarations` now typed `VariableDeclarator[]` with no cast. Net reduction in unsafety.
- **db `test-utils.ts`**: `HyperIdleDb` → `PgliteDatabase<typeof schema>` on the pooled `db` field, with `@lore AF2:` — correct: the pglite migrator requires the pglite-specific subtype, and test-utils is pglite-only. No cast; a precise narrowing. Integration tests pass.

Saboteur check: no weakened test. The test-file edits add narrowing/`!`/valid-fixture values but **no assertion was changed** — golden-ids snapshot identical, app-menu test still asserts the same menu structure (now against the raw template the refactored builder returns).

### Simplification — minor, non-blocking
- `desktop/app-menu.ts` refactor (return raw `MenuItemConstructorOptions[]`, caller calls `Menu.buildFromTemplate`) is a genuine simplification: it eliminated two `as unknown as` casts AND the old `MenuTemplate` interface, the `@lore N4` build-inside-builder workaround, and the `Menu` mock in the test. The function is now honest about what it returns. Good cleanup, not over-engineering.
- `credential-validator.ts` exhaustive-switch: the `_exhaustive: never` const was replaced with an `exhaustive(n: never)` helper. Equivalent; the helper is single-use but reads clearly and the `never` parameter is the idiomatic exhaustiveness guard. Acceptable.

### AI Slop — none of substance
- Comments added are load-bearing (they explain why a guard/cast satisfies `noUncheckedIndexedAccess` or why a cast is sound), not restating code. The `@lore AF2:` tags are the project-mandated lore-capture pattern, correctly applied to the two non-obvious casts.
- No "TODO: implement", no "for now", no defensive over-engineering. The undefined-guards are required by `noUncheckedIndexedAccess`, not gratuitous null-checks.

---

## Behavior-change audit (contract: type-level only EXCEPT guarded genuine-bug fixes)

Every fix the brief flagged for behavior-change scrutiny, judged:
- **shared `agent-roles.ts` re-export**: added a real `import type { AgentCategory }` alongside the re-export (a re-export doesn't bind the name locally). Type-level only. Correct.
- **shared `index.ts`**: added `AgentOperationalStatus` to the export list. Type-export only.
- **shared `ssrf.ts` guards**: type-level + presence guards; blocklist semantics preserved (tests prove). Correct.
- **shared `derive-blocks.ts`/`derive-payloads.ts`/`toon-codec.ts`/`thread.ts` guards**: all add undefined-checks that the surrounding bounds-checks already guarantee — pure `noUncheckedIndexedAccess` satisfaction, no logic change. golden-ids snapshot proves derive output unchanged.
- **db `test-utils.ts`**: type narrowing only. Integration tests green.
- **desktop `credential-validator.ts` missing case**: the never-check was catching a real non-exhaustive switch. The fix routes the (now-typed-`never`) default through an `exhaustive()` helper returning the same `{ valid: false, error: ... }` shape the old code returned. No runtime behavior change for known credentials; the previously-unreachable default still returns an invalid result. Correct — not deferred, and not a behavior regression.
- **desktop `app-menu.ts`/`main.ts`**: the build-from-template call moved from inside the builder to the caller. Same menu, same `setApplicationMenu`. app-menu test (now mocking only `app`/`shell`) passes. No behavior change.
- **eval `seedRoutine` teamId**: added a required `teamId` param + writes `routines.teamId` on insert (the column was previously left unset — a genuine seed gap the type checker exposed; all call sites updated to pass `world.teamId`). This is a test-seed correctness fix, not production behavior. Integration tests green.
- **eval `judges.ts` `baseURL`/`defaultHeaders`**: NOT a regression. `ResolvedModel` (model-gateway.ts:65) only ever had `baseUrl` (lowercase) and NEVER had `defaultHeaders`. The old code referenced two non-existent properties (the TS2339 errors) that would have been `undefined` at runtime anyway. The fix maps to the real `baseUrl` field and drops the phantom `defaultHeaders`. Correct type-level fix; runtime behavior identical (or more-correct).
- **eval `session.ts`**: removed `teamMembersId`/`founderId` from `ScenarioSeedResult` returns where the type doesn't declare them, and dropped the unused `founderId` destructure. Test-seed type alignment. No production behavior.
- **pipeline `skill-frontmatter.ts`**: `if (body === undefined) return null` guard on a possibly-undefined regex group. Defensive but correct for the src possibly-undefined class. No behavior change for valid frontmatter.

No fix altered runtime logic that should have been deferred to a functional workpackage.

---

## Diff hygiene
- `git diff --stat origin/main..HEAD` contains only `.ts`/`.tsx`/`.json`/`.md` (+ one binary `.test.ts` snapshot delta and the attestation JSON). No stray `.js`/`.d.ts` in any `src/`. The `7f52a2ca` commit cleaned stray build artifacts; confirmed none remain.
- devDeps `react@^19` + `@types/estree@^1` added to eslint-plugin-design (dev/types-only on a lint package). The plan PREFERRED an ambient JSX shim over a React devDep, but explicitly allowed the builder to "pick the lighter option that compiles." knip passes with these listed (the `074bedbb` commit fixed the unlisted-deps knip error). Non-blocking deviation, contract-compliant.

---

## Findings the builder must fix
**None.** No critical or blocking findings.

## Observations (no action required)
1. eslint-plugin-design took the React-devDep route rather than the plan's preferred ambient JSX shim. Compliant (plan allowed it), knip-clean, dev-only. Noted for the record.
2. `ssrf.ts` uses `nums[0] as number` where a destructure-with-default would also satisfy the flag without an `as`. Behavior-identical and guarded by `parts.length !== 4`; not worth a change.
