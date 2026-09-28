// @lore: Message.payload is z.unknown() on wire — Message.type decides shape; one audited cast per helper; isRedactedPayload check narrows correctly

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

// @lore: PlainReadPayload used not PlainPayload — runtime parse uses read schema; cast narrows to wider read shape that includes notice/toolCalls
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
