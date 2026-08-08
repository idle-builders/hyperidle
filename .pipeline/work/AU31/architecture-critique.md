# AU31 — Architecture critique

Artifacts: `.pipeline/work/AU31/architecture.md` (commit `82008525`) + `feasibility.md`, evaluated
against `.pipeline/work/AU31/plan.md` (authority), `requirements.md`, `refine-critique.md`,
`.pipeline/AU.md`, `governance/README.md` + `architecture.json` + `decided-rules.json` +
`baseline.json`, `scripts/lib/governance-model.ts`, `scripts/lib/crossing-detectors.ts`,
`.pipeline/work/AU28/founder-rulings.md`, `.pipeline/work/AU29/plan.md`, and the live tree at base
`bbe82e9a`. Every load-bearing citation below was independently re-traced against the tree and the
enforced governance code, not taken from the artifact.

## Verdict: FAIL — 3 blocking findings

The per-service verdicts are earned and evidence-backed, the arithmetic is exact, the atomicity
audit is complete (independently re-swept), both supersessions are properly gated and at least one
is genuinely forced, and scope holds in both directions. What fails is narrower and structural: the
central composition mechanism (face-produced adapters handed across layers) rests on an assertion
about the enforced census that the census's own code contradicts; two DI baseline sites have no
named clearing mechanism and the named moves plausibly re-create their groups; and the
wrapper-launder limit statement the founder is asked to ratify is refutable with one line.

---

## BLOCKING

### B1 — The face-handoff composition mechanism rests on an unproven claim about the enforced census, and the census's code contradicts it

