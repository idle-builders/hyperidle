# AF4 — Type-green the server package: architecture plan

Type-fixing workpackage. No UI surface; `/concept` and `/design` skipped (no primitive, no visual change). Value is **categorization + per-site src classification + the binding policy + ordering** — the test work is mechanical, the src work is real contract verification.

Inherits the AF2 binding policy (plans/AF2/architecture.md §1, §4): **FIX every call site; never relax `noUncheckedIndexedAccess`. `!`/`toBeDefined()` narrowing allowed in test files; genuine guards in src. No `any`/`@ts-ignore`/`@ts-expect-error`/`as unknown as T` at route boundaries.**

---

## 0. Measurement reconciliation (spec said 760; gate says 3780)

The AF4 prompt's profile (760, dominated by TS2532/TS18048) was measured with a **narrower grep** than the gate uses. The gate-accurate count — `npx tsc --noEmit -p packages/server/tsconfig.json` filtered of `TS6305/6307/6059` — is **3780**, matching `typecheck-debt.json` `server: 3780` exactly. The real dominant code is **TS7031 (3153, binding-element implicit-any)**, not index-access. The plan is built on the gate-accurate measurement, because the gate is the AC.

Regenerate:
```
cd /Users/tg/hyperidle/.worktrees/AF4
npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 \
  | grep -E "packages/server/[^:(]+[:(].*error TS" | grep -vE "TS6305|TS6307|TS6059"
```

## 1. Error buckets (gate-accurate, measured 2026-06-10)

| Code | Count | src | test | Bucket |
|---|---:|---:|---:|---|
| TS7031 binding-element implicit-any | 3153 | 5 | 3148 | **B. test destructuring** |
| TS7006 param implicit-any | 251 | 121 | 130 | mixed (src = bucket C; test = bucket B) |
| TS2532 object possibly-undefined | 115 | 2 | 113 | **B. test index-access** |
| TS18048 possibly-undefined | 78 | 5 | 73 | mixed (test = B; src = C guards) |
| TS2322 assignment | 44 | 38 | 6 | **C/D. src genuine** (mostly ToolDefinition cluster) |
| TS2345 arg type | 30 | 21 | 9 | **C/D. src genuine** (mostly validateBody cluster) |
| TS6133 unused | 21 | 3 | 18 | mechanical |
| TS2339 prop missing | 18 | 3 | 15 | mixed |
| TS18046 x is unknown | 18 | 9 | 9 | **C. src error-handling** |
| TS2352 bad cast | 16 | 6 | 10 | **C. src** (harness adapter casts) |
| TS2493 / 2353 / 1345 / 2769 / 2538 / 2741 / 2554 / 2344 / others | ~36 | ~10 | ~26 | tail |
| **Total** | **3780** | **224** | **3556** | |

Distribution: **3556 in tests, 224 in src.** Four work buckets:

- **A. Config** — none required. server's tsconfig already has `jsx`/`node` types (it's the API package; node globals resolve). Verified: zero `TS2591/TS2552/TS17004` in the dump. No tsconfig edit. *(Contrast AF2, where config cleared 49.)*
- **B. Test strictness (≈3450)** — TS7031 (3148) + test TS2532/TS18048/TS7006/TS2339. Mechanical, AF2 policy applied per-file. Dominated by **untyped destructuring of vitest fixtures** (`async ({ db, app, eventBus }) => …`) and `.json()`/query-row destructuring. See §3.
- **C. Src genuine-type (≈210)** — route-boundary contracts, implicit-any callbacks, `unknown` error handling, invariant generics. The real work. Fully enumerated in §4.
- **D. Genuine contract-bug-to-route (≤6 candidates)** — errors that reveal a real FE/BE or fabric/server drift where the *fix changes behavior*. Recorded against `Z8-NNN`, not silently changed. See §5.

---

## 2. Fix strategy per bucket (cites AF2 §1)

- **Bucket B (tests):** apply AF2 §1 verbatim. In `*.integration.test.ts`/`*.test.ts`/`__tests__`: type the fixture destructure and callback params; for index-access, narrow (`const first = rows[0]; expect(first).toBeDefined();`) or `rows[0]!`. The TS7031 mass is **one mechanical pattern**: vitest's `test`/fixture callbacks receive `{ db, app, eventBus }` untyped. Fix once per file by annotating the fixture-arg type (import the fixture type from `test-fixtures.ts` and annotate the destructure: `async ({ db, app, eventBus }: TestContext) => …`), OR fix `test-fixtures.ts` so the fixture is generically typed and the annotation flows automatically (preferred — see §3a). Never `any`, never relax the flag.
- **Bucket C (src):** genuine per-site fixes. Three sub-patterns, each with a **single root-cause fix** that clears a cluster (§4). Guards in src are real guards (early-return / `if(!x) throw` / default), never `!` unless an invariant is commented.
- **Bucket D (route-to-AFxx):** record against the owning Z8 entry in `plans/Z8/master-flag-register.md`; do not change behavior here.

