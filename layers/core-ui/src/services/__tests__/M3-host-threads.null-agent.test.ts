/**
 * M3 RED — host-threads service: resolveOrCreateHostThread with null agentId
 * sends single participant (D1).
 *
 * These tests FAIL until:
 *  - PLACEHOLDER_AGENT_PARTICIPANT_ID constant is deleted from host-threads.ts
 *  - resolveOrCreateHostThread signature changes to agentParticipantId: string | null
 *  - Thread creation body uses participants: agentParticipantId ? [founderId, agentId] : [founderId]
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOrCreateHostThread } from "../../services/host-threads";

function makeThreadListResponse(threadList: Array<{ id: string }>): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ threads: threadList }),
	} as unknown as Response;
}

function makeCreateThreadResponse(id: string): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ thread: { id } }),
	} as unknown as Response;
}

describe("M3 — resolveOrCreateHostThread with null agentParticipantId (D1)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sends single-participant array when agentParticipantId is null", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([]))
			.mockResolvedValueOnce(makeCreateThreadResponse("thread-created-001"));

		await resolveOrCreateHostThread("task", "task-1", "founder-id", null);

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const [, postOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
		const body = JSON.parse(postOptions.body as string) as {
			participants: string[];
		};

		expect(body.participants).toEqual(["founder-id"]);
		expect(body.participants).not.toContain("agent-unassigned");
		expect(body.participants).toHaveLength(1);
	});

	it("sends two-participant array when agentParticipantId is a real agent id", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([]))
			.mockResolvedValueOnce(makeCreateThreadResponse("thread-created-002"));

		await resolveOrCreateHostThread("task", "task-2", "founder-id", "agent-real-1");

		const [, postOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
		const body = JSON.parse(postOptions.body as string) as {
			participants: string[];
		};

		expect(body.participants).toContain("founder-id");
		expect(body.participants).toContain("agent-real-1");
		expect(body.participants).toHaveLength(2);
		expect(body.participants).not.toContain("agent-unassigned");
	});

	it("never sends 'agent-unassigned' in participants under any circumstances", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([]))
			.mockResolvedValueOnce(makeCreateThreadResponse("thread-no-sentinel"));

		await resolveOrCreateHostThread("task", "task-1", "founder-id", null);

		const [, postOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
		const body = JSON.parse(postOptions.body as string) as {
			participants: string[];
		};

		expect(body.participants).not.toContain("agent-unassigned");
	});

	it("PLACEHOLDER_AGENT_PARTICIPANT_ID is NOT exported from host-threads", async () => {
		// Import the module and check the export does not exist
		const module = await import("../../services/host-threads");
		expect((module as Record<string, unknown>).PLACEHOLDER_AGENT_PARTICIPANT_ID).toBeUndefined();
	});
});
