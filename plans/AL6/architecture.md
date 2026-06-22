# AL6 — Architecture: Harness review-return hooks

Implements `plans/AL6/concept.md`. Span: agent-runtime / harness-adapter / tool layer. No DB changes. No verdict/thread change. No new harness type.

## 0. `/design` skip — confirmed, no UI surface

Walking the AC list against the human-interface layer: AC1–AC5 are all about *turn lifecycle enforcement* — there is **no page, no component, no route, no visible state, no user-facing affordance**. The only externally-observable artifact is a server-side outcome/event (`not-returned`) consumed by existing surfaces (inbox/observability), not a new UI. The WP spec states "No UI surface — this is a harness/agent-layer enforcement mechanism" and "Human design review: No." **`/design` is correctly skipped.** Memory note [feedback_no_skeleton_error_in_initial_designs] is moot (no design variants exist).

---

## 1. The single source of truth: the accepted-return set

Lives in `packages/shared` so the tool layer, every adapter, and the enforcement observer import **one** definition (AC2, AC4).

**New file:** `packages/shared/src/harness/return-actions.ts`

```ts
/**
 * AL6: The closed, enumerable set of "return to HyperIdle" actions. A turn that
 * ends without invoking one is `not-returned` (see drainTurn). This set is CLOSED:
 * membership is a fixed list of tool names, never "any tool". Adding a member is a
 * deliberate edit here. (AC2: HyperIdle enumerates valid turn endings by reading
 * RETURN_ACTION_NAMES.)
 */
export const RETURN_ACTION_NAMES = ["submit_review", "handoff_to", "send_message"] as const;
export type ReturnActionName = (typeof RETURN_ACTION_NAMES)[number];

const RETURN_ACTION_SET: ReadonlySet<string> = new Set(RETURN_ACTION_NAMES);

/**
 * AL6: Per-tool return predicate. A `tool_call` counts as a return when its name
 * is in the closed set AND its argument-gated predicate holds. The three v1 members
 * are unconditionally terminal; the predicate hook exists so an argument-gated member
 * (e.g. update_task_status -> done/cancelled) can be added WITHOUT widening the set
 * to "any tool with the right args" (concept §2.1, path A).
 */
export function isReturnAction(toolName: string, _args: Record<string, unknown>): boolean {
  return RETURN_ACTION_SET.has(toolName);
}
```

Notes:
- v1 ships the **name-only** trio (concept §2 recommendation). `update_task_status` is **deferred** (concept §2.1 path B) to keep v1's set a pure name-set; the `_args` param + predicate shape are pre-wired so adding the argument-gated member later is a one-tool edit, not a model change. ⚠ Architecture decision recorded: v1 = trio; predicate signature future-proofs path A.
- Exported via `packages/shared/src/harness/index.ts` and re-exported from `packages/shared/src/index.ts` (alongside the existing harness exports at index.ts:188).
- **No DB, no schema, no migration.** A frozen constant.

### 1.1 Tagging the tools as terminal (closing the drift gap)

The concept requires each return tool to be *tagged terminal at its definition* so the set is the closure of those tags (not a hand-maintained parallel list). Implement with a **type-level closure guard**, not a runtime flag (the tools live in `packages/server`, the set in `packages/shared`; we cannot import server tools into shared without a cycle). Instead:

- Keep `RETURN_ACTION_NAMES` as the authority.
- Add a **lint/type guard** (§5, AC2) that asserts every name in `RETURN_ACTION_NAMES` corresponds to a real registered tool in `ALL_TOOL_DEFINITIONS` — so the set can never name a tool that does not exist, and a renamed tool breaks the build. This is the closure guarantee without a package cycle.

---

## 2. The harness-agnostic enforcement seam: `drainTurn`

