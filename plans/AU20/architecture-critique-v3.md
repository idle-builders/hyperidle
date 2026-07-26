## Architecture Critique: AU20 corrective v3 — post-concept change-map amendment

ARCHITECTURE-SCORE: 5/10  amendment-rounds=2  score-line: SA:7 IM:5 LI:7 AC:6 DM:8 N:7 MD:6 FMC:5 S:6 V:6 FE:5

VERDICT: REVISE

### Mechanical audit

- **PASS:** 604 exact unique identities; browser 588 and system 16 sets equal source ledgers.
- **PASS:** four diagnostic artifacts cover the exact former-unresolved set: 42 + 43 + 72 + 24 = 181 unique, zero missing/extra/overlap.
- **PASS:** no heuristic/default resolver remains (`resolveUnresolved` returns unresolved); every former unknown currently receives a diagnostic record.
- **PASS:** source-ledger, four diagnostic, generator and canonical payload SHA-256 values validate. Regeneration is byte-identical.
- **PASS:** ordinary validator succeeds; `--require-review` fails because `acceptedReview:null` and `writeTestsLocked:true`.
- **PASS:** all five critical, four warning and two desktop-gap identities are present.
- **NOT ACCEPTED:** reported disposition counts 273 none, 32 feature regression, 112 move, 156 stale, 24 prerequisite, 4 architecture obligation, 1 static violation, 2 proof gaps. Evidence/type defects below change those counts.

### CRITICAL

- [diagnostics `ui-a-l`/`ui-m-s`; map `missing_prerequisite`] Twenty-two browser identities are classified `missing_prerequisite` without an external prerequisite. Fifteen Knowledge cases are repository-owned skipped seed/fixture work; six keyboard/synthesis cases are explicit skipped tests or missing eligible fixtures; the AH3 default identity is an explicitly skipped live-key case. Their first boundaries describe stale/disabled test setup, selectors, or fixtures—not a missing binary, credential, or external service. Only the AH5 named live lane and system OpenRouter identity establish the real external prerequisite. → Reclassify the 22 repository-owned cases as `stale_test_mock`/test-fixture correction (or a narrower evidence-backed state), leaving **2** missing prerequisites. Pin the exact fixture/skip removal and ensure every formerly skipped identity executes after correction.
- [diagnostics UI summaries and evidence authority] Both human diagnostic summaries contradict their JSON: `ui-a-l.md` says 19 stale + 1 harness defect while JSON says 20 stale + 0 harness defect; `ui-m-s.md` says 30 stale + 1 harness defect while JSON says 31 stale + 0 harness defect. More importantly, both explicitly invalidate their browser probe because of shared-port contention, then use 58/58 and 161/161 imported component/unit tests to disposition 85 E2E journeys. Component green can support a selector/fixture hypothesis but cannot prove end-to-end routing, request, persistence, focus, responsive, or rendered behavior for each case. → Regenerate consistent summaries and add isolated, same-journey browser evidence (or exact terminal evidence already proving the precondition boundary) per cohort before final disposition. Do not infer E2E health from imported-component green.
- [former-unresolved `none` cohort] Forty-six formerly unrun BR-LANE identities are changed to `none` from one 9-file focused run, but the review artifact only gives aggregate `50 expected / 24 unexpected`; the map entries use `firstDivergentBoundary: none` and candidate test file, without per-ID terminal artifact/status detail. Since “none” removes them from corrective action, each must bind its actual focused pass observation. → Add run/result identity evidence (attempt/run ID, reporter record, status, artifact hash) to every one of the 46 `none` entries and validate it; aggregate prose is insufficient.
- [Q1 and exact causal target contract] Q1 is plausibly a real regression, but its diagnostic causal symbol is the vague `packages/web/src conversation/session activity panel close handler`; the map's `changeOwner` names `SessionActivityPanel.tsx` while `candidateFiles` contains only the E2E spec. This violates the map's own exact causal location contract. Several cohort entries similarly carry broad repeated symbols rather than the first observed owning symbol. → Put the exact production file/symbol in `candidateFiles`, reconcile owner/layer, and make the red proof distinguish close-state logic from overlay interception before `/write-tests`.

### WARNING

