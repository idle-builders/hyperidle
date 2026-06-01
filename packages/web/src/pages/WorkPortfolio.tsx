/**
 * Work/Portfolio page — 2-column bet grid with team pill filters.
 *
 * @lore U9: WorkPortfolio restructured from team-card grid + Canvas to
 * a flat 2-column BetCard grid. Canvas and Kanban views removed.
 * Team pill filters at top allow filtering by team without sidebar.
 * useBets() provides the flat bet list (flattened from grouped /api/bets).
 * useTeams() provides team names for pills and card labels.
 *
 * @lore U9 AC-2: "All bets" heading replaces "Portfolio".
 * "New bet" button opens BetCreateDialog (btn-primary, btn-xs).
 *
 * @lore U9 AC-3: Team pills: "All teams" + one pill per team from useTeams().
 * Active pill → btn-primary. Inactive pill → btn-ghost.
 * Client-side filtering by selectedTeamId.
 */
import { BetCard, EmptyState, SkeletonCard } from "@hyperidle/design-system";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { useBets } from "../hooks/useBets.js";
import { useTeams } from "../hooks/useTeams";
import { BetCreateDialog } from "./work/BetCreateDialog.js";

export function WorkPortfolio(): JSX.Element {
	const navigate = useNavigate();
	const { data: teamsData } = useTeams();
	const { bets, loading: betsLoading, refresh: refreshBets } = useBets();
	const onOpenArtifact = useArtifactOpen();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

	// Build team list for pills
	const teams = useMemo(() => teamsData?.teams ?? [], [teamsData]);

	// Filter bets client-side by selected team
	const filteredBets = useMemo(() => {
		if (!selectedTeamId) return bets;
		return bets.filter((b) => b.teamId === selectedTeamId);
	}, [bets, selectedTeamId]);

	if (betsLoading) {
		return (
			<div className="flex flex-col gap-[12px] h-full" data-testid="work-portfolio-page">
				<div className="flex items-center justify-between">
					<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
						All bets
					</h1>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]" data-testid="bet-grid">
					<SkeletonCard ariaLabel="Loading bet" />
					<SkeletonCard ariaLabel="Loading bet" />
					<SkeletonCard ariaLabel="Loading bet" />
				</div>
			</div>
		);
	}

	return (
		<div
			/*
			 * @lore K11: page section gap → --density-gap per density-audit.md § 3.4.P1.
			 * Page outer pad inherits from `<main>`'s --density-page-gutter.
			 */
			className="flex flex-col gap-[12px] h-full"
			data-testid="work-portfolio-page"
		>
			{/* Header row: "All bets" heading + "New bet" button */}
			<div className="flex items-center justify-between">
				<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
					All bets
				</h1>
				<button
					type="button"
					className="btn btn-sm btn-primary"
					onClick={() => setDialogOpen(true)}
					data-testid="new-bet-btn"
				>
					New bet
				</button>
			</div>

			{/* Team pill filters: "All teams" + one per team */}
			{teams.length > 0 && (
				<div
					className="flex items-center gap-1 flex-wrap"
					data-testid="team-pill-filters"
					role="group"
					aria-label="Filter by team"
				>
					<button
						type="button"
						className={`btn btn-xs ${selectedTeamId === null ? "btn-primary" : "btn-ghost"}`}
						onClick={() => setSelectedTeamId(null)}
					>
						All teams
					</button>
					{teams.map((team) => (
						<button
							key={team.id}
							type="button"
							className={`btn btn-xs ${selectedTeamId === team.id ? "btn-primary" : "btn-ghost"}`}
							onClick={() => setSelectedTeamId((prev) => (prev === team.id ? null : team.id))}
						>
							{team.name}
						</button>
					))}
				</div>
			)}

			{/* 2-column bet grid */}
			{filteredBets.length === 0 ? (
				<EmptyState
					title={selectedTeamId ? "No bets for this team" : "No bets yet"}
					description={
						selectedTeamId
							? "This team has no bets in any status."
							: "Create your first bet to start working."
					}
					dataTestId="portfolio-empty"
					action={
						selectedTeamId ? undefined : (
							<button
								type="button"
								className="btn btn-sm btn-primary"
								onClick={() => setDialogOpen(true)}
							>
								New bet
							</button>
						)
					}
				/>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]" data-testid="bet-grid">
					{filteredBets.map((bet) => {
						// Resolve team name for BetCard display
						const teamName = teams.find((t) => t.id === bet.teamId)?.name ?? bet.teamId;
						return (
							<BetCard
								key={bet.id}
								id={bet.id}
								title={bet.title || bet.description.slice(0, 60)}
								team={teamName}
								status={bet.status}
								costAppetite={bet.costAppetite}
								atRisk={bet.atRisk}
								onClick={() => navigate(`/work/bet/${encodeURIComponent(bet.id)}`)}
							/>
						);
					})}
				</div>
			)}

			{/* BetCreateDialog */}
			<BetCreateDialog
				open={dialogOpen}
				onClose={() => setDialogOpen(false)}
				onCreated={() => {
					setDialogOpen(false);
					refreshBets();
				}}
				teams={teams.map((t) => ({ id: t.id, name: t.name }))}
			/>

			{/* L12: Artifact gallery — portfolio axis */}
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
