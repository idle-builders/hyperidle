# AU31 — Refine critique

Artifact: `.pipeline/work/AU31/requirements.md` (commit `bbde6204`), evaluated against
`.pipeline/work/AU31/plan.md`, `.pipeline/AU.md` (AU31 row + graph), `governance/README.md`,
`governance/architecture.json`, `governance/decided-rules.json`, `governance/baseline.json`,
`.pipeline/work/AU28/founder-rulings.md`, `.pipeline/work/AU26/requirements.md`, and the live tree
at base `bbe82e9a`. Every load-bearing citation below was independently re-traced against the tree,
not taken from the artifact.

## Verdict: PASS — 0 blocking findings

The artifact settles exactly the two nouns the plan required (`plan.md:22`), earns the
`session-requests` verdict instead of asserting it, keeps the mechanism-per-service choice in
`/architecture`'s hands (`requirements.md:59`, `:189`), restates every hard constraint unsoftened
(`requirements.md:194-203`), and stays inside scope in both directions. Five non-blocking defects
and three notes follow; none contradicts a plan AC, expands scope, or leaves a load-bearing
ambiguity that prevents an architecture decision.

---

## BLOCKING

None.

---

## NON-BLOCKING DEFECTS

### D1 — §2.2 evidence table misclassifies the idempotency gate as "rendering"

`requirements.md:42` classifies the `findSessionRequest` sites (`app.ts:11`,
`sessions-routes.ts:3`) as "Rendering for a human — not a use under AU26 §2". Verified against the
code: `layers/core-api/src/routes/sessions-routes.ts:146-163` uses `findSessionRequest` to **gate a
409** (idempotency-key reuse) and to decide whether to create the request at all — under AU26's own
evidence bar (`.pipeline/work/AU26/requirements.md:42`: "gates an operation" is a real use) that
site is a gate, not a render. The second use at `sessions-routes.ts:227` is genuinely a render
(status poll for the response projection). The table also omits `listPendingIntentsByKind`
(`layers/core-api/src/services/assistant-turn-coherence-trigger.ts:50`, used at `:62` to gate the
coherence enqueue), a read symbol its "exhaustively classified" claim (`requirements.md:37`) must
cover.

