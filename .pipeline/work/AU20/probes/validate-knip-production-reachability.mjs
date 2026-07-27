#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const failures = [];
const sha256 = value => createHash("sha256").update(value).digest("hex");

const protectedGraph = {
  "packages/agent-execution/harness-registry/src/__tests__/cli-adapter-fixtures.ts": {
    sha256: "16806a487cb17818bb877a3b213a310c1062752d0895c0b2d915dc11ba08c78d",
    importers: {
      "packages/agent-execution/harness-registry/src/__tests__/AL6-cli-reengage-adapter.test.ts":
        "19bc10e81da7bd8e6458ded6b087fce38ab07db54f17dac0e6960e8d27d2323d",
      "packages/agent-execution/harness-registry/src/__tests__/AL6-return-gate.test.ts":
        "c9b6bc9fd40674d78780ca914f26c39d15211e8765e0cafadf1d31604c877eed",
      "packages/agent-execution/harness-registry/src/__tests__/X5-session-config-mcp.test.ts":
        "61f9e1bd8dc1b702094708a3c7b6d2aab19675d911a167f8380b78f2f43ceb39",
      "packages/agent-execution/harness-registry/src/__tests__/claude-cli-adapter.test.ts":
        "aa8de840b62917566c3a063896ccfc67d3676ab0e8358a2c8d2c93d216866fe8",
      "packages/agent-execution/harness-registry/src/__tests__/cli-adapter-real-binary.integration.test.ts":
        "95aa5d99501e43529e29eeeca223692e445a50e68b5ce65cd32e88eb280f57c9",
      "packages/agent-execution/harness-registry/src/__tests__/harness-test-models.test.ts":
        "f7a7dd824d2332d8f97c10430bb965dd31016ad00ee175ae4dfb654da0aa658a"
    }
  },
  "packages/core-api/src/__tests__/dispatch-test-helpers.ts": {
    sha256: "789910cdc6f0ab3271da0d55e09543e314047b9e776c65b0bc2b7bb37d7d5f76",
    importers: {
      "packages/core-api/src/__tests__/AF17-team-routines.integration.test.ts":
        "e7370534a616d1088d0bf5c3d3546464c39afaf7aca075f4ae2ef9de597f2544",
      "packages/core-api/src/__tests__/af9-attention-population.integration.test.ts":
        "0adf52d6432e2973a3e28232ec0f9aacdabe1487c86364585889f19376a3ee8b",
      "packages/core-api/src/__tests__/af9-promotion-routine.integration.test.ts":
        "7c1b8e1047673e1fb331ba134419eeb55d6ed0a912a5141ce4a131881f4caa9a",
      "packages/core-api/src/__tests__/agent-work-intent-production.integration.test.ts":
        "967dcd2b1f7f7d4aab048b571999c4688ac5f4d1dc5c384398cc9f5bd81509cb",
      "packages/core-api/src/__tests__/builtin-routines.integration.test.ts":
        "01648004d19c5689dcbab478a4d5cde62a879e9f882a1829023fbe1d843275d4",
      "packages/core-api/src/routes/__tests__/routines.routes.integration.test.ts":
        "850a316d5fb568d91b3dc0a80245630b1bf1dae47bd2924df766deb3212b431e",
      "packages/core-api/src/services/__tests__/routine-scheduler.au15.integration.test.ts":
        "09feee2ebf2f350d402825ca43c19ba73e20e5eb09c37cdc708a50b5cf3b529b"
    }
  },
  "packages/core-api/src/__tests__/run-orchestration-test-runtime.ts": {
    sha256: "426a4ccb6a3e9d022b868b747e94c163637f7721bd74355bff9e1022ab70d9c3",
    importers: {
      "packages/core-api/src/__tests__/agent-layer-boot-recovery.integration.test.ts":
        "feb2520dc399310a89a4f69e7a156713e93db1224fbe2aae82ae89832ac27493",
      "packages/core-api/src/__tests__/agent-lifecycle-projection.integration.test.ts":
        "1cf678236a281b54e825a525f9b3b4c28d08b9ae3b4b6e1dcac721963f82206c",
      "packages/core-api/src/__tests__/agent-request-custody.integration.test.ts":
        "79fa80820acc8280a60c38c5f6c6fc0724f36ae2071bad727ece6161e5f0898d",
      "packages/core-api/src/__tests__/explicit-session-start.production.integration.test.ts":
        "00d995e78946b27b741b969cf94496dc44addceecf217940a60c4dc03cc850a7"
    }
  },
  "packages/core-api/src/routes/__tests__/worker-runtime-test-helper.ts": {
    sha256: "9b5c1e7832fda4630312c6bb912ca5e7666fef4e26bcf3fed42f5f907e01d076",
    importers: {
      "packages/core-api/src/routes/__tests__/AF11-authz.integration.test.ts":
        "6b98a04bffcffaea6d73e686a7ee85f09cdb5b6760a7936a31dd88c381e94929",
      "packages/core-api/src/routes/__tests__/worker-ws-s4.test.ts":
        "27359bc930282fd301cf22c067ef05e35f4c4d00db4c1e093764c41fe084417b",
      "packages/core-api/src/routes/__tests__/worker-ws.test.ts":
        "d88ca8f2cde6ff008e15176d8b678b1496a2c056bfdf24f553558a1a7ce17167"
    }
  }
};

