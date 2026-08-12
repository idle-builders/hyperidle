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
import type { AnySchema as McpAnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";

import { type Graph, loadGraph } from "./trace-build.js";
import { rel } from "./trace-lib.js";
import { type DoorKind, listEvents, queryDoors, queryEvent, queryUses } from "./trace-query.js";

const kindEnum = z.enum(["ui", "agent", "scheduler"]).optional();

// @lore Mirrors mcp-bridge.ts AF4/§9: the MCP SDK dedupes zod to 3.25.76 while
// this package uses zod 4.x — the $ZodType brands are nominally distinct, so a
// zod-4 schema is not directly assignable to the SDK's AnySchema. The runtime
// object is identical; this bridges the brand only. NOT a wire-shape change.
function asMcpInputSchema(schema: unknown): McpAnySchema {
	return schema as McpAnySchema;
}

type DoorArgs = { kind?: "ui" | "agent" | "scheduler"; keyword?: string };
type UsesArgs = { symbol: string; kind?: "ui" | "agent" | "scheduler" };
type DoorTouchArgs = { door: string; kind?: "ui" | "agent" | "scheduler" };
type EventArgs = { event: string };

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
			"List every way work can enter HyperIdle: HTTP endpoints the UI calls, tools an AI agent can invoke, messages a remote worker can send, and scheduled timers. USE WHEN you want to know how the system gets triggered; where a feature starts or begins; what endpoints / routes / APIs exist; what tools agents can call; what scheduled / cron / timer jobs run; what the external surface, public interface, or attack surface is; or where to start understanding a feature. Also use it to enumerate entry points before tracing one in depth. Optional: kind narrows to ui|agent|scheduler; keyword filters results by text.",
		inputSchema: asMcpInputSchema(z.object({ kind: kindEnum, keyword: z.string().optional() })),
	},
	({ kind, keyword }: DoorArgs) => {
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
			"Given a name — a database table, an event, a function, a method, or a constant — find every entry point and event handler that uses or reaches it, even indirectly. It follows calls across files, 			through startup wiring (dependency injection), across the core<->agent boundary, and through event publish/subscribe chains. Direction is bottom-up: you name something deep in the code, it tells you which ways-in eventually reach it. USE WHEN you want to know who uses / calls / invokes / references / depends on something; which UI pages / agent tools / scheduled jobs touch it; what writes to or reads from a table; where an event or a value comes from (who produces it); whether something is unused / dead / safe to delete, rename, or move; or what a change to it could break or affect (its blast radius / impact / consequences / dependents). Note: 'no matches' means the graph found nothing, not that nothing exists — dynamic dispatch and config-driven behavior are not tracked.",
		inputSchema: asMcpInputSchema(z.object({ symbol: z.string(), kind: kindEnum })),
	},
	({ symbol, kind }: UsesArgs) => {
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
	"trace_door",
	{
		title: "What does this entry point touch?",
		description:
			"Given an entry point (an HTTP route, agent tool, worker message, or scheduled timer — matched by text in its name), show what it reaches: the database tables it reads/writes, the events it publishes, the cross-layer methods it calls, and the functions it invokes. This is the forward direction — start from a way-in, see what it touches. USE WHEN you want to know what an endpoint / route / tool / timer does; what tables / events / services a feature touches; what happens inside a specific entry point; or what a door reaches end-to-end. For the reverse question (who uses X), use trace_uses instead. Optional: kind narrows to ui|agent|scheduler.",
		inputSchema: asMcpInputSchema(z.object({ door: z.string(), kind: kindEnum })),
	},
	({ door, kind }: DoorTouchArgs) => {
		const graph = loadGraph();
		const q = door.replace(/\s+/g, " ").trim().toLowerCase();
		const doors = graph.doors.filter((d) => {
			if (kind && d.kind !== kind) return false;
			const label = d.label.replace(/\s+/g, " ").trim().toLowerCase();
			return label.includes(q) || d.detail.toLowerCase().includes(q);
		});
		return json({
			head: graphHead(graph),
			door,
			count: doors.length,
			doors: doors.map((d) => ({
				kind: d.kind,
				label: d.label.replace(/\s+/g, " ").trim(),
				location: `${rel(d.file)}:${d.line}`,
				touches: d.touches
					? {
							tables: d.touches.tables,
							events: d.touches.events,
							crossLayerCalls: d.touches.ports,
							functions: d.touches.calls.filter((c) => !c.startsWith("di:")).slice(0, 20),
							functionCount: d.touches.calls.length,
						}
					: null,
			})),
		});
	},
);

server.registerTool(
	"trace_event",
	{
		title: "Trace an event",
		description:
			"Show who publishes and who handles a given event, and what each handler does. Events are how parts of HyperIdle react to things that happened (for example session_ended or task_state_changed). Pass event='__list__' to see every event with publish/handle counts. USE WHEN you want to know what happens when something happens; what reacts to / is triggered by / listens to / handles / subscribes to an event; where an event comes from or who emits / publishes / fires it; or what side effects or cascades follow an event.",
		inputSchema: asMcpInputSchema(z.object({ event: z.string() })),
	},
	({ event }: EventArgs) => {
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
			"The graph normally updates itself when the code changes. USE WHEN trace results look wrong, stale, or out of date after you edited code, or you want to force the graph to refresh / regenerate / update. Rebuilds the graph and returns statistics.",
		inputSchema: asMcpInputSchema(z.object({})),
	},
	() => {
		const graph = loadGraph(true);
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

// @lore Harnesses spawn this server at session start. Warm the graph here so
// an agent's first query never pays for a full build and a fresh worktree
// needs no manual trace-build step. loadGraph is synchronous, so while the
// warmup builds, incoming requests simply queue on the event loop and are
// answered from the warm artifact the moment it lands — no race, no double
// build (handlers' own loadGraph() then hits the cached-head fast path).
setTimeout(() => {
	const t0 = Date.now();
	try {
		const graph = loadGraph();
		console.error(
			`[hyperidle-trace] graph warm (${graph.head.slice(0, 8)}) in ${Date.now() - t0}ms`,
		);
	} catch (err) {
		console.error(`[hyperidle-trace] warmup failed: ${err}`);
	}
}, 0);
