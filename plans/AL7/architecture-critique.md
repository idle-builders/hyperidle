# AL7 Architecture Critique — ROUND 5: Trust-first redo (ETHOS §4)

Reviewer: cold re-evaluation of the **trust-first redo** (commit `fc915a59`) against `plans/AL7/concept.md` + `architecture.md` + `docs/process-layer/staged-operation.md`, governed by `ETHOS.md` §4 "Trust Agents". Load-bearing claims re-verified against the live adapters (`packages/server/src/harness/`, `tool-registry.ts`, `schema.ts`, `task-dispatcher.ts`, `policy-engine.ts`) and the **current (June 2026)** Claude Agent SDK / Codex / opencode permission docs via web fetch — not the plan's word, not training data.

> **ALL PRIOR SECTIONS BELOW THIS ONE ARE SUPERSEDED.** Rounds 1–4 (byte-faithful-replay, native-allow/deny-floor, broker-floor-as-fortress) critiqued models the founder cut off for *spiralling into paranoia*. Round 4's CRITICAL-1 ("Codex cannot express the tailored floor; the safety guarantee is infeasible") is **resolved by deletion, not by fix**: the trust-first model has no safety floor for Codex to fail to express. Read this round only.

---

## Headline

**The redo sheds the paranoia honestly without going hollow.** The deleted constructs (no-creds-in-sandbox, broker-as-fortress, native-tool-bypass threat model, exact-hash-match-to-permit, AN credential dependency) are gone from concept + arch + doc — not just renamed, *deleted with their rationale*. What remains still delivers a real checkpoint: an irreversible call genuinely reaches a human before it happens, enforced at the one place every brokered call passes through (`registry.invoke`), and the session-1-ends / approve / session-2-re-provision loop is wired end-to-end with explicit triggers and live-proof lanes. The simplification did **not** leave the checkpoint hand-waved — it is the best-wired version of AL7 in five rounds.

Round 4's crux infeasibility is genuinely dissolved: the model no longer claims Codex's native gate *enforces* anything. The route-to-review step rides Claude's externally-answerable `canUseTool` where it exists, and hangs at HyperIdle's own `registry.invoke` participation point where it doesn't (Codex `exec`, opencode headless) — framed as plumbing for a missing channel, not a security floor. **I verified all three load-bearing harness claims against the live June-2026 docs and they hold** (see Web-verification below).

The remaining findings are about checkpoint *deliverability* on the headless harnesses, one genuine cheap-to-close trust-honest gap (the review must show what was approved), and accuracy/honesty nits — not paranoia to re-smuggle.

## Web-verification (live, June 2026 — not training data)

| Plan claim | Live-doc verdict | Source |
|---|---|---|
| Claude `canUseTool` is externally answerable in headless `query()`; `PermissionResult` = allow(+`updatedInput`)/deny(+message)/ask; `allowedTools`/`disallowedTools` work | **TRUE.** `default` mode routes unmatched tools to the `canUseTool` callback at runtime; deny/allow/updatedInput all documented; `dontAsk` denies without prompting. Plan's carrier design is accurate. | code.claude.com/docs/en/agent-sdk/permissions + /user-input |
| Codex `exec` has no externally-answerable headless ask | **TRUE.** "No externally-answerable approval channel for `codex exec`"; approvals must be pre-configured, not answered at runtime. | developers.openai.com/codex/noninteractive |
| opencode headless `run` may auto-approve an ask | **UNDOCUMENTED** — the docs do not specify headless `run` ask behavior at all. Plan flags this as ⚠️ UNVERIFIED (R8) and defers to installed-binary test in Task 7b. Honest. | opencode.ai/docs/permissions |

The plan's accuracy here is the inverse of round 4's failure: where round 4 *asserted* native surfaces that didn't exist, this round *correctly states* where the native ask is absent and routes around it without claiming a guarantee.

---

## Findings (Round 5)

### WARNING-1 — "Carried at HyperIdle's participation point" is a real checkpoint on the CLI harnesses ONLY IF the brokered call actually reaches `registry.invoke` — and on Codex/opencode that is the *entire* net-new adapter, not a small assertion.

The checkpoint's deliverability on Codex/opencode rests on one premise: the agent's irreversible call is **MCP-routed through HyperIdle's bridge** → `registry.invoke` (`mcp-bridge.ts:132`). Verified true today: builtin hits `registry.invoke` directly (`mcpSupport:false`); a registered MCP tool reaches it via the bridge. **But on Codex/opencode there is no MCP wiring at all** — `CLI_TOOL_CONFIGS` has no `codex` entry, and the `opencode` entry is `--dir`-only text-mode with no `{{mcpUrl}}` (verified `adapter-pool.ts:324-353`). So for those harnesses *the checkpoint does not exist until the net-new adapter routes the call through HyperIdle's MCP server*. The plan is honest that this is net-new (Tasks 7b/7c, `net-new-adapter-pending`), and the DONE matrix correctly does NOT mark them green.

