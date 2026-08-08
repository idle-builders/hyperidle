# AU31 — Architecture critique, round 3 (final routine evaluation)

Artifacts: `.pipeline/work/AU31/architecture.md` + `feasibility.md` (P11, P12) +
`probes/p11-composition-spelling/` + `probes/p12-r2-escape-predicate/`, at HEAD `f524abd9`,
evaluated against `plan.md` (authority), `requirements.md`, `.pipeline/AU.md`, `governance/`
(README, `baseline.json`, `decided-rules.json`, `architecture.json`, live enforcement code),
`.pipeline/work/AU28/founder-rulings.md`, CLAUDE.md, ETHOS.md. Prior rounds:
`architecture-critique.md` (B1–B3), `architecture-critique-r2.md` (B4). **Every P12 claim was
re-executed in this session, not read**: the prototype was run from a temporary worktree overlay
(created and deleted; `git status` clean at finish) against the committed fixtures, the three live
end-state files, and the founding target — all four recorded outputs reproduce verbatim — plus two
adversarial fixtures of my own. Items confirmed sound in rounds 1–2 (B1–B3 closure,
acquisition-closure boundary, 93/15 arithmetic, db:util and AU29 rulings, atomicity audit,
harness-registry premise, split order, AU26 H1/H2 supersession, 14 DI sites) were not reworked.

## Verdict: FAIL — 1 blocking finding

The B4 repair's *idea* is right and its narrowing is principled: escape-through-the-export-surface
is what R2 is for, the one positional exemption survived every callee-position attack I could
construct, and the three planned-legal end-state sites are genuinely clean. What fails is the
repair's *proof and its enforcement set*: the executed model — which §7.2 and P12 both declare the
builder's implementation reference — never checks the export surface's own direct spellings. Four
one-line escapes record nothing, and one of them respells the rule's founding case
(`core-api/src/index.ts:15`) to green in two semantically identical lines. The ratified limit
statement ("escaping module-scope spellings are caught mechanically") is therefore false as the
model executes, and the 13-case attack set the founder ratifies would pin the hole open forever.

---

## The B4 repair, judged

**(a) All recorded P12 outputs reproduce.** Run in this session at HEAD:

- Run 1: `fixture-attacks.ts` → **13/13 flagged**, one finding per spelling (including the four
  exemption-stressing spellings: identity-wrap `wrap(list)` via call-argument scan, `.bind(null)`
  via non-exempt property-chain callee, two-hop alias via transitive escape, namespace escape);
  `fixture-controls.ts` → CLEAN, exit 1 overall. Verbatim match with `outputs.txt`.
- Run 2: live `layers/core-api/src/app.ts`, `service-bootstrap.ts`,
  `services/tool-handlers-bindings.ts` → all three CLEAN, exit 0. Match.
- Run 3: live `layers/core-api/src/index.ts` → VIOLATION line 15
  (`export … from "@hyperidle/knowledge"`), exit 1. Match.

**(b) The one positional exemption HOLDS.** I attacked direct-callee position with every spelling
I could construct: tagged template (`` listKnowledge`q` `` — flagged via generic recursion, the tag
is not a CallExpression callee), comma-operator callee (`(0, listKnowledge)()` — flagged, the
unwrapped callee is not a bare identifier), parenthesized callee (exempt, correctly — still a bare
call), property-chain callee (flagged, per design), service symbol in its own argument list
(flagged — arguments are scanned even under an exempt callee), IIFE bodies (scanned). No static
spelling launders the *symbol* through bare-callee position; the only residue is runtime object
graphs (`new ServiceClass()` → `instance.constructor`; produced values closing over service
internals), which applies identically to all face-produced composition values and so is not a
defect of the exemption specifically (note F2). **Verdict: the exemption is sound.**

**(c) "Non-escaping module-scope wiring is legal composition" is a principle, not a shape fitted
to the three sites.** R2's scope is the layer root's face-reachable modules — modules whose entire
job is composing the layer's own services into a public surface. A module-scope binding that never
reaches the export surface is unobtainable by any face consumer; the only remaining route to the
symbol is through an exported function's body, which the dichotomy already assigns to review.
Firing on non-escaping references would measure "wiring written at module scope" (a style
property) instead of "symbol leaked" (the boundary property) — and would push the same wiring into
function bodies, where the rule sees strictly less. The two new control twins (the non-escaping
bag; the bare-callee call result) mechanically pin the narrowing against re-widening. Sound —
**with the caveat that the argument's load-bearing premise ("the only remaining route is a
function body") requires the export-surface arm to be complete, which is exactly where B5 sits.**

