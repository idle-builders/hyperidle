/**
 * AU29 §2.5.2 — the core-api first-boot face.
 *
 * RED PHASE: fails until `applyFactoryCoreState` exists at
 * `layers/core-api/src/bootstrap/factory-state.ts` (architecture.md §2.5.2). Asserts the produced
 * rows, not the code shape: the exact values `applyFactoryBootstrap` writes today, byte-identical
 * to the control captured pre-move (`.pipeline/work/AU29/probes/first-boot-control.json`), plus the
 * new `FactoryAgentRef[]` return contract — nothing tested this before the bootstrap split existed.
 * `agent_run_config` is deliberately out of scope here — that is the agent-orchestration face's
 * contract, covered by `layers/agent-orchestration/src/__tests__/factory-run-config.integration.test.ts`.
 *
 * @lore BA9d: Facilitators removed from the factory roster. The five seed-agent-pf-* agents are
 * now owned by the document-management plugin (BA9d wave 2). The core factory seeds only
 * system:propagation and seed-agent-cos (System Agent). ROSTER_IDS shrank from 6 → 1.
 * Migration 0065 migrated existing strategy rows to "individual".
 */

import { users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { applyFactoryCoreState } from "../factory-state.js";

const ROSTER_IDS = ["seed-agent-cos"];

describe("applyFactoryCoreState — first-boot core state (AU29 AC 7)", () => {
	test("creates the propagation user and the System Agent singleton", async ({ db }) => {
		await applyFactoryCoreState(db);

		const propagation = await db.select().from(users).where(eq(users.id, "system:propagation"));
		expect(propagation).toHaveLength(1);
		expect(propagation[0]?.agentCategory).toBeNull();

		const cos = await db.select().from(users).where(eq(users.id, "seed-agent-cos"));
		expect(cos).toHaveLength(1);
		expect(cos[0]?.role).toBe("assistant");
		expect(cos[0]?.agentCategory).toBe("individual");

		// @lore BA9d: facilitators no longer seeded by factory — plugin track owns them.
		const facilitators = await db.select().from(users).where(eq(users.role, "facilitator"));
		expect(facilitators).toHaveLength(0);

		// @lore AU43 repair: seed-ki-1 knowledge item assertions removed — ensureFactoryKnowledgeSeed
		// was deleted by AU43 bundle-4. Bootstrap no longer seeds knowledge items.
	});

	test("returns the roster agents' {id, role} — the FactoryAgentRef contract the run-config face needs", async ({
		db,
	}) => {
		const refs = await applyFactoryCoreState(db);

		const byId = new Map(refs.map((r) => [r.id, r.role]));
		expect([...byId.keys()].sort()).toEqual([...ROSTER_IDS].sort());
		expect(byId.get("seed-agent-cos")).toBe("assistant");
	});

	test("is idempotent — a second call on the same db leaves the same rows and refs", async ({
		db,
	}) => {
		const first = await applyFactoryCoreState(db);
		const second = await applyFactoryCoreState(db);

		expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
		// @lore BA9d: 7 → 2 rows — only system:propagation and seed-agent-cos remain in factory.
		const allUsers = await db.select().from(users);
		expect(allUsers).toHaveLength(2);
	});
});
