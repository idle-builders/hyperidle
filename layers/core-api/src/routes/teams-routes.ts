/**
 * U2 — /api/teams routes: composite team+teamMembers detail endpoint.
 *
 * GET /teams         — list of all teams with portfolio counters
 * GET /teams/:id     — full TeamDetail for a single team
 * POST /teams        — create a new team with teamMembers + default agents
 * PATCH /teams/:id   — update team phase
 *
 * @lore L13: The 500 on missing team_members (loadTeamMembers) is intentional. A
 * team without a team_members row is a programming bug. It surfaces loudly via the
 * standard ApiErrorResponse envelope.
 *
 * @lore U1: Renamed from products.ts. All `products` references -> `teams`.
 * All `Product*` types -> `Team*`. `loadProductTeam` -> `loadTeamMembers`.
 * `pitchTitle` -> `descriptionTitle`. `deriveTitleFromPitch` -> `deriveTitle`.
 *
 * @lore U2: Mounted at /api/teams (renamed from /api/products). ID prefix changed
 * from `product-` to `team-` for consistency with the domain rename.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { findThread, insertMessage, insertThread } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import type {
	BetCardSummary,
	CreateTeamRequest,
	CreateTeamResponse,
	RosterMember,
	RoutineCardSummary,
	RoutineRunOutcome,
	TeamDetail,
	TeamListItem,
} from "@hyperidle/domain-model";
import { AGENT_ROLE_CATALOG } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { resolveAgentScaffoldSpecs } from "@hyperidle/factory-defaults";
import type { HarnessCapabilityReader } from "@hyperidle/harness-protocol";
import type { HyperIdleEnv } from "@hyperidle/http-middleware";
import {
	createTeam,
	getTeam,
	getTeamMembers,
	listTeams,
	persistScaffoldedAgents,
	updateTeam,
} from "@hyperidle/org";
import { deriveTitle } from "@hyperidle/presentation-format";
import * as routineService from "@hyperidle/routine";
import { humanizeSchedule } from "@hyperidle/routine";
import { findUser, insertUser, listUsers } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { Hono } from "hono";
import { buildSeamBackedAgentRunConfigWriter } from "../services/agent-orchestration-port-composition.js";
import { resolveHarnessAvailable } from "./agent-profile.js";

/** Inlined from @hyperidle/presentation-format (server copy removed, row 18). */
function deriveInitials(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) return "?";
	return trimmed.slice(0, 2).toUpperCase();
}

/**
 * Derive team status from team_members and active bet states.
 *
 * - "blocked" if any active bet has any task in state = 'blocked'
 * - "behind" if active_bets > capacity
 * - "healthy" otherwise
 *
 * @lore AU21 Increment 14a: this used to also flip to "behind" on
 * `cost_actual >= cost_cap` — the cost-cap feature is HARD-DELETED (founder,
 * no replacement); status now derives from capacity + blocked tasks only.
 */
function deriveTeamStatus(
	memberGroup: {
		activeBets: number;
		capacity: number;
	},
	hasBlockedTask: boolean,
): "healthy" | "behind" | "blocked" {
	if (hasBlockedTask) return "blocked";
	const overCapacity = memberGroup.activeBets > memberGroup.capacity;
	if (overCapacity) return "behind";
	return "healthy";
}

