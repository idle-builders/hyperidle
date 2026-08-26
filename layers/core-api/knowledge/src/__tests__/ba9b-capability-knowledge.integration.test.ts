/**
 * BA9b — Service integration tests for capability knowledge items.
 *
 * Proves:
 * - assembleSessionKnowledge returns skill/rule items alongside ordinary ones
 * - Factory-scoped capability items reach all sessions (AC7)
 * - Team-scoped capability items only reach the matching team's sessions (AC7)
 * - agent_file items have agentBindingId derived from scopeId
 */
import { knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionKnowledge } from "../session-knowledge-assembler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateId(): string {
	return `test-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertKnowledgeItem(
	db: Parameters<Parameters<typeof test>[1]>[0]["db"],
	opts: {
		id?: string;
		title: string;
		body: string;
		role: "ordinary" | "skill" | "rule" | "agent_file";
		scopeKind?: "factory" | "team" | "user";
		scopeId?: string | null;
	},
) {
	const id = opts.id ?? generateId();
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id,
		scopeKind: opts.scopeKind ?? "factory",
		scopeId: opts.scopeId ?? null,
		topic: null,
		title: opts.title,
		body: opts.body,
		format: "markdown",
		status: "active",
		role: opts.role,
		version: 1,
		updatedBy: "test-user",
		createdAt: now,
		updatedAt: now,
	});
	// No projection row needed for capability items — they don't use layer.
	return id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("BA9b: assembleSessionKnowledge includes capability items", () => {
	test("factory-scoped skill is returned for any team session", async ({ db }) => {
		await insertKnowledgeItem(db, {
			title: "write-tests",
			body: "Write tests first.",
			role: "skill",
			scopeKind: "factory",
		});

		const items = await assembleSessionKnowledge(db, {
			teamId: "any-team-" + generateId(),
			agentRole: "builder",
			taskDescription: "Ship feature X",
		});

		const skill = items.find((i) => i.title === "write-tests" && i.role === "skill");
		expect(skill).toBeDefined();
		expect(skill?.body).toBe("Write tests first.");
	});

	test("team-scoped skill only reaches matching team session (AC7)", async ({ db }) => {
		const teamA = "team-a-" + generateId();
		const teamB = "team-b-" + generateId();

		await insertKnowledgeItem(db, {
			title: "team-a-skill",
			body: "Team A's skill.",
			role: "skill",
			scopeKind: "team",
			scopeId: teamA,
		});

		const itemsForTeamA = await assembleSessionKnowledge(db, {
			teamId: teamA,
			agentRole: "builder",
			taskDescription: "Work item",
		});

		const itemsForTeamB = await assembleSessionKnowledge(db, {
			teamId: teamB,
			agentRole: "builder",
			taskDescription: "Work item",
		});

		const skillA = itemsForTeamA.find((i) => i.title === "team-a-skill");
		const skillB = itemsForTeamB.find((i) => i.title === "team-a-skill");

		expect(skillA).toBeDefined();
		expect(skillB).toBeUndefined();
	});

	test("agent_file item with scopeId=agentId only reaches that agent", async ({ db }) => {
		const agentId = "agent-" + generateId();
		const teamId = "team-" + generateId();
		const otherId = "agent-other-" + generateId();

		await insertKnowledgeItem(db, {
			title: "agent-specific-instructions",
			body: "Only for this agent.",
			role: "agent_file",
			scopeKind: "user",
			scopeId: agentId,
		});

		const itemsForAgent = await assembleSessionKnowledge(db, {
			teamId,
			agentRole: "builder",
			taskDescription: "Task",
			agentId,
		});

		const itemsForOther = await assembleSessionKnowledge(db, {
			teamId,
			agentRole: "builder",
			taskDescription: "Task",
			agentId: otherId,
		});

		const foundForAgent = itemsForAgent.find((i) => i.title === "agent-specific-instructions");
		const foundForOther = itemsForOther.find((i) => i.title === "agent-specific-instructions");

		expect(foundForAgent).toBeDefined();
		expect(foundForOther).toBeUndefined();
	});

	test("rule item is returned in session knowledge", async ({ db }) => {
		await insertKnowledgeItem(db, {
			title: "no-console-rule",
			body: "Never use console.log.",
			role: "rule",
			scopeKind: "factory",
		});

		const items = await assembleSessionKnowledge(db, {
			teamId: "any-team-" + generateId(),
			agentRole: "builder",
			taskDescription: "Work",
		});

		const rule = items.find((i) => i.title === "no-console-rule" && i.role === "rule");
		expect(rule).toBeDefined();
	});

	test("capability items are deduplicated if they would appear twice (factory skill via L4 + capability fetch)", async ({
		db,
	}) => {
		// This test inserts a factory-scoped skill that has a projection row with layer=L4.
		// assembleSessionKnowledge should not include it twice.
		const id = generateId();
		const now = new Date().toISOString();
		await db.insert(knowledgeItems).values({
			id,
			scopeKind: "factory",
			scopeId: null,
			topic: null,
			title: "dedup-skill-" + id,
			body: "Dedup test.",
			format: "markdown",
			status: "active",
			role: "skill",
			version: 1,
			updatedBy: "test-user",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(knowledgeAppProjection).values({
			id: "proj-" + id,
			knowledgeItemId: id,
			layer: "L4",
			scopeId: null,
			kind: null,
			attentionScore: null,
			confidence: null,
			meta: null,
			createdAt: now,
			updatedAt: now,
		});

		const items = await assembleSessionKnowledge(db, {
			teamId: "any-team-" + generateId(),
			agentRole: "builder",
			taskDescription: "Work",
		});

		const matching = items.filter((i) => i.title === "dedup-skill-" + id);
		expect(matching).toHaveLength(1);
	});
});