- [AH6 cohort] AH6 localization is materially improved: correct named lane accepts the message and paints Thinking; three inventory failures show no terminal AI/tool output; web/spec/config A/B is unchanged. However the proposed production boundary still names two alternatives (`bootAgentLayer/wake` or `runAssistantTurn`) rather than the first broken persisted intent/request transition. → Before build selection, bind an intent/request timeline to one owning symbol or split the red proof into ordered orchestration/dispatch probes; do not give both services one speculative production increment.
- [generated Markdown] `corrective-change-map.md` still states “remaining runtime ambiguity becomes product regression,” which is the rejected round-1 policy and contradicts the revised generator/architecture. → Generate the current no-default, diagnostic-only rule.
- [validator completeness] Hash and identity validation are strong, but it does not validate disposition-specific semantics: external prerequisite shape, passing observation for `none`, production candidate inclusion for feature regressions, or human-summary consistency. → Add closed per-disposition validation before accepted review embedding.

### Corrected counts from current evidence

At minimum, the 22 false prerequisite labels move to repository-owned stale test/fixture correction:

| Target state | Count |
|---|---:|
| none | 273 |
| feature regression | 32 |
| intentional move | 112 |
| stale test/mock | **178** |
| missing prerequisite | **2** |
| architecture obligation | 4 |
| static contract violation | 1 |
| proof gap | 2 |
| **Total** | **604** |

The 46 newly proven `none` and remaining UI dispositions still require stronger per-ID E2E evidence before these totals can be accepted as the final reviewed map.

### What's Working Well

- Round-1 bulk-default failure is removed. Diagnostics now name first boundaries/actions, and core/work, Q1, Unblock, lane collection, and AH6 have materially better localization.
- Trusted historical harness operation is no longer used to label execution states as harness defects. Shared-port `ECONNREFUSED/RESET` evidence is explicitly excluded. Zero harness repairs remains plausible, but only after the evidence gaps above close.
- Review-hash mechanics correctly keep `/write-tests` locked; no accepted review was embedded.

### Gate

Return exact entries to architecture revision. Do not write `acceptedReview`, do not clear `writeTestsLocked`, and do not begin `/write-tests`.

---

## Architecture Critique: AU20 corrective v3 — post-concept change-map amendment, round 3

ARCHITECTURE-SCORE: 6/10  amendment-rounds=3  score-line: SA:8 IM:5 LI:8 AC:7 DM:8 N:8 MD:7 FMC:5 S:7 V:6 FE:6

VERDICT: REVISE

### Mechanical audit

- **PASS:** deterministic regeneration is byte-identical for both JSON and Markdown.
- **PASS:** ordinary validation exits 0 with 604 identities, exact 181-diagnostic coverage, zero unresolved, payload SHA-256 `bef9166a3e56d55cfbb5073761fda6d8a1b4af42b38dd8618f7194430ee6da47`, `acceptedReview:null`, and `writeTestsLocked:true`.
- **PASS:** `--require-review` fails closed while the accepted-review binding is absent.
- **PASS:** proposed counts now reconcile to 273 none, 32 regressions, 112 moves, 178 stale tests/mocks, 2 named external prerequisites, 4 architecture obligations, 1 static-contract violation, and 2 proof gaps. Zero harness defects.
- **PASS:** UI JSON/Markdown summaries agree: `ui-a-l` is 6 move + 36 stale; `ui-m-s` is 6 move + 37 stale. Their text correctly limits imported green tests to hypothesis support.
- **PASS:** all 46 formerly unrun/no-change identities bind per-ID passed reporter observations to `lane-focused-report.json`; its observed SHA-256 is `ddf13d2e92710dff2e8da77a38b6795c9a08eb24e3d4c7fd1044570ff566e949`.
- **PASS:** only AH5 live and system built-in harness retain the named `OPENROUTER_API_KEY` prerequisite.

### CRITICAL

- [generator diagnostic schema; five feature-regression identities] The diagnostics use `causalFileSymbol`, but the generator reads only `exactSymbols`. Five regression entries therefore discard their reviewed causal locations and regenerate fallback owners/symbols:
  - Unblock focus maps to `playwright.config.ts:web-e2e-lane-ownership` instead of `WorkBet.tsx handleAction(unblock)`.
  - Q1 AC9 maps to `SessionActivityPanel.tsx:session-lifecycle-projection`, with only the E2E spec in `candidateFiles`, instead of the proven `packages/design-system/src/SplitView.tsx:237` overlay.
  - All three AH6 failures map to `CocOverlay.tsx:assistant-cassette-and-api`, with only the E2E spec in `candidateFiles`, instead of `session-requests resolveIntentInputInternal -> requireRunnableActor`.
  
  This is not presentation drift: it assigns production changes to the wrong package/service and defeats the architecture's one-owning-boundary sequencing. Normalize the diagnostic schema or teach the generator to consume `causalFileSymbol`; set `changeOwner`, `causalSymbol`, and `candidateFiles` from that exact production location. Add validator assertions that the generated fields equal the diagnostic causal field for every diagnosed feature regression.

