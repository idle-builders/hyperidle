/**
 * AM3 — ToolPart renderer: one tool call the agent made.
 *
 * A bare one-liner row at rest:
 *   [per-kind icon] · verb · muted truncated target · (diff chip) · (open-session) · (▾) · status glyph
 * Output reveals as an indented capped mono `<pre>` on click.
 * Only `failed` uses the destructive color token (`--status-error`).
 *
 * Reuses `ReviewCodeDiff` for file diffs via the `diff` Embed's OpenTarget
 * (fires `onOpen`). No new diff renderer (AM3 hard-rule).
 *
 * @lore AM3: Agent-authored fields (`verb`/`target`/`output`) render as
 * React-escaped TEXT only — no `dangerouslySetInnerHTML` in the activity path
 * (AM3 security rule).
 */

import type { OpenHandler, Part } from "@hyperidle/conversation-parts";
import { type JSX, useState } from "react";

type ToolPartShape = Extract<Part, { kind: "tool" }>;

const TOOL_ICON: Record<string, string> = {
	command: "M3 4l3 3-3 3M8 10h5",
	"file-read":
		"M8 3.5C4.5 3.5 2 8 2 8s2.5 4.5 6 4.5S14 8 14 8 11.5 3.5 8 3.5zm0 6.5a2 2 0 110-4 2 2 0 010 4z",
	read: "M8 3.5C4.5 3.5 2 8 2 8s2.5 4.5 6 4.5S14 8 14 8 11.5 3.5 8 3.5zm0 6.5a2 2 0 110-4 2 2 0 010 4z",
	"file-change": "M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z",
	edit: "M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z",
	search: "M7 1.5a5.5 5.5 0 014.2 9l3 3-1 1-3-3A5.5 5.5 0 117 1.5z",
	"web-search":
		"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2 8h12M8 2a9 9 0 010 12M8 2a9 9 0 000 12",
	mcp: "M8 1.5l1.7 1V5l2 .9v2.2l-2 .9v2.5l-1.7 1-1.7-1V9l-2-.9V5.9l2-.9V2.5z",
	"sub-agent": "M4 2h8v4H4zM6 6v2M10 6v2M2 8h12v4a1 1 0 01-1 1H3a1 1 0 01-1-1z",
	create: "M8 3v10M3 8h10",
	// generic fallback
	generic: "M8 1.5l.9 2.8L12 5.5l-3.1 1.2-.9 2.8-.9-2.8L4 5.5l3.1-1.2.9-2.8z",
};

function ToolIcon({ kind }: { kind: string }): JSX.Element {
	const d = TOOL_ICON[kind] ?? TOOL_ICON.generic ?? "";
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-[13px] w-[13px] shrink-0"
			aria-hidden="true"
		>
			<path d={d} />
		</svg>
	);
}

