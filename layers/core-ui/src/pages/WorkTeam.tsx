/**
 * L13 — Work/Team page: unified team view.
 *
 * Layout (V1 — Stacked single column, per design/approved.md):
 *   R1 — Team header (breadcrumb + name + status + phase + lead)
 *   R4 — Team burn vs cap
 *   R2 — Active bets
 *   R3 — Roster
 *   Artifact slot (placeholder for L12)
 *
 * @lore L13: Product = Team 1:1 invariant. The page is addressed by teamId
 * (the public identifier).
 *
 * @lore L13: The `overrideData` / `overrideLoading` / `overrideError` props
 * mirror WorkBet's `overrideBet` / `loading` props — used by stories and tests
 * to inject fixture data without crossing the __fixtures__/ import boundary.
 *
 * @lore U5: Renamed from WorkProduct → WorkTeam. Component name, props, and
 * data-testids updated.
 * @lore U6: Route path renamed from /work/product/:productId to /work/team/:teamId.
 * useParams now reads `teamId` directly (no more productId alias).
 */

// @lore BB1: `BetCardSummary` → `TaskCardSummary`, `activeBets` → `tasksInProgress`.
import type { TaskCardSummary, TeamDetail } from "@hyperidle/domain-model";
import {
	AGENT_OPERATIONAL_STATUS_LABEL,
	TASK_STATE_LABEL,
	roleLabel,
} from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Link as RRLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import {
	Avatar,
	agentOperationalStatusToStatus,
	Breadcrumb,
	Button,
	taskStateToStatus,
	EmptyState,
	ErrorState,
	ItemList,
	KpiStat,
	PageHeader,
	PageScaffold,
	Row,
	RowDot,
	routineStateToStatus,
	SectionLabel,
	SkeletonCard,
	SplitView,
	StatusChip,
	Tag,
} from "../ds";
import { DEFAULT_ROSTER_RUN_STATE, useRosterRunState } from "../hooks/useAgentRunState.js";
import { useTeam } from "../hooks/useTeam";
import { useTeamAgents } from "../hooks/useTeamAgents.js";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import { deriveInitials } from "../utils/initials.js";
import { relativeShort } from "../utils/time.js";
import { AgentAddDialog } from "./AgentAddDialog.js";
import { AgentDetailPane } from "./work/AgentDetailPane.js";
import { RoutineCreateDialog } from "./work/RoutineCreateDialog.js";
import { RoutineDetailPane } from "./work/RoutineDetailPane.js";

export interface WorkTeamProps {
	/**
	 * Override the team detail with directly injected data. When set,
	 * the useTeam hook is not called. Used by stories and tests.
	 * Pass `null` to simulate a resolved-but-empty fetch (e.g. 404/500 path).
	 *
	 * @lore U1: Type changed from ProductDetail to TeamDetail.
	 */
	overrideData?: TeamDetail | null;
	/**
	 * Override the loading state. When true, skeleton placeholders are shown.
	 */
	overrideLoading?: boolean;
	/**
	 * Override the error state. When set, the appropriate error UI is shown.
	 */
	overrideError?: Error | null;
	/**
	 * When true, the ArtifactSection is not rendered. Used by test overrides
	 * to prevent ArtifactSection from calling fetch and consuming mocked responses
	 * meant for other hooks in the component tree.
	 *
	 * @lore P5: ArtifactSection's useFetch fires before parent hooks' useEffect
	 * because React flushes child effects before parent effects. When using
	 * overrideData in tests, skipArtifacts prevents fetch-order races.
	 * The L12 artifact-section test does NOT pass this prop (defaults false)
	 * and mocks ArtifactSection via vi.mock() instead.
	 */
	skipArtifacts?: boolean;
}

