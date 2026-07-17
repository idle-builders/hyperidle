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

import { getThreadById, insertMessage, insertThread } from "@hyperidle/conversation";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { enqueueNotification, findPendingByEventSubject } from "@hyperidle/notifications";
import {
	ApiError,
	createTeam,
	createTeamMembersGroup,
	deleteTeamById,
	deleteTeamMembersGroupById,
	getTeamById,
	getTeamByName,
	getTeamMembersByTeamId,
	listAllTeams,
	loadTeamMembers,
	persistScaffoldedAgents,
	resolveTeamAgentHarness,
	setTeamMembersLeadAgent,
	updateTeamPhase,
	upsertOrgEdge,
} from "@hyperidle/org";
import * as routineService from "@hyperidle/routine";
import { humanizeSchedule } from "@hyperidle/routine";
import type {
	AgentOperationalStatus,
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
import {
	AGENT_ROLE_CATALOG,
	createLogger,
	deriveInitials,
	deriveTitle,
	findRoleCatalogEntry,
} from "@hyperidle/shared";
import {
	getFirstUserByKind,
	getUserById,
	getUsersByIds,
	insertUser,
	listUsersByTeam,
	listUsersByTeamAndKind,
	updateUser,
} from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { desc, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { agentSelectionService } from "../services/agent-selection-bindings.js";
import { provisionTeamRoutines } from "../services/dispatch-bindings.js";
import type { HarnessCapabilityReader } from "../services/harness-capability-read-model.js";
import {
	computeHealthSignals,
	deriveHealthDetail,
	deriveHealthLevel,
	resolveHarnessAvailable,
} from "./agent-profile.js";

// AU19 Increment 1c: `org`'s `OrgUserDirectory` port (Mechanism C), wired to
// the real `user-store.ts` function references unchanged (no behavior change).
const orgUsers = { getUserById, insertUser };

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

/**
 * AB2: Enqueue a health-degraded notification for an agent, unless one is
 * already pending. Throttles by (subjectId + eventType) so a single team
 * page load never floods the queue.
 *
 * @lore AB2: Notification fires on every GET /teams/:id that finds an agent
 * in error state. The "already pending" guard is the dedup/throttle — we check
 * for an existing pending row before inserting, preventing duplicates when the
 * page is refreshed.
 */
async function maybeNotifyAgentError(
	db: HyperIdleDb,
	member: RosterMember,
	teamName: string,
): Promise<void> {
	// Check for existing pending notification for this agent
	const existing = await findPendingByEventSubject(db, "agent.health.degraded", member.agentId);

	if (existing) return; // already pending — throttled

	await enqueueNotification(db, {
		eventType: "agent.health.degraded",
		subjectId: member.agentId,
		severity: "blocking",
		title: `Agent ${member.name} needs attention`,
		body: `${member.name} on team ${teamName}: ${member.healthDetail ?? "Error state detected"}`,
		reason: "agent_health_transition",
		channel: null,
		now: new Date(),
	});
}

const teamsLogger = createLogger({ pkg: "server.teams" });

/**
 * Resolve the founder's userId for org-edge creation.
 * Priority: auth context userId → body userId → first human user → null.
 * Returns null only when the DB has no human users at all (e.g. unseeded test DB).
 */
async function resolveFounderId(
	db: HyperIdleDb,
	ctxUserId: string | undefined,
	bodyUserId: string | undefined,
): Promise<string | null> {
	if (ctxUserId) {
		const u = await getUserById(db, ctxUserId);
		if (u) return u.id;
	}
	if (bodyUserId) {
		const u = await getUserById(db, bodyUserId);
		if (u) return u.id;
	}
	const human = await getFirstUserByKind(db, "human");
	return human?.id ?? null;
}

export function createTeamRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	/** AB2: adapter pool for resolving harness availability per agent. */
	adapterPool?: HarnessCapabilityReader,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — list all teams with portfolio counters
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const allTeams = await listAllTeams(db);

		const result: TeamListItem[] = await Promise.all(
			allTeams.map(async (team) => {
				// Fetch the team_members for this team (may be missing — tolerate gracefully here)
				const memberGroup = await getTeamMembersByTeamId(db, team.id);

				// Count active and completed bets
				const activeBetCount = await work.countBetsByTeamAndStatus(db, team.id, "active");
				const completedCount = await work.countBetsByTeamAndStatus(db, team.id, "completed");

				// Ship rate = completed / (completed + active), expressed as percentage
				const total = completedCount + activeBetCount;
				const shipRate = total === 0 ? "—" : `${Math.round((completedCount / total) * 100)}%`;

				// Progress: sum done/total tasks across active bets
				const activeBetRows = await work.listBetsByTeamAndStatus(db, team.id, "active");

				let progressDone = 0;
				let progressTotal = 0;
				for (const bet of activeBetRows) {
					const taskRows = await work.listTasks(db, { betId: bet.id });
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

				// AA1: routine count for this team (AA2: exclude soft-deleted)
				const routineCount = await routineService.countRoutinesByTeam(db, team.id);

				// AB2: agent summary — count AI agents and compute health warning.
				// Re-use computeHealthSignals for accurate health checks (reviewer S4).
				const teamAgentRows = memberGroup
					? await listUsersByTeamAndKind(db, memberGroup.id, "ai")
					: [];

				const agentCount = teamAgentRows.length;
				let activeAgentCount = 0;
				let agentHealthWarning = false;

				if (agentCount > 0) {
					const teamAgentIds = teamAgentRows.map((a) => a.id);
					// Batch fetch all sessions for all agents
					const allTeamAgentSessions = await db
						.select({
							agentId: sessions.agentId,
							startedAt: sessions.startedAt,
							endedAt: sessions.endedAt,
							state: sessions.state,
							outcome: sessions.outcome,
						})
						.from(sessions)
						.where(inArray(sessions.agentId, teamAgentIds))
						.orderBy(desc(sessions.startedAt));

					// Group by agentId
					const sessMap = new Map<
						string,
						Array<{
							startedAt: string;
							endedAt: string | null;
							state: string | null;
							outcome: string | null;
						}>
					>();
					for (const s of allTeamAgentSessions) {
						if (!s.agentId) continue;
						const bucket = sessMap.get(s.agentId) ?? [];
						bucket.push(s);
						sessMap.set(s.agentId, bucket);
					}

					for (const agentRow of teamAgentRows) {
						const agentSessions = sessMap.get(agentRow.id) ?? [];
						// Count active sessions
						if (agentSessions.some((s) => s.state === "active")) {
							activeAgentCount++;
						}
						// Compute health using the same signals as the profile page (reviewer S4)
						if (!agentHealthWarning) {
							const harnessAvail = resolveHarnessAvailable(
								agentRow.harnessType ?? null,
								adapterPool,
							);
							const signals = computeHealthSignals({
								sessions: agentSessions.map((s) => ({
									startedAt: s.startedAt,
									endedAt: s.endedAt,
									outcome: s.outcome,
								})),
								harnessType: agentRow.harnessType ?? null,
								harnessAvailable: harnessAvail,
							});
							if (signals.degraded) {
								agentHealthWarning = true;
							}
						}
					}
				}

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
					activeAgentCount,
					agentHealthWarning,
				};
			}),
		);

		return c.json({ teams: result });
	});

	// POST / — create a new team with a team_members row and default agents.
	// AU3: app-owned scaffolding produces specs; persistScaffoldedAgents remains the writer.
	// Backward compat: no `functions` in body defaults to ["development","product"].
	// Best-effort welcome message: failure does not roll back team creation.
	router.post("/", requireBoundary({ kind: "public-data" }), async (c) => {
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
		const existingTeam = await getTeamByName(db, name.trim());
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

		await createTeam(db, {
			id: teamId,
			name: name.trim(),
			phase: "build",
			factoryDbPath: typeof repoPath === "string" ? repoPath.trim() || null : null,
			// AE2: store chosen functions as JSON for future reads.
			functions: JSON.stringify(teamFunctions),
			createdAt: now,
			// AV1: persist primary harness as team default — every agent-creation path reads it.
			defaultHarnessType: primaryHarness?.harnessType ?? null,
			defaultModelId: primaryHarness?.modelId ?? null,
			defaultModelProvider: primaryHarness?.modelProvider ?? null,
		});

		await createTeamMembersGroup(db, {
			id: teamMembersId,
			teamId,
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		});

		// AU3: route through app-owned scaffolding for the default roster.
		const specs = await agentSelectionService.resolveScaffoldSpecs({
			db,
			trigger: "team_scaffold",
			teamId,
			teamMembersId,
			teamName: name.trim(),
			functions: teamFunctions,
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		});

		// AE2 AC-1h: If app scaffolding returns zero specs (e.g. unknown functions with no
		// catalog matches), reject with 400 — a team with no agents is invalid.
		// Roll back the already-inserted team + teamMembers rows.
		if (specs.length === 0) {
			await deleteTeamMembersGroupById(db, teamMembersId);
			await deleteTeamById(db, teamId);
			return c.json({ error: "Team functions produced no agents", code: "validation_error" }, 400);
		}

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
		if (leadAgentId) {
			await setTeamMembersLeadAgent(db, teamMembersId, leadAgentId);
		}

		// AH4: upsert founder→team org edge (best-effort — failure must not 500 team creation).
		// @lore AH4: resolveFounderId prefers c.get("userId") (auth-derived) over body userId
		// so a caller cannot create an edge from an arbitrary user by lying in the body.
		{
			const founderId = await resolveFounderId(db, c.get("userId"), userId);
			if (founderId) {
				await upsertOrgEdge(db, {
					fromUserId: founderId,
					mechanism: "team",
					target: teamMembersId,
				});
			} else {
				teamsLogger.warn("AH4: founder not resolved — skipping org edge for new team", {
					teamId,
					teamMembersId,
				});
			}
		}

		// AF17: provision built-in routines for this team — owned by this team's own agents.
		// @lore AF17: routines.team_id must be teams.id (teamId), NOT team_members.id (teamMembersId).
		// ownerByRole is built from the created roster rows in the DB.
		{
			const createdAgents = await listUsersByTeam(db, teamMembersId);
			const ownerByRole: Partial<Record<string, string>> = {};
			for (const agent of createdAgents) {
				if (agent.role && !ownerByRole[agent.role]) {
					ownerByRole[agent.role] = agent.id;
				}
			}
			// AF17: provisioning errors propagate — a team must not be created silently
			// without its automation. If this throws, the caller gets a 500 with details.
			await provisionTeamRoutines(db, {
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
		await getTeamById(db, teamId);

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
				const existingAssistant = await getUserById(db, assistantId);

				// AV1: Resolve the harness the assistant should carry.
				// @lore AV1: The assistant stub may already exist (created by user registration
				// via persistScaffoldedAgents WITHOUT a harness). When team creation supplies a
				// primaryHarness, we must UPDATE the existing stub — the stub was created
				// before the user picked a harness so it defaults to builtin. The UPDATE
				// overwrites that with the team default so the auto-opened overlay opens READY.
				const stubHarness = resolveTeamAgentHarness(primaryHarness, {
					defaultHarnessType: primaryHarness?.harnessType ?? null,
					defaultModelId: primaryHarness?.modelId ?? null,
					defaultModelProvider: primaryHarness?.modelProvider ?? null,
				});

				if (!existingAssistant) {
					// Lookup user name to personalise the assistant name.
					const userRow = await getUserById(db, userId);
					const assistantName = userRow ? `${userRow.name}'s Assistant` : "Assistant";

					await insertUser(db, {
						id: assistantId,
						kind: "ai",
						name: assistantName,
						role: "assistant",
						harnessType: stubHarness?.harnessType ?? "builtin",
						modelId: stubHarness?.modelId ?? "claude-sonnet-4-6",
						modelProvider: stubHarness?.modelProvider ?? "anthropic",
						status: "active",
						createdAt: now,
					});
				} else if (stubHarness !== undefined) {
					// Assistant already exists (created at user registration with no harness).
					// Update it with the team's harness so the overlay opens ready.
					await updateUser(db, assistantId, {
						harnessType: stubHarness.harnessType,
						modelId: stubHarness.modelId,
						modelProvider: stubHarness.modelProvider,
					});
				}

				// Create the thread if it doesn't exist.
				const existingThread = await getThreadById(db, threadId);

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
				const agentRows = await listUsersByTeam(db, teamMembersId);
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

	// POST /:teamId/agents — add an agent to an existing team via app scaffolding.
	// AU3: This route uses app-owned scaffold specs, persistScaffoldedAgents, and emits agent_added.
	router.post("/:teamId/agents", requireBoundary({ kind: "public-data" }), async (c) => {
		const teamId = c.req.param("teamId");

		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}

		const { role, name } = body as { role?: string; name?: string };
		if (!role || typeof role !== "string" || role.trim().length === 0) {
			return c.json({ error: "role is required", code: "validation_error" }, 400);
		}

		// Validate role against catalog
		const catalogEntry = findRoleCatalogEntry(role);
		if (!catalogEntry) {
			return c.json({ error: `Unknown role: ${role}`, code: "validation_error" }, 400);
		}

		// Look up team + membership group
		const team = await getTeamById(db, teamId);
		if (!team) {
			return c.json({ error: "Team not found", code: "not_found" }, 404);
		}
		const memberGroup = await getTeamMembersByTeamId(db, teamId);
		if (!memberGroup) {
			return c.json({ error: "Team membership group not found", code: "not_found" }, 404);
		}

		// AU3: route through app-owned scaffolding for agent_added.
		const specs = await agentSelectionService.resolveScaffoldSpecs({
			db,
			trigger: "agent_added",
			teamId,
			teamMembersId: memberGroup.id,
			teamName: team.name,
			functions: null,
			role,
			// Pass caller-supplied name through (persisted unchanged per add-agent.ts:79 contract).
			name: typeof name === "string" && name.trim().length > 0 ? name.trim() : null,
			ownerUserId: null,
			ownerUserName: null,
		});

		// AV1: read team default so add-agent-later inherits the persisted primary harness.
		// resolveTeamAgentHarness(undefined, team) returns the team default or undefined
		// (→ persistScaffoldedAgents applies builtin fallback at :112-114).
		const addAgentHarness = resolveTeamAgentHarness(undefined, team);
		const { agentIds } = await persistScaffoldedAgents(
			db,
			orgUsers,
			memberGroup.id,
			specs,
			addAgentHarness,
		);
		const agentId = agentIds[0] ?? crypto.randomUUID();
		const now = new Date().toISOString();

		// AK6 T7: emit agent_added event AFTER agent is persisted.
		eventBus.emit({
			type: "agent_added",
			streamId: teamId,
			teamId,
			teamMembersId: memberGroup.id,
			agentId,
			role,
			at: now,
		});

		return c.json({ agentId, role, teamId }, 201);
	});

	// PATCH /:teamId — update team phase (active ↔ archived)
	// P4 AC-18: SettingsTeams needs to toggle team active/archived state.
	router.patch("/:teamId", requireBoundary({ kind: "public-data" }), async (c) => {
		const teamId = c.req.param("teamId");

		const team = await getTeamById(db, teamId);
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
		if (!(phase && (VALID_PHASES as readonly string[]).includes(phase))) {
			return c.json(
				{ error: `phase must be one of: ${VALID_PHASES.join(", ")}`, code: "validation_error" },
				400,
			);
		}

		await updateTeamPhase(db, teamId, phase);

		const updated = await getTeamById(db, teamId);
		if (!updated) {
			return c.json({ error: "Team not found after update", code: "internal_error" }, 500);
		}
		// @lore U2: wrap in { team } to match the expected response shape.
		return c.json({ team: { id: updated.id, name: updated.name, phase: updated.phase } });
	});

	// GET /:teamId — full TeamDetail
	router.get("/:teamId", requireBoundary({ kind: "public-data" }), async (c) => {
		const teamId = c.req.param("teamId");

		// 1. Look up the team
		const team = await getTeamById(db, teamId);
		if (!team) {
			return c.json({ error: "Team not found", code: "not_found" }, 404);
		}

		// 2. Load the team_members row (enforces 1:1 invariant — throws ApiError(500) if broken)
		try {
			const memberGroup = await loadTeamMembers(db, teamId);
			// 3. Load roster
			const agentRows = await listUsersByTeam(db, memberGroup.id);

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

			// AB2: Enrich roster with operational status and health.
			// Batch all session queries with a single IN clause (reviewer W1).
			const agentIds = agentRows.map((a) => a.id);
			if (agentIds.length > 0) {
				// Fetch all sessions for all agents in one query, ordered by startedAt desc
				const allAgentSessions = await db
					.select({
						id: sessions.id,
						agentId: sessions.agentId,
						taskId: sessions.taskId,
						startedAt: sessions.startedAt,
						endedAt: sessions.endedAt,
						state: sessions.state,
						outcome: sessions.outcome,
					})
					.from(sessions)
					.where(inArray(sessions.agentId, agentIds))
					.orderBy(desc(sessions.startedAt));

				// Group sessions by agentId
				const sessionsByAgent = new Map<
					string,
					Array<{
						id: string;
						taskId: string | null;
						startedAt: string;
						endedAt: string | null;
						state: string | null;
						outcome: string | null;
					}>
				>();
				for (const s of allAgentSessions) {
					if (!s.agentId) continue;
					const bucket = sessionsByAgent.get(s.agentId) ?? [];
					bucket.push(s);
					sessionsByAgent.set(s.agentId, bucket);
				}

				// For each roster member, compute operational status + health
				for (const member of roster) {
					const agentSessions = sessionsByAgent.get(member.agentId) ?? [];
					const activeSession = agentSessions.find((s) => s.state === "active") ?? null;

					// Resolve task info for active session
					let activeTaskTitle: string | null = null;
					let activeTaskId: string | null = null;
					let activeBetId: string | null = null;
					if (activeSession?.taskId) {
						const taskRow = await work.getTaskById(db, activeSession.taskId);
						activeTaskTitle = taskRow?.title ?? null;
						activeTaskId = activeSession.taskId;
						activeBetId = taskRow?.betId ?? null;
					}

					// Health signals
					const agentRow = agentRows.find((a) => a.id === member.agentId);
					const harnessAvail = resolveHarnessAvailable(agentRow?.harnessType ?? null, adapterPool);
					const healthSignals = computeHealthSignals({
						sessions: agentSessions.map((s) => ({
							startedAt: s.startedAt,
							endedAt: s.endedAt,
							outcome: s.outcome,
						})),
						harnessType: agentRow?.harnessType ?? null,
						harnessAvailable: harnessAvail,
					});

					// Derive operational status
					const hasActive = activeSession !== null;
					const isError = healthSignals.failureRate7d > 0.5 || healthSignals.lastSessionCrashed;
					const operationalStatus: AgentOperationalStatus = hasActive
						? "active"
						: isError
							? "error"
							: "idle";

					member.operationalStatus = operationalStatus;
					member.activeTaskTitle = activeTaskTitle;
					member.activeTaskId = activeTaskId;
					member.activeBetId = activeBetId;
					member.healthLevel = deriveHealthLevel(healthSignals);
					member.healthDetail = deriveHealthDetail(healthSignals);

					// AB2 AC-6: enqueue notification when agent is in error state
					if (operationalStatus === "error") {
						await maybeNotifyAgentError(db, member, team.name);
					}
				}
			}

			// 4. Load active bets
			const activeBetRows = await work.listBetsByTeamAndStatus(db, teamId, "active");

			// 5. Per active bet, count tasks done/total
			let hasBlockedTask = false;
			const activeBets: BetCardSummary[] = await Promise.all(
				activeBetRows.map(async (bet) => {
					const taskRows = await work.listTasks(db, { betId: bet.id });

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

			// AA3: Sum of active bets' costActualMinor for bet cost breakdown
			const betCostActualMinor = activeBetRows.reduce(
				(sum, bet) => sum + (bet.costActualMinor ?? 0),
				0,
			);

			// AA1: Load routines for this team (AA2: exclude soft-deleted)
			const routineRows = await routineService.listRoutinesByTeam(db, teamId);

			// AA3: Sum of routine runs this calendar month for routine cost breakdown
			// Guard: skip the query when there are no routines (empty IN clause is a SQL error in some dialects)
			let routineCostThisMonthMinor = 0;
			if (routineRows.length > 0) {
				const now3 = new Date();
				const firstOfMonth3 = new Date(
					Date.UTC(now3.getUTCFullYear(), now3.getUTCMonth(), 1),
				).toISOString();
				routineCostThisMonthMinor = await routineService.sumRoutineRunCostForRoutinesSince(
					db,
					routineRows.map((r) => r.id),
					firstOfMonth3,
				);
			}

			// Build agent name map for routine owners
			const ownerIds = [
				...new Set(routineRows.map((r) => r.ownerAgentId).filter(Boolean)),
			] as string[];
			const ownerRows = ownerIds.length > 0 ? await getUsersByIds(db, ownerIds) : [];
			const ownerMap = new Map(ownerRows.map((u) => [u.id, u]));

			// Fetch latest routine_run for each routine to get lastRunOutcome
			const teamRoutines: RoutineCardSummary[] = await Promise.all(
				routineRows.map(async (r) => {
					const [latestRun] = await routineService.listRoutineRunsByRoutine(db, r.id, {
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
						costActual: toWireMoney(r.costActualMinor, r.costActualCurrency),
					};
				}),
			);

			// Sort routines by name asc
			teamRoutines.sort((a, b) => a.name.localeCompare(b.name));

			// 6. Derive team status
			// L17: prefer costCapMinor over legacy costCap
			const teamCostCapMinor = memberGroup.costCapMinor ?? memberGroup.costCap ?? null;
			// @lore AF10 U1: team actual spend lives on teamMembers.costActual (the L17/O2
			// minor-unit accumulator incremented by recordCostAndCheck cost-cap.ts:255).
			// Do NOT confuse with the orphaned costActualMinor-style naming on other tables.
			// tasks.teamId and bets.teamId reference teams.id (domain entity), NOT teamMembers.id.
			// A future multi-currency change must thread factoryCurrency instead of assuming USD.
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
					// AA3: bet vs routine cost breakdown
					betCostActual:
						betCostActualMinor > 0
							? { minor: betCostActualMinor, currency: teamCurrency as CurrencyCode }
							: null,
					routineCostThisMonth:
						routineCostThisMonthMinor > 0
							? { minor: routineCostThisMonthMinor, currency: teamCurrency as CurrencyCode }
							: null,
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
