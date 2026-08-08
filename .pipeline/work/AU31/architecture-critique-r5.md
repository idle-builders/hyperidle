# AU31 — Architecture critique, round 5 (post-adjudication 2: the fail-closed model, final evaluation)

Artifacts: `.pipeline/work/AU31/architecture.md` + `feasibility.md` (P11, P12) +
`probes/p12-r2-escape-predicate/`, at HEAD `9e70ac8a`, evaluated against `plan.md` (authority),
`requirements.md`, `.pipeline/AU.md`, `governance/` (README, `baseline.json`, `decided-rules.json`,
`architecture.json`, live enforcement code), `.pipeline/work/AU28/founder-rulings.md`, CLAUDE.md,
ETHOS.md, and the four prior critiques. **Every P12 claim was re-executed this session, not
read** — prototype + fixtures copied to the session scratchpad (outside the tree; no overlay at
any production path; `git status` clean at start and finish), live production files read in
place. All seven recorded runs reproduce; run 7's sweep was diffed finding-for-finding against
`outputs.txt` and is identical. Per the round's charter, the priority checks were: is the loud
kind guard real; is the carrier universe genuinely declaration-driven; do the N exclusions hold;
and — decisive — does any executed leak exist **outside** the three declared residual classes.

## Verdict: FAIL — 1 blocking finding

The fail-closed inversion is real where it was applied, and most of this artifact is now proven
ground: the loud kind guard genuinely fails loud (verified against unmodeled statement kinds of
my own choosing, not only the recorded XL1); the carrier universe is genuinely
declaration-driven (I could not construct a declared module-scope name that is not tracked); all
seven runs reproduce verbatim; the five N-table exclusions are proven, not convenient; and the
reachability judgment — a fully sound static R2 is not reachable at proportionate cost — is
honest and correctly argued. What fails is one mechanism the inversion never reached: the
**escaping-base recognizer** (`rootIdentifier`/`argRoot`, plus the for‑of loop-assign target).
Flow *collection* is structural, but flow *activation* still enumerates what IS recognized — a
bare identifier chain over property/element/non-null access — so any syntactic wrapper on the
mutation base defeats it silently. Seven executed spellings, each runtime-verified to deliver
the service symbol to a consumer and each one wrapper token away from a caught twin, record
NOTHING; none sits in any of the three declared residual classes; three of the grammar rows they
respell (F4, F5, N10) claim "caught". The ratified limit statement is therefore false as the
model executes — by the round's own standard ("a real leak outside the declared residue"), this
blocks regardless of the round count.

---

## What held — verified this session, not assumed

**(a) All seven recorded runs reproduce.** Run 1: 54 findings, one per spelling, lines and
contexts identical to `outputs.txt`; controls incl. CN1/CN2 CLEAN; exit 1. Run 2: live `app.ts`,
`service-bootstrap.ts`, `tool-handlers-bindings.ts` all CLEAN, exit 0 (B4 stays closed). Run 3:
founding target `layers/core-api/src/index.ts` flags at line 15, exit 1. Run 4: the two-line
respelling flags at line 8, exit 1. Run 5: RES1–RES8 CLEAN, exit 0. Run 6: SA1–SA10 all flag,
SR1/SR2 clean, exit 1 — the self-attack is genuine and its two clean shapes are inside the
stated residue. Run 7: 83 files (`find` count re-derived, 83), 75 CLEAN, 17 findings confined
to exactly the 8 named files, **diffed line-for-line identical** to the recorded output, zero
loud-guard fires on real code, exit 1; each of the 8 files maps to a §5/§6/§7.1 mechanism as
feasibility P12's inventory states.

**(b) The loud kind guard is real — "fail-closed" is earned at the statement-kind axis.**
Beyond the recorded XL1 (`with`), I executed two unmodeled forms of my own choosing:
`export as namespace X;` (`NamespaceExportDeclaration` — the form §7.2's E-table argues out of
grammar as declaration-file-only) and a stray decorator (`MissingDeclaration`). Both fail loud
with the fail-closed context string. The guard also fires for statements nested in blocks,
namespace bodies, and load-time IIFE/static-block bodies (`walkStatement` recursion routes them
all through the same default branch, prototype `:531-776`), and run 7 proves zero false fires
across all 83 real modules. An unmodeled future statement kind cannot pass silently.

