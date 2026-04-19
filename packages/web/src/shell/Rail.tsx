import type { BetStatus } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyValue } from "../components/KeyValue";
import type { Status } from "../components/StatusChip";
import { StatusChip } from "../components/StatusChip";
import { betStatusToStatus } from "../components/status-mapping";
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
 * Collapsed-Rail pill. Private to Rail: kind → { abbreviation, aria verb, tone }.
 * - BLK: blockers, error tone
 * - REV: review bets, primary tone
 * - PSD: paused bets, neutral (base-content) tone
 *
 * Returns `null` when count <= 0 so the caller can unconditionally render all
 * three and rely on the pill to self-gate (AC 51: "Pills only render when count > 0").
 */
type CollapsedPillKind = "blk" | "rev" | "psd";

const PILL_META: Record<CollapsedPillKind, { label: string; ariaNoun: string; tone: string }> = {
	blk: {
		label: "BLK",
		ariaNoun: "blockers",
		tone: "bg-error/15 text-error",
	},
	rev: {
		label: "REV",
		ariaNoun: "reviews",
		tone: "bg-primary/15 text-primary",
	},
	psd: {
		label: "PSD",
		ariaNoun: "paused bets",
		tone: "bg-base-300 text-base-content",
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
	return (
		<span
			aria-label={`${count} ${meta.ariaNoun}`}
			className={`badge badge-sm font-mono uppercase ${meta.tone}`}
		>
			<span aria-hidden="true">{meta.label}</span>
			<span aria-hidden="true"> </span>
			<span>{count}</span>
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
		return (
			<div className="flex w-14 flex-col items-center gap-2 p-2">
				{/*
				 * Total-bets indicator preserved from the pre-J2 collapsed Rail contract.
				 * @lore J2: the three semantic pills (BLK/REV/PSD) describe category-level
				 * state, but the "how many bets are in flight at all" signal is still
				 * useful at a glance. Rendered as a plain neutral count dot so it does
				 * not compete visually with the semantic pills.
				 */}
				<span className="text-xs text-[var(--text-lo)]" aria-label={`${bets.length} active bets`}>
					{bets.length}
				</span>
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
			</div>
		);
	}

	const betsProps = getItemProps(0);
	const blockersProps = getItemProps(1);
	const costProps = getItemProps(2);

	return (
		<div className="flex w-[360px] flex-col gap-[var(--density-gap)] p-2">
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
