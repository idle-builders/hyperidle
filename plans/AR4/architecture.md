# Architecture — AR4: The assistant is a normal agent

**Verify command:** `npm run verify` (check + lint + knip + test:all + build + attestation).
**Targeted during build:** `npm run check`, `npm run test`, `npm run test:integration`.
**Source of truth:** `.pipeline/work-packages/TRACK-AR.md` §AR4 · **Concept:** `plans/AR4/concept.md` ·
**Design:** `plans/AR4/design/design.md`.

This plan is grounded in a read of the live code, not the spec prose. Every named symbol in §3 was
verified against the current branch (re-verified post-critique — see §3a for the corrections).

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

**The one thing the shared path does NOT yet do — and the load-bearing addition AR4a makes:** it does not
**return the agent's reply text**. The task path drains the harness stream internally and returns a
cost/verdict struct; the agent's deliverable lands as *files in the sandbox* (read back via
`onBeforeTeardown`), never as returned text. A chat reply is stream text with no file. So AR4a's first
and riskiest job is to add a **reply-return channel** to the shared drain (§5 AR4a, the
`conversationalReply` mechanism). This is specified concretely below — it is no longer deferred to the
build.

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
  `runThroughHarness`; satisfy `assertHarnessSymmetry`. **Remove the assistant from
  `BUILTIN_ONLY_INTEGRATION` only after the reply-row assertion is green on all four harnesses** (§5
  AR4a — premature removal relocates the AT1 symmetry failure instead of fixing it).
- **Keep** the already-shipped AD2/R1 real-harness conversion, `minimalStrategy`, and the dispatcher
  `onBeforeTeardown` seam (session-provisioning.ts:179-236, 1180-1190).
- **Preserve the `(harness, provider, model)` triple validation** on the assistant config save. The real
  validator is **`validateAgentConfig`** (`routes/agents.ts:109`), currently **file-local / un-exported**
  — AR4c exports it for reuse (§5 AR4c). (Not `validateHarnessModelTriple`; that symbol does not exist.)
- **TS strict, no `any`, no unsafe `as`** (.claude/rules/typescript.md). Boring tech.

---

## 3. Plan reconciliation — every named symbol verified against the branch

