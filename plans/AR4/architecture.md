# Architecture — AR4: The assistant is a normal agent

**Verify command:** `npm run verify` (check + lint + knip + test:all + build + attestation).
**Targeted during build:** `npm run check`, `npm run test`, `npm run test:integration`.
**Source of truth:** `.pipeline/work-packages/TRACK-AR.md` §AR4 · **Concept:** `plans/AR4/concept.md` ·
**Design:** `plans/AR4/design/design.md`.

This plan is grounded in a read of the live code, not the spec prose. Every named symbol in §3 was
verified against the current branch.

---

## 1. Context — what problem, why now

The assistant chat is a **builtin-only in-process path** (`runAssistantTurn`) that hardwires
`harnessType:"builtin"` and posts a `missing_key` notice to any user without an OpenRouter key. A user
who is all-in on Codex/Claude/OpenCode via CLI login **cannot chat with their assistant at all**. The
path also bypasses the strategy split (persona/tools hardcoded at the turn) and the harness machinery,
which is why its honest-harness tests can only run builtin-only — breaking AT1/AR7's four-harness
symmetry floor.

**The key architectural discovery from the audit:** every mechanism the harness-agnostic turn needs —
registry tool delivery (in-process for builtin, MCP bridge for CLI), prompt assembly, a real sandbox —
**already exists in `provisionSession` and already runs all four harnesses.** `runAssistantTurn` is a
*parallel, builtin-only reimplementation* of a subset of it. AR4 deletes the special path and serves the
conversational occasion through a **conversational mode of the shared provisioning path** (concept §5).

---

## 2. Constraints

- **Strategy/Kernel boundary FOUNDER-LOCKED** (concept §4): strategy owns persona+tools and emits the
  formation request; Kernel/User owns harness+model. A strategy MUST NOT write
  `harnessType`/`modelId`/`modelProvider` (`AgentScaffoldSpec` @lore, strategy-port.ts:153-166). Do not
  re-litigate.
- **Do NOT widen the `HarnessAdapter` interface** with a conversational seam. `ConversationMessage`/
  `messages` stays a builtin-adapter convenience; the transcript reaches CLI harnesses through the shared
  **assembled prompt** channel (harness-adapter.ts @lore "ConversationMessage is NOT widened").
- **Never-silent preserved:** every turn ends in a persisted reply or a persisted notice
  (`missing_key`/`missing_harness`/`provider_error`); **no secret in a notice.**
- **Honest harness testing holds** (AR1/AR2/AR7): real binary, zero stubs, `requireHarness` hard-fail, no
  `skipIf`; assistant tests use the locked `HARNESS_TEST_MODELS` matrix + `SUPPORTED_HARNESS_LANES`/
  `runThroughHarness`; satisfy `assertHarnessSymmetry`; remove the assistant from `BUILTIN_ONLY_INTEGRATION`.
- **Keep** the already-shipped AD2/R1 real-harness conversion, `minimalStrategy`, and the dispatcher
  `onBeforeTeardown` seam (session-provisioning.ts:179-236, 1180-1190).
- **Preserve the `(harness, provider, model)` triple validation** on the assistant config save
  (`validateHarnessModelTriple`, agents.ts).
- **TS strict, no `any`, no unsafe `as`** (.claude/rules/typescript.md). Boring tech.

---

## 3. Plan reconciliation — every named symbol verified against the branch

