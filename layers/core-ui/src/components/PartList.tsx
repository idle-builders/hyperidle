/**
 * AM1 — PartList: the source-agnostic conversation renderer.
 *
 * Author-groups a `Part[]` (via `groupParts`), then exhaustively dispatches
 * each Part to its per-kind renderer. The renderer imports ONLY the
 * source-agnostic `Part`/`OpenHandler` vocabulary — NEVER `Message`,
 * `InlineRef`, or any `harness` type. That import-absence is the AM1↔AM3
 * reuse boundary (AC5), enforced statically by a scoped `no-restricted-imports`
 * ESLint rule (eslint.config.ts, W1). A second adapter (`derivePartsFromSession`)
 * feeds the SAME `Part[]` with zero change here.
 *
 * @lore AM1: dispatch is exhaustive with an `unknown` fallback that NEVER
 * throws — a future drifted PartKind degrades quietly (mirrors Block `unknown`).
 * `assertNeverPart` gives compile-time exhaustiveness AND a runtime UnknownPart.
 */

import type { OpenHandler, Part } from "@hyperidle/conversation-parts";
import { groupParts } from "@hyperidle/conversation-parts";
import { clockTime } from "@hyperidle/presentation-format";
import type { JSX } from "react";
import { ProsePart } from "./parts/ProsePart.js";
import { QuestionnairePart } from "./parts/QuestionnairePart.js";
import { ReasoningPart } from "./parts/ReasoningPart.js";
import { ReviewRequestPart } from "./parts/ReviewRequestPart.js";
import { ReviewResolvedPart } from "./parts/ReviewResolvedPart.js";
import { ToolPart } from "./parts/ToolPart.js";
import { UnknownPart } from "./parts/UnknownPart.js";

/** Compile-time exhaustiveness guard; renders UnknownPart at runtime (no throw). */
function assertNeverPart(_value: never): JSX.Element {
	return <UnknownPart />;
}

function renderPart(part: Part, onOpen: OpenHandler): JSX.Element {
	switch (part.kind) {
		case "prose":
			return <ProsePart part={part} onOpen={onOpen} />;
		case "review":
			return <ReviewRequestPart part={part} onOpen={onOpen} />;
		case "resolved":
			return <ReviewResolvedPart part={part} onOpen={onOpen} />;
		case "questionnaire":
			return <QuestionnairePart part={part} />;
		case "tool":
			// AM3: tool Part — bare one-liner row; per-kind icon; expand-to-output.
			return <ToolPart part={part} onOpen={onOpen} />;
		case "reasoning":
			// AM3: reasoning Part — collapsed "Thought for Ns"; expand to quiet prose.
			return <ReasoningPart part={part} />;
		case "unknown":
			return <UnknownPart part={part} />;
		default:
			return assertNeverPart(part);
	}
}

/**
 * Two-letter initials from an author name (first + last word).
 * Exported so `SessionView` can reuse it without duplication (AM3 warning fix).
 */
export function initialsOf(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
	const first = words[0] ?? "";
	const last = words[words.length - 1] ?? "";
	return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

/**
 * Per-author round avatar — the repeatable conversation/session pattern:
 * GREEN (accent) for an agent, GREY (neutral) for a human. (AM3 unification —
 * the same Avatar treatment as the ConversationSurface header.)
 */
function GroupAvatar({ name, isAgent }: { name: string; isAgent: boolean }): JSX.Element {
	const tint = isAgent
		? "bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]"
		: "bg-[var(--surface-container)] border-[var(--border-default)] text-[var(--text-secondary)]";
	return (
		<span
			aria-hidden="true"
			data-ds-component="GroupAvatar"
			className={`inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-pill)] border text-[10px] font-[600] ${tint}`}
		>
			{initialsOf(name)}
		</span>
	);
}

export interface PartListProps {
	parts: ReadonlyArray<Part>;
	onOpen: OpenHandler;
}

export function PartList({ parts, onOpen }: PartListProps): JSX.Element {
	const groups = groupParts(parts);
	return (
		<div data-ds-component="PartList" className="flex flex-col gap-[18px]">
			{groups.map((group) => {
				const head = group.parts[0];
				const isAgent = group.author.isAgent;
				// ONLY my own messages are highlighted: right-bound grey box. Everyone
				// else — other people AND agents — reads left-aligned and plain. The
				// avatar tint (green agent / grey human) carries the who; the box/side
				// carries the it's-me. One pattern, shared by conversation + session.
				const isSelf = group.author.isMe;
				return (
					<div
						key={head?.id ?? group.author.id}
						data-ds-component="PartGroup"
						data-ds-sender={isAgent ? "agent" : "human"}
						{...(isAgent ? { "data-ds-agent": "true" } : {})}
						{...(isSelf ? { "data-ds-self": "true" } : {})}
						className={`flex flex-col ${isSelf ? "items-end" : ""}`}
					>
						<div className={`flex flex-col gap-[9px] ${isSelf ? "max-w-[80%]" : ""}`}>
							<div className="flex items-center gap-[9px]">
								<GroupAvatar name={group.author.name} isAgent={isAgent} />
								<span className="text-[13px] font-[600] text-[var(--text-primary)]">
									{group.author.name}
								</span>
								{isSelf && (
									<span className="text-[11px] font-[500] text-[var(--text-tertiary)]">You</span>
								)}
								{head && (
									<span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
										{clockTime(head.createdAt)}
									</span>
								)}
							</div>
							<div
								className={
									isSelf
										? "flex flex-col gap-[12px] rounded-[var(--r-default)] bg-[var(--surface-container)] px-[12px] py-[9px] text-left"
										: "flex flex-col gap-[12px]"
								}
							>
								{group.parts.map((part) => (
									<div key={part.id}>{renderPart(part, onOpen)}</div>
								))}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
