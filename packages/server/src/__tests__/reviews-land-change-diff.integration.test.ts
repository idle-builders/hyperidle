/**
 * Reviews loader hook integration test for land_change route-level diff proof.
 *
 * Validates that GET /api/reviews/:reviewMessageId for a land_change Proposed Call
 * includes a code_diff artifact whose files match the captured bundle's diff.
 *
 * Real git bundle — no stubs of GitRunner or loadCaptureCodeDiff.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	artifacts,
	bets,
	filesystemCaptures,
	filesystems,
	messages,
	proposedCalls,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { createGitRunner } from "@hyperidle/fabric";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { test } from "../test-fixtures.js";

const NOW = new Date().toISOString();

let tmpDir: string;
let bundlePath: string;
let commitSha: string;

beforeAll(async () => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao3-reviews-loader-"));

	const originDir = path.join(tmpDir, "origin");
	fs.mkdirSync(originDir, { recursive: true });
	const originRunner = createGitRunner(originDir);
	await originRunner.init("main");
	fs.writeFileSync(path.join(originDir, "README.md"), "# origin\n");
	await originRunner.add([]);
	await originRunner.commit("initial", "bot", "bot@example.com");

	const agentDir = path.join(tmpDir, "agent");
	fs.mkdirSync(agentDir, { recursive: true });
	const agentRunner = createGitRunner(agentDir);
	await agentRunner.clone(originDir, "main");
	fs.writeFileSync(path.join(agentDir, "feature.ts"), "export const f = 1;\n");
	fs.mkdirSync(path.join(agentDir, "src"), { recursive: true });
	fs.writeFileSync(path.join(agentDir, "src/helper.ts"), "export const h = 2;\n");
	await agentRunner.add([]);
	commitSha = await agentRunner.commit("add feature", "agent", "agent@example.com");

	bundlePath = path.join(tmpDir, "capture.bundle");
	await agentRunner.bundle(bundlePath, "refs/heads/main");
});

afterAll(() => {
	if (tmpDir) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

describe("GET /api/reviews/:reviewMessageId for land_change Proposed Call", () => {
	test("response includes code_diff artifact with changed files from capture", async ({
		db,
		app,
	}) => {
		// Seed world.
		const teamId = `team-rev-${crypto.randomUUID()}`;
		const agentId = `agent-rev-${crypto.randomUUID()}`;
		const betId = `bet-rev-${crypto.randomUUID()}`;
		const taskId = `task-rev-${crypto.randomUUID()}`;
		const artifactId = `art-rev-${crypto.randomUUID()}`;
		const s1Id = `sess-rev-s1-${crypto.randomUUID()}`;
		const filesystemId = `fs-rev-${crypto.randomUUID()}`;

		await db.insert(teams).values({ id: teamId, name: "Rev Team", phase: "build", createdAt: NOW });
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
			description: "Rev bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "Rev task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: taskId,
			kind: "action_operation",
			createdAt: NOW,
		});

		const threadId = `thread-rev-${crypto.randomUUID()}`;
		await db.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const reviewMessageId = `msg-rev-${crypto.randomUUID()}`;
		await db.insert(messages).values({
			id: reviewMessageId,
			senderId: agentId,
			threadId,
			type: "review",
			payload: JSON.stringify({
				title: "Rev Review",
				reasoning: ["land it"],
				artifactRef: { id: artifactId, kind: "action_operation" },
				artifacts: [],
			}),
			clientKey: reviewMessageId,
			createdAt: NOW,
		});

		// Session 1: produced the capture.
		await db.insert(sessions).values({
			id: s1Id,
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
			resourceRef: JSON.stringify({ kind: "code", repo: tmpDir, branch: "main" }),
			writeback: "git",
			state: "reachable",
			createdAt: NOW,
		});

		const captureId = `cap-rev-${crypto.randomUUID()}`;
		await db.insert(filesystemCaptures).values({
			id: captureId,
			sessionId: s1Id,
			filesystemId,
			writeback: "git",
			capturePath: bundlePath,
			commitSha,
			createdAt: NOW,
		});

		// land_change proposed_call referencing session 1's originSessionId.
		const proposedCallId = `pc-rev-${crypto.randomUUID()}`;
		await db.insert(proposedCalls).values({
			id: proposedCallId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: s1Id,
			toolId: "land_change",
			args: JSON.stringify({}),
			identityHash: `h-rev-${proposedCallId}`,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		// GET the review.
		const res = await app.request(`/api/reviews/${reviewMessageId}`);
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			artifacts?: Array<{
				kind: string;
				payload?: {
					files?: Array<{
						path: string;
						band: string;
						hunks?: Array<{ lines?: Array<{ kind: string; text: string }> }>;
					}>;
				};
			}>;
		};

		// Must have at least one code_diff artifact.
		const codeDiffArtifact = body.artifacts?.find((a) => a.kind === "code_diff");
		expect(codeDiffArtifact).toBeDefined();
		expect((codeDiffArtifact as { id?: string } | undefined)?.id).toBe(`code_diff:${captureId}`);
		expect(codeDiffArtifact?.payload?.files).toBeDefined();
		expect((codeDiffArtifact?.payload?.files ?? []).map((f) => f.path).sort()).toEqual([
			"feature.ts",
			"src/helper.ts",
		]);

		const addedLines = (codeDiffArtifact?.payload?.files ?? []).flatMap((f) =>
			(f.hunks ?? []).flatMap((h) => h.lines ?? []).filter((line) => line.kind === "add"),
		);
		expect(addedLines.map((line) => line.text).sort()).toEqual([
			"export const f = 1;",
			"export const h = 2;",
		]);
	});

	test("land_change review fails closed when captured diff proof is unavailable", async ({
		db,
		app,
	}) => {
		const teamId = `team-rev-missing-${crypto.randomUUID()}`;
		const agentId = `agent-rev-missing-${crypto.randomUUID()}`;
		const betId = `bet-rev-missing-${crypto.randomUUID()}`;
		const taskId = `task-rev-missing-${crypto.randomUUID()}`;
		const artifactId = `art-rev-missing-${crypto.randomUUID()}`;
		const threadId = `thread-rev-missing-${crypto.randomUUID()}`;
		const reviewMessageId = `msg-rev-missing-${crypto.randomUUID()}`;

		await db
			.insert(teams)
			.values({ id: teamId, name: "Rev Missing", phase: "build", createdAt: NOW });
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
			description: "Rev missing bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "Rev missing task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: taskId,
			kind: "action_operation",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: reviewMessageId,
			senderId: agentId,
			threadId,
			type: "review",
			payload: JSON.stringify({
				title: "Rev Missing Review",
				artifactRef: { id: artifactId, kind: "action_operation" },
				artifacts: [],
			}),
			clientKey: reviewMessageId,
			createdAt: NOW,
		});
		await db.insert(proposedCalls).values({
			id: `pc-rev-missing-${crypto.randomUUID()}`,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `missing-session-${crypto.randomUUID()}`,
			toolId: "land_change",
			args: JSON.stringify({}),
			identityHash: "h-rev-missing",
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		const res = await app.request(`/api/reviews/${reviewMessageId}`);
		expect(res.status).toBe(409);
		const body = (await res.json()) as { code?: string; error?: string };
		expect(body.code).toBe("CONFLICT");
		expect(body.error).toContain("land_change review proof unavailable");
	});

	test("non-land_change proposed call does not add code_diff artifact", async ({ db, app }) => {
		const teamId = `team-nonlc-${crypto.randomUUID()}`;
		const agentId = `agent-nonlc-${crypto.randomUUID()}`;
		const betId = `bet-nonlc-${crypto.randomUUID()}`;
		const taskId = `task-nonlc-${crypto.randomUUID()}`;
		const artifactId = `art-nonlc-${crypto.randomUUID()}`;

		await db
			.insert(teams)
			.values({ id: teamId, name: "NonLC Team", phase: "build", createdAt: NOW });
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
			description: "NonLC bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "NonLC task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: taskId,
			kind: "action_operation",
			createdAt: NOW,
		});

		const threadId = `thread-nonlc-${crypto.randomUUID()}`;
		await db.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const reviewMessageId = `msg-nonlc-${crypto.randomUUID()}`;
		await db.insert(messages).values({
			id: reviewMessageId,
			senderId: agentId,
			threadId,
			type: "review",
			payload: JSON.stringify({
				title: "NonLC Review",
				reasoning: ["approve"],
				artifactRef: { id: artifactId, kind: "action_operation" },
				artifacts: [],
			}),
			clientKey: reviewMessageId,
			createdAt: NOW,
		});

		await db.insert(proposedCalls).values({
			id: `pc-nonlc-${crypto.randomUUID()}`,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `sess-nonlc-${crypto.randomUUID()}`,
			toolId: "commit_file", // NOT land_change
			args: JSON.stringify({ path: "/sandbox/out.txt", content: "hello" }),
			identityHash: `h-nonlc-${crypto.randomUUID()}`,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		const res = await app.request(`/api/reviews/${reviewMessageId}`);
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			artifacts?: Array<{ kind: string }>;
		};
		const codeDiffArtifact = body.artifacts?.find((a) => a.kind === "code_diff");
		expect(codeDiffArtifact).toBeUndefined();
	});
});