---

## 3. Test-bucket mechanics (the 3556 — mechanical, file-listed)

### 3a. Root-cause the TS7031 mass FIRST: `test-fixtures.ts`

`packages/server/src/test-fixtures.ts` is the vitest fixture factory every integration test destructures. It currently has 4 own-errors (the `use` param and the `{ db, eventBus }` destructure are untyped). **Fix `test-fixtures.ts` first** — give the fixture object an exported `interface ServerTestContext { db: HyperIdleDb; app: …; eventBus: EventBus }` and type the fixture callbacks. Then in each test file the `test("…", async ({ db, app }) => …)` callback infers from the typed fixture — clearing the bulk of TS7031 **without per-callback annotation** wherever vitest's `test.extend` generic propagates. Re-measure after this single fix; expect a large drop. Any residual TS7031 (destructuring of `.json()` results or raw query rows) is annotated per-site: `const body = (await res.json()) as ExpectedShape;` then destructure.

### 3b. Residual test index-access (TS2532/TS18048/TS7006/TS2339)

Per-file mechanical pass, AF2 policy. The top test files by error count (apply the policy file-by-file, re-measuring after 3a since many will already be resolved):

`__tests__/api-e2e.integration.test.ts`, `__tests__/U2-api-teams-bets.integration.test.ts`, `__tests__/O2-schema-migration.integration.test.ts`, `routes/__tests__/agent-profile.integration.test.ts`, `routes/__tests__/X3-agents.integration.test.ts`, `routes/__tests__/bets.L14-actions.integration.test.ts`, `routes/__tests__/knowledge.q2.integration.test.ts`, `__tests__/routines-aa2.integration.test.ts`, `routes/__tests__/threads.routes.integration.test.ts`, `__tests__/notifications/R8-signal-to-noise.integration.test.ts`, `__tests__/bet-state-machine.integration.test.ts`, `__tests__/artifacts-route.integration.test.ts`, `__tests__/git-export.integration.test.ts`, `__tests__/builtin-routines.integration.test.ts`, `__tests__/task-state-machine.integration.test.ts`, `__tests__/AC2-retro.integration.test.ts`, `__tests__/lifecycle-propagation.integration.test.ts`, `routes/__tests__/artifacts.routes.integration.test.ts`, `routes/__tests__/AD8b-assistant.routes.integration.test.ts`, `__tests__/cost-cap.integration.test.ts`, and the long tail.

These are **protected-test edits**: the policy permits adding type annotations / `!` / `toBeDefined()` narrowing, but MUST NOT change any assertion. (See `protectedTests` §11.)

---

## 4. Src genuine-type work (the 224 — fully classified, file-specific)

Three clusters share **two root-cause fixes** that clear ~65 of the 224; the rest are per-site. Every fix is type-soundness with **no runtime behavior change** unless flagged → D.

### 4a. ROOT-CAUSE FIX #1 — `validateBody` type erasure (clears ~20; **this is the AC2 route-boundary fix**)

**File:** `packages/server/src/middleware/validate.ts:31`.
`validateBody<T>(schema)` returns `ReturnType<typeof zValidator>` — the **un-parameterized** middleware return. The schema's output type never reaches the Hono context's validation map, so in every consumer `c.req.valid("json")` fails with `"json" not assignable to never` and `body` is `unknown`, cascading into TS2345 (`unknown` arg) at each `updateXConfig(db, body)` call.

**Fix:** make `validateBody` return the **typed** validator so the `"json"` target and its output type register. Return `zValidator("json", schema, validationHook)` typed as the Hono `MiddlewareHandler` that augments `ValidationTargets` for `"json"` with `z.infer<T>` — i.e. drop the `ReturnType<typeof zValidator>` widening and the `Parameters<…>[2]` cast on the hook; type the hook to `@hono/zod-validator`'s `Hook` so inference flows. `validate.ts:31` is `Argument of type 'T' is not assignable to parameter of type 'ZodSchema'` — constrain `T extends z.ZodType` (zod v4 export name; verify against installed `@hono/zod-validator` — ⚠️ UNVERIFIED, check `node_modules/@hono/zod-validator` `ValidationTargets`/`Hook` exports before finalizing the signature). No `as unknown`.

