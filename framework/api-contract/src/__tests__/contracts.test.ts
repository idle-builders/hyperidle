/**
 * M2 RED — api-contract type shape tests.
 *
 * These tests validate that:
 * 1. @hyperidle/api-contract compiles cleanly (proven by tsc; these run in Vitest)
 * 2. Every exported type has the expected fields (structural `satisfies` assertions)
 * 3. SettingsResponse covers all fields that DEFAULT_SETTINGS (app-shell-data.ts) provides
 *    (minus `appearance` which stays client-side per the M2 contract)
 * 4. AuthMeResponse has the required identity fields
 *
 * Tests are type-level (compile-time checks via `satisfies` + `expectTypeOf`) plus
 * runtime shape-check assertions so Vitest registers concrete pass/fail.
 *
 * @lore AD8a: Rail contract types (RailBet, RailBlocker, RailCostBurnRate, RailResponse)
 * deleted — the Rail API route and its UI surface were removed in U6. The contract
 * file rail.ts and the api-contract re-exports have been deleted.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	AuthMeResponse,
	AutonomyLevel,
	SettingsAgent,
	SettingsNotifications,
	SettingsProfile,
	SettingsResponse,
	SettingsTeam,
} from "../index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Type-level assertion: `value satisfies T` at the type checker,
 * plus a runtime no-op so Vitest counts it as a passing assertion.
 */
function assertShape<T>(value: T): T {
	expect(value).toBeDefined();
	return value;
}

// ── Contract 1: AuthMeResponse ────────────────────────────────────────────────

describe("AuthMeResponse (cluster 1 — auth/identity)", () => {
	it("has the required identity fields (id, name, email, avatarUrl)", () => {
		const response: AuthMeResponse = {
			id: "u-founder",
			name: "Founder",
			email: "founder@hyperidle.com",
			avatarUrl: null,
		};
		assertShape<AuthMeResponse>(response);
	});

	it("id is a string", () => {
		expectTypeOf<AuthMeResponse["id"]>().toEqualTypeOf<string>();
	});

	it("name is a string", () => {
		expectTypeOf<AuthMeResponse["name"]>().toEqualTypeOf<string>();
	});

	it("email is a string", () => {
		expectTypeOf<AuthMeResponse["email"]>().toEqualTypeOf<string>();
	});

	it("avatarUrl is string | null", () => {
		expectTypeOf<AuthMeResponse["avatarUrl"]>().toEqualTypeOf<string | null>();
	});

	it("accepts non-null avatarUrl", () => {
		const withAvatar: AuthMeResponse = {
			id: "u-founder",
			name: "Founder",
			email: "founder@hyperidle.com",
			avatarUrl: "https://example.com/avatar.png",
		};
		assertShape<AuthMeResponse>(withAvatar);
		expect(withAvatar.avatarUrl).toBe("https://example.com/avatar.png");
	});
});

// ── Contract 2: SettingsResponse ──────────────────────────────────────────────

describe("AutonomyLevel (cluster 2 — settings)", () => {
	it("is the union manual | supervised | autonomous", () => {
		expectTypeOf<AutonomyLevel>().toEqualTypeOf<"manual" | "supervised" | "autonomous">();
	});

	it("accepts all three valid values at runtime", () => {
		const levels: AutonomyLevel[] = ["manual", "supervised", "autonomous"];
		expect(levels).toHaveLength(3);
	});
});

describe("SettingsProfile (cluster 2 — settings)", () => {
	it("has name, email, avatarUrl fields", () => {
		const profile: SettingsProfile = {
			name: "Founder",
			email: "founder@hyperidle.com",
			avatarUrl: null,
		};
		assertShape<SettingsProfile>(profile);
	});

	it("name is string", () => {
		expectTypeOf<SettingsProfile["name"]>().toEqualTypeOf<string>();
	});

	it("email is string", () => {
		expectTypeOf<SettingsProfile["email"]>().toEqualTypeOf<string>();
	});

	it("avatarUrl is string | null", () => {
		expectTypeOf<SettingsProfile["avatarUrl"]>().toEqualTypeOf<string | null>();
	});
});

describe("SettingsTeam (cluster 2 — settings)", () => {
	it("has id, name, active fields", () => {
		const team: SettingsTeam = {
			id: "p1",
			name: "Team Alpha",
			active: true,
		};
		assertShape<SettingsTeam>(team);
	});

	it("active is boolean", () => {
		expectTypeOf<SettingsTeam["active"]>().toEqualTypeOf<boolean>();
	});

	it("inactive team is valid", () => {
		const inactive: SettingsTeam = { id: "p2", name: "Team Beta", active: false };
		expect(inactive.active).toBe(false);
	});
});