| Symbol | Location (verified) | Role in AR4 |
|---|---|---|
| `runAssistantTurn` / `runTurnInternal` | `packages/server/src/services/assistant-turn.ts:217,255` | The builtin-only path. Its builtin-specific reimplementation (Steps 3-6) is **replaced** by a call into the shared provisioning conversational mode. |
| `setSessionToolRegistry` (concrete) | `BuiltinHarnessAdapter` (builtin-harness-adapter.ts); called assistant-turn.ts:434-436 | Coupling #1. **Removed from the turn** — the shared path already does this for builtin (Phase 8.5a, session-provisioning.ts:730-732) and routes CLI via MCP. |
| `config.messages` builtin branch | `SessionConfig.messages` (harness-adapter.ts:122); consumed by builtin adapter only | Coupling #2. Transcript moves to the **assembled prompt**; `messages` stays an optional builtin convenience, NOT the contract. |
| `sandboxPath:""` no-mode | assistant-turn.ts:466 | Coupling #3. The conversational mode provisions a **real sandbox** via the shared path. |
| `provisionSession` / `admitSession` / `ProvisionSessionParams` / `ProvisionSessionDeps` | session-provisioning.ts:367,239,~150 | The shared path. Gains a **conversational mode** branch (mirroring the `routineId` branch). |
| `routineId` branch | ProvisionSessionParams:275; assembly switch session-provisioning.ts:751 | **Precedent** — non-task assembly branch with a stub `taskId` FK. Conversational mode follows this shape. |
| `buildToolRegistry` | tool-registry.ts; called session-provisioning.ts:710 | Harness-agnostic registry build. Conversational mode supplies the **draft tool surface** here. |
| MCP bridge + `writeCliMcpConfig` + `.mcp.json` | session-provisioning.ts:803-838 | Harness-agnostic tool delivery for CLI. Conversational mode gets this **for free** by riding the shared path. |
| `buildAssistantDraftRegistry` / `resolveDraftTeamId` / `resolveCurrentDraftBetId` | tools/assistant-draft-registry.ts | The 2-tool draft surface (`create_bet`,`edit_bet`). In AR4 the **strategy formation seam** decides this surface; the builder fn becomes the Minimal strategy's answer. |
| `getActiveStrategy()` / `Strategy<TDb>` / `scaffoldAgents` / `AgentScaffoldSpec` | strategy-registry.ts; strategy-port.ts:316,326,153 | The formation seam. Today called at **creation** only; AR4 adds a **turn-time formation** consultation. |
| `persistScaffoldedAgents` | scaffold-agents.ts:76; hardcodes harness/model :99-101 | Kernel default-attach. The hardcoded `harnessType:"builtin"` stays as the **default** but becomes **user-overridable** via Settings (it already is, per-agent, via PATCH). |
| `validateHarnessModelTriple` | routes/agents.ts (triple validator) | Reused by the assistant config save. |
| `PATCH /api/users/:userId/assistant` / GET | routes/assistant.ts:253-425 | Extended to accept+validate harness/model (Option A) — GET already returns them (:327-329). |
| `SettingsAssistant` / `SettingsAgents` filter | web/src/settings/SettingsAssistant.tsx; SettingsAgents.tsx:752 | Settings surface (design). Filter `role!=="assistant"` stays; `SettingsAssistant` gains the extracted selects. |
| `BUILTIN_ONLY_INTEGRATION` | scripts/lib/honest-harness-predicate.ts:70 | The 3 assistant entries are **removed** once the turn runs real on all four harnesses. |
| `SUPPORTED_HARNESS_LANES` / `runThroughHarness` / `lockedHarnessAdapter` / `HARNESS_TEST_MODELS` | harness/__tests__/provision-real-session.ts:447,589,394; require-harness.ts | The four-harness test matrix the assistant tests adopt. |
| `assertHarnessSymmetry` | AR7 (referenced in honest-harness-guard / attestation floor) | The floor the assistant tests must satisfy with no carve-out. |
| `minimalStrategy` | strategy-minimal/src/minimal-strategy.ts | Test strategy + the place the draft-tool formation answer lands for the Minimal path. |
| `onBeforeTeardown` / `BeforeTeardownContext` | session-provisioning.ts:179-236,1180-1190 | Kept; the capture seam AD2/R1 already use; conversational-turn tests reuse it. |

---

## 4. Acceptance criteria → verification method

