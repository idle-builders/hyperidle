/**
 * Turn the destroyer verdicts into one browsable review page, preferring a revised
 * verdict over its first-wave original.
 * Usage: npx tsx .pipeline/work/AU20/destroy/tools/build-page.ts <outFile>
 */
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = ".pipeline/work/AU20/destroy";
const V1 = path.join(BASE, "verdicts");
const V2 = path.join(BASE, "verdicts-revised");
const OUT = process.argv[2] ?? path.join(BASE, "audit.html");

const VERDICTS = ["DELETE", "PLUGIN", "FINISH", "MERGE", "SIMPLIFY", "KEEP"] as const;
type Verdict = (typeof VERDICTS)[number];
const RE = new RegExp(`^(${VERDICTS.join("|")})$`);

type Row = { name: string; reach: string; verdict: Verdict; reason: string };
const strip = (s: string) => s.replace(/`/g, "").replace(/\*\*/g, "").trim();

function headlineOf(body: string): string {
  const m = body.match(/^##\s+(?:Should this service exist\?|Where does this package go\?)\s*$/m);
  if (!m || m.index === undefined) return "";
  const after = body.slice(m.index + m[0].length);
  const stop = after.search(/^##\s/m);
  const block = (stop === -1 ? after : after.slice(0, stop)).trim();
  const lines = block.split("\n").filter((l) => l.trim() && !l.trim().startsWith("|"));
  return strip(lines.slice(0, 3).join(" ")).slice(0, 400);
}

function rowsOf(body: string): Row[] {
  const out: Row[] = [];
  // Skip the revised files' "What changed after the rulings" table: it carries BOTH the old
  // and the new verdict per row, so tallying it double-counts and credits the old verdict.
  let skipping = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (/^##\s/.test(t)) skipping = /what changed/i.test(t);
    if (skipping) continue;
    if (!t.startsWith("|") || /^\|[\s:|-]+\|$/.test(t)) continue;
    const cells = t.split("|").slice(1, -1).map((c) => c.trim());
    const vi = cells.findIndex((c) => RE.test(strip(c)));
    if (vi === -1) continue;
    if (vi === 0 && cells.length <= 2) continue; // the file's own kill-summary table
    const before = cells.slice(0, vi);
    const nameCell = before.find((c) => c.includes("`")) ?? before.find((c) => c && !/^\d+$/.test(c)) ?? "";
    const reach = before.filter((c) => c !== nameCell && c && !/^\d+$/.test(c)).join(" · ");
    const reason = vi === cells.length - 1 ? "" : cells[cells.length - 1];
    out.push({
      name: strip(nameCell) || "(unnamed)",
      reach: strip(reach),
      verdict: strip(cells[vi]) as Verdict,
      reason: strip(reason),
    });
  }
  return out;
}

const mdNames = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
const revisedSet = new Set(mdNames(V2));
const files = [...new Set([...mdNames(V1), ...revisedSet])].sort();
if (files.length === 0) {
  console.error("FATAL: no verdict files");
  process.exit(1);
}

const pkgs = files.map((f) => {
  const id = f.replace(/\.md$/, "");
  const isRevised = revisedSet.has(f);
  const body = fs.readFileSync(path.join(isRevised ? V2 : V1, f), "utf8");
  const isFw = id.startsWith("fw-");
  const isDoors = id === "_doors";
  const rows = rowsOf(body);
  const c = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  return {
    id,
    label: isDoors ? "door surface" : isFw ? id.slice(3) : id,
    kind: isDoors ? "doors" : isFw ? "framework" : "service",
    revised: isRevised,
    headline: headlineOf(body),
    rows,
    counts: Object.fromEntries(VERDICTS.map((v) => [v, c(v)])) as Record<Verdict, number>,
  };
});

