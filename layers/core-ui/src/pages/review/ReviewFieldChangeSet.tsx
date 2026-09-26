// Canvas #2 — ReviewFieldChangeSet.
//
// Proof family: record/field change-set (a CRM record write). Tool: Salesforce.
// The signature is a before→after FIELD GRID with approve-per-field.
//
// 3-layer LAYERING (brief §1):
//   L1 — one-glance header: "1 record · 5 fields changed · 1 needs you" + the
//        Salesforce mini-logo + the record identity (Northwind — Opportunity).
//   L2 — the proof: a before→after field grid. Each changed row reads
//        old (strikethrough/dim) → new (highlighted). Unchanged fields collapse
//        under "+12 unchanged". Relevance-ordered: the needs-you field floats up.
//   L3 — on demand: per-field source line ("from the Jun 12 discovery call").
//        The Amount row carries a needs-you flag.
//
// Presentational isolation: local useState for expand.
// Hearth tokens by NAME only (no hex outside ToolLogo). 6px grid. Pill
// buttons. Left-aligned. tabular-nums on money. Animate transform/opacity only.
//
// States: populated (default, this story) · empty (no changed fields → nothing to
// review) · loading (skeleton rows) · needs-you emphasis (the Amount row, amber).
// Resolved is out of scope — the review frame owns the final verdict.

import { type JSX, useState } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject, isString } from "./payload-guard";
import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
import type { FieldChangeSetPayload, ReviewCanvasProps } from "./review-artifact";
import { ToolLogo } from "./ToolLogo";

// ── Fixture ──────────────────────────────────────────────────────────────────

type FieldKind = "value" | "added";

interface FieldChange {
	readonly id: string;
	readonly label: string;
	readonly kind: FieldKind;
	/** prior value; null when the field had none (— → new). */
	readonly before: string | null;
	readonly after: string;
	/** L3: where the new value came from (provenance line). */
	readonly source: string;
	/** needs-you flag — floats this row up + paints it amber. */
	readonly needsYou?: string;
}

interface ChangeSet {
	/** Widened from the literal `"salesforce"` — an agent-supplied payload has
	 * no tool concept of its own; this carries the real `artifact.tool` so the
	 * per-field provenance mark is honest. */
	readonly tool: string;
	readonly record: string;
	readonly changed: readonly FieldChange[];
	readonly unchangedCount: number;
}

// ── Atoms ──────────────────────────────────────────────────────────────────────

function MoneyOrText({ text, money }: { text: string; money: boolean }): JSX.Element {
	return <span style={money ? { fontVariantNumeric: "tabular-nums" } : undefined}>{text}</span>;
}

const isMoney = (s: string | null): boolean => s?.trim().startsWith("$") ?? false;

// ── Row ────────────────────────────────────────────────────────────────────────

interface RowProps {
	readonly field: FieldChange;
	readonly tool: string;
	readonly expanded: boolean;
	readonly onToggleExpand: (id: string) => void;
}