| AC (from §AR4) | Verification |
|---|---|
| AC1 — assistant answers through its configured harness (builtin/claude/codex/opencode); CLI-only user gets a reply, not `missing_key` | `*.integration.test.ts` over `SUPPORTED_HARNESS_LANES`: provision a conversational turn on each harness, assert a persisted reply row exists. The codex/opencode lanes run with **no `OPENROUTER_API_KEY` dependency for the reply path** (the harness uses its CLI login). Hard-fail on missing binary. |
| AC2 — harness+model configurable from Settings; validated against the triple; changes which harness serves the next reply | Service `*.integration.test.ts`: PATCH the assistant config with a valid triple → 200 + row updated; with an incompatible triple → 422 (no write). A turn test asserts the configured harness is the one provisioned. |
| AC3 — persona+tools strategy-decided at formation/turn time; switching strategy changes the form | `*.integration.test.ts`: run the turn under two strategies (Minimal vs a test strategy with a different persona/tool answer) → assert the provisioned persona/tool surface differs. |
| AC4 — runs through the same machinery; no assistant-only adapter branch / builtin-only coupling | `eslint`/`knip` + a unit/lint check: assert `runAssistantTurn` no longer calls `setSessionToolRegistry` and no longer builds a `sandboxPath:""` `SessionConfig`; the three couplings are gone. (Static property → grep-guard or a focused unit asserting the new turn delegates to `provisionSession`.) `npm run check` catches removed branches. |
| AC5 — assistant real-harness tests symmetric across 4 harnesses; assistant removed from `BUILTIN_ONLY_INTEGRATION`; satisfies `assertHarnessSymmetry`, no carve-out | `npm run lint` (honest-harness-guard) + attestation per-harness floor (`agenticExecutedByHarness`) go green with the assistant entries deleted from `honest-harness-predicate.ts:70`. |
| AC6 — never-silent preserved; no secret in a notice | Unit/integration: force each failure class (missing credential, no eligible harness, provider timeout) → assert exactly one persisted notice of the right class and that the notice text contains no key/token substring. |
| AC7 — AD2/R1 + minimalStrategy + onBeforeTeardown retained and passing | Run the existing `AD2-task-dispatcher-real` / `R1-wire-agent-execution-real` integration tests — unchanged, green. |

---

## 5. RECOMMENDED SPLIT — three sub-WPs

This is an **L** WP spanning harness adapters, the conversational-turn path, the strategy port, Settings
UI, and storage. The spec explicitly invites a split. **Recommended.** Three sub-WPs, ordered, each
independently shippable and verifiable, each ending in a CI-green PR.

### AR4a — Harness-agnostic conversational turn (the conversational mode)  **[M-L, do first]**

**Deliverable.** A **conversational mode** on the shared `provisionSession` path that serves a thread
reply on **all four harnesses**, replacing `runAssistantTurn`'s three builtin-only couplings. The
transcript reaches the model via the assembled prompt; the draft tools flow via the shared registry →
(in-process | MCP) split. Persona/tools/harness/model still read off the `users` row here (formation
seam is AR4b) — but the **run mechanism is now shared and harness-agnostic.**

**Scope.**
1. Add a conversational mode to `ProvisionSessionParams` (mirror `routineId`): a discriminator (e.g.
   `conversational?: { threadId; assistantAgentId; draftRegistry }`) that switches assembly to the
   **conversational branch** (transcript context) and supplies the draft tool surface to
   `buildToolRegistry`. Stub `taskId` satisfies the FK (the routine precedent).
2. Conversational assembly branch (alongside task/routine in session-provisioning.ts:751): build the
   prompt from the thread transcript (`loadRawTranscript` + `mapTranscriptToMessages`, lifted from
   assistant-turn.ts) so **every harness** receives the transcript in AGENTS.md/the assembled prompt.
   Builtin may additionally receive `config.messages` for a cleaner chat shape, but the contract is the
   prompt channel.