- [validator false assurance] The new semantic validator checks only that a feature-regression symbol contains `:` and is not an E2E path. That accepts all five fabricated fallback symbols above while rejecting none of the lost diagnostic evidence. Its stale-test checks likewise do not establish diagnostic-to-map semantic preservation. The hash proves reproducibility of the wrong projection, not correctness. Add exact diagnostic projection validation for causal owner/symbol/candidates and fail regeneration when a diagnostic field is unconsumed or ambiguously mapped.

### WARNING

- [accepted-review handoff] No accepted-review artifact was created because the reviewed payload still contains wrong causal ownership. Preserve `acceptedReview:null` and `writeTestsLocked:true`; after correction, regeneration changes the payload hash and requires a fresh independent review rather than embedding this round's hash.

### What's Working Well

- The prior round's 22 false prerequisites, UI summary contradictions, 46 reporter-evidence gaps, rejected ambiguity wording, and AH6 diagnostic localization are corrected at their source.
- Exact identity accounting, evidence hashes, deterministic generation, and fail-closed review locking are strong.
- The remaining defect is narrow but blocking: the generator drops the exact causal evidence precisely where the implementation plan needs it.

### Gate

Return the generator/validator projection defect to architecture revision. Do not create an accepted-review artifact, do not write `acceptedReview`, do not clear `writeTestsLocked`, and do not begin `/write-tests`.

---

## Architecture Critique: AU20 corrective v3 — post-concept change-map amendment, round 4

ARCHITECTURE-SCORE: 9/10  amendment-rounds=4  score-line: SA:9 IM:9 LI:9 AC:9 DM:9 N:9 MD:9 FMC:9 S:9 V:10 FE:9

VERDICT: ACCEPT

### Mechanical and semantic audit

- **PASS:** exact 604/604 unique identities, 588 browser + 16 system; exact 181 formerly unresolved diagnostic union; zero unresolved and zero harness defects.
- **PASS:** final dispositions reconcile to 273 none, 32 feature regressions, 112 intentional moves, 178 stale tests/mocks, 2 named external prerequisites, 4 architecture obligations, 1 static-contract violation, and 2 proof gaps.
- **PASS:** generator reproduced JSON and Markdown byte-for-byte. Base validator exits 0. Review-required validation remains fail-closed until the accepted-review binding is embedded.
- **PASS:** source-ledger, four diagnostic, generator and canonical payload hashes validate. Reviewed payload SHA-256 is `76a632f2d8513b359f063dc072f1a057d356889fdea4649667e865bc76dad041`.
- **PASS:** standardized `regressionProjections[].exactSymbols` has exactly 32 unique records for 32 feature regressions. Every generated `exactSymbols`, `changeOwner`, `candidateFiles`, and `requiredRedProof` equals its source projection; no fallback is reachable and all projected files exist.
- **PASS:** exact special anchors are retained: Unblock → `WorkBet.tsx handleAction(unblock)`; Q1 AC9 → `SplitView.tsx:237` fold-back/reset overlay; AH6 S1–S3 → `session-requests resolveIntentInputInternal -> requireRunnableActor`.
- **PASS:** prior round constraints remain closed: 46 per-ID focused passes and reporter hash; consistent UI summaries and evidence language; only two real OpenRouter prerequisites; no rejected ambiguity default; all five critical, four warning and two desktop-gap system identities.
- **PASS:** deep samples across none, intentional move, stale test/mock, prerequisite, architecture obligation, static violation, and proof-gap classes preserve exact first boundary, owner/action, required proof, and ordered dependency semantics.

### Findings

No critical or warning findings remain. The map is sufficiently exact to drive `/write-tests` without asking builders to rediscover architecture or choose between speculative owners.

### Accepted review binding