| Symbol | Location (verified) | Role in AR4 |
|---|---|---|
| `runAssistantTurn` / `runTurnInternal` | `packages/server/src/services/assistant-turn.ts:217,255` | The builtin-only path. Its builtin-specific reimplementation (Steps 3-6) is **replaced** by a call into the shared provisioning conversational mode. |
| `drainStreamEvents(...).text` | `assistant-turn.ts:475-514` | How the deleted path captures its reply — it owns the drain and reads completion text directly. The shared path must reproduce this capture (§5 AR4a, `conversationalReply`). |
| `setSessionToolRegistry` (concrete) | `BuiltinHarnessAdapter` (builtin-harness-adapter.ts); called assistant-turn.ts:434-436 | Coupling #1. **Removed from the turn** — the shared path already does this for builtin (Phase 8.5a, session-provisioning.ts:730-732) and routes CLI via MCP. |
| `config.messages` builtin branch | `SessionConfig.messages` (harness-adapter.ts:122); consumed by builtin adapter only | Coupling #2. Transcript moves to the **assembled prompt**; `messages` stays an optional builtin convenience, NOT the contract. |
| `sandboxPath:""` no-mode | assistant-turn.ts:466 | Coupling #3. The conversational mode provisions a **real sandbox** via the shared path. |
| `provisionSession` / `admitSession` / `ProvisionSessionParams` / `ProvisionSessionDeps` | session-provisioning.ts:367,239,~150 | The shared path. Gains a **conversational mode** branch (mirroring the `routineId` branch). |
| `ProvisionSessionResult` | session-provisioning.ts:295-324 | `{sessionId, outcome, totalCostCents, taskId, returnVerdict?, forceReturnCount}` — **no reply field today.** AR4a adds optional `conversationalReply?` (mirrors `returnVerdict?` optionality). |
| `runSession` drain loop | session-provisioning.ts:1054-1108 (loop); result return sites :1204,1224,1265,1283 | Branches on cost_update/token_usage/tool_call/error + `returnGate.observe()` — **no `completion` branch.** AR4a adds one (§5 AR4a). |
| `{type:"completion", text}` event | emitted by `cli-harness-adapter.ts:808,860` and `builtin-harness-adapter.ts:602`; observed by `returnGate.observe()` then **discarded** | The reply text. AR4a's drain edit captures it. |
| `onBeforeTeardown` / `BeforeTeardownContext` | session-provisioning.ts:179-236,1180-1190; ctx = `{sessionId, sandboxPath}` | Kept; the AD2/R1 **file-reading** capture seam. **Cannot carry a chat reply** (reply is stream text, writes no file) — which is why `conversationalReply` is needed instead. |
| `routineId` branch | ProvisionSessionParams:275; assembly switch session-provisioning.ts:751 | **Precedent** — non-task assembly branch with a stub `taskId` FK. Conversational mode follows this shape. |
| `buildToolRegistry` | tool-registry.ts; called session-provisioning.ts:710 | Harness-agnostic registry build. Conversational mode supplies the **draft tool surface** here (the AR4a↔AR4b seam, §3a). |
| `buildAssistantDraftRegistry` / `resolveDraftTeamId` / `resolveCurrentDraftBetId` | tools/assistant-draft-registry.ts | Builds the 2-tool draft surface (`create_bet`,`edit_bet`) **inline today** (not on any row). AR4a calls it directly to feed `buildToolRegistry`; AR4b moves its selection into formation (§3a seam). |
| `getActiveStrategy()` / `Strategy<TDb>` / `scaffoldAgents` / `AgentScaffoldSpec` | strategy-registry.ts; strategy-port.ts:316,326,153 | The formation seam. Today called at **creation** only; AR4b adds a **turn-time formation** consultation. |
| `persistScaffoldedAgents` | scaffold-agents.ts:76; hardcodes harness/model :99-101 | Kernel default-attach. The hardcoded `harnessType:"builtin"` stays as the **default** but becomes **user-overridable** via Settings (it already is, per-agent, via PATCH). |
| `validateAgentConfig` | `routes/agents.ts:109` (file-local, **un-exported**); called :262,385,454 | The real `(harness, provider, model)` triple validator. AR4c **exports** it and reuses it on the assistant save (WARN-1 fix). |
| `PATCH /api/users/:userId/assistant` / GET | routes/assistant.ts:253-425 | Extended to accept+validate harness/model (Option A) — GET already returns them (:327-329). |
| `SettingsAssistant` / `SettingsAgents` filter | web/src/settings/SettingsAssistant.tsx; SettingsAgents.tsx:752 | Settings surface (design). Filter `role!=="assistant"` stays; `SettingsAssistant` gains the extracted selects. |
| `BUILTIN_ONLY_INTEGRATION` | scripts/lib/honest-harness-predicate.ts:70 | The 3 assistant entries are removed **only after** the reply-row assertion is green on all 4 harnesses (§5 AR4a). |
| `SUPPORTED_HARNESS_LANES` / `runThroughHarness` / `lockedHarnessAdapter` / `HARNESS_TEST_MODELS` | harness/__tests__/provision-real-session.ts:447,589,394; require-harness.ts | The four-harness test matrix the assistant tests adopt. |
| `assertHarnessSymmetry` | AR7 (referenced in honest-harness-guard / attestation floor) | The floor the assistant tests must satisfy with no carve-out. |
| `minimalStrategy` | strategy-minimal/src/minimal-strategy.ts | Test strategy + the place the draft-tool formation answer lands for the Minimal path. |

### 3a. Post-critique corrections (verification-integrity)

The critique caught three reconciliation misses; all three are now folded into the table above and the
sub-WP scope below:

1. **`validateHarnessModelTriple` does not exist.** Corrected to **`validateAgentConfig`**
   (`routes/agents.ts:109`), which is **file-local / un-exported**. Reusing it on the assistant save is
   not free — AR4c gains an explicit **export `validateAgentConfig`** step (§5 AR4c step 2).
2. **The reply has no return channel** (CRITICAL — §4a below). `ProvisionSessionResult` carries no reply
   field and the drain loop has no `completion` branch. AR4a adds `conversationalReply?` + the drain edit.
3. **The AR4a↔AR4b draft-tool seam** (WARN-2 — §3b below) is named so AR4a doesn't bake a shape AR4b
   unpicks.

### 3b. The AR4a→AR4b draft-tool seam (named)

The draft tools (`create_bet`/`edit_bet`) are **not on any row** today — `buildAssistantDraftRegistry`
(`tools/assistant-draft-registry.ts`) builds them **inline**. AR4a's conversational turn must hand a
draft tool surface to the shared `buildToolRegistry` (session-provisioning.ts:710) to run the 4-harness
turn — but the *source* of that surface (inline builder vs strategy formation answer) is AR4b's concern.

