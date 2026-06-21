/**
 * AM1 — Embed → render mapping (shared by the per-kind Part renderers).
 *
 * Maps the closed `Embed` set onto the design-system render vocabulary:
 *   artifact/diff       → <ReferenceChip kind="artifact">  → onOpen(target)
 *   block               → <ReferenceChip kind="block">     → onOpen(target) (title only)
 *   entity-ref (knowledge_item) → <ReferenceChip kind="knowledge"> → onOpen(target)
 *   entity-ref (other)  → <ReferenceChip kind="block">     → onOpen(target)
 *   session-reference   → <Fold cta="Show session">        → onOpen({route:"session"})
 *   mention             → inline accent token (no chip)
 *   unknown             → non-navigating inline label (no affordance, no onOpen)
 *
 * @lore AM1: this file imports ONLY `Embed`/`OpenHandler` from the source-
 * agnostic Part vocabulary — never `Message`/`InlineRef` (W1 lint boundary).
 */

import { Fold, ReferenceChip } from "@hyperidle/design-system";
import type { Embed, OpenHandler } from "@hyperidle/shared";
import type { JSX } from "react";

/** Render a single Embed. Returns null for embeds with no inline render (mention is rendered inline by prose). */
export function renderEmbed(embed: Embed, key: string, onOpen: OpenHandler): JSX.Element | null {
	switch (embed.kind) {
		case "artifact":
			return (
				<ReferenceChip
					key={key}
					kind="artifact"
					label={embed.label}
					meta={embed.meta}
					mode="posted"
					onOpen={() => onOpen(embed.target)}
				/>
			);
		case "diff":
			return (
				<ReferenceChip
					key={key}
					kind="artifact"
					label={embed.label}
					meta={embed.meta}
					mode="posted"
					onOpen={() => onOpen(embed.target)}
				/>
			);
		case "block":
			return (
				<ReferenceChip
					key={key}
					kind="block"
					label={embed.title}
					mode="posted"
					onOpen={() => onOpen(embed.target)}
				/>
			);
		case "entity-ref":
			return (
				<ReferenceChip
					key={key}
					kind={embed.entityKind === "knowledge_item" ? "knowledge" : "block"}
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
				<span key={key} className="text-[13px] text-[var(--text-tertiary)]">
					{embed.label}
				</span>
			);
	}
}

/** Render the non-mention embeds of a Part as a horizontal wrapping row. */
export function EmbedRow({
	embeds,
	onOpen,
}: {
	embeds: ReadonlyArray<Embed>;
	onOpen: OpenHandler;
}): JSX.Element | null {
	const rendered = embeds
		.map((embed, i) => renderEmbed(embed, `embed-${i}`, onOpen))
		.filter((el): el is JSX.Element => el !== null);
	if (rendered.length === 0) return null;
	return <div className="mt-[6px] flex flex-wrap items-center gap-[6px]">{rendered}</div>;
}