**The one seam = consumption of `harness.streamEvents()`.** Concept §3.2 (re-grepped) enumerates **five** `for await … streamEvents` loops: **two enforced turn drains** (`runSession` Phase 10 at `session-provisioning.ts:760`; `assistant-turn`'s `drainStreamEvents` at `:661`), **one exempt internal-extraction drain** (`bet-decomposition.ts:616` — `tools: []`, deterministic JSON parse, §1.5), and **two forwarding relays** (`isolated-session-worker.ts:54`, `desktop-worker-client.ts:223`, §1.6). The architecture funnels the two enforced drains through one shared observer; the extraction drain stays exempt-by-construction (no gate wired, justified by the §1.5 predicate); the relays are never gated. A static guard (§2.3) keeps a *future* unexempted turn drain from forgetting the gate while not firing on relays or declared-exempt extraction drains.

**New file:** `packages/server/src/harness/return-gate.ts`

```ts
import { isReturnAction, type HarnessEvent } from "@hyperidle/shared";

/** AL6: Per-turn observer. Pure, allocation-light, harness-agnostic. */
export interface ReturnGate {
  /** Call for every consumed HarnessEvent. Records whether a return action was seen. */
  observe(event: HarnessEvent): void;
  /** True once any consumed tool_call satisfied isReturnAction. */
  readonly returned: boolean;
}

export function createReturnGate(): ReturnGate {
  let returned = false;
  return {
    observe(event: HarnessEvent): void {
      if (event.type === "tool_call" && isReturnAction(event.toolName, event.args)) {
        returned = true;
      }
    },
    get returned(): boolean {
      return returned;
    },
  };
}

/** AL6: outcome of evaluating the gate at stream-exhaust. */
export type ReturnVerdict = "returned" | "not_returned";

/**
 * AL6: Evaluate the gate ONLY on a normal completion. Crashed / aborted /
 * budget_exhausted turns are exempt (concept §3.3) — the agent was prevented from
 * finishing, not refusing to return.
 */
export function evaluateReturn(
  gate: ReturnGate,
  endReason: "completed" | "crashed" | "stopped" | "budget_exhausted",
): ReturnVerdict {
  if (endReason !== "completed") return "returned"; // exempt → never flagged
  return gate.returned ? "returned" : "not_returned";
}
```

Why an observer object threaded into the *existing* loops, rather than a wrapper that owns the whole loop: the two drain loops already do real per-event work (cost accumulation, tool interception, completion capture). A `for await … { gate.observe(event); /* existing branches */ }` insertion is minimal, total, and impossible to half-apply. Wrapping the iterable in a new helper that re-yields would duplicate the loop body and risk drift. **One line per loop + one evaluate at teardown.**

### 2.1 Wiring site A — task sessions (`session-provisioning.ts`, `runSession` Phase 10)

- Construct `const gate = createReturnGate();` before the Phase-10 `for await`.
- Inside the loop, first statement: `gate.observe(event);` (before the existing `cost_update`/`tool_call`/`error` branches). This sees **every** adapter's tool_call (builtin internal-emit, CLI/remote stream, mock) — the agnostic point (concept §3.2).
- At teardown, map the existing terminal branch to an `endReason` and evaluate:
  - `crashed` → exempt
  - `budgetExhausted` → exempt
  - `aborted` (the `if (aborted) break;` path) → exempt (`stopped`)
  - normal completion → `evaluateReturn(gate, "completed")`.
- On `not_returned`: emit a new `session_not_returned` event (see §3) and record the verdict on the `ProvisionSessionResult` (additive optional field `returnVerdict?: ReturnVerdict`). The session still ends via `endSession` (flag policy — concept §3.4). **No behaviour change to endSession itself.**

### 2.2 Wiring site B — conversational assistant turns (`assistant-turn.ts`, `drainStreamEvents`)

`drainStreamEvents` consumes `adapter.streamEvents(handle)`. Thread the same gate:
- Pass a `gate` into `drainStreamEvents`, call `gate.observe(event)` in its `for await`.
- The assistant reply persistence (the "NEVER silent" plain-reply insert) **is itself a structural return** (concept §4.4): the turn always surfaces output into a human-attended thread. So for the assistant path the verdict is effectively always `returned` *by construction*. To make that explicit and checked at the same seam, treat the **completion-persist as a return**: when `runTurnInternal` persists the reply, the turn is returned; only an error/timeout path (which already persists a notice) is non-completion. **Concretely:** the assistant path does not need `session_not_returned` because it cannot exhaust-without-surfacing — but we still construct + observe the gate so the *mechanism* is uniform and a future assistant tool that suppressed the reply would be caught. ⚠ Decision: assistant path is compliant-by-construction; gate is wired for uniformity + future-proofing, not because a hole exists today.

### 2.3 Site C — the internal-extraction drain exemption (`bet-decomposition.ts`, `drainForCompletion`)

`drainForCompletion` is a genuine session run (`startSession` → `for await … streamEvents` → `stopSession`) but an **internal-extraction drain** under concept §1.5: its `SessionConfig.tools` is `[]`, it consumes only `completion`/`error` events and returns the raw text for `JSON.parse`, and it is platform-internal (decompose a bet into tasks). **It is exempt — no gate is wired here.** The exemption is recorded as a property, not a special case:

- The §1.5 predicate is implemented as a tiny pure helper alongside the gate: `isInternalExtractionDrain(config: SessionConfig): boolean` → `config.tools.length === 0` (the one *machine-checkable* leg of the three-property predicate; the other two — deterministic-parse and platform-internal — are call-site contracts the empty-tools leg already implies for any platform-internal drain, since a tool-less run cannot invoke a return and cannot act on the user's behalf).
- At the `bet-decomposition` drain we add a **one-line lore-bearing exemption marker** (an `// AL6-exempt: internal-extraction drain (tools:[]), see concept §1.5` comment plus, for the lint guard, a single sanctioned `gate.exempt` declaration — see §2.3.1) so the static guard recognises it as *intentionally ungated*, not *forgotten*.

This means a future internal-extraction turn with `tools: []` is covered by the same predicate and the same exemption path — no per-call-site special-casing in the gate logic, and the closed-set / AC1 guarantee stays exact (AC1 quantifies over turns, and an extraction drain is not a turn).

### 2.3.1 The static guard — distinguishing turn drains from relays and exemptions (AC4's load-bearing decision; re-scoped per critique)

Risk: a *future* unexempted turn drain forgets the gate. The naïve rule — "every `for await … streamEvents` must call `ReturnGate.observe`" — is **wrong**: it fires on the two forwarding relays (`isolated-session-worker.ts:54`, `desktop-worker-client.ts:223`) and on the exempt extraction drain, forcing `eslint-disable` comments — the exact drift the guard exists to prevent. The rule must **classify** each `for await … streamEvents` loop into one of three kinds and enforce per-kind.

**Classification — how the rule tells them apart (AST-local, no type info needed):**

| Kind | Structural signature in the loop body | Rule requirement |
|---|---|---|
| **Turn drain** | Default: a `for await` over `<x>.streamEvents(...)` whose body does **not** match either signature below. | **Must** call `<gate>.observe(event)` for the iterated event (a `CallExpression` whose callee is a member `observe` on an identifier bound to `createReturnGate()`), **and** the enclosing scope must call `evaluateReturn(...)`. |
| **Forwarding relay** | Loop body's only non-trivial statement re-emits the event via a transport sink — `process.send({ type: "event", … })` or `this.<x>.postMessage/forward(event)` / a sanctioned `// AL6-relay` marker. No completion-parse, no `stopSession`-derived verdict. | **Must NOT** call `observe`. Relay is gated once at its parent enforced drain. |
| **Exempt extraction drain** | A sanctioned `// AL6-exempt: internal-extraction drain` marker on the loop **and** the drain's `SessionConfig` has `tools: []` (the marker is the rule's signal; `tools:[]` is the concept-level justification, checked by the T7-adjacent unit test below, not the lint rule). | **Must NOT** require `observe`; the marker suppresses the turn-drain requirement *for that loop only*, and the rule asserts the marker is paired with an actual `tools: []` extraction (so the marker can't be abused to silence a real turn drain). |

**Implementation:** a local ESLint rule (new `eslint-plugin-harness`, or a rule added to the existing `eslint-plugin-design`) keyed on `ForOfStatement` with `await` whose right-hand side is a `CallExpression` to `.streamEvents`. It reads the two explicit markers (`// AL6-relay`, `// AL6-exempt: internal-extraction drain`) to classify relay/exempt; everything else is a turn drain and must `observe`. The markers are deliberate, greppable, and few (two relays + one extraction today), so they document intent rather than suppress a warning. **This is a static property → lint, never a test** (per CLAUDE.md). A companion **value-import unit test** (not the lint rule) asserts the exemption marker's claim is true — that `bet-decomposition`'s drain config has `tools: []` — so the marker cannot lie; see §5 AC4 row.

Lower-effort fallback if AST rule authoring exceeds budget: keep the two marker conventions and a grep-backed lint asserting (a) every `for await … streamEvents` loop carries exactly one of `observe(` / `AL6-relay` / `AL6-exempt`, and (b) no `eslint-disable` accompanies them. Architecture recommends the AST rule (precise classification) but accepts the marker+grep guard.

### 2.4 The MCP-bridge verification item (concept §4.2 — top risk)

CLI/remote adapters with `mcpSupport` invoke tools via the MCP bridge, not via `registry.invoke` in the provisioning loop. **Must verify** the adapter still surfaces a stream `tool_call` event for the return tool (the provisioning loop emits `tool_call_recorded` for it at session-provisioning.ts:817-829, implying the event reaches the stream — but the *return tool specifically* must be confirmed to surface). Build task T7 below proves this with a test.

**Fallback if the stream does NOT surface MCP return tool_calls:** observe at the **MCP bridge invoke boundary** instead — `packages/server/src/mcp/mcp-bridge.ts`'s `createMcpBridge({ sessionId, registry })` funnels every MCP tool call through `registry.invoke`, keyed by `sessionId`. A `sessionId → ReturnGate` map updated at that boundary is *also* fully harness-agnostic (every MCP harness funnels through one bridge). The architecture keeps this as the documented fallback; T7 decides whether it's needed. Either way the agnostic claim holds — both candidate boundaries (`streamEvents` consumption and `registry.invoke`) are single funnels, not per-adapter.

---

## 3. Event surface

**New event:** `SessionNotReturnedEvent` in `packages/shared/src/events/` (alongside existing session events).

```ts
export interface SessionNotReturnedEvent {
  readonly type: "session_not_returned";
  readonly streamId: string;   // sessionId (event-bus stream key convention)
  readonly sessionId: string;
  readonly agentId: string;
  readonly taskId: string;
  readonly timestamp: number;
}
```

- Added to the `DomainEvent` union and the event-bus type map (same pattern as `session_started` / `session_ended`).
- Emitted by `runSession` when `evaluateReturn(...) === "not_returned"`.
- **Consumers (out of AL6 scope, additive later):** observability dashboards / an attention-inbox item. AL6 only *emits* it — making the escape visible (AC3: "surfaced as not-yet-returned"). No consumer is required for the AC to pass; the emission + the recorded outcome is the surfacing.

**No new API route.** No HTTP surface. The mechanism is internal to the session run.

---

## 4. Types / schemas / DB

- **DB:** none. No table, no column, no migration. `not-returned` is a runtime outcome + an event, not persisted state. (If a future WP wants a durable "escapes" ledger, that is additive.)
- **Schemas:** none new at the tool boundary; tool input schemas unchanged.
- **`ProvisionSessionResult`:** additive optional `returnVerdict?: "returned" | "not_returned"` so callers/tests can assert without parsing events.
- **Shared exports:** `RETURN_ACTION_NAMES`, `ReturnActionName`, `isReturnAction` (from `harness/return-actions.ts`); `SessionNotReturnedEvent` (from events).

---

## 5. Per-AC verification methods

| AC | Property | Method |
|---|---|---|
| **AC1** — every turn ends by invoking a member of the set; a turn ending without one is not accepted as complete | runtime behavior | **Integration test** (`return-gate.integration.test.ts`): drive `runSession` with a mock adapter whose stream invokes a non-return tool then exhausts → assert `returnVerdict === "not_returned"` AND a `session_not_returned` event was emitted on `eventBus`. Drive one whose stream invokes `submit_review` → assert `"returned"`, no event. |
| **AC2** — the accepted-return set is closed + enumerable | **value-import unit test** (+ type) | **Value-import unit test** `return-actions.closure.test.ts` — imports the constant and asserts on its *value*, NOT a filesystem read: `expect([...RETURN_ACTION_NAMES].every(n => ALL_TOOL_DEFINITIONS.some(d => d.name === n))).toBe(true)` (closure: every named return maps to a real registered tool). This is a legitimate runtime unit test (imports `RETURN_ACTION_NAMES` and `ALL_TOOL_DEFINITIONS`, asserts a relation between two imported values) — **the builder must NOT write a `readFileSync`/grep "lint" for this; the value-import test is the correct and required form.** The "closed, not open-ended" leg is enforced additionally by the **type** (`ReturnActionName` is a finite union from an `as const` readonly tuple, not widenable to `string[]`) — a `check`-time guarantee, not a separate lint. (Re-labelled per critique: previously mis-tagged "static property → type/lint"; the actual method is a value-import unit test, kept as-is.) |
| **AC3** — attempt to end without a return is detected + not silently completed | runtime behavior | **Unit test** of `createReturnGate`/`evaluateReturn`: observe a stream of non-return `tool_call`s → `evaluateReturn(gate,"completed") === "not_returned"`. **Integration test** asserts the `session_not_returned` emission (the surfacing). |
| **AC4** — enforcement holds uniformly across harnesses | runtime behavior + static | **Parameterized integration test** running the *same* gate assertion against builtin-shaped, CLI-shaped, remote-shaped, and mock adapters (via `MockHarnessAdapter` configured to emit each adapter's tool_call pattern) → all four yield identical verdicts. **Plus** the §2.3.1 classifying **lint rule** (static) proving every *turn drain* threads the gate while *relays* and *exemption-declared extraction drains* are excluded by their markers (so the rule neither misses a future drain nor forces `eslint-disable` on a relay). **Plus** a **value-import unit test** asserting the exemption marker's claim — `bet-decomposition`'s drain `SessionConfig.tools` is `[]` — so an exemption marker cannot mask a real (tool-bearing) turn drain. T7 proves the MCP-bridge path. |
| **AC5** — mid-turn non-terminal tool use unaffected | runtime behavior | **Unit test**: a gate observing ten non-return `tool_call`s followed by one `submit_review` → `returned`; the same ten with no return → `not_returned`. Asserts the gate never blocks/rejects a mid-turn event (it only reads). **Integration**: a `runSession` whose mock adapter calls `read_inbox`+`write_memory` mid-turn then `submit_review` completes normally with `"returned"` and the mid-turn tools executed. |

All runtime tests import the module and assert on behavior (per `.claude/rules/testing.md`). AC2's closure check is a value assertion on imported constants — a legitimate unit test, **not** a filesystem grep and **not** a lint rule. The one genuinely-static property → lint is the §2.3.1 **classifying** drain guard (AC4), which distinguishes turn drains (must `observe`) from forwarding relays and exemption-declared extraction drains (must not) — re-scoped per critique so it does not fire on the two relays or the `bet-decomposition` extraction drain.

---

## 6. Ordered task list (each independently committable)

1. **T1 — Shared accepted-return set.** Add `packages/shared/src/harness/return-actions.ts` (`RETURN_ACTION_NAMES`, `ReturnActionName`, `isReturnAction`); export from `harness/index.ts` + `shared/src/index.ts`. *Commit: "feat(AL6): closed accepted-return set in shared".*
2. **T2 — Closure guard (AC2).** Unit test `return-actions.closure.test.ts` asserting every name maps to a real `ALL_TOOL_DEFINITIONS` entry + the readonly-union type holds. (RED first: write before T1 lands if doing strict TDD; ordered here for readability.) *Commit: "test(AL6): accepted-return set closure + enumeration".*
3. **T3 — Return gate observer.** Add `packages/server/src/harness/return-gate.ts` (`createReturnGate`, `evaluateReturn`, `ReturnVerdict`). Unit tests for AC3/AC5 gate behavior. *Commit: "feat(AL6): per-turn return gate observer".*
4. **T4 — `session_not_returned` event.** Add `SessionNotReturnedEvent` to shared events + bus type map. *Commit: "feat(AL6): session_not_returned event".*
5. **T5 — Wire site A (task sessions).** Thread gate into `runSession` Phase 10; map endReason; emit event + set `returnVerdict` on result. Integration tests for AC1/AC3. *Commit: "feat(AL6): enforce return gate in task session drain".*
6. **T6 — Wire site B (assistant turns).** Thread gate into `drainStreamEvents`; document compliant-by-construction. Test that an assistant completion is `returned`. *Commit: "feat(AL6): wire return gate into assistant turn drain".*
7. **T6b — Mark site C exempt (extraction drain).** Add `isInternalExtractionDrain(config)` helper (`config.tools.length === 0`) next to the gate; add the `// AL6-exempt: internal-extraction drain (tools:[]), see concept §1.5` marker on `bet-decomposition.ts`'s drain loop. Value-import unit test asserting `bet-decomposition`'s drain config has `tools: []` (so the exemption is true, not a silencer) — supports the §5 AC4 row. **No gate wired here.** *Commit: "feat(AL6): exempt internal-extraction drain from return gate".*
8. **T7 — MCP-bridge path verification (AC4 risk).** Test that a CLI/remote (mcpSupport) adapter's return tool surfaces a stream `tool_call` (gate fires). If it does NOT, implement the `mcp-bridge.ts` invoke-boundary fallback (`sessionId → gate`) and test that. *Commit: "test(AL6): MCP-bridge return surfaces to gate" (+ fallback if needed).*
9. **T8 — Uniformity test (AC4).** Parameterized integration test: same verdict across builtin/CLI/remote/mock adapter shapes. *Commit: "test(AL6): return gate uniform across harness adapters".*
10. **T9 — Classifying drain lint guard (AC4 static, re-scoped).** ESLint rule (or marker+grep guard) over `for await … streamEvents` loops that classifies each as turn-drain / forwarding-relay / exempt-extraction-drain (§2.3.1) and enforces per-kind: turn drains must `observe`; relays (`// AL6-relay` on `isolated-session-worker.ts:54`, `desktop-worker-client.ts:223`) and exempt drains (`// AL6-exempt` on `bet-decomposition.ts:616`) must not. Add the two `// AL6-relay` markers as part of this task. Verify the rule does NOT force any `eslint-disable`. *Commit: "feat(AL6): classifying lint guard — turn drains gated, relays/extraction exempt".*

Builder note: T1–T4 are leaf/no-blast-radius; T5–T6 touch the two enforced drain sites (the behavioural core); T6b marks the exempt extraction drain; T7 is the conditional-fallback risk item; T8–T9 close AC4. T9 must be authored against the **three-way classification** (§2.3.1), not a blanket "every drain must observe" rule — the latter would force `eslint-disable` on the relays and the extraction drain. Run `npm run check && npm run lint && npm run test` after each; full `test:all` once at the end (memory [feedback_agent_efficiency]).

---

## 7. Trade-offs quantified

- **Flag vs redirect (concept §3.4).** Flag chosen for v1. Cost of flag: a `not-returned` turn still settles (the escape is *visible*, not *prevented*) — but it is uniformly enforceable at the agnostic seam with **zero per-adapter code** and **no re-prompt round-trip**. Redirect would prevent the escape but is **not uniformly achievable**: builtin could re-prompt natively, CLI/remote cannot be forced to take a final step without per-adapter protocol changes — violating AC4's "uniformly" if done partially. Flag satisfies AC3 ("surfaced as not-yet-returned") at ~80 LOC; redirect would be L-effort per adapter and risk a non-uniform gate. **Redirect is a clean additive follow-up where the harness supports it.**
- **Observer-in-loop vs wrapper-iterable.** Observer = +1 line per existing loop, 0 duplication. Wrapper = a re-yielding generator that duplicates the per-event branch logic (cost/tool/error) or forces every consumer through a new signature — higher coupling surface, more migration. Observer wins on both complexity and coupling.
- **Shared constant vs per-package list.** Single `packages/shared` constant = one import everywhere, closure-guarded. A per-package copy would drift (the exact AC2 "closed" failure mode). Cost of shared: one new file + two re-exports. Trivially worth it.
- **No DB.** `not-returned` as event+outcome (not a row) keeps verdict/thread schema untouched (hard constraint) and adds zero migration/coupling. If durability is later needed it's purely additive.

## 8. Source-driven notes

- No external framework API is newly used; the work is internal TS over existing event/adapter contracts. ⚠ UNVERIFIED items: none requiring doc lookup — all touched contracts (`HarnessAdapter.streamEvents`, `ToolCallEvent`, the event bus) are first-party and read directly from source in this pass.
