import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const progress = JSON.parse(fs.readFileSync(path.join(root, ".pipeline/work/AU20/progress.json"), "utf8"));
const browser = JSON.parse(fs.readFileSync(path.join(root, "plans/AU20/browser-validation-ledger.json"), "utf8"));
const system = JSON.parse(fs.readFileSync(path.join(root, "plans/AU20/system-validation-ledger.json"), "utf8"));
const diagnosticDir = path.join(root, "plans/AU20/diagnostics");
const diagnosticFiles = fs.existsSync(diagnosticDir)
  ? fs.readdirSync(diagnosticDir).filter((name) => name.endsWith(".json")).sort()
  : [];
const diagnostics = diagnosticFiles.map((name) => ({
  name,
  bytes: fs.readFileSync(path.join(diagnosticDir, name)),
  value: JSON.parse(fs.readFileSync(path.join(diagnosticDir, name), "utf8")),
}));
const diagnosisById = new Map();
const regressionProjectionById = new Map();
for (const diagnostic of diagnostics) {
  for (const identity of diagnostic.value.identities ?? []) {
    if (diagnosisById.has(identity.id)) throw new Error(`duplicate diagnostic identity: ${identity.id}`);
    diagnosisById.set(identity.id, { ...identity, artifact: `plans/AU20/diagnostics/${diagnostic.name}` });
  }
  for (const projection of diagnostic.value.regressionProjections ?? []) {
    if (regressionProjectionById.has(projection.id)) throw new Error(`duplicate regression projection: ${projection.id}`);
    regressionProjectionById.set(projection.id, { ...projection, artifact: `plans/AU20/diagnostics/${diagnostic.name}` });
  }
}

const surfaceByRegister = {
  "BR-ACCESS": ["packages/web/src/index.css", "packages/design-system/src/"],
  "BR-AGENTS": ["packages/web/src/pages/SettingsPage.tsx", "packages/web/src/pages/AgentProfile.tsx"],
  "BR-AH1": ["packages/web/src/pages/SetupFlow.tsx", "packages/web/src/pages/SettingsPage.tsx"],
  "BR-AH5": ["packages/web/src/components/CocOverlay.tsx", "packages/agent-orchestration/dispatch/src/service.ts"],
  "BR-AH6": ["packages/web/src/components/CocOverlay.tsx", "packages/agent-orchestration/run-orchestration/src/start-runtime.ts", "packages/agent-orchestration/dispatch/src/service.ts"],
  "BR-ARTIFACT-BLOCK": ["packages/design-system/src/ArtifactPreviewSurface.tsx", "packages/design-system/src/block/render-payload.tsx"],
  "BR-ASSISTANT": ["packages/web/src/components/CocOverlay.tsx"],
  "BR-CONVERSATIONS": ["packages/web/src/pages/Conversations.tsx", "packages/web/src/components/ConversationSurface.tsx"],
  "BR-DIALOGS": ["packages/design-system/src/Dialog.tsx"],
  "BR-FIXTURES": ["packages/web/e2e/fixtures.ts", "packages/api-contract/src/", "packages/core-api/src/routes/"],
  "BR-KNOWLEDGE": ["packages/web/src/pages/KnowledgeList.tsx", "packages/web/src/pages/KnowledgeDetail.tsx", "packages/web/src/pages/KnowledgeCreate.tsx"],
  "BR-LANE": ["packages/web/playwright.config.ts", "packages/web/playwright.ah1.config.ts", "packages/web/playwright.ah5.config.ts", "packages/web/playwright.ah6.config.ts"],
  "BR-LIFECYCLE": ["packages/web/src/components/SessionActivityPanel.tsx", "packages/agent-orchestration/run-orchestration/src/start-runtime.ts"],
  "BR-MESSAGES": ["packages/design-system/src/ThreadShell.tsx", "packages/web/src/components/PartList.tsx"],
  "BR-NAV": ["packages/web/src/AppShell.tsx", "packages/web/src/components/GlobalSearchPanel.tsx"],
  "BR-RESPONSIVE": ["packages/web/src/AppShell.tsx", "packages/web/src/shell/Sidebar.tsx"],
  "BR-SETTINGS": ["packages/web/src/pages/SettingsPage.tsx"],
  "BR-SETUP": ["packages/web/src/pages/SetupFlow.tsx"],
  "BR-STATUS": ["packages/design-system/src/CommentRow.tsx"],
  "BR-WORK-DETAIL": ["packages/web/src/pages/WorkBet.tsx", "packages/web/src/shell/TaskSheet.tsx"],
  "BR-WORK-ROUTES": ["packages/web/src/pages/WorkOverview.tsx", "packages/web/src/App.tsx"],
};
const ownerByRegister = {
  "BR-ACCESS": "web-design-system-accessibility",
  "BR-AGENTS": "web-agent-profile-and-composition",
  "BR-AH1": "setup-settings-credentials",
  "BR-AH5": "assistant-live-provider",
  "BR-AH6": "assistant-cassette-and-api",
  "BR-ARTIFACT-BLOCK": "web-block-and-artifact-rendering",
  "BR-ASSISTANT": "web-assistant-overlay",
  "BR-CONVERSATIONS": "web-conversations",
  "BR-DIALOGS": "web-dialog-primitives",
  "BR-FIXTURES": "web-e2e-api-fixtures",
  "BR-KNOWLEDGE": "web-and-core-knowledge",
  "BR-LANE": "web-e2e-lane-ownership",
  "BR-LIFECYCLE": "session-lifecycle-projection",
  "BR-MESSAGES": "web-part-and-message-rendering",
  "BR-NAV": "web-shell-navigation",
  "BR-RESPONSIVE": "web-shell-and-design-system",
  "BR-SETTINGS": "web-settings",
  "BR-SETUP": "web-and-core-setup",
  "BR-STATUS": "web-status-vocabulary",
  "BR-WORK-DETAIL": "web-and-core-work",
  "BR-WORK-ROUTES": "web-work-routing",
};

function resolveUnresolved(c) {
  return "unresolved";
}

function changeKind(d) {
  return {
    none: "no_change",
    feature_regression: "production_change",
    intentional_move: "test_move_or_replacement",
    stale_test_mock: "test_or_fixture_correction",
    missing_prerequisite: "prerequisite_or_setup",
    environment_blocker: "external_blocker",
    harness_defect: "narrow_harness_repair",
    unresolved: "pending_diagnosis",
  }[d];
}

function proof(d, c) {
  if (d === "none") return "Retain passing identity; final inventory rerun must remain passed.";
  if (d === "feature_regression") return `Focused failing behavior proof for ${c.title}; capture semantic assertion, request/response evidence, and painted screenshot before production edit.`;
  if (d === "intentional_move") return `Prove current capability at accepted canonical destination, then record one-to-one old ID to replacement ID lineage before moving the assertion.`;
  if (d === "stale_test_mock") return `Compare current API/UI contract to this assertion/fixture and demonstrate application behavior independently before correcting test or mock.`;
  if (d === "missing_prerequisite") return `Preflight the named credential/binary/service before collection; absent prerequisite must be blocked by name, and present prerequisite must execute this identity.`;
  if (d === "environment_blocker") return "Reproduce external condition after in-scope alternatives and retain blocked evidence.";
  return "Direct AU20-local runner/config intervention proof is required before any narrowly scoped harness repair.";
}

const normalizeDisposition = (value) => ({
  "feature regression": "feature_regression",
  "stale test/mock": "stale_test_mock",
  "missing prerequisite": "missing_prerequisite",
  "confirmed_no_regression": "none",
}[value] ?? value);

const browserEntries = browser.cases.map((c) => {
  const diagnosis = diagnosisById.get(c.id);
  const target = normalizeDisposition(c.disposition === "unresolved" ? (diagnosis?.disposition ?? resolveUnresolved(c)) : (c.disposition ?? "none"));
  const register = c.primaryProblemRegisterId ?? "PASS";
  const kind = changeKind(target);
  const regressionProjection = target === "feature_regression" ? regressionProjectionById.get(c.id) : null;
  if (target === "feature_regression" && !regressionProjection) throw new Error(`missing exact regression projection: ${c.id}`);
  return {
    id: c.id,
    sourceKind: "browser",
    execution: c.execution,
    priorDisposition: c.disposition ?? "none",
    targetDisposition: target,
    dispositionReview: c.disposition === "unresolved" ? (diagnosis ? "diagnosed_pending_independent_architecture_amendment_review" : "pending_direct_diagnosis") : "carried_from_accepted_discovery_or_design",
    rootProblem: register,
    changeKind: kind,
    changeOwner: kind === "no_change" ? "none" : kind === "pending_diagnosis" ? "architecture-planner-pending-direct-evidence" : target === "feature_regression" ? regressionProjection.exactSymbols[0].file : target === "stale_test_mock" ? c.file : diagnosis?.exactSymbols?.[0] ?? (["intentional_move","missing_prerequisite"].includes(target) ? c.file : surfaceByRegister[register]?.[0] ?? ownerByRegister[register] ?? "validation-owner"),
    layer: kind === "production_change" ? (["BR-LIFECYCLE","BR-SETUP","BR-AH6","BR-KNOWLEDGE","BR-WORK-DETAIL","BR-CONVERSATIONS"].includes(register) ? "human-interface-plus-meta-boundary" : "human-interface") : "validation",
    candidateFiles: target === "feature_regression" ? [...new Set(regressionProjection.exactSymbols.map((item) => item.file))] : kind === "pending_diagnosis" ? [c.file] : [...new Set([c.file, ...(diagnosis?.exactSymbols ?? []), ...(diagnosis ? [] : surfaceByRegister[register] ?? [])])],
    firstDivergentBoundary: diagnosis?.firstBoundary ?? (target === "none" ? "none; passing or focused-green identity" : c.dispositionBasis ?? c.evidence),
    focusedObservation: diagnosis?.focusedObservation ?? null,
    authority: c.authoritativeReference ?? diagnosis?.authority ?? diagnosis?.evidence?.[0] ?? (target === "intentional_move" ? `plans/AU20/design/approved.md#${register}` : null),
    replacementLineage: target === "intentional_move" ? (diagnosis?.testAction ?? (c.dispositionBasis?.startsWith("Execution state only") ? `Accepted ${register} canonical replacement; bind exact replacement ID before test edit.` : c.dispositionBasis) ?? null) : null,
    externalPrerequisite: target === "missing_prerequisite" ? "OPENROUTER_API_KEY" : null,
    exactSymbols: target === "feature_regression" ? regressionProjection.exactSymbols : [],
    causalSymbol: null,
    requiredRedProof: target === "feature_regression" ? regressionProjection.redProof : diagnosis?.redProof ?? proof(target, c),
    testAction: diagnosis?.testAction ?? (target === "intentional_move" ? "move_or_replace_with_lineage" : target === "stale_test_mock" ? "correct_after_independent_contract_proof" : target === "feature_regression" ? "retain_or_add_failing_assertion" : target === "none" ? "retain" : "preflight_then_execute"),
    productionAction: diagnosis?.productionAction ?? (target === "feature_regression" ? "minimum_fix_after_accepted_red_proof" : "none_until_new_product-red-evidence"),
    dependencyOrder: diagnosis?.dependencies ?? ["lane-inventory-green", `register-review:${register}`, "write-tests", "red-proof-review", "write-code-if-required", "implementation-review", "isolated-green-commit"],
    evidence: [c.authoritativeReference, ...(c.artifactRefs ?? []), c.evidence, ...(diagnosis?.evidence ?? []), diagnosis?.artifact].filter(Boolean),
    classificationBasis: c.disposition === "unresolved"
      ? diagnosis
        ? `Direct architecture diagnosis bound in ${diagnosis.artifact}; pending independent review.`
        : "No direct causal evidence yet. Remains unresolved; generator refuses default classification."
      : "Carried from exhaustive discovery and accepted corrective design/register evidence.",
    historicalHarnessBaseline: "trusted_regular_pre-AU20",
    harnessChangeAllowed: target === "harness_defect" ? "only_after_direct_AU20_local_intervention_proof" : "no",
  };
});

