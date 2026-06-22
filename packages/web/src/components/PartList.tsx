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

import type { OpenHandler, Part } from "@hyperidle/shared";
import { clockTime, groupParts } from "@hyperidle/shared";
import type { JSX } from "react";
import { ProsePart } from "./parts/ProsePart.js";
import { QuestionnairePart } from "./parts/QuestionnairePart.js";
import { ReviewRequestPart } from "./parts/ReviewRequestPart.js";
import { ReviewResolvedPart } from "./parts/ReviewResolvedPart.js";
import { UnknownPart } from "./parts/UnknownPart.js";

const ICON_AGENT =
	"M8 1.5l1.1 3.4L12.5 6 9.1 7.1 8 10.5 6.9 7.1 3.5 6l3.4-1.1L8 1.5zM12.5 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z";

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
		case "unknown":
			return <UnknownPart part={part} />;
		default:
			return assertNeverPart(part);
	}
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
				return (
					<div
						key={head?.id ?? group.author.id}
						data-ds-component="PartGroup"
						data-ds-sender={group.author.isAgent ? "agent" : "human"}
						{...(group.author.isAgent ? { "data-ds-agent": "true" } : {})}
						className="flex flex-col gap-[12px]"
					>
						<div className="flex items-baseline gap-[9px]">
							<span className="text-[13px] font-[600] text-[var(--text-primary)]">
								{group.author.name}
							</span>
							{group.author.isAgent && (
								<span
									aria-label="Agent"
									title="Agent"
									className="flex items-center text-[var(--text-tertiary)]"
								>
									<svg
										viewBox="0 0 16 16"
										fill="currentColor"
										style={{ width: 11, height: 11 }}
										aria-hidden="true"
									>
										<path d={ICON_AGENT} />
									</svg>
								</span>
							)}
							{group.author.isMe && (
								<span className="text-[11px] font-[500] text-[var(--text-tertiary)]">You</span>
							)}
							{head && (
								<span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
									{clockTime(head.createdAt)}
								</span>
							)}
						</div>
						<div className="flex flex-col gap-[12px]">
							{group.parts.map((part) => (
								<div key={part.id}>{renderPart(part, onOpen)}</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
