# AU31 — Architecture critique, round 4 (post-adjudication 1: enumeration-based coverage)

Artifacts: `.pipeline/work/AU31/architecture.md` + `feasibility.md` (P11, P12) +
`probes/p12-r2-escape-predicate/`, at HEAD `af737364`, evaluated against `plan.md` (authority),
`requirements.md`, `.pipeline/AU.md`, `governance/` (README, `baseline.json`,
`decided-rules.json`, `architecture.json`, live enforcement code), `.pipeline/work/AU28/
founder-rulings.md`, CLAUDE.md, ETHOS.md, and the three prior critiques. **Every P12 claim was
re-executed in this session, not read** — prototype + fixtures copied to the session scratchpad
(outside the tree; no overlay at any production path; `git status` clean at finish), live
production files read in place. All five recorded runs reproduce verbatim. Per adjudication 1,
the central question this round is not another bypass hunt: **is the enumeration itself
complete?** I derived the export-surface grammar and the module-scope flow grammar
independently from the TypeScript AST the census's parser produces, and compared member by
member.

## Verdict: FAIL — 1 blocking finding

The adjudicated strategy half-worked, and the half that worked is real: the **E-side
enumeration (E1–E14) is complete** — my independent derivation of every top-level statement
kind that can create a value export edge in an ESM TypeScript module matches the artifact's
table exactly, the CommonJS exclusion is verified sound (not a convenient omission), round 3's
four escapes and the founding-case respelling all flag, and the fixpoint-seeding bug fix is
real and robust under every multi-hop shape I could construct. What fails is the **F-side**:
the flow tables quantify over "module-scope bindings," but the enumeration never enumerates
the *binding-form grammar* — which is itself closed and finite — and the executed model's
escape-trackable universe silently narrows to initializer-carrying top-level variable
declarations plus classes/enums/namespaces and *exported* function names. Four binding forms
are omitted; four executed spellings (each runtime-verified to leak the service symbol through
the export surface) record nothing; none is inside the three declared review classes. The
ratified limit statement — "the review territory is exactly three executed classes" — is
therefore false as the model executes, for the fourth consecutive round, and this time the
defect is precisely the one the adjudicated strategy exists to catch: a hole in the
enumeration.

---

## What held — verified this session, not assumed

