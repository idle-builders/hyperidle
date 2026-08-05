/**
 * AU21 Increment 1 — `CoreApiPort` write seam: Application-layer composition
 * root (architecture.md §6 Decision A/C, §9 Increment 1, §10).
 *
 * This is the ONE place that adapts the seam's location-transparent
 * `CoreApiTransport` (a single-`Request` fetch-handler, `===` Hono's own
 * `app.fetch` shape) onto the real `hc<AppType>` Hono-RPC client — the exact
 * literal pattern already proven at `layers/web/src/api/client.ts`
 * (`hc<AppType>(baseUrl, {fetch})`), reused here Application-side instead of
 * client-side.
 *
 * `AppType` is bare `Hono` (`app.ts:673` — no per-route schema survives
 * `app.route(path, sub)` mutation), so `hc<AppType>(...)` resolves to an
 * opaque type at the TS level. `buildBetsHcClient` below performs the ONE
 * audited cast recovering a usable shape — contained in a named helper via
 * an intermediate `unknown`-typed variable (NOT a `X as unknown as T`
 * double-assertion, which `design/no-unknown-cast` bans; same idiom as
 * `run-orchestration-composition.ts`'s `widenWorkerRegistration`). Fidelity
 * between `CoreApiHcClient` and the real `POST /bets` route is a TESTED
 * obligation (§11 contract tests, `__tests__/core-api-port.integration.test.ts`),
 * never a compiler guarantee.
 */

import type {
	BetView,
	ConversationInboxRowView,
	ConversationMessageType,
	ConversationThreadView,
	CoreApiPort,
	CoreApiTransport,
	CreateArtifactRequest,
	CreateArtifactResponse,
	CreateBetRequest,
	CreateBetResponse,
	CreateItemRequest,
	CreateItemResponse,
	CreateKnowledgeConflictRequest,
	CreateKnowledgeItemRequest,
	CreateKnowledgeItemResponse,
	CreateOrgTeamRequest,
	CreateTaskRequest,
	CreateTaskResponse,
	DirectThreadResponse,
	HandoffTaskRequest,
	HandoffTaskResponse,
	InsertMessageRequest,
	InsertMessageResponse,
	InsertRoutineRequest,
	InsertThreadRequest,
	InsertThreadResponse,
	ItemView,
	KnowledgeConflictView,
	KnowledgeItemStatusView,
	KnowledgeItemVersionView,
	OrgTeamMembersByIdView,
	OrgTeamMembershipView,
	OrgTeamView,
	PersistScaffoldedAgentsResponse,
	PromoteKnowledgeItemRequest,
	PromoteKnowledgeItemResult,
	ProvisionTeamRoutinesRequest,
	RoutineView,
	TaskView,
	UpdateBetRequest,
	UpdateItemRequest,
	UpdateOrgTeamRequest,
	UpdateRoutineRequest,
	UpdateThreadRequest,
	UserView,
} from "@hyperidle/api-contract";
import type { Hono } from "hono";
import { hc } from "hono/client";
import type { AppType } from "../schemas/index.js";
import { CORE_API_ACTOR_OVERRIDE_HEADER } from "./actor-transport-header.js";

/** Wire shape `PATCH /bets/:id` accepts — one field per call (`routes/bets.ts`'s discriminated union). */
interface BetPatchFieldBody {
	readonly field: "description" | "done_condition" | "hypothesis";
	readonly value: string;
	readonly reason: string;
}

/**
 * Hand-typed mirror of the real core-api `hc` client shape — one property
 * group per mounted sub-router (`app.route("/bets", …)` etc, `app.ts:460-`).
 * Increment 1 seeded ONLY `bets.$post`; Increment 2 adds every route this
 * wave's `CoreApiWorkPort`/`CoreApiUsersPort` methods reuse or newly expose.
 */
