/**
 * AB1 — GET /api/agents/:id/profile route handler.
 *
 * Returns a complete operational picture of an AI agent in one response:
 * identity, configuration, skills, recent activity, performance, health,
 * and harness capabilities.
 *
 * @lore AB1 A1: Handler is in a separate file (not inlined in agents.ts) to
 * keep agents.ts focused on CRUD. The profile handler is imported and mounted
 * by the agents route factory.
 *
 * @lore AB1 A2: The `status` field on users (active/paused/retired) is config
 * status. Operational status (active/idle/error) is derived on the frontend:
 *   active  = activeSession !== null
 *   error   = recent session crashed (frontend: lastSessionCrashed)
 *   idle    = otherwise
 *
 * @lore AB1: sessions table never had cost columns — no per-session cost
 * field was ever fabricated here. (AU21 Increment 14a: `AgentSessionSummary`
 * carried no `cost` field to begin with here; the cost-cap/accounting
 * feature elsewhere in the codebase is HARD-DELETED, no replacement.)
 *
 * @lore AU26 J4: `activeSession`, `recentSessions`, `performance` and
 * `healthSignals` are GONE from this response, and with them core-api's read of
 * `agent-orchestration`'s `sessions` table. Founder ruling (verbatim): *"its all
 * for UI? thats why orchestration now has an api so that the ui can get the
 * agent run state from the orchestration directly and combine this information
 * in the ui instead of in the core api service."* `AgentProfile.tsx` now fetches
 * `GET /api/agent-orchestration/runs?agent_ids=<id>` and derives all four —
 * using `computeHealthSignals`, which moved to `@hyperidle/domain-model` unchanged, so
 * the health banner, the recent-runs list, the success rate and the live/idle/
 * error chip show exactly what they showed before. What core keeps serving is
 * what core owns: identity, run CONFIG, team, review track record — plus
 * `harnessAvailable`, which is harness-registry state core holds (the adapter
 * pool) and the browser cannot compute.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type {
	AgentHarnessCapabilities,
	AgentProfileResponse,
	AgentReviewTrackRecord,
} from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { HarnessCapabilities } from "@hyperidle/harness-protocol";
import { getTeam } from "@hyperidle/org";
import { findUser } from "@hyperidle/users";
import type { Context } from "hono";
import {
	type HarnessCapabilityReader,
	harnessCapabilitiesForType,
} from "../services/harness-capability-reader.js";
import { computeApprovalRate } from "../services/policy-bindings.js";
import type { AgentIdentityPort } from "./agent-identity.js";

// @lore AU26 J4: `computeHealthSignals`, `deriveHealthLevel` and
// `deriveHealthDetail` moved to `@hyperidle/domain-model` (`agent-run-view.ts`),
// unchanged. They were always pure functions over run rows; they only lived here
// because this route was where the run rows were read. The browser reads them
// now, so the browser runs the functions.

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/agents/:id/profile.
 * Returns AgentProfileResponse for a valid AI agent.
 * Returns 404 for non-existent IDs or human users.
 */
