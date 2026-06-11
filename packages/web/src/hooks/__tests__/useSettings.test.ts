/**
 * M3 RED — useSettings hook: fetches /api/settings, composes with local appearance (B3).
 *
 * These tests FAIL until:
 *  - packages/web/src/hooks/useSettings.ts is created
 *  - The hook fetches GET /api/settings and returns { settings, status, error, save, retry }
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "../../hooks/useSettings";

type ApiSettingsResponse = {
	profile: { name: string; email: string; avatarUrl: string | null };
	// @lore U1: renamed from `products` to `teams`
	teams: Array<{ id: string; name: string; active: boolean }>;
	/** @lore P2: renamed from agents. */
	users: Array<{ id: string; name: string; autonomyLevel: string; paused: boolean }>;
	notifications: {
		reviewAlerts: boolean;
		costAlerts: boolean;
		blockerAlerts: boolean;
		quietHoursStart: string;
		quietHoursEnd: string;
		// @lore U1: renamed from mutedProducts
		mutedTeams: string[];
	};
};

const FIXTURE_API_SETTINGS: ApiSettingsResponse = {
	profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
	teams: [
		{ id: "t1", name: "Team A", active: true },
		{ id: "t2", name: "Team B", active: false },
	],
	users: [{ id: "a1", name: "Builder", autonomyLevel: "supervised", paused: false }],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedTeams: [],
	},
};

function makeOkResponse(data: ApiSettingsResponse): Response {
	return new Response(JSON.stringify(data), { status: 200 });
}

function makeErrorResponse(status: number): Response {
	return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), { status });
}

describe("useSettings (M3 B3)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state", () => {
		fetchSpy.mockImplementation(() => new Promise(() => {}));

		const { result } = renderHook(() => useSettings());

		expect(result.current.status).toBe("loading");
		expect(result.current.settings).toBeNull();
	});

	it("returns settings on success with profile, teams, users, notifications", async () => {
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_API_SETTINGS));

		const { result } = renderHook(() => useSettings());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(result.current.settings).not.toBeNull();
		expect(result.current.settings?.profile.name).toBe("Test Founder");
		expect(result.current.settings?.teams).toHaveLength(2);
		expect(result.current.settings?.users).toHaveLength(1);
		expect(result.current.settings?.notifications.reviewAlerts).toBe(true);
	});

	it("fetches /api/settings endpoint", async () => {
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_API_SETTINGS));

		renderHook(() => useSettings());

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalled();
		});

		const [url] = fetchSpy.mock.calls[0] as [string];
		expect(url).toContain("/api/settings");
	});

	it("returns error status on non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce(makeErrorResponse(401));

		const { result } = renderHook(() => useSettings());

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});

		expect(result.current.settings).toBeNull();
		expect(result.current.error).not.toBeNull();
	});

	it("composes appearance from local state (not from API response)", async () => {
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_API_SETTINGS));

		const { result } = renderHook(() => useSettings());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		// appearance field must be present (composed client-side)
		expect(result.current.settings?.appearance).toBeDefined();
		expect(result.current.settings?.appearance.theme).toBeDefined();
	});

	it("save() is a function that can be called", async () => {
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_API_SETTINGS));

		const { result } = renderHook(() => useSettings());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(typeof result.current.save).toBe("function");
	});

	it("retry() is a function that can be called", async () => {
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_API_SETTINGS));

		const { result } = renderHook(() => useSettings());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(typeof result.current.retry).toBe("function");
	});

	it("settings profile does NOT contain the hardcoded 'founder@hyperidle.com' email", async () => {
		// DEFAULT_SETTINGS had 'founder@hyperidle.com' hardcoded — after the swap,
		// this email must come from the API, not from a constant
		const apiSettings = {
			...FIXTURE_API_SETTINGS,
			profile: { name: "Test Founder", email: "from-api@hyperidle.dev", avatarUrl: null },
		};
		fetchSpy.mockResolvedValueOnce(makeOkResponse(apiSettings));

		const { result } = renderHook(() => useSettings());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		// Email must match what the API returned, not the old hardcoded default
		expect(result.current.settings?.profile.email).toBe("from-api@hyperidle.dev");
		expect(result.current.settings?.profile.email).not.toBe("founder@hyperidle.com");
	});
});
