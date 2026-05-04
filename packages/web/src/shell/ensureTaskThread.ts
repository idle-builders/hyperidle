/**
 * @lore L15: GET-then-POST lazy creation for the task's thread. No client
 * cache: invalidation is hard (server-side deletion, multi-tab edits) and the
 * round trip is one GET on first open. If perf becomes a concern, hoist into
 * a real query layer (React Query / SWR) that handles invalidation.
 */

export type EnsureTaskThreadResult =
	| { ok: true; threadId: string }
	| { ok: false; reason: "network" | "validation" | "forbidden" | "server" };

interface ThreadListShape {
	threads?: Array<{ id?: unknown; hostKind?: unknown; hostId?: unknown; lastActiveAt?: unknown }>;
}

interface ThreadCreateShape {
	thread?: { id?: unknown };
}

/**
 * @lore L15 (security MED): client-side allowlist for task IDs. Mirrors the
 * server's `z.string().min(1)` but tightens the shape to a URL-safe slug so a
 * malicious caller cannot smuggle path segments or query separators into the
 * `/api/threads?host_id=...` request. Server remains the source of truth.
 */
const TASK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function classify(status: number): "validation" | "forbidden" | "server" {
	if (status === 400) return "validation";
	if (status === 403) return "forbidden";
	return "server";
}

/**
 * Picks the most-recently-active task-hosted thread from a list response.
 *
 * @lore L15 (adversary CRITICAL): start with `null` not `-Infinity`, use
 * strict `>` not `>=` (so order ties keep the first match), and defensively
 * filter on `hostKind === "task" && hostId === taskId` in case the server
 * leaks unrelated rows.
 */
export function pickThreadId(json: ThreadListShape, taskId: string): string | null {
	const threads = json.threads ?? [];
	let bestId: string | null = null;
	let bestActive: number | null = null;
	for (const t of threads) {
		if (typeof t.id !== "string") continue;
		if (t.hostKind !== undefined && t.hostKind !== "task") continue;
		if (t.hostId !== undefined && t.hostId !== taskId) continue;
		const active = typeof t.lastActiveAt === "number" ? t.lastActiveAt : 0;
		if (bestActive === null || active > bestActive) {
			bestActive = active;
			bestId = t.id;
		}
	}
	return bestId;
}

function makeInitialClientKey(taskId: string): string {
	// 8-128 chars, URL-safe — matches server `clientKeySchema`.
	const rand =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	return `task-thread-init:${taskId}:${rand}`;
}

export async function ensureTaskThread(taskId: string): Promise<EnsureTaskThreadResult> {
	if (!TASK_ID_RE.test(taskId)) {
		return { ok: false, reason: "validation" };
	}
	let listResp: Response;
	try {
		listResp = await fetch(
			`/api/threads?host_kind=task&host_id=${encodeURIComponent(taskId)}`,
		);
	} catch {
		return { ok: false, reason: "network" };
	}
	if (!listResp.ok) return { ok: false, reason: classify(listResp.status) };
	const listJson = (await listResp.json()) as ThreadListShape;
	const existingId = pickThreadId(listJson, taskId);
	if (existingId !== null) return { ok: true, threadId: existingId };

	let createResp: Response;
	try {
		createResp = await fetch("/api/threads", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				hostKind: "task",
				hostId: taskId,
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: `Thread opened for task ${taskId}.` },
					clientKey: makeInitialClientKey(taskId),
				},
			}),
		});
	} catch {
		return { ok: false, reason: "network" };
	}
	if (!createResp.ok) return { ok: false, reason: classify(createResp.status) };
	const createJson = (await createResp.json()) as ThreadCreateShape;
	const newId = createJson.thread?.id;
	if (typeof newId !== "string" || newId.length === 0) {
		return { ok: false, reason: "server" };
	}
	return { ok: true, threadId: newId };
}
