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
	Button,
	betStatusToStatus,
	EmptyState,
	ErrorState,
	routineStateToStatus,
	SkeletonCard,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
// @lore U1: `ProductDetail` → `TeamDetail`, `BetCardSummary.pitchTitle` → `descriptionTitle`.
import type {
	BetCardSummary,
	RosterMember,
	RoutineCardSummary,
	TeamDetail,
} from "@hyperidle/shared";
import {
	BET_STATUS_LABEL,
	findRoleCatalogEntry,
	formatMoney,
	relativeShort,
} from "@hyperidle/shared";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { useHint } from "../hooks/useHints";
import { useTeam } from "../hooks/useTeam";
import { useTeamAgents } from "../hooks/useTeamAgents.js";
import { AgentAddDialog } from "./AgentAddDialog.js";
import { AgentEditDialog } from "./AgentEditDialog.js";
import { RoutineCreateDialog } from "./work/RoutineCreateDialog.js";

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
			<div className="flex-1 overflow-y-auto" data-testid="work-team-page">
				<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
					<SkeletonCard ariaLabel="Loading team header" />
					<SkeletonCard ariaLabel="Loading burn vs cap" />
					<SkeletonCard ariaLabel="Loading active bets" />
					<SkeletonCard ariaLabel="Loading roster" />
				</div>
			</div>
		);
	}

	// Error state — distinguish 404 from other errors
	if (error !== null && error !== undefined) {
		const is404 = error.message.includes("404");
		if (is404) {
			return (
				<div className="flex-1 overflow-y-auto" data-testid="work-team-page">
					<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
						<EmptyState
							title="Team not found"
							description="The team you are looking for does not exist or has been removed."
							dataTestId="team-not-found"
						/>
					</div>
				</div>
			);
		}
		return (
			<div className="flex-1 overflow-y-auto" data-testid="work-team-page">
				<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
					<ErrorState title="Failed to load team" description={error.message} />
				</div>
			</div>
		);
	}

	// Null data after loading/error — 404 from overrideData=null path
	if (data === null) {
		return (
			<div className="flex-1 overflow-y-auto" data-testid="work-team-page">
				<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
					<EmptyState
						title="Team not found"
						description="The team you are looking for does not exist or has been removed."
						dataTestId="team-not-found"
					/>
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
			<div className="flex-1 overflow-y-auto" data-testid="work-team-page">
				<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
					<EmptyState
						title="Team not found"
						description="The team you are looking for does not exist or has been removed."
						dataTestId="team-not-found"
					/>
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
	// @lore U1: `team` replaces `product` in TeamDetail.
	// @lore AA1: routines defaults to [] so pre-AA1 mock data (missing the field) doesn't crash.
	const { team, roster, burn, activeBets, routines = [] } = data;
	const onOpenArtifact = useArtifactOpen();
	const hintCreateBet = useHint("create-bet");
	const hintReviewAgents = useHint("review-agents");

	// AB3: dialog state
	const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	// AA2: routine create dialog state
	const [createRoutineOpen, setCreateRoutineOpen] = useState(false);

	// AB3: fetch full agent configs for the roster.
	// @lore AB3: rosterAgentIds MUST be memoized — passing an inline array on
	// every render triggers a new fetch on every render cycle. useMemo ensures
	// the array reference only changes when the roster content changes.
	const rosterAgentIds = useMemo(() => roster.map((m) => m.agentId), [roster]);
	const { agents: agentConfigs, refetch: refetchAgents } = useTeamAgents(rosterAgentIds);

	const editingAgent = editingAgentId !== null ? (agentConfigs.get(editingAgentId) ?? null) : null;
	const editingRosterMember =
		editingAgentId !== null ? (roster.find((m) => m.agentId === editingAgentId) ?? null) : null;

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

	return (
		<div className="flex-1 overflow-y-auto" data-testid="work-team-page">
			<div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">
				{/* R1 — Team header */}
				<section aria-label="Team header">
					{/* Breadcrumb chip (N1 design) */}
					<div className="mb-1">
						<Link
							to="/work/portfolio"
							data-testid="team-breadcrumb-back"
							className="btn btn-ghost btn-xs"
						>
							← Portfolio
						</Link>
					</div>
					<div className="flex items-center gap-[12px] flex-wrap">
						<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-primary)] flex-1">
							{team.name}
						</h1>
						<StatusChip status={team.status} />
					</div>
					<div className="mt-1 text-xs text-[var(--text-tertiary)]">
						<span>Phase: {team.phase}</span>
						{leadName && <span className="ml-3">Lead: {leadName}</span>}
					</div>
				</section>

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
					<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
						Active Bets
					</h2>
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
						<div className="flex flex-col gap-[6px]">
							{activeBets.map((bet) => (
								<BetRow
									key={bet.id}
									bet={bet}
									onNavigate={() => {
										navigate(`/work/bet/${encodeURIComponent(bet.id)}`);
									}}
								/>
							))}
						</div>
					)}
				</section>

				{/* R5 — Routines (AA1): sits after active bets, before roster */}
				<section aria-label="Team routines" data-testid="team-routines">
					<div className="flex items-center mb-2">
						<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] flex-1">
							Routines
						</h2>
						<Button
							variant="ghost"
							size="sm"
							type="button"
							onClick={() => setCreateRoutineOpen(true)}
							data-testid="new-routine-btn"
						>
							+ New routine
						</Button>
					</div>
					<div className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px]">
						{routines.length === 0 ? (
							<EmptyState
								title="No routines"
								description="This team has no recurring work configured."
								dataTestId="team-routines-empty"
							/>
						) : (
							routines.map((routine, idx) => (
								<RoutineRow
									key={routine.id}
									routine={routine}
									isLast={idx === routines.length - 1}
									onNavigate={() => {
										navigate(`/work/routine/${encodeURIComponent(routine.id)}`);
									}}
								/>
							))
						)}
					</div>
				</section>

				{/* R3 — Agents (AB2: replaces Roster/AgentCard with flat AgentRow rows) */}
				<section aria-label="Team agents" data-testid="team-agents">
					<div className="flex items-center mb-2">
						<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] flex-1">
							Agents
						</h2>
						<Button
							variant="ghost"
							size="sm"
							type="button"
							onClick={() => setAddDialogOpen(true)}
							data-testid="add-agent-btn"
						>
							+ Add agent
						</Button>
					</div>

					{/* AB3 first-time hint — moved position, same logic */}
					{hintReviewAgents.visible && roster.length > 0 && (
						<div
							role="status"
							data-testid={hintReviewAgents.testId}
							className="rounded-[var(--r-subtle)] p-[18px] flex flex-col gap-[6px] mb-[6px]"
							style={{ background: "rgba(22,118,79,0.03)" }}
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

					<div className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px]">
						{roster.length === 0 ? (
							<EmptyState title="No agents" description="No agents are assigned to this team." />
						) : (
							roster.map((member, idx) => (
								<AgentRow
									key={member.agentId}
									member={member}
									isLast={idx === roster.length - 1}
									onNavigate={() => navigate(`/agents/${encodeURIComponent(member.agentId)}`)}
									onCustomize={() => setEditingAgentId(member.agentId)}
								/>
							))
						)}
					</div>
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

				{/* AB3: Edit dialog — only mounted when a card is being edited.
			    Mirrors the addDialogOpen pattern to avoid unconditional useToast calls. */}
				{editingAgentId !== null && (
					<AgentEditDialog
						agent={editingAgent}
						rosterMember={editingRosterMember}
						onClose={() => setEditingAgentId(null)}
						onSaved={() => {
							refetchAgents();
							setEditingAgentId(null);
						}}
					/>
				)}

				{/* AB3: Add dialog — only mounted when open to avoid DOM content collisions */}
				{addDialogOpen && (
					<AgentAddDialog
						open={addDialogOpen}
						teamMembersId={data.teamMembers.id}
						onClose={() => setAddDialogOpen(false)}
						onCreated={() => {
							refetchAgents();
							setAddDialogOpen(false);
						}}
					/>
				)}

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
			className="flex-1 min-w-[180px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px] flex flex-col gap-[6px]"
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

// ---------------------------------------------------------------------------
// AgentRow — AB2: flat row for the Agents section (replaces AgentCard)
// ---------------------------------------------------------------------------

/**
 * AB2: Flat agent row replacing AgentCard. Matches RoutineRow pattern.
 *
 * Layout: [6px health dot] [avatar sm] [name flex-1] [status 48px] [context flex-1] [Customize btn-xs]
 * Height: 36px minimum (min-h-[44px] for touch target). Hairline separator between rows.
 *
 * @lore AB2 S4/W4: Outer element is a <div role="button"> NOT a <button> because the
 * inner "Customize" is a real <button>. Nested <button> elements are invalid HTML and
 * break screen readers. role="button" + tabIndex + onKeyDown gives equivalent keyboard
 * accessibility without the HTML validity violation.
 *
 * @lore AB2 S2: Health dot uses role="img" with aria-label instead of aria-hidden,
 * so screen readers can convey health status to users.
 */
function AgentRow({
	member,
	isLast,
	onNavigate,
	onCustomize,
}: {
	member: RosterMember;
	isLast: boolean;
	onNavigate: () => void;
	onCustomize: () => void;
}): JSX.Element {
	const catalogEntry = findRoleCatalogEntry(member.role);
	const description = catalogEntry?.description ?? member.role;
	const initials = member.name.slice(0, 2).toUpperCase();

	// Derive display values from operational fields (default to idle/healthy if absent)
	const status = member.operationalStatus ?? "idle";
	const healthLevel = member.healthLevel ?? "healthy";
	const healthDetail = member.healthDetail ?? "Healthy";

	// Context column: task title (active), error detail (error), role description (idle)
	let contextText = description;
	let contextIsError = false;
	if (status === "active" && member.activeTaskTitle) {
		contextText = member.activeTaskTitle;
	} else if (status === "error") {
		contextText = healthDetail;
		contextIsError = true;
	}

	// Health dot color
	const dotColor =
		healthLevel === "healthy"
			? "var(--status-success)"
			: healthLevel === "warning"
				? "var(--status-warning)"
				: "var(--status-error)";

	// Status text color
	const statusColor =
		status === "active"
			? "var(--status-success)"
			: status === "error"
				? "var(--status-error)"
				: "var(--text-tertiary)";

	return (
		// biome-ignore lint/a11y/useSemanticElements: div intentional — nested <button> (Customize) inside would be invalid HTML
		<div
			role="button"
			tabIndex={0}
			data-testid="agent-row"
			onClick={onNavigate}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onNavigate();
				}
			}}
			className={[
				"w-full flex items-center gap-[9px] px-[6px]",
				"border-none bg-transparent text-left cursor-pointer",
				"transition-[background-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				"hover:bg-[rgba(44,36,26,0.02)]",
				"focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]",
				!isLast ? "border-b border-[var(--border-subtle)]" : "",
			]
				.filter(Boolean)
				.join(" ")}
			style={{ minHeight: "44px" }}
		>
			{/* Health dot — role="img" per reviewer S2 so screen readers convey health state */}
			<span
				className="w-[6px] h-[6px] rounded-full shrink-0"
				style={{ background: dotColor }}
				role="img"
				aria-label={healthDetail}
				title={healthDetail}
			/>

			{/* Avatar */}
			<Avatar initials={initials} size="sm" agent />

			{/* Name + Lead marker */}
			<span className="flex-1 min-w-0 text-[13px] font-medium text-[var(--text-primary)] truncate">
				{member.name}
				{member.isLead && (
					<span className="ml-1 text-[var(--accent-primary)] text-[10px]"> — Lead</span>
				)}
			</span>

			{/* Category tag — strategy/individual agents only.
			    @lore AB2: Preserved from AB3's AgentCard so AB3 tests (agent-card-category)
			    continue to work after the roster section was replaced with AgentRow. */}
			{member.agentCategory && member.agentCategory !== "team" && (
				<span data-testid="agent-card-category" className="shrink-0">
					<Tag
						label={
							member.agentCategory === "strategy"
								? "Strategy"
								: member.agentCategory === "individual"
									? "Individual"
									: member.agentCategory
						}
					/>
				</span>
			)}

			{/* Status label */}
			<span
				className="w-[48px] shrink-0 text-[11px] font-mono truncate"
				style={{ color: statusColor }}
				data-testid="agent-status"
			>
				{status}
			</span>

			{/* Context column */}
			<span
				className={`flex-1 min-w-0 text-[11px] truncate ${contextIsError ? "text-[var(--status-error)]" : "text-[var(--text-tertiary)]"}`}
				data-testid="agent-context"
			>
				{contextText}
			</span>

			{/* Customize button — stopPropagation prevents row click */}
			<button
				type="button"
				className="btn btn-ghost btn-xs shrink-0"
				onClick={(e) => {
					e.stopPropagation();
					onCustomize();
				}}
				data-testid="agent-customize-btn"
			>
				Customize
			</button>
		</div>
	);
}

