# AL6 v4-final — Concept: Harness review-return enforcement

**Status:** v4-final. v1 (flag-only), v2 (Claude-SDK-only forcing), v3 (universal HyperIdle re-prompt loop + sandbox-instruction-file rewrite), v4-r1/r2 (built on a WRONG harness list — aider/goose, which HyperIdle does NOT support) were ALL superseded. **v4-final grounds every harness/hook claim in the now-corrected codebase (a builder purged aider/goose; `CLI_TOOL_CONFIGS` is `codex` + `opencode`) + VERIFIED web research (2026-06-24) on each real harness's hook capability.**

**Founder's direction (verbatim intent):** *"The hooks were the right thing. Provisioning hooks should be part of the harness adapter or sandbox setup just like skills or anything else are. All these harnesses provide support for hooks these days."* — and, on the floor for tools without a native block: *"full sandbox = plenty of options"* (HyperIdle owns the spawn + sandbox, so it can re-engage a CLI itself).

**Corrected premise (this is the load-bearing fix):** the founder is now substantially RIGHT. With the real harness set, **two of the spawnable CLIs have a BLOCKING turn-end hook** (Claude Code `Stop`, Codex `Stop` — both file-provisioned, `decision:block` semantics), not just the Claude SDK. The v4-r1/r2 "blocking is Claude-only" conclusion was an artifact of researching the wrong tools (aider has no hooks; goose follows the fire-and-forget Open-Plugins spec). For the harnesses that genuinely lack a hard block (OpenCode, Cursor), HyperIdle's OWN process/sandbox boundary provides the floor — it spawned the CLI, so it re-engages it. Source + file:line + cited URLs in `architecture.md §0`.

---

## 1. The one-sentence concept

**Return-enforcement is provisioned per-harness as part of harness-adapter / sandbox setup — exactly the way `.mcp.json`, `AGENTS.md`/`CLAUDE.md`, and skills are already provisioned — under ONE provisioning seam (`provisionReturnHook`); the mechanism is the STRONGEST thing the harness natively supports (a native BLOCKING turn-end hook for Claude Code + Codex; a native soft-continue for Cursor; a HyperIdle process re-engage for OpenCode and anything else), and HyperIdle's sandbox/process ownership is the floor where the tool itself cannot block — never a universal re-prompt loop, never an instruction-file rewrite.**

The *mechanism* lives where the harness is strongest. The *adjudication* (the closed return set + the gate) always stays HyperIdle-owned and single-sourced. The drain-end `ReturnGate` — fed by the event stream HyperIdle ingests, outside agent control — is the un-bypassable backstop on EVERY harness, so a turn is never recorded `completed` without a return, even if an agent strips its own hook file.

**"Uniform across harnesses" =** every harness has a REAL enforcement path provisioned at setup — native hard block, native soft-continue, or HyperIdle process re-engage — backed by the drain-gate floor. Never a silent `completed`. This is exactly AL6's AC: *"redirected to return, OR surfaced as not-yet-returned."*

---

## 2. The real supported harnesses (authoritative)

Authoritative sources: `docs/architecture/components.md` §"Supported harnesses" (line 288) + `packages/server/src/harness/harness-discovery.ts` (`HarnessDiscoveryResult`, lines 54–60) + `adapter-pool.ts` `CLI_TOOL_CONFIGS` (lines 332–358).

| Harness | What it is | Spawnable as a session today? | Owner of the turn loop |
|---|---|---|---|
| **builtin** | HyperIdle's own in-process API-gateway runtime (`builtin-harness-adapter.ts`) | yes (always registered) | **HyperIdle** (owns the turn loop entirely) |
| **claude-code** | Claude Code CLI + `claude-agent-sdk` (the in-process/SDK path is `claude-agent-sdk-adapter.ts`; the CLI path runs through `cli-harness-adapter.ts`) | yes | the harness |
| **codex** | OpenAI Codex CLI — `codex exec <prompt> --json`, ndjson `turn.completed` (`CLI_TOOL_CONFIGS.codex`, lines 333–346; `@lore X5`) | yes | the harness |
| **opencode** | OpenCode CLI — `opencode --dir <sandbox>` (`CLI_TOOL_CONFIGS.opencode`, lines 347–357) | yes | the harness |
| **cursor-agent** | detected by discovery (`probeCursorAgentCli`, lines 286–325) but **NO documented headless local CLI surface** — discovery reports `installed`/`unavailable`, never a spawnable session | **NO** (discovery-only) | n/a today |
| **isolated** | forks an inner SDK adapter in a worker (`isolated-harness-adapter.ts` → `isolated-session-worker.ts`) | yes | inner Claude SDK |
| **remote** | dispatches to a remote worker (`remote-harness-adapter.ts`) | yes | the worker's harness |

