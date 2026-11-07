/**
 * The composition root actually wires session provisioning:
 * `bootAgentOrchestration` constructs `serviceConnectionResolver`/
 * `heldConnections`/`gitRunnerFactory` itself and exposes them on its own
 * `provisioning` field — this is the Layer that owns the wiring, so this is
 * the Layer whose test proves it.
 *
 */

import { bootAgentExecution } from "@hyperidle/agent-execution";
import { encryptCredentialValue } from "@hyperidle/connections";
import { type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import { registerFixtureOrchestrationCleanup } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { type RunnerDb, serviceConnections } from "@hyperidle/runner-db";
import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { bootAgentOrchestration } from "../boot.js";

const SERVER_SECRET = "provisioning-wiring-provisioning-wiring-secret";
const OWNER_ID = "u-provisioning-wiring-owner";
const OTHER_HUMAN_ID = "u-provisioning-wiring-other";
const AGENT_ID = "agent-provisioning-wiring-target";
const TEAM_ID = "team-provisioning-wiring";
const OWNER_CREATED_AT = "2026-08-01T00:00:00.000Z";
const OTHER_CREATED_AT = "2026-08-02T00:00:00.000Z";

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
});
afterEach(() => {
	vi.unstubAllEnvs();
});

async function seed(db: HyperIdleDb, runnerDb: RunnerDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: "Provisioning Wiring Team", createdAt: OWNER_CREATED_AT });
	await db.insert(users).values([
		{
			id: OWNER_ID,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: OWNER_CREATED_AT,
		},
		{
			id: OTHER_HUMAN_ID,
			kind: "human",
			name: "Other Human",
			role: "member",
			status: "active",
			createdAt: OTHER_CREATED_AT,
		},
		{
			id: AGENT_ID,
			kind: "ai",
			name: "Target Agent",
			role: "builder",
			status: "active",
			createdAt: OWNER_CREATED_AT,
		},
	]);
	await db.insert(userTeams).values({ userId: OWNER_ID, teamId: TEAM_ID });
	await db.insert(userTeams).values({ userId: OTHER_HUMAN_ID, teamId: TEAM_ID });
	await db.insert(userTeams).values({ userId: AGENT_ID, teamId: TEAM_ID });
	await runnerDb.insert(serviceConnections).values([
		{
			id: "sc-provisioning-wiring-owner",
			userId: OWNER_ID,
			service: "github",
			authSource: "token",
			encryptedToken: encryptCredentialValue("gh_owner_wired_token"),
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: OWNER_CREATED_AT,
			updatedAt: OWNER_CREATED_AT,
		},
		{
			id: "sc-provisioning-wiring-other",
			userId: OTHER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			encryptedToken: encryptCredentialValue("sk_other_wired_token"),
			serverUrl: "https://mcp.stripe.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: OTHER_CREATED_AT,
			updatedAt: OTHER_CREATED_AT,
		},
	]);
}

async function bootOrchestrationWithProvisioning(db: HyperIdleDb, runnerDb: RunnerDb) {
	const eventBus = new EventBus();
	// The real execution face — this test proves provisioning wiring, not
	// session execution, so a "disabled" topology (no local sandbox) is enough.
	const agentExecution = await bootAgentExecution({
		topology: "disabled",
		mcpBaseUrl: "http://localhost:0",
	});
	const agentOrchestration = await bootAgentOrchestration({
		db,
		runnerDb,
		eventBus,
		runtime: {
			harnessRuntime: agentExecution.adapters.harnessRuntime,
			returnStatusTool: {
				forRegistry: (registry) => agentExecution.adapters.returnStatusTool.forRegistry(registry),
			},
			// `startRuntime` asserts `writeback` composition is present
			// before it will start at all — neither `editDocument` nor
			// `searchDocuments` is ever dialled by this test (it only proves the
			// provisioning reads), so throwing stubs are enough to satisfy
			// `runtimeDeps`'s default document writeback port (§8.4).
			editDocument: async () => {
				throw new Error("editDocument should not be dialled by this provisioning-only test");
			},
			searchDocuments: async () => {
				throw new Error("searchDocuments should not be dialled by this provisioning-only test");
			},
			session: { db: runnerDb, eventBus, adapterPool: agentExecution.adapters.pool },
		},
	});
	registerFixtureOrchestrationCleanup(db, () => {
		agentOrchestration.dispose();
		return agentOrchestration.joinLifecycleDrain();
	});
	return { agentOrchestration, agentExecution };
}

describe("bootAgentOrchestration wires the real session-provisioning ports", () => {
	test("the wired serviceConnectionResolver decrypts a held connection for its owner (a CredentialResolver here returns null)", async ({
		db,
		runnerDb,
	}) => {
		await seed(db, runnerDb);
		const { agentOrchestration, agentExecution } = await bootOrchestrationWithProvisioning(
			db,
			runnerDb,
		);
		try {
			expect(agentOrchestration.provisioning?.serviceConnectionResolver).toBeDefined();
			// The two-argument call the provisioner makes. This is the exact
			// call that silently returned null in production.
			expect(
				await agentOrchestration.provisioning?.serviceConnectionResolver.resolve(
					OWNER_ID,
					"sc-provisioning-wiring-owner",
				),
			).toBe("gh_owner_wired_token");
			// Per-user isolation is unchanged at the resolver.
			expect(
				await agentOrchestration.provisioning?.serviceConnectionResolver.resolve(
					OTHER_HUMAN_ID,
					"sc-provisioning-wiring-owner",
				),
			).toBeNull();
		} finally {
			await agentOrchestration.disposeRuntime?.();
			agentOrchestration.dispose();
			agentExecution.dispose();
		}
	}, 20_000);

	test("the wired gitRunnerFactory creates a runner with worktreeAdd", async ({ db, runnerDb }) => {
		await seed(db, runnerDb);
		const { agentOrchestration, agentExecution } = await bootOrchestrationWithProvisioning(
			db,
			runnerDb,
		);
		try {
			const factory = agentOrchestration.provisioning?.gitRunnerFactory;
			// Not just defined: the factory must produce a git runner with the
			// worktreeAdd method that space-folder mounting calls at session time.
			const runner = factory?.("/tmp");
			expect(typeof runner?.worktreeAdd).toBe("function");
		} finally {
			await agentOrchestration.disposeRuntime?.();
			agentOrchestration.dispose();
			agentExecution.dispose();
		}
	}, 20_000);
});
