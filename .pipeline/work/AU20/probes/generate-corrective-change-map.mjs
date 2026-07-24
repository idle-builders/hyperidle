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
  Object.entries(expectedDisposalCandidatePaths).every(([candidatePath, expectedHash]) => {
    const committed = spawnSync("git", ["show", `1397db5a5b5a07e1bb6d1884ed550e0e148606a4:${candidatePath}`], { cwd: root, encoding: null, shell: false });
    return committed.status === 0 && sha256(committed.stdout) === expectedHash;
  }) &&
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
const retroCommit = retroCandidate?.commitReceipt ?? null;
const retroCommitInspection = retroCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", retroCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const retroCommitPaths = retroCommit
  ? spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", retroCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const retroCommitValid =
  retroCandidateValid &&
  retroCommit?.commit === "0f7f6c1b1354eea71f9cc5c36098c413b62741d8" &&
  retroCommit?.tree === "beb4871cf834354cdf45bc6f6d893e94af8106ec" &&
  retroCommit?.parent === "1397db5a5b5a07e1bb6d1884ed550e0e148606a4" &&
  retroCommit?.subject === "AU20 F4: preserve retro hypothesis snapshot" &&
  JSON.stringify(retroCommit?.paths) === JSON.stringify(expectedRetroCommitPaths) &&
  JSON.stringify(retroCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(retroCommit?.verification ?? {}).every((result) => result === "pass") &&
  retroCommitInspection?.status === 0 &&
  retroCommitInspection.stdout.trim() === [retroCommit.commit, retroCommit.tree, retroCommit.parent, retroCommit.subject].join("\n") &&
  retroCommitPaths?.status === 0 &&
  JSON.stringify(retroCommitPaths.stdout.trim().split("\n")) === JSON.stringify(expectedRetroCommitPaths);
const mcpWriteTestsAuthorization = progress.gateBindings?.harnessMcpIsolationWriteTestsAuthorization ?? null;
const expectedMcpWriteTestsAuthorization = {
  increment: "harness-registry-mcp-entry",
  stage: "write-tests-harness-registry-mcp-entry",
  finding: "F3",
  validatorPath: ".pipeline/work/AU20/probes/validate-harness-mcp-isolation.mjs",
  proofPath: ".pipeline/work/AU20/red-proofs/harness-registry-mcp-entry.json",
  protectedTests: {
    "packages/agent-execution/harness-registry/src/__tests__/mcp-route.test.ts": "115064b9d5408c4fabf07ecff4b91f87c959f17e001bc5a3c3fbd20f6b807a81",
    "packages/agent-execution/harness-registry/src/__tests__/mcp-bridge-stateful.integration.test.ts": "f08309f8b88636e82b1b75c5f60480d4ea3cdc690baa4fb8a95dcbf24973de11",
  },
  authorizedTestCorrections: {
    "packages/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts": {
      baselineSha256: "d3c29fba3c8fa7ab814c006440d2dce7b9e51b2f2e871687923b91ed2f09636f",
      requiredModel: "haiku",
      requiredCredentialBehavior: "every missing or invalid Claude/Codex/OpenCode/GitHub credential hard-fails; no skip callback or skip branch remains",
    },
  },
  frozenProduct: {
    "packages/agent-execution/harness-registry/package.json": "de57441c84ee453a7765283e599ad8dc79f12d911826f06d18149c4cf22fc8bb",
    "packages/agent-execution/harness-registry/src/index.ts": "cc1c796f2e29e1450927121ea37992e08299885bfac4d3d0e39f12af11a2e0c2",
    "packages/agent-execution/harness-registry/src/mcp-tool-bridge.ts": "7bb90c5d0a7cc4bddb98d75092cbb2ac32a45ca975a942e4181abbcfcf9d3f58",
    "packages/agent-execution/harness-registry/src/mcp/mcp-bridge.ts": "4376c6fa0265725cd4e5c955d6474d2ccda71e6dc9c34fff188b24a4a1ef64bb",
    "packages/agent-execution/harness-registry/src/mcp/mcp-route.ts": "e6f762d25fbb35bd96028879dfdb2b04fb8fff6d1e6689f6628ad9437dd39e0d",
    "packages/core-api/src/server-factory.ts": "34332d65afb258b47de22e77452f30b29514fa23afcf70ab0b4555d43587fbb1",
  },
  requiredRed: {
    mainEntry: "main bundle/import graph contains zero src/mcp, MCP SDK, Hono, or Zod inputs",
    subpath: "runtime import @hyperidle/harness-registry/mcp and assert own exported createMcpToolBridge is a function; comments, strings, imports, and type-only declarations cannot satisfy it",
    packageExports: "package exports defines ./mcp and main index has no MCP bridge re-export",
    failure: "current tree fails because ./mcp is absent and main entry exposes MCP dependencies",
    validatorIntegrity: "derive export truth from resolved runtime namespace and esbuild metafile inputs, never regex-only source matches",
  },
  realHarnessRequirements: {
    binaries: ["claude", "codex", "opencode", "gh"],
    claudeModel: "haiku",
    policy: "missing binary or credential is a hard failure via requireHarness/assertion; never skip to green; Claude 429 spend-limit is reported as an honest external release blocker",
    command: "npx vitest run --config vitest.integration.config.ts --project harness packages/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts",
  },
  authorizedPaths: [
    ".pipeline/work/AU20/probes/validate-harness-mcp-isolation.mjs",
    ".pipeline/work/AU20/red-proofs/harness-registry-mcp-entry.json",
    "packages/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts",
  ],
  testModificationAuthorized: true,
  productCodeAuthorized: false,
  newExportsAuthorized: false,
  serviceSurfaceGrowthAuthorized: false,
  census: { services: 23, methods: 231, types: 181, total: 412 },
  nextStage: "red-proof-review-harness-registry-mcp-entry",
  status: "write-tests-revision-authorized",
};
const mcpWriteTestsValid =
  retroCommitValid &&
  JSON.stringify(mcpWriteTestsAuthorization) === JSON.stringify(expectedMcpWriteTestsAuthorization) &&
  Object.entries(mcpWriteTestsAuthorization.protectedTests).every(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) === hash) &&
  Object.entries(mcpWriteTestsAuthorization.frozenProduct).every(([file, hash]) => {
    const baseline = spawnSync("git", ["show", `0f7f6c1b1354eea71f9cc5c36098c413b62741d8:${file}`], { cwd: root, encoding: null, shell: false });
    return baseline.status === 0 && sha256(baseline.stdout) === hash;
  }) &&
  fs.existsSync(path.join(root, mcpWriteTestsAuthorization.validatorPath)) &&
  fs.existsSync(path.join(root, mcpWriteTestsAuthorization.proofPath));
const mcpRedProof = progress.gateBindings?.harnessMcpIsolationRedProof ?? null;
const mcpRedProofValid =
  mcpWriteTestsValid &&
  mcpRedProof?.validatorPath === mcpWriteTestsAuthorization.validatorPath &&
  mcpRedProof?.validatorSha256 === "1fa5c4a3dc47fb427991cc78332691d168cd9a4a25d5b841f115c172b4569f47" &&
  mcpRedProof?.proofPath === mcpWriteTestsAuthorization.proofPath &&
  mcpRedProof?.proofSha256 === "212bc52b7585120394e4cd07bb1b6037f0c250969ac41173b2d03b049f9f85e8" &&
  mcpRedProof?.an2TestPath === "packages/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts" &&
  mcpRedProof?.an2TestSha256 === "075a31f57f22435b11d732ec7e4953459cb7d7680334a8aa629a03c25bce40f3" &&
  mcpRedProof?.reviewPath === "plans/AU20/red-proof-reviews/harness-registry-mcp-entry.md" &&
  mcpRedProof?.reviewSha256 === "d0bd8cb31a9606b353ba8e8d262dd8b1f1b540ab258016c9a73b7e79c3d2094f" &&
  mcpRedProof?.verdict === "accept" &&
  mcpRedProof?.externalReleaseBlocker === "Claude Haiku HTTP 429 monthly spend limit; unweakened real-harness lane must pass before release" &&
  mcpRedProof?.status === "superseded-by-substrate-amendment" &&
  sha256(fs.readFileSync(path.join(root, mcpRedProof.validatorPath))) === mcpRedProof.validatorSha256 &&
  sha256(fs.readFileSync(path.join(root, mcpRedProof.proofPath))) === mcpRedProof.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, mcpRedProof.an2TestPath))) === mcpRedProof.an2TestSha256 &&
  sha256(fs.readFileSync(path.join(root, mcpRedProof.reviewPath))) === mcpRedProof.reviewSha256;
