/**
 * @lore BC3 architecture.md §3.1: `Message.payload` is `z.unknown()` on the
 * wire — the output schema never validates it, `Message.type` decides the
 * shape (R8's flat-input reasoning applies to the output side too: a typed
 * `payload` keyed by `type` would need a discriminated union the render
 * layer would have to re-derive anyway). `parseMessagePayload` does the
 * parse; these four helpers are the one-audited-cast-per-shape the house
 * rule asks for (`.claude/rules/typescript.md`: "contain ONE audited cast
 * inside a typed helper") — each pins its return type to exactly the two
 * shapes a message of that `type` can carry, so a caller's own
 * `isRedactedPayload` check narrows correctly instead of the four-arm union
 * `parseMessagePayload` itself returns.
 */

import {
	type Message,
	type PlainPayload,
	type PlainReadPayload,
	parseMessagePayload,
	type QuestionnairePayload,
	type RedactedPayload,
	type ReviewPayload,
	type VerdictPayload,
} from "@hyperidle/domain-model";

export function plainPayloadOf(message: Message): PlainPayload | RedactedPayload {
	return parseMessagePayload("plain", message.payload) as PlainPayload | RedactedPayload;
}

/**
 * `notice`/`toolCalls` ride only the READ side of a plain payload
 * (`plainReadPayloadSchema`, R9) — a historical-render concern for
 * `AssistantOverlay`, never a write. `PlainReadPayload` is the domain-model
 * barrel's own inferred type for that schema (`actions/thread.ts`), re-used
 * here rather than redeclared, even though `parseMessagePayload`'s declared
 * return type is `PlainPayload | RedactedPayload` for a `"plain"` message —
 * its runtime parse uses the read schema, so the cast below narrows to the
 * wider read shape.
 */
export function plainReadPayloadOf(message: Message): PlainReadPayload | RedactedPayload {
	return parseMessagePayload("plain", message.payload) as PlainReadPayload | RedactedPayload;
}

export function reviewPayloadOf(message: Message): ReviewPayload | RedactedPayload {
	return parseMessagePayload("review", message.payload) as ReviewPayload | RedactedPayload;
}

export function questionnairePayloadOf(message: Message): QuestionnairePayload | RedactedPayload {
	return parseMessagePayload("questionnaire", message.payload) as
		| QuestionnairePayload
		| RedactedPayload;
}

export function verdictPayloadOf(message: Message): VerdictPayload | RedactedPayload {
	return parseMessagePayload("verdict", message.payload) as VerdictPayload | RedactedPayload;
}
