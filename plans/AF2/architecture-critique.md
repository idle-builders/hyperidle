# AF2 architecture-critique

Reviewer evaluation of `plans/AF2/architecture.md`. Read cold (did not author the plan). Claims independently verified against the live tree, the frozen gate, and `tsc` output measured 2026-06-10.

**Overall: 8.4 / 10 — READY (≥7).** Revise nothing as a blocker. Three findings to fold into the builder brief (one WARNING, rest NICE).

---

## Verification log (what I checked, not what I trusted)

Re-measured all seven packages under the real gate (`tsc -p packages/<pkg>/tsconfig.json`, reference-noise filtered). **Counts match the plan's table exactly:** shared 155, eslint-plugin-design 72, design-system 23, eval 20, pipeline 11, desktop 3, db 2. The plan's "spec figures predate AF1 drains; debt.json is live truth" is correct and the debt.json numbers match too.

- **Taxonomy honesty:** shared has 91 test-file `TS2532/TS18048` + 30 src `TS2532/TS18048` — the plan states 91 and 30. Node-types in shared: `TS2591`×5 + `TS2552`×2 = 7 — plan says 7. The plan's central claim ("spec framed bulk as test-strictness; **measurement contradicts**") is true and load-bearing: only 99 of ~285 errors are test index-access. This is the difference between a plan and a guess.
- **Gate shape:** `runPackage` (typecheck-gate.ts:109-115) invokes exactly `packages/<pkg>/tsconfig.json`. Confirmed. Tests live under `src/` (`packages/shared/src/__tests__/*.test.ts`) and are swept by `include: ["src"]`. The plan's Option-B-is-structurally-unavailable argument is **sound**: any test-only relaxation either splits tests out of the gate's single compile unit (un-checks tests) or forks the gate (forbidden). Verified, not asserted.
- **Stale-ratchet:** `computeVerdict` (typecheck-verdict.ts:87-89) fails on `excepted && ownErrors === 0`. The plan's "drain is gate-enforced, not optional bookkeeping" is correct — a cleared-but-undrained package FAILs.
- **tsconfig facts:** shared tsconfig has no `types`. eslint-plugin-design tsconfig has no `jsx` and includes `test-fixtures/**/*.tsx`. pipeline uses `"jsx": "react-jsx"`. All as the plan states.

---

## Per-dimension scores

### 1. Problem framing & scope fidelity — 9/10
Scope is the exact seven packages in debt.json (plan adds `pipeline`, which the spec prose omitted but debt.json owns under AF2 — the plan caught this; spec listed six, debt.json lists seven). The plan correctly treats debt.json as truth over spec prose, and re-derived counts rather than copying stale spec figures. Out-of-scope (fabric/server/web) respected. The one real decision the spec demanded (test-strictness policy) is settled and recorded. Minor: the spec's debt note "noUncheckedIndexedAccess in tests + **toon-codec**" for shared is never explicitly reconciled — toon errors are folded silently into categories C/D/E without a sentence confirming they're covered. Not a gap (they ARE covered by the taxonomy), but an un-closed loop against the spec's own words.

