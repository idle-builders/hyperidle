// @lore: agent-orchestration-port — no singleton transport; composition root builds ONE port threaded as a value; call before binding fills throws a named error

import type {
	AgentOrchestrationAddFolderResult,
	AgentOrchestrationConnectionCreateInput,
	AgentOrchestrationConnectionsListView,
	AgentOrchestrationCreateConnectionResult,
	AgentOrchestrationFolderCreateInput,
	AgentOrchestrationFolderListQuery,
	AgentOrchestrationFolderView,
	AgentOrchestrationPersistInjectionResult,
	AgentOrchestrationPort,
	AgentOrchestrationRemoveResult,
	AgentOrchestrationReviewVerdictInput,
	AgentOrchestrationReviewVerdictOutcome,
	AgentOrchestrationRunConfigPatch,
	AgentOrchestrationRunConfigView,
	AgentOrchestrationSessionWireRow,
	AgentOrchestrationStoppedRun,
	AgentOrchestrationTransport,
	AgentOrchestrationWorkIntentInput,
	AgentOrchestrationWorkIntentReceipt,
} from "@hyperidle/api-contract";
import type {
	AgentWorkIntentRecorderFn,
	AgentWorkIntentRecorderInput,
	ReviewVerdictRecorderFn,
} from "@hyperidle/domain-model";
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
		readonly "review-verdicts": {
			$post(args: { readonly json: AgentOrchestrationReviewVerdictInput }): Promise<Response>;
		};
		readonly "review-links": {
			$post(args: {
				readonly json: { readonly sessionId: string; readonly reviewMessageId: string };
			}): Promise<Response>;
		};
		readonly runs: {
			readonly "stop-for-tasks": {
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
		readonly folders: {
			readonly list: {
				$post(args: { readonly json: AgentOrchestrationFolderListQuery }): Promise<Response>;
			};
			$post(args: {
				readonly json: { readonly teamId: string } & AgentOrchestrationFolderCreateInput;
			}): Promise<Response>;
			readonly ":id": {
				readonly remove: {
					$post(args: { readonly param: { readonly id: string } }): Promise<Response>;
				};
				readonly take: {
					$post(args: {
						readonly param: { readonly id: string };
						readonly json: { readonly agentUserId: string };
					}): Promise<Response>;
				};
			};
		};
		readonly connections: {
			readonly ":userId": {
				$get(args: { readonly param: { readonly userId: string } }): Promise<Response>;
				$post(args: {
					readonly param: { readonly userId: string };
					readonly json: AgentOrchestrationConnectionCreateInput;
				}): Promise<Response>;
				readonly ":id": {
					readonly remove: {
						$post(args: {
							readonly param: { readonly userId: string; readonly id: string };
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
			async recordReviewVerdict(
				input: AgentOrchestrationReviewVerdictInput,
			): Promise<AgentOrchestrationReviewVerdictOutcome> {
				const res = await client["agent-orchestration"]["review-verdicts"].$post({ json: input });
				if (!res.ok) return throwSeamError("intents.recordReviewVerdict", res);
				return (await res.json()) as AgentOrchestrationReviewVerdictOutcome;
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
		gate: {
			async linkReview(sessionId: string, reviewMessageId: string): Promise<void> {
				const res = await client["agent-orchestration"]["review-links"].$post({
					json: { sessionId, reviewMessageId },
				});
				if (!res.ok) return throwSeamError("gate.linkReview", res);
			},
		},
		folders: {
			async list(
				query: AgentOrchestrationFolderListQuery,
			): Promise<AgentOrchestrationFolderView[]> {
				const res = await client["agent-orchestration"].folders.list.$post({ json: query });
				if (!res.ok) return throwSeamError("folders.list", res);
				const body = (await res.json()) as { readonly folders: AgentOrchestrationFolderView[] };
				return body.folders;
			},
			async add(
				teamId: string,
				body: AgentOrchestrationFolderCreateInput,
			): Promise<AgentOrchestrationAddFolderResult> {
				const res = await client["agent-orchestration"].folders.$post({
					json: { teamId, ...body },
				});
				if (!res.ok) return throwSeamError("folders.add", res);
				return (await res.json()) as AgentOrchestrationAddFolderResult;
			},
			async remove(id: string): Promise<AgentOrchestrationRemoveResult> {
				const res = await client["agent-orchestration"].folders[":id"].remove.$post({
					param: { id },
				});
				if (!res.ok) return throwSeamError("folders.remove", res);
				return (await res.json()) as AgentOrchestrationRemoveResult;
			},
			async give(
				id: string,
				agentUserId: string,
			): Promise<AgentOrchestrationPersistInjectionResult> {
				const res = await client["agent-orchestration"].filesystems[":id"].injections.persist.$post(
					{ param: { id }, json: { agentUserId } },
				);
				if (!res.ok) return throwSeamError("folders.give", res);
				return (await res.json()) as AgentOrchestrationPersistInjectionResult;
			},
			async take(id: string, agentUserId: string): Promise<AgentOrchestrationRemoveResult> {
				const res = await client["agent-orchestration"].folders[":id"].take.$post({
					param: { id },
					json: { agentUserId },
				});
				if (!res.ok) return throwSeamError("folders.take", res);
				return (await res.json()) as AgentOrchestrationRemoveResult;
			},
		},
		connections: {
			async list(userId: string): Promise<AgentOrchestrationConnectionsListView> {
				const res = await client["agent-orchestration"].connections[":userId"].$get({
					param: { userId },
				});
				if (!res.ok) return throwSeamError("connections.list", res);
				return (await res.json()) as AgentOrchestrationConnectionsListView;
			},
			async add(
				userId: string,
				input: AgentOrchestrationConnectionCreateInput,
			): Promise<AgentOrchestrationCreateConnectionResult> {
				const res = await client["agent-orchestration"].connections[":userId"].$post({
					param: { userId },
					json: input,
				});
				if (!res.ok) return throwSeamError("connections.add", res);
				return (await res.json()) as AgentOrchestrationCreateConnectionResult;
			},
			async remove(userId: string, id: string): Promise<AgentOrchestrationRemoveResult> {
				const res = await client["agent-orchestration"].connections[":userId"][":id"].remove.$post({
					param: { userId, id },
				});
				if (!res.ok) return throwSeamError("connections.remove", res);
				return (await res.json()) as AgentOrchestrationRemoveResult;
			},
		},
	};
}

// @lore: work-intent recorder — seam call is HTTP; cannot join caller transaction; commit core write first, call AFTER
export function buildSeamBackedWorkIntentRecorder(
	port: AgentOrchestrationPort,
): AgentWorkIntentRecorderFn {
	return (input: AgentWorkIntentRecorderInput) => port.intents.submit(input);
}

// @lore: review-verdict recorder — `review_sessions` belongs to agent-orchestration; the thread route asks across the seam rather than reading the table
export function buildSeamBackedReviewVerdictRecorder(
	port: AgentOrchestrationPort,
): ReviewVerdictRecorderFn {
	return (input) => port.intents.recordReviewVerdict(input);
}

/**
 * The in-process transport: core-api's own Hono app dispatches the request
 * directly via `app.fetch`, zero network hop.
 */
export function createInProcessAgentOrchestrationTransport(app: Hono): AgentOrchestrationTransport {
	return async (req: Request) => app.fetch(req);
}

/** Real network `fetch` transport — for a separately-running instance at `baseUrl`. */
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
