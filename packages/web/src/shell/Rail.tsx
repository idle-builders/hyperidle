import {
	betStatusToStatus,
	dsShellProps,
	EmptyState,
	type Status,
	StatusChip,
} from "@hyperidle/design-system";
import type { BetStatus } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import { useNavigate } from "react-router-dom";
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
	/**
	 * L8: source thread to deep-link into when the row is clicked. Optional
	 * because legacy fixtures may not carry it; rows without a source thread
	 * still render but degrade to a no-op (still focusable, still announced).
	 */
	sourceThreadId?: string;
	/**
	 * L8: how long the agent has been blocked. Surfaced in the row's title
	 * attribute as e.g. "for 47m" alongside the source agent name. Optional
	 * for the same reason as sourceThreadId.
	 */
	durationMs?: number;
}

export interface CostInfo {
	todaySpend: string;
	todayBudget: string;
	weekSpend: string;
	weekBudget: string;
}

/**
 * L8: aggregate counts for the system-stability strip. Sourced from
 * `GET /api/system/stability` via {@link useSystemStability}. The Rail
 * does not poll itself — the parent injects the value so tests and stories
 * can drive the strip deterministically.
 *
 * @lore L8: keys are snake_case to match the wire format mandated by the
 * spec ("returning `{ crashed_sessions, cap_reached, api_degraded }`").
 * Renaming them in TS would introduce a serializer at the trust boundary
 * for no functional gain — the wire format and the TS shape are the same
 * contract. The Biome `useNamingConvention` warning is acknowledged.
 */
export interface SystemStability {
	// biome-ignore-start lint/style/useNamingConvention: spec-mandated wire format
	crashed_sessions: number;
	cap_reached: number;
	api_degraded: number;
	// biome-ignore-end lint/style/useNamingConvention: spec-mandated wire format
}

export interface RailProps {
	expanded: boolean;
	onToggleExpand: () => void;
	bets: BetItem[];
	blockers: BlockerItem[];
	cost: CostInfo;
	/**
	 * L8: optional. Omitting (or passing all-zeros) hides the system-stability
	 * strip entirely — the spec says "Strip is hidden when all three are 0",
	 * so the natural default is the all-zero shape. Existing call-sites that
	 * predate L8 keep working unmodified.
	 */
	stability?: SystemStability;
}

const ZERO_STABILITY: SystemStability = {
	crashed_sessions: 0,
	cap_reached: 0,
	api_degraded: 0,
};

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
 * L8: format a blocked-duration ms value as a short hover string ("47m",
 * "2h", "3d"). Spec example: "for 47m". Returns null when ms is non-finite
 * or non-positive so callers can omit the duration cleanly.
 */
