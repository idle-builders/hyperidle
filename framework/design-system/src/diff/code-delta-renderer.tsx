// AM5 T2 — DS (code,diff) core: the generic code diff renderer.
//
// Relocated from `kinds/code-renderer.tsx` and restructured to expose a
// per-line SLOT SEAM — four render-prop callbacks that let the review chrome
// (ReviewCodeDiff) fill in its anchors/composer/threads while the DS core owns
// the diff STRUCTURE (hunk loop, line tints, data-diff-type, prefix glyph, <code>).
//
// This is the CANONICAL diff renderer for the `code` kind — used by:
//   1. `composeArtifactBody` (plain code diff, no chrome) — default (no slots)
//   2. `ReviewCodeDiff` fills the slots with its chrome JSX preserving the AL1/AL2 DOM
//
// K0 purity: no empty/error/no-changes branch — the composition owns absence.
// The "no hunks" case renders an empty <pre> without crash.
//
// K2b: this file lives in design-system/src/diff/ — a DS foundation.
// NO imports from `@hyperidle/web` or any ReviewArtifact types.
//
// Local `CodeDelta` type stays LOCAL (NOT shared) — the diff delta is review's
// concern; purifying `code.ts` to `{path,lang,text}` does NOT affect this file.

import type { JSX, ReactNode } from "react";

// ── local types — NOT from shared (the diff delta is NOT the pure code content) ──
interface DiffLine {
	readonly kind: "add" | "del" | "ctx";
	readonly text: string;
	/** old-file line number (null on pure additions). */
	readonly oldNo?: number | null;
	/** new-file line number (null on pure deletions). */
	readonly newNo?: number | null;
}

interface DiffHunk {
	readonly header: string;
	readonly lines: readonly DiffLine[];
}

/** The code delta — a diff against a file. LOCAL type, not shared. */
export interface CodeDelta {
	readonly file: string;
	readonly hunks: readonly DiffHunk[];
}

/** Reference to a specific diff line — passed to all slot callbacks. */
export interface DiffLineRef {
	readonly hunkIndex: number;
	readonly lineIndex: number;
	readonly kind: "add" | "del" | "ctx";
	/** old-file line number (null on pure additions, undefined when not provided). */
	readonly oldNo: number | null;
	/** new-file line number (null on pure deletions, undefined when not provided). */
	readonly newNo: number | null;
	readonly text: string;
}

/** Props for the CodeDeltaRenderer — the DS (code,diff) core. */
export interface CodeDeltaProps {
	readonly delta: CodeDelta;
	/** Slot: render gutter content (line numbers, affordances) before the line. */
	readonly renderLineGutter?: (ref: DiffLineRef) => ReactNode;
	/** Slot: render an affordance overlay on the line (e.g. "+" inline-comment button). */
	readonly renderLineAffordance?: (ref: DiffLineRef) => ReactNode;
	/** Slot: render content BELOW a line (e.g. InlineComposer, AnchoredThreadCard). */
	readonly renderLineBelow?: (ref: DiffLineRef) => ReactNode;
	/** Slot: render content after all hunks (e.g. orphan-thread pass). */
	readonly renderTrailing?: () => ReactNode;
}

// ── tints — same tokens as AI6 (CodeRenderer) + ReviewCodeDiff (LINE_TINT) ──────
const LINE_BG: Record<"add" | "del" | "ctx", string> = {
	add: "bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]",
	del: "bg-[color-mix(in_oklab,var(--status-error)_10%,transparent)]",
	ctx: "",
};

const LINE_PREFIX: Record<"add" | "del" | "ctx", string> = {
	add: "+",
	del: "-",
	ctx: " ",
};

/**
 * The DS `(code, diff)` core renderer.
 *
 * Renders the diff STRUCTURE (hunk headers, per-line tints, data-diff-type,
 * prefix glyph, <code> text) and exposes per-line slot callbacks for the
 * review chrome to fill in its anchors/composer/threads without any DOM change.
 *
 * No empty/error/no-changes state branch — the composition above decides those.
 *
 * @lore AM5: this is the relocated + restructured code-renderer.tsx. The slot
 * seam (renderLineGutter/renderLineAffordance/renderLineBelow/renderTrailing)
 * is what lets ReviewCodeDiff fill the DOM identically to before the extraction
 * while DS owns the structural diff rendering (K2b).
 */
export function CodeDeltaRenderer({
	delta,
	renderLineGutter,
	renderLineAffordance,
	renderLineBelow,
	renderTrailing,
}: CodeDeltaProps): JSX.Element {
	return (
		<pre
			aria-label={`Code diff: ${delta.file}`}
			className="bg-[var(--surface-container)] rounded-[var(--r-default)] overflow-x-auto text-xs font-mono leading-[1.4] m-0"
		>
			{delta.hunks.map((hunk, hunkIndex) => (
				<div key={`${hunkIndex}-${hunk.header}`}>
					<div className="px-[12px] py-[6px] font-mono text-[12px] text-[var(--text-tertiary)] bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] select-none">
						{hunk.header}
					</div>
					<div className="font-mono text-[12px] leading-[var(--leading-body)]">
						{hunk.lines.map((line, lineIndex) => {
							const ref: DiffLineRef = {
								hunkIndex,
								lineIndex,
								kind: line.kind,
								oldNo: line.oldNo ?? null,
								newNo: line.newNo ?? null,
								text: line.text,
							};
							return (
								<div key={`${hunkIndex}-${lineIndex}-${line.kind}`}>
									<div data-diff-type={line.kind} className={`relative flex ${LINE_BG[line.kind]}`}>
										{renderLineGutter?.(ref)}
										{renderLineAffordance?.(ref)}
										<span className="select-none w-[16px] shrink-0 px-[3px] text-center text-[var(--text-tertiary)]">
											{LINE_PREFIX[line.kind]}
										</span>
										<code className="flex-1 whitespace-pre pr-[12px] text-[var(--text-primary)]">
											{line.text}
										</code>
									</div>
									{renderLineBelow?.(ref)}
								</div>
							);
						})}
					</div>
				</div>
			))}
			{renderTrailing?.()}
		</pre>
	);
}
