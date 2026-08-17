/**
 * Turn the 41 verdict files into one browsable review page.
 * Usage: npx tsx .pipeline/work/AU20/destroy/tools/build-page.ts <outFile>
 */
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = ".pipeline/work/AU20/destroy";
const VERDICTS = path.join(BASE, "verdicts");
const OUT = process.argv[2] ?? path.join(BASE, "audit.html");

type Row = { pkg: string; name: string; reach: string; verdict: string; reason: string };
type Pkg = { id: string; label: string; kind: string; headline: string; rows: Row[] };

const VERDICT = /^(DELETE|MERGE|SIMPLIFY|KEEP)$/;
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

function rowsOf(pkg: string, body: string): Row[] {
  const out: Row[] = [];
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || /^\|[\s:|-]+\|$/.test(t)) continue;
    const cells = t.split("|").slice(1, -1).map((c) => c.trim());
    const vi = cells.findIndex((c) => VERDICT.test(strip(c)));
    if (vi === -1) continue;
    // Each verdict file opens with its own `| Verdict | Count |` summary. Those are
    // tallies of the audit, not rows of it — counting them double-counts every file.
    if (vi === 0 && cells.length <= 2) continue;
    const before = cells.slice(0, vi);
    const nameCell = before.find((c) => c.includes("`")) ?? before.find((c) => c && !/^\d+$/.test(c)) ?? "";
    const reach = before.filter((c) => c !== nameCell && c && !/^\d+$/.test(c)).join(" · ");
    const reason = vi === cells.length - 1 ? "" : cells[cells.length - 1];
    out.push({
      pkg,
      name: strip(nameCell) || "(unnamed)",
      reach: strip(reach),
      verdict: strip(cells[vi]),
      reason: strip(reason),
    });
  }
  return out;
}

const files = fs.readdirSync(VERDICTS).filter((f) => f.endsWith(".md")).sort();
if (files.length === 0) {
  console.error("FATAL: no verdict files");
  process.exit(1);
}

const pkgs: Pkg[] = files.map((f) => {
  const id = f.replace(/\.md$/, "");
  const body = fs.readFileSync(path.join(VERDICTS, f), "utf8");
  const isFw = id.startsWith("fw-");
  const isDoors = id === "_doors";
  return {
    id,
    label: isDoors ? "door surface" : isFw ? id.slice(3) : id,
    kind: isDoors ? "doors" : isFw ? "framework" : "service",
    headline: headlineOf(body),
    rows: rowsOf(id, body),
  };
});

const all = pkgs.flatMap((p) => p.rows);
if (all.length === 0) {
  console.error("FATAL: parsed zero verdict rows");
  process.exit(1);
}
const count = (v: string) => all.filter((r) => r.verdict === v).length;

const data = JSON.stringify(
  pkgs
    .map((p) => ({
      ...p,
      d: p.rows.filter((r) => r.verdict === "DELETE").length,
      m: p.rows.filter((r) => r.verdict === "MERGE").length,
      s: p.rows.filter((r) => r.verdict === "SIMPLIFY").length,
      k: p.rows.filter((r) => r.verdict === "KEEP").length,
    }))
    .sort((a, b) => b.d + b.m - (a.d + a.m)),
).replace(/</g, "\\u003c");

