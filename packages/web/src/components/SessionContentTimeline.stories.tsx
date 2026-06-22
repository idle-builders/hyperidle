/**
 * AM3 — Variant 3: ACTIVITY TIMELINE.
 *
 * Rendering axis: TIMELINE-GUTTER GRAMMAR + SIDE REVEAL. Instead of flat indented
 * rows, an agent turn is threaded by a continuous left GUTTER rail; every tool call
 * is a NODE on that rail (its per-kind icon IS the node), and the prose/answer sits
 * to the right of the gutter as a single flowing turn. The structure of the work —
 * what happened in what order — is carried spatially by the rail, so the eye reads
 * the turn as one threaded unit, not a stack of disconnected rows. Tool I/O and
 * diffs DON'T expand inline (which would break the rail) — selecting a node opens a
 * docked REVEAL PANEL on the right showing that node's output / diff via the
 * ReviewCodeDiff vocabulary. The rail keeps its shape; the detail lives beside it.
 *
 * Demonstrates the full taxonomy (concept Part 7), same fixture as Variants 1 & 2 —
 * here tool calls are gutter nodes and detail reveals to the side, vs fold (V1) /
 * inline preview (V2).
 */

import { type JSX, useState } from "react";
import {
	aggregateVerb,
	AgentProse,
	ArtifactChip,
	blockStream,
	CostTick,
	DiffStat,
	HumanBubble,
	type PermissionPart,
	PermissionPrompt,
	type PlanPart,
	PlanList,
	QUEUED,
	QueuedBubble,
	SESSION_META,
	SESSION_PARTS,
	type SessionPart,
	SessionComposer,
	SessionStatusBar,
	StatusGlyph,
	type StreamBlock,
	type ToolPart,
	ToolGlyph,
} from "./sessionContentFixtures.js";

export default { title: "Session View · 3 · Activity Timeline", group: "Conversations" as const };

interface Selection {
	readonly verb: string;
	readonly target: string;
	readonly output?: string;
	readonly diff?: { readonly label: string; readonly added: number; readonly removed: number };
	readonly failed: boolean;
}

// ── A gutter NODE — the rail dot/icon for one tool call, clickable to reveal. ──
function GutterNode({ part, selected, onSelect }: { part: ToolPart; selected: boolean; onSelect: () => void }): JSX.Element {
	const failed = part.status === "failed";
	const tone = failed ? "var(--status-error)" : part.status === "running" ? "var(--accent-secondary)" : "var(--text-tertiary)";
	const canReveal = part.output !== undefined || part.diff !== undefined;
	return (
		<div className="relative flex items-start gap-[12px]">
			{/* the rail + node */}
			<div className="relative flex w-[20px] shrink-0 justify-center">
				<span className="absolute top-0 bottom-[-6px] w-px bg-[var(--border-subtle)]" />
				<span
					className="relative z-[1] mt-[3px] flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-[var(--surface-page)]"
					style={{ borderColor: tone, color: tone }}
				>
					<ToolGlyph kind={part.toolKind} size={10} />
				</span>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: nested diff stat; role/button avoids invalid nested-button DOM. */}
			<div
				role={canReveal ? "button" : undefined}
				tabIndex={canReveal ? 0 : undefined}
				onClick={canReveal ? onSelect : undefined}
				onKeyDown={canReveal ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } } : undefined}
				className={`flex min-w-0 flex-1 items-baseline gap-[9px] rounded-[var(--r-subtle)] px-[6px] py-[3px] text-[13px] ${canReveal ? "cursor-pointer" : ""} ${selected ? "bg-[var(--accent-primary-dim)]" : canReveal ? "hover:bg-[var(--surface-container)]" : ""}`}
			>
				<span className="shrink-0 font-[500] text-[var(--text-secondary)]">{part.verb}</span>
				{part.target ? <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-tertiary)]">{part.target}</span> : <span className="flex-1" />}
				{part.diff ? <DiffStat added={part.diff.added} removed={part.diff.removed} /> : null}
				<span className="translate-y-[2px]"><StatusGlyph status={part.status} /></span>
			</div>
		</div>
	);
}

// ── Prose threaded into the rail (a gutter spacer keeps it aligned). ──
function GutterProse({ children }: { children: JSX.Element }): JSX.Element {
	return (
		<div className="flex items-start gap-[12px]">
			<div className="relative flex w-[20px] shrink-0 justify-center"><span className="absolute top-0 bottom-[-6px] w-px bg-[var(--border-subtle)]" /></div>
			<div className="min-w-0 flex-1 pb-[3px]">{children}</div>
		</div>
	);
}

