/**
 * The harness's own session id has to outlive the run that produced it.
 *
 * A human approves a review long after the session that filed it ended, and
 * resuming that session is the whole return half. `getNativeSessionId` gives us
 * the id in memory during the run; if nothing writes it down, there is nothing
 * to resume and the agent can never be brought back.
 *
 */
import { type HyperIdleDb, sessions, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
	buildRunningHarnessPorts,
	type FakeHarnessAdapter,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";

/**
 * `nativeId` undefined models a harness that never reported one — an error
 * before the first stream event, or an adapter with no resume support.
 */
function buildFakeHarnessAdapter(nativeId: string | undefined): FakeHarnessAdapter {
	return {
		startSession: async (config) => ({ sessionId: config.sessionId }),
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				/* no events — the drain completes immediately */
			},
		}),
		stopSession: async () => ({
			outcome: "completed" as const,
			tokenUsage: { byTier: {} },
		}),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
		getNativeSessionId: () => nativeId,
	} as FakeHarnessAdapter;
}

function buildHarnessPorts() {
	return buildRunningHarnessPorts();
}

function buildDeps(db: HyperIdleDb, nativeId: string | undefined): ProvisionSessionDeps {
	return {
		db,
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "fake-adapter",
				adapter: buildFakeHarnessAdapter(nativeId),
				meta: {
					name: "Fake",
					type: undefined,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: () => undefined,
			describeSelectFailure: () => "test pool selected nothing",
		},
	};
}

async function runOnce(
	db: HyperIdleDb,
	agentId: string,
	nativeId: string | undefined,
): Promise<string> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	const provisioner = createProvisioner(buildHarnessPorts());
	const params = {
		taskId: null,
		agentId,
		productId: "task-free",
		agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
	} as ProvisionSessionParams;
	const deps = buildDeps(db, nativeId);
	const admitted = await provisioner.admit(deps, params);
	await provisioner.run(deps, params, admitted);
	return admitted.sessionId;
}

describe("provisioner.run — the harness session id is written down", () => {
	test("the id the harness reported is persisted, so the session can be resumed", async ({
		db,
	}) => {
		const sessionId = await runOnce(db as HyperIdleDb, "agent-native-id-1", "claude-uuid-abc");

		const [row] = await (db as HyperIdleDb)
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId));
		expect(row?.harnessSessionId).toBe("claude-uuid-abc");
	});

	test("a harness that reported no id leaves it null rather than inventing one", async ({ db }) => {
		const sessionId = await runOnce(db as HyperIdleDb, "agent-native-id-2", undefined);

		const [row] = await (db as HyperIdleDb)
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId));
		expect(row?.harnessSessionId).toBe(null);
	});
});