const html = `<title>AU20 — Destroyer audit</title>
<style>
:root{
  --ground:#e9ebee; --surface:#f7f8f9; --raised:#ffffff;
  --ink:#15181c; --muted:#5b646f; --line:#cfd4da;
  --accent:#a8391a;
  --delete:#b3261e; --merge:#8a5300; --simplify:#1f5f8b; --keep:#3d6b47;
  --delete-bg:#b3261e14; --merge-bg:#8a530014; --simplify-bg:#1f5f8b14; --keep-bg:#3d6b4714;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#131619; --surface:#1a1e22; --raised:#21262b;
    --ink:#e7eaed; --muted:#98a1ab; --line:#333a42;
    --accent:#e0714c;
    --delete:#f2867d; --merge:#d7a13c; --simplify:#6fb0dc; --keep:#7fbb8e;
    --delete-bg:#f2867d1a; --merge-bg:#d7a13c1a; --simplify-bg:#6fb0dc1a; --keep-bg:#7fbb8e1a;
  }
}
:root[data-theme="dark"]{
  --ground:#131619; --surface:#1a1e22; --raised:#21262b;
  --ink:#e7eaed; --muted:#98a1ab; --line:#333a42;
  --accent:#e0714c;
  --delete:#f2867d; --merge:#d7a13c; --simplify:#6fb0dc; --keep:#7fbb8e;
  --delete-bg:#f2867d1a; --merge-bg:#d7a13c1a; --simplify-bg:#6fb0dc1a; --keep-bg:#7fbb8e1a;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
code,.mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px}
header{display:flex;flex-direction:column;gap:6px;margin-bottom:28px}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:650}
h1{margin:0;font-size:30px;line-height:1.15;letter-spacing:-.02em;text-wrap:balance}
.sub{color:var(--muted);font-size:14px;max-width:70ch}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin:22px 0}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:12px 14px;border-left-width:3px}
.tile .n{font-size:26px;font-weight:680;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tile .l{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:2px}
.t-del{border-left-color:var(--delete)} .t-del .n{color:var(--delete)}
.t-mer{border-left-color:var(--merge)} .t-mer .n{color:var(--merge)}
.t-sim{border-left-color:var(--simplify)} .t-sim .n{color:var(--simplify)}
.t-kee{border-left-color:var(--keep)} .t-kee .n{color:var(--keep)}
.t-tot{border-left-color:var(--muted)}
.bar{position:sticky;top:0;z-index:5;background:var(--ground);border-bottom:1px solid var(--line);
  padding:12px 0;margin-bottom:18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
input[type=search]{flex:1;min-width:200px;padding:8px 11px;border:1px solid var(--line);border-radius:5px;
  background:var(--raised);color:var(--ink);font-size:14px}
input[type=search]:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
button{font:inherit;font-size:12px;font-weight:600;padding:7px 11px;border-radius:5px;cursor:pointer;
  border:1px solid var(--line);background:var(--raised);color:var(--muted)}
button[aria-pressed=true]{color:var(--ink);border-color:currentColor}
button.v-DELETE[aria-pressed=true]{background:var(--delete-bg);color:var(--delete)}
button.v-MERGE[aria-pressed=true]{background:var(--merge-bg);color:var(--merge)}
button.v-SIMPLIFY[aria-pressed=true]{background:var(--simplify-bg);color:var(--simplify)}
button.v-KEEP[aria-pressed=true]{background:var(--keep-bg);color:var(--keep)}
.count{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;margin-left:auto}
section{background:var(--surface);border:1px solid var(--line);border-radius:7px;margin-bottom:14px;overflow:hidden}
.head{display:flex;gap:12px;align-items:baseline;padding:13px 16px;cursor:pointer;flex-wrap:wrap}
.head:hover{background:var(--raised)}
.pname{font-weight:650;font-size:15px}
.kind{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  border:1px solid var(--line);border-radius:3px;padding:1px 5px}
.meter{display:flex;height:5px;width:150px;border-radius:3px;overflow:hidden;background:var(--line)}
.meter i{display:block}
.rate{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.headline{padding:0 16px 12px;color:var(--muted);font-size:13px;max-width:85ch}
.tbl{overflow-x:auto;border-top:1px solid var(--line)}
table{border-collapse:collapse;width:100%;font-size:13px}
th{text-align:left;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);
  padding:8px 12px;border-bottom:1px solid var(--line);white-space:nowrap;background:var(--surface)}
td{padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
/* Long route names must wrap: one nowrap cell drags the column past the viewport
   and pushes every later column out of sight. */
td.sym{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;
  overflow-wrap:anywhere;max-width:300px;width:26%}
td.reach{color:var(--muted);font-size:12px;max-width:220px;overflow-wrap:anywhere;width:22%}
td.why{color:var(--ink);width:44%}
td.vd{white-space:nowrap;font-weight:650;font-size:11px;letter-spacing:.06em;border-left:3px solid}
.vDELETE{color:var(--delete);border-left-color:var(--delete);background:var(--delete-bg)}
.vMERGE{color:var(--merge);border-left-color:var(--merge);background:var(--merge-bg)}
.vSIMPLIFY{color:var(--simplify);border-left-color:var(--simplify);background:var(--simplify-bg)}
.vKEEP{color:var(--keep);border-left-color:var(--keep);background:var(--keep-bg)}
.hidden{display:none}
footer{margin-top:32px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:14px}
</style>

<div class="wrap">
<header>
  <div class="eyebrow">AU20 · reopened · ba0fb454d</div>
  <h1>Destroyer audit — every method, every door, one verdict each</h1>
  <p class="sub">38 agents, one per service and per framework package plus the entry-door surface.
  Every export traced to a UI, agent-harness or scheduler door. The standing bar: a method survives
  only if it proves a core value.</p>
</header>

<div class="tiles">
  <div class="tile t-del"><div class="n">${count("DELETE")}</div><div class="l">Delete</div></div>
  <div class="tile t-mer"><div class="n">${count("MERGE")}</div><div class="l">Merge</div></div>
  <div class="tile t-sim"><div class="n">${count("SIMPLIFY")}</div><div class="l">Simplify</div></div>
  <div class="tile t-kee"><div class="n">${count("KEEP")}</div><div class="l">Keep</div></div>
  <div class="tile t-tot"><div class="n">${all.length}</div><div class="l">Rows</div></div>
</div>

<div class="bar">
  <input type="search" id="q" placeholder="Search symbol, reason, package…" aria-label="Search">
  <div class="chips" id="chips">
    <button class="v-DELETE" data-v="DELETE" aria-pressed="true">Delete</button>
    <button class="v-MERGE" data-v="MERGE" aria-pressed="true">Merge</button>
    <button class="v-SIMPLIFY" data-v="SIMPLIFY" aria-pressed="true">Simplify</button>
    <button class="v-KEEP" data-v="KEEP" aria-pressed="true">Keep</button>
  </div>
  <button id="toggle">Collapse all</button>
  <span class="count" id="count"></span>
</div>

<div id="list"></div>

<footer>Source of truth: <code>.pipeline/work/AU20/destroy/FULL-AUDIT.md</code> and the 41 per-package
verdict files beside it. Reachability from <code>tools/trace</code>; every DEAD claim re-confirmed with
<code>rg -a</code>, because the graph under-reports pure-client imports and DI wiring.</footer>
</div>

<script>
const PKGS = ${data};
const on = new Set(["DELETE","MERGE","SIMPLIFY","KEEP"]);
let q = "";
const esc = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const list = document.getElementById("list");

function render(){
  let shown = 0;
  list.innerHTML = PKGS.map(p => {
    const rows = p.rows.filter(r => on.has(r.verdict) &&
      (!q || (r.name+" "+r.reason+" "+r.reach+" "+p.label).toLowerCase().includes(q)));
    if (!rows.length) return "";
    shown += rows.length;
    const tot = p.d+p.m+p.s+p.k;
    const kill = tot ? Math.round((p.d+p.m)/tot*100) : 0;
    const seg = (n,c) => n ? '<i style="width:'+(n/tot*100)+'%;background:'+c+'"></i>' : "";
    return '<section><div class="head" role="button" tabindex="0">'
      + '<span class="pname">'+esc(p.label)+'</span>'
      + '<span class="kind">'+p.kind+'</span>'
      + '<span class="meter">'+seg(p.d,"var(--delete)")+seg(p.m,"var(--merge)")
      + seg(p.s,"var(--simplify)")+seg(p.k,"var(--keep)")+'</span>'
      + '<span class="rate">'+kill+'% killed · '+rows.length+' shown of '+tot+'</span></div>'
      + (p.headline ? '<div class="headline">'+esc(p.headline)+'</div>' : "")
      + '<div class="tbl"><table><thead><tr><th>Symbol</th><th>Reach</th><th>Verdict</th><th>Reason</th></tr></thead><tbody>'
      + rows.map(r => '<tr><td class="sym">'+esc(r.name)+'</td><td class="reach">'+esc(r.reach)
      + '</td><td class="vd v'+r.verdict+'">'+r.verdict+'</td><td class="why">'+esc(r.reason)+'</td></tr>').join("")
      + '</tbody></table></div></section>';
  }).join("");
  document.getElementById("count").textContent = shown + " rows";
}

document.getElementById("chips").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const v = b.dataset.v, next = b.getAttribute("aria-pressed") !== "true";
  b.setAttribute("aria-pressed", String(next));
  next ? on.add(v) : on.delete(v);
  render();
});
document.getElementById("q").addEventListener("input", e => { q = e.target.value.toLowerCase(); render(); });
list.addEventListener("click", e => {
  const h = e.target.closest(".head"); if (!h) return;
  const t = h.parentElement.querySelector(".tbl"); t.classList.toggle("hidden");
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
render();
</script>`;

fs.writeFileSync(OUT, html);
console.log(`${pkgs.length} packages, ${all.length} rows parsed`);
console.log(`DELETE ${count("DELETE")} | MERGE ${count("MERGE")} | SIMPLIFY ${count("SIMPLIFY")} | KEEP ${count("KEEP")}`);
console.log(`wrote ${OUT}`);
