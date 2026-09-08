/**
 * AU21 Increment 1 — `CoreApiPort` write seam: composition-root construction
 * for the seam's outbound-from-agent-orchestration client (architecture.md
 * §6 Decision A/C, §9 Increment 1, §10).
 *
 * @lore AU31 §2.5/§5/§12: relocated from `layers/core-api/src/services/
 * core-api-port-composition.ts`. Its client half has no real core-api-
 * specific dependency — the only thing that tied it to core-api was `hc`'s
 * generic type parameter (`AppType`, core-api's own bare-`Hono` route table,
 * whose per-route schema doesn't survive `app.route(path, sub)` mutation
 * anyway), and that generic was cast away immediately (`buildCoreApiHcClient`
 * below). `@hyperidle/tool-handlers` — the tool stack that is this file's
 * only consumer — is agent-orchestration's own Service now, so this
 * composition root moves with it; `core-api-port-composition.ts` no longer
 * exists on the core-api side (AU31 §5's table: "the `CoreApiPort` client
 * construction the tool stack needs moves with the tool stack, typed against
 * `@hyperidle/api-contract` only"). Fidelity between `CoreApiHcClient` and
 * the real routes it dials is a TESTED obligation (service-lane integration
 * coverage), never a compiler guarantee — `hc`'s route-table generic bought
 * no real safety here even before the move.
 *
 * @lore AU31 §3.2 clause 5/7: `registerCoreApiTransport`/
 * `getRegisteredCoreApiTransport` — the module-level ambient global this file
 * used to carry — are DELETED. The transport is a value now: a composition
 * root builds it once (`createInProcessCoreApiTransport`/
 * `createNetworkCoreApiTransport`) and hands it to every consumer that needs
 * a `CoreApiPort` as an ordinary argument, same shape as
 * `AgentOrchestrationPort`'s own client (`agent-orchestration-port-
 * composition.ts`, core-api-side, whose twin singleton wave A already
 * deleted). A caller with no transport supplied (e.g. `tools/eval`'s
 * standalone `runSession` use, which never reaches a `CoreApiPort`-backed
 * tool) gets `unconfiguredCoreApiTransport()` — a transport that throws only
 * when actually dialled, the same failure mode the deleted global produced
 * when nothing had registered yet, minus the cross-test/cross-composition
 * bleed a shared mutable module variable caused.
 */

import {
	// @lore BB1: BetView deleted — bet is now a root task.
	CORE_API_ACTOR_OVERRIDE_HEADER,
	type ConversationInboxRowView,
	type ConversationMessageType,
	type ConversationThreadView,
	type CoreApiPort,
	type CoreApiTransport,
	type CreateItemRequest,
	type CreateItemResponse,
	type CreateKnowledgeConflictRequest,
	type CreateKnowledgeItemRequest,
	type CreateKnowledgeItemResponse,
	type CreateOrgTeamRequest,
	type CreateTaskRequest,
	type CreateTaskResponse,
	type DirectThreadResponse,
	type HandoffTaskRequest,
	type HandoffTaskResponse,
	type InsertMessageRequest,
	type InsertMessageResponse,
	type InsertRoutineRequest,
	type InsertThreadRequest,
	type InsertThreadResponse,
	type ItemView,
	type KnowledgeConflictView,
	type KnowledgeItemStatusView,
	type KnowledgeItemVersionView,
	type OrgTeamMembersByIdView,
	type OrgTeamMembershipView,
	type OrgTeamView,
	type PersistScaffoldedAgentsResponse,
	type PromoteKnowledgeItemRequest,
	type PromoteKnowledgeItemResult,
	type RoutineView,
	type ScaffoldFromRequestInput,
	type TaskView,
	// @lore BB1: UpdateBetRequest deleted — bet is now a root task.
	type UpdateItemRequest,
	type UpdateKnowledgeItemContentRequest,
	type UpdateKnowledgeItemContentResponse,
	type UpdateKnowledgeItemContentResult,
	type UpdateOrgTeamRequest,
	type UpdateRoutineRequest,
	// @lore BB1: CreateBetRequest, CreateBetResponse deleted — bet is now a root task.
	type UpdateTaskRequest,
	type UpdateThreadRequest,
	type UserView,
} from "@hyperidle/api-contract";
import type { Hono } from "hono";
import { hc } from "hono/client";

// @lore BB1: BetPatchFieldBody and `bets` route group DELETED — the /bets route
// family is gone; tasks replace bets as root-level work items.

