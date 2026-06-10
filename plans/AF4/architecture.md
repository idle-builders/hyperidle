# AF4 — Type-green the server package: architecture plan

Type-fixing workpackage. No UI surface; `/concept` and `/design` skipped (no primitive, no visual change). Value is **categorization + per-site src classification + the binding policy + ordering** — the test work is mechanical, the src work is real contract verification.

Inherits the AF2 binding policy (plans/AF2/architecture.md §1, §4): **FIX every call site; never relax `noUncheckedIndexedAccess`. `!`/`toBeDefined()` narrowing allowed in test files; genuine guards in src. No `any`/`@ts-ignore`/`@ts-expect-error`/`as unknown as T` at route boundaries.**

---

## 0. Ground truth: 758 errors (empirically pinned 2026-06-10), NOT 3780

The real server own-error count is **758** — `103 src, 655 test` — dominated by **TS2532 (285) / TS18048 (157)**, exactly the spec's "~762." **TS7031 = 0.** This matches the gate's quarantine state: server quarantined at 758, gate **PASSES**.

### The 3780 / TS7031=3153 was a BUILD PHANTOM — do not re-chase it

The earlier 3780 measurement (and its TS7031=3153 cascade) was an artifact of **stale/absent leaf `dist/*.d.ts` for `@hyperidle/db` and `@hyperidle/shared`**. When those leaves aren't built, server's vitest-fixture destructuring (`async ({ db, app, eventBus }) => …`) resolves the fixture object to `any`, and every binding element becomes an implicit-any → **3148 cascade TS7031**. After `npx tsc -b packages/shared packages/db` (build the leaves), server = **758, TS7031 = 0**.

**Consequences for the plan:**
- There is **no "3153 make-or-break fixture-type fix"**, no central `test-fixtures.ts` typing task driving a mass TS7031 drop. That framing is deleted. The fixture types are already fine once the leaves are built.
- The phantom's cure is **build-ordering** (build leaves before typechecking server). That is **pre-existing AF1 gate behavior**, not server type debt, and **not AF4 scope**.

### Build precondition (operational — read before `verify`)

- **CI only validates the attestation signature.** `.github/workflows/ci.yml` runs `scripts/check-attestation.ts`; it does **NOT** re-run the gate. So the dist-freshness phantom is a **purely local precondition**, never a CI failure.
- **Before any `npm run check` / `npm run verify`, the builder MUST ensure fresh leaf dist:** run `npx tsc -b packages/shared packages/db` (or a full prior build) first. Otherwise `check` reports the 3148-error phantom and the baseline looks catastrophic. The phantom is a measurement trap, not work.
- **Do NOT** modify the AF1 gate (`scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts`) or the `verify` script to "fix" the phantom — out of scope. The fix is operational discipline (build leaves first).

### Regenerate the true list

```
cd /Users/tg/hyperidle/.worktrees/AF4
npx tsc -b packages/shared packages/db        # build leaves FIRST (else phantom)
npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 \
  | grep -E "^packages/server/[^:]+[:(].*error TS" \
  | grep -vE "error (TS6305|TS6307|TS6059)"
```

(The `TS6305/6307/6059` filter strips project-reference/rootDir noise the `tsc -b` of db-over-shared emits; those are not server own-errors.)

---

## 1. Error buckets (verified 2026-06-10 against the true 758)

| Code | Total | src | test | Bucket |
|---|---:|---:|---:|---|
| TS2532 object possibly-undefined | 285 | 2 | 283 | **B. test index-access** |
| TS18048 possibly-undefined | 157 | 5 | 152 | mixed (test = B; src = C guards) |
| TS2345 arg type | 85 | 23 | 62 | mixed (src = validateBody + drizzle-zod cluster; test = B) |
| TS2322 assignment | 53 | 41 | 12 | **C/D. src genuine** (ToolDefinition + payload-union clusters) |
| TS18046 x is unknown | 48 | 3 | 45 | mixed (src = error-handling C; test = B) |
| TS2769 no overload | 35 | 7 | 28 | mixed (src = drizzle insert/update typing; test = B) |
| TS6133 unused | 21 | 3 | 18 | mechanical |
| TS2352 bad cast | 17 | 6 | 11 | **C. src** (harness IPC casts) |
| TS2339 prop missing | 17 | 0 | 17 | **B. test** |
| TS2493 / 2353 / 2554 / 2344 / 1345 / 2741 / 2678 / 2538 / 2305 / 7006 tail | ~80 | ~13 | ~67 | mixed |
| **Total** | **758** | **103** | **655** | |