interface CoreApiHcClient {
	readonly bets: {
		$post(args: { readonly json: CreateBetRequest }): Promise<Response>;
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
			$patch(args: {
				readonly param: { readonly id: string };
				readonly json: BetPatchFieldBody;
			}): Promise<Response>;
		};
	};
	readonly tasks: {
		$post(args: { readonly json: CreateTaskRequest }): Promise<Response>;
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
			readonly notes: {
				$patch(args: {
					readonly param: { readonly id: string };
					readonly json: { readonly entry: string };
				}): Promise<Response>;
			};
			readonly handoff: {
				$post(args: {
					readonly param: { readonly id: string };
					readonly json: HandoffTaskRequest;
				}): Promise<Response>;
			};
		};
	};
	readonly teams: {
		readonly ":teamId": {
			$patch(args: {
				readonly param: { readonly teamId: string };
				readonly json: UpdateOrgTeamRequest;
			}): Promise<Response>;
		};
	};
	readonly routines: {
		$post(args: { readonly json: InsertRoutineRequest }): Promise<Response>;
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
			$patch(args: {
				readonly param: { readonly id: string };
				readonly json: UpdateRoutineRequest;
			}): Promise<Response>;
		};
	};
	readonly org: {
		readonly teams: {
			$post(args: { readonly json: CreateOrgTeamRequest }): Promise<Response>;
			readonly ":teamId": {
				$get(args: { readonly param: { readonly teamId: string } }): Promise<Response>;
				readonly membership: {
					$get(args: { readonly param: { readonly teamId: string } }): Promise<Response>;
				};
			};
		};
		readonly "team-members": {
			readonly ":teamMembersId": {
				$get(args: { readonly param: { readonly teamMembersId: string } }): Promise<Response>;
			};
		};
		readonly "review-recipients": {
			$get(args: {
				readonly query: {
					readonly userId: string;
					readonly agentRole?: string;
					readonly teamId?: string;
				};
			}): Promise<Response>;
		};
		readonly "scaffolded-agents": {
			$post(args: {
				readonly json: {
					readonly teamMembersId: string | null;
					readonly specs: readonly Record<string, unknown>[];
				};
			}): Promise<Response>;
		};
		readonly "team-routines": {
			$post(args: { readonly json: ProvisionTeamRoutinesRequest }): Promise<Response>;
		};
	};
	readonly conversations: {
		readonly items: {
			$get(args: { readonly query: { readonly reasoningMarker: string } }): Promise<Response>;
			$post(args: { readonly json: CreateItemRequest }): Promise<Response>;
			readonly ":id": {
				$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
				$patch(args: {
					readonly param: { readonly id: string };
					readonly json: UpdateItemRequest;
				}): Promise<Response>;
			};
		};
	};
	readonly artifacts: {
		$post(args: { readonly json: CreateArtifactRequest }): Promise<Response>;
	};
	readonly users: {
		$get(args: {
			readonly query: { readonly teamMembersId?: string; readonly kind?: string };
		}): Promise<Response>;
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
		};
	};
	readonly threads: {
		$get(args: {
			readonly query: {
				readonly host_kind?: string;
				readonly host_id?: string;
				readonly limit?: string;
			};
		}): Promise<Response>;
		readonly scaffold: {
			$post(args: { readonly json: InsertThreadRequest }): Promise<Response>;
		};
		readonly direct: {
			$post(args: { readonly json: { readonly recipientId: string } }): Promise<Response>;
		};
		readonly inbox: {
			$get(args: { readonly query: { readonly limit: string } }): Promise<Response>;
		};
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
			$patch(args: {
				readonly param: { readonly id: string };
				readonly json: UpdateThreadRequest;
			}): Promise<Response>;
			readonly messages: {
				$post(args: {
					readonly param: { readonly id: string };
					readonly json: {
						readonly type: ConversationMessageType;
						readonly payload: Record<string, unknown>;
						readonly clientKey: string;
					};
				}): Promise<Response>;
			};
		};
	};
	readonly knowledge: {
		readonly search: {
			$get(args: {
				readonly query: { readonly q: string; readonly limit?: string };
			}): Promise<Response>;
		};
		$post(args: { readonly json: CreateKnowledgeItemRequest }): Promise<Response>;
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
			readonly conflicts: {
				$get(args: {
					readonly param: { readonly id: string };
					readonly query: { readonly proposedBy: string };
				}): Promise<Response>;
				$post(args: {
					readonly param: { readonly id: string };
					readonly json: Omit<CreateKnowledgeConflictRequest, "itemId">;
				}): Promise<Response>;
			};
			readonly promote: {
				$post(args: {
					readonly param: { readonly id: string };
					readonly json: {
						readonly fromStatus: string;
						readonly toStatus: string;
						readonly reason?: string;
						readonly editor: string;
					};
				}): Promise<Response>;
			};
			readonly "attention-score": {
				$patch(args: {
					readonly param: { readonly id: string };
					readonly json: { readonly attentionScore: string };
				}): Promise<Response>;
			};
			readonly "recompute-attention": {
				$post(args: { readonly param: { readonly id: string } }): Promise<Response>;
			};
		};
	};
}

