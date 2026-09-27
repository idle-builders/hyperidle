/**
 * The composition root actually wires session provisioning:
 * `bootAgentOrchestration` constructs `serviceConnectionResolver`/
 * `heldConnections`/`injectedFilesystems` itself and exposes them on its own
 * `provisioning` field — this is the Layer that owns the wiring, so this is
 * the Layer whose test proves it.
 *
 * @lore A test that hand-builds its own port and calls the read function directly never goes through the real composition root, so it cannot catch a wiring mismatch there — which is exactly how `serviceConnectionResolver` once got wired to a `CredentialResolver` (`resolve(name)`) where a `ServiceConnectionResolver` (`resolve(userId, connectionId)`) was expected: a blanket `as` cast on the deps literal hid the arity mismatch from `tsc`, and provisioning silently provisioned nothing in production for months.
 *
 * This test boots the REAL `bootAgentOrchestration` and asserts, functionally
 * against a real DB, that all three provisioning ports are the real
 * implementations:
 *   - the resolver decrypts a held connection for its owner — the two-argument
 *     call the provisioner makes. A `CredentialResolver` in that slot returns
 *     null here (it would look `server_credentials` up by NAME = a user id).
 *   - the held-connection reader reads `service_connections` live, scoped to
 *     the owning human, never a second human's tokens.
 *   - the injected-filesystem reader reads `filesystem_injections` live.
 */

import { bootAgentExecution } from "@hyperidle/agent-execution";
import { encryptCredentialValue } from "@hyperidle/connections";
import {
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	serviceConnections,
	teams,
	users,
} from "@hyperidle/db";
import {
	describe,
	expect,
	registerFixtureOrchestrationCleanup,
	test,
} from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, vi } from "vitest";
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

async function seed(db: HyperIdleDb): Promise<void> {
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
			teamId: TEAM_ID,
			createdAt: OWNER_CREATED_AT,
		},
		{
			id: OTHER_HUMAN_ID,
			kind: "human",
			name: "Other Human",
			role: "member",
			status: "active",
			teamId: TEAM_ID,
			createdAt: OTHER_CREATED_AT,
		},
		{
			id: AGENT_ID,
			kind: "ai",
			name: "Target Agent",
			role: "builder",
			status: "active",
			teamId: TEAM_ID,
			createdAt: OWNER_CREATED_AT,
		},
	]);
	await db.insert(serviceConnections).values([
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
	await db.insert(filesystems).values({
		id: "fs-provisioning-wiring",
		teamId: TEAM_ID,
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "doc_set", folder: "/tmp/provisioning-wiring-vault" }),
		writeback: "file",
		state: "attached",
		createdAt: OWNER_CREATED_AT,
	});
	await db.insert(filesystemInjections).values({
		agentUserId: AGENT_ID,
		filesystemId: "fs-provisioning-wiring",
		createdAt: OWNER_CREATED_AT,
	});
}

async function bootOrchestrationWithProvisioning(db: HyperIdleDb) {
	const eventBus = new EventBus();
	// The real execution face — this test proves provisioning wiring, not
	// session execution, so a "disabled" topology (no local sandbox) is enough.
	const agentExecution = await bootAgentExecution({
		topology: "disabled",
		mcpBaseUrl: "http://localhost:0",
	});
	// @lore token-cipher: `bootAgentOrchestration` owns its own cipher now — `encryptCredentialValue` above is this package's own real AES cipher (`@hyperidle/connections`), used only to seed the fixture data this test asserts the production wiring can decrypt.
	const agentOrchestration = await bootAgentOrchestration({
		db,
		eventBus,
		runtime: {
			harnessRuntime: agentExecution.adapters.harnessRuntime,
			returnStatusTool: {
				forRegistry: (registry) => agentExecution.adapters.returnStatusTool.forRegistry(registry),
			},
			// `startRuntime` asserts `worker`/`writeback` composition is present
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
			worker: {
				pool: agentExecution.adapters.pool,
				createWorkerAdapter: (ws, registration) =>
					agentExecution.adapters.createWorkerAdapter(ws, registration),
			},
			session: { db, eventBus, adapterPool: agentExecution.adapters.pool },
			sandboxBasePath: "/tmp/provisioning-wiring-provisioning-wiring",
			// This test proves ONE owning human's wiring — the resolver itself,
			// not cross-layer owner resolution (that is
			// `bootCoreApi.resolveProvisioningOwnerUserId`'s own concern).
			resolveProvisioningOwnerUserId: async () => OWNER_ID,
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
	}) => {
		await seed(db);
		const { agentOrchestration, agentExecution } = await bootOrchestrationWithProvisioning(db);
		try {
			// @lore No instanceof check here — `ServiceConnectionResolver` is a deleted class; the functional check below proves the same contract against the `resolveHeldToken` function this uses instead.
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

	test("the wired held-connection reader reads live and carries ONLY the owning human's connections", async ({
		db,
	}) => {
		await seed(db);
		const { agentOrchestration, agentExecution } = await bootOrchestrationWithProvisioning(db);
		try {
			const rows =
				(await agentOrchestration.provisioning?.heldConnections?.listHeldForProvisioning()) ?? [];
			expect(rows.map((row) => row.id)).toEqual(["sc-provisioning-wiring-owner"]);
			expect(rows[0]?.userId).toBe(OWNER_ID);

			// Live, not a boot-time snapshot: a connection added after the
			// server booted is in the very next read.
			await db.insert(serviceConnections).values({
				id: "sc-provisioning-wiring-added-after-boot",
				userId: OWNER_ID,
				service: "linear",
				authSource: "mcp",
				encryptedToken: null,
				serverUrl: "https://mcp.linear.app",
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: OWNER_CREATED_AT,
				updatedAt: OWNER_CREATED_AT,
			});
			const afterAdd =
				(await agentOrchestration.provisioning?.heldConnections?.listHeldForProvisioning()) ?? [];
			expect(afterAdd.map((row) => row.id).sort()).toEqual([
				"sc-provisioning-wiring-added-after-boot",
				"sc-provisioning-wiring-owner",
			]);
			// The second human's row is in neither read.
			expect(afterAdd.some((row) => row.userId === OTHER_HUMAN_ID)).toBe(false);
		} finally {
			await agentOrchestration.disposeRuntime?.();
			agentOrchestration.dispose();
			agentExecution.dispose();
		}
	}, 20_000);

	test("the wired injected-filesystem reader reads filesystem_injections live", async ({ db }) => {
		await seed(db);
		const { agentOrchestration, agentExecution } = await bootOrchestrationWithProvisioning(db);
		try {
			const injected =
				(await agentOrchestration.provisioning?.injectedFilesystems.listInjectedForProvisioning(
					AGENT_ID,
				)) ?? [];
			expect(injected.map((row) => row.id)).toEqual(["fs-provisioning-wiring"]);

			// A different agent has none — the reader really filters on the id.
			expect(
				await agentOrchestration.provisioning?.injectedFilesystems.listInjectedForProvisioning(
					OWNER_ID,
				),
			).toEqual([]);
		} finally {
			await agentOrchestration.disposeRuntime?.();
			agentOrchestration.dispose();
			agentExecution.dispose();
		}
	}, 20_000);
});