**Clears (all currently TS2345 `"json"→never` / `unknown` / TS18046 `body is unknown`):**
- `routes/notifications-routes.ts:215,216,224,225,240,253` (6)
- `routes/observability-routes.ts:129,130,138,139` (4)
- `routes/git-export-routes.ts:126,127,135,140,153,154` (6)
- partial `routes/credentials.ts:184` and `routes/tasks.ts:131` (the `updates`/body-shape errors downstream of valid-body typing).

This is the single most valuable src fix: it makes **request types at the route boundary sound with zero `any`** — AC2 satisfied for the config-PATCH routes (notifications, observability, git-export) that the web app consumes.

### 4b. ROOT-CAUSE FIX #2 — `ToolDefinition<Input>` invariance (clears 45)

**Files:** `skill-tools/tool-registry.ts:150–175` (25), `skill-tools/assistant-tools.ts:116–129` (13), plus the per-tool exports.
`ToolDefinition<Input>` uses `Input` covariantly (`inputSchema: z.ZodType<Input>`) and contravariantly (`handler: (args: Input, …) => …`) → **invariant**. Each tool is `ToolDefinition<{specific}>`; the registry arrays are `readonly ToolDefinition[]` (= `ToolDefinition<unknown>[]`). `ToolDefinition<{limit?:number}>` is genuinely not assignable to `ToolDefinition<unknown>` — you can't feed `unknown` to a handler expecting `{limit:number}`.

**Why it's safe to erase:** the handler is only ever invoked **after** the harness validates `args` against `inputSchema` (confirmed: the only `.handler(` call sites are inside tool-registry/assistant-tools, post-validation). So the registry's stored handler logically takes `unknown` and the tool's own schema parses it.

**Fix (type-soundness, no behavior change):** introduce a registry-erased element type, e.g.
```ts
// the stored shape erases Input at the boundary; the schema still validates.
export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;            // output validated at call time
  readonly handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
  readonly roles?: readonly UserRole[];
}
```
and a single `toRegistered<I>(def: ToolDefinition<I>): RegisteredTool` adapter that the array maps through (`ALL_TOOL_DEFINITIONS.map(toRegistered)` / each literal wrapped). `ALL_TOOL_DEFINITIONS` and `toolsForAssistant()` become `readonly RegisteredTool[]`. The adapter's handler closes over the typed `def.handler` and accepts `unknown` (the schema-validated value is assignment-compatible at the post-`parse` call site — keep the existing `parse`/validate step). Update consumers of `ToolDefinition[]` to `RegisteredTool[]` (grep `ToolDefinition\[\]` / `: ToolDefinition` in non-definition files). This subsumes the existing ad-hoc `wrapForRegistry`/`wrapAssistantTool` — fold them into the one adapter. **Net: replaces two bespoke wrappers with one named boundary** (naming-is-architecture; no `Manager`/`Helper`).

### 4c. Implicit-any route callbacks (TS7006 in src, ~110) — per-site, mechanical