`mock` is the test adapter. **aider and goose were PURGED** (commit `46ba1d26`) — they are not in `CLI_TOOL_CONFIGS` and must not appear in this plan.

---

## 3. Per-harness enforcement mechanism (VERIFIED — cite these, do NOT re-assume)

The single most important table. Each harness gets the strongest enforcement it natively supports; HyperIdle's process/sandbox ownership is the floor. Full sources + URLs in `architecture.md §0`.

| Harness | Native turn-end hook | Can BLOCK turn-end? | v4 enforcement class | Provisioned how |
|---|---|---|---|---|
| **claude-code** (SDK in-process) | `options.hooks.Stop` closure | **YES — hard block** (`{decision:"block",reason}`) | **native-block** | closure wired in `startSession` (already exists — reframed as one provisioning channel) |
| **claude-code** (CLI) | `Stop` hook in `.claude/settings.json` | **YES — hard block** (`{"decision":"block","reason"}` / exit 2 + stderr; reason fed to model) | **native-block** | HyperIdle writes `<sandbox>/.claude/settings.json` at setup (`settingSources` defaults to `['project']`, read from cwd) — same drop-a-file model as `.mcp.json` |
| **codex** (CLI) | `Stop` hook in `.codex/hooks.json` / `.codex/config.toml` (NEW hooks system, distinct from observe-only `notify`) | **YES — hard block** (same `decision:block` semantics) | **native-block** | HyperIdle writes `<sandbox>/.codex/hooks.json` at setup |
| **opencode** (CLI) | plugin `session.idle` (fires at turn-end) | **NO — observe-only** (blocking `session.stopping` is an OPEN, unmerged FR: `sst/opencode#16626`; in-tool re-prompt races teardown in `opencode run`) | **HyperIdle process re-engage** | `.opencode/plugins/*.ts` emits a turn-end signal; HyperIdle's process wrapper re-invokes the CLI in the sandbox it owns |
| **cursor-agent** | `stop` hook | **NO — observe-only** (only `followup_message`: a soft re-prompt AFTER the turn ends, not a hard block; local-CLI hook execution ⚠️ UNVERIFIED) | **native soft-continue** (when it becomes spawnable) / not-spawnable today | `.cursor/hooks.json` `followup_message`; gated behind "no headless CLI surface" until Cursor ships one |
| **builtin** | n/a — HyperIdle owns the loop | **YES — in-process** | **builtin-loop** | loop-end consults the registry, re-injects in-place |
| **isolated** | inherits inner SDK `Stop` closure | **YES — hard block** (inherited) | **native-block** (inherited) | inner adapter provisions its own Claude SDK hook |
| **remote** | worker-side; depends on the worker's harness | depends on the worker | **process re-engage** unless the worker contract guarantees a block | `dispatch` carries the return-hook config; conforming worker installs it |

**None of the four CLIs expose turn-termination control via MCP** — enforcement is NOT architected around MCP. MCP is only the callback transport the native blocking hook uses to ask HyperIdle "did this turn return?".

---

## 4. What a "provisioned return hook" IS (and what it replaces)

### 4.1 IS
A **per-adapter enforcement provisioning, dispatched by one seam (`provisionReturnHook`) at sandbox/session setup**, choosing the strongest channel the adapter declares (`§ architecture §5`):

