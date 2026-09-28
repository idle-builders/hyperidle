// ReviewBatch: the batch / per-item container.
//
// Half of real agent work is a SET — N items decided in one pass. The reviewer
// can't read 41 tickets; the canvas does the reading FOR them and surfaces only
// the outliers. Three layers:
//   L1  the rollup        — one glance: how many, how many need YOU, the win.
//   L2  the sorted list   — 4 flagged pinned to top (red), routine collapsed to
//                           ONE group row each ("18 auto-resolved", "19 drafted").
//   L3  the expanded item — a flagged ticket opened: customer card + the agent's
//                           drafted reply rendered for read-through.
//
// Tool-grounded (Zendesk mini-logo + real-shaped fixture). Hearth tokens by
// NAME only; no hex lives here (brand color is owned by ToolLogo). 6px grid, pill
// buttons, left-aligned, transform/opacity-only motion.
//
// States: populated (default, below) · empty (no triage to review) · loading
// (skeleton rollup + 3 ghost rows) · the flagged-emphasis state IS the default —
// the 4 red rows pinned above the routine collapse. Resolved is out of scope; the
// review frame owns the final verdict.

import { type JSX, useState } from "react";
import { Avatar, RowDot, StatusChip, Tag } from "../../ds";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isNumber, isPlainObject } from "./payload-guard";
import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
import type { BatchPayload, ReviewCanvasProps } from "./review-artifact";

// ─────────────────────────────────────────────────────────────────────────────
// fixture — Zendesk overnight support triage, 41 tickets
// ─────────────────────────────────────────────────────────────────────────────

type FlagKind = "churn" | "authority" | "accuracy" | "legal";

interface FlaggedItem {
	readonly id: string;
	readonly ref: string; // ticket / case ref
	readonly customer: string;
	readonly account: string;
	readonly arr: string; // formatted, "" when consumer / no ARR
	/** Undefined when the payload carries no sentiment for this item. */
	readonly sentiment?: "angry" | "frustrated" | "neutral";
	readonly subject: string;
	/** Undefined when the payload names no flag category. */
	readonly flag?: FlagKind;
	readonly flagReason: string; // the one-line WHY this needs a human
	readonly waited: string;
	// L3 context
	readonly lastMessage: string;
	/** Undefined when the payload carries no drafted reply at all — distinct
	 * from "" (a real draft that happens to be empty). */
	readonly draftedReply?: string;
	readonly draftNote: string; // why the agent stopped short of sending
}

interface RoutineGroup {
	readonly id: string;
	readonly label: string;
	readonly detail: string;
	readonly count: number;
	readonly sample: readonly string[]; // first few refs, shown on expand
}

interface BatchFixture {
	readonly tool: "zendesk";
	readonly title: string;
	readonly window: string;
	readonly total: number;
	readonly needsYou: number;
	readonly autoResolved: number;
	readonly drafted: number;
	/** Undefined when there is no payload field behind an impact metric. */
	readonly metric?: { readonly label: string; readonly before: string; readonly after: string };
	readonly flagged: readonly FlaggedItem[];
	readonly groups: readonly RoutineGroup[];
}

// ─────────────────────────────────────────────────────────────────────────────
// small presentational helpers (local — batch-specific, not design-system shapes)
// ─────────────────────────────────────────────────────────────────────────────

const FLAG_LABEL: Record<FlagKind, string> = {
	churn: "CHURN THREAT",
	authority: "OVER LIMIT",
	accuracy: "ACCURACY RISK",
	legal: "LEGAL",
};

/** A red flag pill — the reason this single item floated to the top. */
function FlagPill({ kind }: { readonly kind: FlagKind }): JSX.Element {
	return <StatusChip status="error" label={FLAG_LABEL[kind]} />;
}

const SENTIMENT_LABEL: Record<NonNullable<FlaggedItem["sentiment"]>, string> = {
	angry: "angry",
	frustrated: "frustrated",
	neutral: "neutral",
};

