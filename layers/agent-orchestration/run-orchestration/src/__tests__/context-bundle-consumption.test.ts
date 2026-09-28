/**
 * When a `contextBundle` is supplied, `assembleAgentContext` is pure
 * format/write: zero calls into `ContextAssemblyPorts`' `knowledge`/`work`/
 * `users`/`routine`/`org` members. Proof mechanism: every port method is
 * wired to throw if called at all (a "poisoned" ports object) — reaching the
 * assertions below without a throw is itself the zero-read proof.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BakedContextBundle } from "@hyperidle/domain-model";
import { afterEach, describe, expect, test } from "vitest";
import { createContextAssembler } from "../context.js";

type ContextAssemblerPorts = Parameters<typeof createContextAssembler>[0];
type AssembleAgentContextFn = ReturnType<typeof createContextAssembler>["assembleAgentContext"];
type AssembleAgentContextInput = Parameters<AssembleAgentContextFn>[0];

/**
 * Every method throws — proves the function under test never calls back into
 * any of these ports when a `contextBundle` is supplied. A thrown error here
 * is a genuine zero-read-guarantee violation, not a test-infra failure.
 */
function poisonedPorts(): ContextAssemblerPorts {
	const poison = (name: string) => (): never => {
		throw new Error(
			`ZERO-READ VIOLATION: ports.${name} was called — contextBundle consumption must not read core state`,
		);
	};
	return {
		knowledge: {
			list: poison("knowledge.list"),
			rankAndBudget: poison("knowledge.rankAndBudget"),
			countTokens: poison("knowledge.countTokens"),
		},
		work: {
			getTaskById: poison("work.getTaskById"),
			getBetById: poison("work.getBetById"),
		},
		users: {
			getUserById: poison("users.getUserById"),
		},
		routine: {
			getRoutineById: poison("routine.getRoutineById"),
		},
		filesystems: {
			startWatcher: poison("filesystems.startWatcher"),
		},
		org: {
			getTeamById: poison("org.getTeamById"),
		},
	} as unknown as ContextAssemblerPorts;
}

const BUNDLE: BakedContextBundle = {
	kind: "task",
	task: {
		id: "task-i12-c1",
		title: "Do the thing",
		description: "Bundle-sourced description",
		state: "in_progress",
		doneCondition: null,
	},
	ancestors: [],
	agent: { id: "agent-i12-c1", name: "Ada", role: "builder" },
	team: { id: "team-i12-c1", name: "Alpha" },
	documents: [
		{
			id: "k-l4-i12",
			title: "Factory item",
			body: "factory-wide body",
			format: "markdown",
			version: 1,
			parentChain: [],
			scopeKind: "factory",
			slot: "ordinary",
			agentBindingId: null,
		},
		{
			id: "k-l2-i12",
			title: "Product item",
			body: "team-scoped body",
			format: "markdown",
			version: 1,
			parentChain: [],
			scopeKind: "factory",
			slot: "ordinary",
			agentBindingId: null,
		},
		{
			id: "k-l3-i12",
			title: "Practice item",
			body: "community-scoped body",
			format: "markdown",
			version: 1,
			parentChain: [],
			scopeKind: "factory",
			slot: "ordinary",
			agentBindingId: null,
		},
	],
};

describe("assembleAgentContext — contextBundle consumption", () => {
	let sandboxPath: string | undefined;
	afterEach(() => {
		if (sandboxPath) fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	test("writes session.toon + knowledge/ from the baked bundle with ZERO port reads", async () => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "i12-context-bundle-"));
		const assembler = createContextAssembler(poisonedPorts());

		const input = {
			sandboxPath,
			sessionId: "session-i12-c1",
			taskId: "task-i12-c1",
			agentId: "agent-i12-c1",
			teamId: "team-i12-c1",
			taskFree: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: BUNDLE,
		} as unknown as AssembleAgentContextInput;

		await assembler.assembleAgentContext(input);

		const toonPath = path.join(sandboxPath, "context/session.toon");
		expect(fs.existsSync(toonPath)).toBe(true);
		const toon = fs.readFileSync(toonPath, "utf8");
		expect(toon).toContain("task-i12-c1");
		expect(toon).toContain("Alpha");
		expect(toon).toContain("Ada");

		// @lore every ordinary item with an empty parentChain materialises flat into knowledge/.
		const knowledgeDir = path.join(sandboxPath, "knowledge");
		expect(fs.existsSync(knowledgeDir)).toBe(true);
		const knowledgeFiles = fs
			.readdirSync(knowledgeDir, { withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name);
		expect(knowledgeFiles.length).toBe(3);
		const bodies = knowledgeFiles.map((f) => fs.readFileSync(path.join(knowledgeDir, f), "utf8"));
		expect(bodies.sort()).toEqual(
			["factory-wide body", "team-scoped body", "community-scoped body"].sort(),
		);

		const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
		expect(fs.existsSync(manifestPath)).toBe(true);
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			items: Record<string, unknown>;
		};
		expect(Object.keys(manifest.items).sort()).toEqual(["k-l4-i12", "k-l2-i12", "k-l3-i12"].sort());
	});
});
