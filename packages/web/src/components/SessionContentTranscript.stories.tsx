/**
 * AM3 — APPROVED Session view: CALM TRANSCRIPT (founder review, 2026-06-22).
 *
 * Rendering axis: DISCLOSURE-MINIMAL + AGGREGATION-FORWARD. The calmest possible
 * reading of a session. At rest every tool call is a single bare line (icon · verb
 * · muted target · status) with NO inline I/O; a consecutive run folds hard into
 * ONE summary verb ("Read 2 files, ran a command, searched, queried Linear"). The
 * agent's prose owns the column; tool activity recedes to a quiet ledger you open
 * only when you want it. Output, diffs, and the changed-files panel all reveal on
 * click. The founder chose this variant: "I prefer this calm aspect with the
 * various tool calls closed and combined in an expander."
 *
 * REUSES THE CONVERSATION'S COMPONENTS (founder review): the surface header +
 * AVATARS, the LEFT-ALIGNED human-message row (NOT a right-aligned bubble — human
 * messages appear on the left, like the HyperIdle chat), and the COMPOSER chrome
 * incl. the "+" attach affordance. The session view ADDS only the session-specific
 * render kinds: tool/reasoning Parts, the folded tool aggregation, the descriptor
 * model·effort·mode pills, the working/queue/Stop state, and a sub-agent row that
 * OPENS its own nested session view.
 *
 * Aspect taxonomy rendered (concept Part 7): a/streaming text · b/reasoning fold ·
 * c/tool families incl. mcp + sub-agent(→nested session) · d/FAILED tool (✗ + stderr
 * on expand) · e/hard aggregation · f/inline diff chip + changed-files panel ·
 * g/cost tick · i/artifact chip · k/plan · l/queued message · m/turn header (reused
 * conversation row) · n/working state · o/descriptor + conversation composer.
 * REMOVED per review: h/permission prompt (reviews are the allow point, not a
 * per-tool gate) · p/status-metrics roll-up (no PR/change-count bar).
 */

import { type JSX, useState } from "react";
import {
	aggregateVerb,
	AgentProse,
	ArtifactChip,
	ATLAS,
	blockStream,
	Caret,
	CHANGED_FILES,
	DiffStat,
	FOUNDER,
	HumanRow,
	ParticipantGroup,
	type PlanPart,
	PlanList,
	QUEUED,
	QueuedBubble,
	ScrollToBottomPill,
	SESSION_META,
	SESSION_PARTS,
	type SessionPart,
	SessionComposer,
	SessionCostTotal,
	StatusGlyph,
	type StreamBlock,
	type ToolPart,
	ToolGlyph,
	TurnHeader,
} from "./sessionContentFixtures.js";

export default { title: "Session View · Calm Transcript", group: "Conversations" as const };