The flag is calibration, not a defect: the plan in two places (concept §"how it works"; arch D1-A) describes the headless-harness checkpoint as already-real ("HyperIdle's existing participation point already carries the workflow for headless harnesses") while the task list correctly scopes it as unbuilt. **A reader could conclude the Codex/opencode checkpoint is delivered today; it is not — it depends on the agent choosing to use the MCP-exposed tool over its own native shell/HTTP.** That last clause is *fine under ETHOS §4* (we trust the agent to use the brokered tool, exactly as we don't model a bypass) — but the plan should state plainly, once, that **on a headless CLI harness the checkpoint is delivered for MCP-routed tools and the agent is trusted to route through them** rather than implying the participation point intercepts everything. *Fix: one sentence in the per-harness matrix — "checkpoint covers the agent's MCP-routed calls; trusted not to route the irreversible op around the bridge (ETHOS §4)."* Do NOT add bypass-proofing.

### WARNING-2 — "Session 2 re-derives the call, trust it" is honest, but the *review surface must show what was approved* — and the plan under-specifies that the human reviews a concrete call, not an abstraction.

Under ETHOS §4 minor arg drift is acceptable (AC5b states the frontier correctly; name-scoped permits drifted args; no deadlock — all correct, no paranoia to add). The one trust-honest gap a *trusting* design should still close cheaply: **the human approves a specific captured `{toolId, args}`; session 2 then re-derives.** If the review canvas shows only `toolId` + a vague summary, "human approved X, agent does materially-different Y" becomes invisible — not because the agent is hostile, but because re-derivation can legitimately differ and the human had no concrete picture of what they authorized. The reviews loader (Task 10) nests `proposedCall: { toolId, argsSummary, status }` — **`argsSummary` is the load-bearing word and it is undefined.** AC10 asserts the nesting exists but not that the *approved args are legibly shown to the reviewer*.

This is the cheap close the brief asks for: the review should *show what was approved* so gross divergence is visible to the human, without rebuilding the hash-fortress. *Fix: AC10 (or a new AC) must assert the review surface renders the captured args concretely (not just the tool name), so the human's approve is grounded in the real call. The optional arg-pin (AC5b) covers exactness where a harness supports it; the review-legibility covers the rest. Neither is a guard — both are "the human sees what they signed."* This is squarely User Sovereignty (ETHOS §3), not paranoia.

### WARNING-3 — Per-harness DONE matrix is honest and terminal, with one loophole to close: the live-proof lane must FAIL (not skip) if a "green-now" harness's real binary is absent.

The matrix is the strongest part of the plan: builtin + Claude `green` (live proof now), Codex/opencode `net-new-adapter-pending` (not green, not silently skipped, not looped), cursor-agent `skipped`. AC14 + Task 11 require live proof against the **real installed harness** (real SDK / installed CLI binary), no stub. This is the honest terminal state the brief demands and it directly answers the "no infinite loop, no stub-as-proof" bar.

The loophole: the plan says builtin + Claude "must be green now," but does not state what happens if the Claude SDK / `claude` binary is **not installed in the run environment**. A live-proof lane that silently `skip`s on a missing binary is stub-as-proof by another name. *Fix: state that a `green-now` harness whose real binary is unavailable makes the lane **fail** (DONE not reached), never skip — the same honesty the `net-new-adapter-pending` state enforces for the CLI pair. Do not let "harness not installed" masquerade as green.* (MEMORY: live-proof lanes run before ship; AH5 shipped 3x mocked.)

### WARNING-4 — `commit_file` as the universal live-proof tool: is a sandbox file-write genuinely *irreversible*, and does it actually exercise "the agent's own creds"?

`commit_file` writes a real file into the session sandbox, classified `irreversible`, needing "no special credential." Two honesty checks:
1. **A sandbox file-write is trivially reversible** (delete the file). The plan classifies it `irreversible` by explicit `reversibility:"irreversible"` field — i.e. *declared*, not *intrinsic*. That's fine as a **proof vehicle** (it exercises the classify→route→capture→grant→execute→record loop deterministically without a real external side-effect), and the plan is honest that it's "just a concrete irreversible op to prove the loop." But it means the live proof does **not** exercise the "agent runs with its own credentials" path (the whole ETHOS-§4 point) — `commit_file` is a HyperIdle-registered tool with a HyperIdle handler, run in-process. *Flag, not block:* the loop is proven; the *creds-present-and-used* property is asserted in prose (AC12) but not exercised by any lane. Acceptable for AL7 (proving the checkpoint mechanics is the AC), but state explicitly that `commit_file`'s handler is HyperIdle's own and the "own-creds" property rides on it being the agent's *session* that emits the call, not on the handler authenticating anything. Otherwise AC12's "the tool runs because the agent's own session emitted it" is true but thin.

### WARNING-5 — The `tailored_grants` CAS + the abort-on-capture race deserve one explicit ordering statement.

The router (arch Type-sigs) does: capture (idempotent) → `if (captured.firstCapture) abort(sessionId)` → return `AWAITING_REVIEW`. And the consume path is a single-statement CAS `UPDATE … WHERE consumed=false RETURNING *` (AC6, good — no pre-read, concurrency-safe). The plan flags the crash window (consume-then-execute strands a `granted` call with no Outcome → liveness net AC11b catches it). Two residual ordering questions the plan should answer in one line each:
1. **Capture-then-abort is not atomic.** If `abort` fires but the harness emits a *second* irreversible call before the subprocess dies, the idempotency key `(origin_session_id, identity_hash)` dedups an *identical* call but a *different* second irreversible call writes a second Proposed Call from a session that's supposed to be ending. Is that intended (two captures, two reviews) or should the first capture short-circuit further captures in that session? Not a security issue (we trust the agent) — a bookkeeping-cleanliness question. *State the intent.*
2. **AC6 "twice concurrently" is the consume CAS; AC1 "second identical routed call writes no duplicate" is the capture idempotency.** Both are sound. Just confirm the capture idempotency index `(origin_session_id, identity_hash)` is UNIQUE (the schema reshape says INDEX, not UNIQUE — `schema.ts` reshape bullet lists it under "INDEX"). A non-unique index does not enforce no-duplicate; the dedup must be a UNIQUE constraint or a CAS-style insert. *Fix: make `(origin_session_id, identity_hash)` UNIQUE, or state the insert is conditional.*

### NIT-1 — Two harness DONE matrices (concept §"Per-harness …" + arch Phase 2) are duplicated verbatim-ish; they will drift. Keep one canonical (doc or concept) and reference it.

### NIT-2 — `operation_executed` → `proposed_call_executed` rename touches 3 enumerated subscribers (observability dispatcher, `review-composition.ts`, `ReviewComposition.tsx`). Good. Confirm the web `ReviewComposition.tsx:672-679` field rename (`stagedOperation` → `proposedCall`) re-blesses the DOM-snapshot net (per `.claude/rules/visual-regression.md`) — the plan lists the subscribers but not the snapshot re-bless. *One-line task addendum.*

### NIT-3 — Concept hard-rule #8 and the lifecycle both say "the operation-finish event re-engages the agent" for work-continues, but Task 9/§verdict-path wire `proposed_call_granted` as the re-engage trigger. The "operation-finish event" (post-Outcome continue) is a *distinct* second re-engagement and isn't in the task list as its own event. Either the agent continues *within* session 2 after the Outcome (no second event — most likely, since session 2 is one run) or a third event is needed. *Clarify: is "continues working" the same session-2 run proceeding after the tool returns (no new event), or a separate re-dispatch?* AC11 ("session 2's stream produces ≥1 further agent action") implies same-run — if so, drop "the operation-finish event re-engages" from rule #8 as a phantom event.

---

## Dimension scores

| Dimension | Score | Note |
|---|---|---|
| Concept fidelity (ETHOS §4 embodied) | 9.5 | Paranoia genuinely shed; trust frame is load-bearing, not decorative. |
| Layer integrity / reuse | 9 | One router seam, native carrier per harness, reuses verdict/dispatch/abort rails. |
| Checkpoint actually delivered | 8 | Real on builtin+Claude now; real on CLI *after* net-new MCP routing (honestly scoped). WARNING-1. |
| Trust-honest review legibility | 7 | The "show what was approved" surface is under-specified. WARNING-2. |
| Per-harness DONE honesty + terminality | 9 | Best-in-five-rounds; one missing-binary loophole. WARNING-3. |
| Native-features-not-reinvention | 9.5 | Rides `canUseTool`/`allowedTools`; participation point only fills the no-headless-ask gap. No reinvention. |
| Data model / migration | 8.5 | Clean reshape; unique-index nit (WARNING-5.2). |
| Concurrency / liveness | 8.5 | CAS + liveness-net solid; two ordering statements owed (WARNING-5). |
| Live-proof rigor | 8 | Real-binary integration tests required; `commit_file` proves mechanics not creds (WARNING-4). |

## Score: **8.6 / 10**

## Finding counts
- CRITICAL: **0**
- WARNING: **5** (WARNING-1 CLI checkpoint-deliverability framing; WARNING-2 review must show approved args; WARNING-3 missing-binary must fail not skip; WARNING-4 `commit_file` proves mechanics not creds; WARNING-5 capture-idempotency UNIQUE + abort ordering)
- NIT: **3**

## Verdicts

**ETHOS §4 (trust, not paranoia) while still delivering a real checkpoint:** YES — embodied honestly. The deleted fortress constructs are gone with their rationale, not renamed; the trust frame is load-bearing (creds-present-is-correct, re-derivation-is-fine, gate-fades-on-AD4, no bypass model). And the simplification did **not** hollow out the checkpoint: an irreversible call genuinely reaches a human at `registry.invoke` before execution, with explicit capture / abort / grant / consume / re-engage / outcome wiring. The one trust-honest gap (WARNING-2: the human must *see the concrete approved call*) is User Sovereignty, not paranoia, and is cheap to close without the rejected hash-fortress.

**Per-harness DONE honesty:** HONEST and TERMINAL. builtin + Claude green-now (live proof against the real SDK/loop); Codex + opencode `net-new-adapter-pending` (named adapter tasks 7b/7c, not green, not skipped, not looped); cursor-agent skipped. The Codex/opencode "route-to-review hangs at HyperIdle's participation point" is **deliverable once the net-new MCP routing lands** — it is not a deeper blocker (the bridge → `registry.invoke` path is proven on Claude today), but it does NOT exist until Tasks 7b/7c wire `{{mcpUrl}}`, and the plan is correctly honest about that. Close WARNING-3 so a missing green-now binary fails rather than masquerades as green.

**Build-ready judgment:** **BUILD-READY for the green-now arm (builtin + Claude) as-is; address WARNING-2 (review shows approved args) and WARNING-5 (UNIQUE capture index) before code, and WARNING-3/1/4 as honesty statements in the plan — none require redesign.** Codex/opencode proceed as the explicitly-scoped net-new adapter tasks they already are.

---
---

# AL7 Architecture Critique — Tailored-Native-Allow/Deny model (reshape) [SUPERSEDED — Round 4]

Reviewer: cold re-evaluation against the **reshaped** plan (commit-current `concept.md` + `architecture.md` + `docs/process-layer/staged-operation.md`). The prior critique (rounds 1–3 below the line) scored the **byte-faithful-replay** model and is **SUPERSEDED** — that model is discarded by this reshape. This critique is fresh against the new model: *HyperIdle executes nothing; it rides each harness's native permission gate; session 2 is re-provisioned with the native allow/deny tailored to "the approved op + reversible, deny all other irreversible"; byte-fidelity demoted to an optional arg-pin.* Every load-bearing claim re-verified against the adapters in `packages/server/src/harness/` and the **current** (June 2026) Codex/opencode permission docs — not the plan's word, not training data.

**Headline:** The reshape's *theory* is cleaner than the byte-faithful model and dissolves the deadlock. But the reshape moves the entire safety guarantee onto a new load-bearing claim — *"every supported harness's native allow/deny can express the tailored floor at init"* — and **that claim is false on Codex (certain, knowable now) and mis-wired/unverified on opencode**, while the plan presents both as buildable spawn-arg work with only a conditional "build-finding if not." Two of the four harnesses the plan names as DONE gates have **no adapter wiring for the mechanism at all** (no Codex adapter is registered; the opencode adapter is fire-and-forget text-mode with no permission surface and no MCP URL). The newly-codified rules ("design for every supported harness", "build on native features", "web-research the latest harness state", "integration-test the real CLI") are exactly the rules this plan violates — it asserts native surfaces that, per the live docs, do not exist on Codex and are wired differently than claimed on opencode.

This is the **same failure shape that sank AL7 twice**, relocated: the demo-able half (builtin + Claude) is solid and build-ready; the load-bearing all-harness floor is hand-waved to "spawn flags" / "build finding."

---

## #1 — THE CRUX: per-harness feasibility of the tailored allow/deny floor at init

The floor is *"allow the approved op + reversible work, deny **every other irreversible** op."* Verdict per harness, against code + current docs:

| Harness | Can native grammar express the floor at init? | Evidence |
|---|---|---|
| **builtin** | **YES.** HyperIdle owns the loop; `registry.invoke` is the gate; per-op + arg-level scope trivially expressible. | `builtin-harness-adapter.ts:702-770`, `tool-registry.ts` invoke seam. |
| **Claude (Agent SDK)** | **YES (with net-new wiring).** `permissionMode` + `allowedTools`/`disallowedTools` + `canUseTool` exist; per-tool allow/deny + arg-override (`updatedInput`) doc-verified (round 3). | `claude-agent-sdk-adapter.ts:154-175`; SDK `PermissionResult`. |
| **opencode** | **PARTIAL — feasible mechanism EXISTS but the plan wires it wrong and it is unverified.** opencode permissions are per-tool **wildcard allow/ask/deny incl. MCP tools, last-match-wins**, set via **`opencode.json`/agent frontmatter/`OPENCODE_PERMISSION` env JSON** — **NOT spawn-arg flags** as the plan claims. Headless `opencode run --format json` emits structured events. | opencode.ai/docs/permissions, /docs/cli. The **registered adapter** is `["--dir","{{workspace}}"]`, `eventFormat:"text"`, **no permission wiring, no `{{mcpUrl}}`** (`adapter-pool.ts:344-352`). |
| **Codex** | **NO. The floor is NOT expressible.** Codex has only **global** sandbox modes (`read-only`/`workspace-write`/`danger-full-access`) + **global** approval policies (`on-request`/`never`/`untrusted`/category-`granular`). **No per-tool/per-command allowlist.** Non-interactive `codex exec` has **no structured approval-request event an external program can read+reply to.** "Allow this one op, deny other irreversible" cannot be said. | developers.openai.com/codex/agent-approvals-security (fetched, June 2026): *"You cannot scope permissions to a single command while denying everything else at startup."* **No Codex adapter is registered at all** (`adapter-pool.ts:324-353` registers only aider/goose/opencode). |

**Crux verdict: the all-harness floor is INFEASIBLE as designed on Codex and unproven on opencode.** The plan's safety floor — its *entire* reason to exist post-reshape — holds on 2 of 4 harnesses. The plan demands (Hard Rule 9, AC14) that this be surfaced "as a build finding, not silently deferred" *if* an adapter can't express it. **It is not a contingent build finding — it is a knowable, present-tense fact for Codex**, and the plan must state it now, not discover it at Task 11. Treating a certain infeasibility as a maybe is the dishonesty the new ruleset was written to stop.

---

## Findings

### CRITICAL-1 — Codex cannot express the tailored floor; the plan asserts a native surface that does not exist. *(brief #1; new rule: build on native features / web-research current state)*

The plan (arch §Per-harness, Type-signatures (c), R6; concept §4, hard rule table; doc §per-harness table) states Codex enforces the floor via *"`--approval-policy` + `--sandbox` + allow flags injected as spawn template args"* and captures *"from the native approval signal in the CLI's stdout event stream."* **Both are false against the current Codex CLI (verified June 2026):**

1. **No per-op allow.** Codex `--sandbox` is a coarse FS/network boundary (`read-only`/`workspace-write`/`danger-full-access`); `--ask-for-approval` is global (`on-request`/`never`/`untrusted`/category-`granular`). There is no `allow flag` that scopes to one tool while denying other irreversible ops. The official approvals page states outright you cannot scope to a single command at startup. So session-2's floor ("allow `commit_file`, deny every other irreversible") **is unsayable** — the best Codex can do is `workspace-write` (allows ALL workspace writes, not just the approved one) or `danger-full-access` (allows everything). Either way the floor "no *other* irreversible op" is **violated on Codex**, not merely un-tightened.
2. **No deny+record capture event.** Non-interactive `codex exec` has no structured approval-request event an external process reads. The plan's "record from the native approval signal in stdout" has no event to record. (The bidirectional app-server JSON-RPC — which the plan explicitly excludes as "not required" — is the *only* surface that could, and it's a held-ask transport the model rejects.)
3. **There is no Codex adapter.** `CLI_TOOL_CONFIGS` (`adapter-pool.ts:324-353`) registers `aider`, `goose`, `opencode` — **not codex**. Every plan reference to "the Codex adapter / Codex spawn args / `cli-harness-adapter.ts` Codex surface" points at a registration that does not exist. Building it is unscoped net-new work the task list does not contain (Task 7 says "extend the CLI args template" — there is no Codex template to extend).

