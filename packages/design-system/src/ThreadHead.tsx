/**
 * L1a — `ThreadHead` design-system component.
 *
 * Plan §7.2; approved.md §2.2. Mounts when an unresolved review/
 * questionnaire message exists. Renders the title, REASONING block, and
 * an artifact slot (filled by the page).
 */

import type { Message, VerdictDecision } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";
import type { VerdictGrammarAction } from "./ReviewVerdictBar.js";

export interface ThreadHeadProps {
	message: Message;
	resolvedVerdict?: VerdictDecision;
	artifactSlot?: ReactNode;
	onPromoteArtifact?: () => void;
	onVerdict?: (action: VerdictGrammarAction) => void;
}

export function ThreadHead({
	message,
	resolvedVerdict,
	artifactSlot,
}: ThreadHeadProps): JSX.Element {
	if (message.type === "review") {
		const payload = message.payload as {
			title: string;
			reasoning: ReadonlyArray<string>;
		};
		return (
			<section
				{...dsProps("ThreadHead", "2")}
				data-testid="thread-head"
				className="flex flex-col gap-[var(--density-gap,8px)] py-[var(--density-card-pad,12px)] px-[var(--density-pad-x,12px)] border-b border-[var(--border-subtle)] bg-[var(--surface-1)]"
			>
				<header className="flex items-center justify-between gap-[8px]">
					<h2 className="text-[15px] font-semibold text-[var(--text-hi)]">{payload.title}</h2>
					{resolvedVerdict ? (
						<span className="text-[11px] uppercase tracking-[0.05em] text-[var(--ok)]">
							RESOLVED · {resolvedVerdict}
						</span>
					) : null}
				</header>
				<div className="flex flex-col gap-[4px]">
					<div className="text-[11px] uppercase tracking-[0.05em] text-[var(--text-lo)]">
						Reasoning
					</div>
					<ol className="list-decimal pl-[20px] flex flex-col gap-[2px] text-[13px] text-[var(--text-mid)]">
						{payload.reasoning.map((line, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: stable position-based index — review reasoning is immutable once sent.
							<li key={`${message.id}-r-${i}`}>{line}</li>
						))}
					</ol>
				</div>
				{artifactSlot ? (
					<div
						data-testid="artifact-slot"
						className="rounded-[var(--r1)] border border-[var(--border-subtle)] overflow-hidden"
					>
						{artifactSlot}
					</div>
				) : null}
			</section>
		);
	}
	if (message.type === "questionnaire") {
		const payload = message.payload as { title: string; question: string };
		return (
			<section
				{...dsProps("ThreadHead", "2")}
				data-testid="thread-head"
				className="flex flex-col gap-[var(--density-gap,8px)] py-[var(--density-card-pad,12px)] px-[var(--density-pad-x,12px)] border-b border-[var(--border-subtle)] bg-[var(--surface-1)]"
			>
				<h2 className="text-[15px] font-semibold text-[var(--text-hi)]">{payload.title}</h2>
				<p className="text-[13px] text-[var(--text-mid)]">{payload.question}</p>
				<div className="text-[12px] text-[var(--text-lo)] italic">Answer UI coming in L1b</div>
			</section>
		);
	}
	// Plain or verdict heads do not mount per approved.md §8 hard-rule 1.
	return <section data-testid="thread-head" />;
}