// ── A BARE tool row — no inline I/O. Reveals output on click. A SUB-AGENT row
//    additionally OPENS its own nested session view (recursion, concept aspect j). ──
function BareToolRow({ part }: { part: ToolPart }): JSX.Element {
	const [open, setOpen] = useState(false);
	const canExpand = part.output !== undefined || part.subStream !== undefined;
	return (
		<div data-ds-component="ToolRow">
			{/* biome-ignore lint/a11y/useSemanticElements: a diff chip / open-session button nests inside; role/button avoids invalid nested-button DOM. */}
			<div
				role={canExpand ? "button" : undefined}
				tabIndex={canExpand ? 0 : undefined}
				onClick={canExpand ? () => setOpen((v) => !v) : undefined}
				onKeyDown={canExpand ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } } : undefined}
				className={`flex items-center gap-[9px] py-[3px] text-[13px] ${canExpand ? "cursor-pointer" : ""}`}
			>
				<span className="text-[var(--text-tertiary)]"><ToolGlyph kind={part.toolKind} /></span>
				<span className="shrink-0 font-[500] text-[var(--text-secondary)]">{part.verb}</span>
				{part.target ? (
					<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-tertiary)]">{part.target}</span>
				) : (
					<span className="flex-1" />
				)}
				{part.diff ? (
					<button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex shrink-0 items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-subtle)] px-[9px] py-[3px] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]">
						<span className="font-mono text-[11px] text-[var(--text-tertiary)]">{part.diff.label.split("/").pop()}</span>
						<DiffStat added={part.diff.added} removed={part.diff.removed} />
					</button>
				) : null}
				{/* sub-agent → opens its OWN nested session view (founder review aspect j) */}
				{part.opensSession ? (
					<button
						type="button"
						onClick={(e) => e.stopPropagation()}
						title={`Open the ${part.opensSession.label} session`}
						className="inline-flex shrink-0 items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-subtle)] px-[9px] py-[3px] text-[11px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
					>
						<svg viewBox="0 0 16 16" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
							<path d="M9 2.5h4.5V7M13.5 2.5L7 9M11 9.5V12a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 012 12V6a1.5 1.5 0 011.5-1.5H6" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
						Open session
					</button>
				) : null}
				{canExpand ? <Caret open={open} /> : null}
				<StatusGlyph status={part.status} />
			</div>
			{open && part.output ? (
				<pre className={`ms-[24px] mt-[3px] max-h-64 overflow-auto whitespace-pre-wrap border-s ps-[12px] py-[6px] font-mono text-[12px] leading-[1.5] ${part.status === "failed" ? "border-[var(--status-error)] text-[var(--text-secondary)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
					{part.output}
				</pre>
			) : null}
			{/* a sub-agent's nested mini-stream — the same calm tool grammar, recursed */}
			{open && part.subStream ? (
				<div className="ms-[24px] mt-[3px] flex flex-col border-s border-[var(--border-subtle)] ps-[12px]">
					{part.subStream.map((s) => (
						<div key={`${s.verb}-${s.target}`} className="flex items-center gap-[9px] py-[3px] text-[13px]">
							<span className="shrink-0 font-[500] text-[var(--text-tertiary)]">{s.verb}</span>
							<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-tertiary)]">{s.target}</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

// ── HARD aggregate — one summary verb, count, fold to bare rows. The chosen calm
//    behavior: tool calls closed at rest, combined in an expander. ──
function HardAggregate({ tools, defaultOpen = false }: { tools: readonly ToolPart[]; defaultOpen?: boolean }): JSX.Element {
	const [open, setOpen] = useState(defaultOpen);
	const failed = tools.some((t) => t.status === "failed");
	return (
		<div data-ds-component="ToolAggregate">
			<button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-[9px] py-[3px] text-left text-[13px] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]">
				<Caret open={open} />
				<span className="font-[500]">{aggregateVerb(tools)}</span>
				{failed ? <StatusGlyph status="failed" /> : <span className="text-[var(--text-tertiary)] text-[12px]">{tools.length} steps</span>}
			</button>
			{open ? (
				<div className="ms-[3px] mt-[3px] flex flex-col border-s border-[var(--border-subtle)] ps-[12px]">
					{tools.map((t) => <BareToolRow key={t.id} part={t} />)}
				</div>
			) : null}
		</div>
	);
}

function ChangedFilesPanel(): JSX.Element {
	return (
		<div className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
			<div className="flex items-center gap-[9px] px-[12px] py-[9px]">
				<span className="text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">Changed files</span>
				<span className="font-mono tabular-nums text-[12px] text-[var(--text-secondary)]">{CHANGED_FILES.length}</span>
				<DiffStat added={SESSION_META.changesAdded} removed={SESSION_META.changesRemoved} />
				<span className="flex-1" />
				<button type="button" className="rounded-[var(--r-pill)] border border-[var(--border-default)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]">View diff</button>
			</div>
			<div className="border-t border-[var(--border-subtle)] px-[12px] py-[9px]">
				{CHANGED_FILES.map((f) => {
					const name = f.path.slice(f.path.lastIndexOf("/") + 1);
					const dir = f.path.slice(0, f.path.lastIndexOf("/") + 1);
					return (
						<div key={f.path} className="flex items-center gap-[9px] py-[3px] font-mono text-[12px]">
							<span className="min-w-0 flex-1 truncate"><span className="text-[var(--text-tertiary)]">{dir}</span><span className="text-[var(--text-primary)]">{name}</span></span>
							<DiffStat added={f.added} removed={f.removed} />
						</div>
					);
				})}
			</div>
		</div>
	);
}

function renderSingle(part: SessionPart): JSX.Element {
	if (part.kind === "tool") return <BareToolRow part={part} />;
	if (part.kind === "plan") return <PlanList part={part as PlanPart} />;
	if (part.kind === "artifact") return <ArtifactChip part={part} />;
	if (part.kind === "reasoning") {
		return <ReasoningFold durationMs={part.durationMs} text={part.text} />;
	}
	// Human messages render LEFT-ALIGNED like the conversation (founder review).
	if (!part.author.isAgent) return <HumanRow author={part.author} createdAt={part.createdAt} text={part.text} />;
	return <AgentProse text={part.text} streaming={"streaming" in part && part.streaming === true} />;
}

function ReasoningFold({ durationMs, text }: { durationMs: number; text: string }): JSX.Element {
	const [open, setOpen] = useState(false);
	const secs = Math.round(durationMs / 1000);
	return (
		<div data-ds-component="ReasoningRow">
			<button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-[6px] py-[3px] text-[12px] font-[500] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-secondary)]">
				<svg viewBox="0 0 16 16" className="h-[12px] w-[12px] shrink-0" aria-hidden="true">
					<path d="M5 13a3 3 0 01-1-5.8A3.5 3.5 0 0111 5a2.5 2.5 0 011 4.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
				<span className="italic">Thought for {secs}s</span>
				<Caret open={open} size={10} />
			</button>
			{open ? <p className="ms-[18px] mt-[3px] border-s border-[var(--border-subtle)] ps-[12px] text-[13px] italic leading-[1.6] text-[var(--text-tertiary)]">{text}</p> : null}
		</div>
	);
}

function TranscriptStream(): JSX.Element {
	const blocks: StreamBlock[] = blockStream(SESSION_PARTS, 2);
	let lastAuthorId = "";
	return (
		<div data-ds-component="SessionStream" className="flex flex-col gap-[12px]">
			{blocks.map((b, i) => {
				const part = b.kind === "single" ? b.part : b.tools[0];
				const author = part?.author;
				// Only the AGENT shows a turn header here; a human message carries its own
				// left-aligned author row (HumanRow) — the conversation's grouping shape.
				const showAuthor = !!author && author.isAgent && author.id !== lastAuthorId;
				if (author) lastAuthorId = author.id;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: stream order is stable for the fixture
					<div key={i} className="flex flex-col gap-[6px]">
						{showAuthor && author && part ? <TurnHeader author={author} createdAt={part.createdAt} /> : null}
						{b.kind === "tool-run" ? (
							// The aggregate is collapsed at rest. The edit+run+edit run (the founder's
							// annotation-3 example) is rendered EXPANDED so both states are visible.
							<HardAggregate tools={b.tools} defaultOpen={b.tools.some((t) => t.toolKind === "edit")} />
						) : (
							renderSingle(b.part)
						)}
						{/* cost is no longer inline — it lives in the header as the combined
						    SESSION-TOTAL (founder review annotation 4). */}
					</div>
				);
			})}
		</div>
	);
}

export function CalmTranscript(): JSX.Element {
	return (
		<div className="flex h-[900px] w-full flex-col bg-[var(--surface-page)]" style={{ fontFamily: "var(--font-sans)" }}>
			{/* header — the ConversationSurface header shape: host tag · title · avatars.
			    Minimal session identity only; NO PR/change-count metrics bar (review). */}
			<header className="flex shrink-0 items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
				<div className="mx-auto flex w-full max-w-[760px] items-center gap-[12px]">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-[6px] text-[12px] text-[var(--text-secondary)]">
							<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
								<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
								Session
							</span>
							<span className="text-[var(--text-tertiary)]">·</span>
							<span className="truncate font-[500] text-[var(--text-primary)]">{SESSION_META.host}</span>
						</div>
						<h1 className="mt-[3px] mb-0 text-[17px] font-[600] leading-[1.25] text-[var(--text-primary)]">{SESSION_META.task}</h1>
					</div>
					{/* combined SESSION-TOTAL cost — in the header (founder review annotation 4) */}
					<SessionCostTotal />
					<span className="h-[20px] w-px bg-[var(--border-subtle)]" />
					{/* conversation avatars (founder review: "the avatar should look like in the chat") */}
					<ParticipantGroup people={[ATLAS, FOUNDER]} />
				</div>
			</header>
			{/* reading column */}
			<div className="relative flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-[760px] flex-col gap-[12px] px-[24px] py-[18px]">
					<TranscriptStream />
					<ChangedFilesPanel />
					{QUEUED.map((q) => <QueuedBubble key={q.id} author={q.author} text={q.text} />)}
				</div>
				<div className="pointer-events-none absolute inset-x-0 bottom-[12px] flex justify-center">
					<div className="pointer-events-auto"><ScrollToBottomPill /></div>
				</div>
			</div>
			{/* composer — the conversation composer's EXACT outer treatment (founder review
			    annotation 5): no top border, px-[18px] pb-[18px] pt-[9px], mx-auto
			    max-w-[760px] — identical to ConversationSurface's Composer wrapper. The
			    inner bordered/elevated surface is the conversation composer chrome; the
			    session ADDS the descriptor pills + working/queue/Stop state. */}
			<div className="shrink-0 bg-[var(--surface-page)] px-[18px] pb-[18px] pt-[9px]">
				<div className="mx-auto w-full max-w-[760px]"><SessionComposer running elapsedLabel={SESSION_META.elapsedLabel} /></div>
			</div>
		</div>
	);
}
