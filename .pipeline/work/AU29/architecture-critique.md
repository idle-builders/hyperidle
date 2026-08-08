# AU29 — Architecture critique

Reviewed `.pipeline/work/AU29/architecture.md` + `feasibility.md` against `plan.md` (authority) and
`requirements.md` (§4 lattice binding), grounded in the live tree at `6a56a570` (code-identical to
`origin/main` @ `bbe82e9a` — verified: the branch diff touches only `.pipeline/**`). Both probes were
**re-executed by this reviewer**, not taken on faith. Verdict at the bottom.

## Verified — the six load-bearing claims

**1. `agentRunConfig` resolution — HOLDS.** Re-ran
`probes/run-config-equivalence.ts`: `VERDICT: PASS — row sets identical`. The probe's
`upsertRunConfig` is byte-identical to `factory-bootstrap.ts:33-55` (compared line-by-line), and the
three patch shapes are the real ones (`factory-bootstrap.ts:138-143`, `:172-177`, `:218`; upgrade
path `:29-31` doc). `writeAgentRunConfig` (`agent-run-config-store.ts:121-153`) takes
`WriteExecutor` (union incl. `HyperIdleDb`, `write-executor.ts:29`); its patch-keys-only update and
`DEFAULT_AGENT_RUN_CONFIG` insert path reproduce the bootstrap rows including the
`modelTierPreference` nuance. DI-detector claim verified in source: `crossing-detectors.ts:940-958`
gates on `origins.get(identifier)` — only *imported* identifiers record a `di` crossing; `handle.db`
/ local `db` / a locally-awaited `agents` record nothing. The store is already baselined
(`service → db:table (unowned)`: `agent-run-config-store.ts` import 1 / read 2 / write 1 — confirmed
in `baseline.json`), and the face file never names the table symbol, so no count can rise. The
plan-amendment fallback is genuinely not needed.

**2. One-source-of-truth shape — HOLDS against all four §4 facts simultaneously.**
Clause-checked in `governance-model.ts`: `store-owner-only` (`:206-229`) forbids applications on any
table and everyone on unowned tables, tooling exempt (`store-tooling-measures-everything`,
`:209-213`, Ruling 7); `users`/`knowledgeItems`/`knowledgeAppProjection` owned by `users`/`knowledge`
(`table-owners.json`), `agentRunConfig` unowned — so faces-through-owners + reuse of the baselined
writer is the only legal production shape, and the CLIs' legality comes from the tooling role
(`compositionRootRoles` includes `tooling` and `application`, `architecture.json` containment;
clause 9 `reach-across-only-from-a-composition-root`, `governance-model.ts:330-337`). FK ordering
claim verified: `schema.ts:110-113`, `agent_run_config.agentUserId` references `users.id` — core
state before run-config defaults is load-bearing, as stated. The no-edit-log constraint is real:
`knowledge-repository.ts:292` writes `knowledgeEditLog` on create, so the dedicated factory writer
is required, not optional. `insertUser` (`user-store.ts:143`) is a plain insert — the
`insertUserIfAbsent` need is real (relaunch would throw). `main.ts:449-458` confirmed as the only
production bootstrap invoker; `remote-server/src/index.ts` runs no bootstrap.

**3. `toolsForRole` dissolution — census now complete and correct.** Three call sites verified:
`tool-provider-bindings.ts:65` (imports `toolsForRoleShared` from `@hyperidle/shared` at `:29` —
the baselined `framework → layer [di]` site), `harness-registry/src/tool-registry.ts:70` (filters a
*parameter*), `tool-handlers/src/tool-definitions.ts:1646` (import at `:47`, filters a local) — the
third caller requirements missed. `mcp-bridge.ts:141` is a comment (real path:
`layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts`). All other `toolsForRole` matches
are the *port property* on `run-orchestration` deps and core-api's own wrapper (`:64`), both
untouched by design. Each inline uses only in-package values — no new crossing.

