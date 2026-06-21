/**
 * AM1 — QuestionnairePart: an agent "quick ask" survey.
 *
 * Options read as EVEN / NEUTRAL choices — no biased/recommended styling (W2:
 * the source `QuestionnairePayload.options` is flat strings with no per-option
 * metadata, so no "Recommended" tag is rendered in AM1). Prominence comes from
 * layering (elevated surface + shadow), never from an accent border or biasing
 * one answer.
 */

import type { Part } from "@hyperidle/shared";
import { type JSX, useState } from "react";

type QuestionnairePartValue = Extract<Part, { kind: "questionnaire" }>;

const ICON_QUESTION =
	"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a2.4 2.4 0 012.4 2.4c0 1-.6 1.5-1.3 2-.5.35-.6.55-.6 1.1H6.9c0-1 .3-1.5 1-2 .5-.36.8-.6.8-1.1a.9.9 0 00-1.8 0H5.6A2.4 2.4 0 018 4zm-.05 7.4a.95.95 0 110-1.9.95.95 0 010 1.9z";

export function QuestionnairePart({ part }: { part: QuestionnairePartValue }): JSX.Element {
	// UI-local selection — answering is not wired to a backend in AM1; the
	// selection is a visual affordance only (the option reads + behaves as a
	// real button, with a quiet selected state).
	const [selected, setSelected] = useState<string | null>(null);
	return (
		<div
			data-ds-component="QuestionnairePart"
			className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[18px] py-[12px] shadow-[var(--shadow-default)]"
		>
			<div className="flex items-start gap-[9px]">
				<span
					aria-label="Quick ask"
					title="Quick ask"
					className="mt-[1px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
				>
					<svg
						viewBox="0 0 16 16"
						fill="currentColor"
						style={{ width: 13, height: 13 }}
						aria-hidden="true"
					>
						<path d={ICON_QUESTION} />
					</svg>
				</span>
				<p className="m-0 text-[15px] font-[600] leading-[1.4] text-[var(--text-primary)]">
					{part.question}
				</p>
			</div>
			<div className="mt-[12px] flex flex-wrap items-center gap-[6px] pl-[29px]">
				{part.options.map((option) => (
					<button
						key={option}
						type="button"
						aria-pressed={selected === option}
						onClick={() => setSelected(option)}
						className={
							selected === option
								? "inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-strong)] bg-[var(--surface-container)] px-[12px] py-[6px] text-[13px] font-[500] text-[var(--text-primary)]"
								: "inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[13px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
						}
					>
						{option}
					</button>
				))}
			</div>
		</div>
	);
}
