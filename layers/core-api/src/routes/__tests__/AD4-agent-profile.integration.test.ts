/**
 * AD4 — Agent Profile API: review track record tests (RED phase)
 *
 * AC coverage:
 * AC1: AgentProfile API response does NOT include a `skills` field
 * AC4: Agent profile route returns `reviewTrackRecord` with approvalRate,
 *      totalVerdicts, recentVerdicts, windowDays
 * AC5: the profile route does not return skills
 *
 * These tests FAIL until:
 * - packages/server/src/app-runtime/services/approval-rate.ts is created
 * - packages/server/src/routes/agent-profile.ts replaces skills query with
 *   computeApprovalRate call and removes `skills` from the response
 * - framework/domain-model/src/agent-profile.ts adds AgentReviewTrackRecord type
 *   and replaces skills field with reviewTrackRecord in AgentProfileResponse
 */

import {
	agentRunConfig,
	type HyperIdleDb,
	messages,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ad4-agent-profile";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

const NOW = new Date().toISOString();
const FIVE_DAYS_AGO = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

async function seedPrereqs(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "ad4-profile-team",
		name: "AD4 Profile Test Team",
		phase: "build",
		createdAt: NOW,
	});
	// Human founder — required for auth middleware
	await db.insert(users).values({
		id: "ad4-profile-founder",
		kind: "human",
		name: "AD4 Founder",
		role: "founder",
		status: "active",
		email: "ad4-founder@hyperidle.test",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "ad4-profile-founder",
		maxConcurrentSessions: 0,
	});
	// AI agent under test
	await db.insert(users).values({
		id: "ad4-profile-agent",
		kind: "ai",
		name: "AD4 Builder Bot",
		role: "builder",
		status: "active",
		teamId: "ad4-profile-team",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "ad4-profile-agent",
		maxConcurrentSessions: 2,
		harnessType: "claude-code",
	});
	// Policy engine sender (needed for verdict messages)
	await db.insert(users).values({
		id: "policy_engine",
		kind: "ai",
		name: "Policy Engine",
		role: "system",
		status: "active",
		createdAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// Helper: insert a verdict message attributed to ad4-profile-agent.
//
// @lore BC3 architecture.md §5 R4: Path 1 (legacyItemId -> items.sourceAgentId)
// is deleted with the `items` table. Attribution is Path 2 only now — the
// thread's own `initiatorId` (already "ad4-profile-agent" below) is what
// `computeApprovalRate` reads.
// ---------------------------------------------------------------------------
async function seedVerdict(
	db: HyperIdleDb,
	decision: string,
	createdAt: string = FIVE_DAYS_AGO,
): Promise<void> {
	const threadId = crypto.randomUUID();

	await db.insert(threads).values({
		id: threadId,
		hostKind: "team",
		hostId: "ad4-profile-team",
		initiatorId: "ad4-profile-agent",
		participants: JSON.stringify(["ad4-profile-agent"]),
		lastActiveAt: createdAt,
		createdAt,
	});

	await db.insert(messages).values({
		id: crypto.randomUUID(),
		senderId: "ad4-profile-founder",
		threadId,
		type: "verdict",
		payload: JSON.stringify({ decision }),
		clientKey: `ad4-verdict-${crypto.randomUUID()}`,
		createdAt,
	});
}

// ===========================================================================
// AC4: Agent profile returns reviewTrackRecord (not skills)
// ===========================================================================

describe("AD4 AC4: GET /api/agents/:id/profile returns reviewTrackRecord", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("response has reviewTrackRecord field", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ad4-profile-agent/profile", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("reviewTrackRecord");
	});

	test("reviewTrackRecord has required fields: approvalRate, totalVerdicts, recentVerdicts, windowDays", async ({
		db,
		app,
	}) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ad4-profile-agent/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const trackRecord = body.reviewTrackRecord as Record<string, unknown>;

		expect(trackRecord).toHaveProperty("approvalRate");
		expect(trackRecord).toHaveProperty("totalVerdicts");
		expect(trackRecord).toHaveProperty("recentVerdicts");
		expect(trackRecord).toHaveProperty("windowDays");
	});

	test("returns approvalRate=0 and totalVerdicts=0 when agent has no verdicts", async ({
		db,
		app,
	}) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ad4-profile-agent/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const trackRecord = body.reviewTrackRecord as Record<string, unknown>;

		expect(trackRecord.approvalRate).toBe(0);
		expect(trackRecord.totalVerdicts).toBe(0);
		expect(Array.isArray(trackRecord.recentVerdicts)).toBe(true);
		expect((trackRecord.recentVerdicts as unknown[]).length).toBe(0);
	});

	test("computes correct approvalRate when agent has verdicts", async ({ db, app }) => {
		await seedPrereqs(db);
		// 3 approvals + 1 rejection = 75%
		await seedVerdict(db, "approve");
		await seedVerdict(db, "approve");
		await seedVerdict(db, "approve-with-comments");
		await seedVerdict(db, "reject");

		const res = await app.request("/api/agents/ad4-profile-agent/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const trackRecord = body.reviewTrackRecord as Record<string, unknown>;

		expect(trackRecord.totalVerdicts).toBe(4);
		expect(trackRecord.approvalRate as number).toBeCloseTo(0.75);
	});

	test("recentVerdicts is an array of verdict entries with required shape", async ({ db, app }) => {
		await seedPrereqs(db);
		await seedVerdict(db, "approve");

		const res = await app.request("/api/agents/ad4-profile-agent/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const trackRecord = body.reviewTrackRecord as Record<string, unknown>;
		const recentVerdicts = trackRecord.recentVerdicts as Array<Record<string, unknown>>;

		expect(recentVerdicts.length).toBeGreaterThanOrEqual(1);
		const first = recentVerdicts[0];
		expect(first).toHaveProperty("decision");
		expect(first).toHaveProperty("threadId");
		expect(first).toHaveProperty("createdAt");
		expect(first?.decision).toBe("approve");
	});

	test("windowDays is a positive integer (from factory settings default=30)", async ({
		db,
		app,
	}) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ad4-profile-agent/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const trackRecord = body.reviewTrackRecord as Record<string, unknown>;

		expect(typeof trackRecord.windowDays).toBe("number");
		expect(trackRecord.windowDays as number).toBeGreaterThan(0);
	});
});

// ===========================================================================
// AC1 / AC5: skills field is NOT in the profile response
// ===========================================================================

describe("AD4 AC1/AC5: GET /api/agents/:id/profile does NOT return skills", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("response does NOT have a skills field", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ad4-profile-agent/profile", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).not.toHaveProperty("skills");
	});
});
