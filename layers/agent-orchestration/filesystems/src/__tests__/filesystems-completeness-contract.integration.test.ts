import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sessions, teamMembers, teams, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { afterEach, describe, expect } from "vitest";
import {
	deleteFilesystem,
	deleteInjection,
	getFilesystem,
	listFilesystems,
	saveFilesystem,
	saveInjection,
	updateFilesystemState,
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
	// The owner writes the membership row alongside the team.
	await db.insert(teamMembers).values({
		id: `${teamId}-members`,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
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
		writeback: "file",
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

		await updateFilesystemState(db, firstId, "reachable");
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
