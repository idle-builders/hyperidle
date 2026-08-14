/**
 * AU29 §2.5.3 — the agent-orchestration first-boot face.
 *
 * RED PHASE: fails until `applyFactoryRunConfigDefaults` exists at
 * `layers/agent-orchestration/src/factory-run-config.ts` (architecture.md §2.5.3). Covers the real
 * `agent_run_config` patch shapes the AU29 feasibility probe proved the owning-service writer
 * reproduces (`.pipeline/work/AU29/probes/run-config-equivalence.ts`, `feasibility.md` §2): a fresh
 * roster agent, and an upgrade over a pre-existing operator-configured row (AH2 fields overwritten,
 * `modelTierPreference` left alone). It also covers a behavioural contract the probe does not touch
 * and today's `factory-bootstrap.ts` has no test for: the `content !== null` skip
 * (architecture.md §2.5.3 step 2) — a missing template read must preserve the agent's existing
 * `systemPrompt` rather than nulling it.
 *
 * The `@hyperidle/factory-defaults` mock below stubs only the pure template-file reader for one test, not the
 * database — the integration point under test throughout is the real `agent_run_config` write,
 * exercised via the `@hyperidle/db` fixture db (this layer's own fixtures carry no `db`; per its
 * `__testing__/test-fixtures.ts` lore, a test needing a real db uses `@hyperidle/db/test-fixtures`
 * directly).
 */
import { vi } from "vitest";

// @lore shared-integration-workers: the mocked factory-defaults module may
// already be evaluated by an earlier file. Reset it before this file's hoisted mock.
vi.hoisted(() => vi.resetModules());

/**
 * Set by the "content !== null skip" test to force `readSystemPromptTemplateForRole` to return
 * null for one role, deterministically — every real template file in this repo exists, so the
 * missing-file branch cannot be reached without controlling the reader. Reset after every test.
 */
let nullTemplateRole: string | null = null;

vi.mock("@hyperidle/factory-defaults", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/factory-defaults")>();
	return {
		...original,
		readSystemPromptTemplateForRole: (role: string) =>
			role === nullTemplateRole ? null : original.readSystemPromptTemplateForRole(role),
	};
});

import { agentRunConfig, users } from "@hyperidle/db";
import { afterAll, afterEach, describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { applyFactoryRunConfigDefaults } from "../factory-run-config.js";

afterEach(() => {
	nullTemplateRole = null;
});

afterAll(() => {
	vi.doUnmock("@hyperidle/factory-defaults");
	vi.resetModules();
});

const AH2 = {
	harnessType: "builtin",
	modelId: "claude-sonnet-4-6",
	modelProvider: "anthropic",
	maxConcurrentSessions: 1,
} as const;

async function seedUser(
	db: Parameters<typeof applyFactoryRunConfigDefaults>[0],
	id: string,
	role: string,
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: id,
		role,
		status: "active",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

describe("applyFactoryRunConfigDefaults — first-boot run-config state (AU29 AC 7)", () => {
	test("fresh roster agent gets AH2 runnable defaults and its role's template as systemPrompt", async ({
		db,
	}) => {
		await seedUser(db, "agent-fresh-facilitator", "facilitator");

		await applyFactoryRunConfigDefaults(db, [
			{ id: "agent-fresh-facilitator", role: "facilitator" },
		]);

		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-fresh-facilitator"));
		expect(row?.harnessType).toBe(AH2.harnessType);
		expect(row?.modelId).toBe(AH2.modelId);
		expect(row?.modelProvider).toBe(AH2.modelProvider);
		expect(row?.maxConcurrentSessions).toBe(AH2.maxConcurrentSessions);
		expect(row?.systemPrompt).toContain("You are a Facilitator");
	});

	test("upgrade over an operator-configured row: AH2 fields + prompt overwritten, modelTierPreference untouched", async ({
		db,
	}) => {
		await seedUser(db, "agent-upgrade", "facilitator");
		await db.insert(agentRunConfig).values({
			agentUserId: "agent-upgrade",
			systemPrompt: "operator-set prompt",
			harnessType: "claude",
			modelTierPreference: "workhorse",
			modelId: "some-model",
			modelProvider: "openrouter",
			maxConcurrentSessions: 3,
		});

		await applyFactoryRunConfigDefaults(db, [{ id: "agent-upgrade", role: "facilitator" }]);

		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-upgrade"));
		expect(row?.harnessType).toBe(AH2.harnessType);
		expect(row?.modelId).toBe(AH2.modelId);
		expect(row?.modelProvider).toBe(AH2.modelProvider);
		expect(row?.maxConcurrentSessions).toBe(AH2.maxConcurrentSessions);
		expect(row?.modelTierPreference).toBe("workhorse");
		expect(row?.systemPrompt).toContain("You are a Facilitator");
	});

	test("a missing template read preserves the agent's existing systemPrompt instead of nulling it", async ({
		db,
	}) => {
		nullTemplateRole = "facilitator";
		await seedUser(db, "agent-missing-template", "facilitator");
		await db.insert(agentRunConfig).values({
			agentUserId: "agent-missing-template",
			systemPrompt: "pre-existing prompt that must survive",
		});

		await applyFactoryRunConfigDefaults(db, [
			{ id: "agent-missing-template", role: "facilitator" },
		]);

		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-missing-template"));
		// Step 1 (AH2 defaults) still runs unconditionally...
		expect(row?.harnessType).toBe(AH2.harnessType);
		// ...but step 2 (prompt backfill) must skip this role, leaving the prompt as it was.
		expect(row?.systemPrompt).toBe("pre-existing prompt that must survive");
	});
});
