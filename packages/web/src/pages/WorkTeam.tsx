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
	betStatusToStatus,
	EmptyState,
	ErrorState,
	KeyValue,
	SkeletonCard,
	StatusChip,
} from "@hyperidle/design-system";
// @lore U1: `ProductDetail` → `TeamDetail`, `BetCardSummary.pitchTitle` → `descriptionTitle`.
import type { BetCardSummary, TeamDetail } from "@hyperidle/shared";
import { formatMoney } from "@hyperidle/shared";
import type { JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { useHint } from "../hooks/useHints";
import { useTeam } from "../hooks/useTeam";

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
	const { team, roster, burn, activeBets } = data;
	const onOpenArtifact = useArtifactOpen();
	const hintCreateBet = useHint("create-bet");

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

			{/* R3 — Roster */}
			<section aria-label="Team roster" data-testid="team-roster">
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Roster
				</h2>
				{roster.length === 0 ? (
					<EmptyState
						title="Roster not configured"
						description="No agents are assigned to this team."
					/>
				) : (
					<div className="flex flex-col gap-1">
						{roster.map((member) => (
							<div
								key={member.agentId}
								data-testid="team-roster-row"
								data-is-lead={member.isLead ? "true" : "false"}
								className="flex items-center gap-[12px] py-1 px-2 rounded-[var(--r-none)] bg-[var(--surface-container)]"
							>
								<div className="flex-none w-7 h-7 rounded-full bg-[var(--surface-elevated)] flex items-center justify-center text-[10px] font-mono text-[var(--text-primary)] uppercase">
									{member.name.slice(0, 2)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="text-xs font-medium text-[var(--text-primary)] truncate">
										{member.name}
									</div>
									<div className="text-[10px] text-[var(--text-tertiary)] truncate">
										{member.role}
										{member.isLead && (
											<span className="ml-1 text-[var(--accent-primary)]">· Lead</span>
										)}
									</div>
								</div>
							</div>
						))}
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
		</div>
	);
}

/** Single active-bet row rendered inside R2. Clickable → navigates to Bet detail. */
function BetRow({ bet, onNavigate }: { bet: BetCardSummary; onNavigate: () => void }): JSX.Element {
	const progressText = bet.progressTotal > 0 ? `${bet.progressDone}/${bet.progressTotal}` : "—";

	return (
		<button
			type="button"
			onClick={onNavigate}
			className="w-full text-left rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px] hover:bg-[var(--surface-elevated)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
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
