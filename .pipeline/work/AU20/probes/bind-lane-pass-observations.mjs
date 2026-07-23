import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const diagnosticPath = "plans/AU20/diagnostics/lane-ah.json";
const reportPath = "plans/AU20/diagnostics/artifacts/lane-focused-report.json";
const diagnostic = JSON.parse(fs.readFileSync(diagnosticPath, "utf8"));
const reportBytes = fs.readFileSync(reportPath);
const report = JSON.parse(reportBytes);
const artifactSha256 = crypto.createHash("sha256").update(reportBytes).digest("hex");
const results = [];

function walk(suite, parents = []) {
  const next = suite.title ? [...parents, suite.title] : parents;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const result = test.results?.at(-1);
      results.push({
        file: spec.file,
        line: spec.line,
        title: [...next, spec.title].join(" > "),
        leaf: spec.title,
        playwrightId: spec.id,
        status: result?.status,
        startTime: result?.startTime,
        durationMs: result?.duration,
        workerIndex: result?.workerIndex,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, next);
}
for (const suite of report.suites ?? []) walk(suite);

let bound = 0;
for (const identity of diagnostic.identities) {
  if (!identity.formerlyUnresolved || identity.disposition !== "confirmed_no_regression") continue;
  const parts = identity.id.split("|");
  const source = parts[2];
  const leaf = parts.at(-1).split(" > ").at(-1);
  const match = source.match(/^(.+\.spec\.ts):(\d+):\d+$/);
  if (!match) throw new Error(`cannot parse source: ${source}`);
  const file = path.basename(match[1]);
  const line = Number(match[2]);
  const candidates = results.filter((r) => r.file === file && r.leaf === leaf);
  const result = candidates.find((r) => r.line === line) ?? candidates[0];
  if (!result) throw new Error(`no focused reporter observation: ${identity.id}`);
  if (result.status !== "passed") throw new Error(`none target lacks pass: ${identity.id} -> ${result.status}`);
  identity.focusedObservation = {
    runId: `lane-focused-${report.stats.startTime}`,
    reporterArtifact: reportPath,
    reporterArtifactSha256: artifactSha256,
    playwrightId: result.playwrightId,
    status: result.status,
    startTime: result.startTime,
    durationMs: result.durationMs,
    workerIndex: result.workerIndex,
  };
  identity.directEvidence = `Focused reporter observation ${result.playwrightId} passed in ${result.durationMs}ms.`;
  bound += 1;
}
if (bound !== 46) throw new Error(`expected 46 bound passes, received ${bound}`);
fs.writeFileSync(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`);
console.log(JSON.stringify({ bound, artifactSha256 }));