**Why not blocking:** the verdict does not rest on this row. Both mis-filed sites are core probing
**its own submitted requests** — the same "request about a request" category the table's row 3
already establishes (`requirements.md:43`) — and grounds 2–4 of §2.3 (`requirements.md:53-55`),
which I verified independently (orchestration's poller wiring at
`layers/core-api/src/services/run-orchestration-composition.ts:234-246`; the in-process abort
registry at `layers/agent-orchestration/session-requests/src/session-run-registry.ts:13-28`; AU21
Decision L's zero-read doctrine per `.pipeline/AU.md:20`), are each independently sufficient.
**Consequence for architecture:** §2.5's op 4 ("read a request's status", `requirements.md:70`)
must be read to include the pending-intents-by-kind query and the idempotency probe, or a mechanism
sized to single-request status reads will break `sessions-routes.ts:146` and
`assistant-turn-coherence-trigger.ts:62`.

### D2 — §2.1 understates session-requests' table ownership

`requirements.md:29` says the service "owns three tables … and additionally writes
`agentLifecycleInbox` and `triggerResolutionHistory`", citing `governance/table-owners.json`. That
registry in fact assigns **all five** tables to `session-requests` (verified:
`agentWorkIntents`, `agentSessionRequests`, `explicitSessionStarts`, `agentLifecycleInbox`,
`triggerResolutionHistory` all map to `session-requests`). The slip *strengthens* the verdict it
supports (more owned machinery, not less), but a downstream reader taking §2.1 literally would
mis-model two writes as foreign. Fix in passing at architecture; no scope effect.

### D3 — §3.2's machine-decidability claim is true for clauses 1–2 only; clause 3 is not a machine rule

`requirements.md:90` claims the face concept is "decidable from the role registry plus one AST
predicate — no allowlist, no path list, no human adjudication per case". Probed adversarially:

- **Clause 1 (reach)** — decidable. Verified: the census already distinguishes
  `application → layer` from `application → service` (`governance/decided-rules.json` carries both
  targets with separate instance counts), and `compositionRootRoles` is registry data
  (`governance/architecture.json:31`).
- **Clause 2 (provenance)** — decidable **for the shapes that exist today**. Verified against
  `layers/core-api/src/index.ts:14-15`: the laundering the clause targets is literally
  `export { list as listKnowledge } from "@hyperidle/knowledge"` — an `ExportDeclaration` with a
  service specifier, exactly the AST shape `requirements.md:85` names. Manifest-path resolution is
  equally mechanical (all 16 entries in `layers/core-api/package.json` resolve inside
  `layers/core-api/src`; none crosses into a service directory today).
- **Clause 3 (content)** — **not** machine-decidable. "What a composition root needs to boot,
  mount, operate and dispose the layer" (`requirements.md:86`) cannot be decided from an import
  specifier or the role registry; it is a design judgement enforced by the founder gate + knip,
  not by governance-lint. Two concrete consequences the artifact does not state:
  1. **The clause-2 predicate does not catch a wrapper-launder.** `import { list } from
     "@hyperidle/knowledge"; export const listKnowledge = (db) => list(db);` in a face module is
     declared in the layer's own `src/`, satisfies clause 2's predicate as spelled, and reproduces
     the vacuous state §3.1.2 says the clause exists to prevent. The mandatory attack cases
     (`governance/README.md:110-125`) that §8.4 hands to architecture **must include this case**,
     or the rule ships with the hole the artifact itself identified in the re-export spelling.
  2. **Clauses 1–2 alone leave today's 12 `application → layer [import]` instances on the allowed
     side.** All 12 (verified: `applications/remote-server/src/create-server.ts:33,41-65`) resolve
     into `layers/core-api/src/*` or the `@hyperidle/agent-orchestration` root — the layer's own
     modules, so provenance passes at package grain. The forbidding force against
     `@hyperidle/core-api/services/run-orchestration-composition` et al. comes from clause 3 via
     architecture's per-file relocation calls (`requirements.md:147`, `:184`), not from the AST
     predicate. §3.4's "face = allowed, insides = forbidden" split is therefore a statement about
     the **end state after** §5.3's moves, not something the mechanical rule does to the current 12.

**Why not blocking:** the crossing-side rule — the part the plan's ACs and validation scenarios
actually test (`plan.md:49`, `:57-61`) — is genuinely decidable, and the artifact explicitly routes
the rule text, the `decided-rules.json` edits, and the attack cases to architecture under the
mandatory founder gate (`requirements.md:100`, `:185`), which is the correct handling per
`governance/README.md:138-141`. But architecture should not inherit §3.2's sentence at face value.

### D4 — §3.4 "precisely … deep imports" is imprecise about 2 of the 12 instances

`requirements.md:100`: the 12 `application → layer [import]` instances "are precisely
`create-server.ts`'s deep imports into core-api's composition modules". Verified: 12 instances, all
in `create-server.ts` — but `create-server.ts:33` (`bootAgentOrchestration` from the
`@hyperidle/agent-orchestration` **root**) and `:42` (`bootCoreApi` from `/boot`) are face-shaped
boot imports, the very pattern §3.1.3 holds up as the existence proof. 10 of 12 are composition
deep imports, not 12 of 12. Harmless to the conclusion (a founder-gated vocabulary change is needed
either way) but the count a founder ratifies from should be exact.

### D5 — §4's "no Hono construction anywhere in the layer" is false at service grain

`requirements.md:114` asserts agent-execution "hosts no app (no Hono construction anywhere in the
layer; its whole `src/` is the barrel + `SessionActivityBuffer`)". The layer package's `src/` claim
is verified true (`layers/agent-execution/src/` = `index.ts` + `session-activity-buffer.ts` +
`__tests__`). But `layers/agent-execution/harness-registry/src/mcp/mcp-route.ts:70` constructs
`new Hono()` — the MCP router itself, inside the layer's service. The substantive claim survives
(the layer hosts no **app**; the router is created there and mounted/dialled elsewhere — which is
the exact violation §4 restates), yet the parenthetical as written would mislead an architecture
pass grepping to confirm it. Say "hosts no app; the router Hono instance is built in
`harness-registry` and mounted by others" instead.

---

## FOLLOW-UP / NOTES

