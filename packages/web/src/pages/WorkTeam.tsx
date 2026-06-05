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
	KeyValue,
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
import { findRoleCatalogEntry, formatMoney } from "@hyperidle/shared";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { useHint } from "../hooks/useHints";
import { useTeam } from "../hooks/useTeam";
import { useTeamAgents } from "../hooks/useTeamAgents.js";
import { AgentAddDialog } from "./AgentAddDialog.js";
import { AgentEditDialog } from "./AgentEditDialog.js";

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
			<div className="flex flex-col gap-[12px] h-full" data-testid="work-team-page">
				<SkeletonCard ariaLabel="Loading team header" />
				<SkeletonCard ariaLabel="Loading burn vs cap" />
				<SkeletonCard ariaLabel="Loading active bets" />
				<SkeletonCard ariaLabel="Loading roster" />
			</div>
		);
	}

	// Error state — distinguish 404 from other errors
	if (error !== null && error !== undefined) {
		const is404 = error.message.includes("404");
		if (is404) {
			return (
				<div className="flex flex-col gap-[12px] h-full" data-testid="work-team-page">
					<EmptyState
						title="Team not found"
						description="The team you are looking for does not exist or has been removed."
						dataTestId="team-not-found"
					/>
				</div>
			);
		}
		return (
			<div className="flex flex-col gap-[12px] h-full" data-testid="work-team-page">
				<ErrorState title="Failed to load team" description={error.message} />
			</div>
		);
	}

	// Null data after loading/error — 404 from overrideData=null path
	if (data === null) {
		return (
			<div className="flex flex-col gap-[12px] h-full" data-testid="work-team-page">
				<EmptyState
					title="Team not found"
					description="The team you are looking for does not exist or has been removed."
					dataTestId="team-not-found"
				/>
			</div>
		);
	}

	// @lore U6: Defensive guard against malformed API responses (e.g. stubs that return
	// { threads: [], nextCursor: null } for unrecognised URLs in tests). When data does
	// not carry the expected TeamDetail shape, render the not-found EmptyState rather
	// than crashing in WorkTeamLoaded at `data.team.leadAgentId`.
	if (!data.team) {
		return (
			<div className="flex flex-col gap-[12px] h-full" data-testid="work-team-page">
				<EmptyState
					title="Team not found"
					description="The team you are looking for does not exist or has been removed."
					dataTestId="team-not-found"
				/>
			</div>
		);
	}

	return <WorkTeamLoaded data={data} skipArtifacts={skipArtifacts} />;
}

/** Internal component rendered when data is fully resolved. */
function WorkTeamLoaded({
	data,
	skipArtifacts = false,
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
		<div className="flex flex-col gap-[12px] h-full" data-testid="work-team-page">
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

			{/* R4 — Team burn vs cap */}
			<section
				aria-label="Team burn vs cap"
				data-testid="team-burn-vs-cap"
				className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
			>
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Burn vs Cap
				</h2>
				<div className="flex flex-col gap-1">
					<KeyValue label="Cost (actual)" value={formatMoney(burn.costActual)} />
					<KeyValue label="Cap" value={formatMoney(burn.costCap)} />
					<KeyValue label="Capacity" value={`${burn.activeBets} / ${burn.capacity}`} />
				</div>
				{burn.costCap !== null && (
					<progress
						className="progress progress-primary w-full mt-2"
						value={capPercent}
						max={1}
						aria-label={`${Math.round(capPercent * 100)}% of cap used`}
					/>
				)}
				{burn.costCap === null && (
					<progress
						className="progress w-full mt-2"
						value={0}
						max={1}
						aria-label="Cost cap not set"
					/>
				)}
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
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Routines
				</h2>
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

			{/* R3 — Roster */}
			<section aria-label="Team roster" data-testid="team-roster">
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Roster
				</h2>

				{/* AB3: first-time hint — visible when hint not dismissed and roster is non-empty */}
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

				{roster.length === 0 ? (
					<EmptyState
						title="Roster not configured"
						description="No agents are assigned to this team."
					/>
				) : (
					<div className="flex flex-col gap-[6px]">
						{roster.map((member) => (
							<AgentCard
								key={member.agentId}
								member={member}
								onCustomize={() => setEditingAgentId(member.agentId)}
							/>
						))}
						{/* AB3: Add agent button */}
						<Button
							variant="ghost"
							size="sm"
							type="button"
							className="self-start mt-[6px]"
							onClick={() => setAddDialogOpen(true)}
						>
							+ Add agent
						</Button>
					</div>
				)}
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
		</div>
	);
}

