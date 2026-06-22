/**
 * AM3 (redo) — Variant C: IMMERSIVE SPLIT (stream + persistent diff rail).
 *
 * Entry-surface fork (open-question 1): a full-width route SPLIT into two
 * persistent columns — the streaming conversation on the left, a sticky CHANGES
 * rail on the right that keeps the file diff visible WHILE the agent works. This
 * is the reference-borrowed variant: t3code/Claude-desktop coding sessions put
 * the diff beside the stream so you watch the edits land. The diff is not behind
 * a "View diff" click — it's always there, the second focus of the surface.
 *
 * Resolves the open questions:
 *  Q1 entry      → full-width route, two-pane split (stream | diff rail) ← fork
 *  Q2 aggregate  → inline aggregate verb (tighter — left pane is the narrower one)
 *  Q3 reasoning  → quiet italic "Thought for Ns"
 *  Q4 queue      → muted dashed bubble + clock + ✕
 *  Q5 diff       → PERSISTENT diff rail (changed-files list, live) ← fork
 *  Q6 composer   → Stop + Queue, "Working for Ns" in the left composer
 *  Q7 status     → IN scope, as the rail header (Changes/PR/Background/Artifacts)
 *
 * This is the highest-density, most opinionated variant — best when the session
 * is code-heavy; weaker for a non-coding session where the rail is mostly empty.
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
	SessionStream,
} from "./sessionViewFixtures.js";

export default { title: "Session View · C · Split + Diff Rail", group: "Conversations" as const };

function SplitTopBar(): JSX.Element {
	return (
		<header className="flex items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[9px]">
			<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[3px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
				<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
				Session
			</span>
			<span className="text-[13px] font-[600] text-[var(--text-primary)]">{SESSION_META.agent}</span>
			<span className="text-[var(--text-tertiary)]">·</span>
			<span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">
				{SESSION_META.task}
			</span>
			<button
				type="button"
				className="rounded-[var(--r-pill)] border border-[var(--border-default)] px-[12px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
			>
				Ready for review
			</button>
			<button
				type="button"
				aria-label="Close session"
				className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
			>
				<svg viewBox="0 0 16 16" fill="currentColor" className="h-[12px] w-[12px]" aria-hidden="true">
					<path d="M4.3 3.2L8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3l1.1-1.1z" />
				</svg>
			</button>
		</header>
	);
}

/** A single mini-hunk line for the rail preview (reuses ReviewCodeDiff's tint vocabulary). */
function DiffLine({ sign, text }: { sign: "+" | "-" | " "; text: string }): JSX.Element {
	const tint =
		sign === "+"
			? "bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]"
			: sign === "-"
				? "bg-[color-mix(in_oklab,var(--status-error)_10%,transparent)]"
				: "";
	return (
		<div className={`flex font-mono text-[12px] leading-[1.5] ${tint}`}>
			<span className="w-[14px] shrink-0 select-none px-[3px] text-center text-[var(--text-tertiary)]">
				{sign}
			</span>
			<code className="whitespace-pre pr-[9px] text-[var(--text-primary)]">{text}</code>
		</div>
	);
}

/** The persistent CHANGES rail — file list + a live expanded hunk preview. */
function DiffRail(): JSX.Element {
	return (
		<aside className="flex w-[440px] shrink-0 flex-col border-l border-[var(--border-default)] bg-[var(--surface-container)]">
			<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[18px] py-[9px]">
				<span className="text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Changes
				</span>
				<DiffStat added={SESSION_META.changesAdded} removed={SESSION_META.changesRemoved} />
				<span className="flex-1" />
				<span className="font-mono tabular-nums text-[12px] text-[var(--text-secondary)]">
					PR #{SESSION_META.prNumber}
				</span>
			</div>
			<div className="flex-1 overflow-y-auto px-[12px] py-[12px]">
				{/* file list */}
				<div className="mb-[12px] flex flex-col gap-[3px]">
					{CHANGED_FILES.map((f, i) => {
						const name = f.path.slice(f.path.lastIndexOf("/") + 1);
						const dir = f.path.slice(0, f.path.lastIndexOf("/") + 1);
						return (
							<div
								key={f.path}
								className={`flex items-center gap-[9px] rounded-[var(--r-subtle)] px-[9px] py-[6px] font-mono text-[12px] ${
									i === 0 ? "bg-[var(--surface-elevated)] border border-[var(--border-subtle)]" : ""
								}`}
							>
								<span className="min-w-0 flex-1 truncate">
									<span className="text-[var(--text-tertiary)]">{dir}</span>
									<span className="text-[var(--text-primary)] font-[600]">{name}</span>
								</span>
								<DiffStat added={f.added} removed={f.removed} />
							</div>
						);
					})}
				</div>
				{/* live expanded hunk of the top file — the diff is always visible */}
				<div className="overflow-hidden rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
					<div className="bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] px-[12px] py-[6px] font-mono text-[12px] text-[var(--text-tertiary)]">
						@@ -118,5 +118,12 @@ buildStreamPayload()
					</div>
					<div className="py-[3px]">
						<DiffLine sign=" " text="  const text = msg.content;" />
						<DiffLine sign="-" text="  return { content: text };" />
						<DiffLine sign="+" text="  return {" />
						<DiffLine sign="+" text="    parts: [{ type: 'text', text }]," />
						<DiffLine sign="+" text="  };" />
					</div>
				</div>
			</div>
		</aside>
	);
}

export function SplitDiffRail(): JSX.Element {
	return (
		<div className="flex h-[820px] w-full flex-col bg-[var(--surface-page)]">
			<SplitTopBar />
			<div className="flex min-h-0 flex-1">
				{/* left: streaming conversation */}
				<div className="relative flex min-w-0 flex-1 flex-col">
					<div className="flex-1 overflow-y-auto px-[24px] py-[18px]">
						<div className="mx-auto flex max-w-[680px] flex-col gap-[12px]">
							<SessionStream aggregateAt={3} />
							{QUEUED.map((q) => (
								<QueuedBubble key={q.id} text={q.text} />
							))}
						</div>
					</div>
					<div className="pointer-events-none absolute inset-x-0 bottom-[12px] flex justify-center">
						<div className="pointer-events-auto">
							<ScrollToBottomPill />
						</div>
					</div>
					<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[12px]">
						<div className="mx-auto max-w-[680px]">
							<SessionComposer running elapsedLabel={SESSION_META.elapsedLabel} />
						</div>
					</div>
				</div>
				{/* right: persistent diff rail */}
				<DiffRail />
			</div>
		</div>
	);
}
