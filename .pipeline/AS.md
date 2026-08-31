# Track AS: Eval — the Tuning Loop

**What this track is (founder, 2026-06-28).** An **eval is a tuning tool, not test coverage.** A test asks "does the obvious thing work?" and answers pass/fail; an eval asks "how *well* does the agent handle progressively harder versions of a real task?" and answers with a graded score you watch move as you change a prompt, a tool definition, a knowledge injection, or a model/harness. **100% on an eval means the eval is too easy** — the signal is the gradient, not a green check.

**Constraint.** Evals are **ungated, never in attestation, cost-bearing, on-demand**. They run locally and carry no green/red gate — deliberately distinct from Track AR's enforced correctness floor. **AR = enforced floor (does the obvious thing work), AS = measured ceiling (how well does it handle hard things)**, on one set of rails.

**Constraint.** Ground every claim in the real orchestrator and the real adapters. Never a hand-rolled rig that bypasses production — that is the failure mode AR2 exists to kill. Reuse AR2's capture-before-teardown seam; do not rebuild a bespoke observation rig.

**Why the current rig doesn't count.** `tools/eval` is wired into nothing (no script, CI or verify runs the runner), hard-exits without an API key, and its default model id is a forward-dated placeholder that may not route. It registers only the builtin in-process adapter and omits the MCP bridge, and its one "external" branch is gated on `provider === "anthropic"` while the default is OpenRouter — so it always falls back to a one-shot fixture with no tool loop and no subprocess. Each scenario is a single-tool competency check scored mostly by deterministic DB existence checks: under the eval-vs-test framing that is an integration test, not a tuning dial.

**Unblocked.** The track was parked behind AR2, which has shipped (PR #382). Note the paths in the legacy spec point at `packages/eval`; the rig now lives at `tools/eval`.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AS1 | A runnable eval lane on the production harness seam: drive a real agent through the production `provisionSession()` path, resolve a real cheap model automatically, target the builtin gateway or a real CLI harness, and score actual produced output via AR2's capture-before-teardown seam | infra/backend | L | AR2 (shipped) | unbuilt — carried from the legacy track file. Today an eval run measures nothing a user experiences: it never spawns claude/codex/opencode and is wired into no runnable path, so there is no working dial to turn when changing a prompt or a tool. Riding AR2's seam makes the lane runnable by construction. |
| AS2 | Graded judges that read the agent's actual tool-calls | backend | M | AS1 | unbuilt — carried from the legacy track file. `judgeSendMessageCalled` and `judgeSubmitReviewCalled` both pass on *any* message row with the agent's sender id — they cannot tell the two tools apart, so a wrong-tool call scores as success. `judgeLlmQuality` `JSON.parse`s raw model text with no fence handling and collapses any judge failure to `0.0`, indistinguishable from a real zero. A gradient built on these is noise. |
| AS3 | The per-journey, tiered eval suite: ~5 cross-cutting journeys (triage, execute-to-review, knowledge loop, handoff, tool-choice-under-ambiguity), each laddered from an obvious tier-1 up through adversarial tier-4 | backend/eval-content | L | AS1, AS2 | unbuilt — carried from the legacy track file. Per-tool single-step scenarios plateau the moment each tool works — nowhere for the score to move. Real agent value lives in choosing and sequencing tools under ambiguity, which is where a prompt or tool-description change shows up. Retires the current single-tool scenario set, including the ~18 that make no model call. |

## Dependency graph

- `AS1` → `AR2` (track AR, shipped): reuses AR2's production-`provisionSession` real-run and capture-before-teardown seam. Building on a seam that does not exist would mean rebuilding the bespoke rig AR2 deleted.
- `AS2` → `AS1`: the judges read the run-output shape (real tool-call events plus captured artifacts) that AS1 defines.
- `AS3` → `AS1`, `AS2`: journeys run on AS1's lane and matrix and are scored by AS2's graded judges; without both, a journey scenario cannot be expressed or meaningfully scored.
- The integration scenario for a journey IS that journey's eval tier-1 — the sanity anchor. If eval T1 fails while the AR integration test passes, the eval harness is miswired, not the agent.