- **native-block (Claude Code SDK, Claude Code CLI, Codex CLI, isolated):** write/wire the harness's own BLOCKING `Stop` hook. When the harness reaches turn-end it — not HyperIdle — invokes the hook. The hook:
  1. asks HyperIdle (`hyperidle_return_status` over the existing per-session MCP bridge) "did this session return?";
  2. **returned** → permit end (`decision:approve` / exit 0);
  3. **not returned + budget left** → **block the turn-end** and feed the return instruction back to the model (`decision:block`+`reason` / exit 2 + stderr) → the harness continues the SAME turn;
  4. **not returned + budget exhausted** → permit end; HyperIdle records `not_returned`.
- **native soft-continue (Cursor, when spawnable):** the `stop` hook returns a `followup_message`; the harness re-prompts AFTER the turn ends (not a hard block, but a real native re-engage).
- **process re-engage (OpenCode, remote-nonconforming):** HyperIdle's process wrapper — it spawned the CLI inside the sandbox it built — detects turn-end (OpenCode's `session.idle` plugin signal / the CLI's structured turn-end exit) and **re-invokes the CLI in the same sandbox** with the forcing message, using the tool's native soft-continue where one exists, otherwise a fresh process turn. This is the founder's "full sandbox = plenty of options" floor.
- **builtin-loop:** HyperIdle's own loop checks the registry at loop-end and re-injects in-place.

The hook is "first-class provisioning" in the same sense as the three existing sandbox-provisioned artifacts:

| Provisioned artifact | Written where | Read by harness |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` | sandbox root | every harness, from cwd |
| `.mcp.json` | sandbox root (`session-provisioning.ts` Phase 8b, ~line 690) | MCP-capable harnesses, from cwd |
| skills | sandbox skill dir | skill-capable harnesses |
| **return hook** | `.claude/settings.json` (Claude CLI) / `.codex/hooks.json` (Codex) / in-process closure (SDK, builtin) / process-wrapper config (OpenCode/remote) | each harness's native enforcement channel |

### 4.2 REPLACES (deleted in v4)
- The v3 **HyperIdle re-prompt loop** in `runSession` (`session-provisioning.ts` — the `while(true)` that re-`startSession`s the adapter N times per turn UNIVERSALLY).
- The v3 **sandbox-instruction-file forcing-rewrite carrier** (`re-engage.ts` `rewriteSandboxForcing` + `AL6_FORCE_RETURN_MESSAGE` appended to `AGENTS.md`/`CLAUDE.md`).
- The v3 `canReEngage` / `continueSession` capability cruft.

**v3 vs v4 — the distinction the founder demanded be explicit:** v3 was rejected because it used a re-prompt loop UNIVERSALLY *instead of* hooks, AND rewrote the instruction file. v4 uses each harness's NATIVE blocking hook as the PRIMARY mechanism (Claude Code, Codex); the process-wrapper re-engage is the FALLBACK floor ONLY for tools with no blocking hook (OpenCode, Cursor, nonconforming remote), provisioned per-adapter at setup — never a replacement for hooks, never an instruction-file rewrite.

---

## 5. What this concept is NOT (rejection list — load-bearing)

- **NOT a flag.** (v1's failure.) A native-block harness BLOCKS the turn-end; a no-block harness re-engages or surfaces `not_returned` — never a silent `completed`.
- **NOT Claude-specific.** (v2's failure, AND the v4-r1/r2 false conclusion.) Native blocking enforcement runs on Claude Code AND Codex (verified). One contract; each adapter declares its channel.
- **NOT a universal HyperIdle re-prompt loop.** (v3's failure.) HyperIdle does not re-`startSession` for harnesses that can block — their hook re-runs the turn in-place. The process re-engage is the FALLBACK for no-block harnesses only, provisioned per-adapter, not a global loop.
- **NOT an instruction-file rewrite.** The forcing message is delivered by the harness's native channel (`reason` / stderr / `followup_message`) or a fresh process turn — never by mutating `AGENTS.md` mid-session.
- **NOT a new closed-return set.** `RETURN_ACTION_NAMES` + `isReturnAction` are KEPT unchanged. A return is exactly one of `submit_review | handoff_to | send_message`.
- **NOT mid-turn tool blocking.** The hook fires only at turn-*end* (Stop / turn-end). Mid-turn tool use is untouched (AC5). (Note: OpenCode's `tool.execute.before` CAN block a tool mid-turn — explicitly NOT what AL6 enforces.)
- **NOT a replacement for the `ReturnGate`.** The gate (observes the event stream for a return action) is KEPT — it is HOW HyperIdle answers the hook's query AND it is the un-bypassable floor on every harness.
- **NOT MCP-based enforcement.** No harness exposes turn-termination over MCP. MCP is only the bridge the native hook calls back over to read gate state.
- **NOT a fabricated coverage claim.** v4-r1/r2 invented `codex`/`gemini` blocking-adapter coverage on the wrong tool list. v4-final grounds each row in the corrected `CLI_TOOL_CONFIGS` + cited per-tool hook research; honest where a path is soft (Cursor), wrapper-based (OpenCode), or ⚠️ UNVERIFIED-at-runtime (Codex end-to-end, Cursor local-CLI hooks) — proven by the real-harness integration tests.

---

## 6. The enforcement model, operationally

```
turn runs in harness ──► harness reaches turn-end
        │
   ┌────┴──────────────────────────┬───────────────────────────┐
 native-block                  native soft-continue        process re-engage
 (claude-code SDK+CLI,         (cursor — when spawnable)   (opencode, remote-nonconforming)
  codex, isolated, builtin)          │                           │
        │                     harness fires `stop` hook    HyperIdle wrapper detects
 harness fires native hook            │                    turn-end (session.idle /
        │                     returned? ── yes ─► end       structured exit)
 hook asks HyperIdle                  │                           │
 hyperidle_return_status         no ─► followup_message     returned? (drain gate)
        │                        (soft re-prompt, budget)    ┌──────┴──────┐
 HyperIdle reads ReturnGate                                 yes          no, budget>0
        │                                              ─► completed   ─► re-invoke CLI
 returned=true ─► allow end                                          in same sandbox
 returned=false, budget>0 ─► BLOCK + re-inject                       w/ forcing msg
   (decision:block+reason / exit2+stderr)                              │
 returned=false, budget=0 ─► allow end; not_returned          budget=0 ─► not_returned

