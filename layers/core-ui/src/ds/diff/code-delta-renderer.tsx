// @lore: CodeDelta type is LOCAL — diff delta is review's concern; no import from @hyperidle/web or ReviewArtifact types allowed

import type { JSX, ReactNode } from "react";

interface DiffLine {
	readonly kind: "add" | "del" | "ctx";
	readonly text: string;
	readonly oldNo?: number | null;
	readonly newNo?: number | null;
}

interface DiffHunk {
	readonly header: string;
	readonly lines: readonly DiffLine[];
}

export interface CodeDelta {
	readonly file: string;
	readonly hunks: readonly DiffHunk[];
}

export interface DiffLineRef {
	readonly hunkIndex: number;
	readonly lineIndex: number;
	readonly kind: "add" | "del" | "ctx";
	readonly oldNo: number | null;
	readonly newNo: number | null;
	readonly text: string;
}

export interface CodeDeltaProps {
	readonly delta: CodeDelta;
	readonly renderLineGutter?: (ref: DiffLineRef) => ReactNode;
	readonly renderLineAffordance?: (ref: DiffLineRef) => ReactNode;
	readonly renderLineBelow?: (ref: DiffLineRef) => ReactNode;
	readonly renderTrailing?: () => ReactNode;
}

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

export function CodeDeltaRenderer({
	delta,
	renderLineGutter,
	renderLineAffordance,
	renderLineBelow,
	renderTrailing,
}: CodeDeltaProps): JSX.Element {
	return (
		// biome-ignore lint/a11y/useSemanticElements: not a form — <fieldset> doesn't apply to a read-only diff; role="group" is what makes the aria-label below (the file name, not shown anywhere else) take effect.
		<pre
			role="group"
			aria-label={`Code diff: ${delta.file}`}
			className="type-data bg-[var(--surface-container)] rounded-[var(--r-default)] overflow-x-auto    m-0"
		>
			{delta.hunks.map((hunk, hunkIndex) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a computed diff is immutable content re-rendered from scratch each time, never reordered.
				<div key={`${hunkIndex}-${hunk.header}`}>
					<div className="type-data px-[12px] py-[6px]   text-[var(--text-tertiary)] bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] select-none">
						{hunk.header}
					</div>
					<div className="type-data   ">
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
								// biome-ignore lint/suspicious/noArrayIndexKey: a computed diff is immutable content re-rendered from scratch each time, never reordered.
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
