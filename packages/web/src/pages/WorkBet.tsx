/**
 * Work/Bet page — bet detail view composed from Tier 2 components (BetCard, TaskCard)
 * and DaisyUI primitives. Shows bet details + task list for that bet.
 *
 * @lore L16: bet pitch renders via L2 Block primitive (deriveBlocks → <Block />).
 * On-disk format is markdown; blocks are derived at render time.
 *
 * @lore L18: Block popover wiring uses document.querySelector to capture the
 * gutter anchor at the moment onOpenActions fires (Block does NOT forwardRef).
 * Pattern: `document.querySelector('[data-block-id="${blockId}"] [data-block-gutter]')`.
 * The anchor is stored in state alongside openBlockId.
 *
 * @lore L18: WorkBet calls useHostThread directly to derive messagesByBlockId
 * for the inline anchored-message slots. HostThreadSection also calls it for
 * the chronological thread view — two fetches, same data. Acceptable for v1;
 * a shared fetch surface requires a global cache layer (out of scope).
 */
import {
	BetCard,
	Block,
	BlockActionsPopover,
	EmptyState,
	ErrorState,
	SkeletonCard,
	SkeletonList,
	StatusChip,
	taskStateToStatus,
} from "@hyperidle/design-system";
import type { Message } from "@hyperidle/shared";
import { deriveBlocks, isRedactedPayload } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArtifactThreadsSummary } from "../components/ArtifactThreadsSummary.js";
import { useBet } from "../hooks/useBet";
import { useHostThread } from "../hooks/useHostThread.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
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
 * AnchoredMessages — tiny inline component that renders block-anchored messages
 * below a block's payload. Shown in addition to the chronological thread log.
 *
 * @lore L18: anchoring is additive — messages render both here (inline) AND in
 * the chronological thread. No interaction from here; the thread log is the
 * authoritative interaction surface.
 */
interface AnchoredMessagesProps {
	messages: ReadonlyArray<Message>;
}

function AnchoredMessages({ messages }: AnchoredMessagesProps): JSX.Element | null {
	if (messages.length === 0) return null;
	return (
		<div data-testid="anchored-messages" className="flex flex-col gap-1 mt-1">
			{messages.map((msg) => {
				if (msg.type !== "plain") return null;
				const text = isRedactedPayload(msg.payload) ? "[redacted]" : msg.payload.text;
				return (
					<div
						key={msg.id}
						className="text-xs text-[var(--text-lo)] px-2 py-1 bg-[var(--surface-2)] rounded"
					>
						{text}
					</div>
				);
			})}
		</div>
	);
}

/**
 * BetPitch — co-located adapter: deriveBlocks → <Block />.
 *
 * @lore L16: BetPitch is co-located, not a Tier-2 design-system component.
 * It is a single-call-site adapter and would not earn its keep as a shared
 * component.
 *
 * @lore L18: BetPitch now accepts onDiscussBlock and messagesByBlockId to
 * wire the L2 block popover and inline anchored messages.
 */
interface BetPitchProps {
	pitch: string;
	betId: string;
	/** Called when the user opens a block's actions menu (Space/Enter on block). Sets openBlockId. */
	onOpenBlockActions?: (blockId: string) => void;
	messagesByBlockId?: ReadonlyMap<string, ReadonlyArray<Message>>;
}

