/**
 * The mount engine's capture-provenance contract.
 *
 * @lore AU26 F1 (§D-I): these two cases moved here from
 * `layers/core-api/filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts`
 * with the engine and with `filesystem_captures`. They used to read the rows
 * back through `listCaptures`, which had zero non-test readers and is therefore
 * DELETED as dead surface. The assertions are NOT weakened: the same rows are
 * read directly off the table this Service now owns, so the atomic-provenance
 * and rollback guarantees are still proven, plus the FK cascade when the
 * filesystem row goes away.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type FilesystemCaptureRow,
	filesystemCaptures,
	filesystems,
	sessions,
	teamMembers,
	teams,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import type { Filesystem } from "@hyperidle/filesystem-contract";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { RegistryFilesystemMounter } from "../index.js";

const NOW = "2026-07-22T00:00:00.000Z";
const temporaryDirectories: string[] = [];

function temporaryDirectory(label: string): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), `au26-mounting-${label}-`));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

function readCaptures(
	exec: WriteExecutor,
	filter: { sessionId?: string; filesystemId?: string },
): Promise<FilesystemCaptureRow[]> {
	if (filter.sessionId != null) {
		return exec
			.select()
			.from(filesystemCaptures)
			.where(eq(filesystemCaptures.sessionId, filter.sessionId));
	}
	return exec
		.select()
		.from(filesystemCaptures)
		.where(eq(filesystemCaptures.filesystemId, filter.filesystemId ?? ""));
}

async function seed(
	db: WriteExecutor,
	suffix: string,
	folder: string,
): Promise<{ teamId: string; sessionId: string; filesystemId: string }> {
	const teamId = `team-mounting-${suffix}`;
	const agentId = `agent-mounting-${suffix}`;
	const sessionId = `session-mounting-${suffix}`;
	const filesystemId = `filesystem-mounting-${suffix}`;
	await db
		.insert(teams)
		.values({ id: teamId, name: `Mounting ${suffix}`, phase: "build", createdAt: NOW });
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
		name: `Mounting agent ${suffix}`,
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db
		.insert(sessions)
		.values({ id: sessionId, agentId, modelTier: "fast", startedAt: NOW, state: "active" });
	await db.insert(filesystems).values({
		id: filesystemId,
		teamId,
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "doc_set", folder }),
		writeback: "file",
		state: "attached",
		createdAt: NOW,
	});
	return { teamId, sessionId, filesystemId };
}

function wireFilesystem(id: string, teamId: string, folder: string): Filesystem {
	return {
		id,
		teamId,
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: { kind: "doc_set", folder },
		writeback: "file",
		state: "reachable",
		createdAt: NOW,
	};
}

describe("mount engine — capture provenance", () => {
	test("captures a real local folder and atomically records queryable provenance", async ({
		db,
	}) => {
		const suffix = randomUUID();
		const source = temporaryDirectory("source");
		const sandbox = temporaryDirectory("sandbox");
		const capturesDir = temporaryDirectory("captures");
		fs.writeFileSync(path.join(source, "before.md"), "before\n");
		const { teamId, sessionId, filesystemId } = await seed(db, suffix, source);
		const filesystem = wireFilesystem(filesystemId, teamId, source);
		const mounter = new RegistryFilesystemMounter({
			db,
			capturesDir,
			gitRunnerFactory: () => {
				throw new Error("local folder must not invoke git");
			},
		});

		const mounted = await mounter.mount({ filesystem, sandboxPath: sandbox, auth: null });
		expect(mounted.success).toBe(true);
		fs.writeFileSync(path.join(source, "authored.md"), "authored\n");
		const captured = await mounter.captureBack({ filesystem, sandboxPath: sandbox, sessionId });
		expect(captured).toMatchObject({ success: true, captured: true });

		const rows = await readCaptures(db, { sessionId });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ filesystemId, sessionId, writeback: "file" });
		expect(fs.readFileSync(path.join(rows[0]!.capturePath, "authored.md"), "utf8")).toBe(
			"authored\n",
		);
		expect(await readCaptures(db, { filesystemId })).toEqual(rows);

		// The capture row rides the filesystem record's lifetime (FK cascade).
		await db.delete(filesystems).where(eq(filesystems.id, filesystemId));
		expect(await readCaptures(db, { sessionId })).toEqual([]);
	});

	test("capture removes a newly-created artifact when provenance insertion fails", async ({
		db,
	}) => {
		const suffix = randomUUID();
		const source = temporaryDirectory("rollback-source");
		const sandbox = temporaryDirectory("rollback-sandbox");
		const capturesDir = temporaryDirectory("rollback-captures");
		fs.writeFileSync(path.join(source, "authored.md"), "authored\n");
		const { teamId, filesystemId } = await seed(db, suffix, source);
		const mounter = new RegistryFilesystemMounter({
			db,
			capturesDir,
			gitRunnerFactory: () => {
				throw new Error("local folder must not invoke git");
			},
		});

		const captured = await mounter.captureBack({
			filesystem: wireFilesystem(filesystemId, teamId, source),
			sandboxPath: sandbox,
			// No such session row → the provenance INSERT violates its FK.
			sessionId: `missing-session-${suffix}`,
		});

		expect(captured).toMatchObject({ success: false, captured: false });
		expect(fs.readdirSync(capturesDir)).toEqual([]);
		expect(await readCaptures(db, { filesystemId })).toEqual([]);
	});
});