Distribution: **655 in tests, 103 in src.** Three work buckets (no Config bucket — verified zero `TS2591/TS2552/TS17004`; server's tsconfig already resolves node globals):

- **B. Test strictness (655)** — TS2532/TS18048/TS18046/TS2769/TS2339/TS2345 index-access and possibly-undefined in `*.integration.test.ts`/`*.test.ts`. Mechanical, AF2 policy per-file. **No TS7031** — there is no fixture-destructure mass. See §3.
- **C. Src genuine-type (≈97)** — route-boundary contracts, `unknown` error handling, invariant generics, drizzle-zod/zod-v3 signature drift. The real work. Fully enumerated by file in §4.
- **D. Genuine contract-bug-to-route (≤4 candidates, re-verified at 758)** — errors revealing real drift where the *fix changes behavior or wire shape*. Recorded against `Z8-NNN`, not silently changed. See §5.

---

## 2. Fix strategy per bucket (cites AF2 §1)

- **Bucket B (tests):** apply AF2 §1 verbatim. In `*.test.ts(x)`/`*.integration.test.ts`/`__tests__`: for index-access, narrow (`const first = rows[0]; expect(first).toBeDefined();`) or `rows[0]!`; for `.json()` results, annotate `const body = (await res.json()) as ExpectedShape;` then destructure. Per-file, no flag-loosening, never `any`. **Protected-test edits** (§11): type-level additions only; MUST NOT change any `expect(...)` assertion.
- **Bucket C (src):** genuine per-site fixes. Two root-cause fixes clear a cluster (§4a, §4b); the rest are per-site. Guards in src are real guards (early-return / `if(!x) throw` / default), never `!` unless an invariant is commented.
- **Bucket D (route-to-AFxx):** record against the owning entry in `plans/Z8/master-flag-register.md`; do not change behavior here.

zod is **v3 (3.25.76)**; `@hono/zod-validator` is **0.7.6**; drizzle-zod is **0.8.3**. Every schema/validate fix is anchored on **zod v3** signatures (the installed `.d.ts`), NOT v4 export names. `middleware/validate.ts` already uses the v3 `z.ZodTypeAny` constraint.

---

## 3. Test-bucket mechanics (the 655 — mechanical, file-listed)

No root-cause TS7031 step (it does not exist at 758). Pure per-file index-access / possibly-undefined pass, AF2 policy. The bulk is TS2532 (283) + TS18048 (152) across the integration suites: query-row and `.json()`-result access without narrowing.

Per-file mechanical pass on the top test files by error count (run the regen command, sort the test lines by file):

`__tests__/api-e2e.integration.test.ts`, `__tests__/U2-api-teams-bets.integration.test.ts`, `__tests__/O2-schema-migration.integration.test.ts`, `routes/__tests__/agent-profile.integration.test.ts`, `routes/__tests__/X3-agents.integration.test.ts`, `routes/__tests__/bets.L14-actions.integration.test.ts`, `routes/__tests__/knowledge.q2.integration.test.ts`, `__tests__/routines-aa2.integration.test.ts`, `routes/__tests__/threads.routes.integration.test.ts`, `__tests__/notifications/R8-signal-to-noise.integration.test.ts`, `__tests__/bet-state-machine.integration.test.ts`, `__tests__/artifacts-route.integration.test.ts`, `__tests__/git-export.integration.test.ts`, `__tests__/builtin-routines.integration.test.ts`, `__tests__/task-state-machine.integration.test.ts`, `__tests__/AC2-retro.integration.test.ts`, `__tests__/lifecycle-propagation.integration.test.ts`, `routes/__tests__/artifacts.routes.integration.test.ts`, `routes/__tests__/AD8b-assistant.routes.integration.test.ts`, `__tests__/cost-cap.integration.test.ts`, and the long tail. (Confirm the actual ranking from the regen output; the list above is the expected top set.)

Each file: narrow index-access, type `.json()` results, prefix-or-remove unused (TS6133). No assertion changes. Re-measure per file.

---

## 4. Src genuine-type work (the 103 — fully classified by file, verified at 758)

Two root-cause fixes clear ~53 of the 103; the rest are per-site. Every fix is type-soundness with **no runtime behavior change** unless flagged → D.

### 4a. ROOT-CAUSE FIX #1 — `validateBody` type erasure (clears 20; **this is the AC2 route-boundary fix**)

**File:** `packages/server/src/middleware/validate.ts:31`.
`validateBody<T extends z.ZodTypeAny>(schema)` returns `ReturnType<typeof zValidator>` — the **un-parameterized** middleware return — and casts the hook via `validationHook as Parameters<typeof zValidator>[2]`. The cast erases the typed overload, so the schema's output type never reaches the Hono context's validation map. In every consumer `c.req.valid("json")` fails (`Argument of type '"json"' is not assignable to parameter of type 'never'`, TS2345) and `body` is `unknown` (TS18046), cascading into the `unknown→ConfigPatch` TS2345 at each `updateXConfig(db, body)` call.

**Fix (zod v3, verified against installed `@hono/zod-validator@0.7.6` `dist/index.d.ts`):** the package exports `zValidatorFunction` with two overloads; the second is `<T extends ZodSchema, …, HookFn extends Hook<InferredValue, E, P, Target, {}, T>>(target, schema, hook?, options?): MiddlewareHandler<E, P, V, …>`. The current code defeats inference by widening to `ReturnType<typeof zValidator>` and casting the hook. **Drop both:** return `zValidator("json", schema, validationHook)` and let the return type be inferred (do NOT annotate it as `ReturnType<typeof zValidator>`). Type `validationHook` to the package's `Hook` shape so the `success/data/target` discriminated result types (it already matches: `{ success: boolean; error?: { issues } }` is assignable to the v3 hook result for the failure branch). The `T extends z.ZodTypeAny` constraint is correct and stays (zod v3; `ZodSchema = v3.ZodType | v4.$ZodType` in the validator, and `ZodTypeAny ⊆ v3.ZodType`). **No `as unknown`, no v4 export names.** The `validate.ts:31` `T not assignable to ZodSchema` clears once the `zValidator` call uses the inferring overload (the cast on the hook is what currently routes it to the wrong overload).

**Clears (all currently TS2345 `"json"→never` / `unknown→ConfigPatch` / TS18046 `body is unknown`):**
- `routes/notifications-routes.ts:215,216,224,225,240,253` (6)
- `routes/observability-routes.ts:129,130,138,139` (4)
- `routes/git-export-routes.ts:126,127,135,140,153,154` (6) — incl. the two TS18046 `body is unknown` at 153,154.

This is the single most valuable src fix: it makes **request types at the route boundary sound with zero `any`** — AC2 satisfied for the config-PATCH routes (notifications, observability, git-export) the web app consumes.

**Verify before finalizing:** read `node_modules/@hono/zod-validator/dist/index.d.ts` (the `Hook` and `zValidatorFunction` overloads — already inspected: dual v3/v4, `Hook`'s `Schema` defaults `any`). If the inferring return can't be expressed without re-annotation, fallback is a typed thin wrapper exposing a `ValidatedJson<T>` context helper — **never** `c.req.valid("json") as Shape`.

### 4b. ROOT-CAUSE FIX #2 — `ToolDefinition<Input>` invariance (clears 33; #1 src file)

**Files:** `skill-tools/tool-registry.ts:150–175` (20), `skill-tools/assistant-tools.ts:116–129` (13).
`ToolDefinition<Input>` uses `Input` covariantly (`inputSchema: z.ZodType<Input>`) and contravariantly (`handler: (args: Input, …) => …`) → **invariant**. Each tool literal is `ToolDefinition<{specific}>`; the registry arrays are typed `ToolDefinition<unknown>[]`. `ToolDefinition<{limit?:number}>` is genuinely not assignable to `ToolDefinition<unknown>` (you can't feed `unknown` to a handler expecting `{limit:number}`) → TS2322 at each array element.

**Why it's safe to erase:** the handler is only ever invoked **after** the harness validates `args` against `inputSchema` (the only `.handler(` call sites are inside tool-registry/assistant-tools, post-validation — re-grep `\.handler(` before committing).

**Fix (type-soundness, no behavior change):** introduce a registry-erased element type:
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
and a single `toRegistered<I>(def: ToolDefinition<I>): RegisteredTool` adapter the arrays map through (`ALL_TOOL_DEFINITIONS.map(toRegistered)` / each literal wrapped). Retype `ALL_TOOL_DEFINITIONS` and `toolsForAssistant()` as `readonly RegisteredTool[]`; update consumers (grep `ToolDefinition\[\]` / `: ToolDefinition` in non-definition files). Fold any existing ad-hoc `wrapForRegistry`/`wrapAssistantTool` into the one adapter. **Net: replaces bespoke wrappers with one named boundary** (naming-is-architecture; no `Manager`/`Helper`).

### 4c. Drizzle-zod / zod-v3 signature drift (clears ~13) — per-site, signature-only

These are zod-3.25 / drizzle-zod-0.8.3 API tightenings, **behavior-neutral**:

- **`z.record` single-arg deprecation (TS2554 "Expected 2-3 arguments, but got 1"):** `schemas/bet.schema.ts:62` (`z.record(z.unknown())`), `routes/threads-schema.ts:94` (`z.record(z.unknown())`). zod 3.25 requires the key schema: change to `z.record(z.string(), z.unknown())`. Same wire shape (string-keyed record). Behavior-neutral.
- **`selectBetSchema` inside `z.array()` (TS2345 `BuildSchema → SomeType`):** `schemas/bet.schema.ts:105,106,107,108` — the drizzle-zod 0.8.3 `selectBetSchema` (a `BuildSchema<"select",…>`) isn't directly assignable to zod-3.25's `SomeType` param of `z.array()`. Fix: the drizzle-zod generated schema needs the zod-3.25-compatible wrapper — wrap `betListItemSchema` (= `selectBetSchema`) so its type satisfies `z.ZodTypeAny` (e.g. `selectBetSchema as z.ZodTypeAny` is a **non-boundary** internal schema cast, allowed; or align drizzle-zod/zod versions — but version-alignment is out of AF4 scope, so the local schema-type bridge is correct). This is **not** a route-boundary cast (it's a schema-construction internal); no `any`, no request/response erasure. Re-verify it's still the same parsed shape via the bet route integration tests.

### 4d. PlainPayload union mismatch (TS2322, 4 sites) — per-site narrow

`routes/assistant.ts:100`, `routes/coach.ts:103`, `routes/threads.ts:368`: an object `{ text; refs?; blockId?; toolCalls? }` assigned to `PlainPayload | RedactedPayload | ReviewPayload | QuestionnairePayload | VerdictPayload`. The shape matches `PlainPayload` but TS can't pick the union member from a wide structural literal. Fix: construct the payload as the specific member type (annotate `const payload: PlainPayload = {…}`) or narrow on the discriminant before assignment — **the same `switch(parsed.type)` pattern already at assistant.ts:98**. Behavior-neutral (the runtime already builds a plain payload). Verify against the assistant/coach/threads route integration tests (no payload-shape change).

### 4e. Harness IPC casts (TS2352, 6 src) — narrow the message union

`harness/isolated-harness-adapter.ts:252,256`, `harness/isolated-session-worker.ts:31`, `harness/remote-harness-adapter.ts:219,222,225`: casting a wire message (`object & Record<"type", unknown>` / `{ type: string; sessionId?: string }`) to `{ event: HarnessEvent }` / `{ result: SessionResult }` / `{ message: string }` — neither overlaps. Fix = a discriminated-union narrow on `type` (a small `WorkerMessage` union + a type-guard switch on `msg.type`), not a cast through `unknown`. These are the IPC boundary of the isolated/remote session workers; the guard must preserve the exact runtime dispatch (the `switch` already exists). **Behavior-preserving.** Verify against the worker integration tests. (`isolated-session-worker.ts:32` TS6133 `err` unused — prefix `_err` or use; part of the same narrow.)

### 4f. `unknown` error-handling + possibly-undefined src guards — per-site

- **TS18048 src guards (genuine):** `routes/bets.ts:713,731,755` (`updated` possibly-undefined after an update-returning query — guard `if (!updated) return c.json(404…)`); `services/schedule-label.ts:77,85` (`dow` possibly-undefined — guard the cron-field parse). Real guards (AF2 policy: narrow/early-return, not `!`). State-relevant: verify no rendered-label change for schedule-label (feeds UI strings — check schedule-label unit tests; if none assert the guarded path, safe).
- **TS2345 src `string|undefined`:** `services/schedule-label.ts:68,69` (cron field → `string`), `routes/agent-profile.ts:314` (`string|undefined`→`string`) — guard/default before the call.
- **TS2538 src (undefined as index):** `services/schedule-label.ts:77,85` (`dow` index) — clears with the same `dow` guard above.
- **TS2532 src:** `services/agent-utils.ts:16` (`words[0]`/`words[1]` after `split` — the `length>=2` invariant justifies a commented `!` or destructure-with-guard `const [first, second] = words; if (second) …`).

### 4g. Src tail (per-site, verified at 758)

- **`schemas/index.ts:14` TS2305 (`AppType` not exported from `app.js`)** + **`agent-profile.ts:27` TS2305 (`AgentHealthLevel` not exported from `@hyperidle/shared`):**
  - `AgentHealthLevel` **exists** in `packages/shared/src/team.ts:44` but is **omitted from the index re-export block** (`packages/shared/src/index.ts:206–218` exports the team types but not `AgentHealthLevel`). Fix = **add `AgentHealthLevel` to that `export type {…} from "./team.js"` list** (shared-package edit, behavior-neutral; it's a server consumer of a shared type). ⚠️ shared is a leaf — re-run `tsc -b packages/shared` after editing so server picks it up.
  - `AppType` is a dangling re-export from the reverted Hono-RPC PRs. Determine: restore `export type AppType = …` in `app.ts` if the typed-RPC client is still used, else delete the dead `schemas/index.ts:14` import. Grep `packages/web` for `AppType` consumers (web is AF5-quarantined — grep, don't depend on its compile); note for AF5 if a web import depends on it.
- **`services/team-management.ts:64,112` (TS2554 + TS6133):** `team-management.ts:64` `new ActiveRoutinesError(msg)` — `ActiveRoutinesError` is **referenced but not imported/defined** (resolves to a 2-arg symbol → "Expected 2 arguments, but got 1"). Fix = import or define the `ActiveRoutinesError` class (single-arg `message`). `team-management.ts:112` `_agentIds` unused (TS6133) — remove or use. Verify against team-management integration tests (the error path may be asserted).
- **`services/team-lookup.ts:47` TS2322 (`Row | undefined → Row`):** `return rows[0]` after a `length > 1` guard — but `length === 0` still yields `undefined`. Genuine src guard: `const row = rows[0]; if (!row) throw new ApiError(404, …)` (or return null if the contract allows). **Behavior question:** confirm the caller expects a non-null row; if absence is valid, widen the return type. Verify against team-lookup callers.
- **`services/observability/dispatcher.ts` (4 errors — partially D-candidate §5):**
  - `:248` TS2322 (`number | Timeout → Timeout | null`): `setInterval` returns `NodeJS.Timeout` (node) vs `number` (DOM) — annotate the field `ReturnType<typeof setInterval> | null`. Behavior-neutral.
  - `:454,457` TS2678 (`"response_recorded"` / `"bet_committed"` not comparable to the `DomainEvent` union): these event kinds were **removed** from `DomainEvent` (confirmed: `packages/shared/src/__tests__/o1-event-split.test.ts:153–154` asserts `expectedTypes.has("bet_committed") === false` and `…has("response_recorded") === false`). The `case "response_recorded":`/`case "bet_committed":` labels at 454/457 reference **dead kinds** → **delete those two `case` labels.** They fell through to `return false` (ignored), same as the exhaustive default for any unknown kind → **behavior-neutral**.
  - `:467` TS2322 (`<events> → never`): the exhaustive-`never` check now catches the events left unhandled once 454/457 are removed (and any newly-added kind). **D-candidate (§5):** identify which `DomainEvent` members reach 467; if each should be ignored, add explicit `case … return false` (matches default, behavior-neutral). If a member should produce a real observability event, that's a behavior change → route. Inspect the union vs the handled cases.
- **`routes/tasks.ts:131,142` (TS2322/TS2769, `{}|null → string|null`):** the `updates` object / `JSON.parse` result typed `{}`; type `updates` as `Partial<typeof tasks.$inferInsert>` so field assignments check. Behavior-neutral.
- **`routes/threads.ts:591,793` (TS2345 `Record<string,unknown>[] → { kind: string; … }[]`):** annotate the block arrays from the shared block element type. Behavior-neutral. `routes/threads.ts:307` TS2554 ("Expected 2 args, got 1") — `deriveTitle(row.description)` or the `.limit(1)` row arity; inspect `deriveTitle`'s signature (likely a 2nd required arg added) — supply it or fix the call. Verify against threads route tests.
- **`routes/sessions-routes.ts:292`, `skill-tools/create-item.ts:137`, `skill-tools/create-team.ts:86`, `routes/agent-profile.ts:211,244` (TS2769 no-overload on drizzle insert/update):** the insert/update values object doesn't match `$inferInsert` (a field typed too wide/narrow, or a `{}` placeholder). Type the values from `$inferInsert`; per-site, behavior-neutral.
- **`mcp/mcp-bridge.ts:102,104` (TS2322 `ZodType<unknown> → AnySchema|ZodRawShape`, TS7006 `args` implicit-any):** align the MCP tool-schema param type with the bridge's expected shape and annotate the `args` callback param from the tool's input type. No `any`.
- **`routes/credentials.ts:311` TS6133 (`_exhaustive` unused):** the `CredentialName` switch's exhaustive sentinel is unused → either the switch is now genuinely exhaustive (remove `_exhaustive`) or a case is missing. **D-candidate (§5):** inspect — if a `CredentialName` is unhandled, the default's fail-closed `{ valid:false }` is preserved; route only if a real validator is missing.

---

## 5. Genuine contract bugs — detection + recording (AC3)

### Detection rule

A type error is a **genuine contract bug to route** (not fix-here) iff making the types agree would **change runtime behavior or the wire shape**. Per src error:
1. Sound fix is annotation/guard/narrow with identical runtime → **fix here** (Bucket C).
2. Compiling requires **sending a different field, renaming a wire field, or adding a value the code never produced** → **route to AFxx, record in `plans/Z8/master-flag-register.md`.**

The spec's named drifts (portfolio `title` Z8-019, task `owner`/`startedAt` Z8-024, knowledge `accessCount`) **do not appear as server-src type errors at 758** — confirmed against the 103. They're *omissions* (server simply doesn't send the field), surfacing as **web-side** errors (AF5) or silent runtime gaps, not server compile errors. AF4 does **not** fix them.

### Recording mechanism (verified)

The Z8 register is **`plans/Z8/master-flag-register.md`** — markdown, one `### Z8-NNN — title` section per defect. No JSON/append API. Recording = adding/annotating a section (or a one-line note under an existing entry naming the owning AFxx). AF2/AF3 created **no new Z8 entries** (their genuine fixes were behavior-neutral). AF4 follows the same default: **fix-here is the norm; route only true behavior changes.**

### D-candidates AF4 must adjudicate (re-verified to exist at 758)

| Site | Error | Decision rule | Likely route |
|---|---|---|---|
| `services/observability/dispatcher.ts:467` | exhaustive-never catches unhandled `DomainEvent` (after dead `bet_committed`/`response_recorded` cases removed) | Adding `case … return false` matches the existing default → **fix-here (behavior-neutral)** unless a member needs a real observability event | — (else AF6/observability owner) |
| `routes/credentials.ts:311` | `_exhaustive` unused — possibly non-exhaustive `CredentialName` switch | If a credential is missing a real validator → route; if default fail-closed is intended → fix-here (remove sentinel / add neutral case) | AF11 (Z8-161 credential surface) if behavioral |
| `services/session-provisioning.ts:385` + `skill-tools/handoff-to.ts:54` | `SessionContext.traceId` missing at construction (TS2741) | If a real `traceId` must be threaded → behavior change → route; if optional-by-design → fix the type/supply sentinel | AF7 (session execution) |
| `services/team-lookup.ts:47` | `Row \| undefined → Row` (TS2322) | If null-row is a valid contract → widen return; if invariant → guard+throw (fix-here) | — (fix-here unless caller contract forbids null) |

**NOTE — phantom D-candidate removed:** the old plan's `skill-tools/write-memory.ts:107` (`.id`/`.version` on `KnowledgeItemWithFabric`) **does NOT exist at 758** — it was a cascade phantom. There are **zero** `write-memory.ts` errors in the verified list. Dropped.

For any routed item: add a one-line note to its `### Z8-NNN` entry — `AF4: type checker confirms <drift>; behavioral fix owned by <AFxx>` — and at the server site, satisfy the compiler **without changing behavior** (keep the safe default, narrow to the honest current shape). Never `any`/`@ts-ignore` to defer.

---

## 6. Drain step (AC1 — gate-FORCED, AF2 §4 procedure)

`typecheck-debt.json` `server` entry MUST be removed in the **same commit** that reaches zero. The AF1 stale-ratchet (`scripts/lib/typecheck-verdict.ts` `staleExcepted`) **fails the gate** for a quarantined package with zero own-errors — draining is gate-enforced.

Procedure (AF2 §4, server-specialized):
1. **Build leaves first** (precondition §0): `npx tsc -b packages/shared packages/db`.
2. Confirm clean: `npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | grep -E "^packages/server/[^:]+[:(].*error TS" | grep -vE "error (TS6305|TS6307|TS6059)"` → empty.
3. `jq 'del(.packages["server"])' typecheck-debt.json > tmp && mv tmp typecheck-debt.json`.
4. `npm run check` → server shows **PASS**. After AF4, `typecheck-debt.json` retains only `fabric` (AF3, if not yet drained) and `web` (AF5).

**Do NOT** drain incrementally — server drains once, atomically, when the last error clears. **Do NOT** modify the gate (`scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts`) or `verify` — AF1 owns them.

---

## 7. Ordered task list (builder executes)

1. **Build leaves + re-measure baseline** (§0): `npx tsc -b packages/shared packages/db`, then the regen command. Confirm 758 (103 src / 655 test). If you see ~3780/TS7031, the leaves are stale — rebuild before proceeding (phantom).
2. **ROOT-CAUSE #1 — `middleware/validate.ts` (§4a):** drop the `ReturnType<typeof zValidator>` widening + the hook cast; let `zValidator("json", schema, validationHook)` infer (zod v3, `@hono/zod-validator@0.7.6`). Re-measure: the 16 notifications/observability/git-export `"json"`/`unknown` errors clear.
3. **ROOT-CAUSE #2 — `tool-registry.ts` + `assistant-tools.ts` (§4b):** introduce `RegisteredTool` + one `toRegistered` adapter; retype the arrays + consumers. Re-measure: 33 clear. Run skill-tool integration tests (no behavior change).
4. **Drizzle-zod / zod-v3 signatures (§4c):** `z.record` two-arg fix (bet.schema, threads-schema); `selectBetSchema`/`z.array` schema-type bridge. Re-measure: ~13 clear. Run bet route integration tests.
5. **PlainPayload narrows (§4d)** + **harness IPC narrows (§4e):** annotate to the specific union member / discriminated `WorkerMessage`. Run assistant/coach/threads + worker integration tests.
6. **Src guards + tail (§4f, §4g):** bets/schedule-label/agent-profile guards; `AgentHealthLevel` shared export (rebuild shared leaf after); `AppType` restore-or-delete; `ActiveRoutinesError` import; dispatcher dead-case removal + interval typing; tasks/threads array+update types; drizzle insert/update overloads; mcp-bridge schema+args; team-lookup guard.
7. **D-candidates (§5):** adjudicate the 4. Fix-here-neutral where neutral; for any behavior change, add the `Z8-NNN` note in `plans/Z8/master-flag-register.md` and satisfy the compiler with the honest current type.
8. **Test residual (§3):** per-file index-access/possibly-undefined policy on the 655 test errors. Re-measure to zero.
9. **DRAIN (§6):** leaves built → `tsc -p server` empty → `jq del server` from `typecheck-debt.json` → `npm run check` server PASS. **Same commit.**
10. **Validate:** `npm run check` (server PASS) + `npm run lint` (no-explicit-any green) + `npm run test` + `npm run test:integration` (server's heavy integration suites must stay green) + `npm run verify` (ensure leaves built first, else phantom).

Commit grouping: §4 src fixes one commit per cluster (validate / tool-registry / schemas / per-file); drain is its own final commit. Keep the gate green at each commit (server stays quarantined until the final drain commit).

---

## 8. Acceptance criteria → verification

| AC | Verification method |
|---|---|
| **AC1** server compiles zero errors + off exception list | **Precondition:** `npx tsc -b packages/shared packages/db` first (else phantom). `npm run check` → server row = **PASS** (gate `scripts/typecheck-gate.ts`); `jq '.packages \| keys' typecheck-debt.json` → no `server`. **Regression proof:** inject `const x: string = 123` into `packages/server/src/app.ts`, `npm run check` → FAIL naming server. |
| **AC2** route req/resp types sound, no `any` at boundary | `npm run lint` (`@typescript-eslint/no-explicit-any` + `no-unsafe-*` green); **grep gate:** `git diff origin/main -- packages/server/src \| grep -nE '\bas any\b\|: any\b\|@ts-(ignore\|expect-error)\|as unknown as'` → **zero new** matches in route/middleware files. The §4a fix makes `c.req.valid("json")` typed — verified by the absence of `"json" not assignable to never` (TS2345) post-fix. |
| **AC3** genuine contract bugs fixed or recorded | Each §5 D-candidate either compiles behavior-neutrally OR has a `Z8-NNN` note in `plans/Z8/master-flag-register.md` naming the owner. `git diff plans/Z8/master-flag-register.md` shows added notes; no silent suppression (AC2 grep gate proves zero `@ts-ignore`). |
| **AC4** `npm run verify` passes | Run it (after building leaves); green end-to-end (check + lint + knip + test:all + build + attestation). |

---

## 9. Risks / ambiguities

- **Build-phantom precondition (§0)** — the #1 operational risk. If the builder runs `check`/`verify` without `tsc -b packages/shared packages/db` first, the baseline shows ~3780/TS7031=3148 and looks unfixable. **It is not server work.** Always build leaves first. CI validates only the attestation signature, so this never fails CI — but it derails local measurement.
- **`@hono/zod-validator@0.7.6` typing (§4a)** — installed `dist/index.d.ts` is dual v3/v4 (`ZodSchema = v3.ZodType | v4.$ZodType`). The fix relies on the second `zValidatorFunction` overload inferring once the hook cast and the `ReturnType` widening are removed. zod is **v3** — `z.ZodTypeAny ⊆ v3.ZodType`, constraint is fine. If inference can't be expressed cleanly, fallback is a typed `ValidatedJson<T>` helper — never `as Shape` at the boundary.
- **zod v3.25 `z.record` arity (§4c)** — `z.record(value)` single-arg is what triggers TS2554; v3.25 wants `z.record(key, value)`. NOT a v4 change. Same wire shape.
- **drizzle-zod 0.8.3 × zod 3.25 `selectBetSchema` (§4c)** — the `BuildSchema → SomeType` mismatch is a version-interaction; the local schema-type bridge (`as z.ZodTypeAny` on the internal schema, NOT a request/response boundary cast) is the in-scope fix. Version-alignment is out of AF4 scope.
- **`AgentHealthLevel` shared export (§4g)** — editing `packages/shared/src/index.ts` touches a leaf; **re-run `tsc -b packages/shared`** so server sees the new export, else the error appears unfixed.
- **`AppType` (§4g)** — restore-or-delete decision; grep web (AF5-quarantined) for consumers; note for AF5 if a web import depends on it.
- **`ToolDefinition` erasure (§4b)** — confirm the only `.handler(` call sites are post-validation (re-grep before committing). If any caller invokes `handler` with a typed narrow arg, the erased `unknown` handler regresses that site.
- **dispatcher dead cases (§4g/§5)** — `bet_committed`/`response_recorded` removal is confirmed behavior-neutral by the o1-event-split test asserting their absence; but re-run the dispatcher/observability integration tests after removing the cases.
- **AF3 dependency** — AF4 depends on AF3 (fabric) being type-green/stable for any `KnowledgeItemWithFabric`-shaped types. At 758 there are **no** such server errors (the old write-memory phantom is gone), so the coupling is weaker than feared — but confirm AF3 leaves are built before measuring.

---

## 10. Required reading (builder)
- **§0 build precondition** — `npx tsc -b packages/shared packages/db` BEFORE any check/verify. Non-negotiable; the phantom trap lives here.
- `plans/AF2/architecture.md` §1 (binding policy), §4 (drain procedure) — inherited, non-negotiable.
- `scripts/typecheck-gate.ts`, `scripts/lib/typecheck-verdict.ts` — gate mechanics (read-only; do NOT modify).
- `.github/workflows/ci.yml` + `scripts/check-attestation.ts` — CI validates attestation only, not the gate (§0).
- `typecheck-debt.json` — drain target (`server` entry).
- `.claude/rules/typescript.md` — strict-mode / no-`any` contract.
- `plans/Z8/master-flag-register.md` — Z8 recording target.
- `packages/server/src/middleware/validate.ts`, `skill-tools/tool-registry.ts`, `skill-tools/assistant-tools.ts` — the two root-cause src fixes.
- `node_modules/@hono/zod-validator/dist/index.d.ts` + `node_modules/zod` (v3.25.76) + `node_modules/drizzle-zod` (0.8.3) — verify §4a/§4c signatures against the **installed v3** types.

## 11. protectedTests
- **All existing `packages/server/src/**/*.test.ts(x)` and `*.integration.test.ts` assertions** — the test bucket (§3) may add type annotations / `!` / `toBeDefined()` narrowing but MUST NOT change any `expect(...)`. DoD audits with `git diff` on the test set: only type-level additions, no assertion deltas.
- `packages/shared/src/__tests__/o1-event-split.test.ts` — asserts `bet_committed`/`response_recorded` are NOT in the event union; the dispatcher dead-case removal (§4g) must keep this green.
- No server unit/integration test asserts on the *types* being fixed; the proof of no-runtime-regression is the existing suites staying green (`npm run test:integration`).

## 12. Security & abuse cases
- **Route-boundary input trust (§4a):** the `validateBody` fix **tightens** the boundary — `c.req.valid("json")` becomes typed, so handlers stop treating validated bodies as `unknown`. Security *improvement*; it must not *widen* what passes validation — the Zod schemas are unchanged, only their type surfacing. Verify: the 400 `validationHook` path is untouched; integration tests asserting 400 on bad input stay green. **Applicable + addressed.**
- **Harness IPC narrows (§4e):** the worker-message narrowing must preserve the exact runtime dispatch — a misrouting guard is a session-isolation issue. The type-guard mirrors the existing runtime `switch`. Verify against worker integration tests. **Applicable + addressed.**
- **Credential switch (§4g, credentials.ts:311):** if a `CredentialName` case is genuinely missing, that's a security-relevant gap (validated by the catch-all "Unknown" default instead of its validator). **Routed to AF11 if behavioral** (§5); the default returns `{ valid:false }` (fail-closed) — preserve under any type fix. AF4 must not silently make it "valid".
- No new routes, credentials, outbound URLs, or path inputs. SSRF / path-traversal / rate-limit / secret-handling: **N/A** (type-only workpackage).

## 13. route-checklist
- N/A — no routes added/moved. The §4a cluster spans `routes/{notifications,observability,git-export}-routes.ts` config-PATCH handlers (the web-consumed boundary AC2 targets) — sound-types focus, not new mounts.

## 14. Migrations
- N/A — no symbol renames/moves except: restoring-or-deleting the dead `AppType` re-export (§4g), and adding `AgentHealthLevel` to the shared index export (§4g, additive — no consumer breaks). The only "migration" is the `typecheck-debt.json` `server`-entry deletion (§6).

## 15. sharedFiles
- `typecheck-debt.json` — also drained by AF3 (fabric) / AF5 (web). AF4 removes only its `server` entry; sequential per the AF dependency chain (AF2 → AF3 → AF4 → AF5).
- `packages/shared/src/index.ts` — touched for the `AgentHealthLevel` export (§4g); a leaf every package imports — rebuild after editing.
- `packages/server/src/app.ts` (`AppType` re-export) — touched; the server entry other workpackages import.
- `packages/server/src/middleware/validate.ts`, `skill-tools/tool-registry.ts`, `skill-tools/assistant-tools.ts` — the root-cause fixes; signature-shaping, may affect imports.
- `plans/Z8/master-flag-register.md` — appended-to if any D-candidate routes (also touched by AF10–AF16 owners).
