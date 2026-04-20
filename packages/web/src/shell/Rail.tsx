import type { BetStatus } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyValue, StatusChip, type Status, betStatusToStatus } from "@hyperidle/design-system";
import { useRovingFocus } from "./use-roving-focus";

/**
 * Maps domain blocker severity to presentation Status for StatusChip rendering.
 * Lives here (not in status-mapping.ts) because severity is a Rail-local
 * concept — no other consumer needs the mapping.
 *
 * @lore I4 S4: the previous local `betStatusToChipStatus` switch silently
 * mapped `committed`/`in_progress`/`review` to `healthy` (default branch),
 * which masked the BetStatus union. We now delegate to the shared
 * `betStatusToStatus` for the bet mapping.
 */
function severityToChipStatus(severity: "low" | "medium" | "high"): Status {
	switch (severity) {
		case "high":
			return "blocked";
		case "medium":
			return "behind";
		default:
			return "paused";
	}
}

export interface BetItem {
	id: string;
	title: string;
	product: string;
	status: BetStatus;
}

export interface BlockerItem {
	id: string;
	agent: string;
	reason: string;
	severity: "low" | "medium" | "high";
}

export interface CostInfo {
	todaySpend: string;
	todayBudget: string;
	weekSpend: string;
	weekBudget: string;
}

export interface RailProps {
	expanded: boolean;
	onToggleExpand: () => void;
	bets: BetItem[];
	blockers: BlockerItem[];
	cost: CostInfo;
}

interface SectionHeaderProps {
	title: string;
	count?: number;
	isOpen: boolean;
	onToggle: () => void;
	tabIndex: number;
	onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
	itemRef: (el: HTMLElement | null) => void;
}

function SectionHeader({
	title,
	count,
	isOpen,
	onToggle,
	tabIndex,
	onKeyDown,
	itemRef,
}: SectionHeaderProps): JSX.Element {
	return (
		<button
			type="button"
			className="flex w-full items-center justify-between p-2 text-left hover:bg-[var(--surface-4)]"
			onClick={onToggle}
			tabIndex={tabIndex}
			onKeyDown={onKeyDown}
			ref={itemRef}
		>
			<div className="flex items-center gap-2">
				<span className="font-heading text-xs uppercase tracking-wider text-[var(--text-lo)]">
					{title}
				</span>
				{count !== undefined && <span className="badge badge-sm">{count}</span>}
			</div>
			<svg
				aria-hidden="true"
				width={12}
				height={12}
				viewBox="0 0 12 12"
				fill="currentColor"
				className="text-[var(--text-lo)]"
			>
				{isOpen ? <path d="M2 4l4 5 4-5H2z" /> : <path d="M4 2l5 4-5 4V2z" />}
			</svg>
		</button>
	);
}

/**
 * Cap a count at "99+" so collapsed-Rail pills (and their aria labels) stay
 * within a one-or-two-glyph visual budget.
 * @lore J2 review O5: blocker/review/paused-bet counts > 99 overflow the
 * pill width and produce noisy aria labels. Cap at "99+".
 */
function formatCount(n: number): string {
	return n > 99 ? "99+" : String(n);
}

/**
 * Collapsed-Rail pill. Private to Rail: kind → { abbreviation, aria nouns, tone }.
 * - BLK: blockers, error tone
 * - REV: review bets, primary tone
 * - PSD: paused bets, surface-4 tone (visible on factory-dark base)
 *
 * Returns `null` when count <= 0 so the caller can unconditionally render all
 * three and rely on the pill to self-gate (AC 51: "Pills only render when count > 0").
 */
type CollapsedPillKind = "blk" | "rev" | "psd";

interface PillMeta {
	label: string;
	/** Singular noun used when count === 1 (review W1). */
	ariaNounSingular: string;
	/** Plural noun used otherwise. */
	ariaNounPlural: string;
	tone: string;
}

const PILL_META: Record<CollapsedPillKind, PillMeta> = {
	blk: {
		label: "BLK",
		ariaNounSingular: "blocker",
		ariaNounPlural: "blockers",
		tone: "bg-error/15 text-error",
	},
	rev: {
		label: "REV",
		ariaNounSingular: "review",
		ariaNounPlural: "reviews",
		tone: "bg-primary/15 text-primary",
	},
	psd: {
		label: "PSD",
		ariaNounSingular: "paused bet",
		ariaNounPlural: "paused bets",
		// @lore J2 review designer: bg-base-300/text-base-content was invisible on
		// the factory-dark Rail. Use surface-4 (panel) and text-mid (readable but
		// neutral) to render a quiet but visible neutral tone.
		tone: "bg-[var(--surface-4)] text-[var(--text-mid)]",
	},
};

function CollapsedPill({
	kind,
	count,
}: {
	kind: CollapsedPillKind;
	count: number;
}): JSX.Element | null {
	if (count <= 0) return null;
	const meta = PILL_META[kind];
	const noun = count === 1 ? meta.ariaNounSingular : meta.ariaNounPlural;
	const display = formatCount(count);
	return (
		<span
			aria-label={`${display} ${noun}`}
			className={`badge badge-sm font-mono uppercase ${meta.tone}`}
		>
			<span aria-hidden="true">{meta.label}</span>
			<span aria-hidden="true"> </span>
			<span>{display}</span>
		</span>
	);
}

