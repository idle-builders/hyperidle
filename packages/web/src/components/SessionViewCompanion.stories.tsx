/**
 * AM3 (redo) — Variant B: WIDE COMPANION PANEL.
 *
 * Entry-surface fork (open-question 1): a WIDE right dock (620px, up from the
 * rejected 460px slide-over) that opens over a still-mounted conversation. You
 * dial into the agent's live work WITHOUT leaving the conversation — the calm,
 * non-committal entry attempt 1 kept, but finally wide enough for full-width
 * agent text, tool output, and an inline diff chip. The conversation stays
 * readable, dimmed, behind a scrim-less left gutter.
 *
 * Density-first: tighter rhythm than the focused route, status roll-ups condensed
 * into the panel header (no separate bar), diffs as INLINE chips on the edit rows
 * (no per-turn panel) — the panel is narrower so it favours the inline affordance.
 *
 * Resolves the open questions:
 *  Q1 entry      → wide right companion dock (conversation stays mounted)
 *  Q2 aggregate  → same inline aggregate verb, tighter
 *  Q3 reasoning  → quiet italic "Thought for Ns"
 *  Q4 queue      → muted dashed bubble + clock + ✕ (same grammar)
 *  Q5 diff       → INLINE diff chip on each file-change tool row (no panel) ← fork
 *  Q6 composer   → Stop + Queue, "Working for Ns" condensed in the header
 *  Q7 status     → condensed into the panel header (Changes +X/−Y · PR · 1 bg)
 */

import type { JSX } from "react";
import {
	DiffStat,
	QUEUED,
	QueuedBubble,
	SESSION_META,
	SessionComposer,
	SessionStream,
} from "./sessionViewFixtures.js";

export default { title: "Session View · B · Companion Panel", group: "Conversations" as const };

/** The dimmed conversation behind the dock — context that the panel sits over. */
function ConversationBehind(): JSX.Element {
	return (
		<div className="flex flex-1 flex-col gap-[12px] px-[24px] py-[18px] opacity-40">
			<div className="text-[13px] font-[600] text-[var(--text-primary)]">Passkey login</div>
			<div className="flex justify-end">
				<div className="max-w-[70%] rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-container)] px-[12px] py-[9px] text-[14px] text-[var(--text-primary)]">
					The agent chat broke after the AI SDK bump — can you fix it?
				</div>
			</div>
			<div className="text-[15px] leading-[1.6] text-[var(--text-primary)]">
				On it — opening a session to trace the streaming response shape.
			</div>
			<div className="inline-flex items-center gap-[6px] text-[12px] font-[500] text-[var(--text-tertiary)]">
				<svg viewBox="0 0 16 16" fill="currentColor" className="h-[12px] w-[12px]" aria-hidden="true">
					<path d="M8 10.5L3.5 6l1-1L8 8.5 11.5 5l1 1L8 10.5z" />
				</svg>
				Worked for 1m 47s
				<span className="text-[var(--text-tertiary)]">·</span>
				<span className="text-[var(--accent-primary)]">Show session</span>
			</div>
		</div>
	);
}

function PanelHeader(): JSX.Element {
	return (
		<header className="flex flex-col gap-[6px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[9px]">
			<div className="flex items-center gap-[9px]">
				<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[3px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
					<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
					Session
				</span>
				<span className="text-[13px] font-[600] text-[var(--text-primary)]">{SESSION_META.agent}</span>
				<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">
					{SESSION_META.task}
				</span>
				<button
					type="button"
					aria-label="Close session"
					className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
				>
					<svg viewBox="0 0 16 16" fill="currentColor" className="h-[12px] w-[12px]" aria-hidden="true">
						<path d="M4.3 3.2L8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3l1.1-1.1z" />
					</svg>
				</button>
			</div>
			{/* condensed status roll-up — no separate bar in the narrower dock */}
			<div className="flex items-center gap-[12px] text-[12px] text-[var(--text-tertiary)]">
				<span className="inline-flex items-center gap-[6px]">
					Changes <DiffStat added={SESSION_META.changesAdded} removed={SESSION_META.changesRemoved} />
				</span>
				<span>·</span>
				<span className="font-mono tabular-nums">PR #{SESSION_META.prNumber}</span>
				<span>·</span>
				<span>{SESSION_META.backgroundCount} background</span>
			</div>
		</header>
	);
}

export function CompanionPanel(): JSX.Element {
	return (
		<div className="flex h-[820px] w-full bg-[var(--surface-container)]">
			<ConversationBehind />
			{/* the wide dock */}
			<aside className="flex w-[620px] shrink-0 flex-col border-l border-[var(--border-default)] bg-[var(--surface-page)] shadow-[var(--shadow-elevated)]">
				<PanelHeader />
				<div className="flex-1 overflow-y-auto px-[18px] py-[12px]">
					{/* inline diff chips on edit rows (no panel) → aggregateAt stays 3 */}
					<SessionStream aggregateAt={3} />
					<div className="mt-[12px]">
						{QUEUED.map((q) => (
							<QueuedBubble key={q.id} text={q.text} />
						))}
					</div>
				</div>
				<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
					<SessionComposer running elapsedLabel={SESSION_META.elapsedLabel} />
				</div>
			</aside>
		</div>
	);
}
