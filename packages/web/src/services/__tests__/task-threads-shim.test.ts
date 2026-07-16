/**
 * L18 — task-threads.ts re-export shim tests.
 *
 * AC coverage:
 *  - legacy postRequestMessage is the same function as postPlainHostMessage
 *  - legacy resolveOrCreateTaskThread delegates to resolveOrCreateHostThread with hostKind=task
 *
 * @lore M3 D2: PLACEHOLDER_AGENT_PARTICIPANT_ID removed from task-threads shim.
 * The sentinel "agent-unassigned" must NOT appear in any export. Callers use null.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postRequestMessage, resolveOrCreateTaskThread } from "../../services/task-threads";

// Mock apiFetch so task-threads.ts (via host-threads.ts) does not call global.fetch.
// Header injection is covered by api-fetch.test.ts.
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

function makeThreadListResponse(threadList: Array<{ id: string }>): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ threads: threadList }),
	} as unknown as Response;
}

function makePostMessageResponse(): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ message: { id: "msg-001" } }),
	} as unknown as Response;
}

describe("task-threads shim (L18)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("legacy postRequestMessage is the same function as postPlainHostMessage (POSTs with type=plain)", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-legacy";
		const text = "Legacy request text";
		const clientKey = "legacy-key-001";

		await postRequestMessage(threadId, text, clientKey);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toContain(`/api/threads/${threadId}/messages`);
		const body = JSON.parse(options.body as string) as {
			type: string;
			payload: { text: string };
			clientKey: string;
		};
		expect(body.type).toBe("plain");
		expect(body.payload.text).toBe(text);
		expect(body.clientKey).toBe(clientKey);
	});

	it("legacy resolveOrCreateTaskThread delegates to resolveOrCreateHostThread with hostKind=task", async () => {
		const EXISTING = "thread-task-existing";
		fetchSpy.mockResolvedValueOnce(makeThreadListResponse([{ id: EXISTING }]));

		const result = await resolveOrCreateTaskThread("task-legacy-1", "u-founder", "agent-1");

		expect(result).toBe(EXISTING);
		const [url] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
		expect(url).toContain("host_kind=task");
		expect(url).toContain("host_id=task-legacy-1");
	});

	it("PLACEHOLDER_AGENT_PARTICIPANT_ID is NOT exported from task-threads (M3 D2)", () => {
		// M3 D2: the sentinel must not be exported. Verify it is absent.
		const mod = { postRequestMessage, resolveOrCreateTaskThread } as Record<string, unknown>;
		expect(mod.PLACEHOLDER_AGENT_PARTICIPANT_ID).toBeUndefined();
	});
});
