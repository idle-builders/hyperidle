# AL6 v4 — Concept: Harness review-return hooks

**Status:** v4 (decisive redesign), revision 2. v1 (flag-only), v2 (Claude-SDK-only forcing), v3 (provisioning re-prompt loop + sandbox-file rewrite) were ALL founder-rejected. v4 builds to the founder's own design. **Revision 2 grounds every harness/hook claim in the actual codebase + real tool docs** (the v4-r1 critique caught fictional `codex`/`gemini` adapters — corrected below).

**Founder's v4 direction (verbatim intent):** *"The hooks were the right thing. Provisioning hooks should be part of the harness adapter or sandbox setup just like skills or anything else are. All these harnesses provide support for hooks these days."*

**Verified correction to the premise (r2):** the integrated non-Claude CLIs (the only ones in the tree — **aider, goose, opencode**) *do* support hooks, but **none supports a BLOCKING turn-end hook**. goose + opencode follow the *Open Plugins hooks spec*, which is fire-and-forget by design ("Failures MUST NOT crash the host tool"; exit 0 = success; no `decision`/`block`/`reason` output). aider has no hook system at all (only a fire-and-forget `--notifications-command`). Only the **Claude** harnesses (SDK in-process `Stop` closure; Claude Code CLI `.claude/settings.json` `Stop` hook) have a hook engine that can BLOCK a stop and feed a reason back to the model. Sources + file:line proof in `architecture.md §0` + §3. The founder's "all these harnesses provide support for hooks" is true for *observability* hooks and false for *blocking* ones — a scope decision flagged for the orchestrator (see §11).

---

## 1. The one-sentence concept

**A return-enforcement hook is provisioned into each harness's native hook system at sandbox/session setup — exactly the way `.mcp.json`, `CLAUDE.md`, and skills are already provisioned — under ONE provisioning contract (`provisionReturnHook`); where the harness has a BLOCKING turn-end hook (the Claude harnesses) the hook fires at turn-end, asks HyperIdle "has this session returned?" over the existing MCP bridge, and blocks the turn-end (re-injecting the return instruction) until a return action is seen; where the harness has NO blocking hook engine (aider/goose/opencode today) the same contract declares `nativeReturnHook: "none"` and HyperIdle's kept drain-end `ReturnGate` records `not_returned` as the documented, un-bypassable floor.**

The mechanism lives in the harness *where the harness can block*. The *adjudication* (the closed return set) always stays in HyperIdle. HyperIdle's job is to PROVISION the hook per-adapter under one contract and to ANSWER the hook's query — not to run a re-prompt loop or rewrite an instruction file.

**"Uniform across harnesses" is delivered as:** native-hook-enforced (block + re-inject) where a blocking hook engine exists; gate-backstopped (`not_returned` at drain-end, surfaced, never silently `completed`) where it doesn't — **one provisioning contract, one adjudication source of truth, for all.** This is exactly what AL6's AC permits: *"redirected to return, OR surfaced as not-yet-returned."*

---

## 2. What a "provisioned native hook" IS (and what it replaces)

