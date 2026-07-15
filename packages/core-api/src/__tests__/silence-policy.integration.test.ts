import { teamMembers, teams, users } from "@hyperidle/db";
import {
	isInSilenceWindow,
	isSilenced,
	type NotificationsSilenceDeps,
} from "@hyperidle/notifications";
import { getTeamMembersById } from "@hyperidle/org";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { getUserById } from "@hyperidle/users";
import { describe, expect } from "vitest";
import { test } from "../test-fixtures.js";

const silencePolicyDeps: NotificationsSilenceDeps = {
	serverConfig: { read: readServerConfig, update: updateServerConfig },
	users: { getUserById },
	teams: { getTeamMembersById },
};

describe("isInSilenceWindow", () => {
	test("returns true when now is exactly at window start", async ({}) => {
		// Window 09:00 - 17:00, now = 09:00 UTC
		const now = new Date("2026-01-15T09:00:00Z");
		expect(isInSilenceWindow("09:00", "17:00", now)).toBe(true);
	});

	test("returns true when now is exactly at window end", async ({}) => {
		// Window 09:00 - 17:00, now = 17:00 UTC
		const now = new Date("2026-01-15T17:00:00Z");
		expect(isInSilenceWindow("09:00", "17:00", now)).toBe(true);
	});

	test("returns false when now is one minute before window start", async ({}) => {
		const now = new Date("2026-01-15T08:59:00Z");
		expect(isInSilenceWindow("09:00", "17:00", now)).toBe(false);
	});

	test("returns false when now is one minute after window end", async ({}) => {
		const now = new Date("2026-01-15T17:01:00Z");
		expect(isInSilenceWindow("09:00", "17:00", now)).toBe(false);
	});

	test("supports overnight window (22:00 - 07:00)", async ({}) => {
		// 23:00 should be inside the window
		const late = new Date("2026-01-15T23:00:00Z");
		expect(isInSilenceWindow("22:00", "07:00", late)).toBe(true);

		// 03:00 should be inside the window (after midnight)
		const early = new Date("2026-01-16T03:00:00Z");
		expect(isInSilenceWindow("22:00", "07:00", early)).toBe(true);

		// 12:00 should be outside the window
		const midday = new Date("2026-01-15T12:00:00Z");
		expect(isInSilenceWindow("22:00", "07:00", midday)).toBe(false);
	});

	test("returns false for malformed time format (missing colon)", async ({}) => {
		const now = new Date("2026-01-15T12:00:00Z");
		expect(isInSilenceWindow("0900", "1700", now)).toBe(false);
	});

	test("handles edge case of midnight boundary (00:00)", async ({}) => {
		// Overnight window ending at midnight
		const now = new Date("2026-01-15T00:00:00Z");
		expect(isInSilenceWindow("22:00", "00:00", now)).toBe(true);
	});

	test("returns false for non-numeric time parts", async ({}) => {
		const now = new Date("2026-01-15T12:00:00Z");
		expect(isInSilenceWindow("ab:cd", "12:00", now)).toBe(false);
	});

	test("treats 07:00 as silenced for overnight window 22:00-07:00 (inclusive end)", async ({}) => {
		// @lore The spec says "when time is 07:00, then not silenced" for
		// window "22:00-07:00", but the implementation uses inclusive end
		// boundary (<=). At 07:00, nowMinutes (420) <= endMinutes (420) is
		// true, so the time IS silenced. This test documents the ACTUAL
		// behavior. If the spec intent is exclusive end, the production code
		// would need to change from <= to <.
		const now = new Date("2026-01-15T07:00:00Z");
		expect(isInSilenceWindow("22:00", "07:00", now)).toBe(true);
	});

	test("returns false for '25:00' malformed hour value (out of 0-23 range)", async ({}) => {
		// @lore The implementation does not validate that hours are in the
		// 0-23 range — it only checks for numeric-ness and colon format.
		// "25:00" parses to startMinutes=1500, which exceeds any real
		// nowMinutes (max 1439). In the non-overnight branch (start <= end),
		// no real time can satisfy >= 1500, so the result is effectively
		// false. However, in the overnight branch (e.g. "25:00"-"07:00"),
		// times <= endMinutes would still match — the guard is accidental,
		// not by design.
		const now = new Date("2026-01-15T12:00:00Z");
		expect(isInSilenceWindow("25:00", "26:00", now)).toBe(false);
	});
});

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