3. Rewrite `runAssistantTurn` to **delegate to the shared path**: resolve harness/model/persona off the
   row, resolve the draft team/bet binding, call `provisionSession` in conversational mode, map the
   result → persisted reply or notice. Delete the `setSessionToolRegistry` call, the `sandboxPath:""`
   `SessionConfig`, and the parallel adapter selection/drain (Steps 3-6).
4. Enumerate which provisioning phases the conversational mode **skips** (concept §8 flag): no
   cost-onto-bet accumulation, return-gate is compliant-by-construction (existing AL6 @lore), no task
   transition. Document each skip with a `@lore AR4a`.
5. Preserve never-silent: map `MissingCredentialError` / `NoEligibleHarnessError` / provider timeout to
   the existing notice classes; no secret in any notice.

**Tests (red first).** Conversational turn over `SUPPORTED_HARNESS_LANES` (4 lanes,
`runThroughHarness`-style, real binaries, hard-fail on absence): each lane → persisted reply. CLI-only
(no OpenRouter key) reply works. Never-silent failure-class tests. **Remove the assistant files from
`BUILTIN_ONLY_INTEGRATION`** as part of *this* sub-WP — the carve-out's own `@lore AR4` precondition
(real sandbox + MCP bridge) is satisfied here.

**Why first.** It is the load-bearing piece: it makes the four-harness turn real, which is the
precondition for removing the carve-out (AC4/AC5) and the substrate AR4b/AR4c configure. Reuses AR2's
`provisionSession` seam + lane helpers + the AD2/R1 `onBeforeTeardown` capture.

**Risk to retire early:** transcript-via-prompt actually reaching a CLI model and the draft tools firing
over MCP. This is the genuine unknown (`cli-harness-adapter.ts:360` only seeds 200 chars + AGENTS.md;
the `@lore AR4 WARNING-D1` already flags model-flag handling). Prove it live in this sub-WP before
anything depends on it.

### AR4b — Strategy formation seam  **[M, second]**

**Deliverable.** The assistant's **persona + tool surface** are decided by the **active strategy** at
turn time, not read hardcoded. Switching the active strategy changes the assistant's form (AC3).

**Scope.**
1. Define the formation consultation (concept §4): at turn time the conversational turn asks
   `getActiveStrategy()` for the assistant's **persona + draft tool surface**. Decide the port shape —
   reuse `scaffoldAgents({trigger:"user_assistant", …})` to return the persona, plus a thin addition for
   the **tool surface** (today `buildAssistantDraftRegistry` is hardcoded). The boring default: extend
   the formation answer to carry the draft tool set (the Minimal strategy returns the current 2-tool
   surface; a different strategy can return a different one). Keep it synchronous-within-flow like the
   other port methods unless there is a reason to make it an event.
2. Remove the **hardcoded persona/tools** from the turn: `runAssistantTurn` no longer reads
   `BUILTIN_SYSTEM_PROMPT` directly nor inlines `buildAssistantDraftRegistry`; both come from the
   formation answer. The hardcoded `harnessType:"builtin"` at `assistant-turn.ts:270-288` (lazy-create)
   and `scaffold-agents.ts:99-101` stays as the **Kernel default** (boundary-locked) — but the turn must
   not *re-derive* form from a constant.
3. `minimalStrategy` (strategy-minimal) provides the draft-tool formation answer for the default path,
   so production behavior is unchanged when the Minimal strategy is active.

**Tests (red first).** Run the conversational turn under two strategies; assert persona + tool surface
differ (AC3). A guard that the turn calls `getActiveStrategy()` at turn time (today it never does).

**Why second.** Depends on AR4a's shared-path turn existing (the formation answer feeds the shared
registry build). Smaller, self-contained.

### AR4c — Settings config + assistant-as-normal-agent wiring  **[M, third]**

**Deliverable.** The user configures the assistant's harness+model in Settings, validated against the
triple; the change drives the next reply (AC2). The assistant is no longer excluded from agent config.

