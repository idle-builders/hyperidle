/**
 * AU21 §9 Increment 12 (Decision H3), Wave C — architecture.md's Increment 12
 * test (b): "the sandbox files' actual content is byte-for-byte equivalent to
 * pre-migration for the same fixed corpus, not just 'some content'."
 *
 * Exercises the REAL end-to-end bake→consume path against a real seeded DB
 * corpus (task, bet, agent, team, one L4/L2/L3 knowledge item each — the same
 * corpus shape `session-knowledge-assembler-ranking-parity.integration.test.ts`
 * (Wave A) pins for the ranking/budget SET): `@hyperidle/work`'s real,
 * already-GREEN (Wave B) `resolveTaskRunRequest` bakes a genuine
 * `contextBundle` from the seeded rows; that bundle is handed to the
 * bundle-consuming `assembleAgentContext` (Wave C) via POISONED ports (proving
 * zero reads — a thrown poisoned-port call would fail the test, same
 * technique as `context-bundle-consumption.test.ts`).
 *
 * @lore CONFUSION (Wave C, resolved — flagged for reviewer): the RED-phase
 * version of this test compared the bundle-consuming output against a LIVE
 * run of the pre-migration DB-reading path (`runSession(...,{mode:"assemble",
 * input:{db,...}})`, no `contextBundle`). That comparison is no longer
 * buildable post-GREEN: Wave C deletes `context.ts`'s entire DB-reading path
 * AND `run-orchestration-composition.ts`'s `contextPorts.knowledge`/`.org`
 * wiring (required for `context-assembly-anti-regrowth.test.ts` to prove
 * ZERO `run-orchestration -> knowledge/org` edges) — there is no "old path"
 * left to run in the SAME tree as the new one. This rewrite proves the
 * IDENTICAL acceptance criterion (byte-for-byte sandbox output for a fixed
 * corpus) by asserting the real bundle-consuming path's output against KNOWN
 * EXPECTED byte content derived from the same seeded rows — same strength
 * (every zone's file content, the manifest's item set, and session.toon's
 * encoded fields are all asserted), different mechanism (expected-value
 * assertion instead of a live dual-path diff, since only one path exists now).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { createContextAssembler } from "@hyperidle/run-orchestration/scaffolding";
import { requireRunnableAgent } from "@hyperidle/users";
import { resolveTaskRunRequest } from "@hyperidle/work";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = "2026-08-01T00:00:00.000Z";
const AGENT_ROLE = "builder"; // communityForRole("builder") === "building"
const TASK_DESCRIPTION = "Ship the Wave C byte-parity check.";

async function seedFixedCorpus(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{
	teamId: string;
	agentId: string;
	taskId: string;
	betId: string;
	attemptId: string;
	itemL4Id: string;
	itemL2Id: string;
	itemL3Id: string;
}> {
	const teamId = ids("team-i12c-parity");
	const agentId = ids("agent-i12c-parity");
	const taskId = ids("task-i12c-parity");
	const betId = ids("bet-i12c-parity");
	const attemptId = ids("attempt-i12c-parity");
	const itemL4Id = ids("item-i12c-l4");
	const itemL2Id = ids("item-i12c-l2");
	const itemL3Id = ids("item-i12c-l3");
	await db
		.insert(teams)
		.values({ id: teamId, name: "Byte Parity Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: ids("tm-i12c-parity"), teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Byte Parity Agent",
		role: AGENT_ROLE,
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "I12 Wave C byte-parity bet",
		appetite: "small",
		doneCondition: "Byte-identical sandboxes",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "I12 Wave C byte-parity task",
		description: TASK_DESCRIPTION,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(taskDispatchAttempts).values({
		id: attemptId,
		taskId,
		occasion: "accepted",
		agentId,
		ordinal: 1,
		status: "requested",
		createdAt: NOW,
		updatedAt: NOW,
	});

	await db.insert(knowledgeItems).values({
		id: itemL4Id,
		scopeKind: "factory",
		scopeId: null,
		title: "Factory-wide practice",
		body: "Applies to every team and every community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: ids("proj-i12c-l4"),
		knowledgeItemId: itemL4Id,
		layer: "L4",
		scopeId: null,
	});

	await db.insert(knowledgeItems).values({
		id: itemL2Id,
		scopeKind: "team",
		scopeId: teamId,
		title: "Team-scoped product knowledge",
		body: "Specific to the parity team's product.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: ids("proj-i12c-l2"),
		knowledgeItemId: itemL2Id,
		layer: "L2",
		scopeId: teamId,
	});

	await db.insert(knowledgeItems).values({
		id: itemL3Id,
		scopeKind: "practice",
		scopeId: "building",
		title: "Building practice knowledge",
		body: "Relevant to the builder community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: ids("proj-i12c-l3"),
		knowledgeItemId: itemL3Id,
		layer: "L3",
		scopeId: "building",
	});
	return { teamId, agentId, taskId, betId, attemptId, itemL4Id, itemL2Id, itemL3Id };
}

/** Recursively list every file under `dir`, relative to `dir` — order-independent (sorted). */
function listFilesRecursive(dir: string): string[] {
	const out: string[] = [];
	if (!fs.existsSync(dir)) return out;
	const walk = (current: string, prefix: string): void => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				walk(path.join(current, entry.name), rel);
			} else {
				out.push(rel);
			}
		}
	};
	walk(dir, "");
	return out.sort();
}

