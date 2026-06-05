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

import {
	bets,
	type HyperIdleDb,
	routineRuns,
	routines,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type {
	BetCardSummary,
	CreateTeamRequest,
	CreateTeamResponse,
	CurrencyCode,
	EventBus,
	RosterMember,
	RoutineCardSummary,
	RoutineRunOutcome,
	TeamDetail,
	TeamListItem,
	WireMoney,
} from "@hyperidle/shared";
import { deriveTitle } from "@hyperidle/shared";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { deriveInitials } from "../services/agent-utils.js";
import { humanizeSchedule } from "../services/schedule-label.js";
import { ApiError, loadTeamMembers } from "../services/team-lookup.js";

/**
 * Derive team status from team_members and active bet states.
 *
 * - "blocked" if any active bet has any task in state = 'blocked'
 * - "behind" if active_bets > capacity OR cost_actual >= cost_cap (when cap is set)
 * - "healthy" otherwise
 *
 * L17: compares minor-unit values (costCapMinor prefers over legacy costCap).
 */
function deriveTeamStatus(
	memberGroup: {
		activeBets: number;
		capacity: number;
		costActualMinor: number | null;
		costCapMinor: number | null;
	},
	hasBlockedTask: boolean,
): "healthy" | "behind" | "blocked" {
	if (hasBlockedTask) return "blocked";
	const costActual = memberGroup.costActualMinor ?? 0;
	const overCapacity = memberGroup.activeBets > memberGroup.capacity;
	const overBudget = memberGroup.costCapMinor !== null && costActual >= memberGroup.costCapMinor;
	if (overCapacity || overBudget) return "behind";
	return "healthy";
}

/**
 * Build a WireMoney from minor units + currency, or null if minor is null/undefined.
 */
function toWireMoney(
	minor: number | null | undefined,
	currency: string | null | undefined,
): WireMoney | null {
	if (minor == null) return null;
	return { minor, currency: (currency ?? "USD") as CurrencyCode };
}

export function createTeamRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — list all teams with portfolio counters
	router.get("/", async (c) => {
		const allTeams = await db.select().from(teams);

		const result: TeamListItem[] = await Promise.all(
			allTeams.map(async (team) => {
				// Fetch the team_members for this team (may be missing — tolerate gracefully here)
				const [memberGroup] = await db
					.select()
					.from(teamMembers)
					.where(eq(teamMembers.teamId, team.id))
					.limit(1);

				// Count active and completed bets
				const [activeBetCountRow] = await db
					.select({ count: count() })
					.from(bets)
					.where(and(eq(bets.teamId, team.id), eq(bets.status, "active")));
				const activeBetCount = activeBetCountRow?.count ?? 0;

				const [completedCountRow] = await db
					.select({ count: count() })
					.from(bets)
					.where(and(eq(bets.teamId, team.id), eq(bets.status, "completed")));
				const completedCount = completedCountRow?.count ?? 0;

				// Ship rate = completed / (completed + active), expressed as percentage
				const total = completedCount + activeBetCount;
				const shipRate = total === 0 ? "—" : `${Math.round((completedCount / total) * 100)}%`;

				// Progress: sum done/total tasks across active bets
				const activeBetRows = await db
					.select({ id: bets.id })
					.from(bets)
					.where(and(eq(bets.teamId, team.id), eq(bets.status, "active")));

				let progressDone = 0;
				let progressTotal = 0;
				for (const bet of activeBetRows) {
					const taskRows = await db
						.select({ state: tasks.state })
						.from(tasks)
						.where(eq(tasks.betId, bet.id));
					progressTotal += taskRows.length;
					progressDone += taskRows.filter((t) => t.state === "done").length;
				}

				const leadAgentId = memberGroup?.leadAgentId ?? null;
				const status = memberGroup
					? deriveTeamStatus(
							{
								activeBets: memberGroup.activeBets,
								capacity: memberGroup.capacity,
								// L17: prefer costCapMinor over legacy costCap
								costActualMinor: null, // list route doesn't compute actual spend
								costCapMinor: memberGroup.costCapMinor ?? memberGroup.costCap ?? null,
							},
							false,
						)
					: ("healthy" as const);

				// AA1: routine count for this team
				const [routineCountRow] = await db
					.select({ count: count() })
					.from(routines)
					.where(eq(routines.teamId, team.id));
				const routineCount = routineCountRow?.count ?? 0;

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
				};
			}),
		);

		return c.json({ teams: result });
	});

	// POST / — create a new team with a team_members row and default agents
	router.post("/", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}

		const { name, repoPath } = body as CreateTeamRequest;
		if (!name || typeof name !== "string" || name.trim().length === 0) {
			return c.json({ error: "name is required", code: "validation_error" }, 400);
		}

		const now = new Date().toISOString();
		// @lore U2: ID prefix changed from `product-` to `team-` (domain rename).
		const teamId = `team-${crypto.randomUUID()}`;
		const teamMembersId = `team-${crypto.randomUUID()}`;
		const builderId = `agent-builder-${crypto.randomUUID()}`;
		const pmId = `agent-pm-${crypto.randomUUID()}`;

		await db.insert(teams).values({
			id: teamId,
			name: name.trim(),
			phase: "build",
			factoryDbPath: typeof repoPath === "string" ? repoPath.trim() || null : null,
			createdAt: now,
		});

		await db.insert(teamMembers).values({
			id: teamMembersId,
			teamId,
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		});

		await db.insert(users).values({
			id: builderId,
			kind: "ai",
			name: `${name.trim()} Builder`,
			role: "builder",
			status: "active",
			maxConcurrentSessions: 3,
			teamId: teamMembersId,
			createdAt: now,
		});

		await db.insert(users).values({
			id: pmId,
			kind: "ai",
			name: `${name.trim()} Product Manager`,
			role: "product_manager",
			status: "active",
			maxConcurrentSessions: 1,
			teamId: teamMembersId,
			createdAt: now,
		});

		await db
			.update(teamMembers)
			.set({ leadAgentId: builderId })
			.where(eq(teamMembers.id, teamMembersId));

		const result: CreateTeamResponse = {
			team: { id: teamId, name: name.trim(), phase: "build" },
			teamMembers: { id: teamMembersId },
		};

		return c.json(result, 201);
	});

	// PATCH /:teamId — update team phase (active ↔ archived)
	// P4 AC-18: SettingsTeams needs to toggle team active/archived state.
	router.patch("/:teamId", async (c) => {
		const teamId = c.req.param("teamId");

		const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
		if (!team) {
			return c.json({ error: "Team not found", code: "not_found" }, 404);
		}

		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}

		const { phase } = body as { phase?: string };
		// @lore U2: valid phases per shared/team.ts and docs/requirements.
		// "shape" | "build" | "cool-down" | "live" | "archived"
		const VALID_PHASES = ["shape", "build", "cool-down", "live", "archived"] as const;
		type TeamPhase = (typeof VALID_PHASES)[number];
		if (!(phase && (VALID_PHASES as readonly string[]).includes(phase))) {
			return c.json(
				{ error: `phase must be one of: ${VALID_PHASES.join(", ")}`, code: "validation_error" },
				400,
			);
		}

		await db
			.update(teams)
			.set({ phase: phase as TeamPhase })
			.where(eq(teams.id, teamId));

		const [updated] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
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
		const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
		if (!team) {
			return c.json({ error: "Team not found", code: "not_found" }, 404);
		}

		// 2. Load the team_members row (enforces 1:1 invariant — throws ApiError(500) if broken)
		try {
			const memberGroup = await loadTeamMembers(db, teamId);
			// 3. Load roster
			const agentRows = await db.select().from(users).where(eq(users.teamId, memberGroup.id));

			const roster: RosterMember[] = agentRows.map((agent) => ({
				agentId: agent.id,
				name: agent.name,
				role: agent.role,
				isLead: agent.id === memberGroup.leadAgentId,
			}));

			// Lead first, then by name asc
			roster.sort((a, b) => {
				if (a.isLead && !b.isLead) return -1;
				if (b.isLead && !a.isLead) return 1;
				return a.name.localeCompare(b.name);
			});

			// 4. Load active bets
			const activeBetRows = await db
				.select()
				.from(bets)
				.where(and(eq(bets.teamId, teamId), eq(bets.status, "active")));

			// 5. Per active bet, count tasks done/total
			let hasBlockedTask = false;
			const activeBets: BetCardSummary[] = await Promise.all(
				activeBetRows.map(async (bet) => {
					const taskRows = await db
						.select({ state: tasks.state })
						.from(tasks)
						.where(eq(tasks.betId, bet.id));

					const progressTotal = taskRows.length;
					const progressDone = taskRows.filter((t) => t.state === "done").length;
					if (taskRows.some((t) => t.state === "blocked")) hasBlockedTask = true;

					return {
						id: bet.id,
						// @lore U1: `descriptionTitle` was formerly `pitchTitle`.
						descriptionTitle: deriveTitle(bet.description, bet.id),
						// L17: costAppetite as WireMoney (replaces appetite duration string)
						costAppetite: toWireMoney(bet.costAppetiteMinor, bet.costAppetiteCurrency),
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

			// AA1: Load routines for this team
			const routineRows = await db
				.select()
				.from(routines)
				.where(eq(routines.teamId, teamId))
				.orderBy(routines.id);

			// Build agent name map for routine owners
			const ownerIds = [
				...new Set(routineRows.map((r) => r.ownerAgentId).filter(Boolean)),
			] as string[];
			const ownerRows =
				ownerIds.length > 0
					? await db
							.select()
							.from(users)
							.where(
								sql`${users.id} IN (${sql.join(
									ownerIds.map((id) => sql`${id}`),
									sql`, `,
								)})`,
							)
					: [];
			const ownerMap = new Map(ownerRows.map((u) => [u.id, u]));

			// Fetch latest routine_run for each routine to get lastRunOutcome
			const teamRoutines: RoutineCardSummary[] = await Promise.all(
				routineRows.map(async (r) => {
					const [latestRun] = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, r.id))
						.orderBy(desc(routineRuns.startedAt))
						.limit(1);

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
						costActual: toWireMoney(r.costActualMinor, r.costActualCurrency),
					};
				}),
			);

			// Sort routines by name asc
			teamRoutines.sort((a, b) => a.name.localeCompare(b.name));

			// 6. Derive team status
			// L17: prefer costCapMinor over legacy costCap
			const teamCostCapMinor = memberGroup.costCapMinor ?? memberGroup.costCap ?? null;
			// Compute team actual spend from sessions (via legacy costActual for now)
			const teamCostActualMinor = memberGroup.costActual ?? null;
			const teamStatus = deriveTeamStatus(
				{
					activeBets: memberGroup.activeBets,
					capacity: memberGroup.capacity,
					costActualMinor: teamCostActualMinor,
					costCapMinor: teamCostCapMinor,
				},
				hasBlockedTask,
			);

			// L17: currency for the team defaults to costCapCurrency or "USD"
			const teamCurrency = memberGroup.costCapCurrency ?? "USD";

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
					// L17: return WireMoney|null instead of raw numbers
					costActual:
						teamCostActualMinor != null
							? { minor: teamCostActualMinor, currency: teamCurrency as CurrencyCode }
							: null,
					costCap: toWireMoney(teamCostCapMinor, teamCurrency),
					capacity: memberGroup.capacity,
					activeBets: memberGroup.activeBets,
				},
				activeBets,
				routines: teamRoutines,
			};

			return c.json(detail);
		} catch (err) {
			if (err instanceof ApiError) {
				return c.json({ error: err.message, code: err.code }, err.status as 500);
			}
			throw err;
		}
	});

	return router;
}
