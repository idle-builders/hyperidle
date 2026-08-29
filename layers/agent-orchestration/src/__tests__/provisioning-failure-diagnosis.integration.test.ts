/**
 * A pre-admission provisioning failure must leave a diagnosable record.
 *
 * These tests go through the REAL composition root
 * (`buildRunOrchestrationComposition`), never `run-orchestration`'s own
 * `__tests__/test-ports.ts`. That distinction is the whole point: `test-ports`
 * REIMPLEMENTS the `transitionAgentRunLifecycle` port and forwards
 * `errorMessage` correctly, so `agent-run-boundary.integration.test.ts` has
 * asserted `errorMessage: "runtime exploded"` green for months while the
 * production adapter in `run-orchestration-composition.ts` silently dropped
 * the field on the floor. Every failed routine request in a real database
 * carries `error_code: "Error"` and `error_message: null`.
 *
 * Same shape as this Layer's `boot-provisioning-wiring.integration.test.ts`
 * headline: a port tested only through a hand-built stand-in proves nothing
 * about the wiring the server actually runs.
 */

import { agentSessionRequests, type HyperIdleDb, sessions, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import {
	buildRunOrchestrationComposition,
	type ProvisionSessionDeps,
} from "../services/run-orchestration-composition.js";

const TEAM_ID = "team-provdiag";
const AGENT_ID = "agent-provdiag";
const REQUEST_ID = "request-provdiag";
const ROUTINE_RUN_ID = "routine-run-provdiag";
const NOW = "2026-08-28T14:49:37.000Z";

/**
 * The reason the pool itself gives when nothing is registered — the real
 * production case, where harness discovery found no binary on this host.
 * Asserting on the message is the point: the code alone never identified this
 * failure, and the message it used to carry ("all adapters are at capacity")
 * described a different problem entirely.
 */
const POOL_EMPTY = "no harness adapters are registered";

async function seed(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: TEAM_ID, name: "Prov Diag", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Provisioning Diag Agent",
		role: "builder",
		status: "active",
		teamId: TEAM_ID,
		createdAt: NOW,
	});
	await db.insert(agentSessionRequests).values({
		id: REQUEST_ID,
		sourceKind: "routine",
		sourceId: ROUTINE_RUN_ID,
		streamId: `routine:${ROUTINE_RUN_ID}`,
		agentId: AGENT_ID,
		teamId: TEAM_ID,
		promptMode: "routine",
		idempotencyKey: `routine:${ROUTINE_RUN_ID}`,
		sourceCorrelationJson: JSON.stringify({
			routineId: "routine-provdiag",
			routineRunId: ROUTINE_RUN_ID,
		}),
		payloadJson: JSON.stringify({
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: TEAM_ID },
		}),
		status: "pending",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

/**
 * The real composition, with only the execution adapters stubbed — those are
 * opaque values a composition root hands in, and none of them is the subject
 * here. The adapter pool selects NOTHING, which drives `admitSession` into
 * its Phase 3 pre-admission throw.
 */
function buildDeps(db: HyperIdleDb, eventBus: EventBus): ProvisionSessionDeps {
	return {
		db,
		eventBus,
		adapterPool: {
			select: () => null,
			release: () => {},
			describeSelectFailure: () =>
				"no harness adapters are registered — no local harness was discovered on this host, and no remote worker has registered",
		},
		workspace: {
			spawn: () => {
				throw new Error("workspace.spawn must not be reached before admission");
			},
		},
	} as unknown as ProvisionSessionDeps;
}

function buildComposition() {
	return buildRunOrchestrationComposition({
		harnessRuntime: {
			enforcementRegistry: {},
			createReturnGate: vi.fn(),
			evaluateReturn: vi.fn(),
			provisionReturnHook: vi.fn(),
			writeCliMcpConfig: vi.fn(),
			writePluginStdioMcpEntries: vi.fn(),
			openMcpBridge: vi.fn(async () => ({ token: "t", url: "u" })),
			closeMcpBridge: vi.fn(async () => {}),
		} as never,
		returnStatusTool: { forRegistry: vi.fn() } as never,
	});
}

async function runUntilProvisioningFails(db: HyperIdleDb, eventBus: EventBus): Promise<void> {
	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, REQUEST_ID));
	if (!request) throw new Error("seed failed");
	await expect(
		buildComposition().runSession(buildDeps(db, eventBus), {
			mode: "durable",
			request,
			sandboxBasePath: "/tmp/provdiag",
		}),
	).rejects.toThrow(POOL_EMPTY);
}

describe("pre-admission provisioning failure diagnosis", () => {
	test("records the failure MESSAGE on the request, not just a bare code", async ({ db }) => {
		await seed(db);
		await runUntilProvisioningFails(db, new EventBus());

		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, REQUEST_ID));

		expect(row?.status).toBe("failed");
		// `err.name` used to be the code, so a plain `new Error` landed as the
		// literal string "Error" — a code that identifies nothing.
		expect(row?.errorCode).toBe("NoAvailableHarnessError");
		// The defect: production stored null here, so no failure was ever
		// diagnosable from the database.
		expect(row?.errorMessage).toContain(POOL_EMPTY);
	});

	test("does not orphan the reserved session in state active", async ({ db }) => {
		await seed(db);
		await runUntilProvisioningFails(db, new EventBus());

		// `reserveOrAdoptSession` inserts the row BEFORE `admitSession` runs, so
		// a pre-admission throw leaves it behind. The product then shows an
		// agent working forever on work that already failed.
		const [session] = await db.select().from(sessions).where(eq(sessions.requestId, REQUEST_ID));

		expect(session).toBeDefined();
		expect(session?.state).not.toBe("active");
		expect(session?.endedAt).not.toBeNull();
	});

	test("carries the failure detail on the lifecycle event so core can record it", async ({
		db,
	}) => {
		await seed(db);
		const eventBus = new EventBus();
		const lifecycle: Array<Record<string, unknown>> = [];
		eventBus.on("agent_run_lifecycle_changed", (event) => {
			lifecycle.push(event as unknown as Record<string, unknown>);
		});

		await runUntilProvisioningFails(db, eventBus);

		// Without this, core-api's routine-run finalizer has nothing to write —
		// which is why `routine_runs.error_message` is null in production too.
		expect(lifecycle).toHaveLength(1);
		expect(lifecycle[0]).toMatchObject({ state: "failed" });
		expect(lifecycle[0]?.errorMessage).toContain(POOL_EMPTY);
	});
});