**(d) Under-fire check against the founding spellings.** The value re-export
(`export { x } from "<service>"` — attack A1, and the live founding target, run 3) and the named
constant (`export const a3 = list` — A3) are caught. The call-wrapping function
(`export const listKnowledge = (db) => list(db)`) is **not** mechanically caught — but that is not
a reopening: it was outside attempt 2's widened predicate too ("outside a runtime function body"),
was explicitly adjudicated review territory in round 1's B3 resolution, and is held by the three
ratified holds (small export map, knip, reviewer lens). The narrowing changed nothing here.

---

## BLOCKING

### B5 — The executed model and the ratified attack set never check the export surface's own direct spellings; the founding case respells to green in two lines

**The evidence — executed this session, one line each, all recording NOTHING:**

```
export { listKnowledge };                                        // X1 — named export of the imported binding
export const { searchKnowledge: launder } = { searchKnowledge }; // X2 — destructured export
export const [launder2] = [flagKnowledgeItem];                   // X3 — array-destructured export
export let live = undefined; live = searchKnowledge;             // X4 — assignment to an exported live binding
```

And the decisive respelling — the founding case `layers/core-api/src/index.ts:15`
(`export { list as listKnowledge } from "@hyperidle/knowledge"`, which run 3 flags) rewritten as:

```
import { list } from "@hyperidle/knowledge";
export { list as listKnowledge };
```

→ **CLEAN, exit 0** under the executed model. Two lines, semantically identical to today's one
(same symbol, same face, same consumers), zero findings. `export { listKnowledge as default };` is
the same hole.

**Where the hole is.** The prototype's escape-marking pass records named-export locals into
`escaping` (`r2-escape-prototype.ts.txt:102-109`) but the worklist processor only ever consults
`topLevelInits` / `topLevelClasses` (`:199-207`) — an escaping name is never tested against
`serviceBindings`, so an imported service binding that *is itself* the export escapes unexamined.
Destructured declarations are skipped outright (`:113`, the prototype's own comment:
"destructuring: out of prototype scope"), and pass 2 scans initializers only, so a module-scope
assignment to an exported live binding (X4) is invisible.

**Why this blocks, under this pipeline's own settled standard.**

1. **The executed model is normative, by the artifact's own words.** §7.2: "the [P12] prototype …
   **is the executed model**"; feasibility P12's verdict: "**The builder implements R2 against
   this executed model**." A faithful builder ships the hole.
2. **The attack set the founder ratifies pins the hole open.** §7.2 enumerates thirteen attacks
   and five controls as the exhibits (§13.1) and the break-tests (`governance/README.md:110-125`
   property 1). None of X1–X4 is among them. A shipped rule missing these spellings stays green on
   every lint run forever — the exact failure mode the plan is built on (`plan.md:7`: a guard
   reporting zero findings while the boundary sits open).
3. **The ratified limit statement is refuted in one line.** §7.3/§13.1: "escaping module-scope
   spellings are caught mechanically." X1 is an escaping module-scope spelling — the purest one,
   the predicate prose's own "(c) … a named export" — and the executed model records nothing.
   Round 1's B3 blocked the previous limit statement on exactly this reasoning with exactly this
   class of evidence; the same standard applies to its successor.
4. **The founding case is clearable by respelling instead of fixing.** Post-AU31, the two-line
   rewrite above would satisfy R2-as-executed while laundering the identical symbol — AC #1/#3's
   enforcement (which rides these rules per §10 rows 1/3) would be vacuously satisfiable at the
   rule's own founding site.

No other planned mechanism catches X1–X4: R2(a)/(b) require a module specifier; the layer root
importing its own service is legal (that is how `app.ts:12` works today); the shrunken export map
does not bite (X1 rides the `.` face module); knip passes the moment a consumer exists — which is
the laundering scenario by definition.

**What resolution requires (finding, not design).** The predicate prose of §7.2 already covers
these spellings ("exported directly (… a named export …)"; the destructured initializer is an
escaping module-scope expression) — the gap is in the executed model and the enumerated attack
set, not the concept. Resolution is narrow: (i) extend the executed model so escape-marked names
are tested against service bindings, destructured exported declarations are scanned, and
module-scope assignments to escaping bindings are scanned; (ii) add the spellings — at minimum X1,
`export { x as default }`, X2/X3, X4, and the two-line founding-case respelling — to the attack
fixture and the §7.2 ratified attack set; (iii) re-execute P12 and restate §7.3/§13.1's limit
sentence only from what the re-executed model actually catches. The narrowing itself, the
exemption, and the control twins need no change — nothing in this finding reopens B4.