ALWAYS, regardless of channel: at drain-end HyperIdle reads the ReturnGate (event-stream-fed,
outside agent control). A no-return end → outcome:"not_returned" + session_not_returned event.
Never silently "completed".
```

**Authority split:**
- **Harness owns** (native-block/soft harnesses): firing the hook at turn-end, blocking/re-prompting, re-running the turn in-place.
- **HyperIdle owns** (always): the closed return set (`RETURN_ACTION_NAMES`), the `ReturnGate` truth, the force budget (`AL6_MAX_FORCE_RETURNS`), the `not_returned` outcome, the per-adapter hook PROVISIONING, the process-wrapper re-engage for no-block harnesses, and the drain-end floor for ALL harnesses.

**Why the callback (not a self-contained hook):** the closed return set must stay HyperIdle-owned and single-sourced (AC2). A hook that hard-codes the set forks it into every sandbox. By asking HyperIdle, the set stays in `@hyperidle/shared` and the hook is a thin adjudication client. In-process channels (SDK/builtin) read the registry directly; file-provisioned channels (Claude CLI/Codex) call back over the MCP bridge.

---

## 7. Kept primitives (unchanged adjudication core)

- **`RETURN_ACTION_NAMES`** = `["submit_review","handoff_to","send_message"] as const` (`packages/shared/src/harness/return-actions.ts:23`). `isReturnAction` (line 40), `isInternalExtractionDrain` (line 61) — KEPT. AC2 satisfied by reading this set.
- **`ReturnGate`** + **`evaluateReturn`** (`packages/server/src/harness/return-gate.ts`) — KEPT. The gate observes the event stream and flips `returned=true` on a return-action `tool_call` event. `evaluateReturn(gate,"completed")` → `not_returned` when un-returned; any non-`completed` end-reason → `returned` (exemptions). v4 exposes gate state to the hook callback and reads it at drain-end on every harness. **Single point of truth.**
- **`not_returned` SessionOutcome** (row + `session_not_returned` event, `session-provisioning.ts` ~line 996–1017) — KEPT. The honest reject floor; a turn is NEVER silently `completed` (the v1 bug). On a process-re-engage harness whose budget runs out, and on any no-return end, this is the recorded truth.
- **Exemptions** — KEPT: crashed / stopped(aborted) / budget_exhausted end-reasons + internal-extraction drain (`tools:[]`) map to `returned`; the hook never blocks an exempt end (HyperIdle answers `exempt:true`).
- **`AL6_FORCE_RETURN_MESSAGE`** (line 74) + **`shouldForceReturn`** (line 104) + **`AL6_MAX_FORCE_RETURNS`** (=2, line 88) — KEPT. The hook `reason` reuses `AL6_FORCE_RETURN_MESSAGE`; `shouldForceReturn(gate,forceCount)` is the shared adjudication the callback and the process wrapper both call.

**DELETED:** the v3 re-prompt loop (`runSession` `while(true)`), `re-engage.ts` `rewriteSandboxForcing`, `HarnessCapabilities.hasNativeReturnHook` + `canReEngage`, `HarnessAdapter.continueSession?`.

---

## 8. Real-harness integration tests (founder requirement)

Founder: *"there should be tests that test this against real harnesses — we already have these integration tests, for all harness features those integration tests should exist."* This is the founder-required DoD artifact — distinct from the local live eval.

The tests follow the EXISTING pattern (`packages/server/src/harness/__tests__/AM2-real-harness-discovery.integration.test.ts`, `AM2-real-harness-session-probe.integration.test.ts`, `packages/server/src/__tests__/X3-session-provisioning.integration.test.ts`): a `binaryPresent(name)` + per-harness `*Authed()` guard; `test.skipIf(!installed)` plus an in-test `ctx.skip()` when unauthed; provision the real hook/wrapper; spawn the REAL harness when present; assert the REAL turn-end was actually blocked / re-engaged and the gate recorded `returned` vs `not_returned`. They live in the harness `__tests__` family (e.g. `AL6-real-harness-return-enforcement.integration.test.ts`). Concrete per-harness spec in `architecture.md §9`.

These prove the ⚠️ UNVERIFIED claims for real: Codex `Stop`-block end-to-end in our shipped version; Cursor local-CLI hook execution; OpenCode process-wrapper re-engage reliability.

---

## 9. Required reading (for the architecture pass + builder)

- `packages/shared/src/harness/return-actions.ts` — closed set, `isReturnAction`, `AL6_FORCE_RETURN_MESSAGE`, `AL6_MAX_FORCE_RETURNS`, `shouldForceReturn` (KEEP).
- `packages/server/src/harness/return-gate.ts` — `ReturnGate`, `evaluateReturn` (KEEP; read by callback + drain floor).
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:186–325` — existing SDK Stop hook (KEEP; reframe as the `sdk-inprocess` channel; read registry instead of local `al6` state).
- `packages/server/src/harness/adapter-pool.ts:332–358` — `CLI_TOOL_CONFIGS` (`codex`, `opencode`) — where Codex's `.codex/hooks.json` and a `claude` CLI `.claude/settings.json` provisioning attaches; OpenCode declares process-re-engage.
- `packages/server/src/harness/harness-discovery.ts:54–60,286–325` — the real harness set incl. cursor-agent discovery-only state.
- `packages/server/src/services/session-provisioning.ts` — `runSession` (DELETE the v3 loop; `provisionReturnHook` in Phase 8b ~line 690; drain-gate floor at end ~line 996).
- `packages/server/src/mcp/mcp-bridge.ts:102–141` + `tools/tool-registry.ts:40–65,260` — callback channel; bridge registers ONLY `registry.definitions`, so `hyperidle_return_status` is injected as a per-session `ToolDefinition` resolved by `ctx.sessionId`.
- `packages/server/src/harness/__tests__/AM2-real-harness-session-probe.integration.test.ts` + `…discovery…` + `packages/server/src/__tests__/X3-session-provisioning.integration.test.ts` — the real-harness integration-test pattern to mirror.
- `packages/eval/src/scenarios/force-return.ts` + `provision-harness.ts` — the local live eval (kept; reworked for the native-hook keystone).
