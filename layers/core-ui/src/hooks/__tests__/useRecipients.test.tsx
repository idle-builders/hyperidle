/**
 * useRecipients hook.
 *
 * @lore call("search_users", {status, name?}) is the recipient list door; call is mocked directly, routed by action name.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock("../../services/call.js", () => ({ call: callMock }));

import { useRecipients } from "../useRecipients.js";

interface MockUserRow {
	id: string;
	kind: "human" | "ai";
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

function mkUserRow(overrides: Partial<MockUserRow> = {}): MockUserRow {
	return {
		id: overrides.id ?? "agent-1",
		kind: overrides.kind ?? "ai",
		name: overrides.name ?? "Test Agent",
		role: overrides.role ?? "builder",
		status: overrides.status ?? "active",
		avatarUrl: overrides.avatarUrl ?? null,
	};
}

const MOCK_USERS: MockUserRow[] = [
	mkUserRow({ id: "agent-builder", name: "Builder Bot", kind: "ai" }),
	mkUserRow({ id: "agent-growth", name: "Growth Engine", kind: "ai" }),
	mkUserRow({ id: "user-founder", name: "Founder", kind: "human", role: "founder" }),
];

/** Only `agent-builder` has an active session. */
const MOCK_ACTIVE_SESSIONS: MockSessionRow[] = [
	{ id: "session-1", agentId: "agent-builder", state: "active" },
];

/** Route the two actions the hook calls: `search_users` and `search_sessions`. */
function setupCall(
	users: MockUserRow[],
	activeSessions: MockSessionRow[] = MOCK_ACTIVE_SESSIONS,
): void {
	callMock.mockImplementation((name: string) => {
		if (name === "search_sessions") return Promise.resolve({ ok: true, data: activeSessions });
		return Promise.resolve({ ok: true, data: users });
	});
}

describe("useRecipients", () => {
	beforeEach(() => {
		callMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("transitions loading → ready and exposes mapped recipients", async () => {
		setupCall(MOCK_USERS);

		const { result } = renderHook(() => useRecipients());
		expect(result.current.status).toBe("loading");

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.recipients.length).toBe(3);
		expect(result.current.recipients[0]!.id).toBe("agent-builder");
		// human/ai maps to the door's user/agent recipient kind.
		expect(result.current.recipients.find((r) => r.id === "agent-builder")?.kind).toBe("agent");
		expect(result.current.recipients.find((r) => r.id === "user-founder")?.kind).toBe("user");
	});

	it("passes the query as search_users' name filter", async () => {
		setupCall([]);

		const { result } = renderHook(() => useRecipients("builder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(callMock).toHaveBeenCalledWith(
			"search_users",
			expect.objectContaining({ status: "active", name: "builder" }),
			expect.anything(),
		);
	});

	it("surfaces error when the action fails", async () => {
		callMock.mockImplementation((name: string) => {
			if (name === "search_sessions") return Promise.resolve({ ok: true, data: [] });
			return Promise.resolve({ ok: false, problems: [{ code: "server_error", message: "Boom" }] });
		});

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).not.toBeNull();
	});

	it("surfaces error when the door throws", async () => {
		callMock.mockRejectedValue(new TypeError("Network error"));

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).not.toBeNull();
	});

	it("derives hasActiveSession from the active session rows", async () => {
		setupCall(MOCK_USERS);

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const builder = result.current.recipients.find((r) => r.id === "agent-builder");
		expect(builder?.hasActiveSession).toBe(true);

		const growth = result.current.recipients.find((r) => r.id === "agent-growth");
		expect(growth?.hasActiveSession).toBe(false);
	});

	it("degrades to no active sessions when search_sessions answers a problem", async () => {
		callMock.mockImplementation((name: string) => {
			if (name === "search_sessions") {
				return Promise.resolve({
					ok: false,
					problems: [{ code: "server_error", message: "Boom" }],
				});
			}
			return Promise.resolve({ ok: true, data: MOCK_USERS });
		});

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(result.current.recipients.every((r) => r.hasActiveSession === false)).toBe(true);
	});

	it("returns ready with empty recipients on empty response", async () => {
		setupCall([]);

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.recipients).toEqual([]);
	});
});