**Scope.**
1. **UI** (design §): extend `SettingsAssistant` with the extracted Harness + Model selects above the
   persona textarea (the `Configured` story is the design artifact). Widen dirty tracking to
   harness/model/persona. Keep the `SettingsAgents` `role!=="assistant"` filter (design §2).
2. **Storage/route** (Option A): extend `PATCH /api/users/:userId/assistant` to accept
   `harnessType`/`modelId`/`modelProvider`, run `validateHarnessModelTriple` (shared with agents.ts) →
   422 on incompatible, persist on valid. GET already returns the triple.
3. The turn reads harness/model off the row (already the shape after AR4a/b) → a Settings change changes
   the next reply.

**Tests (red first).** Service `*.integration.test.ts`: PATCH valid triple → 200 + row updated; PATCH
incompatible triple → 422 + no write. Component test (`*.test.tsx`) for the extended `SettingsAssistant`
populated/dirty/save states. A turn test asserting the configured harness is the provisioned one (AC2).

**Why third.** Depends on AR4a (the turn reads harness/model and runs them) and is the user-facing skin
on top. Smallest blast radius.

### Ordering + reuse summary

```
AR4a (conversational mode, 4-harness real, remove carve-out)  ← reuses AR2 provisionSession + lanes + AD2/R1 onBeforeTeardown
   └─> AR4b (strategy formation seam)                          ← reuses AR4a shared turn
          └─> AR4c (Settings config + triple validation)       ← reuses AR4a row-read + agents.ts validator
```

AD2/R1 (already shipped) are **untouched** by all three and verified green at each step (AC7). If the WP
is **not** split, the same ordering applies as internal phases, but the split is strongly recommended:
each sub-WP is independently CI-green-able and the risky piece (AR4a transcript-via-prompt on CLI) is
isolated and proven before the rest is built.

---

## 6. Trade-offs and open questions

- **Conversational mode vs adapter seam** (decided, concept §5): mode on the shared path. The cost is one
  more assembly branch in `provisionSession` (already has two: task, routine); the benefit is deleting a
  whole parallel builtin-only path and getting four-harness tool delivery + MCP bridge for free. Net
  large reduction in coupling surface.
- **Transcript delivery channel** (decided): assembled prompt / AGENTS.md (every harness reads it), NOT
  `config.messages` into CLI adapters. Open sub-question for AR4a build: how much transcript to inline
  vs summarize for the CLI prompt seed (`cli-harness-adapter.ts:360` truncates to 200 chars as the
  *initial message*, but AGENTS.md carries the full assembled prompt — confirm the CLI binary reads
  AGENTS.md as context, which the audit and existing CLI lanes indicate it does).
- **Formation port shape** (open for AR4b): reuse `scaffoldAgents` + a thin tool-surface addition, vs a
  new `formAssistant` method, vs an eventBus formation event. Recommend the smallest: extend the existing
  synchronous formation answer to carry the tool surface; only reach for an event if a real need appears.
  Founder framing ("emits a formation request") is satisfied by a synchronous port call (matches
  `scaffoldAgents`/`selectAgent`, both synchronous-within-flow).
- **Save route shape** (open for AR4c): Option A (extend the assistant route, recommended — one write
  surface) vs Option B (save harness/model through `PATCH /api/agents/:id`). A keeps the assistant write
  in one place; B reuses the validated route verbatim but splits persona vs harness/model writes.
- **Kernel default `harnessType:"builtin"`** stays (boundary-locked) at both creation sites. The
  assistant is treated identically to team agents: builtin default, user-overridable via Settings. This
  is intentional and correct per concept §4 — not a leftover to clean.
- **Risk concentration:** AR4a carries essentially all the genuine unknown (real CLI conversational turn).
  AR4b/AR4c are mostly wiring over solved patterns. The ordering puts the risk first, which is correct.