/**
 * Hand-typed mirror of the real core-api `hc` client shape — one property
 * group per mounted sub-router (`app.ts:460-`).
 * Increment 2 adds every route this wave's `CoreApiWorkPort`/`CoreApiUsersPort`
 * methods reuse or newly expose.
 */
interface CoreApiHcClient {
	readonly tasks: {
		$post(args: { readonly json: CreateTaskRequest }): Promise<Response>;
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
			$patch(args: {
				readonly param: { readonly id: string };
				readonly json: UpdateTaskRequest;
			}): Promise<Response>;
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
		readonly "scaffold-request": {
			$post(args: { readonly json: ScaffoldFromRequestInput }): Promise<Response>;
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
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
		};
	};
	readonly users: {
		$get(args: {
			readonly query: { readonly teamMembersId?: string; readonly kind?: string };
		}): Promise<Response>;
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
		};
	};
	readonly search: {
		$get(args: {
			readonly query: {
				readonly q: string;
				readonly scope?: string;
				readonly limit?: string;
			};
		}): Promise<Response>;
	};
	readonly threads: {
		$post(args: { readonly json: InsertThreadRequest }): Promise<Response>;
		$get(args: {
			readonly query: {
				readonly host_kind?: string;
				readonly host_id?: string;
				readonly limit?: string;
			};
		}): Promise<Response>;
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
		$post(args: { readonly json: CreateKnowledgeItemRequest }): Promise<Response>;
		readonly sweep: {
			$post(args: {
				readonly json: { readonly kind: "autoPromotion" | "stale" };
			}): Promise<Response>;
		};
		readonly ":id": {
			$get(args: { readonly param: { readonly id: string } }): Promise<Response>;
			/** AU31 §2.7 — the writeback processor's optimistic-lock update; same route `PATCH /knowledge/:id` the human-facing UI patches through. */
			$patch(args: {
				readonly param: { readonly id: string };
				readonly json: {
					readonly version: number;
					readonly updatedBy: string;
					readonly body: string;
				};
			}): Promise<Response>;
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
			readonly merge: {
				$post(args: {
					readonly param: { readonly id: string };
					readonly json: { readonly sourceId: string; readonly updatedBy: string };
				}): Promise<Response>;
			};
			readonly split: {
				$post(args: {
					readonly param: { readonly id: string };
					readonly json: {
						readonly newItems: ReadonlyArray<{
							readonly title: string;
							readonly body: string;
							readonly topic?: string;
						}>;
						readonly updatedBy: string;
					};
				}): Promise<Response>;
			};
		};
	};
}

/** Placeholder origin for hc's internal URL construction — see this file's top `@lore`. */
const SEAM_PLACEHOLDER_BASE_URL = "http://core-api.internal/api";

/**
 * @lore AU31 §5/§12: `hc<AppType>`'s generic core-api route-table type is
 * GONE — this file no longer imports core-api's `schemas/index.js` at all
 * (it moved out of core-api). `hc()` with no generic resolves to an untyped
 * client the same way `hc<AppType>` effectively did (bare `Hono`, no
 * per-route schema survives `app.route(path, sub)` mutation — this file's
 * top `@lore`), so the cast below recovers exactly the same amount of type
 * safety as before: none from the generic, all of it from
 * `CoreApiHcClient`'s hand-typed shape plus the service-lane tests that
 * exercise it against the real routes.
 */
