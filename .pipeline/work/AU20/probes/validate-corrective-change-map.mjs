import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const fail = (message) => { throw new Error(`AU20 change-map invalid: ${message}`); };
const root = process.cwd();
const mapArgIndex = process.argv.indexOf("--map");
if (mapArgIndex !== -1 && !process.argv[mapArgIndex + 1]) fail("--map requires a path");
const mapPath = mapArgIndex === -1
  ? path.join(root, "plans/AU20/corrective-change-map.json")
  : path.resolve(process.argv[mapArgIndex + 1]);
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const browserPath = path.join(root, "plans/AU20/browser-validation-ledger.json");
const systemPath = path.join(root, "plans/AU20/system-validation-ledger.json");
const generatorPath = path.join(root, ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs");
const diagnosticDir = path.join(root, "plans/AU20/diagnostics");
const diagnosticFiles = fs.readdirSync(diagnosticDir).filter((name) => name.endsWith(".json")).sort();

if (map.integrity.browserLedgerSha256 !== sha256(fs.readFileSync(browserPath))) fail("browser ledger hash mismatch");
if (map.integrity.systemLedgerSha256 !== sha256(fs.readFileSync(systemPath))) fail("system ledger hash mismatch");
if (map.integrity.generatorSha256 !== sha256(fs.readFileSync(generatorPath))) fail("generator hash mismatch");
for (const name of diagnosticFiles) {
  if (map.integrity.diagnosticSha256[name] !== sha256(fs.readFileSync(path.join(diagnosticDir, name)))) fail(`diagnostic hash mismatch: ${name}`);
}
if (Object.keys(map.integrity.diagnosticSha256).sort().join("\0") !== diagnosticFiles.join("\0")) fail("diagnostic file set mismatch");
const { integrity, ...payload } = map;
if (integrity.payloadSha256 !== sha256(JSON.stringify(payload))) fail("payload hash mismatch");

const browser = JSON.parse(fs.readFileSync(browserPath, "utf8"));
const system = JSON.parse(fs.readFileSync(systemPath, "utf8"));
const expected = [...browser.cases.map((c) => c.id), ...system.cases.map((c) => c.id)].sort();
const actual = map.entries.map((e) => e.id).sort();
if (expected.length !== 604 || actual.length !== 604 || new Set(actual).size !== 604) fail("identity count/uniqueness mismatch");
if (expected.some((id, index) => id !== actual[index])) fail("identity set mismatch");

const expectedDiagnosed = new Set(browser.cases.filter((c) => c.disposition === "unresolved").map((c) => c.id));
const diagnosed = [];
const regressionProjectionById = new Map();
for (const name of diagnosticFiles) {
  const artifact = JSON.parse(fs.readFileSync(path.join(diagnosticDir, name), "utf8"));
  for (const item of artifact.identities ?? []) if (item.formerlyUnresolved) diagnosed.push(item.id);
  for (const projection of artifact.regressionProjections ?? []) {
    if (regressionProjectionById.has(projection.id)) fail(`duplicate regression projection: ${projection.id}`);
    regressionProjectionById.set(projection.id, projection);
  }
}
if (diagnosed.length !== 181 || new Set(diagnosed).size !== 181) fail("diagnostic identity count/duplicates");
if ([...expectedDiagnosed].some((id) => !diagnosed.includes(id)) || diagnosed.some((id) => !expectedDiagnosed.has(id))) fail("diagnostic exact-set mismatch");
if (map.entries.some((e) => e.targetDisposition === "unresolved")) fail("unresolved target remains");
for (const entry of map.entries.filter((e) => e.execution !== "passed" && e.execution !== "pass")) {
  for (const field of ["rootProblem","changeKind","changeOwner","layer","firstDivergentBoundary","requiredRedProof","testAction","productionAction"]) {
    if (entry[field] == null || entry[field] === "") fail(`${entry.id} missing ${field}`);
  }
  if (!Array.isArray(entry.candidateFiles) || entry.candidateFiles.length === 0) fail(`${entry.id} missing candidate files`);
  if (!Array.isArray(entry.dependencyOrder) || entry.dependencyOrder.length === 0) fail(`${entry.id} missing dependencies`);
}

const byTarget = (target) => map.entries.filter((entry) => entry.targetDisposition === target);
if (byTarget("harness_defect").length !== 0) fail("harness defects must remain zero without separately reviewed intervention evidence");
for (const entry of byTarget("missing_prerequisite")) {
  if (entry.externalPrerequisite !== "OPENROUTER_API_KEY") fail(`${entry.id} prerequisite is not the named external credential`);
  if (!`${entry.requiredRedProof} ${entry.firstDivergentBoundary}`.includes("credential") &&
      !`${entry.requiredRedProof} ${entry.firstDivergentBoundary}`.includes("OPENROUTER")) fail(`${entry.id} prerequisite lacks external preflight proof`);
}
for (const entry of map.entries.filter((e) => e.priorDisposition === "unresolved" && e.execution === "unrun" && e.targetDisposition === "none")) {
  const observation = entry.focusedObservation;
  if (!observation || observation.status !== "passed" || !observation.reporterArtifact || !observation.reporterArtifactSha256) fail(`${entry.id} missing focused terminal pass`);
  const artifactPath = path.join(root, observation.reporterArtifact);
  if (!fs.existsSync(artifactPath) || sha256(fs.readFileSync(artifactPath)) !== observation.reporterArtifactSha256) fail(`${entry.id} focused reporter hash mismatch`);
}
for (const entry of byTarget("feature_regression")) {
  const projection = regressionProjectionById.get(entry.id);
  if (!projection) fail(`${entry.id} lacks source diagnostic regression projection`);
  const projectedFiles = [...new Set(projection.exactSymbols.map((item) => item.file))];
  if (JSON.stringify(entry.exactSymbols) !== JSON.stringify(projection.exactSymbols) ||
      JSON.stringify(entry.candidateFiles) !== JSON.stringify(projectedFiles) ||
      entry.changeOwner !== projection.exactSymbols[0].file ||
      entry.requiredRedProof !== projection.redProof) fail(`${entry.id} regression projection drift`);
  for (const symbol of entry.exactSymbols) {
    if (!symbol.file?.startsWith("packages/") || !symbol.symbol || symbol.file.includes("/e2e/") || symbol.file.endsWith(".spec.ts")) fail(`${entry.id} has non-production causal symbol`);
  }
}
if (regressionProjectionById.size !== 32 || byTarget("feature_regression").length !== 32) fail("regression projection cardinality must be 32/32");

const assertProjection = (idPart, file, symbol, expectedCount = 1) => {
  const matches = byTarget("feature_regression").filter((entry) => entry.id.includes(idPart));
  if (matches.length !== expectedCount) fail(`special projection count mismatch: ${idPart}`);
  for (const entry of matches) {
    if (entry.exactSymbols.length !== 1 || entry.exactSymbols[0].file !== file || entry.exactSymbols[0].symbol !== symbol) fail(`special projection mismatch: ${entry.id}`);
  }
};
assertProjection("L14-bet-actions.spec.ts:304", "packages/web/src/pages/WorkBet.tsx", "handleAction(unblock)");
assertProjection("q1-session-dial-in.spec.ts:257", "packages/design-system/src/SplitView.tsx", "237 fold-back/reset absolute control overlay");
assertProjection("AH6-assistant-interaction.spec.ts:", "packages/agent-orchestration/session-requests/src/service.ts", "resolveIntentInputInternal -> requireRunnableActor", 3);
for (const entry of byTarget("intentional_move")) {
  if (!entry.authority || !entry.replacementLineage) fail(`${entry.id} lacks authority/replacement lineage`);
}
for (const entry of byTarget("stale_test_mock")) {
  if (entry.changeOwner !== entry.candidateFiles[0] || (!entry.changeOwner.endsWith(".spec.ts") && !entry.changeOwner.endsWith(".test.ts") && !entry.changeOwner.includes("fixture"))) fail(`${entry.id} lacks exact test/fixture owner`);
}

const generatedMd = fs.readFileSync(path.join(root, "plans/AU20/corrective-change-map.md"), "utf8");
if (generatedMd.includes("remaining runtime ambiguity becomes product regression")) fail("generated Markdown contains rejected ambiguity default");
for (const [disposition, count] of Object.entries(map.summary.targetDispositions)) {
  if (!generatedMd.includes(`| ${disposition} | ${count} |`)) fail(`generated Markdown disposition mismatch: ${disposition}`);
}
for (const name of ["ui-a-l", "ui-m-s"]) {
  const json = JSON.parse(fs.readFileSync(path.join(diagnosticDir, `${name}.json`), "utf8"));
  const md = fs.readFileSync(path.join(diagnosticDir, `${name}.md`), "utf8");
  for (const [key, count] of Object.entries(json.summary)) {
    if (!md.includes(`${count}`)) fail(`${name}.md does not represent ${key}=${count}`);
  }
}

if (process.argv.includes("--require-review")) {
  const review = integrity.acceptedReview;
  if (!review?.path || !review?.sha256 || review.verdict !== "accept" || review.payloadSha256 !== integrity.payloadSha256) fail("accepted review binding absent");
  const reviewPath = path.join(root, review.path);
  if (!fs.existsSync(reviewPath) || sha256(fs.readFileSync(reviewPath)) !== review.sha256) fail("accepted review artifact hash mismatch");
  const finalCorrection = integrity.finalShipCorrection;
  const finalArchitecture = finalCorrection?.acceptedArchitecture;
  const provenance = finalCorrection?.f13ProvenanceAmendment;
  if (!provenance || provenance.verdict !== "accept" || provenance.score < 7) fail("F13 provenance amendment binding absent");
  if (provenance.preAmendmentProgressSha256 !== "1be04b7a6f79891f7ec0f3c73f10f8a3328efe3ebd80a9ec25d4f39c585e2ecd") fail("F13 pre-amendment progress hash mismatch");
  const pinned = {
    amendmentPath: ".pipeline/work/AU20/architecture-amendments/f13-review-provenance.md",
    feasibilityPath: ".pipeline/work/AU20/feasibility-amendments/f13-review-provenance.md",
    critiquePath: "plans/AU20/register-reviews/f13-review-provenance-amendment.md",
    historicalArchitecturePath: "plans/AU20/register-reviews/final-ship-correction-architecture.md",
    historicalRedProofPath: "plans/AU20/red-proof-reviews/review-finding-ledger.md",
    currentReviewPath: ".pipeline/work/AU20/review.md",
    findingValidatorPath: ".pipeline/work/AU20/probes/validate-review-findings.mjs",
  };
  if (provenance.path !== pinned.amendmentPath ||
      provenance.feasibilityPath !== pinned.feasibilityPath ||
      provenance.critiquePath !== pinned.critiquePath) fail("F13 provenance artifact path mismatch");
  if (sha256(fs.readFileSync(path.join(root, pinned.amendmentPath))) !== provenance.sha256 ||
      sha256(fs.readFileSync(path.join(root, pinned.feasibilityPath))) !== provenance.feasibilitySha256 ||
      sha256(fs.readFileSync(path.join(root, pinned.critiquePath))) !== provenance.critiqueSha256) fail("F13 provenance artifact hash mismatch");
  const historical = provenance.historicalReview;
  if (historical?.architectureReviewPath !== pinned.historicalArchitecturePath ||
      historical?.redProofReviewPath !== pinned.historicalRedProofPath ||
      historical?.architectureReviewSha256 !== "5194f0382f53cfe12cd40014413750bd18907819527520f37d261cc23cc87ae9" ||
      historical?.redProofReviewSha256 !== "cc04e8563635b2e9ff3726b751293e586ba0a29ef490f4f776c4aacffcf10f0e" ||
      historical?.historicalLiveReviewSha256 !== "cef525507cfe766356b2084b7d0ba4ba98699835f560dd1b0b2e5b6fa01c683a") fail("F13 historical review binding mismatch");
  const architectureReviewText = fs.readFileSync(path.join(root, pinned.historicalArchitecturePath), "utf8");
  const redProofReviewText = fs.readFileSync(path.join(root, pinned.historicalRedProofPath), "utf8");
  if (sha256(architectureReviewText) !== historical.architectureReviewSha256 ||
      sha256(redProofReviewText) !== historical.redProofReviewSha256) fail("F13 historical artifact hash mismatch");
  const architectureHashMatches = [...architectureReviewText.matchAll(/^\| `\.pipeline\/work\/AU20\/review\.md` \| `([a-f0-9]{64})` \|$/gm)];
  const redProofHashMatches = [...redProofReviewText.matchAll(/^- Current review SHA-256:\n  `([a-f0-9]{64})`$/gm)];
  if (architectureHashMatches.length !== 1 || redProofHashMatches.length !== 1 ||
      architectureHashMatches[0][1] !== historical.historicalLiveReviewSha256 ||
      redProofHashMatches[0][1] !== historical.historicalLiveReviewSha256) fail("F13 historical review semantic hash mismatch");
  const current = provenance.currentReview;
  if (current?.path !== pinned.currentReviewPath ||
      current?.validatorPath !== pinned.findingValidatorPath ||
      current?.validatorSha256 !== "18ccc6dcf277de1bc575c4fa6d278eaee44bfd5eedfc8c6e64bf0dd32819e7b5" ||
      JSON.stringify(current?.counts) !== JSON.stringify({ critical: 6, warning: 6, observation: 1 }) ||
      JSON.stringify(current?.ids) !== JSON.stringify(["F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12","F13"])) fail("F13 current review binding mismatch");
  if (sha256(fs.readFileSync(path.join(root, pinned.currentReviewPath))) !== current.sha256) fail("current live review hash mismatch");
  if (sha256(fs.readFileSync(path.join(root, pinned.findingValidatorPath))) !== current.validatorSha256) fail("F13 finding validator hash mismatch");
  const findingResult = spawnSync(process.execPath, [path.join(root, pinned.findingValidatorPath)], { cwd: root, encoding: "utf8", shell: false });
  if (findingResult.status !== 0) fail("F13 live finding validator failed");
  let findingOutput;
  try { findingOutput = JSON.parse(findingResult.stdout.trim()); } catch { fail("F13 live finding validator output malformed"); }
  const expectedFindingOutput = {
    findings: 13,
    counts: { CRITICAL: 6, WARNING: 6, OBSERVATION: 1 },
    ids: ["F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12","F13"],
  };
  if (JSON.stringify(findingOutput) !== JSON.stringify(expectedFindingOutput)) fail("F13 live finding validator output mismatch");
  const canonicalObjectHash = (value) => sha256(JSON.stringify(value));
  if (canonicalObjectHash(integrity.acceptedReview) !== "8fdbe10c6810358a93d3629164db083eab446750f01ecaff664b3ae087c564c8") fail("classification review history mismatch");
  if (canonicalObjectHash(integrity.proofInventoryArchitectureAmendment) !== "b2422c38e17340c80399f36c6587b1702b0b3165604e65b1be6ee9cfdfc2730a") fail("proof-inventory history mismatch");
  if (canonicalObjectHash(finalArchitecture) !== "353e6eafd6ae992a1e9939929f28798b07d3f0583178fc388411c119b7f81ff5") fail("final architecture history mismatch");
  const completedF13 = finalCorrection?.completedIncrements?.find((increment) => increment.name === "review-finding-ledger");
  if (canonicalObjectHash(completedF13?.redProofReview) !== "7c3a751c023b055b367d5c487a5174a6cb4ab8ec2579e65b8c13e3768e6dac1e") fail("F13 red-proof history mismatch");
  if (!finalArchitecture?.path || finalArchitecture.verdict !== "accept") fail("final ship correction architecture binding absent");
  if (sha256(fs.readFileSync(path.join(root, finalArchitecture.path))) !== finalArchitecture.sha256) fail("final correction review hash mismatch");
  if (sha256(fs.readFileSync(path.join(root, ".pipeline/work/AU20/architecture.md"))) !== finalArchitecture.architectureSha256) fail("final correction architecture hash mismatch");
  if (sha256(fs.readFileSync(path.join(root, ".pipeline/work/AU20/feasibility.md"))) !== finalArchitecture.feasibilitySha256) fail("final correction feasibility hash mismatch");
  if (sha256(fs.readFileSync(path.join(root, "plans/AU20/diagnostics/final-ship-review-correction-map.md"))) !== finalArchitecture.diagnosticSha256) fail("final correction diagnostic hash mismatch");
  const historicalProofInventory = integrity.proofInventoryArchitectureAmendment;
  if (historicalProofInventory?.acceptedReview?.historicalStatus !== "completed-before-final-ship-correction-architecture" ||
      sha256(fs.readFileSync(path.join(root, historicalProofInventory.acceptedReview.path))) !== historicalProofInventory.acceptedReview.sha256 ||
      historicalProofInventory.authorizedStage !== "completed-history") fail("prior proof-inventory binding not preserved as completed history");
  const active = finalCorrection.activeIncrement;
  const completedDemand = finalCorrection?.completedIncrements?.find((increment) => increment.name === "evidence-demand-package");
  const completedBootstrap = finalCorrection?.completedIncrements?.find((increment) => increment.name === "core-api-bootstrap-ownership");
  const receipt = completedF13?.commitReceipt;
  if (completedF13?.finding !== "F13" || completedF13?.status !== "completed-history") fail("F13 completion history absent");
  if (receipt?.commit !== "41c013613dc0c1fd81bc43b0ef7a52c8bc08b322" ||
      receipt?.tree !== "4d73df713d104ddab2104b26479f21ee4ca93e2c" ||
      receipt?.parent !== "cf8bee1a65e0def24995dc3b5aa3d496cef0f32b" ||
      receipt?.subject !== "AU20: reconcile final review finding ledger" ||
      receipt?.preTransitionProgressSha256 !== "32b63054a9edf3f28dcc55e70c3d4fc4c7e0c66eba93e31c210b83ac7ced91db" ||
      receipt?.preTransitionChangeMapSha256 !== "93af687d5bc817490378a84264b24f418d185d2ba8a5b32401124993b11f45fe" ||
      JSON.stringify(receipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      receipt?.status !== "completed-history" ||
      Object.values(receipt?.verification ?? {}).some((result) => result !== "pass")) fail("F13 commit receipt mismatch");
  const gitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", receipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (gitReceipt.status !== 0 ||
      gitReceipt.stdout.trim() !== [receipt.commit, receipt.tree, receipt.parent, receipt.subject].join("\n")) fail("F13 commit object mismatch");
  const priorRedProof = completedDemand?.priorRedProofReview;
  if (priorRedProof?.guardSha256 !== "00dbc536a0c60adddccafca364631b87e5c7d46ec34d3b4daf67bcb3c531c06c" ||
      priorRedProof?.sha256 !== "d72f859f9e2a14da16d65e665e8825e9f23975f0dd4d9d83344622ca5bdf95df" ||
      priorRedProof?.reviewSha256 !== "ec35cfb41f797dab148fc73627e09107dd95cfa2fa3bb2a65dffef094d92e9ee" ||
      priorRedProof?.verdict !== "accept") fail("prior F1 red-proof history mismatch");
  const demandRedProof = completedDemand?.redProofReview;
  if (demandRedProof?.path !== ".pipeline/work/AU20/red-proofs/evidence-demand-package.json" ||
      demandRedProof?.sha256 !== "fe50ae191154ce1bed20facff969ad7e061c3974a33bfbf071fc0dafd8aefe63" ||
      demandRedProof?.guardPath !== ".pipeline/work/AU20/probes/validate-service-demand-package.mjs" ||
      demandRedProof?.guardSha256 !== "8cfaf4d8b4c1cf6c55b6941a7d2f6b16985603a68dd08c5ae63e5d8654db1758" ||
      demandRedProof?.reviewPath !== "plans/AU20/red-proof-reviews/evidence-demand-package.md" ||
      demandRedProof?.reviewSha256 !== "78fef8028435cfa6f715a253bab8028a93cf45c265f7235ca58a1de3c4e87011" ||
      demandRedProof?.verdict !== "accept" ||
      demandRedProof?.authoritativeSourceSha256 !== "b43f2a510f6bd4addea21716e95800e9eafd8ba4c06280aaace917c2a611cdbc") fail("F1 nested red-proof binding mismatch");
  if (sha256(fs.readFileSync(path.join(root, demandRedProof.path))) !== demandRedProof.sha256 ||
      sha256(fs.readFileSync(path.join(root, demandRedProof.guardPath))) !== demandRedProof.guardSha256 ||
      sha256(fs.readFileSync(path.join(root, demandRedProof.reviewPath))) !== demandRedProof.reviewSha256) fail("F1 red-proof artifact hash mismatch");
  const rejected = completedDemand?.rejectedCandidate;
  const expandedRedReviewText = fs.readFileSync(path.join(root, "plans/AU20/red-proof-reviews/evidence-demand-package.md"), "utf8");
  if (rejected?.generatorSha256 !== "aa97fb3ea89f97aa3a9ecb0bf778c291eeee544f32dda4618ee2c809b46b6385" ||
      rejected?.artifactSha256 !== "6143da860cbbf91bd130905366bab26cec19cc4f5b00e64b60b2a0b50b3b2450" ||
      rejected?.reviewSha256 !== "c8c79ededeb650395020b65c4c066be24c6ef10a880141538c498db672592360" ||
      rejected?.verdict !== "revise" ||
      rejected?.status !== "rejected-history" ||
      !expandedRedReviewText.includes(`| Frozen rejected generator | \`${rejected.generatorSha256}\` |`) ||
      !expandedRedReviewText.includes(`| Frozen rejected package | \`${rejected.artifactSha256}\` |`)) fail("F1 rejected candidate history mismatch");
  const candidate = completedDemand?.candidate;
  const provenanceReview = completedDemand?.provenanceReview;
  if (provenanceReview?.path !== "plans/AU20/register-reviews/evidence-demand-package-provenance.md" ||
      provenanceReview?.sha256 !== "5262fc92a8bb086847bf34da50f59b8462dc403b581772ee0891a6db08abfcc6" ||
      provenanceReview?.verdict !== "revise" ||
      JSON.stringify(provenanceReview?.requiredExactPaths) !== JSON.stringify({
        generatorPath: "scripts/generate-dependency-graph.ts",
        artifactPath: ".pipeline/work/AU20/analysis/service-data-packages.json",
        implementationReviewPath: "plans/AU20/register-reviews/evidence-demand-package-implementation.md",
      }) ||
      sha256(fs.readFileSync(path.join(root, provenanceReview.path))) !== provenanceReview.sha256) fail("F1 provenance review binding mismatch");
  if (candidate?.generatorPath !== "scripts/generate-dependency-graph.ts" ||
      candidate?.artifactPath !== ".pipeline/work/AU20/analysis/service-data-packages.json" ||
      candidate?.implementationReviewPath !== "plans/AU20/register-reviews/evidence-demand-package-implementation.md" ||
      candidate?.generatorSha256 !== "3d27a26f17a2a29bcd2fbb780cb8a500e4c463dca808068ba16efaeaf2acd5b5" ||
      candidate?.artifactSha256 !== "f2575f32b02a66dd4d6f708c1123385433ac46e1ff91289ad70acde38e824aa5" ||
      candidate?.sourceSha256 !== "b43f2a510f6bd4addea21716e95800e9eafd8ba4c06280aaace917c2a611cdbc" ||
      candidate?.implementationReviewSha256 !== "87b9fbb1ab33be53b2031582e0896b14ce341b281fd09e9b6291cbde8b6cf99c" ||
      candidate?.implementationReviewVerdict !== "revise" ||
      candidate?.productToolingVerdict !== "pass" ||
      candidate?.provenanceVerdict !== "revise" ||
      candidate?.status !== "implementation-correct-provenance-review-pending" ||
      sha256(fs.readFileSync(path.join(root, candidate.generatorPath))) !== candidate.generatorSha256 ||
      sha256(fs.readFileSync(path.join(root, candidate.artifactPath))) !== candidate.artifactSha256 ||
      sha256(fs.readFileSync(path.join(root, candidate.implementationReviewPath))) !== candidate.implementationReviewSha256) fail("F1 corrected live candidate mismatch");
  const finalReview = completedDemand?.finalReview;
  if (finalReview?.path !== "plans/AU20/register-reviews/evidence-demand-package-provenance-final.md" ||
      finalReview?.sha256 !== "81fc73a5e71cf037cde4d5ef1596202a8b328c9e5101b2ceff90dc7f33ad68b4" ||
      finalReview?.verdict !== "accept" ||
      finalReview?.generatorSha256 !== candidate.generatorSha256 ||
      finalReview?.artifactSha256 !== candidate.artifactSha256 ||
      finalReview?.implementationReviewSha256 !== candidate.implementationReviewSha256 ||
      finalReview?.sourceSha256 !== candidate.sourceSha256 ||
      JSON.stringify(finalReview?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      sha256(fs.readFileSync(path.join(root, finalReview.path))) !== finalReview.sha256) fail("F1 final review binding mismatch");
  const expectedFinalizeAuthorization = {
    increment: "evidence-demand-package",
    stage: "finalize-demand-package-generator",
    finding: "F1",
    allowedCommitPaths: [
      "scripts/generate-dependency-graph.ts",
      ".pipeline/work/AU20/analysis/service-data-packages.json",
      ".pipeline/work/AU20/probes/validate-service-demand-package.mjs",
      ".pipeline/work/AU20/red-proofs/evidence-demand-package.json",
      "plans/AU20/red-proof-reviews/evidence-demand-package.md",
      "plans/AU20/register-reviews/evidence-demand-package-implementation.md",
      "plans/AU20/register-reviews/evidence-demand-package-provenance.md",
      "plans/AU20/register-reviews/evidence-demand-package-provenance-final.md",
      ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
      ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
      ".pipeline/work/AU20/progress.json",
      "plans/AU20/corrective-change-map.json",
    ],
    workingTreeMustMatchAcceptedHashes: true,
    semanticEditsAuthorized: false,
    serviceCodeAuthorized: false,
    productCodeAuthorized: false,
    productTestsAuthorized: false,
    nextIncrementAuthorized: false,
    nextIncrement: "core-api-bootstrap-ownership",
    status: "completed-history",
  };
  if (completedDemand?.finding !== "F1" ||
      completedDemand?.status !== "completed-history" ||
      JSON.stringify(completedDemand?.finalizeAuthorization) !== JSON.stringify(expectedFinalizeAuthorization)) fail("F1 completed history invalid");
  const demandReceipt = completedDemand?.commitReceipt;
  if (demandReceipt?.commit !== "a6641fa18c781bad1ee77ac07ae2b6ebb7b74f07" ||
      demandReceipt?.tree !== "9ac1a946870c123fa66f5f8568b5199b75790d5a" ||
      demandReceipt?.parent !== "41c013613dc0c1fd81bc43b0ef7a52c8bc08b322" ||
      demandReceipt?.subject !== "AU20: make service demand package reproducible" ||
      demandReceipt?.pathCount !== 12 ||
      demandReceipt?.preTransitionProgressSha256 !== "85a1f35b60fbd6639583ae775b0e13e6fbeef223f6991845cbc18be7787d3cac" ||
      demandReceipt?.preTransitionChangeMapSha256 !== "be41c4232765d84bdb576e60f80e6274e78b1b00320228eb92a64f92b55a4b97" ||
      demandReceipt?.generatorSha256 !== candidate.generatorSha256 ||
      demandReceipt?.artifactSha256 !== candidate.artifactSha256 ||
      demandReceipt?.sourceSha256 !== candidate.sourceSha256 ||
      JSON.stringify(demandReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      demandReceipt?.status !== "completed-history" ||
      Object.values(demandReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F1 commit receipt mismatch");
  const demandGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", demandReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (demandGitReceipt.status !== 0 ||
      demandGitReceipt.stdout.trim() !== [demandReceipt.commit, demandReceipt.tree, demandReceipt.parent, demandReceipt.subject].join("\n")) fail("F1 commit object mismatch");
  const expectedBootstrapAuthorization = {
    increment: "core-api-bootstrap-ownership",
    stage: "finalize-core-api-bootstrap-ownership",
    finding: "F5",
    allowedCommitPaths: [
      "packages/core-api/src/server-factory.ts",
      "packages/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts",
      ".pipeline/work/AU20/red-proofs/core-api-bootstrap-ownership.json",
      "plans/AU20/red-proof-reviews/core-api-bootstrap-ownership.md",
      "plans/AU20/register-reviews/core-api-bootstrap-ownership.md",
      ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
      ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
      ".pipeline/work/AU20/progress.json",
      "plans/AU20/corrective-change-map.json",
    ],
    workingTreeMustMatchAcceptedHashes: true,
    semanticEditsAuthorized: false,
    serviceSurfaceGrowthAuthorized: false,
    otherProductionPathsAuthorized: false,
    otherTestsAuthorized: false,
    nextIncrementAuthorized: false,
    nextIncrement: "run-orchestration-async-disposal",
    status: "completed-history",
  };
  const bootstrapRed = completedBootstrap?.redProofReview;
  if (bootstrapRed?.testSha256 !== "1d630619a4d292462e028f9e03245bfd906d60bcce023aa2feada9239a935b13" ||
      bootstrapRed?.proofSha256 !== "79a2c2376faaebc934193fb3e5933ad7ac98d1566388de46d5b04c39dba2dfdd" ||
      bootstrapRed?.reviewSha256 !== "a8d957dfa71beb1474dd5c1579e48387216f40df524c578beafd65f065799181" ||
      bootstrapRed?.verdict !== "accept" ||
      sha256(fs.readFileSync(path.join(root, bootstrapRed.testPath))) !== bootstrapRed.testSha256 ||
      sha256(fs.readFileSync(path.join(root, bootstrapRed.proofPath))) !== bootstrapRed.proofSha256 ||
      sha256(fs.readFileSync(path.join(root, bootstrapRed.reviewPath))) !== bootstrapRed.reviewSha256) fail("F5 red-proof binding mismatch");
  const bootstrapFinal = completedBootstrap?.finalReview;
  const committedBootstrapServerFactory = spawnSync(
    "git",
    ["show", "591f2051482581c29f082544ac36efb0f09df1d6:packages/core-api/src/server-factory.ts"],
    { cwd: root, encoding: null, shell: false },
  );
  if (bootstrapFinal?.path !== "plans/AU20/register-reviews/core-api-bootstrap-ownership.md" ||
      bootstrapFinal?.sha256 !== "e423371d5f7e91029fd8fb1a526cdd43ce4c6063eacd23b025b5d89af25817c3" ||
      bootstrapFinal?.verdict !== "accept" ||
      bootstrapFinal?.serverFactorySha256 !== "b8a7c5a0fc159d8e5496a7f8c98537e1387c9df16a1ba1d2e88228b18b4382ca" ||
      bootstrapFinal?.testSha256 !== bootstrapRed.testSha256 ||
      JSON.stringify(bootstrapFinal?.focused) !== JSON.stringify({ passed: 10, failed: 0 }) ||
      JSON.stringify(bootstrapFinal?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      sha256(fs.readFileSync(path.join(root, bootstrapFinal.path))) !== bootstrapFinal.sha256 ||
      committedBootstrapServerFactory.status !== 0 ||
      sha256(committedBootstrapServerFactory.stdout) !== bootstrapFinal.serverFactorySha256) fail("F5 final review binding mismatch");
  if (completedBootstrap?.finding !== "F5" ||
      completedBootstrap?.status !== "completed-history" ||
      JSON.stringify(completedBootstrap?.finalizeAuthorization) !== JSON.stringify(expectedBootstrapAuthorization)) fail("F5 completed history invalid");
  const bootstrapReceipt = completedBootstrap?.commitReceipt;
  if (bootstrapReceipt?.commit !== "591f2051482581c29f082544ac36efb0f09df1d6" ||
      bootstrapReceipt?.tree !== "307af84575fe83c0bffb7b9409c4fcda01533dd5" ||
      bootstrapReceipt?.parent !== "a6641fa18c781bad1ee77ac07ae2b6ebb7b74f07" ||
      bootstrapReceipt?.subject !== "AU20: identify bootstrap resource ownership" ||
      bootstrapReceipt?.pathCount !== 9 ||
      bootstrapReceipt?.preTransitionProgressSha256 !== "25b25254b0a1cbd311089461a310219a4aad1e7dfb937fc8228e060ddd26aadb" ||
      bootstrapReceipt?.preTransitionChangeMapSha256 !== "f2b5f0cd4576056c55a9f62b390f217d2589446e9bbc19483be2873c0371c654" ||
      bootstrapReceipt?.serverFactorySha256 !== bootstrapFinal.serverFactorySha256 ||
      bootstrapReceipt?.testSha256 !== bootstrapFinal.testSha256 ||
      JSON.stringify(bootstrapReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      bootstrapReceipt?.status !== "completed-history" ||
      Object.values(bootstrapReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F5 commit receipt mismatch");
  const bootstrapGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", bootstrapReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (bootstrapGitReceipt.status !== 0 ||
      bootstrapGitReceipt.stdout.trim() !== [bootstrapReceipt.commit, bootstrapReceipt.tree, bootstrapReceipt.parent, bootstrapReceipt.subject].join("\n")) fail("F5 commit object mismatch");
  const expectedDisposalAuthorization = {
    increment: "run-orchestration-async-disposal",
    stage: "write-code-async-runtime-disposal",
    finding: "F2",
    authorizedPaths: [
      "packages/core-api/src/server-factory.ts",
      "packages/remote-server/src/index.ts",
      "packages/desktop/src/boot-server.ts",
      "packages/desktop/src/main.ts",
      "packages/web/scripts/ah1-test-server.ts",
      "packages/web/scripts/ah5-test-server.ts",
      "packages/web/scripts/ah6-test-server.ts",
    ],
    frozenPaths: [
      "packages/core-api/src/__tests__/server-disposal.integration.test.ts",
      ".pipeline/work/AU20/red-proofs/run-orchestration-async-disposal.json",
      "plans/AU20/red-proof-reviews/run-orchestration-async-disposal.md",
      "scripts/surface-census.ts",
    ],
    requiredImplementation: {
      disposeReturn: "one shared Promise<void>",
      phaseOrder: ["bet-decomposition", "run-runtime", "app-domain", "websocket", "http", "owned-db"],
      failureBehavior: "run every phase once and reject one ordered phase-tagged AggregateError",
      databaseOwnership: "await owned database close; never close injected database",
      callerBehavior: "all six production callers await disposal through one-shot signal/quit handling",
    },
    newExportsAuthorized: false,
    serviceSurfaceGrowthAuthorized: false,
    otherProductionPathsAuthorized: false,
    testsAuthorized: false,
    implementationReviewRequiredBeforeCommit: true,
    nextIncrement: "knowledge-retro-snapshot",
  };
  const completedDisposal = finalCorrection.completedIncrements?.find((increment) => increment.name === "run-orchestration-async-disposal");
  const disposalRed = completedDisposal?.redProofReview;
  if (disposalRed?.testSha256 !== "f136b0f3b544070a92dd9cc63a9c281de468009b296bcd9dd0d76e6d1b3e94f3" ||
      disposalRed?.proofSha256 !== "56256c3bf8e74894df90115ca873f671c87c212ae3424debd7b0383fa330987b" ||
      disposalRed?.reviewSha256 !== "a2634e280fe73c730d80b0c19e93871eee2ba883dafc9380c18bd1f12bab64fc" ||
      disposalRed?.verdict !== "accept" ||
      sha256(fs.readFileSync(path.join(root, disposalRed.testPath))) !== disposalRed.testSha256 ||
      sha256(fs.readFileSync(path.join(root, disposalRed.proofPath))) !== disposalRed.proofSha256 ||
      sha256(fs.readFileSync(path.join(root, disposalRed.reviewPath))) !== disposalRed.reviewSha256) fail("F2 red-proof binding mismatch");
  const expectedDisposalCandidatePaths = {
    "packages/core-api/src/server-factory.ts": "34332d65afb258b47de22e77452f30b29514fa23afcf70ab0b4555d43587fbb1",
    "packages/remote-server/src/index.ts": "5268bfa5fbb6ce88c782e7b4658b11c1b6ab57c26a7b73b01006a113ac2517a3",
    "packages/desktop/src/boot-server.ts": "5083a235f4b90fe1f609939435fb6e8b887568b6ac924337d5dbe718e7bba2f7",
    "packages/desktop/src/main.ts": "97aedbfc49137f79ab4d9d505b4b37c6bfef9646a7d49ecfd698e130172e0118",
    "packages/web/scripts/ah1-test-server.ts": "14e14a9a08a4642c7ea6aa19da0b0aa230389036e1b7b3474e3800be052d317e",
    "packages/web/scripts/ah5-test-server.ts": "bf47c33bc75275b3c3c83a27e5f6f7c6356a101c072933d283c76be4266d6ff4",
    "packages/web/scripts/ah6-test-server.ts": "68699ebe2f01b50e232c4308a7878127bab3d5ab3286aa72fcead8e710f97169",
  };
  const expectedDisposalCommitPaths = [
    ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
    ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
    ".pipeline/work/AU20/progress.json",
    ".pipeline/work/AU20/red-proofs/run-orchestration-async-disposal.json",
    "packages/core-api/src/__tests__/server-disposal.integration.test.ts",
    "packages/core-api/src/server-factory.ts",
    "packages/desktop/src/boot-server.ts",
    "packages/desktop/src/main.ts",
    "packages/remote-server/src/index.ts",
    "packages/web/scripts/ah1-test-server.ts",
    "packages/web/scripts/ah5-test-server.ts",
    "packages/web/scripts/ah6-test-server.ts",
    "plans/AU20/corrective-change-map.json",
    "plans/AU20/red-proof-reviews/run-orchestration-async-disposal.md",
    "plans/AU20/register-reviews/run-orchestration-async-disposal-provenance-final.md",
    "plans/AU20/register-reviews/run-orchestration-async-disposal.md",
  ];
  const disposalCandidate = completedDisposal?.candidate;
  if (JSON.stringify(disposalCandidate?.paths) !== JSON.stringify(expectedDisposalCandidatePaths) ||
      disposalCandidate?.implementationReviewPath !== "plans/AU20/register-reviews/run-orchestration-async-disposal.md" ||
      disposalCandidate?.implementationReviewSha256 !== "ca703b9a4dbea151cf1fd19eea71b5210c3bb2269b0246cc21fda2e48f7ee88b" ||
      disposalCandidate?.implementationReviewVerdict !== "revise" ||
      disposalCandidate?.productVerdict !== "accept" ||
      disposalCandidate?.provenanceVerdict !== "revise" ||
      disposalCandidate?.finalReviewPath !== "plans/AU20/register-reviews/run-orchestration-async-disposal-provenance-final.md" ||
      disposalCandidate?.finalReviewSha256 !== "686dd980c4617f35b3634a9f8176f82fa662af760af8555a0bc8b9a128f49008" ||
      disposalCandidate?.finalReviewVerdict !== "accept" ||
      disposalCandidate?.status !== "accepted-commit-authorized" ||
      disposalCandidate?.commitAuthorization?.message !== "AU20 F2: await runtime disposal" ||
      JSON.stringify(disposalCandidate?.commitAuthorization?.paths) !== JSON.stringify(expectedDisposalCommitPaths) ||
      Object.entries(expectedDisposalCandidatePaths).some(([candidatePath, expectedHash]) => {
        const committed = spawnSync("git", ["show", `1397db5a5b5a07e1bb6d1884ed550e0e148606a4:${candidatePath}`], { cwd: root, encoding: null, shell: false });
        return committed.status !== 0 || sha256(committed.stdout) !== expectedHash;
      }) ||
      sha256(fs.readFileSync(path.join(root, disposalCandidate.implementationReviewPath))) !== disposalCandidate.implementationReviewSha256 ||
      sha256(fs.readFileSync(path.join(root, disposalCandidate.finalReviewPath))) !== disposalCandidate.finalReviewSha256) fail("F2 candidate binding mismatch");
  const disposalReceipt = completedDisposal?.commitReceipt;
  if (disposalReceipt?.commit !== "1397db5a5b5a07e1bb6d1884ed550e0e148606a4" ||
      disposalReceipt?.tree !== "f74b4b5f11c28da6ecd6486eb632f90816447b2c" ||
      disposalReceipt?.parent !== "591f2051482581c29f082544ac36efb0f09df1d6" ||
      disposalReceipt?.subject !== "AU20 F2: await runtime disposal" ||
      JSON.stringify(disposalReceipt?.paths) !== JSON.stringify(expectedDisposalCommitPaths) ||
      JSON.stringify(disposalReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(disposalReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F2 commit receipt mismatch");
  const disposalGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", disposalReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const disposalGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", disposalReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (disposalGitReceipt.status !== 0 ||
      disposalGitReceipt.stdout.trim() !== [disposalReceipt.commit, disposalReceipt.tree, disposalReceipt.parent, disposalReceipt.subject].join("\n") ||
      disposalGitPaths.status !== 0 ||
      JSON.stringify(disposalGitPaths.stdout.trim().split("\n")) !== JSON.stringify(expectedDisposalCommitPaths)) fail("F2 commit object mismatch");
  const expectedRetroAuthorization = {
    increment: "knowledge-retro-snapshot",
    stage: "write-tests-knowledge-retro-snapshot",
    finding: "F4",
    testPath: "packages/core-api/src/__tests__/AC2-retro.integration.test.ts",
    testSha256: "a6efabd19d952737afdcc5b956c8a8f31cb45354d47ac187b213b143064e7107",
    proofPath: ".pipeline/work/AU20/red-proofs/knowledge-retro-snapshot.json",
    productPath: "packages/core-api/src/routes/bets.ts",
    productSha256: "8b3785686fb9bd24f2d3f861ffe48a503facaa22b09cab97d0dc82a9ebf3104d",
    focusedCommand: "npx vitest run --config vitest.integration.config.ts --project service packages/core-api/src/__tests__/AC2-retro.integration.test.ts",
    expectedRed: {
      exitCode: 1,
      failedTests: 1,
      passedTests: 22,
      assertion: "creation-time hypothesis snapshot remains immutable after later bet hypothesis edit",
      expected: "Users will complete onboarding in under 5 minutes.",
      received: "UPDATED HYPOTHESIS — should not appear in retro",
    },
    authorizedPaths: [".pipeline/work/AU20/red-proofs/knowledge-retro-snapshot.json"],
    testModificationAuthorized: false,
    productCodeAuthorized: false,
    newExportsAuthorized: false,
    serviceSurfaceGrowthAuthorized: false,
    nextStage: "red-proof-review-knowledge-retro-snapshot",
    status: "write-tests-authorized",
  };
  const completedRetro = finalCorrection.completedIncrements?.find((increment) => increment.name === "knowledge-retro-snapshot");
  const retroAuthorization = completedRetro?.writeTestsAuthorization;
  const committedRetroProduct = spawnSync(
    "git",
    ["show", "1397db5a5b5a07e1bb6d1884ed550e0e148606a4:packages/core-api/src/routes/bets.ts"],
    { cwd: root, encoding: null, shell: false },
  );
  if (JSON.stringify(retroAuthorization) !== JSON.stringify(expectedRetroAuthorization) ||
      sha256(fs.readFileSync(path.join(root, retroAuthorization.testPath))) !== retroAuthorization.testSha256 ||
      committedRetroProduct.status !== 0 ||
      sha256(committedRetroProduct.stdout) !== retroAuthorization.productSha256) fail("F4 write-tests authorization mismatch");
  const retroRed = completedRetro?.redProofReview;
  if (retroRed?.increment !== "knowledge-retro-snapshot" ||
      retroRed?.finding !== "F4" ||
      retroRed?.testPath !== expectedRetroAuthorization.testPath ||
      retroRed?.testSha256 !== expectedRetroAuthorization.testSha256 ||
      retroRed?.proofPath !== expectedRetroAuthorization.proofPath ||
      retroRed?.proofSha256 !== "f75002097cdef4080a41772ec2077ac95e0f64534dc8b511c526d2aa70baadee" ||
      retroRed?.reviewPath !== "plans/AU20/red-proof-reviews/knowledge-retro-snapshot.md" ||
      retroRed?.reviewSha256 !== "f64999e9ade9f5632ceb49cc0dd100f8db609c9c746d809e4db200a2984e002f" ||
      retroRed?.verdict !== "accept" ||
      retroRed?.expectedRedExitCode !== 1 ||
      retroRed?.status !== "accepted" ||
      sha256(fs.readFileSync(path.join(root, retroRed.testPath))) !== retroRed.testSha256 ||
      sha256(fs.readFileSync(path.join(root, retroRed.proofPath))) !== retroRed.proofSha256 ||
      sha256(fs.readFileSync(path.join(root, retroRed.reviewPath))) !== retroRed.reviewSha256) fail("F4 red-proof binding mismatch");
  const expectedRetroCodeAuthorization = {
    increment: "knowledge-retro-snapshot",
    stage: "write-code-knowledge-retro-snapshot",
    finding: "F4",
    authorizedPaths: ["packages/core-api/src/routes/bets.ts"],
    frozenPaths: [
      "packages/core-api/src/__tests__/AC2-retro.integration.test.ts",
      ".pipeline/work/AU20/red-proofs/knowledge-retro-snapshot.json",
      "plans/AU20/red-proof-reviews/knowledge-retro-snapshot.md",
      "scripts/surface-census.ts",
    ],
    requiredImplementation: {
      behavior: "retain creation-time meta.hypothesis when updating an existing retro after the bet hypothesis changes",
      api: "use existing knowledge list/update CRUD; add no bespoke public method",
      mutableFields: ["verdict", "validatedAt", "validatedBy"],
      transaction: "retain atomic bet-outcome and knowledge-item update transaction",
    },
    newExportsAuthorized: false,
    serviceSurfaceGrowthAuthorized: false,
    otherProductionPathsAuthorized: false,
    testsAuthorized: false,
    implementationReviewRequiredBeforeCommit: true,
    nextIncrement: "harness-registry-mcp-entry",
    status: "authorized",
  };
  if (JSON.stringify(completedRetro?.writeCodeAuthorization) !== JSON.stringify(expectedRetroCodeAuthorization)) fail("F4 historical write-code authorization mismatch");
  const expectedRetroCommitPaths = [
    ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
    ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
    ".pipeline/work/AU20/progress.json",
    ".pipeline/work/AU20/red-proofs/knowledge-retro-snapshot.json",
    "packages/core-api/src/routes/bets.ts",
    "plans/AU20/corrective-change-map.json",
    "plans/AU20/red-proof-reviews/knowledge-retro-snapshot.md",
    "plans/AU20/register-reviews/knowledge-retro-snapshot.md",
  ];
  const retroCandidate = completedRetro?.candidate;
  if (retroCandidate?.increment !== "knowledge-retro-snapshot" ||
      retroCandidate?.finding !== "F4" ||
      retroCandidate?.productPath !== expectedRetroAuthorization.productPath ||
      retroCandidate?.productSha256 !== "7361a2fd2977c0f6ca74527006ea0838ebe7442e784816b412962d37ac7a8bf3" ||
      retroCandidate?.testPath !== expectedRetroAuthorization.testPath ||
      retroCandidate?.testSha256 !== expectedRetroAuthorization.testSha256 ||
      retroCandidate?.proofPath !== retroRed.proofPath ||
      retroCandidate?.proofSha256 !== retroRed.proofSha256 ||
      retroCandidate?.redReviewPath !== retroRed.reviewPath ||
      retroCandidate?.redReviewSha256 !== retroRed.reviewSha256 ||
      retroCandidate?.implementationReviewPath !== "plans/AU20/register-reviews/knowledge-retro-snapshot.md" ||
      retroCandidate?.implementationReviewSha256 !== "fe7432f7f11b0dc705b90dfc45fd0c683614e395ac62991ae0e3c747d0231ce7" ||
      retroCandidate?.implementationReviewVerdict !== "accept" ||
      JSON.stringify(retroCandidate?.verification) !== JSON.stringify({
        focused: "23/23 pass",
        serviceIntegration: "2869 pass; 7 skipped by existing lane policy",
        check: "pass",
        lint: "pass",
        unit: "3557 pass",
        gate: "pass",
        census: "23 services / 231 methods / 181 types / 412 total",
        knowledgeCensus: "17 methods / 12 types / 29 total",
      }) ||
      retroCandidate?.status !== "accepted-commit-authorized" ||
      retroCandidate?.commitAuthorization?.message !== "AU20 F4: preserve retro hypothesis snapshot" ||
      JSON.stringify(retroCandidate?.commitAuthorization?.paths) !== JSON.stringify(expectedRetroCommitPaths) ||
      sha256(fs.readFileSync(path.join(root, retroCandidate.productPath))) !== retroCandidate.productSha256 ||
      sha256(fs.readFileSync(path.join(root, retroCandidate.testPath))) !== retroCandidate.testSha256 ||
      sha256(fs.readFileSync(path.join(root, retroCandidate.proofPath))) !== retroCandidate.proofSha256 ||
      sha256(fs.readFileSync(path.join(root, retroCandidate.redReviewPath))) !== retroCandidate.redReviewSha256 ||
      sha256(fs.readFileSync(path.join(root, retroCandidate.implementationReviewPath))) !== retroCandidate.implementationReviewSha256) fail("F4 candidate binding mismatch");
  const retroReceipt = completedRetro?.commitReceipt;
  if (retroReceipt?.commit !== "0f7f6c1b1354eea71f9cc5c36098c413b62741d8" ||
      retroReceipt?.tree !== "beb4871cf834354cdf45bc6f6d893e94af8106ec" ||
      retroReceipt?.parent !== "1397db5a5b5a07e1bb6d1884ed550e0e148606a4" ||
      retroReceipt?.subject !== "AU20 F4: preserve retro hypothesis snapshot" ||
      JSON.stringify(retroReceipt?.paths) !== JSON.stringify(expectedRetroCommitPaths) ||
      JSON.stringify(retroReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(retroReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F4 commit receipt mismatch");
  const retroGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", retroReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const retroGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", retroReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (retroGitReceipt.status !== 0 ||
      retroGitReceipt.stdout.trim() !== [retroReceipt.commit, retroReceipt.tree, retroReceipt.parent, retroReceipt.subject].join("\n") ||
      retroGitPaths.status !== 0 ||
      JSON.stringify(retroGitPaths.stdout.trim().split("\n")) !== JSON.stringify(expectedRetroCommitPaths)) fail("F4 commit object mismatch");
  const completedMcp = finalCorrection.completedIncrements?.find((increment) => increment.name === "harness-registry-mcp-entry");
  const mcpRed = completedMcp?.amendedRedProofReview;
  if (mcpRed?.validatorSha256 !== "2007c4fe44975be2d5b07381ee34ecbd6039bcb82b0acf775f6edc8c933de0ce" ||
      mcpRed?.proofSha256 !== "9f8c60258be9b8ee320aa7388189903cbe7e0d7bd94e247c1fc82aede28a4762" ||
      mcpRed?.reviewSha256 !== "40a0e0e3a43e821ef8328c79c07bb053ba0be7f248e7af891c8f1e961e5142de" ||
      mcpRed?.verdict !== "accept" ||
      sha256(fs.readFileSync(path.join(root, mcpRed.validatorPath))) !== mcpRed.validatorSha256 ||
      sha256(fs.readFileSync(path.join(root, mcpRed.proofPath))) !== mcpRed.proofSha256 ||
      sha256(fs.readFileSync(path.join(root, mcpRed.reviewPath))) !== mcpRed.reviewSha256 ||
      Object.entries(mcpRed.testSha256).some(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) !== hash)) fail("F3 amended red-proof binding mismatch");
  const mcpCandidate = completedMcp?.candidate;
  if (mcpCandidate?.implementationReviewPath !== "plans/AU20/register-reviews/harness-registry-mcp-entry.md" ||
      mcpCandidate?.implementationReviewSha256 !== "e4b7ff82bf0e67e1bbaa394bf3a0dc070d21b8b360bafee2079be500a7571eb7" ||
      mcpCandidate?.implementationReviewVerdict !== "accept" ||
      mcpCandidate?.status !== "accepted-commit-authorized" ||
      mcpCandidate?.commitAuthorization?.message !== "AU20 F3: isolate harness MCP entry" ||
      Object.entries(mcpCandidate?.productSha256 ?? {}).some(([file, hash]) => {
        const committed = spawnSync("git", ["show", `e68a170757d71476ba147995247ac8be2d4a97e2:${file}`], { cwd: root, encoding: null, shell: false });
        return committed.status !== 0 || sha256(committed.stdout) !== hash;
      }) ||
      sha256(fs.readFileSync(path.join(root, mcpCandidate.implementationReviewPath))) !== mcpCandidate.implementationReviewSha256) fail("F3 candidate binding mismatch");
  const mcpReceipt = completedMcp?.commitReceipt;
  if (mcpReceipt?.commit !== "e68a170757d71476ba147995247ac8be2d4a97e2" ||
      mcpReceipt?.tree !== "877f217b6d2c8efe3889da39d500e90ad6d08912" ||
      mcpReceipt?.parent !== "0f7f6c1b1354eea71f9cc5c36098c413b62741d8" ||
      mcpReceipt?.subject !== "AU20 F3: isolate harness MCP entry" ||
      JSON.stringify(mcpReceipt?.paths) !== JSON.stringify(mcpCandidate.commitAuthorization.paths) ||
      JSON.stringify(mcpReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(mcpReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F3 commit receipt mismatch");
  const mcpGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", mcpReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const mcpGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", mcpReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (mcpGitReceipt.status !== 0 ||
      mcpGitReceipt.stdout.trim() !== [mcpReceipt.commit, mcpReceipt.tree, mcpReceipt.parent, mcpReceipt.subject].join("\n") ||
      mcpGitPaths.status !== 0 ||
      JSON.stringify(mcpGitPaths.stdout.trim().split("\n")) !== JSON.stringify(mcpReceipt.paths)) fail("F3 commit object mismatch");
  const completedNotification = finalCorrection.completedIncrements?.find((increment) => increment.name === "notifications-secret-errors");
  const notificationRed = completedNotification?.redProofReview;
  if (notificationRed?.testSha256 !== "42e6a99fbe7fa76fcd1004251d929bffe77b88738dfa9c14d5a8f7226dd92208" ||
      notificationRed?.proofSha256 !== "313e03ec67454bba1b271f9a6d6cefbc1ffc2523ed7b32310f2e0f7efe4cdfdf" ||
      notificationRed?.reviewSha256 !== "ce306e04f6678d02d3b38d2979cd8aed8aedbb36238bcdbdd5b8022ca0441fa6" ||
      notificationRed?.verdict !== "accept" ||
      sha256(fs.readFileSync(path.join(root, notificationRed.testPath))) !== notificationRed.testSha256 ||
      sha256(fs.readFileSync(path.join(root, notificationRed.proofPath))) !== notificationRed.proofSha256 ||
      sha256(fs.readFileSync(path.join(root, notificationRed.reviewPath))) !== notificationRed.reviewSha256) fail("F9 red-proof binding mismatch");
  const notificationCandidate = completedNotification?.candidate;
  if (notificationCandidate?.productSha256 !== "ab20be1c9551852bbaa4d03445ad056534e9b847c84be250557e8ac80c420b9a" ||
      notificationCandidate?.implementationReviewSha256 !== "63bd7c70705b7b36d1f55f9fc15af54e258a5d31f78d2fd21d5d9058ce7847e5" ||
      notificationCandidate?.implementationReviewVerdict !== "accept" ||
      notificationCandidate?.status !== "accepted-commit-authorized" ||
      notificationCandidate?.commitAuthorization?.message !== "AU20 F9: propagate notification secret errors" ||
      sha256(fs.readFileSync(path.join(root, notificationCandidate.productPath))) !== notificationCandidate.productSha256 ||
      sha256(fs.readFileSync(path.join(root, notificationCandidate.implementationReviewPath))) !== notificationCandidate.implementationReviewSha256) fail("F9 candidate binding mismatch");
  const notificationReceipt = completedNotification?.commitReceipt;
  if (notificationReceipt?.commit !== "79056099c5852aab9658534b6a7fe2341260e2f0" ||
      notificationReceipt?.tree !== "cfb9ad3034f35da9856bada6fe66db8efb638d73" ||
      notificationReceipt?.parent !== "e68a170757d71476ba147995247ac8be2d4a97e2" ||
      notificationReceipt?.subject !== "AU20 F9: propagate notification secret errors" ||
      JSON.stringify(notificationReceipt?.paths) !== JSON.stringify(notificationCandidate.commitAuthorization.paths) ||
      JSON.stringify(notificationReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(notificationReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F9 commit receipt mismatch");
  const notificationGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", notificationReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const notificationGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", notificationReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (notificationGitReceipt.status !== 0 ||
      notificationGitReceipt.stdout.trim() !== [notificationReceipt.commit, notificationReceipt.tree, notificationReceipt.parent, notificationReceipt.subject].join("\n") ||
      notificationGitPaths.status !== 0 ||
      JSON.stringify(notificationGitPaths.stdout.trim().split("\n")) !== JSON.stringify(notificationReceipt.paths)) fail("F9 commit object mismatch");
  const completedWatcher = finalCorrection.completedIncrements?.find((increment) => increment.name === "filesystems-watcher-errors");
  const watcherReceipt = completedWatcher?.commitReceipt;
  if (watcherReceipt?.commit !== "90aab0a2ef02d6016cccc435208d1cf6e2cb4b92" ||
      watcherReceipt?.tree !== "3af7ba02edbad3e9d16a87355f13d8637b095dec" ||
      watcherReceipt?.parent !== "79056099c5852aab9658534b6a7fe2341260e2f0" ||
      watcherReceipt?.subject !== "AU20 F10: surface filesystem watcher failures" ||
      watcherReceipt?.paths?.length !== 11 ||
      JSON.stringify(watcherReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(watcherReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F10 commit receipt mismatch");
  const watcherGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", watcherReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const watcherGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", watcherReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (watcherGitReceipt.status !== 0 ||
      watcherGitReceipt.stdout.trim() !== [watcherReceipt.commit, watcherReceipt.tree, watcherReceipt.parent, watcherReceipt.subject].join("\n") ||
      watcherGitPaths.status !== 0 ||
      JSON.stringify(watcherGitPaths.stdout.trim().split("\n")) !== JSON.stringify(watcherReceipt.paths)) fail("F10 commit object mismatch");
  const completedOwnership = finalCorrection.completedIncrements?.find((increment) => increment.name === "ownership-prose-current");
  const ownershipReceipt = completedOwnership?.commitReceipt;
  if (ownershipReceipt?.commit !== "4506a28c4dbd1bc581a85dbba86552c43b63fad3" ||
      ownershipReceipt?.tree !== "fd95c25beb2036700062bb0c773b8446349b7548" ||
      ownershipReceipt?.parent !== "90aab0a2ef02d6016cccc435208d1cf6e2cb4b92" ||
      ownershipReceipt?.subject !== "AU20 F8: correct ownership prose" ||
      ownershipReceipt?.paths?.length !== 9 ||
      JSON.stringify(ownershipReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(ownershipReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F8 commit receipt mismatch");
  const ownershipGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", ownershipReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const ownershipGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", ownershipReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (ownershipGitReceipt.status !== 0 ||
      ownershipGitReceipt.stdout.trim() !== [ownershipReceipt.commit, ownershipReceipt.tree, ownershipReceipt.parent, ownershipReceipt.subject].join("\n") ||
      ownershipGitPaths.status !== 0 ||
      JSON.stringify(ownershipGitPaths.stdout.trim().split("\n")) !== JSON.stringify(ownershipReceipt.paths)) fail("F8 commit object mismatch");
  const completedCensus = finalCorrection.completedIncrements?.find((increment) => increment.name === "evidence-current-census");
  const censusReceipt = completedCensus?.commitReceipt;
  if (censusReceipt?.commit !== "b69b822ca111677ed7e600076c0d9347c2916242" ||
      censusReceipt?.tree !== "03c4fa25929b9a4893ca5690ba9d772e5955733c" ||
      censusReceipt?.parent !== "4506a28c4dbd1bc581a85dbba86552c43b63fad3" ||
      censusReceipt?.subject !== "AU20 F7 F12: regenerate current census evidence" ||
      censusReceipt?.paths?.length !== 9 ||
      JSON.stringify(censusReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(censusReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("F7/F12 commit receipt mismatch");
  const censusGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", censusReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const censusGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", censusReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (censusGitReceipt.status !== 0 ||
      censusGitReceipt.stdout.trim() !== [censusReceipt.commit, censusReceipt.tree, censusReceipt.parent, censusReceipt.subject].join("\n") ||
      censusGitPaths.status !== 0 ||
      JSON.stringify(censusGitPaths.stdout.trim().split("\n")) !== JSON.stringify(censusReceipt.paths)) fail("F7/F12 commit object mismatch");
  const completedKnowledge = finalCorrection.completedIncrements?.find((increment) => increment.name === "knowledge-knip-dead-surface");
  const knowledgeReceipt = completedKnowledge?.commitReceipt;
  if (knowledgeReceipt?.commit !== "b8422e57667631117024587ee239f115b3c23165" ||
      knowledgeReceipt?.tree !== "91575c4070969db2d1c007d4154b321204474e0c" ||
      knowledgeReceipt?.parent !== "b69b822ca111677ed7e600076c0d9347c2916242" ||
      knowledgeReceipt?.subject !== "AU20 knowledge: delete Knip dead surface" ||
      knowledgeReceipt?.paths?.length !== 9 ||
      JSON.stringify(knowledgeReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(knowledgeReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("knowledge Knip commit receipt mismatch");
  const knowledgeGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", knowledgeReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const knowledgeGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", knowledgeReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (knowledgeGitReceipt.status !== 0 ||
      knowledgeGitReceipt.stdout.trim() !== [knowledgeReceipt.commit, knowledgeReceipt.tree, knowledgeReceipt.parent, knowledgeReceipt.subject].join("\n") ||
      knowledgeGitPaths.status !== 0 ||
      JSON.stringify(knowledgeGitPaths.stdout.trim().split("\n")) !== JSON.stringify(knowledgeReceipt.paths)) fail("knowledge Knip commit object mismatch");
  const completedEval = finalCorrection.completedIncrements?.find((increment) => increment.name === "eval-knip-unused-dependency");
  const evalReceipt = completedEval?.commitReceipt;
  if (evalReceipt?.commit !== "f2e04790727286b1d070cfb487e7f994a230bbc6" ||
      evalReceipt?.tree !== "7875e1ad1fc8640d5a855dc78d6935363ea5041a" ||
      evalReceipt?.parent !== "b8422e57667631117024587ee239f115b3c23165" ||
      evalReceipt?.subject !== "AU20 eval: remove unused connections dependency" ||
      evalReceipt?.paths?.length !== 9 ||
      JSON.stringify(evalReceipt?.census) !== JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) ||
      Object.values(evalReceipt?.verification ?? {}).some((result) => result !== "pass")) fail("eval Knip commit receipt mismatch");
  const evalGitReceipt = spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", evalReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  const evalGitPaths = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", evalReceipt.commit], { cwd: root, encoding: "utf8", shell: false });
  if (evalGitReceipt.status !== 0 ||
      evalGitReceipt.stdout.trim() !== [evalReceipt.commit, evalReceipt.tree, evalReceipt.parent, evalReceipt.subject].join("\n") ||
      evalGitPaths.status !== 0 ||
      JSON.stringify(evalGitPaths.stdout.trim().split("\n")) !== JSON.stringify(evalReceipt.paths)) fail("eval Knip commit object mismatch");
  const notificationsRed = active?.staticRedProof;
  const notificationsCandidate = active?.candidate;
  if (notificationsRed?.proofSha256 !== "fe33df8165f12fa0c0c7967ce12ebff2eb0b2d9205b3661d8b0d3c4a82e0c7c7" ||
      notificationsRed?.reviewSha256 !== "7dfaa82ef2765cdcb40663358331e4bef090ac7324f27eb2816e0cea7c80bb6c" ||
      notificationsRed?.verdict !== "accept" ||
      sha256(fs.readFileSync(path.join(root, notificationsRed.proofPath))) !== notificationsRed.proofSha256 ||
      sha256(fs.readFileSync(path.join(root, notificationsRed.reviewPath))) !== notificationsRed.reviewSha256) fail("notifications Knip static-red binding mismatch");
  if (JSON.stringify(notificationsCandidate?.productSha256) !== JSON.stringify({
        "packages/core-api/notifications/package.json": "a87edcd4fac0b82bd5eb0feb7e306bce06a11c3c864a832cd99de42b58760b7a",
        "package-lock.json": "cad0e88ea2c0f6406e67df4ad0fb6b8addab85cd0c96d136f25d248aa86418a5",
      }) ||
      notificationsCandidate?.proofSha256 !== notificationsRed.proofSha256 ||
      notificationsCandidate?.redReviewSha256 !== notificationsRed.reviewSha256 ||
      notificationsCandidate?.implementationReviewSha256 !== "27bd368f0953bd85f7f4d57537767780a797d7156d2cad1f09b80cac216b3927" ||
      notificationsCandidate?.implementationReviewVerdict !== "accept" ||
      notificationsCandidate?.status !== "accepted-commit-authorized" ||
      notificationsCandidate?.commitAuthorization?.message !== "AU20 notifications: remove unused SMTP dev dependencies" ||
      Object.entries(notificationsCandidate.productSha256).some(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) !== hash) ||
      sha256(fs.readFileSync(path.join(root, notificationsCandidate.implementationReviewPath))) !== notificationsCandidate.implementationReviewSha256) fail("notifications Knip candidate binding mismatch");
  if (active?.name !== "notifications-knip-unused-devdeps" ||
      active?.service !== "notifications" ||
      active?.authorizedStage !== "commit-notifications-knip-unused-devdeps" ||
      JSON.stringify(active?.authorization?.paths) !== JSON.stringify([
        ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
        ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
        ".pipeline/work/AU20/progress.json",
        ".pipeline/work/AU20/red-proofs/notifications-knip-unused-devdeps.json",
        "package-lock.json",
        "packages/core-api/notifications/package.json",
        "plans/AU20/corrective-change-map.json",
        "plans/AU20/red-proof-reviews/notifications-knip-unused-devdeps.md",
        "plans/AU20/register-reviews/notifications-knip-unused-devdeps.md",
      ]) ||
      active?.productCodeAuthorized !== false ||
      finalCorrection.nextIncrement !== "notifications-knip-unused-devdeps" ||
      integrity.writeTestsLocked !== true ||
      integrity.codeLocked !== true ||
      integrity.productCodeLocked !== true ||
      integrity.commitLocked !== false) fail("notifications Knip commit authorization state invalid");
  console.log(JSON.stringify({
    identities: actual.length,
    diagnosedFormerUnknowns: diagnosed.length,
    unresolved: 0,
    payloadSha256: integrity.payloadSha256,
    review: integrity.acceptedReview,
    writeTestsLocked: integrity.writeTestsLocked,
    codeLocked: integrity.codeLocked,
    productCodeLocked: integrity.productCodeLocked,
    authorizedStage: active.authorizedStage,
  }));
  process.exit(0);
  const amendment = integrity.proofInventoryArchitectureAmendment;
  const amendmentReview = amendment?.acceptedReview;
  if (!amendmentReview?.path || amendmentReview.verdict !== "accept") fail("proof-inventory amendment review binding absent");
  if (sha256(fs.readFileSync(path.join(root, amendmentReview.path))) !== amendmentReview.sha256) fail("proof-inventory amendment review hash mismatch");
  if (sha256(fs.readFileSync(path.join(root, ".pipeline/work/AU20/architecture.md"))) !== amendmentReview.architectureSha256) fail("proof-inventory accepted architecture hash mismatch");
  if (sha256(fs.readFileSync(path.join(root, ".pipeline/work/AU20/feasibility.md"))) !== amendmentReview.feasibilitySha256) fail("proof-inventory accepted feasibility hash mismatch");
  if (integrity.writeTestsLocked) fail("write-tests remains locked");
  if (amendment.authorizedStage === "proof-inventory-amendment-write-tests" ||
      amendment.authorizedStage === "proof-inventory-amendment-r3-write-tests-caller-migration") {
    if (amendment.redProofReview !== null || integrity.codeLocked !== true) fail("R3 write-tests must keep code locked and red proof empty");
  } else if (amendment.authorizedStage === "proof-inventory-amendment-r3-write-code") {
    const redProof = amendment.redProofReview;
    if (!redProof?.path || redProof.verdict !== "accept") fail("proof-inventory amendment red-proof binding absent");
    if (sha256(fs.readFileSync(path.join(root, redProof.path))) !== redProof.sha256) fail("proof-inventory red-proof review hash mismatch");
    if (sha256(fs.readFileSync(path.join(root, "packages/web/src/e2e-support/validation-contract.test.ts"))) !== redProof.validationContractTestSha256) fail("validation contract test hash mismatch");
    if (sha256(fs.readFileSync(path.join(root, "packages/web/src/e2e-support/review-trust.test.ts"))) !== redProof.reviewTrustTestSha256) fail("review trust test hash mismatch");
    if (sha256(fs.readFileSync(path.join(root, redProof.durableRedProofPath))) !== redProof.durableRedProofSha256) fail("durable red-proof JSON hash mismatch");
    if (JSON.stringify(redProof.counts) !== JSON.stringify({ total: 153, green: 111, intentionallyRed: 42 })) fail("R3 caller-migration red-proof counts mismatch");
    if (integrity.codeLocked !== false) fail("proof-inventory amendment code remains locked");
  } else {
    fail("proof-inventory authorized stage invalid");
  }
} else if (integrity.acceptedReview == null && integrity.writeTestsLocked !== true) {
  fail("unreviewed map must keep write-tests locked");
}

console.log(JSON.stringify({
  identities: actual.length,
  diagnosedFormerUnknowns: diagnosed.length,
  unresolved: 0,
  payloadSha256: integrity.payloadSha256,
  review: integrity.acceptedReview,
  writeTestsLocked: integrity.writeTestsLocked,
}));
