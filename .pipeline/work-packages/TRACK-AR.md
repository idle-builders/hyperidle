# Track AR: Honest Harness Integration Testing

**What this track is.** An integration test must exercise a **real integration point**, with no stub standing in for that point. The codebase honors this for the *web/service* half — `*.integration.test.ts` runs against real PGlite + a real Hono app — but systematically violates it for the *agent-facing* half: a 47-file swarm audit found **30 harness-facing integration tests that stub the seam** (26 stub-the-seam, 3 wrapper-only, 1 mislabeled-unit) across 8 feature areas. They inject a `ScriptedAdapter` / `EchoHarnessAdapter` / `vi.mock("../harness/llm-client")` / `null as any` so the suite goes green while the real CLI/SDK harness path is never spawned. This track makes harness integration tests **honest**: real installed binary, real LLM, zero stubs, hard-fail when a binary is absent.

**The forcing principle.** Decide every test by one question: *is the harness/agent/CLI the thing under test?*
- **No** → web/service integration: the integration point is the DB + app. Real PGlite + real Hono. Already the norm.
- **Yes** → harness integration: the integration point is the **real installed harness binary**. Real CLI/SDK, real LLM, every supported harness, **zero stubs**. Binary absent → **HARD FAIL** (never `skipIf`); the run dies and the agent hard-stops and tells the user it cannot finish.

If a path through the harness adapter is stubbed, it is **not** an integration test — it is a mislabeled unit test. Either test the pure logic directly as a `*.test.ts` unit (stubs belong there) or test it against the real harness. There is no third option.

**The harness model — STRICT, non-negotiable.** Every gate, helper, fixture, doc, and assertion in this track MUST conform to the real harness model. Getting this wrong is not a detail — it is the exact failure this track exists to kill (a test gating on a dependency the real path never uses is a phantom gate that silently skips or hard-fails for the wrong reason).