const systemPlan = {
  "review-critical-demand-package": ["evidence_generator", "scripts/generate-dependency-graph.ts", "static generator red proof"],
  "review-critical-runtime-disposal": ["production_change", "packages/core-api/src/server-factory.ts", "async teardown ordering integration red proof"],
  "review-critical-mcp-isolation": ["production_change", "packages/agent-execution/harness-registry/", "main-entry bundle/metafile isolation red proof"],
  "review-critical-retro-snapshot": ["production_change", "packages/core-api/src/routes/bets.ts", "immutable retro snapshot integration red proof"],
  "review-critical-aggregate": ["aggregate_closeout", "package.json", "all child obligations green and exact inventory reconciled"],
  "review-warning-notification-catch": ["production_change", "packages/core-api/notifications/src/install.ts", "unexpected encryption failure propagation red proof"],
  "review-warning-filesystem-watcher": ["production_change", "packages/core-api/filesystems/src/file-watcher.ts", "setup and runtime watcher error red proof"],
  "review-warning-stale-census": ["evidence_generator", "scripts/surface-census.ts", "fresh-vs-committed equality guard"],
  "review-warning-ownership-comments": ["documentation", "packages/", "deleted-owner static scan"],
  "service-bootstrap-disposer-contract": ["test_correction", "packages/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts", "named nine owners plus runtime custody proof"],
  "harness-installed-binaries": ["no_change", "packages/agent-execution/harness-registry/", "retain real binary/Haiku passing proof"],
  "harness-openrouter-prerequisite": ["prerequisite_or_setup", "packages/agent-execution/harness-registry/src/__tests__/", "OPENROUTER_API_KEY named preflight"],
  "desktop-unit": ["no_change", "packages/desktop/__tests__/", "retain 123 passing tests"],
  "desktop-build": ["no_change", "packages/desktop/scripts/bundle.ts", "retain bundle proof"],
  "desktop-dev-smoke": ["test_addition", "packages/desktop/e2e/", "real Electron dev local red proof"],
  "desktop-packaged-shared-smoke": ["test_addition", "packages/desktop/e2e/", "packaged local and isolated shared-mode red proof"],
};

const criticalIds = new Set(["review-critical-demand-package","review-critical-runtime-disposal","review-critical-mcp-isolation","review-critical-retro-snapshot","review-critical-aggregate"]);
const warningIds = new Set(["review-warning-notification-catch","review-warning-filesystem-watcher","review-warning-stale-census","review-warning-ownership-comments"]);
const systemEntries = system.cases.map((c) => {
  const [kind, owner, red] = systemPlan[c.id];
  const target = normalizeDisposition(c.disposition ?? (c.status === "pass" ? "none" : c.caseKind === "proofGap" ? "proof_gap" : c.id === "review-critical-mcp-isolation" ? "static_contract_violation" : "architecture_obligation"));
  const regressionProjection = target === "feature_regression" ? regressionProjectionById.get(c.id) : null;
  if (target === "feature_regression" && !regressionProjection) throw new Error(`missing exact regression projection: ${c.id}`);
  return {
    id: c.id,
    sourceKind: "system",
    caseKind: c.caseKind,
    execution: c.status,
    targetDisposition: target,
    dispositionReview: "pending_independent_architecture_amendment_review",
    rootProblem: c.finding,
    reviewFinding: criticalIds.has(c.id) ? "critical" : warningIds.has(c.id) ? "warning" : null,
    changeKind: kind,
    changeOwner: target === "feature_regression" ? regressionProjection.exactSymbols[0].file : owner,
    layer: c.id.includes("desktop") ? "desktop" : c.id.includes("harness") || c.id.includes("mcp") ? "agent-execution" : "meta-or-evidence",
    candidateFiles: target === "feature_regression" ? [...new Set(regressionProjection.exactSymbols.map((item) => item.file))] : [owner],
    firstDivergentBoundary: c.evidence,
    requiredRedProof: target === "feature_regression" ? regressionProjection.redProof : red,
    testAction: kind === "test_correction" ? "correct only with named ownership replacement proof" : kind === "no_change" ? "retain" : "add_or_retain_focused_proof",
    productionAction: kind === "production_change" ? "minimum fix after accepted red review" : "none unless focused proof requires it",
    dependencyOrder: ["architecture-amendment-review", "write-tests", "red-proof-review", "write-code-if-required", "implementation-review", "isolated-green-commit"],
    evidence: [c.evidence],
    authority: null,
    replacementLineage: null,
    externalPrerequisite: c.id === "harness-openrouter-prerequisite" ? "OPENROUTER_API_KEY" : null,
    exactSymbols: target === "feature_regression" ? regressionProjection.exactSymbols : [],
    causalSymbol: null,
    historicalHarnessBaseline: "trusted_regular_pre-AU20",
    harnessChangeAllowed: "no unless direct AU20-local evidence is separately accepted",
  };
});

const entries = [...browserEntries, ...systemEntries];
const countBy = (key) => Object.fromEntries([...new Set(entries.map((e) => e[key]))].sort().map((v) => [v, entries.filter((e) => e[key] === v).length]));
const summary = {
  total: entries.length,
  browser: browserEntries.length,
  system: systemEntries.length,
  execution: countBy("execution"),
  targetDispositions: countBy("targetDisposition"),
  changeKinds: countBy("changeKind"),
  reviewFindings: { critical: entries.filter((e) => e.reviewFinding === "critical").length, warning: entries.filter((e) => e.reviewFinding === "warning").length },
  unresolvedRemaining: entries.filter((e) => e.targetDisposition === "unresolved").length,
  harnessDefects: entries.filter((e) => e.targetDisposition === "harness_defect").length,
  reviewGate: "pending_independent_architecture_amendment_review",
};
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const browserBytes = fs.readFileSync(path.join(root, "plans/AU20/browser-validation-ledger.json"));
const systemBytes = fs.readFileSync(path.join(root, "plans/AU20/system-validation-ledger.json"));
const generatorBytes = fs.readFileSync(new URL(import.meta.url));
const payload = {
  schemaVersion: 1,
  workPackage: "AU20",
  head: browser.headReviewed,
  policy: {
    baseline: "Harness worked regularly before AU20 and is trusted.",
    noInference: "Failure, timeout, skip, or unrun alone never authorizes harness repair.",
    harnessRepairGate: "Direct AU20-local runner/config intervention evidence plus independent reviewer acceptance.",
    implementationGate: "Every changed disposition and red proof is independently reviewed before test/code edits.",
  },
  summary,
  entries,
};
const acceptedReview = {
  path: "plans/AU20/register-reviews/corrective-change-map.md",
  sha256: "d08d48e4dd9526f8ca82b760a7b473b95c7590191c71224e71f3733d2e7681ee",
  verdict: "accept",
  payloadSha256: "76a632f2d8513b359f063dc072f1a057d356889fdea4649667e865bc76dad041",
};
const payloadSha256 = sha256(JSON.stringify(payload));
const reviewPath = path.join(root, acceptedReview.path);
const reviewBindingValid =
  payloadSha256 === acceptedReview.payloadSha256 &&
  fs.existsSync(reviewPath) &&
  sha256(fs.readFileSync(reviewPath)) === acceptedReview.sha256;
const proofInventoryArchitectureAmendmentReview = {
  path: "plans/AU20/register-reviews/proof-inventory-architecture-amendment.md",
  sha256: "18efb793121eb20f53063c0ffe0db628d16b559d07af160b651e0525be23c8c2",
  verdict: "accept",
  architectureSha256: "9cd55b5634cac06ac01ac9638f452128191b5583250cf9861e0aa8fe6af61f7f",
  feasibilitySha256: "972be13a717cc2b6c3250cce208cffe228ada65694febe96bbf6d56feea18ff5",
};
const proofInventoryArchitectureAmendmentR3Review = {
  path: "plans/AU20/register-reviews/proof-inventory-architecture-amendment-r3.md",
  sha256: "51336cc090c2951a84bcea613da2e64d0f920acd054e29768fae54703e7c134c",
  verdict: "accept",
  architectureSha256: "4f600566b27f210b4399322b37b399cd51f9f66c4c37cce7c30377667d990793",
  feasibilitySha256: "c6ce225bfaa0b5712975313a1c2206ccd6f5d967e1882ce8d4c0f27a39527f1a",
};
const architecturePath = path.join(root, ".pipeline/work/AU20/architecture.md");
const feasibilityPath = path.join(root, ".pipeline/work/AU20/feasibility.md");
const amendmentReviewPath = path.join(root, proofInventoryArchitectureAmendmentR3Review.path);
const amendmentReviewValid =
  fs.existsSync(amendmentReviewPath) &&
  sha256(fs.readFileSync(amendmentReviewPath)) === proofInventoryArchitectureAmendmentR3Review.sha256 &&
  sha256(fs.readFileSync(architecturePath)) === proofInventoryArchitectureAmendmentR3Review.architectureSha256 &&
  sha256(fs.readFileSync(feasibilityPath)) === proofInventoryArchitectureAmendmentR3Review.feasibilitySha256;
