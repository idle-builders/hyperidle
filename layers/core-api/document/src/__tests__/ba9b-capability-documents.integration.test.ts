/**
 * BA9b — Service integration tests for capability documents.
 *
 * Proves:
 * - assembleSessionDocuments returns skill/rule items alongside ordinary ones
 * - Factory-scoped capability items reach all sessions (AC7)
 * - Team-scoped capability items only reach the matching team's sessions (AC7)
 * - agent_file items have agentBindingId derived from scopeId
 */
import { documents, type HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionDocuments } from "../session-documents.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateId(): string {
	return `test-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertDocument(
	db: HyperIdleDb,
	opts: {
		id?: string;
		title: string;
		body: string;
		role: "ordinary" | "skill" | "rule" | "agent_file" | "prompt";
		scopeKind?: "factory" | "team" | "user";
		scopeId?: string | null;
	},
) {
	const id = opts.id ?? generateId();
	const now = new Date().toISOString();
	await db.insert(documents).values({
		id,
		scopeKind: opts.scopeKind ?? "factory",
		scopeId: opts.scopeId ?? null,
		title: opts.title,
		body: opts.body,
		format: "markdown",
		status: "active",
		slot: opts.role,
		version: 1,
		updatedBy: "test-user",
		createdAt: now,
		updatedAt: now,
	});
	return id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("BA9b: assembleSessionDocuments includes capability items", () => {
	test("factory-scoped skill is returned for any team session", async ({ db }) => {
		await insertDocument(db, {
			title: "write-tests",
			body: "Write tests first.",
			role: "skill",
			scopeKind: "factory",
		});

		const items = await assembleSessionDocuments(db, {
			teamId: `any-team-${generateId()}`,
			taskDescription: "Ship feature X",
			agentId: generateId(),
		});

		const skill = items.find((i) => i.title === "write-tests" && i.slot === "skill");
		expect(skill).toBeDefined();
		expect(skill?.body).toBe("Write tests first.");
	});

	test("team-scoped skill only reaches matching team session (AC7)", async ({ db }) => {
		const teamA = `team-a-${generateId()}`;
		const teamB = `team-b-${generateId()}`;

		await insertDocument(db, {
			title: "team-a-skill",
			body: "Team A's skill.",
			role: "skill",
			scopeKind: "team",
			scopeId: teamA,
		});

		const itemsForTeamA = await assembleSessionDocuments(db, {
			teamId: teamA,
			taskDescription: "Work item",
			agentId: generateId(),
		});

		const itemsForTeamB = await assembleSessionDocuments(db, {
			teamId: teamB,
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

		await insertDocument(db, {
			title: "agent-specific-instructions",
			body: "Only for this agent.",
			role: "agent_file",
			scopeKind: "user",
			scopeId: agentId,
		});

		const itemsForAgent = await assembleSessionDocuments(db, {
			teamId,
			taskDescription: "Task",
			agentId,
		});

		const itemsForOther = await assembleSessionDocuments(db, {
			teamId,
			taskDescription: "Task",
			agentId: otherId,
		});

		const foundForAgent = itemsForAgent.find((i) => i.title === "agent-specific-instructions");
		const foundForOther = itemsForOther.find((i) => i.title === "agent-specific-instructions");

		expect(foundForAgent).toBeDefined();
		expect(foundForOther).toBeUndefined();
	});

	test("rule item is returned in session documents", async ({ db }) => {
		await insertDocument(db, {
			title: "no-console-rule",
			body: "Never use console.log.",
			role: "rule",
			scopeKind: "factory",
		});

		const items = await assembleSessionDocuments(db, {
			teamId: `any-team-${generateId()}`,
			taskDescription: "Work",
			agentId: generateId(),
		});

		const rule = items.find((i) => i.title === "no-console-rule" && i.slot === "rule");
		expect(rule).toBeDefined();
	});

	test("a factory skill appears exactly once (never doubled by the capability fetch)", async ({
		db,
	}) => {
		const id = await insertDocument(db, {
			title: `dedup-skill-${generateId()}`,
			body: "Dedup test.",
			role: "skill",
			scopeKind: "factory",
		});

		const items = await assembleSessionDocuments(db, {
			teamId: `any-team-${generateId()}`,
			taskDescription: "Work",
			agentId: generateId(),
		});

		const matching = items.filter((i) => i.id === id);
		expect(matching).toHaveLength(1);
	});
});

/**
 * A subscription prompt must never reach a session sandbox — neither the
 * scope-based ordinary fetch (role:"ordinary" only) nor the capability fetch
 * (skill/rule/agent_file only) matches role:"prompt".
 */
describe("a subscription prompt in reach appears in neither fetch", () => {
	test("a factory-scoped prompt and a team-scoped prompt are both excluded, while skills/rules/identity still appear", async ({
		db,
	}) => {
		const teamId = `team-prompt-${generateId()}`;
		const agentId = `agent-prompt-${generateId()}`;

		await insertDocument(db, {
			title: "factory-prompt",
			body: "Factory-scoped instruction.",
			role: "prompt",
			scopeKind: "factory",
		});
		await insertDocument(db, {
			title: "team-prompt",
			body: "Team-scoped instruction.",
			role: "prompt",
			scopeKind: "team",
			scopeId: teamId,
		});
		await insertDocument(db, { title: "still-a-skill", body: "Skill body.", role: "skill" });
		await insertDocument(db, { title: "still-a-rule", body: "Rule body.", role: "rule" });
		await insertDocument(db, {
			title: "still-an-identity",
			body: "Identity body.",
			role: "agent_file",
			scopeKind: "user",
			scopeId: agentId,
		});

		const items = await assembleSessionDocuments(db, {
			teamId,
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
 * Nothing here is about where an item came from. A skill is a document row
 * with `role: "skill"`; whichever writer produced it, the scope decides who
 * receives it.
 */
describe("capability items for a team-less agent", () => {
	test("a factory-scoped skill reaches an agent that belongs to no team", async ({ db }) => {
		const skillId = await insertDocument(db, {
			title: "document-decay",
			body: "# Document decay sweep",
			role: "skill",
			scopeKind: "factory",
		});

		const assembled = await assembleSessionDocuments(db, {
			taskDescription: "Run the document decay sweep",
			agentId: "agent-teamless",
		});

		expect(assembled.map((i) => i.id)).toContain(skillId);
	});

	test("an agent-bound skill reaches its agent with no team in play", async ({ db }) => {
		const boundId = await insertDocument(db, {
			title: "librarian-only",
			body: "# Bound to one agent",
			role: "skill",
			scopeKind: "user",
			scopeId: "agent-teamless",
		});
		const otherId = await insertDocument(db, {
			title: "someone-elses",
			body: "# Bound to a different agent",
			role: "skill",
			scopeKind: "user",
			scopeId: "agent-other",
		});

		const assembled = await assembleSessionDocuments(db, {
			taskDescription: "Run the document decay sweep",
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
		const skillId = await insertDocument(db, {
			title: "shared-practice",
			body: "# Everyone gets this",
			role: "skill",
			scopeKind: "factory",
		});

		const forTeamAgent = await assembleSessionDocuments(db, {
			teamId: "team-alpha",
			taskDescription: "anything",
			agentId: "agent-in-team",
		});
		const forTeamlessAgent = await assembleSessionDocuments(db, {
			taskDescription: "anything",
			agentId: "agent-no-team",
		});

		expect(forTeamAgent.map((i) => i.id)).toContain(skillId);
		expect(forTeamlessAgent.map((i) => i.id)).toContain(skillId);
	});

	test("a team-scoped skill reaches that team's agents and no one else", async ({ db }) => {
		const skillId = await insertDocument(db, {
			title: "alpha-only",
			body: "# Team alpha only",
			role: "skill",
			scopeKind: "team",
			scopeId: "team-alpha",
		});

		const inTeam = await assembleSessionDocuments(db, {
			teamId: "team-alpha",
			taskDescription: "anything",
			agentId: "agent-in-team",
		});
		const otherTeam = await assembleSessionDocuments(db, {
			teamId: "team-beta",
			taskDescription: "anything",
			agentId: "agent-elsewhere",
		});
		const teamless = await assembleSessionDocuments(db, {
			taskDescription: "anything",
			agentId: "agent-no-team",
		});

		expect(inTeam.map((i) => i.id)).toContain(skillId);
		expect(otherTeam.map((i) => i.id)).not.toContain(skillId);
		expect(teamless.map((i) => i.id)).not.toContain(skillId);
	});

	test("a skill bound to one agent reaches that agent even inside a team", async ({ db }) => {
		const boundId = await insertDocument(db, {
			title: "just-for-this-agent",
			body: "# Bound",
			role: "skill",
			scopeKind: "user",
			scopeId: "agent-in-team",
		});

		const itsOwner = await assembleSessionDocuments(db, {
			teamId: "team-alpha",
			taskDescription: "anything",
			agentId: "agent-in-team",
		});
		const teammate = await assembleSessionDocuments(db, {
			teamId: "team-alpha",
			taskDescription: "anything",
			agentId: "agent-teammate",
		});

		expect(itsOwner.map((i) => i.id)).toContain(boundId);
		// Same team, same role — only the binding separates them.
		expect(teammate.map((i) => i.id)).not.toContain(boundId);
	});
});

/**
 * The team-scoped fetch only runs when `input.teamId` is set (architecture
 * D1: "factory + its team + its own", no subtree/other-team selection). A
 * team-less agent has no team-scoped documents to receive; it must not
 * inherit other teams'.
 */
describe("a team-less agent receives no team-scoped ordinary documents", () => {
	test("does not inherit another team's items", async ({ db }) => {
		const otherTeamItem = await insertDocument(db, {
			title: "Another team's working agreement",
			body: "Private to that team.",
			role: "ordinary",
			scopeKind: "team",
			scopeId: "team-somebody-else",
		});

		const assembled = await assembleSessionDocuments(db, {
			taskDescription: "anything",
			agentId: "agent-with-no-team",
		});

		expect(assembled.map((i) => i.id)).not.toContain(otherTeamItem);
	});
});