**Claim under test:** `architecture.md:337-339` ("The census's DI rule is unchanged by this: a
capability produced by one face and passed by the composition root into another face is the face's
declared composition contract (clause 3), not an injected foreign symbol") and `§13.3`
(`architecture.md:587-590`). This reading carries the whole of §5/§6: the execution adapter bundle
into `bootAgentOrchestration` (`architecture.md:159-163, 315-318, 376-378`), `resolveModel` /
`upgradeTokenStore` / middleware / registrar handoffs out of `bootCoreApi` (`architecture.md:
327-339`).

**What the enforced artifacts actually say:**

- `scripts/lib/governance-model.ts:265-290` (clause 6, `wire-within-one-layer`): a DI wire is legal
  only when both ends live in one layer or the provider is the **framework**. There is no
  face-content carve-out, and no "reading" can add one — clauses change only by founder ruling
  (`governance/README.md:29-33,138-141`).
- `governance/decided-rules.json`: `layer → layer (other) [di]` = **forbidden**, production
  instances 0 — i.e. zero baseline headroom; one new instance is a hard error the shrink-only
  generator cannot absorb (`governance/README.md:75-81`).
- `scripts/lib/crossing-detectors.ts:930-1000` (the DI heuristic): the crossing is recorded between
  the package whose factory is **called** and the package the injected value's identifier was
  **imported from**. Concretely, for wave B's intended shape:
  - `bootAgentOrchestration({ adapters: bootAgentExecution(opts) })` — a call expression as
    argument hits `consider(arg.expression.text, "receives the result of", …)`
    (`crossing-detectors.ts:991-993`): consumer = agent-orchestration (layer), provider =
    agent-execution (layer) → **`layer → layer (other) [di]`, forbidden, zero baseline → build
    fails with no legal recourse mid-build**.
  - `const exec = bootAgentExecution(opts); bootAgentOrchestration({ adapters: exec.adapters })` —
    a `PropertyAccessExpression` has **no branch** in `scanArgument`
    (`crossing-detectors.ts:975-999`): the census records **nothing**. Green by detector blindness,
    not by ruling.

  Today's analogue proves the heuristic does fire on this shape: the two
  `application → service [di]` baseline sites (`applications/desktop/src/boot-server.ts`,
  `applications/remote-server/src/index.ts`) are exactly the adapter-pool wires built from
  `@hyperidle/harness-registry` symbols and passed into the called factory.

**Impact:** the flagship mechanism of §5/§6 is either lint-fatal or invisible depending on how the
builder spells one assignment. The architecture asserts a third state ("legal under clause 3") that
exists in no enforced artifact, and feasibility never probed it — P2b (`feasibility.md:57-67`) read
the clause, not the post-state wire. For a work package whose stated payoff is that "every
architectural claim about this boundary becomes machine-checked" (`requirements.md:13`), shipping
the composition contract on an unenforced reading — or on a heuristic blind spot nobody names —
reproduces the exact failure mode the plan cites (`plan.md:7`: a guard that reports zero findings
while the boundary sits open).

**What resolution requires (finding, not design):** (a) a probe running the census over a spike of
the intended boot-handoff spelling, recording what it reports; (b) an explicit statement in the
architecture of which of the two states holds — ruled-allowed or detector-invisible; (c) if the
founder ratifies the §13.3 reading at the gate, that reading must land in the enforced model
(clause text and/or a control-twin case per `governance/README.md:110-125` distinguishing the
face handoff from forbidden cross-layer DI) — otherwise the ratified reading lives only in a plan
document. Governing authority: plan AC #2 + AC #5 ("rules fail the build on reappearance"),
`plan.md:30` zero exceptions, Ruling 1 (`founder-rulings.md:28-30`).

### B2 — Three DI baseline sites across two groups have no named mechanism, and the named moves plausibly re-create both groups (AC #5 completeness)

The AC-2 row (`architecture.md:497`) claims all "4 DI groups' entries deleted" but names mechanisms
per site only for `service → service (other layer) [di]` (9 sites — all 8 files verified named) and
`application → service [di]` (2 — cleared by §5.3/§6). The remaining three sites are never
mentioned — `architecture.md` contains no occurrence of `framework → layer` or
`service → layer` (grep-verified):

- **`framework → layer [di]` (1 site, `tool-provider-bindings.ts`).** The wire is
  `toolsForRoleShared(allToolDefinitions, role)` (`layers/core-api/src/services/
  tool-provider-bindings.ts:64-66`): consumer = `@hyperidle/shared` (framework), provider = the
  layer-defined `allToolDefinitions`. Under clause 6 a framework-declared consumer is forbidden for
  **any** layer/service provider (`governance-model.ts:267-273` — `layerOf(source)` is undefined
  for framework, verdict forbidden regardless of provider). §2.5's move of the file into
  `layers/agent-orchestration/src/` changes the provider's layer but not the verdict: **the same
  group re-appears at a new site, which the shrink-only generator hard-fails**
  ("fixing one violation while adding another fails", `governance/README.md:79`). No mechanism in
  the architecture dissolves this wire.
- **`service → layer (other) [di]` site 2 (`tool-provider-bindings.ts`).** The wire is
  `buildToolRegistryInternal(allToolDefinitions, ctx, options, proposedCallWorkflowPort)`
  (`tool-provider-bindings.ts:60`): consumer = harness-registry (agent-execution service),
  provider = the layer-defined tool list. §2.4's "its harness-registry half rides the execution
  face's tool-registry contract, typed in `@hyperidle/shared`" (`architecture.md:164-167`) names a
  type home, not a wire dissolution; if the moved file still calls a registry builder with a
  layer-defined argument, the group persists (or goes detector-invisible via the B1 adapter shape —
  same unstated state). (Site 1 of this group, `service-bootstrap.ts`'s
  `startLifecycleProjectionDrain(queueDeps(db))` at `service-bootstrap.ts:330`, **is** covered — the
  §5 relocation makes both ends agent-orchestration.)
- **Ownership overlap, unruled.** AU29's plan AC reads "Every `framework → *` … production entry is
  gone" (`.pipeline/work/AU29/plan.md:50`) — literally covering `framework → layer [di]` — while
  AU31's `progress.json.baselineScope` claims the same group. §8 rules the `application → db:util`
  overlap explicitly (and correctly — AU29's AC also claims `* → db:util`, verified) but is silent
  on this second overlap. Requirements §8.1's own bar: "neither silently claiming nor silently
  dropping."

**Impact:** plan AC #5 ("Every … cross-layer-DI … entry is gone … and those rules fail the build on
reappearance") is unmet as specified: one named baseline site has no clearing mechanism, and two of
the architecture's own moves would re-create cleared groups, which the generator turns into a hard
build failure at exactly the commit that was supposed to finish the work.

### B3 — The wrapper-launder limit statement the founder is asked to ratify is refutable in one line

`architecture.md:443-450` (§7.3): "R2(c) catches the one-hop value spelling, **so a launder must be
a call-wrapping function**, which is exactly what the reviewer lens and the founder-ratified face
content list exist to judge." R2's three spellings (`architecture.md:423-430`): (a)
`export … from "<service>"`, (b) `export * from "<service>"`, (c) an exported binding whose
initializer is an imported service symbol.

Constructed bypasses — each one line in a face module, each a value launder, none a call-wrapping
function, none matching R2(a)/(b)/(c) as spelled:

1. `export const api = { listKnowledge: list };` — object-literal aggregate; the initializer is an
   object literal, not "an imported service symbol".
2. `const l = list; export { l as listKnowledge };` — module-scope alias hop; the exported binding's
   initializer is a local identifier.
3. `export default { list };` / a class with `static list = list;` — same shape, other clothes.

Against these, hold (a) (`architecture.md:445-446` — small enumerated export map) does not bite:
none adds a manifest entry, they ride the existing `.` face module. Hold (b) (knip) passes them the
moment any application consumes them — which is the laundering scenario by definition. So the
architecture's honest-limit statement is not honest as written: the residual is not "call-wrapping
functions only", it is "call-wrapping functions plus every value spelling R2(c) does not reach."
This matters precisely because §13.1 (`architecture.md:581-583`) has the founder ratify "the
wrapper-launder limit statement" — a founder gate fed a false limit is the D3 failure
(`refine-critique.md:82-88`) reproduced one level up. Either R2's predicate widens (e.g. any
exported declaration referencing an imported-service binding outside a function body — the stated
control twin, "a boot function whose body *calls* service functions", survives exactly that
predicate) with the bypass spellings as attack cases, or the limit statement names them as part of
the true limit. Governing authority: plan validation scenarios (`plan.md:57-61`), requirements
§3.1 clause 2 ("without this clause AC #3 is satisfiable vacuously"), `governance/README.md:110-125`.

---

## Judgements the tasking requires, stated explicitly

**Supersession (a) — AU26 H1/H2's read-only door (`architecture.md:128-132, 584-586`): genuinely
necessary.** The superseded mechanism is verified as written at `policy-bindings.ts:100-105` ("a
plain downward call — NOT an `AgentOrchestrationPort` method (that door stays read-only)") — and a
plain downward call is exactly the crossing this plan outlaws (AC #1/#2), so *something* must
change. Of the three legal mechanisms: MCP is the harness door; a bus emit loses the synchronous
result and error propagation every one of the three verbs relies on today and is not durable
(`architecture.md:71-74`, consistent with settled durable-intent law). The port write side is the
minimal legal spelling. Properly listed for the founder gate (§13.2). No blocking finding.

**Supersession (b) — `SessionActivityBuffer` vs AU21 Decision E (`architecture.md:198-207,
593-595`): justified, but the founder should see the avoidance path stated plainly.** An
alternative *inside* the existing decision exists: keep the buffer in agent-execution, export it on
the new execution face, and have the application construct it and pass it into
`bootAgentOrchestration` — that clears the crossing (P8 verified: `boot.ts:29` is the sole
production site) without superseding E. The architecture rejects it in one clause
(`architecture.md:205-207`). The rejection is sound on the merits — the alternative is precisely
the B1-shaped face handoff (unproven enforceability), it preserves a placement AU26's own
domain-served test rejects (P8: zero execution coupling, consumers exclusively orchestration's boot
and routes), and "relocate" is an explicitly plan-sanctioned verdict category (`plan.md:27`). Not
blocking; the founder-gate entry should carry the alternative, not only the rejection.

**Does the face rule bite?** For reach and deep imports, yes, with real teeth: the shrunken export
maps plus Node exports encapsulation make deep service-path imports fail to resolve, R1 closes the
manifest side, R3 gives validation scenario 2 its error shape, and R2 as spelled does catch the
three AU28-precedent spellings (the live launder shape it targets is real —
`layers/core-api/src/index.ts:14-15` re-exports `@hyperidle/knowledge` today, and
`layers/agent-execution/src/index.ts:15-20` re-exports four harness-registry symbols, both
verified). For value laundering, it bites only up to B3's hole; with R2 widened as B3 sketches, the
genuine residual (call-wrapping composition) is honestly review-territory and honestly stated. No
allowlist, no suppression path, no transitional facade, no deferred promotion anywhere in the
artifact (checked for exactly those shapes) — the three "holds" are not an exemption apparatus;
B3's problem is that the limit they hold is understated, not that they re-admit Decision L's
apparatus.

**Atomicity (§3.1): audit complete, relinquishments proportionate.** Independent re-sweep
(`tx as HyperIdleDb` + `transaction(` across `layers/core-api/src`, then reading each hit):
exactly two cross-boundary pairs exist — `knowledge.ts:934` (flag transition `:891` + intent, one
tx, verified) and `threads.ts:1463` (`insertMessage:1443` + intent record `:1463`, one tx,
verified). The explicit-start pair (`sessions-routes.ts:168-194`) is orchestration-internal and
stays atomic inside the one intake op — correct. The two `writeAgentRunConfig(tx,…)` couplings
(`agents.ts:~281`, `teams-routes.ts:422`) are real and named; the third candidate path
(`org.ts:306` → `persistScaffoldedAgents`) runs on plain `db`, no transaction
(`layers/core-api/org/src/scaffold-agents.ts:153-200`, verified) — no unfound pair. Each window
names its user-visible consequence and recovery; the knowledge retry is idempotent under the same
key; no reconciler is proportionate for a visible-5xx, single-row window. One gap worth one
sentence at the gate: §3.1's threads recovery says "the user re-sends" without naming that a resend
inserts a second visible message unless the client reuses its `clientKey` (dedupe path exists,
`threads.ts:1071-1081`).

**`harness-registry` verdict premise: TRUE.** `layer → agent-execution [api]` is decided
**forbidden** with 0 production instances and `service → agent-execution [api]` forbidden with the
1 baseline site (`governance/decided-rules.json`, re-read directly); `harness-registry → MCP router
[mcp]` is allowed (4 production instances); `architecture.json:111-115` names agent-execution the
router's host and "mounted in the wrong place today"; Ruling 12.3 lists the migration
(`founder-rulings.md:363-365`). So "no conversation; relocate behind faces" is forced, not chosen.
The dial fold is feasible as P7 describes (provisioner's injected `mcpBridgeRegistry` port at
`provisioner.ts:1327-1350` verified; `provisionHarnessEnvironment` already harness-registry's).
Whether the adapter handoff that replaces the composition imports is legal-as-enforced is B1, not a
defect of this verdict.

**E2E evidence plan (§11): primary proof sound, second proof misattributed.** Steps 1–5 observe all
three claims through real doors (intake via the seam status route, execution via terminal session +
transcript, landing via core's API), with `probes/e2e-run.md` a named ship-time deliverable — this
satisfies AC #7 as "executed, not read." But the claimed second proof — "the existing harness-lane
test that exercises `provisionSession` against the real binary … now rides the relocated MCP dial"
(`architecture.md:531-534`) — does not exist in that form: the only real-binary harness test wires
"the enforcement pieces directly from the registries **rather than via provisionSession**"
(`layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts:141`,
its own words; it constructs its own bridge and URL at `:168-169, :380`). Post-relocation its green
proves nothing about the relocated dial. See D1 below.

**Completeness against the 93-site inventory: exact, minus B2.** Re-derived
`governance/baseline.json` at base: 38 groups, 288 sites total; AU31's 15 groups sum to **93**,
every per-group count matches `progress.json.baselineScope` verbatim; 92 + 1 contested
(`application → db:util`, 1 site) is consistent. The §8 ruling is right: AU29's plan explicitly
claims `* → db:util` (`work/AU29/plan.md:50`) and names the surface its own anomaly, so leaving the
site untouched neither clears nor grows it. All 24 files of the 36-site import group have named
mechanisms (traced file-by-file against the baseline's site list); manifests, app→service,
app→app, and all three MCP/api groups map to §2/§5/§6. The unaccounted residue is exactly B2's
three DI sites.

**The split (§12): the boundary is real.** After wave A the remaining cross-layer imports are the
composition files — still baseline-listed, so `verify` stays green without any transitional
construct being *added*; the plan's "end state is the end state" forbids new facades, not
incremental clearing, which the shrink-only baseline exists to support. B genuinely depends on A
(the relocated composition must not carry seam-shaped imports), the one shared file
(`service-bootstrap.ts`) is named, and the leaf write-sets are otherwise disjoint — so sequential
is correct and parallel is correctly not claimed. If registered as two WPs, ACs 1/3/4/5 are only
met at B's ship; the plan sanctions the split (`plan.md:27`) but the per-WP AC restatement is the
orchestrator's registration duty.

**Proportionality and scope: holds in both directions.** §8.7's route question is closed as a
finding with evidence, not a fix — the `users` gates are real (`agents.ts:281`, `teams-routes.ts:
422,431`, `assistant.ts:479` verified) and the service's own barrel records the hosting rationale
(`agent-run-config/src/index.ts:16`, verified); no route moves. AU26's axis, AU30's tables, and
AU32's development world stay untouched except the two production manifest rows that serve
development files (`layers/core-ui/package.json:18` in `dependencies`, P6 verified — only
`__scripts__` files import it) and the desktop devDeps reconciliation the refine critique itself
asked for (N1). The §5.3 `@hyperidle/shared/http` mount helper is proportionate (it names no
layer, replaces probe-proven fragile duplication, and carries a named fallback that forbids the
third-composition-package shape). No decision transcribes implementation where a contract was
owed; the port §3 locks shapes and leaves spelling to the builder.

---

## NON-BLOCKING DEFECTS

- **D1 — §11's "second, independent proof" is false as written** (evidence above). Either name a
  real test that rides `provisionSession` through the relocated dial (none exists in the harness
  lane today) or delete the claim; a builder recording that test's green as relocation proof would
  be recording a proof of nothing. The primary live-run recipe carries AC #7 on its own.
- **D2 — §3.3's provisioning-owner stamping is a real behavior delta not on the §13 list.** Today
  the owner resolves at provisioning time (application-side, `create-server.ts:201-213`); stamping
  at submit means an intent emitted pre-onboarding and drained post-onboarding provisions no
  connections where today it would. The edge is named honestly (`architecture.md:257-259`) but
  "identical observable outcome to today's empty-rows case" elides that it differs from today's
  *behavior* in that window. One line on the founder-gate list.
- **D3 — R2's specifier semantics are unstated.** R1 and R3 are resolution-based (robust); R2's
  "(a) `export … from "<service>"`" reads as a package-specifier match. State that R2 matches by
  resolved module (so a relative `export … from "../<service-dir>/…"` is the same violation), or a
  one-line respelling walks past it.
- **D4 — §3.1's threads window: name the duplicate-message/clientKey nuance** (evidence under the
  atomicity judgement above).
- **D5 — Section numbering skips §4** (…§3.1 → §5…). No internal reference dangles ("requirements
  §4" at `architecture.md:392` is a cross-document cite), but given HEAD's stated purpose was
  fixing cross-references, the gap invites a mis-cite downstream. Cosmetic.

## What was verified and holds (so downstream phases can lean on it)

Beyond the judgements above: the six per-service verdicts each carry a rejected alternative and
none is a blanket answer; the §2.1 API-not-bus grounds check out (`knowledge.ts:955-967` needs the
created intent's id/idempotencyKey back synchronously, verified); D1–D5 of the refine critique are
all genuinely absorbed at the marked sites (D1's three read shapes are in the §3.2 op family;
D2's five-table note; D3 is §7's whole design; D4's 10-vs-12 handled by "no verdict flips"; D5's
correction is §6's opening); the `AgentOrchestrationPort` transport/auth reuse is real
(`agent-orchestration-port-composition.ts:71,95` verified); `boot.ts:77`'s shared-typed
`adapterPool` precedent is real; P4/P5/P6/P8/P9 all re-verified at their cited sites; hard
constraints survive unsoftened — no allowlist, no "phase 1", no "for now", no temporary crossing
anywhere in the architecture (checked for exactly those shapes); AC #6's unconditional end-of-work
check is the right handling of P1's schedule-dependence.

---

*Reviewer: pipeline-reviewer, fresh context, read-only on the evaluated artifacts. Only this file
was written.*