const mcpWriteCodeAuthorization = progress.gateBindings?.harnessMcpIsolationWriteCodeAuthorization ?? null;
const expectedMcpWriteCodeAuthorization = {
  increment: "harness-registry-mcp-entry",
  stage: "write-code-harness-registry-mcp-entry",
  finding: "F3",
  authorizedPaths: [
    "packages/agent-execution/harness-registry/package.json",
    "packages/agent-execution/harness-registry/src/index.ts",
    "packages/agent-execution/harness-registry/src/mcp-tool-bridge.ts",
    "packages/agent-execution/harness-registry/src/mcp/index.ts",
    "packages/agent-execution/harness-registry/src/mcp/mcp-bridge.ts",
    "packages/agent-execution/harness-registry/src/mcp/mcp-route.ts",
    "packages/agent-execution/harness-registry/src/return-status-tool.ts",
    "packages/core-api/src/server-factory.ts",
    "packages/core-api/src/services/tool-provider-bindings.ts",
  ],
  frozenPaths: [
    ".pipeline/work/AU20/probes/validate-harness-mcp-isolation.mjs",
    ".pipeline/work/AU20/red-proofs/harness-registry-mcp-entry.json",
    "packages/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts",
    "packages/agent-execution/harness-registry/src/__tests__/mcp-route.test.ts",
    "packages/agent-execution/harness-registry/src/__tests__/mcp-bridge-stateful.integration.test.ts",
    "plans/AU20/red-proof-reviews/harness-registry-mcp-entry.md",
    "scripts/surface-census.ts",
  ],
  requiredImplementation: {
    packageExport: "./mcp resolves a runtime namespace whose own createMcpToolBridge and returnStatusTool exports are functions",
    mainIsolation: "main entry bundle contains zero src/mcp, mcp-tool-bridge, return-status-tool, MCP SDK, Hono, or Zod inputs and no MCP public re-export",
    consumerMigration: "core-api imports MCP bridge and returnStatusTool only from @hyperidle/harness-registry/mcp; non-MCP consumers remain on main entry",
    behavior: "protected route and stateful bridge behavior remains unchanged",
    compatibility: "internal legacy bridge path may only be a thin compatibility re-export for frozen tests; no duplicate main-package export",
  },
  newExportsAuthorized: false,
  serviceSurfaceGrowthAuthorized: false,
  otherProductionPathsAuthorized: false,
  testsAuthorized: false,
  implementationReviewRequiredBeforeCommit: true,
  externalReleaseBlocker: "Claude Haiku HTTP 429 monthly spend limit",
  nextIncrement: "notifications-secret-errors",
  status: "amended-authorized",
};
const mcpWriteCodeValid =
  mcpRedProofValid &&
  JSON.stringify(mcpWriteCodeAuthorization) === JSON.stringify(expectedMcpWriteCodeAuthorization);
const mcpSubstrate = progress.gateBindings?.harnessMcpIsolationSubstrateAmendment ?? null;
const expectedMcpAmendedTestPaths = [
  ".pipeline/work/AU20/probes/validate-harness-mcp-isolation.mjs",
  ".pipeline/work/AU20/red-proofs/harness-registry-mcp-entry.json",
  "packages/core-api/src/__tests__/AL6-real-harness-return-enforcement-realbinary.integration.test.ts",
  "packages/core-api/src/__tests__/AL7-two-session-trust-first.integration.test.ts",
  "packages/core-api/src/__tests__/mcp-bridge.test.ts",
  "packages/core-api/src/__tests__/AL6-return-status-route.test.ts",
  "packages/core-api/src/__tests__/mcp-bridge-registry.test.ts",
];
const expectedMcpAmendedProductionPaths = [
  "packages/agent-execution/harness-registry/package.json",
  "packages/agent-execution/harness-registry/src/index.ts",
  "packages/agent-execution/harness-registry/src/mcp-tool-bridge.ts",
  "packages/agent-execution/harness-registry/src/mcp/index.ts",
  "packages/agent-execution/harness-registry/src/mcp/mcp-bridge.ts",
  "packages/agent-execution/harness-registry/src/mcp/mcp-route.ts",
  "packages/agent-execution/harness-registry/src/return-status-tool.ts",
  "packages/core-api/src/server-factory.ts",
  "packages/core-api/src/services/tool-provider-bindings.ts",
];
const mcpSubstrateValid =
  mcpWriteTestsValid &&
  mcpSubstrate?.stage === "write-tests-harness-registry-mcp-substrate-amendment" &&
  mcpSubstrate?.finding === "F3" &&
  mcpSubstrate?.probeContract?.mechanism.includes("temporary ESM .mts probe") &&
  mcpSubstrate?.probeContract?.exportAssertion.includes("createMcpToolBridge and returnStatusTool") &&
  mcpSubstrate?.probeContract?.graphAssertion.includes("return-status-tool") &&
  JSON.stringify(Object.keys(mcpSubstrate?.authorizedTestPaths ?? {})) === JSON.stringify(expectedMcpAmendedTestPaths) &&
  JSON.stringify(mcpSubstrate?.authorizedProductionPathsAfterRedReview) === JSON.stringify(expectedMcpAmendedProductionPaths) &&
  mcpSubstrate?.returnStatusDecision === "Move the existing returnStatusTool public export from main to /mcp and migrate tool-provider-bindings; do not duplicate implementation or keep a main re-export." &&
  mcpSubstrate?.productCodeAuthorized === false &&
  mcpSubstrate?.newImplementationAuthorized === false &&
  mcpSubstrate?.serviceSurfaceGrowthAuthorized === false &&
  mcpSubstrate?.nextStage === "red-proof-review-harness-registry-mcp-substrate-amendment" &&
  mcpSubstrate?.status === "write-tests-authorized";
const mcpAmendedRed = progress.gateBindings?.harnessMcpIsolationAmendedRedProof ?? null;
const mcpAmendedRedValid =
  mcpSubstrateValid &&
  mcpAmendedRed?.validatorSha256 === "2007c4fe44975be2d5b07381ee34ecbd6039bcb82b0acf775f6edc8c933de0ce" &&
  mcpAmendedRed?.proofSha256 === "9f8c60258be9b8ee320aa7388189903cbe7e0d7bd94e247c1fc82aede28a4762" &&
  mcpAmendedRed?.reviewSha256 === "40a0e0e3a43e821ef8328c79c07bb053ba0be7f248e7af891c8f1e961e5142de" &&
  mcpAmendedRed?.verdict === "accept" &&
  mcpAmendedRed?.status === "accepted" &&
  sha256(fs.readFileSync(path.join(root, mcpAmendedRed.validatorPath))) === mcpAmendedRed.validatorSha256 &&
  sha256(fs.readFileSync(path.join(root, mcpAmendedRed.proofPath))) === mcpAmendedRed.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, mcpAmendedRed.reviewPath))) === mcpAmendedRed.reviewSha256 &&
  Object.entries(mcpAmendedRed.testSha256).every(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) === hash);
const mcpAmendedWriteCodeValid =
  mcpAmendedRedValid &&
  JSON.stringify(mcpWriteCodeAuthorization) === JSON.stringify(expectedMcpWriteCodeAuthorization);