function FieldRow({ field, tool, expanded, onToggleExpand }: RowProps): JSX.Element {
	const needs = field.needsYou != null;
	const money = isMoney(field.after) || isMoney(field.before);

	return (
		<div
			className="border-width-thin-b border-none  border-[var(--border-subtle)] "
			style={needs ? { background: "var(--accent-secondary-dim)" } : undefined}
		>
			{/* L2 — the before→after row */}
			<div className="flex items-start gap-[12px] px-[18px] py-[12px]">
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline gap-[9px]">
						<span className="type-metadata w-[96px] shrink-0   text-[var(--text-tertiary)]">
							{field.label}
						</span>

						<div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-[9px] gap-y-[3px]">
							{field.kind === "added" ? (
								<span className="type-small  text-[var(--status-success)]">+ added</span>
							) : field.before != null ? (
								<span className="type-small  text-[var(--text-tertiary)] line-through decoration-[var(--border-strong)]">
									<MoneyOrText text={field.before} money={money} />
								</span>
							) : (
								<span className="type-small  text-[var(--text-tertiary)]">—</span>
							)}

							<span aria-hidden className="type-metadata  text-[var(--text-tertiary)]">
								→
							</span>

							<span
								className="type-copy rounded-[var(--r-subtle)] px-[6px] py-[3px]   text-[var(--text-primary)]"
								style={{ background: "var(--accent-secondary-dim)" }}
							>
								<MoneyOrText text={field.after} money={money} />
							</span>

							{needs ? (
								<span
									className="type-metadata rounded-[var(--r-pill)] px-[9px] py-[3px]  "
									style={{
										background: "var(--accent-secondary-dim)",
										color: "var(--status-warning)",
									}}
								>
									needs you
								</span>
							) : null}
						</div>

						<button
							type="button"
							onClick={() => onToggleExpand(field.id)}
							aria-expanded={expanded}
							className="type-control shrink-0 rounded-[var(--r-pill)] px-[9px] py-[3px]   text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						>
							{expanded ? "Hide source" : "Source"}
						</button>
					</div>

					{/* L3 — per-field provenance + needs-you detail, on demand */}
					{expanded ? (
						<div
							data-spacing-role="coordinate"
							className="mt-[9px] ml-[105px] flex flex-col gap-[6px]"
						>
							<div className="type-metadata flex items-center gap-[6px]  text-[var(--text-secondary)]">
								<ToolLogo tool={tool} size="sm" label="" />
								<span>{field.source}</span>
							</div>
							{needs ? (
								<div
									className="type-metadata rounded-[var(--r-subtle)] px-[9px] py-[6px] "
									style={{
										background: "var(--accent-secondary-dim)",
										color: "var(--status-warning)",
									}}
								>
									{field.needsYou}
								</div>
							) : null}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

// ── Canvas ───────────────────────────────────────────────────────────────────

export interface ReviewFieldChangeSetProps {
	readonly changeSet: ChangeSet;
	/** id of the field expanded by default (so L3 shows in a static render). */
	readonly defaultExpandedId?: string;
}

export function ReviewFieldChangeSetView({
	changeSet,
	defaultExpandedId,
}: ReviewFieldChangeSetProps): JSX.Element {
	// relevance-ordering: needs-you field floats to the top, rest keep authored order.
	const ordered = [...changeSet.changed].sort(
		(a, b) => Number(b.needsYou != null) - Number(a.needsYou != null),
	);

	// Derived from the real payload's own top-relevance field, so the default
	// expansion is correct for any payload.
	const [expanded, setExpanded] = useState<string | null>(
		() => defaultExpandedId ?? ordered[0]?.id ?? null,
	);

	const toggleExpand = (id: string): void => setExpanded((prev) => (prev === id ? null : id));

	const needsYouCount = changeSet.changed.filter((f) => f.needsYou != null).length;

	return (
		<div
			className="border-width-thin w-[640px] overflow-hidden rounded-[var(--r-default)]  border-[var(--border-default)]"
			style={{
				background: "var(--surface-container)",
				boxShadow: "var(--shadow-default)",
			}}
		>
			{/* ── L1 — one-glance summary (tool/record now in source header) ── */}
			<div className="border-width-thin-b  border-[var(--border-default)] px-[18px] py-[12px]">
				<div className="min-w-0 flex-1">
					<div className="type-small flex flex-wrap items-center gap-[6px]  text-[var(--text-secondary)]">
						<span>1 record</span>
						<span aria-hidden className="text-[var(--text-tertiary)]">
							·
						</span>
						<span>{changeSet.changed.length} fields changed</span>
						<span aria-hidden className="text-[var(--text-tertiary)]">
							·
						</span>
						<span
							className="type-metadata rounded-[var(--r-pill)] px-[6px] py-[3px]  "
							style={{
								background: "var(--accent-secondary-dim)",
								color: "var(--status-warning)",
							}}
						>
							{needsYouCount} needs you
						</span>
					</div>
				</div>
			</div>

			{/* ── L2 — before→after field grid (changed first, needs-you floated) ── */}
			<div>
				{ordered.map((field) => (
					<FieldRow
						key={field.id}
						field={field}
						tool={changeSet.tool}
						expanded={expanded === field.id}
						onToggleExpand={toggleExpand}
					/>
				))}
			</div>

			{/* unchanged-fields trivia line — a static count, not a disclosure:
			    `FieldChangeSetPayload` carries only the unchanged COUNT, not which
			    fields, so there is nothing to expand into. An earlier version named
			    five specific field labels here ("Owner, Lead source, Probability,
			    Type, Account") no payload ever supplied. */}
			<div
				className="type-metadata flex w-full items-center gap-[6px] px-[18px] py-[9px]   text-[var(--text-tertiary)]"
				style={{
					background: "var(--surface-page)",
				}}
			>
				<span>+{changeSet.unchangedCount} unchanged</span>
			</div>
		</div>
	);
}

// Payload mapper, then source header + view.
function isFieldChangePayload(payload: unknown): payload is FieldChangeSetPayload {
	return (
		isPlainObject(payload) &&
		isString(payload.recordLabel) &&
		Array.isArray(payload.fields) &&
		typeof payload.unchangedCount === "number"
	);
}

function mapFieldChangePayload(payload: FieldChangeSetPayload, tool: string): ChangeSet {
	return {
		tool,
		record: payload.recordLabel,
		unchangedCount: payload.unchangedCount,
		changed: payload.fields.map((field) => ({
			id: field.label.toLowerCase().replace(/\s+/g, "-"),
			label: field.label,
			kind: field.old == null ? ("added" as const) : ("value" as const),
			before: field.old,
			after: field.new,
			source: field.provenance ?? "",
			needsYou: field.needsYou,
		})),
	};
}

export function ReviewFieldChangeSet({ artifact }: ReviewCanvasProps): JSX.Element {
	if (!isFieldChangePayload(artifact.payload)) {
		// A malformed payload gets the honest unknown-canvas
		// fallback, never the Salesforce demo fixture.
		return <ReviewUnknownCanvas artifact={artifact} />;
	}
	const changeSet = mapFieldChangePayload(artifact.payload, artifact.tool);
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewFieldChangeSetView changeSet={changeSet} />
		</div>
	);
}
