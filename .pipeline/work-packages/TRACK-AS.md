# Track AS: Eval — the Tuning Loop (per-journey, graded, on the real harness seam)

**What this track is (founder, 2026-06-28).** An **eval is a tuning tool, not test coverage.** A test asks "does the obvious thing work?" and answers pass/fail; an eval asks "how *well* does the agent handle progressively harder versions of a real task?" and answers with a graded score you watch move as you change a prompt, a tool definition, a knowledge injection, or a model/harness. **100% on an eval means the eval is too easy** — the signal is the gradient, not a green check. Evals are therefore **ungated, never in attestation, cost-bearing, on-demand**, and deliberately distinct from Track AR's enforced correctness floor.

**Why now.** The current eval rig (`packages/eval`) is orphaned and mis-shaped for its purpose. It is wired into nothing (no script/CI/verify runs the runner — only the smoke model-math has tests), hard-exits without an API key, and its default model id is a forward-dated placeholder that may not route. Worse, it never exercises the connected CLIs: the rig registers **only** `BuiltinHarnessAdapter` in-process and **omits the MCP bridge** (`provision-harness.ts:358`), and its one "external" branch is gated on `provider === "anthropic"` while the default is OpenRouter, so it always falls back to a one-shot fixture with no tool loop and no subprocess. The framework predates the real-CLI adapter work (claude-code-as-real-CLI, PR #374), and nobody rewired it. And each scenario is a single-tool competency check scored mostly by deterministic DB existence checks — under the eval-vs-test framing that's an integration test, not a tuning dial: no difficulty gradient, no tuning signal.

**The relationship to Track AR.** AR builds the honest harness-integration lane — real binary, zero stubs, hard-fail-on-absent, enforced by an attestation executed-floor. Its keystone **AR2** lands the reusable pattern this track rides: a real agent run through the production `provisionSession()` orchestrator plus a **capture-before-teardown seam** that observes agent output before the sandbox is deleted (`session-lifecycle.ts:341`). Evals reuse the *same* seed → provision → capture rails AR keeps green, which is what guarantees they actually run. The split stays clean: **AR = enforced floor (does the obvious thing work), AS = measured ceiling (how well does it handle hard things)**, on one set of rails. The integration scenario for a journey IS that journey's eval tier-1, giving continuity and a sanity anchor — if eval T1 fails while the AR integration test passes, the eval harness is miswired, not the agent.

**Scope rules.** Ground every claim in the real orchestrator (`packages/server/src/services/session-provisioning.ts`) and the real adapters (`packages/server/src/harness/`) — never a hand-rolled rig that bypasses production (the failure mode AR2 exists to kill). Evals stay out of attestation and CI; they run locally / on-demand and carry no green/red gate. Reuse AR2's capture seam; do not rebuild a bespoke observation rig. ETHOS-aligned: a tuning tool for a fast team, not an enterprise QA apparatus.

**Reference.** `packages/eval/` (current rig: `runner.ts`, `provision-harness.ts`, `judges.ts`, `scoring.ts`, `seeding.ts`, `cli.ts`, `scenarios/*`, `smoke/*`); `.pipeline/work-packages/TRACK-AR.md` (AR2 keystone seam, AR3 cost fix); `packages/server/src/services/session-provisioning.ts` (`provisionSession`/`admitSession`/`runSession`), `session-lifecycle.ts:341` (teardown); `packages/server/src/harness/` (`BuiltinHarnessAdapter`, `CliHarnessAdapter`, `adapter-pool.ts`); `plans/reviews/testability-agentic-journey-review.md` (eval findings); memory: eval-vs-test, eval-purpose.

**Dependency note (sequencing).** This whole track rides **AR2's** seam (real `provisionSession()` run + capture-before-teardown) and should not begin implementation until AR2 is `done`. AR merged (PR #378), so AS1 declares the formal `depends: [AR2]`; AS2 → AS1 → AR2, AS3 → AS1, AS2. The track is unblocked at the spec level — AS1 implementation begins once AR2 itself ships.

---

### AS1 — A runnable eval lane on the production harness seam

**Work package.** As a maintainer tuning agent quality, I want the eval lane to **actually run** and to drive a real agent through the production `provisionSession()` path — picking a real cheap model on its own, targeting either the builtin gateway or a real CLI harness, and scoring the agent's *actual* produced output via AR2's capture-before-teardown seam — so that an eval run measures the real product (the same harnesses users run), not an orphaned in-process rig that no connected CLI ever touches. This replaces the current builtin-only, MCP-omitted, key-gated rig with one lane that runs on demand and produces a scored report across a harness/model matrix.

**Why this matters.** Today an eval run measures nothing a user experiences: it never spawns claude/codex/opencode and is wired into no runnable path, so the maintainer has no working dial to turn when changing a prompt or tool. Riding AR2's seam means the one thing AR keeps honest and green is also the thing evals exercise — the lane is runnable by construction. Cost of not building: the tuning loop stays dead and every prompt/tool change ships unmeasured.

**Type.** infra / backend.

**What exists today.** `packages/eval` has a serial `runEval` (`runner.ts`) that, per scenario, spins an ephemeral PGlite, seeds a realistic world (`seeding.ts` `seedMinimalWorld` — genuinely good), triggers, scores, and writes `eval-results.json`. But the trigger rig (`provision-harness.ts`) registers only `BuiltinHarnessAdapter`, omits `mcpBridgeRegistry` (`:358`), and its external branch is gated on `provider === "anthropic"` (`:303-305`) → always falls back to a one-shot `ExternalShapedAdapter` fixture. `cli.ts:96` hard-exits without an API key; `runner.ts:97` defaults to a forward-dated `deepseek/deepseek-v4-pro`. The smoke model-selector (`smoke/*`) already ranks free/cheap OpenRouter models and is the one part with tests. AR2 (dependency) provides the production-`provisionSession` real-run + capture-before-teardown pattern.

**What's genuinely missing.** An eval lane that goes through the real `provisionSession()` with a real harness (builtin+cheap-model and at least one real CLI), observes real agent output via the capture seam, resolves a runnable model automatically, and is invokable on demand — none of which the current rig does.

**Depends on.** **AR2** — the eval lane reuses AR2's production-`provisionSession` real-run and capture-before-teardown seam; building on a seam that doesn't exist would mean rebuilding the bespoke rig AR2 deletes. (AR merged in PR #378; AS1 cannot start until AR2 itself ships.)

**Complexity.** L

**Acceptance criteria.**
- A single on-demand command runs the eval lane end-to-end and writes a scored report, on a developer machine with the supported harness binaries/keys present, without manual model-id surgery — the lane resolves a runnable cheap model itself (reusing the smoke selector) rather than depending on a hardcoded forward-dated id.
- An eval scenario drives a real agent turn through the production `provisionSession()` (not a bespoke server/MCP rig) and scores the agent's **actual produced output** (a real tool-call and/or written artifact) observed via the capture-before-teardown seam — not a fabricated event or an in-process fixture.
- The lane runs the same scenario against a **matrix** of at least the builtin gateway (cheap model, the dense default lane) **and** one real CLI harness (claude/codex/opencode), and the report attributes scores per harness/model so a maintainer can compare them.
- The lane is honest about availability: when a requested harness/model is absent it reports that scenario as unrun for that matrix cell (named), and never silently scores it as success — but it does **not** gate `verify`/attestation (evals carry no green/red).
- The legacy builtin-only, MCP-omitted trigger rig (`ExternalShapedAdapter` one-shot path, hardcoded default model) is removed or replaced by the production-seam lane; `knip`/`lint`/`check` confirm no dead eval-rig references remain.

**Validation scenarios.**
- Given a machine with `claude` installed and a cheap model reachable, when the maintainer runs the eval lane for one scenario, then it provisions through `provisionSession()`, the agent runs on the real harness, and the report shows a score derived from the agent's real output for both the builtin and the claude matrix cells.
- Given the hardcoded `deepseek/deepseek-v4-pro` default is unreachable, when the lane runs, then it selects a different runnable cheap model via the smoke selector and still produces a report (no opaque first-call crash).
- Given a matrix cell whose harness binary is absent, when the lane runs, then that cell is reported as unrun-and-named, the other cells still score, and `npm run verify` is unaffected (the eval lane is not part of it).

**Plan calls.** Standard architecture pass, backend/infra — no `/design` (no UI surface). Plan how the lane consumes AR2's capture seam, the matrix abstraction (harness × model), the model-resolution reuse of `smoke/*`, the on-demand invocation surface, and the removal of the legacy trigger rig. Decide whether the runner stays a standalone `tsx` script or moves behind the shared provisioning entry, favoring the smallest change that reaches real `provisionSession()`.

**Contracts / constraints.**
- Goes through the real `provisionSession()` — no bespoke wiring that bypasses production phases.
- Evals never enter `verify`/attestation/CI; the lane is local/on-demand and carries no pass/fail gate.
- Reuse AR2's capture seam; do not weaken teardown or rebuild a parallel observation rig.
- Real harness + real model; no stub standing in for the harness or the LLM.

**Out of scope.**
- The graded judge redesign (AS2) and the per-journey scenario suite (AS3).
- Any attestation/CI wiring for evals (deliberately excluded).
- A scheduled/automated eval cadence — invocation is on-demand for now.

**Effort.** L (~3d)

---

### AS2 — Graded judges that read the agent's actual tool-calls

**Work package.** As a maintainer reading an eval score, I want the judges to grade what the agent **actually did** — which tool it called and with what arguments, and a structured quality judgment from an LLM judge — rather than asserting "some agent message exists," so that the score discriminates a right action from a plausible wrong one and a judge error from a genuine zero. This replaces the current deterministic existence-check scoring with tool-call-introspecting, schema'd, difficulty-aware judges that produce a meaningful gradient.

**Why this matters.** Today `judgeSendMessageCalled` and `judgeSubmitReviewCalled` both pass on *any* `messages` row with the agent's `senderId` — they cannot tell the two tools apart, so a wrong-tool call scores as success. `judgeLlmQuality` `JSON.parse`s raw model text with no fence handling and collapses any judge failure to score `0.0`, indistinguishable from a real zero. A gradient built on these is noise; no prompt/tool change can be trusted to have moved the number. The maintainer cannot tune against a dishonest dial.

**Type.** backend.

**What exists today.** `judges.ts`/`scoring.ts` are overwhelmingly `SELECT … WHERE` existence checks; the genuine LLM-judge (`judgeLlmQuality`) appears as one dimension among several deterministic ones and is brittle (`judges.ts:535` raw `JSON.parse`, `:538-543` failure → `0.0`). The runner aggregates dimensions into a per-scenario score. AS1 provides the real run output (including the agent's actual tool-call events via the capture seam) that judges will read.

**What's genuinely missing.** Judges that introspect the agent's real tool-call (tool name + args), an LLM judge with schema-validated structured output that distinguishes "judge errored" from "content bad," and a difficulty-aware aggregate so harder tiers weigh into the gradient rather than being averaged flat.

**Depends on.** **AS1** — judges read the run-output shape (real tool-call events + captured artifacts) that AS1 defines; without it they have nothing real to grade.

**Complexity.** M

**Acceptance criteria.**
- A judge distinguishes which tool the agent called: given a scenario expecting `submit_review`, an agent that instead calls `send_message` scores as a miss, not a pass — the judge keys on the actual tool name/args from the run, not on the existence of any message row.
- The LLM judge returns **schema-validated structured output** (not free-text `JSON.parse`d raw); a judge invocation that fails or returns off-schema is reported as `judge-errored` and is distinguishable in the report from a genuine `0.0` content score.
- The aggregate score is **difficulty-aware**: a scenario's harder tiers contribute distinctly (the report can show per-tier scores), so the gradient reflects capability frontier rather than a flat average that hides it.
- The report attributes each dimension's score to its source (deterministic check vs LLM judge vs tool-call introspection), so a maintainer can see *why* a number moved.

**Validation scenarios.**
- Given an agent that calls `send_message` when `submit_review` was expected, when judged, then the tool-discrimination dimension scores it a miss (not the current false pass).
- Given the LLM judge returns text wrapped in code fences or malformed JSON, when scored, then the result is recorded as `judge-errored` (surfaced in the report), not silently `0.0`.
- Given a scenario with tiers T1–T4, when scored, then the report shows distinct per-tier scores and a difficulty-aware aggregate.

**Plan calls.** Standard architecture pass, backend — no `/pipeline:design`. Plan the tool-call-introspection judge inputs (from AS1's captured run), the schema'd LLM-judge contract (structured tool-use / validated output + errored-vs-zero distinction), and the difficulty-aware aggregate shape. Reuse the project's existing structured-output patterns rather than inventing a parser.

**Contracts / constraints.**
- Judges grade real run output (real tool-calls / captured artifacts), never fabricated state.
- A judge error must never be scored as a content zero; the two are distinct report states.
- LLM-judge output is schema-validated; no raw `JSON.parse` of model text.

**Out of scope.**
- The scenario suite itself (AS3) and the lane/matrix (AS1).
- Auto-tuning / optimization loops that act on the score — judges produce the signal; acting on it is the maintainer's job for now.

**Effort.** M (~1d)

---

### AS3 — The per-journey, tiered eval suite

**Work package.** As a maintainer, I want ~5 **cross-cutting journey** evals — triage, execute-to-review, knowledge loop, handoff, and tool-choice-under-ambiguity — each laddered from an obvious tier-1 (the AR integration anchor) up through adversarial tier-4 (distractors, ambiguity, near-miss alternatives), scored by the graded judges across the harness/model matrix, so that one run yields a difficulty gradient that moves when I change a prompt, a tool definition, or a knowledge injection. This retires the single-tool, builtin-only, mostly-deterministic scenario set (including the ~18 that make no model call) in favor of realistic multi-tool tasks where tuning actually pays.

**Why this matters.** Per-tool single-step scenarios plateau the moment each tool "works" — there's nowhere for the score to move, so they're useless as a tuning dial. Real agent value lives in *choosing and sequencing* tools under ambiguity; that's where a prompt or tool-description change shows up. A laddered per-journey suite gives the maintainer a frontier ("passes T1–T2, fails T3 under distractors") that is directly actionable. Cost of not building: the lane (AS1) and judges (AS2) exist but have nothing worth measuring.

**Type.** backend / eval-content.

**What exists today.** `packages/eval/src/scenarios/*` — ~26 files, ~96 single-tool variants, each "seed → model calls one tool → DB row exists," ~18 of which make no LLM call at all (`routine-sessions`, `delegation`, `skill-autonomy`, `builtin-routines` — deterministic scheduler calls mislabeled as evals). `seeding.ts` provides realistic world builders the journeys reuse. AS1 provides the production-seam lane + matrix; AS2 provides the graded judges these scenarios are scored by.

**What's genuinely missing.** Multi-tool, cross-cutting journey scenarios with an explicit difficulty ladder (T1 obvious → T4 adversarial), and the retirement of the single-tool/no-LLM scenarios that the journeys subsume or that aren't evals at all.

**Depends on.** **AS1 and AS2** — journeys run on AS1's lane/matrix and are scored by AS2's graded judges; without both, a journey scenario cannot be expressed or meaningfully scored.

**Complexity.** L

**Acceptance criteria.**
- Five cross-cutting journey evals exist — **triage** (messy bet/inbox → decompose into the right tasks + routing), **execute-to-review** (pick up task → do work → submit review → handle verdict), **knowledge loop** (encounter a fact → write memory → a later session retrieves it), **handoff** (recognize "can't finish" → hand off to the right owner/human), **tool-choice-under-ambiguity** (right tool among plausible distractors) — each requiring the agent to choose and/or sequence more than one tool.
- Each journey is laddered into difficulty tiers from T1 (obvious — equivalent to the journey's AR integration anchor) through T4 (adversarial: distractor tools, ambiguous phrasing, near-miss alternatives), and the report shows a per-tier score so the capability frontier is visible.
- Running the suite across the AS1 matrix produces a per-journey × per-tier × per-harness score gradient; the gradient is sensitive — a deliberate degradation of a relevant prompt or tool description measurably lowers the affected journey's higher-tier score (demonstrating the dial works).
- The single-tool/no-LLM legacy scenarios are retired: the ~18 no-model "scenarios" are removed (or relocated to the AR test lane if they assert real correctness), and the per-tool scenarios subsumed by a journey are dropped; the remaining eval set is the journey suite.

**Validation scenarios.**
- Given the triage journey at T1, when run, then the agent decomposes the bet into the expected tasks and the score is high (the anchor passes); at T4 with distractor items mixed in, the score drops, exposing the frontier.
- Given a maintainer weakens the `submit_review` tool description, when the execute-to-review journey reruns, then its higher-tier score measurably falls (the dial responds), and recovers when the description is restored.
- Given the suite runs across builtin and a real CLI, when the report is read, then each journey shows distinct per-tier scores per harness, and no retired no-LLM scenario remains in the eval set.

**Plan calls.** Standard architecture pass, backend — no `/design`. Plan the journey definitions reusing `seeding.ts` world builders, the tier ladder per journey (what each of T1–T4 perturbs), the mapping from a journey's T1 to its AR integration anchor, and the retirement list (which legacy scenarios are removed vs relocated to AR). Keep the suite small and high-signal — five journeys, not fifty.

**Contracts / constraints.**
- Journeys run through AS1's production-seam lane and are scored by AS2's graded judges — no reintroduction of fabricated-state scoring.
- A journey's T1 stays equivalent to its AR integration anchor (continuity + sanity check).
- No expectation of 100% — the suite is a gradient, not a gate; do not wire it into `verify`/attestation.
- Retire, don't accumulate — the journey suite replaces the single-tool set rather than living alongside it.

**Out of scope.**
- The lane/matrix (AS1) and the judges (AS2).
- Auto-tuning loops, regression-tracking dashboards, or a scheduled eval cadence — future work once the gradient is trusted.
- Adding journeys beyond the initial five (deliberately bounded for first signal).

**Effort.** L (~3d)
