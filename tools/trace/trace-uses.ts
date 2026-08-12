#!/usr/bin/env tsx
import { loadGraph } from "./trace-build.js";
import { rel } from "./trace-lib.js";
import { type DoorKind, queryUses } from "./trace-query.js";

const query = process.argv[2];
if (!query) {
	console.log(
		"usage: trace-uses.ts <symbol> — find doors + event subscribers whose body uses <symbol>",
	);
	console.log("       <symbol> can be an event type, table, port method, or any function name");
	console.log(
		"       optional: --ui | --agent | --scheduler to narrow doors; --rebuild to refresh the graph",
	);
	process.exit(1);
}

const kindFilter: DoorKind | null = process.argv.includes("--ui")
	? "ui"
	: process.argv.includes("--agent")
		? "agent"
		: process.argv.includes("--scheduler")
			? "scheduler"
			: null;

const graph = loadGraph(process.argv.includes("--rebuild"));
const result = queryUses(graph, query, kindFilter);

if (result.doors.length === 0 && result.subscribers.length === 0) {
	console.log(`nothing references "${query}" (graph head ${graph.head.slice(0, 8)})`);
	process.exit(0);
}

const order: DoorKind[] = ["ui", "agent", "scheduler"];
const titles: Record<DoorKind, string> = {
	ui: "UI DOORS",
	agent: "AGENT DOORS",
	scheduler: "SCHEDULER DOORS",
};
for (const kind of order) {
	const list = result.doors.filter((m) => m.door.kind === kind);
	if (list.length === 0) continue;
	console.log(`\n${titles[kind]} using "${query}" — ${list.length}`);
	for (const { door, via } of list) {
		console.log(`  ${door.label.padEnd(46)} ${rel(door.file)}:${door.line}`);
		for (const v of via.slice(0, 6)) console.log(`      ${v}`);
		if (via.length > 6) console.log(`      (+ ${via.length - 6} more)`);
	}
}

if (result.subscribers.length > 0) {
	console.log(`\nEVENT SUBSCRIBERS using "${query}" — ${result.subscribers.length}`);
	for (const { sub, via } of result.subscribers) {
		console.log(
			`  on ${sub.event.padEnd(32)} ${rel(sub.file)}:${sub.line}  handler=${sub.handler ?? "(inline)"}`,
		);
		for (const v of via.slice(0, 6)) console.log(`      ${v}`);
		if (via.length > 6) console.log(`      (+ ${via.length - 6} more)`);
	}
}

console.log(
	`\n${result.doors.length} doors + ${result.subscribers.length} subscribers use "${query}" (graph head ${graph.head.slice(0, 8)})`,
);
