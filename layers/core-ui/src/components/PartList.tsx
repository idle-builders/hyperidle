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
import { Fragment, type JSX } from "react";
import { absoluteDate, clockTime } from "../utils/time.js";
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

function renderPart(
	part: Part,
	onOpen: OpenHandler,
	onAnswer: ((text: string) => void) | undefined,
	betId: string | null | undefined,
): JSX.Element {
	switch (part.kind) {
		case "prose":
			return <ProsePart part={part} onOpen={onOpen} />;
		case "review": {
			// UI-005: The "Open review" button is only available when the bet is resolvable.
			// pageBetId (from thread context) or part.reviewTarget.betId (non-empty) both suffice.
			const canOpen = (betId != null && betId !== "") || part.reviewTarget.betId !== "";
			return <ReviewRequestPart part={part} onOpen={onOpen} canOpen={canOpen} />;
		}
		case "resolved":
			return <ReviewResolvedPart part={part} onOpen={onOpen} />;
		case "questionnaire":
			// UI-004: onAnswer posts the chosen option as a plain message via onSend.
			return <QuestionnairePart part={part} onAnswer={onAnswer} />;
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
			className={`type-avatar-initial type-avatar-initial--sm inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-pill)] ${tint}`}
		>
			{initialsOf(name)}
		</span>
	);
}

export interface PartListProps {
	parts: ReadonlyArray<Part>;
	onOpen: OpenHandler;
	/**
	 * UI-004: when provided, clicking a questionnaire option posts it as a plain
	 * reply via this callback (wired to ConversationSurface's onSend at the page).
	 */
	onAnswer?: (text: string) => void;
	/**
	 * UI-005: bet that hosts the conversation. When null/absent, "Open review" is
	 * hidden on ReviewRequestParts whose own target also lacks a betId (avoids a
	 * dead-URL navigation).
	 */
	reviewBetId?: string | null;
}

/**
 * UI-104: Extract the locale-formatted date label (e.g. "Jun 17, 2026") for
 * display in the day separator. Display uses the viewer's local timezone.
 */
function groupDayLabel(group: ReturnType<typeof groupParts>[number]): string {
	const head = group.parts[0];
	if (!head?.createdAt) return "";
	return absoluteDate(head.createdAt);
}

/**
 * UI-104: UTC-based day key (YYYY-MM-DD) used for comparing whether two groups
 * fall on different calendar days. Using UTC avoids timezone edge cases where
 * `absoluteDate` (local time) maps timestamps near midnight onto the same
 * local day even though they crossed a UTC midnight boundary.
 *
 * @lore Day boundaries use UTC so the comparison is stable across timezones.
 * The display label (groupDayLabel) still uses local time so the user sees
 * their own date. The two are always consistent: a UTC boundary always
 * separates dates that differ by at least one UTC day, and the display label
 * always reflects the local date of the first message in the later group.
 */
function groupDayUTCKey(group: ReturnType<typeof groupParts>[number]): string {
	const head = group.parts[0];
	if (!head?.createdAt) return "";
	const epoch = Date.parse(head.createdAt);
	if (!Number.isFinite(epoch)) return "";
	return new Date(epoch).toISOString().slice(0, 10);
}

/**
 * UI-104: Day separator rendered between message groups from different calendar days.
 * Matches the slim "date divider" pattern used by chat apps — centred label on a
 * full-width rule so the eye reads the date at a glance.
 */
function DaySeparator({ label }: { label: string }): JSX.Element {
	return (
		<div
			data-ds-component="DaySeparator"
			aria-label={`Messages from ${label}`}
			className="flex items-center gap-[12px] py-[6px]"
		>
			<span className="flex-1 border-width-thin-t border-[var(--border-subtle)]" />
			<span className="type-metadata   text-[var(--text-tertiary)] tabular-nums">{label}</span>
			<span className="flex-1 border-width-thin-t border-[var(--border-subtle)]" />
		</div>
	);
}

export function PartList({ parts, onOpen, onAnswer, reviewBetId }: PartListProps): JSX.Element {
	const groups = groupParts(parts);
	return (
		<div data-ds-component="PartList" className="flex flex-col gap-[18px]">
			{groups.map((group, index) => {
				const head = group.parts[0];
				const isAgent = group.author.isAgent;
				// ONLY my own messages are highlighted: right-bound grey box. Everyone
				// else — other people AND agents — reads left-aligned and plain. The
				// avatar tint (green agent / grey human) carries the who; the box/side
				// carries the it's-me. One pattern, shared by conversation + session.
				const isSelf = group.author.isMe;

				// UI-104: show a day separator when this group's UTC calendar day differs from the
				// previous group's UTC day. Never fires for the first group (index 0) — there is
				// nothing to separate it from. The separator appears ABOVE the first group of a
				// new day so the eye reads "date" → "first message of that day".
				// UTC key is used for comparison so timezone-edge cases don't suppress separators.
				const thisDay = groupDayLabel(group);
				const thisDayKey = groupDayUTCKey(group);
				const prevDayKey = index > 0 ? groupDayUTCKey(groups[index - 1] ?? group) : thisDayKey;
				const showDaySeparator = index > 0 && thisDay !== "" && thisDayKey !== prevDayKey;

				const groupKey = head?.id ?? group.author.id;
				return (
					<Fragment key={groupKey}>
						{showDaySeparator && <DaySeparator label={thisDay} />}
						<div
							data-ds-component="PartGroup"
							data-ds-sender={isAgent ? "agent" : "human"}
							{...(isAgent ? { "data-ds-agent": "true" } : {})}
							{...(isSelf ? { "data-ds-self": "true" } : {})}
							className="flex flex-col"
						>
							<div className="flex flex-col gap-[9px]">
								<div className="flex items-center gap-[9px]">
									<GroupAvatar name={group.author.name} isAgent={isAgent} />
									<span className="type-small   text-[var(--text-primary)]">
										{group.author.name}
									</span>
									{isSelf && (
										<span className="type-metadata   text-[var(--text-tertiary)]">You</span>
									)}
									{head && (
										<span className="type-metadata  tabular-nums text-[var(--text-tertiary)]">
											{clockTime(head.createdAt)}
										</span>
									)}
								</div>
								<div className="flex flex-col gap-[12px]">
									{group.parts.map((part) => (
										<div key={part.id}>{renderPart(part, onOpen, onAnswer, reviewBetId)}</div>
									))}
								</div>
							</div>
						</div>
					</Fragment>
				);
			})}
		</div>
	);
}
