import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { filesystemInjections, sessions, teams, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { afterEach, describe, expect } from "vitest";
import {
	deleteFilesystem,
	deleteInjection,
	getFilesystem,
	listFilesystems,
	listHeldAgentIds,
	markFilesystemNeedsAttention,
	markFilesystemReachable,
	saveFilesystem,
	saveInjection,
} from "../index.js";

// @lore AU21 §9 Increment 8 (Decision F2): the watcher-specific describe
// blocks that used to live here (`startWatcher` behavior + the
// `context.ts`-wiring test) moved to `@hyperidle/run-orchestration`'s
// `__tests__/file-watcher.test.ts` — `startWatcher` itself relocated there
// (see `../index.js`'s top `@lore`). This file keeps only the registry-CRUD
// + mounter coverage this Service still owns.

const NOW = "2026-07-22T00:00:00.000Z";
const temporaryDirectories: string[] = [];

function temporaryDirectory(label: string): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), `au20-filesystems-${label}-`));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

async function seedIdentity(db: Parameters<typeof saveFilesystem>[0], suffix: string) {
	const teamId = `team-filesystems-contract-${suffix}`;
	const agentId = `agent-filesystems-contract-${suffix}`;
	const sessionId = `session-filesystems-contract-${suffix}`;
	await db
		.insert(teams)
		.values({ id: teamId, name: `Filesystem ${suffix}`, phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: `Filesystem agent ${suffix}`,
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(sessions).values({
		id: sessionId,
		agentId,
		modelTier: "fast",
		startedAt: NOW,
		state: "active",
	});
	return { teamId, agentId, sessionId };
}

function newFilesystem(id: string, teamId: string, folder: string) {
	return {
		id,
		teamId,
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "doc_set", folder }),
		state: "attached",
		createdAt: NOW,
	};
}

describe("filesystems completeness contract", () => {
	test("registry CRUD and team filter preserve exact rows and state", async ({ db }) => {
		const suffix = randomUUID();
		const { teamId } = await seedIdentity(db, suffix);
		const folder = temporaryDirectory("registry");
		const firstId = `filesystem-contract-a-${suffix}`;
		const secondId = `filesystem-contract-b-${suffix}`;

		await saveFilesystem(db, newFilesystem(firstId, teamId, folder));
		await saveFilesystem(db, newFilesystem(secondId, teamId, folder));
		expect(await getFilesystem(db, firstId)).toMatchObject({
			id: firstId,
			teamId,
			state: "attached",
		});
		expect((await listFilesystems(db, { teamId })).map((row) => row.id).sort()).toEqual(
			[firstId, secondId].sort(),
		);

		await markFilesystemReachable(db, firstId);
		expect((await getFilesystem(db, firstId))?.state).toBe("reachable");
		await deleteFilesystem(db, secondId);
		expect(await getFilesystem(db, secondId)).toBeUndefined();
	});

	test("injection edge is unique, agent filtering returns full rows, and delete is idempotent", async ({
		db,
	}) => {
		const suffix = randomUUID();
		const { teamId, agentId } = await seedIdentity(db, suffix);
		const filesystemId = `filesystem-contract-injection-${suffix}`;
		await saveFilesystem(db, newFilesystem(filesystemId, teamId, temporaryDirectory("injection")));
		const injection = { agentUserId: agentId, filesystemId, createdAt: NOW };

		await saveInjection(db, injection);
		await expect(saveInjection(db, injection)).rejects.toThrow();
		expect(await listFilesystems(db, { agentId })).toEqual([
			expect.objectContaining({ id: filesystemId, teamId }),
		]);

		expect(await deleteInjection(db, agentId, filesystemId)).toBe(true);
		expect(await deleteInjection(db, agentId, filesystemId)).toBe(false);
		expect(await listFilesystems(db, { agentId })).toEqual([]);
	});
});

