/**
 * AB1 — useAgentProfile hook unit tests.
 *
 *
 * Covers:
 *   - Initial loading state when agentId is defined.
 *   - Successful fetch → data populated (identity, config, subscriptions).
 *   - null user row (agent not found) → a 404-shaped error.
 *   - Failed action result → error populated.
 *   - undefined agentId → no fetch, loading false, data null.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

import { useAgentProfile } from "../useAgentProfile.js";

const OPEN_USER_OK = {
	ok: true,
	data: {
		user: {
			id: "agent-1",
			kind: "ai",
			name: "Atlas Builder",
			role: "builder",
			status: "active",
			agentCategory: "team",
			createdAt: "2026-01-01T00:00:00.000Z",
			team: { id: "team-1", name: "HyperIdle Core" },
		},
		runsOn: [],
		runConfig: {
			harnessType: "claude-code",
			modelId: null,
			modelProvider: null,
			maxConcurrentSessions: 2,
			modelOptions: {},
		},
		documentIds: [{ slot: "agent_file", id: "ki_af_agent-1" }],
		folders: [],
		subscriptions: [
			{
				id: "sub-1",
				event: "task.changed",
				schedule: null,
				paused: false,
				documentId: null,
				nextRunAt: null,
			},
		],
		connections: null,
		inbox: null,
	},
};

describe("useAgentProfile", () => {
	beforeEach(() => {
		callMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state when agentId is defined", () => {
		callMock.mockImplementation(() => new Promise(() => {}));
		const { result } = renderHook(() => useAgentProfile("agent-1"));
		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();
	});

	it("returns data=null, loading=false when agentId is undefined", () => {
		const { result } = renderHook(() => useAgentProfile(undefined));
		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBeNull();
	});

	it("populates data on successful open_user", async () => {
		callMock.mockResolvedValue(OPEN_USER_OK);
		const { result } = renderHook(() => useAgentProfile("agent-1"));

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.data).toMatchObject({
			id: "agent-1",
			name: "Atlas Builder",
			teamName: "HyperIdle Core",
			harnessType: "claude-code",
			maxConcurrentSessions: 2,
			identityDocumentId: "ki_af_agent-1",
		});
		expect(result.current.data?.subscriptions).toHaveLength(1);
		expect(result.current.error).toBeNull();
	});

	it("calls open_user with the agent id", async () => {
		callMock.mockResolvedValue(OPEN_USER_OK);
		renderHook(() => useAgentProfile("agent-1"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("open_user", { id: "agent-1" });
		});
	});

	it("treats a null user row as a 404", async () => {
		callMock.mockResolvedValue({ ...OPEN_USER_OK, data: { ...OPEN_USER_OK.data, user: null } });
		const { result } = renderHook(() => useAgentProfile("missing"));

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.data).toBeNull();
		expect(result.current.httpStatus).toBe(404);
	});

	it("populates an error when the action result is not ok", async () => {
		callMock.mockResolvedValue({ ok: false, problems: [{ code: "boom", message: "boom" }] });
		const { result } = renderHook(() => useAgentProfile("agent-1"));

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
	});
});
