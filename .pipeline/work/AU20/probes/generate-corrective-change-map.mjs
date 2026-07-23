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
  activeIncrement: {
    name: "review-finding-ledger",
    redProofReview: findingLedgerRedValid ? findingLedgerRedBinding : null,
    authorizedStage: findingLedgerRedValid ? "write-code-review-finding-ledger" : finalArchitectureValid ? "write-tests-review-finding-ledger" : null,
    productCodeAuthorized: false,
  },
  censusCeiling: { services: 23, methods: 231, types: 181 },
  nextIncrement: "evidence-demand-package",
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
    writeTestsLocked: !reviewBindingValid || !finalArchitectureValid,
    codeLocked: !findingLedgerRedValid,
    productCodeLocked: true,
  },
};
fs.writeFileSync(path.join(root, "plans/AU20/corrective-change-map.json"), `${JSON.stringify(output, null, 2)}\n`);

const rows = Object.entries(summary.changeKinds).map(([k,v]) => `| ${k} | ${v} |`).join("\n");
const dispositions = Object.entries(summary.targetDispositions).map(([k,v]) => `| ${k} | ${v} |`).join("\n");
const md = `# AU20 corrective change map\n\nMachine source: \`plans/AU20/corrective-change-map.json\`.\n\n## Coverage\n\n- Identities: **${summary.total}/604** (${summary.browser} browser + ${summary.system} system)\n- Unresolved target dispositions: **${summary.unresolvedRemaining}**\n- Fresh-review obligations: **${summary.reviewFindings.critical}/5 critical + ${summary.reviewFindings.warning}/4 warning**\n- Harness-defect targets: **${summary.harnessDefects}**. Historical harness health is trusted; none is assigned without direct AU20-local evidence.\n- Classification review: **${reviewBindingValid ? "accepted and payload-hash bound" : "pending"}**.\n- Proof-inventory architecture amendment R3: **${r3CallerMigrationRequired ? "caller-migration write-tests required; prior R3 red proof superseded; code locked" : redProofReviewValid ? "red proof accepted; amendment write-code unlocked only for this increment" : amendmentReviewValid ? "accepted; amendment write-tests unlocked, code locked" : "independent re-review required; write-tests/code locked"}**. Scope: one captured verifier, pinned manifest with mandatory builder identity, descriptor-stable reads, physical legacy authority deletion, strict attempts.\n\n## Target dispositions\n\n| Disposition | Count |\n|---|---:|\n${dispositions}\n\n## Change locations\n\n| Change kind | Count |\n|---|---:|\n${rows}\n\n## Decision rules\n\nEvery entry records root register/problem, exact test and candidate production surfaces, required red proof, owner/layer, test versus production action, and ordered dependencies. Existing reviewed discovery/design decisions are carried forward. Formerly unresolved identities change state only through a hash-bound diagnostic record with direct terminal/imported-runtime/source evidence and an exact first boundary; the generator has no ambiguity default. Repository-owned skips, seeds, mocks, and fixtures are stale-test corrections, never external prerequisites. Only a named unavailable credential, binary, or external service can be a prerequisite. Independent review may revise any target; changed content invalidates the gate hash.\n`;
fs.writeFileSync(path.join(root, "plans/AU20/corrective-change-map.md"), md);
