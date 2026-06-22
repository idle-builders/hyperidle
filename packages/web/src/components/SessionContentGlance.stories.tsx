/**
 * AM3 — Variant 2: GLANCEABLE ACTIVITY.
 *
 * Rendering axis: INLINE I/O PREVIEWS + LOW-CLICK. The opposite disclosure choice
 * from Variant 1. Every tool row carries a ONE-LINE I/O preview AT REST — the
 * command's stdout head, a search's match count, an MCP call's result, an edit's
 * intent, a failure's error — so you read the SUBSTANCE of the session without
 * expanding anything. A FAILURE reads loudest: a destructive left rule + the error
 * line inline. Aggregation is SOFT (a verb header with the rows still visible
 * beneath a hairline), never hiding what happened. A file edit reveals its diff
 * INLINE right under the row (a compact ReviewCodeDiff-tinted hunk) — the diff is
 * never a click away. This is the "watch it work, understand at a glance" grammar.
 *
 * Demonstrates the full taxonomy (concept Part 7), same fixture as Variant 1 —
 * only the tool-row grammar differs: here I/O lives inline; in Variant 1 it folds.
 */

import { type JSX, useState } from "react";
import {
	aggregateVerb,
	AgentProse,
	ArtifactChip,
	blockStream,
	Caret,
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

export default { title: "Session View · 2 · Glanceable Activity", group: "Conversations" as const };

// ── A compact inline diff (ReviewCodeDiff tints) revealed under an edit row. ──
const INLINE_HUNK: readonly { kind: "add" | "del" | "ctx"; text: string }[] = [
	{ kind: "ctx", text: "  return new Response(" },
	{ kind: "del", text: "    JSON.stringify({ content: text }),  // v5 shape" },
	{ kind: "add", text: "    JSON.stringify({ parts: [{ type: 'text', text }] }),  // v6" },
	{ kind: "ctx", text: "    { headers: streamHeaders }," },
	{ kind: "ctx", text: "  );" },
];
const TINT: Record<"add" | "del" | "ctx", string> = {
	add: "bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]",
	del: "bg-[color-mix(in_oklab,var(--status-error)_10%,transparent)]",
	ctx: "",
};
const PREFIX: Record<"add" | "del" | "ctx", string> = { add: "+", del: "−", ctx: " " };

function InlineDiff(): JSX.Element {
	return (
		<div className="ms-[24px] mt-[6px] overflow-hidden rounded-[var(--r-subtle)] border border-[var(--border-subtle)]">
			<div className="bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] px-[12px] py-[3px] font-mono text-[11px] text-[var(--text-tertiary)]">@@ -116,5 +116,5 @@ streamChatResponse()</div>
			<div className="bg-[var(--surface-container)] font-mono text-[12px] leading-[1.5]">
				{INLINE_HUNK.map((l) => (
					<div key={l.text} className={`flex ${TINT[l.kind]}`}>
						<span className="w-[16px] shrink-0 select-none px-[3px] text-center text-[var(--text-tertiary)]">{PREFIX[l.kind]}</span>
						<code className="flex-1 whitespace-pre pr-[12px] text-[var(--text-primary)]">{l.text}</code>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Variant-specific: a GLANCEABLE tool row — I/O preview shown AT REST. ──
function GlanceToolRow({ part }: { part: ToolPart }): JSX.Element {
	const [open, setOpen] = useState(false);
	const failed = part.status === "failed";
	const hasDiff = part.diff !== undefined;
	const canExpand = part.output !== undefined || hasDiff;
	return (
		<div data-ds-component="ToolRow" className={failed ? "border-s-2 border-[var(--status-error)] ps-[9px]" : ""}>
			{/* biome-ignore lint/a11y/useSemanticElements: a diff chip button nests inside; role/button avoids invalid nested-button DOM. */}
			<div
				role={canExpand ? "button" : undefined}
				tabIndex={canExpand ? 0 : undefined}
				onClick={canExpand ? () => setOpen((v) => !v) : undefined}
				onKeyDown={canExpand ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } } : undefined}
				className={`flex items-baseline gap-[9px] py-[3px] text-[13px] ${canExpand ? "cursor-pointer" : ""}`}
			>
				<span className="translate-y-[2px] text-[var(--text-tertiary)]"><ToolGlyph kind={part.toolKind} /></span>
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline gap-[9px]">
						<span className="shrink-0 font-[500] text-[var(--text-secondary)]">{part.verb}</span>
						{part.target ? <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-tertiary)]">{part.target}</span> : null}
					</div>
					{/* the I/O preview line — the glanceable substance */}
					{part.preview ? (
						<div className={`mt-[3px] truncate font-mono text-[11px] ${failed ? "text-[var(--status-error)]" : "text-[var(--text-tertiary)]"}`}>
							{failed ? "✗ " : "→ "}{part.preview}
						</div>
					) : null}
				</div>
				{part.diff ? (
					<button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} className="inline-flex shrink-0 items-center gap-[6px] self-start rounded-[var(--r-pill)] border border-[var(--border-subtle)] px-[9px] py-[3px] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]">
						<DiffStat added={part.diff.added} removed={part.diff.removed} />
					</button>
				) : null}
				{canExpand && !hasDiff ? <Caret open={open} /> : null}
				<span className="self-start translate-y-[3px]"><StatusGlyph status={part.status} /></span>
			</div>
			{open && hasDiff ? <InlineDiff /> : null}
			{open && !hasDiff && part.output ? (
				<pre className={`ms-[24px] mt-[3px] max-h-64 overflow-auto whitespace-pre-wrap border-s ps-[12px] py-[6px] font-mono text-[12px] leading-[1.5] text-[var(--text-secondary)] ${failed ? "border-[var(--status-error)]" : "border-[var(--border-subtle)]"}`}>
					{part.output}
				</pre>
			) : null}
		</div>
	);
}

// ── Sub-agent row — shows its nested mini-stream inline (aspect j). ──
function SubAgentRow({ part }: { part: ToolPart }): JSX.Element {
	return (
		<div data-ds-component="ToolRow" className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[9px] py-[6px]">
			<div className="flex items-center gap-[9px] text-[13px]">
				<span className="text-[var(--accent-primary)]"><ToolGlyph kind="sub-agent" /></span>
				<span className="font-[500] text-[var(--text-secondary)]">{part.verb}</span>
				<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-tertiary)]">{part.target}</span>
				<span className="inline-flex items-center gap-[4px] text-[11px] text-[var(--text-tertiary)]"><StatusGlyph status="running" /> Background</span>
			</div>
			{part.subStream ? (
				<div className="ms-[21px] mt-[3px] flex flex-col gap-[3px] border-s border-[var(--border-subtle)] ps-[9px]">
					{part.subStream.map((s) => (
						<div key={s.target} className="flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
							<span className="font-[500] text-[var(--text-secondary)]">{s.verb}</span>
							<span className="truncate font-mono text-[11px]">{s.target}</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

// ── SOFT aggregate — verb header, rows stay visible beneath a hairline. ──
function SoftAggregate({ tools }: { tools: readonly ToolPart[] }): JSX.Element {
	return (
		<div data-ds-component="ToolAggregate">
			<div className="flex items-center gap-[9px] py-[3px] text-[12px] text-[var(--text-tertiary)]">
				<span className="font-[500]">{aggregateVerb(tools)}</span>
				<span className="h-px flex-1 bg-[var(--border-subtle)]" />
				<span className="font-mono tabular-nums">{tools.length}</span>
			</div>
			<div className="flex flex-col">
				{tools.map((t) => <GlanceToolRow key={t.id} part={t} />)}
			</div>
		</div>
	);
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

function renderSingle(part: SessionPart): JSX.Element {
	if (part.kind === "tool") return part.toolKind === "sub-agent" ? <SubAgentRow part={part} /> : <GlanceToolRow part={part} />;
	if (part.kind === "permission") return <PermissionPrompt part={part as PermissionPart} />;
	if (part.kind === "plan") return <PlanList part={part as PlanPart} />;
	if (part.kind === "artifact") return <ArtifactChip part={part} />;
	if (part.kind === "reasoning") return <ReasoningFold durationMs={part.durationMs} text={part.text} />;
	if (!part.author.isAgent) return <HumanBubble text={part.text} />;
	return <AgentProse text={part.text} streaming={"streaming" in part && part.streaming === true} />;
}

function GlanceStream(): JSX.Element {
	const blocks: StreamBlock[] = blockStream(SESSION_PARTS, 3);
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
						{b.kind === "tool-run" ? <SoftAggregate tools={b.tools} /> : renderSingle(b.part)}
						{b.kind === "single" && b.part.id === "a3" ? <CostTick /> : null}
					</div>
				);
			})}
		</div>
	);
}

export function GlanceableActivity(): JSX.Element {
	return (
		<div className="flex h-[900px] w-full flex-col bg-[var(--surface-page)]" style={{ fontFamily: "var(--font-sans)" }}>
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
			<div className="relative flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-[760px] flex-col gap-[12px] px-[24px] py-[18px]">
					<GlanceStream />
					{QUEUED.map((q) => <QueuedBubble key={q.id} text={q.text} />)}
				</div>
				<div className="pointer-events-none absolute inset-x-0 bottom-[12px] flex justify-center">
					<div className="pointer-events-auto"><ScrollToBottomPill /></div>
				</div>
			</div>
			<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[12px]">
				<div className="mx-auto max-w-[760px]"><SessionComposer running elapsedLabel={SESSION_META.elapsedLabel} /></div>
			</div>
		</div>
	);
}
