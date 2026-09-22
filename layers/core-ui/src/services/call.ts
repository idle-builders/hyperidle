/**
 * call — the UI's one door onto the action list. `TASK_ACTIONS &
 * THREAD_ACTIONS & DOCUMENT_ACTIONS` today; grows per item as more objects
 * get their own action list. `POST /api/actions/<name>`, the same door a
 * human's client and an agent's MCP tool both use.
 */

import type {
	ActionResult,
	DOCUMENT_ACTIONS,
	TASK_ACTIONS,
	THREAD_ACTIONS,
} from "@hyperidle/domain-model";
import type { z } from "zod";
import { apiFetch } from "./api-fetch.js";

type Actions = typeof TASK_ACTIONS & typeof THREAD_ACTIONS & typeof DOCUMENT_ACTIONS;

export async function call<N extends keyof Actions>(
	name: N,
	input: z.input<Actions[N]["input"]>,
	signal?: AbortSignal,
): Promise<ActionResult<z.output<Actions[N]["output"]>>> {
	const res = await apiFetch(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
		signal,
	});
	return (await res.json()) as ActionResult<z.output<Actions[N]["output"]>>;
}