- Artifact: `plans/AU20/register-reviews/corrective-change-map.md`
- Artifact SHA-256: `d08d48e4dd9526f8ca82b760a7b473b95c7590191c71224e71f3733d2e7681ee`
- Reviewed payload: `76a632f2d8513b359f063dc072f1a057d356889fdea4649667e865bc76dad041`
- Verdict: `accept`

The planner must embed the artifact's computed SHA-256 plus this exact payload hash in `integrity.acceptedReview`, clear `writeTestsLocked`, and run `validate-corrective-change-map.mjs --require-review`. Any payload change requires a fresh independent review.

---

## Architecture Critique: AU20 proof-inventory trust amendment

ARCHITECTURE-SCORE: 9/10  amendment-rounds=1  score-line: SA:9 IM:9 LI:10 AC:9 DM:9 N:9 MD:9 FMC:9 S:9 V:9 FE:9

VERDICT: ACCEPT

### Narrow audit

- **PASS — unforgeable composition:** `createFilesystemReviewVerifier` captures repository root, accepted-review root, actor manifest, and builder identity at repository-owned composition. `createValidationContracts({ reviewVerifier })` captures that instance for both payload unlock and lineage. Claims cannot inject trust configuration.
- **PASS — canonical filesystem boundary:** root, accepted root, manifest, and artifact use `realpath`; regular-file checks and canonical containment reject nonfiles, traversal, lexical-prefix siblings, and escaping symlinks before trusted bytes are read.
- **PASS — actors and content:** canonical artifact path selects reviewer identity from the repository manifest; claim identities must match trusted reviewer/builder values; reviewer differs from captured builder; artifact bytes/hash, verdict, and canonical payload or lineage hash must agree.
- **PASS — proportional design:** one verifier interface plus one filesystem factory; no signatures, certificates, key distribution, or PKI.
- **PASS — strict retry causality:** every earlier attempt must terminalize before the next starts, with `endedAt <= next.startedAt`. Unmatched earlier starts remain incomplete/unrun and later results are non-authoritative. Duplicate/conflicting/early terminals, overlaps, and retry after pass/block fail hard.
- **PASS — executable handoff:** ownership names exact source/composition/contract/reconcile files and exact red cases. Feasibility uses available Node primitives. Because the previously accepted red proof predates this amendment, the next stage is amendment `/write-tests` and independent red review, not implementation.
- **PASS — preserved classification:** deterministic JSON/Markdown regeneration is byte-identical; base validator exits 0; the 604-case payload remains `76a632f2d8513b359f063dc072f1a057d356889fdea4649667e865bc76dad041`; classification review remains `d08d48e4dd9526f8ca82b760a7b473b95c7590191c71224e71f3733d2e7681ee`; amendment review is null and write-tests is correctly locked.

### Findings

No critical or warning findings.

### Gate

Accepted artifact: `plans/AU20/register-reviews/proof-inventory-architecture-amendment.md`, SHA-256 `18efb793121eb20f53063c0ffe0db628d16b559d07af160b651e0525be23c8c2`. Planner must embed it against architecture SHA-256 `9cd55b5634cac06ac01ac9638f452128191b5583250cf9861e0aa8fe6af61f7f` and feasibility SHA-256 `972be13a717cc2b6c3250cce208cffe228ada65694febe96bbf6d56feea18ff5`, preserve the existing classification binding, then unlock only the amendment `/write-tests` stage through amendment-aware validation.

---

## Architecture Critique: AU20 proof-inventory trust amendment R3

ARCHITECTURE-SCORE: 7/10  amendment-rounds=1  score-line: SA:9 IM:8 LI:10 AC:7 DM:6 N:9 MD:8 FMC:8 S:9 V:8 FE:9

VERDICT: REVISE

### Narrow audit

