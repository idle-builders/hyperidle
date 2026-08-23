// AL1 review canvas #8 — ReviewBatch: the batch / per-item container.
//
// Half of real agent work is a SET — N items decided in one pass. The reviewer
// can't read 41 tickets; the canvas does the reading FOR them and surfaces only
// the outliers. Three layers:
//   L1  the rollup        — one glance: how many, how many need YOU, the win.
//   L2  the sorted list   — 4 flagged pinned to top (red), routine collapsed to
//                           ONE group row each ("18 auto-resolved", "19 drafted").
//   L3  the expanded item — a flagged ticket opened: customer card + the agent's
//                           drafted reply rendered + per-item Approve / Edit / Hold.
//   plus a batch verdict  — "Approve all except flagged" (the 37 routine in one tap).
//
// Tool-grounded (Zendesk mini-logo + real-shaped fixture). Hearth + CP1 tokens by
// NAME only; no hex lives here (brand color is owned by ToolLogo). 6px grid, pill
// buttons, left-aligned, transform/opacity-only motion.
//
// States: populated (default, below) · empty (no triage to review) · loading
// (skeleton rollup + 3 ghost rows) · the flagged-emphasis state IS the default —
// the 4 red rows pinned above the routine collapse. Resolved is out of scope; the
// review frame owns the final verdict.

import { type JSX, useState } from "react";
import { Button, StatusChip } from "../../ds";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isNumber, isPlainObject } from "./payload-guard";
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
	readonly sentiment: "angry" | "frustrated" | "neutral";
	readonly subject: string;
	readonly flag: FlagKind;
	readonly flagReason: string; // the one-line WHY this needs a human
	readonly waited: string;
	// L3 context
	readonly lastMessage: string;
	readonly draftedReply: string;
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
	readonly metric: { readonly label: string; readonly before: string; readonly after: string };
	readonly flagged: readonly FlaggedItem[];
	readonly groups: readonly RoutineGroup[];
}

