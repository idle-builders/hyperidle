/**
 * The static anti-regrowth guard classifies an `agent-orchestration ->
 * core-api` edge by KIND (raw-port vs. seam-routed) — a seam-routed READ for
 * a decision/provisioning purpose is invisible to it purely because it rides
 * the SAME sanctioned mechanism (`SEAM_INTERFACES`/`SEAM_GROUPS`) as a
 * legitimate seam WRITE. This test proves the closure a different way: not
 * via the graph scanner, but by intercepting the ONE choke point every
 * `CoreApiPort` call — of ANY kind, ANY sub-port, in-process — must
 * physically go through: `createInProcessCoreApiTransport(app)`
 * (`core-api-port-composition.ts`) dispatches every seam call as
 * `app.fetch(req)`. Spying on `app.fetch` itself, then running the REAL
 * connections-provisioning path end-to-end (real in-layer
 * `listHeldConnectionsForProvisioning` read + real
 * `buildProvisioningPlan`/`applyProvisioningPlan`, the same real functions
 * `connections-provisioning-e2e.integration.test.ts` exercises), proves ZERO
 * `CoreApiPort` calls of ANY kind happen at provisioning time. Mirrors the
 * throwing-stub/spy idiom of
 * `admit-session-defense-in-depth-only.integration.test.ts` and the
 * "edge genuinely gone, not deferred" idiom of
 * `run-orchestration-users-edge-closed.test.ts`.
 *
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	decryptCredentialValue,
	encryptCredentialValue,
	listConnections,
	resolveHeldToken,
} from "@hyperidle/connections";
import { serviceConnections, users } from "@hyperidle/db";
import { HELD_AUTH_SOURCES, type HeldAuthSource } from "@hyperidle/domain-model";
import { applyProvisioningPlan, buildProvisioningPlan } from "@hyperidle/run-orchestration";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "../../__testing__/test-fixtures.js";

const SERVER_SECRET = "edge-closed-secret";
const NOW = "2026-08-02T00:00:00.000Z";
const USER_HUMAN_ID = "u-edge-closed-human";
const AGENT_CALLER_ID = "agent-edge-closed-caller";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "edge-closed-"));
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
	vi.stubEnv("HYPERIDLE_API_KEY", "edge-closed-key");
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

describe("run-orchestration's connection-provisioning path makes ZERO CoreApiPort calls of any kind at provisioning time", () => {
	test("live in-layer read -> buildProvisioningPlan -> applyProvisioningPlan completes fully with `app.fetch` (the ONE choke point every in-process CoreApiPort call goes through) NEVER invoked", async ({
		db,
		app,
	}) => {
		await db
			.insert(users)
			.values({
				id: USER_HUMAN_ID,
				kind: "human",
				name: "Edge-Closed Human",
				role: "founder",
				status: "active",
				createdAt: NOW,
			})
			.onConflictDoNothing();
		await db
			.insert(users)
			.values({
				id: AGENT_CALLER_ID,
				kind: "ai",
				name: "Edge-Closed Agent",
				role: "engineer",
				status: "active",
				createdAt: NOW,
			})
			.onConflictDoNothing();
		const encryptedToken = encryptCredentialValue("sk_test_edge_closed");
		await db.insert(serviceConnections).values({
			id: "sc-edge-closed-stripe",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			encryptedToken,
			serverUrl: "https://mcp.stripe.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		// `createInProcessCoreApiTransport(app)` dispatches EVERY in-process
		// `CoreApiPort` call as `app.fetch(req)` — spying here intercepts a
		// live seam call regardless of which sub-port, method, or disguise a
		// future regression might use.
		const fetchSpy = vi.spyOn(app, "fetch");

		const plan = await buildProvisioningPlan({
			connections: {
				listHeldForProvisioning: () =>
					listConnections(db, { userId: USER_HUMAN_ID }).then((rows) =>
						rows
							.filter((r) => (HELD_AUTH_SOURCES as readonly string[]).includes(r.authSource))
							.map((r) => ({
								id: r.id,
								userId: r.userId,
								service: r.service,
								authSource: r.authSource as HeldAuthSource,
								serverUrl: r.serverUrl ?? null,
							})),
					),
			},
			resolver: {
				resolve: (userId: string, connectionId: string) =>
					resolveHeldToken(db, userId, connectionId, decryptCredentialValue),
			},
		});
		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: true,
		});

		// Sanity: the provisioning actually did real work (proves this isn't a
		// vacuous "nothing happened, so nothing was called" false green).
		expect(plan.mcpServers.some((s) => s.name === "stripe")).toBe(true);
		expect(result.mcpTokenEnv).toEqual({});

		expect(fetchSpy).not.toHaveBeenCalled();

		fetchSpy.mockRestore();
	});

	// The Application resolves the owner and hands the id to the read
	// (`create-server.ts`'s `resolveProvisioningOwnerUserId`), and no human
	// means no connections rather than a sentinel — so the sibling case worth
	// holding is the empty one: a deployment with no held connections must
	// still reach zero seam calls, rather than quietly taking some other path.
	test("the same proof holds when there is no held connection at all — still zero CoreApiPort calls", async ({
		db,
		app,
	}) => {
		const fetchSpy = vi.spyOn(app, "fetch");

		const plan = await buildProvisioningPlan({
			connections: {
				listHeldForProvisioning: () =>
					listConnections(db, { userId: USER_HUMAN_ID }).then((rows) =>
						rows
							.filter((r) => (HELD_AUTH_SOURCES as readonly string[]).includes(r.authSource))
							.map((r) => ({
								id: r.id,
								userId: r.userId,
								service: r.service,
								authSource: r.authSource as HeldAuthSource,
								serverUrl: r.serverUrl ?? null,
							})),
					),
			},
			resolver: {
				resolve: (userId: string, connectionId: string) =>
					resolveHeldToken(db, userId, connectionId, decryptCredentialValue),
			},
		});
		await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: true,
		});

		expect(plan.mcpServers).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();

		fetchSpy.mockRestore();
	});
});
