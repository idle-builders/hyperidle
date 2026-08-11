#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type ts from "typescript";
import {
	collectDoors,
	collectEventWiring,
	collectSeamMap,
	fingerprint,
	rel,
	type SeamEntry,
	workEntityTableMap,
} from "./trace-lib.js";

export const GRAPH_FILE = "tools/trace/graph.json";

export interface Touches {
	events: string[];
	tables: string[];
	ports: string[];
	calls: string[];
}

export interface GraphDoor {
	kind: "ui" | "agent" | "scheduler";
	label: string;
	file: string;
	line: number;
	detail: string;
	touches: Touches | null;
}

export interface GraphSub {
	event: string;
	file: string;
	line: number;
	enclosing: string;
	handler: string | null;
	touches: Touches | null;
}

export interface GraphEvents {
	emits: { event: string; file: string; line: number; enclosing: string; inferred: boolean }[];
	subs: GraphSub[];
	wildcards: { file: string; line: number; enclosing: string }[];
	dynamic: { file: string; line: number; enclosing: string; expr: string }[];
}

export interface Graph {
	head: string;
	builtAt: string;
	doors: GraphDoor[];
	events: GraphEvents;
	entityTables: Record<string, string>;
	seams: SeamEntry[];
}

function toTouches(anchor: ts.Node | null | undefined, file: string | undefined): Touches | null {
	if (!(anchor && file)) return null;
	const fp = fingerprint(anchor, file);
	return {
		events: [...fp.events],
		tables: [...fp.tables],
		ports: [...fp.ports],
		calls: [...fp.calls],
	};
}

export function buildGraph(): Graph {
	const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	const doors = collectDoors();
	const graphDoors: GraphDoor[] = doors.map((d) => ({
		kind: d.kind,
		label: d.label,
		file: d.file,
		line: d.line,
		detail: d.detail,
		touches: toTouches(d.anchor, d.file),
	}));
	const wiring = collectEventWiring();
	const events: GraphEvents = {
		emits: wiring.emits,
		subs: wiring.subs.map((s) => ({
			event: s.event,
			file: s.file,
			line: s.line,
			enclosing: s.enclosing,
			handler: s.handler,
			touches: toTouches(s.anchor, s.anchorFile),
		})),
		wildcards: wiring.wildcards,
		dynamic: wiring.dynamic,
	};
	return {
		head,
		builtAt: new Date().toISOString(),
		doors: graphDoors,
		events,
		entityTables: Object.fromEntries(workEntityTableMap()),
		seams: collectSeamMap(),
	};
}

export function loadGraph(force = false): Graph {
	const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	if (!force && existsSync(GRAPH_FILE)) {
		try {
			const g = JSON.parse(readFileSync(GRAPH_FILE, "utf8")) as Graph;
			if (g.head === head) return g;
		} catch {
			// corrupt artifact — rebuild
		}
	}
	const graph = buildGraph();
	writeFileSync(GRAPH_FILE, JSON.stringify(graph));
	return graph;
}

if (process.argv[1]?.endsWith("trace-build.ts")) {
	const t0 = Date.now();
	const graph = loadGraph(process.argv.includes("--rebuild"));
	const withTouches = graph.doors.filter((d) => d.touches).length;
	const subsFingerprinted = graph.events.subs.filter((s) => s.touches).length;
	console.log(`graph built in ${Date.now() - t0}ms`);
	console.log(`  head: ${graph.head.slice(0, 8)}`);
	console.log(`  doors: ${graph.doors.length} (${withTouches} fingerprinted)`);
	console.log(
		`  event emits: ${graph.events.emits.length}, subs: ${graph.events.subs.length} (${subsFingerprinted} fingerprinted), wildcards: ${graph.events.wildcards.length}`,
	);
	console.log(`  entity→table: ${Object.keys(graph.entityTables).length}`);
	console.log(`  seam methods: ${graph.seams.length}`);
	console.log(`  artifact: ${rel(GRAPH_FILE)}`);
}
