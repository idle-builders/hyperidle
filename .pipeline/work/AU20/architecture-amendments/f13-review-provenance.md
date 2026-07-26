# AU20 F13 review-provenance amendment

Date: 2026-07-24
Scope: planner-owned evidence gate only

## Required reading

- `.pipeline/work/AU20/architecture.md`
- `plans/AU20/register-reviews/final-ship-correction-architecture.md`
- `plans/AU20/red-proof-reviews/review-finding-ledger.md`
- `.pipeline/work/AU20/review.md`
- `.pipeline/work/AU20/probes/generate-corrective-change-map.mjs`
- `.pipeline/work/AU20/probes/validate-corrective-change-map.mjs`

## Problem

The accepted final ship-correction architecture bound the then-live
`.pipeline/work/AU20/review.md` at SHA-256
`cef525507cfe766356b2084b7d0ba4ba98699835f560dd1b0b2e5b6fa01c683a`.
F13 legitimately corrected that mutable live file. Its current accepted bytes
are SHA-256
`48360d3d1bf65c33c371fcfd48c7659a50acaee4159b4a802a9d52f2a9ac57e0`.
The generator still equates the historical hash with the live path, so an
honest regeneration revokes the accepted architecture and red-proof state.
The validator then accepts the previously generated JSON without comparing it
to the live review. This is stale provenance, not a product defect.

## Decision

Keep two distinct bindings:

1. `historicalReview`: immutable evidence of the pre-F13 state. Its artifact is
   `plans/AU20/register-reviews/final-ship-correction-architecture.md`, hash
   `5194f0382f53cfe12cd40014413750bd18907819527520f37d261cc23cc87ae9`.
   The artifact itself records the historical live-review SHA
   `cef525507cfe766356b2084b7d0ba4ba98699835f560dd1b0b2e5b6fa01c683a`.
   The accepted F13 red-proof artifact
   `plans/AU20/red-proof-reviews/review-finding-ledger.md`, hash
   `cc04e8563635b2e9ff3726b751293e586ba0a29ef490f4f776c4aacffcf10f0e`,
   independently records the same historical SHA and intended contradiction.
2. `currentReview`: the corrected live `.pipeline/work/AU20/review.md`, hash
   `48360d3d1bf65c33c371fcfd48c7659a50acaee4159b4a802a9d52f2a9ac57e0`,
   plus validator `.pipeline/work/AU20/probes/validate-review-findings.mjs`
   at `18ccc6dcf277de1bc575c4fa6d278eaee44bfd5eedfc8c6e64bf0dd32819e7b5`.
   Its validator must exit zero and report exactly 13 findings: 6 critical,
   6 warning, 1 observation, IDs F1–F13 exactly once.

The historical binding is never resolved by reading the mutable live path.
The current binding is never inferred from a generated JSON cache. Generator
and validator independently read and hash every referenced artifact.

## Contracts

```ts
type HistoricalReviewBinding = {
  architectureReviewPath: "plans/AU20/register-reviews/final-ship-correction-architecture.md";
  architectureReviewSha256: "5194f0382f53cfe12cd40014413750bd18907819527520f37d261cc23cc87ae9";
  historicalLiveReviewSha256: "cef525507cfe766356b2084b7d0ba4ba98699835f560dd1b0b2e5b6fa01c683a";
  redProofReviewPath: "plans/AU20/red-proof-reviews/review-finding-ledger.md";
  redProofReviewSha256: "cc04e8563635b2e9ff3726b751293e586ba0a29ef490f4f776c4aacffcf10f0e";
};

type CurrentReviewBinding = {
  path: ".pipeline/work/AU20/review.md";
  sha256: "48360d3d1bf65c33c371fcfd48c7659a50acaee4159b4a802a9d52f2a9ac57e0";
  validatorPath: ".pipeline/work/AU20/probes/validate-review-findings.mjs";
  validatorSha256: "18ccc6dcf277de1bc575c4fa6d278eaee44bfd5eedfc8c6e64bf0dd32819e7b5";
  counts: { critical: 6; warning: 6; observation: 1 };
  ids: ["F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12","F13"];
};

type F13ProvenanceAmendment = {
  path: ".pipeline/work/AU20/architecture-amendments/f13-review-provenance.md";
  sha256: string;
  feasibilityPath: ".pipeline/work/AU20/feasibility-amendments/f13-review-provenance.md";
  feasibilitySha256: string;
  critiquePath: "plans/AU20/register-reviews/f13-review-provenance-amendment.md";
  critiqueSha256: string;
  verdict: "accept";
  score: number; // >= 7
  preAmendmentProgressSha256:
    "1be04b7a6f79891f7ec0f3c73f10f8a3328efe3ebd80a9ec25d4f39c585e2ecd";
  historicalReview: HistoricalReviewBinding;
  currentReview: CurrentReviewBinding;
};
```