function BetPitch({
	pitch,
	betId,
	onOpenBlockActions,
	messagesByBlockId,
}: BetPitchProps): JSX.Element | null {
	const { blocks } = useMemo(() => deriveBlocks(pitch, { kind: "bet", id: betId }), [pitch, betId]);

	// Collect all messages that have a blockId — including those whose blockId
	// doesn't match any rendered block (e.g. from a previous revision of the pitch).
	// Render them in a catch-all container so they're never silently dropped.
	// @lore L18: messagesByBlockId keys may not match current block IDs if the
	// pitch content changed after the message was posted. We show all anchored
	// messages regardless to avoid data loss UX.
	const allAnchoredMessages = useMemo((): ReadonlyArray<Message> => {
		if (!messagesByBlockId) return [];
		const renderedBlockIds = new Set(blocks.map((b) => b.id));
		const unmatched: Message[] = [];
		for (const [blockId, msgs] of messagesByBlockId) {
			if (!renderedBlockIds.has(blockId)) {
				unmatched.push(...msgs);
			}
		}
		return unmatched;
	}, [messagesByBlockId, blocks]);

	if (blocks.length === 0) return null;
	return (
		<section aria-label="Bet pitch" data-testid="bet-pitch">
			{blocks.map((b) => (
				<Block
					key={b.id}
					id={b.id}
					payload={b.payload}
					onOpenActions={
						onOpenBlockActions !== undefined ? () => onOpenBlockActions(b.id) : undefined
					}
					slots={{
						inlineAfterPayload: messagesByBlockId ? (
							<AnchoredMessages messages={messagesByBlockId.get(b.id) ?? []} />
						) : undefined,
					}}
				/>
			))}
			{/* Fallback: anchored messages whose block no longer exists in the pitch */}
			<AnchoredMessages messages={allAnchoredMessages} />
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

	// L18: Block popover state — openBlockId is set when the user opens a block's
	// actions menu; null when the popover is closed.
	const [openBlockId, setOpenBlockId] = useState<string | null>(null);

	// L18: Thread prefill state — set when the user selects "Discuss" on a block.
	// Passed to HostThreadSection as the `prefill` prop.
	const [threadPrefill, setThreadPrefill] = useState<
		{ blockId: string; blockExcerpt: string } | undefined
	>(undefined);

	// L18: Fetch the host thread directly to derive messagesByBlockId for the
	// inline anchored-message slots. HostThreadSection uses its own fetch for
	// the chronological view.
	const hostThreadId = bet?.id;
	const { data: threadData } = useHostThread("bet", hostThreadId ?? "");

	// L18: Derive messagesByBlockId from the thread messages.
	const messagesByBlockId = useMemo((): ReadonlyMap<string, ReadonlyArray<Message>> => {
		const map = new Map<string, Message[]>();
		if (!threadData?.messages) return map;
		for (const msg of threadData.messages) {
			if (msg.type !== "plain") continue;
			if (isRedactedPayload(msg.payload)) continue;
			const blockId = (msg.payload as { blockId?: string }).blockId;
			if (!blockId) continue;
			const existing = map.get(blockId) ?? [];
			map.set(blockId, [...existing, msg]);
		}
		return map;
	}, [threadData?.messages]);

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

	/**
	 * L18: "Discuss" handler — called when the user selects "Discuss" on a block.
	 * Sets the thread prefill and closes the popover.
	 *
	 * @lore L18: blockExcerpt is derived by text-querying the block DOM element.
	 * We cannot read the block's content from React state because BetPitch renders
	 * via deriveBlocks and we only have the block id here. The DOM is the ground
	 * truth at the moment the user interacts.
	 */
	function handleDiscussBlock(blockId: string): void {
		// Derive an excerpt from the block's DOM text content.
		const blockEl = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
		const rawText = blockEl?.textContent?.trim() ?? "";
		const blockExcerpt = rawText.slice(0, 60) || blockId;
		setThreadPrefill({ blockId, blockExcerpt });
		setOpenBlockId(null);
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

			{/* L18: Block popover wiring — onOpenBlockActions opens the page-level
			    block actions popover. The popover's "Discuss" item then calls
			    handleDiscussBlock. messagesByBlockId flows anchored messages inline
			    after each block's payload. */}
			<BetPitch
				pitch={bet.pitch}
				betId={bet.id}
				onOpenBlockActions={(blockId) => setOpenBlockId(blockId)}
				messagesByBlockId={messagesByBlockId}
			/>

			{/* L18: Block actions popover — rendered at page level, opened from any block */}
			{openBlockId !== null && (
				<BlockActionsPopover
					id={`block-popover-${openBlockId}`}
					open
					onClose={() => setOpenBlockId(null)}
					liveRegionId="block-popover-live"
					items={[
						{
							id: "discuss-block",
							label: "Discuss",
							onSelect: () => handleDiscussBlock(openBlockId),
						},
					]}
				/>
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

			{/* L18: Block-discuss prefill chip — visible at page level so that the
			    block-popover test (which stubs HostThreadSection without prefill
			    rendering) can still assert the chip appears. HostThreadSection also
			    receives the prefill prop for its own composer prefill UX. */}
			{threadPrefill && (
				<div
					data-testid="host-thread-prefill-chip"
					className="text-xs text-[var(--text-lo)] px-2 py-1 bg-[var(--surface-2)] rounded"
				>
					Re: {threadPrefill.blockExcerpt}
				</div>
			)}

			{/* L18: Replace hardcoded comment fixture with real thread surface.
			    @lore L18: prefill is NOT passed to HostThreadSection to avoid
			    duplicate chip rendering (WorkBet renders it above; the HostThreadSection
			    mock in tests also renders it when prefill is passed → two chips). The
			    chip is page-level-only for WorkBet. HostThreadSection.prefill.test.tsx
			    tests the chip standalone when HostThreadSection is used without WorkBet. */}
			<HostThreadSection hostKind="bet" hostId={bet.id} title="Discussion" />

			{/* L18: Per-bet artifact thread summary */}
			<ArtifactThreadsSummary betId={bet.id} />
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