/** Placeholder origin for hc's internal URL construction — see this file's top `@lore`. */
const SEAM_PLACEHOLDER_BASE_URL = "http://core-api.internal/api";

function buildCoreApiHcClient(fetchAdapter: typeof fetch): CoreApiHcClient {
	const client: unknown = hc<AppType>(SEAM_PLACEHOLDER_BASE_URL, { fetch: fetchAdapter });
	return client as CoreApiHcClient;
}

/** Throws a uniform, method-attributed error for a non-2xx seam response. */
async function throwSeamError(method: string, res: Response): Promise<never> {
	const body = await res.text();
	throw new Error(`CoreApiPort.${method}: request failed (${res.status}): ${body}`);
}

/** GET helper: 404 → `undefined`, non-2xx (incl. auth failures) → throw, else parse JSON. */
async function getOrUndefined<T>(method: string, res: Response): Promise<T | undefined> {
	if (res.status === 404) return undefined;
	if (!res.ok) return throwSeamError(method, res);
	return (await res.json()) as T;
}

/**
 * `GET /threads/:id`'s response body is `{thread, messages, ...}` — extract
 * only the `ConversationThreadView` fields a seam consumer relies on
 * (`thread.participants` is already the route's own parsed `string[]`).
 */
async function getThreadViewOrUndefined(
	method: string,
	res: Response,
): Promise<ConversationThreadView | undefined> {
	if (res.status === 404) return undefined;
	if (!res.ok) return throwSeamError(method, res);
	const body = (await res.json()) as { readonly thread: ConversationThreadView };
	return { id: body.thread.id, participants: body.thread.participants };
}

/**
 * `GET /threads?host_kind=&host_id=&limit=1`'s response body is
 * `{threads: [...], nextCursor}` — takes the first row, or `undefined` when
 * the array is empty (no 404 case for a list route).
 */
async function getFirstThreadOrUndefined(
	method: string,
	res: Response,
): Promise<ConversationThreadView | undefined> {
	if (!res.ok) return throwSeamError(method, res);
	const body = (await res.json()) as { readonly threads: ReadonlyArray<ConversationThreadView> };
	const first = body.threads[0];
	return first ? { id: first.id, participants: first.participants } : undefined;
}

/**
 * `GET /routines/:id`'s response body is the heavier `RoutineDetail`
 * (`{routine, runs, budget}`) — extract only the `RoutineView` fields a seam
 * consumer relies on. The route already 404s a soft-deleted routine, so a
 * found result never carries a real `deletedAt` (always `null` here).
 */
async function getRoutineViewOrUndefined(
	method: string,
	res: Response,
): Promise<RoutineView | undefined> {
	if (res.status === 404) return undefined;
	if (!res.ok) return throwSeamError(method, res);
	const body = (await res.json()) as {
		readonly routine: { readonly name: string; readonly state: string };
	};
	return { name: body.routine.name, state: body.routine.state, deletedAt: null };
}