`finalShipCorrection.acceptedArchitecture` remains immutable historical
evidence. A new `f13ProvenanceAmendment` gate binds this amendment, its
independent critique, both review bindings, and the pre-amendment green ledger
hashes (`review=48360d3…`, `progress=1be04b7…`). Only after every hash and the
live validator pass may `authorizedStage` remain
`write-code-review-finding-ledger`. `productCodeLocked` remains true.

Transition order is non-circular:

1. Freeze amendment + feasibility bytes.
2. Independent reviewer reads those bytes and writes an accepted critique.
3. Planner hashes all three immutable artifacts and embeds the complete
   `F13ProvenanceAmendment` object in progress. The
   `preAmendmentProgressSha256` is the already observed `1be04b7…`; generator
   and validator compare that literal field only and never hash current
   post-binding progress as historical evidence.
4. Generator reads the embedded accepted gate, independently hashes its
   artifacts and live review, runs the pinned live validator, and emits the
   integrity graph.
5. Validator independently repeats those checks against live files.

The critique hash is unknown until step 2. No placeholder unlock is valid.

### Closed prior-history set

Regeneration and validation require these four pre-amendment integrity objects
field-for-field. Their canonical `SHA256(JSON.stringify(value))` values are:

| Object | Canonical SHA-256 | Required terminal state |
|---|---|---|
| `integrity.acceptedReview` | `8fdbe10c6810358a93d3629164db083eab446750f01ecaff664b3ae087c564c8` | classification review `accept`, payload `76a632f2…` |
| `integrity.proofInventoryArchitectureAmendment` | `b2422c38e17340c80399f36c6587b1702b0b3165604e65b1be6ee9cfdfc2730a` | revision 3, `authorizedStage=completed-history`, all prior/accepted/superseded/current review subobjects retained |
| `integrity.finalShipCorrection.acceptedArchitecture` | `353e6eafd6ae992a1e9939929f28798b07d3f0583178fc388411c119b7f81ff5` | verdict `accept`, round 4 |
| `integrity.finalShipCorrection.activeIncrement.redProofReview` | `7c3a751c023b055b367d5c487a5174a6cb4ab8ec2579e65b8c13e3768e6dac1e` | verdict `accept`, intended historical red retained |

For every path/hash pair inside these objects, the validator continues its
existing artifact-byte checks. The object hashes prohibit dropping a nested
historical gate while retaining only the newest review.

### Executable validation seam

`validate-corrective-change-map.mjs` gains only `--map <path>`; omitted means
`plans/AU20/corrective-change-map.json`. All artifact paths, including live
review and executable finding validator, remain planner-pinned repository
constants and are never taken from the supplied map. `--map` changes only the
candidate generated JSON bytes.

The stale-cache adversarial proof:

1. Copy the generated JSON to a temporary file.
2. Set
   `integrity.finalShipCorrection.f13ProvenanceAmendment.currentReview.sha256`
   to historical `cef525…`, leaving the JSON otherwise internally
   well-formed. Run `node .../validate-corrective-change-map.mjs --map "$tmp"
   --require-review`; require nonzero and exact stderr substring
   `current live review hash mismatch`.
3. In a second copy, set that field and the nested progress-derived gate field
   to the same historical hash, demonstrating internal agreement, then require
   the same live-byte mismatch. This distinguishes live comparison from
   internal JSON consistency.

Current-review counts/IDs are independently parsed from live review by the
main validator after it invokes the pinned validator using
`spawnSync(process.execPath, [PINNED_VALIDATOR_PATH])`, no shell. Invocation
must exit zero. Exact stdout is JSON:
`{"findings":13,"counts":{"CRITICAL":6,"WARNING":6,"OBSERVATION":1},"ids":["F1",...,"F13"]}`.
The main validator parses and exact-compares it.