export function createTeamRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	/** AB2: adapter pool for resolving harness availability per agent. */
	adapterPool?: HarnessCapabilityReader,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// AU19 Increment 1c: `org`'s `OrgUserDirectory` port (Mechanism C), wired to
	// the real `user-store.ts` function references unchanged (no behavior change).
	// AU26 G1 (§D-L) / AU31 §2.2: `persistScaffoldedAgents` also stamps the run
	// config, reached through the seam (`buildSeamBackedAgentRunConfigWriter`)
	// instead of a direct `@hyperidle/agent-run-config` import.
	const orgUsers = {
		getUserById: (db2: HyperIdleDb, id: string) => findUser(db2, { id }),
		insertUser,
		...buildSeamBackedAgentRunConfigWriter(agentOrchestration),
	};

	// GET / — list all teams with portfolio counters
	router.get("/", async (c) => {
		const allTeams = await listTeams(db);

		const result: TeamListItem[] = await Promise.all(
			allTeams.map(async (team) => {
				// Fetch the team_members for this team (may be missing — tolerate gracefully here)
				const memberGroup = await getTeamMembers(db, { teamId: team.id });

				// Count active and completed bets
				const activeBetCount = await work.list(db, "bet", {
					teamId: team.id,
					status: "active",
					count: true,
				});
				const completedCount = await work.list(db, "bet", {
					teamId: team.id,
					status: "completed",
					count: true,
				});

				// Ship rate = completed / (completed + active), expressed as percentage
				const total = completedCount + activeBetCount;
				const shipRate = total === 0 ? "—" : `${Math.round((completedCount / total) * 100)}%`;

				// Progress: sum done/total tasks across active bets
				const activeBetRows = await work.list(db, "bet", { teamId: team.id, status: "active" });

				let progressDone = 0;
				let progressTotal = 0;
				for (const bet of activeBetRows) {
					const taskRows = await work.list(db, "task", { betId: bet.id });
					progressTotal += taskRows.length;
					progressDone += taskRows.filter((t) => t.state === "done").length;
				}

				const leadAgentId = memberGroup?.leadAgentId ?? null;
				const status = memberGroup
					? deriveTeamStatus(
							{
								activeBets: memberGroup.activeBets,
								capacity: memberGroup.capacity,
							},
							false,
						)
					: ("healthy" as const);

				// AA1: routine count for this team (AA2: exclude soft-deleted)
				const routineCount = (await routineService.listRoutines(db, { teamId: team.id })).length;

				// AB2: agent summary — count AI agents.
				//
				// @lore AU26 J1: `activeAgentCount` and `agentHealthWarning` are
				// DELETED, and with them the batched `sessions` read and the
				// `readAgentRunConfigs` call that existed only to feed the health
				// computation. Both fields had ZERO production readers — the only hits
				// were `.stories.tsx`/`__tests__` fixtures and
				// `sortTeamsByAttention.ts:7`, a comment stating the simplified row
				// deliberately does NOT use `agentHealthWarning`. `agentCount` is a
				// `users` read (core's own table) and stays.
				const teamAgentRows = memberGroup
					? await listUsers(db, { teamIds: [memberGroup.id], kind: "ai" })
					: [];

				const agentCount = teamAgentRows.length;

				return {
					id: team.id,
					name: team.name,
					phase: team.phase,
					status,
					leadAgentId,
					activeBets: activeBetCount,
					shipped: completedCount,
					shipRate,
					progress: { done: progressDone, total: progressTotal },
					routineCount,
					agentCount,
				};
			}),
		);

		return c.json({ teams: result });
	});

	// POST / — create a new team with a team_members row and default agents.
	// AU3: app-owned scaffolding produces specs; persistScaffoldedAgents remains the writer.
	// Backward compat: no `functions` in body defaults to ["development","product"].
	// Best-effort welcome message: failure does not roll back team creation.
	router.post("/", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}

		const { name, repoPath, functions, userId, primaryHarness } = body as CreateTeamRequest;
		if (!name || typeof name !== "string" || name.trim().length === 0) {
			return c.json({ error: "name is required", code: "validation_error" }, 400);
		}

		// AF15 AC-4: Idempotency guard — if a team with this name already exists, return it.
		// Re-running setup with the same name must not duplicate the team.
		// @lore AF15: Changed from "any team" to "same-name" check (AK6) because the
		// AK6 strategy-swap test creates two teams with different names in one session.
		// The "same-name" guard still prevents duplicate setup teams (same name = same
		// team) while allowing the test to create a second team with a different name.
		const existingTeam = await getTeam(db, { name: name.trim() });
		if (existingTeam) {
			return c.json(existingTeam, 200);
		}

		// AE2: resolve team functions — default to ["development","product"] for backward compat.
		const teamFunctions: string[] =
			Array.isArray(functions) && functions.length > 0 ? functions : ["development", "product"];

		const now = new Date().toISOString();
		// @lore U2: ID prefix changed from `product-` to `team-` (domain rename).
		const teamId = `team-${crypto.randomUUID()}`;
		const teamMembersId = `team-${crypto.randomUUID()}`;

		// AU3: route through app-owned scaffolding for the default roster.
		// Resolved BEFORE inserting the team so an empty-specs result (unknown functions
		// with no catalog matches) aborts with 400 without any DB writes — no rollback needed.
		const specs = resolveAgentScaffoldSpecs({
			trigger: "team_scaffold",
			teamName: name.trim(),
			functions: teamFunctions,
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		});

		// AE2 AC-1h: If app scaffolding returns zero specs (e.g. unknown functions with no
		// catalog matches), reject with 400 — a team with no agents is invalid.
		if (specs.length === 0) {
			return c.json({ error: "Team functions produced no agents", code: "validation_error" }, 400);
		}

		// @lore AU20 Am7: atomic createTeam inserts teams + teamMembers companion in one call.
		await db.transaction(async (tx) => {
			await createTeam(tx, {
				id: teamId,
				name: name.trim(),
				phase: "build",
				factoryDbPath: typeof repoPath === "string" ? repoPath.trim() || null : null,
				// AE2: store chosen functions as JSON for future reads.
				functions: JSON.stringify(teamFunctions),
				createdAt: now,
				// teamMembers companion (1:1)
				teamMembersId,
				capacity: 5,
				activeBets: 0,
				formedAt: now,
			});
		});

		// AK6: Kernel persists the specs (single writer, assigns ids, attaches mechanism fields).
		// POLISH-060 B3: Thread primaryHarness from the request so onboarding-chosen harness propagates.
		const { agentIds, leadAgentId } = await persistScaffoldedAgents(
			db,
			orgUsers,
			teamMembersId,
			specs,
			primaryHarness,
		);

		// Set lead agent on team_members.
		// @lore AU20 Am7: updateTeam(teamId, {leadAgentId}) replaces setTeamMembersLeadAgent.
		if (leadAgentId) {
			await updateTeam(db, teamId, { leadAgentId });
		}

		// AF17: provision built-in routines for this team — owned by this team's own agents.
		// @lore AF17: routines.team_id must be teams.id (teamId), NOT team_members.id (teamMembersId).
		// ownerByRole is built from the created roster rows in the DB.
		{
			const createdAgents = await listUsers(db, { teamIds: [teamMembersId] });
			const ownerByRole: Partial<Record<string, string>> = {};
			for (const agent of createdAgents) {
				if (agent.role && !ownerByRole[agent.role]) {
					ownerByRole[agent.role] = agent.id;
				}
			}
			// AF17: provisioning errors propagate — a team must not be created silently
			// without its automation. If this throws, the caller gets a 500 with details.
			await routineService.provisionTeamRoutines(db, {
				teamId,
				ownerByRole,
				leadAgentId: leadAgentId ?? agentIds[0] ?? "",
			});
		}

		// AK6 T6: emit team_created event AFTER all agents are persisted.
		eventBus.emit({
			type: "team_created",
			streamId: teamId,
			teamId,
			teamMembersId,
			functions: teamFunctions,
			agentIds,
			at: now,
		});

		// @lore AK6 T6: A post-emit await is needed so async event handlers
		// (test spies that query the DB) complete before the response is sent.
		// The read below is a no-op read that takes ~0ms but creates the
		// await boundary PGlite needs to resolve pending handler promises.
		// Production handlers are sync — the overhead is one lightweight SELECT.
		await getTeam(db, { id: teamId });

		// AE2: seed welcome message in assistant thread when userId is provided.
		// Best-effort: failure does not roll back team creation.
		if (typeof userId === "string" && userId.length > 0) {
			try {
				const threadId = `thr-ast-${userId}`;
				const assistantId = `ast-${userId}`;
				const participantsList = [userId, assistantId].sort();

				// Ensure the assistant agent exists (may not yet exist for new users).
				// @lore AE2: The assistant agent is normally created at user registration.
				// During onboarding, team creation may happen before the assistant agent
				// is created — we upsert a stub here so the FK on messages.senderId succeeds.
				const existingAssistant = await findUser(db, { id: assistantId });

				// AV1: Resolve the harness the assistant should carry.
				// @lore AV1: The assistant stub may already exist (created by user registration
				// via persistScaffoldedAgents WITHOUT a harness). When team creation supplies a
				// primaryHarness, we must UPDATE the existing stub — the stub was created
				// before the user picked a harness so it defaults to builtin. The UPDATE
				// overwrites that with the team default so the auto-opened overlay opens READY.
				// @lore AU20 Am7: resolveTeamAgentHarness removed from barrel; when primaryHarness
				// is supplied it IS the resolved harness; when absent, undefined (builtin fallback).
				const stubHarness = primaryHarness ?? undefined;

				if (!existingAssistant) {
					// Lookup user name to personalise the assistant name.
					const userRow = await findUser(db, { id: userId });
					const assistantName = userRow ? `${userRow.name}'s Assistant` : "Assistant";

					// @lore AU26 G1 (§D-L): the harness triple left `users`, so the
					// stub's identity row and its run config are two writes now.
					// AU31 §3.1 site 3 — RELINQUISHED (founder ruling, architecture.md
					// §3.1/§13 item 9): the seam write can never join a caller's
					// transaction (§3.2), so `insertUser` commits alone and
					// `runConfig.write` follows. This whole block already sits inside
					// the caller's best-effort try/catch (welcome-message seeding), so
					// a failure here was always non-fatal to team creation.
					await insertUser(db, {
						id: assistantId,
						kind: "ai",
						name: assistantName,
						role: "assistant",
						status: "active",
						createdAt: now,
					});
					await agentOrchestration.runConfig.write(assistantId, {
						harnessType: stubHarness?.harnessType ?? "builtin",
						modelId: stubHarness?.modelId ?? "claude-sonnet-4-6",
						modelProvider: stubHarness?.modelProvider ?? "anthropic",
					});
				} else if (stubHarness !== undefined) {
					// Assistant already exists (created at user registration with no harness).
					// Update it with the team's harness so the overlay opens ready.
					await agentOrchestration.runConfig.write(assistantId, {
						harnessType: stubHarness.harnessType,
						modelId: stubHarness.modelId,
						modelProvider: stubHarness.modelProvider,
					});
				}

				// Create the thread if it doesn't exist.
				const existingThread = await findThread(db, { id: threadId });

				if (!existingThread) {
					await insertThread(db, {
						id: threadId,
						hostKind: "user",
						hostId: userId,
						initiatorId: userId,
						participants: JSON.stringify(participantsList),
						pinned: true,
						lastActiveAt: now,
						createdAt: now,
					});
				}

				// Build agent names list for welcome message text.
				// Use the persisted roster from DB (app-decided set).
				const agentRows = await listUsers(db, { teamIds: [teamMembersId] });
				const agentLabels = agentRows
					.map(({ role }) => {
						const entry = AGENT_ROLE_CATALOG.find((e) => e.role === role);
						return entry?.label ?? role;
					})
					.join(", ");

				const welcomeText = `Welcome! Your team is ready with ${agentIds.length} agent${agentIds.length !== 1 ? "s" : ""}: ${agentLabels}. I'm here to help you steer them.`;

				await insertMessage(db, {
					id: `msg-welcome-${crypto.randomUUID()}`,
					senderId: assistantId,
					threadId,
					type: "plain",
					payload: JSON.stringify({ text: welcomeText }),
					clientKey: `welcome-${teamId}`,
					createdAt: now,
				});
			} catch {
				// Best-effort: ignore welcome message failures.
			}
		}

		const result: CreateTeamResponse = {
			team: { id: teamId, name: name.trim(), phase: "build" },
			teamMembers: { id: teamMembersId },
		};

		return c.json(result, 201);
	});

	// PATCH /:teamId — update team phase (active ↔ archived)
	// P4 AC-18: SettingsTeams needs to toggle team active/archived state.
	// @lore AU21 §9 Increment 2: extended to also accept `leadAgentId` — the
	// `CoreApiPort.org.updateTeam` seam method's ONE real call site
	// (`create_team`'s `updateTeam(teamId, {leadAgentId})`) needs exactly this
	// field, alongside the pre-existing `phase` toggle. At least one of the
	// two must be present.
	router.patch("/:teamId", async (c) => {
		const teamId = c.req.param("teamId");

		const team = await getTeam(db, { id: teamId });
		if (!team) {
			return c.json({ error: "Team not found", code: "not_found" }, 404);
		}

		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}

		const { phase, leadAgentId } = body as { phase?: string; leadAgentId?: string };
		// @lore U2: valid phases per shared/team.ts and docs/requirements.
		// "shape" | "build" | "cool-down" | "live" | "archived"
		const VALID_PHASES = ["shape", "build", "cool-down", "live", "archived"] as const;
		if (phase !== undefined && !(VALID_PHASES as readonly string[]).includes(phase)) {
			return c.json(
				{ error: `phase must be one of: ${VALID_PHASES.join(", ")}`, code: "validation_error" },
				400,
			);
		}
		if (phase === undefined && leadAgentId === undefined) {
			return c.json(
				{ error: "at least one of phase or leadAgentId is required", code: "validation_error" },
				400,
			);
		}

		// @lore AU20 Am7: updateTeam(teamId, {phase}) replaces updateTeamPhase.
		await updateTeam(db, teamId, {
			...(phase !== undefined ? { phase } : {}),
			...(leadAgentId !== undefined ? { leadAgentId } : {}),
		});

		const updated = await getTeam(db, { id: teamId });
		if (!updated) {
			return c.json({ error: "Team not found after update", code: "internal_error" }, 500);
		}
		// @lore U2: wrap in { team } to match the expected response shape.
		return c.json({ team: { id: updated.id, name: updated.name, phase: updated.phase } });
	});

	// GET /:teamId — full TeamDetail
	router.get("/:teamId", async (c) => {
		const teamId = c.req.param("teamId");

		// 1. Look up the team
		const team = await getTeam(db, { id: teamId });
		if (!team) {
			return c.json({ error: "Team not found", code: "not_found" }, 404);
		}

		// 2. Load the team_members row (enforces 1:1 invariant — throws ApiError(500) if broken)
		try {
			const memberGroup = await getTeamMembers(db, { teamId }, { require: true });
			// 3. Load roster
			const agentRows = await listUsers(db, { teamIds: [memberGroup.id] });

			const roster: RosterMember[] = agentRows.map((agent) => ({
				agentId: agent.id,
				name: agent.name,
				role: agent.role,
				isLead: agent.id === memberGroup.leadAgentId,
				agentCategory: agent.agentCategory ?? null, // AB3
			}));

			// Lead first, then by name asc
			roster.sort((a, b) => {
				if (a.isLead && !b.isLead) return -1;
				if (b.isLead && !a.isLead) return 1;
				return a.name.localeCompare(b.name);
			});

			// AB2: the roster's harness availability. Nothing else — this route
			// reads no run state at all.
			//
			// @lore AU26 J4: `operationalStatus`, `activeTaskTitle`, `activeTaskId`,
			// `activeBetId`, `healthLevel` and `healthDetail` are GONE from this
			// response. Every one was derived here from `agent-orchestration`'s
			// `sessions` table purely to render the roster. Founder ruling: *"its all
			// for UI? thats why orchestration now has an api so that the ui can get
			// the agent run state from the orchestration directly and combine this
			// information in the ui instead of in the core api service."*
			// `WorkTeam.tsx` fetches
			// `GET /api/agent-orchestration/runs?agent_ids=…` for the roster and
			// derives all six with the same `computeHealthSignals`/`deriveHealthLevel`/
			// `deriveHealthDetail` (now in `@hyperidle/domain-model`), so the page renders
			// identically. `harnessAvailable` stays server-side: it is a fact about
			// this process's adapter pool, not run state, and the browser cannot see it.
			//
			// @lore AU26: the batched `sessions` read that used to sit here is GONE,
			// and with it core-api's LAST read of an `agent-orchestration` table.
			// It survived J4 only because this GET also enqueued the
			// `agent.health.degraded` notification (`maybeNotifyAgentError`) — a real
			// core-side use of run state, not a render, so deleting it then would
			// have been a feature deletion. The founder ruled the feature should be
			// event-driven instead: `services/agent-health-session-end-reactions.ts`
			// now reacts to a crashed `session_ended` and counts the notification
			// system's own rows. The feature got better (it fires when the agent
			// breaks, not when a human opens a page), the GET stopped writing, and
			// the read had nothing left to justify it.
			const agentIds = agentRows.map((a) => a.id);
			if (agentIds.length > 0) {
				// @lore AU26 G1 (§D-L) / AU31 §2.2: harness type reads from `agent_run_config`
				// through the seam.
				const rosterRunConfigs = await agentOrchestration.runConfig.readBatch(agentIds);
				for (const member of roster) {
					const memberHarnessType = rosterRunConfigs.get(member.agentId)?.harnessType ?? null;
					member.harnessAvailable = resolveHarnessAvailable(memberHarnessType, adapterPool);
				}
			}

			// 4. Load active bets
			const activeBetRows = await work.list(db, "bet", { teamId: teamId, status: "active" });

			// 5. Per active bet, count tasks done/total
			let hasBlockedTask = false;
			const activeBets: BetCardSummary[] = await Promise.all(
				activeBetRows.map(async (bet) => {
					const taskRows = await work.list(db, "task", { betId: bet.id });

					const progressTotal = taskRows.length;
					const progressDone = taskRows.filter((t) => t.state === "done").length;
					if (taskRows.some((t) => t.state === "blocked")) hasBlockedTask = true;

					return {
						id: bet.id,
						// @lore U1: `descriptionTitle` was formerly `pitchTitle`.
						descriptionTitle: deriveTitle(bet.description, bet.id),
						status: bet.status as "active",
						progressDone,
						progressTotal,
					};
				}),
			);

			// Sort bets by createdAt desc
			activeBets.sort((a, b) => {
				const aRow = activeBetRows.find((r) => r.id === a.id);
				const bRow = activeBetRows.find((r) => r.id === b.id);
				if (!(aRow && bRow)) return 0;
				return bRow.createdAt.localeCompare(aRow.createdAt);
			});

			// AA1: Load routines for this team (AA2: exclude soft-deleted)
			const routineRows = await routineService.listRoutines(db, { teamId });

			// Build agent name map for routine owners
			const ownerIds = [
				...new Set(routineRows.map((r) => r.ownerAgentId).filter(Boolean)),
			] as string[];
			const ownerRows = ownerIds.length > 0 ? await listUsers(db, { ids: ownerIds }) : [];
			const ownerMap = new Map(ownerRows.map((u) => [u.id, u]));

			// Fetch latest routine_run for each routine to get lastRunOutcome
			const teamRoutines: RoutineCardSummary[] = await Promise.all(
				routineRows.map(async (r) => {
					const [latestRun] = await routineService.listRoutineRuns(db, {
						routineId: r.id,
						limit: 1,
						order: "desc",
					});

					const owner = ownerMap.get(r.ownerAgentId);
					const agentName = owner?.name ?? r.ownerAgentId;

					return {
						id: r.id,
						name: r.name,
						state: (r.state ?? "active") as RoutineCardSummary["state"],
						scheduleLabel: humanizeSchedule(r.triggerType, r.triggerConfig ?? null),
						agentName,
						agentInitials: deriveInitials(agentName),
						lastRunAt: r.lastRunAt ?? null,
						lastRunOutcome: (latestRun?.outcome ?? null) as RoutineRunOutcome | null,
						nextRunAt: r.nextRunAt ?? null,
					};
				}),
			);

			// Sort routines by name asc
			teamRoutines.sort((a, b) => a.name.localeCompare(b.name));

			// 6. Derive team status
			const teamStatus = deriveTeamStatus(
				{
					activeBets: memberGroup.activeBets,
					capacity: memberGroup.capacity,
				},
				hasBlockedTask,
			);

			const detail: TeamDetail = {
				team: {
					id: team.id,
					name: team.name,
					phase: team.phase,
					status: teamStatus,
					leadAgentId: memberGroup.leadAgentId ?? null,
				},
				teamMembers: {
					id: memberGroup.id,
					formedAt: memberGroup.formedAt,
					dissolvedAt: memberGroup.dissolvedAt ?? null,
				},
				roster,
				burn: {
					capacity: memberGroup.capacity,
					activeBets: memberGroup.activeBets,
				},
				activeBets,
				routines: teamRoutines,
			};

			return c.json(detail);
		} catch (err) {
			// @lore AU20 R-org: ApiError is unexported from @hyperidle/org (internal
			// invariant-enforcement class). Duck-type on err.name to surface the
			// status/code without an instanceof import.
			if (err instanceof Error && err.name === "ApiError" && "status" in err && "code" in err) {
				const apiErr = err as Error & { status: number; code: string };
				return c.json({ error: apiErr.message, code: apiErr.code }, apiErr.status as 500);
			}
			throw err;
		}
	});

	return router;
}
