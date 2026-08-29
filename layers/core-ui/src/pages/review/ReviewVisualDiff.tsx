// AL1 review canvas #6 — ReviewVisualDiff: the visual before→after canvas.
//
// Proof family: visual before→after (a design frame vs the implemented screen).
// Real content reaches this canvas as the labels an agent's `VisualDiffPayload`
// actually supplies — a before/after source label each, plus a list of
// differing regions.
//
// 3-layer drill-down (the signature):
//   L1  one glance  — "{count} regions differ" + "{before} → {after}".
//   L2  the proof   — before/after evidence panes with a compare-mode toggle
//       (Side-by-side · Overlay · Swipe).
//   L3  on demand   — the differing regions listed as chips; clicking one flags it.
//
// @lore BA2 T4e-b / founder ruling 17: this canvas used to fill BOTH evidence
// panes, in every compare mode, with a hand-drawn fake signup screen ("Create
// your account", an email field placeholdered "you@company.com", a "Create
// account" CTA) plus a hardcoded Figma mark — for every payload, regardless of
// what was actually under review. `VisualDiffPayload` carries labels only, no
// image data, so there was never anything real to put there; the fake screen
// was pure invention (ruling 14) and is deleted outright, not guarded. Per
// ruling 13, real visual content belongs to the `image` artifact kind; until a
// payload carries one, the honest behavior is to say so — the same rule every
// other canvas in this family already follows (ruling 14, §2.8.2 D).
//
// Chrome tokens are Hearth/CP1 by NAME (var(--token)). No hex anywhere in this
// surface — the tool mark that used to live inside the evidence panes is gone;
// tool identity is shown once, in `CanvasSourceHeader`.
//
// States: populated (default, story) — panes always read "No rendered image
// supplied" because no payload observed so far carries image data.

import { type JSX, useState } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject, isString } from "./payload-guard";
import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
import type { ReviewCanvasProps, VisualDiffPayload } from "./review-artifact";

// ── View model ─────────────────────────────────────────────────────────────
// A region the diff flags — id + label only, both payload-supplied.
// `VisualDiffPayload` has no real severity, band, or per-region design/build
// description; the earlier version invented all three to drive highlighting
// on the fake screen deleted above. Nothing here goes beyond what the payload
// actually names.

interface DiffRegion {
	readonly id: string;
	readonly label: string;
}

interface VisualDiff {
	readonly before: string;
	readonly after: string;
	readonly regions: readonly DiffRegion[];
}

type CompareMode = "side" | "overlay" | "swipe";

const MODES: readonly { readonly id: CompareMode; readonly label: string }[] = [
	{ id: "side", label: "Side-by-side" },
	{ id: "overlay", label: "Overlay" },
	{ id: "swipe", label: "Swipe" },
];

// ── Evidence pane ──────────────────────────────────────────────────────────
// No mocked screen: the payload carries labels, not images. An honest absence
// stands in until a real `image` artifact reaches this canvas (ruling 13).

function NoImagePane(): JSX.Element {
	return (
		<div
			className="border-width-thin flex items-center justify-center  border-[var(--border-default)] bg-[var(--surface-page)] p-[36px]"
			style={{ borderRadius: "var(--r-default)" }}
		>
			<span className="type-metadata  text-[var(--text-tertiary)]">No rendered image supplied</span>
		</div>
	);
}

// A labelled render pane (used at-size in L2). Carries which side it is + its source label.
function RenderPane({
	variant,
	source,
}: {
	readonly variant: "design" | "build";
	readonly source: string;
}): JSX.Element {
	const isDesign = variant === "design";
	return (
		<div className="flex flex-col gap-[6px]">
			<div className="flex items-center gap-[6px]">
				<span className="type-label   uppercase  text-[var(--text-secondary)]">
					{isDesign ? "Design" : "Build"}
				</span>
				<span className="type-metadata  text-[var(--text-tertiary)] truncate">{source}</span>
			</div>
			<NoImagePane />
		</div>
	);
}

export interface ReviewVisualDiffProps {
	readonly diff: VisualDiff;
	readonly onApprove?: () => void;
	readonly onFlag?: (region: string) => void;
}

