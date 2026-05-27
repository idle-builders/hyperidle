import {
	betStatusToStatus,
	dsShellProps,
	EmptyState,
	KeyValue,
	type Status,
	StatusChip,
} from "@hyperidle/design-system";
import type { BetStatus, WireMoney } from "@hyperidle/shared";
import { formatMoney, formatTokenCount } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHint } from "../hooks/useHints";
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
	/** M3 C2: progress replaces product string — matches /api/rail wire format. */
	progress: { done: number; total: number };
	status: BetStatus;
}

export interface BlockerItem {
	/** M3 C2: taskId replaces id — matches /api/rail wire format. */
	taskId: string;
	/** M3 C2: title replaces reason — matches /api/rail wire format. */
	title: string;
	/** M3 C2: owner replaces agent — matches /api/rail wire format. */
	owner: string | null;
	/**
	 * M3 C2: durationBlockedMs replaces severity.
	 * Severity is DERIVED via deriveBlockerSeverity at render time, not stored.
	 * @lore M3: the API emits the raw duration; the Rail component derives
	 * display severity locally so the API stays pure data and presentation
	 * thresholds can change without a schema migration.
	 */
	durationBlockedMs: number;
}

export interface CostInfo {
	/** M3 C3: all cost fields are nullable — null means "no data". */
	todaySpend: WireMoney | null;
	todayCap: WireMoney | null;
	weekSpend: WireMoney | null;
	weekCap: WireMoney | null;
	weekTokens?: number | null;
}

/**
 * Derive blocker display severity from durationBlockedMs.
 * Thresholds: <4h → low, 4–24h → medium, ≥24h → high.
 *
 * @lore M3 C3: severity is a presentation concept — the API emits raw
 * duration so thresholds can change client-side without a schema migration.
 */
export function deriveBlockerSeverity(durationBlockedMs: number): "low" | "medium" | "high" {
	const hours = durationBlockedMs / 3_600_000;
	if (hours >= 24) return "high";
	if (hours >= 4) return "medium";
	return "low";
}

export interface RailProps {
	expanded: boolean;
	onToggleExpand: () => void;
	bets: BetItem[];
	blockers: BlockerItem[];
	cost: CostInfo;
	/** L21: Called when the CoC trigger button is clicked. Optional for backwards-compat. */
	onCocClick?: () => void;
	/** L21: Whether the CoC overlay is currently open (drives aria-expanded on trigger). */
	cocOverlayOpen?: boolean;
}

interface SectionHeaderProps {
	title: string;
	count?: number;
	isOpen: boolean;
	onToggle: () => void;
	tabIndex: number;
	onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
	itemRef: (el: HTMLElement | null) => void;
	/** ID of the collapsible content region this header controls. */
	panelId: string;
}

