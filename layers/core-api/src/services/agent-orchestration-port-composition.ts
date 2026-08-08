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
	AgentOrchestrationCreateBareRunRequest,
	AgentOrchestrationExplicitStartRequest,
	AgentOrchestrationExplicitStartResult,
	AgentOrchestrationExplicitStartView,
	AgentOrchestrationPort,
	AgentOrchestrationRunConfigPatch,
	AgentOrchestrationRunConfigView,
	AgentOrchestrationSessionActivityEntry,
	AgentOrchestrationSessionHistoryEntry,
	AgentOrchestrationSessionWireRow,
	AgentOrchestrationStoppedRun,
	AgentOrchestrationTransport,
	AgentOrchestrationWorkIntentInput,
	AgentOrchestrationWorkIntentKind,
	AgentOrchestrationWorkIntentReceipt,
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
				$get(args: { readonly param: { readonly sessionId: string } }): Promise<Response>;
				readonly activity: {
					$get(args: { readonly param: { readonly sessionId: string } }): Promise<Response>;
				};
			};
		};
		readonly intents: {
			$post(args: { readonly json: AgentOrchestrationWorkIntentInput }): Promise<Response>;
			readonly "explicit-start": {
				$post(args: { readonly json: AgentOrchestrationExplicitStartRequest }): Promise<Response>;
			};
		};
		readonly requests: {
			readonly "explicit-start": {
				$get(args: {
					readonly query: { readonly requestedBy: string; readonly idempotencyKey: string };
				}): Promise<Response>;
				readonly ":startId": {
					$get(args: { readonly param: { readonly startId: string } }): Promise<Response>;
				};
			};
			readonly "pending-intents": {
				$get(args: {
					readonly query: { readonly kind: AgentOrchestrationWorkIntentKind };
				}): Promise<Response>;
			};
		};
		readonly runs: {
			readonly abort: {
				$post(args: { readonly json: { readonly sessionId: string } }): Promise<Response>;
			};
			readonly "stop-for-tasks": {
				$post(args: {
					readonly json: { readonly taskIds: readonly string[]; readonly reason: "bet_killed" };
				}): Promise<Response>;
			};
			readonly "end-for-handoff": {
				$post(args: {
					readonly json: { readonly sessionId: string; readonly endedAt: string };
				}): Promise<Response>;
			};
			readonly bare: {
				$post(args: { readonly json: AgentOrchestrationCreateBareRunRequest }): Promise<Response>;
			};
			readonly "explicit-start": {
				readonly fail: {
					$post(args: {
						readonly json: { readonly startId: string; readonly failureCode: string };
					}): Promise<Response>;
				};
			};
		};
		readonly "run-config": {
			readonly ":agentId": {
				$get(args: { readonly param: { readonly agentId: string } }): Promise<Response>;
				$patch(args: {
					readonly param: { readonly agentId: string };
					readonly json: AgentOrchestrationRunConfigPatch;
				}): Promise<Response>;
			};
			readonly batch: {
				$post(args: { readonly json: { readonly agentIds: readonly string[] } }): Promise<Response>;
			};
		};
		readonly filesystems: {
			readonly ":id": {
				readonly injections: {
					readonly persist: {
						$post(args: {
							readonly param: { readonly id: string };
							readonly json: { readonly agentUserId: string };
						}): Promise<Response>;
					};
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

			/**
			 * @lore AU26 B1a (AC5(d)): returns the FULL 18-column wire row, never
			 * the seven-field decoration narrowing — `POST /api/sessions`'s 202
			 * branch returns whatever this yields verbatim. A 404 from the backing
			 * route is the "no such session" answer, not a seam failure, so it
			 * resolves `null` instead of throwing.
			 */
			async getById(sessionId: string): Promise<AgentOrchestrationSessionWireRow | null> {
				const res = await client["agent-orchestration"].sessions[":sessionId"].$get({
					param: { sessionId },
				});
				if (res.status === 404) return null;
				if (!res.ok) return throwSeamError("sessions.getById", res);
				const body = (await res.json()) as {
					readonly session: AgentOrchestrationSessionWireRow;
				};
				return body.session;
			},

			async getRecentActivity(
				sessionId: string,
			): Promise<ReadonlyArray<AgentOrchestrationSessionActivityEntry>> {
				const res = await client["agent-orchestration"].sessions[":sessionId"].activity.$get({
					param: { sessionId },
				});
				if (!res.ok) return throwSeamError("sessions.getRecentActivity", res);
				const body = (await res.json()) as {
					readonly entries: ReadonlyArray<AgentOrchestrationSessionActivityEntry>;
				};
				return body.entries;
			},
		},
		intents: {
			async submit(
				input: AgentOrchestrationWorkIntentInput,
			): Promise<AgentOrchestrationWorkIntentReceipt> {
				const res = await client["agent-orchestration"].intents.$post({ json: input });
				if (!res.ok) return throwSeamError("intents.submit", res);
				return (await res.json()) as AgentOrchestrationWorkIntentReceipt;
			},
			async createExplicitStart(
				input: AgentOrchestrationExplicitStartRequest,
			): Promise<AgentOrchestrationExplicitStartResult> {
				const res = await client["agent-orchestration"].intents["explicit-start"].$post({
					json: input,
				});
				if (!res.ok) return throwSeamError("intents.createExplicitStart", res);
				return (await res.json()) as AgentOrchestrationExplicitStartResult;
			},
		},
		requests: {
			async findExplicitStartByIdempotencyKey(
				requestedBy: string,
				idempotencyKey: string,
			): Promise<AgentOrchestrationExplicitStartView | null> {
				const res = await client["agent-orchestration"].requests["explicit-start"].$get({
					query: { requestedBy, idempotencyKey },
				});
				if (res.status === 404) return null;
				if (!res.ok) return throwSeamError("requests.findExplicitStartByIdempotencyKey", res);
				const body = (await res.json()) as { readonly start: AgentOrchestrationExplicitStartView };
				return body.start;
			},
			async findExplicitStartById(
				startId: string,
			): Promise<AgentOrchestrationExplicitStartView | null> {
				const res = await client["agent-orchestration"].requests["explicit-start"][":startId"].$get(
					{ param: { startId } },
				);
				if (res.status === 404) return null;
				if (!res.ok) return throwSeamError("requests.findExplicitStartById", res);
				const body = (await res.json()) as { readonly start: AgentOrchestrationExplicitStartView };
				return body.start;
			},
			async listPendingIntentsByKind(kind: AgentOrchestrationWorkIntentKind): Promise<
				ReadonlyArray<{
					readonly id: string;
					readonly sourceId: string;
					readonly requestedBy: string | null;
				}>
			> {
				const res = await client["agent-orchestration"].requests["pending-intents"].$get({
					query: { kind },
				});
				if (!res.ok) return throwSeamError("requests.listPendingIntentsByKind", res);
				const body = (await res.json()) as {
					readonly entries: ReadonlyArray<{
						readonly id: string;
						readonly sourceId: string;
						readonly requestedBy: string | null;
					}>;
				};
				return body.entries;
			},
		},
		runs: {
			async stopForTasks(
				taskIds: readonly string[],
				reason: "bet_killed",
			): Promise<ReadonlyArray<AgentOrchestrationStoppedRun>> {
				const res = await client["agent-orchestration"].runs["stop-for-tasks"].$post({
					json: { taskIds, reason },
				});
				if (!res.ok) return throwSeamError("runs.stopForTasks", res);
				const body = (await res.json()) as {
					readonly stopped: ReadonlyArray<AgentOrchestrationStoppedRun>;
				};
				return body.stopped;
			},
			async endForHandoff(sessionId: string, endedAt: string): Promise<void> {
				const res = await client["agent-orchestration"].runs["end-for-handoff"].$post({
					json: { sessionId, endedAt },
				});
				if (!res.ok) return throwSeamError("runs.endForHandoff", res);
			},
			async createBareRun(
				input: AgentOrchestrationCreateBareRunRequest,
			): Promise<AgentOrchestrationSessionWireRow> {
				const res = await client["agent-orchestration"].runs.bare.$post({ json: input });
				if (!res.ok) return throwSeamError("runs.createBareRun", res);
				const body = (await res.json()) as { readonly session: AgentOrchestrationSessionWireRow };
				return body.session;
			},
			async abort(sessionId: string): Promise<void> {
				const res = await client["agent-orchestration"].runs.abort.$post({ json: { sessionId } });
				if (!res.ok) return throwSeamError("runs.abort", res);
			},
			async failExplicitStart(startId: string, failureCode: string): Promise<void> {
				const res = await client["agent-orchestration"].runs["explicit-start"].fail.$post({
					json: { startId, failureCode },
				});
				if (!res.ok) return throwSeamError("runs.failExplicitStart", res);
			},
		},
		runConfig: {
			async read(agentId: string): Promise<AgentOrchestrationRunConfigView> {
				const res = await client["agent-orchestration"]["run-config"][":agentId"].$get({
					param: { agentId },
				});
				if (!res.ok) return throwSeamError("runConfig.read", res);
				const body = (await res.json()) as { readonly config: AgentOrchestrationRunConfigView };
				return body.config;
			},
			async readBatch(
				agentIds: readonly string[],
			): Promise<ReadonlyMap<string, AgentOrchestrationRunConfigView>> {
				const res = await client["agent-orchestration"]["run-config"].batch.$post({
					json: { agentIds: [...agentIds] },
				});
				if (!res.ok) return throwSeamError("runConfig.readBatch", res);
				const body = (await res.json()) as {
					readonly configs: Record<string, AgentOrchestrationRunConfigView>;
				};
				return new Map(Object.entries(body.configs));
			},
			async write(agentId: string, patch: AgentOrchestrationRunConfigPatch): Promise<void> {
				const res = await client["agent-orchestration"]["run-config"][":agentId"].$patch({
					param: { agentId },
					json: patch,
				});
				if (!res.ok) return throwSeamError("runConfig.write", res);
			},
		},
		filesystems: {
			async persistInjection(filesystemId: string, agentUserId: string) {
				const res = await client["agent-orchestration"].filesystems[":id"].injections.persist.$post(
					{
						param: { id: filesystemId },
						json: { agentUserId },
					},
				);
				if (!res.ok) return throwSeamError("filesystems.persistInjection", res);
				return (await res.json()) as
					| {
							readonly ok: true;
							readonly injection: {
								readonly agentUserId: string;
								readonly filesystemId: string;
								readonly createdAt: string;
							};
					  }
					| { readonly ok: false; readonly code: "NOT_FOUND" | "CONFLICT" };
			},
		},
	};
}