Governing authority: plan AC #1/#3/#5 (`plan.md:47-51` — these rules are the enforcement the ACs
ride), plan validation scenarios (`plan.md:57-61`), `governance/README.md:110-125` (property 1:
every attack must produce its finding) and `:138-141` (the founder ratifies rule texts — a gate
fed a false "caught mechanically" claim is round 1 D3/B3's failure reproduced), `plan.md:7`.

---

## NON-BLOCKING DEFECTS

- **N6 — The executed model contradicts the ratified dichotomy in the other direction too:
  object-literal getter/method bodies are scanned.** Executed:
  `export const api = { get list() { return listKnowledge; } };` and
  `export const api2 = { m() { return searchKnowledge; } };` both **flag** ("initializer of
  escaping binding `api`"), because only arrow/function-expression and class-method bodies are
  exempted from the generic recursion (`r2-escape-prototype.ts.txt:177-189` vs `:196`) — object
  literal method/accessor declarations fall through `ts.forEachChild`. §7.3 declares "a getter or
  method body … run[s] on a consumer's call" review territory. So the two normative sources
  disagree: the statement says these are missed; the model catches them. Safe direction for
  laundering (the getter launder is real), but a legitimate composition bag with method bodies
  referencing service bindings in non-callee position would over-fire, and the founder would
  ratify a statement the executed model does not implement. Align one to the other (either scan
  none of the deferred bodies, or say the object-literal accessor/method case is caught) before
  the gate — cheap, and naturally folds into B5's re-execution.
- **N7 — `export =` is unhandled by the prototype but moot in this tree.** The prototype skips
  `export = …` (`:128`, `!stmt.isExportEquals`). Under the packages' ESM/NodeNext compilation the
  spelling is a hard `tsc` error, so no production file can carry it; worth one line in the rule's
  `why` so a future module-format change does not silently open it. Not a live hole.

## FOLLOW-UP / NOTES

- **F1 — Everything else re-verified this round holds.** The r3 commit touched only the header,
  §2.5's test decomposition ([N3] — the cross-cutting `return-status-tool` test now has a named
  destination in both halves; genuinely closes N3), §4 ([N2] honest namespace-respelling limit;
  [N5] precise clause-6/empty-baseline citation), §7.2/§7.3 (the B4 repair), and §13.1/§13.3 —
  diff-verified hunk-by-hunk. §2's per-service verdicts, §3's port contract, §5/§6's relocation
  map, §10's 93-site/15-group accounting (all sites still carry a named mechanism and a named wave
  leaf), §11's e2e plan (intake via seam status route, execution via terminal-with-return — which
  cannot occur without the relocated bridge — landing via core's API; the false second proof stays
  withdrawn), and §12's wave/leaf split (tool-handlers in wave B only; `service-bootstrap.ts` the
  single two-wave file; A/B file-disjoint otherwise) are all unchanged from the state round 2
  verified. Round-2's N1–N5 are each genuinely absorbed at the marked sites.
- **F2 — Runtime object graphs are the exemption's honest outer limit, shared with all
  composition.** `export const inst = new ServiceClass()` (exempt bare callee) yields
  `inst.constructor === ServiceClass`; any produced value can close over service internals. The
  §7.2 justification "the symbol does not flow into its own call's result" is literally false for
  `new` — but counting runtime reachability as laundering would condemn every face-produced value
  and make composition impossible, so this is correctly outside a static rule. One clarifying
  clause in the rule's `why` ("R2 governs static binding escape, not runtime object graphs") would
  make the ratified text unambiguous. Not a defect.
- **F3 — No transitional construct anywhere.** Grep-verified: every occurrence of
  allowlist/carve-out/"phase 1"/transitional/deferred in the artifact is a restatement of the
  prohibition, not an instance. The "exactly one exemption, positional, never named" is predicate
  grammar, not an exemption apparatus — it names a syntactic position, never a symbol, file, or
  method. WP-id hygiene: the branch touches nothing outside `.pipeline/**`; `governance/` and
  `scripts/` carry no WP identifier at HEAD; the §7.2 [N4] naming-hygiene obligation for the
  wave-B4 attack cases is retained.

---

*Reviewer: pipeline-reviewer, fresh context, read-only on the evaluated artifacts. P12 was
re-executed from a temporary worktree directory (`.critique-scratch/`, deleted after execution);
two adversarial fixtures were run the same way; `git status` clean at finish. Only this file was
written.*
