#!/usr/bin/env tsx
import { collectDoors, type Door, rel } from "./trace-lib.js";

const doors = collectDoors();

const arg = process.argv[2];
const filterKind = arg === "ui" || arg === "agent" || arg === "scheduler" ? arg : null;
const keyword = arg && !filterKind ? arg.toLowerCase() : null;

const kinds: Door["kind"][] = ["ui", "agent", "scheduler"];
const titles: Record<Door["kind"], string> = {
	ui: "UI DOORS (HTTP routes served to the browser)",
	agent: "AGENT DOORS (MCP tools, worker protocol, agent-facing HTTP/WS)",
	scheduler: "SCHEDULER DOORS (setInterval ticks)",
};

for (const kind of kinds) {
	if (filterKind && filterKind !== kind) continue;
	let list = doors.filter((d) => d.kind === kind);
	if (keyword)
		list = list.filter(
			(d) => d.label.toLowerCase().includes(keyword) || d.detail.toLowerCase().includes(keyword),
		);
	if (list.length === 0) continue;
	console.log(`\n${titles[kind]} — ${list.length}`);
	for (const d of list)
		console.log(`  ${d.label.padEnd(46)} ${rel(d.file)}:${d.line}  ${d.detail}`);
}

const total = doors.filter(
	(d) =>
		(!filterKind || d.kind === filterKind) &&
		(!keyword ||
			d.label.toLowerCase().includes(keyword) ||
			d.detail.toLowerCase().includes(keyword)),
).length;
console.log(`\n${total} doors${keyword ? ` matching "${keyword}"` : ""}`);