/** Maps `UpdateBetRequest`'s camelCase keys onto `PATCH /bets/:id`'s wire `field` names. */
const BET_PATCH_FIELD_NAMES = {
	description: "description",
	doneCondition: "done_condition",
	hypothesis: "hypothesis",
} as const satisfies Record<keyof UpdateBetRequest, BetPatchFieldBody["field"]>;

/**
 * Builds a real `CoreApiPort` wired to the given transport. The transport
 * decides WHERE the request actually goes (in-process `app.fetch` or a real
 * network `fetch`) — this factory only ever adapts the seam's single-
 * `Request` transport shape onto hc's two-argument `(url, init) => fetch`
 * shape (architecture.md §10's `CoreApiTransport === hc's injectable fetch`).
 */
export function buildCoreApiPort(transport: CoreApiTransport): CoreApiPort {
	const fetchAdapter: typeof fetch = (input, init) => transport(new Request(input, init));
	const client = buildCoreApiHcClient(fetchAdapter);

	return {
		work: {
			async createBet(input: CreateBetRequest): Promise<CreateBetResponse> {
				const res = await client.bets.$post({ json: input });
				if (!res.ok) return throwSeamError("work.createBet", res);
				return (await res.json()) as CreateBetResponse;
			},

			async getTaskById(id: string): Promise<TaskView | undefined> {
				const res = await client.tasks[":id"].$get({ param: { id } });
				return getOrUndefined<TaskView>("work.getTaskById", res);
			},

			async getBetById(id: string): Promise<BetView | undefined> {
				const res = await client.bets[":id"].$get({ param: { id } });
				return getOrUndefined<BetView>("work.getBetById", res);
			},

			async updateBetById(id: string, updates: UpdateBetRequest): Promise<void> {
				const reason = "agent update via CoreApiPort seam";
				const entries: ReadonlyArray<
					readonly [BetPatchFieldBody["field"], string | null | undefined]
				> = [
					[BET_PATCH_FIELD_NAMES.description, updates.description],
					[BET_PATCH_FIELD_NAMES.doneCondition, updates.doneCondition],
					[BET_PATCH_FIELD_NAMES.hypothesis, updates.hypothesis],
				];
				for (const [field, value] of entries) {
					if (value === undefined || value === null) continue;
					const res = await client.bets[":id"].$patch({
						param: { id },
						json: { field, value, reason },
					});
					if (!res.ok) return throwSeamError("work.updateBetById", res);
				}
			},

			async createTask(input: CreateTaskRequest): Promise<CreateTaskResponse> {
				const res = await client.tasks.$post({ json: input });
				if (!res.ok) return throwSeamError("work.createTask", res);
				return (await res.json()) as CreateTaskResponse;
			},

			async appendTaskNote(
				taskId: string,
				entry: string,
			): Promise<{ readonly id: string } | undefined> {
				const res = await client.tasks[":id"].notes.$patch({
					param: { id: taskId },
					json: { entry },
				});
				return getOrUndefined<{ readonly id: string }>("work.appendTaskNote", res);
			},

			async getItemById(id: string): Promise<ItemView | undefined> {
				const res = await client.conversations.items[":id"].$get({ param: { id } });
				return getOrUndefined<ItemView>("work.getItemById", res);
			},

			async updateItemById(id: string, updates: UpdateItemRequest): Promise<void> {
				const res = await client.conversations.items[":id"].$patch({
					param: { id },
					json: updates,
				});
				if (!res.ok) return throwSeamError("work.updateItemById", res);
			},

			async createItem(input: CreateItemRequest): Promise<CreateItemResponse> {
				const res = await client.conversations.items.$post({ json: input });
				if (!res.ok) return throwSeamError("work.createItem", res);
				return (await res.json()) as CreateItemResponse;
			},

			async findItemByReasoningMarker(
				marker: string,
			): Promise<{ readonly id: string } | undefined> {
				const res = await client.conversations.items.$get({ query: { reasoningMarker: marker } });
				if (!res.ok) return throwSeamError("work.findItemByReasoningMarker", res);
				const { items } = (await res.json()) as { readonly items: ReadonlyArray<{ id: string }> };
				return items[0] ? { id: items[0].id } : undefined;
			},

			async createArtifact(input: CreateArtifactRequest): Promise<CreateArtifactResponse> {
				const res = await client.artifacts.$post({
					json: { ...input, preview: input.preview ?? null },
				});
				if (!res.ok) return throwSeamError("work.createArtifact", res);
				return (await res.json()) as CreateArtifactResponse;
			},

			async handoffTask(taskId: string, input: HandoffTaskRequest): Promise<HandoffTaskResponse> {
				const res = await client.tasks[":id"].handoff.$post({ param: { id: taskId }, json: input });
				if (!res.ok) return throwSeamError("work.handoffTask", res);
				return (await res.json()) as HandoffTaskResponse;
			},
		},
		users: {
			async getUserById(id: string): Promise<UserView | undefined> {
				const res = await client.users[":id"].$get({ param: { id } });
				return getOrUndefined<UserView>("users.getUserById", res);
			},

			async listUsersByTeam(teamMembersId: string): Promise<ReadonlyArray<UserView>> {
				const res = await client.users.$get({ query: { teamMembersId } });
				if (!res.ok) return throwSeamError("users.listUsersByTeam", res);
				return (await res.json()) as ReadonlyArray<UserView>;
			},

			async findSoleHumanUser(): Promise<UserView | undefined> {
				const res = await client.users.$get({ query: { kind: "human" } });
				if (!res.ok) return throwSeamError("users.findSoleHumanUser", res);
				const rows = (await res.json()) as ReadonlyArray<UserView>;
				return rows[0];
			},
		},
		conversation: {
			async getThreadById(id: string): Promise<ConversationThreadView | undefined> {
				const res = await client.threads[":id"].$get({ param: { id } });
				return getThreadViewOrUndefined("conversation.getThreadById", res);
			},

			async insertThread(input: InsertThreadRequest): Promise<InsertThreadResponse> {
				const res = await client.threads.scaffold.$post({ json: input });
				if (!res.ok) return throwSeamError("conversation.insertThread", res);
				return (await res.json()) as InsertThreadResponse;
			},

			async updateThread(id: string, updates: UpdateThreadRequest): Promise<void> {
				const res = await client.threads[":id"].$patch({ param: { id }, json: updates });
				if (!res.ok) return throwSeamError("conversation.updateThread", res);
			},

			async insertMessage(input: InsertMessageRequest): Promise<InsertMessageResponse> {
				const res = await client.threads[":id"].messages.$post({
					param: { id: input.threadId },
					json: { type: input.type, payload: input.payload, clientKey: input.clientKey },
				});
				if (!res.ok) return throwSeamError("conversation.insertMessage", res);
				const body = (await res.json()) as { readonly message: { readonly id: string } };
				return { id: body.message.id };
			},

			async listInboxBySenderExclusion(
				limit: number,
			): Promise<ReadonlyArray<ConversationInboxRowView>> {
				const res = await client.threads.inbox.$get({ query: { limit: String(limit) } });
				if (!res.ok) return throwSeamError("conversation.listInboxBySenderExclusion", res);
				const body = (await res.json()) as {
					readonly items: ReadonlyArray<ConversationInboxRowView>;
				};
				return body.items;
			},

			async findOrCreateDirectThread(recipientId: string): Promise<DirectThreadResponse> {
				const res = await client.threads.direct.$post({ json: { recipientId } });
				if (!res.ok) return throwSeamError("conversation.findOrCreateDirectThread", res);
				return (await res.json()) as DirectThreadResponse;
			},

			async getFirstThreadByHost(
				hostKind: string,
				hostId: string,
			): Promise<ConversationThreadView | undefined> {
				const res = await client.threads.$get({
					query: { host_kind: hostKind, host_id: hostId, limit: "1" },
				});
				return getFirstThreadOrUndefined("conversation.getFirstThreadByHost", res);
			},
		},
		org: {
			async getTeamById(teamId: string): Promise<OrgTeamView | undefined> {
				const res = await client.org.teams[":teamId"].$get({ param: { teamId } });
				return getOrUndefined<OrgTeamView>("org.getTeamById", res);
			},

			async getTeamMembersByTeamId(teamId: string): Promise<OrgTeamMembershipView | undefined> {
				const res = await client.org.teams[":teamId"].membership.$get({ param: { teamId } });
				return getOrUndefined<OrgTeamMembershipView>("org.getTeamMembersByTeamId", res);
			},

			async getTeamMembersById(teamMembersId: string): Promise<OrgTeamMembersByIdView | undefined> {
				const res = await client.org["team-members"][":teamMembersId"].$get({
					param: { teamMembersId },
				});
				return getOrUndefined<OrgTeamMembersByIdView>("org.getTeamMembersById", res);
			},

			async createTeam(input: CreateOrgTeamRequest): Promise<void> {
				const res = await client.org.teams.$post({ json: input });
				if (!res.ok) return throwSeamError("org.createTeam", res);
			},

			async updateTeam(teamId: string, patch: UpdateOrgTeamRequest): Promise<void> {
				const res = await client.teams[":teamId"].$patch({ param: { teamId }, json: patch });
				if (!res.ok) return throwSeamError("org.updateTeam", res);
			},

			async resolveReviewRecipientsForItem(ctx: {
				readonly userId: string;
				readonly agentRole: string | undefined;
				readonly teamId: string | undefined;
			}): Promise<readonly string[]> {
				const res = await client.org["review-recipients"].$get({
					query: {
						userId: ctx.userId,
						...(ctx.agentRole !== undefined ? { agentRole: ctx.agentRole } : {}),
						...(ctx.teamId !== undefined ? { teamId: ctx.teamId } : {}),
					},
				});
				if (!res.ok) return throwSeamError("org.resolveReviewRecipientsForItem", res);
				const body = (await res.json()) as { readonly recipients: readonly string[] };
				return body.recipients;
			},

			async persistScaffoldedAgents(
				teamMembersId: string | null,
				specs: readonly Record<string, unknown>[],
			): Promise<PersistScaffoldedAgentsResponse> {
				const res = await client.org["scaffolded-agents"].$post({
					json: { teamMembersId, specs },
				});
				if (!res.ok) return throwSeamError("org.persistScaffoldedAgents", res);
				return (await res.json()) as PersistScaffoldedAgentsResponse;
			},

			async provisionTeamRoutines(input: ProvisionTeamRoutinesRequest): Promise<void> {
				const res = await client.org["team-routines"].$post({ json: input });
				if (!res.ok) return throwSeamError("org.provisionTeamRoutines", res);
			},
		},
		routine: {
			async insertRoutine(input: InsertRoutineRequest): Promise<void> {
				const res = await client.routines.$post({ json: input });
				if (!res.ok) return throwSeamError("routine.insertRoutine", res);
			},

			async getRoutineById(id: string): Promise<RoutineView | undefined> {
				const res = await client.routines[":id"].$get({ param: { id } });
				return getRoutineViewOrUndefined("routine.getRoutineById", res);
			},

			async updateRoutineById(id: string, updates: UpdateRoutineRequest): Promise<void> {
				const res = await client.routines[":id"].$patch({ param: { id }, json: updates });
				if (!res.ok) return throwSeamError("routine.updateRoutineById", res);
			},
		},
		knowledge: {
			async search(
				query: string,
				opts: { readonly limit: number },
			): Promise<ReadonlyArray<Record<string, unknown> & { readonly layer?: string | null }>> {
				const res = await client.knowledge.search.$get({
					query: { q: query, limit: String(opts.limit) },
				});
				if (!res.ok) return throwSeamError("knowledge.search", res);
				const body = (await res.json()) as {
					readonly results: ReadonlyArray<
						Record<string, unknown> & { readonly layer?: string | null }
					>;
				};
				return body.results;
			},

			async create(input: CreateKnowledgeItemRequest): Promise<CreateKnowledgeItemResponse> {
				const res = await client.knowledge.$post({ json: input });
				if (!res.ok) return throwSeamError("knowledge.create", res);
				return (await res.json()) as CreateKnowledgeItemResponse;
			},

			async findKnowledgeItemVersionById(
				id: string,
			): Promise<KnowledgeItemVersionView | undefined> {
				const res = await client.knowledge[":id"].$get({ param: { id } });
				return getOrUndefined<KnowledgeItemVersionView>(
					"knowledge.findKnowledgeItemVersionById",
					res,
				);
			},

			async findKnowledgeItemStatusById(id: string): Promise<KnowledgeItemStatusView | undefined> {
				const res = await client.knowledge[":id"].$get({ param: { id } });
				return getOrUndefined<KnowledgeItemStatusView>(
					"knowledge.findKnowledgeItemStatusById",
					res,
				);
			},

			async findOpenConflictByItemAndProposer(
				itemId: string,
				proposedBy: string,
			): Promise<KnowledgeConflictView | undefined> {
				const res = await client.knowledge[":id"].conflicts.$get({
					param: { id: itemId },
					query: { proposedBy },
				});
				if (!res.ok) return throwSeamError("knowledge.findOpenConflictByItemAndProposer", res);
				const body = (await res.json()) as { readonly conflict: KnowledgeConflictView | null };
				return body.conflict ?? undefined;
			},

			async createKnowledgeConflict(input: CreateKnowledgeConflictRequest): Promise<void> {
				const res = await client.knowledge[":id"].conflicts.$post({
					param: { id: input.itemId },
					json: {
						id: input.id,
						versionBase: input.versionBase,
						versionCurrent: input.versionCurrent,
						proposedBody: input.proposedBody,
						proposedMeta: input.proposedMeta,
						proposedBy: input.proposedBy,
						createdAt: input.createdAt,
					},
				});
				if (!res.ok) return throwSeamError("knowledge.createKnowledgeConflict", res);
			},

			async promoteKnowledgeItem(
				input: PromoteKnowledgeItemRequest,
			): Promise<PromoteKnowledgeItemResult> {
				const res = await client.knowledge[":id"].promote.$post({
					param: { id: input.knowledgeItemId },
					json: {
						fromStatus: input.fromStatus,
						toStatus: input.toStatus,
						...(input.reason !== undefined ? { reason: input.reason } : {}),
						editor: input.editor,
					},
				});
				if (!res.ok) return throwSeamError("knowledge.promoteKnowledgeItem", res);
				return (await res.json()) as PromoteKnowledgeItemResult;
			},

			async upsertKnowledgeAppProjectionAttentionScore(
				knowledgeItemId: string,
				attentionScore: string,
			): Promise<void> {
				const res = await client.knowledge[":id"]["attention-score"].$patch({
					param: { id: knowledgeItemId },
					json: { attentionScore },
				});
				if (!res.ok)
					return throwSeamError("knowledge.upsertKnowledgeAppProjectionAttentionScore", res);
			},

			async recomputeAttentionScoreForItem(
				knowledgeItemId: string,
			): Promise<{ readonly current: number }> {
				const res = await client.knowledge[":id"]["recompute-attention"].$post({
					param: { id: knowledgeItemId },
				});
				if (!res.ok) return throwSeamError("knowledge.recomputeAttentionScoreForItem", res);
				return (await res.json()) as { readonly current: number };
			},
		},
	};
}