function StatusGlyph({ status }: { status: ToolPartShape["status"] }): JSX.Element {
	if (status === "running") {
		return (
			<span
				role="img"
				aria-label="running"
				className="motion-activity inline-block h-[7px] w-[7px] shrink-0 rounded-[var(--r-pill)] bg-[var(--accent-secondary)] "
			/>
		);
	}
	if (status === "ok") {
		return (
			<svg
				viewBox="0 0 12 12"
				role="img"
				aria-label="ok"
				className="h-[11px] w-[11px] shrink-0 text-[var(--status-success)]"
			>
				<path
					d="M2.5 6.2 L5 8.5 L9.5 3.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}
	if (status === "failed") {
		return (
			<svg
				viewBox="0 0 12 12"
				role="img"
				aria-label="failed"
				className="h-[11px] w-[11px] shrink-0 text-[var(--status-error)]"
			>
				<path
					d="M3 3 L9 9 M9 3 L3 9"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
				/>
			</svg>
		);
	}
	return (
		<span role="img" aria-label="neutral" className="type-metadata   text-[var(--text-tertiary)]">
			–
		</span>
	);
}

function Caret({ open }: { open: boolean }): JSX.Element {
	return (
		<svg
			viewBox="0 0 12 12"
			className="motion-move h-[11px] w-[11px] shrink-0 text-[var(--text-tertiary)]  "
			style={{ transform: open ? "rotate(90deg)" : "none" }}
			aria-hidden="true"
		>
			<path
				d="M4 2.5 L8 6 L4 9.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ToolPart({
	part,
	onOpen,
}: {
	part: ToolPartShape;
	onOpen: OpenHandler;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	const canExpand = part.output !== undefined;

	// Find a diff Embed to show as a chip
	const diffEmbed = part.embeds.find((e) => e.kind === "diff");

	return (
		<div data-ds-component="ToolPart" data-ds-status={part.status}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: diff chip + open-session button nest inside; role/button avoids invalid nested-button DOM. */}
			<div
				role={canExpand ? "button" : undefined}
				tabIndex={canExpand ? 0 : undefined}
				onClick={canExpand ? () => setOpen((v) => !v) : undefined}
				onKeyDown={
					canExpand
						? (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									setOpen((v) => !v);
								}
							}
						: undefined
				}
				className={`type-small ${`flex items-center gap-[9px] py-[3px]  ${canExpand ? "cursor-pointer" : ""}`}`}
			>
				<span className="text-[var(--text-tertiary)]">
					<ToolIcon kind={part.toolKind} />
				</span>
				<span className="type-small shrink-0  text-[var(--text-secondary)]">{part.verb}</span>
				{part.target ? (
					<span className="type-data min-w-0 flex-1 truncate   text-[var(--text-tertiary)]">
						{part.target}
					</span>
				) : (
					<span className="flex-1" />
				)}

				{/* diff chip — fires onOpen with the diff Embed's target (opens ReviewCodeDiff) */}
				{diffEmbed?.kind === "diff" ? (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onOpen(diffEmbed.target);
						}}
						className="border-width-thin inline-flex shrink-0 items-center gap-[6px] rounded-[var(--r-pill)]  border-[var(--border-subtle)] px-[9px] py-[3px]   hover:border-[var(--border-default)]"
					>
						<span className="type-data   text-[var(--text-tertiary)]">
							{diffEmbed.label.split("/").pop()}
						</span>
						<span className="type-data  tabular-nums  ">
							<span className="type-small  text-[var(--status-success)]">
								{diffEmbed.meta.split("/")[0]}
							</span>{" "}
							<span className="type-small  text-[var(--status-error)]">
								{diffEmbed.meta.split("/")[1]}
							</span>
						</span>
					</button>
				) : null}

				{/* sub-agent → open nested session view */}
				{part.opensSession ? (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onOpen({ route: "session", sessionId: part.opensSession?.sessionId ?? "" });
						}}
						title={`Open the ${part.opensSession.label} session`}
						className="type-control border-width-thin inline-flex shrink-0 items-center gap-[6px] rounded-[var(--r-pill)]  border-[var(--border-subtle)] px-[9px] py-[3px]   text-[var(--text-secondary)]   hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
					>
						<svg
							viewBox="0 0 16 16"
							className="h-[11px] w-[11px]"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.3"
							aria-hidden="true"
						>
							<path
								d="M9 2.5h4.5V7M13.5 2.5L7 9M11 9.5V12a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 012 12V6a1.5 1.5 0 011.5-1.5H6"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						Open session
					</button>
				) : null}

				{canExpand ? <Caret open={open} /> : null}
				<StatusGlyph status={part.status} />
			</div>

			{/* expanded output — mono, capped height, failure gets destructive left rule */}
			{open && part.output ? (
				<pre
					className={`type-data ${`ms-[24px] mt-[3px] max-h-64 overflow-auto whitespace-pre-wrap  ps-[12px] py-[6px]    text-[var(--text-secondary)] ${
						part.status === "failed"
							? "border-[var(--status-error)]"
							: "border-[var(--border-subtle)]"
					}`}`}
				>
					{part.output}
				</pre>
			) : null}
		</div>
	);
}