const mcpCandidate = progress.gateBindings?.harnessMcpIsolationCandidate ?? null;
const expectedMcpCommitPaths = [
  ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
  ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
  ".pipeline/work/AU20/probes/validate-harness-mcp-isolation.mjs",
  ".pipeline/work/AU20/progress.json",
  ".pipeline/work/AU20/red-proofs/harness-registry-mcp-entry.json",
  "packages/agent-execution/harness-registry/package.json",
  "packages/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts",
  "packages/agent-execution/harness-registry/src/index.ts",
  "packages/agent-execution/harness-registry/src/mcp-tool-bridge.ts",
  "packages/agent-execution/harness-registry/src/mcp/index.ts",
  "packages/agent-execution/harness-registry/src/return-status-tool.ts",
  "packages/core-api/src/__tests__/AL6-real-harness-return-enforcement-realbinary.integration.test.ts",
  "packages/core-api/src/__tests__/AL6-return-status-route.test.ts",
  "packages/core-api/src/__tests__/AL7-two-session-trust-first.integration.test.ts",
  "packages/core-api/src/__tests__/mcp-bridge-registry.test.ts",
  "packages/core-api/src/__tests__/mcp-bridge.test.ts",
  "packages/core-api/src/server-factory.ts",
  "packages/core-api/src/services/tool-provider-bindings.ts",
  "plans/AU20/corrective-change-map.json",
  "plans/AU20/red-proof-reviews/harness-registry-mcp-entry.md",
  "plans/AU20/register-reviews/harness-registry-mcp-entry.md",
];
const mcpCandidateValid =
  mcpAmendedWriteCodeValid &&
  JSON.stringify(mcpCandidate?.productSha256) === JSON.stringify({
    "packages/agent-execution/harness-registry/package.json": "c969592613f7a0a0caaf828fe1888f159e06b4b3aa567449328013b7783260d8",
    "packages/agent-execution/harness-registry/src/index.ts": "dbe88ca2a53862d919428f53b63161eba77cc8b057be07009b6d9911f9483626",
    "packages/agent-execution/harness-registry/src/mcp-tool-bridge.ts": "add996f2f150683cf2773602bfb710b9d031fb312847c9d5bfa941d896650118",
    "packages/agent-execution/harness-registry/src/mcp/index.ts": "8ed4bc28bf456fa78978785321d834540fcba151611b533b04785aecf8de4a6b",
    "packages/agent-execution/harness-registry/src/mcp/mcp-bridge.ts": "4376c6fa0265725cd4e5c955d6474d2ccda71e6dc9c34fff188b24a4a1ef64bb",
    "packages/agent-execution/harness-registry/src/mcp/mcp-route.ts": "e6f762d25fbb35bd96028879dfdb2b04fb8fff6d1e6689f6628ad9437dd39e0d",
    "packages/agent-execution/harness-registry/src/return-status-tool.ts": "4df8a05503fd7897f75613acc916e182b58fc5da42790441f2f1a0e4b782270b",
    "packages/core-api/src/server-factory.ts": "1ae38d5108492be5a5312fbb609cb6674d23502accfcfad241aaf2368db2a6e9",
    "packages/core-api/src/services/tool-provider-bindings.ts": "156fac5752e904810a3e83c970e2b1e5ea294852b62fd9c1b646c8bc3f9ab98c",
  }) &&
  mcpCandidate?.implementationReviewPath === "plans/AU20/register-reviews/harness-registry-mcp-entry.md" &&
  mcpCandidate?.implementationReviewSha256 === "e4b7ff82bf0e67e1bbaa394bf3a0dc070d21b8b360bafee2079be500a7571eb7" &&
  mcpCandidate?.implementationReviewVerdict === "accept" &&
  mcpCandidate?.status === "accepted-commit-authorized" &&
  mcpCandidate?.commitAuthorization?.message === "AU20 F3: isolate harness MCP entry" &&
  JSON.stringify(mcpCandidate?.commitAuthorization?.paths) === JSON.stringify(expectedMcpCommitPaths) &&
  Object.entries(mcpCandidate.productSha256).every(([file, hash]) => {
    const committed = spawnSync("git", ["show", `e68a170757d71476ba147995247ac8be2d4a97e2:${file}`], { cwd: root, encoding: null, shell: false });
    return committed.status === 0 && sha256(committed.stdout) === hash;
  }) &&
  sha256(fs.readFileSync(path.join(root, mcpCandidate.implementationReviewPath))) === mcpCandidate.implementationReviewSha256;
const mcpCommit = mcpCandidate?.commitReceipt ?? null;
const mcpCommitInspection = mcpCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", mcpCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const mcpCommitPaths = mcpCommit
  ? spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", mcpCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const mcpCommitValid =
  mcpCandidateValid &&
  mcpCommit?.commit === "e68a170757d71476ba147995247ac8be2d4a97e2" &&
  mcpCommit?.tree === "877f217b6d2c8efe3889da39d500e90ad6d08912" &&
  mcpCommit?.parent === "0f7f6c1b1354eea71f9cc5c36098c413b62741d8" &&
  mcpCommit?.subject === "AU20 F3: isolate harness MCP entry" &&
  JSON.stringify(mcpCommit?.paths) === JSON.stringify(expectedMcpCommitPaths) &&
  JSON.stringify(mcpCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(mcpCommit?.verification ?? {}).every((result) => result === "pass") &&
  mcpCommitInspection?.status === 0 &&
  mcpCommitInspection.stdout.trim() === [mcpCommit.commit, mcpCommit.tree, mcpCommit.parent, mcpCommit.subject].join("\n") &&
  mcpCommitPaths?.status === 0 &&
  JSON.stringify(mcpCommitPaths.stdout.trim().split("\n")) === JSON.stringify(expectedMcpCommitPaths);
const notificationsWriteTests = progress.gateBindings?.notificationsSecretErrorsWriteTestsAuthorization ?? null;
const notificationsWriteTestsValid =
  mcpCommitValid &&
  notificationsWriteTests?.increment === "notifications-secret-errors" &&
  notificationsWriteTests?.stage === "write-tests-notifications-secret-errors" &&
  notificationsWriteTests?.finding === "F9" &&
  notificationsWriteTests?.testPath === "packages/core-api/notifications/src/__tests__/install.test.ts" &&
  notificationsWriteTests?.proofPath === ".pipeline/work/AU20/red-proofs/notifications-secret-errors.json" &&
  notificationsWriteTests?.protectedIntegrationSha256 === "cf48978c014fe1863ca096ef7c6522864a761457531b55c8f68c07862d7b21ab" &&
  notificationsWriteTests?.productSha256 === "0383969cc297053d157bb2d2b08277ae9e9fe8668c6b519e9973a18be04428ac" &&
  JSON.stringify(notificationsWriteTests?.authorizedPaths) === JSON.stringify([
    "packages/core-api/notifications/src/__tests__/install.test.ts",
    ".pipeline/work/AU20/red-proofs/notifications-secret-errors.json",
  ]) &&
  notificationsWriteTests?.productCodeAuthorized === false &&
  notificationsWriteTests?.newExportsAuthorized === false &&
  notificationsWriteTests?.serviceSurfaceGrowthAuthorized === false &&
  notificationsWriteTests?.status === "write-tests-authorized" &&
  sha256(fs.readFileSync(path.join(root, notificationsWriteTests.protectedIntegrationPath))) === notificationsWriteTests.protectedIntegrationSha256 &&
  (() => {
    const baseline = spawnSync("git", ["show", `e68a170757d71476ba147995247ac8be2d4a97e2:${notificationsWriteTests.productPath}`], { cwd: root, encoding: null, shell: false });
    return baseline.status === 0 && sha256(baseline.stdout) === notificationsWriteTests.productSha256;
  })() &&
  fs.existsSync(path.join(root, notificationsWriteTests.testPath)) &&
  fs.existsSync(path.join(root, notificationsWriteTests.proofPath));
const notificationsRedProof = progress.gateBindings?.notificationsSecretErrorsRedProof ?? null;
const notificationsRedProofValid =
  notificationsWriteTestsValid &&
  notificationsRedProof?.testSha256 === "42e6a99fbe7fa76fcd1004251d929bffe77b88738dfa9c14d5a8f7226dd92208" &&
  notificationsRedProof?.proofSha256 === "313e03ec67454bba1b271f9a6d6cefbc1ffc2523ed7b32310f2e0f7efe4cdfdf" &&
  notificationsRedProof?.reviewSha256 === "ce306e04f6678d02d3b38d2979cd8aed8aedbb36238bcdbdd5b8022ca0441fa6" &&
  notificationsRedProof?.verdict === "accept" &&
  notificationsRedProof?.status === "corrected-and-accepted" &&
  sha256(fs.readFileSync(path.join(root, notificationsRedProof.testPath))) === notificationsRedProof.testSha256 &&
  sha256(fs.readFileSync(path.join(root, notificationsRedProof.proofPath))) === notificationsRedProof.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, notificationsRedProof.reviewPath))) === notificationsRedProof.reviewSha256;