function SectionHeader({
	title,
	count,
	isOpen,
	onToggle,
	tabIndex,
	onKeyDown,
	itemRef,
	panelId,
}: SectionHeaderProps): JSX.Element {
	return (
		<button
			type="button"
			className="flex w-full items-center justify-between p-2 text-left hover:bg-[var(--surface-ghost)]"
			onClick={onToggle}
			tabIndex={tabIndex}
			onKeyDown={onKeyDown}
			ref={itemRef}
			aria-expanded={isOpen}
			aria-controls={panelId}
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
		tone: "bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-error",
	},
	rev: {
		label: "REV",
		ariaNounSingular: "review",
		ariaNounPlural: "reviews",
		tone: "bg-[color-mix(in_oklab,var(--primary)_15%,transparent)] text-primary",
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

export function Rail({
	expanded,
	onToggleExpand,
	bets,
	blockers,
	cost,
	onCocClick,
	cocOverlayOpen = false,
}: RailProps): JSX.Element {
	const navigate = useNavigate();
	const hintRailIndicators = useHint("rail-indicators");

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
		// @lore Design system mandates GPU-only animations (transform, opacity). Width
		// transitions are not GPU-accelerated but are necessary here because the Rail
		// collapse/expand changes the document flow — transform: scaleX() would clip
		// children and not reclaim layout space. transition-[width] is the pragmatic
		// choice for this expand/collapse pattern.
		return (
			<div
				{...dsShellProps("Rail")}
				className="flex w-14 flex-col items-center gap-2 p-2 transition-[width] duration-[var(--motion-medium)]"
			>
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
					className="text-xs text-[var(--text-lo)] mt-1"
					aria-label={`${totalBets} ${totalBets === 1 ? "active bet" : "active bets"}`}
				>
					{formatCount(totalBets)}
				</span>
				{/* L21: CoC trigger — icon-only in collapsed state, pushed to bottom */}
				<button
					type="button"
					className="mt-auto btn btn-ghost btn-xs w-8 h-8 p-0 flex items-center justify-center"
					aria-label="Chief of Staff"
					aria-expanded={cocOverlayOpen}
					onClick={onCocClick}
				>
					<svg
						aria-hidden="true"
						width={16}
						height={16}
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.5}
						className={cocOverlayOpen ? "text-[var(--primary)]" : "text-[var(--text-lo)]"}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M13.5 3.5H2.5A1 1 0 001.5 4.5v6A1 1 0 002.5 11.5h2l2 2 2-2h4.5a1 1 0 001-1v-6a1 1 0 00-1-1z"
						/>
					</svg>
				</button>
			</div>
		);
	}

	const betsProps = getItemProps(0);
	const blockersProps = getItemProps(1);
	const costProps = getItemProps(2);

	return (
		<div
			{...dsShellProps("Rail")}
			/*
			 * @lore K11: outer pad → --density-page-gutter per
			 * density-audit.md § 3.3.K3. Rail expanded width stays literal
			 * (`w-[360px]`); collapsed-pill width budget (BLK / REV / PSD +
			 * N+) is geometrically tuned and stays literal.
			 */
			className="flex w-[360px] flex-col gap-[var(--density-gap)] p-[var(--density-page-gutter)] transition-[width] duration-[var(--motion-medium)]"
		>
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

			{/* P5: Hint #5 — rail-indicators. Shows on first rail expansion. */}
			{hintRailIndicators.visible && expanded && (
				<div
					role="status"
					data-testid={hintRailIndicators.testId}
					className="rounded-[var(--r1)] bg-[var(--surface-2)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)]"
				>
					<p className="text-[length:var(--density-text)] text-[var(--text-mid)] leading-[var(--leading-body)]">
						{hintRailIndicators.copy}
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							className="btn btn-ghost btn-xs text-[var(--text-lo)] min-h-[44px]"
							onClick={hintRailIndicators.dismiss}
						>
							Got it
						</button>
					</div>
				</div>
			)}

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
					panelId="rail-panel-bets"
				/>
				{openSections.bets && (
					<div id="rail-panel-bets" className="flex flex-col gap-1 px-2 py-1">
						{bets.length === 0 && (
							<EmptyState
								title="No active bets"
								description="Bets will appear here when committed."
								dataTestId="rail-bets-empty"
							/>
						)}
						{bets.map((bet) => (
							<button
								key={bet.id}
								type="button"
								className="flex flex-col gap-1 py-1 w-full text-left hover:bg-[var(--surface-ghost)] rounded px-1 cursor-pointer"
								onClick={() => navigate(`/work/bet/${bet.id}`)}
							>
								<div className="flex items-center justify-between w-full">
									<span className="text-sm text-[var(--text-hi)]">{bet.title}</span>
									<StatusChip status={betStatusToStatus(bet.status)} />
								</div>
								<span
									className="text-xs text-[var(--text-lo)]"
									aria-label={`${bet.progress.done} of ${bet.progress.total} tasks done`}
								>
									{bet.progress.done}/{bet.progress.total}
								</span>
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
					panelId="rail-panel-blockers"
				/>
				{openSections.blockers && (
					<div id="rail-panel-blockers" className="flex flex-col gap-1 px-2 py-1">
						{blockers.length === 0 && (
							<EmptyState
								title="No blockers"
								description="All agents are unblocked."
								dataTestId="rail-blockers-empty"
							/>
						)}
						{blockers.map((blocker) => (
							<div key={blocker.taskId} className="flex flex-col gap-1 py-1">
								<div className="flex items-center justify-between">
									<span className="text-sm text-[var(--text-hi)]">{blocker.title}</span>
									<StatusChip
										status={severityToChipStatus(deriveBlockerSeverity(blocker.durationBlockedMs))}
									/>
								</div>
								{blocker.owner !== null && (
									<span className="text-xs text-[var(--text-lo)]">{blocker.owner}</span>
								)}
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
					panelId="rail-panel-cost"
				/>
				{openSections.cost && (
					<div id="rail-panel-cost" className="flex flex-col gap-1 px-2 py-1">
						<KeyValue
							label="Today"
							value={cost.todaySpend !== null ? formatMoney(cost.todaySpend) : "—"}
						/>
						<KeyValue
							label="Today Budget"
							value={cost.todayCap !== null ? formatMoney(cost.todayCap) : "No cap"}
						/>
						<KeyValue
							label="Week"
							value={cost.weekSpend !== null ? formatMoney(cost.weekSpend) : "—"}
						/>
						<KeyValue
							label="Week Budget"
							value={cost.weekCap !== null ? formatMoney(cost.weekCap) : "No cap"}
						/>
						{cost.weekTokens != null && (
							<KeyValue label="Week Tokens" value={formatTokenCount(cost.weekTokens)} />
						)}
					</div>
				)}
			</div>

			{/* L21: CoC trigger — full-width with label in expanded state, pushed to bottom */}
			<button
				type="button"
				className="mt-auto flex w-full items-center gap-2 rounded-[var(--r1)] border border-[var(--border-subtle)] bg-[var(--surface-4)] px-2 hover:bg-[var(--surface-5)] min-h-[36px]"
				aria-expanded={cocOverlayOpen}
				aria-label="Chief of Staff"
				onClick={onCocClick}
			>
				<svg
					aria-hidden="true"
					width={16}
					height={16}
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					className={
						cocOverlayOpen ? "shrink-0 text-[var(--primary)]" : "shrink-0 text-[var(--text-lo)]"
					}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M13.5 3.5H2.5A1 1 0 001.5 4.5v6A1 1 0 002.5 11.5h2l2 2 2-2h4.5a1 1 0 001-1v-6a1 1 0 00-1-1z"
					/>
				</svg>
				<span className="text-xs text-[var(--text-mid)]">Chief of Staff</span>
			</button>
		</div>
	);
}
