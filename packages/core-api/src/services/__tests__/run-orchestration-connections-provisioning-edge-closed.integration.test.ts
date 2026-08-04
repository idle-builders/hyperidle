/**
 * AU21 Decision K1 (§6 K1, "finish it in AU21" verdict; guard blind-spot
 * closure — see `composition-edge-anti-regrowth-guard.ts`'s own top-of-file
 * `@lore Decision K1` entry for the full finding).
 *
 * The static anti-regrowth guard classifies an `agent-orchestration ->
 * core-api` edge by KIND (raw-port vs. seam-routed) — a seam-routed READ for
 * a decision/provisioning purpose is invisible to it purely because it rides
 * the SAME sanctioned mechanism (`SEAM_INTERFACES`/`SEAM_GROUPS`) as a
 * legitimate seam WRITE. This is exactly how the original
 * `CoreApiPort.connections.listHeldConnectionsForProvisioning()` live read
 * went undetected pre-K1 despite `inspect()` reporting zero findings. This
 * test proves the closure a different way: not via the graph scanner, but by
 * intercepting the ONE choke point every `CoreApiPort` call — of ANY kind,
 * ANY sub-port, in-process — must physically go through:
 * `createInProcessCoreApiTransport(app)` (`core-api-port-composition.ts`)
 * dispatches every seam call as `app.fetch(req)`. Spying on `app.fetch`
 * itself, then running the REAL connections-provisioning path end-to-end
 * (real `resolveInjectedConnectionsForAgent` bake + real
 * `buildProvisioningPlan`/`applyProvisioningPlan`, the same real functions
 * `connections-provisioning-e2e.integration.test.ts` exercises), proves ZERO
 * `CoreApiPort` calls of ANY kind happen at provisioning time — not merely
 * that the OLD named method is gone, but that NO seam call (old, renamed, or
 * disguised as reuse of an already-sanctioned seam member) fires along this
 * path. Mirrors the throwing-stub/spy idiom of
 * `admit-session-defense-in-depth-only.integration.test.ts` and the
 * "edge genuinely gone, not deferred" idiom of
 * `run-orchestration-users-edge-closed.test.ts`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	resolveInjectedConnectionsForAgent,
	ServiceConnectionResolver,
} from "@hyperidle/connections";
import { serviceConnections, users } from "@hyperidle/db";
import { applyProvisioningPlan, buildProvisioningPlan } from "@hyperidle/run-orchestration";
import { encryptCredentialValue } from "@hyperidle/shared/crypto";
import { findUser } from "@hyperidle/users";
import { afterEach, beforeEach, describe, expect, test, vi } from "../../test-fixtures.js";

const SERVER_SECRET = "au21-k1-edge-closed-secret";
const NOW = "2026-08-02T00:00:00.000Z";
const USER_HUMAN_ID = "u-k1-edge-closed-human";
const AGENT_CALLER_ID = "agent-k1-edge-closed-caller";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au21-k1-edge-closed-"));
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
	vi.stubEnv("HYPERIDLE_API_KEY", "au21-k1-edge-closed-key");
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

describe("run-orchestration's connection-provisioning path makes ZERO CoreApiPort calls of any kind at provisioning time", () => {
	test("bake -> buildProvisioningPlan -> applyProvisioningPlan completes fully with `app.fetch` (the ONE choke point every in-process CoreApiPort call goes through) NEVER invoked", async ({
		db,
		app,
	}) => {
		await db
			.insert(users)
			.values({
				id: USER_HUMAN_ID,
				kind: "human",
				name: "K1 Edge-Closed Human",
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
				name: "K1 Edge-Closed Agent",
				role: "engineer",
				status: "active",
				maxConcurrentSessions: 1,
				createdAt: NOW,
			})
			.onConflictDoNothing();
		const encryptedToken = encryptCredentialValue("sk_test_k1_edge_closed");
		await db.insert(serviceConnections).values({
			id: "sc-k1-edge-closed-stripe",
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

		const heldConnections = await resolveInjectedConnectionsForAgent(db, AGENT_CALLER_ID, findUser);
		const resolver = new ServiceConnectionResolver(db);
		const plan = await buildProvisioningPlan({ heldConnections, resolver });
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

	test("the same proof holds when the owning human resolves to the 'u-founder' fallback (no findUser match) — still zero CoreApiPort calls", async ({
		db,
		app,
	}) => {
		const fetchSpy = vi.spyOn(app, "fetch");

		const heldConnections = await resolveInjectedConnectionsForAgent(
			db,
			"agent-k1-edge-closed-no-owner",
			async () => undefined,
		);
		const resolver = new ServiceConnectionResolver(db);
		const plan = await buildProvisioningPlan({ heldConnections, resolver });
		await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: true,
		});

		expect(heldConnections.userId).toBe("u-founder");
		expect(fetchSpy).not.toHaveBeenCalled();

		fetchSpy.mockRestore();
	});
});
