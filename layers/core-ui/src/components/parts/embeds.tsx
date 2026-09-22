/**
 * AM1 — Embed → render mapping (shared by the per-kind Part renderers).
 *
 * Maps the closed `Embed` set onto the design-system render vocabulary:
 *   artifact/diff       → <ReferenceChip kind="artifact">  → onOpen(target)
 *   block               → <ReferenceChip kind="block">     → onOpen(target) (title only)
 *   entity-ref (document)       → <ReferenceChip kind="document"> → onOpen(target)
 *   entity-ref (other)  → <ReferenceChip kind="block">     → onOpen(target)
 *   session-reference   → <Fold cta="Show session">        → onOpen({route:"session"})
 *   mention             → inline accent token (no chip)
 *   unknown             → non-navigating inline label (no affordance, no onOpen)
 *
 * @lore AM1: this file imports ONLY `Embed`/`OpenHandler` from the source-
 * agnostic Part vocabulary — never `Message`/`InlineRef` (W1 lint boundary).
 */

import type { JSX } from "react";
import { Fold, ReferenceChip } from "../../ds";
import type { Embed, OpenHandler } from ".";

/** Render a single Embed. Returns null for embeds with no inline render (mention is rendered inline by prose). */
export function renderEmbed(embed: Embed, key: string, onOpen: OpenHandler): JSX.Element | null {
	switch (embed.kind) {
		// A file diff has no destination — see the `diff` variant's own note in
		// `part.ts`. The chip names the file and its counts; it does not pretend
		// to open something.
		case "diff":
			return (
				<ReferenceChip
					key={key}
					kind="artifact"
					label={embed.label}
					meta={embed.meta}
					mode="posted"
				/>
			);
		case "entity-ref":
			return (
				<ReferenceChip
					key={key}
					kind={embed.entityKind === "document" ? "document" : "block"}
					label={embed.label}
					mode="posted"
					onOpen={() => onOpen(embed.target)}
				/>
			);
		case "session-reference":
			return (
				<Fold
					key={key}
					label={embed.summary}
					cta="Show session"
					onShow={() => onOpen({ route: "session", sessionId: embed.sessionId })}
				/>
			);
		case "mention":
			// Mentions render inline inside prose text, not as a standalone embed row.
			return null;
		case "unknown":
			// W5: a non-navigating reference (e.g. a message ref with no permalink route).
			return (
				<span key={key} className="type-small  text-[var(--text-tertiary)]">
					{embed.label}
				</span>
			);
	}
}

/**
 * Render the non-mention embeds of a Part. A session reference is NOT an
 * attachment — it links to the agent's work session — so it renders on its own
 * level, separate from the attachment chips (artifact/diff/block/document),
 * rather than mixed into one wrapping row.
 */
export function EmbedRow({
	embeds,
	onOpen,
}: {
	embeds: ReadonlyArray<Embed>;
	onOpen: OpenHandler;
}): JSX.Element | null {
	const sessionRefs = embeds.filter((e) => e.kind === "session-reference");
	const attachments = embeds.filter((e) => e.kind !== "session-reference" && e.kind !== "mention");
	const sessionEls = sessionRefs
		.map((embed, i) => renderEmbed(embed, `session-${i}`, onOpen))
		.filter((el): el is JSX.Element => el !== null);
	const attachmentEls = attachments
		.map((embed, i) => renderEmbed(embed, `attach-${i}`, onOpen))
		.filter((el): el is JSX.Element => el !== null);
	if (sessionEls.length === 0 && attachmentEls.length === 0) return null;
	return (
		<div className="mt-[6px] flex flex-col gap-[9px]">
			{sessionEls.length > 0 && <div className="flex flex-col gap-[6px]">{sessionEls}</div>}
			{attachmentEls.length > 0 && (
				<div className="flex flex-wrap items-center gap-[6px]">{attachmentEls}</div>
			)}
		</div>
	);
}