Historical semantic extraction is exact:

- From the architecture review, parse the unique Markdown table row whose
  first cell is exactly `` `.pipeline/work/AU20/review.md` ``.
- From the red-proof review, under `## Binding`, parse the unique two-line
  field beginning exactly `- Current review SHA-256:`.
- Reject zero, duplicate, or malformed semantic fields. Both extracted hashes
  must equal pinned `cef525…`.

## Acceptance criteria

1. Deterministic regeneration: two generator runs are byte-identical.
   Verification: run generator; copy JSON/Markdown to a temporary directory as
   `one.json`/`one.md`; run again; use `cmp` separately against `two.json` and
   `two.md`, and compare SHA-256 pairs for both outputs.
2. Historical evidence remains independently verifiable.
   Verification: validator hashes the architecture-review and red-proof-review
   artifacts, parses the historical review SHA from both, and requires exact
   equality with `cef525…`.
3. Current accepted review is live-verified.
   Verification: validator hashes `.pipeline/work/AU20/review.md`, hashes and
   executes the finding validator, and requires its exact counts/IDs.
4. Stale generated JSON fails.
   Verification: mutate a temporary copy's current-review hash and require the
   provenance helper/validator fixture to reject; the repository validator must
   compare generated values to live bytes rather than trust JSON alone.
5. Prior proof history remains present and immutable.
   Verification: existing accepted classification/proof-inventory/final
   architecture/red-proof artifacts and hashes remain required.
6. Authorization is narrow.
   Verification: `codeLocked=false` only for F13,
   `productCodeLocked=true`, `productCodeAuthorized=false`, and next increment
   remains locked. Exact emitted values:
   `activeIncrement.name=review-finding-ledger`,
   `activeIncrement.authorizedStage=write-code-review-finding-ledger`,
   `activeIncrement.productCodeAuthorized=false`,
   `nextIncrement=evidence-demand-package`, with no authorization object or
   stage for that next increment.

## Technical task tree

#### `f13-provenance-gate` — Correct planner-owned provenance
- **Kind:** implementation
- **Depends on:** accepted F13 red-proof review
- **Owns:** `file:.pipeline/work/AU20/probes/generate-corrective-change-map.mjs`, `file:.pipeline/work/AU20/probes/validate-corrective-change-map.mjs`, `file:.pipeline/work/AU20/progress.json`, `file:plans/AU20/corrective-change-map.json`, `file:plans/AU20/corrective-change-map.md`
- **Consumes:** accepted architecture review, accepted F13 red-proof review, corrected live review, finding validator
- **ACs:** 1–6
- **Start here:** this amendment; generator final-ship binding; validator `--require-review`
- **Verify:** two byte-identical regenerations; `node .pipeline/work/AU20/probes/validate-review-findings.mjs`; `node .pipeline/work/AU20/probes/validate-corrective-change-map.mjs --require-review`
- **Parallel:** no

## Plan reconciliation

- Historical review bytes were never committed as a standalone artifact.
  Historical provenance therefore binds the two immutable accepted review
  artifacts that independently record the same historical live hash; it does
  not pretend the corrected live path still has historical bytes.
- Current generated JSON passes because the validator validates its internally
  stale bindings. The validator must independently re-derive both bindings.
- No product source, test, service census, or AU23 scope is touched.

## Security and abuse

No endpoint, credential, path input, or external URL is added. Fail closed on
missing files, hash mismatch, malformed bindings, duplicate/missing findings,
or nonzero live-validator status. Never execute a path obtained from generated
JSON; executable validator path is the planner-pinned constant.

## Protected tests

All files under `packages/` are protected for this amendment.

## Migrations

- Generated final-correction integrity: split historical and current review
  provenance; retain the former fields as history.
- Validator: replace cache-only acceptance with independent live comparison.
- Progress: add one accepted-amendment gate after independent critique.

## Shared files

```yaml
sharedFiles:
  - .pipeline/work/AU20/progress.json
  - .pipeline/work/AU20/probes/generate-corrective-change-map.mjs
  - .pipeline/work/AU20/probes/validate-corrective-change-map.mjs
  - plans/AU20/corrective-change-map.json
  - plans/AU20/corrective-change-map.md
```