/**
 * The in-process transport: core-api's own Hono app dispatches the request
 * directly via `app.fetch` (its real fetch-handler), with zero network hop.
 * `app.fetch` ignores the request's host/port entirely — it routes on
 * pathname only — so the seam's placeholder origin above is never actually
 * reached over a socket for this transport.
 */
export function createInProcessCoreApiTransport(app: Hono): CoreApiTransport {
	return async (req: Request) => app.fetch(req);
}

/**
 * The split/remote transport: a real network `fetch` against a real,
 * separately-running core-api instance at `baseUrl`. Preserves the seam
 * request's method/headers/body verbatim, retargeting only the origin —
 * proving the SAME `buildCoreApiPort` call site works whether core-api is
 * colocated or split out over the network (architecture.md §6 Decision A,
 * AC #1a).
 */
export function createNetworkCoreApiTransport(baseUrl: string): CoreApiTransport {
	return async (req: Request) => {
		const seamUrl = new URL(req.url);
		const target = new URL(`${seamUrl.pathname}${seamUrl.search}`, baseUrl);
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		return fetch(target, { method: req.method, headers: req.headers, body });
	};
}

/**
 * Wraps a transport so every request carries the calling agent's own
 * identity as the route actor (architecture.md §12) plus the API key the
 * seam's Application-layer composition root already holds — never a
 * client-supplied header from outside that boundary (see
 * `actor-transport-header.ts`'s `@lore`). Reads `HYPERIDLE_API_KEY` at
 * call-time (not at wrap-time) so it always reflects the current
 * environment.
 */
