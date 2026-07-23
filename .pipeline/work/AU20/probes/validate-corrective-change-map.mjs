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
  if (canonicalObjectHash(finalCorrection?.activeIncrement?.redProofReview) !== "7c3a751c023b055b367d5c487a5174a6cb4ab8ec2579e65b8c13e3768e6dac1e") fail("F13 red-proof history mismatch");
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
  if (active?.authorizedStage === "write-code-review-finding-ledger") {
    const redProof = active.redProofReview;
    if (!redProof?.path || redProof.verdict !== "accept") fail("F13 red-proof binding absent");
    if (sha256(fs.readFileSync(path.join(root, redProof.path))) !== redProof.sha256) fail("F13 red-proof review hash mismatch");
    if (sha256(fs.readFileSync(path.join(root, redProof.guardPath))) !== redProof.guardSha256) fail("F13 guard hash mismatch");
    if (redProof.historicalReviewSha256 !== finalArchitecture.finalReviewSha256 ||
        JSON.stringify(redProof.intendedRed) !== JSON.stringify({ message: "WARNING footer=6 headings=5", exitCode: 1 }) ||
        redProof.checkExitCode !== 0) fail("F13 red-proof evidence mismatch");
    if (integrity.writeTestsLocked !== false || integrity.codeLocked !== false ||
        integrity.productCodeLocked !== true || active.productCodeAuthorized !== false) fail("F13 write-code lock state invalid");
  } else if (active?.authorizedStage === "write-tests-review-finding-ledger") {
    if (active.redProofReview !== null || integrity.writeTestsLocked !== false ||
        integrity.codeLocked !== true || integrity.productCodeLocked !== true) fail("F13 write-tests lock state invalid");
  } else {
    fail("final correction authorized stage invalid");
  }
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