const proofInventoryHistoricalReviewValid =
  fs.existsSync(amendmentReviewPath) &&
  sha256(fs.readFileSync(amendmentReviewPath)) === proofInventoryArchitectureAmendmentR3Review.sha256;
const proofInventoryRedProofReview = {
  path: "plans/AU20/red-proof-reviews/proof-inventory.md",
  sha256: "d8b46ca8e8b75c04d41ce3ec102f4fd3545287d0f30f33d2a415f3837c948085",
  verdict: "accept",
  validationContractTestSha256: "9edf040f70b7a93e960f282b1687b943abf652027e315c12888efb992f1cfebd",
  reviewTrustTestSha256: "f5c0f94caecf6e3c17e2130f97573b4a865c7cec49c3c4b5ce16fa1e9989914d",
  counts: { total: 133, green: 105, intentionallyRed: 28 },
};
const proofInventoryR3RedProofReview = {
  path: "plans/AU20/red-proof-reviews/proof-inventory.md",
  sha256: "4cc07ce088f39dd0d1fe5593b2384b99a6f4ab54499bbd06496c461c6093cf5a",
  verdict: "accept",
  validationContractTestSha256: "9edf040f70b7a93e960f282b1687b943abf652027e315c12888efb992f1cfebd",
  reviewTrustTestSha256: "fc3c8bc7bd1690d27851024f4e05aed5e819cda58e72ef3d9d5cf65da9569ec7",
  durableRedProofPath: ".pipeline/work/AU20/red-proofs/proof-inventory.json",
  durableRedProofSha256: "8b3eeaae8479832d95894f12d71f9201c69a4989c77e14f13c3fedf5a129477f",
  counts: { total: 153, green: 119, intentionallyRed: 34 },
};
const proofInventoryR3CallerMigrationRedProofReview = {
  path: "plans/AU20/red-proof-reviews/proof-inventory.md",
  sha256: "567456fc8415090a412132019d86e0579857f1c179a470ead0d8f436f82b9a39",
  verdict: "accept",
  validationContractTestSha256: "ffef339bf58f987e39f14b31c2ae67f5f6bd465aa79bbe7cb35a6c6e1d898d2e",
  reviewTrustTestSha256: "1aea108da78586d301e35760fb8505f5795b5b2fef7232ca689660880749c758",
  durableRedProofPath: ".pipeline/work/AU20/red-proofs/proof-inventory.json",
  durableRedProofSha256: "2f338ac0afeeff20ed59b08a7f42afcba40c0ca81dffb9f6f06ac7a3526b1bf0",
  counts: { total: 153, green: 111, intentionallyRed: 42 },
};
const redProofReviewValid =
  proofInventoryHistoricalReviewValid &&
  sha256(fs.readFileSync(path.join(root, proofInventoryR3CallerMigrationRedProofReview.path))) === proofInventoryR3CallerMigrationRedProofReview.sha256 &&
  sha256(fs.readFileSync(path.join(root, "packages/web/src/e2e-support/validation-contract.test.ts"))) === proofInventoryR3CallerMigrationRedProofReview.validationContractTestSha256 &&
  sha256(fs.readFileSync(path.join(root, "packages/web/src/e2e-support/review-trust.test.ts"))) === proofInventoryR3CallerMigrationRedProofReview.reviewTrustTestSha256 &&
  sha256(fs.readFileSync(path.join(root, proofInventoryR3CallerMigrationRedProofReview.durableRedProofPath))) === proofInventoryR3CallerMigrationRedProofReview.durableRedProofSha256;
const r3CallerMigrationRequired = !redProofReviewValid;
const proofInventoryArchitectureAmendment = {
  required: true,
  revision: 3,
  scope: "single captured verifier, hash-pinned review manifest with mandatory builder identity, descriptor-stable reads, legacy authority deletion, strict attempt sequencing",
  priorAcceptedReview: proofInventoryArchitectureAmendmentReview,
  priorAcceptedRedProofReview: proofInventoryRedProofReview,
  acceptedReview: proofInventoryHistoricalReviewValid ? {
    ...proofInventoryArchitectureAmendmentR3Review,
    historicalStatus: "completed-before-final-ship-correction-architecture",
  } : null,
  supersededR3RedProofReview: {
    ...proofInventoryR3RedProofReview,
    supersededReason: "Frozen validation-contract test still imports/calls legacy authority APIs forbidden by accepted R3 architecture.",
  },
  redProofReview: redProofReviewValid ? proofInventoryR3CallerMigrationRedProofReview : null,
  authorizedStage: redProofReviewValid ? "completed-history" : null,
};
const finalArchitectureBinding = progress.gateBindings?.finalShipCorrectionArchitecture ?? null;
const findingLedgerRedBinding = progress.gateBindings?.reviewFindingLedgerRedProof ?? null;
const f13ProvenanceBinding = progress.gateBindings?.f13ReviewProvenanceAmendment ?? null;
const extractHistoricalArchitectureReviewHash = (text) => {
  const matches = [...text.matchAll(/^\| `\.pipeline\/work\/AU20\/review\.md` \| `([a-f0-9]{64})` \|$/gm)];
  return matches.length === 1 ? matches[0][1] : null;
};
const extractHistoricalRedProofHash = (text) => {
  const matches = [...text.matchAll(/^- Current review SHA-256:\n  `([a-f0-9]{64})`$/gm)];
  return matches.length === 1 ? matches[0][1] : null;
};
const expectedFindingOutput = {
  findings: 13,
  counts: { CRITICAL: 6, WARNING: 6, OBSERVATION: 1 },
  ids: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13"],
};
const historicalReview = f13ProvenanceBinding?.historicalReview;
const currentReview = f13ProvenanceBinding?.currentReview;
const findingValidation = currentReview
  ? spawnSync(process.execPath, [path.join(root, ".pipeline/work/AU20/probes/validate-review-findings.mjs")], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    })
  : null;
let parsedFindingOutput = null;
try {
  parsedFindingOutput = findingValidation?.status === 0 ? JSON.parse(findingValidation.stdout.trim()) : null;
} catch {
  parsedFindingOutput = null;
}
const f13ProvenanceValid =
  f13ProvenanceBinding !== null &&
  f13ProvenanceBinding.verdict === "accept" &&
  f13ProvenanceBinding.score >= 7 &&
  f13ProvenanceBinding.preAmendmentProgressSha256 === "1be04b7a6f79891f7ec0f3c73f10f8a3328efe3ebd80a9ec25d4f39c585e2ecd" &&
  sha256(fs.readFileSync(path.join(root, f13ProvenanceBinding.path))) === f13ProvenanceBinding.sha256 &&
  sha256(fs.readFileSync(path.join(root, f13ProvenanceBinding.feasibilityPath))) === f13ProvenanceBinding.feasibilitySha256 &&
  sha256(fs.readFileSync(path.join(root, f13ProvenanceBinding.critiquePath))) === f13ProvenanceBinding.critiqueSha256 &&
  historicalReview?.architectureReviewPath === "plans/AU20/register-reviews/final-ship-correction-architecture.md" &&
  historicalReview?.architectureReviewSha256 === "5194f0382f53cfe12cd40014413750bd18907819527520f37d261cc23cc87ae9" &&
  historicalReview?.redProofReviewPath === "plans/AU20/red-proof-reviews/review-finding-ledger.md" &&
  historicalReview?.redProofReviewSha256 === "cc04e8563635b2e9ff3726b751293e586ba0a29ef490f4f776c4aacffcf10f0e" &&
  historicalReview?.historicalLiveReviewSha256 === "cef525507cfe766356b2084b7d0ba4ba98699835f560dd1b0b2e5b6fa01c683a" &&
  sha256(fs.readFileSync(path.join(root, historicalReview.architectureReviewPath))) === historicalReview.architectureReviewSha256 &&
  sha256(fs.readFileSync(path.join(root, historicalReview.redProofReviewPath))) === historicalReview.redProofReviewSha256 &&
  extractHistoricalArchitectureReviewHash(fs.readFileSync(path.join(root, historicalReview.architectureReviewPath), "utf8")) === historicalReview.historicalLiveReviewSha256 &&
  extractHistoricalRedProofHash(fs.readFileSync(path.join(root, historicalReview.redProofReviewPath), "utf8")) === historicalReview.historicalLiveReviewSha256 &&
  currentReview?.path === ".pipeline/work/AU20/review.md" &&
  currentReview?.validatorPath === ".pipeline/work/AU20/probes/validate-review-findings.mjs" &&
  JSON.stringify(currentReview?.counts) === JSON.stringify({ critical: 6, warning: 6, observation: 1 }) &&
  JSON.stringify(currentReview?.ids) === JSON.stringify(expectedFindingOutput.ids) &&
  sha256(fs.readFileSync(path.join(root, currentReview.path))) === currentReview.sha256 &&
  sha256(fs.readFileSync(path.join(root, currentReview.validatorPath))) === currentReview.validatorSha256 &&
  JSON.stringify(parsedFindingOutput) === JSON.stringify(expectedFindingOutput) &&
  sha256(JSON.stringify(acceptedReview)) === "8fdbe10c6810358a93d3629164db083eab446750f01ecaff664b3ae087c564c8" &&
  sha256(JSON.stringify(proofInventoryArchitectureAmendment)) === "b2422c38e17340c80399f36c6587b1702b0b3165604e65b1be6ee9cfdfc2730a" &&
  sha256(JSON.stringify(finalArchitectureBinding)) === "353e6eafd6ae992a1e9939929f28798b07d3f0583178fc388411c119b7f81ff5" &&
  sha256(JSON.stringify(findingLedgerRedBinding)) === "7c3a751c023b055b367d5c487a5174a6cb4ab8ec2579e65b8c13e3768e6dac1e";
