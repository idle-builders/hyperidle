/**
 * Work/Portfolio page — 2-column bet grid with honest filter controls.
 *
 * @lore U9: WorkPortfolio restructured from team-card grid + Canvas to
 * a flat 2-column BetCard grid. Canvas and Kanban views removed.
 * useBets() provides the flat bet list (flattened from grouped /api/bets).
 * useTeams() provides team names for pills and card labels.
 *
 * @lore U9 AC-2: "All bets" heading replaces "Portfolio".
 * @lore AG3: "New bet" button navigates to /work/bet/new (full-page create).
 * BetCreateDialog removed; both entry points (header button + portfolio-empty CTA)
 * call navigate("/work/bet/new").
 *
 * @lore U9 AC-3: Team pills: one pill per team from useTeams() — bordered style.
 * Active pill: accent border + tinted bg. Inactive: border-default.
 * Client-side filtering by selectedTeamId.
 *
 * @lore W3: AppShell <main> is overflow-hidden with no padding, so this page
 * uses a fixed shrink-0 header + flex-1 overflow-y-auto body pattern.
 * Header contains h2 title + tab-bar-pill status filter + team pills + "New bet".
 *
 * @lore AG2: Derived-visibility model — filter controls dock into a filter zone
 * only when they can change the result set (honest filters). Three predicates:
 *   - showStatusFilter: ≥2 distinct status buckets in bets
 *   - showTeamFilter: ≥2 distinct team ids in bets (not in teams lookup)
 *   - showVerdictFilter: ≥1 bet has outcomeVerdict !== null
 * "New bet" header button is unconditional (frame invariant across 0/1/50 bets).
 * Two empty states: portfolio-empty (bets.length===0) and filter-excluded-empty.
 * The legacy "No bets for this team" team-scoped empty is retired (folds into
 * filter-excluded-empty). R2 contract: portfolio-empty carries data-testid="create-bet-cta"
 * and CTA button label is exactly "Create bet" (satisfies /create bet/i).
 */

// hearth-internal-padding
import { BetCard, Button, EmptyState, PageHeader, SkeletonCard } from "@hyperidle/design-system";
import { BET_OUTCOME_VERDICTS, formatMoney } from "@hyperidle/shared";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBets } from "../hooks/useBets.js";
import { useTeams } from "../hooks/useTeams";
import {
	distinctStatusBuckets,
	distinctTeamIds,
	formatPortfolioCount,
	hasAnyRecordedOutcome,
} from "./work/portfolioFilters.js";

// W3 AC-13: Status filter type
type StatusFilter = "all" | "active" | "completed" | "draft";

// W3 AC-13: status filter options (outside component so it's stable)
const STATUS_FILTER_OPTIONS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "active", label: "Active" },
	{ id: "completed", label: "Completed" },
	{ id: "draft", label: "Draft" },
];

/**
 * AC1: Verdict pill options — all four bet verdicts plus a sentinel for null verdict.
 * @lore AC1: "not_evaluated" is a UI-only sentinel; the DB stores null for un-evaluated bets.
 */
const VERDICT_PILL_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: "validated", label: "Validated" },
	{ id: "refuted", label: "Refuted" },
	{ id: "partial", label: "Partial" },
	{ id: "inconclusive", label: "Inconclusive" },
	{ id: "not_evaluated", label: "Not evaluated" },
];

