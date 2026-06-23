# AL6 — Architecture Critique

## v4 — per-harness native hook provisioning + MCP-bridge enforcement

**Reviewer:** reviewer persona (cold read, source-verified). **Plan:** `plans/AL6/architecture.md` v4 + `plans/AL6/concept.md` v4. **Bar:** provision a REAL native hook per harness (proven, not asserted), enforce IN the harness (not a re-prompt loop), prove it on a non-Claude harness. v1/v2/v3 founder-rejected.

**Verdict: NEEDS-REVISION (score 6.4/10).** The keystone (#1) and the enforcement contract (#3 transport/auth) ARE backed by source — that is the win over v3. But the plan's per-adapter coverage narrative (#4) is materially detached from the actual codebase: it repeatedly names `codex CLI` and `gemini CLI` as the external harnesses to provision hooks into, when neither is a real CLI adapter in the tree (the real ones are `aider`/`goose`/`opencode`, and `gemini` does not exist anywhere). The "non-Claude external harness" proof (#7) is, on inspection, still a Claude CLI or an in-process fixture — there is no actual non-Claude harness whose native hook is provisioned and proven. Two CRITICALs below; both are fixable at the plan level without abandoning the v4 design.

---

### Source-verification results (the whole point)

| # | Claim | Source check | Result |
|---|---|---|---|
| 1 | `settingSources` omitted ⇒ `.claude/settings.json` (`'project'`) loaded from cwd | `sdk.d.ts:1659-1669` ("When omitted, all sources are loaded"); `SettingSource='user'|'project'|'local'` `sdk.d.ts:5391`; `'project'` doc:5389 = `.claude/settings.json` | **VERIFIED** (type+doc) |
| 1 | SDK `Stop` hook + `decision:'block'+reason` blocks the stop | `HOOK_EVENTS` includes `'Stop'` `sdk.d.ts:738`; `StopHookInput` 5504; `SyncHookJSONOutput.decision?:'approve'|'block'` + `reason?` 5540-5550 | **VERIFIED** |
| 1 | `.claude/settings.json` `hooks` JSON format (matcher→`{type:"command",command}`) fires under `claude -p` | No in-repo authoritative reference; no live CLI exercised. Eval runs `claude -p --output-format stream-json` (`provision-harness.ts:314`) | **UNVERIFIED-AT-RUNTIME** — plan flags it; see CRIT-1 |
| 2 | `.mcp.json` written in Phase 8b, hook seam parallel to it | `session-provisioning.ts:690-700` writes `.mcp.json` with bridge token/url; `mcpBridgeToken`+`mcpBaseUrl` in scope | **VERIFIED** — the seam is real and reachable |
| 3 | `/api/mcp/:token` route + token auth | `routes/mcp-route.ts` `ALL /mcp/:token`, mounted pre-auth, 401 on unknown token | **VERIFIED** |
| 3 | A new tool can be added without new route/auth | `mcp-bridge.ts:120-136` registers tools from `registry.definitions` ONLY — there is no "alongside registry tools" seam today | **PARTIAL** — see WARN-1 |
| 4 | Per-adapter native-hook mechanisms | SDK Stop hook `claude-agent-sdk-adapter.ts:188-249` VERIFIED; CLI cwd=sandboxPath `cli-harness-adapter.ts:208` VERIFIED; **codex/gemini are NOT CLI adapters** | **FAILS as written** — see CRIT-2 |
| 5 | Drain-end `evaluateReturn` is an independent backstop | `session-provisioning.ts:994` reads `returnGate.returned` from the event stream, independent of any hook firing | **VERIFIED** — genuine un-bypassable backstop |
| 6 | v3 deletion clean; closed set kept | `re-engage.ts` (`rewriteSandboxForcing`) present; loop `session-provisioning.ts:712-921`; `RETURN_ACTION_NAMES`/`isReturnAction`/`AL6_FORCE_RETURN_MESSAGE`/`shouldForceReturn` all present in `return-actions.ts` | **VERIFIED** — delete targets and keep targets exist exactly as named |
| 7 | Live eval proves the NATIVE hook on a non-Claude harness | v3 eval (`provision-harness.ts:291-339`) only offers **claude CLI** (real subprocess) or an **in-process `ExternalShapedAdapter`** — NO non-Claude external harness exists | **NOT MET as scoped** — see CRIT-2 |

---

### CRITICAL findings

**CRIT-1 — The keystone runtime behavior (`claude -p` reading `.claude/settings.json` Stop hooks) is unverified, and the live eval is the ONLY gate. Assess whether that is sufficient.**
The type seam is proven: `settingSources` omitted loads `.claude/settings.json` (`sdk.d.ts:1665`), `Stop` + `decision:block` exist. What is NOT proven in-repo is that the `claude` **CLI binary** in headless `-p --output-format stream-json` mode (`provision-harness.ts:314`) actually fires a file-provisioned `Stop` hook and that exit-2+stderr feeds the model. The plan correctly flags this `⚠️ UNVERIFIED-AT-RUNTIME` (arch §0.2, §3 claude-CLI row, §4.3) and assigns the §9 live eval as the gate.
- **Assessment:** for the SDK adapter (in-process closure) the keystone is fully proven and needs no runtime gate — that path is solid. For the *file-provisioned CLI* path the eval IS a sufficient gate **only if** it executes a real `claude` binary reading a real provisioned `.claude/settings.json` and the build records the score. The plan's §9 fallback ("else an external-fixture executing the same provisioned config") weakens this — see CRIT-2. **The plan must require that the keystone CLI path is proven by a REAL `claude` binary run before AC4 is claimed done; an in-process fixture executing the file's command string does NOT prove the harness fires the hook** (it proves HyperIdle can run a shell command, which was never in doubt). Also: the exit-2+stderr block mechanism for a `.claude/settings.json` Stop command hook is asserted, not cited — there is no authoritative in-repo reference for "Claude Code feeds stderr of a blocking Stop hook back to the model." Builder must verify exit-2 (vs `decision:block` JSON on stdout) is the correct command-hook block channel against the real CLI, or the file hook will silently no-op and the drain gate (the v1 floor) will quietly do all the work — recreating v1.

**CRIT-2 — Per-adapter coverage (#4) and the non-Claude proof (#7) are detached from the real codebase. The plan provisions hooks into harnesses that do not exist and proves nothing on a genuinely non-Claude harness.**
- `codex` and `gemini` are named throughout (concept §8 table, arch §0.3, §3 rows) as the external CLIs to provision hook-config files into. **Reality:** `CLI_TOOL_CONFIGS` (`adapter-pool.ts:324-353`) contains `aider`, `goose`, `opencode` — not codex, not gemini, not claude. `gemini` appears NOWHERE in server/shared/eval source. `codex` appears only as a discovery/probe descriptor (`harness-capability-descriptors.ts:11` `KNOWN_HARNESS_FAMILIES`), not as a spawnable CLI adapter. The plan's entire codex/gemini provisioning narrative is fabricated against the tree — the same class of "verified against code" overstatement v3-r1 was caught for.
- Consequence for #7: the v4 proof scenario claims to prove the native hook on a "non-Claude/external harness." But the only external paths that exist are (a) the **claude CLI** subprocess (`provision-harness.ts:308-328`) — which IS Claude, so it proves the Claude file-hook, not "non-Claude"; and (b) the in-process **`ExternalShapedAdapter`** (`provision-harness.ts:44-73`) which is a direct-LLM mock with NO native hook engine — it cannot fire a real provisioned hook, it can only have HyperIdle execute the command (the very thing CRIT-1 says doesn't prove enforcement). **There is no non-Claude harness in this codebase that has a native turn-end hook to provision into.** So the founder's bar ("prove it on a non-Claude harness") is unmet and, as the tree stands, unprovable without first adding a real non-Claude CLI adapter (e.g. a real `codex`/`opencode` config) whose hook format has been verified.
- **Required revision:** (a) Strike codex/gemini as if they were in-tree; either add a REAL CLI adapter config for an actual non-Claude tool that has a verified turn-end hook, or honestly scope the proof to "claude CLI file-provisioned hook (proven) + SDK in-process (proven) + every other adapter declared `nativeReturnHook` and backstopped by the drain gate." (b) Rename §7's claim from "non-Claude" to what it can actually prove, OR commit to adding a verified non-Claude hook adapter as in-scope work. The plan cannot claim AC4 "uniform across harnesses via a native hook proven per harness" while the only proof vehicles are Claude or a hookless in-process mock.

---

### WARNING findings

**WARN-1 — The `hyperidle_return_status` tool registration seam is mis-described.** Plan §4 says "add one MCP tool to the per-session bridge, registered in `createMcpBridge` alongside the registry tools." But `createMcpBridge` (`mcp-bridge.ts:118-136`) registers tools EXCLUSIVELY by iterating `registry.definitions`; there is no "alongside" path. The builder must either (a) add `hyperidle_return_status` as a real `ToolRegistry` definition (then it is role-filtered — confirm it survives `toolsForRole` for every agent role, and that an MCP tool taking "no input" round-trips through `asMcpInputSchema`), or (b) add an explicit second `registerTool` call in `createMcpBridge` outside the loop (new surface the plan claims is zero). Also: `createMcpBridge({sessionId, registry})` (`session-provisioning.ts:687`) currently takes only `sessionId`+`registry`; the tool needs the per-session `ReturnGate`/registry handle. The plan's `return-enforcement-registry` keyed by `sessionId` solves this IF the tool can resolve `sessionId` from the bridge — `McpBridgeInstance` carries `sessionId` (`mcp-bridge.ts:141`) but the registered tool callback closes over `registry`, not the bridge's `sessionId`. Wire the registry lookup explicitly; do not assume "the bridge token IS the session identity" makes `sessionId` available inside the tool handler for free.

**WARN-2 — "Exactly one `startSession`, no loop" must be proven, not just asserted, and the unified `forceReturnCount` math changes.** Today `forceReturnCount = loopForceCount + getForceReturnCount?()` (`session-provisioning.ts:949`). v4 deletes `loopForceCount` (the loop is gone) so the count must come entirely from the hook (registry block-count for file/CLI; `stopHookCount` for SDK). The §9 eval's "exactly ONE `startSession`" assertion is the right teeth — but the companion CI-safe unit test ("simulate the hook executing its command against the bridge tool") risks being vacuous: simulating the command in-process is not the harness firing the hook. Keep the SDK-closure unit test (genuinely exercises the decision from gate state) and the file-content assertion; treat the "simulated command" test as a wiring check only, not as enforcement proof.

**WARN-3 — Agent-disables-its-own-hook security case relies entirely on the drain gate; confirm the gate cannot be co-disabled.** Plan §7 (security) correctly identifies the drain-end `evaluateReturn` (`session-provisioning.ts:994`) as the un-bypassable backstop if an agent edits `.claude/settings.json` to drop the Stop hook — and source confirms the gate reads the event stream independent of the hook (VERIFIED, #5). Good. But verify the gate's input (`returnGate.observe` over `streamEvents`) cannot be suppressed by the same sandbox-write capability (e.g. an agent that can also influence what tool_call events the harness emits). The gate is only a backstop if its truth source (the event stream) is outside agent control. Document this boundary as `@lore` per the plan's intent. Note this also means: for any `nativeReturnHook:"none"` adapter, the gate is the *only* enforcement — which is acceptable as a documented floor but is NOT "enforcement via native hook," so AC4's "uniform" wording overclaims for those rows.

**WARN-4 — `{{workspace}}` vs `{{sandbox}}` template bug is acknowledged but its interaction with the file-hook is undersold.** Plan §1 notes `CLI_TOOL_CONFIGS` args use `{{workspace}}` while the template type is `{{sandbox}}` (`adapter-pool.ts:327/337/346` vs `cli-harness-adapter.ts:35`), flags it pre-existing/out-of-scope, and says the `.claude/settings.json` write "does not depend on it." Confirm: the file write uses `path.join(sandboxPath,...)` directly (correct), and the CLI's `cwd` is `config.sandboxPath` (`cli-harness-adapter.ts:208`, correct) — so the hook file lands in cwd regardless of the broken arg template. Fine. But if the builder adds a real non-Claude CLI config to satisfy CRIT-2, it will hit this bug; flag it as a blocker for that path, not a deferral.

---

### NITs

- **NIT-1** Concept §8 / arch §3 list a `mock` row declaring `nativeReturnHook:"none"|"sdk-inprocess"` "per test need" — a non-optional field cannot be conditionally one of two values per test without the mock exposing a setter; specify the mock default and how tests override it.
- **NIT-2** `AL6_MAX_FORCE_RETURNS=2` is reused as the hook's per-turn block budget. With the loop gone, "force budget" now means "hook blocks before allowing the stop" — same number, different mechanism. Update the `return-actions.ts:79-88` doc comment (still says "re-injections per turn" / "provisioning drain applies not_returned") so it doesn't describe the deleted loop.
- **NIT-3** Plan keeps `getForceReturnCount?` optional on the interface but every enforcing adapter now needs it; consider whether it should be non-optional alongside `nativeReturnHook` to force each adapter to surface its hook-block count (the same forcing-function rationale the plan uses for `nativeReturnHook`).

---

### 9-dimension scores

| Dimension | Score | Note |
|---|---|---|
| 1. Concept integrity (is the thing right?) | 8 | The "harness fires its own native hook; HyperIdle provisions + adjudicates" model is exactly the founder's direction and is sound. |
| 2. Source-grounding / verification honesty | 4 | Keystone SDK seam genuinely verified; but codex/gemini fabricated against the tree and the "non-Claude proof" overclaims (CRIT-2). Repeat of the v3-r1 failure mode. |
| 3. Contract soundness (hook→bridge→gate) | 7 | Transport/auth/route all verified; tool-registration seam mis-described (WARN-1) but fixable. |
| 4. Per-adapter coverage / AC4 | 4 | SDK+claude-CLI real; "uniform native hook per harness" unmet for every actual non-Claude adapter (none have a verified hook); `none`+gate-floor is honest but contradicts the "uniform via native hook" claim. |
| 5. Deletion cleanliness (v3 removal) | 9 | Delete/keep targets all exist exactly as named; closed set + gate + outcome correctly retained. |
| 6. Backstop integrity (no silent v1 regression) | 8 | Drain gate is a genuine independent backstop (verified); risk is it doing ALL the work if the file hook silently no-ops (CRIT-1). |
| 7. Eval / proof design | 5 | Right instinct (one startSession, registry-sourced count, hookFiredVia marker) but the proof vehicle is Claude or a hookless mock — not a proven non-Claude native hook (CRIT-2). |
| 8. Verification-method fit (CLAUDE.md) | 8 | Static `nativeReturnHook` non-optional → type system (correct); runtime → eval/integration (correct); good split. |
| 9. Security / abuse | 8 | Token-auth reuse, no agent-authored command interpolation, path is server-built, disable-hook→gate backstop all sound (WARN-3 boundary to document). |

**Weighted score: 6.4 / 10 → NEEDS-REVISION** (threshold 7).

---

### What must change before APPROVED

1. **(CRIT-2)** Remove codex/gemini-as-in-tree fiction. Either (a) add a REAL non-Claude CLI adapter (verified turn-end hook format) and prove the provisioned native hook on it, or (b) honestly rescope AC4/§7/§9: "proven on claude-SDK (in-process) + claude-CLI (file-provisioned, real binary); every other adapter declares `nativeReturnHook` and is backstopped by the drain gate as a documented floor." The plan may not claim "native hook proven per non-Claude harness" while no such harness exists in the tree.
2. **(CRIT-1)** Require the keystone CLI proof to run a REAL `claude` binary reading a REAL provisioned `.claude/settings.json`; forbid the in-process "fixture executes the command string" path from counting as enforcement proof. Verify the command-hook block channel (exit-2+stderr vs stdout JSON) against the real CLI before declaring AC4 done.
3. **(WARN-1)** Correct the `hyperidle_return_status` registration seam to match `createMcpBridge`'s registry-only tool path, and wire the `sessionId`→registry lookup explicitly.

The v4 *design* clears the founder's bar; the v4 *plan* overstates its codebase grounding and its proof. Fix the two CRITICALs (primarily honesty + scoping, not redesign) and this is APPROVED.