const findingLedgerCommit = progress.gateBindings?.reviewFindingLedgerCommit ?? null;
const demandWriteTestsAuthorization = progress.gateBindings?.demandPackageGeneratorWriteTestsAuthorization ?? null;
const commitInspection = findingLedgerCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", findingLedgerCommit.commit], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    })
  : null;
const expectedCommitInspection = findingLedgerCommit
  ? [
      findingLedgerCommit.commit,
      findingLedgerCommit.tree,
      findingLedgerCommit.parent,
      findingLedgerCommit.subject,
    ].join("\n")
  : null;
const findingLedgerCommitValid =
  f13ProvenanceValid &&
  findingLedgerCommit?.commit === "41c013613dc0c1fd81bc43b0ef7a52c8bc08b322" &&
  findingLedgerCommit?.tree === "4d73df713d104ddab2104b26479f21ee4ca93e2c" &&
  findingLedgerCommit?.parent === "cf8bee1a65e0def24995dc3b5aa3d496cef0f32b" &&
  findingLedgerCommit?.subject === "AU20: reconcile final review finding ledger" &&
  findingLedgerCommit?.historicalReviewSha256 === historicalReview.historicalLiveReviewSha256 &&
  findingLedgerCommit?.currentReviewSha256 === currentReview.sha256 &&
  findingLedgerCommit?.preTransitionProgressSha256 === "32b63054a9edf3f28dcc55e70c3d4fc4c7e0c66eba93e31c210b83ac7ced91db" &&
  findingLedgerCommit?.preTransitionChangeMapSha256 === "93af687d5bc817490378a84264b24f418d185d2ba8a5b32401124993b11f45fe" &&
  JSON.stringify(findingLedgerCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(findingLedgerCommit?.verification ?? {}).every((result) => result === "pass") &&
  findingLedgerCommit?.status === "completed-history" &&
  commitInspection?.status === 0 &&
  commitInspection.stdout.trim() === expectedCommitInspection;
const expectedDemandWriteTestsAuthorization = {
  increment: "evidence-demand-package",
  stage: "write-tests-demand-package-generator",
  finding: "F1",
  authorizedPaths: [
    ".pipeline/work/AU20/probes/validate-service-demand-package.mjs",
    ".pipeline/work/AU20/red-proofs/evidence-demand-package.json",
  ],
  productionCodeAuthorized: false,
  implementationCodeAuthorized: false,
  productTestsAuthorized: false,
  scriptsGeneratorAuthorized: false,
  redProofReviewRequiredBeforeWriteCode: true,
  nextIncrement: "core-api-bootstrap-ownership",
  status: "completed-history",
};
const demandWriteTestsCompleted =
  findingLedgerCommitValid &&
  JSON.stringify(demandWriteTestsAuthorization) === JSON.stringify(expectedDemandWriteTestsAuthorization);
const demandRedProof = progress.gateBindings?.demandPackageGeneratorRedProof ?? null;
const demandRedProofValid =
  demandWriteTestsCompleted &&
  demandRedProof?.path === ".pipeline/work/AU20/red-proofs/evidence-demand-package.json" &&
  demandRedProof?.sha256 === "d72f859f9e2a14da16d65e665e8825e9f23975f0dd4d9d83344622ca5bdf95df" &&
  demandRedProof?.guardPath === ".pipeline/work/AU20/probes/validate-service-demand-package.mjs" &&
  demandRedProof?.guardSha256 === "00dbc536a0c60adddccafca364631b87e5c7d46ec34d3b4daf67bcb3c531c06c" &&
  demandRedProof?.reviewPath === "plans/AU20/red-proof-reviews/evidence-demand-package.md" &&
  demandRedProof?.reviewSha256 === "ec35cfb41f797dab148fc73627e09107dd95cfa2fa3bb2a65dffef094d92e9ee" &&
  demandRedProof?.verdict === "accept" &&
  demandRedProof?.round === 2 &&
  demandRedProof?.authoritativeSourceSha256 === "42b9f3edbfb2d6f3a2813ec7ca71d4cbd29d8c716cfdf973ad0d32c4163a6df4" &&
  demandRedProof?.intendedRed?.staleServiceCount === "service count is stale: generated=31 live=23" &&
  demandRedProof?.intendedRed?.generatorOutputAbsent === true &&
  demandRedProof?.status === "accepted-history";
const demandWriteCodeAuthorization = progress.gateBindings?.demandPackageGeneratorWriteCodeAuthorization ?? null;
const expectedDemandWriteCodeAuthorization = {
  increment: "evidence-demand-package",
  stage: "write-code-demand-package-generator",
  finding: "F1",
  authorizedPaths: [
    "scripts/generate-dependency-graph.ts",
    ".pipeline/work/AU20/analysis/service-data-packages.json",
  ],
  frozenPaths: [
    ".pipeline/work/AU20/probes/validate-service-demand-package.mjs",
    ".pipeline/work/AU20/red-proofs/evidence-demand-package.json",
    "plans/AU20/red-proof-reviews/evidence-demand-package.md",
    "scripts/surface-census.ts",
    "scripts/table-ownership-guard.ts",
  ],
  serviceCodeAuthorized: false,
  productCodeAuthorized: false,
  productTestsAuthorized: false,
  implementationReviewRequiredBeforeCommit: true,
  nextIncrement: "core-api-bootstrap-ownership",
  status: "rejected",
};
const demandWriteCodeAuthorized =
  demandRedProofValid &&
  progress.currentStep === "write-code-demand-package-generator" &&
  JSON.stringify(demandWriteCodeAuthorization) === JSON.stringify(expectedDemandWriteCodeAuthorization);
const rejectedDemandCandidate = progress.gateBindings?.demandPackageGeneratorRejectedCandidate ?? null;
const expandedRedReviewPath = path.join(root, "plans/AU20/red-proof-reviews/evidence-demand-package.md");
const expandedRedReviewText = fs.readFileSync(expandedRedReviewPath, "utf8");
const rejectedDemandCandidateValid =
  demandRedProofValid &&
  rejectedDemandCandidate?.generatorPath === "scripts/generate-dependency-graph.ts" &&
  rejectedDemandCandidate?.generatorSha256 === "aa97fb3ea89f97aa3a9ecb0bf778c291eeee544f32dda4618ee2c809b46b6385" &&
  rejectedDemandCandidate?.artifactPath === ".pipeline/work/AU20/analysis/service-data-packages.json" &&
  rejectedDemandCandidate?.artifactSha256 === "6143da860cbbf91bd130905366bab26cec19cc4f5b00e64b60b2a0b50b3b2450" &&
  rejectedDemandCandidate?.reviewPath === "plans/AU20/register-reviews/evidence-demand-package-implementation.md" &&
  rejectedDemandCandidate?.reviewSha256 === "c8c79ededeb650395020b65c4c066be24c6ef10a880141538c498db672592360" &&
  rejectedDemandCandidate?.verdict === "revise" &&
  rejectedDemandCandidate?.reason === "DispatchPorts nested provider groups were parsed as methods and broadcast to all thirteen providers; real nested provider methods were omitted." &&
  JSON.stringify(rejectedDemandCandidate?.requiredRedProof) === JSON.stringify([
    "agentSelection.resolveScaffoldSpecs",
    "conversation.insertMessage",
    "cost.getFactoryCostActual",
    "no provider request named runOrchestration or toolHandlers merely because those are group keys",
    "no multi-provider request broadcast",
  ]) &&
  rejectedDemandCandidate?.status === "rejected-history" &&
  sha256(fs.readFileSync(expandedRedReviewPath)) === "78fef8028435cfa6f715a253bab8028a93cf45c265f7235ca58a1de3c4e87011" &&
  expandedRedReviewText.includes(`| Frozen rejected generator | \`${rejectedDemandCandidate.generatorSha256}\` |`) &&
  expandedRedReviewText.includes(`| Frozen rejected package | \`${rejectedDemandCandidate.artifactSha256}\` |`);
const nestedPortsWriteTestsAuthorization = progress.gateBindings?.demandPackageNestedPortsWriteTestsAuthorization ?? null;
const expectedNestedPortsWriteTestsAuthorization = {
  increment: "evidence-demand-package",
  stage: "write-tests-demand-package-nested-ports",
  finding: "F1",
  authorizedPaths: [
    ".pipeline/work/AU20/probes/validate-service-demand-package.mjs",
    ".pipeline/work/AU20/red-proofs/evidence-demand-package.json",
  ],
  candidatePathsFrozen: [
    "scripts/generate-dependency-graph.ts",
    ".pipeline/work/AU20/analysis/service-data-packages.json",
  ],
  priorRedProofPreserved: {
    guardSha256: "00dbc536a0c60adddccafca364631b87e5c7d46ec34d3b4daf67bcb3c531c06c",
    proofSha256: "d72f859f9e2a14da16d65e665e8825e9f23975f0dd4d9d83344622ca5bdf95df",
    reviewSha256: "ec35cfb41f797dab148fc73627e09107dd95cfa2fa3bb2a65dffef094d92e9ee",
  },
  generatorCodeAuthorized: false,
  serviceCodeAuthorized: false,
  productCodeAuthorized: false,
  productTestsAuthorized: false,
  redProofReviewRequiredBeforeWriteCode: true,
  nextIncrement: "core-api-bootstrap-ownership",
  status: "completed-history",
};
const nestedPortsWriteTestsCompleted =
  rejectedDemandCandidateValid &&
  JSON.stringify(nestedPortsWriteTestsAuthorization) === JSON.stringify(expectedNestedPortsWriteTestsAuthorization);
const nestedPortsRedProof = progress.gateBindings?.demandPackageNestedPortsRedProof ?? null;
const nestedPortsRedProofValid =
  nestedPortsWriteTestsCompleted &&
  nestedPortsRedProof?.path === ".pipeline/work/AU20/red-proofs/evidence-demand-package.json" &&
  nestedPortsRedProof?.sha256 === "fe50ae191154ce1bed20facff969ad7e061c3974a33bfbf071fc0dafd8aefe63" &&
  nestedPortsRedProof?.guardPath === ".pipeline/work/AU20/probes/validate-service-demand-package.mjs" &&
  nestedPortsRedProof?.guardSha256 === "8cfaf4d8b4c1cf6c55b6941a7d2f6b16985603a68dd08c5ae63e5d8654db1758" &&
  nestedPortsRedProof?.reviewPath === "plans/AU20/red-proof-reviews/evidence-demand-package.md" &&
  nestedPortsRedProof?.reviewSha256 === "78fef8028435cfa6f715a253bab8028a93cf45c265f7235ca58a1de3c4e87011" &&
  nestedPortsRedProof?.verdict === "accept" &&
  nestedPortsRedProof?.round === 2 &&
  nestedPortsRedProof?.authoritativeSourceSha256 === "b43f2a510f6bd4addea21716e95800e9eafd8ba4c06280aaace917c2a611cdbc" &&
  nestedPortsRedProof?.rejectedCandidateExpectedError === "agent-selection.diReceivers diverges from authoritative source" &&
  nestedPortsRedProof?.priorAcceptedRedProof?.guardSha256 === "00dbc536a0c60adddccafca364631b87e5c7d46ec34d3b4daf67bcb3c531c06c" &&
  nestedPortsRedProof?.priorAcceptedRedProof?.proofSha256 === "d72f859f9e2a14da16d65e665e8825e9f23975f0dd4d9d83344622ca5bdf95df" &&
  nestedPortsRedProof?.priorAcceptedRedProof?.reviewSha256 === "ec35cfb41f797dab148fc73627e09107dd95cfa2fa3bb2a65dffef094d92e9ee" &&
  nestedPortsRedProof?.priorAcceptedRedProof?.reviewArtifactSupersededByExpandedReview === true &&
  nestedPortsRedProof?.status === "accepted-history" &&
  sha256(fs.readFileSync(path.join(root, nestedPortsRedProof.path))) === nestedPortsRedProof.sha256 &&
  sha256(fs.readFileSync(path.join(root, nestedPortsRedProof.guardPath))) === nestedPortsRedProof.guardSha256 &&
  sha256(fs.readFileSync(path.join(root, nestedPortsRedProof.reviewPath))) === nestedPortsRedProof.reviewSha256;
const revisedWriteCodeAuthorization = progress.gateBindings?.demandPackageGeneratorRevisedWriteCodeAuthorization ?? null;
const expectedRevisedWriteCodeAuthorization = {
  increment: "evidence-demand-package",
  stage: "write-code-demand-package-generator",
  finding: "F1",
  authorizedPaths: [
    "scripts/generate-dependency-graph.ts",
    ".pipeline/work/AU20/analysis/service-data-packages.json",
  ],
  frozenPaths: [
    ".pipeline/work/AU20/probes/validate-service-demand-package.mjs",
    ".pipeline/work/AU20/red-proofs/evidence-demand-package.json",
    "plans/AU20/red-proof-reviews/evidence-demand-package.md",
    "plans/AU20/register-reviews/evidence-demand-package-implementation.md",
    "scripts/surface-census.ts",
    "scripts/table-ownership-guard.ts",
  ],
  requiredCorrection: "Parse DispatchPorts nested composition groups by exact provider identity and emit each provider's own nested methods without group-name requests or cross-provider broadcast.",
  serviceCodeAuthorized: false,
  productCodeAuthorized: false,
  productTestsAuthorized: false,
  implementationReviewRequiredBeforeCommit: true,
  nextIncrement: "core-api-bootstrap-ownership",
};
const revisedWriteCodeAuthorized =
  nestedPortsRedProofValid &&
  progress.currentStep === "write-code-demand-package-generator" &&
  JSON.stringify(revisedWriteCodeAuthorization) === JSON.stringify(expectedRevisedWriteCodeAuthorization);
const correctedDemandCandidate = progress.gateBindings?.demandPackageGeneratorCorrectedCandidate ?? null;
const correctedDemandPaths = {
  generatorPath: "scripts/generate-dependency-graph.ts",
  artifactPath: ".pipeline/work/AU20/analysis/service-data-packages.json",
  implementationReviewPath: "plans/AU20/register-reviews/evidence-demand-package-implementation.md",
};
const correctedDemandReviewPath = path.join(root, correctedDemandPaths.implementationReviewPath);
const correctedDemandReviewText = fs.readFileSync(correctedDemandReviewPath, "utf8");
const provenanceReview = progress.gateBindings?.demandPackageGeneratorProvenanceReview ?? null;
const provenanceReviewValid =
  provenanceReview?.path === "plans/AU20/register-reviews/evidence-demand-package-provenance.md" &&
  provenanceReview?.sha256 === "5262fc92a8bb086847bf34da50f59b8462dc403b581772ee0891a6db08abfcc6" &&
  provenanceReview?.verdict === "revise" &&
  JSON.stringify(provenanceReview?.requiredExactPaths) === JSON.stringify(correctedDemandPaths) &&
  provenanceReview?.status === "superseded-by-final-acceptance" &&
  sha256(fs.readFileSync(path.join(root, provenanceReview.path))) === provenanceReview.sha256;
const correctedDemandCandidateValid =
  nestedPortsRedProofValid &&
  provenanceReviewValid &&
  correctedDemandCandidate?.generatorPath === correctedDemandPaths.generatorPath &&
  correctedDemandCandidate?.generatorSha256 === "3d27a26f17a2a29bcd2fbb780cb8a500e4c463dca808068ba16efaeaf2acd5b5" &&
  correctedDemandCandidate?.artifactPath === correctedDemandPaths.artifactPath &&
  correctedDemandCandidate?.artifactSha256 === "f2575f32b02a66dd4d6f708c1123385433ac46e1ff91289ad70acde38e824aa5" &&
  correctedDemandCandidate?.sourceSha256 === "b43f2a510f6bd4addea21716e95800e9eafd8ba4c06280aaace917c2a611cdbc" &&
  correctedDemandCandidate?.implementationReviewPath === correctedDemandPaths.implementationReviewPath &&
  correctedDemandCandidate?.implementationReviewSha256 === "87b9fbb1ab33be53b2031582e0896b14ce341b281fd09e9b6291cbde8b6cf99c" &&
  correctedDemandCandidate?.implementationReviewVerdict === "revise" &&
  correctedDemandCandidate?.productToolingVerdict === "pass" &&
  correctedDemandCandidate?.provenanceVerdict === "revise" &&
  correctedDemandCandidate?.status === "implementation-correct-provenance-review-pending" &&
  correctedDemandCandidate?.rejectedHistoryAuthority?.expandedRedReviewSha256 === nestedPortsRedProof.reviewSha256 &&
  correctedDemandCandidate?.rejectedHistoryAuthority?.rejectedGeneratorSha256 === rejectedDemandCandidate.generatorSha256 &&
  correctedDemandCandidate?.rejectedHistoryAuthority?.rejectedArtifactSha256 === rejectedDemandCandidate.artifactSha256 &&
  correctedDemandCandidate?.rejectedHistoryAuthority?.historicalRejectedReviewSha256 === rejectedDemandCandidate.reviewSha256 &&
  sha256(fs.readFileSync(path.join(root, correctedDemandCandidate.generatorPath))) === correctedDemandCandidate.generatorSha256 &&
  sha256(fs.readFileSync(path.join(root, correctedDemandCandidate.artifactPath))) === correctedDemandCandidate.artifactSha256 &&
  sha256(fs.readFileSync(correctedDemandReviewPath)) === correctedDemandCandidate.implementationReviewSha256 &&
  correctedDemandReviewText.includes(`| Revised generator | \`${correctedDemandCandidate.generatorSha256}\` |`) &&
  correctedDemandReviewText.includes(`| Revised demand package | \`${correctedDemandCandidate.artifactSha256}\` |`);
const finalDemandReview = progress.gateBindings?.demandPackageGeneratorFinalReview ?? null;
const finalDemandReviewValid =
  correctedDemandCandidateValid &&
  finalDemandReview?.path === "plans/AU20/register-reviews/evidence-demand-package-provenance-final.md" &&
  finalDemandReview?.sha256 === "81fc73a5e71cf037cde4d5ef1596202a8b328c9e5101b2ceff90dc7f33ad68b4" &&
  finalDemandReview?.verdict === "accept" &&
  finalDemandReview?.generatorSha256 === correctedDemandCandidate.generatorSha256 &&
  finalDemandReview?.artifactSha256 === correctedDemandCandidate.artifactSha256 &&
  finalDemandReview?.implementationReviewSha256 === correctedDemandCandidate.implementationReviewSha256 &&
  finalDemandReview?.sourceSha256 === correctedDemandCandidate.sourceSha256 &&
  JSON.stringify(finalDemandReview?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  finalDemandReview?.status === "accepted" &&
  sha256(fs.readFileSync(path.join(root, finalDemandReview.path))) === finalDemandReview.sha256;
const finalizeDemandAuthorization = progress.gateBindings?.demandPackageGeneratorFinalizeAuthorization ?? null;
const expectedFinalizeDemandAuthorization = {
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
const finalizeDemandCompleted =
  finalDemandReviewValid &&
  JSON.stringify(finalizeDemandAuthorization) === JSON.stringify(expectedFinalizeDemandAuthorization);
const demandCommit = progress.gateBindings?.demandPackageGeneratorCommit ?? null;
const demandCommitInspection = demandCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", demandCommit.commit], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    })
  : null;
const demandCommitValid =
  finalizeDemandCompleted &&
  demandCommit?.commit === "a6641fa18c781bad1ee77ac07ae2b6ebb7b74f07" &&
  demandCommit?.tree === "9ac1a946870c123fa66f5f8568b5199b75790d5a" &&
  demandCommit?.parent === "41c013613dc0c1fd81bc43b0ef7a52c8bc08b322" &&
  demandCommit?.subject === "AU20: make service demand package reproducible" &&
  demandCommit?.pathCount === 12 &&
  demandCommit?.preTransitionProgressSha256 === "85a1f35b60fbd6639583ae775b0e13e6fbeef223f6991845cbc18be7787d3cac" &&
  demandCommit?.preTransitionChangeMapSha256 === "be41c4232765d84bdb576e60f80e6274e78b1b00320228eb92a64f92b55a4b97" &&
  demandCommit?.generatorSha256 === correctedDemandCandidate.generatorSha256 &&
  demandCommit?.artifactSha256 === correctedDemandCandidate.artifactSha256 &&
  demandCommit?.sourceSha256 === correctedDemandCandidate.sourceSha256 &&
  JSON.stringify(demandCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(demandCommit?.verification ?? {}).every((result) => result === "pass") &&
  demandCommit?.status === "completed-history" &&
  demandCommitInspection?.status === 0 &&
  demandCommitInspection.stdout.trim() === [
    demandCommit.commit,
    demandCommit.tree,
    demandCommit.parent,
    demandCommit.subject,
  ].join("\n");
const bootstrapWriteTestsAuthorization = progress.gateBindings?.coreApiBootstrapOwnershipWriteTestsAuthorization ?? null;
const expectedBootstrapWriteTestsAuthorization = {
  increment: "core-api-bootstrap-ownership",
  stage: "write-tests-core-api-bootstrap-ownership",
  finding: "F5",
  authorizedPaths: [
    "packages/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts",
    ".pipeline/work/AU20/red-proofs/core-api-bootstrap-ownership.json",
  ],
  requiredProof: {
    exactOwnerCount: 9,
    namedOwners: [
      "lifecycle-projection drain",
      "relevance listener",
      "review subscriptions",
      "policy registration",
      "git-export handler",
      "notifications installation",
      "retention reaper",
      "dispatch lifecycle",
      "cost sentinel",
    ],
    assertCleanupEffects: true,
    forbidLengthOnlyAssertion: true,
  },
  productionCodeAuthorized: false,
  otherTestsAuthorized: false,
  serviceSurfaceGrowthAuthorized: false,
  redProofReviewRequiredBeforeWriteCode: true,
  nextIncrement: "run-orchestration-async-disposal",
  status: "completed-history",
};
const bootstrapWriteTestsCompleted =
  demandCommitValid &&
  JSON.stringify(bootstrapWriteTestsAuthorization) === JSON.stringify(expectedBootstrapWriteTestsAuthorization);
const bootstrapRedProof = progress.gateBindings?.coreApiBootstrapOwnershipRedProof ?? null;
const bootstrapRedProofValid =
  bootstrapWriteTestsCompleted &&
  bootstrapRedProof?.testPath === "packages/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts" &&
  bootstrapRedProof?.testSha256 === "1d630619a4d292462e028f9e03245bfd906d60bcce023aa2feada9239a935b13" &&
  bootstrapRedProof?.proofPath === ".pipeline/work/AU20/red-proofs/core-api-bootstrap-ownership.json" &&
  bootstrapRedProof?.proofSha256 === "79a2c2376faaebc934193fb3e5933ad7ac98d1566388de46d5b04c39dba2dfdd" &&
  bootstrapRedProof?.reviewPath === "plans/AU20/red-proof-reviews/core-api-bootstrap-ownership.md" &&
  bootstrapRedProof?.reviewSha256 === "a8d957dfa71beb1474dd5c1579e48387216f40df524c578beafd65f065799181" &&
  bootstrapRedProof?.verdict === "accept" &&
  JSON.stringify(bootstrapRedProof?.focused) === JSON.stringify({
    failed: 1,
    passed: 9,
    reason: "all nine returned disposers have owner, cleanupEffect, and constituents undefined",
  }) &&
  bootstrapRedProof?.status === "accepted-history" &&
  sha256(fs.readFileSync(path.join(root, bootstrapRedProof.testPath))) === bootstrapRedProof.testSha256 &&
  sha256(fs.readFileSync(path.join(root, bootstrapRedProof.proofPath))) === bootstrapRedProof.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, bootstrapRedProof.reviewPath))) === bootstrapRedProof.reviewSha256;
const bootstrapWriteCodeAuthorization = progress.gateBindings?.coreApiBootstrapOwnershipWriteCodeAuthorization ?? null;
const expectedBootstrapWriteCodeAuthorization = {
  increment: "core-api-bootstrap-ownership",
  stage: "write-code-core-api-bootstrap-ownership",
  finding: "F5",
  authorizedPaths: ["packages/core-api/src/server-factory.ts"],
  frozenPaths: [
    "packages/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts",
    ".pipeline/work/AU20/red-proofs/core-api-bootstrap-ownership.json",
    "plans/AU20/red-proof-reviews/core-api-bootstrap-ownership.md",
    "scripts/surface-census.ts",
  ],
  requiredImplementation: "Return the exact nine callable disposer owners with owner, cleanupEffect, and exact composite constituent metadata while preserving each existing cleanup behavior and registration order.",
  newExportsAuthorized: false,
  serviceSurfaceGrowthAuthorized: false,
  otherProductionPathsAuthorized: false,
  otherTestsAuthorized: false,
  implementationReviewRequiredBeforeCommit: true,
  nextIncrement: "run-orchestration-async-disposal",
  status: "completed-history",
};
const bootstrapWriteCodeCompleted =
  bootstrapRedProofValid &&
  JSON.stringify(bootstrapWriteCodeAuthorization) === JSON.stringify(expectedBootstrapWriteCodeAuthorization);
const bootstrapFinalReview = progress.gateBindings?.coreApiBootstrapOwnershipFinalReview ?? null;
const committedBootstrapServerFactory = spawnSync(
  "git",
  ["show", "591f2051482581c29f082544ac36efb0f09df1d6:packages/core-api/src/server-factory.ts"],
  { cwd: root, encoding: null, shell: false },
);
const bootstrapFinalReviewValid =
  bootstrapWriteCodeCompleted &&
  bootstrapFinalReview?.path === "plans/AU20/register-reviews/core-api-bootstrap-ownership.md" &&
  bootstrapFinalReview?.sha256 === "e423371d5f7e91029fd8fb1a526cdd43ce4c6063eacd23b025b5d89af25817c3" &&
  bootstrapFinalReview?.verdict === "accept" &&
  bootstrapFinalReview?.serverFactorySha256 === "b8a7c5a0fc159d8e5496a7f8c98537e1387c9df16a1ba1d2e88228b18b4382ca" &&
  bootstrapFinalReview?.testSha256 === bootstrapRedProof.testSha256 &&
  JSON.stringify(bootstrapFinalReview?.focused) === JSON.stringify({ passed: 10, failed: 0 }) &&
  JSON.stringify(bootstrapFinalReview?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  bootstrapFinalReview?.status === "accepted" &&
  sha256(fs.readFileSync(path.join(root, bootstrapFinalReview.path))) === bootstrapFinalReview.sha256 &&
  committedBootstrapServerFactory.status === 0 &&
  sha256(committedBootstrapServerFactory.stdout) === bootstrapFinalReview.serverFactorySha256;
const bootstrapFinalizeAuthorization = progress.gateBindings?.coreApiBootstrapOwnershipFinalizeAuthorization ?? null;
const expectedBootstrapFinalizeAuthorization = {
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
const bootstrapFinalizeCompleted =
  bootstrapFinalReviewValid &&
  JSON.stringify(bootstrapFinalizeAuthorization) === JSON.stringify(expectedBootstrapFinalizeAuthorization);
const bootstrapCommit = progress.gateBindings?.coreApiBootstrapOwnershipCommit ?? null;
const bootstrapCommitInspection = bootstrapCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", bootstrapCommit.commit], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    })
  : null;
const bootstrapCommitValid =
  bootstrapFinalizeCompleted &&
  bootstrapCommit?.commit === "591f2051482581c29f082544ac36efb0f09df1d6" &&
  bootstrapCommit?.tree === "307af84575fe83c0bffb7b9409c4fcda01533dd5" &&
  bootstrapCommit?.parent === "a6641fa18c781bad1ee77ac07ae2b6ebb7b74f07" &&
  bootstrapCommit?.subject === "AU20: identify bootstrap resource ownership" &&
  bootstrapCommit?.pathCount === 9 &&
  bootstrapCommit?.preTransitionProgressSha256 === "25b25254b0a1cbd311089461a310219a4aad1e7dfb937fc8228e060ddd26aadb" &&
  bootstrapCommit?.preTransitionChangeMapSha256 === "f2b5f0cd4576056c55a9f62b390f217d2589446e9bbc19483be2873c0371c654" &&
  bootstrapCommit?.serverFactorySha256 === bootstrapFinalReview.serverFactorySha256 &&
  bootstrapCommit?.testSha256 === bootstrapFinalReview.testSha256 &&
  JSON.stringify(bootstrapCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(bootstrapCommit?.verification ?? {}).every((result) => result === "pass") &&
  bootstrapCommit?.status === "completed-history" &&
  bootstrapCommitInspection?.status === 0 &&
  bootstrapCommitInspection.stdout.trim() === [
    bootstrapCommit.commit,
    bootstrapCommit.tree,
    bootstrapCommit.parent,
    bootstrapCommit.subject,
  ].join("\n");
const disposalWriteTestsAuthorization = progress.gateBindings?.asyncRuntimeDisposalWriteTestsAuthorization ?? null;
const expectedDisposalWriteTestsAuthorization = {
  increment: "run-orchestration-async-disposal",
  stage: "write-tests-async-runtime-disposal",
  finding: "F2",
  authorizedPaths: [
    "packages/core-api/src/__tests__/server-disposal.integration.test.ts",
    ".pipeline/work/AU20/red-proofs/run-orchestration-async-disposal.json",
  ],
  requiredProof: {
    phaseOrder: ["bet-decomposition", "run-runtime", "app-domain", "websocket", "http", "owned-db"],
    allPhasesRunAfterFailure: true,
    orderedPhaseTaggedAggregateError: true,
    sharedPromiseIdempotence: true,
    injectedDatabaseNeverClosed: true,
    ownedDatabaseAwaited: true,
    durableShutdownBeforeDatabaseClose: true,
    callerInventoryFrozen: [
      "packages/remote-server/src/index.ts",
      "packages/desktop/src/boot-server.ts",
      "packages/desktop/src/main.ts",
      "packages/web/scripts/ah1-test-server.ts",
      "packages/web/scripts/ah5-test-server.ts",
      "packages/web/scripts/ah6-test-server.ts",
    ],
  },
  productionCodeAuthorized: false,
  existingCallerTestsAuthorized: false,
  serviceSurfaceGrowthAuthorized: false,
  redProofReviewRequiredBeforeWriteCode: true,
  nextIncrement: "knowledge-retro-snapshot",
  status: "completed-history",
};
const disposalWriteTestsCompleted =
  bootstrapCommitValid &&
  JSON.stringify(disposalWriteTestsAuthorization) === JSON.stringify(expectedDisposalWriteTestsAuthorization);
const disposalRedProof = progress.gateBindings?.asyncRuntimeDisposalRedProof ?? null;
const disposalRedProofValid =
  disposalWriteTestsCompleted &&
  disposalRedProof?.testPath === "packages/core-api/src/__tests__/server-disposal.integration.test.ts" &&
  disposalRedProof?.testSha256 === "f136b0f3b544070a92dd9cc63a9c281de468009b296bcd9dd0d76e6d1b3e94f3" &&
  disposalRedProof?.proofPath === ".pipeline/work/AU20/red-proofs/run-orchestration-async-disposal.json" &&
  disposalRedProof?.proofSha256 === "56256c3bf8e74894df90115ca873f671c87c212ae3424debd7b0383fa330987b" &&
  disposalRedProof?.reviewPath === "plans/AU20/red-proof-reviews/run-orchestration-async-disposal.md" &&
  disposalRedProof?.reviewSha256 === "a2634e280fe73c730d80b0c19e93871eee2ba883dafc9380c18bd1f12bab64fc" &&
  disposalRedProof?.verdict === "accept" &&
  JSON.stringify(disposalRedProof?.focused) === JSON.stringify({ failed: 3, passed: 2, total: 5, unhandledErrors: 0 }) &&
  disposalRedProof?.status === "accepted-history" &&
  sha256(fs.readFileSync(path.join(root, disposalRedProof.testPath))) === disposalRedProof.testSha256 &&
  sha256(fs.readFileSync(path.join(root, disposalRedProof.proofPath))) === disposalRedProof.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, disposalRedProof.reviewPath))) === disposalRedProof.reviewSha256;
const disposalWriteCodeAuthorization = progress.gateBindings?.asyncRuntimeDisposalWriteCodeAuthorization ?? null;
const expectedDisposalWriteCodeAuthorization = {
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
  status: "completed-history",
};
const disposalWriteCodeCompleted =
  disposalRedProofValid &&
  JSON.stringify(disposalWriteCodeAuthorization) === JSON.stringify(expectedDisposalWriteCodeAuthorization);
const disposalCandidate = progress.gateBindings?.asyncRuntimeDisposalCandidate ?? null;
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
const expectedDisposalCandidatePaths = {
  "packages/core-api/src/server-factory.ts": "34332d65afb258b47de22e77452f30b29514fa23afcf70ab0b4555d43587fbb1",
  "packages/remote-server/src/index.ts": "5268bfa5fbb6ce88c782e7b4658b11c1b6ab57c26a7b73b01006a113ac2517a3",
  "packages/desktop/src/boot-server.ts": "5083a235f4b90fe1f609939435fb6e8b887568b6ac924337d5dbe718e7bba2f7",
  "packages/desktop/src/main.ts": "97aedbfc49137f79ab4d9d505b4b37c6bfef9646a7d49ecfd698e130172e0118",
  "packages/web/scripts/ah1-test-server.ts": "14e14a9a08a4642c7ea6aa19da0b0aa230389036e1b7b3474e3800be052d317e",
  "packages/web/scripts/ah5-test-server.ts": "bf47c33bc75275b3c3c83a27e5f6f7c6356a101c072933d283c76be4266d6ff4",
  "packages/web/scripts/ah6-test-server.ts": "68699ebe2f01b50e232c4308a7878127bab3d5ab3286aa72fcead8e710f97169",
};
const disposalCandidateValid =
  disposalWriteCodeCompleted &&
  JSON.stringify(disposalCandidate?.paths) === JSON.stringify(expectedDisposalCandidatePaths) &&
  disposalCandidate?.implementationReviewPath === "plans/AU20/register-reviews/run-orchestration-async-disposal.md" &&
  disposalCandidate?.implementationReviewSha256 === "ca703b9a4dbea151cf1fd19eea71b5210c3bb2269b0246cc21fda2e48f7ee88b" &&
  disposalCandidate?.implementationReviewVerdict === "revise" &&
  disposalCandidate?.productVerdict === "accept" &&
  disposalCandidate?.provenanceVerdict === "revise" &&
  disposalCandidate?.finalReviewPath === "plans/AU20/register-reviews/run-orchestration-async-disposal-provenance-final.md" &&
  disposalCandidate?.finalReviewSha256 === "686dd980c4617f35b3634a9f8176f82fa662af760af8555a0bc8b9a128f49008" &&
  disposalCandidate?.finalReviewVerdict === "accept" &&
  disposalCandidate?.status === "accepted-commit-authorized" &&
  disposalCandidate?.commitAuthorization?.message === "AU20 F2: await runtime disposal" &&
  JSON.stringify(disposalCandidate?.commitAuthorization?.paths) === JSON.stringify(expectedDisposalCommitPaths) &&
  Object.entries(expectedDisposalCandidatePaths).every(([candidatePath, expectedHash]) =>
    sha256(fs.readFileSync(path.join(root, candidatePath))) === expectedHash) &&
  sha256(fs.readFileSync(path.join(root, disposalCandidate.implementationReviewPath))) === disposalCandidate.implementationReviewSha256 &&
  sha256(fs.readFileSync(path.join(root, disposalCandidate.finalReviewPath))) === disposalCandidate.finalReviewSha256;
const disposalCommit = disposalCandidate?.commitReceipt ?? null;
const disposalCommitInspection = disposalCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", disposalCommit.commit], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    })
  : null;
const disposalCommitPaths = disposalCommit
  ? spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", disposalCommit.commit], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    })
  : null;
const disposalCommitValid =
  disposalCandidateValid &&
  disposalCommit?.commit === "1397db5a5b5a07e1bb6d1884ed550e0e148606a4" &&
  disposalCommit?.tree === "f74b4b5f11c28da6ecd6486eb632f90816447b2c" &&
  disposalCommit?.parent === "591f2051482581c29f082544ac36efb0f09df1d6" &&
  disposalCommit?.subject === "AU20 F2: await runtime disposal" &&
  JSON.stringify(disposalCommit?.paths) === JSON.stringify(expectedDisposalCommitPaths) &&
  JSON.stringify(disposalCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(disposalCommit?.verification ?? {}).every((result) => result === "pass") &&
  disposalCommitInspection?.status === 0 &&
  disposalCommitInspection.stdout.trim() === [
    disposalCommit.commit,
    disposalCommit.tree,
    disposalCommit.parent,
    disposalCommit.subject,
  ].join("\n") &&
  disposalCommitPaths?.status === 0 &&
  JSON.stringify(disposalCommitPaths.stdout.trim().split("\n")) === JSON.stringify(expectedDisposalCommitPaths);
const retroWriteTestsAuthorization = progress.gateBindings?.knowledgeRetroSnapshotWriteTestsAuthorization ?? null;
const expectedRetroWriteTestsAuthorization = {
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
const committedRetroProduct = spawnSync(
  "git",
  ["show", "1397db5a5b5a07e1bb6d1884ed550e0e148606a4:packages/core-api/src/routes/bets.ts"],
  { cwd: root, encoding: null, shell: false },
);
const retroWriteTestsValid =
  disposalCommitValid &&
  JSON.stringify(retroWriteTestsAuthorization) === JSON.stringify(expectedRetroWriteTestsAuthorization) &&
  sha256(fs.readFileSync(path.join(root, retroWriteTestsAuthorization.testPath))) === retroWriteTestsAuthorization.testSha256 &&
  committedRetroProduct.status === 0 &&
  sha256(committedRetroProduct.stdout) === retroWriteTestsAuthorization.productSha256;
const retroRedProof = progress.gateBindings?.knowledgeRetroSnapshotRedProof ?? null;
const retroRedProofValid =
  retroWriteTestsValid &&
  retroRedProof?.increment === "knowledge-retro-snapshot" &&
  retroRedProof?.finding === "F4" &&
  retroRedProof?.testPath === retroWriteTestsAuthorization.testPath &&
  retroRedProof?.testSha256 === retroWriteTestsAuthorization.testSha256 &&
  retroRedProof?.proofPath === retroWriteTestsAuthorization.proofPath &&
  retroRedProof?.proofSha256 === "f75002097cdef4080a41772ec2077ac95e0f64534dc8b511c526d2aa70baadee" &&
  retroRedProof?.reviewPath === "plans/AU20/red-proof-reviews/knowledge-retro-snapshot.md" &&
  retroRedProof?.reviewSha256 === "f64999e9ade9f5632ceb49cc0dd100f8db609c9c746d809e4db200a2984e002f" &&
  retroRedProof?.verdict === "accept" &&
  retroRedProof?.expectedRedExitCode === 1 &&
  retroRedProof?.status === "accepted" &&
  sha256(fs.readFileSync(path.join(root, retroRedProof.testPath))) === retroRedProof.testSha256 &&
  sha256(fs.readFileSync(path.join(root, retroRedProof.proofPath))) === retroRedProof.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, retroRedProof.reviewPath))) === retroRedProof.reviewSha256;
