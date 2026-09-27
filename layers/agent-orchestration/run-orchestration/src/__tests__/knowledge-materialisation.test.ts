/**
 * @lore A `BakedContextDocument` carrying a real `parentChain` materialises as nested directories (not flat), and every ancestor directory gets its own `.fabric/manifest.json` entry (id → {source_path, scopeKind, version}) so a later writeback session finds it instead of minting a duplicate folder item.
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
	documents: [
		{
			id: "k-leaf",
			title: "Objection handling",
			body: "leaf body",
			format: "markdown",
			version: 1,
			slot: "ordinary",
			scopeKind: "team",
			agentBindingId: null,
			parentChain: [
				{ id: "k-root", title: "Product", scopeKind: "factory", version: 3 },
				{ id: "k-mid", title: "Pricing", scopeKind: "team", version: 2 },
			],
		},
		// @lore Proves `slot` (not a stale `role` field) is what routes an item away from the ordinary tree — a "rule" item must land in knowledge/rules/, never nested under its parentChain. If the reader fell back to a default (the old cast-hiding-a-typo failure mode), this item would materialise under knowledge/Product/Pricing instead.
		{
			id: "k-rule",
			title: "Deploy checklist",
			body: "rule body",
			format: "markdown",
			version: 1,
			slot: "rule",
			scopeKind: "team",
			agentBindingId: null,
			parentChain: [
				{ id: "k-root", title: "Product", scopeKind: "factory", version: 3 },
				{ id: "k-mid", title: "Pricing", scopeKind: "team", version: 2 },
			],
		},
	],
};

describe("writeContextBundle: nested materialisation", () => {
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
			teamId: "team-tree-1",
			taskFree: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: BUNDLE,
		} as unknown as AssembleAgentContextInput;

		await assembler.assembleAgentContext(input);

		const pricingDirEntries = fs.readdirSync(path.join(sandboxPath, "knowledge/Product/Pricing"));
		// Only the ordinary leaf lands here (plus its index) — the "rule"-slotted
		// sibling below must not fall through to the parentChain-nested tree.
		expect(pricingDirEntries).toHaveLength(2);
		const leafFile = pricingDirEntries.find((f) => f !== "index.md");
		expect(leafFile).toBeDefined();
		expect(
			fs.readFileSync(
				path.join(sandboxPath, "knowledge/Product/Pricing", leafFile as string),
				"utf8",
			),
		).toBe("leaf body");

		// @lore A "rule"-slotted item lands in knowledge/rules/, not nested under its parentChain — proves the reader keys off `slot`, not a default that would fall through to the ordinary-tree path.
		const ruleDirEntries = fs.readdirSync(path.join(sandboxPath, "knowledge/rules"));
		expect(ruleDirEntries).toHaveLength(1);
		expect(
			fs.readFileSync(
				path.join(sandboxPath, "knowledge/rules", ruleDirEntries[0] as string),
				"utf8",
			),
		).toBe("rule body");

		// Every ancestor gets an index, holding only its own title (no
		// fabricated body — plan.md: "incomplete, not fabricated").
		expect(fs.readFileSync(path.join(sandboxPath, "knowledge/Product/index.md"), "utf8")).toBe(
			"# Product\n",
		);
		expect(
			fs.readFileSync(path.join(sandboxPath, "knowledge/Product/Pricing/index.md"), "utf8"),
		).toBe("# Pricing\n");

		// Every ancestor directory gets its own manifest entry —
		// not just the leaf — so writeback's ensureDirectoryChainItem finds it
		// instead of minting a duplicate.
		const manifest = JSON.parse(
			fs.readFileSync(path.join(sandboxPath, ".fabric/manifest.json"), "utf8"),
		) as {
			items: Record<
				string,
				// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
				{ source_path: string; scopeKind: string; version: number }
			>;
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
		// The leaf's own manifest entry carries its real
		// scopeKind too, not an undefined field the reader defaults away.
		expect(manifest.items["k-leaf"]).toMatchObject({ scopeKind: "team" });
	});

	// @lore nested-knowledge-real: the ordinary shape of a real knowledge tree — a parent document with a body of its own AND selected children, both independently selected into the same bundle. Previously the parent's real body was dumped into a stray sibling leaf file next to its own directory, while the directory's index.md stayed title-only forever — contradicting plan.md's "a parent as a directory containing index.md with its own body."
	test("a selected parent with a body AND selected children writes its real body into index.md, with no stray sibling leaf", async () => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "tree-materialisation-parent-"));
		const assembler = createContextAssembler(poisonedPorts());

		const bundle: BakedContextBundle = {
			kind: "task",
			task: { id: "task-tree-2", title: "Do the thing", description: null, state: "in_progress" },
			ancestors: [],
			agent: { id: "agent-tree-2", name: "Ada", role: "builder" },
			team: { id: "team-tree-2", name: "Alpha" },
			documents: [
				{
					id: "k-parent",
					title: "Pricing",
					body: "PARENT BODY — must land in index.md, not a stray sibling file",
					format: "markdown",
					version: 5,
					slot: "ordinary",
					scopeKind: "team",
					agentBindingId: null,
					parentChain: [{ id: "k-root", title: "Product", scopeKind: "factory", version: 3 }],
				},
				{
					id: "k-child",
					title: "Objection handling",
					body: "child body",
					format: "markdown",
					version: 1,
					slot: "ordinary",
					scopeKind: "team",
					agentBindingId: null,
					parentChain: [
						{ id: "k-root", title: "Product", scopeKind: "factory", version: 3 },
						{ id: "k-parent", title: "Pricing", scopeKind: "team", version: 5 },
					],
				},
			],
		};

		const input = {
			sandboxPath,
			sessionId: "session-tree-2",
			taskId: "task-tree-2",
			agentId: "agent-tree-2",
			teamId: "team-tree-2",
			taskFree: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		} as unknown as AssembleAgentContextInput;

		await assembler.assembleAgentContext(input);

		const pricingDir = path.join(sandboxPath, "knowledge/Product/Pricing");
		expect(fs.readFileSync(path.join(pricingDir, "index.md"), "utf8")).toBe(
			"PARENT BODY — must land in index.md, not a stray sibling file",
		);

		// No stray sibling leaf for the parent next to its own directory —
		// only its own title-only index.md and the Pricing directory.
		const productEntries = fs.readdirSync(path.join(sandboxPath, "knowledge/Product")).sort();
		expect(productEntries).toEqual(["Pricing", "index.md"]);

		// The child still lands inside the parent's directory, body intact.
		const pricingEntries = fs.readdirSync(pricingDir);
		const childFile = pricingEntries.find((f) => f !== "index.md");
		expect(childFile).toBeDefined();
		expect(fs.readFileSync(path.join(pricingDir, childFile as string), "utf8")).toBe("child body");

		// The unselected root ancestor still only gets a title-only index —
		// that behaviour must not regress.
		expect(fs.readFileSync(path.join(sandboxPath, "knowledge/Product/index.md"), "utf8")).toBe(
			"# Product\n",
		);

		const manifest = JSON.parse(
			fs.readFileSync(path.join(sandboxPath, ".fabric/manifest.json"), "utf8"),
		) as {
			items: Record<
				string,
				// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
				{ source_path: string; scopeKind: string; version: number }
			>;
		};
		expect(manifest.items["k-parent"]).toEqual({
			source_path: "knowledge/Product/Pricing",
			scopeKind: "team",
			version: 5,
			format: "markdown",
		});
	});
});