export function Rail({ expanded, onToggleExpand, bets, blockers, cost }: RailProps): JSX.Element {
	const navigate = useNavigate();

	const [openSections, setOpenSections] = useState({
		bets: true,
		blockers: true,
		cost: true,
	});

	const toggleSection = (section: keyof typeof openSections): void => {
		setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
	};

	const { getItemProps } = useRovingFocus({
		itemCount: 3,
		onSelect: (index) => {
			const sections: (keyof typeof openSections)[] = ["bets", "blockers", "cost"];
			toggleSection(sections[index]);
		},
		onEscape: onToggleExpand,
	});

	if (!expanded) {
		// @lore J2 AC 51: collapsed Rail surfaces three semantic pills
		// (BLK/REV/PSD). Pills only render when count > 0 — silent when nothing.
		// PSD derives from bets.filter(status==="paused") until paused agents
		// land as a first-class entity (see J2 plan §3 CONFUSION).
		const blkCount = blockers.length;
		const revCount = bets.filter((b) => b.status === "review").length;
		const psdCount = bets.filter((b) => b.status === "paused").length;
		const totalBets = bets.length;
		return (
			<div className="flex w-14 flex-col items-center gap-2 p-2 transition-[width] duration-[var(--motion-medium)]">
				<CollapsedPill kind="blk" count={blkCount} />
				<CollapsedPill kind="rev" count={revCount} />
				<CollapsedPill kind="psd" count={psdCount} />
				<button
					type="button"
					className="btn btn-ghost btn-xs"
					aria-label="Expand rail"
					onClick={onToggleExpand}
				>
					<svg aria-hidden="true" width={12} height={12} viewBox="0 0 12 12" fill="currentColor">
						<path d="M8 2l-5 4 5 4V2z" />
					</svg>
				</button>
				{/*
				 * Total-bets affordance preserved from the pre-J2 collapsed Rail
				 * contract.
				 * @lore J2 review O6 (architect/designer): the three semantic pills
				 * (BLK/REV/PSD) carry the category-level signal. The total-bets
				 * count belongs *below* the chevron as a quieter "how many bets in
				 * flight" affordance — opacity-60 + text-xs keeps it from competing
				 * with the semantic pills above. Counts > 99 use the same 99+ cap.
				 */}
				<span
					className="text-xs text-[var(--text-lo)] opacity-60 mt-1"
					aria-label={`${totalBets} ${totalBets === 1 ? "active bet" : "active bets"}`}
				>
					{formatCount(totalBets)}
				</span>
			</div>
		);
	}

	const betsProps = getItemProps(0);
	const blockersProps = getItemProps(1);
	const costProps = getItemProps(2);

	return (
		<div className="flex w-[360px] flex-col gap-[var(--density-gap)] p-2 transition-[width] duration-[var(--motion-medium)]">
			<div className="flex items-center justify-end">
				<button
					type="button"
					className="btn btn-ghost btn-xs"
					aria-label="Collapse rail"
					onClick={onToggleExpand}
				>
					<svg aria-hidden="true" width={12} height={12} viewBox="0 0 12 12" fill="currentColor">
						<path d="M4 2l5 4-5 4V2z" />
					</svg>
				</button>
			</div>

			{/* Active Bets Section */}
			<div>
				<SectionHeader
					title="Active Bets"
					count={bets.length}
					isOpen={openSections.bets}
					onToggle={() => toggleSection("bets")}
					tabIndex={betsProps.tabIndex}
					onKeyDown={betsProps.onKeyDown}
					itemRef={betsProps.ref}
				/>
				{openSections.bets && (
					<div className="flex flex-col gap-1 px-2 py-1">
						{bets.length === 0 && (
							<p className="text-xs text-[var(--text-lo)] py-1">No active bets</p>
						)}
						{bets.map((bet) => (
							<button
								key={bet.id}
								type="button"
								className="flex flex-col gap-0.5 py-1 w-full text-left hover:bg-[var(--surface-4)] rounded px-1 cursor-pointer"
								onClick={() => navigate(`/work/bet/${bet.id}`)}
							>
								<div className="flex items-center justify-between w-full">
									<span className="text-sm text-[var(--text-hi)]">{bet.title}</span>
									<StatusChip status={betStatusToStatus(bet.status)} />
								</div>
								<span className="text-xs text-[var(--text-lo)]">{bet.product}</span>
							</button>
						))}
					</div>
				)}
			</div>

			{/* Blockers Section */}
			<div>
				<SectionHeader
					title="Blockers"
					count={blockers.length}
					isOpen={openSections.blockers}
					onToggle={() => toggleSection("blockers")}
					tabIndex={blockersProps.tabIndex}
					onKeyDown={blockersProps.onKeyDown}
					itemRef={blockersProps.ref}
				/>
				{openSections.blockers && (
					<div className="flex flex-col gap-1 px-2 py-1">
						{blockers.length === 0 && (
							<p className="text-xs text-[var(--text-lo)] py-1">No blockers</p>
						)}
						{blockers.map((blocker) => (
							<div key={blocker.id} className="flex flex-col gap-0.5 py-1">
								<div className="flex items-center justify-between">
									<span className="text-sm text-[var(--text-hi)]">{blocker.agent}</span>
									<StatusChip status={severityToChipStatus(blocker.severity)} />
								</div>
								<span className="text-xs text-[var(--text-lo)]">{blocker.reason}</span>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Cost Section */}
			<div>
				<SectionHeader
					title="Cost"
					isOpen={openSections.cost}
					onToggle={() => toggleSection("cost")}
					tabIndex={costProps.tabIndex}
					onKeyDown={costProps.onKeyDown}
					itemRef={costProps.ref}
				/>
				{openSections.cost && (
					<div className="flex flex-col gap-1 px-2 py-1">
						<KeyValue label="Today" value={cost.todaySpend} />
						<KeyValue label="Today Budget" value={cost.todayBudget} />
						<KeyValue label="Week" value={cost.weekSpend} />
						<KeyValue label="Week Budget" value={cost.weekBudget} />
					</div>
				)}
			</div>
		</div>
	);
}
