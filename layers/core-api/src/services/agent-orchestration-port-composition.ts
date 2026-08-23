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
 *
 * @lore AU31 §3.2 — acquisition changed. There is no module-level transport
 * singleton anymore (`registerAgentOrchestrationTransport`/
 * `getRegisteredAgentOrchestrationTransport` are DELETED). Every composition
 * root builds exactly ONE `AgentOrchestrationPort` with
 * `buildAgentOrchestrationPort(transport)` and hands it to every consumer —
 * routes, reaction registrars, the `{ db, eventBus }` service-lane fixture —
 * as an ordinary value, the same way `adapterPool` already threads through
 * `AppOptions`. Production builds the transport as an arrow closing over a
 * root-local `let` filled once the composed app exists
 * (`applications/remote-server/src/create-server.ts`); a call before that
 * binding is filled throws the same named error the singleton used to throw,
 * minus the cross-test bleed an ambient global caused.
 */

import type {
	AgentOrchestrationPort,
	AgentOrchestrationRunConfigPatch,
	AgentOrchestrationRunConfigView,
	AgentOrchestrationSessionWireRow,
	AgentOrchestrationStoppedRun,
	AgentOrchestrationTransport,
	AgentOrchestrationWorkIntentInput,
	AgentOrchestrationWorkIntentKind,
	AgentOrchestrationWorkIntentReceipt,
} from "@hyperidle/api-contract";
import type { WriteExecutor } from "@hyperidle/db";
import type { OrgUserDirectory } from "@hyperidle/org";
import type {
	AgentWorkIntentRecorderFn,
	AgentWorkIntentRecorderInput,
} from "@hyperidle/work-intent-port";
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
			readonly ":sessionId": {
				$get(args: { readonly param: { readonly sessionId: string } }): Promise<Response>;
			};
		};
		readonly intents: {
			$post(args: { readonly json: AgentOrchestrationWorkIntentInput }): Promise<Response>;
		};
		readonly requests: {
			readonly "pending-intents": {
				$get(args: {
					readonly query: { readonly kind: AgentOrchestrationWorkIntentKind };
				}): Promise<Response>;
			};
			readonly "explicit-starts": {
				readonly ":startId": {
					readonly fail: {
						$post(args: {
							readonly param: { readonly startId: string };
							readonly json: { readonly failureCode: string };
						}): Promise<Response>;
					};
				};
			};
		};
		readonly runs: {
			readonly abort: {
				$post(args: { readonly json: { readonly sessionId: string } }): Promise<Response>;
			};
			readonly "stop-for-tasks": {
				// @lore AU44 batch6: `reason` dropped from request body.
				$post(args: { readonly json: { readonly taskIds: readonly string[] } }): Promise<Response>;
			};
			readonly "end-for-handoff": {
				$post(args: {
					readonly json: { readonly sessionId: string; readonly endedAt: string };
				}): Promise<Response>;
			};
			readonly "is-at-capacity": {
				$post(args: {
					readonly json: { readonly agentId: string; readonly maxConcurrentSessions: number };
				}): Promise<Response>;
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
				readonly team: {
					$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
				};
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
			/**
			 * @lore AU26 B1a (AC5(d)): returns the FULL 18-column wire row, never
			 * the seven-field decoration narrowing. A 404 resolves `null`.
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
		},
		intents: {
			async submit(
				input: AgentOrchestrationWorkIntentInput,
			): Promise<AgentOrchestrationWorkIntentReceipt> {
				const res = await client["agent-orchestration"].intents.$post({ json: input });
				if (!res.ok) return throwSeamError("intents.submit", res);
				return (await res.json()) as AgentOrchestrationWorkIntentReceipt;
			},
		},
		requests: {
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
			async failExplicitSessionStart(startId: string, failureCode: string): Promise<void> {
				const res = await client["agent-orchestration"].requests["explicit-starts"][
					":startId"
				].fail.$post({ param: { startId }, json: { failureCode } });
				if (!res.ok) return throwSeamError("requests.failExplicitSessionStart", res);
			},
		},
		runs: {
			async stopForTasks(
				taskIds: readonly string[],
			): Promise<ReadonlyArray<AgentOrchestrationStoppedRun>> {
				const res = await client["agent-orchestration"].runs["stop-for-tasks"].$post({
					json: { taskIds },
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
			async abort(sessionId: string): Promise<void> {
				const res = await client["agent-orchestration"].runs.abort.$post({ json: { sessionId } });
				if (!res.ok) return throwSeamError("runs.abort", res);
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
			async getTeamId(filesystemId: string): Promise<string | null> {
				const res = await client["agent-orchestration"].filesystems[":id"].team.$get({
					param: { id: filesystemId },
				});
				if (!res.ok) return throwSeamError("filesystems.getTeamId", res);
				const body = (await res.json()) as { readonly teamId: string | null };
				return body.teamId;
			},
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
 * AU31 §3.2 — the seam-backed `AgentWorkIntentRecorder` factory: the
 * composition-root adapter that lets `@hyperidle/work`'s `transitionTask`
 * (site 6), `@hyperidle/policy`'s `handoff` (site 7), `@hyperidle/routine`'s
 * scheduler (site 8) and `@hyperidle/review`'s proposed-call workflow
 * (site 9) — plus every route that records a work intent directly — go
 * through the port instead of importing `@hyperidle/session-requests`.
 *
 * `record` deliberately IGNORES the executor it is handed: a seam call is an
 * HTTP round trip through the composed app's own connection, so it can never
 * join a caller's transaction. That is exactly §3.1's ruling — cross-layer
 * atomicity is relinquished, not preserved by a clever executor
 * thread-through. Every call site that used to open a `db.transaction(...)`
 * around `.record(tx, …)` is restructured so the transaction commits the
 * core write(s) alone and this call runs AFTER, post-commit — never inside
 * one. Generic over `TTx` so one factory serves every call site's own
 * `AgentWorkIntentRecorder<TTx>` instantiation (`HyperIdleDb` at the route
 * layer, `WriteExecutor` inside `@hyperidle/work`/`@hyperidle/policy`).
 */
export function buildSeamBackedWorkIntentRecorder(
	port: AgentOrchestrationPort,
): AgentWorkIntentRecorderFn {
	return (input: AgentWorkIntentRecorderInput) => port.intents.submit(input);
}

/**
 * AU31 §2.2/§3 clause 2 — the seam-backed `OrgAgentRunConfigWriter` factory:
 * the composition-root adapter that lets `@hyperidle/org`'s
 * `persistScaffoldedAgents` (org.ts, teams-routes.ts, users.ts's setup route)
 * go through the port instead of importing `@hyperidle/run-orchestration`
 * directly. Same shape as `buildSeamBackedWorkIntentRecorder` above:
 * `writeAgentRunConfig` deliberately IGNORES the executor it is handed — a
 * seam call is an HTTP round trip through the composed app's own connection,
 * so it can never join a caller's transaction, which is why
 * `persistScaffoldedAgents` is never itself called from inside a
 * `db.transaction(...)` at any of its three call sites.
 */
export function buildSeamBackedAgentRunConfigWriter(
	port: AgentOrchestrationPort,
): Pick<OrgUserDirectory, "writeAgentRunConfig"> {
	return {
		writeAgentRunConfig: async (
			_db: WriteExecutor,
			agentUserId: string,
			patch: AgentOrchestrationRunConfigPatch,
		) => {
			await port.runConfig.write(agentUserId, patch);
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
