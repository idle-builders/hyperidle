// AM5 — The shared fold / SplitView primitive (the open presentation).
//
// Design embodiment ONLY (a story that renders). The fold is the ONE net-new
// container shape AM5 requires.
//
// EXTRACTED, not reinvented. Two real splits ship today; this primitive is the
// GENERALIZATION of the more established one:
//   • chat  — Conversations.tsx (~447-505): a PROPORTIONAL `flex-row` split,
//     origin `flex-[3] … border-r border-[var(--border-subtle)]`, destination
//     `flex-[2]`, close button inside the destination panel. Used TWICE (dial-in
//     + opened-session). This is the canonical base — a real ratio split with a
//     SINGLE clean separator (the origin's `border-r`).
//   • review — ReviewComposition.tsx (~644): `ExaminePane`, a FIXED `w-[620px]`
//     aside with `border-l`. Not proportional, does not generalize to a draggable
//     ratio. It converges onto this primitive (drops fixed-620 + border-l, keeps
//     content + Esc-close).
//
// So SplitView = chat's `flex-row` proportional split, generalized to a
// content-agnostic `origin | seam | destination`, rendered as two sibling pane
// surfaces directly in the layout's space. The gap is the resize target; there
// is no enclosing card, inner canvas, or visible divider.
//
// Founder surface fix:
//   • The split reads as two separate elevated rounded panes, with no outer card.
//   • The transparent `--space-3` gap is an invisible draggable resize target.
//   • Icon mode-controls KEPT, floated top-right over the destination card.
//
// Founder round-2 fixes (still in effect):
//   • Even panes, no stray separator above a pane — controls float top-right.
//   • Mode controls are ICON-based, not text.
//   • Controls are CONTEXTUAL: expand lives on the destination card and only in
//     `split`; in `full` the only control is collapse-back-to-split.
//
// NB: the existing DS `Fold.tsx` is an unrelated disclosure ("Show") component —
// name collision the architect resolves (SplitView vs Fold, open question O7).
//
// Scoped to JUST the container per the design brief: placeholder labelled boxes,
// NOT real ConversationSurface / SessionViewPanel / ExaminePane content (those
// have their own stories; the fold is content-agnostic and authors no renderer).
//
// Presentational — props in, drag state is local UI state, callbacks are noops.
// Production wiring (persistence of dividerRatio, where it mounts, reconciling
// chat+review onto it) is the architect's / builder's job.

import { type JSX, useState } from "react";
import { type FoldMode, SplitView } from "./SplitView.js";

export default { title: "SplitView", group: "System" as const };

// Placeholder slot content — labelled boxes, NOT real renderers (fold is content-agnostic).
function Pane({ label, tone }: { label: string; tone: "origin" | "dest" }): JSX.Element {
	return (
		<div className="flex h-full flex-col gap-[6px] p-[18px]">
			<div className="font-mono text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				{tone === "origin"
					? "origin surface (stays live)"
					: "destination — the resolved composition"}
			</div>
			<div className="flex flex-1 items-center justify-center rounded-[var(--r-subtle)] border border-dashed border-[var(--border-default)] bg-[var(--surface-container)] text-center text-[13px] text-[var(--text-secondary)]">
				{label}
			</div>
		</div>
	);
}

const FRAME = "h-[420px] w-[760px]";

// split — origin + destination side by side, divider draggable. The default mode.
export const Split = (): JSX.Element => {
	const [mode, setMode] = useState<FoldMode>("split");
	const [ratio, setRatio] = useState(0.5);
	return (
		<div className={FRAME}>
			<SplitView
				mode={mode}
				dividerRatio={ratio}
				onModeChange={setMode}
				onRatioChange={setRatio}
				origin={<Pane tone="origin" label="conversation / review / document" />}
				destination={<Pane tone="dest" label="artifact (single) · review (diff) · body (mixed)" />}
			/>
		</div>
	);
};

// full — destination fills the surface (origin collapsed, resumable). The only
// control is collapse-back-to-split — no "fold to split" when already full.
export const Full = (): JSX.Element => {
	const [mode, setMode] = useState<FoldMode>("full");
	return (
		<div className={FRAME}>
			<SplitView
				mode={mode}
				dividerRatio={0.5}
				onModeChange={setMode}
				origin={<Pane tone="origin" label="origin (collapsed)" />}
				destination={<Pane tone="dest" label="full-page open = fully folded-forward" />}
			/>
		</div>
	);
};

// fold-back — origin whole, no destination.
export const FoldBack = (): JSX.Element => (
	<div className={FRAME}>
		<SplitView
			mode="fold-back"
			dividerRatio={0.5}
			origin={<Pane tone="origin" label="origin surface — nothing open" />}
			destination={<Pane tone="dest" label="(closed)" />}
		/>
	</div>
);