const retroWriteCodeAuthorization = progress.gateBindings?.knowledgeRetroSnapshotWriteCodeAuthorization ?? null;
const expectedRetroWriteCodeAuthorization = {
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
const retroWriteCodeValid =
  retroRedProofValid &&
  JSON.stringify(retroWriteCodeAuthorization) === JSON.stringify(expectedRetroWriteCodeAuthorization);
const retroCandidate = progress.gateBindings?.knowledgeRetroSnapshotCandidate ?? null;
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
const retroCandidateValid =
  retroWriteCodeValid &&
  retroCandidate?.increment === "knowledge-retro-snapshot" &&
  retroCandidate?.finding === "F4" &&
  retroCandidate?.productPath === retroWriteTestsAuthorization.productPath &&
  retroCandidate?.productSha256 === "7361a2fd2977c0f6ca74527006ea0838ebe7442e784816b412962d37ac7a8bf3" &&
  retroCandidate?.testPath === retroWriteTestsAuthorization.testPath &&
  retroCandidate?.testSha256 === retroWriteTestsAuthorization.testSha256 &&
  retroCandidate?.proofPath === retroRedProof.proofPath &&
  retroCandidate?.proofSha256 === retroRedProof.proofSha256 &&
  retroCandidate?.redReviewPath === retroRedProof.reviewPath &&
  retroCandidate?.redReviewSha256 === retroRedProof.reviewSha256 &&
  retroCandidate?.implementationReviewPath === "plans/AU20/register-reviews/knowledge-retro-snapshot.md" &&
  retroCandidate?.implementationReviewSha256 === "fe7432f7f11b0dc705b90dfc45fd0c683614e395ac62991ae0e3c747d0231ce7" &&
  retroCandidate?.implementationReviewVerdict === "accept" &&
  JSON.stringify(retroCandidate?.verification) === JSON.stringify({
    focused: "23/23 pass",
    serviceIntegration: "2869 pass; 7 skipped by existing lane policy",
    check: "pass",
    lint: "pass",
    unit: "3557 pass",
    gate: "pass",
    census: "23 services / 231 methods / 181 types / 412 total",
    knowledgeCensus: "17 methods / 12 types / 29 total",
  }) &&
  retroCandidate?.status === "accepted-commit-authorized" &&
  retroCandidate?.commitAuthorization?.message === "AU20 F4: preserve retro hypothesis snapshot" &&
  JSON.stringify(retroCandidate?.commitAuthorization?.paths) === JSON.stringify(expectedRetroCommitPaths) &&
  sha256(fs.readFileSync(path.join(root, retroCandidate.productPath))) === retroCandidate.productSha256 &&
  sha256(fs.readFileSync(path.join(root, retroCandidate.testPath))) === retroCandidate.testSha256 &&
  sha256(fs.readFileSync(path.join(root, retroCandidate.proofPath))) === retroCandidate.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, retroCandidate.redReviewPath))) === retroCandidate.redReviewSha256 &&
  sha256(fs.readFileSync(path.join(root, retroCandidate.implementationReviewPath))) === retroCandidate.implementationReviewSha256;
