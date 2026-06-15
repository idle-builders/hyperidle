/**
 * AK4 design sketch — "Draft card in thread".
 *
 * Embodies the approved variant: an Assistant reply bubble carrying substantive
 * text + a tool-call summary row + a BetCard(status="draft") embedded beneath,
 * then a second (iterated) message showing edit_bet + the updated card.
 *
 * Pure design sketch. Renders in the design-system viewer (:8098). Uses only
 * design-system components + Hearth tokens. Real data shapes from AK4.
 *
 * To preview: add a temporary story export (this file or a sibling .stories.tsx)
 * and open http://localhost:8098/#AK4DraftCardInThread
 */

import type { JSX } from "react";
import { BetCard } from "../../../../packages/design-system/src/BetCard.js";

// Existing AssistantOverlay tool-call row, inlined here for the sketch so the
// variant is self-contained. In production this is the shipped ToolCallRow.
function ToolCallRow({ name, output }: { name: string; output: string }): JSX.Element {
	return (
		<div className="flex items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] px-[9px] py-[6px] text-[13px]">
			<span className="font-mono text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				{name}
			</span>
			<span className="text-[var(--text-secondary)]">{output}</span>
		</div>
	);
}

function AssistantBubble({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<div className="flex flex-col gap-[9px] max-w-[480px]">
			<div className="rounded-[var(--r-default)] bg-[var(--surface-elevated)] px-[12px] py-[9px] text-[14px] text-[var(--text-primary)] shadow-[var(--shadow-default)]">
				{children}
			</div>
		</div>
	);
}

export function AK4DraftCardInThread(): JSX.Element {
	return (
		<div className="flex flex-col gap-[18px] bg-[var(--surface-base)] p-[24px] max-w-[540px]">
			{/* Founder message (right-aligned, for context) */}
			<div className="self-end max-w-[480px] rounded-[var(--r-default)] bg-[var(--accent-primary)] px-[12px] py-[9px] text-[14px] text-[var(--text-on-accent)]">
				I want to cut onboarding time in half. New users take days to set up their
				first team. Draft me a bet for it.
			</div>

			{/* Assistant reply 1 — substantive text + create_bet row + draft card */}
			<AssistantBubble>
				<p className="m-0">
					Here's a draft. I framed it around a guided first-run flow with a 2-week
					appetite — narrow enough to ship, broad enough to move the metric. Open it
					to refine the body, or tell me what to change.
				</p>
				<div className="mt-[9px] flex flex-col gap-[6px]">
					<ToolCallRow name="create_bet" output="Drafted a bet" />
					<BetCard
						title="Halve time-to-first-team for new users"
						team="Onboarding"
						status="draft"
						budgetLabel="2 weeks"
						description="Guided first-run flow that walks a new user from signup to a created team and first committed bet without leaving the app."
						onClick={() => {
							/* navigate to /work/bets/:id */
						}}
					/>
				</div>
			</AssistantBubble>

			{/* Founder iterates */}
			<div className="self-end max-w-[480px] rounded-[var(--r-default)] bg-[var(--accent-primary)] px-[12px] py-[9px] text-[14px] text-[var(--text-on-accent)]">
				Narrow it to just the team-creation step, and make the appetite 1 week.
			</div>

			{/* Assistant reply 2 — edit_bet row + same card, updated in place */}
			<AssistantBubble>
				<p className="m-0">
					Done — scoped to team creation only and trimmed the appetite to 1 week.
					Same draft, updated.
				</p>
				<div className="mt-[9px] flex flex-col gap-[6px]">
					<ToolCallRow name="edit_bet" output="Updated the draft" />
					<BetCard
						title="Guided team-creation step for new users"
						team="Onboarding"
						status="draft"
						budgetLabel="1 week"
						description="A single guided step that takes a new user from signup to their first created team — measured by time-to-first-team."
						onClick={() => {
							/* navigate to /work/bets/:id */
						}}
					/>
				</div>
			</AssistantBubble>
		</div>
	);
}