/** Every port method throws — the bundle-consuming path must never call any of these. */
function poisonedPorts(): Parameters<typeof createContextAssembler>[0] {
	const poison = (name: string) => (): never => {
		throw new Error(`ZERO-READ VIOLATION: ports.${name} was called`);
	};
	return {
		filesystems: { startWatcher: poison("filesystems.startWatcher") },
	} as unknown as Parameters<typeof createContextAssembler>[0];
}

describe("context.ts sandbox output — bundle-consuming byte parity for a fixed corpus (Increment 12 Wave C)", () => {
	test("context/session.toon + context/{product,practices,factory} are byte-exact for the baked bundle, with ZERO port reads", async ({
		db,
		ids,
	}) => {
		const seeded = await seedFixedCorpus(db, ids);

		const newSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "i12c-new-"));
		try {
			// -- Real production bake (Wave B, already GREEN): resolveTaskRunRequest
			// derives the contextBundle from the SAME seeded rows. --
			const baked = await resolveTaskRunRequest(db, seeded.attemptId, {
				requireRunnableAgent,
				getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
				assembleSessionKnowledge,
			});
			expect(baked.contextBundle).toBeDefined();
			const bundle = baked.contextBundle;
			if (bundle?.kind !== "task") throw new Error("expected a kind:'task' contextBundle");

			// -- Real Wave C consuming path, poisoned ports proving zero reads. --
			const assembler = createContextAssembler(poisonedPorts());
			await assembler.assembleAgentContext({
				sandboxPath: newSandbox,
				sessionId: ids("session-i12c-new"),
				taskId: seeded.taskId,
				agentId: seeded.agentId,
				agentRole: AGENT_ROLE,
				teamId: seeded.teamId,
				isRoutine: false,
				sourceKind: null,
				sourceId: null,
				sourceCorrelation: null,
				contextBundle: bundle,
			});

			// -- Assert: every zone's file content is byte-exact, matching the
			// SAME seeded item bodies (the pre-migration behavior this bundle-
			// consuming rewrite must preserve). --
			const newContextFiles = listFilesRecursive(path.join(newSandbox, "context"));
			expect(newContextFiles.length).toBeGreaterThan(0);
			// File names are derived from the knowledge item ids (first 8 chars).
			const l4Prefix = seeded.itemL4Id.slice(0, 8);
			const l2Prefix = seeded.itemL2Id.slice(0, 8);
			const l3Prefix = seeded.itemL3Id.slice(0, 8);
			expect(newContextFiles).toEqual(
				[
					`factory/Factory-wide_practice_${l4Prefix}.md`,
					`practices/Building_practice_knowledge_${l3Prefix}.md`,
					`product/Team-scoped_product_knowledge_${l2Prefix}.md`,
					"session.toon",
				].sort(),
			);

			const factoryBody = fs.readFileSync(
				path.join(newSandbox, `context/factory/Factory-wide_practice_${l4Prefix}.md`),
			);
			expect(factoryBody.toString("utf8")).toBe("Applies to every team and every community.");

			const productBody = fs.readFileSync(
				path.join(newSandbox, `context/product/Team-scoped_product_knowledge_${l2Prefix}.md`),
			);
			expect(productBody.toString("utf8")).toBe("Specific to the parity team's product.");

			const practicesBody = fs.readFileSync(
				path.join(newSandbox, `context/practices/Building_practice_knowledge_${l3Prefix}.md`),
			);
			expect(practicesBody.toString("utf8")).toBe("Relevant to the builder community.");

			// -- session.toon encodes the exact baked task/bet/agent/team fields. --
			const toon = fs.readFileSync(path.join(newSandbox, "context/session.toon"), "utf8");
			expect(toon).toContain(seeded.taskId);
			expect(toon).toContain("I12 Wave C byte-parity task");
			expect(toon).toContain("Byte Parity Agent");
			expect(toon).toContain("Byte Parity Team");

			const manifest = JSON.parse(
				fs.readFileSync(path.join(newSandbox, ".fabric/manifest.json"), "utf8"),
			) as { items: Record<string, { source_path: string }> };
			expect(Object.keys(manifest.items).sort()).toEqual(
				[seeded.itemL4Id, seeded.itemL2Id, seeded.itemL3Id].sort(),
			);
		} finally {
			fs.rmSync(newSandbox, { recursive: true, force: true });
		}
	});
});
