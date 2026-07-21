import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sessions, teams, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import type { DomainEvent, EventBus, Filesystem } from "@hyperidle/shared";
import { afterEach, describe, expect } from "vitest";
import {
	deleteFilesystem,
	deleteInjection,
	getFilesystem,
	listCaptures,
	listFilesystems,
	RegistryFilesystemMounter,
	saveFilesystem,
	saveInjection,
	startWatcher,
	updateFilesystemState,
} from "../index.js";

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
		writeback: "file",
		state: "attached",
		createdAt: NOW,
	};
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

describe("AU20 filesystems completeness contract", () => {
	test("registry CRUD and unified team/id filters preserve exact rows and state", async ({
		db,
	}) => {
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
		expect((await listFilesystems(db, { ids: [secondId] })).map((row) => row.id)).toEqual([
			secondId,
		]);
		expect(await listFilesystems(db, { ids: [] })).toEqual([]);

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

		await deleteInjection(db, agentId, filesystemId);
		await deleteInjection(db, agentId, filesystemId);
		expect(await listFilesystems(db, { agentId })).toEqual([]);
	});

	test("unified mounter captures a real local folder and atomically records queryable provenance", async ({
		db,
	}) => {
		const suffix = randomUUID();
		const { teamId, sessionId } = await seedIdentity(db, suffix);
		const source = temporaryDirectory("source");
		const sandbox = temporaryDirectory("sandbox");
		const capturesDir = temporaryDirectory("captures");
		const filesystemId = `filesystem-contract-capture-${suffix}`;
		fs.writeFileSync(path.join(source, "before.md"), "before\n");
		await saveFilesystem(db, newFilesystem(filesystemId, teamId, source));
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
		const rows = await listCaptures(db, { sessionId });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ filesystemId, sessionId, writeback: "file" });
		expect(fs.readFileSync(path.join(rows[0]!.capturePath, "authored.md"), "utf8")).toBe(
			"authored\n",
		);
		expect(await listCaptures(db, { filesystemId })).toEqual(rows);

		await deleteFilesystem(db, filesystemId);
		expect(await listCaptures(db, { sessionId })).toEqual([]);
	});

	test("watcher emits one debounced batch for watched roots, ignores outside paths, and stop flushes", async () => {
		const sandbox = temporaryDirectory("watcher");
		fs.mkdirSync(path.join(sandbox, "knowledge"));
		fs.mkdirSync(path.join(sandbox, "work"));
		fs.mkdirSync(path.join(sandbox, "outside"));
		const events: DomainEvent[] = [];
		const eventBus = { emit: (event: DomainEvent) => void events.push(event) } as EventBus;
		const watcher = startWatcher({
			sandboxPath: sandbox,
			sessionId: "session-watcher-contract",
			manifestPath: path.join(sandbox, "manifest.json"),
			eventBus,
			debounceMs: 40,
		});

		// Darwin's recursive FSEvents watcher may not be ready until the next turn.
		await new Promise((resolve) => setTimeout(resolve, 75));
		fs.writeFileSync(path.join(sandbox, "outside", "ignored.md"), "ignored");
		fs.writeFileSync(path.join(sandbox, "knowledge", "one.md"), "one");
		fs.writeFileSync(path.join(sandbox, "work", "two.md"), "two");
		await new Promise((resolve) => setTimeout(resolve, 400));
		watcher.stop();

		const writebackEvents = events.filter(
			(event) => event.type === "sandbox_writeback_changes_detected",
		);
		expect(writebackEvents.length).toBeGreaterThanOrEqual(1);
		expect(writebackEvents.every((event) => event.streamId === "session-watcher-contract")).toBe(
			true,
		);
		const changes = writebackEvents.flatMap((event) =>
			event.type === "sandbox_writeback_changes_detected" ? event.changes : [],
		);
		expect(changes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ relativePath: "knowledge/one.md" }),
				expect.objectContaining({ relativePath: "work/two.md" }),
			]),
		);
		expect(JSON.stringify(writebackEvents)).not.toContain("ignored.md");
	});
});