/**
 * AU31 §2.1a/§2.3 — call-site conversion NOT landed in this wave, on purpose.
 *
 * @lore AU31 builder session finding, recorded for the next attempt: a naive
 * `{ record: enqueueWorkIntent } → seam-backed AgentWorkIntentRecorder` swap
 * at `routes/tasks.ts`/`routes/bets.ts`/`work-session-started-reactions.ts`
 * DEADLOCKS the shared PGlite connection under test — `@hyperidle/work`'s
 * `transitionTask` (`task-state-machine.ts`) wraps `deps.workIntents.record`
 * INSIDE its own `db.transaction(...)`, a real cross-boundary atomic coupling
 * feasibility.md P3's audit did not catch (P3's grep only matched
 * `enqueueWorkIntent(`/`createSessionRequest(`/`agentWorkIntentRecorder.record(`/
 * `tx as HyperIdleDb` literally, not `deps.workIntents.record(tx, …)`'s
 * generic-port spelling). Converting these sites needs the SAME kind of
 * decision architecture.md §3.1 already made for `knowledge.ts:934`/
 * `threads.ts:1463` (relinquish the atomicity, name the window) — applied to
 * `transitionTask` itself, not silently at the call site.
 *
 * Separately: `agent-run-admission-reactions.ts`'s `session_start`/
 * `reengagement` cases and `assistant-turn-coherence-trigger.ts` fire off an
 * `EventBus` reaction that tests exercise via a bare `{ db, eventBus }`
 * fixture with NO `app` — so `getRegisteredAgentOrchestrationTransport()`
 * resolves to some OTHER test's stale registration (or throws), not this
 * test's own db. A seam call from inside a reaction handler needs the port
 * handed in at registration time (an explicit dependency), not read from the
 * module-level transport singleton the request-path composition uses.
 *
 * Both findings are reported to the orchestrator rather than resolved here;
 * this file keeps only the port additions the service-lane tests
 * (`agent-orchestration-port-writes.integration.test.ts`) exercise directly.
 */

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
				"before a route reads session data through the seam).",
		);
	}
	return registeredTransport;
}