const notificationsWriteCode = progress.gateBindings?.notificationsSecretErrorsWriteCodeAuthorization ?? null;
const expectedNotificationsWriteCode = {
  increment: "notifications-secret-errors",
  stage: "write-code-notifications-secret-errors",
  finding: "F9",
  authorizedPaths: ["packages/core-api/notifications/src/install.ts"],
  frozenPaths: [
    "packages/core-api/notifications/src/__tests__/install.test.ts",
    ".pipeline/work/AU20/red-proofs/notifications-secret-errors.json",
    "plans/AU20/red-proof-reviews/notifications-secret-errors.md",
    "packages/core-api/src/__tests__/notifications/notifications-completeness.integration.test.ts",
    "scripts/surface-census.ts",
  ],
  requiredImplementation: {
    suppression: "catch only errors whose code is exactly MISSING_ROOT_SECRET",
    unexpectedFailure: "rethrow the original arbitrary cipher error; do not upsert or continue to config read",
    storeFailure: "credential-store upsert rejection propagates unchanged",
    success: "successful encryption upserts exactly once and returns redacted config",
  },
  newExportsAuthorized: false,
  serviceSurfaceGrowthAuthorized: false,
  otherProductionPathsAuthorized: false,
  testsAuthorized: false,
  implementationReviewRequiredBeforeCommit: true,
  nextIncrement: "filesystems-watcher-errors",
  status: "authorized",
};
const notificationsWriteCodeValid =
  notificationsRedProofValid &&
  JSON.stringify(notificationsWriteCode) === JSON.stringify(expectedNotificationsWriteCode);
const notificationsTitleCorrection = progress.gateBindings?.notificationsSecretErrorsTestNamingCorrection ?? null;
const notificationsTitleCorrectionValid =
  notificationsWriteCodeValid &&
  notificationsTitleCorrection?.stage === "write-tests-notifications-secret-errors-title-correction" &&
  JSON.stringify(notificationsTitleCorrection?.authorizedPaths) === JSON.stringify([
    "packages/core-api/notifications/src/__tests__/install.test.ts",
    ".pipeline/work/AU20/red-proofs/notifications-secret-errors.json",
  ]) &&
  notificationsTitleCorrection?.baselineTestSha256 === "caa81a3b9d622b6ee391a770ef698e312d8c697cefd17cdaaeb6ffe1eec4ad23" &&
  notificationsTitleCorrection?.baselineProofSha256 === "d323adc6d34eceef958dc5c9c4f4ca699d5225ee9851fe4c2b457ceadd2f1ed6" &&
  notificationsTitleCorrection?.frozenProductCandidateSha256 === "ab20be1c9551852bbaa4d03445ad056534e9b847c84be250557e8ac80c420b9a" &&
  notificationsTitleCorrection?.productCodeAuthorized === false &&
  notificationsTitleCorrection?.testBehaviorChangeAuthorized === false &&
  notificationsTitleCorrection?.lintBypassAuthorized === false &&
  notificationsTitleCorrection?.status === "write-tests-authorized" &&
  sha256(fs.readFileSync(path.join(root, "packages/core-api/notifications/src/__tests__/install.test.ts"))) === notificationsTitleCorrection.baselineTestSha256 &&
  sha256(fs.readFileSync(path.join(root, ".pipeline/work/AU20/red-proofs/notifications-secret-errors.json"))) === notificationsTitleCorrection.baselineProofSha256 &&
  sha256(fs.readFileSync(path.join(root, notificationsTitleCorrection.frozenProductPath))) === notificationsTitleCorrection.frozenProductCandidateSha256;
const notificationsCandidate = progress.gateBindings?.notificationsSecretErrorsCandidate ?? null;
const expectedNotificationsCommitPaths = [
  ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
  ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
  ".pipeline/work/AU20/progress.json",
  ".pipeline/work/AU20/red-proofs/notifications-secret-errors.json",
  "packages/core-api/notifications/src/__tests__/install.test.ts",
  "packages/core-api/notifications/src/install.ts",
  "plans/AU20/corrective-change-map.json",
  "plans/AU20/red-proof-reviews/notifications-secret-errors.md",
  "plans/AU20/register-reviews/notifications-secret-errors.md",
];
const notificationsCandidateValid =
  notificationsWriteCodeValid &&
  notificationsCandidate?.productSha256 === "ab20be1c9551852bbaa4d03445ad056534e9b847c84be250557e8ac80c420b9a" &&
  notificationsCandidate?.testSha256 === notificationsRedProof.testSha256 &&
  notificationsCandidate?.proofSha256 === notificationsRedProof.proofSha256 &&
  notificationsCandidate?.redReviewSha256 === notificationsRedProof.reviewSha256 &&
  notificationsCandidate?.implementationReviewSha256 === "63bd7c70705b7b36d1f55f9fc15af54e258a5d31f78d2fd21d5d9058ce7847e5" &&
  notificationsCandidate?.implementationReviewVerdict === "accept" &&
  notificationsCandidate?.status === "accepted-commit-authorized" &&
  notificationsCandidate?.commitAuthorization?.message === "AU20 F9: propagate notification secret errors" &&
  JSON.stringify(notificationsCandidate?.commitAuthorization?.paths) === JSON.stringify(expectedNotificationsCommitPaths) &&
  sha256(fs.readFileSync(path.join(root, notificationsCandidate.productPath))) === notificationsCandidate.productSha256 &&
  sha256(fs.readFileSync(path.join(root, notificationsCandidate.testPath))) === notificationsCandidate.testSha256 &&
  sha256(fs.readFileSync(path.join(root, notificationsCandidate.proofPath))) === notificationsCandidate.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, notificationsCandidate.redReviewPath))) === notificationsCandidate.redReviewSha256 &&
  sha256(fs.readFileSync(path.join(root, notificationsCandidate.implementationReviewPath))) === notificationsCandidate.implementationReviewSha256;