function aggregateOutput(tools: readonly ToolPart[]): Selection {
	return {
		verb: aggregateVerb(tools),
		target: `${tools.length} steps`,
		output: tools.map((t) => `${t.verb}  ${t.target ?? ""}${t.preview ? `\n   → ${t.preview}` : ""}`).join("\n\n"),
		failed: tools.some((t) => t.status === "failed"),
	};
}

// ── An aggregate node on the rail — one node, reveals all steps to the side. ──
function AggregateNode({ tools, selected, onSelect }: { tools: readonly ToolPart[]; selected: boolean; onSelect: () => void }): JSX.Element {
	const failed = tools.some((t) => t.status === "failed");
	return (
		<div className="relative flex items-start gap-[12px]">
			<div className="relative flex w-[20px] shrink-0 justify-center">
				<span className="absolute top-0 bottom-[-6px] w-px bg-[var(--border-subtle)]" />
				<span className="relative z-[1] mt-[3px] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-page)] text-[10px] font-[600] tabular-nums text-[var(--text-tertiary)]">{tools.length}</span>
			</div>
			<button type="button" onClick={onSelect} className={`flex min-w-0 flex-1 items-center gap-[9px] rounded-[var(--r-subtle)] px-[6px] py-[3px] text-left text-[13px] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ${selected ? "bg-[var(--accent-primary-dim)]" : "hover:bg-[var(--surface-container)]"}`}>
				<span className="font-[500]">{aggregateVerb(tools)}</span>
				{failed ? <StatusGlyph status="failed" /> : null}
			</button>
		</div>
	);
}

// ── The right-docked REVEAL PANEL — selected node's output / diff. ──
const REVEAL_HUNK: readonly { kind: "add" | "del" | "ctx"; old: string; neu: string; text: string }[] = [
	{ kind: "ctx", old: "115", neu: "115", text: "  return new Response(" },
	{ kind: "del", old: "116", neu: "", text: "    JSON.stringify({ content: text })," },
	{ kind: "add", old: "", neu: "116", text: "    JSON.stringify({ parts: [{ type: 'text', text }] })," },
	{ kind: "ctx", old: "117", neu: "117", text: "    { headers: streamHeaders }," },
	{ kind: "ctx", old: "118", neu: "118", text: "  );" },
];
const TINT: Record<"add" | "del" | "ctx", string> = {
	add: "bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]",
	del: "bg-[color-mix(in_oklab,var(--status-error)_10%,transparent)]",
	ctx: "",
};

function RevealPanel({ sel, onClose }: { sel: Selection; onClose: () => void }): JSX.Element {
	return (
		<aside className="flex w-[400px] shrink-0 flex-col border-s border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
			<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[12px] py-[9px]">
				<span className="text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">{sel.diff ? "Diff" : "Output"}</span>
				<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-primary)]">{sel.diff?.label ?? sel.target}</span>
				{sel.diff ? <DiffStat added={sel.diff.added} removed={sel.diff.removed} /> : null}
				<button type="button" onClick={onClose} aria-label="Close" className="rounded-[var(--r-subtle)] p-[3px] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]">
					<svg viewBox="0 0 12 12" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 3 L9 9 M9 3 L3 9" strokeLinecap="round" /></svg>
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{sel.diff ? (
					<div className="font-mono text-[12px] leading-[1.6]">
						<div className="bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] px-[12px] py-[3px] text-[11px] text-[var(--text-tertiary)]">@@ -115,4 +115,4 @@ streamChatResponse()</div>
						{REVEAL_HUNK.map((l) => (
							<div key={l.text} className={`flex ${TINT[l.kind]}`}>
								<span className="w-[34px] shrink-0 select-none px-[6px] text-right text-[var(--text-tertiary)] tabular-nums">{l.old}</span>
								<span className="w-[34px] shrink-0 select-none border-e border-[var(--border-subtle)] px-[6px] text-right text-[var(--text-tertiary)] tabular-nums">{l.neu}</span>
								<code className="flex-1 whitespace-pre pl-[9px] pr-[12px] text-[var(--text-primary)]">{l.text}</code>
							</div>
						))}
						<button type="button" className="m-[12px] rounded-[var(--r-pill)] border border-[var(--border-default)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]">Open full diff</button>
					</div>
				) : (
					<pre className={`m-0 whitespace-pre-wrap px-[12px] py-[9px] font-mono text-[12px] leading-[1.6] ${sel.failed ? "text-[var(--text-secondary)]" : "text-[var(--text-secondary)]"}`}>{sel.output}</pre>
				)}
			</div>
		</aside>
	);
}