const FIXTURE: BatchFixture = {
	tool: "zendesk",
	title: "Overnight support triage",
	window: "00:12 – 06:48 · 6h 36m",
	total: 41,
	needsYou: 4,
	autoResolved: 18,
	drafted: 19,
	metric: { label: "Median first response", before: "9h 10m", after: "40m" },
	flagged: [
		{
			id: "f1",
			ref: "#20418",
			customer: "Maria Tan",
			account: "Northwind Apparel",
			arr: "$48,000 ARR",
			sentiment: "angry",
			subject: "Cancelling — this is the third outage this quarter",
			flag: "churn",
			flagReason: "Churn threat on $48k renewal (closes in 11 days)",
			waited: "waited 5h 12m",
			lastMessage:
				"Third outage this quarter and still no postmortem. I've already looped in our COO. If checkout isn't stable by Friday we're moving to Shopify when we renew — and that renewal is in 11 days.",
			draftedReply:
				"Maria — you're right to be frustrated, and I'm sorry. Here's exactly what happened during last night's Checkout-500 incident, the fix we shipped at 04:20, and the three guardrails we're adding this week so it can't recur. I'd like to set up 20 minutes with you and our reliability lead before your renewal — does Thursday 2pm work?",
			draftNote:
				"Held: names a renewal + competitor + exec escalation. Reply commits to a call and a postmortem — needs your sign-off before it goes to a $48k account.",
		},
		{
			id: "f2",
			ref: "#20431",
			customer: "Devin Okafor",
			account: "consumer",
			arr: "",
			sentiment: "frustrated",
			subject: "Charged twice for the Pro upgrade",
			flag: "authority",
			flagReason: "Refund $180.00 exceeds the $50 auto-approve limit",
			waited: "waited 3h 41m",
			lastMessage:
				"I was billed $90 twice for the same Pro upgrade on June 14. I only ever clicked once. Please refund one of them.",
			draftedReply:
				"Devin — confirmed: two identical $90 charges on June 14 (ch_3Pk2 and ch_3Pk9) for one upgrade. The second is a duplicate. I'll refund $180.00 to your card ending 4242 — it'll land in 5–7 business days.",
			draftNote:
				"Held: $180.00 refund is above the $50 limit agents may issue without approval. Charges verified as duplicate; approve to release the refund.",
		},
		{
			id: "f3",
			ref: "#20407",
			customer: "Priya Raman",
			account: "Lumen Health",
			arr: "$12,500 ARR",
			sentiment: "neutral",
			subject: "Does the API retain PHI after a delete call?",
			flag: "accuracy",
			flagReason: "Compliance claim — answer not found in the knowledge base",
			waited: "waited 4h 30m",
			lastMessage:
				"For our HIPAA review: when we call DELETE /records/:id, is the PHI purged immediately or retained in backups, and for how long?",
			draftedReply:
				"Deletes are processed immediately and PHI is purged from primary storage. Encrypted backups roll off on a 30-day cycle, after which the data is unrecoverable.",
			draftNote:
				"Held: stated retention window isn't sourced in the KB and this is a compliance answer. Confirm the backup-retention figure with engineering before sending.",
		},
		{
			id: "f4",
			ref: "#20395",
			customer: "Sam Whitlock",
			account: "Atlas Freight",
			arr: "$31,000 ARR",
			sentiment: "frustrated",
			subject: "Considering legal action over the SLA breach",
			flag: "legal",
			flagReason: "Customer mentions legal action — route to a human",
			waited: "waited 6h 02m",
			lastMessage:
				"We had 14 hours of downtime against a 99.9% SLA. Our counsel is reviewing the contract. What credit are you offering, and don't tell me it's the standard 10%.",
			draftedReply: "",
			draftNote:
				"Held with no draft: legal language present. Policy routes any mention of counsel / legal action straight to you — no automated reply.",
		},
	],
	groups: [
		{
			id: "g-auto",
			label: "Auto-resolved",
			detail: "Checkout-500 incident · root cause shipped 04:20",
			count: 18,
			sample: ["#20420", "#20422", "#20425", "#20429", "#20433", "#20437"],
		},
		{
			id: "g-draft",
			label: "Drafted — routine, ready to send",
			detail: "password resets · invoice copies · plan questions",
			count: 19,
			sample: ["#20402", "#20409", "#20414", "#20419", "#20424", "#20428"],
		},
	],
};

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
	return (
		<span
			className="type-label inline-flex items-center gap-[6px] px-[8px] py-[2px] rounded-[var(--r-pill)]   uppercase   whitespace-nowrap shrink-0 bg-[color-mix(in_oklab,var(--status-error)_14%,transparent)] text-[var(--status-error)]"
			title={FLAG_LABEL[kind]}
		>
			<span className="h-[6px] w-[6px] rounded-[var(--r-pill)] shrink-0 bg-[var(--status-error)]" />
			{FLAG_LABEL[kind]}
		</span>
	);
}

const SENTIMENT_LABEL: Record<FlaggedItem["sentiment"], string> = {
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
	readonly batch?: BatchFixture;
	/** which flagged item starts expanded (L3). Default: the first. */
	readonly initialExpandedId?: string;
}

