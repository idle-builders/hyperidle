/**
 * AU26 F2 — the filesystems twin of E3's AC1(c) staleness proof.
 *
 * AU21 §9 Increment 12 baked the agent's injected-filesystem list onto every
 * emitted intent, because `filesystems`/`filesystem_injections` still lived in
 * core-api and `run-orchestration` was forbidden to read them. That bake is a
 * SNAPSHOT: a filesystem an operator assigns to an agent after an intent is
 * emitted but before it drains was simply absent from the sandbox, silently.
 * The founder's 2026-08-04 ruling moved the record into agent-orchestration, so
 * F2 deletes the bake and reads the record live, in-layer, at spawn.
 *
 * The order below is the whole test — it mirrors
 * `connections-added-after-emit.integration.test.ts` line for line:
 *   1. emit a real intent through the real recorder and drain it into a real
 *      `agent_session_requests` row (the emit is genuinely over)
 *   2. THEN assign the filesystem to the agent
 *   3. run the spawn-time filesystems step the provisioner runs
 *   4. the filesystem is mounted — a real symlink in a real sandbox, made by
 *      the real `RegistryFilesystemMounter`, not a stub
 *
 * Against the bake step 4 fails: the request was frozen at step 1, before the
 * injection existed. Sanity-checked exactly that way — restoring a frozen
 * emit-time list reds this test.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	agentSessionRequests,
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { RegistryFilesystemMounter } from "@hyperidle/filesystem-mounting";
import { listInjectedFilesystemsForProvisioning } from "@hyperidle/filesystems";
import { mountFilesystemsForAgent } from "@hyperidle/run-orchestration";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { afterEach, beforeEach, describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = "2026-08-04T00:00:00.000Z";

let tmpDir: string;
let sandboxPath: string;
let capturesDir: string;
let vaultDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "au26-f2-add-after-emit-"));
	sandboxPath = path.join(tmpDir, "sandbox");
	capturesDir = path.join(tmpDir, "captures");
	vaultDir = path.join(tmpDir, "late-vault");
	fs.mkdirSync(sandboxPath, { recursive: true });
	fs.mkdirSync(capturesDir, { recursive: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, "index.md"), "# Late vault\n");
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function seedPrincipals(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ humanId: string; agentId: string; teamId: string; teamMembersId: string }> {
	const humanId = ids("u-au26-f2-owner");
	const agentId = ids("agent-au26-f2-target");
	const teamId = ids("team-au26-f2");
	const teamMembersId = ids("tm-au26-f2");
	await db.insert(teams).values({ id: teamId, name: "AU26 F2", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values([
		{
			id: humanId,
			kind: "human",
			name: "AU26 Owner",
			role: "founder",
			status: "active",
			teamId: teamMembersId,
			createdAt: NOW,
		},
		{
			id: agentId,
			kind: "ai",
			name: "AU26 Target Agent",
			role: "builder",
			status: "active",
			teamId: teamMembersId,
			createdAt: NOW,
		},
	]);
	return { humanId, agentId, teamId, teamMembersId };
}

/**
 * Emit + drain a real intent, exactly as a per-kind resolver's baked emit does.
 * Returns the real `agent_session_requests` row the drain handed off — the
 * request a spawn would later claim.
 */
async function emitAndDrain(
	db: HyperIdleDb,
	eventBus: { emit: unknown },
	idempotencyKey: string,
	agentId: string,
	humanId: string,
): Promise<{ readonly payloadJson: string | null }> {
	await enqueueWorkIntent(db, {
		kind: "assistant_turn",
		sourceKind: "thread_message",
		sourceId: `${idempotencyKey}-message`,
		idempotencyKey,
		bakedRequest: {
			defaultAgentId: agentId,
			sourceKind: "assistant",
			sourceId: `${idempotencyKey}-message`,
			streamId: `thread:${idempotencyKey}-thread`,
			userId: humanId,
			sourceCorrelation: {
				threadId: `${idempotencyKey}-thread`,
				messageId: `${idempotencyKey}-message`,
				userId: humanId,
				assistantAgentId: agentId,
			},
		},
	});
	await drainIntents({ ...queueDeps(db), eventBus } as ReturnType<typeof queueDeps> & {
		eventBus: unknown;
	});

	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, `${idempotencyKey}-message`));
	if (!request) throw new Error("the drain did not hand off a request row");
	return { payloadJson: request.payloadJson };
}

