import type {
	ActionResult,
	DOCUMENT_ACTIONS,
	PLATFORM_ACTIONS,
	SESSION_ACTIONS,
	TASK_ACTIONS,
	THREAD_ACTIONS,
	USER_ACTIONS,
} from "@hyperidle/domain-model";
import type { z } from "zod";
import { apiFetch } from "./api-fetch.js";

type Actions = typeof TASK_ACTIONS &
	typeof THREAD_ACTIONS &
	typeof DOCUMENT_ACTIONS &
	typeof SESSION_ACTIONS &
	typeof PLATFORM_ACTIONS &
	typeof USER_ACTIONS;

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
