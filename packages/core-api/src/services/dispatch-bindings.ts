/**
 * @lore AU19 Increment 3h: `@hyperidle/dispatch`'s `createDispatchOps` needs
 * injected `work`/`routine`/`conversation`/`users`/`settings`/`model-gateway`
 * (ordinary downward), `run-orchestration` (ordinary same-layer, still a port
 * per Mechanism C), and `toolHandlers`/`workspaceFactory` (INTERIM
 * forward-references, wired to still-flat `packages/server` files) ports.
 * This module builds the bound singleton
 * ONCE, at the composition root, so every real call site (`app.ts`,
 * `server-factory.ts`, `routines.ts`, `tools/create-routine.ts`,
 * `tools/create-team.ts`, `routes/routines-routes.ts`,
 * `routes/dispatch-queue-routes.ts`, `routes/teams-routes.ts`, and the many
 * `__tests__` integration tests) imports the already-wired functions
 * unchanged — same factory-curry idiom as `cost-bindings.ts`/
 * `durable-agent-queue.ts`.
 *
 * `toolHandlers`/`workspaceFactory` wire to `tools/assistant-draft-registry.ts`/
 * `harness/local-sandbox-adapter.ts` — still-flat `packages/server` files
 * (not yet migrated, Increment 4). Each opaque-typed port method needs no
 * cast except `buildAssistantDraftRegistry`'s `ctx` (the one documented
 * boundary-crossing cast recovering the real wide `ToolContext` from
 * `DispatchToolContext`'s narrower Mechanism-C mirror — same established
 * idiom as `run-orchestration-bindings.ts`'s casts) — `DispatchToolContext`
 * is otherwise a strict, structurally compatible subset (missing-but-
 * optional fields are simply absent), and `LocalSandboxAdapter`'s zero-arg
 * constructor satisfies `create(): unknown` directly.
 *
 * @lore AU21 §9 Increment 4: `routine`/`review`/`knowledge`/`cost`/
 * `sessionRequests` wiring removed — the routine scheduler + all four
 * builtin-routine bodies relocated to `@hyperidle/routine`'s
 * `routine-scheduler.ts`; their composition root is now
 * `routine-scheduler-bindings.ts`. `routine.insertRoutine` is the one
 * remaining wire (`provisionTeamRoutinesInternal`'s definition-seeding
 * write, out of this increment's relocate-list).
 *
 * @lore AU21 §9 Increment 8 (Decision F1): the `agentSelection` port
 * (`resolveScaffoldSpecs`, `user_assistant` formation) is REMOVED — folded
 * into `@hyperidle/db`'s `resolveAgentScaffoldSpecs`, called directly from
 * `@hyperidle/dispatch`'s own `service.ts` (a leaf import, not a port).
 */

import { findThread, listMessages } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { DispatchPorts } from "@hyperidle/dispatch";
import { createDispatchOps } from "@hyperidle/dispatch";
import { createSandboxAdapter } from "@hyperidle/harness-registry";
import { resolveModel } from "@hyperidle/model-gateway";
import { insertRoutine } from "@hyperidle/routine";
import { readServerConfig } from "@hyperidle/settings";
import type { ToolContext } from "@hyperidle/shared";
import { buildAssistantDraftRegistry } from "@hyperidle/tool-handlers";
import { findUser, getOrCreateUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import {
	buildCoreApiPort,
	getRegisteredCoreApiTransport,
	withActorTransport,
} from "./core-api-port-composition.js";
import { runSession } from "./run-orchestration-composition.js";
import { toolHandlersPorts } from "./tool-handlers-bindings.js";

/**
 * AU21 §9 Increment 2 (conversation wave): builds a fresh in-process
 * `CoreApiPort` per call, wrapped with the given actor's own identity as the
 * route actor (§12) — same factory-curry idiom as
 * `tool-handlers-bindings.ts`'s own `seamPortForActor` (duplicated locally
 * rather than imported cross-composition-root, same precedent as every other
 * `*-bindings.ts` factory in this directory).
 */
function seamPortForActor(actorId: string): ReturnType<typeof buildCoreApiPort> {
	const transport = withActorTransport(getRegisteredCoreApiTransport(), { userId: actorId });
	return buildCoreApiPort(transport);
}

const dispatchPorts: DispatchPorts = {
	work: {
		listTasks: (exec: WriteExecutor, opts: { readonly state: string }) =>
			work.list(exec, "task", { state: opts.state }),
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
	},
	routine: {
		insertRoutine,
	},
	conversation: {
		// AU21 §9 Increment 2 (conversation wave): routes through the CoreApiPort
		// seam — the SAME `POST /threads/:id/messages` route a human caller's
		// client would use — instead of the raw `@hyperidle/conversation`
		// `insertMessage` DI call. The actor derives from `values.senderId`
		// (always the assistant agent's own identity for both real call sites
		// this migration reuses, `service.ts:236,437`) — never a separate param.
		insertMessage: (_exec, values) =>
			seamPortForActor(values.senderId)
				.conversation.insertMessage({
					threadId: values.threadId,
					type: "plain",
					payload: JSON.parse(values.payload) as Record<string, unknown>,
					clientKey: values.clientKey,
				})
				.then(() => undefined),
		listMessagesByThread: (exec, threadId, opts) =>
			listMessages(exec, {
				threadId,
				order: opts?.order,
				dir: opts?.dir,
			}),
		getThreadById: (exec, id) => findThread(exec, { id }),
		// AU21 §9 Increment 2 (conversation wave): routes through the CoreApiPort
		// seam — the SAME new `PATCH /threads/:id` route a human caller's client
		// would use. `actorId` threads the assistant agent's own identity
		// (service.ts's one migrated call site, the pin-after-first-response).
		updateThread: (_exec, id, patch, actorId) =>
			seamPortForActor(actorId).conversation.updateThread(id, {
				...(patch.participants !== undefined
					? { participants: JSON.parse(patch.participants) as readonly string[] }
					: {}),
				...(patch.lastActiveAt !== undefined ? { lastActiveAt: patch.lastActiveAt } : {}),
				...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
			}),
	},
	users: {
		getOrCreateUser,
		getUserById: (db, id) => findUser(db, { id }),
	},
	settings: {
		readServerConfig: async (db) => {
			const cfg = await readServerConfig(db);
			return { cost: { capMinor: cfg.cost.capMinor }, modelGateway: cfg.modelGateway };
		},
	},
	modelGateway: {
		resolveAgentModel: (agent, tierFallback, config, credentialResolver) =>
			resolveModel(
				{ kind: "agent", modelId: agent.modelId, modelProvider: agent.modelProvider, tierFallback },
				config,
				credentialResolver,
			),
		resolveModelTier: (tier, config, credentialResolver) =>
			resolveModel({ kind: "tier", tier }, config, credentialResolver),
	},
	runOrchestration: {
		async executeAgentRunRequest(deps, request, options) {
			const result = await runSession(deps, { mode: "durable", request, ...options });
			if (result.mode !== "completed") throw new Error("Durable dispatch did not complete");
			return result;
		},
	},
	toolHandlers: {
		buildAssistantDraftRegistry: (ctx, params) =>
			buildAssistantDraftRegistry(ctx as ToolContext<HyperIdleDb>, params, toolHandlersPorts),
	},
	workspaceFactory: {
		create: () => createSandboxAdapter("local"),
	},
};

export const dispatchOps = createDispatchOps(dispatchPorts);