function ReviewVisualDiffView({ diff, onFlag }: ReviewVisualDiffProps): JSX.Element {
	const [mode, setMode] = useState<CompareMode>("side");
	const [selected, setSelected] = useState<string | null>(null);
	// overlay opacity (design under, build over); swipe split position.
	const [overlay, setOverlay] = useState<number>(50);

	const count = diff.regions.length;

	function pick(id: string): void {
		setSelected((cur) => (cur === id ? null : id));
		onFlag?.(id);
	}

	return (
		<section
			className="border-width-thin flex flex-col  border-[var(--border-subtle)] bg-[var(--surface-container)]"
			style={{
				borderRadius: "var(--r-default)",
				boxShadow: "var(--shadow-default)",
				maxWidth: 760,
			}}
		>
			<div className="flex flex-col gap-[12px] p-[18px]">
				{/* ── L1: one-glance summary (tool/title now in source header) ── */}
				<header className="flex items-center gap-[6px]">
					<span
						data-spacing-role="compact-pill"
						className="type-metadata inline-flex items-center gap-[4px] px-[9px] py-[3px]   text-[var(--status-warning)]"
						style={{ background: "var(--accent-secondary-dim)", borderRadius: "var(--r-pill)" }}
					>
						{count} regions differ
					</span>
					<span className="type-metadata  text-[var(--text-tertiary)] truncate">
						{diff.before} → {diff.after}
					</span>
				</header>

				{/* ── L2: at-size compare + mode toggle ── */}
				<div className="flex items-center gap-[6px]">
					<div
						className="border-width-thin inline-flex gap-[3px]  border-[var(--border-subtle)] bg-[var(--surface-page)] p-[3px]"
						style={{ borderRadius: "var(--r-pill)" }}
						role="tablist"
						aria-label="Compare mode"
					>
						{MODES.map((m) => {
							const on = m.id === mode;
							return (
								<button
									key={m.id}
									type="button"
									role="tab"
									aria-selected={on}
									onClick={() => setMode(m.id)}
									className="type-control px-[12px] py-[6px]     "
									style={{
										borderRadius: "var(--r-pill)",
										background: on ? "var(--accent-primary)" : "transparent",
										color: on ? "var(--text-on-accent)" : "var(--text-secondary)",
									}}
								>
									{m.label}
								</button>
							);
						})}
					</div>
					{mode === "overlay" || mode === "swipe" ? (
						<label className="type-metadata flex items-center gap-[6px]  text-[var(--text-tertiary)]">
							{mode === "overlay" ? "Build opacity" : "Reveal"}
							<input
								type="range"
								min={0}
								max={100}
								value={overlay}
								onChange={(e) => setOverlay(Number(e.target.value))}
								className="range range-xs w-[120px]"
								aria-label={mode === "overlay" ? "Build opacity" : "Swipe reveal"}
							/>
						</label>
					) : null}
				</div>

				{mode === "side" ? (
					<div className="grid grid-cols-2 gap-[12px]">
						<RenderPane variant="design" source={diff.before} />
						<RenderPane variant="build" source={diff.after} />
					</div>
				) : (
					<div className="flex flex-col gap-[6px]">
						<span className="type-label   uppercase  text-[var(--text-secondary)]">
							Design under · Build over
						</span>
						{/* overlay = build pane stacked over design at `overlay`% opacity.
					    swipe   = build pane clipped to the left `overlay`% (a wipe). Both
					    panes are the same honest-absence block, so the effect only ever
					    shows one absence message under/over another — the correct,
					    non-fabricated result when neither side has an image. */}
						<div className="relative">
							<NoImagePane />
							<div
								className="absolute inset-0"
								style={
									mode === "overlay"
										? { opacity: overlay / 100 }
										: { clipPath: `inset(0 ${100 - overlay}% 0 0)` }
								}
							>
								<NoImagePane />
							</div>
							{mode === "swipe" ? (
								<div
									className="pointer-events-none absolute inset-y-0 w-[3px] bg-[var(--accent-primary)]"
									style={{ left: `${overlay}%` }}
									aria-hidden="true"
								/>
							) : null}
						</div>
					</div>
				)}

				{/* ── L3: flagged regions (click to flag) ── */}
				<div className="flex flex-col gap-[6px]">
					<div className="type-label   uppercase  text-[var(--text-tertiary)]">
						Differing regions
					</div>
					<div className="flex flex-wrap gap-[6px]">
						{diff.regions.map((r) => {
							const on = r.id === selected;
							return (
								<button
									key={r.id}
									type="button"
									aria-pressed={on}
									onClick={() => pick(r.id)}
									className="border-width-thin px-[12px] py-[6px] text-left   "
									style={{
										borderRadius: "var(--r-subtle)",
										borderColor: on ? "var(--accent-primary)" : "var(--border-default)",
										background: on ? "var(--accent-primary-dim)" : "var(--surface-page)",
									}}
								>
									<span className="type-metadata  text-[var(--text-primary)]">{r.label}</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}

// AL2 — review artifact wrapper.
function isVisualDiffPayload(payload: unknown): payload is VisualDiffPayload {
	return (
		isPlainObject(payload) &&
		isPlainObject(payload.before) &&
		isString((payload.before as Record<string, unknown>).label) &&
		isPlainObject(payload.after) &&
		isString((payload.after as Record<string, unknown>).label) &&
		Array.isArray(payload.diffRegions)
	);
}

function mapVisualPayload(payload: VisualDiffPayload): VisualDiff {
	return {
		before: payload.before.label,
		after: payload.after.label,
		regions: payload.diffRegions
			.filter(
				(r): r is { readonly id: string; readonly label: string } =>
					isPlainObject(r) && isString(r.id) && isString(r.label),
			)
			.map((r) => ({ id: r.id, label: r.label })),
	};
}

export function ReviewVisualDiff({ artifact }: ReviewCanvasProps): JSX.Element {
	if (!isVisualDiffPayload(artifact.payload)) {
		// BA2 T4e-b (ruling 14): a malformed payload gets the honest unknown-canvas
		// fallback, never a fabricated signup screen.
		return <ReviewUnknownCanvas artifact={artifact} />;
	}
	const diff = mapVisualPayload(artifact.payload);
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewVisualDiffView diff={diff} />
		</div>
	);
}