`.map`/`.filter`/`.reduce`/`.sort`/`.catch` callbacks over Drizzle query results and arrays where the element type isn't inferred (usually because the query result is `unknown[]` or the array is built untyped). Fix = annotate the param from the actual element type (the Drizzle `$inferSelect` row type, or the declared array type). **Do not** `any`. Files & sites (counts):
- `routes/bets.ts` (24 sites: 373–397, 425/426, 501, 548, 855–874, 984, 1096–1154) — `b`/`t`/`sum`/`r`/`a`/`tx`. Annotate from the bet/task row types and the reducer accumulator.
- `routes/teams-routes.ts` (20: 157–777) — `team`/`t`/`a`/`e`/`role`/`bet`/`r`/`u`; plus **777 TS2339 `Property 'name' does not exist on type '{}'`** — the `ownerMap.get(...)` value type is `{}`; type the map's value (the user/agent row) so `owner?.name` resolves. (Same fix clears 777.)
- `services/ws-broadcaster.ts` (16: 41–111) — every `event` param implicit-any. These are the WS event-handler params; annotate from the `DomainEvent` union (or the specific event type each subscription expects). Highest-density single-fix file.
- `routes/threads.ts` (12 of its 16: `r`/`id`/`a`/`b`/`row`/`m`/`tx`) — annotate from row/message types.
- `routes/agent-profile.ts` (6), `routes/users.ts` (4), `routes/recipients.ts` (4), `routes/credentials.ts:181,183` (2), `routes/artifacts.ts` (3), `routes/agents.ts` (2), `routes/settings.ts` (2), `routes/search.ts` (2), `routes/status.ts` (2), `routes/routines-routes.ts` (2), `routes/hints.ts` (1), `routes/knowledge.ts:247,254` (5 — incl. 3 TS7031 binding-elements: type the `{ item, relevanceScore, attentionScore }` destructure from the query projection).
- `services/*` `tx` params (Drizzle transaction callbacks): `bet-state-machine.ts:162`, `handoff-protocol.ts:107`, `invite-code.ts:108`, `skill-tools/promote-knowledge.ts:112`, `routes/threads.ts:611,812`, `routes/bets.ts:984` — annotate `tx` with Drizzle's transaction type (`Parameters<HyperIdleDb["transaction"]>[0]` element, or the exported `DbTransaction` type if shared/db exports one — check; if not, derive locally). One pattern, ~7 sites.
- `services/handoff-protocol.ts:191`, `services/team-management.ts:112` (+ unused `_agentIds` TS6133 → prefix-underscore already; remove or use), `skill-tools/create-team.ts:78,91`, `skill-tools/read-inbox.ts:34,43`, `skill-tools/write-memory.ts:90`, `schemas/artifact-preview.ts:24`, `mcp/mcp-bridge.ts:104`, `app.ts:523`, `routes/tasks.ts` callbacks, `test-fixtures.ts:12,15` (→ §3a).

### 4d. `unknown` error-handling (TS18046, 9 src) — per-site guard

`catch (err)` where `err` is `unknown` then `.message`/`.code` accessed: `routes/bets.ts:707,725,749`, `routes/sessions-routes.ts:169,219,222`, `routes/git-export-routes.ts:153,154` (the latter two clear via 4a; the rest are real). Fix = `err instanceof Error ? err.message : String(err)` narrowing. No `any`.

### 4e. Harness adapter casts (TS2352, 6 src) — narrow the message union

