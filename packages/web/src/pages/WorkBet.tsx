/**
 * Work/Bet page — bet detail view composed from Tier 2 components (BetCard, TaskCard)
 * and DaisyUI primitives. Shows bet details + task list for that bet.
 *
 * @lore L16: bet pitch renders via L2 Block primitive (deriveBlocks → <Block />).
 * On-disk format is markdown; blocks are derived at render time.
 */
import {
	BetCard,
	Block,
	EmptyState,
	ErrorState,
	SkeletonCard,
	SkeletonList,
	StatusChip,
	taskStateToStatus,
} from "@hyperidle/design-system";
import { deriveBlocks } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useBet } from "../hooks/useBet";
import type { BetDetail } from "../types/bet";

type SortColumn = "title" | "status" | "owner" | "cost";
type SortDirection = "asc" | "desc";

function sortTasks(
	tasks: BetDetail["tasks"],
	column: SortColumn | null,
	direction: SortDirection,
): BetDetail["tasks"] {
	if (column === null) return tasks;
	const copy = [...tasks];
	copy.sort((a, b) => {
		const av = a[column] ?? "";
		const bv = b[column] ?? "";
		if (av < bv) return direction === "asc" ? -1 : 1;
		if (av > bv) return direction === "asc" ? 1 : -1;
		return 0;
	});
	return copy;
}

/**
 * BetPitch — co-located adapter: deriveBlocks → <Block />.
 *
 * @lore L16: BetPitch is co-located, not a Tier-2 design-system component.
 * It is a single-call-site adapter and would not earn its keep as a shared
 * component. L23 (knowledge body) will inline an equivalent adapter at its
 * own call site; if a third consumer appears, promote then.
 */
interface BetPitchProps {
	pitch: string;
	betId: string;
}

function BetPitch({ pitch, betId }: BetPitchProps): JSX.Element | null {
	const { blocks } = useMemo(() => deriveBlocks(pitch, { kind: "bet", id: betId }), [pitch, betId]);
	if (blocks.length === 0) return null;
	return (
		<section aria-label="Bet pitch" data-testid="bet-pitch">
			{blocks.map((b) => (
				<Block key={b.id} id={b.id} payload={b.payload} />
			))}
		</section>
	);
}

export interface WorkBetProps {
	/**
	 * J8: opt-in loading state. When true the page renders a card + list
	 * skeleton matching the eventual shape. Default false keeps production
	 * behavior unchanged.
	 */
	loading?: boolean;
	/**
	 * L16: override the bet with a directly injected BetDetail. When set,
	 * the useBet hook is not called and the API fetch is skipped. Used by
	 * stories and tests to inject fixture data without importing from __fixtures__/.
	 */
	overrideBet?: BetDetail;
}

export function WorkBet({ loading = false, overrideBet }: WorkBetProps = {}): JSX.Element {
	const { betId: routeBetId } = useParams<{ betId: string }>();

	// Only call useBet when there is no override. When overrideBet is provided,
	// pass undefined so the hook short-circuits to { data: null, loading: false, error: null }.
	const fetched = useBet(overrideBet ? undefined : routeBetId);

	const bet = overrideBet ?? fetched.data;

	const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const sortedTasks = useMemo(
		() => sortTasks(bet?.tasks ?? [], sortColumn, sortDirection),
		[bet?.tasks, sortColumn, sortDirection],
	);

	// Explicit prop loading takes priority (used by Loading story).
	if (loading || (!overrideBet && fetched.loading)) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<SkeletonCard ariaLabel="Loading bet" />
				<SkeletonList rows={4} ariaLabel="Loading tasks" />
			</div>
		);
	}

	if (!overrideBet && fetched.error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<ErrorState title="Failed to load bet" description={fetched.error.message} />
			</div>
		);
	}

	if (!bet) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<ErrorState title="Bet not found" description="The requested bet could not be found." />
			</div>
		);
	}

	function handleSort(column: SortColumn): void {
		if (sortColumn === column) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortColumn(column);
			setSortDirection("asc");
		}
	}

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
			{/* J5: breadcrumb Product → Team → Bet. The leaf node uses the
			    bet id rather than the title so the enriched BetCard below
			    remains the single rendered instance of `bet.title`. */}
			<nav aria-label="Breadcrumb" className="text-xs text-[var(--text-lo)]">
				<ol className="flex items-center gap-1">
					<li>
						<Link className="hover:text-[var(--text-hi)]" to="/work/portfolio">
							{bet.product}
						</Link>
					</li>
					<li aria-hidden>›</li>
					<li>
						<Link className="hover:text-[var(--text-hi)]" to="/work/team">
							{bet.team}
						</Link>
					</li>
					<li aria-hidden>›</li>
					<li className="text-[var(--text-hi)] font-medium" aria-current="page">
						<span className="uppercase font-mono">{bet.id}</span>
						<span className="sr-only">: {bet.title}</span>
					</li>
				</ol>
			</nav>

			<BetCard
				title={bet.title}
				product={bet.product}
				status={bet.status}
				appetite={bet.appetite}
				progress={bet.progress}
			/>

			<BetPitch pitch={bet.pitch} betId={bet.id} />

			<h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
				Tasks
			</h2>

			{bet.tasks.length === 0 ? (
				<EmptyState
					title="No tasks yet"
					description="Tasks will appear here once agents start work on this bet."
					dataTestId="bet-tasks-empty"
				/>
			) : (
				<div className="overflow-x-auto">
					<table className="table table-xs">
						<thead>
							<tr>
								<SortableHeader
									column="title"
									label="Title"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortableHeader
									column="status"
									label="Status"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortableHeader
									column="owner"
									label="Owner"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortableHeader
									column="cost"
									label="Cost"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
							</tr>
						</thead>
						<tbody>
							{sortedTasks.map((task) => (
								<tr key={task.id}>
									<td>{task.title}</td>
									<td>
										<StatusChip status={taskStateToStatus(task.state)} />
									</td>
									<td>{task.owner}</td>
									<td className="font-mono">{task.cost}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<section
				aria-label="Comments"
				data-testid="bet-comment-thread"
				className="flex flex-col gap-2"
			>
				<h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
					Comments
				</h2>
				{bet.comments.length === 0 ? (
					<EmptyState
						title="No comments yet"
						description="Comments from agents and founders will appear here."
						dataTestId="bet-comments-empty"
					/>
				) : (
					<ul className="flex flex-col gap-2">
						{bet.comments.map((comment) => (
							<li key={comment.id} className="bg-base-200 rounded-lg p-2 flex flex-col gap-1">
								<span className="text-xs font-heading uppercase tracking-wider text-[var(--text-lo)]">
									{comment.author}
								</span>
								<span className="text-sm text-[var(--text-hi)]">{comment.body}</span>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

function SortableHeader({
	column,
	label,
	sortColumn,
	sortDirection,
	onSort,
}: {
	column: SortColumn;
	label: string;
	sortColumn: SortColumn | null;
	sortDirection: SortDirection;
	onSort: (column: SortColumn) => void;
}): JSX.Element {
	const active = sortColumn === column;
	const ariaSort: "none" | "ascending" | "descending" = active
		? sortDirection === "asc"
			? "ascending"
			: "descending"
		: "none";
	return (
		<th aria-sort={ariaSort} scope="col">
			<button
				type="button"
				className="flex items-center gap-1 uppercase font-heading text-xs tracking-wider text-[var(--text-lo)] hover:text-[var(--text-hi)]"
				onClick={() => onSort(column)}
			>
				<span>{label}</span>
				<span aria-hidden>{active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
			</button>
		</th>
	);
}