const notificationsCommit = notificationsCandidate?.commitReceipt ?? null;
const notificationsCommitInspection = notificationsCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", notificationsCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const notificationsCommitPaths = notificationsCommit
  ? spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", notificationsCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const notificationsCommitValid =
  notificationsCandidateValid &&
  notificationsCommit?.commit === "79056099c5852aab9658534b6a7fe2341260e2f0" &&
  notificationsCommit?.tree === "cfb9ad3034f35da9856bada6fe66db8efb638d73" &&
  notificationsCommit?.parent === "e68a170757d71476ba147995247ac8be2d4a97e2" &&
  notificationsCommit?.subject === "AU20 F9: propagate notification secret errors" &&
  JSON.stringify(notificationsCommit?.paths) === JSON.stringify(expectedNotificationsCommitPaths) &&
  JSON.stringify(notificationsCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(notificationsCommit?.verification ?? {}).every((result) => result === "pass") &&
  notificationsCommitInspection?.status === 0 &&
  notificationsCommitInspection.stdout.trim() === [notificationsCommit.commit, notificationsCommit.tree, notificationsCommit.parent, notificationsCommit.subject].join("\n") &&
  notificationsCommitPaths?.status === 0 &&
  JSON.stringify(notificationsCommitPaths.stdout.trim().split("\n")) === JSON.stringify(expectedNotificationsCommitPaths);
const watcherWriteTests = progress.gateBindings?.filesystemsWatcherErrorsWriteTestsAuthorization ?? null;
const watcherWriteTestsValid =
  notificationsCommitValid &&
  watcherWriteTests?.increment === "filesystems-watcher-errors" &&
  watcherWriteTests?.stage === "write-tests-filesystems-watcher-errors" &&
  watcherWriteTests?.finding === "F10" &&
  watcherWriteTests?.testBaselineSha256 === "8343312f95cd61823ca2ac4876af0fe051404759c19166cf607a14cd1d34e986" &&
  watcherWriteTests?.proofPath === ".pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json" &&
  JSON.stringify(watcherWriteTests?.authorizedPaths) === JSON.stringify([
    "packages/core-api/filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts",
    ".pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json",
  ]) &&
  watcherWriteTests?.productCodeAuthorized === false &&
  watcherWriteTests?.newExportsAuthorized === false &&
  watcherWriteTests?.serviceSurfaceGrowthAuthorized === false &&
  watcherWriteTests?.status === "write-tests-authorized" &&
  (() => {
    const baseline = spawnSync("git", ["show", `79056099c5852aab9658534b6a7fe2341260e2f0:${watcherWriteTests.testPath}`], { cwd: root, encoding: null, shell: false });
    return baseline.status === 0 && sha256(baseline.stdout) === watcherWriteTests.testBaselineSha256;
  })() &&
  Object.entries(watcherWriteTests.frozenProduct).every(([file, hash]) => {
    const baseline = spawnSync("git", ["show", `79056099c5852aab9658534b6a7fe2341260e2f0:${file}`], { cwd: root, encoding: null, shell: false });
    return baseline.status === 0 && sha256(baseline.stdout) === hash;
  }) &&
  fs.existsSync(path.join(root, watcherWriteTests.proofPath));
const watcherRedProof = progress.gateBindings?.filesystemsWatcherErrorsRedProof ?? null;
const watcherRedProofValid =
  watcherWriteTestsValid &&
  watcherRedProof?.testSha256 === "1654df58905d14917d97e709f6e7e136d4f512b0b722386e59f40c95b6f841ac" &&
  watcherRedProof?.proofSha256 === "b17c8bdbd28e79ad09dd9a5c950aa0bbf6137e37a963caa896b9d12849d4aed0" &&
  watcherRedProof?.reviewSha256 === "a871298edba1c30af90185b65429abc60044c81f9fd3104a608b0bf14be35fbb" &&
  watcherRedProof?.verdict === "accept" &&
  watcherRedProof?.status === "corrected-and-accepted" &&
  sha256(fs.readFileSync(path.join(root, watcherRedProof.testPath))) === watcherRedProof.testSha256 &&
  sha256(fs.readFileSync(path.join(root, watcherRedProof.proofPath))) === watcherRedProof.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, watcherRedProof.reviewPath))) === watcherRedProof.reviewSha256;
const watcherWriteCode = progress.gateBindings?.filesystemsWatcherErrorsWriteCodeAuthorization ?? null;
const expectedWatcherWriteCode = {
  increment: "filesystems-watcher-errors",
  stage: "write-code-filesystems-watcher-errors",
  finding: "F10",
  authorizedPaths: [
    "packages/core-api/filesystems/src/file-watcher.ts",
    "packages/agent-orchestration/run-orchestration/src/context.ts",
    "packages/core-api/src/server-factory.ts",
  ],
  frozenPaths: [
    "packages/core-api/filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts",
    ".pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json",
    "plans/AU20/red-proof-reviews/filesystems-watcher-errors.md",
    "scripts/surface-census.ts",
  ],
  requiredImplementation: {
    config: "existing FileWatcherConfig gains required onError(error: Error): void without adding an exported method or type",
    setupFailure: "close every already-open watcher then synchronously rethrow the original fs.watch setup error",
    runtimeFailure: "first error closes all watchers, cancels debounce, clears pending changes, calls onError exactly once, and silences later events",
    stop: "stop remains idempotent after normal operation or failure and emits no pending batch after runtime failure",
    orchestration: "forward onError through existing filesystem port/config; log sessionId and sandboxPath; stop ingestion exactly once",
  },
  newExportsAuthorized: false,
  serviceSurfaceGrowthAuthorized: false,
  otherProductionPathsAuthorized: false,
  testsAuthorized: false,
  implementationReviewRequiredBeforeCommit: true,
  nextIncrement: "ownership-prose-current",
  status: "authorized",
};
const watcherWriteCodeValid =
  watcherRedProofValid &&
  JSON.stringify(watcherWriteCode) === JSON.stringify(expectedWatcherWriteCode);
const watcherFixtureCorrection = progress.gateBindings?.filesystemsWatcherFixtureCorrection ?? null;
const watcherFixtureCorrectionValid =
  watcherWriteCodeValid &&
  watcherFixtureCorrection?.stage === "write-tests-filesystems-watcher-fixture-correction" &&
  JSON.stringify(watcherFixtureCorrection?.authorizedPaths) === JSON.stringify([
    "packages/core-api/filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts",
    ".pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json",
  ]) &&
  watcherFixtureCorrection?.baselineTestSha256 === "2a92d1e2a5698bf02ab1f35cc1edcb11e9d857da162f33179cf60f1fb8b9a582" &&
  watcherFixtureCorrection?.baselineProofSha256 === "6c06b2027f388f0b097651a25eb42c63a32cdbd8917b8bb169e4d2e1be3e62be" &&
  watcherFixtureCorrection?.productCodeAuthorized === false &&
  watcherFixtureCorrection?.testBehaviorChangeAuthorized === false &&
  watcherFixtureCorrection?.scopeExpansionAuthorized === false &&
  watcherFixtureCorrection?.lintBypassAuthorized === false &&
  watcherFixtureCorrection?.status === "write-tests-authorized" &&
  Object.entries(watcherFixtureCorrection.frozenProductCandidateBeforeCorrection ?? {}).every(([file, hash]) =>
    file === "packages/core-api/src/server-factory.ts" || sha256(fs.readFileSync(path.join(root, file))) === hash) &&
  sha256(fs.readFileSync(path.join(root, "packages/core-api/filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts"))) === watcherFixtureCorrection.baselineTestSha256 &&
  sha256(fs.readFileSync(path.join(root, ".pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json"))) === watcherFixtureCorrection.baselineProofSha256;
const watcherProofCorrection = progress.gateBindings?.filesystemsWatcherProofProvenanceCorrection ?? null;
const watcherProofCorrectionValid =
  watcherWriteTestsValid &&
  watcherProofCorrection?.stage === "write-tests-filesystems-watcher-proof-provenance-correction" &&
  JSON.stringify(watcherProofCorrection?.authorizedPaths) === JSON.stringify([
    ".pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json",
  ]) &&
  watcherProofCorrection?.frozenTestSha256 === "1654df58905d14917d97e709f6e7e136d4f512b0b722386e59f40c95b6f841ac" &&
  watcherProofCorrection?.baselineProofSha256 === "c280dee2a2110caebacd3e1e07efc0c790e7eb7713146b44e29446b58e63b81b" &&
  watcherProofCorrection?.requiredProofTruth?.productChangedDuringCorrection === true &&
  watcherProofCorrection?.requiredProofTruth?.changedPath === "packages/core-api/src/server-factory.ts" &&
  watcherProofCorrection?.productCodeAuthorized === false &&
  watcherProofCorrection?.testChangeAuthorized === false &&
  watcherProofCorrection?.scopeExpansionAuthorized === false &&
  watcherProofCorrection?.status === "proof-correction-authorized" &&
  sha256(fs.readFileSync(path.join(root, watcherProofCorrection.frozenTestPath))) === watcherProofCorrection.frozenTestSha256 &&
  sha256(fs.readFileSync(path.join(root, ".pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json"))) === watcherProofCorrection.baselineProofSha256 &&
  Object.entries(watcherProofCorrection.frozenFinalProductCandidate).every(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) === hash);
