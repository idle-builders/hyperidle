import { AGENT_OPERATIONAL_STATUS_LABEL, TASK_STATE_LABEL } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Link as RRLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
	Avatar,
	agentOperationalStatusToStatus,
	Breadcrumb,
	Button,
	EmptyState,
	ErrorState,
	ItemList,
	KpiStat,
	PageHeader,
	PageScaffold,
	Row,
	RowDot,
	SectionLabel,
	SkeletonCard,
	SplitView,
	StatusChip,
	Tag,
	taskStateToStatus,
} from "../ds";
import { DEFAULT_ROSTER_RUN_STATE, useRosterRunState } from "../hooks/useAgentRunState.js";
import type { TeamPageData, TeamTaskCard } from "../hooks/useTeam.js";
import { useTeam } from "../hooks/useTeam.js";
import { useTeamAgents } from "../hooks/useTeamAgents.js";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import { deriveInitials } from "../utils/initials.js";
import { roleLabel } from "../utils/role-label.js";
import { AgentAddDialog } from "./AgentAddDialog.js";
import { AgentDetailPane } from "./work/AgentDetailPane.js";

export interface WorkTeamProps {
	overrideData?: TeamPageData | null;
	overrideLoading?: boolean;
	overrideError?: Error | null;
}

export function WorkTeam({
	overrideData,
	overrideLoading,
	overrideError,
}: WorkTeamProps = {}): JSX.Element {
	const { teamId } = useParams<{ teamId: string }>();

	const fetched = useTeam(overrideData !== undefined ? undefined : teamId);

	const error = overrideError !== undefined ? (overrideError ?? null) : fetched.error;
	const data = overrideData !== undefined ? overrideData : (fetched.data as TeamPageData | null);
	// retry re-issues the team fetch in place (no page reload).
	const onRetryTeam = overrideData === undefined ? fetched.refetch : undefined;

	// skeleton title bar avoids flashing static "Team" before real name; SkeletonCard shape mirrors content sections
	if (overrideLoading === true || (overrideData === undefined && fetched.loading)) {
		return (
			<PageScaffold
				frame="page"
				header={
					<PageHeader
						title={
							<span role="status" aria-label="Team" className="skeleton block h-[22px] w-[160px]" />
						}
					/>
				}
				data-testid="work-team-page"
			>
				<div className="max-w-[960px] w-full py-[24px] flex flex-col gap-[24px]">
					<SkeletonCard ariaLabel="Loading team summary" />
					<SkeletonCard ariaLabel="Loading active tasks" />
					<SkeletonCard ariaLabel="Loading roster" />
				</div>
			</PageScaffold>
		);
	}

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

	// @lore: malformed data guard — stubs returning unexpected shapes for unrecognised URLs in tests; crashes at data.team.name without this
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
			refetchTeam={overrideData !== undefined ? undefined : fetched.refetch}
		/>
	);
}

function WorkTeamLoaded({
	data,
	refetchTeam,
}: {
	data: TeamPageData;
	/** Callback to re-fetch team data after a mutation (e.g. an agent added). */
	refetchTeam?: () => void;
}): JSX.Element {
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();
	const { team, roster, tasksInProgress } = data;
	const [searchParams, setSearchParams] = useSearchParams();
	const [agentRatio, setAgentRatio] = useUiPreference("work.agent", 0.5);

	const selectedAgentId = searchParams.get("agent");
	const hasSelection = selectedAgentId !== null;

	const [addDialogOpen, setAddDialogOpen] = useState(false);

	// @lore: rosterAgentIds memo — memoized for stable reference; prevents useTeamAgents refetch loop on re-render
	const rosterAgentIds = useMemo(() => roster.map((m) => m.agentId), [roster]);
	const { agents: agentConfigs, refetch: refetchAgents } = useTeamAgents(rosterAgentIds);

	const { byAgent: rosterRunState, status: rosterRunStatus } = useRosterRunState(roster);
	// @lore: rosterRunStateUnknown — failed or pending run read falls back to DEFAULT_ROSTER_RUN_STATE; renders as unknown, not falsely green
	const rosterRunStateUnknown = rosterRunStatus !== "ready";

	const paneAgent = selectedAgentId !== null ? (agentConfigs.get(selectedAgentId) ?? null) : null;
	const paneRosterMember =
		selectedAgentId !== null ? (roster.find((m) => m.agentId === selectedAgentId) ?? null) : null;

	const teamBodyContent = (
		<div
			className={
				hasSelection
					? "w-full p-[18px] flex flex-col gap-[24px]"
					: "max-w-[960px] w-full py-[24px] flex flex-col gap-[24px]"
			}
		>
			<section aria-label="Team summary" data-testid="team-burn-vs-cap">
				<div className="flex gap-[12px] flex-wrap">
					<div
						data-testid="stat-tile"
						className="border-width-thin flex-1 min-w-[180px] rounded-[var(--r-subtle)]  border-[var(--border-subtle)] p-[18px]"
					>
						<KpiStat
							metrics={[
								{
									label: "Active tasks",
									value: String(tasksInProgress.length),
									sub: "in progress",
								},
							]}
						/>
					</div>
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
							data-testid="new-task-btn"
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
							<TaskRow
								key={task.id}
								task={task}
								href={`/work/task/${encodeURIComponent(task.id)}`}
							/>
						))}
					</ItemList>
				)}
			</section>

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
								title={member.name}
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
										<RRLink
											to={`/agents/${encodeURIComponent(member.agentId)}`}
											onClick={(e) => e.stopPropagation()}
											className="type-control shrink-0 inline-flex items-center min-h-[44px] min-[1025px]:min-h-[32px] text-[var(--accent-deep)] hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
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
			actions={<StatusChip status={team.status} />}
		/>
	);
	const teamPane = <PageScaffold header={teamHeader("pane")}>{teamBodyContent}</PageScaffold>;

	return (
		<>
			{/* PageHeader owns the pinned title strip. */}
			<PageScaffold
				frame="page"
				header={hasSelection ? undefined : teamHeader("page")}
				body={hasSelection ? "managed" : "scroll"}
				data-testid="work-team-page"
			>
				{selectedAgentId !== null ? (
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

			{/* Add dialog — only mounted when open to avoid DOM content collisions */}
			{addDialogOpen && (
				<AgentAddDialog
					rolesInUse={(data?.roster ?? []).map((m) => m.role)}
					open={addDialogOpen}
					teamName={data.team.name}
					onClose={() => setAddDialogOpen(false)}
					onCreated={() => {
						refetchAgents();
						refetchTeam?.();
						setAddDialogOpen(false);
					}}
				/>
			)}
		</>
	);
}

// ---------------------------------------------------------------------------
function TaskRow({ task, href }: { task: TeamTaskCard; href: string }): JSX.Element {
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