const all = pkgs.flatMap((p) => p.rows);
if (all.length === 0) {
  console.error("FATAL: parsed zero verdict rows");
  process.exit(1);
}
const count = (v: Verdict) => all.filter((r) => r.verdict === v).length;
const gone = (p: (typeof pkgs)[number]) => p.counts.DELETE + p.counts.PLUGIN + p.counts.MERGE;

const data = JSON.stringify(
  [...pkgs].sort((a, b) => gone(b) - gone(a)),
).replace(/</g, "\\u003c");

const TILE = [
  ["DELETE", "Delete", "del"],
  ["PLUGIN", "Plugin", "plg"],
  ["FINISH", "Finish", "fin"],
  ["MERGE", "Merge", "mer"],
  ["SIMPLIFY", "Simplify", "sim"],
  ["KEEP", "Keep", "kee"],
] as const;

const html = `<title>AU20 — Destroyer audit</title>
<style>
:root{
  --ground:#e9ebee; --surface:#f7f8f9; --raised:#ffffff;
  --ink:#15181c; --muted:#5b646f; --line:#cfd4da;
  --accent:#a8391a;
  --DELETE:#b3261e; --PLUGIN:#6b3fa0; --FINISH:#0f6f6b; --MERGE:#8a5300; --SIMPLIFY:#1f5f8b; --KEEP:#3d6b47;
  --DELETE-bg:#b3261e14; --PLUGIN-bg:#6b3fa014; --FINISH-bg:#0f6f6b14;
  --MERGE-bg:#8a530014; --SIMPLIFY-bg:#1f5f8b14; --KEEP-bg:#3d6b4714;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#131619; --surface:#1a1e22; --raised:#21262b;
    --ink:#e7eaed; --muted:#98a1ab; --line:#333a42;
    --accent:#e0714c;
    --DELETE:#f2867d; --PLUGIN:#b795e0; --FINISH:#5cc0ba; --MERGE:#d7a13c; --SIMPLIFY:#6fb0dc; --KEEP:#7fbb8e;
    --DELETE-bg:#f2867d1a; --PLUGIN-bg:#b795e01a; --FINISH-bg:#5cc0ba1a;
    --MERGE-bg:#d7a13c1a; --SIMPLIFY-bg:#6fb0dc1a; --KEEP-bg:#7fbb8e1a;
  }
}
:root[data-theme="dark"]{
  --ground:#131619; --surface:#1a1e22; --raised:#21262b;
  --ink:#e7eaed; --muted:#98a1ab; --line:#333a42;
  --accent:#e0714c;
  --DELETE:#f2867d; --PLUGIN:#b795e0; --FINISH:#5cc0ba; --MERGE:#d7a13c; --SIMPLIFY:#6fb0dc; --KEEP:#7fbb8e;
  --DELETE-bg:#f2867d1a; --PLUGIN-bg:#b795e01a; --FINISH-bg:#5cc0ba1a;
  --MERGE-bg:#d7a13c1a; --SIMPLIFY-bg:#6fb0dc1a; --KEEP-bg:#7fbb8e1a;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px}
header{display:flex;flex-direction:column;gap:6px;margin-bottom:22px}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:650}
h1{margin:0;font-size:30px;line-height:1.15;letter-spacing:-.02em;text-wrap:balance}
.sub{color:var(--muted);font-size:14px;max-width:72ch}
.note{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:6px;padding:11px 14px;font-size:13px;color:var(--muted);margin:16px 0}
.note b{color:var(--ink)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px;margin:20px 0}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:12px 14px;border-left-width:3px}
.tile .n{font-size:24px;font-weight:680;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tile .l{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:2px}
.bar{position:sticky;top:0;z-index:5;background:var(--ground);border-bottom:1px solid var(--line);
  padding:12px 0;margin-bottom:18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
input[type=search]{flex:1;min-width:190px;padding:8px 11px;border:1px solid var(--line);border-radius:5px;
  background:var(--raised);color:var(--ink);font-size:14px}
input[type=search]:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
button{font:inherit;font-size:12px;font-weight:600;padding:7px 10px;border-radius:5px;cursor:pointer;
  border:1px solid var(--line);background:var(--raised);color:var(--muted)}
button[aria-pressed=true]{color:var(--ink);border-color:currentColor}
.count{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;margin-left:auto}
section{background:var(--surface);border:1px solid var(--line);border-radius:7px;margin-bottom:14px;overflow:hidden}
.head{display:flex;gap:10px;align-items:baseline;padding:13px 16px;cursor:pointer;flex-wrap:wrap}
.head:hover{background:var(--raised)}
.pname{font-weight:650;font-size:15px}
.kind,.rev{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  border:1px solid var(--line);border-radius:3px;padding:1px 5px}
.rev{color:var(--accent);border-color:var(--accent)}
.meter{display:flex;height:5px;width:140px;border-radius:3px;overflow:hidden;background:var(--line)}
.meter i{display:block}
.rate{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.headline{padding:0 16px 12px;color:var(--muted);font-size:13px;max-width:85ch}
.tbl{overflow-x:auto;border-top:1px solid var(--line)}
table{border-collapse:collapse;width:100%;font-size:13px}
th{text-align:left;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);
  padding:8px 12px;border-bottom:1px solid var(--line);white-space:nowrap;background:var(--surface)}
td{padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td.sym{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;
  overflow-wrap:anywhere;max-width:300px;width:26%}
td.reach{color:var(--muted);font-size:12px;max-width:220px;overflow-wrap:anywhere;width:22%}
td.why{color:var(--ink);width:44%}
td.vd{white-space:nowrap;font-weight:650;font-size:11px;letter-spacing:.05em;border-left:3px solid}
.hidden{display:none}
footer{margin-top:32px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:14px}
</style>

<div class="wrap">
<header>
  <div class="eyebrow">AU20 · reopened · ba0fb454d</div>
  <h1>Destroyer audit — every method, every door, one verdict each</h1>
  <p class="sub">38 agents traced every export to a UI, agent-harness or scheduler door. A method
  survives only if it proves a core value.</p>
</header>

<div class="note"><b>${pkgs.filter((p) => p.revised).length} of ${pkgs.length} packages were re-audited</b>
after founder rulings overturned three premises: this product runs as a <b>shared backend</b> for a team
and an organisation of teams (identity via OIDC, not invitations); <b>events are an extension surface</b>,
so "nothing internal subscribes" is not evidence of death; and <b>knowledge-management ritual leaves core
to become a plugin</b>. Those sections are marked <span class="rev">revised</span> and supersede the first
wave. <b>PLUGIN</b> = leaves core, ships as a plugin. <b>FINISH</b> = work to schedule, not a survivor
that needs nothing.</div>

<div class="tiles">
${TILE.map(([v, label]) => `  <div class="tile" style="border-left-color:var(--${v})"><div class="n" style="color:var(--${v})">${count(v as Verdict)}</div><div class="l">${label}</div></div>`).join("\n")}
  <div class="tile" style="border-left-color:var(--muted)"><div class="n">${all.length}</div><div class="l">Rows</div></div>
</div>

<div class="bar">
  <input type="search" id="q" placeholder="Search symbol, reason, package…" aria-label="Search">
  <div class="chips" id="chips">
${TILE.map(([v, label]) => `    <button data-v="${v}" aria-pressed="true">${label}</button>`).join("\n")}
  </div>
  <button id="toggle">Collapse all</button>
  <span class="count" id="count"></span>
</div>

<div id="list"></div>

<footer>Source of truth: <code>.pipeline/work/AU20/destroy/FULL-AUDIT.md</code>, the per-package verdict
files, and <code>FOUNDER-RULINGS.md</code>. First-wave verdicts are preserved in <code>verdicts/</code>;
revised ones in <code>verdicts-revised/</code>. Reachability from <code>tools/trace</code>; every DEAD
claim re-confirmed with <code>rg -a</code>, because the graph under-reports pure-client imports and DI
wiring.</footer>
</div>

<script>
const PKGS = ${data};
const VERDICTS = ${JSON.stringify(VERDICTS)};
const on = new Set(VERDICTS);
let q = "";
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const list = document.getElementById("list");

for (const b of document.querySelectorAll("#chips button")) {
  b.style.setProperty("--c", "var(--" + b.dataset.v + ")");
}

function paint(){
  for (const b of document.querySelectorAll("#chips button")) {
    const v = b.dataset.v, active = b.getAttribute("aria-pressed") === "true";
    b.style.background = active ? "var(--" + v + "-bg)" : "";
    b.style.color = active ? "var(--" + v + ")" : "";
  }
}

function render(){
  let shown = 0;
  list.innerHTML = PKGS.map(p => {
    const rows = p.rows.filter(r => on.has(r.verdict) &&
      (!q || (r.name+" "+r.reason+" "+r.reach+" "+p.label).toLowerCase().includes(q)));
    if (!rows.length) return "";
    shown += rows.length;
    const tot = p.rows.length;
    const goneN = p.counts.DELETE + p.counts.PLUGIN + p.counts.MERGE;
    const rate = tot ? Math.round(goneN/tot*100) : 0;
    const seg = v => p.counts[v] ? '<i style="width:'+(p.counts[v]/tot*100)+'%;background:var(--'+v+')"></i>' : "";
    return '<section><div class="head" role="button" tabindex="0">'
      + '<span class="pname">'+esc(p.label)+'</span>'
      + '<span class="kind">'+p.kind+'</span>'
      + (p.revised ? '<span class="rev">revised</span>' : '')
      + '<span class="meter">'+VERDICTS.map(seg).join("")+'</span>'
      + '<span class="rate">'+rate+'% out of core · '+rows.length+' shown of '+tot+'</span></div>'
      + (p.headline ? '<div class="headline">'+esc(p.headline)+'</div>' : "")
      + '<div class="tbl"><table><thead><tr><th>Symbol</th><th>Reach</th><th>Verdict</th><th>Reason</th></tr></thead><tbody>'
      + rows.map(r => '<tr><td class="sym">'+esc(r.name)+'</td><td class="reach">'+esc(r.reach)
      + '</td><td class="vd" style="color:var(--'+r.verdict+');border-left-color:var(--'+r.verdict
      + ');background:var(--'+r.verdict+'-bg)">'+r.verdict+'</td><td class="why">'+esc(r.reason)+'</td></tr>').join("")
      + '</tbody></table></div></section>';
  }).join("");
  document.getElementById("count").textContent = shown + " rows";
}

document.getElementById("chips").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const v = b.dataset.v, next = b.getAttribute("aria-pressed") !== "true";
  b.setAttribute("aria-pressed", String(next));
  next ? on.add(v) : on.delete(v);
  paint(); render();
});
document.getElementById("q").addEventListener("input", e => { q = e.target.value.toLowerCase(); render(); });
list.addEventListener("click", e => {
  const h = e.target.closest(".head"); if (!h) return;
  h.parentElement.querySelector(".tbl").classList.toggle("hidden");
  const d = h.parentElement.querySelector(".headline"); if (d) d.classList.toggle("hidden");
});
list.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("head")) { e.preventDefault(); e.target.click(); }
});
document.getElementById("toggle").addEventListener("click", e => {
  const collapse = e.target.textContent === "Collapse all";
  document.querySelectorAll(".tbl,.headline").forEach(n => n.classList.toggle("hidden", collapse));
  e.target.textContent = collapse ? "Expand all" : "Collapse all";
});
paint(); render();
</script>`;

fs.writeFileSync(OUT, html);
console.log(`${pkgs.length} packages (${revisedSet.size} revised), ${all.length} rows`);
console.log(VERDICTS.map((v) => `${v} ${count(v)}`).join(" | "));
console.log(`wrote ${OUT}`);