export function WorkTeam({
	overrideData,
	overrideLoading,
	overrideError,
	skipArtifacts = false,
}: WorkTeamProps = {}): JSX.Element {
	// @lore U6: Route renamed from work/product/:productId to work/team/:teamId.
	// Now reads the param directly by the semantic name.
	const { teamId } = useParams<{ teamId: string }>();

	// Only call useTeam when there is no override (mirrors WorkBet pattern).
	const fetched = useTeam(overrideData !== undefined ? undefined : teamId);

	const error = overrideError !== undefined ? (overrideError ?? null) : fetched.error;
	const data = overrideData !== undefined ? overrideData : (fetched.data as TeamDetail | null);
	// UI-015: retry re-issues the team fetch in place (no page reload).
	const onRetryTeam = overrideData === undefined ? fetched.refetch : undefined;

	// Loading state
	// UI-017: title uses a skeleton bar so the header never flashes the static placeholder "Team"
	// before the real team name arrives. SkeletonCard shape mirrors the content sections.
	if (overrideLoading === true || (overrideData === undefined && fetched.loading)) {
		return (
			<PageScaffold
				frame="page"
				header={
					<PageHeader
						title={<span aria-label="Team" className="skeleton block h-[22px] w-[160px]" />}
					/>
				}
				data-testid="work-team-page"
			>
				<div className="max-w-[960px] w-full py-[24px] flex flex-col gap-[24px]">
					{/* UI-016: match real content regions — summary strip, bets, routines, roster */}
					<SkeletonCard ariaLabel="Loading team summary" />
					<SkeletonCard ariaLabel="Loading active tasks" />
					<SkeletonCard ariaLabel="Loading routines" />
					<SkeletonCard ariaLabel="Loading roster" />
				</div>
			</PageScaffold>
		);
	}

	// Error state — distinguish 404 from other errors
	if (error !== null && error !== undefined) {
		const is404 = error.message.includes("404");
		if (is404) {
			return (
				<PageScaffold
					frame="page"
					header={<PageHeader title="Team" />}
					data-testid="work-team-page"
				>
					<div className="max-w-[960px] w-full py-[24px] flex flex-col gap-[24px]">
						<EmptyState
							title="Team not found"
							description="The team you are looking for does not exist or has been removed."
							dataTestId="team-not-found"
						/>
					</div>
				</PageScaffold>
			);
		}
		return (
			<PageScaffold frame="page" header={<PageHeader title="Team" />} data-testid="work-team-page">
				<div className="max-w-[960px] w-full py-[24px] flex flex-col gap-[24px]">
					<ErrorState
						title="Failed to load team"
						description={error.message}
						onRetry={onRetryTeam}
					/>
				</div>
			</PageScaffold>
		);
	}

	// Null data after loading/error — 404 from overrideData=null path
	if (data === null) {
		return (
			<PageScaffold frame="page" header={<PageHeader title="Team" />} data-testid="work-team-page">
				<div className="max-w-[960px] w-full py-[24px] flex flex-col gap-[24px]">
					<EmptyState
						title="Team not found"
						description="The team you are looking for does not exist or has been removed."
						dataTestId="team-not-found"
					/>
				</div>
			</PageScaffold>
		);
	}

	// @lore U6: Defensive guard against malformed API responses (e.g. stubs that return
	// { threads: [], nextCursor: null } for unrecognised URLs in tests). When data does
	// not carry the expected TeamDetail shape, render the not-found EmptyState rather
	// than crashing in WorkTeamLoaded at `data.team.leadAgentId`.
	if (!data.team) {
		return (
			<PageScaffold frame="page" header={<PageHeader title="Team" />} data-testid="work-team-page">
				<div className="max-w-[960px] w-full py-[24px] flex flex-col gap-[24px]">
					<EmptyState
						title="Team not found"
						description="The team you are looking for does not exist or has been removed."
						dataTestId="team-not-found"
					/>
				</div>
			</PageScaffold>
		);
	}

	return (
		<WorkTeamLoaded
			data={data}
			skipArtifacts={skipArtifacts}
			refetchTeam={overrideData !== undefined ? undefined : fetched.refetch}
		/>
	);
}

