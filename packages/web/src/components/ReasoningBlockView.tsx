import { type JSX, useState } from "react";

export interface ReasoningBlockProps {
	/** Ordered reasoning steps to render inside the disclosure panel. */
	steps: string[];
	/** Start open instead of collapsed. @default false */
	defaultOpen?: boolean;
}

/**
 * @lore J4 AC: collapsible reasoning panel shown before the artifact in every
 * review. Renders Message.reasoning[] as a numbered list. Collapsed by default
 * per spec. Returns null for empty steps — caller may always pass the array
 * without checking.
 */
export function ReasoningBlockView({
	steps,
	defaultOpen = false,
}: ReasoningBlockProps): JSX.Element | null {
	const [open, setOpen] = useState<boolean>(defaultOpen);
	if (steps.length === 0) return null;
	const count = steps.length;
	const countLabel = `${count} ${count === 1 ? "step" : "steps"}`;
	const panelId = "reasoning-block-panel";
	return (
		<section className="border-b border-[var(--border-subtle)] bg-[var(--surface-container)]">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				aria-label={`Reasoning (${countLabel})`}
				onClick={() => setOpen((p) => !p)}
				className="flex items-center gap-2 w-full text-left px-3 py-1 text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
			>
				<span aria-hidden="true">{open ? "v" : ">"}</span>
				<span>Reasoning</span>
				<span className="badge badge-ghost badge-xs ml-auto font-mono normal-case">
					{countLabel}
				</span>
			</button>
			{open && (
				<ol
					id={panelId}
					aria-label="Reasoning steps"
					className="list-decimal list-inside px-5 pb-2 text-sm leading-5 text-[var(--text-secondary)] flex flex-col gap-1"
				>
					{steps.map((step, i) => (
						<li key={`step-${i}-${step.slice(0, 16)}`}>{step}</li>
					))}
				</ol>
			)}
		</section>
	);
}
