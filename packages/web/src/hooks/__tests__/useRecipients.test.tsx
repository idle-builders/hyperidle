/**
 * Q1 — AC2: useRecipients hook.
 *
 * Architecture plan §4.8: fetches GET /api/recipients?q=<query>.
 * Exposes status/recipients/error with client-side filtering for instant feedback.
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
	hasActiveSession: boolean;
	avatarUrl: string | null;
}

function mkRecipient(overrides: Partial<MockRecipient> = {}): MockRecipient {
	return {
		id: overrides.id ?? "agent-1",
		kind: overrides.kind ?? "agent",
		name: overrides.name ?? "Test Agent",
		role: overrides.role ?? "builder",
		status: overrides.status ?? "active",
		hasActiveSession: overrides.hasActiveSession ?? false,
		avatarUrl: overrides.avatarUrl ?? null,
	};
}

const MOCK_RECIPIENTS: MockRecipient[] = [
	mkRecipient({ id: "agent-builder", name: "Builder Bot", kind: "agent", hasActiveSession: true }),
	mkRecipient({ id: "agent-growth", name: "Growth Engine", kind: "agent" }),
	mkRecipient({ id: "user-founder", name: "Founder", kind: "user", role: "founder" }),
];

describe("useRecipients (Q1 §4.8)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC2: transitions loading → ready and exposes recipients
	it("transitions loading → ready and exposes mapped recipients", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ recipients: MOCK_RECIPIENTS }),
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useRecipients());
		expect(result.current.status).toBe("loading");

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.recipients.length).toBe(3);
		expect(result.current.recipients[0].id).toBe("agent-builder");
	});

	// AC2: search query is passed to the fetch URL
	it("includes query param in fetch URL when query provided", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ recipients: [] }),
		});
		global.fetch = fetchMock as unknown as typeof fetch;

		const { result } = renderHook(() => useRecipients("builder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/api/recipients");
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

	// AC2: hasActiveSession is forwarded from server response
	it("forwards hasActiveSession flag from server response", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ recipients: MOCK_RECIPIENTS }),
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const builder = result.current.recipients.find((r) => r.id === "agent-builder");
		expect(builder?.hasActiveSession).toBe(true);

		const growth = result.current.recipients.find((r) => r.id === "agent-growth");
		expect(growth?.hasActiveSession).toBe(false);
	});

	// AC2: empty recipients list returns ready with empty array
	it("returns ready with empty recipients on empty server response", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ recipients: [] }),
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useRecipients());
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.recipients).toEqual([]);
	});
});
