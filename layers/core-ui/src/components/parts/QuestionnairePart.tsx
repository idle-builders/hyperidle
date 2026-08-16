/**
 * AM1 — QuestionnairePart: an agent "quick ask" survey.
 *
 * Options read as EVEN / NEUTRAL choices — no biased/recommended styling (W2:
 * the source `QuestionnairePayload.options` is flat strings with no per-option
 * metadata, so no "Recommended" tag is rendered in AM1). Prominence comes from
 * layering (elevated surface + shadow), never from an accent border or biasing
 * one answer.
 *
 * @lore UI-004: options were static <li> chips in AM1 because answering was not
 * wired. Now that `onAnswer` is threaded through PartList → ConversationSurface,
 * options render as <button> elements when wired and remain static <li> chips
 * when not (e.g. story fixtures). The no-op-button rule applies only when no
 * onClick handler exists; buttons here always have a real onClick → onAnswer(option).
 */

import type { Part } from "@hyperidle/conversation-parts";
import type { JSX } from "react";

type QuestionnairePartValue = Extract<Part, { kind: "questionnaire" }>;

const ICON_QUESTION =
	"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a2.4 2.4 0 012.4 2.4c0 1-.6 1.5-1.3 2-.5.35-.6.55-.6 1.1H6.9c0-1 .3-1.5 1-2 .5-.36.8-.6.8-1.1a.9.9 0 00-1.8 0H5.6A2.4 2.4 0 018 4zm-.05 7.4a.95.95 0 110-1.9.95.95 0 010 1.9z";

// @lore UI-decision-card: `border-[var(--bw-thin)]` in Tailwind v4 resolves to border-color
// (not border-width) for CSS variable arguments — computed borderWidth: 0px despite --bw-thin: 1px.
// Both chips and the outer card now use `border-width-thin` (@utility in tokens.css) which
// correctly emits `border-width: var(--bw-thin)` so the chips read as interactive controls
// rather than plain text.
const CHIP_CLASS =
	"type-small border-width-thin inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] px-[12px] py-[6px] text-[var(--text-secondary)]";

export function QuestionnairePart({
	part,
	onAnswer,
}: {
	part: QuestionnairePartValue;
	/** When provided, options render as interactive buttons that post the answer. */
	onAnswer?: (text: string) => void;
}): JSX.Element {
	return (
		<div
			data-ds-component="QuestionnairePart"
			className="border-width-thin rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[18px] py-[12px] shadow-[var(--shadow-default)]"
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
				{part.options.map((option) =>
					onAnswer ? (
						<li key={option}>
							<button
								type="button"
								className={`${CHIP_CLASS} cursor-pointer hover:border-[var(--border-active)] hover:shadow-[var(--shadow-default)] hover:text-[var(--text-primary)]`}
								onClick={() => {
									onAnswer(option);
								}}
							>
								{option}
							</button>
						</li>
					) : (
						// Static chip when answering is not wired (e.g. story fixtures).
						<li key={option} className={CHIP_CLASS}>
							{option}
						</li>
					),
				)}
			</ul>
		</div>
	);
}
