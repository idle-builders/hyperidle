#!/usr/bin/env tsx
import { loadGraph } from "./trace-build.js";
import { rel } from "./trace-lib.js";
import { type DoorKind, queryDoors } from "./trace-query.js";

const arg = process.argv[2] === "--rebuild" ? undefined : process.argv[2];
const graph = loadGraph(process.argv.includes("--rebuild"));

const filterKind: DoorKind | null =
	arg === "ui" || arg === "agent" || arg === "scheduler" ? (arg as DoorKind) : null;
const keyword = arg && !filterKind ? arg : null;

const { doors } = queryDoors(graph, filterKind, keyword);

const kinds: DoorKind[] = ["ui", "agent", "scheduler"];
const titles: Record<DoorKind, string> = {
	ui: "UI DOORS (HTTP routes served to the browser)",
	agent: "AGENT DOORS (MCP tools, worker protocol, agent-facing HTTP/WS)",
	scheduler: "SCHEDULER DOORS (setInterval ticks)",
};

for (const kind of kinds) {
	const list = doors.filter((d) => d.kind === kind);
	if (list.length === 0) continue;
	console.log(`\n${titles[kind]} — ${list.length}`);
	for (const d of list)
		console.log(`  ${d.label.padEnd(46)} ${rel(d.file)}:${d.line}  ${d.detail}`);
}

console.log(`\n${doors.length} doors${keyword ? ` matching "${keyword}"` : ""}`);