/** Assign `vaultDir` to the agent as a doc_set filesystem. */
async function assignFilesystem(
	db: HyperIdleDb,
	id: string,
	teamId: string,
	agentId: string,
): Promise<void> {
	await db.insert(filesystems).values({
		id,
		teamId,
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
		.values({ agentUserId: agentId, filesystemId: id, createdAt: NOW });
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
	agentId: string,
): Promise<Awaited<ReturnType<typeof mountFilesystemsForAgent>>> {
	const mounter = new RegistryFilesystemMounter({
		gitRunnerFactory: () => {
			throw new Error("a doc_set mount must not reach for git");
		},
		capturesDir,
		db,
	});
	return mountFilesystemsForAgent({
		agentId,
		filesystems: {
			listInjectedForProvisioning: (id: string) => listInjectedFilesystemsForProvisioning(db, id),
		},
		sandboxPath,
		mounter,
	});
}

describe("injected filesystems are read live at spawn, never carried on the request", () => {
	test("a filesystem assigned AFTER the intent is emitted and drained is still mounted at spawn", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { humanId, agentId, teamId } = await seedPrincipals(db, ids);

		// 1. The emit is genuinely over before the filesystem exists.
		const { payloadJson } = await emitAndDrain(
			db,
			eventBus,
			"au26-f2-add-after-emit",
			agentId,
			humanId,
		);
		const fsRows = await db.select().from(filesystems).where(eq(filesystems.teamId, teamId));
		expect(fsRows).toEqual([]);

		// The request carries NOTHING about filesystems — the bake is gone, so
		// there is no snapshot for the spawn to go stale against.
		expect(payloadJson ?? "").not.toContain("injectedFilesystems");

		// 2. NOW the operator assigns the filesystem to the agent.
		const fsId = ids("fs-au26-f2-added-late");
		await assignFilesystem(db, fsId, teamId, agentId);

		// 3. The session spawns.
		const mounted = await provisionFilesystems(db, agentId);

		// 4. The late-assigned filesystem is mounted — a real symlink into the
		//    real sandbox, made by the real mounter.
		expect(mounted.map((m) => m.id)).toEqual([fsId]);
		const linkPath = path.join(sandboxPath, "late-vault");
		expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
		expect(fs.readFileSync(path.join(linkPath, "index.md"), "utf-8")).toBe("# Late vault\n");
	});

	test("a filesystem UNASSIGNED after the intent is emitted and drained is not mounted at spawn", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { humanId, agentId, teamId } = await seedPrincipals(db, ids);
		const fsId = ids("fs-au26-f2-removed-late");
		await assignFilesystem(db, fsId, teamId, agentId);

		await emitAndDrain(db, eventBus, "au26-f2-remove-after-emit", agentId, humanId);

		await db.delete(filesystemInjections).where(eq(filesystemInjections.filesystemId, fsId));

		const mounted = await provisionFilesystems(db, agentId);

		expect(mounted).toEqual([]);
		expect(fs.existsSync(path.join(sandboxPath, "late-vault"))).toBe(false);
	});

	test("an agent with no injected filesystems mounts nothing and does not throw", async ({
		db,
		ids,
	}) => {
		const { agentId } = await seedPrincipals(db, ids);

		const mounted = await provisionFilesystems(db, agentId);

		expect(mounted).toEqual([]);
		expect(fs.readdirSync(sandboxPath)).toEqual([]);
	});
});
