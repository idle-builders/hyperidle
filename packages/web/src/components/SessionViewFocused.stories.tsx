/**
 * AM3 (redo) — Variant A: FOCUSED FULL-PAGE ROUTE.
 *
 * Entry-surface fork (open-question 1): a dedicated full-page route. The session
 * gets the whole canvas — a single centered max-w-3xl reading column, exactly
 * the t3code/Claude-desktop "studio" feel. The agent owns the column; the human
 * speaks in small right-aligned bubbles. A slim top bar carries identity + the
 * session status roll-ups; the composer is pinned to the bottom in its WORKING
 * state (Stop + Queue), with the changed-files panel living per-turn in the stream.
 *
 * Resolves the open questions:
 *  Q1 entry      → full-page route (most room for full-width text + diff + output)
 *  Q2 aggregate  → "Read 2 files, ran a command, searched the web ▸" inline verb
 *  Q3 reasoning  → quiet italic "Thought for 14s", left-rule on expand
 *  Q4 queue      → muted dashed bubble + clock + ✕ inline in the column tail
 *  Q5 diff       → per-turn CHANGED FILES (N) panel + inline diff chip on edits
 *  Q6 composer   → Stop (red) + Queue; "Working for Ns" in the composer strip
 *  Q7 status     → IN scope, as a top-bar roll-up (Changes/PR/Background/Artifacts)
 *
 * Populated + one in-progress streaming turn only. No skeleton/empty/error.
 */

import type { JSX } from "react";
import {
	CHANGED_FILES,
	DiffStat,
	QUEUED,
	QueuedBubble,
	ScrollToBottomPill,
	SESSION_META,
	SessionComposer,
	SessionStatusBar,
	SessionStream,
} from "./sessionViewFixtures.js";

export default { title: "Session View · A · Focused Route", group: "Conversations" as const };

function TopBar(): JSX.Element {
	return (
		<header className="flex items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[9px]">
			<div className="flex min-w-0 flex-1 items-center gap-[9px]">
				<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[3px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
					<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
					Session
				</span>
				<span className="truncate text-[13px] font-[600] text-[var(--text-primary)]">
					{SESSION_META.agent}
				</span>
				<span className="text-[var(--text-tertiary)]">·</span>
				<span className="truncate text-[13px] text-[var(--text-secondary)]">{SESSION_META.task}</span>
			</div>
			<div className="hidden shrink-0 items-center md:flex">
				<SessionStatusBar />
			</div>
			<button
				type="button"
				aria-label="Close session"
				className="ml-[6px] flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
			>
				<svg viewBox="0 0 16 16" fill="currentColor" className="h-[13px] w-[13px]" aria-hidden="true">
					<path d="M4.3 3.2L8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3l1.1-1.1z" />
				</svg>
			</button>
		</header>
	);
}

/** Per-turn changed-files panel — the Q5 "panel" affordance. Opens ReviewCodeDiff. */
function ChangedFilesPanel(): JSX.Element {
	return (
		<div className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
			<div className="flex items-center gap-[9px] px-[12px] py-[9px]">
				<span className="text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Changed files
				</span>
				<span className="font-mono tabular-nums text-[12px] text-[var(--text-secondary)]">
					{CHANGED_FILES.length}
				</span>
				<DiffStat added={SESSION_META.changesAdded} removed={SESSION_META.changesRemoved} />
				<span className="flex-1" />
				<button
					type="button"
					className="rounded-[var(--r-pill)] border border-[var(--border-default)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
				>
					View diff
				</button>
			</div>
			<div className="border-t border-[var(--border-subtle)] px-[12px] py-[9px]">
				{CHANGED_FILES.map((f) => {
					const dir = f.path.slice(0, f.path.lastIndexOf("/") + 1);
					const name = f.path.slice(f.path.lastIndexOf("/") + 1);
					return (
						<div key={f.path} className="flex items-center gap-[9px] py-[3px] font-mono text-[12px]">
							<span className="min-w-0 flex-1 truncate">
								<span className="text-[var(--text-tertiary)]">{dir}</span>
								<span className="text-[var(--text-primary)]">{name}</span>
							</span>
							<DiffStat added={f.added} removed={f.removed} />
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function FocusedRoute(): JSX.Element {
	return (
		<div className="flex h-[860px] w-full flex-col bg-[var(--surface-page)]">
			<TopBar />
			{/* the reading column — centered, generous, one column */}
			<div className="relative flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-[760px] flex-col gap-[12px] px-[24px] py-[18px]">
					<SessionStream />
					{/* per-turn changed files for the fix turn */}
					<ChangedFilesPanel />
					{/* the queued human message sits at the tail while the agent streams */}
					{QUEUED.map((q) => (
						<QueuedBubble key={q.id} text={q.text} />
					))}
				</div>
				{/* scroll-to-bottom pill floats above the composer */}
				<div className="pointer-events-none absolute inset-x-0 bottom-[12px] flex justify-center">
					<div className="pointer-events-auto">
						<ScrollToBottomPill />
					</div>
				</div>
			</div>
			{/* composer pinned to bottom — WORKING state */}
			<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[12px]">
				<div className="mx-auto max-w-[760px]">
					<SessionComposer running elapsedLabel={SESSION_META.elapsedLabel} />
				</div>
			</div>
		</div>
	);
}
