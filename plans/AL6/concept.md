# AL6 v4 — Concept: Harness review-return hooks

**Status:** v4 (decisive redesign). v1 (flag-only), v2 (Claude-SDK-only forcing), v3 (provisioning re-prompt loop + sandbox-file rewrite) were ALL founder-rejected. v4 builds to the founder's own design.

**Founder's v4 direction (verbatim intent):** *"The hooks were the right thing. Provisioning hooks should be part of the harness adapter or sandbox setup just like skills or anything else are. All these harnesses provide support for hooks these days."*

---

## 1. The one-sentence concept

**A return-enforcement hook is provisioned into each harness's OWN native hook system at sandbox/session setup — exactly the way `.mcp.json`, `CLAUDE.md`, and skills are already provisioned — and the harness itself fires that hook at turn-end, where it asks HyperIdle "has this session returned?" over the existing MCP bridge and blocks the turn-end (re-injecting the return instruction) until a return action has been seen.**

The mechanism lives in the harness. The *adjudication* (the closed return set) stays in HyperIdle. HyperIdle's job is to PROVISION the hook per-adapter and to ANSWER the hook's query — not to run a re-prompt loop or rewrite an instruction file.

---

## 2. What a "provisioned native hook" IS (and what it replaces)

### 2.1 IS
A **hook config artifact written into the sandbox (or passed to the harness at startSession) that registers a turn-end / Stop hook in the harness's own native hook mechanism.** When the harness's agent loop reaches the end of a turn, the harness — not HyperIdle's provisioner — invokes the hook. The hook:
1. Calls back to HyperIdle (`hyperidle_return_status` MCP tool on the session's bridge token) to ask "did this session return yet?"
2. If **returned** → the hook permits the turn to end (`decision: approve` / exit 0).
3. If **not returned** AND budget remains → the hook **blocks the turn-end** and feeds the return instruction back to the model (`decision: block` + `reason` for SDK; exit-code-2 + stderr for command-hooks), so the harness continues the SAME turn and the model gets another chance to call a return action.
4. If **not returned** AND budget exhausted → the hook permits the end; HyperIdle records `not_returned` (the honest reject floor).

The hook is "first-class provisioning" in the same sense as the three existing sandbox-provisioned artifacts:

| Provisioned artifact | Written where | Read by harness | v4 analogue |
|---|---|---|---|
| `CLAUDE.md` / `AGENTS.md` | sandbox root (`writeSandboxAgentsMd`) | every harness, from `cwd` | — |
| `.mcp.json` | sandbox root (`session-provisioning.ts` Phase 8b) | MCP-capable harnesses, from `cwd` | the bridge the hook calls back over |
| skills | sandbox skill dir | skill-capable harnesses | — |
| **return-enforcement hook** | **`.claude/settings.json` (file-provisioned) OR `options.hooks` (SDK in-process)** | **each harness's native hook engine** | **NEW — the v4 deliverable** |

### 2.2 REPLACES (deleted in v4)
- The v3 **provisioning re-prompt loop** in `runSession` (`session-provisioning.ts:712–917`) — the `while(true)` that re-`startSession`s the adapter N times per turn.
- The v3 **sandbox-instruction-file forcing-rewrite carrier** (`re-engage.ts` `rewriteSandboxForcing` + `AL6_FORCE_RETURN_MESSAGE` appended to `AGENTS.md`/`CLAUDE.md`).

These were the rejected workaround: HyperIdle re-running turns from outside the harness. v4 enforces *inside* the harness's own hook, where the founder says it belongs.

---

## 3. What this concept is NOT (rejection list — load-bearing)

- **NOT a flag.** (v1's failure.) The hook BLOCKS the turn-end; it does not merely record that no return happened.
- **NOT Claude-specific.** (v2's failure.) The SDK Stop hook is now *one adapter's implementation of a per-adapter provisioning contract*, not the universal mechanism. Each harness provisions its OWN native hook.
- **NOT a HyperIdle-side re-prompt loop.** (v3's failure.) HyperIdle does not re-`startSession`. The harness's hook engine re-runs the turn in-place. HyperIdle only PROVISIONS the hook and ANSWERS its query.
- **NOT an instruction-file rewrite.** The forcing message is delivered by the harness's hook-block mechanism (`reason` / stderr), not by mutating `AGENTS.md` mid-session.
- **NOT a new closed-return set.** The closed `RETURN_ACTION_NAMES` set and `isReturnAction` are KEPT, unchanged. The hook consults HyperIdle, which owns that set. A return is still exactly one of `submit_review | handoff_to | send_message`.
- **NOT mid-turn tool blocking.** The hook fires only at the turn's *ending* (Stop / turn-end). Non-terminal tool use mid-turn is untouched (AC5).
- **NOT a replacement for the `ReturnGate`.** The `ReturnGate` (observes the event stream for a return action) is KEPT — it is HOW HyperIdle knows the answer to the hook's "has this returned?" query.

---

## 4. The enforcement model, operationally

```
turn runs in harness ──► harness reaches turn-end
                              │
                  harness fires its OWN native hook (provisioned at setup)
                              │
            hook calls HyperIdle:  hyperidle_return_status(sessionId) over the MCP bridge token
                              │
              HyperIdle reads the session's ReturnGate state ──► { returned: bool, forceCount, budgetLeft }
                              │
          ┌───────────────────┴───────────────────┐
   returned=true                          returned=false
          │                                        │
   hook: allow end                  budgetLeft>0 ──► hook: BLOCK end, re-inject
   (approve / exit 0)               (decision:block + reason / exit 2 + stderr)
                                            │            budgetLeft=0 ──► hook: allow end
                                            │                           HyperIdle records not_returned
                                    harness continues SAME turn
                                    model gets another chance to return
```

**Authority split:**
- **Harness owns:** firing the hook at turn-end, blocking the turn, re-running the same turn in-place.
- **HyperIdle owns:** the closed return set (`RETURN_ACTION_NAMES`), the `ReturnGate` truth, the force budget (`AL6_MAX_FORCE_RETURNS`), the `not_returned` outcome, the per-adapter hook PROVISIONING.

**Why the callback (not a self-contained hook):** the closed return set must stay HyperIdle-owned and single-sourced (AC2). A hook that hard-codes "submit_review/handoff_to/send_message" would fork the set into every sandbox. By asking HyperIdle, the set stays in `@hyperidle/shared` and the hook is a thin adjudication client.

---

## 5. The closed return set — KEPT unchanged

`RETURN_ACTION_NAMES = ["submit_review", "handoff_to", "send_message"]` (`packages/shared/src/harness/return-actions.ts`). `isReturnAction` unchanged. `isInternalExtractionDrain` (empty-tools exemption) unchanged. AC2 satisfied by reading this set.

The `ReturnGate` already observes the event stream and flips `returned=true` when a `tool_call` event satisfies `isReturnAction`. v4 exposes that gate state to the hook callback. **This is the single point of truth the hook queries.**

---

## 6. Exemptions — KEPT

A turn is exempt from enforcement (the hook permits end without a return) when the end-reason is **crashed / stopped (aborted) / budget_exhausted**, or the run is an **internal-extraction drain** (`tools: []`). `evaluateReturn` maps all non-`completed` end-reasons → `returned`. The hook never fires a block on an exempt end because either (a) the harness crashed before turn-end, or (b) HyperIdle answers the callback with `exempt: true` for an empty-tools session.

---

## 7. The `not_returned` outcome — KEPT

When the budget is exhausted and the agent still has not returned, the hook permits the end and HyperIdle records `outcome: "not_returned"` on the session row + emits `session_not_returned` on the bus (`SessionOutcome` member, `session-provisioning.ts`). This is the honest reject floor — the turn is NEVER silently recorded as `completed` (the v1 bug). KEPT exactly.

---

## 8. Per-harness native hook — the survey (what each harness provides)

The founder asserts "all these harnesses provide support for hooks these days." Verified for the in-tree harnesses; flagged where an external CLI's hook format is unverified. Full mechanism table is in `architecture.md §3`. Summary:

| Harness | Native hook mechanism | How v4 provisions it | Verified? |
|---|---|---|---|
| **claude-agent-sdk** | `options.hooks.Stop` (in-process closure) — already wired in v2/v3 | pass the closure at `startSession` (reframed: one adapter's provisioning, not universal) | VERIFIED (sdk.d.ts 0.2.109) |
| **claude CLI / Claude Code** | `Stop` hook in `.claude/settings.json` (`project` setting source, read from `cwd`) | write `.claude/settings.json` into the sandbox at setup, same as `.mcp.json` | VERIFIED (sdk.d.ts `settingSources`/`SettingSource` doc: `'project'` = `.claude/settings.json`) |
| **codex CLI** | hook/notify config | write its hook-config file into the sandbox | ⚠️ UNVERIFIED — no binary/docs in repo; verify format or document as genuine exception |
| **gemini CLI** | hook/extension config | write its hook-config file into the sandbox | ⚠️ UNVERIFIED — same |
| **isolated** | forks an inner SDK adapter → inherits the SDK `Stop` hook | inner adapter provisions its own hook (no extra work) | VERIFIED (forks `claude-agent-sdk-adapter`) |
| **remote** | worker provisions the hook on its side; HyperIdle ships the hook config in the dispatch | add hook config to the `dispatch` message; conforming worker installs it | partial — HyperIdle-side VERIFIED; third-party worker honoring it is a worker contract |

**Genuine-exception rule:** a harness with NO native turn-end hook mechanism is a documented exception (recorded in the descriptor as `nativeReturnHook: "none"`), NOT a reason to resurrect the re-prompt loop. The founder's bar: provision the native hook for each; degrade to `not_returned`-at-drain only for a proven exception.

---

## 9. What changes vs v3 (concept-level)

| Dimension | v3 (rejected) | v4 |
|---|---|---|
| Where enforcement runs | HyperIdle provisioner (`runSession` loop) | inside each harness's native hook engine |
| Forcing carrier | rewrite `AGENTS.md`/`CLAUDE.md` + re-`startSession` | harness hook-block (`reason`/stderr), single turn |
| `startSession` per turn | up to `1 + AL6_MAX_FORCE_RETURNS` | exactly 1 |
| Per-adapter responsibility | none (loop was universal) | **provision its native hook** (new contract) |
| Closed return set | HyperIdle-owned | HyperIdle-owned (unchanged) |
| `not_returned` outcome | HyperIdle-owned | HyperIdle-owned (unchanged) |
| Claude-specific? | no (but via a workaround the founder rejected) | no (each harness uses its OWN native hook) |

---

## 10. Required reading (for the architecture pass + builder)

- `packages/shared/src/harness/return-actions.ts` — closed set, `isReturnAction`, `AL6_FORCE_RETURN_MESSAGE`, `AL6_MAX_FORCE_RETURNS` (KEEP; `shouldForceReturn` may be reused by the callback).
- `packages/server/src/harness/return-gate.ts` — `ReturnGate`, `evaluateReturn` (KEEP; gate now read by the callback).
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — existing SDK Stop hook (KEEP, reframe as provisioning).
- `packages/server/src/harness/cli-harness-adapter.ts` + `adapter-pool.ts` `CLI_TOOL_CONFIGS` — CLI provisioning seam (where `.claude/settings.json` gets written).
- `packages/server/src/services/session-provisioning.ts` — `runSession` (DELETE the v3 loop; provision the hook at setup instead).
- `packages/server/src/mcp/mcp-bridge.ts` + `mcp-bridge-registry.ts` + `routes/mcp-route.ts` — the callback channel.
- `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `SyncHookJSONOutput`, `StopHookInput`, `settingSources`/`SettingSource` (VERIFIED hook contract).
- `packages/eval/src/scenarios/force-return.ts` + `provision-harness.ts` — the live eval (rework for native-hook proof).
