#!/usr/bin/env tsx

// HyperIdle code-graph MCP server. Exposes the persisted trace graph
// (tools/trace/graph.json) as MCP tools so agents can answer "what is used
// where" without grep/read chains. Stdio transport; registered in .mcp.json.
//
// The graph is rebuilt automatically when HEAD changes. Run trace-build.ts
// --rebuild to force a refresh.

import { dirname } from "node:path";
import { chdir } from "node:process";
import { fileURLToPath } from "node:url";

// Resolve the repo root from this file's location (tools/trace/mcp-server.ts)
// and chdir there so relative paths + git commands work no matter what cwd the
// MCP client launches us from.
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
chdir(repoRoot);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { buildGraph, type Graph, loadGraph } from "./trace-build.js";
import { rel } from "./trace-lib.js";
import { type DoorKind, listEvents, queryDoors, queryEvent, queryUses } from "./trace-query.js";

const kindEnum = z.enum(["ui", "agent", "scheduler"]).optional();

function json(value: unknown): { content: { type: "text"; text: string }[] } {
	return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function graphHead(g: Graph): string {
	return g.head.slice(0, 8);
}

const server = new McpServer({ name: "hyperidle-trace", version: "0.1.0" });

server.registerTool(
	"trace_doors",
	{
		title: "List entry-point doors",
		description:
			"List HyperIdle's entry points ('doors'): UI HTTP routes, agent doors (MCP tools, worker protocol, agent-facing HTTP/WS), and scheduler ticks. Use to discover WHAT can trigger the system before tracing a feature. Optional kind narrows to ui|agent|scheduler; keyword filters by substring of the route/tool/tick.",
		inputSchema: { kind: kindEnum, keyword: z.string().optional() },
	},
	({ kind, keyword }) => {
		const graph = loadGraph();
		const { doors } = queryDoors(graph, (kind ?? null) as DoorKind | null, keyword ?? null);
		return json({
			head: graphHead(graph),
			count: doors.length,
			doors: doors.map((d) => ({
				kind: d.kind,
				label: d.label.replace(/\s+/g, " ").trim(),
				location: `${rel(d.file)}:${d.line}`,
				detail: d.detail,
			})),
		});
	},
);

server.registerTool(
	"trace_uses",
	{
		title: "Who uses this symbol?",
		description:
			"Reverse reachability: find every door and event subscriber whose handler body uses <symbol> — a table name, event type, port/seam method, or any function. Follows cross-file imports, entity->table resolution, seam (port->route) crossings, DI wiring, and event chains. Use to answer 'which UI surfaces / agent tools / schedulers touch X?' and to gauge blast radius before a change. A 'no matches' answer is absence of evidence, not proof of absence (reflection and DB-config dispatch are invisible).",
		inputSchema: {
			symbol: z.string(),
			kind: kindEnum,
		},
	},
	({ symbol, kind }) => {
		const graph = loadGraph();
		const result = queryUses(graph, symbol, (kind ?? null) as DoorKind | null);
		return json({
			head: graphHead(graph),
			symbol,
			doorCount: result.doors.length,
			subscriberCount: result.subscribers.length,
			doors: result.doors.map(({ door, via }) => ({
				kind: door.kind,
				label: door.label.replace(/\s+/g, " ").trim(),
				location: `${rel(door.file)}:${door.line}`,
				via: via.slice(0, 6),
			})),
			subscribers: result.subscribers.map(({ sub, via }) => ({
				event: sub.event,
				location: `${rel(sub.file)}:${sub.line}`,
				handler: sub.handler ?? "(inline)",
				via: via.slice(0, 6),
			})),
		});
	},
);

server.registerTool(
	"trace_event",
	{
		title: "Trace a domain event",
		description:
			"Show who emits and who subscribes to a domain event type, and what each subscriber's handler touches. Pass event='__list__' to get every event type with emit/sub counts. Use to answer 'what happens when X fires?' and to follow event-driven flows (e.g. session_ended reactions).",
		inputSchema: { event: z.string() },
	},
	({ event }) => {
		const graph = loadGraph();
		if (event === "__list__") {
			return json(listEvents(graph));
		}
		const result = queryEvent(graph, event);
		if (!result) {
			return json({ head: graphHead(graph), event, found: false });
		}
		return json({
			head: graphHead(graph),
			event,
			emits: result.emits.map((e) => ({
				location: `${rel(e.file)}:${e.line}`,
				enclosing: e.enclosing,
			})),
			subscribers: result.subs.map((s) => ({
				location: `${rel(s.file)}:${s.line}`,
				handler: s.handler ?? "(inline)",
				touches: s.touches
					? {
							events: s.touches.events,
							tables: s.touches.tables,
							ports: s.touches.ports,
						}
					: null,
			})),
			wildcardSubscribers: result.wildcards.map((w) => `${rel(w.file)}:${w.line}`),
		});
	},
);

server.registerTool(
	"trace_rebuild",
	{
		title: "Rebuild the trace graph",
		description:
			"Force a rebuild of the code graph from the current working tree (normally automatic when HEAD changes). Use only if trace output looks stale after local edits. Returns build stats.",
		inputSchema: {},
	},
	() => {
		const graph = buildGraph();
		return json({
			head: graphHead(graph),
			doors: graph.doors.length,
			eventEmits: graph.events.emits.length,
			eventSubs: graph.events.subs.length,
			seams: graph.seams.length,
		});
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[hyperidle-trace] MCP server ready at ${repoRoot}`);
