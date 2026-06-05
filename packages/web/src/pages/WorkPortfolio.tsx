/**
 * Work/Portfolio page — 2-column bet grid with team pill filters.
 *
 * @lore U9: WorkPortfolio restructured from team-card grid + Canvas to
 * a flat 2-column BetCard grid. Canvas and Kanban views removed.
 * useBets() provides the flat bet list (flattened from grouped /api/bets).
 * useTeams() provides team names for pills and card labels.
 *
 * @lore U9 AC-2: "All bets" heading replaces "Portfolio".
 * "New bet" button opens BetCreateDialog.
 *
 * @lore U9 AC-3: Team pills: one pill per team from useTeams() — bordered style.
 * Active pill: accent border + tinted bg. Inactive: border-default.
 * Client-side filtering by selectedTeamId.
 *
 * @lore W3: AppShell <main> is overflow-hidden with no padding, so this page
 * uses a fixed shrink-0 header + flex-1 overflow-y-auto body pattern.
 * Header contains h2 title + tab-bar-pill status filter + team pills + "New bet".
 */
import { BetCard, EmptyState, SkeletonCard } from "@hyperidle/design-system";
import { formatMoney } from "@hyperidle/shared";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBets } from "../hooks/useBets.js";
import { useTeams } from "../hooks/useTeams";
import { BetCreateDialog } from "./work/BetCreateDialog.js";

// W3 AC-13: Status filter type
type StatusFilter = "all" | "active" | "completed" | "draft";

// W3 AC-13: status filter options (outside component so it's stable)
const STATUS_FILTER_OPTIONS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "active", label: "Active" },
	{ id: "completed", label: "Completed" },
	{ id: "draft", label: "Draft" },
];

