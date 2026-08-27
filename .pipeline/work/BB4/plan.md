# BB4 — Every model call goes through a real harness session

## Work package

**Outcome.** No test anywhere fakes a model call. The browser lane drives a real installed CLI through
real session provisioning, the tests that today script an LLM response prove the same behaviour through
a real harness, and evals run per harness so one CLI's results can be compared against another's.

**Why this matters.** Two reasons, and the second is the one that bites. First, founder rule: every model
call goes through session provisioning, so a test that intercepts below that line is testing a path the
product does not have. Second, the coverage that currently rides on the built-in harness disappears when
it does — and if that happens in the same change that deletes it, the tree stays green by having less
coverage, which is the failure mode nobody notices. Building the real coverage first makes the deletion a
subtraction of code rather than of confidence.

There is a live example of exactly this rot: `tools/eval/src/provision-harness.ts:149` registers the
eval's "external" harness as a `DirectHarnessAdapter` typed `"builtin"` — a direct single-call LLM
adapter. Its own comment claims it uses the real `claude` CLI when available; the code never does. **Evals
have never run through a real CLI**, and the eval CLI takes `--model`, not `--harness`, so no result has
ever been attributable to a harness.

**What exists today.**

- **The cassette seam.** `layers/agent-execution/harness-registry/src/__testing__/llm-cassette.ts`
  installs an interceptor on `callLlm` via `setLlmInterceptor`, driven by `LLM_CASSETTE_MODE`. The AH6
  Playwright lane (`playwright.ah6.config.ts`, `__e2e__/AH6-assistant-interaction.spec.ts`, committed
  cassettes) replays it for key-free, offline, deterministic browser tests. It is, by construction, a
  `callLlm` mock.
- **Two unit tests that script the model directly.** `layers/core-api/src/__tests__/af7-session-isolation.test.ts`
  and `af7-handoff-revokes-tools.test.ts` both `vi.mock` the `llm-client` module and drive
  `callLlm` responses to prove session isolation and that a handoff revokes tools. Real behaviour,
  proven through a fake.
- **The real-harness lane already exists and works.** `requireHarness(<name>)` hard-fails rather than
  skipping; `cli-adapter-real-binary.integration.test.ts` and
  `assistant-reply-live-harness.integration.test.ts` already drive real binaries, the latter across all
  five harnesses with `[harness:<name>]` describe tags. This WP extends a working pattern rather than
  inventing one. The lane is local-only by design (`npm run test:integration:harness`, no CI job).
- **Evals** have scenarios, judges and rubrics that are harness-agnostic; only the adapter registration
  and the CLI surface are built around a single in-process model call.

**Missing delta.** A browser lane that drives a real CLI instead of replaying cassettes; the two af7
proofs re-established through real session provisioning; a per-harness eval selection and a comparable
result shape; and the deletion of every interception seam once nothing needs it.

**Depends on.** BB2 — a real-harness lane has to pin a model and assert the session ran on it. Without
BB2's readback the lane can only prove that *a* turn happened, which is how the current defect went
unnoticed.

**Complexity.** L

**Engineering tier.** production — declared for this WP (per-plan convention). This is the evidence floor
the rest of the track's claims rest on.

**Pre-build.** Not required for the test work. The eval side needs an explicit decision on cost and
determinism captured in the technical plan — a browser lane and an eval sweep that spawn real CLIs cost
real money and real time, and which lanes run when is a scheduling choice, not a design one.

**Constraints.**

- No stubbed, scripted or hand-rolled harness adapter stands in for a real one. A missing harness fails
  the run; it never skips to green.
- Every model call in every lane goes through session provisioning. No interception below it survives,
  under any environment flag.
- Harness-facing coverage is equal across supported harnesses. A subset is a false green.
- Models come from live discovery (BB1), not a hand-written constant.
- Browser lanes stay local-only, consistent with the existing rule that expensive live-LLM lanes never
  become CI jobs.

**Out of scope.** Deleting the built-in harness itself (BB5) — this WP removes the *test* paths that fake
a model, which includes the cassette machinery, but the production adapter is BB5's. Rewriting what the
evals measure. Adding new eval scenarios.

## Acceptance criteria

1. No test, fixture or lane in the repository intercepts, mocks or replays a model call; every model call
   a test causes goes through session provisioning to a real harness.
2. The browser lane that today replays cassettes proves the same user-visible behaviour driving a real
   installed CLI.
3. Session isolation and handoff-revokes-tools are proven through real harness sessions.
4. An eval run names the harness it ran on, and the same scenario can be run on each supported harness
   and the results compared.
5. No eval path registers a direct model-call adapter in place of a harness.
6. A harness that is absent fails the run naming it; nothing skips.
7. Harness-facing coverage includes every supported harness, with no carve-out.

## Validation scenarios

- Given the browser lane runs with a real CLI installed and signed in, when the assistant is used in the
  browser, then the same behaviours the cassette lane asserted are observed against a real session.
- Given two agents in separate sessions, when both run on a real harness, then neither sees the other's
  context.
- Given a session that hands off, when it runs on a real harness, then the tools revoked by the handoff
  are no longer callable.
- Given an eval scenario and a chosen harness, when the eval runs, then the result names that harness and
  the model it ran on.
- Given the same scenario run on two harnesses, when both complete, then their results are comparable
  side by side.
- Given a supported harness is not installed, when the harness lane runs, then it fails naming that
  harness rather than passing.
- Given someone adds a test that intercepts a model call, when the checks run, then it is rejected.
