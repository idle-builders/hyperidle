/**
 * BA9b — Service integration tests for capability knowledge items.
 *
 * Proves:
 * - assembleSessionKnowledge returns skill/rule items alongside ordinary ones
 * - Factory-scoped capability items reach all sessions (AC7)
 * - Team-scoped capability items only reach the matching team's sessions (AC7)
 * - agent_file items have agentBindingId derived from scopeId
 */
import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionKnowledge } from "../session-knowledge-assembler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateId(): string {
	return `test-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertKnowledgeItem(
	db: HyperIdleDb,
	opts: {
		id?: string;
		title: string;
		body: string;
		role: "ordinary" | "skill" | "rule" | "agent_file" | "prompt";
		scopeKind?: "factory" | "team" | "user";
		scopeId?: string | null;
		/** Only needed to exercise the layer-fetch path (fetchAllForLayer). */
		layer?: "L2" | "L3" | "L4";
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
	if (opts.layer) {
		await db.insert(knowledgeAppProjection).values({
			id: `proj-${id}`,
			knowledgeItemId: id,
			layer: opts.layer,
			scopeId: opts.scopeId ?? null,
		});
	}
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
			teamId: `any-team-${generateId()}`,
			agentRole: "builder",
			taskDescription: "Ship feature X",
			agentId: generateId(),
		});

		const skill = items.find((i) => i.title === "write-tests" && i.role === "skill");
		expect(skill).toBeDefined();
		expect(skill?.body).toBe("Write tests first.");
	});

	test("team-scoped skill only reaches matching team session (AC7)", async ({ db }) => {
		const teamA = `team-a-${generateId()}`;
		const teamB = `team-b-${generateId()}`;

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
			agentId: generateId(),
		});

		const itemsForTeamB = await assembleSessionKnowledge(db, {
			teamId: teamB,
			agentRole: "builder",
			taskDescription: "Work item",
			agentId: generateId(),
		});

		const skillA = itemsForTeamA.find((i) => i.title === "team-a-skill");
		const skillB = itemsForTeamB.find((i) => i.title === "team-a-skill");

		expect(skillA).toBeDefined();
		expect(skillB).toBeUndefined();
	});

	test("agent_file item with scopeId=agentId only reaches that agent", async ({ db }) => {
		const agentId = `agent-${generateId()}`;
		const teamId = `team-${generateId()}`;
		const otherId = `agent-other-${generateId()}`;

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
			teamId: `any-team-${generateId()}`,
			agentRole: "builder",
			taskDescription: "Work",
			agentId: generateId(),
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
			title: `dedup-skill-${id}`,
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
			id: `proj-${id}`,
			knowledgeItemId: id,
			layer: "L4",
			scopeId: null,
			kind: null,
			attentionScore: null,
			confidence: null,
			meta: null,
		});

		const items = await assembleSessionKnowledge(db, {
			teamId: `any-team-${generateId()}`,
			agentRole: "builder",
			taskDescription: "Work",
			agentId: generateId(),
		});

		const matching = items.filter((i) => i.title === `dedup-skill-${id}`);
		expect(matching).toHaveLength(1);
	});
});

/**
 * A routine prompt must never reach a session
 * sandbox. Two fetches inside assembleSessionKnowledge each independently
 * match a prompt item; seeding one at factory scope (matches the capability
 * fetch) and one at team scope with an L2 layer (matches the layer fetch)
 * exercises both, so this test cannot pass by accident if only one guard is
 * in place.
 */
describe("a routine prompt in reach appears in neither fetch", () => {
	test("a factory-scoped prompt and a team-scoped L2 prompt are both excluded, while skills/rules/identity still appear", async ({
		db,
	}) => {
		const teamId = `team-prompt-${generateId()}`;
		const agentId = `agent-prompt-${generateId()}`;

		await insertKnowledgeItem(db, {
			title: "factory-prompt",
			body: "Factory-scoped instruction.",
			role: "prompt",
			scopeKind: "factory",
		});
		await insertKnowledgeItem(db, {
			title: "team-prompt",
			body: "Team-scoped instruction.",
			role: "prompt",
			scopeKind: "team",
			scopeId: teamId,
			layer: "L2",
		});
		await insertKnowledgeItem(db, { title: "still-a-skill", body: "Skill body.", role: "skill" });
		await insertKnowledgeItem(db, { title: "still-a-rule", body: "Rule body.", role: "rule" });
		await insertKnowledgeItem(db, {
			title: "still-an-identity",
			body: "Identity body.",
			role: "agent_file",
			scopeKind: "user",
			scopeId: agentId,
		});

		const items = await assembleSessionKnowledge(db, {
			teamId,
			agentRole: "builder",
			taskDescription: "Work",
			agentId,
		});

		expect(items.find((i) => i.title === "factory-prompt")).toBeUndefined();
		expect(items.find((i) => i.title === "team-prompt")).toBeUndefined();
		expect(items.find((i) => i.title === "still-a-skill")).toBeDefined();
		expect(items.find((i) => i.title === "still-a-rule")).toBeDefined();
		expect(items.find((i) => i.title === "still-an-identity")).toBeDefined();
	});
});

/**
 * Capability items are scoped factory / team / agent, independently of any
 * team. An agent with no team (`agentCategory: "individual"`) is an ordinary
 * agent and must still receive everything scoped to reach it — the factory
 * ones, and the ones bound to it by id.
 *
 * Nothing here is about where an item came from. A skill is a knowledge row
 * with `role: "skill"`; whichever writer produced it, the scope decides who
 * receives it.
 */
describe("capability items for a team-less agent", () => {
	test("a factory-scoped skill reaches an agent that belongs to no team", async ({ db }) => {
		const skillId = await insertKnowledgeItem(db, {
			title: "knowledge-decay",
			body: "# Knowledge decay sweep",
			role: "skill",
			scopeKind: "factory",
		});

		const assembled = await assembleSessionKnowledge(db, {
			agentRole: "assistant",
			taskDescription: "Run the knowledge decay sweep",
			agentId: "agent-teamless",
		});

		expect(assembled.map((i) => i.id)).toContain(skillId);
	});

	test("an agent-bound skill reaches its agent with no team in play", async ({ db }) => {
		const boundId = await insertKnowledgeItem(db, {
			title: "librarian-only",
			body: "# Bound to one agent",
			role: "skill",
			scopeKind: "user",
			scopeId: "agent-teamless",
		});
		const otherId = await insertKnowledgeItem(db, {
			title: "someone-elses",
			body: "# Bound to a different agent",
			role: "skill",
			scopeKind: "user",
			scopeId: "agent-other",
		});

		const assembled = await assembleSessionKnowledge(db, {
			agentRole: "assistant",
			taskDescription: "Run the knowledge decay sweep",
			agentId: "agent-teamless",
		});

		const ids = assembled.map((i) => i.id);
		expect(ids).toContain(boundId);
		expect(ids).not.toContain(otherId);
	});
});

/**
 * The scope decides who receives a capability item — not what created it and
 * not what kind of agent asks. These cover the reach an installer's `factory`
 * and `team` choices actually buy, from the receiving agent's side.
 */
describe("who a capability item reaches", () => {
	test("a factory-scoped skill reaches a team agent and a team-less one alike", async ({ db }) => {
		const skillId = await insertKnowledgeItem(db, {
			title: "shared-practice",
			body: "# Everyone gets this",
			role: "skill",
			scopeKind: "factory",
		});

		const forTeamAgent = await assembleSessionKnowledge(db, {
			teamId: "team-alpha",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-in-team",
		});
		const forTeamlessAgent = await assembleSessionKnowledge(db, {
			agentRole: "assistant",
			taskDescription: "anything",
			agentId: "agent-no-team",
		});

		expect(forTeamAgent.map((i) => i.id)).toContain(skillId);
		expect(forTeamlessAgent.map((i) => i.id)).toContain(skillId);
	});

	test("a team-scoped skill reaches that team's agents and no one else", async ({ db }) => {
		const skillId = await insertKnowledgeItem(db, {
			title: "alpha-only",
			body: "# Team alpha only",
			role: "skill",
			scopeKind: "team",
			scopeId: "team-alpha",
		});

		const inTeam = await assembleSessionKnowledge(db, {
			teamId: "team-alpha",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-in-team",
		});
		const otherTeam = await assembleSessionKnowledge(db, {
			teamId: "team-beta",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-elsewhere",
		});
		const teamless = await assembleSessionKnowledge(db, {
			agentRole: "assistant",
			taskDescription: "anything",
			agentId: "agent-no-team",
		});

		expect(inTeam.map((i) => i.id)).toContain(skillId);
		expect(otherTeam.map((i) => i.id)).not.toContain(skillId);
		expect(teamless.map((i) => i.id)).not.toContain(skillId);
	});

	test("a skill bound to one agent reaches that agent even inside a team", async ({ db }) => {
		const boundId = await insertKnowledgeItem(db, {
			title: "just-for-this-agent",
			body: "# Bound",
			role: "skill",
			scopeKind: "user",
			scopeId: "agent-in-team",
		});

		const itsOwner = await assembleSessionKnowledge(db, {
			teamId: "team-alpha",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-in-team",
		});
		const teammate = await assembleSessionKnowledge(db, {
			teamId: "team-alpha",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-teammate",
		});

		expect(itsOwner.map((i) => i.id)).toContain(boundId);
		// Same team, same role — only the binding separates them.
		expect(teammate.map((i) => i.id)).not.toContain(boundId);
	});
});

/**
 * `list()` applies a scope filter only when `scopeId !== undefined`, so an
 * absent team must not be passed through to the team-scoped L2 fetch — doing so
 * returns EVERY team's L2 knowledge instead of none. A team-less agent has no
 * team-scoped knowledge to receive; it must not inherit other teams'.
 */
describe("a team-less agent receives no team-scoped ordinary knowledge", () => {
	test("does not inherit another team's L2 items", async ({ db }) => {
		const otherTeamItem = `l2-other-team-${generateId()}`;
		const now = new Date().toISOString();
		await db.insert(knowledgeItems).values({
			id: otherTeamItem,
			scopeKind: "team",
			scopeId: "team-somebody-else",
			topic: null,
			title: "Another team's working agreement",
			body: "Private to that team.",
			format: "markdown",
			status: "active",
			role: "ordinary",
			version: 1,
			updatedBy: "test-user",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(knowledgeAppProjection).values({
			id: `proj-${otherTeamItem}`,
			knowledgeItemId: otherTeamItem,
			layer: "L2",
			scopeId: "team-somebody-else",
			kind: null,
			attentionScore: null,
			confidence: null,
			meta: null,
		});

		const assembled = await assembleSessionKnowledge(db, {
			agentRole: "assistant",
			taskDescription: "anything",
			agentId: "agent-with-no-team",
		});

		expect(assembled.map((i) => i.id)).not.toContain(otherTeamItem);
	});
});