- **The CLI harnesses are the leading, essential ones: `claude` (Claude Code), `codex`, `opencode`.** Each is its own **installed binary**, authenticated entirely through the host's **keychain / inherited login**. They take **NO API key of any kind.** A harness integration test for a CLI gates **only on the binary's presence** — `requireHarness("claude" | "codex" | "opencode")` (and `"gh"` for the GitHub CLI, also a keychain/inherited binary). Never on a key. (Keychain auth needs `USER`+`LOGNAME` in the adapter env allowlist — see PR #374, claude-code is the real CLI, not an SDK.)
- **The builtin (in-process) harness is secondary — "good to have," not the focus.** It is the **only** harness that uses an API key, and that key is the **OpenRouter** key (`OPENROUTER_API_KEY`), read from `.env`. **Never OpenAI. Never Anthropic.**
- **There is NO scenario in which `ANTHROPIC_API_KEY` exists.** Any test, gate, `requireHarness` token, helper, comment, or doc that references an Anthropic API key — or treats one as a "proxy for claude is configured" — is **wrong by construction** and must be removed. The honest gate for the claude CLI is the `claude` binary, full stop. An `OPENAI_API_KEY` gate for the builtin path is equally wrong; the builtin's key is OpenRouter.
- **`requireHarness`'s entire vocabulary is therefore harness-named, not key-named:** `claude`, `codex`, `opencode`, `gh` (binary-on-PATH checks), and the single builtin/OpenRouter `.env` key. No `anthropic-key`. No `openai-key`. If a test needs "a configured agent," it names the harness it actually drives.
- The track's prose still inherited a stale **"real CLI/SDK"** phrasing in places — there is no SDK path anymore; it is **real CLI binary** everywhere. Treat any "SDK" mention as a bug to fix in lockstep.

**Why now.** This is the same failure the retro log already names twice and never closed: **CC-004 / C1 "stub-the-seam / wiring-proof gap"** — *"ScriptedAdapter hardcoded reply → happy suite green while user message never reached model, 3 review rounds"* (AH3); *"v1 shipped with only scripted tests (mock/stub LLM streams via cassettes)… No live test proved a real agent on a real harness actually gets forced"* (AL6). It recurs because the rule that forbids it (`.claude/rules/testing.md:62`) lives in one path-scoped file the pipeline's `write-tests`/`review` skills never reference, while the surface builders *do* read (`write-tests/test-layers.md:22`: *"mock only nondeterministic externals (LLM calls, network)"*) reads as an explicit invitation to mock the harness, and the convention table defines `*.integration.test.ts` as "DB/API integration" — silent on the harness. The rule is mislocated and out-competed; the lane that would carry the real proof (`.real-harness.test.ts`) is undocumented in every naming table and runs in no automated regimen.

**The lane collapse.** `.real-harness.test.ts` was a workaround for a CI-binary problem **that does not exist**: no tests run in GitHub Actions — *all* tests run locally and attestation carries the result; CI only validates the HMAC signature. So harness integration tests are simply `*.integration.test.ts` that happen to face the harness; they run locally (where binaries are installed) as part of `verify`. The separate suffix/lane is retired and folded in.

**The deepest hole — attestation is the enforcement point.** Because attestation carries the local result, a green can currently be minted while every agentic test silently skipped: `verify-attest` records only the **exit code, not executed-vs-skipped count** (per `plans/reviews/testability-agentic-journey-review.md` — *"the attested CI lane can go 100% green while silently skipping every real-LLM/real-CLI test"*). Hard-fail-on-absent fixes the test; the attestation must **also** assert an executed-count floor for agentic integration tests, so no green survives a 100%-skipped agentic surface — defense in depth against the floor being eroded later.

**Scope rules.** Ground every claim in the real adapters and orchestrator in `packages/server/src/harness/` and `packages/server/src/services/session-provisioning.ts` — never a hand-rolled test rig that bypasses production. The keystone (AR2) is that the real proof goes through the production `provisionSession()`, not a bespoke server+MCP wiring the current `*.real-harness.test.ts` files hand-build. Honest tests will surface real product bugs (cost over-counting, sandbox-deleted-before-observable); fixing the surfaced feature bug is in scope for the WP that surfaces it. **Evals are a tuning tool, not test coverage (founder framing) — out of scope for this track.**

**Reference.** `.claude/rules/testing.md` (§Harness, naming table); `CLAUDE.md` (test tables); plugin skills `write-tests/references/test-layers.md`, `review/references/lenses.md`; `vitest.integration.config.ts`, `vitest.real-harness.config.ts`, `vitest.config.ts`, `package.json` test scripts; `scripts/verify-attest.ts`, `scripts/check-attestation.ts`; `packages/server/src/services/session-provisioning.ts` (`provisionSession`/`admitSession`/`runSession`), `assistant-turn.ts`, `session-lifecycle.ts:341` (sandbox teardown); `packages/server/src/harness/` adapters + `adapter-pool.ts`; `.claude/process/compound-candidates.md` (CC-004); `plans/reviews/testability-agentic-journey-review.md`.

---

### AR1 — The harness-integration testing rule, lane collapse, and enforcement floor

**Work package.** As a builder (and reviewer) writing harness-touching tests, I want one unambiguous rule — *integration tests exercise a real integration point; a harness-facing one uses the real binary with zero stubs and hard-fails when the binary is absent* — stated everywhere I actually read (testing rules, the project tables, and the pipeline write-tests/review skills), with the redundant `.real-harness.test.ts` lane folded into `*.integration.test.ts`, every `skipIf`-on-absent replaced by a `requireHarness()` that hard-fails, a guard that rejects a stubbed/faked harness adapter in a harness-facing integration test, and an attestation that fails when agentic integration tests report zero executed — so that a stubbed-seam test can no longer be written by following the guidance, slip past review, or mint a green attestation by silently skipping.

**Why this matters.** The recurrence is structural, not careless: the rule is mislocated (one path-scoped file) and out-competed (the read-most surface says "mock the LLM/network," which *is* the harness), and the enforcement layer (attestation) records only an exit code, so a 100%-skipped agentic surface mints green. Every builder who touches the harness pays the CC-004 tax — AH3 cost 3 review rounds, AL6 cost 4. The founder benefits directly: the next harness WP is proven or honestly blocked, never falsely green. The cost of not doing this: the other AR WPs convert tests onto a foundation that still invites the next stub.

**Type.** infra / tooling.

**What exists today.** Three lanes exist by suffix: `*.test.ts` (`vitest.config.ts`, unit), `*.integration.test.ts` (`vitest.integration.config.ts`, PGlite + app fixtures), `*.real-harness.test.ts` (`vitest.real-harness.config.ts`, spawns real binaries, run only by `npm run test:real-harness`, in no automated regimen). The rule is stated once at `.claude/rules/testing.md:62` ("never a stub or mock… across every supported harness") but the naming tables there and in `CLAUDE.md` define `*.integration.test.ts` only as "DB/API integration" and omit `.real-harness.test.ts` entirely; the pipeline `write-tests`/`review` skills never reference it and `test-layers.md:22` actively says to mock LLM/network. Real-binary tests today `test.skipIf(no binary/key)` → skip on any machine without the tool. `scripts/verify-attest.ts` records the suite exit code; `scripts/check-attestation.ts` validates the signature; neither counts executed-vs-skipped. `packages/eslint-plugin-design` and `eslint-plugin-authz` show the in-repo pattern for a custom lint rule.

**What's genuinely missing.** The two-archetype rule *prose* already landed in this registration PR (`.claude/rules/testing.md` §Integration tests: two archetypes, both `CLAUDE.md` tables, the `write-tests`/`review` skills — stated as the direction). What is missing is the *mechanism* that enforces it and keeps the prose true: the collapse of the `.real-harness` lane into `*.integration.test.ts`; a `requireHarness()` hard-fail helper replacing `skipIf`; a guard that fails when a harness-facing integration test constructs a fake/scripted harness adapter or skips on absence; and an attestation executed-count floor for agentic integration tests.

**Depends on.** None — it edits testing rules, skills, vitest config, attestation scripts, and a lint guard, all of which exist.

**Complexity.** L

**Acceptance criteria.**
- The two-archetype rule prose (landed in this registration PR across `.claude/rules/testing.md`, both `CLAUDE.md` tables, and the `write-tests`/`review` skills) is updated **in lockstep** as the mechanism lands — once the lane collapses, those surfaces no longer describe `.real-harness.test.ts` as a separate lane and instead match the shipped structure. Prose and mechanism never drift.
- The pipeline `write-tests` guidance (`test-layers.md` / SKILL) carves the harness **out** of "nondeterministic externals you may mock," and the `review` lenses gain a tripwire that flags a harness-touching AC proven only by a stubbed adapter as a blocking finding.
- The `.real-harness.test.ts` suffix and `vitest.real-harness.config.ts` are gone; those tests run as `*.integration.test.ts` under the integration config (configured so real-LLM files run serially to respect rate limits), and `npm run test:real-harness` is removed or repurposed.
- A `requireHarness(name)` helper exists and is used in place of every `skipIf`-on-absent in harness integration tests; when the named harness is absent the test run **fails** with a message naming the missing harness and that the work cannot be completed — it does not skip. **Its vocabulary conforms to the STRICT harness model above:** `claude` / `codex` / `opencode` / `gh` are binary-on-PATH checks (keychain/inherited auth, NO API key); the builtin path's only key is `OPENROUTER_API_KEY` from `.env`. **No `anthropic-key` token may exist** anywhere (no `ANTHROPIC_API_KEY` scenario), and **no `openai-key` token** for the builtin path (it is OpenRouter). Every test's gate names the harness it actually drives — `session-provisioning` and the claude-CLI tests gate on `requireHarness("claude")`, never on a key proxy.
- A lint/check guard fails the build when a `*.integration.test.ts` whose path exercises the harness adapter constructs a fake/scripted/echo harness adapter or `vi.mock`s the harness/LLM client, or contains a `skipIf` on harness availability.
- `verify-attest` records executed and skipped counts for the integration suite, and `check-attestation` fails the attestation when agentic harness integration tests report zero executed — a green can no longer be minted while every agentic test skipped.
- `npm run verify` passes on a machine with the supported harness binaries installed, and fails with the `requireHarness` message on a machine without them.

**Validation scenarios.**
- Given a new harness-facing test that injects a `ScriptedAdapter`, when `npm run lint`/`verify` runs, then the guard fails and points the author to write it against the real harness or demote it to a `*.test.ts` unit.
- Given a machine missing the `codex` binary, when `npm run verify` runs, then a harness integration test for codex fails with a "harness not installed — cannot complete" message and no attestation is minted (not a silent skip, not a green).
- Given an integration run where every agentic test was skipped, when `check-attestation` validates, then it fails on the executed-count floor.
- Given a builder reading only `CLAUDE.md` and the `write-tests` skill, when they scope a harness test, then the guidance tells them to use the real binary — the "mock the LLM" reading is gone.

**Plan calls.** Standard architecture pass — no `/pipeline:design` (no UI surface). Plan the rule text, the lane-collapse mechanics (config merge, suffix migration, script removal), the `requireHarness` helper shape, the guard (eslint rule vs check script — pick per false-positive risk on builtin/in-process cases), and the attestation executed/skipped wiring. The guard's *content* check (stub-adapter detection) may start as a report with a known-debt allowlist so it does not break `main` before AR3–AR6 convert the offenders; the lane/skipIf/filename checks enforce immediately.

**Contracts / constraints.**
- No tests run in GitHub Actions; all run locally and attestation carries the result. Do not add a CI test job.
- Do not weaken or bypass attestation; the executed-count floor is additive.
- The guard must not false-positive on legitimate `*.test.ts` units that stub (stubs are correct there) or on web/service `*.integration.test.ts` that never touch the harness.
- Renaming `.real-harness.test.ts` files preserves their assertions; this WP only moves the lane, it does not rewrite their bodies (that is AR6's consolidation).
- Any lane/suffix/helper change ships with the matching prose update to `.claude/rules/testing.md`, `CLAUDE.md`, and the `write-tests`/`review` skills in the same PR — the guidance must always describe the shipped structure.

**Out of scope.**
- Converting the 30 stubbed tests to real-harness (AR2–AR6).
- Fixing the product bugs honest tests will surface (AR2/AR3).
- Any eval re-wiring.

**Effort.** L (~2d)

---

### AR2 — One real agent run through the production `provisionSession()`

**Work package.** As anyone trusting the harness backbone, I want one automated integration test that drives a **real agent turn through the production `provisionSession()` orchestrator** — real `HarnessAdapter`, real model, the real `admitSession`/`runSession` phases and sandbox teardown — and asserts on the agent's actual output, so that the production seam (`adapter ↔ provisionSession ↔ teardown`) is verified by a real run instead of by the hand-built server+MCP rigs the current real-harness tests use, and the conversions in AR3–AR6 have a proven pattern to reuse.

**Why this matters.** Today the only end-to-end agent proofs (`AL7-two-session-trust-first`, `AL6-real-harness-return-enforcement`) hand-build their own wiring and never call `provisionSession()` — so a regression in the production orchestrator passes every gate (per the testability review). The orchestrator also deletes the sandbox at teardown (`session-lifecycle.ts:341`) before output can be observed, which is *why* those tests rebuild their own rig. Closing both — a real run through production plus a capture-before-teardown seam — gives the founder a single test that proves the agentic core actually works, and gives AR3–AR6 a template instead of seven reinvented rigs.

**Why this matters (cont).** This is the keystone: it converts the abstract rule (AR1) into a concrete, reusable production-seam pattern.

**Type.** backend + test infra.

**What exists today.** `provisionSession()` (`session-provisioning.ts`) runs phases 1–11 (`admitSession` + `runSession`); `runAssistantTurn()` is the task-free twin. `AM2-builtin-gateway.integration.test.ts` already makes a real model call through `BuiltinHarnessAdapter` (verdict: real-integration) but does not flow the full `provisionSession` path and currently `skipIf` no key. `session-lifecycle.ts:341` removes the sandbox at teardown; AO2 added `filesystem_captures` (migration 0041) capturing some state before teardown. The `CliHarnessAdapter` spawns real `claude`/`codex`/`opencode`; `BuiltinHarnessAdapter` runs in-process with a real LLM call.

**What's genuinely missing.** No automated test goes intake→`provisionSession`→real harness→real tool/output→teardown through the production orchestrator, and there is no general seam to observe agent output *before* the sandbox is deleted (only AO2's narrow capture exists).

**Depends on.** AR1 — must be authored under the collapsed lane using `requireHarness` (hard-fail, no skip) and counts toward the attestation floor; reusing AR1's primitives is the point.

**Complexity.** M

**Acceptance criteria.**
- An integration test provisions a real session via the production `provisionSession()` (not a hand-built server/MCP rig) with a real `HarnessAdapter` and a real model, runs a turn on an obvious task, and asserts on the agent's actual produced output (a tool call made and/or a file/artifact written) — not on a fabricated event or adapter stub.
- **The test covers the FULL supported-harness matrix — `SUPPORTED_HARNESSES` = `builtin` + `claude` + `codex` + `opencode`** (`gh` is a tool not an agent harness; `cursor-agent` is inert) — one `requireHarness(<name>)`-gated lane through real `provisionSession()` per harness, with equal coverage. NOT "at least one CLI binary."
- **Equal coverage is mechanically enforced, not a per-author choice:** the `honest-harness-guard` lint coverage check fails the build when a harness-facing `*.integration.test.ts` omits a `requireHarness` lane for any member of `SUPPORTED_HARNESSES` (naming the missing harnesses), and the attestation **per-harness** floor (`agenticExecutedByHarness` in the signed payload, enforced by `check-attestation.ts`) fails when any supported harness ran zero executed agentic assertions. A subset-covered harness test cannot ship; a declared-but-dead lane cannot mint green.
- The agent's output is observable by the assertions despite teardown — a capture-before-teardown seam exposes what the session produced before `session-lifecycle.ts:341` deletes the sandbox.
- The test hard-fails (via `requireHarness`) when the required harness/model is unavailable; it never skips to green.
- The pattern (provision-real → capture → assert → teardown) is documented/extractable **as a matrix helper** (`SUPPORTED_HARNESS_LANES` + `runThroughHarness` in `provision-real-session.ts`) so AR3–AR6 import "run through all supported harnesses" rather than rebuilding rigs or re-deriving per-harness wiring.

**Validation scenarios.**
- Given an obvious task ("create a file X with content Y"), when the test runs through `provisionSession()` with a real harness, then the assertion sees the real produced artifact/tool-call before teardown.
- Given the model/binary is absent, when the test runs, then it fails with the missing-harness message — no green.
- Given a regression that breaks the `adapter ↔ provisionSession` seam, when the test runs, then it fails (the seam is genuinely exercised).

**Plan calls.** Standard architecture pass, backend — no `/pipeline:design`. Decide the capture-before-teardown seam (extend AO2's `filesystem_captures` vs a test-observable hook on the provisioning result) with the lightest production change that does not weaken the teardown contract. **Cover the FULL supported-harness matrix (`builtin` + `claude` + `codex` + `opencode`), one lane each through real `provisionSession()`, every lane `requireHarness`-gated** — NOT "at least one CLI binary." Plan the enforcement that makes equal coverage non-regressable: a `SUPPORTED_HARNESSES` single source of truth, a `honest-harness-guard` coverage check (a harness-facing test must declare a lane for every supported harness; staged debt for AR3–AR6), and an attestation **per-harness** floor (`agenticExecutedByHarness`; fail if any supported harness ran zero). Ground per-harness setup in the existing `cli-adapter-real-binary.integration.test.ts` prep helpers + `adapter-pool.ts` `CLI_TOOL_CONFIGS` — do not invent.

**Contracts / constraints.**
- Goes through the real `provisionSession()` — no bespoke wiring that bypasses production phases.
- The capture seam must not weaken or defer the real teardown (no leaked sandboxes); it observes, it does not disable cleanup.
- Real binary / real model, zero stubs; hard-fail on absence.
- **Coverage across the full `SUPPORTED_HARNESSES` matrix is mechanically enforced (lint coverage check + attestation per-harness floor) — not a per-test author choice.** AR2's own test is on neither debt allowlist; it fully conforms.

**Out of scope.**
- Converting the existing stubbed feature tests (AR3–AR6).
- The full multi-stage journey walk (folded into AR4's dispatch→provision flow, not a separate deliverable here).

**Effort.** M (~1d)

---

### AR3 — Provisioning, adapter pool, and cost: real harness integration + cost-delta fix

**Work package.** As someone trusting that sessions provision and bill correctly, I want the provisioning / adapter-pool / cost integration tests (`X3-session-provisioning`, `X6-provisioning-integration`, `adapter-pool-integration`, `AF10-provisioning-cost-delta`, `af7-dispatch-wiring`, `af7-nonblocking-provision`, `af7-state-sync`) to prove their behavior against a **real harness through `provisionSession()`** instead of a `ScriptedHarness`/`CapturingHarnessAdapter` that yields fabricated `cost_update` events — and, because honest cost tests will expose it, the **cost over-counting bug fixed** (`recordCostAndCheck` accumulates the running total instead of the per-step delta), so that provisioning and billing are proven on real harness output.

**Why this matters.** AF10 asserts `costActual` equal to numbers it itself injected as synthetic `cost_update` events — it proves arithmetic over fabricated input, not that cost is captured from a real harness; the real over-counting defect (lore'd, deferred) sits underneath, untouched. Provisioning and adapter-pool tests inject fake adapters so a regression in the real provision path passes. The founder is billed on this path; it must be proven on real numbers.

**Type.** backend.

**What exists today.** `session-provisioning.integration.test.ts` is already real-integration (good baseline). The seven listed files inject `ScriptedHarness`/`CapturingHarnessAdapter`/`makeBuiltinPool` test doubles into `provisionSession`'s `adapterPool` seam and assert on DB rows populated by scripted events. `recordCostAndCheck` (per `R5-agent-work-loop.integration.test.ts:362-363` + lore) adds the running total rather than the delta → multi-step sessions over-count. AO2 capture + AR2's seam make real output observable.

**What's genuinely missing.** Real harness cost/provisioning assertions (real `cost_update` from a real run), and the corrected per-step cost delta.

**Depends on.** AR1 (lane + `requireHarness` + guard + attestation floor) and AR2 (the provision-real → capture → assert pattern these reuse instead of rebuilding rigs).

**Complexity.** L

**Acceptance criteria.**
- The provisioning / adapter-pool / cost integration tests assert on cost and session state produced by a **real harness run through `provisionSession()`**; no `ScriptedHarness`/`CapturingHarnessAdapter`/fabricated `cost_update` remains in these files (any genuinely pure-logic assertion is demoted to a `*.test.ts` unit).
- A multi-step real session reports cost equal to the **sum of per-step deltas**, and `recordCostAndCheck` no longer over-counts; a regression to running-total accumulation makes the test fail.
- The `af7` provisioning/dispatch/state-sync behaviors are proven through the real provision path (real adapter), not an injected fake.
- All converted tests hard-fail on missing harness; none skip.

**Validation scenarios.**
- Given a real two-step agent session, when cost is recorded, then the persisted `costActual` equals delta1+delta2 (not delta1 + (delta1+delta2)).
- Given the cost-delta fix reverted, when the cost test runs, then it fails (sanity-break).
- Given a real provision through the pool, when `af7-state-sync` asserts, then it reflects real adapter state, not a fake's canned output.

**Plan calls.** Standard architecture pass, backend. Triage each of the seven files: convert to real-harness-via-`provisionSession` (reuse AR2) or demote a pure-logic remnant to a unit. Fix `recordCostAndCheck` to use the per-step delta and prove it with a real multi-step run.

**Contracts / constraints.**
- Real binary/model, zero stubs in the integration tests; hard-fail on absence.
- Each test that remains a harness-facing `*.integration.test.ts` covers the **full `SUPPORTED_HARNESSES` matrix** (`builtin`+`claude`+`codex`+`opencode`) — one `requireHarness(<name>)`-gated lane per harness, equal coverage, NOT a single harness — mechanically enforced by the AR1/AR2 honest-harness-guard coverage rule + the per-harness attestation floor (`agenticExecutedByHarness`); a file stays on `coverage-debt.allowlist.json` only until its conversion reaches full coverage. Reuse `SUPPORTED_HARNESS_LANES` + `runThroughHarness` (AR2).
- The cost fix preserves the existing cost API/row shape (back-compat at the API level).
- Reuse AR2's seam; do not rebuild bespoke provisioning rigs.

**Out of scope.**
- Assistant-turn / dispatcher conversions (AR4).
- Cost UI or reporting changes beyond the delta correctness fix.

**Effort.** L (~2d)

---

### AR4 — The assistant is a normal agent: harness-agnostic chat, strategy-shaped, settings-configurable

**Work package.** As a user who runs my own harness, I want my assistant to chat with me through **whatever harness I have connected** — builtin, Claude, Codex, or OpenCode — configured from Settings like any other agent, with its persona and tools decided by the active strategy rather than hardcoded, so that the assistant is no different from any other agent and I am never forced to add a separate OpenRouter subscription just to talk to it. Today the assistant chat is a special builtin-only in-process path (`runAssistantTurn`), hardwired to `harnessType:"builtin"` and posting a `missing_key` notice for any user without an OpenRouter key; this work package dissolves that special-casing so the assistant flows through the same harness + strategy machinery every other agent uses.

**Why this matters.** A user who is all-in on Codex (or Claude, or OpenCode) via their CLI login currently cannot chat with their assistant at all — they get a `missing_key` notice because the chat is hardwired to the OpenRouter-backed builtin harness, even though their connected CLI harness is sitting right there. That is a broken first-run for exactly the self-reliant, fast-moving users HyperIdle is built for. Beyond the immediate hole: the builtin-only special-case is an architectural seam that contradicts "the assistant is just the individual agent" — it bypasses the strategy split (persona/tools hardcoded at the turn, not strategy-decided) and the harness machinery, which is why its honest-harness tests could only ever run builtin-only and broke AT1's four-harness symmetry floor. Making the assistant a normal agent fixes the user-facing hole, restores the strategy boundary, and lets the assistant's real-harness tests run symmetric across all four harnesses like every other agent's.

**Type.** application (backend + frontend; reshapes the assistant primitive).

**What exists today.** The assistant is a `users` row (`ast-${userId}`) created on two paths, both **hardcoding** `harnessType:"builtin"` / `modelId` / `modelProvider`: the route lazy-create via `getActiveStrategy().scaffoldAgents({trigger:"user_assistant"})` → Kernel `persistScaffoldedAgents` (`scaffold-agents.ts:99-101`), and a lazy-create inside the turn service (`assistant-turn.ts:270-288`). The chat reply runs through `runAssistantTurn` (`assistant-turn.ts`) — a deliberately **task-free, in-process builtin path** that never calls `getActiveStrategy()` at turn time: it reads persona/harness/model straight off the `users` row, builds a `SessionConfig` with `sandboxPath:""` + `messages:transcript`, injects a 2-tool draft registry via `setSessionToolRegistry` (a method **only on `BuiltinHarnessAdapter`, not the `HarnessAdapter` interface**), and the **builtin adapter alone** branches on `config.messages` to run a single chat turn. The Strategy Port (`strategy-port.ts`) decides agent **persona only** (`scaffoldAgents` returns role/name/systemPrompt — "a Strategy that sets harnessType or modelId is doing Kernel work"); harness/model are Kernel-attached. A full Settings surface exists (`packages/web/src/settings/`, ~14 sections) — `SettingsAgents` edits harness/model/persona for team agents but **explicitly excludes the assistant** (`role!=="assistant"` filter); `SettingsAssistant` edits **systemPrompt only**. `PATCH /api/agents/:id` already validates the `(harnessType, provider, modelId)` triple. The normal `provisionSession` path runs all four harnesses but is **strictly task-oriented** (required `taskId`, sandbox-based, no conversational/message-seeded mode). The CLI adapters ignore `config.messages` and read only a truncated `assembledPrompt` + `sandboxPath`. **Already shipped on this branch (keep):** AD2/R1 dispatch→provision tests converted to real harness via `provisionSession` with `minimalStrategy` + the dispatcher `onBeforeTeardown` capture seam.

**What's genuinely missing.** (1) A conversational reply on a **CLI harness** — the chat turn is structurally builtin-only via three couplings (interface-absent `setSessionToolRegistry`, builtin-only `config.messages` branch, `sandboxPath:""` with no conversational mode on `provisionSession`). (2) A **strategy seam at turn time** so the assistant's persona/tools are strategy-decided, not read hardcoded off the row. (3) **Settings UI + storage wiring** to let a user configure the assistant's harness/model (today it is excluded from the agent config UI and hardwired at both creation sites).

**Depends on.**
- AR2 — reuses the real-harness `provisionSession` seam + `lockedHarnessAdapter`/`runThroughHarness` pattern for the harness-agnostic turn and its tests; cannot build the four-harness assistant turn without it.
- AR7 — the locked per-harness test-model matrix + `assertHarnessSymmetry` floor that the assistant's now-four-harness tests must satisfy; this WP removes the assistant's `BUILTIN_ONLY_INTEGRATION` carve-out against that floor.

**Complexity.** L

**Acceptance criteria.**
- The assistant answers a chat message through **whatever harness it is configured with** — builtin, claude, codex, or opencode — producing a real reply on each; a user who has only a CLI harness connected (no `OPENROUTER_API_KEY`) gets a working assistant reply through that harness, not a `missing_key` notice.
- The assistant's **harness and model are configurable from Settings** (the assistant is no longer excluded from agent configuration); changing them changes which harness/model serves the next chat reply, and the change is validated against the same `(harness, provider, model)` compatibility rules other agents use.
- The assistant's **persona and tools are decided by the active strategy** at formation/turn time through the same seam other agents use — not read from a hardcoded constant; switching the active strategy changes the assistant's form.
- The assistant **runs through the same agent machinery as any other agent** — there is no assistant-only adapter branch or builtin-only special-case that bypasses the harness/strategy seams (the `setSessionToolRegistry`/`config.messages`/`sandboxPath:""` builtin-only couplings are replaced by a harness-agnostic conversational seam).
- The assistant's real-harness integration tests run **symmetric across all four harnesses** (builtin+claude+codex+opencode) and the assistant is **removed from `BUILTIN_ONLY_INTEGRATION`**; the run satisfies AR7's `assertHarnessSymmetry` floor with no carve-out.
- The **never-silent** contract is preserved: every assistant turn still ends in a persisted reply or a persisted notice, and no secret leaks into a notice.
- The already-converted AD2/R1 dispatch→provision real-harness tests (with `minimalStrategy` + the `onBeforeTeardown` seam) are retained and still pass.

**Validation scenarios.**
- Given a user who connected only Codex (CLI login, no OpenRouter key) and whose assistant is set to the codex harness, when they send a chat message, then the assistant replies through codex — not a `missing_key` notice.
- Given the user changes their assistant's harness and model in Settings, when they send the next message, then the reply is served by the newly chosen harness/model (and an incompatible triple is rejected before save).
- Given a different active strategy, when the assistant turn runs, then the assistant's persona/tools reflect that strategy's formation rather than a hardcoded persona.
- Given any supported harness binary is absent, when the assistant's real-harness tests run, then they hard-fail (no skip) and the four-harness symmetry floor passes with no builtin-only carve-out for the assistant.

**Plan calls.** This **reshapes a load-bearing noun (the assistant)** — run `/concept` first to lock "the assistant is a normal agent" and, critically, the **strategy ↔ kernel boundary for assistant formation**: the existing split puts persona/tools in the Strategy and harness/model in the Kernel/user-config, while the founder's framing is "the strategy decides what the assistant is formed like (persona, tools, model, harness)" — concept must settle whether harness/model stay user-configured (Settings, Kernel) with the strategy shaping persona/tools, or move into the strategy, and define the formation **event/seam** the assistant emits. The WP has a **UI surface** → run `/design` for the assistant configuration in Settings (likely un-excluding the assistant from `SettingsAgents` and/or extending `SettingsAssistant` with harness+model). It spans **multiple subsystems** (harness adapters, the conversational-turn path, the strategy port, Settings UI, the `users`/agent config storage) — expect `/architecture` to **split this into smaller work packages** (e.g. harness-agnostic conversational seam; strategy formation seam; settings config), which is the encouraged outcome.

**Contracts / constraints.**
- **Never-silent preserved:** every turn ends in a persisted reply or one of the existing notice classes (`missing_key`/`missing_harness`/`provider_error`); no secret in a notice.
- **Strategy/Kernel boundary respected:** a Strategy must not write `harnessType`/`modelId` (existing `@lore`); harness/model are user/Kernel config. Reconcile the founder's "strategy decides … model, harness" as: the strategy decides persona/tools (the WHO) and **emits the formation request**, while harness/model are resolved from the user's Settings config — unless `/concept` explicitly relocates that boundary.
- **Four-harness conversational turn must be real:** the transcript actually reaches the model on each harness and the assistant's tools (draft actions) work on each — the CLI path must not silently drop `messages` as it does today.
- **Honest harness testing (AR1/AR2/AR7) holds:** real binary, zero stubs, `requireHarness` hard-fail, no `skipIf`; the assistant tests use the locked `HARNESS_TEST_MODELS` matrix and satisfy `assertHarnessSymmetry`; remove the assistant files from `BUILTIN_ONLY_INTEGRATION`.
- **Keep** the already-shipped AD2/R1 real-harness conversion, `minimalStrategy` usage, and the dispatcher `onBeforeTeardown` seam on this branch.
- Preserve the existing `(harness, provider, model)` validation when the assistant config is saved.

**Out of scope.**
- Reworking the **team-agent** configuration UI or the strategy port's other methods (`assembleContext`/`decomposeBet`/`selectAgent`) beyond what assistant formation needs.
- The rest of the honest-harness track (AR1–AR3, AR5–AR7 already shipped).
- Multi-assistant / per-thread assistant overrides — one configurable assistant per user.

**Effort.** L (~4d)

---

### AR5 — Strategy and bet decomposition: real agent or honest demotion

**Work package.** As someone trusting that bets decompose into real work, I want `AK2-contributor-scenario`, `AK2-minimal-strategy`, `AK3-bet-decomposition`, `AK3-bet-decomposition-subscriber`, and `AK8-strategy-decomposition` to either prove decomposition **via a real agent** or, where the assertion is genuinely pure logic over a given decomposition, be **demoted to honest `*.test.ts` units** — so that no test claims to prove agent-driven decomposition while feeding it a scripted `EchoHarnessAdapter` output.

**Why this matters.** Decomposition is where a strategy agent turns a bet into tasks; the current tests inject scripted agent output and a fake `ContributorStrategy` with `eventBus … as never`, so "the agent decomposed the bet" is hardcoded. Either the decomposition is agent-driven (then prove it real) or it is deterministic post-processing of a decomposition (then it is a unit test and should say so). The honest split removes the false claim either way.

**Type.** backend.

**What exists today.** These tests inject scripted harness output + fake strategies into the decomposition path and assert on resulting tasks/edges. Some assertions are pure transforms of a given decomposition; some genuinely depend on the agent producing it. `AK7`/`AK8` already pruned some seam cruft.

**What's genuinely missing.** A clean separation: real-agent proof for the agent-driven parts, unit tests for the pure-logic parts — with no scripted-adapter "integration" test in between.

**Depends on.** AR1 and AR2.

**Complexity.** M

**Acceptance criteria.**
- Each of the five files is either converted to prove decomposition against a **real agent** through the production path, or demoted to a `*.test.ts` unit whose stubs are honest (testing pure logic over a supplied decomposition) — no scripted/echo harness adapter remains in a `*.integration.test.ts`.
- For the agent-driven assertions, a real strategy agent produces the decomposition and the resulting tasks/edges are asserted from that real output.
- Demoted units no longer carry the `.integration` suffix and do not route through `provisionSession` with a fake adapter.
- Converted integration tests hard-fail on missing harness; none skip.

**Validation scenarios.**
- Given a real bet, when a real strategy agent decomposes it, then the persisted tasks reflect the agent's actual decomposition (a fake/empty output would fail).
- Given a pure transform of a supplied decomposition, when it is run as a unit test, then it passes deterministically with no harness involved — and is named `*.test.ts`.
- Given a harness absent, when the converted integration tests run, then they hard-fail.

**Plan calls.** Standard architecture pass, backend. Per-file triage is the core work: classify each assertion agent-driven vs pure-logic, then convert or demote. Reuse AR2 for the real-agent parts.

**Contracts / constraints.**
- No scripted/echo harness adapter in any `*.integration.test.ts`.
- Demotions preserve the assertion; they change the lane and remove the false integration claim.
- Real agent, zero stubs, hard-fail on absence for the converted tests.
- Each test that remains a harness-facing `*.integration.test.ts` covers the **full `SUPPORTED_HARNESSES` matrix** (`builtin`+`claude`+`codex`+`opencode`) — one `requireHarness(<name>)`-gated lane per harness, equal coverage, NOT a single harness — mechanically enforced by the AR1/AR2 honest-harness-guard coverage rule + the per-harness attestation floor (`agenticExecutedByHarness`); a file stays on `coverage-debt.allowlist.json` only until its conversion reaches full coverage. Reuse `SUPPORTED_HARNESS_LANES` + `runThroughHarness` (AR2).

**Out of scope.**
- Changing decomposition product behavior (unless a real test surfaces a genuine bug, then fix it).
- MCP / enforcement consolidation (AR6).

**Effort.** M (~1d)

---

### AR6 — MCP bridge/routing, capabilities, and enforcement consolidation

**Work package.** As someone trusting the agentic seams (the MCP bridge agents call, harness capability reporting, and the return-gate/forcing enforcement), I want `mcp-route`, `mcp-bridge`, `mcp-bridge-registry`, `cli-mcp-config`, and `AM2-harness-capabilities` proven against a **real harness**, and the existing real proofs (`AL6` return-gate/reprompt/uniform/return-enforcement, `ah5-gates`, `AL7-builtin-live-session`/`AL7-tailored-grant` and their former `.real-harness` siblings) **consolidated into the integration lane** with pure-logic machinery demoted to units — so that the bridge, capabilities, and enforcement are proven once, honestly, through the real harness, with no scripted-adapter duplicate masquerading as the proof.

**Why this matters.** The MCP bridge *is* the agentic seam (agents call tools through it); proving it with a scripted adapter proves nothing about real tool calls. The enforcement files are the good-pattern-gone-confusing case: they have real `.real-harness` siblings but the `.integration` copies feed scripted events and over-claim. Consolidating leaves one honest proof per behavior instead of a real test plus a stubbed look-alike. `cli-mcp-config` is a mislabeled unit and should become one.

**Type.** backend.

**What exists today.** `mcp-bridge-stateful.integration.test.ts` is already real-integration (T0b proves session capability). `mcp-route`/`mcp-bridge`/`mcp-bridge-registry` use wrapper/fake adapters; `cli-mcp-config` uses no db/app fixtures (mislabeled unit). `AM2-harness-capabilities` scripts the capability source. `AL6`×4 + `ah5` + `AL7`×2 assert against scripted adapters in `*.integration.test.ts` and also have real `.real-harness.test.ts` siblings (`AL6-real-harness-return-enforcement.real-harness.test.ts`, `AL7-two-session-trust-first.real-harness.test.ts`) that AR1 folds into the integration lane.

**What's genuinely missing.** Real-harness proof for the bridge/capabilities, and one consolidated honest test per enforcement behavior (the scripted `.integration` duplicate removed or demoted), with `cli-mcp-config` renamed to a unit.

**Depends on.** AR1 (the lane fold brings the real siblings in; the guard flags the duplicates) and AR2 (real-run pattern for the bridge/capabilities proofs).

**Complexity.** M

**Acceptance criteria.**
- `mcp-route`, `mcp-bridge`, `mcp-bridge-registry`, and `AM2-harness-capabilities` prove their behavior against a **real harness** calling through the production bridge; no wrapper/fake adapter remains in these `*.integration.test.ts`.
- `cli-mcp-config` is a `*.test.ts` unit (it uses no db/app/real-service) — its `.integration` label is removed.
- For each enforcement behavior (return-gate, reprompt, uniform-forcing, return-enforcement, broken-stream gates, builtin-live-session, tailored-grant) there is **one** honest proof: the real-harness sibling lives in the integration lane, and the scripted-adapter `.integration` duplicate is either removed or demoted to a pure-logic unit (e.g. the gate-verdict function tested directly).
- No `*.integration.test.ts` in this set constructs a scripted/fake harness adapter; converted tests hard-fail on missing harness.

**Validation scenarios.**
- Given a real agent calling a tool through the MCP bridge, when the route test runs, then it asserts the real tool call reached the handler (a fake adapter would no longer satisfy it).
- Given return-enforcement, when the suite runs, then the real-harness proof executes (no skip) and there is no second scripted test claiming to prove the same thing.
- Given `cli-mcp-config`, when the suite runs, then it runs as a unit with honest stubs and no integration label.

**Plan calls.** Standard architecture pass, backend. Convert the bridge/capabilities tests to real-harness via the production bridge (reuse AR2). For each enforcement behavior, keep the folded-in real sibling as the single integration proof and demote/remove the scripted duplicate; demote `cli-mcp-config` to a unit.

**Contracts / constraints.**
- One honest proof per behavior — no real test plus stubbed look-alike.
- Real harness through the production bridge; zero stubs; hard-fail on absence.
- Each test that remains a harness-facing `*.integration.test.ts` covers the **full `SUPPORTED_HARNESSES` matrix** (`builtin`+`claude`+`codex`+`opencode`) — one `requireHarness(<name>)`-gated lane per harness, equal coverage, NOT a single harness — mechanically enforced by the AR1/AR2 honest-harness-guard coverage rule + the per-harness attestation floor (`agenticExecutedByHarness`); a file stays on `coverage-debt.allowlist.json` only until its conversion reaches full coverage. Reuse `SUPPORTED_HARNESS_LANES` + `runThroughHarness` (AR2).
- Demotions preserve assertions and remove the false integration claim.

**Out of scope.**
- Provisioning/cost (AR3), assistant-turn/dispatcher (AR4), decomposition (AR5).
- Changing MCP bridge or enforcement product behavior (unless a real test surfaces a genuine bug).

**Effort.** M (~1d)

### AR7 — A Tier-2 harness is held to a guarantee the design does not make for it

**Work package.** As someone reading the harness lane, I want the assistant-reply proof to assert
what each harness can actually be held to, so that a red test means a real defect rather than an
unlucky turn — and, if cursor-agent *can* be forced, for it to be forced like the others.

**Why this matters.** `assistant-reply-live-harness.integration.test.ts` runs one proof across five
harnesses and asserts `outcome === "completed"` for all of them. That outcome requires the return
gate to observe a `reply()` tool call: `evaluate()` returns `not_returned` when a turn ends
`completed` and the gate never saw one. cursor-agent is configured `returnEnforcementChannel: "none"`
— there is no Stop-hook channel, so nothing re-prompts it and whether the test passes comes down to
whether the model spontaneously called the tool. The domain model already says as much:
`not_returned` is the outcome for a turn that ends without a return action *"after force budget
spent, or on a Tier-2 harness."* So the lane currently carries a permanently red test that reports
nothing about the code — and a red test nobody trusts is worse than no test.

**Type.** backend.

**What exists today.** cursor-agent is registered with `returnEnforcementChannel: "none"` and
`mcpConfig: { dialect: "cursor-json" }`, and does receive the tool bridge (`--approve-mcps`). The
other four harnesses have a real enforcement channel (`settings-claude`, `settings-codex`, …). The
test applies one assertion to all five. Reproduced on `origin/main` and on a feature branch, twice
each: 1 failed / 4 passed, always cursor-agent, always at `expect(result.outcome).toBe("completed")`.

**What's genuinely missing.** A decision, then the work that follows it. Either the proof asserts
per-tier — a Tier-2 harness is held to "the reply landed if it returned", not to "it returned" — or
cursor-agent gains a real enforcement channel and is held to the same bar as the rest. The second
needs evidence about whether the cursor-agent CLI supports a stop-hook at all; that is external tool
capability and must be researched, not assumed.

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- The harness lane has no permanently-red test: every harness in the assistant-reply proof is
  asserted against a guarantee its configuration can actually deliver.
- If cursor-agent stays Tier-2, the proof states that in the test itself, and a reply that *does*
  land is still asserted to reach the calling thread.
- If cursor-agent gains an enforcement channel, it is proven by a real forced turn on the real
  binary, not by a scripted adapter, per this track's forcing principle.
- The decision and its evidence (what the cursor-agent CLI does and does not support, with version
  and date) are recorded in the work package.

**Registered.** 2026-08-29, parked out of BA9 by founder decision — found while proving BA9 end to
end, unrelated to plugins or knowledge.
