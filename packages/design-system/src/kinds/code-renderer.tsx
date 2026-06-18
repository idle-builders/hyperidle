// AE6 — CodeRenderer: renders code diff artifact previews.
// Maps from old kind: code_diff

import type { JSX } from "react";

type DiffLine = {
	kind: "add" | "del" | "ctx";
	text: string;
};

type DiffHunk = {
	header: string;
	lines: DiffLine[];
};

type CodePreview = {
	kind: "code";
	file: string;
	hunks: DiffHunk[];
};

export interface CodeRendererProps {
	preview: CodePreview | null;
	kind: string;
}

// @lore AE6: Line kind in CodePreview uses "add"/"del"/"ctx" while
// the old ArtifactView used "addition"/"deletion"/"context". Keep consistent
// with the shared CodePreview schema.
// @lore AI6: Replaced undefined bg-success/10 and bg-error/10 opacity utilities
// (not defined in Hearth's Tailwind config — would silently render as nothing)
// with color-mix equivalents. Container now matches block/CodePayload chrome:
// bg-surface-container + rounded-r-default + p-12.
const LINE_CLASSES: Record<"add" | "del" | "ctx", string> = {
	add: "bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]",
	del: "bg-[color-mix(in_oklab,var(--status-error)_10%,transparent)]",
	ctx: "",
};

const LINE_PREFIX: Record<"add" | "del" | "ctx", string> = {
	add: "+",
	del: "-",
	ctx: " ",
};

export function CodeRenderer({ preview }: CodeRendererProps): JSX.Element {
	if (!preview) {
		return <p className="text-sm text-[var(--text-tertiary)] italic">No diff available.</p>;
	}

	if (preview.hunks.length === 0) {
		return (
			<section aria-label="Code diff">
				<p className="text-sm text-[var(--text-tertiary)] italic">No diff available.</p>
			</section>
		);
	}

	return (
		<section aria-label="Code diff">
			<p className="text-xs font-mono text-[var(--text-secondary)] mb-2">{preview.file}</p>
			<pre className="bg-[var(--surface-container)] rounded-[var(--r-default)] p-[12px] overflow-x-auto text-xs font-mono leading-[1.4] m-0">
				{preview.hunks.map((hunk) => (
					<div key={hunk.header}>
						<div className="text-[var(--text-tertiary)] select-none px-2 py-1">{hunk.header}</div>
						{hunk.lines.map((line, li) => (
							<div
								key={`${hunk.header}-${li}-${line.kind}`}
								data-diff-type={line.kind}
								className={`px-2 py-[3px] ${LINE_CLASSES[line.kind]}`}
							>
								<span className="select-none text-[var(--text-tertiary)] mr-2">
									{LINE_PREFIX[line.kind]}
								</span>
								<code>{line.text}</code>
							</div>
						))}
					</div>
				))}
			</pre>
		</section>
	);
}