**Fix — pick one and state it in the plan before any code:**
- **(a) Scope AL7 honestly to the harnesses that can express the floor (builtin + Claude), and state Codex as a KNOWN INFEASIBILITY now** (not a contingent build finding), with the reason (no per-op native grammar). If founder direction is genuinely "all four or it's not done," then AL7 *as scoped* cannot be done and that must be the plan's stated conclusion — escalate, don't ship a floor that silently degrades to `workspace-write` on Codex.
- **(b) If Codex must be covered**, the only native-honest path is: run Codex under `read-only` sandbox (deny ALL writes) so it cannot execute the approved op either, then route the approved op through the **MCP server HyperIdle controls** and gate at `registry.invoke` (the in-process seam) — i.e. the floor is enforced at the MCP boundary, not Codex's native gate. But this means Codex's *native* gate is NOT the floor for Codex (it's the MCP seam), contradicting the plan's "the native gate is the safety floor, uniform across harnesses" claim (D1-A). State the non-uniformity honestly.
- Either way: **delete the false "Codex spawn-arg allow flag" claim** from concept §4, arch Type-signatures (c)/R6, and the doc per-harness table.

### CRITICAL-2 — opencode floor mechanism is mis-located (config/env, not spawn args) and entirely un-wired; the live-proof path (MCP) is not connected. *(brief #1, #2, #4; new rule: integration-test the real CLI)*

opencode *can* express the floor — but not the way the plan says, and none of it is wired:

1. **Mechanism is config/env, not spawn flags.** Per current docs, opencode permissions are per-tool wildcard allow/ask/deny (incl. MCP tools) set via `opencode.json` / agent frontmatter / `OPENCODE_PERMISSION` (inline JSON env). The plan's *"`permission` allow/ask/deny config injected as spawn template args"* (arg-template) is the wrong surface — opencode's `run` permission flags are `--dangerously-skip-permissions` (a blunt bypass) and agent-creation `--permissions`; the fine-grained allowlist is config/env, not positional args. The `cli-harness-adapter.ts` only resolves a fixed `args`/`envMap` template at spawn — `OPENCODE_PERMISSION` would need to be added to `envMap` with a per-session JSON value, which is **not** how the static `CLI_TOOL_CONFIGS.opencode` is structured.
2. **The registered adapter wires none of it.** `adapter-pool.ts:344-352`: `args: ["--dir","{{workspace}}"]`, `eventFormat: "text"`, `envMap` only forwards `ANTHROPIC_API_KEY`. No permission config, no `--format json` (so no structured event to record a deny from — `eventFormat:"text"` wraps every stdout line as an opaque completion), and **no `{{mcpUrl}}`** template var.
3. **The MCP live-proof path is not connected for opencode.** The plan's universal record point + `commit_file` live-proof depends on the CLI agent calling HyperIdle's MCP server. The opencode adapter config passes no MCP URL, so `commit_file` cannot route through `registry.invoke` on opencode as the plan claims ("on every harness the recorded call provably hits the seam"). The `{{mcpUrl}}` template var exists in `cli-harness-adapter.ts:35,190` but the opencode registration doesn't use it.

**Fix:** scope the real opencode work: add `OPENCODE_PERMISSION` (per-session JSON) to the adapter, switch to `opencode run --format json`, parse the structured events for deny+record, and wire `{{mcpUrl}}` into the args/config so `commit_file` routes through MCP. State this as net-new adapter work in the task list, and **integration-test against the installed `opencode` binary** (new rule), not a stub. Until that exists, opencode is unproven — do not list it as a satisfied DONE gate.

### CRITICAL-3 — DONE gate (AC14, Hard Rule 6/9) requires all-four green live-proof, but two harnesses cannot/are-not-wired to pass; the plan has no honest terminal state. *(brief #4; new testing rule)*

Hard Rule 6/9 + AC14: "Done only when a real irreversible call executes LIVE on **all four** supported harnesses … no fixture/stub." Given CRITICAL-1 (Codex floor infeasible) and CRITICAL-2 (opencode un-wired + unverified), the AC14 lane **cannot go green on Codex** and is **not runnable on opencode today**. The plan's escape hatch ("adapter that cannot express the floor → build finding, reported not deferred") is correct *process* but the plan never resolves what DONE *means* when a required harness genuinely can't pass. Two outcomes are honest; the plan commits to neither:
- AL7 ships on builtin + Claude, Codex is documented infeasible (native grammar), opencode is added-and-proven — and Hard Rule 9 is amended to "all harnesses that can express the floor," OR
- AL7 is blocked pending a Codex-capable mechanism (CRITICAL-1 fix b) and says so.

**Fix:** state the terminal DONE condition explicitly given the per-harness feasibility matrix above. A build pipeline pointed at this plan will otherwise loop forever trying to green a Codex lane that cannot be green (violating ABSOLUTE RULE 2 / MEMORY: live-proof-before-ship). This is the single most important honesty fix.

### WARNING-4 — "no net-new async transport needed" is true only because the plan substitutes a coarser guarantee on the CLI harnesses. *(brief #2, #3; concept rejection #3, hard rule 11)*

The reshape's clean claim — "every harness has init-time allow/deny, so no Codex app-server / opencode SSE needed" — is the load-bearing simplification, and it **only holds for builtin + Claude + (correctly-wired) opencode**. On Codex it's true *only* because the init-time config can't express the floor at all (you avoid the async transport by giving up the per-op guarantee). The plan frames "no async transport" as a uniform win; it is actually "the floor is enforceable init-time on the harnesses whose init-time grammar is per-op, and degraded elsewhere." State the asymmetry. (This is the same conflation as CRITICAL-1 but at the architecture-claim level — D1 "uniform native gate as safety floor" is not uniform.)

### WARNING-5 — capture (session 1) on the CLI harnesses has no real deny-with-record hook; the adapter is fire-and-forget stdout-text. *(brief #2)*

Concept Open-Detail-2 / arch Q3 claim per-harness synchronous deny+record: Codex "record from the native approval signal in stdout"; opencode "record from the permission decision event." **Verified the CLI adapter cannot do this as registered:** `CliHarnessAdapter` spawns, reads stdout line-buffered, wraps each line per `eventFormat`, and exits (`cli-harness-adapter.ts:183-289, 472-496`). With `eventFormat:"text"` (opencode's registration) there are **no structured events** — every line is an opaque `completion`. There is no stdin reply channel (the CLI is one-shot). So:
- **builtin** capture at `registry.invoke` — real (verified, carries over from prior rounds).
- **Claude** `canUseTool`/`PreToolUse` deny+log — real (SDK, verified).
- **Codex** — no event to record (CRITICAL-1.2).
- **opencode** — needs `--format json` + parser first (CRITICAL-2.1); not present today.

**Fix:** fold into CRITICAL-1/2 fixes — capture on the CLI harnesses is net-new structured-event parsing, not "record from the existing signal."

### WARNING-6 — the optimization-frontier residual is stated honestly, but its *floor* premise ("no OTHER irreversible op") is exactly what fails on Codex. *(brief #3)*

The residual (concept §"The residual", doc §residual, arch §security) is correctly bounded for builtin/Claude/opencode: name-scoped allow may permit the same tool with drifted args; the floor (no *other* irreversible op) still holds; founder accepted it. **This is sound where the floor holds.** But on Codex the residual statement's premise collapses: under `workspace-write`, *other* irreversible workspace writes ARE permitted, so it's not "same tool, drifted args" — it's "any write op." The residual section must not be read as covering Codex; the plan should scope the residual claim to harnesses with per-op grammar. (No change needed for the 3 harnesses where it holds; just don't let it paper over CRITICAL-1.)

### WARNING-7 — builtin `mcpSupport: false` vs. the plan's "commit_file is MCP-routed on every harness incl. builtin." *(brief #2, #5)*

Arch Q5/R5 and the per-harness table say the live-proof `commit_file` is MCP-exposed so "a call any of the four harnesses emits through its own MCP client provably hits the seam." But the builtin adapter reports `mcpSupport: false` (`builtin-harness-adapter.ts:336`) — builtin doesn't route through an MCP client; it calls `session.registry.invoke` directly (`:741`). That's *fine* (builtin hits the same `registry.invoke` seam natively), but the plan's framing that the proof is uniformly "the agent's own MCP client → bridge → registry.invoke" is inaccurate for builtin. Inversely, for the CLI harnesses the MCP route is the *only* path to the seam and (per CRITICAL-2.3) isn't wired. State per-harness honestly: builtin = direct registry; Claude/Codex/opencode = MCP-routed (and the MCP route must actually be configured).

### WARNING-8 — the carried-forward CRITICAL-2/CRITICAL-3 (abort-on-capture, explicit re-dispatch trigger) are still correct under the reshape — confirm they survived intact. *(brief #6)*

Re-verified both still hold and are still load-bearing under the new model:
- **Abort-on-capture:** `sessionRunRegistry.abort → stopSession`, builtin `aborted` checked at `:717` before each invoke — real (verified `builtin-harness-adapter.ts:708-719`). Still required so a denied session-1 call can't loop/retry-with-drift. **Intact.** (For Codex/opencode, abort = subprocess kill via `stopSession` — real, `cli-harness-adapter.ts:361-394` — but moot until capture works there.)
- **Explicit re-dispatch trigger:** `handleSessionEnded` re-dispatches **only on owner change** (`task-dispatcher.ts:500-514`, `task.ownerAgentId !== event.agentId`) — provably false for AL7's same-agent resume (verified). The plan's separate `proposed_call_granted` event + `handleProposedCallGranted` subscription guarded by `hasActiveSession` is still necessary and correct. **Intact.** No reshape regression here.

### WARNING-9 — bookkeeping half (capture record, tailored_policies CAS, outcome, scope, canonicalization, fail-closed classifier) carries over as build-ready — but `tailored_policies` consume-once now gates a *name-scoped* allow it can't fully enforce. *(brief #5)*

The grant→`tailored_policies` reshape is coherent: `(taskScope, agentScope, approvedToolId)` scope, single-statement CAS consume-once (`UPDATE … WHERE consumed=false RETURNING *`), handler-throw → failed Outcome, fail-closed `classifyReversibility` (no signal ⇒ irreversible) — all carry forward from round 3 as resolved, and the table reshape (`one_shot_grants` → `tailored_policies`, drop+recreate migration) is consistent across schema/compose/wrapper. **Sound.** One subtle gap: on builtin the CAS-consume at `registry.invoke` *is* the gate (per-op + arg-level), so consume-once is fully meaningful. On the CLI harnesses where the native gate is name-scoped (or absent, Codex), the `registry.invoke` CAS only fires for MCP-routed tools — a non-MCP irreversible op the harness runs natively never reaches the consume and isn't bounded by it. The plan leans on "the sandbox boundary covers side-door egress" (arch §security) — true, but then the *sandbox*, not the tailored policy, is the floor for non-MCP ops on CLI harnesses. State which control is the floor for which call-path per harness.

### NIT-10 — stale "no Codex adapter, opencode text-mode" reality not reflected in Phase-1 reconciliation table. *(arch Phase 1)*

The Phase-1 spec⇆reality table claims "Codex/opencode flags inject via the CLI `args` template (`cli-harness-adapter.ts:58,194`)" as if a Codex registration and an opencode permission surface exist. Reconciliation is supposed to catch exactly this. Update the table to reflect: no Codex adapter registered; opencode adapter is `--dir`-only text-mode; the args template can carry flags but no permission flags are wired and the fine-grained surfaces are config/env not args.

### NIT-11 — `{{mcpUrl}}` template var exists but opencode (the one registered CLI harness) doesn't consume it; live-proof MCP routing is unverified for all CLI harnesses. *(arch Q5)*

Minor relative to CRITICAL-2 but worth a discrete test: assert the CLI adapter actually receives a resolved MCP URL and the spawned agent registers HyperIdle's MCP server, before claiming `commit_file` routes through `registry.invoke` on any CLI harness.

---

## What the reshape gets right (verified)

- **The deadlock is genuinely dissolved.** Removing exact-hash-match-to-permit removes the byte-faithful deadlock that defined the prior model. Arg drift no longer blocks approved work. The reframe's core insight is correct and is a real improvement over rounds 1–3.
- **builtin + Claude floor is real and build-ready.** `registry.invoke` per-op + arg-level gate (builtin) and `permissionMode`+allow/deny+`canUseTool` arg-override (Claude, doc-verified) genuinely express the floor incl. the arg-pin. These two harnesses are buildable as specified.
- **Bookkeeping/security half is tight** (WARNING-9): capture immutability, server-derived `reviewMessageId`/`subjectThreadId`, single-statement CAS consume-once, handler-throw→failed Outcome, fail-closed classifier, `(taskScope,agentScope)` scope. Carries forward from the round-3 resolution.
- **Abort-on-capture + explicit re-dispatch (prior CRITICAL-2/3) survive intact** (WARNING-8) — no reshape regression.
- **Keep/discard delta still correct.** Discarding the kernel executor, `KERNEL_DISPATCHABLE_CAPABILITIES`, `stage-operation.ts`, byte-faithful replay grant, the `one_shot_grants` hash-keyed table — all coherent under the reshape; nothing kept assumes the old executor or the hash-match gate. The `proposed_call`/`tailored_policies`/`operation_outcomes` shape is right.
- **The residual is stated openly** (WARNING-6) — for the 3 harnesses where the floor holds, the optimization-frontier honesty is exactly right and not hidden.

---

## Score: 4 / 10 — REVISION NEEDED (do not build as-is)

3 CRITICAL, 6 WARNING, 2 NIT.

The reshape *improves the theory* (no deadlock) and the builtin/Claude half would score ~8 alone. But the plan's new load-bearing claim — the all-harness native floor — is **false on Codex and un-wired/unverified on opencode**, and the plan presents these as buildable spawn-arg work gated only by a contingent "build finding." Per the newly-codified rules (design for every harness / build on native features / web-research current state / integration-test the real CLI), this plan asserts native surfaces that the current (June 2026) docs and the actual adapter code contradict. That is below the no-CRITICAL build-ready bar and repeats the AL7 failure shape: solid demo half, hand-waved load-bearing half.

This is **not** a "tighten the wording" revision — the per-harness feasibility matrix forces a real scope decision (CRITICAL-3) the plan has not made.

---

## Per-harness feasibility verdict on the tailored-allow/deny floor (#1 — the crux)

- **builtin — FEASIBLE.** HyperIdle owns the loop; per-op + arg-level at `registry.invoke`.
- **Claude (Agent SDK) — FEASIBLE (net-new wiring, small).** `allowedTools`/`disallowedTools` + `canUseTool` `updatedInput` — doc-verified.
- **opencode — FEASIBLE IN PRINCIPLE, MIS-WIRED + UNVERIFIED IN PLAN.** Per-tool wildcard allow/ask/deny (incl. MCP) via `opencode.json`/`OPENCODE_PERMISSION` env JSON + `run --format json` — **not** the plan's "spawn template args"; the registered adapter wires none of it and passes no MCP URL.
- **Codex — INFEASIBLE.** Only global sandbox modes + global approval policies; no per-op/per-command allowlist; no external-readable approval event in non-interactive mode; **no Codex adapter even registered.** The floor "deny all *other* irreversible" cannot be expressed at init. Certain and knowable now — not a contingent build finding.

**Net: the floor holds on 2 of 4 harnesses, is buildable-but-unscoped on a 3rd, and is structurally impossible on the 4th. The "all four supported harnesses" DONE gate cannot be met as written.**

---

## One-line build-ready judgment

**NOT build-ready.** The reshape fixes the deadlock but bets the safety floor on an all-harness native-allow/deny claim that is false on Codex (no per-op grammar, no adapter) and mis-wired/unverified on opencode; commit a fix that (a) states Codex infeasibility as a present fact, (b) scopes the real opencode `OPENCODE_PERMISSION`/`--format json`/MCP-URL wiring as net-new tested work, and (c) defines an honest DONE condition given the per-harness feasibility matrix — before any code.

---
---

# Round 4 (FINAL) — the uniform broker-floor model (commit r4)

Reviewer: final pass against the reshaped plan that moves the floor from per-harness native allow/deny to **HyperIdle's own broker chokepoint at `registry.invoke`**, with native allow/deny demoted to tightening and an honest per-harness DONE matrix. The three round-3 CRITICALs were aimed at the *native-grammar floor*; this model retires that floor wholesale. I re-verified the new load-bearing claim against the actual code and the unbuilt-dependency state — not the plan's word.

**Headline:** The model is correct and the round-3 CRITICALs are genuinely resolved. But the entire floor now rests on ONE physical assumption — *the live-op credential is never in the agent's sandbox* — and **that assumption is an UNSTATED DEPENDENCY on unbuilt Track-AN sandbox provisioning, not a property that exists in code today.** The plan asserts it as present-tense fact ("the live credential is HyperIdle-held and never in the sandbox", "credential never present") and even claims the broker attaches a HyperIdle-held credential at `registry.invoke` — but `ToolContext` has no credential field, no credential resolver, and no injection seam (`tool-registry.ts:41-56`); the only credential flow into a sandbox today is the CLI adapter forwarding `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` into the subprocess (`adapter-pool.ts:328-352`). The floor's universality is sound *for the AL7 live-proof tool* (`commit_file` needs no external credential, so nothing can bypass it) but is **not yet sound for the production exemplar** (`github_merge_pr`) — that requires AN's credential-containment, which AL7 neither builds nor declares a contract against.

This is not the round-3 failure shape (false native claim). It is a narrower, honest-able gap: the floor is real for what AL7 actually proves, but its stated *general* guarantee silently borrows an unbuilt guarantee from AN.

---

## The crux: "an irreversible live op can ONLY reach `registry.invoke` because the credential is never in the sandbox"

Verified against code, not prose:

- **No credential in `ToolContext` today.** `tool-registry.ts:41-56` — `ToolContext` carries `db, eventBus, agentId, sessionId, taskId, teamId?, sandboxPath, ingestion`. **No credential, no resolver, no secret.** The floor pseudocode (arch §broker floor, `:185`) runs `def.handler(parsed.data, ctx)` — the handler executes with this credential-free `ctx`. So the plan's repeated "the broker attaches the HyperIdle-held credential at `registry.invoke`" (one-line §, line 9, line 114, line 185 comment, security §) describes a seam that **does not exist** and is not on AL7's task list. It is AN work.
- **The only credential-into-sandbox path today LEAKS by the plan's own standard.** `adapter-pool.ts:328-352`: the registered CLI adapters (`aider`, `goose`, `opencode`) forward `ANTHROPIC_API_KEY` (aider also `OPENAI_API_KEY`) into the subprocess env. That is a live credential in the agent's sandbox. It is a *model* credential, not a live-*op* credential — but it proves the sandbox is not credential-clean by construction; "no secret is ever in a sandbox" is a *future* AN guarantee (`TRACK-AN.md` Sandbox WP: "credential-containment ... has to be enforced at the sandbox boundary, **not assumed**"; "**What exists today.** Session provisioning materializes a workspace with an allowed-env-only policy (no secrets injected)" — true only because no brokered external tool exists yet to inject).
- **Track AN is unbuilt and downstream of AL7.** `TRACK-AN.md`: outbound brokering "**Depends on** ... AL7"; the Sandbox-provisioning WP ("no secret is ever in a sandbox") is a separate, later, out-of-scope-for-now WP whose "what exists today" is explicitly *nothing assembling internal + external tools, no per-session isolation of external tools.* So the property AL7's floor rests on is **built by a WP that depends on AL7** — a forward dependency the plan does not name.
- **Therefore the floor's coverage is conditional, two regimes:**
  1. **For `commit_file` (what AL7 live-proves):** SOUND with no AN dependency. `commit_file` writes into `sandboxPath` using `ctx` — it needs **no external credential**. There is no ambient credential that lets a native bash/`curl` reproduce its *gated* effect, because its effect is just a local file write that the floor doesn't actually need to gate for safety. The live proof is real and the floor genuinely sits on the only path *for this tool*. ✅
  2. **For the production exemplar `github_merge_pr` (named, not built):** the floor is the only path **iff** the GitHub credential is not in the sandbox. Today nothing guarantees that — and the plain bypass the brief asks about is real: a Codex/opencode agent with `gh` on PATH and an ambient `GH_TOKEN` (or a mounted `~/.config/gh`, or `git push` over an ambient credential helper) performs the irreversible live op **via its own native shell, never touching `registry.invoke`.** The floor does not see it. This is exactly the "native-tool bypass" the brief flags, and it is unbounded/unflagged in the plan.

**Crux verdict: UNSTATED DEPENDENCY (leaning leak for the general claim).** The floor is sound and self-contained for AL7's actual live-proof (`commit_file`). The plan's *stated* guarantee — "irreversible live ops can only reach the floor, on every harness, because the credential is never in the sandbox" — is **not enforced by any code AL7 ships or that exists today**; it is borrowed from unbuilt AN sandbox provisioning. For any real brokered op (the `github_merge_pr` exemplar) on a CLI harness that can hold an ambient credential, the floor leaks via native tools. The plan must (a) state the AN dependency as an explicit contract + assumption flag, and (b) scope AL7's guarantee to *brokered ops routed through `registry.invoke`* and flag the native-tool / ambient-credential bypass as out-of-floor-until-AN.

This does not break AL7's buildable scope (which lives entirely on `commit_file`), but it is a CRITICAL honesty defect in the architecture's central claim, and a present-tense leak the moment a real credential exists pre-AN.

---

## Round-4 findings

### CRITICAL-R4-1 — the floor's universality is an unstated forward-dependency on AN sandbox provisioning; the plan asserts it as present fact and the credential-attach seam does not exist. *(the crux)*

Resolution required before build:
1. **State the dependency + assumption flag.** Add to the plan, as an explicit contract: *"AL7's broker floor is the **only** path to an irreversible live op IFF no live-op credential is present in the agent's sandbox. That containment is **not built by AL7** — it is the AN Sandbox-provisioning guarantee (unbuilt; AN depends on AL7). Until AN lands, AL7's floor is proven only for credential-free brokered tools (`commit_file`); for any tool requiring an external credential, a harness holding an ambient credential (env/mounted config/credential-helper) can perform the live op via native shell/HTTP and bypass `registry.invoke`."*
2. **Scope AL7's guarantee honestly:** the floor covers **brokered ops routed through `registry.invoke`**. It does **not** cover native-tool ops on a credential-bearing sandbox. Flag this as the bounded residual (alongside the arg-drift residual), not silent.
3. **Delete or correct the "broker attaches the HyperIdle-held credential at `registry.invoke`" claim** (one-line §, lines 9/70/114/185-comment/338) — there is no credential in `ToolContext` and no attach seam in AL7. Either describe it as AN-future, or drop it. As written it is a false present-tense capability claim of the same family round-3 flagged for Codex native flags.
4. **Acknowledge the present credential-into-sandbox reality:** `adapter-pool.ts` forwards `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` into CLI sandboxes today; the "no secret in sandbox" premise is aspirational. The Phase-1 reconciliation row "credential never in sandbox … Capability split + AN sandbox provisioning hold the live credential HyperIdle-side; the brokered tool is the only path" (line 70) states an unbuilt mechanism as if it reconciles against current reality — reconciliation is supposed to catch exactly this. Mark it `UNBUILT (AN)`.

### WARNING-R4-2 — `commit_file` live-proof does not exercise the credential-containment the floor's general claim depends on. *(proof-vehicle gap)*

`commit_file` is a credential-free local write. It is a fine vehicle for proving *capture → review → tailored-policy → consume-once → outcome → continue* (the mechanism) and AL7 should keep it. But it **cannot** prove "the floor is the only path to an irreversible live op," because there is no alternate path to a local file write worth gating. The plan presents the `commit_file` lanes as proving the floor's *safety* property; they prove the *mechanism*, not the *containment*. State that distinction: the containment property is deferred to AN and is the production exemplar's (`github_merge_pr`) gate, untested here. (This keeps the live-proof honest per MEMORY: live-proof-before-ship — AL7 proves what it can, and names what it cannot.)

---

## Confirm-items from the brief

**C-1 (Codex via broker floor; adapter net-new) — RESOLVED.** The round-3 CRITICAL-1 (Codex floor infeasible because native grammar can't express it) is correctly dissolved: the floor is no longer native grammar, it is `registry.invoke`, and Codex's lack of per-op grammar is now explicitly *not relied upon* (D1-B reject, R6, per-harness table). The Codex adapter is honestly stated net-new (Task 7c) with terminal state `net-new-adapter-pending` — no false "spawn-arg allow flag" claim survives (the round-3 false claim is gone). **Caveat:** "Codex is covered because the credential is never in its sandbox" inherits CRITICAL-R4-1 — for a real credentialed op, Codex with an ambient token + sandbox shell is precisely the bypass. Resolved *as a floor-mechanism claim*; conditional on the AN containment it doesn't build.

**C-2 (opencode mechanism corrected to config/`-f json`; net-new MCP routing) — RESOLVED.** Round-3 CRITICAL-2 (opencode mechanism mis-located as spawn-args; MCP unwired) is fixed: the plan now correctly states permissions are `opencode.json`/frontmatter (not spawn flags), demotes them to bonus tightening, and scopes the real net-new work as wiring `{{mcpUrl}}` + `opencode run -f json` so the brokered call reaches the floor (Task 7b), integration-tested against the installed binary. Matches `adapter-pool.ts:344-352` reality (`--dir`-only, `text`, no `{{mcpUrl}}`). Resolved.

**C-3 (honest per-harness DONE matrix; terminal states; no infinite loop) — RESOLVED.** Round-3 CRITICAL-3 (all-four-green gate unmeetable, no terminal state, pipeline loops forever) is fixed cleanly: explicit matrix with `green` (builtin, Claude) / `net-new-adapter-pending` (Codex, opencode) / `skipped` (cursor-agent) terminal states; "DONE = builtin + Claude live now; Codex/opencode terminate at pending until their named task lands; no lane loops" (Phase 2, AC14, hard rule 8). Terminates. Resolved.

**Item 2 (floor stays distinct from v1 kernel executor; "attach credential + decide allow/deny" doesn't edge back to HyperIdle-executes).** Mostly clean: no capability map, no tool re-implementation, the agent's own handler runs (`def.handler(parsed.data, ctx)`), HyperIdle gates/captures/records. The line is genuinely distinct from v1 *as far as AL7 builds it*. **But** the repeated "attaches the HyperIdle-held credential at the broker boundary" is the one phrase that edges back — credential injection at the chokepoint is an AN mechanism, and if/when built it does make HyperIdle a credential-broker in the call path (which is fine and intended) but the plan should not claim it *now* as a property of `registry.invoke`. Tie this to CRITICAL-R4-1 fix #3. With that corrected, the distinction holds.

**Item 3 (carried-forward pieces survive without regression) — CONFIRMED.** Abort-on-capture (`sessionRunRegistry.abort → stopSession`, builtin `aborted` at `:717`), explicit `proposed_call_granted` re-dispatch (not the owner-change `handleSessionEnded` path, `:500-514`), byte-fidelity-as-optional-arg-pin (no exact-hash-to-permit, no deadlock), CAS consume-once (`UPDATE … WHERE consumed=false RETURNING *`), fail-closed classifier, `(taskScope, agentScope)` policy scope, server-derived `reviewMessageId`/`subjectThreadId` — all intact, no regression vs. round-3 WARNING-8/9. The liveness net (AC11b / `handleUnconsumedPolicyOnSessionEnd` as a separate subscription) is sound and correctly marked non-load-bearing.

**Item 4 (alignment with new rules; R8 opencode flag handled honestly) — CONFIRMED.** All-harnesses (matrix), native-features-as-tightening, real-installed-harness integration tests (AC4/AC14 "not a fixture/stub"), web-research-grounding (Codex/opencode docs cited with June-2026 dates) all present. R8 `⚠️ UNVERIFIED OPENCODE_PERMISSION` is handled honestly — flagged, scoped to Task 7b binary verification, and explicitly non-load-bearing because it's bonus tightening, not the floor. Good.

---

## What round 4 confirms is right

- All three round-3 CRITICALs are genuinely resolved by relocating the floor to `registry.invoke`; none is papered over.
- The `commit_file` mechanism proof is real, self-contained, and AN-independent — builtin + Claude can go green now.
- The deadlock stays dissolved; the bookkeeping/security half stays tight; carried-forward pieces survive.
- The DONE matrix terminates a pipeline honestly.

## What must change before build (single most important)

**State the AN sandbox-provisioning dependency as an explicit contract + assumption flag, scope AL7's floor guarantee to brokered ops routed through `registry.invoke`, flag the native-tool/ambient-credential bypass as the bounded out-of-floor residual until AN, and remove the present-tense "broker attaches the HyperIdle-held credential" claim.** This is a documentation/scoping fix — it does not change AL7's buildable code (which lives on `commit_file`), but it is required to stop the plan from claiming a safety guarantee it borrows from an unbuilt, downstream WP.

## Score: 7 / 10 — REVISION NEEDED (scope/contract fix only; no code blocker)

1 CRITICAL (R4-1, the unstated AN dependency / general-claim leak — honesty/scoping defect, not a code-architecture defect), 1 WARNING (R4-2, proof-vehicle proves mechanism not containment). The three round-3 CRITICALs are resolved (this is a +3 jump from 4/10). The model is correct and the buildable scope is sound; the remaining CRITICAL is that the architecture *states a guarantee it does not build* and *does not flag the native-tool bypass*. Because the fix is a contract/scope declaration (not a redesign and not a code rework), this is a fast revision — but it is a true CRITICAL: shipping the floor while silently assuming AN's credential containment is the kind of unstated load-bearing assumption that bites a later WP.

## One-line build-ready judgment

**NOT build-ready as written; one scoping fix from it.** The broker-floor model is correct and the round-3 CRITICALs are resolved, but the floor's universal guarantee rests on an **unstated forward-dependency on unbuilt AN sandbox provisioning** (no live credential in the sandbox), the credential-attach seam it claims at `registry.invoke` does not exist today, and the native-tool/ambient-credential bypass is unflagged — declare the AN contract + assumption flag, scope the guarantee to brokered-ops-through-`registry.invoke`, flag the bypass residual, and drop the present-tense credential-attach claim; then it is build-ready (the `commit_file` scope needs no AN and proves the mechanism cleanly).

---
---

# SUPERSEDED — rounds 1–3 below scored the byte-faithful-replay model (now discarded by the reshape). Retained for history only.

<details>
<summary>Prior critique (byte-faithful-replay model) — superseded</summary>

(Original rounds 1–3 archived; the model they scored — exact-hash-match-to-permit, `one_shot_grants` keyed to identityHash, `canUseTool` arg-override as the load-bearing replay — is replaced by the tailored-native-allow/deny model critiqued above. Their resolved findings on capture-abort, the explicit re-dispatch trigger, CAS consume-once, canonicalization, and fail-closed classification carry forward and are re-confirmed under the reshape in WARNING-8/9.)

</details>