**(c) The carrier universe is genuinely declaration-driven.** HN1–HN4 (round 4's four leaks)
flag; CN1 pins no-over-fire. My own probes: a `var` hoisted out of a `while` body, a `var`
declared inside a non-exported class's static block, a namespace-inner binding, and a
labeled-block `var` — all four tracked, all four flagged when fed a service symbol and drained
into an export. I could not construct a module-eval-declared name the model does not track.

**(d) The five N exclusions are proven, not convenient.** N11 (`for…in`): the spec yields only
property-name strings — a string cannot carry a function value; CN2 executes the exclusion and
pins it. Undeclared-name assignment: ESM is strict mode, the assignment is a load-time
`ReferenceError` — a module carrying the spelling cannot ship working; a never-executed
occurrence also never assigns, so no leak exists in either branch. Function/class expression
names: scoped to the expression body per spec. Parameters: function-body scope (F10). Labels:
not value bindings. Each exclusion is argued from language semantics, and the two attackable
ones carry executed controls.

**(e) Gate-readiness basics check out.** The diff since round-4 HEAD (`af737364..9e70ac8a`)
touches only `.pipeline/**`: architecture.md in five hunks (header, §7.2 ×3, §13.1),
feasibility's header + P12, the probe files, `progress.json`, and round 4's critique file.
Nothing confirmed-sound was reopened (§2–§6, §8–§12 body, §13.2–.8, §14 untouched). No
allowlist, carve-out, "phase 1", or transitional construct appears in the new text. Zero
changes under `governance/` or `scripts/` — no WP-identifier exposure added (pre-existing AU28
header comments predate this WP and are outside its diff). The six `progress.json`
founder-gate items are each stated in the artifact in rule-on-able terms. Worktree clean at
finish; my executions ran from the session scratchpad only.

**(f) Everything confirmed sound in rounds 1–4 stands** — B1–B4 closures, the positional
bare-callee exemption (C5/C7 clean, A10 flags — re-verified in run 1), the module-scope/
function-body dichotomy, F14's wiring bag (C2 clean), boundary-by-acquisition, the E-side
enumeration and CommonJS exclusion, the 93-site/15-group arithmetic, db:util/AU29 rulings,
atomicity audit, harness-registry premise, §11's e2e recipe, wave split, AU26 H1/H2
supersession, 14 DI sites. Round-4 N8 (the wrong run-1 count) is fixed: 54 is correct.

---

## BLOCKING

### B7 — The escaping-base recognizer is shape-listed, not structural: seven executed spellings leak the service symbol through the export surface, outside all three declared residual classes, each one wrapper token from a caught twin

The fail-closed inversion has three legs: inclusive carriers (holds — (c)), structural flow
*collection* (holds — candidates are collected from every position), and the loud guard (holds
at the statement axis — (b)). But candidate *activation* — deciding whether a collected
assignment/call touches an escaping binding — runs through `rootIdentifier`
(`r2-escape-prototype.ts.txt:266-276`), which unwraps only parentheses, property access,
element access, and non-null assertions. A type assertion, `satisfies`, comma expression, or
conditional on the mutation base makes the root unresolvable → the candidate never fires → the
RHS is never scanned → silent pass. The same helper backs `argRoot` (`:789-792`) for F5 call
participants, and the for‑of loop-assign path (`:836-840`) resolves only identifier targets, so
a destructuring for‑of head over an existing exported binding never activates at all
(`:689-697`). This is precisely the defect class adjudication 2 exists to remove — a recognizer
that enumerates what IS recognized — surviving in a third place the inversion never visited.

**The evidence — executed this session, all seven CLEAN, each runtime-verified (`node
--input-type=module`: the delivered value `===` the service symbol, all `true`; type wrappers
erase at runtime):**

```
export const l1api = {};  (l1api as any).tool = listKnowledge;              → CLEAN   // L1
export const l2api = {};  (0, l2api).tool = searchKnowledge;                → CLEAN   // L2
export const l3api = {};  (Date.now() ? l3api : l3api).tool = flagK…;       → CLEAN   // L3
export const l4api = {};  Object.assign(l4api as any, { listKnowledge });   → CLEAN   // L4
export let l5live = null; for ({ l5live } of [{ l5live: searchK… }]);       → CLEAN   // L5
export let l6live = null; for ([l6live] of [[flagKnowledgeItem]]);          → CLEAN   // L6
export const l7api = {};  (l7api satisfies object).tool = listKnowledge;    → CLEAN   // L7
```

**The one-token flips (executed):** `l1api.tool = listKnowledge` flags (F4/X11's own pattern);
`(l1api as any).tool = listKnowledge` does not. `Object.assign(t4api, { searchKnowledge })`
flags (F5/X12); with `as any` on the first argument it does not. `for (t5live of
[listKnowledge]);` flags (XP4); the destructuring head of the same semantics does not. By
round 4's own criterion — ratified into this revision — a predicate whose verdict flips on
those deltas has not narrowed deliberately; it has an unenumerated axis.

**Why this blocks, under this round's stated standard.**

1. **It is a real leak outside the declared residue.** None of L1–L7 is a function-like body
   (class 1), a mutation through a module-scope *alias* (class 2 — no alias binding exists;
   `(l1api as any)` is the same binding under a type wrapper), or a non-export side channel
   (class 3). The limit statement's sentence "Every module-evaluation expression position …
   is walked for assignment and call flow" (`architecture.md:724-729`) is true of collection
   and false of activation; "The review territory is exactly three executed classes"
   (`architecture.md:732`) is false as the model executes — the fifth consecutive round.
2. **Three claimed-caught rows are false.** F4 "property/element mutation whose base chain
   roots at an escaping binding … caught" (`architecture.md:664`) — L1/L2/L3/L7 are exactly
   that mutation, spelled through wrappers the model's own scanner already treats as
   transparent (`scanEscaping` descends `as`/`satisfies` at `:375-378`; only the activation
   side does not). F5 "any argument roots at an escaping binding — all arguments scanned …
   caught" (`architecture.md:665`) — L4. N10 "a for…of over an existing target is an
   assignment per iteration … caught (XP4)" (`architecture.md:647`) — L5/L6 are the
   destructuring form of the identical semantics, and F3 claims destructuring assignment
   caught (`architecture.md:663`).
3. **A faithful build ships the false green.** §7.2: the P12 prototype "is the executed
   model"; feasibility P12: "The builder implements R2 against this executed model." The rule
   would stay green on `(api as any).tool = svc` — among the most ordinary TypeScript
   spellings in existence — forever, which is `plan.md:7`'s exact failure mode, and the
   founder would ratify a false exhaustiveness claim at §13.1 (round-1 D3/B3's failure mode).
   Governing authority: plan AC #1/#3/#5 (`plan.md:47-51`), validation scenarios
   (`plan.md:57-61`), `governance/README.md` properties 1 and 4.

**What resolution requires (finding, not design) — narrow, mechanical, reopens nothing.**
(i) Make escaping-base resolution structural, mirroring the transparency the scanning side
already has: `rootIdentifier`/`argRoot` see through parenthesized/`as`/`satisfies`/non-null/
comma/conditional (for comma and conditional, conservatively: any branch rooting at an
escaping binding activates — over-fire is the ratified failure direction). (ii) Route
destructuring for‑of heads through the existing `collectTargetNames` machinery F3 already
uses (`:811-818`), exactly as loop-assign identifier targets ride today. (iii) Add L1–L7-class
spellings to the attack fixture with member ids; keep the unwrapped twins as attacks and the
existing controls clean; re-execute all seven runs (run 2's three live files and run 7's 83
must stay at their current verdicts); restate the F4/F5/N10 rows and §7.3/§13.1 only from what
the re-executed model catches. This does not touch the carrier universe, the statement walk,
the loud guard, the E/N tables' membership, B1–B4, the positional exemption, F14, or the
residual classes — the three-class structure survives; the activation predicate has to reach
the same transparency standard the rest of the model already meets.

---

## NON-BLOCKING DEFECTS

- **N9 — The class-3 parenthetical under-describes the side-channel residue.** Executed:
  `import { registry } from "@hyperidle/shared"; registry.tool = listKnowledge;` records
  nothing (correct — the symbol leaves through *shared's* surface, not this module's, and
  F12's table verdict "outside R2 — not the export surface" covers it on principle). But the
  ratified verbatim text characterizes class 3 as "globals and any name not declared at
  module scope" (`architecture.md:738-740`) — an import binding IS declared at module scope,
  so the spelling sits outside the letter of the class the founder ratifies. One clause
  ("any channel other than the module's own export surface — globals, and mutable state
  owned by another module") makes the ratified text match the principle. Fold into the B7
  restatement.
- **N10 — `progress.json` gate bookkeeping is one round behind.** `architectureCritiqueHistory`
  ends at round 3 and `artifacts.architectureCritiques` omits `-r4.md` (and will omit this
  file); the founder reading the gate register should see the full five-round history and
  both adjudications in one place.

## FOLLOW-UP / NOTES

- **F7-note — the round's four charter questions, answered plainly.** (1) The loud kind guard
  is real and earned — executed against unmodeled kinds of the reviewer's own choosing, zero
  mis-fires on 83 real modules — but it guards the statement-kind axis only; B7 shows
  "fail-closed" is not yet a whole-model property, because the activation recognizer fails
  open. (2) The carrier universe is genuinely declaration-driven — no counterexample found.
  (3) The fifth limit statement is FALSE — not because its residue is wide, but because L1–L7
  leak outside it. (4) The reachability verdict — fully sound static R2 not reachable at
  proportionate cost — is honest and stands: the three named requirements (launder-vs-boot
  body discrimination = a banned allowlist; alias points-to; a closed global model) are each
  genuinely required for zero residue and each disproportionate. B7 does not weaken that
  judgment; it shows the *reachable* version was not fully reached — every L-spelling is
  fixable syntactically, with no pointer analysis and no allowlist.
- **F8-note — recommendation for the parked decision.** Both adjudications are spent, so this
  verdict parks AU31 at the founder gate with the standing findings. For that ruling: B7 is
  the narrowest blocker of the five rounds — one recognizer, a mechanical fix, everything
  else in the artifact independently verified sound this session — and it is exactly framed
  by the open `founderScopeQuestion` (R2's generality vs. its founding case). If the founder
  scopes R2 down, B7's territory shrinks with it; if the founder keeps full generality, B7's
  resolution path is executed above. Either ruling can proceed from this artifact without
  discarding any confirmed-sound work.

---

*Reviewer: pipeline-reviewer, fresh context, read-only on the evaluated artifacts. All
executions ran from the session scratchpad against copies of the committed probe sources; live
production files were read in place; runtime leak checks ran under `node --input-type=module`
with local stand-ins for the service symbols; no file was written inside the worktree except
this critique; `git status` clean at finish.*
