/**
 * AM1 — ProsePart: a plain text body + inline mention accents + ref embeds.
 *
 * Mentions render inline as accent tokens (the `mention` Embed abstracts the
 * source `MentionRef` to `{identityId, displayName}`, so this file needs no
 * source type — W1 boundary). Other embeds render as a ReferenceChip / Fold row.
 */

import type { Embed, OpenHandler, Part } from "@hyperidle/shared";
import type { JSX } from "react";
import { EmbedRow } from "./embeds.js";

type ProsePartValue = Extract<Part, { kind: "prose" }>;

/** Highlight each `@displayName` mention span inside the prose text. */
function renderText(text: string, mentions: ReadonlyArray<{ displayName: string }>): JSX.Element {
	if (mentions.length === 0) {
		return <>{text}</>;
	}
	// Build a single alternation over the mention tokens (longest first to avoid
	// partial overlaps), splitting the text into plain + accent segments.
	const tokens = Array.from(new Set(mentions.map((m) => `@${m.displayName}`))).sort(
		(a, b) => b.length - a.length,
	);
	const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const re = new RegExp(`(${escaped.join("|")})`, "g");
	const segments = text.split(re);
	return (
		<>
			{segments.map((seg, i) =>
				tokens.includes(seg) ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: stable positional segments — text split order is deterministic
					<span key={i}
						className="rounded-[var(--r-subtle)] bg-[var(--accent-primary-dim)] px-[3px] font-[500] text-[var(--accent-primary)]"
					>
						{seg}
					</span>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: stable positional segments
					<span key={i}>{seg}</span>
				),
			)}
		</>
	);
}

export function ProsePart({
	part,
	onOpen,
}: {
	part: ProsePartValue;
	onOpen: OpenHandler;
}): JSX.Element {
	const mentions = part.embeds.filter(
		(e): e is Extract<Embed, { kind: "mention" }> => e.kind === "mention",
	);
	return (
		<div data-ds-component="ProsePart">
			<p className="m-0 text-[15px] leading-[1.55] text-[var(--text-primary)]">
				{renderText(part.text, mentions)}
			</p>
			<EmbedRow embeds={part.embeds} onOpen={onOpen} />
		</div>
	);
}
