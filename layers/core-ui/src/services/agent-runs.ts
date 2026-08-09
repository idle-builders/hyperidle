/**
 * The browser's door into `agent-orchestration`'s run state.
 *
 * @lore AU26 J4 (founder, verbatim): *"its all for UI? thats why orchestration
 * now has an api so that the ui can get the agent run state from the
 * orchestration directly and combine this information in the ui instead of in
 * the core api service."* Core-api no longer decorates its responses with run
 * fields; every screen that shows run state fetches it here and combines it with
 * core's own data client-side. What the user sees is unchanged — only which
 * Layer answered which half.
 *
 * Six call sites: the bet view (latest outcome per task), the task view (a
 * task's runs), the agent profile and the team page (an agent's runs), and
 * Settings → Agents plus the recipient picker (active counts).
 */

import type {
	AgentRunActiveCountsResponse,
	AgentRunLatestOutcomesResponse,
	AgentRunSummary,
	AgentRunsResponse,
} from "@hyperidle/domain-model";
import { apiFetch } from "./api-fetch.js";

const BASE = "/api/agent-orchestration";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
	const res = await apiFetch(url, signal ? { signal } : {});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return (await res.json()) as T;
}

/** Every run on a task, newest first. */
export async function fetchRunsByTaskId(
	taskId: string,
	signal?: AbortSignal,
): Promise<ReadonlyArray<AgentRunSummary>> {
	const body = await getJson<AgentRunsResponse>(
		`${BASE}/runs?task_id=${encodeURIComponent(taskId)}`,
		signal,
	);
	return body.runs;
}

/** Every run of the given agents, newest first across all of them. */
export async function fetchRunsByAgentIds(
	agentIds: ReadonlyArray<string>,
	signal?: AbortSignal,
): Promise<ReadonlyArray<AgentRunSummary>> {
	if (agentIds.length === 0) return [];
	const body = await getJson<AgentRunsResponse>(
		`${BASE}/runs?agent_ids=${encodeURIComponent(agentIds.join(","))}`,
		signal,
	);
	return body.runs;
}

/**
 * Active run counts keyed by agent id. Agents with none are absent from the map.
 * Omit `agentIds` for every agent.
 */
export async function fetchActiveRunCounts(
	agentIds?: ReadonlyArray<string>,
	signal?: AbortSignal,
): Promise<Readonly<Record<string, number>>> {
	if (agentIds !== undefined && agentIds.length === 0) return {};
	const query =
		agentIds === undefined ? "" : `?agent_ids=${encodeURIComponent(agentIds.join(","))}`;
	const body = await getJson<AgentRunActiveCountsResponse>(
		`${BASE}/runs/active-counts${query}`,
		signal,
	);
	return body.counts;
}

/**
 * The outcome of the newest run per task. A task with no run is absent from the
 * map, which callers render as `null` — the same shape core-api used to serve as
 * `latestSessionOutcome`.
 */
export async function fetchLatestRunOutcomes(
	taskIds: ReadonlyArray<string>,
	signal?: AbortSignal,
): Promise<Readonly<Record<string, string | null>>> {
	if (taskIds.length === 0) return {};
	const body = await getJson<AgentRunLatestOutcomesResponse>(
		`${BASE}/runs/latest-outcomes?task_ids=${encodeURIComponent(taskIds.join(","))}`,
		signal,
	);
	return body.outcomes;
}
