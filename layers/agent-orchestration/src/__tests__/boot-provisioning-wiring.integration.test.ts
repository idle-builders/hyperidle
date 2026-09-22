/**
 * AU26 review C1 — the composition root actually wires session provisioning.
 *
 * @lore AU31 §5.1: relocated from `layers/core-api/src/__tests__/
 * server-factory.provisioning-wiring.integration.test.ts`. The three
 * provisioning ports it proves (`serviceConnectionResolver`/`heldConnections`/
 * `injectedFilesystems`) used to be constructed by the Application
 * (`create-server.ts`) and exposed on `ServerHandle.provisioning`; §5.1 moved
 * their construction IN-LAYER, into `bootAgentOrchestration` itself
 * (`connections`/`filesystems`/`filesystem-mounting` are this Layer's own
 * services now), exposed on the boot's own `provisioning` field. This is the
 * Layer that now owns the wiring, so this is the Layer whose test proves it.
 *
 * This work package's headline discovery, preserved verbatim: `serviceConnectionResolver` was
 * wired to a `CredentialResolver` (`resolve(name)`) where a `ServiceConnectionResolver`
 * (`resolve(userId, connectionId)`) was expected. AN2 provisioning therefore
 * provisioned NOTHING in production, for months, silently — a blanket `as`
 * cast on the deps literal hid the arity mismatch from `tsc`, and every
 * provisioning test hand-built its own port and called the read function
 * directly, so none of them went through the real composition root.
 *
 * This test is the missing half. It boots the REAL `bootAgentOrchestration`
 * and asserts, functionally against a real DB, that all three provisioning
 * ports are the real implementations:
 *   - the resolver decrypts a held connection for its owner — the two-argument
 *     call the provisioner makes. A `CredentialResolver` in that slot returns
 *     null here (it would look `server_credentials` up by NAME = a user id).
 *   - the held-connection reader reads `service_connections` live, scoped to
 *     the owning human, never a second human's tokens (review C2).
 *   - the injected-filesystem reader reads `filesystem_injections` live.
 */

import { bootAgentExecution } from "@hyperidle/agent-execution";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/credentials";
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

const SERVER_SECRET = "au26-c1-provisioning-wiring-secret";
const OWNER_ID = "u-au26-c1-owner";
const OTHER_HUMAN_ID = "u-au26-c1-other";
const AGENT_ID = "agent-au26-c1-target";
const TEAM_ID = "team-au26-c1";
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
		.values({ id: TEAM_ID, name: "AU26 C1", phase: "build", createdAt: OWNER_CREATED_AT });
	await db.insert(users).values([
		{
			id: OWNER_ID,
			kind: "human",
			name: "AU26 Owner",
			role: "founder",
			status: "active",
			teamId: TEAM_ID,
			createdAt: OWNER_CREATED_AT,
		},
		{
			id: OTHER_HUMAN_ID,
			kind: "human",
			name: "AU26 Other Human",
			role: "member",
			status: "active",
			teamId: TEAM_ID,
			createdAt: OTHER_CREATED_AT,
		},
		{
			id: AGENT_ID,
			kind: "ai",
			name: "AU26 Target Agent",
			role: "builder",
			status: "active",
			teamId: TEAM_ID,
			createdAt: OWNER_CREATED_AT,
		},
	]);
	await db.insert(serviceConnections).values([
		{
			id: "sc-au26-c1-owner",
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
			id: "sc-au26-c1-other",
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
		id: "fs-au26-c1",
		teamId: TEAM_ID,
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "doc_set", folder: "/tmp/au26-c1-vault" }),
		writeback: "file",
		state: "attached",
		createdAt: OWNER_CREATED_AT,
	});
	await db.insert(filesystemInjections).values({
		agentUserId: AGENT_ID,
		filesystemId: "fs-au26-c1",
		createdAt: OWNER_CREATED_AT,
	});
}

async function bootOrchestrationWithProvisioning(db: HyperIdleDb) {
	const eventBus = new EventBus();
	// AU31 §6: the real execution face — this test proves §5.1's wiring, not
	// session execution, so a "disabled" topology (no local sandbox) is enough.
	const agentExecution = await bootAgentExecution({
		topology: "disabled",
		mcpBaseUrl: "http://localhost:0",
	});
	// @lore AU44-b2: cipher is required by connections route since @hyperidle/credential-access was
	// dissolved into @hyperidle/credentials. The development-world import here (agent-orchestration →
	// core-api/credentials) is a warning-level crossing — acceptable in integration tests that need
	// the real AES cipher to round-trip with seed data encrypted by encryptCredentialValue above.
	const agentOrchestration = await bootAgentOrchestration({
		db,
		eventBus,
		cipher: { encrypt: encryptCredentialValue, decrypt: decryptCredentialValue },
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
			coreApiTransport: async () => {
				throw new Error("coreApiTransport should not be dialled by this provisioning-only test");
			},
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
			sandboxBasePath: "/tmp/au26-c1-provisioning-wiring",
			// AU26 review C2: this test proves ONE owning human's wiring — the
			// resolver itself, not cross-layer owner resolution (that is
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
			// @lore AU44 batch2: instanceof check removed (ServiceConnectionResolver class deleted).
			// replaced by resolveHeldToken function. Functional check below proves the same contract.
			expect(agentOrchestration.provisioning?.serviceConnectionResolver).toBeDefined();
			// The two-argument call the provisioner makes. This is the exact
			// call that silently returned null in production.
			expect(
				await agentOrchestration.provisioning?.serviceConnectionResolver.resolve(
					OWNER_ID,
					"sc-au26-c1-owner",
				),
			).toBe("gh_owner_wired_token");
			// Per-user isolation is unchanged at the resolver (AN1).
			expect(
				await agentOrchestration.provisioning?.serviceConnectionResolver.resolve(
					OTHER_HUMAN_ID,
					"sc-au26-c1-owner",
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
			expect(rows.map((row) => row.id)).toEqual(["sc-au26-c1-owner"]);
			expect(rows[0]?.userId).toBe(OWNER_ID);

			// Live, not a boot-time snapshot: a connection added after the
			// server booted is in the very next read.
			await db.insert(serviceConnections).values({
				id: "sc-au26-c1-added-after-boot",
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
				"sc-au26-c1-added-after-boot",
				"sc-au26-c1-owner",
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
			expect(injected.map((row) => row.id)).toEqual(["fs-au26-c1"]);

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