const finalArchitectureValid =
  f13ProvenanceValid &&
  finalArchitectureBinding !== null &&
  finalArchitectureBinding.verdict === "accept" &&
  sha256(fs.readFileSync(path.join(root, finalArchitectureBinding.path))) === finalArchitectureBinding.sha256 &&
  sha256(fs.readFileSync(architecturePath)) === finalArchitectureBinding.architectureSha256 &&
  sha256(fs.readFileSync(feasibilityPath)) === finalArchitectureBinding.feasibilitySha256 &&
  sha256(fs.readFileSync(path.join(root, "plans/AU20/diagnostics/final-ship-review-correction-map.md"))) === finalArchitectureBinding.diagnosticSha256 &&
  finalArchitectureBinding.finalReviewSha256 === historicalReview.historicalLiveReviewSha256 &&
  sha256(fs.readFileSync(path.join(root, finalArchitectureBinding.path))) === "5194f0382f53cfe12cd40014413750bd18907819527520f37d261cc23cc87ae9";
const findingLedgerRedValid =
  finalArchitectureValid &&
  findingLedgerRedBinding !== null &&
  findingLedgerRedBinding.verdict === "accept" &&
  sha256(fs.readFileSync(path.join(root, findingLedgerRedBinding.path))) === findingLedgerRedBinding.sha256 &&
  sha256(fs.readFileSync(path.join(root, findingLedgerRedBinding.guardPath))) === findingLedgerRedBinding.guardSha256 &&
  findingLedgerRedBinding.historicalReviewSha256 === finalArchitectureBinding.finalReviewSha256 &&
  JSON.stringify(findingLedgerRedBinding.intendedRed) === JSON.stringify({ message: "WARNING footer=6 headings=5", exitCode: 1 }) &&
  findingLedgerRedBinding.checkExitCode === 0;