export function withActorTransport(
	transport: CoreApiTransport,
	actor: { readonly userId: string },
): CoreApiTransport {
	return async (req: Request) => {
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		const headers = new Headers(req.headers);
		const apiKey = process.env.HYPERIDLE_API_KEY;
		if (apiKey) {
			headers.set("X-API-Key", apiKey);
		}
		headers.set(CORE_API_ACTOR_OVERRIDE_HEADER, actor.userId);
		const wrapped = new Request(req.url, { method: req.method, headers, body });
		return transport(wrapped);
	};
}

/**
 * Module-level registration point for the boot-time transport, mirroring
 * how `server-factory.ts` builds `app` exactly once and hands it to every
 * other composition root. Registered once in production
 * (`server-factory.ts`'s `createServer`) right after `createApp` resolves.
 *
 * @lore AU21 §9 Increment 2: once `resolveDraftTeamId`/`log_task`/
 * `write_memory`/etc.'s reads+writes moved onto this seam, EVERY existing
 * `*.integration.test.ts` that calls a tool handler directly (not just the
 * seam's own §11 contract tests) needs a registered transport — not only
 * the handful of tests that explicitly exercise the seam. A GLOBAL
 * `{auto:true}` fixture on `test-fixtures.ts`'s shared `test` was tried and
 * REJECTED: forcing `createApp` for every test also activates `app.ts`'s
 * own production event subscribers (e.g. the AD5 task-`done` dep-watcher,
 * `app.ts:577`) against tests that manually drive the exact same
 * transition themselves for their own assertions — a double-fire, not a
 * fixture problem. Each test file whose tool handler(s) actually reach the
 * seam instead carries a FILE-SCOPED `{auto:true}` fixture (`test =
 * baseTest.extend({coreApiSeamRegistration: [...,{auto:true}]})`, e.g.
 * `write-memory.integration.test.ts`) that registers the transport off
 * that same test's own `app` — confined to files that need it, invisible
 * to every other file that imports the bare `test-fixtures.ts` export. A
 * file using raw `createTestDb()` instead of the fixture (no `test`/`app`
 * available at all, e.g. `AD1-create-item-routing.integration.test.ts`)
 * builds + registers its own app by hand in `beforeEach`, same idiom as
 * `create-bet-coreapiport-migration.integration.test.ts`.
 */
let registeredTransport: CoreApiTransport | undefined;

export function registerCoreApiTransport(transport: CoreApiTransport): void {
	registeredTransport = transport;
}

/**
 * Read by `tool-handlers-bindings.ts`'s `coreApi` accessor at call-time
 * (never cached across calls — each tool call may carry a different
 * calling agent's actor identity via `withActorTransport`).
 */
export function getRegisteredCoreApiTransport(): CoreApiTransport {
	if (!registeredTransport) {
		throw new Error(
			"CoreApiPort transport not registered — call registerCoreApiTransport(...) during " +
				"application boot (or in a test, before invoking a tool that writes through the seam).",
		);
	}
	return registeredTransport;
}