const sourceExtensions = /\.(?:[cm]?[jt]sx?)$/;
const walk = directory =>
  readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : sourceExtensions.test(path) ? [path] : [];
  });
const sourceFiles = walk(resolve(root, "packages"));
const moduleSpecifiers = text => {
  const values = [];
  const expression = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)["']([^"']+)["']/g;
  for (const match of text.matchAll(expression)) values.push(match[1]);
  return values;
};
const normalizeResolved = path =>
  path.replaceAll("\\", "/").replace(/\.(?:mjs|cjs|js)$/, ".ts").replace(/\/index$/, "/index.ts");

for (const [helper, contract] of Object.entries(protectedGraph)) {
  const helperPath = resolve(root, helper);
  if (sha256(readFileSync(helperPath)) !== contract.sha256) failures.push(`${helper}: helper hash mismatch`);
  const actualImporters = [];
  for (const sourceFile of sourceFiles) {
    const importsHelper = moduleSpecifiers(readFileSync(sourceFile, "utf8")).some(specifier => {
      if (!specifier.startsWith(".")) return false;
      return normalizeResolved(resolve(dirname(sourceFile), specifier)) === helperPath.replaceAll("\\", "/");
    });
    if (importsHelper) actualImporters.push(relative(root, sourceFile).replaceAll("\\", "/"));
  }
  const expectedImporters = Object.keys(contract.importers).sort();
  if (JSON.stringify(actualImporters.sort()) !== JSON.stringify(expectedImporters)) {
    failures.push(`${helper}: importer set mismatch expected=${expectedImporters.length} actual=${actualImporters.length}`);
  }
  for (const [importer, expectedHash] of Object.entries(contract.importers)) {
    if (sha256(readFileSync(resolve(root, importer))) !== expectedHash) failures.push(`${importer}: importer hash mismatch`);
  }
}

const desiredCommand =
  "npx knip --include files && npx knip --production --include files,dependencies,unlisted,binaries --preprocessor ./scripts/knip-production-test-files.mjs";
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (packageJson.scripts?.["knip:production"] !== desiredCommand) {
  failures.push(`package script mismatch: ${packageJson.scripts?.["knip:production"] ?? "<missing>"}`);
}

const fixtureFiles = {
  "packages/shared/src/__tests__/au20-knip-reachability-dead-helper.ts":
    "export const au20DeadHelper = true;\n",
  "packages/shared/src/__tests__/au20-knip-reachability-live-helper.ts":
    "export const au20LiveHelper = true;\n",
  "packages/shared/src/__tests__/au20-knip-reachability.test.ts": [
    'import { describe, expect, it } from "vitest";',
    'import { au20LiveHelper } from "./au20-knip-reachability-live-helper.js";',
    'import { au20ProductionOnlyTested } from "../au20-knip-production-only-tested.js";',
    'describe("AU20 Knip reachability fixture", () => {',
    '  it("uses the live helper and production source", () => {',
    "    expect(au20LiveHelper && au20ProductionOnlyTested).toBe(true);",
    "  });",
    "});",
    ""
  ].join("\n"),
  "packages/shared/src/au20-knip-production-only-tested.ts":
    "export const au20ProductionOnlyTested = true;\n"
};
const referencePreprocessor = [
  "const isTestOwned = path => `/${path.replaceAll('\\\\\\\\', '/')}`.includes('/__tests__/');",
  "export default options => {",
  "  let removed = 0;",
  "  const files = Object.fromEntries(Object.entries(options.issues.files).map(([workspace, issues]) => [",
  "    workspace,",
  "    Object.fromEntries(Object.entries(issues).filter(([path, issue]) => {",
  "      const keep = !isTestOwned(issue.filePath ?? path);",
  "      if (!keep) removed += 1;",
  "      return keep;",
  "    }))",
  "  ]));",
  "  return {",
  "    ...options,",
  "    issues: { ...options.issues, files },",
  "    counters: { ...options.counters, files: options.counters.files - removed }",
  "  };",
  "};",
  ""
].join("\n");
const fixtureContractHash = sha256(
  JSON.stringify({
    files: Object.fromEntries(Object.entries(fixtureFiles).sort(([a], [b]) => a.localeCompare(b))),
    referencePreprocessor
  })
);