**The seam:** AR4a passes the draft tool surface into the conversational-mode discriminator as a
**caller-supplied value** (`conversational: { …, draftRegistry }`), and the *only* caller —
`runAssistantTurn` — populates it by calling `buildAssistantDraftRegistry(...)` **directly** (the
pre-AR4b provisional source). `provisionSession` itself never reaches into the builder; it just forwards
whatever surface the discriminator carries to `buildToolRegistry`. AR4b then changes **one call site**
(where `runAssistantTurn` computes that surface) from the inline builder to the formation answer — the
discriminator shape and `provisionSession`'s plumbing are untouched. No churn in the shared path; the
swap is isolated to the turn's "where does the tool surface come from" line.

---

## 4. Acceptance criteria → verification method

| AC (from §AR4) | Verification |
|---|---|
| AC1 — assistant answers through its configured harness (builtin/claude/codex/opencode); CLI-only user gets a reply, not `missing_key` | `*.integration.test.ts` over `SUPPORTED_HARNESS_LANES`: provision a conversational turn on each harness, **assert the persisted assistant reply row contains the model's real completion text** (not empty, not a stub) — this is the test that exercises the `conversationalReply` return channel (§4a). The codex/opencode lanes run with **no `OPENROUTER_API_KEY` dependency for the reply path** (the harness uses its CLI login). Hard-fail on missing binary. |
| AC2 — harness+model configurable from Settings; validated against the triple; changes which harness serves the next reply | Service `*.integration.test.ts`: PATCH the assistant config with a valid triple → 200 + row updated; with an incompatible triple → 422 (no write). A turn test asserts the configured harness is the one provisioned. |
| AC3 — persona+tools strategy-decided at formation/turn time; switching strategy changes the form | `*.integration.test.ts`: run the turn under two strategies (Minimal vs a test strategy with a different persona/tool answer) → assert the provisioned persona/tool surface differs. |
| AC4 — runs through the same machinery; no assistant-only adapter branch / builtin-only coupling | `eslint`/`knip` + a unit/lint check: assert `runAssistantTurn` no longer calls `setSessionToolRegistry` and no longer builds a `sandboxPath:""` `SessionConfig`; the three couplings are gone. (Static property → grep-guard or a focused unit asserting the new turn delegates to `provisionSession`.) `npm run check` catches removed branches. |
| AC5 — assistant real-harness tests symmetric across 4 harnesses; assistant removed from `BUILTIN_ONLY_INTEGRATION`; satisfies `assertHarnessSymmetry`, no carve-out | `npm run lint` (honest-harness-guard) + attestation per-harness floor (`agenticExecutedByHarness`) go green with the assistant entries deleted from `honest-harness-predicate.ts:70` — **only once AC1's reply-row assertion is green on all four lanes** (§5 AR4a). |
| AC6 — never-silent preserved; no secret in a notice | Unit/integration: force each failure class (missing credential, no eligible harness, provider timeout) → assert exactly one persisted notice of the right class and that the notice text contains no key/token substring. |
| AC7 — AD2/R1 + minimalStrategy + onBeforeTeardown retained and passing | Run the existing `AD2-task-dispatcher-real` / `R1-wire-agent-execution-real` integration tests — unchanged, green. |

### 4a. The conversational-reply return mechanism (the CRITICAL, designed)

The shared path drains the harness stream **internally** and returns a cost/verdict struct; the agent's
completion text (`{type:"completion", text}`) is observed by `returnGate.observe()` at
`session-provisioning.ts:1058` and then **discarded** — the task path never needs it (deliverables land
as sandbox files read back via `onBeforeTeardown`). A chat reply is stream text and writes no file, so
`onBeforeTeardown` cannot carry it. The mechanism, concretely:

**(1) New optional result field.** Add to `ProvisionSessionResult` (session-provisioning.ts:295-324):

```ts
/**
 * AR4a: The agent's reply text for a CONVERSATIONAL-mode turn — the accumulated
 * `completion` event text from the drain. Present ONLY in conversational mode;
 * absent (undefined) for task/routine sessions (mirrors `returnVerdict?` optionality).
 * The assistant-turn caller persists this as the reply row; a task caller ignores it.
 */
readonly conversationalReply?: string;
```

It is **optional and conversational-only** — the task/routine result contract is untouched (mirrors the
existing `returnVerdict?` precedent, which is documented "Absent … on assistant turns"). No task-path
caller reads it; no `as`/widening of the task contract.

