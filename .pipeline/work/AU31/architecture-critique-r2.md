# AU31 — Architecture critique, round 2

Artifacts: `.pipeline/work/AU31/architecture.md` + `feasibility.md` (P11) + `probes/p11-composition-spelling/`
at HEAD `b5d1bf02`, evaluated against `plan.md` (authority), `requirements.md`, `.pipeline/AU.md`,
`governance/` (README, `baseline.json`, `decided-rules.json`, `architecture.json`, and the live
enforcement code), `.pipeline/work/AU28/founder-rulings.md`, `.pipeline/work/AU29/plan.md`, CLAUDE.md,
ETHOS.md. Round-1 findings: `architecture-critique.md`. Every load-bearing repair claim was re-verified
against the live tree and — for P11 — **re-executed**, not read: all four probe runs were reproduced in
this session against the live census (`npx tsx scripts/governance-lint.ts`, worktree left clean), plus
one adversarial probe of my own. The items round 1 confirmed sound (93/15 arithmetic, db:util ruling,
atomicity audit, harness-registry premise, split order, AU26 H1/H2 supersession) were not reworked.

## Verdict: FAIL — 1 blocking finding

B1 is closed: the composition handoff now rests on executed census evidence, the provenance design is
real in the enforced code, the acquisition path is genuinely closed by the import census, and the
proposed attack/control pair fails on regression in both directions. B2 is closed: every deletion
premise checks out against the live tree and all 14 DI baseline sites now have named mechanisms. B3's
ratified limit line survives a counterexample hunt — but the widened R2 predicate that repairs it
**flags the architecture's own end-state tree**, at named surviving sites, which makes the B4
governance deliverable infeasible as specified. That is the one blocker.

---

## The three repairs, judged

### B1 — CLOSED. The boundary holds by acquisition, not by blindness.

**(a) Probes re-executed, all four reproduce.** Run in this session at the recorded production paths:

- Run 0 (clean tree): PASS, exit 0, 221 production known violations at warn — matches `outputs.txt`.
- Probe A (inline handoff, `applications/remote-server/src/au31-probe.ts`): **FAIL** —
  `ERROR [crossing-di] … layer → layer (other) [di] production — agent-orchestration receives the
  result of `createLocalAdapterPool` from agent-execution`. Verbatim match.
- Probe B (local binding + `exec.adapters` property access): full output grepped for the probe path —
  **zero findings, warnings included**, `--errors-only` exit 0. Match.
- Probe C1 (shared helper receiving a cross-file layer list in `layers/agent-orchestration/src/`):
  **FAIL** — `framework → layer [di] production`. Match.
- Probe C2 (in-layer `buildToolDefinitions(ports, { role })`): zero findings, exit 0. Match.

**(b) "Records nothing by the provenance design" is a real property, and the blindness is bounded.**
The DI heuristic's provider lookup is `origins.get(identifier)` where `origins` is built exclusively
from the file's import declarations (`crossing-detectors.ts:684-688, 752, 949-958`); `scanArgument`
(`:974-999`) has branches only for identifiers, object/array literals, and call expressions with
identifier callees. A face-boot-produced value held in a local carries no entry in `origins` — that is
the predicate's own definition of "came from" (`:931-934`), not a patch. The claim that matters —
"the import rules close the symbol-acquisition path" — I tested adversarially and it **holds**:
`repo-census.ts:683-714` records import edges for every acquisition spelling — static imports,
`export … from`, `export * from`, namespace exports, `import x = require()`, **dynamic `import()`**,
and `require()` with destructuring. So a production file cannot acquire a raw foreign-service symbol
by any spelling without producing an import edge, and every relevant import group is at error once
AU31 clears it. What the DI detector cannot see can therefore only be face-produced or environmental
values. Independent verdict: **the boundary holds by acquisition-closure**; the DI detector's
blindness (property access, namespace-called factories, PascalCase values) is supplementary, not
load-bearing.

**(c) The attack/control pair is not vacuous.** `governance-attacks.ts` expectations are
`{ sort: "violation", file, groupKey }` for attacks and `{ sort: "clean", file }` for control twins;
property 1 fails the build if the attack stops producing its finding, the control twin fails it if
the detector starts flagging the mediated handoff, and property 3 (overlay path must not pre-exist)
prevents silent rot (`governance-attacks.ts:17-31, 57-67`; `governance/README.md:110-125`).
Regression is fatal in both directions.

