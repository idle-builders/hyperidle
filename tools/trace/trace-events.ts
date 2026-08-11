#!/usr/bin/env tsx
import { rel } from "./trace-lib.js";
import { loadGraph } from "./trace-build.js";

const graph = loadGraph(process.argv.includes("--rebuild"));
const arg = process.argv[2] === "--rebuild" ? undefined : process.argv[2];
const { emits, subs, wildcards, dynamic } = graph.events;

if (!arg || arg === "--list") {
	const byType = new Map<string, { e: number; s: number }>();
	for (const e of emits) {
		const r = byType.get(e.event) ?? { e: 0, s: 0 };
		r.e++;
		byType.set(e.event, r);
	}
	for (const s of subs) {
		const r = byType.get(s.event) ?? { e: 0, s: 0 };
		r.s++;
		byType.set(s.event, r);
	}
	const rows = [...byType.entries()].sort((a, b) => b[1].e + b[1].s - (a[1].e + a[1].s));
	console.log("event type                        emit  sub   (production)");
	for (const [t, r] of rows) console.log(`${t.padEnd(34)}${String(r.e).padStart(3)}${String(r.s).padStart(5)}`);
	console.log(`\n${rows.length} event types, ${wildcards.length} wildcard subscribers`);
	if (dynamic.length > 0) {
		console.log(`\nUNRESOLVED DYNAMIC (${dynamic.length} sites — event type decided at runtime):`);
		for (const d of dynamic) console.log(`  ${rel(d.file)}:${d.line}  [${d.enclosing}]  ${d.expr}`);
	}
	process.exit(0);
}

if (arg === "--all") {
	for (const t of [...new Set([...emits.map((e) => e.event), ...subs.map((s) => s.event)])].sort()) {
		const es = emits.filter((e) => e.event === t);
		const ss = subs.filter((s) => s.event === t);
		console.log(`\n${t} — ${es.length} emit, ${ss.length} subscribe`);
		console.log(es.length ? "EMIT" : "EMIT (none — see unresolved dynamic)");
		for (const e of es) console.log(`  ${rel(e.file)}:${e.line}  [${e.enclosing}]${e.inferred ? " (inferred)" : ""}`);
		console.log(ss.length ? "SUBSCRIBE" : "SUBSCRIBE (none)");
		for (const s of ss) console.log(`  ${rel(s.file)}:${s.line}  [${s.enclosing}] -> ${s.handler ?? "(inline)"}`);
	}
	process.exit(0);
}

const es = emits.filter((e) => e.event === arg);
const ss = subs.filter((s) => s.event === arg);
if (es.length === 0 && ss.length === 0) {
	console.log(`no emit/subscribe sites found for "${arg}"`);
	process.exit(1);
}
console.log(`\n${arg} — ${es.length} emit, ${ss.length} subscribe`);
console.log(es.length ? "EMIT" : "EMIT (none — see --list unresolved dynamic)");
for (const e of es) console.log(`  ${rel(e.file)}:${e.line}  [${e.enclosing}]${e.inferred ? " (inferred)" : ""}`);
console.log(ss.length ? "SUBSCRIBE" : "SUBSCRIBE (none)");
for (const s of ss) console.log(`  ${rel(s.file)}:${s.line}  [${s.enclosing}] -> ${s.handler ?? "(inline)"}`);
if (wildcards.length > 0) {
	console.log("WILDCARD SUBSCRIBERS (react to every event)");
	for (const w of wildcards) console.log(`  ${rel(w.file)}:${w.line}  [${w.enclosing}]`);
}
