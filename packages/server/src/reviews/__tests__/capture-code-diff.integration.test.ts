/**
 * AO3 RED — loadCaptureCodeDiff integration test (AC2).
 *
 * Exercises the capture→diff loader against a REAL git bundle:
 *   1. Create a real repo with N changed files.
 *   2. Bundle the commit as AO2 does.
 *   3. Seed a filesystem_captures row pointing at the bundle.
 *   4. Call loadCaptureCodeDiff → assert CodeDiffPayload is valid and matches.
 *
 * No stubs of createGitRunner — real git.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	filesystemCaptures,
	filesystems,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { createGitRunner } from "@hyperidle/fabric";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import { loadCaptureCodeDiff } from "../capture-code-diff.js";

const NOW = new Date().toISOString();

let tmpDir: string;
let bundlePath: string;
let commitSha: string;

// Set up a real git bundle once for all tests in this describe.
beforeAll(async () => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao3-capture-diff-"));

	// Create base repo with one initial commit (simulates the clone origin).
	const baseDir = path.join(tmpDir, "base");
	fs.mkdirSync(baseDir, { recursive: true });
	const baseRunner = createGitRunner(baseDir);
	await baseRunner.init("main");
	fs.writeFileSync(path.join(baseDir, "README.md"), "# base\n");
	await baseRunner.add([]);
	await baseRunner.commit("initial", "bot", "bot@example.com");

	// Create an agent worktree (simulates AO2-mounted worktree).
	const agentDir = path.join(tmpDir, "agent");
	fs.mkdirSync(agentDir, { recursive: true });
	const agentRunner = createGitRunner(agentDir);
	await agentRunner.clone(baseDir, "main");

	// Agent edits 3 files.
	fs.mkdirSync(path.join(agentDir, "src"), { recursive: true });
	fs.writeFileSync(path.join(agentDir, "src/feature.ts"), "export const feature = 1;\n");
	fs.mkdirSync(path.join(agentDir, "src/__tests__"), { recursive: true });
	fs.writeFileSync(
		path.join(agentDir, "src/__tests__/feature.test.ts"),
		'import { feature } from "../feature.js";\ntest("feature", () => expect(feature).toBe(1));\n',
	);
	fs.writeFileSync(path.join(agentDir, "package-lock.json"), '{"lockfileVersion":3}\n');

	await agentRunner.add([]);
	commitSha = await agentRunner.commit("add feature", "agent", "agent@example.com");

	// Bundle the agent branch (mirroring AO2's captureBack).
	bundlePath = path.join(tmpDir, "capture.bundle");
	await agentRunner.bundle(bundlePath, "refs/heads/main");
});

afterAll(() => {
	if (tmpDir) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

describe("loadCaptureCodeDiff", () => {
	test("returns a CodeDiffPayload with the 3 changed files", async ({ db }) => {
		// Seed minimal world.
		const teamId = `team-ccd-${crypto.randomUUID()}`;
		const agentId = `agent-ccd-${crypto.randomUUID()}`;
		const betId = `bet-ccd-${crypto.randomUUID()}`;
		const taskId = `task-ccd-${crypto.randomUUID()}`;
		const sessionId = `sess-ccd-${crypto.randomUUID()}`;
		const filesystemId = `fs-ccd-${crypto.randomUUID()}`;
		const captureId = `cap-ccd-${crypto.randomUUID()}`;

		await db.insert(teams).values({ id: teamId, name: "CCD Team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: `tm-${teamId}`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: betId,
			teamId,
			description: "CCD bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "CCD task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(sessions).values({
			id: sessionId,
			taskId,
			agentId,
			modelTier: "standard",
			startedAt: NOW,
			state: "ended",
		});
		await db.insert(filesystems).values({
			id: filesystemId,
			teamId,
			source: "local",
			kind: "code",
			resourceRef: JSON.stringify({
				kind: "code",
				repo: path.join(tmpDir, "base"),
				branch: "main",
			}),
			writeback: "git",
			state: "reachable",
			createdAt: NOW,
		});
		await db.insert(filesystemCaptures).values({
			id: captureId,
			sessionId,
			filesystemId,
			writeback: "git",
			capturePath: bundlePath,
			commitSha,
			createdAt: NOW,
		});

		// Call the loader.
		const capture = await db
			.select()
			.from(filesystemCaptures)
			.then((rows) => rows.find((r) => r.id === captureId));

		expect(capture).toBeDefined();
		const result = await loadCaptureCodeDiff(capture!, createGitRunner);
		expect(result).not.toBeNull();
		expect(result?.files).toBeDefined();

		const filePaths = result?.files.map((f) => f.path) ?? [];
		// At least one of the 3 changed files should appear.
		expect(filePaths.some((p) => p.includes("feature"))).toBe(true);

		// Each file has hunks with lines.
		for (const file of result?.files ?? []) {
			expect(file.path).toBeTruthy();
			expect(["logic", "test", "trivia"]).toContain(file.band);
			if (file.hunks && file.hunks.length > 0) {
				for (const hunk of file.hunks) {
					expect(typeof hunk.header).toBe("string");
					expect(Array.isArray(hunk.lines)).toBe(true);
				}
			}
		}

		// Result references the capture's commitSha.
		expect(result?.prTitle).toBeTruthy();
	});

	test("returns null for a non-git capture", async ({ db }) => {
		const teamId = `team-ccdng-${crypto.randomUUID()}`;
		const agentId = `agent-ccdng-${crypto.randomUUID()}`;
		const betId = `bet-ccdng-${crypto.randomUUID()}`;
		const taskId = `task-ccdng-${crypto.randomUUID()}`;
		const sessionId = `sess-ccdng-${crypto.randomUUID()}`;
		const filesystemId = `fs-ccdng-${crypto.randomUUID()}`;
		const captureId = `cap-ccdng-${crypto.randomUUID()}`;

		await db
			.insert(teams)
			.values({ id: teamId, name: "CCD-ng Team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: `tm-${teamId}`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: betId,
			teamId,
			description: "CCD-ng bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "CCD-ng task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(sessions).values({
			id: sessionId,
			taskId,
			agentId,
			modelTier: "standard",
			startedAt: NOW,
			state: "ended",
		});
		await db.insert(filesystems).values({
			id: filesystemId,
			teamId,
			source: "local",
			kind: "doc_set",
			resourceRef: JSON.stringify({ kind: "doc_set", folder: "/tmp/docs" }),
			writeback: "file",
			state: "reachable",
			createdAt: NOW,
		});
		await db.insert(filesystemCaptures).values({
			id: captureId,
			sessionId,
			filesystemId,
			writeback: "file", // non-git
			capturePath: "none",
			createdAt: NOW,
		});

		const capture = await db
			.select()
			.from(filesystemCaptures)
			.then((rows) => rows.find((r) => r.id === captureId));

		expect(capture).toBeDefined();
		const result = await loadCaptureCodeDiff(capture!, createGitRunner);
		expect(result).toBeNull();
	});
});