export function WorkPortfolio(): JSX.Element {
	const navigate = useNavigate();
	const { data: teamsData } = useTeams();
	const { bets, loading: betsLoading } = useBets();
	const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
	// W3 AC-13: status filter state
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	/**
	 * AC1: Multi-select verdict filter state — Set of active verdict keys.
	 * Empty set means "no filter" (all bets shown).
	 * @lore AC1: "not_evaluated" is a UI-only sentinel stored as null in the DB.
	 */
	const [activeVerdictFilters, setActiveVerdictFilters] = useState<Set<string>>(new Set());

	// Build team list for pills
	const teams = useMemo(() => teamsData?.teams ?? [], [teamsData]);

	// AA1: compute total routines across all teams for the portfolio summary line
	const totalActiveRoutines = useMemo(
		() => teams.reduce((sum, t) => sum + (t.routineCount ?? 0), 0),
		[teams],
	);

	// AB2 AC-5: compute agent summary stats across all teams
	const totalAgentCount = useMemo(
		() => teams.reduce((sum, t) => sum + (t.agentCount ?? 0), 0),
		[teams],
	);
	const totalActiveAgentCount = useMemo(
		() => teams.reduce((sum, t) => sum + (t.activeAgentCount ?? 0), 0),
		[teams],
	);
	const anyAgentHealthWarning = useMemo(
		() => teams.some((t) => t.agentHealthWarning === true),
		[teams],
	);

	// AG2: Derived-visibility predicates — the honest filter gates.
	// Memoized over bets so component and tests share one source of truth.
	const showVerdictFilter = useMemo(() => hasAnyRecordedOutcome(bets), [bets]);
	const showStatusFilter = useMemo(() => distinctStatusBuckets(bets).size >= 2, [bets]);
	const showTeamFilter = useMemo(() => distinctTeamIds(bets).size >= 2, [bets]);
	const showFilterZone = showStatusFilter || showTeamFilter || showVerdictFilter;

	// AG2: Count sub-line — only shown when bets exist.
	const portfolioCount = useMemo(() => formatPortfolioCount(bets), [bets]);

	// Filter bets client-side by selected team, status, and verdict
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
		// AC1: Verdict filter — empty set = no filter applied
		if (activeVerdictFilters.size > 0) {
			result = result.filter((b) => {
				const v = b.outcomeVerdict ?? null;
				if (activeVerdictFilters.has("not_evaluated") && v === null) return true;
				return (
					v !== null &&
					BET_OUTCOME_VERDICTS.includes(v as (typeof BET_OUTCOME_VERDICTS)[number]) &&
					activeVerdictFilters.has(v)
				);
			});
		}
		return result;
	}, [bets, selectedTeamId, statusFilter, activeVerdictFilters]);

	/**
	 * AG2: Atomic clear-filters action — resets all three filter dimensions at once.
	 * Used by the filter-excluded empty state's "Clear filters" CTA.
	 */
	function clearFilters(): void {
		setStatusFilter("all");
		setSelectedTeamId(null);
		setActiveVerdictFilters(new Set());
	}

	if (betsLoading) {
		return (
			<div className="flex flex-col h-full" data-testid="work-portfolio-page">
				<PageHeader title="All bets" />
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
			{/*
			 * @lore AI7: PageHeader owns the pinned title strip (title + "New bet").
			 * Subtitle slot carries the count sub-line + summary spans inline.
			 * Filter zone moves to body — it is not part of the permanent header.
			 * @lore AG2 AC-4: "New bet" header button is unconditional — frame invariant
			 * across 0/1/50 bets. The empty state provides a separate "Create bet" CTA.
			 */}
			<PageHeader
				title="All bets"
				subtitle={
					portfolioCount ||
					(teamsData !== null && teamsData !== undefined && totalActiveRoutines > 0) ||
					(teamsData !== null && teamsData !== undefined && totalAgentCount > 0) ? (
						<span className="flex items-center gap-[12px] flex-wrap">
							{/* Count sub-line — shown when bets exist */}
							{portfolioCount && (
								<span className="text-[13px] text-[var(--text-tertiary)]">{portfolioCount}</span>
							)}
							{/* AA1: Routine summary line */}
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
							{/*
							 * AB2 AC-5: Agent summary line — shown when any team has agents.
							 * @lore AB2: Health dot uses title= for tooltip and role="img" for a11y.
							 */}
							{teamsData !== null && teamsData !== undefined && totalAgentCount > 0 && (
								<span
									data-testid="portfolio-agent-summary"
									className="inline-flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]"
								>
									{anyAgentHealthWarning && (
										<span
											role="img"
											aria-label="One or more agents need attention"
											title="One or more agents need attention"
											className="inline-block w-[6px] h-[6px] rounded-full bg-[var(--status-error)]"
										/>
									)}
									{totalAgentCount} agent{totalAgentCount !== 1 ? "s" : ""}, {totalActiveAgentCount}{" "}
									active
								</span>
							)}
						</span>
					) : undefined
				}
				actions={
					/* AG3: navigates to full-page /work/bet/new instead of opening dialog */
					<Button
						variant="primary"
						size="sm"
						onClick={() => navigate("/work/bet/new")}
						data-testid="new-bet-btn"
					>
						New bet
					</Button>
				}
			/>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto">
				{/*
				 * Filter zone — rendered iff showFilterZone (moved from header per AI7).
				 * @lore AG2: AG5 boundary — keep inline pill/segmented controls; do NOT
				 * introduce a new dropdown primitive here (AG5 owns that later).
				 */}
				{showFilterZone && (
					<div
						className="px-[24px] py-[12px] border-b border-[var(--border-subtle)] flex items-center gap-[12px] flex-wrap"
						data-testid="portfolio-filter-zone"
					>
						{/* W3 AC-13: tab-bar-pill segmented status filter — only when ≥2 buckets */}
						{showStatusFilter && (
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

						{/*
						 * AG2 AC-2: Verdict filter pills — multi-select.
						 * ONLY shown when hasAnyRecordedOutcome === true (≥1 bet with recorded outcome).
						 * Zone-level honesty: once shown, all five pills render for vocabulary completeness.
						 */}
						{showVerdictFilter && (
							<div
								className="flex items-center gap-[6px] flex-wrap"
								data-testid="verdict-filter-pills"
							>
								{VERDICT_PILL_OPTIONS.map((opt) => {
									const isActive = activeVerdictFilters.has(opt.id);
									return (
										<button
											key={opt.id}
											type="button"
											aria-pressed={isActive}
											className={`inline-flex items-center px-[12px] py-[4px] text-[12px] font-[500] rounded-[var(--r-pill)] border-[1.5px] cursor-pointer transition-all duration-[var(--motion-default)] ${
												isActive
													? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
													: "border-[var(--border-default)] bg-transparent text-[var(--text-secondary)]"
											}`}
											onClick={() => {
												setActiveVerdictFilters((prev) => {
													const next = new Set(prev);
													if (next.has(opt.id)) {
														next.delete(opt.id);
													} else {
														next.add(opt.id);
													}
													return next;
												});
											}}
										>
											{opt.label}
										</button>
									);
								})}
							</div>
						)}

						{/* W3 AC-14: Team pill filters — only when ≥2 distinct team ids in bets */}
						{showTeamFilter && (
							<div
								className="flex items-center gap-[6px] flex-wrap"
								data-testid="team-pill-filters"
							>
								{teams.map((team) => (
									<button
										key={team.id}
										type="button"
										aria-pressed={selectedTeamId === team.id}
										className={`inline-flex items-center px-[12px] py-[4px] text-[12px] font-[500] rounded-[var(--r-pill)] border-[1.5px] cursor-pointer transition-all duration-[var(--motion-default)] ${
											selectedTeamId === team.id
												? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
												: "border-[var(--border-default)] bg-transparent text-[var(--text-secondary)]"
										}`}
										onClick={() => setSelectedTeamId((prev) => (prev === team.id ? null : team.id))}
									>
										{team.name}
										{(team.agentCount ?? 0) > 0 && (
											<span className="ml-[6px] font-[500] text-[11px] font-mono text-[var(--text-tertiary)]">
												{team.agentCount}
											</span>
										)}
										{team.agentHealthWarning && (
											<span
												role="img"
												aria-label="Agent needs attention"
												title="Agent needs attention"
												className="ml-[4px] inline-block w-[6px] h-[6px] rounded-full bg-[var(--status-error)] flex-shrink-0"
											/>
										)}
									</button>
								))}
							</div>
						)}
					</div>
				)}

				{/* AG2: Two empty states — portfolio-empty and filter-excluded-empty.
				    The legacy "No bets for this team" team-scoped empty is RETIRED.
				    @lore AG2 WARNING-arch-1: team filter that excludes all bets is semantically
				    a filter-excluded result, not a distinct "this team is empty" condition. */}
				{bets.length === 0 ? (
					/* portfolio-empty: no bets exist at all */
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
							title="No bets yet"
							description="Bets are time-boxed commitments with a budget. Shape a pitch, commit it to a cycle, and your agents will break it into tasks and start building."
							dataTestId="portfolio-empty"
							action={
								/*
								 * @lore AG2 CRITICAL-2/3: R2 contract — data-testid="create-bet-cta" on the
								 * action wrapper, and the CTA button label MUST be exactly "Create bet".
								 * "Create your first bet" and "Create a bet" both FAIL /create bet/i (intervening
								 * word breaks adjacency). R2-work-first-landing.spec.ts asserts this selector.
								 * AG3: handler changed from setDialogOpen(true) to navigate("/work/bet/new").
								 * Selector and label preserved per @lore AG2 CRITICAL-2/3.
								 */
								<div data-testid="create-bet-cta">
									<Button variant="primary" size="sm" onClick={() => navigate("/work/bet/new")}>
										Create bet
									</Button>
								</div>
							}
						/>
					</div>
				) : filteredBets.length === 0 ? (
					/* filter-excluded-empty: bets exist but current filters exclude all */
					<div
						className="flex items-center justify-center p-[48px_24px] min-h-full"
						data-testid="portfolio-no-matches"
					>
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
									<circle cx="11" cy="11" r="8" />
									<line x1="21" y1="21" x2="16.65" y2="16.65" />
								</svg>
							}
							iconBg="rgba(217,119,6,0.08)"
							title="No bets match these filters"
							description="Try adjusting or clearing your filters to see more bets."
							action={
								<Button variant="ghost" size="sm" onClick={clearFilters}>
									Clear filters
								</Button>
							}
						/>
					</div>
				) : (
					/* W3 AC-18: 2-column bet grid with max-width 960px */
					<div
						className="grid grid-cols-1 sm:grid-cols-2 gap-[18px] max-w-[960px] mx-auto w-full p-[18px_24px]"
						data-testid="bet-grid"
					>
						{filteredBets.map((bet) => {
							// Resolve team name for BetCard display — BetListItem has teamId not team.
							const teamName = teams.find((t) => t.id === bet.teamId)?.name ?? bet.teamId;
							return (
								/*
								 * @lore AC1: BetCard wrapped in <Link> (role="link") rather than
								 * using BetCard's onClick (which adds role="button"). This keeps
								 * verdict filter pills as the only role="button" elements matching
								 * verdict names, so tests can getByRole("button", {name:/validated/i})
								 * unambiguously. Navigation behaviour is identical.
								 */
								<Link
									key={bet.id}
									to={`/work/bet/${encodeURIComponent(bet.id)}`}
									className="block no-underline"
									aria-label={bet.title || bet.description.slice(0, 60)}
								>
									<BetCard
										id={bet.id}
										title={bet.title || bet.description.slice(0, 60)}
										team={teamName}
										status={bet.status}
										description={bet.description}
										budgetLabel={bet.costAppetite ? formatMoney(bet.costAppetite) : undefined}
										outcomeVerdict={bet.outcomeVerdict ?? undefined}
									/>
								</Link>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
