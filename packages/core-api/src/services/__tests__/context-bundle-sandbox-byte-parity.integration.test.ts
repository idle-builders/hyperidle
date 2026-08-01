/**
 * AU21 §9 Increment 12 (Decision H3), Wave C (RED) — architecture.md's
 * Increment 12 test (b): "the sandbox files' actual content is byte-for-byte
 * equivalent to pre-migration for the same fixed corpus, not just 'some
 * content'."
 *
 * Compares TWO real production paths against the SAME fixed corpus (task,
 * bet, agent, team, one L4/L2/L3 knowledge item each — the same corpus shape
 * `session-knowledge-assembler-ranking-parity.integration.test.ts` (Wave A)
 * already pins for the ranking/budget SET):
 *
 *  - OLD path (still real, unmigrated as of Wave C's RED phase): `runSession`
 *    (`../run-orchestration-composition.js`) in `mode: "assemble"`, which
 *    drives `context.ts`'s CURRENT `assembleAgentContext` — the DB-reading
 *    `fetchAllForLayer`/`rankAndBudget`/`buildSessionContextData` path, wired
 *    to the real `contextPorts`.
 *  - NEW path (not yet built): `@hyperidle/work`'s real, already-GREEN (Wave
 *    B) `resolveTaskRunRequest` bakes a genuine `contextBundle` from the SAME
 *    seeded rows; that bundle is then handed to the bundle-consuming
 *    `assembleAgentContext` this wave builds, via poisoned ports (proving
 *    zero reads, same technique as `context-bundle-consumption.test.ts`).
 *
 * Both sandboxes' `context/session.toon` + every file under
 * `context/{product,practices,factory}` must be BYTE-IDENTICAL — proving the
 * bundle-consuming rewrite is a behavior-preserving migration, not merely "a
 * plausible-looking new path."
 *
 * Currently RED: the NEW path can't be built at all — `resolveTaskRunRequest`'s
 * real `contextBundle` has no bundle-consuming `assembleAgentContext` to feed
 * it to yet (same two RED signals as `context-bundle-consumption.test.ts`:
 * `npm run check`'s excess-property error, and the poisoned-port throw at
 * runtime once `input.taskId` sends the OLD implementation down the DB-read
 * path regardless of the supplied `contextBundle`).
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
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { createContextAssembler } from "@hyperidle/run-orchestration/scaffolding";
import { requireRunnableAgent } from "@hyperidle/users";
import { resolveTaskRunRequest } from "@hyperidle/work";
import { describe, expect, test } from "../../test-fixtures.js";
import { runSession } from "../run-orchestration-composition.js";

const NOW = "2026-08-01T00:00:00.000Z";
const TEAM_ID = "team-i12c-parity";
const AGENT_ID = "agent-i12c-parity";
const AGENT_ROLE = "builder"; // communityForRole("builder") === "building"
const TASK_ID = "task-i12c-parity";
const BET_ID = "bet-i12c-parity";
const ATTEMPT_ID = "attempt-i12c-parity";
const TASK_DESCRIPTION = "Ship the Wave C byte-parity check.";

async function seedFixedCorpus(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: "Byte Parity Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-i12c-parity", teamId: TEAM_ID, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Byte Parity Agent",
		role: AGENT_ROLE,
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: BET_ID,
		teamId: TEAM_ID,
		description: "I12 Wave C byte-parity bet",
		appetite: "small",
		doneCondition: "Byte-identical sandboxes",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: TASK_ID,
		betId: BET_ID,
		teamId: TEAM_ID,
		ownerAgentId: AGENT_ID,
		title: "I12 Wave C byte-parity task",
		description: TASK_DESCRIPTION,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(taskDispatchAttempts).values({
		id: ATTEMPT_ID,
		taskId: TASK_ID,
		occasion: "accepted",
		agentId: AGENT_ID,
		ordinal: 1,
		status: "requested",
		createdAt: NOW,
		updatedAt: NOW,
	});

	await db.insert(knowledgeItems).values({
		id: "item-i12c-l4",
		scopeKind: "factory",
		scopeId: null,
		title: "Factory-wide practice",
		body: "Applies to every team and every community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12c-l4",
		knowledgeItemId: "item-i12c-l4",
		layer: "L4",
		scopeId: null,
	});

	await db.insert(knowledgeItems).values({
		id: "item-i12c-l2",
		scopeKind: "team",
		scopeId: TEAM_ID,
		title: "Team-scoped product knowledge",
		body: "Specific to the parity team's product.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12c-l2",
		knowledgeItemId: "item-i12c-l2",
		layer: "L2",
		scopeId: TEAM_ID,
	});

	await db.insert(knowledgeItems).values({
		id: "item-i12c-l3",
		scopeKind: "practice",
		scopeId: "building",
		title: "Building practice knowledge",
		body: "Relevant to the builder community.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeAppProjection).values({
		id: "proj-i12c-l3",
		knowledgeItemId: "item-i12c-l3",
		layer: "L3",
		scopeId: "building",
	});
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
		knowledge: {
			list: poison("knowledge.list"),
			rankAndBudget: poison("knowledge.rankAndBudget"),
			countTokens: poison("knowledge.countTokens"),
		},
		work: { getTaskById: poison("work.getTaskById"), getBetById: poison("work.getBetById") },
		users: { getUserById: poison("users.getUserById") },
		routine: { getRoutineById: poison("routine.getRoutineById") },
		filesystems: { startWatcher: poison("filesystems.startWatcher") },
		org: { getTeamById: poison("org.getTeamById") },
	} as unknown as Parameters<typeof createContextAssembler>[0];
}

describe("context.ts sandbox output — byte parity, OLD DB path vs NEW baked-bundle path (Increment 12 Wave C, RED)", () => {
	test("context/session.toon + context/{product,practices,factory} are byte-identical on both paths", async ({
		db,
		eventBus,
	}) => {
		await seedFixedCorpus(db);

		// -- OLD path: the real, unmigrated production composition. --
		const oldSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "i12c-old-"));
		const newSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "i12c-new-"));
		try {
			const assembledOld = await runSession(
				{ db, eventBus },
				{
					mode: "assemble",
					input: {
						db,
						sandboxPath: oldSandbox,
						sessionId: "session-i12c-old",
						taskId: TASK_ID,
						agentId: AGENT_ID,
						agentRole: AGENT_ROLE,
						teamId: TEAM_ID,
						isRoutine: false,
						sourceKind: null,
						sourceId: null,
						sourceCorrelation: null,
					},
				},
			);
			expect(assembledOld.mode).toBe("assembled");

			// -- NEW path: real production bake (Wave B, already GREEN) + the
			// bundle-consuming assembleAgentContext this wave builds. --
			const baked = await resolveTaskRunRequest(db, ATTEMPT_ID, {
				requireRunnableAgent,
				getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
				assembleSessionKnowledge,
			});
			expect(baked.contextBundle).toBeDefined();

			const assembler = createContextAssembler(poisonedPorts());
			// `contextBundle` does not exist on `AssembleAgentContextInput` yet —
			// see this file's top @lore for the two independent RED signals.
			const newInput = {
				sandboxPath: newSandbox,
				sessionId: "session-i12c-new",
				taskId: TASK_ID,
				agentId: AGENT_ID,
				agentRole: AGENT_ROLE,
				teamId: TEAM_ID,
				isRoutine: false,
				sourceKind: null,
				sourceId: null,
				sourceCorrelation: null,
				contextBundle: baked.contextBundle,
			} as unknown as Parameters<typeof assembler.assembleAgentContext>[0];
			await assembler.assembleAgentContext(newInput);

			// -- Compare: same file set, byte-identical content. --
			const oldContextFiles = listFilesRecursive(path.join(oldSandbox, "context"));
			const newContextFiles = listFilesRecursive(path.join(newSandbox, "context"));
			expect(newContextFiles).toEqual(oldContextFiles);
			expect(oldContextFiles.length).toBeGreaterThan(0);

			for (const rel of oldContextFiles) {
				const oldContent = fs.readFileSync(path.join(oldSandbox, "context", rel));
				const newContent = fs.readFileSync(path.join(newSandbox, "context", rel));
				expect(newContent.equals(oldContent)).toBe(true);
			}
		} finally {
			fs.rmSync(oldSandbox, { recursive: true, force: true });
			fs.rmSync(newSandbox, { recursive: true, force: true });
		}
	});
});