const watcherCandidate = progress.gateBindings?.filesystemsWatcherErrorsCandidate ?? null;
const watcherCandidateValid =
  watcherWriteCodeValid &&
  watcherCandidate?.increment === "filesystems-watcher-errors" &&
  watcherCandidate?.finding === "F10" &&
  JSON.stringify(watcherCandidate?.productSha256) === JSON.stringify({
    "packages/core-api/filesystems/src/file-watcher.ts": "0742250e1accab2d2ee5977cd9a3bcbcd3571385d9bc792d2ede9247965c9745",
    "packages/agent-orchestration/run-orchestration/src/context.ts": "f90c8db93beb4a0c0f5db7e64a77ba89ab061b59ba1ea785bfe49f64dd143899",
    "packages/core-api/src/server-factory.ts": "85c44c324ab10aa63027a220fe7a99a394deba59c35cc9226102f7d32896ab8b",
  }) &&
  watcherCandidate?.testSha256 === watcherRedProof.testSha256 &&
  watcherCandidate?.proofSha256 === watcherRedProof.proofSha256 &&
  watcherCandidate?.redReviewSha256 === watcherRedProof.reviewSha256 &&
  watcherCandidate?.implementationReviewSha256 === "29dacc858edee2d357bebde717f2985db5c197790af02a4e2faa5de7f439ff8f" &&
  watcherCandidate?.implementationReviewVerdict === "accept" &&
  watcherCandidate?.status === "accepted-commit-authorized" &&
  watcherCandidate?.commitAuthorization?.message === "AU20 F10: surface filesystem watcher failures" &&
  JSON.stringify(watcherCandidate?.commitAuthorization?.paths) === JSON.stringify([
    ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
    ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
    ".pipeline/work/AU20/progress.json",
    ".pipeline/work/AU20/red-proofs/filesystems-watcher-errors.json",
    "packages/agent-orchestration/run-orchestration/src/context.ts",
    "packages/core-api/filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts",
    "packages/core-api/filesystems/src/file-watcher.ts",
    "packages/core-api/src/server-factory.ts",
    "plans/AU20/corrective-change-map.json",
    "plans/AU20/red-proof-reviews/filesystems-watcher-errors.md",
    "plans/AU20/register-reviews/filesystems-watcher-errors.md",
  ]) &&
  Object.entries(watcherCandidate.productSha256).every(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) === hash) &&
  sha256(fs.readFileSync(path.join(root, watcherCandidate.testPath))) === watcherCandidate.testSha256 &&
  sha256(fs.readFileSync(path.join(root, watcherCandidate.proofPath))) === watcherCandidate.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, watcherCandidate.redReviewPath))) === watcherCandidate.redReviewSha256 &&
  sha256(fs.readFileSync(path.join(root, watcherCandidate.implementationReviewPath))) === watcherCandidate.implementationReviewSha256;
