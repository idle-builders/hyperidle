/**
 * M2 RED — api-contract type shape tests.
 *
 * These tests validate that:
 * 1. @hyperidle/api-contract compiles cleanly (proven by tsc; these run in Vitest)
 * 2. Every exported type has the expected fields (structural `satisfies` assertions)
 * 3. Rail types are structurally compatible with what packages/server/src/routes/rail.ts returns
 * 4. SettingsResponse covers all fields that DEFAULT_SETTINGS (app-shell-data.ts) provides
 *    (minus `appearance` which stays client-side per the M2 contract)
 * 5. AuthMeResponse has the required identity fields
 *
 * Tests are type-level (compile-time checks via `satisfies` + `expectTypeOf`) plus
 * runtime shape-check assertions so Vitest registers concrete pass/fail.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	AuthMeResponse,
	AutonomyLevel,
	RailBet,
	RailBlocker,
	RailCostBurnRate,
	RailResponse,
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

describe("SettingsProduct (cluster 2 — settings)", () => {
	it("has id, name, active fields", () => {
		const product: SettingsProduct = {
			id: "p1",
			name: "Product Alpha",
			active: true,
		};
		assertShape<SettingsProduct>(product);
	});

	it("active is boolean", () => {
		expectTypeOf<SettingsProduct["active"]>().toEqualTypeOf<boolean>();
	});

	it("inactive product is valid", () => {
		const inactive: SettingsProduct = { id: "p2", name: "Product Beta", active: false };
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
			costAlerts: true,
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

	it("costAlerts is boolean", () => {
		expectTypeOf<SettingsNotifications["costAlerts"]>().toEqualTypeOf<boolean>();
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
			costAlerts: false,
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
				costAlerts: true,
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

// ── Contract 3: Rail types ────────────────────────────────────────────────────

describe("RailBet (cluster 3 — rail)", () => {
	it("has id, title, status, progress fields", () => {
		const bet: RailBet = {
			id: "b1",
			title: "User auth flow",
			status: "in_progress",
			progress: { done: 3, total: 10 },
		};
		assertShape<RailBet>(bet);
	});

	it("id is string", () => {
		expectTypeOf<RailBet["id"]>().toEqualTypeOf<string>();
	});

	it("title is string", () => {
		expectTypeOf<RailBet["title"]>().toEqualTypeOf<string>();
	});

	it("status is string (not narrowed — server authority)", () => {
		// @lore M2: The server returns status as string, not the BetStatus union.
		// The client casts to BetStatus with validation. The contract stays string.
		expectTypeOf<RailBet["status"]>().toEqualTypeOf<string>();
	});

	it("progress has done and total number fields", () => {
		expectTypeOf<RailBet["progress"]>().toEqualTypeOf<{
			readonly done: number;
			readonly total: number;
		}>();
	});

	it("does NOT have a product field (server authority over client BetItem)", () => {
		// @lore M2: Client BetItem had product: string; server RailBet has progress.
		// Server is the authority — client BetItem type must be updated to match.
		type HasProduct = "product" extends keyof RailBet ? true : false;
		expectTypeOf<HasProduct>().toEqualTypeOf<false>();
	});
});

describe("RailBlocker (cluster 3 — rail)", () => {
	it("has taskId, title, owner, durationBlockedMs fields", () => {
		const blocker: RailBlocker = {
			taskId: "t1",
			title: "Waiting for API spec",
			owner: "a1",
			durationBlockedMs: 3600000,
		};
		assertShape<RailBlocker>(blocker);
	});

	it("taskId is string (not id — server authority)", () => {
		// @lore M2: Client BlockerItem had id: string; server RailBlocker has taskId.
		// Contract uses taskId to match the server field name.
		expectTypeOf<RailBlocker["taskId"]>().toEqualTypeOf<string>();
	});

	it("owner is string | null", () => {
		// @lore M2: Client BlockerItem had agent: string (required); server allows null
		// for unassigned tasks.
		expectTypeOf<RailBlocker["owner"]>().toEqualTypeOf<string | null>();
	});

	it("durationBlockedMs is number", () => {
		expectTypeOf<RailBlocker["durationBlockedMs"]>().toEqualTypeOf<number>();
	});

	it("does NOT have severity field (client derives from durationBlockedMs)", () => {
		// @lore M2: BlockerItem.severity is not in the server response.
		// Client derives severity: >=24h = high, >=4h = medium, <4h = low.
		type HasSeverity = "severity" extends keyof RailBlocker ? true : false;
		expectTypeOf<HasSeverity>().toEqualTypeOf<false>();
	});

	it("accepts null owner (unassigned task)", () => {
		const unassigned: RailBlocker = {
			taskId: "t2",
			title: "Blocked on review",
			owner: null,
			durationBlockedMs: 86400000,
		};
		expect(unassigned.owner).toBeNull();
	});
});

describe("RailCostBurnRate (cluster 3 — rail)", () => {
	it("has todaySpend, todayCap, weekSpend, weekCap, weekTokens fields", () => {
		const burnRate: RailCostBurnRate = {
			todaySpend: { minor: 1240, currency: "USD" },
			todayCap: { minor: 5000, currency: "USD" },
			weekSpend: { minor: 8420, currency: "USD" },
			weekCap: { minor: 35000, currency: "USD" },
			weekTokens: 42300,
		};
		assertShape<RailCostBurnRate>(burnRate);
	});

	it("all WireMoney fields are nullable (caps may not be configured)", () => {
		// @lore M2: CostInfo in client was non-null; server RailCostBurnRate allows
		// null caps when not configured. Client must accept nulls and render 'No cap'.
		expectTypeOf<RailCostBurnRate["todayCap"]>().toEqualTypeOf<{
			readonly minor: number;
			readonly currency: "USD" | "EUR" | "GBP" | "JPY";
		} | null>();
	});

	it("weekTokens is number | null", () => {
		expectTypeOf<RailCostBurnRate["weekTokens"]>().toEqualTypeOf<number | null>();
	});

	it("accepts all-null caps (factory with no cost caps configured)", () => {
		const noCaps: RailCostBurnRate = {
			todaySpend: { minor: 0, currency: "USD" },
			todayCap: null,
			weekSpend: { minor: 0, currency: "USD" },
			weekCap: null,
			weekTokens: null,
		};
		expect(noCaps.todayCap).toBeNull();
		expect(noCaps.weekCap).toBeNull();
		expect(noCaps.weekTokens).toBeNull();
	});
});

describe("RailResponse (cluster 3 — rail)", () => {
	it("has bets, blockers, awaitingOrdering, costBurnRate fields", () => {
		const response: RailResponse = {
			bets: [],
			blockers: [],
			awaitingOrdering: [],
			costBurnRate: {
				todaySpend: null,
				todayCap: null,
				weekSpend: null,
				weekCap: null,
				weekTokens: null,
			},
		};
		assertShape<RailResponse>(response);
	});

	it("bets is readonly RailBet[]", () => {
		expectTypeOf<RailResponse["bets"]>().toEqualTypeOf<readonly RailBet[]>();
	});

	it("blockers is readonly RailBlocker[]", () => {
		expectTypeOf<RailResponse["blockers"]>().toEqualTypeOf<readonly RailBlocker[]>();
	});

	it("awaitingOrdering items have id, title, createdAt", () => {
		const item = { id: "i1", title: "New feature request", createdAt: "2026-05-11T10:00:00Z" };
		const response: RailResponse = {
			bets: [],
			blockers: [],
			awaitingOrdering: [item],
			costBurnRate: {
				todaySpend: null,
				todayCap: null,
				weekSpend: null,
				weekCap: null,
				weekTokens: null,
			},
		};
		expect(response.awaitingOrdering[0]?.createdAt).toBe("2026-05-11T10:00:00Z");
	});

	it("costBurnRate is RailCostBurnRate", () => {
		expectTypeOf<RailResponse["costBurnRate"]>().toEqualTypeOf<RailCostBurnRate>();
	});
});

// ── Structural compatibility: server local types vs contract ──────────────────
// These tests verify the contract types are structurally compatible with
// what the server endpoint in rail.ts actually constructs.

describe("structural compatibility with server rail.ts", () => {
	it("RailBet contract matches server-side RailBet shape", () => {
		// Server constructs: { id: b.id, title: b.pitch, status: b.status, progress: { done, total } }
		// Contract has the same fields with readonly modifiers (wider compatibility).
		const serverLike = {
			id: "b1",
			title: "bet pitch text",
			status: "in_progress",
			progress: { done: 2, total: 5 },
		};
		// This assignment proves structural compatibility at compile time.
		const contract: RailBet = serverLike;
		expect(contract.id).toBe("b1");
	});

	it("RailBlocker contract matches server-side RailBlocker shape", () => {
		// Server constructs: { taskId, title, owner: t.ownerAgentId, durationBlockedMs }
		const serverLike = {
			taskId: "t1",
			title: "task title",
			owner: null as string | null,
			durationBlockedMs: 1800000,
		};
		const contract: RailBlocker = serverLike;
		expect(contract.taskId).toBe("t1");
	});

	it("RailCostBurnRate contract matches server-side CostBurnRate shape", () => {
		// Server CostBurnRate has same field names (mutable), contract adds readonly.
		// readonly is a subtype of mutable in TypeScript — assignment works.
		const serverLike = {
			todaySpend: { minor: 100, currency: "USD" as const },
			todayCap: null as { minor: number; currency: "USD" | "EUR" | "GBP" | "JPY" } | null,
			weekSpend: { minor: 700, currency: "USD" as const },
			weekCap: null as { minor: number; currency: "USD" | "EUR" | "GBP" | "JPY" } | null,
			weekTokens: null as number | null,
		};
		const contract: RailCostBurnRate = serverLike;
		expect(contract.todaySpend?.minor).toBe(100);
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
				costAlerts: false,
				blockerAlerts: false,
				quietHoursStart: "00:00",
				quietHoursEnd: "00:00",
				mutedTeams: [],
			},
		};
		expect(check.profile.name).toBe("T");
	});

	it("exports RailResponse", () => {
		const check: RailResponse = {
			bets: [],
			blockers: [],
			awaitingOrdering: [],
			costBurnRate: {
				todaySpend: null,
				todayCap: null,
				weekSpend: null,
				weekCap: null,
				weekTokens: null,
			},
		};
		expect(check.bets).toHaveLength(0);
	});
});
