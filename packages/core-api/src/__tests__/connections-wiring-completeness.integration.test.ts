/**
 * AU21 Decision K1 (§6 K1, "finish it in AU21" verdict) — item 4 of the
 * reviewer's 4 required changes: every one of the six per-kind emit-time
 * resolvers takes `resolveInjectedConnectionsForAgent?` as an OPTIONAL
 * dependency (Mechanism C) — if a composition-root binding ever forgets to
 * supply it, the resolver silently bakes NO `injectedConnections` (empty
 * plan, no error, no failing test anywhere else) — the exact "silent feature
 * drop" class that recurred 3 times earlier in this same AU21 build (each
 * caught only by careful manual review, never a test).
 *
 * This is a TWO-PART proof across the real composition-root call sites
 * (there are actually EIGHT real wiring sites for the six conceptual intent
 * kinds — `reengagement`/`proposed_call` and `assistant_turn` each have two:
 * an initial-grant/initial-message site plus a retry/re-bake site — not six
 * as originally scoped; corrected here, not narrowed to the original count):
 *
 *  1. **Direct-call proof (this file)** for the two composition-root objects
 *     that are (now) real exported module constants — `taskRunResolverDeps`
 *     (`task-run-resolver-bindings.ts`, already exported) and
 *     `routineSchedulerPorts` (`routine-scheduler-bindings.ts`, exported by
 *     this same fix SOLELY for this test) — calling
 *     `.resolveInjectedConnectionsForAgent(db, agentId)` on each directly
 *     against a real DB with a seeded held connection proves both that the
 *     field is wired (non-undefined) AND that it resolves correctly (closes
 *     over `findUser` properly — the exact class of bug this same K1 pass
 *     found and fixed at `sessions-routes.ts`'s session_start binding, where
 *     the bare 3-arg `resolveInjectedConnectionsForAgent` was passed without
 *     the `findUser` wrapper and failed `npm run check` outright).
 *  2. **Behavioral end-to-end proof (the other 6 real sites)** — see the
 *     parallel `injectedConnections`-asserting tests added to:
 *     `sessions-routes.session-start-baked-emit.integration.test.ts`
 *     (session_start), `knowledge.knowledge-action-baked-emit.integration.test.ts`
 *     (knowledge_action), `threads.reengagement-baked-emit.integration.test.ts`
 *     (reengagement/proposed_call initial grant),
 *     `agent-run-admission-failed-reengagement-migration.integration.test.ts`
 *     (reengagement retry-on-admission-failure), and
 *     `assistant-turn-b3-coherence-trigger.integration.test.ts` (covers BOTH
 *     the initial `assistant_turn` emit at `threads.ts`'s message-post route
 *     AND the coherence re-bake at `assistant-turn-coherence-trigger.ts`, in
 *     one flow).
 */

import { type HyperIdleDb, serviceConnections, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { encryptCredentialValue } from "@hyperidle/shared/crypto";
import { describe, expect, vi } from "vitest";
import { routineSchedulerPorts } from "../services/routine-scheduler-bindings.js";
import { taskRunResolverDeps } from "../services/task-run-resolver-bindings.js";

const NOW = "2026-08-02T00:00:00.000Z";
const SERVER_SECRET = "au21-k1-wiring-completeness-secret";

async function seedOwnerAndConnection(
	db: HyperIdleDb,
	idPrefix: string,
): Promise<{ readonly humanId: string; readonly agentId: string; readonly connectionId: string }> {
	const humanId = `${idPrefix}-human`;
	const agentId = `${idPrefix}-agent`;
	const connectionId = `${idPrefix}-conn`;
	await db.insert(users).values({
		id: humanId,
		kind: "human",
		name: "K1 Wiring Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "K1 Wiring Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(serviceConnections).values({
		id: connectionId,
		userId: humanId,
		service: "github",
		authSource: "token",
		encryptedToken: encryptCredentialValue("k1-wiring-completeness-token"),
		serverUrl: null,
		health: "needs-attention",
		lastValidatedAt: null,
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { humanId, agentId, connectionId };
}

describe("connections-wiring-completeness: every real composition-root call site supplies a REAL resolveInjectedConnectionsForAgent, not silently undefined", () => {
	test("taskRunResolverDeps.resolveInjectedConnectionsForAgent (task_run's composition-root binding) is wired and resolves the seeded held connection", async ({
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
		expect(typeof taskRunResolverDeps.resolveInjectedConnectionsForAgent).toBe("function");

		const { humanId, connectionId } = await seedOwnerAndConnection(db, "au21-k1-taskrun");
		const result = await taskRunResolverDeps.resolveInjectedConnectionsForAgent?.(
			db,
			"au21-k1-taskrun-agent",
		);

		expect(result?.userId).toBe(humanId);
		expect(result?.connections.some((c) => c.id === connectionId)).toBe(true);
		vi.unstubAllEnvs();
	});

	test("routineSchedulerPorts.resolveInjectedConnectionsForAgent (routine_run's composition-root binding) is wired and resolves the seeded held connection", async ({
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
		expect(typeof routineSchedulerPorts.resolveInjectedConnectionsForAgent).toBe("function");

		const { humanId, connectionId } = await seedOwnerAndConnection(db, "au21-k1-routine");
		const result = await routineSchedulerPorts.resolveInjectedConnectionsForAgent?.(
			db,
			"au21-k1-routine-agent",
		);

		expect(result?.userId).toBe(humanId);
		expect(result?.connections.some((c) => c.id === connectionId)).toBe(true);
		vi.unstubAllEnvs();
	});
});
