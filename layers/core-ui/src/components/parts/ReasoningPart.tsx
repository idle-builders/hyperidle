/**
 * AM3 — ReasoningPart renderer: a span of agent thinking.
 *
 * Collapsed by default to "Thought for Ns" (italic, tertiary).
 * Expands to quiet/muted prose under a left rule.
 * No status glyph — reasoning is never success/failure.
 *
 * @lore AM3: The `reasoning` Part kind is distinct from `prose` because it
 * carries a structural `durationMs` the renderer needs for the resting label,
 * and must render visually quieter than answer prose — a renderer concern that
 * belongs in dispatch, not in ad-hoc wrapping (concept Phase 4 decision).
 */

import type { Part } from "@hyperidle/conversation-parts";
import { type JSX, useState } from "react";

type ReasoningPartShape = Extract<Part, { kind: "reasoning" }>;

export function ReasoningPart({ part }: { part: ReasoningPartShape }): JSX.Element {
	const [open, setOpen] = useState(false);
	const secs = Math.round(part.durationMs / 1000);
	const label = secs >= 1 ? `Thought for ${secs}s` : "Thinking…";

	return (
		<div data-ds-component="ReasoningPart">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="type-control inline-flex items-center gap-[6px] py-[3px]   text-[var(--text-tertiary)]   hover:text-[var(--text-secondary)]"
			>
				{/* brain/thought icon */}
				<svg viewBox="0 0 16 16" className="h-[12px] w-[12px] shrink-0" aria-hidden="true">
					<path
						d="M5 13a3 3 0 01-1-5.8A3.5 3.5 0 0111 5a2.5 2.5 0 011 4.8"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<span className="italic">{label}</span>
				<svg
					viewBox="0 0 12 12"
					className="motion-move h-[10px] w-[10px] shrink-0 text-[var(--text-tertiary)]  "
					style={{ transform: open ? "rotate(90deg)" : "none" }}
					aria-hidden="true"
				>
					<path
						d="M4 2.5 L8 6 L4 9.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{open ? (
				<p className="border-s-[var(--bw-thin)] type-small ms-[18px] mt-[3px]  border-[var(--border-subtle)] ps-[12px]  italic  text-[var(--text-tertiary)]">
					{part.text}
				</p>
			) : null}
		</div>
	);
}
