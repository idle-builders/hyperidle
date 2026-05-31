/**
 * Work/Portfolio page — portfolio overview composed from product status
 * cards + portfolio metrics. Per spec (HUMAN_INTERFACE_LAYER.md §4.3) the
 * Portfolio canvas is a *summary* of products, not the bet board (which
 * lives in WorkTeam — now deleted in L13).
 *
 * @lore J5: each product card now surfaces lead agent avatar, active bet
 * count, shipped count, ship-rate, and an active-cycle progress bar. A
 * cycle-management stripe appears below the grid showing the current
 * cycle and days remaining.
 *
 * @lore L13: WorkPortfolio now calls useProducts() for real data. When the
 * hook is loading or the API is unavailable, it shows an empty/loading state
 * rather than falling back to a fixture. Real data drives all product cards.
 * Each product card is clickable
 * and navigates to /work/product/:id (N1 drill-down pattern).
 *
 * @lore M3 review C1: PortfolioProduct type moved here from
 * fixtures/portfolio-data.ts (which has been deleted). The type is a
 * page-local shape; co-locating it avoids indirect dependencies on fixture
 * files from production code.
 */
import type { Status } from "@hyperidle/design-system";
import { EmptyState, KeyValue, SkeletonCard, StatusChip } from "@hyperidle/design-system";
import type { JSX } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { useCanvasBets } from "../hooks/useCanvasBets.js";
import { useTeams } from "../hooks/useTeams";
import { apiFetch } from "../services/api-fetch.js";
import { Canvas } from "../shell/Canvas.js";
import { BetCreateDialog } from "./work/BetCreateDialog.js";

/**
 * Page-local shape for a team card in the Portfolio view.
 * Previously exported from fixtures/portfolio-data.ts; moved here on M3 review C1.
 *
 * @lore U5: Renamed from PortfolioProduct → PortfolioTeam.
 */
export interface PortfolioTeam {
	id: string;
	name: string;
	status: Status;
	activeBets: number;
	shipRate: string;
	lead: { name: string; initials: string };
	shipped: number;
	progress: { done: number; total: number };
}

export interface WorkPortfolioProps {
	/**
	 * J8: opt-in loading state so callers (and stories) can render a
	 * card-grid skeleton. Defaults to false so the production render path
	 * is unchanged.
	 */
	loading?: boolean;
	/**
	 * J8: opt-in override of the team list so the empty state can be
	 * exercised via props (and in stories) without mutating the shared
	 * fixture module.
	 *
	 * @lore M3 G1: no more products fixture fallback — callers must pass real data
	 * or leave undefined (renders empty/loading state). Type changed to
	 * `PortfolioTeam[] | undefined`.
	 * @lore U5: Renamed from `products` → `teams`.
	 */
	teams?: PortfolioTeam[];
}

