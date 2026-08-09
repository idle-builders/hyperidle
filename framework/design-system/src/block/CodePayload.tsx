// design-lint-disable require-stories-sibling
import { type JSX, useState } from "react";

export interface CodePayloadProps {
	lang: string | null;
	text: string;
}

const COLLAPSE_THRESHOLD = 20;

export function CodePayload({ lang, text }: CodePayloadProps): JSX.Element {
	const lines = text.split("\n");
	const overflows = lines.length > COLLAPSE_THRESHOLD;
	const [expanded, setExpanded] = useState(false);
	const display = overflows && !expanded ? lines.slice(0, COLLAPSE_THRESHOLD).join("\n") : text;
	const hidden = overflows ? lines.length - COLLAPSE_THRESHOLD : 0;

	return (
		<div className="flex flex-col gap-[6px]">
			{lang ? (
				<div className="font-mono text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					{lang}
				</div>
			) : null}
			<pre className="font-mono text-[12px] leading-[1.5] bg-[var(--surface-container)] text-[var(--text-primary)] p-[12px] rounded-[var(--r-default)] overflow-x-auto m-0">
				<code style={{ tabSize: 2 }}>{display}</code>
			</pre>
			{overflows ? (
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					aria-expanded={expanded}
					className="self-start text-[12px] text-[var(--text-secondary)] underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:[outline-offset:2px] rounded-[var(--r-subtle)]"
				>
					{expanded ? "Collapse" : `Expand ${hidden} more lines`}
				</button>
			) : null}
		</div>
	);
}
