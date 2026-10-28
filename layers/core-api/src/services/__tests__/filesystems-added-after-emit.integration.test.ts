/**
 * The agent's injected-filesystem list is read live, in-layer, at spawn — not
 * baked onto the emitted intent as a snapshot. A filesystem an operator
 * assigns to an agent after an intent is emitted but before it drains must
 * still be mounted. The filesystems twin of
 * `connections-added-after-emit.integration.test.ts`.
 *
 * The order below is the whole test:
 *   1. emit a real intent through the real recorder and drain it into a real
 *      `agent_session_requests` row (the emit is genuinely over)
 *   2. THEN assign the filesystem to the agent
 *   3. run the spawn-time filesystems step the provisioner runs
 *   4. the filesystem is mounted — a real symlink in a real sandbox, made by
 *      the real `RegistryFilesystemMounter`, not a stub
 *
 * A frozen emit-time list would fail step 4: the request was frozen at
 * step 1, before the injection existed.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	agentSessionRequests,
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	teams,
	users,
	userTeams,
} from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import {
	listInjectedFilesystemsForProvisioning,
	updateFilesystemState,
} from "@hyperidle/filesystems";
import { mountFilesystemsForAgent, RegistryFilesystemMounter } from "@hyperidle/run-orchestration";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { afterEach, beforeEach, describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = "2026-08-04T00:00:00.000Z";
const HUMAN_ID = "u-owner";
const AGENT_ID = "agent-target";
const TEAM_ID = "team-fs-added-after-emit";

let tmpDir: string;
let sandboxPath: string;
let vaultDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-add-after-emit-"));
	sandboxPath = path.join(tmpDir, "sandbox");
	vaultDir = path.join(tmpDir, "late-vault");
	fs.mkdirSync(sandboxPath, { recursive: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, "index.md"), "# Late vault\n");
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function seedPrincipals(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: TEAM_ID, name: "FS Added After Emit", createdAt: NOW });
	await db.insert(users).values([
		{
			id: HUMAN_ID,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: AGENT_ID,
			kind: "ai",
			name: "Target Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		},
	]);
	await db.insert(userTeams).values({ userId: HUMAN_ID, teamId: TEAM_ID });
	await db.insert(userTeams).values({ userId: AGENT_ID, teamId: TEAM_ID });
}

/**
 * Emit + drain a real intent, exactly as a per-kind resolver's baked emit does.
 * Returns the real `agent_session_requests` row the drain handed off — the
 * request a spawn would later claim.
 */
async function emitAndDrain(
	db: HyperIdleDb,
	eventBus: EventBus,
	idempotencyKey: string,
): Promise<{ readonly payloadJson: string | null }> {
	await enqueueWorkIntent(db, {
		kind: "thread_turn",
		sourceKind: "thread_message",
		sourceId: `${idempotencyKey}-message`,
		idempotencyKey,
		bakedRequest: {
			defaultAgentId: AGENT_ID,
			sourceKind: "assistant",
			sourceId: `${idempotencyKey}-message`,
			streamId: `thread:${idempotencyKey}-thread`,
			userId: HUMAN_ID,
			sourceCorrelation: {
				threadId: `${idempotencyKey}-thread`,
				messageId: `${idempotencyKey}-message`,
				userId: HUMAN_ID,
				agentId: AGENT_ID,
			},
		},
	});
	await drainIntents({ ...queueDeps(db), eventBus });

	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, `${idempotencyKey}-message`));
	if (!request) throw new Error("the drain did not hand off a request row");
	return { payloadJson: request.payloadJson };
}

/** Assign `vaultDir` to the agent as a doc_set filesystem. */
async function assignFilesystem(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(filesystems).values({
		id,
		teamId: TEAM_ID,
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "doc_set", folder: vaultDir }),
		writeback: "file",
		state: "attached",
		createdAt: NOW,
	});
	await db
		.insert(filesystemInjections)
		.values({ agentUserId: AGENT_ID, filesystemId: id, createdAt: NOW });
}

/**
 * The spawn-time filesystems step.
 *
 * This is a hand-built mirror of the port `create-server.ts` composes, not the
 * composition root itself — it exists to exercise the READ, and the real
 * `RegistryFilesystemMounter`, against a real DB and a real sandbox. That the
 * production wiring is these same implementations is proved separately, through
 * the real `createServer`, by
 * `core-api/src/__tests__/server-factory.provisioning-wiring.integration.test.ts`.
 */
async function provisionFilesystems(
	db: HyperIdleDb,
): Promise<Awaited<ReturnType<typeof mountFilesystemsForAgent>>> {
	const mounter = new RegistryFilesystemMounter({
		gitRunnerFactory: () => {
			throw new Error("a doc_set mount must not reach for git");
		},
	});
	return mountFilesystemsForAgent({
		agentId: AGENT_ID,
		filesystems: {
			listInjectedForProvisioning: (agentId: string) =>
				listInjectedFilesystemsForProvisioning(db, agentId),
			markState: (id, state) => updateFilesystemState(db, id, state),
		},
		sandboxPath,
		mounter,
	});
}

describe("injected filesystems are read live at spawn, never carried on the request", () => {
	test("a filesystem assigned AFTER the intent is emitted and drained is still mounted at spawn", async ({
		db,
		eventBus,
	}) => {
		await seedPrincipals(db);

		// 1. The emit is genuinely over before the filesystem exists.
		const { payloadJson } = await emitAndDrain(db, eventBus, "add-after-emit");
		expect(await db.select().from(filesystems)).toEqual([]);

		// The request carries NOTHING about filesystems — the bake is gone, so
		// there is no snapshot for the spawn to go stale against.
		expect(payloadJson ?? "").not.toContain("injectedFilesystems");

		// 2. NOW the operator assigns the filesystem to the agent.
		await assignFilesystem(db, "fs-added-late");

		// 3. The session spawns.
		const mounted = await provisionFilesystems(db);

		// 4. The late-assigned filesystem is mounted — a real symlink into the
		//    real sandbox, made by the real mounter.
		expect(mounted.map((m) => m.id)).toEqual(["fs-added-late"]);
		const linkPath = path.join(sandboxPath, "late-vault");
		expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
		expect(fs.readFileSync(path.join(linkPath, "index.md"), "utf-8")).toBe("# Late vault\n");
	});

	test("a filesystem UNASSIGNED after the intent is emitted and drained is not mounted at spawn", async ({
		db,
		eventBus,
	}) => {
		await seedPrincipals(db);
		await assignFilesystem(db, "fs-removed-late");

		await emitAndDrain(db, eventBus, "remove-after-emit");

		await db
			.delete(filesystemInjections)
			.where(eq(filesystemInjections.filesystemId, "fs-removed-late"));

		const mounted = await provisionFilesystems(db);

		expect(mounted).toEqual([]);
		expect(fs.existsSync(path.join(sandboxPath, "late-vault"))).toBe(false);
	});

	test("an agent with no injected filesystems mounts nothing and does not throw", async ({
		db,
	}) => {
		await seedPrincipals(db);

		const mounted = await provisionFilesystems(db);

		expect(mounted).toEqual([]);
		expect(fs.readdirSync(sandboxPath)).toEqual([]);
	});
});