### 2. Decision quality (design-it-twice on the binding decision) — 9/10
The fix-all-vs-relax decision is genuinely argued both ways with a decisive structural fact (gate compiles tests inside the package's single config, so relax-for-tests is unavailable without un-checking tests or forking the gate). I tried to break it: could a `tsconfig.test.json` with `references` keep tests checked while relaxing the flag? No — the gate never reads it; it only runs the one tsconfig. Could you relax the flag package-wide just for the test-heavy packages? That regresses src too (shared has 30 real src index-access bugs the flag is catching). The plan's conclusion holds. The propagation cost to AF3-AF5 is acknowledged honestly (fabric/server have *far* more test index-access) and the plan owns that the cost "scales linearly and stays mechanical" — which is the correct trade vs. "silent test-type rot forever." This is the right binding policy. -1: the plan asserts the AF3-AF5 cost is acceptable but gives no rough magnitude (server is 3780 errors; a large fraction may be test index-access). A one-line "AF4 may surface N hundred such sites; the policy still holds but budget for it" would have made the propagation cost honest rather than waved through.

### 3. Contract & boundary integrity — 9/10
Contracts are explicit and binding: no `any`/`@ts-ignore`/`@ts-expect-error`/`as unknown as T`; no exported signature loosened; src guards vs test `!` separated with a rationale ("a test asserting on arr[0] *wants* to fail loudly"). The "fix the test's expectation, not the export — UNLESS the export is genuinely wrong" rule is exactly right for `artifact-types.test.ts`. Frozen-gate boundary is stated three times and respected — no proposal touches typecheck-gate.ts or typecheck-verdict.ts. SSRF behavior-preservation is called out with the unit tests as proof. Strong.

### 4. Completeness (file:line strategy per package) — 8/10
All seven packages have concrete per-site strategies with file:line and error code. Genuine bugs are correctly routed *in-scope* (this is a foundation track — unlike AF3+, AF2 fixes its own bugs rather than deferring). The desktop `credential-validator.ts` non-exhaustive-switch is correctly flagged as a real correctness gap the `never`-check caught, with a behavior-change warning. -2: two strategies are "investigate then fix" without a resolved direction — `event-bus.ts:106` generic cast ("may need real mapped-type work") and `eval ScenarioSeedResult.teamMembersId` (add-to-type vs wrong-field-name). These are correctly flagged as risks, but they're the two highest-uncertainty items and the plan can't bound their cost. Acceptable for a type-fix track (you can't always know the fix before seeing the type), but they're where the ~3d estimate is softest.

### 5. The ⚠️ UNVERIFIED getFilename claim — 6/10
**The flag itself is correct practice** (plan marked it UNVERIFIED per the typescript.md source-driven rule). But I verified it and the plan's *characterization of the code* is wrong, which makes its prescribed fix imprecise — see WARNING below. The discipline of flagging is good; the underlying claim needed the 5-minute check the builder is now told to do, and that check reveals the fix is "delete the dead `?? getFilename()` fallback," not "rename getFilename→filename." Scored 6 because the plan's stated fix would produce redundant code (`context.filename ?? context.filename`).

### 6. Ordering & dependency hazards — 9/10
shared-first is correct (it exports types the other six consume) and the "re-measure all six after shared drains" step is explicitly mandatory (task 5), which is the right hedge against downstream count drift. Per-package commit-with-drain keeps the gate green at each step and the diff reviewable — this is the correct interaction with the stale-ratchet (you can't drain before clearing, can't leave cleared-undrained). The config-fixes-first sequencing (clear 49 mechanical errors before touching call sites) is the right order of operations. No ordering hazard found.

### 7. Risk surfacing & honesty — 9/10
Risks section names the real soft spots: getFilename version-dependence, event-bus generic depth, desktop behavior change, re-measure mandate. The plan does not over-claim — it repeatedly says "investigate," "budget for it," "verify first." The golden-ids snapshot test is correctly nominated as the proof-of-no-behavior-change for the derive-blocks guards. This is honest engineering.

### 8. Validation & DoD — 9/10
The AC→verification table is concrete and each row is independently checkable: PASS in summary table, `jq keys` shows only fabric/server/web, grep-diff for new `any`, regression test (inject `const x: string = 123`). The "no exported signature loosened" AC is verified by both grep AND the lint rule — belt and suspenders. The regression scenario (add error to cleared package → gate FAILs) directly exercises the stale-ratchet+non-excepted-fail path. Matches the spec's validation scenarios.

### 9. Clarity & actionability for the builder — 9/10
Ordered task list is executable as-written, each step has a verification gate, required-reading list is scoped. A builder can run this without re-deriving anything. Concise, no slop. The only actionability dent is the getFilename mischaracterization (a builder following the literal instruction "rename context.getFilename() to context.filename" gets redundant code).

---

## Findings

### WARNING-1 — getFilename fix is mischaracterized; literal instruction yields redundant code
The plan (§3 eslint-plugin-design, line 113) says: *"rename `context.getFilename()` to `context.filename`."* But the code already reads `const filename = context.filename ?? context.getFilename();` at all 7 sites (`no-ai-aesthetic.ts:118`, `no-hardcoded-color.ts:123`, `require-stories-sibling.ts:53`, `no-mock-data-import.ts:61`, `no-raw-actor-fetch.ts:88`, `require-ds-attribute.ts:88`, `no-mock-data-symbol.ts:146`). Verified against resolved `@typescript-eslint/utils@8.60.0`: `RuleContext.filename` exists; `getFilename()` is **deprecated and absent from the generic `RuleContext` type used inside `create(context)`** — hence `TS2551: Property 'getFilename' does not exist ... Did you mean 'filename'?`. The correct fix is **delete the dead `?? context.getFilename()` fallback** (leaving `const filename = context.filename;`), not a rename — a rename produces `context.filename ?? context.filename`. The plan's ⚠️ UNVERIFIED flag correctly hedged the API existence, but its description of the call shape ("sites call `context.getFilename()`") is factually wrong: they call the coalesced form. **Action:** builder deletes the fallback; do not rename. 7 sites, mechanical. The API IS `filename` (verified), so the plan's destination is right; only its starting-state description and edit verb are wrong.

### NICE-1 — AF3-AF5 propagation cost is asserted, not sized
§1 fact 3 says the policy "scales linearly and stays mechanical" for fabric/server but gives no magnitude. server is 3780 errors; if a large share is test index-access, that's potentially many hundreds of mechanical `!`/narrow edits inherited by AF4 under this binding decision. The decision is still correct (the alternative un-checks tests forever), but the propagation cost should be sized honestly so AF4's estimate isn't blindsided. **Action (non-blocking):** add one line noting server/fabric may surface several-hundred such sites; policy holds, budget accordingly.

### NICE-2 — toon-codec debt note left silently folded
The spec's shared debt note names "toon-codec" explicitly; the plan never says "toon errors are category C/D/E and covered." They are (verified: `toon-codec.test.ts` errors are test index-access). A one-clause acknowledgement would close the loop against the spec's own wording. Cosmetic.

### NICE-3 — two highest-uncertainty fixes are unbounded
`event-bus.ts:106` ("may need real mapped-type work, not a one-liner") and `eval ScenarioSeedResult.teamMembersId` are correctly flagged as risks but can't be cost-bounded pre-implementation. This is intrinsic to type-fix work, not a plan defect — noted so Phase 4 review scrutinizes these two fixes hardest for sneaky `as`/`unknown` escape hatches when the "real" fix turns out painful.

---

## Verdict

**Overall 8.4/10. READY — ≥7, no revision required.** The plan's defining strength is that its measurement is real and current (every count re-verified to the digit), its binding policy decision is structurally argued and survives adversarial probing, and it respects the frozen gate absolutely. Fold WARNING-1 (delete the getFilename fallback, don't rename) into the builder brief; the three NICEs are optional polish. Carry the event-bus and eval-seed fixes forward as Phase-4 scrutiny targets for hidden type-erasure.