function ReasoningFold({ durationMs, text }: { durationMs: number; text: string }): JSX.Element {
	const [open, setOpen] = useState(false);
	const secs = Math.round(durationMs / 1000);
	return (
		<div data-ds-component="ReasoningRow">
			<button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-[6px] py-[3px] text-[12px] font-[500] italic text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-secondary)]">
				Thought for {secs}s
			</button>
			{open ? <p className="mt-[3px] text-[13px] italic leading-[1.6] text-[var(--text-tertiary)]">{text}</p> : null}
		</div>
	);
}

function TimelineStream({ onSelect, selectedId }: { onSelect: (id: string, sel: Selection) => void; selectedId: string | null }): JSX.Element {
	const blocks: StreamBlock[] = blockStream(SESSION_PARTS, 2);
	return (
		<div data-ds-component="SessionStream" className="flex flex-col gap-[6px]">
			{blocks.map((b, i) => {
				if (b.kind === "tool-run") {
					const id = `agg-${i}`;
					return <AggregateNode key={id} tools={b.tools} selected={selectedId === id} onSelect={() => onSelect(id, aggregateOutput(b.tools))} />;
				}
				const part: SessionPart = b.part;
				if (part.kind === "tool") {
					const sel: Selection = { verb: part.verb, target: part.target ?? "", output: part.output, diff: part.diff, failed: part.status === "failed" };
					return <GutterNode key={part.id} part={part} selected={selectedId === part.id} onSelect={() => onSelect(part.id, sel)} />;
				}
				if (part.kind === "permission") return <div key={part.id} className="ms-[32px]"><PermissionPrompt part={part as PermissionPart} /></div>;
				if (part.kind === "plan") return <div key={part.id} className="ms-[32px]"><PlanList part={part as PlanPart} /></div>;
				if (part.kind === "artifact") return <div key={part.id} className="ms-[32px]"><ArtifactChip part={part} /></div>;
				if (part.kind === "reasoning") return <GutterProse key={part.id}><ReasoningFold durationMs={part.durationMs} text={part.text} /></GutterProse>;
				if (!part.author.isAgent) return <div key={part.id} className="py-[6px]"><HumanBubble text={part.text} /></div>;
				return (
					<GutterProse key={part.id}>
						<>
							<AgentProse text={part.text} streaming={"streaming" in part && part.streaming === true} />
							{part.id === "a3" ? <div className="mt-[6px]"><CostTick /></div> : null}
						</>
					</GutterProse>
				);
			})}
		</div>
	);
}

export function ActivityTimeline(): JSX.Element {
	const [selected, setSelected] = useState<{ id: string; sel: Selection } | null>({
		id: "t8",
		sel: { verb: "Run command", target: "npm test -- chat/stream", output: "FAIL  src/chat/__tests__/stream.test.ts\n  ● assembles a parts[] payload\n    Expected: [{ type: 'text', text: 'hi' }]\n    Received: undefined\n  appendMessage() still spreads the old { content } shape (line 88).\n\n  exit code 1", failed: true },
	});
	return (
		<div className="flex h-[900px] w-full flex-col bg-[var(--surface-page)]" style={{ fontFamily: "var(--font-sans)" }}>
			<header className="flex shrink-0 items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
				<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
					<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
					Session
				</span>
				<div className="min-w-0 flex-1">
					<div className="text-[12px] text-[var(--text-secondary)]">{SESSION_META.agent} · <span className="text-[var(--text-tertiary)]">{SESSION_META.host}</span></div>
					<h1 className="mt-[3px] mb-0 text-[16px] font-[600] leading-[1.25] text-[var(--text-primary)]">{SESSION_META.task}</h1>
				</div>
				<SessionStatusBar withCta />
			</header>
			{/* two panes: threaded stream + docked reveal panel */}
			<div className="flex min-h-0 flex-1">
				<div className="relative min-w-0 flex-1 overflow-y-auto">
					<div className="mx-auto flex max-w-[680px] flex-col gap-[6px] px-[24px] py-[18px]">
						<TimelineStream onSelect={(id, sel) => setSelected({ id, sel })} selectedId={selected?.id ?? null} />
						{QUEUED.map((q) => <div key={q.id} className="mt-[6px]"><QueuedBubble text={q.text} /></div>)}
					</div>
				</div>
				{selected ? <RevealPanel sel={selected.sel} onClose={() => setSelected(null)} /> : null}
			</div>
			<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[12px]">
				<div className="mx-auto max-w-[680px]"><SessionComposer running elapsedLabel={SESSION_META.elapsedLabel} /></div>
			</div>
		</div>
	);
}
