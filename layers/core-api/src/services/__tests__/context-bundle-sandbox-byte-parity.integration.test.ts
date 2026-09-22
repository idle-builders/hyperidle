/**
 * AU21 §9 Increment 12 (Decision H3), Wave C — architecture.md's Increment 12
 * test (b): "the sandbox files' actual content is byte-for-byte equivalent to
 * pre-migration for the same fixed corpus, not just 'some content'."
 *
 * Exercises the REAL end-to-end bake→consume path against a real seeded DB
 * corpus (task, bet, agent, team, one L4/L2/L3 knowledge item each — the same
 * corpus shape `session-documents-ranking-parity.integration.test.ts`
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
	documents,
	type HyperIdleDb,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { assembleSessionDocuments } from "@hyperidle/document";
import { getTeam } from "@hyperidle/org";
import { createContextAssembler } from "@hyperidle/run-orchestration/scaffolding";
import { resolveTaskRunRequest } from "@hyperidle/task";
import { requireRunnableAgent } from "@hyperidle/users";
import { makeDocumentReadPorts } from "../../__testing__/document-read-test-ports.js";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { createStandaloneSearchDocuments } from "../../actions/compose.js";

const { getAgentIdentity } = makeDocumentReadPorts(createStandaloneSearchDocuments());

const NOW = "2026-08-01T00:00:00.000Z";
const TEAM_ID = "team-i12c-parity";
const AGENT_ID = "agent-i12c-parity";
// @lore BA9g: the practice an agent belongs to IS its role. This said
// `communityForRole("builder") === "building"` — the catalog's mapping of 16
// roles onto four communities, gone with the catalog. `knowledge.ts` already
// documented the truth ("practice scopeId is a role id").
const AGENT_ROLE = "builder";
const TASK_ID = "task-i12c-parity";
const ROOT_TASK_ID = "bet-i12c-parity";
const ATTEMPT_ID = "attempt-i12c-parity";
const TASK_DESCRIPTION = "Ship the Wave C byte-parity check.";

async function seedFixedCorpus(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: "Byte Parity Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Byte Parity Agent",
		role: AGENT_ROLE,
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${ROOT_TASK_ID}`,
		hostKind: "team",
		hostId: TEAM_ID,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${ROOT_TASK_ID}`,
		id: ROOT_TASK_ID,
		parentTaskId: null,
		teamId: TEAM_ID,
		title: "I12 Wave C byte-parity bet",
		description: "I12 Wave C byte-parity bet",
		doneCondition: "Byte-identical sandboxes",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${TASK_ID}`,
		hostKind: "team",
		hostId: TEAM_ID,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${TASK_ID}`,
		id: TASK_ID,
		parentTaskId: ROOT_TASK_ID,
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

	await db.insert(documents).values({
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

	await db.insert(documents).values({
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

	await db.insert(documents).values({
		id: "item-i12c-l3",
		scopeKind: "user",
		scopeId: AGENT_ID,
		title: "The agent's own note",
		body: "Relevant only to this agent.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
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
		filesystems: { startWatcher: poison("filesystems.startWatcher") },
	} as unknown as Parameters<typeof createContextAssembler>[0];
}

describe("context.ts sandbox output — bundle-consuming byte parity for a fixed corpus (Increment 12 Wave C)", () => {
	test("context/session.toon + knowledge/ are byte-exact for the baked bundle, with ZERO port reads", async ({
		db,
	}) => {
		await seedFixedCorpus(db);

		const newSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "i12c-new-"));
		try {
			// -- Real production bake (Wave B, already GREEN): resolveTaskRunRequest
			// derives the contextBundle from the SAME seeded rows. --
			const baked = await resolveTaskRunRequest(
				db,
				{ kind: "task_run", attemptId: ATTEMPT_ID },
				{
					requireRunnableAgent,
					getAgentIdentity,
					getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
					assembleSessionDocuments,
				},
			);
			expect(baked.contextBundle).toBeDefined();
			const bundle = baked.contextBundle;
			if (bundle?.kind !== "task") throw new Error("expected a kind:'task' contextBundle");

			// -- Real Wave C consuming path, poisoned ports proving zero reads. --
			const assembler = createContextAssembler(poisonedPorts());
			await assembler.assembleAgentContext({
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
				contextBundle: bundle,
			});

			// -- Assert: every knowledge/ file's content is byte-exact, matching
			// the SAME seeded item bodies (architecture.md D1: scope
			// alone selects reach now — no more layer zones under context/). --
			const newKnowledgeFiles = listFilesRecursive(path.join(newSandbox, "knowledge"));
			expect(newKnowledgeFiles.length).toBeGreaterThan(0);
			expect(newKnowledgeFiles).toEqual(
				[
					"Factory-wide_practice_item-i12.md",
					"The_agent_s_own_note_item-i12.md",
					"Team-scoped_product_knowledge_item-i12.md",
				].sort(),
			);

			const factoryBody = fs.readFileSync(
				path.join(newSandbox, "knowledge/Factory-wide_practice_item-i12.md"),
			);
			expect(factoryBody.toString("utf8")).toBe("Applies to every team and every community.");

			const productBody = fs.readFileSync(
				path.join(newSandbox, "knowledge/Team-scoped_product_knowledge_item-i12.md"),
			);
			expect(productBody.toString("utf8")).toBe("Specific to the parity team's product.");

			const ownBody = fs.readFileSync(
				path.join(newSandbox, "knowledge/The_agent_s_own_note_item-i12.md"),
			);
			expect(ownBody.toString("utf8")).toBe("Relevant only to this agent.");

			// -- session.toon encodes the exact baked task/bet/agent/team fields. --
			const toon = fs.readFileSync(path.join(newSandbox, "context/session.toon"), "utf8");
			expect(toon).toContain(TASK_ID);
			expect(toon).toContain("I12 Wave C byte-parity task");
			expect(toon).toContain("Byte Parity Agent");
			expect(toon).toContain("Byte Parity Team");

			const manifest = JSON.parse(
				fs.readFileSync(path.join(newSandbox, ".fabric/manifest.json"), "utf8"),
			) as { items: Record<string, { source_path: string }> };
			expect(Object.keys(manifest.items).sort()).toEqual(
				["item-i12c-l4", "item-i12c-l2", "item-i12c-l3"].sort(),
			);
		} finally {
			fs.rmSync(newSandbox, { recursive: true, force: true });
		}
	});
});