`harness/isolated-harness-adapter.ts:252,256`, `harness/isolated-session-worker.ts:31`, `harness/remote-harness-adapter.ts:219,222,225`: casting a wire message `object & Record<"type", unknown>` to `{ event: HarnessEvent }` etc. — neither overlaps. Fix = a discriminated-union narrow on the `type` field (a small `WorkerMessage` union type + a type-guard switch on `msg.type`), not a cast through `unknown`. These are the IPC boundary of the isolated/remote session workers; the guard must preserve the exact runtime dispatch. **Behavior-preserving** (the switch already exists at runtime; we're making it type-sound). Verify against the worker integration tests.

### 4f. Tail (per-site)

- `services/schedule-label.ts:68,69,77,85` (TS2345 `string|undefined`→`string`, TS18048 `dow` possibly-undefined, TS2538 `undefined` as index) — guard the cron-field parse; possibly-undefined in a label formatter is a genuine bug (cron split can yield `undefined`). Guard with default/early-return. **Verify no label-output change** (this feeds UI strings — if a guard changes a rendered label it's behavior → check schedule-label unit tests; if none assert the changed path, it's safe).
- `services/observability/dispatcher.ts:467` TS2322 `DomainEvent → never` — the exhaustive-`never` check catches an **unhandled `DomainEvent` member** (same class as AF2's desktop credential case). Identify the missing event kind; add the `case` returning `false` (the existing default already returns false, so adding the explicit case is behavior-neutral). **Genuine completeness fix, no behavior change.** `:248` TS2322 `number | Timeout` → `Timeout | null`: `setInterval` returns `NodeJS.Timeout` in node typings vs `number` in DOM — annotate the field `ReturnType<typeof setInterval> | null`.
- `routes/credentials.ts:311` TS2322 `string → never` + unused `_exhaustive`: the `CredentialName` switch is **non-exhaustive** — a credential name is unhandled (same class as AF2 desktop). The `default` already sets `{ valid:false, error:"Unknown credential name" }` so runtime is safe, but the `never` assignment proves a missing case. **Investigate which `CredentialName` is unhandled.** If adding the case introduces real validation behavior → that's a behavior change → **route to AF11** (Z8-161 credential surface owner) with a `Z8` note; if the existing default is the intended behavior, the type fix is to widen `_exhaustive`'s position or accept the default — but prefer adding the missing `case` only if it's behavior-neutral. **Flagged as a D-candidate (§5).**
- `routes/tasks.ts:131,142` TS2769/TS2322 (`{} | null → string | null`): the `updates` object / `JSON.parse` result typed `{}`; type `updates` as `Partial<typeof tasks.$inferInsert>` so field assignments check. Behavior-neutral.
- `routes/threads.ts:534,591,793` TS2345 (`unknown[]`/`Record<string,unknown>[]` → typed arrays): annotate the block/payload arrays from the shared block type (`{ kind: string; … }[]`). Behavior-neutral.
- `services/agent-utils.ts:16` TS2532 (`words[0]`/`words[1]` possibly-undefined after `split`): `split(/\s+/)` on a non-empty trimmed string yields ≥1 element, but the `length >= 2` guard already proves `words[1]` exists for the branch — narrow with `const [first, second] = words; if (second) …` or destructure-with-guard. Genuine src guard (AF2 policy: real narrow, not `!`, though here the `length>=2` invariant would justify a commented `!`).
- `services/bet-state-machine.ts:106`, `services/task-state-machine.ts:57`, `services/handoff-protocol.ts:123` TS18048 `allowed` possibly-undefined: the transition-map lookup returns `T[] | undefined`; guard the lookup (`const allowed = MAP[state]; if (!allowed) …`). Genuine src guard — **state-machine correctness**; verify against the state-machine integration tests (no transition behavior change, just an explicit guard on an already-total map).
- `services/credential-resolver.ts:38` TS2538 (`undefined` as index): guard the key before indexing.
- `mcp/mcp-bridge.ts:102` TS2322 (`ZodType<unknown>` → MCP schema type): align the MCP tool-schema typing with the bridge's expected shape (related to the same Zod-generic erosion as 4a; fix the bridge's schema param type, no `any`).
- `schemas/index.ts:14` TS2305 (`AppType` not exported from `app.js`) + `schemas/bet.schema.ts:62` / `routes/threads-schema.ts:94` TS2554 (arg-count): `AppType` export was removed (the reverted Hono-RPC PR #89/#109 left a dangling re-export) — restore the `export type AppType = …` in `app.ts` or drop the dead import; fix the 2-3-arg Zod calls (likely a zod v4 API change — `z.string().min(n)` vs a changed signature; ⚠️ verify against installed zod). **Behavior-neutral.**
- `services/session-provisioning.ts:385` & `skill-tools/handoff-to.ts:54` TS2741 (`traceId` missing in `SessionContext`): the `SessionContext` type now requires `traceId` but two construction sites omit it. **Investigate:** if these sites should supply a real `traceId`, that's a behavior question → if a trace genuinely isn't available, supply a sentinel/derive it; if the field should be optional, that's an AF3/fabric type decision. **Flagged D-candidate (§5)** — likely AF7 (session execution) owner.
- `skill-tools/write-memory.ts:107` TS2339 (`.id`/`.version` on `KnowledgeItemWithFabric`): `createKnowledgeItem` returns `KnowledgeItemWithFabric extends KnowledgeItem`. If `KnowledgeItem` lacks `version`, the FE/tool contract reads a field the type doesn't expose. **Depends on AF3** (fabric must be type-green first). Re-check after AF3; if the fabric type genuinely lacks `version`/`id`, it's a fabric contract gap → record against AF3's tail or the owning Z8. **Flagged D-candidate (§5).**
- `routes/threads.ts:533` TS7006 + `:534` TS2345, `routes/git-export-routes.ts` `"json"` cluster → 4a/4c.
- Remaining single-site TS2769/TS2538/TS2554 in the tail: per-site, behavior-neutral signature fixes.

---

## 5. Genuine contract bugs — detection + recording (AC3)

### How to detect "genuine contract bug" vs "type-soundness fix"

A type error is a **genuine contract bug to route** (not a fix-here) iff making the types agree would **change runtime behavior or the wire shape** — i.e. the type checker exposed a real FE/BE or service/service drift. Heuristic the builder applies per src error:
1. Does the sound fix only add an annotation/guard/narrow with identical runtime? → **fix here** (Bucket C).
2. Does making it compile require **sending a different field, renaming a wire field, or adding a value the code never produced**? → **route to AFxx, record `Z8-NNN`.**

The spec's named drifts (portfolio `title` Z8-019, task `owner`/`startedAt` Z8-024, knowledge `accessCount` Z8-478-area) **do not appear as server-src type errors** — confirmed by inspecting the 224. They're *omissions* (server simply doesn't send the field), which surface as **web-side** type errors (AF5) or as silent runtime gaps, not as server compile errors. So AF4 does **not** fix them; it leaves the server types honest about what's actually sent. (Recording them is already done in `plans/Z8/master-flag-register.md`; their owners are AF12/AF14/AF15 per TRACK-AF.)

### Recording mechanism (verified)

The Z8 register is **`plans/Z8/master-flag-register.md`** — markdown, one `### Z8-NNN — title` section per defect with file:line + fix-shape. This is the single source of truth referenced by `.pipeline/work-packages/TRACK-AF.md:5`. There is **no JSON/append API** — recording = adding/annotating a `### Z8-NNN` section (or a one-line note under an existing entry naming the owning AFxx). AF2/AF3 created **no new Z8 entries** (grep `Z8-` in `plans/AF2`/`plans/AF3` → empty) because their genuine fixes were all behavior-neutral (guards/signatures). AF4 follows the same default: **fix-here is the norm; route only true behavior changes.**

### D-candidates AF4 must adjudicate (≤4, each: confirm fix-here-neutral OR record + route)

| Site | Error | Decision rule | Likely route |
|---|---|---|---|
| `routes/credentials.ts:311` | non-exhaustive `CredentialName` switch | If the missing case needs real validation logic → route; if default is intended → fix-here (add neutral case) | AF11 (Z8-161 credential surface) if behavioral |
| `services/observability/dispatcher.ts:467` | unhandled `DomainEvent` in exhaustive-never | Adding `case … return false` is behavior-neutral (matches default) → **fix-here** | — |
| `session-provisioning.ts:385` + `handoff-to.ts:54` | `SessionContext.traceId` missing at construction | If a real traceId must be threaded → behavior change → route; if optional-by-design → fix the type | AF7 (session execution) |
| `skill-tools/write-memory.ts:107` | `.id`/`.version` absent on `KnowledgeItemWithFabric` | Re-check after AF3; if fabric type lacks the field → fabric contract gap | AF3 tail / owning Z8 |

For any routed item: add a one-line note to its `### Z8-NNN` entry in `plans/Z8/master-flag-register.md` — `AF4: type checker confirms <drift>; behavioral fix owned by <AFxx>` — and at the server site, satisfy the compiler **without changing behavior** (e.g. keep the existing safe default, narrow the type to the honest current shape). Never `any`/`@ts-ignore` to defer.

---

## 6. Drain step (AC1 — gate-FORCED, AF2 §4 procedure)

`typecheck-debt.json` `server` entry MUST be removed in the **same commit** that reaches zero. The AF1 stale-ratchet (`scripts/lib/typecheck-verdict.ts` `staleExcepted`) **fails the gate** for a quarantined package with zero own-errors — so draining is gate-enforced, not optional.

Procedure (AF2 §4, server-specialized):
1. Confirm clean: `npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | grep -E "packages/server/.*error TS" | grep -vE "TS6305|TS6307|TS6059"` → empty.
2. `jq 'del(.packages["server"])' typecheck-debt.json > tmp && mv tmp typecheck-debt.json`.
3. `npm run check` → server shows **PASS** (not QUARANTINED/STALE/FAIL). After AF4, `typecheck-debt.json` retains only `fabric` (AF3, if not yet drained) and `web` (AF5).

**Do NOT** drain incrementally per-file (unlike AF2's per-package drain) — server is one package; it drains once, atomically, when the last error clears. **Do NOT** modify the gate (`scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts`) — AF1 owns it.

---

## 7. Ordered task list (builder executes)

1. **Re-measure baseline** (gate-accurate command, §0). Snapshot counts.
2. **ROOT-CAUSE #1 — `middleware/validate.ts`:** type `validateBody` so `c.req.valid("json")` infers schema output. ⚠️ Verify `@hono/zod-validator` `Hook`/`ValidationTargets` exports first. Re-measure: notifications/observability/git-export `"json"`/`unknown` cluster (~20) should clear.
3. **ROOT-CAUSE #2 — `skill-tools/tool-registry.ts` + `assistant-tools.ts`:** introduce `RegisteredTool` erased type + one `toRegistered` adapter; fold `wrapForRegistry`/`wrapAssistantTool` into it; retype `ALL_TOOL_DEFINITIONS`/`toolsForAssistant()` and consumers. Re-measure: ~45 clear. Run skill-tool integration tests (no behavior change).
4. **`test-fixtures.ts` (§3a):** type the fixture context + callbacks. Re-measure: large TS7031 drop across all integration tests.
5. **Src implicit-any callbacks (§4c):** per-file, highest-density first — `services/ws-broadcaster.ts` (16), `routes/bets.ts` (24), `routes/teams-routes.ts` (20+777), `routes/threads.ts`, then the rest. Annotate from row/element/event/tx types. No `any`.
6. **Src `unknown` error-handling (§4d)** + **harness casts (§4e)**: narrow, don't cast.
7. **Src tail (§4f):** schedule-label guards, dispatcher cases, tasks/threads array types, state-machine guards, `AppType` re-export, zod arg-count fixes, credential-resolver index guard, mcp-bridge schema type.
8. **D-candidates (§5):** adjudicate the 4. Fix-here-neutral where neutral; for any behavior change, add the `Z8-NNN` note in `plans/Z8/master-flag-register.md` and satisfy the compiler with the honest current type.
9. **Test residual (§3b):** per-file index-access policy on the listed test files. Re-measure to zero.
10. **DRAIN (§6):** `tsc -p packages/server/tsconfig.json` empty → `jq del server` from `typecheck-debt.json` → `npm run check` shows server PASS. **Same commit.**
11. **Validate:** `npm run check` (server PASS; only web/fabric quarantined as applicable) + `npm run lint` (no-explicit-any green) + `npm run test` + `npm run test:integration` (server has heavy integration suites — must stay green; type fixes must not change runtime) + `npm run verify`.

Commit grouping: §2–§4 src fixes can be one commit per cluster (validate / tool-registry / per-file callbacks); the drain is its own final commit. Keep the gate green at each commit (server stays quarantined until the final drain commit, so intermediate commits are fine even with residual server errors).

---

## 8. Acceptance criteria → verification

| AC | Verification method |
|---|---|
| **AC1** server compiles zero errors + off exception list | `npm run check` → server row = **PASS** (gate runs `scripts/typecheck-gate.ts`); `jq '.packages \| keys' typecheck-debt.json` → no `server`. **Regression proof:** inject `const x: string = 123` into `packages/server/src/app.ts`, `npm run check` → FAIL naming server (server no longer quarantined). |
| **AC2** route req/resp types sound, no `any` at boundary | `npm run lint` (`@typescript-eslint/no-explicit-any` + `no-unsafe-*` green); **grep gate:** `git diff origin/main -- packages/server/src \| grep -nE '\bas any\b\|: any\b\|@ts-(ignore\|expect-error)\|as unknown as'` → **zero new** matches in route/middleware files. The `validateBody` fix (4a) makes `c.req.valid("json")` typed (not `unknown`) — verified by the absence of `"json" not assignable to never` errors post-fix. |
| **AC3** genuine contract bugs fixed or recorded | Each §5 D-candidate either compiles behavior-neutrally OR has a `Z8-NNN` note in `plans/Z8/master-flag-register.md` naming the owning AFxx. `git diff plans/Z8/master-flag-register.md` shows the added notes; no silent suppression (verified by the AC2 grep gate — zero `@ts-ignore`). |
| **AC4** `npm run verify` passes | Run it; green end-to-end (check + lint + knip + test:all + build + attestation). |

---

## 9. Risks / ambiguities

- **`@hono/zod-validator` typing (4a)** — ⚠️ UNVERIFIED. The exact `Hook`/`ValidationTargets`/`ZodSchema` constraint names depend on the installed version (zod v4 era). Builder must read `node_modules/@hono/zod-validator` and `node_modules/zod` before finalizing the `validateBody` signature. If the typed-middleware approach can't express the augmentation cleanly, fallback is a thin typed wrapper exporting a `ValidatedContext` helper — **never** `c.req.valid("json") as Shape`.
- **`ToolDefinition` erasure (4b)** — confirm the only `.handler(` call sites are post-validation (verified today: tool-registry + assistant-tools only). If any caller invokes `handler` with a *typed* arg expecting the narrow type, the erased `unknown` handler would regress that site — re-grep before committing.
- **Zod arg-count errors (`bet.schema.ts:62`, `threads-schema.ts:94`)** — likely a zod v4 signature change (`.refine`/`.min` arity). Verify against installed zod; the fix differs by version.
- **`AppType` (`schemas/index.ts:14`)** — dangling re-export from the reverted Hono-RPC PRs (#89 reverted by #93, #109). Determine whether `AppType` should be restored (if the typed-RPC client is still used) or the import deleted (if dead). Check `packages/web` for `AppType` consumers (⚠️ but web is AF5-quarantined — grep, don't depend on its compile).
- **AF3 dependency** — `write-memory.ts:107` and any `KnowledgeItemWithFabric`-shaped error depend on fabric being type-green. AF4 **depends on AF3**; if AF3 hasn't landed, re-measure may show server errors that are actually fabric-export rot. Confirm AF3 is drained (or its exports stable) before treating §4f fabric-typed sites as server bugs.
- **Test-fixture re-measure (§3a)** — the 3148 TS7031 estimate assumes vitest fixture-type propagation clears them in bulk. If `test.extend` generics don't propagate through the destructure, fall back to per-callback annotation (still mechanical, just more sites). Re-measure after step 4 before estimating step 9.

---

## 10. Required reading (builder)
- `plans/AF2/architecture.md` §1 (binding policy), §4 (drain procedure) — inherited, non-negotiable.
- `scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts` — gate mechanics (read-only; do NOT modify).
- `typecheck-debt.json` — drain target (`server` entry).
- `.claude/rules/typescript.md` — strict-mode / no-`any` contract.
- `plans/Z8/master-flag-register.md` — Z8 recording target (markdown sections); Z8-019/024/161 context.
- `packages/server/src/middleware/validate.ts`, `skill-tools/tool-registry.ts`, `skill-tools/assistant-tools.ts` — the two root-cause src fixes.
- `node_modules/@hono/zod-validator` + `node_modules/zod` — verify the 4a signature.

## 11. protectedTests
- **All existing `packages/server/src/**/*.test.ts(x)` and `*.integration.test.ts` assertions** — the test bucket (§3) may add type annotations / `!` / `toBeDefined()` narrowing but MUST NOT change any `expect(...)` assertion. DoD audits with `git diff` on the test set: only type-level additions allowed, no assertion deltas.
- No server unit/integration test asserts on the *types* being fixed; the proof of no-runtime-regression is the existing suites staying green (`npm run test:integration`).

## 12. Security & abuse cases
- **Route-boundary input trust (4a):** the `validateBody` fix **tightens** the boundary — `c.req.valid("json")` becomes typed, so handlers stop treating validated bodies as `unknown`. This is a security *improvement* (typed validation contract); it must not *widen* what passes validation — the Zod schemas are unchanged, only their type surfacing. Verify: the validation-failure 400 path (`validationHook`) is untouched; integration tests asserting 400 on bad input stay green. **Applicable + addressed.**
- **Harness IPC casts (4e):** the worker-message narrowing must preserve the exact runtime dispatch — a guard that misroutes a worker message is a session-isolation issue. Verify against worker integration tests; the type-guard mirrors the existing runtime `switch`. **Applicable + addressed (behavior-preserving).**
- **Credential switch (4f, credentials.ts:311):** the non-exhaustive `CredentialName` switch — if a credential validation case is genuinely missing, that's a security-relevant gap (a credential type validated by the catch-all "Unknown" default instead of its real validator). **Routed to AF11 if behavioral** (§5); AF4 must not silently make it "valid". The current default returns `{ valid:false }` — preserve that (fail-closed) under any type fix.
- No new routes, credentials, outbound URLs, or path inputs introduced. SSRF / path-traversal / rate-limit / secret-handling: **N/A** (type-only workpackage, no new surface).

## 13. route-checklist
- N/A — no routes added/moved. AF4 fixes types of existing route handlers; the §4a cluster spans `routes/{notifications,observability,git-export}-routes.ts` config-PATCH handlers (the web-consumed boundary AC2 targets) — these are the sound-types focus, not new mounts.

## 14. Migrations
- N/A — no symbol renames/moves/removals except restoring or deleting the dead `AppType` re-export (§4f). If `AppType` is **deleted** (dead), grep web for consumers first (AF5 owns web, but a deleted server export it imports would surface there) — note it for AF5 rather than breaking it. The only "migration" is the `typecheck-debt.json` `server`-entry deletion (§6).

## 15. sharedFiles
- `typecheck-debt.json` — also drained by AF3 (fabric) / AF5 (web). AF4 removes only its `server` entry; if AF3/AF5 run concurrently, merge order matters (they should be sequential per the AF dependency chain: AF2 → AF3 → AF4 → AF5).
- `packages/server/src/app.ts` (`AppType` re-export; `app.ts:523` callback) — touched; also the server entry other workpackages import.
- `packages/server/src/middleware/validate.ts`, `skill-tools/tool-registry.ts`, `skill-tools/assistant-tools.ts` — the root-cause fixes; signature-shaping, may affect imports.
- `plans/Z8/master-flag-register.md` — appended-to if any D-candidate routes (also touched by AF10–AF16 owners).
