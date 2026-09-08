/**
 * @lore nested-knowledge-items architecture.md §5 / review.md B4 & B5 — a
 * `BakedContextKnowledgeItem` carrying a real `parentChain` materialises as
 * nested directories (not flat), and every ancestor directory gets its own
 * `.fabric/manifest.json` entry (id → {source_path, scopeKind, version}) so
 * a later writeback session finds it instead of minting a duplicate folder
 * item.
 *
 * Same poisoned-ports pattern as context-bundle-consumption.test.ts:
 * `writeContextBundle` must do zero DB reads, so a thrown port call here is
 * itself proof of a zero-read violation.
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

function poisonedPorts(): ContextAssemblerPorts {
	const poison = (name: string) => (): never => {
		throw new Error(`ZERO-READ VIOLATION: ports.${name} was called`);
	};
	return {
		knowledge: {
			list: poison("knowledge.list"),
			rankAndBudget: poison("knowledge.rankAndBudget"),
			countTokens: poison("knowledge.countTokens"),
		},
		work: { getTaskById: poison("work.getTaskById"), getBetById: poison("work.getBetById") },
		users: { getUserById: poison("users.getUserById") },
		routine: { getRoutineById: poison("routine.getRoutineById") },
		filesystems: { startWatcher: poison("filesystems.startWatcher") },
		org: { getTeamById: poison("org.getTeamById") },
	} as unknown as ContextAssemblerPorts;
}

const BUNDLE: BakedContextBundle = {
	kind: "task",
	task: { id: "task-tree-1", title: "Do the thing", description: null, state: "in_progress" },
	ancestors: [],
	agent: { id: "agent-tree-1", name: "Ada", role: "builder" },
	team: { id: "team-tree-1", name: "Alpha" },
	knowledge: [
		{
			id: "k-leaf",
			title: "Objection handling",
			body: "leaf body",
			format: "markdown",
			version: 1,
			role: "ordinary",
			scopeKind: "team",
			agentBindingId: null,
			parentChain: [
				{ id: "k-root", title: "Product", scopeKind: "factory", version: 3 },
				{ id: "k-mid", title: "Pricing", scopeKind: "team", version: 2 },
			],
		},
	],
} as unknown as BakedContextBundle;

describe("writeContextBundle: nested materialisation (review.md B4/B5)", () => {
	let sandboxPath: string | undefined;
	afterEach(() => {
		if (sandboxPath) fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	test("a non-empty parentChain writes nested directories with index.md, not a flat file", async () => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "tree-materialisation-"));
		const assembler = createContextAssembler(poisonedPorts());

		const input = {
			sandboxPath,
			sessionId: "session-tree-1",
			taskId: "task-tree-1",
			agentId: "agent-tree-1",
			agentRole: "builder",
			teamId: "team-tree-1",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: BUNDLE,
		} as unknown as AssembleAgentContextInput;

		await assembler.assembleAgentContext(input);

		const leafPath = fs.readdirSync(path.join(sandboxPath, "knowledge/Product/Pricing"));
		const leafFile = leafPath.find((f) => f !== "index.md");
		expect(leafFile).toBeDefined();
		expect(
			fs.readFileSync(path.join(sandboxPath, "knowledge/Product/Pricing", leafFile as string), "utf8"),
		).toBe("leaf body");

		// Every ancestor gets an index, holding only its own title (no
		// fabricated body — plan.md: "incomplete, not fabricated").
		expect(fs.readFileSync(path.join(sandboxPath, "knowledge/Product/index.md"), "utf8")).toBe(
			"# Product\n",
		);
		expect(
			fs.readFileSync(path.join(sandboxPath, "knowledge/Product/Pricing/index.md"), "utf8"),
		).toBe("# Pricing\n");

		// review.md B5: every ancestor directory gets its own manifest entry —
		// not just the leaf — so writeback's ensureDirectoryChainItem finds it
		// instead of minting a duplicate.
		const manifest = JSON.parse(
			fs.readFileSync(path.join(sandboxPath, ".fabric/manifest.json"), "utf8"),
		) as {
			items: Record<string, { source_path: string; scopeKind: string; version: number }>;
		};
		expect(manifest.items["k-root"]).toEqual({
			source_path: "knowledge/Product",
			scopeKind: "factory",
			version: 3,
			format: "markdown",
		});
		expect(manifest.items["k-mid"]).toEqual({
			source_path: "knowledge/Product/Pricing",
			scopeKind: "team",
			version: 2,
			format: "markdown",
		});
		// review.md B6: the leaf's own manifest entry carries its real
		// scopeKind too, not an undefined field the reader defaults away.
		expect(manifest.items["k-leaf"]).toMatchObject({ scopeKind: "team" });
	});
});
