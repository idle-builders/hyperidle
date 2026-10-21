import type {
	ActionDeclaration,
	ActionResult,
	DOCUMENT_ACTIONS,
	PLATFORM_ACTIONS,
	SESSION_ACTIONS,
	TASK_ACTIONS,
	THREAD_ACTIONS,
	USER_ACTIONS,
} from "@hyperidle/domain-model";

/** Every action the server runs at `POST /api/actions/<name>`, by name. */
type Actions = typeof THREAD_ACTIONS &
	typeof TASK_ACTIONS &
	typeof DOCUMENT_ACTIONS &
	typeof USER_ACTIONS &
	typeof SESSION_ACTIONS &
	typeof PLATFORM_ACTIONS;
export type ActionName = keyof Actions;
type Parts<D> = D extends ActionDeclaration<infer I, infer O> ? { input: I; output: O } : never;
export type InputOf<N extends ActionName> = Parts<Actions[N]>["input"];
export type OutputOf<N extends ActionName> = Parts<Actions[N]>["output"];

declare global {
	interface Window {
		/** Set by the desktop app's preload. */
		__HYPERIDLE__?: { readonly apiKey: string };
	}
}

// @lore: the key must equal the server's HYPERIDLE_API_KEY; a mismatch is a bare 401. Dev falls back to the server's own laptop default.
function apiKey(): string {
	return (
		window.__HYPERIDLE__?.apiKey ??
		import.meta.env.VITE_HYPERIDLE_API_KEY ??
		(import.meta.env.DEV ? "hyperidle-dev-local" : "")
	);
}

/** POST with the API key; the one way this app talks to the server. */
export function post(path: string, body?: unknown): Promise<Response> {
	return fetch(path, {
		method: "POST",
		headers: { "X-API-Key": apiKey(), "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

/** Run one action. A refusal outside the action (bad key, bad input) comes back as a problem too. */
export async function call<N extends ActionName>(
	name: N,
	input: InputOf<N>,
): Promise<ActionResult<OutputOf<N>>> {
	const res = await post(`/api/actions/${name}`, input);
	const body = (await res.json()) as ActionResult<OutputOf<N>> | { error?: string; code?: string };
	if ("ok" in body) return body;
	return {
		ok: false,
		problems: [{ code: body.code ?? `http_${res.status}`, message: body.error ?? res.statusText }],
	};
}