One precision note: `governance/decided-rules.json` carries **no literal
`layer → layer (other) [di]` row** (its 124 rows cover layer→service, framework→layer, etc.); the
verdict is generative via clause 6 (`governance-model.ts:266-290`) with zero baseline headroom — the
effect the architecture describes is exactly right (proven by probe A), but §4/§13.3 should say
"clause 6 + empty baseline", not imply a decided row exists.

### B2 — CLOSED. Every deletion premise verified against the live tree.

- **"Zero execution content"**: `harness-registry/src/tool-registry.ts:25-38` imports only
  `@hyperidle/shared`; the function is the role-filter + zod-validate + workflow-route closure the
  architecture describes (`:62-119`).
- **"No in-package caller"**: grep-verified — the only production caller of the internal
  `buildToolRegistry` is the dying wrapper (`tool-provider-bindings.ts:20,60`); `index.ts:30` is the
  export row; the MCP bridge receives registries as values (`mcp-bridge.ts` —
  `CreateMcpSessionOptions.registry`, `createMcpSession(options)`), its only mention of the builder
  is a comment (`:141`). (One development-world caller exists inside harness-registry:
  `src/__tests__/return-status-tool.test.ts:213` imports `../tool-registry.js` directly — see N3.)
- **`buildToolDefinitions(ports, { role })` genuinely covers `toolsForRole`**: the wrapper is
  `toolsForRoleShared(allToolDefinitions, role)` (`tool-provider-bindings.ts:64-66`) and
  `allToolDefinitions = buildToolDefinitions(toolHandlersPorts)` (`tool-handlers-bindings.ts:200`),
  while `buildToolDefinitions(ports, { role })` applies the identical shared filter to the identical
  list (`tool-definitions.ts:1617-1649`). The provisioner's consumers need `{name, description}`
  (`provisioner.ts:290, 1224, 1430, 1444`) — covered.
- **All 14 DI baseline sites now have named mechanisms** — re-derived from `baseline.json`:
  `service → service (other layer) [di]` 9 sites / 8 files (list matches §10 row 2 file-for-file,
  `bets.ts` = 2), `application → service [di]` 2 (§4-law handoffs), `service → layer (other) [di]` 2
  (`service-bootstrap.ts:330` relocates; `tool-provider-bindings.ts` dissolves),
  `framework → layer [di]` 1 (same dying file). The round-1 gap is fully closed, and C1/C2 prove the
  dissolution is in-principle (relocation re-fails; end-state spelling is clause-6-legal — both ends
  agent-orchestration — and reports nothing).
- **AU29 overlap does not strand the site**: `work/AU29/plan.md:50` does read "Every `framework → *`
  … entry is gone" literally; §8/§13.6 rule the group AU31's in one direction and `db:util` AU29's in
  the other, with the orchestrator ordered to echo both into AU29's artifacts. Whichever lands first,
  the site's fate is defined; nothing is silently claimed or dropped.

### B3 — ratified line survives; the repairing predicate does not. See BLOCKING below.

The restated limit — "module-load spellings are caught mechanically; function-body spellings are
review territory" (§7.3, §13.1) — is a syntactic dichotomy and it is exhaustive: I hunted
counterexamples and every value-launder spelling either sits outside a function body (caught by the
widened (c)) or inside one (declared review territory). The round-1 bypasses (aggregate, alias hop,
default export, class static, IIFE) are all in the attack set. Two supporting sentences overclaim
(N1), but the ratified line itself is no longer refutable the way round 1 refuted its predecessor.

---

## BLOCKING

### B4 — The widened R2 predicate flags the architecture's own end-state tree; the B4 governance wave is infeasible as specified

**The predicate** (§7.2 R2(c)): in face-reachable layer-root modules, it is a violation to "reference
a binding imported from a service module **anywhere outside a runtime function body**", explicitly
including "an object- or array-literal member" and "a module-scope alias — exported **or merely
reachable from an export**". Nothing in the clause restricts it to foreign-layer services — nor can
it, since R2's own founding target (`layers/core-api/src/index.ts:14-15` re-exporting
`@hyperidle/knowledge`) is an own-layer service.

