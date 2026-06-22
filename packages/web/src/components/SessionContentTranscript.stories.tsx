/**
 * AM3 — Variant 1: CALM TRANSCRIPT.
 *
 * Rendering axis: DISCLOSURE-MINIMAL + AGGREGATION-FORWARD. The calmest possible
 * reading of a session. At rest every tool call is a single bare line (icon · verb
 * · muted target · status) with NO inline I/O; a consecutive run folds hard into
 * ONE summary verb ("Read 2 files, ran a command, searched, queried Linear"). The
 * agent's prose owns the column; tool activity recedes to a quiet ledger you open
 * only when you want it. Output, diffs, and the changed-files panel all reveal on
 * click. This is the t3code/Claude-desktop "studio" calm — content first, activity
 * a fold away.
 *
 * Demonstrates the full taxonomy (concept Part 7): a/streaming text · b/reasoning
 * fold · c/tool families incl. mcp + sub-agent · d/FAILED tool (✗ + stderr on
 * expand) · e/hard aggregation · f/inline diff chip + changed-files panel ·
 * g/cost tick · h/permission prompt · i/artifact chip · k/plan · l/queued message ·
 * m/turn header · n/working state · o/descriptor composer · p/status bar.
 *
 * Inside the settled ConversationSurface shape: header · PartList-style column ·
 * composer. Placement is NOT explored — only the content-rendering vocabulary.
 */

import { type JSX, useState } from "react";
import {
	aggregateVerb,
	AgentProse,
	ArtifactChip,
	blockStream,
	Caret,
	CHANGED_FILES,
	CostTick,
	DiffStat,
	HumanBubble,
	type PermissionPart,
	PermissionPrompt,
	type PlanPart,
	PlanList,
	QUEUED,
	QueuedBubble,
	ScrollToBottomPill,
	SESSION_META,
	SESSION_PARTS,
	type SessionPart,
	SessionComposer,
	SessionStatusBar,
	StatusGlyph,
	type StreamBlock,
	type ToolPart,
	ToolGlyph,
	TurnHeader,
} from "./sessionContentFixtures.js";

export default { title: "Session View · 1 · Calm Transcript", group: "Conversations" as const };

// ── Variant-specific: a BARE tool row — no inline I/O. Reveals output on click. ──
function BareToolRow({ part }: { part: ToolPart }): JSX.Element {
	const [open, setOpen] = useState(false);
	const canExpand = part.output !== undefined;
	return (
		<div data-ds-component="ToolRow">
			{/* biome-ignore lint/a11y/useSemanticElements: a diff chip button nests inside; role/button avoids invalid nested-button DOM. */}
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
				{canExpand ? <Caret open={open} /> : null}
				<StatusGlyph status={part.status} />
			</div>
			{open && part.output ? (
				<pre className={`ms-[24px] mt-[3px] max-h-64 overflow-auto whitespace-pre-wrap border-s ps-[12px] py-[6px] font-mono text-[12px] leading-[1.5] ${part.status === "failed" ? "border-[var(--status-error)] text-[var(--text-secondary)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
					{part.output}
				</pre>
			) : null}
		</div>
	);
}

// ── Variant-specific: HARD aggregate — one summary verb, count, fold to bare rows. ──
function HardAggregate({ tools }: { tools: readonly ToolPart[] }): JSX.Element {
	const [open, setOpen] = useState(false);
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
	if (part.kind === "permission") return <PermissionPrompt part={part as PermissionPart} />;
	if (part.kind === "plan") return <PlanList part={part as PlanPart} />;
	if (part.kind === "artifact") return <ArtifactChip part={part} />;
	if (part.kind === "reasoning") {
		return <ReasoningFold durationMs={part.durationMs} text={part.text} />;
	}
	if (!part.author.isAgent) return <HumanBubble text={part.text} />;
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
				const showAuthor = !!author && author.isAgent && author.id !== lastAuthorId;
				if (author) lastAuthorId = author.id;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: stream order is stable for the fixture
					<div key={i} className="flex flex-col gap-[6px]">
						{showAuthor && author && part ? <TurnHeader author={author} createdAt={part.createdAt} /> : null}
						{b.kind === "tool-run" ? <HardAggregate tools={b.tools} /> : renderSingle(b.part)}
						{/* a quiet cost tick after the last (streaming) prose */}
						{b.kind === "single" && b.part.id === "a3" ? <CostTick /> : null}
					</div>
				);
			})}
		</div>
	);
}

export function CalmTranscript(): JSX.Element {
	return (
		<div className="flex h-[900px] w-full flex-col bg-[var(--surface-page)]" style={{ fontFamily: "var(--font-sans)" }}>
			{/* header — the ConversationSurface header shape */}
			<header className="flex shrink-0 items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
				<div className="mx-auto flex w-full max-w-[760px] items-center gap-[12px]">
					<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
						<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
						Session
					</span>
					<div className="min-w-0 flex-1">
						<div className="text-[12px] text-[var(--text-secondary)]">{SESSION_META.agent} · <span className="text-[var(--text-tertiary)]">{SESSION_META.host}</span></div>
						<h1 className="mt-[3px] mb-0 text-[16px] font-[600] leading-[1.25] text-[var(--text-primary)]">{SESSION_META.task}</h1>
					</div>
					<div className="hidden md:block"><SessionStatusBar /></div>
				</div>
			</header>
			{/* reading column */}
			<div className="relative flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-[760px] flex-col gap-[12px] px-[24px] py-[18px]">
					<TranscriptStream />
					<ChangedFilesPanel />
					{QUEUED.map((q) => <QueuedBubble key={q.id} text={q.text} />)}
				</div>
				<div className="pointer-events-none absolute inset-x-0 bottom-[12px] flex justify-center">
					<div className="pointer-events-auto"><ScrollToBottomPill /></div>
				</div>
			</div>
			{/* composer — working state */}
			<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[12px]">
				<div className="mx-auto max-w-[760px]"><SessionComposer running elapsedLabel={SESSION_META.elapsedLabel} /></div>
			</div>
		</div>
	);
}
