# AU44 — done

All nine batches merged, plus two follow-ups. The branch is `pipeline/AU44-consolidate`
([PR #507](https://github.com/ambrovia/hyperidle/pull/507)).

## Result

**The framework went from 21 packages to 7**: `api-contract`, `db`, `diagnostics`, `domain-model`,
`event-bus`, `harness-capability`, `harness-protocol`. The typecheck gate went from 55 packages to 39.

Fourteen packages dissolved into the code that actually used them. Three verdicted to stay shared did.
Three carry a `SPLIT` verdict and correctly survive as a slimmed core. One — `harness-capability` —
stays separate against its own audit's advice, because two other audits and the surviving adapter
contract show `core-ui` imports it in seven files and must not see `SessionConfig`.

## Where the audit lives now

Off this branch, as agreed. It is on branch **`pipeline/AU44`** under `.pipeline/work/AU20/destroy/`
(110 files) and reachable from the tag `au20-audit-evidence`. The branch is the copy to work from.
Track BA needs it for the FINISH and PLUGIN rows.

## Verification at close

| gate | result |
|---|---|
| check | 0 — 39 packages |
| lint | 0 |
| knip / knip:production | 0 / 0 |
| deps:check | 0 |
| test:full | 0 failures — 536 files, 5731 tests |
| test:integration:service | 0 failures — 288 files, 2333 tests |
| test:e2e:full | 34 failed / 275 passed |

The e2e number is better than `origin/main`, measured the same day on the same machine: main is
**62 failed / 247 passed**. Zero spec files fail here that do not also fail on main, and three that
fail on main pass here. Do not compare against the "19 failures" figure quoted earlier in this work —
it was stale, and re-running both sides is what showed the branch was ahead, not behind.

## What this pass changed that a reader should know

Behaviour changes, all deliberate: patching a non-active bet returns 400 rather than 500;
`WorkIntentInput.bakedRequest` is required; direct-message threads key on recipient kind so agent- and
user-kind threads stop colliding; the knowledge list is a plain recency list without frequency and
relevance pills; notification config is SMTP-only and `POST /test` returns 400 when unconfigured;
`GET /sessions` no longer takes `agentId`, `limit` or `offset`. Two schema migrations: `team_members`
folded into `teams` (0058), `propagation_log` dropped (0059).

**One audience widened.** `tool-handlers`, `review` and `settings` reached `tool-protocol` and now reach
`harness-protocol`. The audit said the two audiences were identical; they were identical only in having
no UI consumers.

**Deliberate duplication in three places.** Governance forbids service-to-service imports, so a symbol
two services need has no legal shared home once `domain-model` stops being one: `isAgentWorkIntentKind`,
the transition error classes, and the system-prompt template reader each exist twice, documented with
`@lore`. This is the pass's one honest regression against its own goal and is open for a founder call.

## Bugs this found

None were on the audit's list. They surfaced because removing code forces what remains to prove itself.

- `seedAnthropicKeyFromEnv` wrote the env key under `anthropic` while every resolver reads
  `anthropic_api_key` — a fresh boot with the env var set died at the first agent run.
- The `create_team` agent tool minted a second id matching no row; after the teams fold that is a
  foreign-key violation on every agent-initiated team creation. Now covered by an integration test.
- Four propagation calls sat outside their try/catch, so failures escaped as unhandled rejections.
- `mergeWithProjection` overwrote a real `scopeId` with null.
- The knowledge list read a wire shape the server had stopped sending, so its sort controls were inert.
- `node:crypto` reached the browser bundle through `domain-model`'s barrel and the app would not load.

## Two rows left for track BA, deliberately not touched

The bet-retro knowledge upsert and the facilitator roster seeding. Both were deleted during this pass
and both were restored: the audit describes them leaving core as part of the practice-communities
plugin, and that plugin does not exist yet. Deleting the core half early destroys the capability rather
than relocating it. **When a row's write-up names a plugin, trigger or routine as its replacement, it
belongs to track BA.**

## The traps this pass paid for, for whoever cleans up next

- **Ask git, not the filesystem.** A deleted package's directory usually survives holding untracked
  `dist/` and `tsbuildinfo`, so `Path.exists()` lies. This cost four separate detours, including a wrong
  "no dangling references" verdict of mine. Use `git ls-files`.
- **A dissolution must be removed from every registry**: the directory, root `tsconfig.json`
  `references`, `tsconfig.base.json` paths, `knip.json`, the typecheck gate list, `vitest.config.ts`
  projects, dependency manifests, `decided-rules.json`, `architecture.json`, and the lockfile. Missing the
  root tsconfig reference happened three times; its symptom is that unrelated packages' tests fail with
  "Tsconfig not found" and report **zero** failed tests.
- **Read the failed FILE count, not the failed test count.** A file that fails to load runs no tests.
- **Deleting packages drops the governance crossing counts below their floors**, which aborts the scan and
  takes the whole attack lane down — 80 of 92 "failures" from one number. `governance:floors` runs that
  same scan, so the floor blocks its own re-measurement. Zero every `min:`, run the tool, restore.
- **`verify` runs eight gates, not six.** `deps:check` and `mock-inventory:check` sat outside the set used
  for most of this pass; `deps:check` was red on the branch and green on main until it was fixed.
