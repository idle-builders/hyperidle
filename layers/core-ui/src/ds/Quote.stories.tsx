// AM5 — base-primitive foundation story: Quote (pure content).
// Thin wrapper over block/QuotePayload (children = nested BlockPayload[]).

import type { JSX } from "react";
import type { BlockPayload } from "../block/types.js";
import { QuotePayload } from "./block/QuotePayload.js";

export default { title: "Quote", group: "Blocks" as const };

const para = (text: string): BlockPayload => ({
	kind: "paragraph",
	inline: [{ type: "text", value: text }],
});

export const Single = (): JSX.Element => (
	<QuotePayload>{[para("Humans validate, agents execute.")]}</QuotePayload>
);

export const MultiLine = (): JSX.Element => (
	<QuotePayload>
		{[
			para("Density over whitespace. Whitespace is earned, not given."),
			para("One interaction grammar, built once and reused everywhere."),
		]}
	</QuotePayload>
);
