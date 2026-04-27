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
 * @lore L10: the response body is intentionally NOT captured beyond a
 * 200-char preview for error messages. Anthropic's error envelopes are
 * small JSON objects — we surface `error.type`/`error.message` only.
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
}

const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

interface AnthropicError {
	error?: { type?: string; message?: string };
}

function isAnthropicError(value: unknown): value is AnthropicError {
	return typeof value === "object" && value !== null && "error" in value;
}

export async function pingAnthropic(opts: PingOptions): Promise<ProviderPingResult> {
	const fetcher = opts.fetcher ?? globalThis.fetch.bind(globalThis);
	const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
	const model = opts.model ?? DEFAULT_MODEL;

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
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, status: 0, message: `network error: ${message}` };
	}

	if (res.ok) {
		return { ok: true, status: res.status, message: "ok" };
	}

	let detail = `HTTP ${res.status}`;
	try {
		const body: unknown = await res.json();
		if (isAnthropicError(body) && body.error) {
			const t = typeof body.error.type === "string" ? body.error.type : "error";
			const m = typeof body.error.message === "string" ? body.error.message : "";
			detail = m ? `${t}: ${m}` : t;
		}
	} catch {
		// Body wasn't JSON; keep the HTTP-status message.
	}
	return { ok: false, status: res.status, message: detail.slice(0, 200) };
}