const watcherCommit = watcherCandidate?.commitReceipt ?? null;
const watcherCommitInspection = watcherCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", watcherCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const watcherCommitPaths = watcherCommit
  ? spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", watcherCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const watcherCommitValid =
  watcherCandidateValid &&
  watcherCommit?.commit === "90aab0a2ef02d6016cccc435208d1cf6e2cb4b92" &&
  watcherCommit?.tree === "3af7ba02edbad3e9d16a87355f13d8637b095dec" &&
  watcherCommit?.parent === "79056099c5852aab9658534b6a7fe2341260e2f0" &&
  watcherCommit?.subject === watcherCandidate.commitAuthorization.message &&
  JSON.stringify(watcherCommit?.paths) === JSON.stringify(watcherCandidate.commitAuthorization.paths) &&
  JSON.stringify(watcherCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(watcherCommit?.verification ?? {}).every((result) => result === "pass") &&
  watcherCommitInspection?.status === 0 &&
  watcherCommitInspection.stdout.trim() === [watcherCommit.commit, watcherCommit.tree, watcherCommit.parent, watcherCommit.subject].join("\n") &&
  watcherCommitPaths?.status === 0 &&
  JSON.stringify(watcherCommitPaths.stdout.trim().split("\n")) === JSON.stringify(watcherCommit.paths);
const ownershipRed = progress.gateBindings?.ownershipProseStaticRed ?? null;
const ownershipRedValid =
  watcherCommitValid &&
  ownershipRed?.increment === "ownership-prose-current" &&
  ownershipRed?.finding === "F8" &&
  ownershipRed?.validatorSha256 === "3682edd915912afc61fe6737ddaf81a2e7eeacf405ea527ab6cd1dff1923c330" &&
  ownershipRed?.reviewSha256 === "59922b401053f455e2be04d88bd92475221c4d10818c05e7e5aa234365401255" &&
  ownershipRed?.verdict === "accept" &&
  ownershipRed?.redExit === 1 &&
  JSON.stringify(ownershipRed?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  ownershipRed?.status === "accepted" &&
  sha256(fs.readFileSync(path.join(root, ownershipRed.validatorPath))) === ownershipRed.validatorSha256 &&
  sha256(fs.readFileSync(path.join(root, ownershipRed.reviewPath))) === ownershipRed.reviewSha256;
const ownershipWriteCode = progress.gateBindings?.ownershipProseWriteCodeAuthorization ?? null;
const ownershipWriteCodeValid =
  ownershipRedValid &&
  ownershipWriteCode?.increment === "ownership-prose-current" &&
  ownershipWriteCode?.stage === "write-code-ownership-prose-current" &&
  ownershipWriteCode?.finding === "F8" &&
  JSON.stringify(ownershipWriteCode?.authorizedPaths) === JSON.stringify([
    "packages/agent-orchestration/src/index.ts",
    "packages/core-api/src/services/durable-agent-queue.ts",
  ]) &&
  ownershipWriteCode?.productBehaviorAuthorized === false &&
  ownershipWriteCode?.exportsAuthorized === false &&
  ownershipWriteCode?.serviceSurfaceGrowthAuthorized === false &&
  ownershipWriteCode?.implementationReviewRequiredBeforeCommit === true &&
  ownershipWriteCode?.nextIncrement === "evidence-current-census" &&
  ownershipWriteCode?.status === "authorized";
const ownershipCandidate = progress.gateBindings?.ownershipProseCandidate ?? null;
const ownershipCandidateValid =
  ownershipWriteCodeValid &&
  JSON.stringify(ownershipCandidate?.productSha256) === JSON.stringify({
    "packages/agent-orchestration/src/index.ts": "b93edacbb7c65ce359bf6bc3ed915b9c54355da3734ef8a5c801892a5a816984",
    "packages/core-api/src/services/durable-agent-queue.ts": "c0c8410c1db31b6bfbe153dd73c6cefa71e2c0d15b486a52add7a128dd6a4884",
  }) &&
  ownershipCandidate?.validatorSha256 === ownershipRed.validatorSha256 &&
  ownershipCandidate?.redReviewSha256 === ownershipRed.reviewSha256 &&
  ownershipCandidate?.implementationReviewSha256 === "3e5c95b4b99f603c9d6f85d71a092ccac7c26b672d42241465b22f66deb4cb09" &&
  ownershipCandidate?.implementationReviewVerdict === "accept" &&
  ownershipCandidate?.status === "accepted-commit-authorized" &&
  ownershipCandidate?.commitAuthorization?.message === "AU20 F8: correct ownership prose" &&
  JSON.stringify(ownershipCandidate?.commitAuthorization?.paths) === JSON.stringify([
    ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
    ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
    ".pipeline/work/AU20/probes/validate-ownership-prose.mjs",
    ".pipeline/work/AU20/progress.json",
    "packages/agent-orchestration/src/index.ts",
    "packages/core-api/src/services/durable-agent-queue.ts",
    "plans/AU20/corrective-change-map.json",
    "plans/AU20/red-proof-reviews/ownership-prose-current.md",
    "plans/AU20/register-reviews/ownership-prose-current.md",
  ]) &&
  Object.entries(ownershipCandidate.productSha256).every(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) === hash) &&
  sha256(fs.readFileSync(path.join(root, ownershipCandidate.validatorPath))) === ownershipCandidate.validatorSha256 &&
  sha256(fs.readFileSync(path.join(root, ownershipCandidate.redReviewPath))) === ownershipCandidate.redReviewSha256 &&
  sha256(fs.readFileSync(path.join(root, ownershipCandidate.implementationReviewPath))) === ownershipCandidate.implementationReviewSha256;
const ownershipCommit = ownershipCandidate?.commitReceipt ?? null;
const ownershipCommitInspection = ownershipCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", ownershipCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const ownershipCommitPaths = ownershipCommit
  ? spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", ownershipCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const ownershipCommitValid =
  ownershipCandidateValid &&
  ownershipCommit?.commit === "4506a28c4dbd1bc581a85dbba86552c43b63fad3" &&
  ownershipCommit?.tree === "fd95c25beb2036700062bb0c773b8446349b7548" &&
  ownershipCommit?.parent === "90aab0a2ef02d6016cccc435208d1cf6e2cb4b92" &&
  ownershipCommit?.subject === ownershipCandidate.commitAuthorization.message &&
  JSON.stringify(ownershipCommit?.paths) === JSON.stringify(ownershipCandidate.commitAuthorization.paths) &&
  JSON.stringify(ownershipCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(ownershipCommit?.verification ?? {}).every((result) => result === "pass") &&
  ownershipCommitInspection?.status === 0 &&
  ownershipCommitInspection.stdout.trim() === [ownershipCommit.commit, ownershipCommit.tree, ownershipCommit.parent, ownershipCommit.subject].join("\n") &&
  ownershipCommitPaths?.status === 0 &&
  JSON.stringify(ownershipCommitPaths.stdout.trim().split("\n")) === JSON.stringify(ownershipCommit.paths);
const censusRed = progress.gateBindings?.currentCensusEvidenceStaticRed ?? null;
const censusRedValid =
  ownershipCommitValid &&
  censusRed?.validatorSha256 === "d04163f248be09bef650b0b5c5c783063f0475b3f9b7d4ec57ac18cdfa117c95" &&
  censusRed?.censusScriptSha256 === "df74ee90cce2bf075f2fd32199e6c86780871c2530c6baa981a4cc8498d0cc9b" &&
  censusRed?.reviewSha256 === "f65363266afd88510482eae976eae5f2390e0998957c1a25f628c1a59c6999d1" &&
  censusRed?.verdict === "accept" &&
  censusRed?.redExit === 1 &&
  censusRed?.status === "accepted" &&
  sha256(fs.readFileSync(path.join(root, censusRed.validatorPath))) === censusRed.validatorSha256 &&
  sha256(fs.readFileSync(path.join(root, censusRed.censusScriptPath))) === censusRed.censusScriptSha256 &&
  sha256(fs.readFileSync(path.join(root, censusRed.reviewPath))) === censusRed.reviewSha256;
const censusWriteCode = progress.gateBindings?.currentCensusEvidenceWriteCodeAuthorization ?? null;
const censusWriteCodeValid =
  censusRedValid &&
  censusWriteCode?.stage === "write-code-evidence-current-census" &&
  JSON.stringify(censusWriteCode?.findings) === JSON.stringify(["F7", "F12"]) &&
  censusWriteCode?.authorizedCommand === "node .pipeline/work/AU20/probes/validate-current-census-evidence.mjs --write" &&
  JSON.stringify(censusWriteCode?.authorizedPaths) === JSON.stringify([
    ".pipeline/work/AU20/rearch/census-after.json",
    "plans/AU20/surface-census.md",
  ]) &&
  censusWriteCode?.productCodeAuthorized === false &&
  censusWriteCode?.censusToolChangeAuthorized === false &&
  censusWriteCode?.surfaceGrowthAuthorized === false &&
  censusWriteCode?.deterministicSecondRunRequired === true &&
  censusWriteCode?.implementationReviewRequiredBeforeCommit === true &&
  censusWriteCode?.status === "authorized";
const censusCandidate = progress.gateBindings?.currentCensusEvidenceCandidate ?? null;
const censusCandidateValid =
  censusWriteCodeValid &&
  JSON.stringify(censusCandidate?.evidenceSha256) === JSON.stringify({
    ".pipeline/work/AU20/rearch/census-after.json": "7ee19367efba17a2b92482444a50f5e5864641acfad3f20d4d8e8db3c7bbacd8",
    "plans/AU20/surface-census.md": "68c80a96fc3f6282c117a604790dc0f080b67569bb6b9131cd31b12f1217894a",
  }) &&
  censusCandidate?.validatorSha256 === censusRed.validatorSha256 &&
  censusCandidate?.redReviewSha256 === censusRed.reviewSha256 &&
  censusCandidate?.implementationReviewSha256 === "86aaf1da1a15c9d615bdf66f11851b9ea06848625df637115779851a03a20acc" &&
  censusCandidate?.implementationReviewVerdict === "accept" &&
  censusCandidate?.status === "accepted-commit-authorized" &&
  censusCandidate?.commitAuthorization?.message === "AU20 F7 F12: regenerate current census evidence" &&
  JSON.stringify(censusCandidate?.commitAuthorization?.paths) === JSON.stringify([
    ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
    ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
    ".pipeline/work/AU20/probes/validate-current-census-evidence.mjs",
    ".pipeline/work/AU20/progress.json",
    ".pipeline/work/AU20/rearch/census-after.json",
    "plans/AU20/corrective-change-map.json",
    "plans/AU20/red-proof-reviews/evidence-current-census.md",
    "plans/AU20/register-reviews/evidence-current-census.md",
    "plans/AU20/surface-census.md",
  ]) &&
  Object.entries(censusCandidate.evidenceSha256).every(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) === hash) &&
  sha256(fs.readFileSync(path.join(root, censusCandidate.implementationReviewPath))) === censusCandidate.implementationReviewSha256;
const censusCommit = censusCandidate?.commitReceipt ?? null;
const censusCommitInspection = censusCommit
  ? spawnSync("git", ["show", "-s", "--format=%H%n%T%n%P%n%s", censusCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const censusCommitPaths = censusCommit
  ? spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", censusCommit.commit], { cwd: root, encoding: "utf8", shell: false })
  : null;
const censusCommitValid =
  censusCandidateValid &&
  censusCommit?.commit === "b69b822ca111677ed7e600076c0d9347c2916242" &&
  censusCommit?.tree === "03c4fa25929b9a4893ca5690ba9d772e5955733c" &&
  censusCommit?.parent === "4506a28c4dbd1bc581a85dbba86552c43b63fad3" &&
  censusCommit?.subject === censusCandidate.commitAuthorization.message &&
  JSON.stringify(censusCommit?.paths) === JSON.stringify(censusCandidate.commitAuthorization.paths) &&
  JSON.stringify(censusCommit?.census) === JSON.stringify({ services: 23, methods: 231, types: 181, total: 412 }) &&
  Object.values(censusCommit?.verification ?? {}).every((result) => result === "pass") &&
  censusCommitInspection?.status === 0 &&
  censusCommitInspection.stdout.trim() === [censusCommit.commit, censusCommit.tree, censusCommit.parent, censusCommit.subject].join("\n") &&
  censusCommitPaths?.status === 0 &&
  JSON.stringify(censusCommitPaths.stdout.trim().split("\n")) === JSON.stringify(censusCommit.paths);
const knowledgeKnipRed = progress.gateBindings?.knowledgeKnipDeadSurfaceRedProof ?? null;
const knowledgeKnipRedValid =
  censusCommitValid &&
  knowledgeKnipRed?.proofSha256 === "4a940ba2ffe97e9696b64238c23539d4afc41a3e78af2bb206bc126d4a9a8e82" &&
  knowledgeKnipRed?.reviewSha256 === "d2488e914e44c306887b7941712d7f808a5ab72d9cfaca3bd1a5c2c9641d9b3e" &&
  knowledgeKnipRed?.verdict === "accept" &&
  knowledgeKnipRed?.status === "accepted" &&
  sha256(fs.readFileSync(path.join(root, knowledgeKnipRed.proofPath))) === knowledgeKnipRed.proofSha256 &&
  sha256(fs.readFileSync(path.join(root, knowledgeKnipRed.reviewPath))) === knowledgeKnipRed.reviewSha256;
const knowledgeKnipWriteCode = progress.gateBindings?.knowledgeKnipDeadSurfaceWriteCodeAuthorization ?? null;
const knowledgeKnipWriteCodeValid =
  knowledgeKnipRedValid &&
  knowledgeKnipWriteCode?.stage === "write-code-knowledge-knip-dead-surface" &&
  knowledgeKnipWriteCode?.service === "knowledge" &&
  JSON.stringify(knowledgeKnipWriteCode?.authorizedPaths) === JSON.stringify([
    "packages/core-api/knowledge/src/knowledge-reader.ts",
    "packages/core-api/knowledge/src/types.ts",
  ]) &&
  knowledgeKnipWriteCode?.productBehaviorAuthorized === false &&
  knowledgeKnipWriteCode?.newExportsAuthorized === false &&
  knowledgeKnipWriteCode?.surfaceGrowthAuthorized === false &&
  knowledgeKnipWriteCode?.implementationReviewRequiredBeforeCommit === true &&
  knowledgeKnipWriteCode?.status === "authorized";
const knowledgeKnipCandidate = progress.gateBindings?.knowledgeKnipDeadSurfaceCandidate ?? null;
const knowledgeKnipCandidateValid =
  knowledgeKnipWriteCodeValid &&
  JSON.stringify(knowledgeKnipCandidate?.productSha256) === JSON.stringify({
    "packages/core-api/knowledge/src/knowledge-reader.ts": "deleted",
    "packages/core-api/knowledge/src/types.ts": "9798ebe305fa4d1e0e143df5a851812c212c3821e39a91634cce72511d177608",
  }) &&
  knowledgeKnipCandidate?.proofSha256 === knowledgeKnipRed.proofSha256 &&
  knowledgeKnipCandidate?.redReviewSha256 === knowledgeKnipRed.reviewSha256 &&
  knowledgeKnipCandidate?.implementationReviewSha256 === "1e5fc604893ee222d9c71f5cb9c120ae2f621709616828b039864a0d059e5162" &&
  knowledgeKnipCandidate?.implementationReviewVerdict === "accept" &&
  knowledgeKnipCandidate?.status === "accepted-commit-authorized" &&
  knowledgeKnipCandidate?.commitAuthorization?.message === "AU20 knowledge: delete Knip dead surface" &&
  JSON.stringify(knowledgeKnipCandidate?.commitAuthorization?.paths) === JSON.stringify([
    ".pipeline/work/AU20/probes/generate-corrective-change-map.mjs",
    ".pipeline/work/AU20/probes/validate-corrective-change-map.mjs",
    ".pipeline/work/AU20/progress.json",
    ".pipeline/work/AU20/red-proofs/knowledge-knip-dead-surface.json",
    "packages/core-api/knowledge/src/knowledge-reader.ts",
    "packages/core-api/knowledge/src/types.ts",
    "plans/AU20/corrective-change-map.json",
    "plans/AU20/red-proof-reviews/knowledge-knip-dead-surface.md",
    "plans/AU20/register-reviews/knowledge-knip-dead-surface.md",
  ]) &&
  !fs.existsSync(path.join(root, "packages/core-api/knowledge/src/knowledge-reader.ts")) &&
  sha256(fs.readFileSync(path.join(root, "packages/core-api/knowledge/src/types.ts"))) === knowledgeKnipCandidate.productSha256["packages/core-api/knowledge/src/types.ts"] &&
  sha256(fs.readFileSync(path.join(root, knowledgeKnipCandidate.implementationReviewPath))) === knowledgeKnipCandidate.implementationReviewSha256;
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
    ...(retroCommitValid ? [{
      name: "knowledge-retro-snapshot",
      finding: "F4",
      writeTestsAuthorization: retroWriteTestsAuthorization,
      redProofReview: retroRedProof,
      writeCodeAuthorization: retroWriteCodeAuthorization,
      candidate: retroCandidate,
      commitReceipt: retroCommit,
      status: "completed-history",
    }] : []),
    ...(mcpCommitValid ? [{
      name: "harness-registry-mcp-entry",
      finding: "F3",
      amendedRedProofReview: mcpAmendedRed,
      candidate: mcpCandidate,
      commitReceipt: mcpCommit,
      externalReleaseBlocker: mcpCandidate.externalReleaseBlocker,
      status: "completed-history",
    }] : []),
    ...(notificationsCommitValid ? [{
      name: "notifications-secret-errors",
      finding: "F9",
      redProofReview: notificationsRedProof,
      candidate: notificationsCandidate,
      commitReceipt: notificationsCommit,
      status: "completed-history",
    }] : []),
    ...(watcherCommitValid ? [{
      name: "filesystems-watcher-errors",
      finding: "F10",
      redProofReview: watcherRedProof,
      candidate: watcherCandidate,
      commitReceipt: watcherCommit,
      status: "completed-history",
    }] : []),
    ...(ownershipCommitValid ? [{
      name: "ownership-prose-current",
      finding: "F8",
      staticRedProof: ownershipRed,
      candidate: ownershipCandidate,
      commitReceipt: ownershipCommit,
      status: "completed-history",
    }] : []),
    ...(censusCommitValid ? [{
      name: "evidence-current-census",
      findings: ["F7", "F12"],
      staticRedProof: censusRed,
      candidate: censusCandidate,
      commitReceipt: censusCommit,
      status: "completed-history",
    }] : []),
  ],
  activeIncrement: {
    name: "knowledge-knip-dead-surface",
    service: "knowledge",
    staticRedProof: knowledgeKnipRedValid ? knowledgeKnipRed : null,
    candidate: knowledgeKnipCandidateValid ? knowledgeKnipCandidate : null,
    authorizedStage: knowledgeKnipCandidateValid && progress.currentStep === "commit-knowledge-knip-dead-surface"
      ? "commit-knowledge-knip-dead-surface"
      : null,
    authorization: knowledgeKnipCandidateValid
      ? knowledgeKnipCandidate.commitAuthorization
      : null,
    productCodeAuthorized: false,
  },
  censusCeiling: { services: 23, methods: 231, types: 181 },
  nextIncrement: "knowledge-knip-dead-surface",
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
    commitLocked: !knowledgeKnipCandidateValid,
  },
};
fs.writeFileSync(path.join(root, "plans/AU20/corrective-change-map.json"), `${JSON.stringify(output, null, 2)}\n`);

