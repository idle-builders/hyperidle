// AE6 — CodeRenderer: renders code diff artifact previews.
// Maps from old kind: code_diff

import type { CodePreview } from "@hyperidle/shared";
import type { JSX } from "react";

export interface CodeRendererProps {
	preview: CodePreview | null;
	kind: string;
}

// @lore AE6: Line kind in CodePreview uses "add"/"del"/"ctx" while
// the old ArtifactView used "addition"/"deletion"/"context". Keep consistent
// with the shared CodePreview schema.
const LINE_CLASSES: Record<"add" | "del" | "ctx", string> = {
	add: "bg-success/10",
	del: "bg-error/10",
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
			<pre className="overflow-x-auto text-xs font-mono leading-[1.4]">
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