function buildCoreApiHcClient(fetchAdapter: typeof fetch): CoreApiHcClient {
	const client: unknown = hc(SEAM_PLACEHOLDER_BASE_URL, { fetch: fetchAdapter });
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

// @lore BB1: BET_PATCH_FIELD_NAMES DELETED — UpdateBetRequest and BetPatchFieldBody gone.

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
			// @lore BB1: createBet, getBetById, updateBetById DELETED — bet is now a root task.

			async getTaskById(id: string): Promise<TaskView | undefined> {
				const res = await client.tasks[":id"].$get({ param: { id } });
				return getOrUndefined<TaskView>("work.getTaskById", res);
			},

			async updateTaskById(id: string, updates: UpdateTaskRequest): Promise<void> {
				const res = await client.tasks[":id"].$patch({ param: { id }, json: updates });
				if (!res.ok) return throwSeamError("work.updateTaskById", res);
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
				const res = await client.threads.$post({ json: input });
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

			async scaffoldFromRequest(
				input: ScaffoldFromRequestInput,
			): Promise<PersistScaffoldedAgentsResponse> {
				const res = await client.org["scaffold-request"].$post({ json: input });
				if (!res.ok) return throwSeamError("org.scaffoldFromRequest", res);
				return (await res.json()) as PersistScaffoldedAgentsResponse;
			},
		},
		routine: {
			async insertRoutine(input: InsertRoutineRequest): Promise<string | null> {
				const res = await client.routines.$post({ json: input });
				if (!res.ok) return throwSeamError("routine.insertRoutine", res);
				// Route returns the created routine; extract owner-computed nextRunAt.
				const body = (await res.json()) as { readonly nextRunAt?: string | null } | null;
				return body?.nextRunAt ?? null;
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
				const res = await client.search.$get({
					query: { q: query, scope: "knowledge", limit: String(opts.limit) },
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

			async updateKnowledgeItemContent(
				id: string,
				input: UpdateKnowledgeItemContentRequest,
			): Promise<UpdateKnowledgeItemContentResult> {
				const res = await client.knowledge[":id"].$patch({
					param: { id },
					json: { version: input.expectedVersion, updatedBy: input.updatedBy, body: input.body },
				});
				if (res.status === 409) {
					const body = (await res.json()) as {
						readonly details?: { readonly currentVersion?: number };
					};
					return {
						ok: false,
						currentVersion: body.details?.currentVersion ?? input.expectedVersion,
					};
				}
				if (!res.ok) return throwSeamError("knowledge.updateKnowledgeItemContent", res);
				const item = (await res.json()) as UpdateKnowledgeItemContentResponse;
				return { ok: true, item };
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

			async findKnowledgeItemParentById(
				id: string,
			): Promise<
				{ readonly parentKind: string | null; readonly parentId: string | null } | undefined
			> {
				const res = await client.knowledge[":id"].$get({ param: { id } });
				return getOrUndefined<{
					readonly parentKind: string | null;
					readonly parentId: string | null;
				}>("knowledge.findKnowledgeItemParentById", res);
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

			async runKnowledgeSweep(
				kind: "autoPromotion" | "stale",
			): Promise<{ readonly kind: string; readonly processed: number }> {
				const res = await client.knowledge.sweep.$post({ json: { kind } });
				if (!res.ok) return throwSeamError("knowledge.runKnowledgeSweep", res);
				return (await res.json()) as { readonly kind: string; readonly processed: number };
			},

			async mergeKnowledgeItem(
				targetId: string,
				sourceId: string,
				updatedBy: string,
			): Promise<{ readonly id: string }> {
				const res = await client.knowledge[":id"].merge.$post({
					param: { id: targetId },
					json: { sourceId, updatedBy },
				});
				if (!res.ok) return throwSeamError("knowledge.mergeKnowledgeItem", res);
				return (await res.json()) as { readonly id: string };
			},

			async splitKnowledgeItem(
				itemId: string,
				newItems: ReadonlyArray<{
					readonly title: string;
					readonly body: string;
					readonly topic?: string;
				}>,
				updatedBy: string,
			): Promise<ReadonlyArray<{ readonly id: string }>> {
				const res = await client.knowledge[":id"].split.$post({
					param: { id: itemId },
					json: { newItems, updatedBy },
				});
				if (!res.ok) return throwSeamError("knowledge.splitKnowledgeItem", res);
				const body = (await res.json()) as { readonly items: Array<{ readonly id: string }> };
				return body.items;
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
 * AU31 §3.2 — the ambient global this file used to carry
 * (`registerCoreApiTransport`/`getRegisteredCoreApiTransport`, a
 * module-level mutable `let`) is DELETED. Every consumer now receives the
 * `CoreApiTransport` value as an ordinary argument, built once per
 * composition by the root that owns the composed app
 * (`bootAgentOrchestration`'s `coreApiTransport` option — a root-local
 * binding closing over the composed app, the same construction-cycle
 * pattern §3.2 clause 4 already uses for `AgentOrchestrationTransport`).
 *
 * A composition with no real transport to supply (a bare-app test fixture,
 * or `tools/eval`'s standalone `runSession` use, neither of which exercises
 * a `CoreApiPort`-backed tool) gets this placeholder instead of a thrown
 * construction error — deferring the failure to the moment something
 * actually tries to dial the seam, which is the same moment the deleted
 * global's `getRegisteredCoreApiTransport()` would have thrown.
 */
export function unconfiguredCoreApiTransport(): CoreApiTransport {
	return () => {
		throw new Error(
			"CoreApiPort transport not configured for this composition — pass a real " +
				"CoreApiTransport (built via createInProcessCoreApiTransport/createNetworkCoreApiTransport) " +
				"into the composition root instead of the unconfigured default.",
		);
	};
}