const fixtureParent = mkdtempSync(resolve(tmpdir(), "au20-knip-reachability-"));
let fixtureOutputHash = "";
try {
  for (const [path, content] of Object.entries(fixtureFiles)) {
    const absolute = resolve(root, path);
    if (existsSync(absolute)) throw new Error(`fixture path already exists: ${path}`);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, { flag: "wx" });
  }
  const referencePreprocessorPath = resolve(fixtureParent, "reference-preprocessor.mjs");
  writeFileSync(referencePreprocessorPath, referencePreprocessor);
  const mutationBoundaryInput = () => ({
    report: {
      files: true,
      dependencies: true,
      devDependencies: false,
      optionalPeerDependencies: false,
      unlisted: true,
      binaries: true,
      unresolved: false,
      exports: false,
      types: false,
      nsExports: false,
      nsTypes: false,
      duplicates: false,
      enumMembers: false,
      namespaceMembers: false,
      catalog: false
    },
    issues: {
      files: {
        fixture: {
          "/fixture/src/__tests__/live-helper.ts": {
            type: "files",
            filePath: "/fixture/src/__tests__/live-helper.ts",
            workspace: "fixture",
            symbol: "live-helper",
            fixes: []
          },
          "/fixture/src/production-only-tested.ts": {
            type: "files",
            filePath: "/fixture/src/production-only-tested.ts",
            workspace: "fixture",
            symbol: "production-only-tested",
            fixes: []
          }
        }
      },
      dependencies: {
        fixture: {
          dependency: {
            type: "dependencies",
            filePath: "/fixture/package.json",
            workspace: "fixture",
            symbol: "sentinel-dependency",
            fixes: []
          }
        }
      },
      devDependencies: {},
      optionalPeerDependencies: {},
      unlisted: {
        fixture: {
          unlisted: {
            type: "unlisted",
            filePath: "/fixture/src/index.ts",
            workspace: "fixture",
            symbol: "sentinel-unlisted",
            fixes: []
          }
        }
      },
      binaries: {
        fixture: {
          binary: {
            type: "binaries",
            filePath: "/fixture/package.json",
            workspace: "fixture",
            symbol: "sentinel-binary",
            fixes: []
          }
        }
      },
      unresolved: {},
      exports: {},
      types: {},
      nsExports: {},
      nsTypes: {},
      duplicates: {},
      enumMembers: {},
      namespaceMembers: {},
      catalog: {}
    },
    counters: {
      files: 2,
      dependencies: 1,
      devDependencies: 0,
      optionalPeerDependencies: 0,
      unlisted: 1,
      binaries: 1,
      unresolved: 0,
      exports: 0,
      types: 0,
      nsExports: 0,
      nsTypes: 0,
      duplicates: 0,
      enumMembers: 0,
      namespaceMembers: 0,
      catalog: 0,
      processed: 5,
      total: 5
    },
    tagHints: new Set([{ type: "tag", filePath: "/fixture/src/index.ts", identifier: "x", tagName: "sentinel" }]),
    configurationHints: [{ type: "ignore", identifier: "sentinel-config-hint" }],
    enabledPlugins: { sentinel: ["plugin"] },
    isDisableConfigHints: false,
    isDisableTagHints: false,
    isTreatConfigHintsAsErrors: false,
    isTreatTagHintsAsErrors: false,
    cwd: "/fixture",
    isProduction: true,
    isShowProgress: false,
    options: "sentinel-reporter-options",
    preprocessorOptions: "sentinel-preprocessor-options",
    includedWorkspaceDirs: ["/fixture"],
    selectedWorkspaces: ["fixture"],
    configFilePath: "/fixture/knip.json",
    maxShowIssues: 17,
    marker: { nested: ["must", "remain", "unchanged"] }
  });
  const withoutAllowedMutation = value => {
    const copy = structuredClone(value);
    delete copy.issues.files;
    delete copy.counters.files;
    return copy;
  };
  const verifyMutationBoundary = async (modulePath, label) => {
    const { default: preprocess } = await import(
      `${pathToFileURL(modulePath).href}?au20-boundary=${Date.now()}-${label}`
    );
    if (typeof preprocess !== "function") {
      failures.push(`${label} preprocessor has no default function`);
      return false;
    }
    const input = mutationBoundaryInput();
    const before = structuredClone(input);
    const output = await preprocess(input);
    const remaining = Object.keys(output.issues.files.fixture ?? {}).sort();
    if (
      JSON.stringify(remaining) !== JSON.stringify(["/fixture/src/production-only-tested.ts"]) ||
      output.counters.files !== 1
    ) {
      failures.push(`${label} preprocessor file transformation mismatch`);
      return false;
    }
    if (!isDeepStrictEqual(withoutAllowedMutation(output), withoutAllowedMutation(before))) {
      failures.push(`${label} preprocessor changed data outside issues.files/counters.files`);
      return false;
    }
    return true;
  };
  const referenceBoundaryPass = await verifyMutationBoundary(referencePreprocessorPath, "reference");
  const runKnip = preprocessor => {
    const result = spawnSync(
      "npx",
      [
        "knip",
        ...(preprocessor ? ["--production"] : []),
        "--include",
        "files",
        ...(preprocessor ? ["--preprocessor", preprocessor] : []),
        "--reporter",
        "json",
        "--no-config-hints"
      ],
      { cwd: root, encoding: "utf8", env: process.env }
    );
    let parsed = { issues: [] };
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      failures.push(`Knip output was not JSON: ${result.stderr.trim()}`);
    }
    return {
      exitCode: result.status,
      files: parsed.issues.flatMap(issue => issue.files ?? []).map(item => item.name).sort()
    };
  };
  const ordinary = runKnip(null);
  const productionBefore = spawnSync(
    "npx",
    [
      "knip",
      "--production",
      "--include",
      "files",
      "--reporter",
      "json",
      "--no-config-hints"
    ],
    { cwd: root, encoding: "utf8", env: process.env }
  );
  const beforeParsed = JSON.parse(productionBefore.stdout);
  const before = {
    exitCode: productionBefore.status,
    files: beforeParsed.issues.flatMap(issue => issue.files ?? []).map(item => item.name).sort()
  };
  const referenceAfter = runKnip(referencePreprocessorPath);
  const expectedOrdinary = [
    "packages/shared/src/__tests__/au20-knip-reachability-dead-helper.ts"
  ];
  const expectedBefore = [
    "packages/agent-execution/harness-registry/src/__tests__/cli-adapter-fixtures.ts",
    "packages/core-api/src/__tests__/dispatch-test-helpers.ts",
    "packages/core-api/src/__tests__/run-orchestration-test-runtime.ts",
    "packages/core-api/src/routes/__tests__/worker-runtime-test-helper.ts",
    "packages/shared/src/__tests__/au20-knip-reachability-dead-helper.ts",
    "packages/shared/src/__tests__/au20-knip-reachability-live-helper.ts",
    "packages/shared/src/au20-knip-production-only-tested.ts"
  ];
  const expectedAfter = ["packages/shared/src/au20-knip-production-only-tested.ts"];
  if (ordinary.exitCode !== 1 || JSON.stringify(ordinary.files) !== JSON.stringify(expectedOrdinary)) {
    failures.push(`ordinary fixture mismatch: ${JSON.stringify(ordinary)}`);
  }
  if (before.exitCode !== 1 || JSON.stringify(before.files) !== JSON.stringify(expectedBefore)) {
    failures.push(`production-before fixture mismatch: ${JSON.stringify(before)}`);
  }
  if (referenceAfter.exitCode !== 1 || JSON.stringify(referenceAfter.files) !== JSON.stringify(expectedAfter)) {
    failures.push(`reference-preprocessor fixture mismatch: ${JSON.stringify(referenceAfter)}`);
  }
  const fixtureOutput = { ordinary, productionBefore: before, productionAfter: referenceAfter };
  fixtureOutput.referenceMutationBoundary = referenceBoundaryPass ? "pass" : "fail";

  const candidate = resolve(root, "scripts/knip-production-test-files.mjs");
  if (!existsSync(candidate)) {
    failures.push("preprocessor missing: scripts/knip-production-test-files.mjs");
    fixtureOutput.candidateMutationBoundary = "missing";
  } else {
    const candidateAfter = runKnip(candidate);
    if (JSON.stringify(candidateAfter) !== JSON.stringify(referenceAfter)) {
      failures.push(`candidate-preprocessor fixture mismatch: ${JSON.stringify(candidateAfter)}`);
    }
    fixtureOutput.candidateMutationBoundary = (await verifyMutationBoundary(candidate, "candidate"))
      ? "pass"
      : "fail";
  }
  fixtureOutputHash = sha256(JSON.stringify(fixtureOutput));
} finally {
  for (const path of Object.keys(fixtureFiles)) {
    const absolute = resolve(root, path);
    rmSync(absolute, { force: true });
    if (existsSync(absolute)) failures.push(`fixture cleanup failed: ${path}`);
  }
  rmSync(fixtureParent, { recursive: true, force: true });
}

console.log(`fixture_contract_sha256=${fixtureContractHash}`);
console.log(`fixture_output_sha256=${fixtureOutputHash}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`RED ${failure}`);
  process.exitCode = 1;
} else {
  console.log("PASS knip production test reachability contract");
}
