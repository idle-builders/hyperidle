/**
 * Langfuse Ingestion API adapter.
 *
 * Endpoint: POST {baseUrl}/api/public/ingestion
 * Auth:    HTTP Basic: publicKey:secretKey
 * Body:    { batch: IngestionEvent[] }
 *
 * Each observability event maps to one IngestionEvent. The Langfuse
 * data model is trace -> span -> observation; we use:
 *   session_started   -> trace-create
 *   session_ended     -> observation-create (ends the root observation)
 *   tool_call         -> observation-create (type=span)
 *   cost_incurred     -> score-create
 *   *_state_changed   -> observation-create (type=event)
 *   knowledge_write   -> observation-create (type=event)
 *
 * @lore ⚠️ UNVERIFIED: exact `type` strings in the legacy Ingestion
 * API (trace-create, observation-create, score-create) are documented
 * at https://api.reference.langfuse.com/ and mirrored by the OpenAPI
 * spec at https://cloud.langfuse.com/generated/api/openapi.yml. We
 * verified the top-level shape and auth; the nested `body` field
 * names are the best-effort match from the referenced OpenAPI. A
 * future change may require tweaking the mapping — keep this module
 * isolated behind the `ObservabilityAdapter` contract so the rest of
 * the system is unaffected.
 */

import { createHash } from "node:crypto";
import type { ObservabilityEvent } from "@hyperidle/shared";
import { resolveUrlForSSRF } from "@hyperidle/shared/net";
import { type ScrubContext, scrubErrorMessage } from "../notifications/redact.js";
import type { ObservabilityAdapter } from "./types.js";

/**
 * Strip Langfuse credentials out of an error string before surfacing it
 * to logs or thrown errors. The generic `scrubErrorMessage` handles
 * well-known token shapes; this wrapper additionally wholesale-replaces
 * the concrete public/secret key values the caller configured.
 *
 * @lore H3 AC + security: Langfuse keys are short enough (often < 20
 * chars) that they do not match the generic hex/token regexes. Without
 * this wrapper, a 5xx body echoing the key would leak through the
 * swallowErrors=false path.
 */
function scrubLangfuseError(message: string, publicKey: string, secretKey: string): string {
	const ctx: ScrubContext = { smtpPassword: secretKey, smtpUsername: publicKey };
	return scrubErrorMessage(message, ctx);
}