// ---------------------------------------------------------------------------
// AgentCard — AB3: enhanced roster card with description, category tag, edit button
// ---------------------------------------------------------------------------

/**
 * AB3: Clickable agent card replacing the flat roster row.
 * Clicking the card (or Customize button) opens the edit dialog.
 */
function AgentCard({
	member,
	onCustomize,
}: {
	member: RosterMember;
	onCustomize: () => void;
}): JSX.Element {
	const catalogEntry = findRoleCatalogEntry(member.role);
	const description = catalogEntry?.description ?? member.role;
	const initials = member.name.slice(0, 2).toUpperCase();

	return (
		// @lore AB3: Outer wrapper is a div with role="button" (not a <button>) because the
		// inner "Customize" is a real <button>. Nested <button> elements are invalid HTML and
		// break screen readers. role="button" + tabIndex={0} + onKeyDown gives equivalent
		// keyboard accessibility without the nesting violation.
		// biome-ignore lint/a11y/useSemanticElements: div intentional — nested <button> inside would be invalid HTML (CRITICAL-1 fix)
		<div
			role="button"
			tabIndex={0}
			data-testid="agent-card"
			onClick={onCustomize}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onCustomize();
				}
			}}
			className="w-full text-left rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px] hover:bg-[var(--surface-elevated)] transition-colors duration-[var(--motion-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] cursor-pointer"
		>
			{/* Row 1: avatar + name + lead + category tag + customize button */}
			<div className="flex items-center gap-[12px]">
				<Avatar initials={initials} size="sm" agent />
				<span
					data-testid="agent-card-name"
					className="text-[13px] font-medium text-[var(--text-primary)] truncate flex-1"
				>
					{member.name}
					{member.isLead && (
						<span className="ml-1 text-[var(--accent-primary)] text-[10px]"> — Lead</span>
					)}
				</span>
				{/* Category tag for non-team agents */}
				{member.agentCategory && member.agentCategory !== "team" && (
					<span data-testid="agent-card-category">
						<Tag
							label={
								member.agentCategory === "strategy"
									? "Strategy"
									: member.agentCategory === "personal"
										? "Personal"
										: member.agentCategory
							}
						/>
					</span>
				)}
				{/* Customize button — stopPropagation prevents double-fire with card click */}
				<Button
					variant="ghost"
					size="sm"
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onCustomize();
					}}
				>
					Customize
				</Button>
			</div>
			{/* Row 2: role description */}
			<p
				data-testid="agent-card-description"
				className="text-[12px] text-[var(--text-tertiary)] truncate mt-[3px] ml-[40px]"
			>
				{description}
			</p>
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

	const lastRunLabel = routine.lastRunAt ? formatRelativeTime(routine.lastRunAt) : "Never";

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

/** Format an ISO datetime string as a human-readable relative time label. */
function formatRelativeTime(isoString: string): string {
	const diffMs = Date.now() - new Date(isoString).getTime();
	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return `${diffSec}s ago`;
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.floor(diffHr / 24);
	return `${diffDay}d ago`;
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
				<StatusChip status={betStatusToStatus(bet.status)} />
				<span className="text-[10px] font-mono text-[var(--text-tertiary)]">
					{formatMoney(bet.costAppetite)}
				</span>
				<span className="text-[10px] font-mono text-[var(--text-tertiary)]">{progressText}</span>
			</div>
		</button>
	);
}