- **PASS — replacement-only API:** architecture requires physical deletion of exported `ReviewTrust`, standalone `assertReviewedPayloadUnlocked`, and authority-bearing free `buildValidationInventory`; no alias, deprecation, or compatibility wrapper survives. All callers migrate to the closures returned by `createValidationContracts({ reviewVerifier })`. Net trust-path LOC must decrease.
- **PASS — one captured authority:** repository composition creates one filesystem verifier before request parsing. Payload unlock and lineage/inventory use that same captured verifier; claims cannot inject resolver, root, manifest, bytes, or trusted actors.
- **PASS — artifact and manifest integrity:** manifest hash is repository-pinned; entries bind canonical relative path, artifact hash, payload hash, reviewer and accept verdict. Duplicate paths and artifact+claim rewrites are explicit red cases.
- **PASS — descriptor-stable local verification:** canonical roots and files use realpath containment, one read-only descriptor, `fstat`/path device+inode comparison, same-descriptor Buffer read, post-read metadata comparison, and hashing/returning those exact bytes. `O_NOFOLLOW` is conditional where supported, so the plan remains valid on Node/macOS without pretending it is the sole containment mechanism.
- **PASS — proportionality:** filesystem factory + captured contract factory only; no signatures, certificates, key management, or parallel trust subsystem.
- **PASS — migration and simplification gates:** exact files, all former callers, static export/caller enforcement, runtime tamper cases, net-negative trust-path LOC, and strict retry causality are named in one increment.
- **PASS — preserved prior decisions:** deterministic regeneration and base validation pass. Classification payload `76a632f2d8513b359f063dc072f1a057d356889fdea4649667e865bc76dad041` and review `d08d48e4dd9526f8ca82b760a7b473b95c7590191c71224e71f3733d2e7681ee` are unchanged. R3 amendment acceptance/red proof are null; write-tests and code remain locked.

### CRITICAL

- [review manifest schema and builder provenance] `ReviewManifestEntry.builderIdentity` is optional, while R3 requires the repository-owned manifest to bind artifact, payload, reviewer, verdict, **and builder**. With the field omitted, the manifest does not state which builder the reviewer was independent from; factory capture and caller equality cannot reconstruct that missing repository-reviewed fact. → Make `builderIdentity: string` mandatory on every manifest entry. Require exact equality among manifest builder, captured composition builder, and claim builder, then require reviewer ≠ builder. Add omission, mismatch, and self-review red cases for both payload and lineage paths. The manifest hash must cover this mandatory field.

### Gate

Do not create or embed an R3 accepted-review artifact. Keep `proofInventoryArchitectureAmendment.acceptedReview:null`, `redProofReview:null`, `authorizedStage:null`, `writeTestsLocked:true`, and `codeLocked:true`. Revise the schema, prose, task verification, and red-test list, then regenerate and return for independent R3 round 2.

---

## Architecture Critique: AU20 proof-inventory trust amendment R3, round 2

ARCHITECTURE-SCORE: 9/10  amendment-rounds=2  score-line: SA:9 IM:9 LI:10 AC:9 DM:9 N:9 MD:9 FMC:9 S:9 V:9 FE:9

VERDICT: ACCEPT

### Narrow audit

- **PASS — mandatory builder binding:** `ReviewManifestEntry.builderIdentity` is required. Schema rejects omission/empty/unknown fields. Verification requires manifest = captured = claimed builder, manifest = claimed reviewer, and reviewer ≠ builder through both payload and lineage.
- **PASS — exact negative cases:** builder omission, mismatch, and self-review are named for payload and lineage; manifest hashing covers the mandatory field.
- **PASS — prior accepted R3 aspects unchanged:** physical deletion of all three legacy authority APIs with no compatibility path; one repository-composed verifier shared exclusively by payload/lineage; closed hash-pinned manifest; descriptor-stable same-Buffer verification; proportional no-PKI design; exact migration/static/runtime tests; strict attempt ordering; net-negative production trust-path LOC.
- **PASS — preservation and locks:** deterministic regeneration is byte-identical and base validation exits 0. Classification payload remains `76a632f2d8513b359f063dc072f1a057d356889fdea4649667e865bc76dad041`; classification review remains `d08d48e4dd9526f8ca82b760a7b473b95c7590191c71224e71f3733d2e7681ee`. R3 accepted review/red proof/authorized stage remain null and both locks remain true.

### Findings

No critical or warning findings.

### Gate

Accepted artifact: `plans/AU20/register-reviews/proof-inventory-architecture-amendment-r3.md`, SHA-256 `51336cc090c2951a84bcea613da2e64d0f920acd054e29768fae54703e7c134c`. It binds architecture SHA-256 `4f600566b27f210b4399322b37b399cd51f9f66c4c37cce7c30377667d990793` and feasibility SHA-256 `c6ce225bfaa0b5712975313a1c2206ccd6f5d967e1882ce8d4c0f27a39527f1a`. Planner must embed it, preserve classification acceptance, keep code locked, and unlock only R3 `/write-tests` through amendment-aware validation.
