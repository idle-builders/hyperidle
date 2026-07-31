/**
 * AU21 §9 Increment 12 (Decision H3), Wave A (RED) — the regression-pin
 * architecture.md's Increment 12 test (b) requires: "baked ranking output
 * matches the pre-migration ranking for a fixed corpus."
 *
 * Exercises the REAL pre-migration production path unchanged — `runSession`
 * (`../run-orchestration-composition.js`) in `mode: "assemble"`, which still
 * goes through `context.ts`'s `assembleContext` wired to the real
 * `contextPorts.knowledge.{list,rankAndBudget}` (`@hyperidle/knowledge`'s
 * `list`/`rank`) exactly as production runs today — against the NEW
 * `assembleSessionKnowledge` (`@hyperidle/knowledge`) this wave introduces,
 * for an identical fixed corpus (two teams, two practice communities, one
 * factory-wide item) so a genuine relocation bug (wrong scope, wrong
 * community mapping, wrong budget cutoff) would show up as a set mismatch.
 *
 * Currently RED: `@hyperidle/knowledge` has no `assembleSessionKnowledge`
 * export yet — this import fails to resolve.
 *
 * @lore ordering caveat: `context.ts`'s `assembleContext` writes
 * `.fabric/manifest.json` by iterating its L4/L2/L3 arrays in their ORIGINAL
 * DB-fetch order (filtered to the budgeted id set), not in rank-score order —
 * so the manifest's key order is not a reliable proxy for `rankAndBudget`'s
 * actual (score-descending) output order. This test therefore pins SET
 * membership (which items pass the budget + scope/community filter), the
 * observable surface both paths expose in common — not full ordering.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../test-fixtures.js";
import { runSession } from "../run-orchestration-composition.js";

const NOW = "2026-07-31T00:00:00.000Z";
const TEAM_ID = "team-i12-parity";
const OTHER_TEAM_ID = "team-i12-other";
const AGENT_ID = "agent-i12-parity";
const AGENT_ROLE = "builder"; // communityForRole("builder") === "building"
const TASK_ID = "task-i12-parity";
const BET_ID = "bet-i12-parity";
const TASK_DESCRIPTION = "Ship the boundary seam parity check.";

async function seedFixedCorpus(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values([
		{ id: TEAM_ID, name: "Parity Team", phase: "build", createdAt: NOW },
		{ id: OTHER_TEAM_ID, name: "Other Team", phase: "build", createdAt: NOW },
	]);
	await db
		.insert(teamMembers)
		.values({ id: "tm-i12-parity", teamId: TEAM_ID, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: AGENT_ID,
		name: "Parity Agent",
		role: AGENT_ROLE,
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: BET_ID,
		teamId: TEAM_ID,
		description: "I12 parity bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: TASK_ID,
		betId: BET_ID,
		teamId: TEAM_ID,
		title: "I12 parity task",
		description: TASK_DESCRIPTION,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// L4 — factory-wide, always included regardless of team/community.
	await db.insert(knowledgeItems).values({
		id: "item-i12-l4",
		scopeKind: "factory",
		scopeId: null,
		title: "Factory-wide practice",
		body: "Applies to every team and every community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l4",
		knowledgeItemId: "item-i12-l4",
		layer: "L4",
		scopeId: null,
	});

	// L2 — scoped to TEAM_ID (must be included).
	await db.insert(knowledgeItems).values({
		id: "item-i12-l2-in",
		scopeKind: "team",
		scopeId: TEAM_ID,
		title: "Team-scoped product knowledge",
		body: "Specific to the parity team's product.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l2-in",
		knowledgeItemId: "item-i12-l2-in",
		layer: "L2",
		scopeId: TEAM_ID,
	});

	// L2 — scoped to OTHER_TEAM_ID (must be EXCLUDED from a TEAM_ID assembly).
	await db.insert(knowledgeItems).values({
		id: "item-i12-l2-out",
		scopeKind: "team",
		scopeId: OTHER_TEAM_ID,
		title: "Other team's product knowledge",
		body: "Must not leak into the parity team's context.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l2-out",
		knowledgeItemId: "item-i12-l2-out",
		layer: "L2",
		scopeId: OTHER_TEAM_ID,
	});

	// L3 — scoped to "building" (communityForRole("builder")), must be included.
	await db.insert(knowledgeItems).values({
		id: "item-i12-l3-in",
		scopeKind: "practice",
		scopeId: "building",
		title: "Building practice knowledge",
		body: "Relevant to the builder community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l3-in",
		knowledgeItemId: "item-i12-l3-in",
		layer: "L3",
		scopeId: "building",
	});

	// L3 — scoped to "growth" (a different community), must be EXCLUDED.
	await db.insert(knowledgeItems).values({
		id: "item-i12-l3-out",
		scopeKind: "practice",
		scopeId: "growth",
		title: "Growth practice knowledge",
		body: "Not relevant to the builder community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12-l3-out",
		knowledgeItemId: "item-i12-l3-out",
		layer: "L3",
		scopeId: "growth",
	});
}

describe("assembleSessionKnowledge — ranking parity with the pre-migration path (Increment 12 RED)", () => {
	test("returns exactly the same item-id set the real assembleContext/rankAndBudget path budgets in", async ({
		db,
		eventBus,
	}) => {
		await seedFixedCorpus(db);

		// -- OLD path: the real, unmodified production composition. --
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "i12-parity-"));
		try {
			const assembled = await runSession(
				{ db, eventBus },
				{
					mode: "assemble",
					input: {
						db,
						sandboxPath,
						sessionId: "session-i12-parity",
						taskId: TASK_ID,
						agentId: AGENT_ID,
						agentRole: AGENT_ROLE,
						teamId: TEAM_ID,
						isRoutine: false,
						sourceKind: null,
						sourceId: null,
						sourceCorrelation: null,
					},
				},
			);
			expect(assembled.mode).toBe("assembled");
			if (assembled.mode !== "assembled") return;

			const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
				// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
				items: Record<string, { source_path: string }>;
			};
			const oldPathIds = new Set(Object.keys(manifest.items));

			// -- NEW path: the relocated core-side assembler. --
			const { assembleSessionKnowledge } = await import("@hyperidle/knowledge");
			const budgeted = await assembleSessionKnowledge(db, {
				teamId: TEAM_ID,
				agentRole: AGENT_ROLE,
				taskDescription: TASK_DESCRIPTION,
			});
			const newPathIds = new Set(budgeted.map((item: { readonly id: string }) => item.id));

			// Same items pass the budget/scope/community filter on both paths.
			expect(newPathIds).toEqual(oldPathIds);

			// Anchor the actual expected membership so a coincidental empty-set
			// match on both sides can't silently pass.
			expect([...newPathIds].sort()).toEqual(
				["item-i12-l2-in", "item-i12-l3-in", "item-i12-l4"].sort(),
			);
			expect(newPathIds.has("item-i12-l2-out")).toBe(false);
			expect(newPathIds.has("item-i12-l3-out")).toBe(false);
		} finally {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	});

	test("each returned item's layer maps to the correct sandbox zone the old path wrote it to", async ({
		db,
		eventBus,
	}) => {
		await seedFixedCorpus(db);

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "i12-parity-zone-"));
		try {
			const assembled = await runSession(
				{ db, eventBus },
				{
					mode: "assemble",
					input: {
						db,
						sandboxPath,
						sessionId: "session-i12-parity-zone",
						taskId: TASK_ID,
						agentId: AGENT_ID,
						agentRole: AGENT_ROLE,
						teamId: TEAM_ID,
						isRoutine: false,
						sourceKind: null,
						sourceId: null,
						sourceCorrelation: null,
					},
				},
			);
			expect(assembled.mode).toBe("assembled");
			if (assembled.mode !== "assembled") return;

			const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
				// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
				items: Record<string, { source_path: string }>;
			};

			const { assembleSessionKnowledge } = await import("@hyperidle/knowledge");
			const budgeted = await assembleSessionKnowledge(db, {
				teamId: TEAM_ID,
				agentRole: AGENT_ROLE,
				taskDescription: TASK_DESCRIPTION,
			});

			const zoneByLayer: Record<string, string> = {
				L4: "context/factory",
				L2: "context/product",
				L3: "context/practices",
			};

			for (const item of budgeted) {
				const entry = manifest.items[item.id];
				expect(entry).toBeDefined();
				const expectedZone = item.layer ? zoneByLayer[item.layer] : undefined;
				expect(expectedZone).toBeDefined();
				expect(entry?.source_path.startsWith(`${expectedZone}/`)).toBe(true);
			}
		} finally {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	});

	test("sanity check: assembleContext genuinely excludes out-of-scope items on the real path (not a vacuous corpus)", async ({
		db,
		eventBus,
	}) => {
		await seedFixedCorpus(db);
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "i12-parity-sanity-"));
		try {
			const assembled = await runSession(
				{ db, eventBus },
				{
					mode: "assemble",
					input: {
						db,
						sandboxPath,
						sessionId: "session-i12-parity-sanity",
						taskId: TASK_ID,
						agentId: AGENT_ID,
						agentRole: AGENT_ROLE,
						teamId: TEAM_ID,
						isRoutine: false,
						sourceKind: null,
						sourceId: null,
						sourceCorrelation: null,
					},
				},
			);
			expect(assembled.mode).toBe("assembled");
			if (assembled.mode !== "assembled") return;

			const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
				// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
				items: Record<string, { source_path: string }>;
			};

			// Confirm the seeded corpus really does exercise scope/community
			// exclusion on the OLD path itself (a fixture sanity guard —
			// unrelated to the new assembler, must already hold today).
			const [row] = await db
				.select({ id: knowledgeItems.id })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "item-i12-l2-out"));
			expect(row).toBeDefined();
			expect(manifest.items["item-i12-l2-out"]).toBeUndefined();
			expect(manifest.items["item-i12-l3-out"]).toBeUndefined();
			expect(manifest.items["item-i12-l4"]).toBeDefined();
		} finally {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	});
});
