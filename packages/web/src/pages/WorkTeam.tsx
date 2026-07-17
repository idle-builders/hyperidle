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
 * (the public identifier). See plans/L13/concept.md.
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

import {
	Avatar,
	Breadcrumb,
	Button,
	betStatusToStatus,
	EmptyState,
	ErrorState,
	ItemList,
	PageHeader,
	Row,
	RowDot,
	routineStateToStatus,
	SectionLabel,
	SkeletonCard,
	SplitView,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
// @lore U1: `ProductDetail` → `TeamDetail`, `BetCardSummary.pitchTitle` → `descriptionTitle`.
import type { BetCardSummary, TeamDetail } from "@hyperidle/shared";
import {
	BET_STATUS_LABEL,
	findRoleCatalogEntry,
	formatMoney,
	relativeShort,
} from "@hyperidle/shared";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Link as RRLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { useHint } from "../hooks/useHints";
import { useTeam } from "../hooks/useTeam";
import { useTeamAgents } from "../hooks/useTeamAgents.js";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
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
	 * When true, the ArtifactSection is not rendered. Used by hint integration
	 * tests to prevent ArtifactSection from consuming mocked fetch responses
	 * before HintProvider can read them.
	 *
	 * @lore P5: React runs child effects before parent effects. ArtifactSection
	 * (child deep) fires useFetch before HintProvider (parent outer). When both
	 * components are active and fetch is mocked with mockResolvedValueOnce, the
	 * child consumes the mock first. Pass skipArtifacts={true} to prevent this
	 * in hint tests. The L12 artifact-section test does NOT pass this prop
	 * (defaults false) and mocks ArtifactSection via vi.mock() instead.
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

	// Loading state
	if (overrideLoading === true || (overrideData === undefined && fetched.loading)) {
		return (
			<div className="flex flex-col h-full" data-testid="work-team-page">
				<PageHeader title="Team" />
				<div className="flex-1 overflow-y-auto">
					<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
						<SkeletonCard ariaLabel="Loading team header" />
						<SkeletonCard ariaLabel="Loading burn vs cap" />
						<SkeletonCard ariaLabel="Loading active bets" />
						<SkeletonCard ariaLabel="Loading roster" />
					</div>
				</div>
			</div>
		);
	}

	// Error state — distinguish 404 from other errors
	if (error !== null && error !== undefined) {
		const is404 = error.message.includes("404");
		if (is404) {
			return (
				<div className="flex flex-col h-full" data-testid="work-team-page">
					<PageHeader title="Team" />
					<div className="flex-1 overflow-y-auto">
						<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
							<EmptyState
								title="Team not found"
								description="The team you are looking for does not exist or has been removed."
								dataTestId="team-not-found"
							/>
						</div>
					</div>
				</div>
			);
		}
		return (
			<div className="flex flex-col h-full" data-testid="work-team-page">
				<PageHeader title="Team" />
				<div className="flex-1 overflow-y-auto">
					<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
						<ErrorState title="Failed to load team" description={error.message} />
					</div>
				</div>
			</div>
		);
	}

	// Null data after loading/error — 404 from overrideData=null path
	if (data === null) {
		return (
			<div className="flex flex-col h-full" data-testid="work-team-page">
				<PageHeader title="Team" />
				<div className="flex-1 overflow-y-auto">
					<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
						<EmptyState
							title="Team not found"
							description="The team you are looking for does not exist or has been removed."
							dataTestId="team-not-found"
						/>
					</div>
				</div>
			</div>
		);
	}

	// @lore U6: Defensive guard against malformed API responses (e.g. stubs that return
	// { threads: [], nextCursor: null } for unrecognised URLs in tests). When data does
	// not carry the expected TeamDetail shape, render the not-found EmptyState rather
	// than crashing in WorkTeamLoaded at `data.team.leadAgentId`.
	if (!data.team) {
		return (
			<div className="flex flex-col h-full" data-testid="work-team-page">
				<PageHeader title="Team" />
				<div className="flex-1 overflow-y-auto">
					<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
						<EmptyState
							title="Team not found"
							description="The team you are looking for does not exist or has been removed."
							dataTestId="team-not-found"
						/>
					</div>
				</div>
			</div>
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
	 * (overrideData prop) to prevent ArtifactSection from calling fetch and
	 * consuming mocked responses meant for other hooks (e.g. HintProvider).
	 *
	 * @lore P5: ArtifactSection's useFetch fires before HintProvider's useEffect
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
	const { team, roster, burn, activeBets, routines = [] } = data;
	const onOpenArtifact = useArtifactOpen();
	const hintCreateBet = useHint("create-bet");
	const hintReviewAgents = useHint("review-agents");

	// @lore AV4: All three new hooks go UNCONDITIONALLY here at the top of WorkTeamLoaded,
	// NOT in WorkTeam — WorkTeam has 5 early-return guard branches (loading/error/null/no-team)
	// that would make any hook after the first guard a conditional-hook violation.
	// WorkTeamLoaded is always rendered (data guaranteed present) — safe to add hooks here.
	const [searchParams, setSearchParams] = useSearchParams();
	const [routineRatio, setRoutineRatio] = useUiPreference("work.routine", 0.5);
	const [agentRatio, setAgentRatio] = useUiPreference("work.agent", 0.5);

	const selectedRoutineId = searchParams.get("routine");
	const selectedAgentId = searchParams.get("agent");

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

	// L17: burn.costActual and burn.costCap are now WireMoney|null.
	const capPercent =
		burn.costCap !== null && burn.costCap.minor > 0
			? Math.min(1, (burn.costActual?.minor ?? 0) / burn.costCap.minor)
			: 0;

	// @lore AV4: teamBody is the team list JSX extracted into a variable so it can be:
	// 1. Rendered full-width when no selection (no-selection path — identical DOM to before).
	// 2. Passed as `origin` to SplitView when ?routine or ?agent is set.
	// The no-selection path is DOM-identical to origin/main so AG1/AB3/F1F2 tests are unaffected.
	const teamBody = (
		<div className="flex-1 overflow-y-auto" data-testid="work-team-page">
			<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
				{/* R4 — Team summary stat strip (AG1: replaces KeyValue burn list) */}
				<section aria-label="Team summary" data-testid="team-burn-vs-cap">
					{/*
					 * @lore AG1: 4 stat tiles (Burn/Cap/Capacity/Status) replace the KeyValue
					 * burn list. flex-wrap (not grid-cols-N) avoids AQ-108. Status tile is
					 * mandatory — empty roster → "—"/"No agents", never "Healthy". See
					 * plans/AG1/design/approved.md §2 + §4a.
					 */}
					<div className="flex gap-[12px] flex-wrap">
						{/* Burn tile */}
						<StatTile
							label="Burn"
							value={formatMoney(burn.costActual)}
							sub={`bets ${formatMoney(burn.betCostActual)} · routines ${formatMoney(burn.routineCostThisMonth)}/mo`}
						/>
						{/* Cap tile */}
						<StatTile
							label="Cap"
							value={burn.costCap !== null ? formatMoney(burn.costCap) : "—"}
							sub={burn.costCap !== null ? `${Math.round(capPercent * 100)}% used` : "no cap"}
						/>
						{/* Capacity tile */}
						<StatTile
							label="Capacity"
							value={`${burn.activeBets} / ${burn.capacity}`}
							sub="active bets"
						/>
						{/* Status tile — derives from roster; empty → "—"/"No agents" */}
						{(() => {
							if (roster.length === 0) {
								return <StatTile label="Status" value="—" sub="No agents" />;
							}
							const hasAttention = roster.some((m) => (m.healthLevel ?? "healthy") !== "healthy");
							const idleCount = roster.filter(
								(m) => (m.operationalStatus ?? "idle") === "idle",
							).length;
							return (
								<StatTile
									label="Status"
									value={hasAttention ? "Attention" : "Healthy"}
									sub={`${idleCount} idle agent${idleCount !== 1 ? "s" : ""}`}
								/>
							);
						})()}
					</div>
					<div className="mt-[12px]">
						{burn.costCap !== null && (
							<progress
								className="progress progress-primary w-full"
								value={capPercent}
								max={1}
								aria-label={`${Math.round(capPercent * 100)}% of cap used`}
							/>
						)}
						{burn.costCap === null && (
							<progress
								className="progress w-full"
								value={0}
								max={1}
								aria-label="Cost cap not set"
							/>
						)}
					</div>
				</section>

				{/* R2 — Active bets */}
				<section aria-label="Active bets" data-testid="team-active-bets">
					<SectionLabel
						label="Active Bets"
						as="h2"
						trailing={
							<Button
								variant="ghost"
								size="sm"
								type="button"
								onClick={() => navigate("/work/bet/new")}
								data-testid="new-bet-btn"
							>
								+ New bet
							</Button>
						}
					/>
					{activeBets.length === 0 ? (
						<>
							<EmptyState
								title="No active bets"
								description="This team has no bets in flight."
								dataTestId="team-active-bets-empty"
							/>
							{hintCreateBet.visible && (
								<div
									role="status"
									data-testid={hintCreateBet.testId}
									className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px] flex flex-col gap-[6px] mt-2"
								>
									<p className="text-[15px] text-[var(--text-secondary)] leading-[var(--leading-body)]">
										{hintCreateBet.copy}
									</p>
									<div className="flex gap-2">
										<button
											type="button"
											className="btn btn-ghost btn-xs text-[var(--text-tertiary)] min-h-[44px]"
											onClick={hintCreateBet.dismiss}
										>
											Got it
										</button>
									</div>
								</div>
							)}
						</>
					) : (
						<ItemList variant="flush" isEmpty={false}>
							{activeBets.map((bet) => (
								<BetRow
									key={bet.id}
									bet={bet}
									onNavigate={() => {
										navigate(`/work/bet/${encodeURIComponent(bet.id)}`);
									}}
								/>
							))}
						</ItemList>
					)}
				</section>

				{/* R5 — Routines (AA1): sits after active bets, before roster */}
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
							const costLabel = routine.costActual ? formatMoney(routine.costActual) : "—";
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
													className="w-[24px] h-[24px] rounded-full shrink-0 flex items-center justify-center text-[9px] font-semibold text-[var(--accent-primary)]"
													style={{ background: "var(--accent-primary-dim)" }}
													role="img"
													aria-label={routine.agentName}
													title={routine.agentName}
												>
													{routine.agentInitials}
												</span>
											),
										},
										{ content: routine.scheduleLabel, width: 80, align: "start" },
										{ content: lastRunLabel, width: 60, numeric: true },
										{ content: costLabel, width: 54, numeric: true },
									]}
									onClick={() => {
										// @lore AV4: routine row click opens split pane via ?routine param
										// (AC#1). Deep link via /work/routine/:id still works via WorkRoutine.
										setSearchParams({ routine: routine.id });
									}}
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

					{/* AB3 first-time hint — moved position, same logic */}
					{hintReviewAgents.visible && roster.length > 0 && (
						<div
							role="status"
							data-testid={hintReviewAgents.testId}
							className="rounded-[var(--r-subtle)] p-[18px] flex flex-col gap-[6px] mb-[6px]"
							style={{ background: "color-mix(in oklab, var(--accent-primary) 3%, transparent)" }}
						>
							<p className="text-[13px] text-[var(--text-secondary)] leading-[var(--leading-body)]">
								{hintReviewAgents.copy}
							</p>
							<div className="flex gap-2">
								<Button variant="ghost" size="sm" type="button" onClick={hintReviewAgents.dismiss}>
									Got it
								</Button>
							</div>
						</div>
					)}

					<ItemList
						variant="flush"
						isEmpty={roster.length === 0}
						empty={{
							title: "No agents",
							description: "No agents are assigned to this team.",
						}}
					>
						{roster.map((member) => {
							const memberStatus = member.operationalStatus ?? "idle";
							const healthLevel = member.healthLevel ?? "healthy";
							const healthDetail = member.healthDetail ?? "Healthy";
							const initials = member.name.slice(0, 2).toUpperCase();

							const healthTone =
								healthLevel === "healthy"
									? ("success" as const)
									: healthLevel === "warning"
										? ("warning" as const)
										: ("error" as const);

							const statusTone =
								memberStatus === "active"
									? ("success" as const)
									: memberStatus === "error"
										? ("error" as const)
										: undefined;

							let contextText = (() => {
								const catalogEntry = findRoleCatalogEntry(member.role);
								return catalogEntry?.description ?? member.role;
							})();
							let contextIsError = false;
							if (memberStatus === "active" && member.activeTaskTitle) {
								contextText = member.activeTaskTitle;
							} else if (memberStatus === "error") {
								contextText = healthDetail;
								contextIsError = true;
							}

							const categoryLabel =
								member.agentCategory === "strategy"
									? "App-managed"
									: member.agentCategory === "individual"
										? "Individual"
										: (member.agentCategory ?? "");

							// Category cell — first cell when non-team category.
							// @lore AG6: team agents do NOT render agent-card-category testid
							// (AB3 protected test: strategy + individual only, team = 0). The
							// AG6 "first cell" test renders app-managed agents where this is present.
							const hasCategory = member.agentCategory && member.agentCategory !== "team";

							return (
								<Row
									key={member.agentId}
									data-testid="agent-row"
									lead={
										<>
											<RowDot tone={healthTone} label={healthDetail} title={healthDetail} />
											<Avatar initials={initials} size="sm" agent />
										</>
									}
									title={
										<>
											{member.name}
											{member.isLead && (
												<span className="ml-1 text-[var(--accent-primary)] text-[10px]">
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
											content: memberStatus,
											width: 48,
											tone: statusTone,
											"data-testid": "agent-status",
										},
										{
											content: contextText,
											width: 140,
											align: "start",
											tone: contextIsError ? ("error" as const) : undefined,
											"data-testid": "agent-context",
										},
									]}
									actions={
										<button
											type="button"
											className="btn btn-ghost btn-xs shrink-0"
											onClick={(e) => {
												e.stopPropagation();
												// @lore AV4: Customize now opens AgentDetailPane in the split pane
												// via ?agent search param, not AgentEditDialog modal (AC#3).
												setSearchParams({ agent: member.agentId });
											}}
											data-testid="agent-customize-btn"
										>
											Customize
										</button>
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
						teams={[{ id: team.id, name: team.name }]}
						agents={roster
							.filter((m) => m.role !== "human")
							.map((m) => ({ id: m.agentId, name: m.name }))}
					/>
				)}
			</div>
		</div>
	); // end teamBody

	return (
		<div className="flex flex-col h-full">
			{/* AI7: PageHeader owns the pinned title strip. */}
			<PageHeader
				title={team.name}
				leading={
					/* AG4: DS Breadcrumb — team-breadcrumb-back testId preserved on first segment link */
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
					<span className="text-[13px] text-[var(--text-tertiary)]">
						Phase: {team.phase}
						{leadName && ` · Lead: ${leadName}`}
					</span>
				}
				actions={<StatusChip status={team.status} />}
			/>
			{/* @lore AV4: flex-1 body — either full-width teamBody (no selection) or SplitView.
			 * When ?routine or ?agent is set, SplitView origin=teamBody, destination=detail pane.
			 * No selection → teamBody renders identically to origin/main (AG1/AB3 tests unaffected).
			 * Routine and agent selections are mutually exclusive (plan §2.4). */}
			<div className="flex-1 overflow-hidden">
				{selectedRoutineId !== null ? (
					<SplitView
						surfaceKey="work.routine"
						mode="split"
						dividerRatio={routineRatio}
						onRatioChange={setRoutineRatio}
						onModeChange={(mode) => {
							if (mode === "fold-back") setSearchParams({});
						}}
						origin={teamBody}
						destination={
							<RoutineDetailPane
								routineId={selectedRoutineId}
								onClose={() => setSearchParams({})}
							/>
						}
					/>
				) : selectedAgentId !== null ? (
					<SplitView
						surfaceKey="work.agent"
						mode="split"
						dividerRatio={agentRatio}
						onRatioChange={setAgentRatio}
						onModeChange={(mode) => {
							if (mode === "fold-back") setSearchParams({});
						}}
						origin={teamBody}
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
					teamBody
				)}
			</div>

			{/* AB3: Add dialog — only mounted when open to avoid DOM content collisions */}
			{addDialogOpen && (
				<AgentAddDialog
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
		</div>
	);
}

// ---------------------------------------------------------------------------
// StatTile — AG1: private display tile for the summary stat strip.
// Label-over-value layout. Not exported — file-local helper only.
// Each tile gets data-testid="stat-tile" so tests can count and inspect them.
// ---------------------------------------------------------------------------

/**
 * AG1: Private stat tile. One tile per summary metric (Burn/Cap/Capacity/Status).
 * Display-only; no interactivity. value and sub are pre-formatted strings.
 *
 * @lore AG1: flex-1 min-w-[180px] allows tiles to wrap (flex-wrap on container)
 * at narrow viewports without breaking to 4 stacked rows at normal desktop widths.
 */
function StatTile({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}): JSX.Element {
	return (
		<div
			data-testid="stat-tile"
			className="flex-1 min-w-[180px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] p-[18px] flex flex-col gap-[6px]"
		>
			<span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]">
				{label}
			</span>
			<span className="text-[20px] font-semibold text-[var(--text-primary)] tabular-nums">
				{value}
			</span>
			{sub !== undefined && (
				<span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">{sub}</span>
			)}
		</div>
	);
}

/**
 * Single active-bet row rendered inside R2. Uses design-system Row for flush layout.
 * @lore F1 (POLISH-060): replaced hand-rolled grey button with Row primitive — drops
 * bg-[var(--surface-container)] so bets sit flush on the page, not in a grey card.
 */
function BetRow({ bet, onNavigate }: { bet: BetCardSummary; onNavigate: () => void }): JSX.Element {
	const progressText = bet.progressTotal > 0 ? `${bet.progressDone}/${bet.progressTotal}` : "—";

	return (
		<Row
			title={bet.descriptionTitle}
			onClick={onNavigate}
			cells={[
				{ content: formatMoney(bet.costAppetite), numeric: true },
				{ content: progressText, numeric: true },
			]}
			actions={
				/* C1: label so team surface reads "ACTIVE" not "HEALTHY" */
				<StatusChip status={betStatusToStatus(bet.status)} label={BET_STATUS_LABEL[bet.status]} />
			}
		/>
	);
}
