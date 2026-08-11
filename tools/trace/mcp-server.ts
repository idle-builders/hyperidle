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
		title: "List entry points",
		description:
			"List every way work can enter HyperIdle: HTTP endpoints the UI calls, tools an AI agent can invoke, messages a remote worker can send, and scheduled timers. USE WHEN you need to discover what can trigger the system, find where a feature starts, or enumerate entry points before tracing deeper. Optional: kind narrows to ui|agent|scheduler; keyword filters results by text.",
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
		title: "Who uses this?",
		description:
			"Given a name — a database table, an event, a function, or a cross-layer method — find every entry point and event handler that touches it, even indirectly. It follows calls across files, through startup wiring (dependency injection), across the core<->agent boundary, and through event publish/subscribe chains. USE WHEN you need to know which UI pages / agent tools / scheduled jobs use something, or what a change to it could affect (its blast radius). Note: 'no matches' means the graph found nothing, not that nothing exists — dynamic dispatch and config-driven behavior are not tracked.",
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
		title: "Trace an event",
		description:
			"Show who publishes and who handles a given event, and what each handler does. Events are how parts of HyperIdle react to things that happened (for example session_ended or task_state_changed). Pass event='__list__' to see every event with emit/handle counts. USE WHEN you need to answer 'what happens when X happens?' or follow an event-driven flow across the system.",
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
		title: "Rebuild the graph",
		description:
			"The graph normally updates itself when the code changes. USE WHEN results look out of date after you edited code and you want to force a refresh. Rebuilds the graph and returns statistics.",
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
