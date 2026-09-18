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

import type { CanvasArtifactRef, EntityRef, InlineRef } from "@hyperidle/domain-model";
import {
	type Message,
	type PlainPayload,
	type QuestionnairePayload,
	type RedactedPayload,
	type ReviewPayload,
	type VerdictPayload,
	parseMessagePayload,
} from "@hyperidle/domain-model";

export function plainPayloadOf(message: Message): PlainPayload | RedactedPayload {
	return parseMessagePayload("plain", message.payload) as PlainPayload | RedactedPayload;
}

export function reviewPayloadOf(message: Message): ReviewPayload | RedactedPayload {
	return parseMessagePayload("review", message.payload) as ReviewPayload | RedactedPayload;
}

export function questionnairePayloadOf(
	message: Message,
): QuestionnairePayload | RedactedPayload {
	return parseMessagePayload("questionnaire", message.payload) as
		| QuestionnairePayload
		| RedactedPayload;
}

export function verdictPayloadOf(message: Message): VerdictPayload | RedactedPayload {
	return parseMessagePayload("verdict", message.payload) as VerdictPayload | RedactedPayload;
}

/** The wire shape `PlainPayload["refs"]` carries — `mentionRefSchema.sourceText`
 * is optional there even though domain-model's own `MentionRef.sourceText` is
 * required (a real drift between `actions/thread.ts` and `thread.ts`, both
 * outside this package — see the BC3 builder report). `EntityRef`/
 * `CanvasArtifactRef` entries are structurally identical either way and pass
 * through untouched; a `mention` entry with no `sourceText` cannot be located
 * in the message text regardless, so it is dropped rather than rendered with
 * a fabricated span. */
type WireRef =
	| { kind: "mention"; identityId: string; displayName: string; sourceText?: string }
	| EntityRef
	| CanvasArtifactRef;

export function toInlineRefs(refs: readonly WireRef[] | undefined): ReadonlyArray<InlineRef> | undefined {
	if (refs === undefined) return undefined;
	const out: InlineRef[] = [];
	for (const ref of refs) {
		if (ref.kind === "mention") {
			if (typeof ref.sourceText === "string") {
				out.push({
					kind: "mention",
					identityId: ref.identityId,
					displayName: ref.displayName,
					sourceText: ref.sourceText,
				});
			}
			continue;
		}
		out.push(ref);
	}
	return out;
}
