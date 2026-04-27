import {
	BetCard,
	EmptyState,
	SkeletonCard,
	SkeletonList,
	StatusChip,
	taskStateToStatus,
} from "@hyperidle/design-system";
/**
 * Work/Bet page — bet detail view composed from Tier 2 components (BetCard, TaskCard)
 * and DaisyUI primitives. Shows bet details + task list for that bet.
 *
 * @lore J5: the page now includes a breadcrumb (Product → Team → Bet),
 * a markdown-rendered pitch body, a sortable task table (replacing the
 * stacked TaskCards per spec: "denser than stacked TaskCards — use a
 * <table>"), and a comment thread. react-markdown is NOT a dependency
 * yet, so the body renders inside a <pre> with whitespace preserved —
 * the table and breadcrumb are the load-bearing new elements.
 */
import type { BetStatus, TaskState } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PauseSessionButton } from "../components/PauseSessionButton";
import { useFactoryStateContext } from "../hooks/factoryStateContext";
import { useRecoveryFetch } from "../hooks/useRecoveryFetch";

interface MockBetComment {
	id: string;
	author: string;
	body: string;
}

interface MockRunningSession {
	id: string;
	agentName: string;
	taskTitle: string;
}

interface MockBetDetail {
	id: string;
	title: string;
	product: string;
	team: string;
	status: BetStatus;
	appetite: string;
	progress: { done: number; total: number };
	body: string;
	tasks: Array<{
		id: string;
		title: string;
		owner: string;
		state: TaskState;
		cost: string;
	}>;
	comments: MockBetComment[];
	/**
	 * @lore L7 AC4: bet detail must surface a Pause button per running
	 * session. The real session feed lands in a later story; for now the
	 * page renders a static fixture consistent with the bet-1 seed used
	 * by the L7 server tests so the E2E + Storybook surfaces stay
	 * truthful.
	 *
	 * TODO(post-L7): replace `runningSessions` with the real session
	 * feed once the bet-scoped session listing endpoint ships. The
	 * MOCK_BETS["bet-1"] fixture below is used by the recovery-verbs
	 * E2E test and should move to a dev-only fixture module at the
	 * same time.
	 */
	runningSessions: MockRunningSession[];
}

const MOCK_BETS: Record<string, MockBetDetail> = {
	b1: {
		id: "b1",
		title: "User auth flow",
		product: "Alpha",
		team: "Alpha Core",
		status: "committed",
		appetite: "2 weeks",
		progress: { done: 3, total: 8 },
		body: `# Problem
Current auth is hand-rolled and leaks sessions on reload.

## Appetite
2 weeks.

## Solution
Migrate to JWT with refresh rotation.

## Rabbit holes
- Do not rebuild the signup flow in this bet.`,
		tasks: [
			{
				id: "t1",
				title: "Implement login endpoint",
				owner: "Dev Agent 1",
				state: "done",
				cost: "$4.20",
			},
			{
				id: "t2",
				title: "Design signup form",
				owner: "Dev Agent 2",
				state: "in_progress",
				cost: "$1.80",
			},
			{
				id: "t3",
				title: "JWT refresh logic",
				owner: "Dev Agent 1",
				state: "review",
				cost: "$6.50",
			},
		],
		comments: [
			{
				id: "c1",
				author: "CEO",
				body: "Prioritise the login path; signup can follow.",
			},
			{
				id: "c2",
				author: "Dev Agent 1",
				body: "Refresh rotation works end-to-end in staging.",
			},
		],
		runningSessions: [
			{ id: "session-b1-1", agentName: "Dev Agent 2", taskTitle: "Design signup form" },
		],
	},
	b2: {
		id: "b2",
		title: "Dashboard redesign",
		product: "Beta",
		team: "Beta Surface",
		status: "shaped",
		appetite: "3 weeks",
		progress: { done: 0, total: 5 },
		body: `# Problem
The dashboard has grown to 14 widgets with no hierarchy.

## Appetite
3 weeks.

## Solution
Replace the grid with a three-column layout driven by user roles.

## Rabbit holes
- Do not ship new widgets in this bet.`,
		tasks: [
			{
				id: "t4",
				title: "Wireframe layouts",
				owner: "Designer Agent",
				state: "accepted",
				cost: "$2.00",
			},
			{
				id: "t5",
				title: "Component inventory",
				owner: "Dev Agent 1",
				state: "accepted",
				cost: "$1.50",
			},
		],
		comments: [],
		runningSessions: [],
	},
	// @lore L7 AC4: matches the seed used by `seedRunningSessions` in
	// `packages/server/src/__tests__/recovery.test.ts` so the E2E test
	// `/work/bet/bet-1` finds a populated page.
	"bet-1": {
		id: "bet-1",
		title: "Bet pitch",
		product: "Demo",
		team: "Demo Team",
		status: "active",
		appetite: "1 week",
		progress: { done: 0, total: 3 },
		body: "Seed bet used by recovery-verbs E2E and integration tests.",
		tasks: [
			{ id: "task-0", title: "Task 0", owner: "Builder", state: "in_progress", cost: "—" },
			{ id: "task-1", title: "Task 1", owner: "Builder", state: "in_progress", cost: "—" },
			{ id: "task-2", title: "Task 2", owner: "Builder", state: "in_progress", cost: "—" },
		],
		comments: [],
		runningSessions: [
			{ id: "session-0", agentName: "Builder", taskTitle: "Task 0" },
			{ id: "session-1", agentName: "Builder", taskTitle: "Task 1" },
			{ id: "session-2", agentName: "Builder", taskTitle: "Task 2" },
		],
	},
};