**The collision — surviving, planned-legal sites the predicate hits:**

1. `layers/core-api/src/app.ts:213` — `const notificationsServerConfigPort = { read: readServerConfig,
   update: updateServerConfig };` — module-scope object literal over bindings imported from
   `@hyperidle/settings` (`app.ts:12`), a core-api service package (`layers/core-api/settings/`).
   The `notificationsDeps` bag that follows (`:215+`, `credentialCipher: { encryptCredentialValue,
   decryptCredentialValue }`, …) adds more members of the same shape. This is settled in-layer
   composition (the AU19/AU20 lore at `:201-211` records it as the deliberate pattern), **no AU31
   wave converts it** (§2 touches only cross-layer conversation; settings wiring is core-internal),
   and `app.ts` is a **named face entry** in the end-state export map (§7.1: core-api keeps `./app`)
   — reachable under any reading of R2's scope, transitive or entry-only.
2. `layers/core-api/src/service-bootstrap.ts:175` — the identical `notificationsServerConfigPort`
   bag, in the file whose core-domain half §5 explicitly keeps ("everything else in
   `registerCoreDomainServices` **stays core**"), reachable from `./boot`.
3. `layers/core-api/src/services/tool-handlers-bindings.ts:200` —
   `export const allToolDefinitions = buildToolDefinitions(toolHandlersPorts);` — a module-scope,
   call-initialized exported binding referencing a service import (`@hyperidle/tool-handlers`). §5.3
   moves this file **as-is** into `layers/agent-orchestration/src/` ("moves in-layer as before"),
   where post-move it is boot-reachable and `tool-handlers` is the layer's own service — flagged by
   the same clause. The architecture's own probe C1 design notes lean on exactly this
   call-initialized shape existing (`probe-c1-framework-consumer.ts.txt`: "exactly
   `tool-handlers-bindings.ts:200`'s shape").

**Why this blocks.** R1–R3 land in wave B4 "with their attack + control cases (the build fails
without them)" (§10) and their texts are founder-gate exhibits (§13.1). As specified, turning R2 on
against the planned end state fails the build at sites no wave converts. At that point the builder's
options are all illegal or unplanned: narrow the ratified predicate unilaterally (rule texts change
only by founder ruling — `governance/README.md:138-141`), add an allowlist (banned, `plan.md:30`), or
respell N sites of settled core-internal wiring that no section budgets or names. The §7.2 control
twins do not cover this pattern — "value spellings over the layer's **own src** modules" legalizes
references to own-src bindings, and "a boot function whose body calls service functions" legalizes
function bodies; neither legalizes the module-scope service-import wiring bag that is the codebase's
established composition style. So the contract, as written, is infeasible against its own end state —
the same class of enforced-artifact/plan mismatch as round 1's B1, one rule over.

**What resolution requires (finding, not design).** Either the predicate is restated so the launder
is still caught while the surviving wiring pattern is legal (e.g. scoping (c) by what can actually
escape through the export surface as a value — a decision the founder must ratify with the rule
text), **or** the architecture names the respell obligation for every surviving module-scope wiring
bag in face-reachable modules (sites 1–2 above, the relocated 3, plus a builder re-sweep) as part of
a wave, with the control-twin set extended to pin whichever choice is made. Governing authority: plan
AC #1/#3/#5 (these rules are the enforcement the ACs ride), `plan.md:30` (no allowlist),
`governance/README.md:110-125` (property 1: every attack must produce its finding — against the real
tree), §13.1 (founder ratifies the rule texts as exhibits).

---

## NON-BLOCKING DEFECTS

- **N1 — Two §7.3 support sentences overclaim and feed the gate.** (i) "R2's widened predicate
  catches every spelling whose service reference is **evaluated at module load**" is refuted in two
  lines: `function make() { return { listKnowledge: list }; } export const api = make();` — the
  reference sits in a function body (not an IIFE — a hoisted declaration invoked from an initializer),
  so R2 as spelled records nothing, yet it evaluates during module evaluation and launders identically
  to the caught IIFE. (ii) "class property initializer (static or instance — **both evaluate without
  a consumer call**)" is false for instance fields, which evaluate at construction. Neither breaks
  the ratified dichotomy (both counterexamples are, syntactically, function-body/deferred spellings —
  review territory), but the founder reads §7.3 whole: restate (i) as "every reference that appears
  syntactically outside a function body" and drop (ii)'s parenthetical.
