import type {
	AgentOrchestrationConnectionCreateInput,
	AgentOrchestrationConnectionsListView,
	AgentOrchestrationCreateConnectionResult,
	AgentOrchestrationPort,
	AgentOrchestrationRemoveResult,
	AgentOrchestrationRunConfigPatch,
	AgentOrchestrationRunConfigView,
	AgentOrchestrationSpaceFolderAddResult,
	AgentOrchestrationSpaceFolderRemoveResult,
	AgentOrchestrationSpaceFolderView,
	AgentOrchestrationTransport,
} from "@hyperidle/api-contract";
import type { Hono } from "hono";
import { hc } from "hono/client";
import type { AppType } from "../schemas/index.js";

/**
 * Hand-typed mirror of the real core-api `hc` client shape for the
 * `/agent-orchestration` mount — same "one audited cast recovering a usable
 * shape" idiom.
 */
interface AgentOrchestrationHcClient {
	readonly "agent-orchestration": {
		readonly "run-config": {
			readonly ":agentId": {
				$get(args: { readonly param: { readonly agentId: string } }): Promise<Response>;
				$patch(args: {
					readonly param: { readonly agentId: string };
					readonly json: AgentOrchestrationRunConfigPatch;
				}): Promise<Response>;
				readonly "ensure-space": {
					$post(args: {
						readonly param: { readonly agentId: string };
						readonly json: { readonly agentName: string };
					}): Promise<Response>;
				};
			};
			readonly batch: {
				$post(args: { readonly json: { readonly agentIds: readonly string[] } }): Promise<Response>;
			};
		};
		readonly "space-folders": {
			readonly ":agentId": {
				$get(args: { readonly param: { readonly agentId: string } }): Promise<Response>;
				$post(args: {
					readonly param: { readonly agentId: string };
					readonly json: {
						readonly path: string;
						readonly name?: string;
						readonly agentName: string;
					};
				}): Promise<Response>;
				readonly ":name": {
					readonly remove: {
						$post(args: {
							readonly param: { readonly agentId: string; readonly name: string };
						}): Promise<Response>;
					};
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
					readonly withhold: {
						$post(args: {
							readonly param: { readonly userId: string; readonly id: string };
							readonly json: { readonly agentUserId: string; readonly keep: boolean };
						}): Promise<Response>;
					};
				};
			};
		};
	};
}

/** Placeholder origin for hc's internal URL construction. */
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
			async ensureSpace(agentId: string, agentName: string): Promise<string> {
				const res = await client["agent-orchestration"]["run-config"][":agentId"][
					"ensure-space"
				].$post({ param: { agentId }, json: { agentName } });
				if (!res.ok) return throwSeamError("runConfig.ensureSpace", res);
				const body = (await res.json()) as { readonly spacePath: string };
				return body.spacePath;
			},
		},
		spaceFolders: {
			async list(agentId: string): Promise<AgentOrchestrationSpaceFolderView[]> {
				const res = await client["agent-orchestration"]["space-folders"][":agentId"].$get({
					param: { agentId },
				});
				if (!res.ok) return throwSeamError("spaceFolders.list", res);
				const body = (await res.json()) as {
					readonly folders: AgentOrchestrationSpaceFolderView[];
				};
				return body.folders;
			},
			async add(
				agentId: string,
				path: string,
				name: string | undefined,
				agentName: string,
			): Promise<AgentOrchestrationSpaceFolderAddResult> {
				const res = await client["agent-orchestration"]["space-folders"][":agentId"].$post({
					param: { agentId },
					json: name !== undefined ? { path, name, agentName } : { path, agentName },
				});
				if (!res.ok) return throwSeamError("spaceFolders.add", res);
				return (await res.json()) as AgentOrchestrationSpaceFolderAddResult;
			},
			async remove(
				agentId: string,
				name: string,
			): Promise<AgentOrchestrationSpaceFolderRemoveResult> {
				const res = await client["agent-orchestration"]["space-folders"][":agentId"][
					":name"
				].remove.$post({ param: { agentId, name } });
				if (!res.ok) return throwSeamError("spaceFolders.remove", res);
				return (await res.json()) as AgentOrchestrationSpaceFolderRemoveResult;
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
			async withhold(
				userId: string,
				id: string,
				agentUserId: string,
				keep: boolean,
			): Promise<AgentOrchestrationRemoveResult> {
				const res = await client["agent-orchestration"].connections[":userId"][
					":id"
				].withhold.$post({ param: { userId, id }, json: { agentUserId, keep } });
				if (!res.ok) return throwSeamError("connections.withhold", res);
				return (await res.json()) as AgentOrchestrationRemoveResult;
			},
		},
	};
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
