/**
 * Protection sweep: which convicted rows cannot be deleted alone?
 *
 * Two hazards, both learned the hard way:
 *  (a) the UI still calls it — deleting it alone leaves a dangling caller;
 *  (b) a feature package in track BA depends on it existing.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = ".pipeline/work/AU20/destroy";
const V1 = path.join(BASE, "verdicts"), V2 = path.join(BASE, "verdicts-revised");
const UI = "layers/core-ui/src";
const md = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith(".md")) : []);
const rev = new Set(md(V2));
const strip = (s: string) => s.replace(/[`*]/g, "").trim();

/** Subsystems the feature track owns, by the words its plans use. */
const BA_GUARDS: Array<[string, RegExp]> = [
  ["triggers / agent behavior", /agent.?behavior|\btrigger\b|configurationOverride|listConfiguration/i],
  ["approve-then-act", /proposedCall|proposed.call|tailoredGrant|reversibility|sessionWorkflow/i],
  ["per-model options", /modelOption|OptionDescriptor|OptionControl|OptionChoice/i],
  ["live session view", /sessionView|activityPanel|derivePartsFromSession|aggregateToolRun/i],
  ["authenticated mounts", /FilesystemAuth|AuthResolver|resolveToken|connectionValidate/i],
  ["task dependencies", /dependenc|checkAndUnblock/i],
  ["shared backend / OIDC", /invite|loginSession|claimInvite|bearer|getOrCreateUser/i],
  ["events announce", /dependency_met|bet_revised|thread_archived|work_selection|proposed_call_executed/i],
  ["ritual to plugin", /retro|facilitator|practice|knowledgeDecay|knowledgePromotion|attention/i],
];

type Hit = { pkg: string; name: string; uiRefs: string[]; ba: string[] };
const hits: Hit[] = [];
let scanned = 0;

const uiMentions = (needle: string): string[] => {
  if (!needle || needle.length < 4) return [];
  try {
    const out = execFileSync("rg", ["-a", "-l", "-F", needle, UI], { stdio: ["ignore", "pipe", "ignore"] });
    return out.toString().trim().split("\n").filter(Boolean);
  } catch { return []; }
};

for (const f of [...new Set([...md(V1), ...rev])].sort()) {
  const pkg = f.replace(/\.md$/, "");
  const body = fs.readFileSync(path.join(rev.has(f) ? V2 : V1, f), "utf8");
  let skip = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (/^##\s/.test(t)) skip = /what changed/i.test(t);
    if (skip || !t.startsWith("|")) continue;
    const c = t.split("|").slice(1, -1).map(strip);
    const vi = c.findIndex(x => /^(DELETE|PLUGIN|FINISH|MERGE|SIMPLIFY|KEEP)$/.test(x));
    if (vi === -1 || (vi === 0 && c.length <= 2) || c[vi] !== "DELETE") continue;
    const before = c.slice(0, vi);
    const name = before.find(x => x && !/^\d+$/.test(x)) ?? "";
    if (!name) continue;
    scanned++;
    // A route row looks like "GET /api/x/:id" — the UI calls it by path, not by symbol.
    const route = name.match(/^[A-Z]+\s+(\/\S+)/);
    const needle = route ? route[1].replace(/:[^/]+/g, "") .replace(/\/+$/, "") : name;
    const uiRefs = uiMentions(needle);
    const rowText = `${name} ${c.slice(vi + 1).join(" ")}`;
    const ba = BA_GUARDS.filter(([, re]) => re.test(rowText)).map(([label]) => label);
    if (uiRefs.length || ba.length) hits.push({ pkg, name, uiRefs, ba });
  }
}

if (scanned === 0) { console.error("FATAL: scanned zero rows"); process.exit(1); }
console.log(`scanned ${scanned} convicted rows; ${hits.length} need protection review\n`);
const byPkg = new Map<string, Hit[]>();
for (const h of hits) byPkg.set(h.pkg, [...(byPkg.get(h.pkg) ?? []), h]);
for (const [pkg, rows] of [...byPkg].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${pkg} (${rows.length})`);
  for (const r of rows) {
    const why = [r.uiRefs.length ? `UI calls it: ${r.uiRefs.length} file(s)` : "", ...r.ba].filter(Boolean).join("; ");
    console.log(`   ${r.name}  —  ${why}`);
  }
  console.log("");
}
