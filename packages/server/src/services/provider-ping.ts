/**
 * L10 — Anthropic provider ping for the API-key test step.
 *
 * Sends a 1-token `messages.create` call. Returns `{ ok: true }` on 2xx,
 * `{ ok: false, status, message }` on 4xx/5xx. NEVER stores or logs the
 * key. The fetcher is injectable so tests can substitute a fake without
 * hitting the network.
 *
 * @lore L10: per spec, this hits a real endpoint with `max_tokens: 1`.
 * The minimum-cost ping doubles as a credential check (401 vs 200) and
 * a model-availability check (404 → bad model id).
 *
 * @lore L10 S1: every ping is bounded by a 10s AbortController deadline.
 * A misbehaving upstream that holds the connection open is otherwise
 * indistinguishable from an unresponsive server and would block the UI.
 *
 * @lore L10 S6: error messages are mapped to a fixed dictionary keyed
 * on Anthropic's `error.type`. The upstream `error.message` body is
 * NEVER echoed back — it could contain partial credential fragments,
 * URLs, or attacker-controlled content from a compromised endpoint.
 */

export interface ProviderPingResult {
	readonly ok: boolean;
	readonly status: number;
	readonly message: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PingOptions {
	readonly key: string;
	readonly model?: string;
	readonly fetcher?: FetchLike;
	readonly endpoint?: string;
	/**
	 * Override the abort timeout for tests. Production uses
	 * `DEFAULT_TIMEOUT_MS`.
	 */
	readonly timeoutMs?: number;
}

const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-3-5-haiku-20241022";
const DEFAULT_TIMEOUT_MS = 10_000;

// S6: fixed error dictionary keyed on Anthropic's documented error
// types. Never reflect the upstream `error.message` to the wire.
const ERROR_MESSAGES: Record<string, string> = {
	authentication_error: "Authentication failed. Check the API key.",
	permission_error: "API key lacks permission for this endpoint.",
	not_found_error: "Model or endpoint not found.",
	rate_limit_error: "Rate limit exceeded. Try again shortly.",
	overloaded_error: "Provider is overloaded. Try again shortly.",
	api_error: "Provider returned an internal error.",
	invalid_request_error: "Request was rejected as invalid.",
};
const FALLBACK_ERROR_MESSAGE = "Provider returned an unknown error.";

interface AnthropicError {
	error?: { type?: string };
}

function isAnthropicError(value: unknown): value is AnthropicError {
	return typeof value === "object" && value !== null && "error" in value;
}

export async function pingAnthropic(opts: PingOptions): Promise<ProviderPingResult> {
	const fetcher = opts.fetcher ?? globalThis.fetch.bind(globalThis);
	const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
	const model = opts.model ?? DEFAULT_MODEL;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let res: Response;
	try {
		res = await fetcher(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": opts.key,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				max_tokens: 1,
				messages: [{ role: "user", content: "." }],
			}),
			signal: controller.signal,
		});
	} catch (err) {
		// Distinguish abort (timeout) from generic network errors but
		// don't echo the upstream-controlled message either way.
		const isAbort =
			err instanceof Error && (err.name === "AbortError" || controller.signal.aborted);
		return {
			ok: false,
			status: 0,
			message: isAbort ? "Provider request timed out." : "Network error.",
		};
	} finally {
		clearTimeout(timer);
	}

	if (res.ok) {
		return { ok: true, status: res.status, message: "ok" };
	}

	let errorType: string | null = null;
	try {
		const body: unknown = await res.json();
		if (isAnthropicError(body) && body.error && typeof body.error.type === "string") {
			errorType = body.error.type;
		}
	} catch {
		// Body wasn't JSON. Fall through to fallback message.
	}
	const message =
		(errorType !== null && ERROR_MESSAGES[errorType]) ||
		(errorType !== null && errorType.length > 0 ? FALLBACK_ERROR_MESSAGE : `HTTP ${res.status}`);
	return { ok: false, status: res.status, message };
}