**(2) Drain-loop capture edit** (`session-provisioning.ts:1054-1108`). Add a local accumulator before the
loop and a `completion` branch inside it — **after** the existing `returnGate.observe(event)` (line 1058,
which stays first and read-only), alongside the existing `cost_update`/`token_usage`/`tool_call`/`error`
branches:

```ts
let conversationalReplyText = "";        // before the for-await loop
// …inside the loop, a new branch (does NOT disturb the existing four):
} else if (event.type === "completion") {
    if (isConversational) conversationalReplyText += event.text;
}
```

`isConversational` is the conversational-mode discriminator already threaded for assembly (§5 AR4a). The
branch is **inert for task/routine** (the flag is false → nothing accumulates → the task path is
byte-for-byte unchanged in behavior). The completion event is currently unmatched by any branch and falls
through; adding a guarded branch cannot perturb cost/token/tool/error handling.

**(3) Thread onto the return.** Populate `conversationalReply` only on the **normal-completion** return
site (`:1283`, `outcome:"completed"`): `conversationalReply: isConversational ? conversationalReplyText :
undefined`. The crashed/budget_exhausted/not_returned sites (:1204/1224/1265) leave it `undefined` — a
crashed conversational turn maps to a never-silent **notice**, not a reply (concept never-silent). The
caller (`runAssistantTurn`) maps a populated `conversationalReply` → the persisted assistant reply row,
and an absent one (crash/missing-credential/no-harness) → the matching notice class.

**Why this and not `onBeforeTeardown`:** the seam carries `{sessionId, sandboxPath}` for *file* readback;
a reply is stream text. Threading a capture callback was the alternative (critique option b) — rejected as
heavier: it duplicates the drain's accumulation into a callback and a second observer, where one optional
field reuses the drain pass already running. The field mirrors a precedent already in the result type.

**Risk front-loaded:** this output/reply-return path is the **genuine unknown** of AR4 — larger than the
transcript-input path (which AGENTS.md + AD2/R1 already prove). AR4a's first red test (AC1 reply-row
assertion) must go green **on all four harnesses** before any carve-out removal — see §5 AR4a risk note.

---

## 5. RECOMMENDED SPLIT — three sub-WPs

This is an **L** WP spanning harness adapters, the conversational-turn path, the strategy port, Settings
UI, and storage. The spec explicitly invites a split. **Recommended.** Three sub-WPs, ordered, each
independently shippable and verifiable, each ending in a CI-green PR.

### AR4a — Harness-agnostic conversational turn (the conversational mode)  **[M-L, do first]**

**Deliverable.** A **conversational mode** on the shared `provisionSession` path that serves a thread
reply on **all four harnesses**, replacing `runAssistantTurn`'s three builtin-only couplings, **and
returns the reply text** via the new `conversationalReply` channel (§4a). The transcript reaches the
model via the assembled prompt; the draft tools flow via the shared registry → (in-process | MCP) split.
Persona/tools/harness/model still read off the `users` row here (formation seam is AR4b) — but the **run
mechanism is now shared, harness-agnostic, and returns the reply.**

**Scope.**
1. Add a conversational mode to `ProvisionSessionParams` (mirror `routineId`): a discriminator (e.g.
   `conversational?: { threadId; assistantAgentId; draftRegistry }`) that switches assembly to the
   **conversational branch** (transcript context), supplies the caller-built draft tool surface to
   `buildToolRegistry` (the §3b seam), and sets the `isConversational` flag the drain reads. Stub `taskId`
   satisfies the FK (the routine precedent). **NIT:** the result's stub `taskId` is a meaningless FK in
   conversational mode — `runAssistantTurn` **ignores it** (mirror the routine `@lore`); the only result
   field the caller reads is `conversationalReply` (+ sessionId/outcome for notice mapping).
2. **Reply-return channel (§4a — the load-bearing addition):** add optional `conversationalReply?: string`
   to `ProvisionSessionResult`; add the guarded `completion` branch to the drain loop
   (`session-provisioning.ts:1054-1108`) after `returnGate.observe()`; thread the accumulated text onto the
   normal-completion return (`:1283`) only. Task/routine results stay byte-for-byte unchanged.
3. Conversational assembly branch (alongside task/routine in session-provisioning.ts:751): build the
   prompt from the thread transcript (`loadRawTranscript` + `mapTranscriptToMessages`, lifted from
   assistant-turn.ts) so **every harness** receives the transcript in AGENTS.md/the assembled prompt.
   Builtin may additionally receive `config.messages` for a cleaner chat shape, but the contract is the
   prompt channel.