function ReviewBatchView({
	batch = FIXTURE,
	initialExpandedId = FIXTURE.flagged[0]?.id,
}: ReviewBatchProps): JSX.Element {
	const [expandedId, setExpandedId] = useState<string | undefined>(initialExpandedId);
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

				{/* the win — one calm line of impact */}
				<div className="border-width-thin-t flex items-center gap-[9px] px-[18px] py-[9px]  border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--status-success)_6%,transparent)]">
					<span className="h-[6px] w-[6px] rounded-[var(--r-pill)] bg-[var(--status-success)] shrink-0" />
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
			</section>

			{/* batch verdict — clear the routine 37 in one tap, leave the 4 for judgment */}
			<div className="flex items-center justify-between gap-[12px] mt-[12px] mb-[6px] px-[3px]">
				<span className="type-label   uppercase  text-[var(--text-tertiary)]">
					{batch.needsYou} flagged · {routineCount} routine
				</span>
				<Button variant="secondary" size="sm">
					Approve all except flagged ({routineCount})
				</Button>
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
									className="w-full flex items-center gap-[12px] px-[15px] py-[12px] text-left cursor-pointer hover:bg-[var(--surface-page)]   "
								>
									{/* left edge: priority index */}
									<span className="type-metadata flex items-center justify-center h-[22px] w-[22px] shrink-0 rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--status-error)_12%,transparent)]   tabular-nums text-[var(--status-error)]">
										{i + 1}
									</span>

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
											<span className="type-metadata  text-[var(--text-tertiary)] shrink-0">
												· {SENTIMENT_LABEL[item.sentiment]}
											</span>
										</div>
										<span className="type-small  text-[var(--text-secondary)] truncate">
											{item.ref} · {item.flagReason}
										</span>
									</div>

									<div className="flex items-center gap-[9px] shrink-0">
										<span className="type-metadata  text-[var(--text-tertiary)] tabular-nums hidden sm:inline">
											{item.waited}
										</span>
										<FlagPill kind={item.flag} />
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
													<span className="type-metadata h-[16px] w-[16px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)]   inline-flex items-center justify-center shrink-0">
														AI
													</span>
													<span className="type-metadata   text-[var(--text-secondary)]">
														Drafted reply — held for review
													</span>
												</div>
												<p className="type-small px-[12px] py-[12px]   text-[var(--text-primary)]">
													{item.draftedReply}
												</p>
											</div>
										) : (
											<div className="border-width-thin type-small rounded-[var(--r-subtle)]  border-dashed border-[var(--border-default)] px-[12px] py-[9px]  text-[var(--text-tertiary)] italic">
												No reply drafted — policy routes this straight to you.
											</div>
										)}

										{/* why the agent held — framed explanation, not just a red box */}
										<div className="flex flex-col gap-[6px] rounded-[var(--r-subtle)]  border-[var(--status-error)] bg-[color-mix(in_oklab,var(--status-error)_8%,transparent)] px-[12px] py-[9px]">
											<div className="flex items-center gap-[6px]">
												<span
													aria-hidden="true"
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

										{/* per-item verdict — Approve / Edit / Hold */}
										<div className="flex items-center gap-[9px]">
											<Button variant="primary" size="sm">
												{item.draftedReply ? "Approve & send" : "Take over"}
											</Button>
											{item.draftedReply ? (
												<Button variant="secondary" size="sm">
													Edit
												</Button>
											) : null}
											<Button variant="ghost" size="sm">
												Hold
											</Button>
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
									className="w-full flex items-center gap-[12px] px-[15px] py-[9px] text-left cursor-pointer hover:bg-[var(--surface-page)]   "
								>
									<span className="type-metadata flex items-center justify-center h-[22px] min-w-[22px] px-[6px] shrink-0 rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--text-tertiary)_12%,transparent)]   tabular-nums text-[var(--text-secondary)]">
										{g.count}
									</span>
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

// AL2 — review artifact wrapper.
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
	const flagged: FlaggedItem[] = payload.flagged.map((item) => ({
		id: item.id,
		ref: item.ref,
		customer: item.ref,
		account: "",
		arr: "",
		sentiment: "neutral",
		subject: item.reason,
		flag: "churn",
		flagReason: item.reason,
		waited: "",
		lastMessage: "",
		draftedReply: "",
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
		metric: { label: "Median first response", before: "", after: "" },
		flagged,
		groups,
	};
}

export function ReviewBatch({ artifact }: ReviewCanvasProps): JSX.Element {
	const batch = isBatchPayload(artifact.payload) ? mapBatchPayload(artifact.payload) : FIXTURE;
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