export async function handleAgentProfile(
	c: Context<HyperIdleEnv>,
	db: import("@hyperidle/db").HyperIdleDb,
	adapterPool: HarnessCapabilityReader | undefined,
	agentOrchestration: AgentOrchestrationPort,
	identity: AgentIdentityPort,
): Promise<Response> {
	const agentId = c.req.param("id");
	if (!agentId) {
		return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
	}

	// 1. Fetch the agent (kind='ai', not system)
	const agent = await findUser(db, { id: agentId });

	if (!agent || agent.kind !== "ai") {
		return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
	}

	// @lore AU26 G1 (§D-L): the profile renders run config it does not operate on.
	// The six fields left `users`, so the render reads them from their owner.
	// Existence is still a `users` question — an agent with no `agent_run_config`
	// row renders the defaults, it does not 404.
	// @lore AU31 §2.2: the read crosses the seam (AgentOrchestrationPort.runConfig.read)
	// instead of importing `@hyperidle/run-orchestration` directly — this route stays
	// core-hosted (it gates on `users`), only the persistence spelling changed.
	const runConfig = await agentOrchestration.runConfig.read(agentId);

	// 2. Resolve team name and team ID via teamMembers→teams join
	// @lore AB1 S4: teamId is included in the response so the frontend breadcrumb
	// can link to /work/team/:teamId for team agents instead of always /work/portfolio.
	let teamName: string | null = null;
	let resolvedTeamId: string | null = null;
	if (agent.teamId) {
		// @lore AU44 B1: agent.teamId now references teams.id directly (no two-hop).
		const team = agent.teamId ? await getTeam(db, { id: agent.teamId }) : undefined;
		teamName = team?.name ?? null;
		resolvedTeamId = team?.id ?? null;
	}

	// @lore AU26 J4: steps 3-7 (the `sessions` read, `activeSession`,
	// `recentSessions`, `performance` and `healthSignals`) are DELETED. See this
	// file's header — the browser fetches the runs from the Layer that owns them
	// and derives all four itself.

	// 3. Harness availability — the one health input that is NOT run state.
	const harnessAvailable = resolveHarnessAvailable(runConfig.harnessType, adapterPool);

	// 4. Harness capabilities
	const rawCaps = harnessCapabilitiesForType(adapterPool, runConfig.harnessType);
	const harnessCapabilities = mapCapabilities(rawCaps);

	// 5. Review track record (replaces skills)
	// @lore AD4: Skills removed. Trust is now computed from verdict message history.
	// @lore AU18: `trust_window_days` settability via factory_settings is retired
	// (plan §3/§10 — no production/eval writer ever existed). Fixed default.
	const windowDays = TRUST_WINDOW_DAYS;
	const trackRecordResult = await computeApprovalRate(db, agentId, windowDays, 10);

	const reviewTrackRecord: AgentReviewTrackRecord = {
		approvalRate: trackRecordResult.approvalRate,
		totalVerdicts: trackRecordResult.totalVerdicts,
		recentVerdicts: trackRecordResult.recentVerdicts.map((v) => ({
			decision: v.decision,
			threadId: v.threadId,
			createdAt: v.createdAt,
		})),
		windowDays,
	};

	const profile: AgentProfileResponse = {
		id: agent.id,
		name: agent.name,
		role: agent.role,
		agentCategory: agent.agentCategory ?? null,
		teamName,
		teamId: resolvedTeamId,
		createdAt: agent.createdAt,
		identityDocumentId:
			(await identity.identityIdsFor(db, c.get("userId"), [agentId])).get(agentId) ?? null,
		harnessType: runConfig.harnessType,
		maxConcurrentSessions: runConfig.maxConcurrentSessions,
		mcpSetup: null,
		// @lore AU26 J4: harness availability is NOT run state — it is a fact
		// about the adapter pool this process holds, which the browser has no way
		// to see. It stays server-side and feeds the browser's own
		// `computeHealthSignals` call.
		harnessAvailable,
		harnessCapabilities,
		reviewTrackRecord,
	};

	return c.json(profile);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @lore AU18: was settable via `factory_settings.trust_window_days` — now the fixed default. */
const TRUST_WINDOW_DAYS = 30;

/**
 * Determine if the agent's required harness type is available in the pool.
 *
 * @lore AB1 AC-10: When agent has no harnessType preference (null), any adapter
 * will do — harness is available if the pool has any adapter at all.
 * When agent requires a specific harnessType, check if that type is registered.
 * When no pool is configured (kernel-only mode), always returns true so the
 * profile page doesn't false-alarm in tests that don't pass an adapterPool.
 *
 * @lore AB2: Exported so teams-routes.ts can reuse the same availability logic
 * when computing operational status for each roster member. Avoids duplicating
 * the harness-pool check across two routes.
 */
export function resolveHarnessAvailable(
	harnessType: string | null | undefined,
	adapterPool: HarnessCapabilityReader | undefined,
): boolean {
	if (!adapterPool) return true;
	if (!harnessType) {
		// No preference — any adapter will do
		return adapterPool.size > 0;
	}
	// Specific type required — check if it's registered
	return harnessCapabilitiesForType(adapterPool, harnessType) !== null;
}

/**
 * Map HarnessCapabilities to the UI-friendly AgentHarnessCapabilities shape.
 * When no capabilities are available (null), defaults to all-false.
 */
function mapCapabilities(caps: HarnessCapabilities | null): AgentHarnessCapabilities {
	if (!caps) {
		return {
			toolUse: false,
			mcpSupport: false,
			fileEditing: false,
			subAgents: false,
		};
	}
	return {
		// "tool use" = preCompactionTrigger is a rough proxy for a capable harness
		// A harness with preCompactionTrigger is always tool-capable
		toolUse: caps.preCompactionTrigger,
		mcpSupport: caps.mcpSupport,
		// File editing capability — subAgents implies it indirectly; assume capable
		// if the harness supports subAgents (Claude Code)
		fileEditing: caps.subAgents,
		subAgents: caps.subAgents,
	};
}
