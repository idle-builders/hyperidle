/**
 * AU21 §9 Increment 12 (Decision H3), Wave A (RED) — architecture.md's
 * Increment 12 test (b) counterpart at the type/persistence level: grow
 * `BakedWorkIntentRequest` with an optional `contextBundle` field (the
 * `task_run`/`knowledge_action`/`routine_run`/`reengagement` families' baked
 * entity content + ranked knowledge bundle) and prove it round-trips through
 * `enqueueWorkIntent`'s `bakedRequestJson` persistence — the same mechanism
 * Increment 11 Wave A already proved for `transcript`/`modelId`
 * (`agent-work-intent-baked-payload.integration.test.ts`).
 *
 * Currently RED via `npm run check` (TypeScript), NOT via `npm run test`:
 * `bakedRequestJson` is a generic `JSON.stringify(input.bakedRequest)` column
 * (`service.ts`'s `insertIntentInternal`) — it round-trips ANY object shape
 * at runtime already, with or without this wave's type change. The genuine
 * RED signal is the `contextBundle` property on the `bakedRequest` object
 * literal below: until `BakedWorkIntentRequest` (this file's local mirror,
 * `service.ts`) gains a `contextBundle` field, TypeScript's excess-property
 * check on an object literal typed `satisfies BakedWorkIntentRequest` flags
 * it — `npm run check` fails, not the vitest (esbuild, no type-check) run.
 * This test's runtime assertions are the GREEN-phase confirmation that nothing
 * is silently dropped once the type accepts the field, matching the
 * transcript/modelId precedent's own documented RED-reason split.
 */

import { agentWorkIntents, type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import type { BakedWorkIntentRequest } from "@hyperidle/session-requests";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

test("BakedWorkIntentRequest accepts an optional contextBundle and round-trips it through bakedRequestJson", async ({
	db,
	ids,
}) => {
	await seedAgent(db, ids("i12-context-bundle-agent"));

	const bakedRequest: BakedWorkIntentRequest = {
		defaultAgentId: ids("i12-context-bundle-agent"),
		sourceKind: "task",
		sourceId: `task:${ids("i12-context-bundle-task")}`,
		streamId: `task:${ids("i12-context-bundle-task")}`,
		taskId: ids("i12-context-bundle-task"),
		teamId: ids("i12-context-bundle-team"),
		sourceCorrelation: {
			taskId: ids("i12-context-bundle-task"),
			teamId: ids("i12-context-bundle-team"),
		},
		contextBundle: {
			kind: "task",
			task: {
				id: ids("i12-context-bundle-task"),
				title: "Ship the seam",
				description: "Close the last read.",
				state: "in_progress",
			},
			bet: {
				id: ids("i12-context-bundle-bet"),
				description: "Boundary seam bet",
				appetite: "2 weeks",
				doneCondition: "Zero orchestration reads",
			},
			agent: { id: ids("i12-context-bundle-agent"), name: "Agent", role: "builder" },
			team: { id: ids("i12-context-bundle-team"), name: "Team" },
			knowledge: [
				{
					id: ids("item-i12-context-bundle"),
					title: "Baked knowledge item",
					body: "Ranked + budgeted content.",
					format: "markdown",
					version: 1,
					layer: "L2",
				},
			],
		},
	};

	await enqueueWorkIntent(db, {
		kind: "task_run",
		sourceKind: "task_dispatch_attempt",
		sourceId: `task:${ids("i12-context-bundle-task")}`,
		idempotencyKey: ids("i12-context-bundle-persist"),
		bakedRequest,
	});

	const [row] = await db
		.select()
		.from(agentWorkIntents)
		.where(eq(agentWorkIntents.sourceId, `task:${ids("i12-context-bundle-task")}`));

	expect(row).toBeDefined();
	const persisted = row?.bakedRequestJson
		? (JSON.parse(row.bakedRequestJson) as BakedWorkIntentRequest)
		: undefined;
	expect(persisted).toBeTruthy();
	// Full round-trip — including the newly-grown contextBundle field, nested
	// knowledge array intact.
	expect(persisted).toEqual(bakedRequest);
	expect(persisted?.contextBundle?.kind).toBe("task");
	expect(persisted?.contextBundle?.knowledge).toHaveLength(1);
	expect(persisted?.contextBundle?.knowledge[0]?.id).toBe(ids("item-i12-context-bundle"));
});
