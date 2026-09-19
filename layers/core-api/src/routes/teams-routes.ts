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
import type { HyperIdleDb } from "@hyperidle/db";
import type {
	CreateTeamRequest,
	CreateTeamResponse,
	RosterMember,
	RoutineCardSummary,
	RoutineRunOutcome,
	TaskCardSummary,
	TeamDetail,
	TeamListItem,
} from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { upsertAgentIdentity } from "@hyperidle/knowledge";
import {
	createTeam,
	getTeam,
	listTeams,
	persistScaffoldedAgents,
	resolveAgentScaffoldSpecs,
	updateTeam,
	upsertOrgEdge,
} from "@hyperidle/org";
import * as routineService from "@hyperidle/routine";
import { humanizeSchedule } from "@hyperidle/routine";
import * as work from "@hyperidle/task";
import { findUser, insertUser, listUsers } from "@hyperidle/users";
import { Hono } from "hono";
import type { SendMessageRunFn } from "../actions/action.js";
import { buildSeamBackedAgentRunConfigWriter } from "../services/agent-orchestration-port-composition.js";
import type { HarnessCapabilityReader } from "../services/harness-capability-reader.js";
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
		// BB1: renamed from activeBets to tasksInProgress — root tasks in_progress.
		tasksInProgress: number;
		capacity: number;
	},
	hasBlockedTask: boolean,
): "healthy" | "behind" | "blocked" {
	if (hasBlockedTask) return "blocked";
	const overCapacity = memberGroup.tasksInProgress > memberGroup.capacity;
	if (overCapacity) return "behind";
	return "healthy";
}

/**
 * Resolve the founder for a founder→team org edge.
 *
 * Prefers the auth-derived user over anything in the body, so a caller cannot
 * create an edge from an arbitrary user by lying in the request.
 */
async function resolveFounderId(
	db: HyperIdleDb,
	ctxUserId: string | undefined,
	bodyUserId: string | undefined,
): Promise<string | null> {
	if (ctxUserId) {
		const u = await findUser(db, { id: ctxUserId });
		if (u) return u.id;
	}
	if (bodyUserId) {
		const u = await findUser(db, { id: bodyUserId });
		if (u) return u.id;
	}
	const human = await findUser(db, { kind: "human" });
	return human?.id ?? null;
}

