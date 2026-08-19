import * as fs from "node:fs";
import * as path from "node:path";

const SP = process.argv[2];
const OUT = process.argv[3];
const census = JSON.parse(fs.readFileSync(path.join(SP, "census.json"), "utf8"));

fs.mkdirSync(OUT, { recursive: true });

const svcs = Object.entries(census).sort();
if (svcs.length === 0) {
  console.error("FATAL: no services in census");
  process.exit(1);
}

for (const [svc, v] of svcs as any) {
  const fns = v.records.filter((r: any) => r.kind === "function" || r.kind === "const-fn");
  const classes = v.records.filter((r: any) => r.kind === "class");
  const ifaces = v.records.filter((r: any) => r.kind === "interface" || r.kind === "type");
  const consts = v.records.filter((r: any) => r.kind === "const" || r.kind === "enum");

  const L: string[] = [];
  L.push(`# Destroyer input — \`${svc}\` (${v.layer})`);
  L.push("");
  L.push(`Package: \`${v.dir}\``);
  L.push(
    `Surface: ${fns.length} exported functions, ${classes.length} classes (${classes.reduce((a: number, c: any) => a + (c.classMethods?.length ?? 0), 0)} member methods), ${ifaces.length} interface/type declarations, ${consts.length} const/enum exports.`,
  );
  L.push("");
  L.push("## A. Exported functions — EVERY ONE NEEDS A VERDICT");
  L.push("");
  L.push("| # | Method | Public | Location |");
  L.push("|---|---|---|---|");
  fns.forEach((r: any, i: number) => {
    L.push(`| ${i + 1} | \`${r.name}\` | ${r.public ? "yes" : "internal"} | \`${r.file}:${r.line}\` |`);
  });
  L.push("");

  if (classes.length) {
    L.push("## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT");
    L.push("");
    for (const c of classes) {
      L.push(`### \`${c.name}\` — \`${c.file}:${c.line}\` (${c.public ? "public" : "internal"})`);
      if (c.classMethods?.length) for (const m of c.classMethods) L.push(`- \`${c.name}.${m}\``);
      else L.push("- (no public member methods)");
      L.push("");
    }
  }

  if (ifaces.length) {
    L.push("## C. Interface / type declarations — the DI-port surface");
    L.push("");
    L.push(
      "Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.",
    );
    L.push("");
    for (const t of ifaces) {
      const mem = t.classMethods?.length ? ` — members: ${t.classMethods.map((m: string) => `\`${m}\``).join(", ")}` : "";
      L.push(`- \`${t.name}\` (${t.kind}, ${t.public ? "public" : "internal"}) \`${t.file}:${t.line}\`${mem}`);
    }
    L.push("");
  }

  if (consts.length) {
    L.push("## D. Const / enum exports");
    L.push("");
    for (const c of consts) L.push(`- \`${c.name}\` (${c.kind}, ${c.public ? "public" : "internal"}) \`${c.file}:${c.line}\``);
    L.push("");
  }

  fs.writeFileSync(path.join(OUT, `${svc}.md`), L.join("\n"));
  console.log(
    `${svc}: ${fns.length} fns, ${classes.length} classes, ${ifaces.length} types, ${consts.length} consts`,
  );
}
console.log(`\nwrote ${svcs.length} input files to ${OUT}`);