**4. knip risk analysis — correct, requirements corrected rightly.** `PRACTICE_COMMUNITIES`:
repo-wide grep confirms its ONLY use is typing `COMMUNITY_DISPLAY_NAMES` inside
`seed-fixtures.ts:15-23`; `demo-fixture.ts:18-21` imports drizzle/connection/schema/templates — NOT
`seed-fixtures` (requirements §3.5(3) was wrong; architecture's correction verified).
`SYSTEM_PROMPT_TEMPLATE_FILES`' post-move consumer is genuine, not contrived:
`factory-bootstrap.ts:191` iterates exactly that map today; the face inherits the act.
`readSystemPromptTemplateForRole ≡ readSystemPromptTemplate(resolve(cwd,"docs"), map[role])`
verified at `system-prompt-templates.ts:80-85`. `agents.ts:32` imports only `ForRole` (header
note 2 correct). `escapeLikePattern`: exactly 7 production consumers (4 service + 3 route files).
`profiles`: only `create-server.ts` (`:77` import) + `setup-cli.ts:7` (`DeploymentProfile` +
`resolveProfile`) — the narrow barrel shape is sound.

**5. Registry deletions and instruments — counts exact; authorization correctly routed.**
`decided-rules.json`: exactly 6 rows name `db:util`/`db:bootstrap` (3+3, scanned), `totals.rows`
124; model-test literals live at `governance-model.test.ts:167-219` (124 ×3, and the checked
counters that make 248 verdicts). Attack anchors confirmed: `governance-attacks.ts` ~`:428-431`
(`reexport-narrow-surface`, `escapeLikePattern`), ~`:456` (`reexport-import-control`, same symbol),
`:605` (`undeclared-db-surface`, `readSystemPromptTemplate from "@hyperidle/db"`); the four attack
properties fail loudly on a stale anchor. On the `db:bootstrap` deletion: it is **not mechanically
forced** — `validateArchitecture` (`governance-registry.ts`) has no zero-module-surface check and no
moduleSurface-existence check, so a zero-module surface would lint green. It is an end-state
*decision*, authorized by requirements §5 and correctly surfaced at the human gate (§7.1) rather
than slipped in — the right handling; only the "zero-match rot the design refuses" phrasing
overstates the forcing. Row deletions follow surface deletions; no surviving verdict changes.
`tools/*` → `tooling` glob confirmed (`architecture.json` roles), README:127-129 confirms
"workspaces entry, nothing else". Baseline §4.2 verified site-exact against `baseline.json`: 10
groups, 31 sites; the AU32 development group's four files (`foreign-keys`, `migration`, `schema`,
`session-requests` integration tests) are disjoint from every file §2.6 relocates.

**6. AC 7 evidence harness — real, and re-runnable.** Re-ran
`first-boot-capture.ts --bootstrap` fresh: the dump **diffed empty against the committed
`first-boot-control.json`**. The control contains real data (7 users, 1+1 knowledge rows, 6
run-config rows; 5 facilitators carry the 1661-char template, `seed-agent-cos` carries null), so a
vacuously-empty comparison is excluded; the CLI-path leg executed the real `npm run setup` end to
end at architecture time. Timestamp normalisation (`createdAt`/`updatedAt` → `"<ts>"`) masks only
what can never be byte-stable; a null-vs-set difference would still surface. The harness does not
prove itself: control and branch dumps are produced by executing different code against clean
databases and compared column-for-column.

**Task ordering / scope** — order A → D → E → F with B, C parallel is real: B and C touch disjoint
files from A; D's dependencies on A (shared homes for `COMMUNITY_DISPLAY_NAMES`, templates,
`resolveProfile`) are genuine; E's mock re-derivation correctly waits for the final barrel.
`framework/db` already depends on `@hyperidle/shared` (`factory-bootstrap.ts:2`), so the interim
repoints in A are legal edges that already exist. Nothing reaches into AU30 (no owner assignment,
no rerouting of service-owned writes beyond what AC 3 itself requires), AU32 (the four dev-test
files untouched), or the shared-split successor. No transitional re-export, alias, or migration
shape anywhere — Ruling 12 holds; `no-laundered-re-exports` stays armed symbol-agnostically.

---

## BLOCKING

