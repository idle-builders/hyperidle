/**
 * Fresh team enqueues no health notifications.
 *
 * Robustness invariant: zero-session agent → never degraded (idle, never error).
 * Sanity-break: agent with crashed-session outcome DOES enqueue agent.health.degraded.
 *
 * @lore AV1 AC6: The zero-session assertion is trivially true (idle agent can't be
 * error), but it is an EXPLICIT invariant pinned here. The sanity-break carries the
 * real proof: the notification path is NOT muted, only never triggered for idle agents.
 */

import { bets, notificationQueue, sessions, tasks, users } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import { describe, expect, test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-AV1-notif";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("idle agent produces zero health.degraded notifications", () => {
	test("GET /api/teams/:id for fresh team produces zero agent.health.degraded rows", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Create fresh team
		const createRes = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Fresh Team", functions: ["development"] }),
		});
		expect(createRes.status).toBe(201);
		const body = (await createRes.json()) as { team: { id: string } };
		const teamId = body.team.id;

		// GET team detail (triggers health computation + potential notifications)
		const getRes = await app.request(`/api/teams/${teamId}`, {
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);

		// Assert zero agent.health.degraded notifications for any agent in this team
		// (agents for this team have agentId matching their teamId membership)
		const allAgents = await db.select().from(users);
		const teamAgentIds = allAgents.filter((u) => u.kind === "ai").map((u) => u.id);

		const degradedRows = await db
			.select()
			.from(notificationQueue)
			.where(
				and(
					eq(notificationQueue.eventType, "agent.health.degraded"),
					eq(notificationQueue.status, "pending"),
				),
			);
		// Filter to agents in our team (fresh team — none should be degraded)
		const teamDegradedRows = degradedRows.filter((n) => teamAgentIds.includes(n.subjectId ?? ""));
		expect(teamDegradedRows).toHaveLength(0);

		vi.unstubAllEnvs();
	});

	test("sanity-break: agent with crashed session outcome DOES enqueue agent.health.degraded", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Create team
		const createRes = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Crashed Team", functions: ["development"] }),
		});
		expect(createRes.status).toBe(201);
		const body = (await createRes.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamId = body.team.id;
		const teamMembersId = body.teamMembers.id;

		// Get an agent id (builtin agent from minimalStrategy)
		const agents = await db.select().from(users).where(eq(users.teamId, teamMembersId));
		const agentId = agents[0]?.id;
		expect(agentId).toBeDefined();

		// Seed a bet + task needed for the session FK
		await db.insert(bets).values({
			id: "bet-ac6",
			teamId,
			description: "AC6 test bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "task-ac6",
			betId: "bet-ac6",
			teamId,
			title: "AC6 test task",
			description: "test",
			state: "done",
			ownerAgentId: agentId!,
			createdAt: NOW,
			updatedAt: NOW,
		});

		// Insert a crashed session (outcome:"crashed" → lastSessionCrashed → error state)
		await db.insert(sessions).values({
			id: "sess-ac6",
			taskId: "task-ac6",
			agentId: agentId!,
			modelTier: "standard",
			startedAt: NOW,
			endedAt: NOW,
			state: "ended",
			outcome: "crashed",
		});

		// GET team detail — health computation sees crashed session → error state → notification
		const getRes = await app.request(`/api/teams/${teamId}`, {
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);

		// Assert a degraded notification WAS enqueued for this agent
		const degradedRows = await db
			.select()
			.from(notificationQueue)
			.where(
				and(
					eq(notificationQueue.eventType, "agent.health.degraded"),
					eq(notificationQueue.subjectId, agentId!),
					eq(notificationQueue.status, "pending"),
				),
			);
		expect(degradedRows.length).toBeGreaterThan(0);

		vi.unstubAllEnvs();
	});
});