export function WorkPortfolio({ loading = false, teams }: WorkPortfolioProps = {}): JSX.Element {
	const navigate = useNavigate();
	// @lore U1: `useTeams` returns `TeamListResponse` with `teams` array.
	const { data: teamsData } = useTeams();
	const onOpenArtifact = useArtifactOpen();
	const { bets: canvasBets, capacity: canvasCapacity, refresh: refreshCanvas } = useCanvasBets();
	const [dialogOpen, setDialogOpen] = useState(false);

	// Use injected teams prop first (stories/tests), then real API data.
	// No fixture fallback — show empty state when data is unavailable.
	// @lore M3 G1: The products fixture was deleted — the real wiring from L13 is now
	// the only production data path.
	const items: PortfolioTeam[] =
		teams ??
		// @lore U1: TeamListResponse uses `teams` array.
		teamsData?.teams.map((p) => ({
			id: p.id,
			name: p.name,
			status: p.status as PortfolioTeam["status"],
			activeBets: p.activeBets,
			shipRate: p.shipRate,
			lead: {
				name: p.leadAgentId ?? "—",
				initials: (p.leadAgentId ?? "—").slice(0, 2).toUpperCase(),
			},
			shipped: p.shipped,
			progress: p.progress,
		})) ??
		[];

	// Only show skeleton when explicitly requested via loading prop.
	const isLoading = loading;

	if (isLoading) {
		return (
			<div
				className="flex flex-col gap-[var(--density-gap)] h-full"
				data-testid="work-portfolio-page"
			>
				<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
					Portfolio
				</h1>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]">
					<SkeletonCard ariaLabel="Loading team" />
					<SkeletonCard ariaLabel="Loading team" />
					<SkeletonCard ariaLabel="Loading team" />
				</div>
			</div>
		);
	}

	return (
		<div
			/*
			 * @lore K11: page section gap → --density-gap per
			 * density-audit.md § 3.4.P1. Page outer pad inherits from
			 * `<main>`'s --density-page-gutter. The H1 stays uppercase mono
			 * (chrome) and does NOT consume --density-text-h1.
			 */
			className="flex flex-col gap-[var(--density-gap)] h-full"
			data-testid="work-portfolio-page"
		>
			<div className="flex items-center justify-between">
				<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
					Portfolio
				</h1>
				<Link to="/onboarding" className="btn btn-primary btn-xs">
					Add team
				</Link>
			</div>
			{items.length === 0 ? (
				<EmptyState
					title="No teams in the portfolio"
					description="Create your first team to start working with AI agents."
					dataTestId="portfolio-empty"
				/>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]">
					{items.map((teamItem) => (
						/*
						 * @lore K11 § 3.4.P1: the inline team card adopts
						 * BetCard's density shape (--density-card-pad,
						 * --density-card-gap, --density-text title) so it
						 * scales in the same direction. Future story should
						 * unify with BetCard outright (BetCard already has
						 * leadAvatar / activeBets / shipped portfolio props
						 * from J5). The team avatar stays literal 24 px
						 * — card-internal, not row-anchor (§ 4.4).
						 */
						<button
							key={teamItem.id}
							type="button"
							data-testid="team-card"
							onClick={() => navigate(`/work/team/${encodeURIComponent(teamItem.id)}`)}
							className="bg-base-200 rounded-lg p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] text-left w-full cursor-pointer hover:bg-base-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
						>
							<div className="flex items-center gap-[var(--density-gap)]">
								<span
									className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-300 text-[var(--text-hi)] text-xs font-semibold"
									aria-label={`Lead agent: ${teamItem.lead.name}`}
								>
									{teamItem.lead.initials}
								</span>
								<span className="text-[length:var(--density-text)] font-medium text-[var(--text-hi)] flex-1 truncate">
									{teamItem.name}
								</span>
								<StatusChip status={teamItem.status} />
							</div>
							<KeyValue
								label={teamItem.activeBets === 1 ? "Active bet" : "Active bets"}
								value={String(teamItem.activeBets)}
							/>
							<KeyValue label="Shipped" value={String(teamItem.shipped)} />
							<KeyValue label="Ship rate" value={teamItem.shipRate} />
							<div className="flex items-center gap-[var(--density-gap)]">
								{/* @lore K10: progress-bar height stays literal (h-1.5 / 6 px) —
								    instrument metric per density-audit.md § 3.4.P1. */}
								<progress
									className="progress progress-accent w-full h-1.5"
									value={teamItem.progress.done}
									max={teamItem.progress.total}
									aria-label={`Cycle progress for ${teamItem.name}`}
								/>
								<span className="text-xs text-[var(--text-mid)] shrink-0">
									{teamItem.progress.done}/{teamItem.progress.total}
								</span>
							</div>
						</button>
					))}
				</div>
			)}
			{/* @lore M3 G1: The cycle fixture was removed. Cycle data is not yet wired from the
			    server (deferred follow-up). The stripe is hidden when no real cycle
			    data is available rather than showing mock "Cycle 12". */}

			{/* R2 AC-7: "Create bet" CTA when products exist but no bets yet.
			    The CTA auto-hides once the first bet appears on the canvas. */}
			{items.length > 0 && canvasBets.length === 0 && (
				<EmptyState
					title="Ready to shape your first bet"
					description="A bet is a time-boxed commitment. Pitch what you want built."
					action={
						<button
							type="button"
							className="btn btn-primary btn-sm min-h-[44px]"
							onClick={() => setDialogOpen(true)}
						>
							Create bet
						</button>
					}
					dataTestId="create-bet-cta"
				/>
			)}

			{/* Q3 T1/T6: Bet Canvas — shaped + committed columns with capacity badge.
			    onNewPitch opens BetCreateDialog. onMoveBet POSTs to /api/bets/:id/commit.
			    @lore Q3: Canvas is mounted below product grid. useCanvasBets provides data. */}
			<Canvas
				bets={canvasBets}
				capacity={canvasCapacity.max}
				onMoveBet={(betId, targetStatus) => {
					// @lore U1: "committed" → "active"; drag to Active column triggers commit endpoint
					if (targetStatus === "active") {
						void apiFetch(`/api/bets/${betId}/commit`, { method: "POST" }).then(() =>
							refreshCanvas(),
						);
					}
				}}
				onNewPitch={() => setDialogOpen(true)}
			/>

			{/* Q3 T5: BetCreateDialog — opens when onNewPitch is triggered. */}
			<BetCreateDialog
				open={dialogOpen}
				onClose={() => setDialogOpen(false)}
				onCreated={() => {
					setDialogOpen(false);
					// Optimistic: trigger background refetch of canvas data.
					refreshCanvas();
				}}
				teams={teamsData?.teams.map((p) => ({ id: p.id, name: p.name })) ?? []}
			/>

			{/* L12: Artifact gallery — portfolio axis, limit=12, BELOW cycle-stripe per design.
			    @lore L12 review (W-1): approved design says "below cycle-stripe". */}
			<ArtifactSection
				filter={{ axis: "portfolio" }}
				layout="gallery"
				limit={12}
				heading="Artifacts"
				emptyDescription="Artifacts appear here as agents complete tasks."
				onOpen={onOpenArtifact}
			/>
		</div>
	);
}
