# BB5 — The built-in harness is gone

## Work package

**Outcome.** HyperIdle runs agents only through installed harnesses. The in-process agent loop, its LLM
client, and every branch in the run path that asks "is this the built-in one?" are gone, and every agent
that named it runs on a harness that exists.

**Why this matters.** Founder decision, 2026-08-27: the built-in harness cannot compete with the coding
CLIs on the most basic features, and maintaining a second-class agent loop taxes every change to the run
path. It is not merely unused weight — it is a **fork in the middle of session provisioning**. Five
branches there behave differently depending on whether the harness is in-process, including whether the
session gets its tools through MCP at all. Removing it collapses those branches into one path, which is
the real prize: every session, one way.

The cost of not doing it is paying that fork on every future change to provisioning, plus keeping alive a
model-calling path that duplicates what four installed CLIs already do better.

**What exists today.** Roughly 2,000 lines of production code and about 2,500 lines of tests that exist
only for it:

- `layers/agent-execution/harness-registry/src/builtin-harness-adapter.ts` (1,034 lines) — the in-process
  plan/execute/summarise loop.
- `layers/agent-execution/harness-registry/src/llm-client.ts` (818 lines) plus `llm-types.ts` — the raw
  provider client, with `callLlm` as its only public entry.
- `model-options.ts`'s request-fields half (`modelOptionRequestFields`); its `modelOptionArgv` half
  serves the CLI harnesses and stays.
- Five forks in `layers/agent-orchestration/run-orchestration/src/provisioner.ts` — the resolved-model
  guard (`:1105`), the in-process tool-registry injection (`:1366`), the MCP bridge gate (`:1481`), the
  plugin-MCP merge gate (`:1579`) and the tool-call interception gate (`:1719`).
- The `builtin` branch of `describeHarnessCapability`, `probeBuiltinGateway` in discovery, and the
  "built-in is always exempt from being disabled" carve-outs in `layers/core-api/src/routes/harnesses.ts`
  and `layers/core-ui/src/settings/harness-presentation.ts`.
- Setup and settings surfaces: the always-first built-in row in `SetupFlow`, `BuiltinDetail` in
  `SettingsHarnesses`.
- `"builtin"` as a member of `HarnessAdapterType` and of the supported-harness list, and
  `harness_type = 'builtin'` on stored agent rows.

**Three unrelated things share the word and all stay:** `builtin:` routines (`post-bet-retro`,
`portfolio-retro`, `knowledge-decay`, `knowledge-promotion`), the reserved `builtin` plugin id
(`BUILTIN_PLUGIN_ID`), and the `builtin` origin of a behaviour-config item. Most matches for the word in
this repository are one of those three. A sweep by name will delete live product behaviour.

**Missing delta.** The deletion itself, plus a migration for the rows that name it. Nothing new is built
here — BB3 and BB4 built the replacements.

**Depends on.**

- **BB3** — removing the built-in harness removes the only key-based onboarding path. Reversed, first run
  breaks on any machine without a signed-in CLI.
- **BB4** — the cassette seam and the two `callLlm`-mocking tests die with `llm-client`. Reversed, the
  tree goes green by losing coverage.

**Complexity.** L

**Engineering tier.** production — declared for this WP (per-plan convention). It touches stored agent
rows and the provisioning path every session takes.

**Pre-build.** **Architecture pass required**, on one question only: what the five provisioner branches
collapse into. Four of them currently read "not built-in ⇒ do the MCP thing", so with one path left they
are unconditional — but the fifth (the resolved-model guard) has no meaning without the built-in harness
and its removal must not quietly drop a check that a CLI session still needs. No design pass: the
surfaces that change are ones BB3 already reshaped.

**Constraints.**

- Full and destructive, per project rule: every caller and all data move in the same change. No
  compatibility shim, no alias, no dead adapter left registered.
- The three unrelated `builtin` nouns are untouched.
- No agent row is stranded or deleted; the row count is unchanged.
- Removing the resolved-model guard may not remove a check a CLI session still depends on; whatever
  remains true is stated, not inherited.

**Out of scope.** The credential and model-gateway code left behind (BB6) — its dead parts are only
knowable once this lands. Onboarding (BB3). Test and eval coverage (BB4).

## Acceptance criteria

1. No in-process agent loop and no direct model-calling client remain in the shipped tree; a session can
   only run through an installed harness.
2. Session provisioning has one path. No branch anywhere asks whether the harness is the built-in one.
3. The built-in harness is not offered, selectable, describable or discoverable anywhere in the product,
   and no harness is exempt from being unavailable or disabled.
4. Every stored agent that named the built-in harness names one that exists; no agent is stranded and the
   row count is unchanged.
5. The supported-harness vocabulary contains only installed harnesses, and the type system rejects the
   removed name.
6. `builtin:` routines, the reserved `builtin` plugin id, and the `builtin` behaviour-config origin are
   unchanged and still work.
7. Documentation made false by the removal is corrected.

## Validation scenarios

- Given a workspace with agents that ran on the built-in harness, when the database is upgraded, then
  every one of those agents runs on an installed harness, the row count is unchanged, and none is
  stranded.
- Given any agent and any installed harness, when a session runs, then it reaches its tools the same way
  every other session does.
- Given the product is browsed end to end, when harnesses are listed anywhere, then the built-in one
  appears nowhere.
- Given a team that uses `builtin:` routines, when a bet completes, then its retro happens as before.
- Given a plugin is installed, when its configuration is read, then the reserved `builtin` plugin id and
  the `builtin` behaviour-config origin behave exactly as before.
- Given someone writes the removed harness name where a harness is expected, when the checks run, then it
  is rejected.