export function createTeamRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	/**
	 * BC3 architecture.md §5 B5: the composed `send_message` action's own bound
	 * `run`, so the welcome message is posted through the thread module
	 * instead of a raw `insertThread`/`insertMessage` into the literal id
	 * `thr-ast-${userId}` — `app.ts` extracts it from the action list exactly
	 * as it does for `editTask`/`adjustThread`.
	 */
	sendMessage: SendMessageRunFn,
	/** AB2: adapter pool for resolving harness availability per agent. */
	adapterPool?: HarnessCapabilityReader,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// AU19 Increment 1c: `org`'s `OrgUserDirectory` port (Mechanism C), wired to
	// the real `user-store.ts` function references unchanged (no behavior change).
	// AU26 G1 (§D-L) / AU31 §2.2: `persistScaffoldedAgents` also stamps the run
	// config, reached through the seam (`buildSeamBackedAgentRunConfigWriter`)
	// instead of a direct `@hyperidle/run-orchestration` import.
	const orgUsers = {
		getUserById: (db2: HyperIdleDb, id: string) => findUser(db2, { id }),
		insertUser,
		...buildSeamBackedAgentRunConfigWriter(agentOrchestration),
		upsertAgentIdentity,
	};

	// GET / — list all teams with portfolio counters
	router.get("/", async (c) => {
		const allTeams = await listTeams(db);

		const result: TeamListItem[] = await Promise.all(
			allTeams.map(async (team) => {
				// BB1: bets are now root tasks (parentTaskId: null). Active = in_progress; completed = done.
				const activeBetCount = await work.list(db, "task", {
					teamId: team.id,
					parentTaskId: null,
					state: "in_progress",
					count: true,
				});
				const completedCount = await work.list(db, "task", {
					teamId: team.id,
					parentTaskId: null,
					state: "done",
					count: true,
				});

				// Ship rate = completed / (completed + active), expressed as percentage
				const total = completedCount + activeBetCount;
				const shipRate = total === 0 ? "—" : `${Math.round((completedCount / total) * 100)}%`;

				// Progress: sum done/total tasks across active root tasks
				const activeRootRows = await work.list(db, "task", {
					teamId: team.id,
					parentTaskId: null,
					state: "in_progress",
				});

				let progressDone = 0;
				let progressTotal = 0;
				for (const rootTask of activeRootRows) {
					const taskRows = await work.list(db, "task", { parentTaskId: rootTask.id });
					progressTotal += taskRows.length;
					progressDone += taskRows.filter((t) => t.state === "done").length;
				}

				const leadAgentId = team.leadAgentId ?? null;
				const status = deriveTeamStatus(
					{
						tasksInProgress: activeBetCount,
						capacity: team.capacity,
					},
					false,
				);

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
				const teamAgentRows = await listUsers(db, { teamIds: [team.id], kind: "ai" });

				const agentCount = teamAgentRows.length;

				// BA1 D5: a routine has no team_id — its team is derived from its
				// owner agent. `routine-service.ts`'s `@lore AU13 §A2/A9` forbids a
				// foreign join inside the routine service, so this route resolves
				// the team's agent ids first and passes them in.
				// AA2: exclude soft-deleted (listRoutines' default).
				const routineCount = (
					await routineService.listRoutines(db, {
						ownerAgentIds: teamAgentRows.map((agent) => agent.id),
					})
				).length;

				return {
					id: team.id,
					name: team.name,
					phase: team.phase,
					status,
					leadAgentId,
					// BB1: activeBets/shipped → tasksInProgress/tasksDone
					tasksInProgress: activeBetCount,
					tasksDone: completedCount,
					shipRate,
					progress: { done: progressDone, total: progressTotal },
					routineCount,
					agentCount,
				};
			}),
		);

		return c.json({ teams: result });
	});

	// POST / — create a new team and its one agent.
	// AU3: app-owned scaffolding produces specs; persistScaffoldedAgents remains the writer.
	// Best-effort welcome message: failure does not roll back team creation.
	router.post("/", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}

		const { name, repoPath, userId, primaryHarness } = body as CreateTeamRequest;
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

		const now = new Date().toISOString();
		// @lore U2: ID prefix changed from `product-` to `team-` (domain rename).
		// @lore AU44 B1: teamMembersId removed — a single teamId now identifies the team row.
		const teamId = `team-${crypto.randomUUID()}`;

		// @lore BA9g: one agent, not a roster. This used to map the team's declared
		// `functions` through the role catalog and 400 with "Team functions produced
		// no agents" when the mapping came up empty — a team with no agents was an
		// error. Founder ruling: "a new team is just a single empty agent. and then
		// you improve that team with plugins." There is no roster to be empty.
		const specs = resolveAgentScaffoldSpecs({
			trigger: "team_scaffold",
			teamName: name.trim(),
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		});

		// @lore AU44 B1: createTeam now inserts a single teams row (capacity/activeBets/formedAt
		// live on teams with schema defaults — no separate team_members insert needed).
		await db.transaction(async (tx) => {
			await createTeam(tx, {
				id: teamId,
				name: name.trim(),
				phase: "build",
				factoryDbPath: typeof repoPath === "string" ? repoPath.trim() || null : null,
				createdAt: now,
			});
		});

		// AK6: Kernel persists the specs (single writer, assigns ids, attaches mechanism fields).
		// POLISH-060 B3: Thread primaryHarness from the request so onboarding-chosen harness propagates.
		const { agentIds, leadAgentId } = await persistScaffoldedAgents(
			db,
			orgUsers,
			teamId,
			specs,
			primaryHarness,
		);

		// Set lead agent on team_members.
		// @lore AU20 Am7: updateTeam(teamId, {leadAgentId}) replaces setTeamMembersLeadAgent.
		if (leadAgentId) {
			await updateTeam(db, teamId, { leadAgentId });
		}

		// Write the founder→team org edge the org chart renders. Best effort: a
		// failure here must not fail team creation.
		{
			const founderId = await resolveFounderId(db, c.get("userId"), userId);
			if (founderId) {
				await upsertOrgEdge(db, {
					fromUserId: founderId,
					mechanism: "team",
					target: teamId,
				});
			}
		}

		// AK6 T6: emit team_created event AFTER all agents are persisted.
		// @lore AU44 B1: teamMembersId = teamId after the fold (one entity, one id).
		eventBus.emit({
			type: "team_created",
			streamId: teamId,
			teamId,
			teamMembersId: teamId,
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
				const assistantId = `ast-${userId}`;

				// Ensure the assistant agent exists (may not yet exist for new users).
				// @lore AE2: The assistant agent is normally created at user registration.
				// During onboarding, team creation may happen before the assistant agent
				// is created — we upsert a stub here so the FK on messages.senderId succeeds.
				const existingAssistant = await findUser(db, { id: assistantId });

				// AV1: Resolve the harness the assistant should carry.
				// @lore AV1: The assistant stub may already exist (created by user registration
				// via persistScaffoldedAgents WITHOUT a harness). When team creation supplies a
				// primaryHarness, we must UPDATE the existing stub — the stub was created
				// before the user picked a harness, so it carries none. The UPDATE writes
				// the team default so the auto-opened overlay opens READY.
				// @lore AU20 Am7: resolveTeamAgentHarness removed from barrel; when primaryHarness
				// is supplied it IS the resolved harness; when absent, the stub stores none
				// and the adapter pool selects at admission.
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
						// No team harness chosen means none is stored — see the agents route.
						harnessType: stubHarness?.harnessType ?? null,
						modelId: stubHarness?.modelId ?? null,
						modelProvider: stubHarness?.modelProvider ?? null,
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

				// @lore BA9g: this used to read the persisted roster back and list it —
				// "your team is ready with 3 agents: Builder, Product Manager, QA
				// Engineer". There is no roster to list: a team is one agent, and what
				// it becomes is the person's to write or a plugin's to bring.
				const welcomeText =
					"Welcome! Your team starts with one agent and nothing decided about it. Tell it what you need, or install a plugin to bring in more.";

				// BC3 architecture.md §5 B5: the assistant's direct thread with the
				// user is found and posted into through `send_message`, never a raw
				// insert under the literal id `thr-ast-${userId}` — the overlay looks
				// for it as `search_threads({host:{kind:"agent", id: myAgentId}})`
				// (`AssistantOverlay.tsx:277-278`), and `send_message`'s own
				// find-or-create-by-recipients (`thread-actions.ts`) is what a real
				// user reply into the same pair resolves to as well. `clientKey` is
				// keyed by `userId`, not `teamId`, so a second team created for the
				// same user reuses the create-only dedupe instead of posting a
				// second welcome into the same thread.
				const sendResult = await sendMessage(
					{ actor: assistantId, db, eventBus, now },
					{ recipients: [userId], text: welcomeText, clientKey: `welcome-${userId}` },
				);
				if (!sendResult.ok) {
					throw new Error(
						`welcome message failed: ${sendResult.problems.map((p) => p.code).join(", ")}`,
					);
				}
			} catch {
				// Best-effort: ignore welcome message failures.
			}
		}

		// @lore AU44 B1: teamMembers.id = teamId after the fold — kept in response for API backward compat.
		const result: CreateTeamResponse = {
			team: { id: teamId, name: name.trim(), phase: "build" },
			teamMembers: { id: teamId },
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

		// 2. @lore AU44 B1: team_members dissolved — team row carries capacity/activeBets/leadAgentId.
		// No separate team_members load needed; use `team` directly.
		{
			// 3. Load roster
			const agentRows = await listUsers(db, { teamIds: [team.id] });

			const roster: RosterMember[] = agentRows.map((agent) => ({
				agentId: agent.id,
				name: agent.name,
				role: agent.role,
				isLead: agent.id === team.leadAgentId,
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

			// 4. Load active root tasks (BB1: bets are now root tasks in_progress)
			const activeBetRows = await work.list(db, "task", {
				teamId: teamId,
				parentTaskId: null,
				state: "in_progress",
			});

			// 5. Per active root task, count child tasks done/total
			let hasBlockedTask = false;
			// BB1: BetCardSummary → TaskCardSummary; activeBets → tasksInProgress.
			const tasksInProgress: TaskCardSummary[] = await Promise.all(
				activeBetRows.map(async (bet) => {
					const taskRows = await work.list(db, "task", { parentTaskId: bet.id });

					const progressTotal = taskRows.length;
					const progressDone = taskRows.filter((t) => t.state === "done").length;
					if (taskRows.some((t) => t.state === "blocked")) hasBlockedTask = true;

					return {
						id: bet.id,
						title: bet.title,
						state: "in_progress" as const,
						progressDone,
						progressTotal,
					};
				}),
			);

			// Sort by createdAt desc
			tasksInProgress.sort((a, b) => {
				const aRow = activeBetRows.find((r) => r.id === a.id);
				const bRow = activeBetRows.find((r) => r.id === b.id);
				if (!(aRow && bRow)) return 0;
				return bRow.createdAt.localeCompare(aRow.createdAt);
			});

			// BA1 D5: a routine has no team_id — resolve the team's agent ids
			// first (already loaded as the roster's `agentIds` above) and pass
			// them in, honouring `routine-service.ts`'s `@lore AU13 §A2/A9`
			// (the routine service imports zero foreign tables).
			// AA1: Load routines for this team (AA2: exclude soft-deleted)
			const routineRows = await routineService.listRoutines(db, { ownerAgentIds: agentIds });

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
					});

					const owner = ownerMap.get(r.ownerAgentId);
					const agentName = owner?.name ?? r.ownerAgentId;

					return {
						id: r.id,
						name: r.name,
						state: (r.state ?? "active") as RoutineCardSummary["state"],
						scheduleLabel: humanizeSchedule(
							r.triggerType,
							r.triggerConfig ?? null,
							r.eventType ?? null,
						),
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

			// 6. Derive team status (BB1: tasksInProgress count = active root tasks)
			const teamStatus = deriveTeamStatus(
				{
					tasksInProgress: tasksInProgress.length,
					capacity: team.capacity,
				},
				hasBlockedTask,
			);

			// @lore AU44 B1: teamMembers.id = team.id; dissolvedAt was dropped (use teams.phase = "archived").
			const detail: TeamDetail = {
				team: {
					id: team.id,
					name: team.name,
					phase: team.phase,
					status: teamStatus,
					leadAgentId: team.leadAgentId ?? null,
				},
				teamMembers: {
					id: team.id,
					formedAt: team.formedAt ?? team.createdAt,
					dissolvedAt: null,
				},
				roster,
				// BB1: activeBets field removed from TeamBurn; only capacity remains.
				burn: {
					capacity: team.capacity,
				},
				tasksInProgress,
				routines: teamRoutines,
			};

			return c.json(detail);
		}
	});

	return router;
}
