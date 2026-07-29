/**
 * AU21 §9 Increment 6 (Decision D) — `AgentOrchestrationPort`: Application-
 * layer composition root, mirroring `core-api-port-composition.ts`'s exact
 * pattern (in-process/network transport duality onto `hc<AppType>`) for the
 * OPPOSITE-direction door — agent-orchestration's own read surface, backed
 * by `agent-orchestration-sessions-routes.ts` (mounted at
 * `/api/agent-orchestration` in `app.ts`; see that route file's header for
 * why the HTTP hosting lives in core-api even though the data/query logic is
 * agent-orchestration's own).
 *
 * Unlike `CoreApiPort` (whose callers explicitly wrap the transport with
 * `withActorTransport` to attribute a write to a specific calling agent),
 * this door carries no per-agent actor semantics — it is a pure read, so the
 * `X-API-Key` credential is injected internally by `buildAgentOrchestrationPort`
 * itself, read at call-time from `process.env.HYPERIDLE_API_KEY` (same
 * env var the route's own auth middleware checks).
 */

import type {
	AgentOrchestrationPort,
	AgentOrchestrationSessionHistoryEntry,
	AgentOrchestrationTransport,
} from "@hyperidle/api-contract";
import type { Hono } from "hono";
import { hc } from "hono/client";
import type { AppType } from "../schemas/index.js";

/**
 * Hand-typed mirror of the real core-api `hc` client shape for the
 * `/agent-orchestration` mount — same "one audited cast recovering a usable
 * shape" idiom as `core-api-port-composition.ts`'s `buildCoreApiHcClient`.
 */
interface AgentOrchestrationHcClient {
	readonly "agent-orchestration": {
		readonly sessions: {
			$get(args: {
				readonly query: { readonly sourceKind: string; readonly sourceId: string };
			}): Promise<Response>;
			readonly ":sessionId": {
				readonly cost: {
					$get(args: { readonly param: { readonly sessionId: string } }): Promise<Response>;
				};
			};
		};
	};
}

/** Placeholder origin for hc's internal URL construction — see `core-api-port-composition.ts`'s twin. */
const SEAM_PLACEHOLDER_BASE_URL = "http://agent-orchestration.internal/api";

function buildAgentOrchestrationHcClient(fetchAdapter: typeof fetch): AgentOrchestrationHcClient {
	const client: unknown = hc<AppType>(SEAM_PLACEHOLDER_BASE_URL, { fetch: fetchAdapter });
	return client as AgentOrchestrationHcClient;
}

/** Throws a uniform, method-attributed error for a non-2xx seam response. */
async function throwSeamError(method: string, res: Response): Promise<never> {
	const body = await res.text();
	throw new Error(`AgentOrchestrationPort.${method}: request failed (${res.status}): ${body}`);
}

/**
 * Wraps a transport so every request carries the internal `X-API-Key`
 * credential this door authenticates with — read at call-time (not at
 * wrap-time) so it always reflects the current environment, same as
 * `withActorTransport`'s own key-injection.
 */
function withApiKeyHeader(transport: AgentOrchestrationTransport): AgentOrchestrationTransport {
	return async (req: Request) => {
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		const headers = new Headers(req.headers);
		const apiKey = process.env.HYPERIDLE_API_KEY;
		if (apiKey) {
			headers.set("X-API-Key", apiKey);
		}
		const wrapped = new Request(req.url, { method: req.method, headers, body });
		return transport(wrapped);
	};
}

/**
 * Builds a real `AgentOrchestrationPort` wired to the given transport. The
 * transport decides WHERE the request actually goes (in-process `app.fetch`
 * or a real network `fetch`) — this factory only adapts the seam's single-
 * `Request` transport shape onto hc's two-argument `(url, init) => fetch`
 * shape, then internally attaches the `X-API-Key` credential.
 */
export function buildAgentOrchestrationPort(
	transport: AgentOrchestrationTransport,
): AgentOrchestrationPort {
	const authedTransport = withApiKeyHeader(transport);
	const fetchAdapter: typeof fetch = (input, init) => authedTransport(new Request(input, init));
	const client = buildAgentOrchestrationHcClient(fetchAdapter);

	return {
		sessions: {
			async getSessionCostBySessionId(sessionId: string): Promise<number | null | undefined> {
				const res = await client["agent-orchestration"].sessions[":sessionId"].cost.$get({
					param: { sessionId },
				});
				if (res.status === 404) return undefined;
				if (!res.ok) return throwSeamError("sessions.getSessionCostBySessionId", res);
				const body = (await res.json()) as { readonly costCents: number | null };
				return body.costCents;
			},

			async listSessionHistoryBySource(
				sourceKind: string,
				sourceId: string,
			): Promise<ReadonlyArray<AgentOrchestrationSessionHistoryEntry>> {
				const res = await client["agent-orchestration"].sessions.$get({
					query: { sourceKind, sourceId },
				});
				if (!res.ok) return throwSeamError("sessions.listSessionHistoryBySource", res);
				const body = (await res.json()) as {
					readonly entries: ReadonlyArray<AgentOrchestrationSessionHistoryEntry>;
				};
				return body.entries;
			},
		},
	};
}

/**
 * The in-process transport: core-api's own Hono app dispatches the request
 * directly via `app.fetch`, zero network hop — same shape as
 * `createInProcessCoreApiTransport`.
 */
export function createInProcessAgentOrchestrationTransport(app: Hono): AgentOrchestrationTransport {
	return async (req: Request) => app.fetch(req);
}

/**
 * The split/remote transport: a real network `fetch` against a real,
 * separately-running instance at `baseUrl` — same shape as
 * `createNetworkCoreApiTransport`, proving the same call site works whether
 * agent-orchestration's backing route is colocated or split out.
 */
export function createNetworkAgentOrchestrationTransport(
	baseUrl: string,
): AgentOrchestrationTransport {
	return async (req: Request) => {
		const seamUrl = new URL(req.url);
		const target = new URL(`${seamUrl.pathname}${seamUrl.search}`, baseUrl);
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		return fetch(target, { method: req.method, headers: req.headers, body });
	};
}

/**
 * Module-level registration point for the boot-time transport, mirroring
 * `core-api-port-composition.ts`'s `registerCoreApiTransport`/
 * `getRegisteredCoreApiTransport`. Registered once in production
 * (`server-factory.ts`'s `createServer`); `tasks.ts`'s sessions route reads
 * it via `getRegisteredAgentOrchestrationTransport()` on each request.
 */
let registeredTransport: AgentOrchestrationTransport | undefined;

export function registerAgentOrchestrationTransport(transport: AgentOrchestrationTransport): void {
	registeredTransport = transport;
}

export function getRegisteredAgentOrchestrationTransport(): AgentOrchestrationTransport {
	if (!registeredTransport) {
		throw new Error(
			"AgentOrchestrationPort transport not registered — call " +
				"registerAgentOrchestrationTransport(...) during application boot (or in a test, " +
				"before a route reads per-session cost through the seam).",
		);
	}
	return registeredTransport;
}