- **N2 — §4's "self-enforcing on its visible side" is overstated by one spelling.** Executed this
  session: `import * as exec from "@hyperidle/agent-execution";
  bootAgentOrchestration({ …, adapterPool: exec.createLocalAdapterPool() })` at the probe A path
  records **nothing** — the DI heuristic's inline-call branch requires an identifier callee
  (`crossing-detectors.ts:991-993`), and a namespace import of a layer face is an allowed import
  edge. No conversation channel opens (the value is still face-produced, and service-symbol
  acquisition stays censused per B1(b)), but §4's "no inline call of one may appear … this side
  needs no new rule" has a legal-looking respelling the census cannot police. Name it in the spelling
  law's honest limit, or decide an attack case for it alongside the §13.3 pair.
- **N3 — One development-world caller of the moving dispatch is unaccounted.**
  `harness-registry/src/__tests__/return-status-tool.test.ts:211-225` imports `../tool-registry.js`
  and asserts `returnStatusTool` wiring **through** `buildToolRegistry` — the callee moves to
  tool-handlers while the test's subject stays in harness-registry. "The behavioral suites move with
  the file" (§2.5) should name where this cross-cutting test lands so the builder doesn't leave a
  dev-world layer→layer import or silently drop the wiring assertion.
- **N4 — WP-id hygiene for the B4 attack cases.** The P11 probe overlays were named `au31-probe.ts`
  at production paths (never committed — fine). The attack/control cases §4 and §7 add to
  `scripts/lib/governance-attacks.ts` are enforced production artifacts: ids, overlay paths, and
  `detail` strings must not carry the WP id (founder ruling: WP numbers live in `.pipeline/**` only).
- **N5 — Cite the enforcement state precisely in §4/§13.3**: "clause 6 (`governance-model.ts:266-290`)
  with an empty baseline", not a `decided-rules.json` row — no literal `layer → layer (other) [di]`
  row exists (evidence under B1 above).

## FOLLOW-UP / NOTE

- The census's import wall (and with it the acquisition-closure argument) is as strong as
  `repo-census.ts`'s specifier extraction — which currently covers every ES/CJS spelling I could
  construct. If that extractor ever narrows, the §4 reading's foundation moves; the AU28 rule owner
  may want the dynamic-import edge pinned by its own attack case someday. Not AU31's obligation.

## What was verified and holds (beyond the three repairs)

The 14/14 DI accounting closes round 1's last unaccounted residue, so all 93 sites now map to a named
mechanism and named leaf (§10 rows re-checked against `baseline.json`; the import-36, manifest, MCP
and api groups were file-verified in round 1 and are untouched by the rewrite). The wave A/B leaf
write-sets stay workable: the B2 rewrite adds `tool-handlers/**` to wave B only; `service-bootstrap.ts`
remains the single two-wave file; A's routes/services vs B's boot/relocations are file-disjoint within
the shared directory. The e2e evidence plan is now honest: the false second proof is explicitly
withdrawn with the test's own words quoted (§11), and step 4's terminal-with-return observation does
exercise the relocated dial, so the primary recipe carries AC #7 alone. No transitional facade,
"phase 1", or deferred promotion appears anywhere in the revision — §4's enforced home, the R-rules,
and the conditional baseline deletion all land inside wave B4 of this WP; the §2.5 dissolution is an
end state, not a parking orbit. D1–D5 of round 1 are all genuinely absorbed at the marked sites
(§11, §13.8, §7.2 resolved-module matching, §3.1 clientKey nuance, §4 filling the numbering gap).

---

*Reviewer: pipeline-reviewer, fresh context, read-only on the evaluated artifacts. Probe overlays were
created and deleted inside this session for re-execution; `git status` clean at finish. Only this file
was written.*