4. Rewrite `runAssistantTurn` to **delegate to the shared path**: resolve harness/model/persona off the
   row, resolve the draft team/bet binding, build the draft surface via `buildAssistantDraftRegistry`
   (provisional source — the §3b seam AR4b reroutes), call `provisionSession` in conversational mode, map
   `result.conversationalReply` → persisted reply row, or its absence → notice. Delete the
   `setSessionToolRegistry` call, the `sandboxPath:""` `SessionConfig`, and the parallel adapter
   selection/drain (Steps 3-6).
5. Enumerate which provisioning phases the conversational mode **skips** (concept §8 flag): no
   cost-onto-bet accumulation, return-gate is compliant-by-construction (existing AL6 @lore), no task
   transition. Document each skip with a `@lore AR4a`.
6. Preserve never-silent: map `MissingCredentialError` / `NoEligibleHarnessError` / provider timeout (and
   a crashed/empty-reply turn) to the existing notice classes; no secret in any notice.

**Tests (red first).**
- **First red test (the CRITICAL gate):** conversational turn over `SUPPORTED_HARNESS_LANES` (4 lanes,
  `runThroughHarness`-style, real binaries, hard-fail on absence) → **assert the persisted assistant reply
  row equals the model's real completion text** on each harness. This is the assertion that proves the
  `conversationalReply` channel works end-to-end on a real CLI binary, not just builtin.
- CLI-only (no OpenRouter key) reply works (codex/opencode lanes).
- Never-silent failure-class tests (each notice class, no secret).
- **Remove the assistant files from `BUILTIN_ONLY_INTEGRATION` ONLY after the four-lane reply-row
  assertion above is green.** Removing it earlier relocates the AT1 symmetry failure into a failing-but-
  carve-out-free state rather than fixing it — the carve-out's `@lore AR4` precondition (real sandbox +
  MCP bridge) is necessary but **not sufficient**; the reply-return precondition must also hold.

**Why first.** It is the load-bearing piece: it makes the four-harness turn real **and returns the reply**,
which is the precondition for removing the carve-out (AC4/AC5) and the substrate AR4b/AR4c configure.
Reuses AR2's `provisionSession` seam + lane helpers + the AD2/R1 `onBeforeTeardown` capture (for the
file-based AD2/R1 tests, untouched).

**Risk to retire early (two halves, the OUTPUT half is the real unknown):**
- **OUTPUT (primary):** the `conversationalReply` channel actually carrying a real CLI model's completion
  text back through the shared drain. The shared path was built to return cost/verdict, not text; §4a
  designs the channel but it must be **proven live on all four harnesses** (the first red test). This is
  the genuine unknown — front-loaded here, gated before carve-out removal.
- **INPUT (secondary, lower-risk):** transcript-via-prompt reaching a CLI model and the draft tools firing
  over MCP. Lower-risk: `cli-harness-adapter.ts:358-360` shows AGENTS.md carries full context and the CLI
  binaries already run real turns through it (AD2/R1 prove it). Still proven in this sub-WP.

### AR4b — Strategy formation seam  **[M, second]**

**Deliverable.** The assistant's **persona + tool surface** are decided by the **active strategy** at
turn time, not read hardcoded. Switching the active strategy changes the assistant's form (AC3).

**Scope.**
1. Define the formation consultation (concept §4): at turn time the conversational turn asks
   `getActiveStrategy()` for the assistant's **persona + draft tool surface**. Decide the port shape —
   reuse `scaffoldAgents({trigger:"user_assistant", …})` to return the persona, plus a thin addition for
   the **tool surface** (today `buildAssistantDraftRegistry` is the inline source). The boring default:
   extend the formation answer to carry the draft tool set (the Minimal strategy returns the current
   2-tool surface; a different strategy can return a different one). Keep it synchronous-within-flow like
   the other port methods unless there is a reason to make it an event.
