/**
 * Q1 — AC2: useRecipients hook.
 *
 * Architecture plan §4.8: fetches GET /api/recipients?q=<query>.
 * Exposes status/recipients/error with client-side filtering for instant feedback.
 *
 * @lore BC6: `GET /api/agent-orchestration/runs/active-counts` is deleted; the
 * hook now calls `search_sessions({ state: "active" })` — `POST
 * /api/actions/search_sessions` — and counts the active rows per agent
 * itself, so `hasActiveSession` renders exactly as before. The stub below
 * routes by URL for exactly that reason.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecipients } from "../useRecipients.js";

interface MockRecipient {
	id: string;
	kind: "agent" | "user";
	name: string;
	role: string;
	status: string;
	avatarUrl: string | null;
}

interface MockSessionRow {
	id: string;
	agentId: string;
	state: string | null;
}

function mkRecipient(overrides: Partial<MockRecipient> = {}): MockRecipient {
	return {
		id: overrides.id ?? "agent-1",
		kind: overrides.kind ?? "agent",
		name: overrides.name ?? "Test Agent",
		role: overrides.role ?? "builder",
		status: overrides.status ?? "active",
		avatarUrl: overrides.avatarUrl ?? null,
	};
}

const MOCK_RECIPIENTS: MockRecipient[] = [
	mkRecipient({ id: "agent-builder", name: "Builder Bot", kind: "agent" }),
	mkRecipient({ id: "agent-growth", name: "Growth Engine", kind: "agent" }),
	mkRecipient({ id: "user-founder", name: "Founder", kind: "user", role: "founder" }),
];

/** Only `agent-builder` has an active session. */
const MOCK_ACTIVE_SESSIONS: MockSessionRow[] = [
	{ id: "session-1", agentId: "agent-builder", state: "active" },
];

/**
 * Route the two calls the hook makes: core-api's recipient list and
 * `search_sessions({ state: "active" })`.
 */
function stubFetch(
	recipients: MockRecipient[],
	activeSessions: MockSessionRow[] = MOCK_ACTIVE_SESSIONS,
): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn().mockImplementation((url: string) =>
		Promise.resolve({
			ok: true,
			json: () =>
				Promise.resolve(
					url === "/api/actions/search_sessions"
						? { ok: true, data: activeSessions }
						: { recipients },
				),
		}),
	);
	global.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

describe("useRecipients (Q1 §4.8)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC2: transitions loading → ready and exposes recipients
	it("transitions loading → ready and exposes mapped recipients", async () => {
		stubFetch(MOCK_RECIPIENTS);

		const { result } = renderHook(() => useRecipients());
		expect(result.current.status).toBe("loading");

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.recipients.length).toBe(3);
		expect(result.current.recipients[0]!.id).toBe("agent-builder");
	});

	// AC2: search query is passed to the fetch URL
	it("includes query param in fetch URL when query provided", async () => {
		const fetchMock = stubFetch([]);

		const { result } = renderHook(() => useRecipients("builder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const url = fetchMock.mock.calls
			.map((call) => call[0] as string)
			.find((u) => u.includes("/api/recipients"));
		expect(url).toContain("builder");
	});

	// AC2: error state when fetch fails
	it("surfaces error when fetch fails", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).not.toBeNull();
	});

	// AC2: network error
	it("surfaces error when network throws", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new TypeError("Network error")) as unknown as typeof fetch;

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).not.toBeNull();
	});

	// AC2 / BC6: hasActiveSession is derived from search_sessions' active rows
	it("derives hasActiveSession from the active session rows", async () => {
		stubFetch(MOCK_RECIPIENTS);

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const builder = result.current.recipients.find((r) => r.id === "agent-builder");
		expect(builder?.hasActiveSession).toBe(true);

		const growth = result.current.recipients.find((r) => r.id === "agent-growth");
		expect(growth?.hasActiveSession).toBe(false);
	});

	// BC6: a search_sessions failure degrades to "nobody is busy", not a failed picker
	it("degrades to no active sessions when search_sessions answers a problem", async () => {
		const fetchMock = vi.fn().mockImplementation((url: string) =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve(
						url === "/api/actions/search_sessions"
							? { ok: false, problems: [{ code: "server_error", message: "Boom" }] }
							: { recipients: MOCK_RECIPIENTS },
					),
			}),
		);
		global.fetch = fetchMock as unknown as typeof fetch;

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(result.current.recipients.every((r) => r.hasActiveSession === false)).toBe(true);
	});

	// AC2: empty recipients list returns ready with empty array
	it("returns ready with empty recipients on empty server response", async () => {
		stubFetch([]);

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.recipients).toEqual([]);
	});
});