### 2.1 IS
A **hook config artifact written into the sandbox (or a closure passed to the harness at startSession) that registers a turn-end / Stop hook in the harness's own native hook mechanism — for the harnesses whose hook engine can BLOCK.** When the harness's agent loop reaches the end of a turn, the harness — not HyperIdle's provisioner — invokes the hook. The hook:
1. Calls back to HyperIdle (`hyperidle_return_status` MCP tool on the session's bridge) to ask "did this session return yet?"
2. If **returned** → the hook permits the turn to end (`decision: approve` / exit 0).
3. If **not returned** AND budget remains → the hook **blocks the turn-end** and feeds the return instruction back to the model (`decision: block` + `reason` for the SDK closure; exit-code-2 + stderr for the Claude Code CLI command hook), so the harness continues the SAME turn and the model gets another chance to call a return action.
4. If **not returned** AND budget exhausted → the hook permits the end; HyperIdle records `not_returned` (the honest reject floor).

For a harness with **no blocking hook engine** (`nativeReturnHook: "none"`): no block step exists. The drain-end `ReturnGate` is consulted once at end; a no-return end is recorded `not_returned` and surfaced — never silently `completed`.

The hook is "first-class provisioning" in the same sense as the three existing sandbox-provisioned artifacts:

| Provisioned artifact | Written where | Read by harness | v4 analogue |
|---|---|---|---|
| `CLAUDE.md` / `AGENTS.md` | sandbox root (`writeSandboxAgentsMd`) | every harness, from `cwd` | — |
| `.mcp.json` | sandbox root (`session-provisioning.ts` Phase 8b) | MCP-capable harnesses, from `cwd` | the bridge the hook calls back over |
| skills | sandbox skill dir | skill-capable harnesses | — |
| **return-enforcement hook** | **`.claude/settings.json` (Claude CLI) OR `options.hooks` (Claude SDK in-process); `"none"` for hookless CLIs** | **each harness's native hook engine, where one exists** | **NEW — the v4 deliverable** |

### 2.2 REPLACES (deleted in v4)
- The v3 **provisioning re-prompt loop** in `runSession` (`session-provisioning.ts`) — the `while(true)` that re-`startSession`s the adapter N times per turn.
- The v3 **sandbox-instruction-file forcing-rewrite carrier** (`re-engage.ts` `rewriteSandboxForcing` + `AL6_FORCE_RETURN_MESSAGE` appended to `AGENTS.md`/`CLAUDE.md`).

These were the rejected workaround: HyperIdle re-running turns from outside the harness. v4 enforces *inside* the harness's own hook where one can block; for hookless harnesses it records `not_returned` at the drain — never re-runs the turn from outside.

---

## 3. What this concept is NOT (rejection list — load-bearing)

- **NOT a flag.** (v1's failure.) Where a blocking hook exists, it BLOCKS the turn-end; it does not merely record that no return happened. Where no blocking hook exists, the floor is an honest, surfaced `not_returned` — still not a silent `completed`.
- **NOT Claude-specific in its CONTRACT.** (v2's failure.) The SDK Stop hook is one adapter's implementation of a per-adapter provisioning contract, not the universal mechanism. Every adapter declares its channel through the same `provisionReturnHook` seam. **HONEST CAVEAT:** today only the Claude harnesses have a *blocking* engine, so blocking enforcement IS Claude-only at runtime right now — but the contract is harness-agnostic and EXTENSIBLE: adding a hook-capable harness later = implementing its `provisionReturnHook` channel, zero core change (§ architecture §5, §11).
- **NOT a HyperIdle-side re-prompt loop.** (v3's failure.) HyperIdle does not re-`startSession`. The harness's hook engine re-runs the turn in-place (Claude); hookless harnesses degrade to the gate floor, not a loop.
- **NOT an instruction-file rewrite.** The forcing message is delivered by the harness's hook-block mechanism (`reason` / stderr), not by mutating `AGENTS.md` mid-session.
- **NOT a new closed-return set.** The closed `RETURN_ACTION_NAMES` set and `isReturnAction` are KEPT, unchanged. A return is still exactly one of `submit_review | handoff_to | send_message`.
- **NOT mid-turn tool blocking.** The hook fires only at the turn's *ending* (Stop / turn-end). Non-terminal tool use mid-turn is untouched (AC5). (Note: opencode's `tool.execute.before` CAN block a tool mid-turn, but that is explicitly NOT what AL6 enforces — see §8.)
- **NOT a replacement for the `ReturnGate`.** The `ReturnGate` (observes the event stream for a return action) is KEPT — it is HOW HyperIdle knows the answer to the hook's "has this returned?" query AND it is the un-bypassable floor for hookless harnesses.
- **NOT a manufactured coverage claim.** v4-r1 invented `codex`/`gemini` adapters to claim non-Claude blocking hooks. Those adapters DO NOT EXIST (codex is a discovery descriptor only; gemini appears nowhere). r2 removes them and states the real coverage honestly.

---

## 4. The enforcement model, operationally

```
turn runs in harness ──► harness reaches turn-end
                              │
              ┌───────────────┴────────────────────────────┐
   harness HAS a blocking hook              harness has NO blocking hook
   (claude-SDK / claude-CLI)                (aider/goose/opencode = "none")
              │                                            │
   harness fires its native hook                 no hook fires at turn-end
              │                                            │
   hook calls HyperIdle:                          HyperIdle drains events,
   hyperidle_return_status(session)               reads ReturnGate ONCE at end
   over the MCP bridge                                     │
              │                                   returned? ──► outcome
   HyperIdle reads ReturnGate ──► {returned, forceCount, budgetLeft}
              │                                   true ──► completed
   ┌──────────┴──────────┐                        false ──► not_returned
returned=true      returned=false                 (surfaced, never silent)
   │                     │
allow end      budgetLeft>0 ──► BLOCK + re-inject
(approve/exit0)              (decision:block+reason / exit2+stderr)
                 budgetLeft=0 ──► allow end; record not_returned
                     │
             harness continues SAME turn; model gets another chance
```

**Authority split:**
- **Harness owns (blocking-hook harnesses only):** firing the hook at turn-end, blocking the turn, re-running the same turn in-place.
- **HyperIdle owns (always):** the closed return set (`RETURN_ACTION_NAMES`), the `ReturnGate` truth, the force budget (`AL6_MAX_FORCE_RETURNS`), the `not_returned` outcome, the per-adapter hook PROVISIONING, and the drain-end floor for hookless harnesses.

**Why the callback (not a self-contained hook):** the closed return set must stay HyperIdle-owned and single-sourced (AC2). A hook that hard-codes the set would fork it into every sandbox. By asking HyperIdle, the set stays in `@hyperidle/shared` and the hook is a thin adjudication client. The hookless harnesses never call back — HyperIdle reads its own gate at drain.

---

## 5. The closed return set — KEPT unchanged

`RETURN_ACTION_NAMES = ["submit_review", "handoff_to", "send_message"]` (`packages/shared/src/harness/return-actions.ts`). `isReturnAction` unchanged. `isInternalExtractionDrain` (empty-tools exemption) unchanged. AC2 satisfied by reading this set.

The `ReturnGate` already observes the event stream and flips `returned=true` when a `tool_call` event satisfies `isReturnAction`. v4 exposes that gate state to the hook callback (blocking harnesses) and reads it at drain-end (all harnesses). **This is the single point of truth.**

---

## 6. Exemptions — KEPT

A turn is exempt (the hook permits end / the floor records no fault) when the end-reason is **crashed / stopped (aborted) / budget_exhausted**, or the run is an **internal-extraction drain** (`tools: []`). `evaluateReturn` maps all non-`completed` end-reasons → `returned`. A blocking hook never fires a block on an exempt end (either the harness crashed before turn-end, or HyperIdle answers the callback with `exempt: true` for an empty-tools session).

---

## 7. The `not_returned` outcome — KEPT (and load-bearing for hookless harnesses)

When the agent ends a turn still un-returned (budget exhausted on a blocking harness, OR any no-return end on a hookless harness), HyperIdle records `outcome: "not_returned"` on the session row + emits `session_not_returned` on the bus (`SessionOutcome` member, `session-provisioning.ts`). This is the honest reject floor — the turn is NEVER silently recorded as `completed` (the v1 bug). KEPT exactly. **For the hookless harnesses (aider/goose/opencode), this gate IS the entire enforcement** — and that is honest, not a workaround: the AL6 AC explicitly accepts "surfaced as not-yet-returned" as a valid outcome.

---

## 8. Per-harness native hook — the survey (VERIFIED against real tools)

The founder asserts "all these harnesses provide support for hooks these days." **Verified result: they support hooks, but only the Claude harnesses support BLOCKING turn-end hooks.** Full mechanism table + sources + file:line in `architecture.md §0` + §3. Summary:

| Harness (real, in-tree) | Native hook mechanism | Can BLOCK turn-end? | v4 provisioning channel | Verified |
|---|---|---|---|---|
| **claude-agent-sdk** | `options.hooks.Stop` in-process closure | **YES** — `decision:'block'+reason` | closure wired in `startSession` (reframed: one adapter's provisioning) | VERIFIED — installed `sdk.d.ts` v0.2.109 (`HOOK_EVENTS` includes `'Stop'`; `SyncHookJSONOutput.decision`) |
| **claude CLI / Claude Code** | `Stop` hook in `.claude/settings.json` (`project` source, read from `cwd`) | **YES** — exit 2 + stderr | write `.claude/settings.json` into sandbox at setup, same as `.mcp.json` | VERIFIED seam (`SettingSource='project'` doc); ⚠️ block-channel UNVERIFIED-AT-RUNTIME → proven by the real-binary keystone eval (§ architecture §9) |
| **aider** (`adapter-pool.ts` `CLI_TOOL_CONFIGS.aider`) | NONE — only `--notifications-command` (fire-and-forget user alert) | **NO** | `nativeReturnHook:"none"` → gate floor | VERIFIED (aider.chat options reference) |
| **goose** (`CLI_TOOL_CONFIGS.goose`) | Open-Plugins hooks (`SessionStart/Stop/UserPromptSubmit/PreToolUse/…`, `hooks.json`) | **NO** — spec is fire-and-forget ("Failures MUST NOT crash the host tool"; exit 0=success; no `decision`/`reason`) | `nativeReturnHook:"none"` → gate floor | VERIFIED (goose-docs hooks blog + open-plugins spec) |
| **opencode** (`CLI_TOOL_CONFIGS.opencode`) | plugin hooks; `session.idle` fires at turn-end | **NO at turn-end** — `session.idle` is observe-only; `tool.execute.before` can throw to block a *tool* (mid-turn, AC5-excluded) but NOT the stop | `nativeReturnHook:"none"` → gate floor | VERIFIED (opencode.ai/docs/plugins) |
| **isolated** | forks an inner claude-SDK adapter → inherits the SDK `Stop` closure | **YES** (inherited) | inner adapter provisions its own hook | VERIFIED (forks `claude-agent-sdk-adapter`) |
| **builtin** | in-process agent loop owns its own turn-end | **YES** (owns the loop) | loop-end consults the registry, re-injects in-place | VERIFIED (builtin owns its loop) |
| **remote** | worker provisions on its side; HyperIdle ships the hook config in dispatch | depends on the worker's harness | `dispatch` carries `returnHook`; conforming worker installs | HyperIdle-side VERIFIED; worker honoring it = a worker-protocol contract |
| **mock** | n/a (test) | n/a | declares a channel per test need | n/a |

**`codex` and `gemini` are NOT spawnable adapters and were REMOVED from this plan.** `codex` appears only as a discovery descriptor (`harness-capability-descriptors.ts:11` `KNOWN_HARNESS_FAMILIES`), never as a `CLI_TOOL_CONFIGS` entry; `gemini` appears nowhere in the tree. Inventing them to manufacture non-Claude blocking coverage was the v4-r1 error.

**`"none"`-is-honest rule:** a harness with no BLOCKING turn-end hook declares `nativeReturnHook:"none"` and is gate-only — explicitly NOT "native-hook uniform." This is the truthful state today for aider/goose/opencode, NOT a reason to resurrect the re-prompt loop. The contract is extensible: when one of these tools ships a blocking hook (or a new blocking-capable harness is integrated), implement its `provisionReturnHook` channel — no core change.

---

## 9. What changes vs v3 (concept-level)

| Dimension | v3 (rejected) | v4 (r2) |
|---|---|---|
| Where enforcement runs | HyperIdle provisioner (`runSession` loop) | inside each harness's native hook (blocking harnesses); HyperIdle drain-gate (hookless) |
| Forcing carrier | rewrite `AGENTS.md`/`CLAUDE.md` + re-`startSession` | harness hook-block (`reason`/stderr), single turn (blocking); gate floor (hookless) |
| `startSession` per turn | up to `1 + AL6_MAX_FORCE_RETURNS` | exactly 1 |
| Per-adapter responsibility | none (loop was universal) | **declare + provision its native hook channel** (new contract) — `"none"` for hookless |
| Closed return set | HyperIdle-owned | HyperIdle-owned (unchanged) |
| `not_returned` outcome | HyperIdle-owned | HyperIdle-owned (unchanged; the floor for hookless harnesses) |
| Claude-specific? | no (but via a workaround the founder rejected) | contract no; runtime blocking yes-for-now (honest), extensible |

---

## 10. Required reading (for the architecture pass + builder)

- `packages/shared/src/harness/return-actions.ts` — closed set, `isReturnAction`, `AL6_FORCE_RETURN_MESSAGE`, `AL6_MAX_FORCE_RETURNS` (KEEP; `shouldForceReturn` reused by the callback).
- `packages/server/src/harness/return-gate.ts` — `ReturnGate`, `evaluateReturn` (KEEP; gate read by the callback AND the drain floor).
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — existing SDK Stop hook (KEEP, reframe as provisioning).
- `packages/server/src/harness/cli-harness-adapter.ts` + `adapter-pool.ts` `CLI_TOOL_CONFIGS` (**aider/goose/opencode only**) — CLI provisioning seam (where a Claude-CLI `.claude/settings.json` would be written if a `claude` CLI config is added; aider/goose/opencode get `"none"`).
- `packages/server/src/services/session-provisioning.ts` — `runSession` (DELETE the v3 loop; provision the hook at setup; drain-gate floor at end).
- `packages/server/src/mcp/mcp-bridge.ts` + `mcp-bridge-registry.ts` + `tools/tool-registry.ts` + `routes/mcp-route.ts` — the callback channel (the bridge registers ONLY `registry.definitions`, so the return-status tool must be a `ToolDefinition` injected per-session; see architecture §4 WARN-1 fix).
- `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `SyncHookJSONOutput`, `StopHookInput`, `HOOK_EVENTS`, `SettingSource` (VERIFIED hook contract).
- `packages/eval/src/scenarios/force-return.ts` + `packages/eval/src/provision-harness.ts` — the live eval (rework for the real-binary Claude-CLI keystone proof, §9).
