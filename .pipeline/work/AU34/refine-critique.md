# AU34 — refine critique record

Three independent read-only evaluations of `requirements.md`, each re-measuring the live tree at
`0791c4fd` rather than reading the artifact's numbers. Recorded by the orchestrator; the reviewers do
not write.

## Round 1 — 6 blocking

1. `harness-protocol` reach omitted `agent-run-config`, a real production consumer — red build on a legal import.
2. Eleven package names granted reach with no measured consumer in either world.
3. `CredentialResolver` and `EventBusAdapter` ports left inside the `everyone` package, against the artifact's own stated rule.
4. Cut B (group by who reaches it) did not reproduce from its own definitions — `plan.md:28` requires two real cuts.
5. D7 reversed AU29 founder Ruling 12.3 by re-creating `db:util` as `db:query-text`.
6. Scope omitted the 31 consumer manifests that AC-4 is produced by — AC-4 unachievable as scoped.

Closed by deriving every reach list from measured consumers instead of authoring then justifying.
`EventBusAdapter` turned out to have zero importers repo-wide and became a deletion rather than a
relocation.

## Round 2 — 2 blocking, one root cause

1. The derivation ran per **module**, so a symbol relocated across a package boundary contributed zero
   consumers to the audit and the audit could not see the error. `ReturnEnforcementChannel` → the
   `harness-capability` reach omitted `run-orchestration`.
2. Narrowing the surfaces flips existing production `export … from` sites into `error` severity —
   `scripts/rules/no-laundered-re-exports.ts` passes today for exactly one reason, stated in its own
   `@lore`: re-exporting `framework/shared` launders nothing *because its reach is `everyone`*. AU34
   removes that reason.

Closed by rebuilding the derivation with the exported **name** as the unit (640 names → destination),
which also found a fifth flipping re-export site the review missed. All five resolved as "stop
re-exporting"; no audience widened.

## Round 3 — 4 blocking, standing

Round 3 independently reproduced, to the number: 640 exported names with zero declared twice; 95
modules placed exactly once (88 + 1 deleted + 6 barrels); the 248/231 dead-export census; the
382+336+8=726 import-site decomposition; 30 consumer packages, 31 manifests, 28 tsconfigs, 16 eslint
refs; 13 `export … from` bindings with the 3-legal/5-flipping split; `knip:production` exit 0; the
deletion list safe (all ten names zero-referenced outside the package in both worlds); and **all 18
production reach lists exactly, including the `run-orchestration` entry only a symbol-level pass
finds**. No founder ruling is reversed. The consumer-side derivation defect from rounds 1–2 is
genuinely fixed.

Standing blockers:

**B1 — the audience table forbids nine required framework→framework imports.** The derivation
population is fixed at files *outside* `framework/shared` (`requirements.md:47-50`), so the imports
*inside* it were never in the population — and every one crossing a §4 destination boundary becomes a
cross-package production crossing on the day of the split. Nine such edges, e.g. `event-bus` →
`diagnostics` (`event-bus.ts:8`), `harness-protocol` → `event-bus` (`harness-port.ts:46`),
`tool-protocol` → `harness-protocol` (`tool.ts:28`), `conversation-parts` → `harness-capability`
(`part.ts:687`). `inAudience` matches only role or package name; no list contains a `framework` role or
any new package name, so each is `forbidden` with the same `reach-declared-surfaces-only` failure the
symbol-level pass exists to prevent. Each also produces a second forbidden `manifest` crossing, so the
new packages cannot even declare each other as dependencies.

**No precedent exists.** `governance/architecture.json` holds 10 surfaces and **not one grants the
`framework` role**. Today `framework/shared` has no framework-to-framework edge because it is one
package; the split creates the category. This is an audience decision, not bookkeeping.

**B2 — D1's cycle break is stated but not executable.** Moving `ReturnEnforcementChannel` alone does not
remove the descriptor→adapter edge: `harness-capability-descriptor.ts:3` imports `HarnessCapabilities`
(which stays in `harness-protocol`) and `:111` reads `HarnessCapabilities["returnEnforcement"]`. The
edge-removing act — rewriting `:111` to name `ReturnEnforcementChannel` directly — is nowhere stated,
and §6.1 is presented as complete. A builder following it produces a cyclic graph and a red `check`.

**B3 — `domain-model → credential-access` unresolved.** `CredentialResolver` is consumed at three sites
in `model-gateway.ts`, two of them **non-exported** (`resolveProvider` `:219-222`, `resolveModelTier`
`:295-298`). The unit is the exported name, so the table has no cell for them; if they stay,
`domain-model` imports `credential-access` — forbidden, and it inverts the audience order D4 declares
binding. Also `:151` says `UnsupportedAgentProviderError` stays and is thrown internally while `:675`
sends it to `credential-access`; one is wrong.

**B4 — AC-2 / validation scenario 4 not delivered.** `plan.md:62` states the failure as a property of
*adding* a package with no `reach` entry. The §7.1 mechanism only fires when something *imports* the
package, and no rule in `scripts/rules/` enumerates framework packages and requires a surface. An
undeclared package with no importer emits no crossing at all.

Non-blocking (11, recorded in full in the round-3 return): the "only `everyone` package" claim is false
— `framework/db`, `db:client` and `db:row-type` keep theirs, so the file holds **four** after AU34;
§4.5's role-grant test is applied on wrong input counts (`presentation-format → service` is 0 of 19, not
1 of ~20; `application` is 1 of 3, not 1 of 2) though its verdicts still follow; six same-package
development files break on the `adapter-pool.ts:29` re-export removal; 16 of the 45 dynamic imports are
genuine runtime `await import` calls, not import-type positions; 15 non-`.ts` fixture files must move
with the tests; two §6.1 edge rewrites are specified in a post-split form but sequenced pre-split; and
the naming test that rejected `framework/like-escape` is not applied to `framework/cron` or
`framework/toon-codec`.

## Orchestrator note

The three-attempt retry cap for refinement is reached. Rounds did not repeat a defect — each closed its
predecessor's class and exposed a deeper one, and the artifact's measured core now reproduces
independently. B1 is a decision the maintainer owns (it re-opens the role-grant test and lands in a
frozen, founder-owned file); B2–B4 are producer-level defects a further pass can close.