/** Rollup stat — one number + its label, used in the L1 header strip. */
function Rollup({
	value,
	label,
	tone = "default",
}: {
	readonly value: string;
	readonly label: string;
	readonly tone?: "default" | "flag" | "good";
}): JSX.Element {
	const valueColor =
		tone === "flag"
			? "text-[var(--status-error)]"
			: tone === "good"
				? "text-[var(--status-success)]"
				: "text-[var(--text-primary)]";
	return (
		<div className="flex flex-col gap-[3px]">
			<span className={`type-metric ${`   tabular-nums ${valueColor}`}`}>{value}</span>
			<span className="type-metadata   text-[var(--text-secondary)]">{label}</span>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// the component
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewBatchProps {
	readonly batch: BatchFixture;
	/** which flagged item starts expanded (L3). Default: the first. */
	readonly initialExpandedId?: string;
}

function ReviewBatchView({ batch, initialExpandedId }: ReviewBatchProps): JSX.Element {
	// Derived from the real payload's own first flagged item, so the default
	// expansion is correct for any payload.
	const [expandedId, setExpandedId] = useState<string | undefined>(
		() => initialExpandedId ?? batch.flagged[0]?.id,
	);
	const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());

	const toggleItem = (id: string): void => setExpandedId((cur) => (cur === id ? undefined : id));
	const toggleGroup = (id: string): void =>
		setOpenGroups((cur) => {
			const next = new Set(cur);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});

	const routineCount = batch.autoResolved + batch.drafted;

	return (
		<div className="type-small mx-auto max-w-[760px] w-full  text-[var(--text-primary)]">
			{/* L1 — the rollup */}
			<section className="border-width-thin rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] overflow-hidden">
				<header className="flex items-start justify-between gap-[12px] px-[18px] pt-[15px] pb-[12px]">
					<div className="flex flex-col gap-[3px] min-w-0">
						<div className="flex items-center gap-[9px]">
							<StatusChip status="behind" label={`${batch.needsYou} NEED YOU`} />
						</div>
						<p className="type-metadata  text-[var(--text-tertiary)] ">
							{batch.total} tickets · {batch.window}
						</p>
					</div>
				</header>

				{/* the numbers, relevance-ordered: needs-you first, in red */}
				<div className="grid grid-cols-4 gap-[12px] px-[18px] pb-[12px]">
					<Rollup value={String(batch.needsYou)} label="need you" tone="flag" />
					<Rollup value={String(batch.total)} label="triaged" />
					<Rollup value={String(batch.autoResolved)} label="auto-resolved" tone="good" />
					<Rollup value={String(batch.drafted)} label="drafted" />
				</div>

				{/* the win — one calm line of impact, only shown when the payload
				    actually supplies a metric. */}
				{batch.metric ? (
					<div className="border-width-thin-t flex items-center gap-[9px] px-[18px] py-[9px]  border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--status-success)_6%,transparent)]">
						<RowDot tone="success" />
						<span className="type-small  text-[var(--text-secondary)]">
							{batch.metric.label} would drop{" "}
							<span className="line-through text-[var(--text-tertiary)] tabular-nums">
								{batch.metric.before}
							</span>{" "}
							<span className="type-small  text-[var(--status-success)] tabular-nums">
								→ {batch.metric.after}
							</span>{" "}
							once the {batch.drafted} drafts send.
						</span>
					</div>
				) : null}
			</section>

			{/* batch rollup line — routine count without a batch-verdict action; the
			    review frame owns the single Approve button (ReviewComposition.test.tsx). */}
			<div className="flex items-center justify-between gap-[12px] mt-[12px] mb-[6px] px-[3px]">
				<span className="type-label   uppercase  text-[var(--text-tertiary)]">
					{batch.needsYou} flagged · {routineCount} routine
				</span>
			</div>

			{/* L2 — flagged items pinned to the top (red), each one row */}
			<ul className="flex flex-col gap-[9px]">
				{batch.flagged.map((item, i) => {
					const open = expandedId === item.id;
					return (
						<li key={item.id}>
							<div
								className={`rounded-[var(--r-default)]  bg-[var(--surface-elevated)] overflow-hidden    ${
									open
										? "border-[var(--status-error)] shadow-[var(--shadow-default)]"
										: "border-[color-mix(in_oklab,var(--status-error)_35%,var(--border-subtle))]"
								}`}
							>
								{/* the row — clickable summary */}
								<button
									type="button"
									onClick={() => toggleItem(item.id)}
									aria-expanded={open}
									className="w-full flex items-center gap-[12px] px-[15px] py-[12px] text-left cursor-pointer hover:bg-[var(--accent-primary-dim)]   "
								>
									{/* left edge: priority index */}
									<Tag label={String(i + 1)} />

									<div className="flex flex-col gap-[3px] min-w-0 flex-1">
										<div className="flex items-center gap-[9px] min-w-0">
											<span className="type-copy   truncate">{item.customer}</span>
											{item.arr ? (
												<span className="type-metadata   tabular-nums text-[var(--accent-secondary)] shrink-0">
													{item.arr}
												</span>
											) : (
												<span className="type-metadata  text-[var(--text-tertiary)] shrink-0">
													{item.account}
												</span>
											)}
											{/* Undefined means unknown, not "neutral". */}
											{item.sentiment ? (
												<span className="type-metadata  text-[var(--text-tertiary)] shrink-0">
													· {SENTIMENT_LABEL[item.sentiment]}
												</span>
											) : null}
										</div>
										<span className="type-small  text-[var(--text-secondary)] truncate">
											{item.ref} · {item.flagReason}
										</span>
									</div>

									<div className="flex items-center gap-[9px] shrink-0">
										<span className="type-metadata  text-[var(--text-tertiary)] tabular-nums hidden sm:inline">
											{item.waited}
										</span>
										{item.flag ? <FlagPill kind={item.flag} /> : null}
										<span
											aria-hidden="true"
											className={`motion-move ${`type-metadata ${`text-[var(--text-tertiary)]     ${open ? "rotate-90" : ""}`}`}`}
										>
											▶
										</span>
									</div>
								</button>

								{/* L3 — expanded context: customer's message + the drafted reply + per-item verdict */}
								{open ? (
									<div className="border-width-thin-t  border-[var(--border-subtle)] bg-[var(--surface-page)] px-[15px] py-[15px] flex flex-col gap-[12px]">
										{/* the customer's last message */}
										<div className="flex flex-col gap-[6px]">
											<span className="type-label   uppercase  text-[var(--text-tertiary)]">
												{item.customer} · {item.subject}
											</span>
											<blockquote className="border-width-strong-l type-small   text-[var(--text-secondary)]  border-[var(--border-default)] pl-[12px]">
												{item.lastMessage}
											</blockquote>
										</div>

										{/* the agent's drafted reply, rendered as it would send */}
										{item.draftedReply ? (
											<div className="border-width-thin rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] overflow-hidden">
												<div className="border-width-thin-b flex items-center gap-[6px] px-[12px] py-[6px]  border-[var(--border-subtle)]">
													<Avatar initials="AI" agent size="sm" />
													<span className="type-metadata   text-[var(--text-secondary)]">
														Drafted reply — held for review
													</span>
												</div>
												<p className="type-small px-[12px] py-[12px]   text-[var(--text-primary)]">
													{item.draftedReply}
												</p>
											</div>
										) : null}
										{/* No else-branch here: absent a drafted reply, there is no payload
										    field that supports a routing claim ("policy routes this to you"),
										    so nothing renders rather than asserting one. */}

										{/* why the agent held — framed explanation, not just a red box */}
										<div className="flex flex-col gap-[6px] rounded-[var(--r-subtle)]  border-[var(--status-error)] bg-[color-mix(in_oklab,var(--status-error)_8%,transparent)] px-[12px] py-[9px]">
											<div className="flex items-center gap-[6px]">
												<span
													role="img"
													aria-label="Warning"
													className="type-metadata inline-flex h-[16px] w-[16px] items-center justify-center rounded-[var(--r-pill)] bg-[var(--status-error)] text-[var(--text-on-accent)]    shrink-0"
												>
													!
												</span>
												<span className="type-label   uppercase  text-[var(--status-error)]">
													Held for your review — why
												</span>
											</div>
											<span className="type-metadata   text-[var(--text-secondary)]">
												{item.draftNote}
											</span>
										</div>
									</div>
								) : null}
							</div>
						</li>
					);
				})}
			</ul>

			{/* the routine, collapsed — each whole group is ONE row */}
			<ul className="flex flex-col gap-[6px] mt-[12px]">
				{batch.groups.map((g) => {
					const open = openGroups.has(g.id);
					return (
						<li key={g.id}>
							<div className="border-width-thin rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-container)] overflow-hidden">
								<button
									type="button"
									onClick={() => toggleGroup(g.id)}
									aria-expanded={open}
									className="w-full flex items-center gap-[12px] px-[15px] py-[9px] text-left cursor-pointer hover:bg-[var(--accent-primary-dim)]   "
								>
									<Tag label={String(g.count)} />
									<div className="flex flex-col gap-[3px] min-w-0 flex-1">
										<span className="type-small   text-[var(--text-primary)] truncate">
											{g.count} {g.label.toLowerCase()}
										</span>
										<span className="type-metadata  text-[var(--text-tertiary)] truncate">
											{g.detail}
										</span>
									</div>
									<span className="type-metadata  text-[var(--text-tertiary)] shrink-0">
										{open ? "Hide" : "Review"}
									</span>
									<span
										aria-hidden="true"
										className={`motion-move ${`type-metadata ${`text-[var(--text-tertiary)]     ${open ? "rotate-90" : ""}`}`}`}
									>
										▶
									</span>
								</button>
								{open ? (
									<div className="border-width-thin-t  border-[var(--border-subtle)] px-[15px] py-[12px] flex flex-wrap items-center gap-[6px]">
										{g.sample.map((ref) => (
											<span
												key={ref}
												className="type-metadata border-width-thin  tabular-nums text-[var(--text-secondary)] rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[9px] py-[3px]"
											>
												{ref}
											</span>
										))}
										<span className="type-metadata  text-[var(--text-tertiary)]">
											+{g.count - g.sample.length} more · open the full list to spot-check
										</span>
									</div>
								) : null}
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

// Review artifact wrapper.
function isBatchPayload(payload: unknown): payload is BatchPayload {
	return (
		isPlainObject(payload) &&
		isPlainObject(payload.rollup) &&
		isNumber((payload.rollup as Record<string, unknown>).total) &&
		isNumber((payload.rollup as Record<string, unknown>).needYou) &&
		isNumber((payload.rollup as Record<string, unknown>).autoResolved) &&
		isNumber((payload.rollup as Record<string, unknown>).drafted) &&
		Array.isArray(payload.flagged) &&
		Array.isArray(payload.auto) &&
		Array.isArray(payload.drafted)
	);
}

function mapBatchPayload(payload: BatchPayload): BatchFixture {
	// `BatchPayload.flagged[]` carries no sentiment, flag category, or drafted
	// reply. Leaving those fields undefined (rather than a hardcoded
	// "neutral"/"churn"/"") lets the view render honestly: nothing invented.
	const flagged: FlaggedItem[] = payload.flagged.map((item) => ({
		id: item.id,
		ref: item.ref,
		customer: item.ref,
		account: "",
		arr: "",
		subject: item.reason,
		flagReason: item.reason,
		waited: "",
		lastMessage: "",
		draftNote: item.reason,
	}));
	const emptySamples: readonly string[] = [];
	const groups: RoutineGroup[] = [
		...payload.auto.map((g) => ({
			id: g.id,
			label: g.label,
			detail: "",
			count: g.count,
			sample: emptySamples,
		})),
		...payload.drafted.map((g) => ({
			id: g.id,
			label: g.label,
			detail: "",
			count: g.count,
			sample: emptySamples,
		})),
	];
	return {
		tool: "zendesk",
		title: "Overnight support triage",
		window: "",
		total: payload.rollup.total,
		needsYou: payload.rollup.needYou,
		autoResolved: payload.rollup.autoResolved,
		drafted: payload.rollup.drafted,
		flagged,
		groups,
	};
}

export function ReviewBatch({ artifact }: ReviewCanvasProps): JSX.Element {
	if (!isBatchPayload(artifact.payload)) {
		// A malformed payload gets the honest unknown-canvas
		// fallback, never the Zendesk triage demo fixture.
		return <ReviewUnknownCanvas artifact={artifact} />;
	}
	const batch = mapBatchPayload(artifact.payload);
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewBatchView batch={batch} />
		</div>
	);
}