const FALLBACK_BET: MockBetDetail = {
	id: "unknown",
	title: "Unknown Bet",
	product: "Unknown",
	team: "Unknown Team",
	status: "shaped",
	appetite: "—",
	progress: { done: 0, total: 0 },
	body: "",
	tasks: [],
	comments: [],
	runningSessions: [],
};

type SortColumn = "title" | "status" | "owner" | "cost";
type SortDirection = "asc" | "desc";

function sortTasks(
	tasks: MockBetDetail["tasks"],
	column: SortColumn | null,
	direction: SortDirection,
): MockBetDetail["tasks"] {
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

export interface WorkBetProps {
	/**
	 * J8: opt-in loading state. When true the page renders a card + list
	 * skeleton matching the eventual shape. Default false keeps production
	 * behavior unchanged.
	 */
	loading?: boolean;
	/**
	 * Override the bet id resolved from route params. Used by design system
	 * stories which render outside the /work/bet/:betId route.
	 */
	overrideBetId?: string;
}

export function WorkBet({ loading = false, overrideBetId }: WorkBetProps = {}): JSX.Element {
	const { betId: routeBetId } = useParams<{ betId: string }>();
	const betId = overrideBetId ?? routeBetId;
	const bet = (betId && MOCK_BETS[betId]) || FALLBACK_BET;

	const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	// L7 AC4: track per-session paused/running state locally so the
	// Pause/Resume affordance toggles immediately. The server is the
	// source of truth — every action POSTs the corresponding endpoint;
	// a failed call falls back to the prior state to avoid lying.
	const [sessionStates, setSessionStates] = useState<Record<string, "running" | "paused">>(() =>
		Object.fromEntries(bet.runningSessions.map((s) => [s.id, "running" as const])),
	);
	const factoryState = useFactoryStateContext();
	const recoveryFetch = useRecoveryFetch();

	const sortedTasks = useMemo(
		() => sortTasks(bet.tasks, sortColumn, sortDirection),
		[bet.tasks, sortColumn, sortDirection],
	);

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<SkeletonCard ariaLabel="Loading bet" />
				<SkeletonList rows={4} ariaLabel="Loading tasks" />
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

			{bet.body && (
				// @lore J5: react-markdown is not a dependency; per the J5
				// constraint we fall back to a <pre> with whitespace preserved
				// so the pitch body is still readable and heading/lists are
				// visually separated. Swap in react-markdown if it's ever
				// added to packages/web/package.json.
				<pre
					data-testid="bet-pitch-body"
					className="bg-base-200 rounded p-3 text-sm text-[var(--text-hi)] whitespace-pre-wrap font-sans"
				>
					{bet.body}
				</pre>
			)}

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

			{bet.runningSessions.length > 0 && (
				<section
					aria-label="Running sessions"
					data-testid="bet-running-sessions"
					className="flex flex-col gap-2"
				>
					<h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
						Running sessions
					</h2>
					<ul className="flex flex-col gap-2">
						{bet.runningSessions.map((s) => {
							const state = sessionStates[s.id] ?? "running";
							return (
								<li
									key={s.id}
									data-testid={`bet-session-row-${s.id}`}
									className="flex items-center justify-between bg-base-200 rounded p-2"
								>
									<div className="flex flex-col">
										<span className="text-xs font-mono uppercase tracking-wider text-[var(--text-lo)]">
											{s.id}
										</span>
										<span className="text-sm text-[var(--text-hi)]">
											{s.agentName} — {s.taskTitle}
										</span>
									</div>
									<PauseSessionButton
										session={{ id: s.id, state, agentName: s.agentName }}
										factoryPaused={factoryState.state.paused}
										onPause={async (input) => {
											const res = await recoveryFetch.post(
												`/api/sessions/${encodeURIComponent(s.id)}/pause`,
												{ reason: input.reason },
											);
											if (res.ok) {
												setSessionStates((prev) => ({ ...prev, [s.id]: "paused" }));
											}
										}}
										onResume={async () => {
											const res = await recoveryFetch.post(
												`/api/sessions/${encodeURIComponent(s.id)}/resume`,
												{},
											);
											if (res.ok) {
												setSessionStates((prev) => ({ ...prev, [s.id]: "running" }));
											}
										}}
									/>
								</li>
							);
						})}
					</ul>
				</section>
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
