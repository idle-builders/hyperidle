/**
 * AM1 — UnknownPart: the quiet fallback for an unrecognised source shape.
 *
 * A redacted payload or a wire-unrecognised message type degrades to this
 * one-line placeholder (never throws — mirrors Block `unknown`). The
 * exhaustive `assertNeverPart` in PartList also renders this at runtime.
 */

import type { Part } from "@hyperidle/conversation-parts";
import type { JSX } from "react";

type UnknownPartValue = Extract<Part, { kind: "unknown" }>;

export function UnknownPart({ part }: { part?: UnknownPartValue }): JSX.Element {
	const label = part?.reason === "redacted" ? "Message redacted" : "Unsupported message";
	return (
		<div data-ds-component="UnknownPart" className="type-small  italic text-[var(--text-tertiary)]">
			{label}
		</div>
	);
}