**(a) All five recorded runs reproduce.** Run 1: attacks → 37 findings, one per spelling, same
lines/contexts as `outputs.txt`; controls C0–C9 → CLEAN; exit 1. Run 2: live `app.ts`,
`service-bootstrap.ts`, `tool-handlers-bindings.ts` → all CLEAN, exit 0. Run 3: founding
target `layers/core-api/src/index.ts` → VIOLATION line 15, exit 1. Run 4: the two-line
founding respelling (round 3's decisive CLEAN case) → **flags**, line 8, exit 1. Run 5: the
four declared residuals RES1–RES4 → CLEAN, exit 0 — the limit statement's residue is executed
evidence as claimed.

**(b) The E-side enumeration is complete.** Independent derivation: the top-level AST kinds
that can create a value export edge are `ExportDeclaration` (with/without specifier; named,
star, namespace clauses) = E1–E4; `ExportAssignment` (both forms) = E5/E6; exported
`VariableStatement` (identifier and both pattern kinds) = E7–E9; exported
`FunctionDeclaration` = E10; exported `ClassDeclaration` = E11; exported `EnumDeclaration` =
E12; exported `ModuleDeclaration` = E13; exported `ImportEqualsDeclaration` = E14. The two
members outside the table are genuinely out of grammar: interface/type-alias/`export type`
are type-only (declared out of R2's scope, governed by the ratified export map), and
`NamespaceExportDeclaration` (`export as namespace`) is declaration-file-only. Arbitrary
module-namespace string names (`export { x as "weird" }`) ride the same E4 path
(`propertyName ?? name`, prototype `:351`) — checked, no hole.

**(c) The CommonJS exclusion is sound, verified against the tree.** All three layer packages
declare `"type": "module"` (`layers/core-api/package.json`, `layers/agent-orchestration/
package.json`, `layers/agent-execution/package.json`); zero `.cts`/`.cjs` files exist under
`layers/`, `framework/`, `applications/`; base `module` is ES2022. `module.exports` at module
scope in these packages is a runtime `ReferenceError`, not an export. The exclusion row's
reason is accurate, and E6's catch-anyway posture covers a future module-format change.

**(d) The fixpoint-seeding fix is real and complete for the shapes it claims.** My adversarial
fixture (executed): three-hop initializer chain into `export default` — flags; cyclic aliases
(`p = q; q = p`) then property mutation — flags, terminates; mutation *before* the export
statement (ordering) — flags; conditional module-level flow (`if`/`try`/`finally`) into an
exported live binding — flags both branches. The two-hop-default bug the planner self-reported
is genuinely closed and the fixpoint is order-insensitive.

**(e) Citations and gate-readiness basics check out.** `repo-census.ts:644-646`
(`ts.createSourceFile`) and `:683-714` (static / export-from / namespace / import= / dynamic
`import()` / `require` destructuring all censused) are as cited, so F13's "the acquisition
edge is censused" holds. The diff since round-3 HEAD (`f524abd9..af737364`) touches
architecture.md in exactly four hunks — header, §7.2 (two), §13.1 — plus feasibility's P12
section and the probe files; nothing confirmed-sound was silently reopened (§2–§6, §8–§12,
§13.2–.8, §14 byte-identical). No allowlist/carve-out/"phase 1"/transitional construct
appears in the new text. `governance/` and `scripts/` carry no WP identifier outside
pre-existing `@lore` comments (exempt pending ruling). The six `progress.json` founder-gate
items are each stated in the artifact in rule-on-able terms (§13.1–.6, §12). N6 closed in the
catching direction (F8 getter rows executed, X14/X15 + control C7); N7 closed by catching
`export =` (X23). Worktree clean at finish.

---

## BLOCKING

### B6 — The F-side enumeration omits the module-scope *binding-form* grammar; four untracked binding forms let a service symbol cross the export surface with nothing recorded, outside all three declared review classes

The tables quantify over "module-scope bindings" (F1: "transitive over module-scope
bindings", `architecture.md:613`) and over "escaping names/values" (F2 `:614`, F4 `:616`, F5
`:617`) — but TypeScript's *binding-declaration* grammar is never enumerated, and it is
exactly as closed and finite as the export-statement grammar: variable declaration **with or
without initializer**, function declaration, class/enum/namespace declaration, import binding,
**control-flow-header binding** (`for`/`for-of`/`for-in`), **catch parameter**. The executed
model tracks only a subset: initializer-carrying top-level variable declarations
(`r2-escape-prototype.ts.txt:360` — `if (decl.initializer) topLevelInits.set(…)`), classes,
enums, namespaces (`:239-243`), and function-declaration names **only when exported**
(`:376-378`; the identifier branch deliberately declines to mark function names — `:246`).
Loop headers are walked for body statements only (`:167-168` — `collectExec(stmt.statement)`;
the header expression is never scanned), and catch parameters are nowhere.

**The evidence — executed this session, each runtime-verified to leak (`node -e` check:
`live === listKnowledge` etc., all `true`), each recording NOTHING:**

```
// H1 — uninitialized intermediate (one TOKEN from caught: `let tmp = null;` flags)
let tmp;  tmp = listKnowledge;  export let live = null;  live = tmp;          → CLEAN

// H2 — non-exported function declaration escaping via a bag, then property-laundered
//      (one line from caught: `const helper = () => {}` flags)
function helper() {}  export const api = { helper };  helper.tool = searchKnowledge;  → CLEAN

// H3 — loop-header binding as the intermediate
export const arr = [];  for (const f of [flagKnowledgeItem]) arr.push(f);     → CLEAN

// H4 — catch parameter as the intermediate
export const sink = {};  try { throw listKnowledge; } catch (e) { sink.tool = e; }  → CLEAN
```

The one-token sanity deltas are the decisive part: `let tmp = null;` (caught, X7's own
pattern) versus `let tmp;` (missed), and arrow-`const helper` (caught) versus
`function helper` (missed). A predicate whose verdict flips on those deltas has not narrowed
deliberately — it has an unenumerated axis.

**Why this blocks, under the adjudicated strategy's own terms.**

1. **It is a hole in the enumeration — the defect this round exists to catch.** The E-side
   grammar was enumerated whole and its round-3 holes closed; the F-side left "module-scope
   binding" informal, and the model's implementation of it silently narrowed. Had the binding
   forms been enumerated the way the export statements were, H1–H4 fall out mechanically.
2. **The spellings sit inside the limit statement's own positive claims.** H1 is assignment
   flow (F2's row claims "caught"); H2 is "property mutation … on escaping values"
   (`architecture.md:691-692` claims caught) — `helper` *is* escaping (any consumer reads
   `api.helper`); H3's argument *is* scanned (F5 "all arguments scanned") yet unrecognized.
   These are not honest declared narrowings; they are claimed-caught members that are not.
3. **The residue is larger than the ratified "exactly three executed classes"**
   (`architecture.md:694-696`, `§13.1:856-858`). None of H1–H4 is a function body that runs
   on a consumer's call, an alias mutation of an escaping object, or a non-export side
   channel. The founder would ratify a false exhaustiveness claim — round 1 D3/B3's failure
   mode, fourth iteration.
4. **The executed model is normative and the attack set pins the hole open.** §7.2: the P12
   prototype "is the executed model"; feasibility: "The builder implements R2 against this
   executed model." A faithful builder ships a rule that stays green on H1–H4 forever
   (`plan.md:7`'s exact failure), and AC #1/#3's enforcement (§10 rows 1/3) is satisfiable by
   respelling at any face module. Governing authority: plan AC #1/#3/#5 (`plan.md:47-51`),
   validation scenarios (`plan.md:57-61`), `governance/README.md:110-125` property 1,
   `:138-141` (the founder ratifies rule texts).

**What resolution requires (finding, not design) — and it completes the enumeration rather
than curating again.** (i) Add the binding-form grammar as its own enumerated axis of the F
table (it is closed: the seven forms named above), with a per-form verdict. (ii) Extend the
executed model's escape-trackable universe to **every module-scope-declared name** — marking a
name with no trackable initializer/material is a harmless no-op in the worklist, so this is
monotone, and H1/H2/H4 then resolve through the existing F2/F4 machinery; H3 additionally
needs loop-header expressions tracked as the binding's feed (the same `topLevelInits` shape,
one map). (iii) Add H1–H4-class spellings to the attack fixture with their member ids, keep
the four one-token control twins clean (`let tmp = null` + arrow-helper are *already* caught —
they become attacks, not controls; C2/C5–C9 must stay clean), re-execute all five runs plus
run 2's live files, and restate §7.3/§13.1 only from what the re-executed model catches. Note
the fix does not collapse the declared residuals: RES3 (alias mutation) stays review territory
under (ii) — alias-copy is points-to, not name flow — so the three-class structure survives;
it just has to become true. Nothing here reopens B4, the positional exemption, F14, or the
E-side tables.

---

## NON-BLOCKING DEFECTS

- **N8 — Feasibility's run-1 finding count is wrong.** `feasibility.md:274` says "(39
  findings)"; run 1 produces **37** (39 is the `grep -c VIOLATION` over the whole
  `outputs.txt`, i.e. including runs 3 and 4). One number in a gate-bound evidence table;
  correct it during the B6 re-execution.

## FOLLOW-UP / NOTES

- **F4-note — `Object.defineProperty(x, "t", { get: () => svc })` is CLEAN and lands in F10
  by the letter** (the descriptor getter is an arrow *value*), though F8's own rationale
  (access, not call, triggers it) fits it better. Within the declared residual as written;
  one clarifying clause in the rule's `why` alongside the F9 runtime-graph clause would make
  the ratified text unambiguous. Not a defect.
- **F5-note — everything confirmed sound in rounds 1–3 stands.** B1–B4 closures, the
  positional bare-callee exemption (re-verified incidentally: C5/C7 clean, property-chain
  callee flags), the module-scope/function-body dichotomy, F14 wiring-bag legality (C2
  clean), acquisition-not-blindness boundary, 93-site/15-group accounting with named
  mechanisms and wave leaves, db:util/AU29 rulings (§8 both directions), atomicity audit,
  harness-registry premise, §11's single-proof e2e recipe, wave split and order, AU26 H1/H2
  supersession, 14 DI sites — none touched by the r4 diff, all re-cited intact.
- **F6-note — the strategy itself is vindicated in one direction.** This round's blocker was
  found *by* enumerating a grammar the artifact left informal — the check the adjudication
  designed. When the binding-form axis is added, the completeness argument genuinely closes:
  E-side statements, F-side flow shapes, and binding forms are all finite grammars, and R2's
  coverage claim becomes checkable end to end. One more pass of the same discipline finishes
  this; a fifth curated patch does not.

---

*Reviewer: pipeline-reviewer, fresh context, read-only on the evaluated artifacts. All
executions ran from the session scratchpad against copies of the committed probe sources;
live production files were read in place; no file was written inside the worktree except this
critique; `git status` clean at finish.*
