import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRAPH_FILE, type Graph, type GraphDoor, loadGraph } from "./trace-build.js";
import { queryUses } from "./trace-query.js";

function door(kind: GraphDoor["kind"], label: string, touches: GraphDoor["touches"]): GraphDoor {
	return { kind, label, file: `layers/x/${label}.ts`, line: 1, detail: "route", touches };
}

function syntheticGraph(): Graph {
	return {
		head: "synthetic",
		builtAt: new Date().toISOString(),
		doors: [
			door("ui", "POST   /api/tasks/:id/handoff", {
				events: ["task_state_changed"],
				tables: [],
				ports: [],
				calls: [],
			}),
			door("agent", "TOOL   handoff_to", {
				events: [],
				tables: [],
				ports: ["coreApi.handoffTask"],
				calls: [],
			}),
		],
		events: { emits: [], subs: [], wildcards: [], dynamic: [] },
		entityTables: {},
		seams: [
			{
				portMethod: "handoffTask",
				httpMethod: "POST",
				path: "/api/tasks/:id/handoff",
				portFile: "layers/x/seam.ts",
				line: 1,
			},
		],
	};
}

describe("queryUses kind filter", () => {
	it("still crosses seams when filtered to agent doors", () => {
		const result = queryUses(syntheticGraph(), "task_state_changed", "agent");
		expect(result.doors.map((d) => d.door.label)).toContain("TOOL   handoff_to");
		const via = result.doors.find((d) => d.door.label === "TOOL   handoff_to")?.via ?? [];
		expect(via.some((v) => v.startsWith("seam"))).toBe(true);
	});

	it("returns only the filtered kind", () => {
		const agent = queryUses(syntheticGraph(), "task_state_changed", "agent");
		expect(agent.doors.every((d) => d.door.kind === "agent")).toBe(true);
		const ui = queryUses(syntheticGraph(), "task_state_changed", "ui");
		expect(ui.doors.map((d) => d.door.label)).toEqual(["POST   /api/tasks/:id/handoff"]);
		const all = queryUses(syntheticGraph(), "task_state_changed", null);
		expect(all.doors).toHaveLength(2);
	});
});

describe("loadGraph", () => {
	// Full-repo rebuild on a cold CI runner far exceeds the 5s default.
	it("persists the artifact on a forced rebuild", () => {
		const graph = loadGraph(true);
		expect(existsSync(GRAPH_FILE)).toBe(true);
		const onDisk = JSON.parse(readFileSync(GRAPH_FILE, "utf8")) as Graph;
		expect(onDisk.head).toBe(graph.head);
		const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
		expect(graph.head).toBe(head);
	}, 60_000);
});