**B1 — The plan's regression scenario 3 has no delivering mechanism; the claimed "unplaced-symbol
error path" does not exist.**
`architecture.md` §3 (AC-map row for AC 2, and the closing paragraph: "covered by the existing
unplaced-symbol error path (`db:unknown` reach `[]`)") asserts that plan validation scenario 3 —
*"Given a developer adds a new export to `framework/db` that performs no database access, when
`npm run lint` runs, then the build fails naming that symbol"* — is covered by existing mechanism.
Verified false:

- The unplaced-symbol report is a **non-fatal NOTE**: `scripts/governance-lint.ts:282-284` prints it
  to stderr *after* findings are collected; it is not a `Finding`, and the PASS/FAIL decision
  (`hasErrors(result.findings)`, `:295-299`) never sees it. The live tree proves it: today's run
  PASSes with 4 symbols in that NOTE.
- The `db:unknown` reach-`[]` rule fires only on an **import crossing**. The scenario adds an
  export; with no consumer there is no crossing, no finding, and the build passes. knip (which would
  flag the dead export) is not part of `npm run lint`.

So after AU29 ships exactly as architected, re-running the plan's own validation scenario fails:
adding a non-database export to `framework/db` lints green. The same false phrase appears in
requirements §8 — the slip originates upstream — but the architecture re-asserted it as the
verification mechanism instead of fact-auditing it, and the plan's scenario is an approved outcome
with no owner in the task tree. Impact: AC-level regression guard unproven; the "no new mechanism"
claim (§3, §9) rests on a mechanism that does not exist. The resolution is the planner's — the
obvious end-state-consistent shape is escalating the unplaced-symbol NOTE to an error once the list
is empty (post-AU29 there is no legitimate unplaced symbol, so this parks no debt and needs no
baseline), but choosing it, or renegotiating the scenario's letter at the human gate, is not the
reviewer's call.
Authority: plan.md validation scenario 3 + AC 2/AC 5 regression language; skill bar "a load-bearing
factual claim is false". Evidence: `scripts/governance-lint.ts:282-299`; live lint PASS with 4
unplaced symbols (`feasibility.md` §1, reproduced here).

## NON-BLOCKING DEFECTS

**D1 — `system-prompt-template-resolution.test.ts` missing from the move census.**
`framework/db/src/__tests__/system-prompt-template-resolution.test.ts` imports
`../system-prompt-templates.js` **relatively** (its import block, lines 9-14). §2.3 moves
`agent-scaffold.test.ts` and the X3 templates half, but not this file — task A as written leaves a
dangling relative import and a red `check`. Mechanical (the green gate forces discovery), but it is
precisely the derive-the-real-consumers class the header corrections fixed elsewhere. It should move
to `framework/shared/src/__tests__/` with its module.

**D2 — Interim export state of `readSystemPromptTemplate` unstated.**
§2.3 declares it "module-internal (un-exported)" as an end-state contract, but between tasks A and D
`factory-bootstrap.ts:192` and `demo-fixture.ts` (still in `framework/db`) call it and must import it
from the `@hyperidle/shared` **barrel** (cross-package relative imports are forbidden —
`.claude/rules/typescript.md`). The un-export can only land in task D. Task A's "repoint the interim
imports" implies this, but §2.3's table and task A are in tension for the interim window; one
sentence ("exported until D deletes the last db-side caller") removes a trap that would otherwise
break A's green gate.

**D3 — §2.5.3 omits the null-template skip.**
Today's backfill writes a prompt only when `content !== null` (`factory-bootstrap.ts:193`); a
missing docs file is silently skipped, preserving any existing prompt. §2.5.3 step 2 as literally
written ("for each (role, filename) read … for each matching entry, `writeAgentRunConfig(db, id,
{ systemPrompt })`") would write `systemPrompt: null` on a missing file — a divergence the AC 7
harness cannot catch (all template files exist in-repo) and that surfaces only on an upgrade with a
missing/renamed docs file. The "verbatim in content" umbrella arguably covers it; state the guard
explicitly so the builder cannot drop it.

## FOLLOW-UP / NOTES

- **N1** — `governance-model.test.ts:174-178` also carries the four verdict-split literals; the six
  row deletions move them to 65/53 (production allowed/forbidden) and 110/8
  (development allowed/forbidden: 114−4, 10−2), and `decided-rules.json`'s own `totals`
  production/development/differ breakdowns move with them. The failing test names each, so the
  builder cannot miss it — but §4.4's "124 → 118, 248 → 236" is not the complete literal set.
- **N2** — `eslint.config.ts:566,611` (the roster-composition restricted-import rule message) names
  `framework/db/src/agent-scaffold.ts` as the legitimate home; after the move the message points at
  a dead path. §8's stale-path sweep is scoped to `docs/` — widen the `rg` to the repo root or add
  this file. Functionally inert (message text only).
- **N3** — `layers/agent-orchestration/package.json` does not yet declare
  `@hyperidle/agent-run-config`; the §2.5.3 face needs the dep added (legal,
  `reach-your-own-contents`). Same class: desktop's two new layer deps are named; this one is not.
- **N4** — The desktop-path AC 7 leg executes the two face calls via the capture script rather than
  launching Electron; `main.ts:449-458` being the only bootstrap call makes the statements
  identical, and the manual smoke stays available — acceptable, but the PR evidence should say
  explicitly that Electron itself was not launched for the diff.
- **N5** — Branch verification requires editing the capture script's marked switch, so the script
  that produces the branch dumps is not byte-identical to the one that produced the control; the
  shared dump/normalise logic is what carries the comparison. Fine as designed — reviewers should
  diff the script edit alongside the dumps.
- **N6** — AF17-team-routines and X3-agents (core-api tests) reference the templates module only in
  comments — confirmed non-consumers; no repoint needed. `@hyperidle/db/testing` subpath exists
  (`framework/db/package.json` exports) — task D's test imports resolve.

---

## Verdict

**FAIL — 1 blocking finding (B1).** Everything else in this architecture checked out under
independent re-verification: both probes reproduce, the caller censuses are complete (minus D1's
test file), every claimed legality clause reads as claimed in `governance-model.ts`, the baseline
arithmetic is site-exact, the AU30/AU32 boundaries hold, and Ruling 12 is respected throughout. B1
needs the planner: either name the (small) mechanism that makes plan validation scenario 3 true, or
take its reinterpretation to the human gate — the current text claims coverage by a mechanism that
does not exist.