function formatDuration(ms: number | undefined): string | null {
	if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return null;
	const minutes = Math.round(ms / 60_000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	return `${days}d`;
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
type CollapsedPillKind = "blk" | "rev" | "psd" | "crash" | "cap" | "api";

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
	// L8: system-stability pills mirror BLK's danger tone — these are
	// failure-state indicators (crashed runtime, cap exhausted, model API
	// degraded) and the design system reserves red for danger.
	crash: {
		label: "CRASH",
		ariaNounSingular: "crashed session",
		ariaNounPlural: "crashed sessions",
		tone: "bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-error",
	},
	cap: {
		label: "CAP",
		ariaNounSingular: "cap-reached product",
		ariaNounPlural: "cap-reached products",
		tone: "bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-error",
	},
	api: {
		label: "API",
		ariaNounSingular: "API degraded",
		ariaNounPlural: "API degraded",
		tone: "bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-error",
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
	stability = ZERO_STABILITY,
}: RailProps): JSX.Element {
	const navigate = useNavigate();
	// L8: derived flag for the strip + collapsed pills. "Hide when all zero"
	// is single-source-of-truth here so the two surfaces never drift.
	const stabilityActive =
		stability.crashed_sessions > 0 || stability.cap_reached > 0 || stability.api_degraded > 0;

	const [openSections, setOpenSections] = useState({
		bets: true,
		blockers: true,
		cost: true,
	});

	const toggleSection = (section: keyof typeof openSections): void => {
		setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
	};

	// L8: roving-focus item count grows by 1 when the system-stability strip
	// is rendered. Section order (bets, blockers, cost, stability) is the
	// vertical render order and the keyboard order MUST match.
	const sectionOrder: (keyof typeof openSections | "stability")[] = stabilityActive
		? ["bets", "blockers", "cost", "stability"]
		: ["bets", "blockers", "cost"];
	const { getItemProps } = useRovingFocus({
		itemCount: sectionOrder.length,
		onSelect: (index) => {
			const target = sectionOrder[index];
			if (target === "stability") return; // stability strip is always-open
			toggleSection(target);
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
				{/*
				 * L8 AC: when the Rail is collapsed, the system-stability strip
				 * surfaces its non-zero counts as red BLK-style pills next to
				 * the existing pill cluster. Each pill self-gates on count > 0
				 * via CollapsedPill's `count <= 0 → null` guard.
				 */}
				<CollapsedPill kind="crash" count={stability.crashed_sessions} />
				<CollapsedPill kind="cap" count={stability.cap_reached} />
				<CollapsedPill kind="api" count={stability.api_degraded} />
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
			</div>
		);
	}

	const betsProps = getItemProps(0);
	const blockersProps = getItemProps(1);
	const costProps = getItemProps(2);
	const stabilityProps = stabilityActive ? getItemProps(3) : null;

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
								// L8 ARIA: every now-interactive Rail row has an accessible
								// label describing its destination. Bets deep-link to the
								// per-bet work surface.
								aria-label={`Open bet ${bet.title}`}
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
						{blockers.map((blocker) => {
							// L8: deep-link target. Reuses the established
							// `/conversations/review?thread=<id>` query-param contract
							// (see UndoToast + AppShell.handleSearchNavigate). When a
							// blocker has no source thread (legacy fixture), the row
							// degrades to a no-op: still focusable + announced, but
							// click does nothing instead of navigating to a nonexistent
							// thread.
							const thread = blocker.sourceThreadId;
							const duration = formatDuration(blocker.durationMs);
							const titleParts = [`from ${blocker.agent}`];
							if (duration) titleParts.unshift(`for ${duration}`);
							const hoverTitle = titleParts.join(" • ");
							return (
								<button
									key={blocker.id}
									type="button"
									className="flex flex-col gap-1 py-1 w-full text-left hover:bg-[var(--surface-ghost)] rounded px-1 cursor-pointer"
									onClick={() => {
										if (!thread) return;
										navigate(`/conversations/review?thread=${encodeURIComponent(thread)}`);
									}}
									aria-label={
										thread
											? `Open conversation thread for ${blocker.agent}: ${blocker.reason}`
											: `Blocker from ${blocker.agent}: ${blocker.reason}`
									}
									title={hoverTitle}
								>
									<div className="flex items-center justify-between w-full">
										<span className="text-sm text-[var(--text-hi)]">{blocker.agent}</span>
										<StatusChip status={severityToChipStatus(blocker.severity)} />
									</div>
									<span className="text-xs text-[var(--text-lo)]">{blocker.reason}</span>
								</button>
							);
						})}
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
						<CostRow label="Today" value={cost.todaySpend} navigate={navigate} />
						<CostRow label="Today Budget" value={cost.todayBudget} navigate={navigate} />
						<CostRow label="Week" value={cost.weekSpend} navigate={navigate} />
						<CostRow label="Week Budget" value={cost.weekBudget} navigate={navigate} />
					</div>
				)}
			</div>

			{/*
			 * L8: System-Stability strip. Hidden when all three counts are 0
			 * (`stabilityActive` gate). Each row is a button deep-linking to
			 * the relevant detail surface, with an aria-label describing the
			 * destination.
			 */}
			{stabilityActive && stabilityProps && (
				<div>
					<SectionHeader
						title="System Stability"
						isOpen={true}
						onToggle={() => {
							/* always-open: strip self-hides when all zero */
						}}
						tabIndex={stabilityProps.tabIndex}
						onKeyDown={stabilityProps.onKeyDown}
						itemRef={stabilityProps.ref}
						panelId="rail-panel-stability"
					/>
					<div
						id="rail-panel-stability"
						className="flex flex-col gap-1 px-2 py-1"
						data-testid="rail-stability-strip"
					>
						{stability.crashed_sessions > 0 && (
							<StabilityRow
								label={`${stability.crashed_sessions} crashed session${stability.crashed_sessions === 1 ? "" : "s"}`}
								ariaLabel={`Open crashed sessions detail (${stability.crashed_sessions})`}
								// @lore L8: until a dedicated crashed-sessions surface
								// lands, deep-link to the conversations review queue
								// where review threads for crashed sessions surface.
								onClick={() => navigate("/conversations/review")}
							/>
						)}
						{stability.cap_reached > 0 && (
							<StabilityRow
								label={`${stability.cap_reached} cap-reached product${stability.cap_reached === 1 ? "" : "s"}`}
								ariaLabel={`Open cap-reached products in Settings Caps (${stability.cap_reached})`}
								onClick={() => navigate("/conversations/review?settings=open")}
							/>
						)}
						{stability.api_degraded > 0 && (
							<StabilityRow
								label="API degraded"
								ariaLabel="Open API degraded status detail"
								// @lore L8: API degraded → /api/status surface lives in
								// Settings; the only route currently exposing it is the
								// settings overlay, opened via ?settings=open.
								onClick={() => navigate("/conversations/review?settings=open")}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * L8: clickable cost row. Renders a button with the same visual contract as
 * KeyValue but deep-links to Settings → Caps. Until L13/cost-drill ships,
 * this is the cost-row destination per spec; the title attribute documents
 * the temporary nature.
 */
function CostRow({
	label,
	value,
	navigate,
}: {
	label: string;
	value: string;
	navigate: ReturnType<typeof useNavigate>;
}): JSX.Element {
	return (
		<button
			type="button"
			className="flex w-full items-center justify-between py-1 px-1 text-left hover:bg-[var(--surface-ghost)] rounded"
			onClick={() => navigate("/conversations/review?settings=open")}
			aria-label={`Open Settings Caps for ${label}`}
			// @lore L8: until L13/cost-drill ships, the cost-row deep-link
			// goes to Settings → Caps rather than a per-line drill view.
			// Documenting this in the title attribute keeps the destination
			// honest with the user — they expect a drill, they get caps.
			title={`Opens Settings → Caps (until cost-drill ships)`}
		>
			<span className="text-xs text-[var(--text-lo)] uppercase tracking-wider">{label}</span>
			<span className="text-sm text-[var(--text-hi)] font-mono [font-variant-numeric:tabular-nums]">
				{value}
			</span>
		</button>
	);
}

/**
 * L8: clickable system-stability row. Mirrors the danger tone of
 * BLK pills (red) — these are failure-state indicators.
 */
function StabilityRow({
	label,
	ariaLabel,
	onClick,
}: {
	label: string;
	ariaLabel: string;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			className="flex w-full items-center justify-between py-1 px-1 text-left rounded text-error bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_oklab,var(--danger)_20%,transparent)]"
			onClick={onClick}
			aria-label={ariaLabel}
		>
			<span className="text-sm">{label}</span>
		</button>
	);
}
