import fs from "node:fs";
import path from "node:path";

const ledger = JSON.parse(fs.readFileSync("plans/AU20/browser-validation-ledger.json", "utf8"));
const registers = new Set(["BR-FIXTURES","BR-LIFECYCLE","BR-SETUP","BR-MESSAGES","BR-NAV","BR-RESPONSIVE","BR-SETTINGS","BR-STATUS","BR-WORK-DETAIL","BR-WORK-ROUTES"]);
const unresolved = ledger.cases.filter((c) => c.disposition === "unresolved" && registers.has(c.primaryProblemRegisterId));
const flattened = [];
function walk(suite, parents = []) {
  const next = suite.title ? [...parents, suite.title] : parents;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const result = test.results?.at(-1);
      flattened.push({
        file: spec.file,
        line: spec.line,
        title: [...next, spec.title].join(" > "),
        specTitle: spec.title,
        status: result?.status ?? test.status ?? "unrun",
        startTime: result?.startTime ?? null,
        duration: result?.duration ?? null,
        error: result?.error?.message ?? result?.errors?.[0]?.message ?? "",
        attachments: result?.attachments?.map((a) => a.path).filter(Boolean) ?? [],
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, next);
}
const byFile = new Map();
for (const file of new Set(unresolved.map((c) => path.basename(c.file, ".spec.ts")))) {
  const report = `/tmp/au20-${file}.json`;
  if (!fs.existsSync(report)) continue;
  const json = JSON.parse(fs.readFileSync(report, "utf8"));
  for (const suite of json.suites ?? []) walk(suite);
}
for (const row of flattened) {
  const list = byFile.get(row.file) ?? [];
  list.push(row);
  byFile.set(row.file, list);
}
const out = unresolved.map((c) => {
  const candidates = byFile.get(path.basename(c.file)) ?? [];
  const leaf = c.title.split(" > ").at(-1);
  const exact = candidates.filter((r) => r.specTitle === leaf);
  const row = exact[0] ?? candidates.find((r) => r.line === c.line) ?? null;
  return {
    id: c.id,
    register: c.primaryProblemRegisterId,
    source: `${c.file}:${c.line}`,
    priorExecution: c.execution,
    current: row,
    matched: Boolean(row),
  };
});
fs.writeFileSync("/tmp/au20-local-diagnostic-summary.json", `${JSON.stringify(out, null, 2)}\n`);
for (const r of out) {
  const first = r.current?.error?.replace(/\u001b\\[[0-9;]*m/g, "").split("\n").find(Boolean) ?? "";
  console.log([r.register, r.source, r.current?.status ?? "NO_MATCH", r.current?.duration ?? "", r.id.split("|").at(-1), first].join("\t"));
}
