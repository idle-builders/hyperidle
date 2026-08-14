/**
 * AM1 — QuestionnairePart: an agent "quick ask" survey.
 *
 * Options read as EVEN / NEUTRAL choices — no biased/recommended styling (W2:
 * the source `QuestionnairePayload.options` is flat strings with no per-option
 * metadata, so no "Recommended" tag is rendered in AM1). Prominence comes from
 * layering (elevated surface + shadow), never from an accent border or biasing
 * one answer.
 *
 * @lore AM1 DES-1: answering a questionnaire is NOT wired to a backend in AM1
 * (same honest-deferral as the composer "+" menu, which opens but posts nothing).
 * The options are therefore NOT rendered as clickable buttons — a button that
 * latches a selected/`aria-pressed` state (or even a no-op button, which the
 * `design/no-op-button` rule forbids) would imply "your answer was recorded" when
 * nothing was. They render as static, non-interactive option chips: the choices
 * the agent offered, visibly present but not yet answerable. Answer-posting lands
 * in a later WP that wires the surface; that WP turns these into real controls.
 */

import type { Part } from "@hyperidle/conversation-parts";
import type { JSX } from "react";

type QuestionnairePartValue = Extract<Part, { kind: "questionnaire" }>;

const ICON_QUESTION =
	"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a2.4 2.4 0 012.4 2.4c0 1-.6 1.5-1.3 2-.5.35-.6.55-.6 1.1H6.9c0-1 .3-1.5 1-2 .5-.36.8-.6.8-1.1a.9.9 0 00-1.8 0H5.6A2.4 2.4 0 018 4zm-.05 7.4a.95.95 0 110-1.9.95.95 0 010 1.9z";

export function QuestionnairePart({ part }: { part: QuestionnairePartValue }): JSX.Element {
	return (
		<div
			data-ds-component="QuestionnairePart"
			className="border-[var(--bw-thin)] rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[18px] py-[12px] shadow-[var(--shadow-default)]"
		>
			<div className="flex items-start gap-[9px]">
				<span
					aria-label="Quick ask"
					title="Quick ask"
					className="mt-[1px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-deep)]"
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
				<p className="type-copy m-0    text-[var(--text-primary)]">{part.question}</p>
			</div>
			<ul className="m-0 mt-[12px] flex list-none flex-wrap items-center gap-[6px] p-0 pl-[29px]">
				{part.options.map((option) => (
					// DES-1: static, non-interactive option chip — NOT a button. Answering
					// is not wired in AM1, so the options must not present a clickable
					// affordance that records nothing. They show the choices the agent
					// offered; a later WP turns them into real controls.
					// @lore AM5 T9 DEFER: answering/verdict wiring is an interaction concern,
					// not artifact rendering. Out of AM5 scope. Explicitly decided, not forgotten.
					<li
						key={option}
						className="type-small border-[var(--bw-thin)] inline-flex items-center gap-[6px] rounded-[var(--r-subtle)]  border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px]   text-[var(--text-secondary)]"
					>
						{option}
					</li>
				))}
			</ul>
		</div>
	);
}