- **N1 — desktop's app→app manifest rows live in the development world.** `applications/desktop/package.json`
  declares `@hyperidle/remote-server` and `@hyperidle/remote-worker` only as `devDependencies`,
  while **production** sources import them (`applications/desktop/src/boot-server.ts:19`,
  `main.ts:20`) — which is why the baseline holds 2 `application → application [import]` sites and
  no production manifest group for the pair. Clearing the imports per AC #3 should also reconcile
  those dev-manifest rows, or they dangle pointing at packages desktop no longer composes. (Also
  explains the drift between `decided-rules.json`'s `application → application [manifest]`
  production instance count of 2 and the baseline's 0 — census-time vs baseline-time worlds; not
  this artifact's defect.)
- **N2 — §2.2 cites `app.ts:11,51` as enqueue "sites"**; `:51` is the recorder const
  (`layers/core-api/src/app.ts:51`), not an import. Fine as evidence, but the import-site count of
  record is correctly the baseline's (`app.ts` = 2 import sites, one of which is harness-registry).
- **N3 — what I confirmed works, so downstream phases can lean on it:**
  - The **93-site / 15-group inventory** (`requirements.md:122-136`) reproduces
    `governance/baseline.json` exactly — every group, every count, including the 24-file/36-site
    `layer → service (other layer) [import]` breakdown and the 4 DI groups at 14 sites. Matches
    `progress.json.baselineScope` verbatim. Nothing in the plan's AC-5 enumeration is unaccounted;
    the residual baseline groups partition cleanly to AU29 (`framework → EventBus`, db surfaces),
    AU30 (table groups), AU32 (development world).
  - Both **live-tree corrections are true**: `layers/core-api/connections` does not exist at base
    (`credentials` does; `layers/agent-orchestration/connections` does), and **filesystems is a
    sixth reached-into service** (`layers/core-api/src/routes/filesystems.ts:34` imports
    `getFilesystem`/`saveInjection`; `layers/core-api/package.json` declares it). All §5.2.3
    per-service counts re-derive exactly (session-requests 14 files, agent-run-config 8,
    run-orchestration 6, harness-registry 4 files/5 statements, tool-handlers 1 file/2 statements,
    filesystems 1).
  - The **transactional-enqueue constraint is real and newly surfaced**:
    `layers/core-api/src/routes/knowledge.ts:934` calls `enqueueWorkIntent(tx as HyperIdleDb, …)`
    inside the knowledge-edit transaction. §2.4's demand that architecture audit every write site
    for this pattern and name any relinquished atomicity window is exactly right.
  - The **session-requests verdict is earned, not blanket**: all 14 cited import lines verified at
    their exact locations; the verdict rests on AU26's test as written (test at
    `.pipeline/work/AU26/requirements.md:31`, bar at `:41-45`, wiring rule at `:47` — all applied
    faithfully), and §2.4 explicitly refuses to pre-decide the mechanism, preserving
    `plan.md:27`'s per-service, multi-version demand. The rejected reading is recorded with four
    grounds, of which ground 2 (relocation would force orchestration's claim/lease/drain to read
    core state — reopening what Decision L closed to zero) is decisive on its own.
  - §3.4's **premise checks out**: `application → layer [import]` is decided `allowed` with 12
    production instances in `governance/decided-rules.json`; changing it is founder-only per
    `governance/README.md:29-33,138-141`; new rules need attack cases per `:110-125`. The artifact
    changes no decided rule silently — it flags the change for the gate. Correct.
  - §4 is a **restatement, not a new decision**: `governance/architecture.json:111-115` (host =
    agent-execution, "mounted in the wrong place today"), Ruling 12.3
    (`.pipeline/work/AU28/founder-rulings.md:367`), and the decided MCP rows
    (harness-registry/agent-execution allowed; service/layer/application forbidden) all verified as
    cited. Dial sites verified at `provisioner.ts:1327,1349` and `create-server.ts:86,566`.
  - **Hard constraints survive unsoftened** (`requirements.md:194-203`): zero exceptions, end state
    as end state, shrink-only with promotion-on-clear, delete-never-retag — no hedge, no "phase 1",
    no "for now" anywhere in the artifact (grep-verified).
  - **Scope holds in both directions**: AU26's axis is not reopened (§7.1; §8.7 raises the
    possibly-misplaced routes as a finding-with-evidence handoff, exactly the form `plan.md:39`
    permits), AU30 and AU32 are untouched, and the `application → db:util` overlap is flagged for
    an explicit architecture ruling coordinated with AU29 (§8.1), matching `progress.json`'s note —
    neither claimed nor dropped.

---

*Reviewer: pipeline-reviewer, fresh context, read-only. No artifact was modified.*