describe("filesystem attention writers (BA5 §2.2/§4.5)", () => {
	test("entering needs_attention returns entered:true with the picked agent ids; a second failure only updates the reason", async ({
		db,
	}) => {
		const suffix = randomUUID();
		const { teamId, agentId } = await seedIdentity(db, suffix);
		const filesystemId = `filesystem-attention-a-${suffix}`;
		await saveFilesystem(
			db,
			newFilesystem(filesystemId, teamId, temporaryDirectory("attention-a")),
		);
		await saveInjection(db, { agentUserId: agentId, filesystemId, createdAt: NOW });

		const first = await markFilesystemNeedsAttention(db, filesystemId, "git is not installed");
		expect(first).toEqual({ entered: true, agentIds: [agentId] });
		expect(await getFilesystem(db, filesystemId)).toMatchObject({
			state: "needs_attention",
			attentionReason: "git is not installed",
		});

		const second = await markFilesystemNeedsAttention(db, filesystemId, "branch 'main' not found");
		expect(second).toEqual({ entered: false, agentIds: [] });
		expect(await getFilesystem(db, filesystemId)).toMatchObject({
			state: "needs_attention",
			attentionReason: "branch 'main' not found",
		});
	});

	test("markFilesystemReachable clears the reason and re-arms the next failure as a new episode", async ({
		db,
	}) => {
		const suffix = randomUUID();
		const { teamId } = await seedIdentity(db, suffix);
		const filesystemId = `filesystem-attention-b-${suffix}`;
		await saveFilesystem(
			db,
			newFilesystem(filesystemId, teamId, temporaryDirectory("attention-b")),
		);

		await markFilesystemNeedsAttention(db, filesystemId, "folder does not exist");
		await markFilesystemReachable(db, filesystemId);
		expect(await getFilesystem(db, filesystemId)).toMatchObject({
			state: "reachable",
			attentionReason: null,
		});

		const reEntered = await markFilesystemNeedsAttention(db, filesystemId, "folder does not exist");
		expect(reEntered?.entered).toBe(true);
	});

	test("markFilesystemNeedsAttention on an unknown id returns null", async ({ db }) => {
		expect(await markFilesystemNeedsAttention(db, "no-such-filesystem", "unused")).toBeNull();
	});

	test("entering needs_attention with no injected agents returns an empty agentIds list", async ({
		db,
	}) => {
		const suffix = randomUUID();
		const { teamId } = await seedIdentity(db, suffix);
		const filesystemId = `filesystem-attention-c-${suffix}`;
		await saveFilesystem(
			db,
			newFilesystem(filesystemId, teamId, temporaryDirectory("attention-c")),
		);

		const result = await markFilesystemNeedsAttention(db, filesystemId, "no CLI");
		expect(result).toEqual({ entered: true, agentIds: [] });
		expect(await db.select().from(filesystemInjections)).toEqual(
			expect.not.arrayContaining([expect.objectContaining({ filesystemId })]),
		);
	});
});

describe("listHeldAgentIds (BA5 §2.2/§4.1/§13) — the drain's claim-time exclusion list", () => {
	test("an agent using a needs_attention filesystem is held; a reachable one is not; leaving the state ends the hold", async ({
		db,
	}) => {
		const suffix = randomUUID();
		const { teamId, agentId: heldAgentId } = await seedIdentity(db, suffix);
		const { agentId: freeAgentId } = await seedIdentity(db, `${suffix}-free`);
		const brokenId = `filesystem-held-broken-${suffix}`;
		const okId = `filesystem-held-ok-${suffix}`;
		await saveFilesystem(db, newFilesystem(brokenId, teamId, temporaryDirectory("held-broken")));
		await saveFilesystem(db, newFilesystem(okId, teamId, temporaryDirectory("held-ok")));
		await saveInjection(db, { agentUserId: heldAgentId, filesystemId: brokenId, createdAt: NOW });
		await saveInjection(db, { agentUserId: freeAgentId, filesystemId: okId, createdAt: NOW });

		expect(await listHeldAgentIds(db)).not.toContain(heldAgentId);

		await markFilesystemNeedsAttention(db, brokenId, "branch not found");
		const held = await listHeldAgentIds(db);
		expect(held).toContain(heldAgentId);
		expect(held).not.toContain(freeAgentId);

		await markFilesystemReachable(db, brokenId);
		expect(await listHeldAgentIds(db)).not.toContain(heldAgentId);
	});

	test("an agent held by two broken filesystems is returned once, not twice", async ({ db }) => {
		const suffix = randomUUID();
		const { teamId, agentId } = await seedIdentity(db, suffix);
		const firstId = `filesystem-held-dup-a-${suffix}`;
		const secondId = `filesystem-held-dup-b-${suffix}`;
		await saveFilesystem(db, newFilesystem(firstId, teamId, temporaryDirectory("held-dup-a")));
		await saveFilesystem(db, newFilesystem(secondId, teamId, temporaryDirectory("held-dup-b")));
		await saveInjection(db, { agentUserId: agentId, filesystemId: firstId, createdAt: NOW });
		await saveInjection(db, { agentUserId: agentId, filesystemId: secondId, createdAt: NOW });
		await markFilesystemNeedsAttention(db, firstId, "reason one");
		await markFilesystemNeedsAttention(db, secondId, "reason two");

		const held = await listHeldAgentIds(db);
		expect(held.filter((id) => id === agentId)).toHaveLength(1);
	});
});