const finalShipCorrection = {
  required: true,
  acceptedArchitecture: finalArchitectureValid ? finalArchitectureBinding : null,
  f13ProvenanceAmendment: f13ProvenanceValid ? f13ProvenanceBinding : null,
  completedIncrements: [
    ...(findingLedgerCommitValid ? [{
      name: "review-finding-ledger",
      finding: "F13",
      redProofReview: findingLedgerRedBinding,
      commitReceipt: findingLedgerCommit,
      status: "completed-history",
    }] : []),
    ...(demandCommitValid ? [{
      name: "evidence-demand-package",
      finding: "F1",
      priorRedProofReview: demandRedProof,
      redProofReview: nestedPortsRedProof,
      rejectedCandidate: rejectedDemandCandidate,
      candidate: correctedDemandCandidate,
      provenanceReview,
      finalReview: finalDemandReview,
      finalizeAuthorization: finalizeDemandAuthorization,
      commitReceipt: demandCommit,
      status: "completed-history",
    }] : []),
    ...(bootstrapCommitValid ? [{
      name: "core-api-bootstrap-ownership",
      finding: "F5",
      redProofReview: bootstrapRedProof,
      finalReview: bootstrapFinalReview,
      finalizeAuthorization: bootstrapFinalizeAuthorization,
      commitReceipt: bootstrapCommit,
      status: "completed-history",
    }] : []),
    ...(disposalCommitValid ? [{
      name: "run-orchestration-async-disposal",
      finding: "F2",
      redProofReview: disposalRedProof,
      candidate: disposalCandidate,
      commitReceipt: disposalCommit,
      status: "completed-history",
    }] : []),
  ],
  activeIncrement: {
    name: "knowledge-retro-snapshot",
    finding: "F4",
    writeTestsAuthorization: retroWriteTestsValid ? retroWriteTestsAuthorization : null,
    redProofReview: retroRedProofValid ? retroRedProof : null,
    writeCodeAuthorization: retroWriteCodeValid ? retroWriteCodeAuthorization : null,
    candidate: retroCandidateValid ? retroCandidate : null,
    authorizedStage: retroCandidateValid && progress.currentStep === "commit-knowledge-retro-snapshot"
      ? "commit-knowledge-retro-snapshot"
      : null,
    authorization: retroCandidateValid ? retroCandidate.commitAuthorization : null,
    productCodeAuthorized: false,
  },
  censusCeiling: { services: 23, methods: 231, types: 181 },
  nextIncrement: "knowledge-retro-snapshot",
};
const output = {
  ...payload,
  integrity: {
    browserLedgerSha256: sha256(browserBytes),
    systemLedgerSha256: sha256(systemBytes),
    generatorSha256: sha256(generatorBytes),
    diagnosticSha256: Object.fromEntries(diagnostics.map((d) => [d.name, sha256(d.bytes)])),
    payloadSha256,
    acceptedReview: reviewBindingValid ? acceptedReview : null,
    proofInventoryArchitectureAmendment,
    finalShipCorrection,
    writeTestsLocked: true,
    codeLocked: true,
    productCodeLocked: true,
    commitLocked: !retroCandidateValid,
  },
};
fs.writeFileSync(path.join(root, "plans/AU20/corrective-change-map.json"), `${JSON.stringify(output, null, 2)}\n`);