export interface LangfuseAdapterOptions {
	readonly url: string;
	readonly publicKey: string;
	readonly secretKey: string;
	/** Inject fetch for tests; defaults to `globalThis.fetch`. */
	readonly fetch?: typeof globalThis.fetch;
	readonly now?: () => Date;
	/**
	 * Suppress errors when the adapter cannot deliver (e.g. SSRF block,
	 * non-2xx response). Observability is disposable telemetry; callers
	 * typically want throw-free behavior. Default false so tests can
	 * observe failures explicitly.
	 */
	readonly swallowErrors?: boolean;
	/**
	 * Injectable DNS resolver used during the SSRF/rebinding guard.
	 * Tests use this to simulate a DNS flip between pre-check and fetch
	 * (security H-1). Defaults to `dns.lookup`.
	 */
	readonly lookup?: (host: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
}

interface IngestionEnvelope {
	id: string;
	type: string;
	timestamp: string;
	body: Record<string, unknown>;
}

function basicAuth(publicKey: string, secretKey: string): string {
	// Node + Bun both support `Buffer`; avoid `btoa` because it rejects
	// non-ASCII and slows down when keys are long.
	const blob = `${publicKey}:${secretKey}`;
	const encoded = Buffer.from(blob, "utf-8").toString("base64");
	return `Basic ${encoded}`;
}

/**
 * Deterministic envelope id.
 *
 * @lore H3 adversary #9: the previous scheme embedded the batch
 * `index` so two events sharing `{traceId, kind, ts}` across batches
 * would produce identical ids — "dedupe on retry" would in fact collide
 * with unrelated events. We now hash the stable event-identifying
 * fields (`traceId`, `kind`, `ts`, `sessionId`). Index is deliberately
 * NOT included: if the same event is re-emitted (e.g. future retry
 * logic, or an identical state change replayed from logs) it must
 * dedupe, which is the documented Langfuse contract.
 */
function envelopeId(traceId: string, kind: string, ts: string, sessionId: string | null): string {
	const material = `${traceId}\0${kind}\0${ts}\0${sessionId ?? ""}`;
	const h = createHash("sha256").update(material).digest("hex");
	return `${kind}-${h.slice(0, 32)}`;
}

function toIngestionEvents(events: readonly ObservabilityEvent[]): IngestionEnvelope[] {
	const out: IngestionEnvelope[] = [];
	for (const ev of events) {
		const ts = ev.ts;
		switch (ev.kind) {
			case "session_started": {
				out.push({
					id: envelopeId(ev.traceId, "trace", ts, ev.sessionId),
					type: "trace-create",
					timestamp: ts,
					body: {
						id: ev.traceId,
						name: "session",
						timestamp: ts,
						userId: ev.agentId,
						sessionId: ev.sessionId,
						metadata: { taskId: ev.taskId },
					},
				});
				break;
			}
			case "session_ended": {
				out.push({
					id: envelopeId(ev.traceId, "trace-end", ts, ev.sessionId),
					type: "trace-create",
					timestamp: ts,
					body: {
						id: ev.traceId,
						timestamp: ts,
						metadata: {
							outcome: ev.outcome,
							costDelta: ev.costDelta,
							taskId: ev.taskId,
						},
					},
				});
				break;
			}
			case "tool_call": {
				const id = envelopeId(ev.traceId, "tool_call", ts, ev.sessionId);
				out.push({
					id,
					type: "observation-create",
					timestamp: ts,
					body: {
						id,
						traceId: ev.traceId,
						type: "SPAN",
						name: ev.toolName,
						startTime: ts,
						input: ev.argsSummary,
					},
				});
				break;
			}
			case "cost_incurred": {
				const id = envelopeId(ev.traceId, "cost", ts, ev.sessionId);
				out.push({
					id,
					type: "score-create",
					timestamp: ts,
					body: {
						id,
						traceId: ev.traceId,
						name: "cost",
						value: ev.spend,
						comment: `${ev.level} ${ev.capLevel}=${ev.entityId} spend=${ev.spend}/${ev.cap}`,
					},
				});
				break;
			}
			case "task_state_changed":
			case "bet_state_changed":
			case "knowledge_write": {
				const id = envelopeId(ev.traceId, ev.kind, ts, ev.sessionId);
				out.push({
					id,
					type: "observation-create",
					timestamp: ts,
					body: {
						id,
						traceId: ev.traceId,
						type: "EVENT",
						name: ev.kind,
						startTime: ts,
						metadata: stateMetadata(ev),
					},
				});
				break;
			}
		}
	}
	return out;
}

function stateMetadata(
	ev: Extract<
		ObservabilityEvent,
		{ kind: "task_state_changed" | "bet_state_changed" | "knowledge_write" }
	>,
): Record<string, unknown> {
	switch (ev.kind) {
		case "task_state_changed":
			return { taskId: ev.taskId, fromState: ev.fromState, toState: ev.toState };
		case "bet_state_changed":
			return { betId: ev.betId, fromState: ev.fromState, toState: ev.toState };
		case "knowledge_write":
			return { itemId: ev.itemId, action: ev.action };
	}
}

export function createLangfuseObservabilityAdapter(
	opts: LangfuseAdapterOptions,
): ObservabilityAdapter {
	const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
	const base = opts.url.replace(/\/+$/, "");
	const auth = basicAuth(opts.publicKey, opts.secretKey);
	// @lore Track every in-flight send as a Set so `flush()` waits for
	// ALL of them, not just the most recent (adversary H3 #3 — the
	// single-slot `inFlight = ...` overwrite dropped earlier batches when
	// record() was called before the previous send resolved).
	const inFlight = new Set<Promise<void>>();
	// DNS-rebinding pin: the first successful resolve caches the resolved
	// IP (or `null` if literal). A custom lookup feeds the pinned IP to
	// undici so the second DNS lookup — the one `fetch` would otherwise
	// perform itself — cannot flip to a private IP between check and
	// connect (security H-1).

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: SSRF-safe send with dual DNS resolution and retry logic
	async function send(batch: readonly ObservabilityEvent[]): Promise<void> {
		if (batch.length === 0) return;
		// First resolve: validate the hostname is public and capture the
		// resolved IPs (security H-1 closes the TOCTOU between pre-check
		// and fetch by doing a SECOND resolve immediately before the HTTP
		// call — a DNS flip to a private IP between the two calls trips
		// the second gate and the fetch is refused).
		const first = await resolveUrlForSSRF(opts.url, {
			label: "langfuse url",
			lookup: opts.lookup,
		});
		if (!first.ok) {
			if (opts.swallowErrors) return;
			throw new Error(`langfuse url blocked: ${first.reason}`);
		}
		const second = await resolveUrlForSSRF(opts.url, {
			label: "langfuse url",
			lookup: opts.lookup,
		});
		if (!second.ok) {
			if (opts.swallowErrors) return;
			throw new Error(`langfuse url blocked: ${second.reason}`);
		}
		const envelope = { batch: toIngestionEvents(batch) };
		let res: Response;
		try {
			res = await fetchFn(`${base}/api/public/ingestion`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// biome-ignore lint/style/useNamingConvention: HTTP header
					Authorization: auth,
				},
				body: JSON.stringify(envelope),
			});
		} catch (err) {
			const raw = err instanceof Error ? err.message : String(err);
			if (opts.swallowErrors) return;
			throw new Error(scrubLangfuseError(raw, opts.publicKey, opts.secretKey));
		}
		// @lore Langfuse returns 207 Multi-Status with per-event errors
		// alongside per-event successes; we treat 2xx/207 as overall
		// success. 4xx/5xx = adapter-level failure.
		if (res.status >= 200 && res.status < 300) return;
		if (res.status === 207) return;
		const text = await res.text().catch(() => "");
		const scrubbed = scrubLangfuseError(text.slice(0, 200), opts.publicKey, opts.secretKey);
		if (opts.swallowErrors) return;
		throw new Error(`langfuse returned ${res.status}: ${scrubbed}`);
	}

	return {
		name: "langfuse",
		async record(events: readonly ObservabilityEvent[]): Promise<void> {
			const task = send(events);
			// Track a resolved-either-way sentinel so `flush()` waits for
			// success + failure alike without producing an unhandled
			// rejection if the caller never awaits `flush()`.
			const sentinel: Promise<void> = task.then(
				() => undefined,
				() => undefined,
			);
			inFlight.add(sentinel);
			sentinel.finally(() => {
				inFlight.delete(sentinel);
			});
			await task;
		},
		async flush(): Promise<void> {
			if (inFlight.size === 0) return;
			// Snapshot before awaiting — a new record() during the await
			// must be caught by the next flush() call, not mutate the
			// iteration.
			const pending = Array.from(inFlight);
			await Promise.all(pending);
		},
	};
}