describe("SettingsAgent (cluster 2 — settings)", () => {
	it("has id, name, autonomyLevel, paused fields", () => {
		const agent: SettingsAgent = {
			id: "a1",
			name: "Architect",
			autonomyLevel: "supervised",
			paused: false,
		};
		assertShape<SettingsAgent>(agent);
	});

	it("autonomyLevel is AutonomyLevel", () => {
		expectTypeOf<SettingsAgent["autonomyLevel"]>().toEqualTypeOf<AutonomyLevel>();
	});

	it("paused is boolean", () => {
		expectTypeOf<SettingsAgent["paused"]>().toEqualTypeOf<boolean>();
	});
});

describe("SettingsNotifications (cluster 2 — settings)", () => {
	it("has all required notification fields", () => {
		const notifications: SettingsNotifications = {
			reviewAlerts: true,
			blockerAlerts: true,
			quietHoursStart: "22:00",
			quietHoursEnd: "08:00",
			mutedTeams: [],
		};
		assertShape<SettingsNotifications>(notifications);
	});

	it("reviewAlerts is boolean", () => {
		expectTypeOf<SettingsNotifications["reviewAlerts"]>().toEqualTypeOf<boolean>();
	});

	it("blockerAlerts is boolean", () => {
		expectTypeOf<SettingsNotifications["blockerAlerts"]>().toEqualTypeOf<boolean>();
	});

	it("quietHoursStart is string (HH:MM format)", () => {
		expectTypeOf<SettingsNotifications["quietHoursStart"]>().toEqualTypeOf<string>();
	});

	it("quietHoursEnd is string (HH:MM format)", () => {
		expectTypeOf<SettingsNotifications["quietHoursEnd"]>().toEqualTypeOf<string>();
	});

	it("mutedTeams is readonly string[]", () => {
		expectTypeOf<SettingsNotifications["mutedTeams"]>().toEqualTypeOf<readonly string[]>();
	});

	it("accepts non-empty mutedTeams", () => {
		const n: SettingsNotifications = {
			reviewAlerts: false,
			blockerAlerts: false,
			quietHoursStart: "23:00",
			quietHoursEnd: "07:00",
			mutedTeams: ["t1", "t2"],
		};
		expect(n.mutedTeams).toHaveLength(2);
	});
});

describe("SettingsResponse (cluster 2 — settings)", () => {
	it("has profile, teams, users, notifications — matches DEFAULT_SETTINGS minus appearance", () => {
		// DEFAULT_SETTINGS in app-shell-data.ts has: profile, teams, users, notifications, appearance.
		// appearance is client-only (localStorage); the API contract omits it.
		const response: SettingsResponse = {
			profile: {
				name: "Founder",
				email: "founder@hyperidle.com",
				avatarUrl: null,
			},
			teams: [
				{ id: "t1", name: "Team Alpha", active: true },
				{ id: "t2", name: "Team Beta", active: false },
			],
			users: [
				{ id: "a1", name: "Architect", autonomyLevel: "supervised", paused: false },
				{ id: "a2", name: "Developer", autonomyLevel: "autonomous", paused: false },
			],
			notifications: {
				reviewAlerts: true,
				blockerAlerts: true,
				quietHoursStart: "22:00",
				quietHoursEnd: "08:00",
				mutedTeams: [],
			},
		};
		assertShape<SettingsResponse>(response);
	});

	it("teams is readonly array of SettingsTeam", () => {
		expectTypeOf<SettingsResponse["teams"]>().toEqualTypeOf<readonly SettingsTeam[]>();
	});

	it("agents is readonly array of SettingsAgent", () => {
		expectTypeOf<SettingsResponse["users"]>().toEqualTypeOf<readonly SettingsAgent[]>();
	});

	it("does NOT include appearance (client-side only)", () => {
		// Type-level: SettingsResponse must not have an `appearance` key.
		// @lore M2: appearance (density/theme) stays in localStorage via useTheme() /
		// useAutoDensity(). SettingsPanel composes the API response with local appearance state.
		type HasAppearance = "appearance" extends keyof SettingsResponse ? true : false;
		expectTypeOf<HasAppearance>().toEqualTypeOf<false>();
	});
});

// ── Index re-exports ──────────────────────────────────────────────────────────

describe("index.ts re-exports", () => {
	it("exports AuthMeResponse", () => {
		// Compile-time: if the import at top of file succeeds, this passes.
		// Runtime: assert the type name can be used as a type annotation.
		const check: AuthMeResponse = {
			id: "u-1",
			name: "Test",
			email: "test@test.com",
			avatarUrl: null,
		};
		expect(check.id).toBe("u-1");
	});

	it("exports SettingsResponse", () => {
		const check: SettingsResponse = {
			profile: { name: "T", email: "t@t.com", avatarUrl: null },
			teams: [],
			users: [],
			notifications: {
				reviewAlerts: false,
				blockerAlerts: false,
				quietHoursStart: "00:00",
				quietHoursEnd: "00:00",
				mutedTeams: [],
			},
		};
		expect(check.profile.name).toBe("T");
	});
});
