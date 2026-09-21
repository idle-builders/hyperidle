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
	type CoreApiPort,
	type CoreApiTransport,
	type CreateOrgTeamRequest,
	type InsertRoutineRequest,
	type OrgTeamMembershipView,
	type OrgTeamView,
	type PersistScaffoldedAgentsResponse,
	type RoutineView,
	type ScaffoldFromRequestInput,
	// @lore BB1: UpdateBetRequest deleted — bet is now a root task.
	type UpdateOrgTeamRequest,
	type UpdateRoutineRequest,
	// @lore BB1: CreateBetRequest, CreateBetResponse deleted — bet is now a root task.
	// @lore TaskView/UpdateTaskRequest deleted — the task action list replaces the seam.
	// @lore BC3 architecture.md §5 B4: ConversationMessageType/ConversationThreadView/
	// CreateItemRequest/CreateItemResponse/DirectThreadResponse/InsertMessageRequest/
	// InsertMessageResponse/InsertThreadRequest/InsertThreadResponse/ItemView/
	// UpdateItemRequest/UpdateThreadRequest deleted with the five thread routes and
	// create_item/submit_review/reply.
	// @lore document-module B15: CreateKnowledgeItemRequest/CreateKnowledgeItemResponse/
	// KnowledgeItemVersionView/ReparentKnowledgeItemRequest/UpdateKnowledgeItemContentRequest/
	// UpdateKnowledgeItemContentResponse/UpdateKnowledgeItemContentResult deleted with
	// `CoreApiPort.knowledge` — the writeback dials `edit_document`/`search_documents` now.
	type UserView,
} from "@hyperidle/api-contract";
import { SeamRequestError } from "@hyperidle/domain-model";
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
		readonly "scaffold-request": {
			$post(args: { readonly json: ScaffoldFromRequestInput }): Promise<Response>;
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

/**
 * Throws a uniform, method-attributed error for a non-2xx seam response.
 *
 * @lore BA6: throws `SeamRequestError` (carries `.status` and, when the body
 * is `{ error, code }` JSON, `.code`) rather than a bare `Error` — a caller
 * like `edit_task` needs the route's machine-readable rejection code (e.g.
 * 409 `TASK_CYCLE`) to turn it into a structured `err(code, message)`
 * instead of letting a generic thrown error escape uncaught.
 */
async function throwSeamError(method: string, res: Response): Promise<never> {
	const body = await res.text();
	let code: string | undefined;
	try {
		const parsed: unknown = JSON.parse(body);
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			typeof (parsed as { code?: unknown }).code === "string"
		) {
			code = (parsed as { code: string }).code;
		}
	} catch {
		// Not JSON — code stays undefined, message still carries the raw body.
	}
	throw new SeamRequestError(
		res.status,
		code,
		`CoreApiPort.${method}: request failed (${res.status}): ${body}`,
	);
}

/** GET helper: 404 → `undefined`, non-2xx (incl. auth failures) → throw, else parse JSON. */
async function getOrUndefined<T>(method: string, res: Response): Promise<T | undefined> {
	if (res.status === 404) return undefined;
	if (!res.ok) return throwSeamError(method, res);
	return (await res.json()) as T;
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
		// This port carries no `work` (getItemById/updateItemById/createItem)
		// or `conversation` (getThreadById/insertThread/updateThread/
		// insertMessage/findOrCreateDirectThread/getFirstThreadByHost)
		// capability — `send_message`/`adjust_thread` cover every one of those
		// as an action, never a second HTTP hop through this seam. Task
		// reads/writes (`getTaskById`/`createTask`/`updateTaskById`/
		// `appendTaskNote`/`handoffTask`) are gone too — the three surviving
		// readers bind `openTask` directly to the `open_task` action,
		// in-process.
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
			// No `findSoleHumanUser` — that lookup lives team-scoped, in-process,
			// inside the thread module now.
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

			async createTeam(input: CreateOrgTeamRequest): Promise<void> {
				const res = await client.org.teams.$post({ json: input });
				if (!res.ok) return throwSeamError("org.createTeam", res);
			},

			async updateTeam(teamId: string, patch: UpdateOrgTeamRequest): Promise<void> {
				const res = await client.teams[":teamId"].$patch({ param: { teamId }, json: patch });
				if (!res.ok) return throwSeamError("org.updateTeam", res);
			},

			// No `resolveReviewRecipientsForItem` / `GET /org/review-recipients`
			// — their only callers (`create_item`, `submit_review`) are gone.

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
		// @lore document-module B15: `knowledge` (create/updateKnowledgeItemContent/
		// reparentKnowledgeItem) is DELETED — the writeback processor dials the
		// composed `edit_document`/`search_documents` actions directly now
		// (architecture.md §8.4), never a second HTTP hop through this seam.
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
