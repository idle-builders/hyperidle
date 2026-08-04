/**
 * @lore AU20 Stage 2: isInSilenceWindow and NotificationsSilenceDeps removed
 * from public surface. The isInSilenceWindow describe block is deleted —
 * that function is now private within silence-policy.ts; coverage comes
 * through isSilenced's window-check path (last two tests below).
 * NotificationsSilenceDeps type annotation dropped; silencePolicyDeps uses
 * structural inference from the NotificationsDeps-compatible literal.
 */
import { teamMembers, teams, users } from "@hyperidle/db";
import { isSilenced } from "@hyperidle/notifications";
import { getTeamMembers } from "@hyperidle/org";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { findUser } from "@hyperidle/users";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const silencePolicyDeps = {
	serverConfig: { read: readServerConfig, update: updateServerConfig },
	users: { getUserById: (db: Parameters<typeof findUser>[0], id: string) => findUser(db, { id }) },
	teams: {
		getTeamMembersById: (db: Parameters<typeof getTeamMembers>[0], id: string) =>
			getTeamMembers(db, { id }),
	},
};

describe("isSilenced", () => {
	test("returns true when factory-wide silence_mode is enabled", async ({ db }) => {
		await db.insert(teams).values({
			id: "prod-1",
			name: "Test Product",
			phase: "build",
			createdAt: new Date().toISOString(),
		});
		await db.insert(teamMembers).values({
			id: "team-1",
			teamId: "prod-1",
			capacity: 3,
			activeBets: 0,
			formedAt: new Date().toISOString(),
		});
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Test Agent",
			role: "builder",
			status: "active",
			teamId: "team-1",
			createdAt: new Date().toISOString(),
		});
		await updateServerConfig(db, { notifications: { silence: { mode: true } } });

		const result = await isSilenced(db, { sourceAgentId: null }, new Date(), silencePolicyDeps);
		expect(result).toBe(true);
	});

	test("returns false when silence_mode is not set", async ({ db }) => {
		const result = await isSilenced(db, { sourceAgentId: null }, new Date(), silencePolicyDeps);
		expect(result).toBe(false);
	});

	test("returns true for per-product silence", async ({ db }) => {
		await db.insert(teams).values({
			id: "prod-1",
			name: "Test Product",
			phase: "build",
			createdAt: new Date().toISOString(),
		});
		await db.insert(teamMembers).values({
			id: "team-1",
			teamId: "prod-1",
			capacity: 3,
			activeBets: 0,
			formedAt: new Date().toISOString(),
		});
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Test Agent",
			role: "builder",
			status: "active",
			teamId: "team-1",
			createdAt: new Date().toISOString(),
		});
		await updateServerConfig(db, { notifications: { silence: { silencedTeamIds: ["prod-1"] } } });

		const result = await isSilenced(
			db,
			{ sourceAgentId: "agent-1" },
			new Date(),
			silencePolicyDeps,
		);
		expect(result).toBe(true);
	});

	test("returns true when current time falls in silence window", async ({ db }) => {
		const now = new Date("2026-01-15T23:00:00Z");
		await updateServerConfig(db, {
			notifications: { silence: { windowStart: "22:00", windowEnd: "07:00" } },
		});

		const result = await isSilenced(db, { sourceAgentId: null }, now, silencePolicyDeps);
		expect(result).toBe(true);
	});

	test("returns false when current time is outside silence window", async ({ db }) => {
		const now = new Date("2026-01-15T12:00:00Z");
		await updateServerConfig(db, {
			notifications: { silence: { windowStart: "22:00", windowEnd: "07:00" } },
		});

		const result = await isSilenced(db, { sourceAgentId: null }, now, silencePolicyDeps);
		expect(result).toBe(false);
	});
});