/** Internal component rendered when data is fully resolved. */
function WorkTeamLoaded({
	data,
	skipArtifacts = false,
	refetchTeam,
}: {
	// @lore U1: TeamDetail replaces ProductDetail.
	data: TeamDetail;
	/**
	 * When true, the ArtifactSection is not rendered. Used by test overrides
	 * to prevent ArtifactSection from calling fetch and consuming mocked responses
	 * meant for other hooks in the component tree.
	 *
	 * @lore P5: ArtifactSection's useFetch fires before parent hooks' useEffect
	 * because React flushes child effects before parent effects. When using
	 * overrideData in tests, skipping ArtifactSection prevents fetch-order races.
	 */
	skipArtifacts?: boolean;
	/** AF16 T3: Callback to re-fetch team data after a mutation (e.g. routine created). */
	refetchTeam?: () => void;
}): JSX.Element {
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();
	// @lore U1: `team` replaces `product` in TeamDetail.
	// @lore AA1: routines defaults to [] so pre-AA1 mock data (missing the field) doesn't crash.
	// @lore BB1: activeBets → tasksInProgress; stored counter deleted, list comes from API
	const { team, roster, burn, tasksInProgress = [], routines = [] } = data;
	const onOpenArtifact = useArtifactOpen();
	// @lore AV4: All three new hooks go UNCONDITIONALLY here at the top of WorkTeamLoaded,
	// NOT in WorkTeam — WorkTeam has 5 early-return guard branches (loading/error/null/no-team)
	// that would make any hook after the first guard a conditional-hook violation.
	// WorkTeamLoaded is always rendered (data guaranteed present) — safe to add hooks here.
	const [searchParams, setSearchParams] = useSearchParams();
	const [routineRatio, setRoutineRatio] = useUiPreference("work.routine", 0.5);
	const [agentRatio, setAgentRatio] = useUiPreference("work.agent", 0.5);

	const selectedRoutineId = searchParams.get("routine");
	const selectedAgentId = searchParams.get("agent");
	const hasSelection = selectedRoutineId !== null || selectedAgentId !== null;

	// AB3: dialog state
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	// AA2: routine create dialog state
	const [createRoutineOpen, setCreateRoutineOpen] = useState(false);

	// AB3: fetch full agent configs for the roster.
	// @lore AB3: rosterAgentIds MUST be memoized — passing an inline array on
	// every render triggers a new fetch on every render cycle. useMemo ensures
	// the array reference only changes when the roster content changes.
	const rosterAgentIds = useMemo(() => roster.map((m) => m.agentId), [roster]);
	const { agents: agentConfigs, refetch: refetchAgents } = useTeamAgents(rosterAgentIds);

	// @lore AU26 J4: the roster's run state (status dot, health tone, the
	// active-task context line) used to arrive stamped onto each `RosterMember` by
	// core-api, which read `agent-orchestration`'s `sessions` table to compute it.
	// Founder ruling: *"orchestration now has an api so that the ui can get the
	// agent run state from the orchestration directly and combine this information
	// in the ui instead of in the core api service."* Same derivations
	// (`computeHealthSignals` et al., now in `@hyperidle/domain-model`), same inputs,
	// same render — one layer over.
	const { byAgent: rosterRunState, status: rosterRunStatus } = useRosterRunState(roster);
	// @lore AU26 review W5/W6: when the run read fails — or has not landed yet —
	// every member falls back to DEFAULT_ROSTER_RUN_STATE, idle and healthy. That
	// default is honest for an agent with no runs and a lie about an agent whose
	// runs we could not read (W6) or have not read yet (W5: the roster used to
	// paint a full green column, then re-paint a round-trip later). Both cases
	// render as unknown instead.
	const rosterRunStateUnknown = rosterRunStatus !== "ready";

	// @lore AV4: When a split pane is open, the "editing agent" comes from the ?agent search
	// param (not internal editingAgentId state). editingAgentId is kept for the modal path
	// (AgentAddDialog) but the Customize button now sets searchParams instead of editingAgentId.
	const paneAgent = selectedAgentId !== null ? (agentConfigs.get(selectedAgentId) ?? null) : null;
	const paneRosterMember =
		selectedAgentId !== null ? (roster.find((m) => m.agentId === selectedAgentId) ?? null) : null;

	// D2: Resolve lead display name from roster instead of showing the agent id.
	const leadName =
		team.leadAgentId !== null
			? (roster.find((m) => m.agentId === team.leadAgentId)?.name ?? team.leadAgentId)
			: null;

	// @lore AZ2: teamBodyContent is the team list JSX extracted into a variable so it
	// can be: 1. Rendered full-width when no selection (PageScaffold's own scroll
	// body owns the scroll region). 2. Passed as `origin` to SplitView when
	// ?routine or ?agent is set (SplitView's own origin wrapper — `flex min-w-0
	// flex-col overflow-auto`, SplitView.tsx:197 — already gives it a bounded
	// scrolling column; the content needs no scroll wrapper of its own there
	// either). Pre-AZ2 this was `teamBody`, a standalone `flex-1 overflow-y-auto`
	// div: that was ALSO the WorkTeam live defect's fix point — its parent
	// (`:709` below, now the PageScaffold managed body) was a plain block, so
	// `flex-1` on this div did nothing and it grew to its full content height
	// instead of scrolling. The div's own class was always correct (shape A,
	// round.md §2.3); moving it into PageScaffold(body="scroll") for the
	// no-selection path removes the now-redundant hand-written wrapper instead
	// of just fixing its ancestor.
	const teamBodyContent = (
		<div
			className={
				hasSelection
					? "w-full p-[18px] flex flex-col gap-[24px]"
					: "max-w-[960px] w-full py-[24px] flex flex-col gap-[24px]"
			}
		>
			{/* R4 — Team summary stat strip (AG1: replaces KeyValue burn list) */}
			{/*
			 * @lore AU21 Increment 14a: the Burn/Cap stat tiles + cap-utilization
			 * progress bar are HARD-DELETED along with the rest of the cost-cap
			 * feature — no replacement. Capacity/Status tiles are untouched.
			 */}
			<section aria-label="Team summary" data-testid="team-burn-vs-cap">
				{/*
				 * @lore AG1: stat tiles (Capacity/Status) replace the KeyValue
				 * burn list. flex-wrap (not grid-cols-N) avoids AQ-108. Status tile is
				 * mandatory — empty roster → "—"/"No agents", never "Healthy".
				 */}
				{/* @lore UI-065: StatTile replaced with KpiStat (design-system primitive) +
				    a border card wrapper. KpiStat is the canonical metric-display primitive
				    (AM5); the bordered card is layout context, not a new component. The `sub`
				    field was added to KpiStatMetric (optional, backward-compatible) so the
				    contextual annotation line ("active bets", "1 idle agent") is preserved. */}
				<div className="flex gap-[12px] flex-wrap">
					{/* Capacity tile */}
					<div
						data-testid="stat-tile"
						className="border-width-thin flex-1 min-w-[180px] rounded-[var(--r-subtle)]  border-[var(--border-subtle)] p-[18px]"
					>
						<KpiStat
							metrics={[
								{
									label: "Capacity",
									value: `${tasksInProgress.length} / ${burn.capacity}`,
									sub: "active tasks",
								},
							]}
						/>
					</div>
					{/* Agent Health tile — derives from roster; empty → "—"/"No agents" */}
					{(() => {
						const agentHealthMetric = (() => {
							if (roster.length === 0) {
								return { label: "Agent Health", value: "—", sub: "No agents" };
							}
							if (rosterRunStateUnknown) {
								return {
									label: "Agent Health",
									value: "—",
									sub: rosterRunStatus === "error" ? "Run state unavailable" : "Loading run state",
								};
							}
							const runStates = roster.map(
								(m) => rosterRunState.get(m.agentId) ?? DEFAULT_ROSTER_RUN_STATE,
							);
							const hasAttention = runStates.some((r) => r.healthLevel !== "healthy");
							const idleCount = runStates.filter((r) => r.operationalStatus === "idle").length;
							// @lore AZ7 B4 (review round 1): this tile rolls up
							// RosterRunState.healthLevel ("healthy" | "warning" | "critical",
							// @hyperidle/domain-model team.ts) — a per-agent run-health signal,
							// computed client-side by useRosterRunState. It is NOT
							// deriveTeamStatus's "healthy" | "behind" | "blocked" (bets over
							// capacity / a blocked task; core-api/routes/teams-routes.ts),
							// which is what the header StatusChip at :728 renders. Two
							// genuinely different measurements over the same team. The first
							// attempt reused the header's own word ("Behind") for this tile,
							// which read as a second, contradicting status for the same
							// object whenever the two happened to disagree (e.g. header
							// BLOCKED, tile "Behind" — looks like a typo, is actually two
							// unrelated facts). Fixed by giving this tile its own label
							// ("Agent Health", not "Status") and its own vocabulary
							// ("Needs attention" / "On track", neither of which is a
							// StatusChip word) so it can never be misread as a second
							// opinion on team.status.
							return {
								label: "Agent Health",
								value: hasAttention ? "Needs attention" : "On track",
								sub: `${idleCount} idle agent${idleCount !== 1 ? "s" : ""}`,
							};
						})();
						return (
							<div
								data-testid="stat-tile"
								className="border-width-thin flex-1 min-w-[180px] rounded-[var(--r-subtle)]  border-[var(--border-subtle)] p-[18px]"
							>
								<KpiStat metrics={[agentHealthMetric]} />
							</div>
						);
					})()}
				</div>
			</section>

			{/* R2 — Active tasks (@lore BB1: was "Active bets") */}
			<section aria-label="Active tasks" data-testid="team-active-tasks">
				<SectionLabel
					label="Active Tasks"
					as="h2"
					trailing={
						<Button
							variant="ghost"
							size="sm"
							type="button"
							onClick={() => navigate("/work/task/new")}
							data-testid="new-bet-btn"
						>
							+ New task
						</Button>
					}
				/>
				{tasksInProgress.length === 0 ? (
					<EmptyState
						title="No active tasks"
						description="This team has no tasks in flight."
						dataTestId="team-active-tasks-empty"
					/>
				) : (
					<ItemList variant="flush" isEmpty={false}>
						{tasksInProgress.map((task) => (
							<TaskRow key={task.id} task={task} href={`/work/task/${encodeURIComponent(task.id)}`} />
						))}
					</ItemList>
				)}
			</section>

			{/* R5 — Routines (AA1): sits after active tasks, before roster */}
			<section aria-label="Team routines" data-testid="team-routines">
				<SectionLabel
					label="Routines"
					as="h2"
					trailing={
						<Button
							variant="ghost"
							size="sm"
							type="button"
							onClick={() => setCreateRoutineOpen(true)}
							data-testid="new-routine-btn"
						>
							+ New routine
						</Button>
					}
				/>
				<ItemList
					variant="flush"
					isEmpty={routines.length === 0}
					empty={{
						title: "No routines",
						description: "This team has no recurring work configured.",
						dataTestId: "team-routines-empty",
					}}
				>
					{routines.map((routine) => {
						const routineStatus = routineStateToStatus(routine.state);
						const routineTone =
							routineStatus === "healthy"
								? ("success" as const)
								: routineStatus === "error"
									? ("error" as const)
									: routineStatus === "paused"
										? ("info" as const)
										: ("neutral" as const);
						const lastRunLabel = routine.lastRunAt ? relativeShort(routine.lastRunAt) : "Never";
						return (
							<Row
								key={routine.id}
								data-testid="routine-row"
								lead={<RowDot tone={routineTone} />}
								title={routine.name}
								cells={[
									{
										content: (
											<span
												className="type-avatar-initial type-avatar-initial--sm w-[24px] h-[24px] rounded-[var(--r-pill)] shrink-0 flex items-center justify-center text-[var(--accent-deep)]"
												style={{ background: "var(--accent-deep-dim)" }}
												aria-label={routine.agentName}
												title={routine.agentName}
											>
												{routine.agentInitials}
											</span>
										),
									},
									// @lore NEW-10: removed fixed width:80 — "Every Monday at 10:00 AM" needs
									// ~173px; the name (flex-1) has plenty of empty space to give back.
									{ content: routine.scheduleLabel, align: "start" },
									{ content: lastRunLabel, width: 60, numeric: true },
								]}
								href={`/work/routine/${encodeURIComponent(routine.id)}`}
							/>
						);
					})}
				</ItemList>
			</section>

			{/* R3 — Agents (AB2: replaces Roster/AgentCard with flat AgentRow rows) */}
			<section aria-label="Team agents" data-testid="team-agents">
				<SectionLabel
					label="Agents"
					as="h2"
					trailing={
						<Button
							variant="ghost"
							size="sm"
							type="button"
							onClick={() => setAddDialogOpen(true)}
							data-testid="add-agent-btn"
						>
							+ Add agent
						</Button>
					}
				/>

				<ItemList
					variant="flush"
					isEmpty={roster.length === 0}
					empty={{
						title: "No agents",
						description: "No agents are assigned to this team.",
					}}
				>
					{roster.map((member) => {
						const runState = rosterRunState.get(member.agentId) ?? DEFAULT_ROSTER_RUN_STATE;
						const memberStatus = runState.operationalStatus;
						const healthLevel = runState.healthLevel;
						const healthDetail = runState.healthDetail;
						const initials = deriveInitials(member.name);

						const healthTone = rosterRunStateUnknown
							? ("neutral" as const)
							: healthLevel === "healthy"
								? ("success" as const)
								: healthLevel === "warning"
									? ("warning" as const)
									: ("error" as const);
						const healthLabel = rosterRunStateUnknown
							? rosterRunStatus === "error"
								? "Run state unavailable"
								: "Run state loading"
							: healthDetail;

						let contextText = (() => {
							// @lore BA9g: the catalog's one-line description went with the
							// catalog. What an agent is for is its identity document, not a
							// sentence the product wrote about its role.
							return roleLabel(member.role);
						})();
						let contextIsError = false;
						if (memberStatus === "active" && runState.activeTaskTitle) {
							contextText = runState.activeTaskTitle;
						} else if (memberStatus === "error") {
							contextText = healthDetail;
							contextIsError = true;
						}

						const categoryLabel =
							member.agentCategory === "individual" ? "Individual" : (member.agentCategory ?? "");

						// Category cell — first cell when non-team category.
						// @lore AG6: team agents do NOT render agent-card-category testid
						// (AB3 protected test: individual only, team = 0). The
						// AG6 "first cell" test renders individual-category agents where this is present.
						// @lore BA9d: "strategy" removed from category set — only "individual" is non-team.
						const hasCategory = member.agentCategory && member.agentCategory !== "team";

						return (
							<Row
								key={member.agentId}
								data-testid="agent-row"
								lead={
									<>
										<RowDot tone={healthTone} label={healthLabel} title={healthLabel} />
										<Avatar initials={initials} size="sm" agent />
									</>
								}
								title={
									<>
										{member.name}
										{member.isLead && (
											<span className="type-metadata ml-[6px] text-[var(--accent-deep)] ">
												— Lead
											</span>
										)}
									</>
								}
								cells={[
									...(hasCategory
										? [
												{
													content: <Tag label={categoryLabel} />,
													"data-testid": "agent-card-category" as const,
												},
											]
										: []),
									{
										// @lore AZ7 E7: the agent's operational status now
										// reads through StatusChip like every other status on this page
										// (the team header chip, bet StatusChips) — same word, same
										// treatment, instead of the raw lowercase domain string.
										content: (
											<StatusChip
												status={agentOperationalStatusToStatus(memberStatus)}
												label={AGENT_OPERATIONAL_STATUS_LABEL[memberStatus]}
											/>
										),
										width: 90,
										"data-testid": "agent-status",
									},
									{
										// @lore AZ7 Set 5: RowCell.tone is deleted — the error tint moves onto
										// the content itself.
										// @lore NEW-27: width:160 caps the context cell so the agent name
										// (flex-1 min-w-0 in Row) is never starved to zero-width in
										// narrow SplitView panes. The cell is shrink-0 so without a cap
										// the role description eats all available space at ~576px pane
										// widths; the name collapses to width:0 and is invisible on
										// screen even though it is present in DOM. 160px truncates with
										// ellipsis ("Engineer. Im…") which is readable and matches the
										// prior width:140 that @lore NEW-10 removed.
										content: contextIsError ? (
											<span className="text-[var(--status-error)]">{contextText}</span>
										) : (
											contextText
										),
										width: 160,
										align: "start",
										"data-testid": "agent-context",
									},
								]}
								actions={
									<div className="flex shrink-0 items-center gap-[6px]">
										{/* NEW-29: real <a href> to agent profile so the page is reachable
										    via ⌘-click, middle-click, and browser hover-preview. */}
										<RRLink
											to={`/agents/${encodeURIComponent(member.agentId)}`}
											onClick={(e) => e.stopPropagation()}
											className="type-control shrink-0 inline-flex items-center rounded-[var(--r-pill)] px-[12px] py-[7px] min-h-[44px] lg:min-h-[32px] text-[var(--accent-deep)] hover:bg-[var(--accent-primary-dim)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
											data-testid="agent-profile-link"
										>
											Profile
										</RRLink>
										<Button
											variant="ghost"
											size="sm"
											className="shrink-0"
											onClick={(e) => {
												e.stopPropagation();
												// @lore AV4: Customize now opens AgentDetailPane in the split pane
												// via ?agent search param, not AgentEditDialog modal (AC#3).
												setSearchParams({ agent: member.agentId });
											}}
											data-testid="agent-customize-btn"
										>
											Customize
										</Button>
									</div>
								}
								onClick={() => navigate(`/agents/${encodeURIComponent(member.agentId)}`)}
							/>
						);
					})}
				</ItemList>
			</section>

			{/* L12: Artifact stack — product axis, limit=10, replaces placeholder */}
			{!skipArtifacts && (
				<ArtifactSection
					// @lore U1: `productId` → `teamId` in ArtifactSection filter.
					filter={{ axis: "product", teamId: team.id }}
					layout="stack"
					limit={10}
					heading="Artifacts"
					emptyDescription="Artifacts appear as agents complete tasks for this team."
					onOpen={onOpenArtifact}
				/>
			)}

			{/* @lore AV4: AgentEditDialog modal retired from the WorkTeam customize path.
			 * Customize now opens AgentDetailPane in the split pane via ?agent param (AC#3).
			 * AgentAddDialog stays a modal; it mounts in the outer return (not teamBody) so it
			 * works correctly regardless of whether the split pane is open or not. */}

			{/* AA2: Routine create dialog */}
			{createRoutineOpen && (
				<RoutineCreateDialog
					open={createRoutineOpen}
					onClose={() => setCreateRoutineOpen(false)}
					onCreated={() => {
						// AF16 T3 (Z8-128): refetch team data so the new routine appears
						// without a page reload. Mirrors the agent path (refetchAgents above).
						refetchTeam?.();
						setCreateRoutineOpen(false);
					}}
					agents={roster
						.filter((m) => m.role !== "human")
						.map((m) => ({ id: m.agentId, name: m.name }))}
				/>
			)}
		</div>
	); // end teamBodyContent
	const teamHeader = (presentation: "page" | "pane"): JSX.Element => (
		<PageHeader
			presentation={presentation}
			title={team.name}
			leading={
				<Breadcrumb
					segments={[
						{ label: "Work", to: "/work", testId: "team-breadcrumb-back" },
						{ label: team.name },
					]}
					leading={
						!sidebarMobile ? (
							<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
						) : undefined
					}
					LinkComponent={RRLink}
				/>
			}
			subtitle={
				<span className="type-small text-[var(--text-tertiary)]">
					Phase: {team.phase}
					{leadName && ` · Lead: ${leadName}`}
				</span>
			}
			actions={<StatusChip status={team.status} />}
		/>
	);
	const teamPane = <PageScaffold header={teamHeader("pane")}>{teamBodyContent}</PageScaffold>;

	return (
		<>
			{/* AI7: PageHeader owns the pinned title strip.
			    @lore AZ2: body switches "scroll" ↔ "managed" with selection state —
			    no selection: the page owns the scroll region (teamBodyContent, shape
			    A). A selection: SplitView owns its own scroll internally (its origin
			    wrapper is itself `flex min-w-0 flex-col overflow-auto`, SplitView.tsx
			    :197) and only needs a bounded flex column to size against — that
			    bound is the managed body. This is the WorkTeam live defect's fix: the
			    old `:709` wrapper was a plain block (`flex-1 overflow-hidden`, no
			    flex-col), so `flex-1` on teamBodyContent's old wrapper div did
			    nothing and it grew to its full content height (round.md §2.3, shape
			    C). Routine and agent selections are mutually exclusive (plan §2.4). */}
			<PageScaffold
				frame="page"
				header={hasSelection ? undefined : teamHeader("page")}
				body={hasSelection ? "managed" : "scroll"}
				data-testid="work-team-page"
			>
				{selectedRoutineId !== null ? (
					<SplitView
						compact={sidebarMobile}
						originLabel="team"
						surfaceKey="work.routine"
						mode="split"
						dividerRatio={routineRatio}
						onRatioChange={setRoutineRatio}
						onModeChange={(mode) => {
							if (mode === "fold-back") setSearchParams({});
						}}
						origin={teamPane}
						destination={
							<RoutineDetailPane
								routineId={selectedRoutineId}
								onClose={() => setSearchParams({})}
							/>
						}
					/>
				) : selectedAgentId !== null ? (
					<SplitView
						compact={sidebarMobile}
						originLabel="team"
						surfaceKey="work.agent"
						mode="split"
						dividerRatio={agentRatio}
						onRatioChange={setAgentRatio}
						onModeChange={(mode) => {
							if (mode === "fold-back") setSearchParams({});
						}}
						origin={teamPane}
						destination={
							<AgentDetailPane
								agent={paneAgent}
								rosterMember={paneRosterMember}
								onClose={() => setSearchParams({})}
								onSaved={() => {
									refetchAgents();
									setSearchParams({});
								}}
							/>
						}
					/>
				) : (
					teamBodyContent
				)}
			</PageScaffold>

			{/* AB3: Add dialog — only mounted when open to avoid DOM content collisions */}
			{addDialogOpen && (
				<AgentAddDialog
					rolesInUse={(data?.roster ?? []).map((m) => m.role)}
					open={addDialogOpen}
					teamMembersId={data.teamMembers.id}
					teamName={data.team.name}
					onClose={() => setAddDialogOpen(false)}
					onCreated={() => {
						refetchAgents();
						setAddDialogOpen(false);
					}}
				/>
			)}
		</>
	);
}

// ---------------------------------------------------------------------------
// StatTile removed — replaced by KpiStat (design-system primitive) + border card
// wrapper in the stat strip. See @lore UI-065 comment in the R4 section above.

/**
 * Single active-task row rendered inside R2. Uses design-system Row for flush layout.
 * @lore BB1: Renamed from BetRow; now uses TaskCardSummary shape.
 * @lore F1 (POLISH-060): replaced hand-rolled grey button with Row primitive — drops
 * bg-[var(--surface-container)] so tasks sit flush on the page, not in a grey card.
 */
// @lore UI-080: href instead of onClick so ⌘-click / middle-click work natively.
// StatusChip (actions) is display-only so nesting inside <a> is valid.
function TaskRow({ task, href }: { task: TaskCardSummary; href: string }): JSX.Element {
	const progressText = task.progressTotal > 0 ? `${task.progressDone}/${task.progressTotal}` : "—";

	return (
		<Row
			title={task.title}
			href={href}
			cells={[{ content: progressText, numeric: true }]}
			actions={
				<StatusChip status={taskStateToStatus(task.state)} label={TASK_STATE_LABEL[task.state]} />
			}
		/>
	);
}
