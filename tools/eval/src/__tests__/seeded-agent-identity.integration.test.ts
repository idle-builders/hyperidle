/**
 * A scenario's agent carries the identity the scenario gives it the way every
 * real agent does: an identity document bound to the agent, found by the same
 * `search_documents` read a session's bake uses. An agent the scenario gives
 * no identity has none.
 */

import { createStandaloneSearchDocuments } from "@hyperidle/core-api";
import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterAll, vi } from "vitest";
import { seedAgent, seedMinimalWorld, seedMultiAgentWorld, seedTeam } from "../seeding.js";

// @lore the run's harness choice is fixed here — a real one needs a binary CI lacks; the service lane resets the shared module cache when this file finishes.
vi.hoisted(() => vi.resetModules());
vi.mock("../eval-harness.js", () => ({
	evalHarnessType: () => "claude-code",
	evalHarnessModel: () => null,
}));
afterAll(() => {
	vi.doUnmock("../eval-harness.js");
	vi.resetModules();
});

const searchDocuments = createStandaloneSearchDocuments();

async function identityOf(db: HyperIdleDb, agentId: string): Promise<string[]> {
	const result = await searchDocuments(
		{ actor: agentId, db, eventBus: new EventBus(), now: new Date().toISOString() },
		{ parent: { kind: "agent", id: agentId }, slot: "agent_file", status: "active" },
	);
	if (!result.ok) throw new Error(result.problems.map((p) => p.message).join("; "));
	return result.data.map((d) => d.body);
}

describe("a scenario's agent identity", () => {
	test("the minimal world's agent carries the scenario's identity", async ({ db }) => {
		const world = await seedMinimalWorld(db, { agentSystemPrompt: "You are Aria." });

		expect(await identityOf(db, world.agentId)).toEqual(["You are Aria."]);
	});

	test("the second agent of a multi-agent world carries its own identity", async ({ db }) => {
		const world = await seedMultiAgentWorld(db, {
			agentSystemPrompt: "You are the builder.",
			secondAgentSystemPrompt: "You are the reviewer.",
		});

		expect(await identityOf(db, world.agentId)).toEqual(["You are the builder."]);
		expect(await identityOf(db, world.secondAgentId)).toEqual(["You are the reviewer."]);
	});

	test("an agent the scenario gives no identity has none", async ({ db }) => {
		const world = await seedMinimalWorld(db);
		const { teamId } = await seedTeam(db);
		const { agentId } = await seedAgent(db, { name: "Plain", role: "ops", teamId });

		expect(await identityOf(db, world.agentId)).toEqual([]);
		expect(await identityOf(db, agentId)).toEqual([]);
	});
});
