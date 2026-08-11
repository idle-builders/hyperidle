#!/usr/bin/env tsx
import { type GraphDoor, type GraphSub, loadGraph, type Touches } from "./trace-build.js";
import { rel } from "./trace-lib.js";

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

const kindFilter = process.argv.includes("--ui")
	? "ui"
	: process.argv.includes("--agent")
		? "agent"
		: process.argv.includes("--scheduler")
			? "scheduler"
			: null;

const graph = loadGraph(process.argv.includes("--rebuild"));
const q = query.toLowerCase();

function touchesMatch(t: Touches): string[] {
	const via: string[] = [];
	for (const e of t.events) if (e.toLowerCase().includes(q)) via.push(`emits event ${e}`);
	for (const tb of t.tables) if (tb.toLowerCase().includes(q)) via.push(`touches table ${tb}`);
	for (const p of t.ports) if (p.toLowerCase().includes(q)) via.push(`port ${p}`);
	for (const c of t.calls) if (c.toLowerCase().includes(q)) via.push(`calls ${c}`);
	return [...new Set(via)];
}

interface DoorMatch {
	door: GraphDoor;
	via: string[];
}
interface SubMatch {
	sub: GraphSub;
	via: string[];
}

const doorKey = (d: GraphDoor): string => `${d.file}:${d.line}`;
const subKey = (s: GraphSub): string => `${s.file}:${s.line}`;

const doorMatches = new Map<string, DoorMatch>();
for (const door of graph.doors) {
	if (kindFilter && door.kind !== kindFilter) continue;
	if (!door.touches) continue;
	const via = touchesMatch(door.touches);
	if (via.length > 0) doorMatches.set(doorKey(door), { door, via });
}

const subMatches = new Map<string, SubMatch>();
for (const sub of graph.events.subs) {
	const via: string[] = [];
	if (sub.event.toLowerCase().includes(q)) via.push(`subscribes to ${sub.event}`);
	if (sub.touches) via.push(...touchesMatch(sub.touches));
	if (via.length > 0) subMatches.set(subKey(sub), { sub, via: [...new Set(via)] });
}

const seamByLeaf = new Map<string, { httpMethod: string; path: string; portMethod: string }>();
for (const s of graph.seams) seamByLeaf.set(s.portMethod, s);
const routeDoor = new Map<string, GraphDoor>();
for (const d of graph.doors) {
	if (d.kind !== "ui") continue;
	routeDoor.set(d.label.replace(/\s+/g, " ").trim(), d);
}
const subsByEvent = new Map<string, GraphSub[]>();
for (const s of graph.events.subs) {
	const list = subsByEvent.get(s.event) ?? [];
	list.push(s);
	subsByEvent.set(s.event, list);
}

for (let round = 0; round < 4; round++) {
	let grew = false;

	for (const sub of graph.events.subs) {
		const key = subKey(sub);
		if (subMatches.has(key) || !sub.touches) continue;
		const via: string[] = [];
		for (const e of sub.touches.events) {
			for (const downstream of subsByEvent.get(e) ?? []) {
				if (subMatches.has(subKey(downstream)))
					via.push(
						`emits ${e} → subscriber ${downstream.handler ?? downstream.enclosing} (${rel(downstream.file)}:${downstream.line})`,
					);
			}
		}
		if (via.length > 0) {
			subMatches.set(key, { sub, via });
			grew = true;
		}
	}

	for (const door of graph.doors) {
		if (kindFilter && door.kind !== kindFilter) continue;
		const key = doorKey(door);
		if (doorMatches.has(key) || !door.touches) continue;
		const via: string[] = [];
		for (const p of door.touches.ports) {
			const leaf = p.split(".").pop() ?? p;
			const seam = seamByLeaf.get(leaf);
			if (!seam) continue;
			const backing = routeDoor.get(`${seam.httpMethod} ${seam.path}`);
			if (backing && doorMatches.has(doorKey(backing)))
				via.push(`seam ${p} → ${backing.label.replace(/\s+/g, " ").trim()}`);
		}
		for (const e of door.touches.events) {
			for (const s of subsByEvent.get(e) ?? []) {
				if (subMatches.has(subKey(s)))
					via.push(
						`emits ${e} → subscriber ${s.handler ?? s.enclosing} (${rel(s.file)}:${s.line})`,
					);
			}
		}
		if (via.length > 0) {
			doorMatches.set(key, { door, via });
			grew = true;
		}
	}

	if (!grew) break;
}

const doorList = [...doorMatches.values()];
const subList = [...subMatches.values()];
if (doorList.length === 0 && subList.length === 0) {
	console.log(`nothing references "${query}" (graph head ${graph.head.slice(0, 8)})`);
	process.exit(0);
}

const order: GraphDoor["kind"][] = ["ui", "agent", "scheduler"];
const titles: Record<GraphDoor["kind"], string> = {
	ui: "UI DOORS",
	agent: "AGENT DOORS",
	scheduler: "SCHEDULER DOORS",
};
for (const kind of order) {
	const list = doorList.filter((m) => m.door.kind === kind);
	if (list.length === 0) continue;
	console.log(`\n${titles[kind]} using "${query}" — ${list.length}`);
	for (const { door, via } of list) {
		console.log(`  ${door.label.padEnd(46)} ${rel(door.file)}:${door.line}`);
		for (const v of via.slice(0, 6)) console.log(`      ${v}`);
		if (via.length > 6) console.log(`      (+ ${via.length - 6} more)`);
	}
}

if (subList.length > 0) {
	console.log(`\nEVENT SUBSCRIBERS using "${query}" — ${subList.length}`);
	for (const { sub, via } of subList) {
		console.log(
			`  on ${sub.event.padEnd(32)} ${rel(sub.file)}:${sub.line}  handler=${sub.handler ?? "(inline)"}`,
		);
		for (const v of via.slice(0, 6)) console.log(`      ${v}`);
		if (via.length > 6) console.log(`      (+ ${via.length - 6} more)`);
	}
}

console.log(
	`\n${doorList.length} doors + ${subList.length} subscribers use "${query}" (graph head ${graph.head.slice(0, 8)})`,
);