const rows = Object.entries(summary.changeKinds).map(([k,v]) => `| ${k} | ${v} |`).join("\n");
const dispositions = Object.entries(summary.targetDispositions).map(([k,v]) => `| ${k} | ${v} |`).join("\n");
const md = `# AU20 corrective change map\n\nMachine source: \`plans/AU20/corrective-change-map.json\`.\n\n## Coverage\n\n- Identities: **${summary.total}/604** (${summary.browser} browser + ${summary.system} system)\n- Unresolved target dispositions: **${summary.unresolvedRemaining}**\n- Fresh-review obligations: **${summary.reviewFindings.critical}/5 critical + ${summary.reviewFindings.warning}/4 warning**\n- Harness-defect targets: **${summary.harnessDefects}**. Historical harness health is trusted; none is assigned without direct AU20-local evidence.\n- Classification review: **${reviewBindingValid ? "accepted and payload-hash bound" : "pending"}**.\n- Proof-inventory architecture amendment R3: **${r3CallerMigrationRequired ? "caller-migration write-tests required; prior R3 red proof superseded; code locked" : redProofReviewValid ? "red proof accepted; amendment write-code unlocked only for this increment" : amendmentReviewValid ? "accepted; amendment write-tests unlocked, code locked" : "independent re-review required; write-tests/code locked"}**. Scope: one captured verifier, pinned manifest with mandatory builder identity, descriptor-stable reads, physical legacy authority deletion, strict attempts.\n\n## Target dispositions\n\n| Disposition | Count |\n|---|---:|\n${dispositions}\n\n## Change locations\n\n| Change kind | Count |\n|---|---:|\n${rows}\n\n## Decision rules\n\nEvery entry records root register/problem, exact test and candidate production surfaces, required red proof, owner/layer, test versus production action, and ordered dependencies. Existing reviewed discovery/design decisions are carried forward. Formerly unresolved identities change state only through a hash-bound diagnostic record with direct terminal/imported-runtime/source evidence and an exact first boundary; the generator has no ambiguity default. Repository-owned skips, seeds, mocks, and fixtures are stale-test corrections, never external prerequisites. Only a named unavailable credential, binary, or external service can be a prerequisite. Independent review may revise any target; changed content invalidates the gate hash.\n`;
fs.writeFileSync(path.join(root, "plans/AU20/corrective-change-map.md"), md);
