/**
 * land_change tool integration tests.
 *
 * Covers review routing, approved landing, at-most-once behavior, and failed outcomes.
 *
 * Real git + real DB — zero stubs of GitRunner.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	artifacts,
	bets,
	filesystemCaptures,
	filesystems,
	messages,
	operationOutcomes,
	proposedCalls,
	sessions,
	tailoredGrants,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { createGitRunner } from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import type { ToolContext } from "../tool-registry.js";
import { buildToolRegistry } from "../tool-registry.js";

const NOW = new Date().toISOString();

// ─── Real git setup: bare remote + agent bundle ────────────────────────────

let tmpDir: string;
let bareDir: string;
let bundlePath: string;
let commitSha: string;

function remoteMainSha(): string {
	return execFileSync("git", ["--git-dir", bareDir, "rev-parse", "refs/heads/main"], {
		encoding: "utf8",
	}).trim();
}

beforeAll(async () => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao3-land-change-"));

	// Create a non-bare repo (simulates the connected target's pre-clone).
	const originDir = path.join(tmpDir, "origin");
	fs.mkdirSync(originDir, { recursive: true });
	const originRunner = createGitRunner(originDir);
	await originRunner.init("main");
	fs.writeFileSync(path.join(originDir, "README.md"), "# origin\n");
	await originRunner.add([]);
	await originRunner.commit("initial", "bot", "bot@example.com");

	// Bare remote (this is the push target — a local bare repo).
	bareDir = path.join(tmpDir, "bare.git");
	execFileSync("git", ["init", "--bare", "--initial-branch=main", bareDir], {
		stdio: "ignore",
	});

	// Agent worktree: clone origin, make an edit, commit.
	const agentDir = path.join(tmpDir, "agent");
	fs.mkdirSync(agentDir, { recursive: true });
	const agentRunner = createGitRunner(agentDir);
	await agentRunner.clone(originDir, "main");
	fs.writeFileSync(path.join(agentDir, "output.ts"), "export const x = 42;\n");
	await agentRunner.add([]);
	commitSha = await agentRunner.commit("add output", "agent", "agent@example.com");

	// Bundle the commit (as AO2 captureBack does).
	bundlePath = path.join(tmpDir, "capture.bundle");
	await agentRunner.bundle(bundlePath, "refs/heads/main");
});

afterAll(() => {
	if (tmpDir) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

// ─── World seed helpers ────────────────────────────────────────────────────

async function seedWorld(db: Parameters<typeof buildToolRegistry>[0]["db"]): Promise<{
	agentId: string;
	taskId: string;
	betId: string;
	threadId: string;
	reviewMessageId: string;
	artifactId: string;
	filesystemId: string;
	captureSessionId: string;
}> {
	const teamId = `team-lc-${crypto.randomUUID()}`;
	const agentId = `agent-lc-${crypto.randomUUID()}`;
	const betId = `bet-lc-${crypto.randomUUID()}`;
	const taskId = `task-lc-${crypto.randomUUID()}`;
	const artifactId = `art-lc-${crypto.randomUUID()}`;
	const captureSessionId = `sess-lc-s1-${crypto.randomUUID()}`;
	const filesystemId = `fs-lc-${crypto.randomUUID()}`;

	await db.insert(teams).values({ id: teamId, name: "LC Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `tm-${teamId}`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Builder",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "LC bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "LC task",
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

	const threadId = `thread-lc-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-lc-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "LC Review",
			reasoning: ["land this"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	// Session 1: the session that produced the capture.
	await db.insert(sessions).values({
		id: captureSessionId,
		taskId,
		agentId,
		modelTier: "standard",
		startedAt: NOW,
		state: "ended",
	});

	// Filesystem (code kind, pointing at the bare remote).
	await db.insert(filesystems).values({
		id: filesystemId,
		teamId,
		source: "local",
		kind: "code",
		resourceRef: JSON.stringify({ kind: "code", repo: bareDir, branch: "main" }),
		writeback: "git",
		state: "reachable",
		createdAt: NOW,
	});

	// Filesystem capture (the bundle created by AO2).
	const captureId = `cap-lc-${crypto.randomUUID()}`;
	await db.insert(filesystemCaptures).values({
		id: captureId,
		sessionId: captureSessionId,
		filesystemId,
		writeback: "git",
		capturePath: bundlePath,
		commitSha,
		createdAt: NOW,
	});

	return {
		agentId,
		taskId,
		betId,
		threadId,
		reviewMessageId,
		artifactId,
		filesystemId,
		captureSessionId,
	};
}

function makeCtx(
	db: Parameters<typeof buildToolRegistry>[0]["db"],
	eventBus: Parameters<typeof buildToolRegistry>[0]["eventBus"],
	agentId: string,
	taskId: string,
	sessionId: string,
): ToolContext {
	return {
		db,
		eventBus,
		agentId,
		sessionId,
		taskId,
		sandboxPath: path.join(os.tmpdir(), `lc-sandbox-${sessionId}`),
		ingestion: { dispose: (): void => {} },
	};
}

// ─── Registered + captured in session 1 ───────────────────────────────────

describe("land_change registration and review routing", () => {
	test("invoking land_change in open-work session captures it with status:captured", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const s1Id = `s1-ac1-${crypto.randomUUID()}`;

		const ctx = makeCtx(db, eventBus, agentId, taskId, s1Id);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		// land_change must exist in registry.
		const names = registry.definitions.map((d) => d.name);
		expect(names).toContain("land_change");

		// Invoke in session 1 → must be routed to review.
		const result = await registry.invoke("land_change", {});
		expect(result.success).toBe(false);
		expect((result as { success: false; code: string }).code).toBe("AWAITING_REVIEW");

		// proposed_calls row must exist.
		const rows = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, s1Id));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.toolId).toBe("land_change");
		expect(rows[0]?.status).toBe("captured");
		expect(rows[0]?.reviewMessageId).toBe(reviewMessageId);
	});
});

// ─── Approve → grant → session-2 land_change pushes to bare remote ───────

describe("session-2 land_change pushes captured commit to bare remote", () => {
	test("grant-bearing session-2 land_change advances bare remote ref to commitSha", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId, captureSessionId } =
			await seedWorld(db);

		// Seed a pre-captured proposed_call (as if session 1 already ran).
		const proposedCallId = `pc-ac3-${crypto.randomUUID()}`;
		await db.insert(proposedCalls).values({
			id: proposedCallId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: captureSessionId,
			toolId: "land_change",
			args: JSON.stringify({}),
			identityHash: `h-ac3-${proposedCallId}`,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		// Compose the tailored grant (as if the approve verdict ran).
		await db.insert(tailoredGrants).values({
			proposedCallId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "land_change",
			approvedArgs: JSON.stringify({}),
			argPinned: false,
			consumed: false,
			mintedAt: NOW,
		});

		// Session 2: grant-bearing.
		const s2Id = `s2-ac3-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, agentId, taskId, s2Id);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "grant-bearing",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				approvedCall: {
					proposedCallId,
					toolId: "land_change",
					args: {},
					argPinned: false,
					identityHash: `h-ac3-${proposedCallId}`,
				},
			},
		});

		const result = await registry.invoke("land_change", {});
		// Must succeed (push succeeded).
		expect(result.success).toBe(true);

		// Outcome row must exist with pushed sha.
		const [outcome] = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, proposedCallId));
		expect(outcome).toBeDefined();
		expect(outcome?.status).toBe("ok");
		expect(outcome?.receipt).toContain(commitSha);

		// Grant must be consumed.
		const [grant] = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grant?.consumed).toBe(true);

		// Bare remote branch must now point at the captured commit.
		expect(remoteMainSha()).toBe(commitSha);
	});

	test("exact approved proposedCallId prevents sibling land_change grant cross-consume", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId, captureSessionId } =
			await seedWorld(db);

		const siblingProposedCallId = `pc-ac3-sibling-${crypto.randomUUID()}`;
		const approvedProposedCallId = `pc-ac3-approved-${crypto.randomUUID()}`;

		for (const pcId of [siblingProposedCallId, approvedProposedCallId]) {
			await db.insert(proposedCalls).values({
				id: pcId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				originSessionId: captureSessionId,
				toolId: "land_change",
				args: JSON.stringify({}),
				identityHash: `h-${pcId}`,
				reversibility: "irreversible",
				status: "captured",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});
			await db.insert(tailoredGrants).values({
				proposedCallId: pcId,
				taskScope: taskId,
				agentScope: agentId,
				approvedToolId: "land_change",
				approvedArgs: JSON.stringify({}),
				argPinned: false,
				consumed: false,
				mintedAt: NOW,
			});
		}

		const registry = buildToolRegistry(
			makeCtx(db, eventBus, agentId, taskId, `s2-ac3-exact-${crypto.randomUUID()}`),
			{
				role: "builder",
				sessionWorkflow: {
					routeToReview: ["irreversible"],
					sessionRole: "grant-bearing",
					reviewMessageId,
					subjectThreadId: threadId,
					artifactId,
					approvedCall: {
						proposedCallId: approvedProposedCallId,
						toolId: "land_change",
						args: {},
						argPinned: false,
						identityHash: `h-${approvedProposedCallId}`,
					},
				},
			},
		);

		const result = await registry.invoke("land_change", {});
		expect(result.success).toBe(true);

		const grants = await db.select().from(tailoredGrants);
		const siblingGrant = grants.find((g) => g.proposedCallId === siblingProposedCallId);
		const approvedGrant = grants.find((g) => g.proposedCallId === approvedProposedCallId);
		expect(siblingGrant?.consumed).toBe(false);
		expect(approvedGrant?.consumed).toBe(true);

		const siblingOutcomes = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, siblingProposedCallId));
		expect(siblingOutcomes).toHaveLength(0);
	});
});

// ─── At-most-once idempotent landing ──────────────────────────────────────

describe("second land_change after consumed grant routes to review", () => {
	test("already-consumed grant → second invoke returns AWAITING_REVIEW, remote sha unchanged", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId, captureSessionId } =
			await seedWorld(db);

		const proposedCallId = `pc-ac4-${crypto.randomUUID()}`;
		await db.insert(proposedCalls).values({
			id: proposedCallId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: captureSessionId,
			toolId: "land_change",
			args: JSON.stringify({}),
			identityHash: `h-ac4-${proposedCallId}`,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		await db.insert(tailoredGrants).values({
			proposedCallId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "land_change",
			approvedArgs: JSON.stringify({}),
			argPinned: false,
			consumed: false,
			mintedAt: NOW,
		});

		// Session-2: first successful invoke.
		const s2Id = `s2-ac4-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, agentId, taskId, s2Id);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "grant-bearing",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				approvedCall: {
					proposedCallId,
					toolId: "land_change",
					args: {},
					argPinned: false,
					identityHash: `h-ac4-${proposedCallId}`,
				},
			},
		});

		const first = await registry.invoke("land_change", {});
		expect(first.success).toBe(true);
		const remoteShaAfterFirst = remoteMainSha();
		expect(remoteShaAfterFirst).toBe(commitSha);

		// Second invoke with same session (grant consumed → falls through to route-to-review).
		const second = await registry.invoke("land_change", {});
		expect(second.success).toBe(false);
		expect((second as { success: false; code: string }).code).toBe("AWAITING_REVIEW");

		// Only one outcome row.
		const outcomes = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, proposedCallId));
		expect(outcomes).toHaveLength(1);
		expect(remoteMainSha()).toBe(remoteShaAfterFirst);
	});
});

// ─── Non-approve → no push; failed push → failed Outcome ─────────────────

describe("land_change non-approve and failed push behavior", () => {
	test("session 1 with held-status grant → no push, no Outcome", async ({ db, eventBus }) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const s1Id = `s1-ac6-hold-${crypto.randomUUID()}`;

		// In session 1, land_change is captured (not approved).
		const ctx = makeCtx(db, eventBus, agentId, taskId, s1Id);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		const result = await registry.invoke("land_change", {});
		expect((result as { success: false; code: string }).code).toBe("AWAITING_REVIEW");

		// No outcome.
		const rows = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, s1Id));
		const pcId = rows[0]?.id;
		expect(pcId).toBeTruthy();
		if (pcId) {
			const outcomes = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.proposedCallId, pcId));
			expect(outcomes).toHaveLength(0);
		}
	});

	test("land_change with bad remote → failed Outcome with error", async ({ db, eventBus }) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId, filesystemId } =
			await seedWorld(db);

		// Override the filesystem to use a non-existent remote.
		const badFsId = `fs-lc-bad-${crypto.randomUUID()}`;
		await db.insert(filesystems).values({
			id: badFsId,
			teamId:
				(
					await db
						.select({ teamId: filesystems.teamId })
						.from(filesystems)
						.where(eq(filesystems.id, filesystemId))
				)[0]?.teamId ?? "team-bad",
			source: "local",
			kind: "code",
			resourceRef: JSON.stringify({
				kind: "code",
				repo: "/nonexistent/path/that/does/not/exist",
				branch: "main",
			}),
			writeback: "git",
			state: "reachable",
			createdAt: NOW,
		});

		// Re-seed capture pointing at bad filesystem.
		const badSessionId = `sess-lc-bad-${crypto.randomUUID()}`;
		await db.insert(sessions).values({
			id: badSessionId,
			taskId,
			agentId,
			modelTier: "standard",
			startedAt: NOW,
			state: "ended",
		});
		await db.insert(filesystemCaptures).values({
			id: `cap-bad-${crypto.randomUUID()}`,
			sessionId: badSessionId,
			filesystemId: badFsId,
			writeback: "git",
			capturePath: bundlePath,
			commitSha,
			createdAt: NOW,
		});

		const proposedCallId = `pc-ac6-fail-${crypto.randomUUID()}`;
		await db.insert(proposedCalls).values({
			id: proposedCallId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: badSessionId,
			toolId: "land_change",
			args: JSON.stringify({}),
			identityHash: `h-ac6fail-${proposedCallId}`,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});
		await db.insert(tailoredGrants).values({
			proposedCallId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "land_change",
			approvedArgs: JSON.stringify({}),
			argPinned: false,
			consumed: false,
			mintedAt: NOW,
		});

		const s2Id = `s2-ac6-fail-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, agentId, taskId, s2Id);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "grant-bearing",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				approvedCall: {
					proposedCallId,
					toolId: "land_change",
					args: {},
					argPinned: false,
					identityHash: `h-ac6fail-${proposedCallId}`,
				},
			},
		});

		const result = await registry.invoke("land_change", {});
		// The push fails → handler returns err → recordOutcome writes failed Outcome.
		expect(result.success).toBe(false);

		const [outcome] = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, proposedCallId));
		expect(outcome?.status).toBe("failed");
		expect(outcome?.error).toBeTruthy();
	});
});