/**
 * Single routine row rendered inside R5 (AA1). Variant B flat table design.
 *
 * Layout: [6px dot] [name flex-1] [24px agent avatar] [schedule 80px] [last run 60px] [cost 54px]
 * Height: 36px. Hairline separator between rows (not on last row).
 *
 * @lore AA1: Routines use flat table rows (infrastructure monitoring) while bets use
 * elevated cards (decision objects). Visual differentiation supports faster status scanning.
 * Row hover uses rgba(44,36,26,0.02) per AQ-010 flat-list hover pattern.
 */
function RoutineRow({
	routine,
	isLast,
	onNavigate,
}: {
	routine: RoutineCardSummary;
	isLast: boolean;
	onNavigate: () => void;
}): JSX.Element {
	const status = routineStateToStatus(routine.state);
	const dotColor =
		status === "healthy"
			? "var(--status-success)"
			: status === "error"
				? "var(--status-error)"
				: status === "paused"
					? "var(--status-info)"
					: "var(--text-tertiary)";

	const lastRunLabel = routine.lastRunAt ? relativeShort(routine.lastRunAt) : "Never";

	const costLabel = routine.costActual ? formatMoney(routine.costActual) : "—";

	return (
		<button
			type="button"
			data-testid="routine-row"
			onClick={onNavigate}
			className={[
				"w-full flex items-center gap-[9px] h-[36px] px-[6px]",
				"border-none bg-transparent text-left cursor-pointer",
				"transition-[background-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				"hover:bg-[rgba(44,36,26,0.02)]",
				"focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]",
				!isLast ? "border-b border-[var(--border-subtle)]" : "",
			]
				.filter(Boolean)
				.join(" ")}
			style={{ minHeight: "44px" }}
		>
			{/* Status dot — 6px circle */}
			<span
				className="w-[6px] h-[6px] rounded-full shrink-0"
				style={{ background: dotColor }}
				aria-hidden="true"
			/>

			{/* Routine name — flex-1 */}
			<span className="flex-1 min-w-0 text-[13px] font-medium text-[var(--text-primary)] truncate">
				{routine.name}
			</span>

			{/* Agent avatar — 24px */}
			<span
				className="w-[24px] h-[24px] rounded-full shrink-0 flex items-center justify-center text-[9px] font-semibold text-[var(--accent-primary)]"
				style={{ background: "rgba(22,118,79,0.08)" }}
				aria-label={routine.agentName}
				title={routine.agentName}
			>
				{routine.agentInitials}
			</span>

			{/* Schedule — 80px mono tertiary */}
			<span className="w-[80px] shrink-0 text-[11px] font-mono text-[var(--text-tertiary)] truncate">
				{routine.scheduleLabel}
			</span>

			{/* Last run — 60px mono right-aligned tabular */}
			<span className="w-[60px] shrink-0 text-[11px] font-mono text-[var(--text-tertiary)] text-right tabular-nums">
				{lastRunLabel}
			</span>

			{/* Cost — 54px mono right-aligned tabular */}
			<span className="w-[54px] shrink-0 text-[11px] font-mono text-[var(--text-tertiary)] text-right tabular-nums">
				{costLabel}
			</span>
		</button>
	);
}

/** Single active-bet row rendered inside R2. Clickable → navigates to Bet detail. */
function BetRow({ bet, onNavigate }: { bet: BetCardSummary; onNavigate: () => void }): JSX.Element {
	const progressText = bet.progressTotal > 0 ? `${bet.progressDone}/${bet.progressTotal}` : "—";

	return (
		<button
			type="button"
			onClick={onNavigate}
			className="w-full text-left rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px] hover:bg-[var(--surface-elevated)] transition-colors duration-[var(--motion-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
		>
			<div className="flex items-center gap-[12px] flex-wrap">
				<span className="flex-1 text-xs font-medium text-[var(--text-primary)] truncate">
					{/* @lore U1: descriptionTitle replaces pitchTitle */}
					{bet.descriptionTitle}
				</span>
				{/* C1: add label so team surface reads "ACTIVE" not "HEALTHY" */}
				<StatusChip status={betStatusToStatus(bet.status)} label={BET_STATUS_LABEL[bet.status]} />
				<span className="text-[10px] font-mono text-[var(--text-tertiary)]">
					{formatMoney(bet.costAppetite)}
				</span>
				<span className="text-[10px] font-mono text-[var(--text-tertiary)]">{progressText}</span>
			</div>
		</button>
	);
}