2. **Reroute the §3b seam:** change the **single call site** in `runAssistantTurn` where the draft tool
   surface is computed — from `buildAssistantDraftRegistry(...)` (AR4a's provisional source) to the
   formation answer. The conversational-mode discriminator and `provisionSession`'s forwarding are
   untouched (the seam was designed so AR4a bakes nothing AR4b must unpick).
3. Remove the **hardcoded persona** from the turn: `runAssistantTurn` no longer reads
   `BUILTIN_SYSTEM_PROMPT` directly; it comes from the formation answer. The hardcoded
   `harnessType:"builtin"` at `assistant-turn.ts:270-288` (lazy-create) and `scaffold-agents.ts:99-101`
   stays as the **Kernel default** (boundary-locked) — but the turn must not *re-derive* form from a
   constant.
4. `minimalStrategy` (strategy-minimal) provides the persona + draft-tool formation answer for the default
   path, so production behavior is unchanged when the Minimal strategy is active.

**Tests (red first).** Run the conversational turn under two strategies; assert persona + tool surface
differ (AC3). A guard that the turn calls `getActiveStrategy()` at turn time (today it never does).

**Why second.** Depends on AR4a's shared-path turn existing (the formation answer feeds the shared
registry build through the §3b seam). Smaller, self-contained.

### AR4c — Settings config + assistant-as-normal-agent wiring  **[M, third]**

**Deliverable.** The user configures the assistant's harness+model in Settings, validated against the
triple; the change drives the next reply (AC2). The assistant is no longer excluded from agent config.

**Scope.**
1. **UI** (design §): extend `SettingsAssistant` with the extracted Harness + Model selects above the
   persona textarea (the `Configured` story is the design artifact). Widen dirty tracking to
   harness/model/persona. Keep the `SettingsAgents` `role!=="assistant"` filter (design §2).
2. **Export the validator (WARN-1 fix):** `validateAgentConfig` (`routes/agents.ts:109`) is **file-local
   today** — export it (or extract it to a shared module imported by both `agents.ts` and the assistant
   route) so the assistant save reuses the *same* triple validator, not a copy. This is a real, previously
   invisible step.
3. **Storage/route** (Option A): extend `PATCH /api/users/:userId/assistant` to accept
   `harnessType`/`modelId`/`modelProvider`, run the now-exported `validateAgentConfig` → 422 on
   incompatible, persist on valid. GET already returns the triple.
4. The turn reads harness/model off the row (already the shape after AR4a/b) → a Settings change changes
   the next reply.

**Tests (red first).** Service `*.integration.test.ts`: PATCH valid triple → 200 + row updated; PATCH
incompatible triple → 422 + no write. Component test (`*.test.tsx`) for the extended `SettingsAssistant`
populated/dirty/save states. A turn test asserting the configured harness is the provisioned one (AC2).

**Why third.** Depends on AR4a (the turn reads harness/model and runs them) and is the user-facing skin
on top. Smallest blast radius.

### Ordering + reuse summary

```
AR4a (conversational mode + REPLY-RETURN channel, 4-harness real, remove carve-out AFTER reply-row green)
   │     ← reuses AR2 provisionSession + lanes + AD2/R1 onBeforeTeardown
   │     ← adds conversationalReply? + drain completion-branch (§4a)
   └─> AR4b (strategy formation seam)             ← reuses AR4a shared turn; reroutes the §3b draft-tool seam
          └─> AR4c (Settings config + export validateAgentConfig + triple validation)  ← reuses AR4a row-read
```

AD2/R1 (already shipped) are **untouched** by all three and verified green at each step (AC7). If the WP
is **not** split, the same ordering applies as internal phases, but the split is strongly recommended:
each sub-WP is independently CI-green-able and the risky piece (AR4a reply-return on a real CLI) is
isolated and proven before the rest is built.

---

## 6. Trade-offs and open questions

- **Reply-return: field vs callback** (decided, §4a): one optional `conversationalReply?: string` on the
  result reusing the drain pass already running, over a threaded capture callback. The field mirrors the
  `returnVerdict?` precedent and adds no second observer. Cost: one optional field + one guarded drain
  branch, both inert for task/routine.
- **Conversational mode vs adapter seam** (decided, concept §5): mode on the shared path. The cost is one
  more assembly branch in `provisionSession` (already has two: task, routine) + the reply-return channel;
  the benefit is deleting a whole parallel builtin-only path and getting four-harness tool delivery + MCP
  bridge for free. Net large reduction in coupling surface.
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
  in one place; B reuses the validated route verbatim but splits persona vs harness/model writes. Either
  way the **same exported `validateAgentConfig`** runs (WARN-1).
- **Kernel default `harnessType:"builtin"`** stays (boundary-locked) at both creation sites. The
  assistant is treated identically to team agents: builtin default, user-overridable via Settings. This
  is intentional and correct per concept §4 — not a leftover to clean.
- **Risk concentration:** AR4a carries essentially all the genuine unknown (real CLI conversational turn
  **and the reply-return channel**, §4a). AR4b/AR4c are mostly wiring over solved patterns. The ordering
  puts the risk first, which is correct.