const rows = Object.entries(summary.changeKinds).map(([k,v]) => `| ${k} | ${v} |`).join("\n");
const dispositions = Object.entries(summary.targetDispositions).map(([k,v]) => `| ${k} | ${v} |`).join("\n");
const md = `# AU20 corrective change map\n\nMachine source: \`plans/AU20/corrective-change-map.json\`.\n\n## Coverage\n\n- Identities: **${summary.total}/604** (${summary.browser} browser + ${summary.system} system)\n- Unresolved target dispositions: **${summary.unresolvedRemaining}**\n- Fresh-review obligations: **${summary.reviewFindings.critical}/5 critical + ${summary.reviewFindings.warning}/4 warning**\n- Harness-defect targets: **${summary.harnessDefects}**. Historical harness health is trusted; none is assigned without direct AU20-local evidence.\n- Classification review: **${reviewBindingValid ? "accepted and payload-hash bound" : "pending"}**.\n- Proof-inventory architecture amendment R3: **${r3CallerMigrationRequired ? "caller-migration write-tests required; prior R3 red proof superseded; code locked" : redProofReviewValid ? "red proof accepted; amendment write-code unlocked only for this increment" : amendmentReviewValid ? "accepted; amendment write-tests unlocked, code locked" : "independent re-review required; write-tests/code locked"}**. Scope: one captured verifier, pinned manifest with mandatory builder identity, descriptor-stable reads, physical legacy authority deletion, strict attempts.\n\n## Target dispositions\n\n| Disposition | Count |\n|---|---:|\n${dispositions}\n\n## Change locations\n\n| Change kind | Count |\n|---|---:|\n${rows}\n\n## Decision rules\n\nEvery entry records root register/problem, exact test and candidate production surfaces, required red proof, owner/layer, test versus production action, and ordered dependencies. Existing reviewed discovery/design decisions are carried forward. Formerly unresolved identities change state only through a hash-bound diagnostic record with direct terminal/imported-runtime/source evidence and an exact first boundary; the generator has no ambiguity default. Repository-owned skips, seeds, mocks, and fixtures are stale-test corrections, never external prerequisites. Only a named unavailable credential, binary, or external service can be a prerequisite. Independent review may revise any target; changed content invalidates the gate hash.\n`;
fs.writeFileSync(path.join(root, "plans/AU20/corrective-change-map.md"), md);