export function WorkPortfolio(): JSX.Element {
	const navigate = useNavigate();
	const { data: teamsData } = useTeams();
	const { bets, loading: betsLoading, refresh: refreshBets } = useBets();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
	// W3 AC-13: status filter state
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

	// Build team list for pills
	const teams = useMemo(() => teamsData?.teams ?? [], [teamsData]);

	// AA1: compute total routines across all teams for the portfolio summary line
	const totalActiveRoutines = useMemo(
		() => teams.reduce((sum, t) => sum + (t.routineCount ?? 0), 0),
		[teams],
	);

	// Filter bets client-side by selected team and status
	const filteredBets = useMemo(() => {
		let result = bets;
		if (selectedTeamId) {
			result = result.filter((b) => b.teamId === selectedTeamId);
		}
		if (statusFilter !== "all") {
			result = result.filter((b) => {
				if (statusFilter === "completed") {
					// "completed" filter matches both completed and killed statuses
					return b.status === "completed" || b.status === "killed";
				}
				return (b.status as string) === statusFilter;
			});
		}
		return result;
	}, [bets, selectedTeamId, statusFilter]);

	if (betsLoading) {
		return (
			<div className="flex flex-col h-full" data-testid="work-portfolio-page">
				{/* Loading header skeleton */}
				<header className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
					<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]">
						All bets
					</h2>
				</header>
				<div className="flex-1 overflow-y-auto">
					<div
						className="grid grid-cols-1 sm:grid-cols-2 gap-[18px] max-w-[960px] mx-auto w-full p-[18px_24px]"
						data-testid="bet-grid"
					>
						<SkeletonCard ariaLabel="Loading bet" />
						<SkeletonCard ariaLabel="Loading bet" />
						<SkeletonCard ariaLabel="Loading bet" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			/*
			 * @lore W3: AppShell <main> is overflow-hidden with no padding.
			 * This page uses shrink-0 header + flex-1 overflow-y-auto body.
			 */
			className="flex flex-col h-full"
			data-testid="work-portfolio-page"
		>
			{/* Fixed header: h2 title + tab-bar-pill status filter + team pills + "New bet"
			    When bets.length === 0, only the title is shown (no filter controls). */}
			<header className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)] flex items-center gap-[12px] flex-wrap">
				<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]">
					All bets
				</h2>

				{/* AA1: Routine summary line — shown when any team has routines */}
				{teamsData !== null && teamsData !== undefined && totalActiveRoutines > 0 && (
					<span
						data-testid="portfolio-routine-summary"
						className="text-[12px] text-[var(--text-tertiary)]"
					>
						{totalActiveRoutines} routine{totalActiveRoutines !== 1 ? "s" : ""} across{" "}
						{teams.filter((t) => (t.routineCount ?? 0) > 0).length} team
						{teams.filter((t) => (t.routineCount ?? 0) > 0).length !== 1 ? "s" : ""}
					</span>
				)}

				{/* W3 AC-13: tab-bar-pill segmented status filter — hidden when no bets */}
				{bets.length > 0 && (
					<div className="inline-flex gap-[6px] bg-[var(--surface-container)] rounded-[var(--r-pill)] p-[3px]">
						{STATUS_FILTER_OPTIONS.map((opt) => (
							<button
								key={opt.id}
								type="button"
								aria-pressed={statusFilter === opt.id}
								className={`px-[12px] py-[6px] text-[13px] rounded-[var(--r-pill)] border-none cursor-pointer transition-all duration-[var(--motion-default)] ${
									statusFilter === opt.id
										? "bg-[var(--surface-elevated)] text-[var(--accent-primary)] font-[600] shadow-[var(--shadow-subtle)]"
										: "font-[500] text-[var(--text-secondary)] bg-transparent"
								}`}
								onClick={() => setStatusFilter(opt.id)}
							>
								{opt.label}
							</button>
						))}
					</div>
				)}

				{/* W3 AC-14: Team pill filters — bordered style, not DaisyUI btn. Hidden when no bets. */}
				{bets.length > 0 && teams.length > 0 && (
					<div className="flex items-center gap-[6px] flex-wrap" data-testid="team-pill-filters">
						{teams.map((team) => (
							<button
								key={team.id}
								type="button"
								aria-pressed={selectedTeamId === team.id}
								className={`inline-flex items-center px-[12px] py-[4px] text-[12px] font-[500] rounded-[var(--r-pill)] border-[1.5px] cursor-pointer transition-all duration-[var(--motion-default)] ${
									selectedTeamId === team.id
										? "border-[var(--accent-primary)] bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)]"
										: "border-[var(--border-default)] bg-transparent text-[var(--text-secondary)]"
								}`}
								onClick={() => setSelectedTeamId((prev) => (prev === team.id ? null : team.id))}
							>
								{team.name}
							</button>
						))}
					</div>
				)}

				{/* "New bet" button — only when there are bets */}
				{bets.length > 0 && (
					<button
						type="button"
						className="btn btn-sm btn-primary ml-auto"
						onClick={() => setDialogOpen(true)}
						data-testid="new-bet-btn"
					>
						New bet
					</button>
				)}
			</header>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto">
				{/* W3 AC-18: 2-column bet grid with max-width 960px */}
				{filteredBets.length === 0 ? (
					<div className="flex items-center justify-center p-[48px_24px] min-h-full">
						<EmptyState
							icon={
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<rect x="3" y="3" width="18" height="18" rx="2" />
									<line x1="12" y1="8" x2="12" y2="16" />
									<line x1="8" y1="12" x2="16" y2="12" />
								</svg>
							}
							iconBg="rgba(217,119,6,0.08)"
							title={selectedTeamId ? "No bets for this team" : "No bets yet"}
							description={
								selectedTeamId
									? "This team has no bets in any status."
									: "Bets are time-boxed commitments with a budget. Shape a pitch, commit it to a cycle, and your agents will break it into tasks and start building."
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
					</div>
				) : (
					<div
						className="grid grid-cols-1 sm:grid-cols-2 gap-[18px] max-w-[960px] mx-auto w-full p-[18px_24px]"
						data-testid="bet-grid"
					>
						{filteredBets.map((bet) => {
							// Resolve team name for BetCard display — BetListItem has teamId not team.
							const teamName = teams.find((t) => t.id === bet.teamId)?.name ?? bet.teamId;
							return (
								<BetCard
									key={bet.id}
									id={bet.id}
									title={bet.title || bet.description.slice(0, 60)}
									team={teamName}
									status={bet.status}
									description={bet.description}
									budgetLabel={bet.costAppetite ? formatMoney(bet.costAppetite) : undefined}
									onClick={() => navigate(`/work/bet/${encodeURIComponent(bet.id)}`)}
								/>
							);
						})}
					</div>
				)}
			</div>

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
		</div>
	);
}
