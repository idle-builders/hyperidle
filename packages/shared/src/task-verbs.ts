/**
 * L15 — Request verb derivation + deterministic message body formatter.
 *
 * Closed enum at 5 verbs. The set of legal verbs for a given TaskState is
 * derived from a pure switch (exhaustive over TaskState). The L15 popover
 * renders one row per verb returned by `requestableVerbsFor`.
 *
 * @lore L15: lives in `@hyperidle/shared` because both web (popover) and
 * server/agents (parsing the deterministic line-1 body) need one source of
 * truth for the verb labels.
 */
import type { TaskState } from "./types.js";

export const REQUEST_VERBS = [
	"pause",
	"resume",
	"mark_blocked",
	"ready_for_review",
	"kill",
] as const;

export type RequestVerb = (typeof REQUEST_VERBS)[number];

/**
 * The verbs a human may request given the task's current state. Exhaustive
 * over TaskState — adding a new TaskState forces a decision here.
 */
export function requestableVerbsFor(state: TaskState): ReadonlyArray<RequestVerb> {
	switch (state) {
		case "proposed":
			return ["mark_blocked", "kill"];
		case "accepted":
			return ["pause", "mark_blocked", "kill"];
		case "hold":
			return ["resume", "kill"];
		case "in_progress":
			return ["pause", "mark_blocked", "ready_for_review", "kill"];
		case "blocked":
			return ["resume", "kill"];
		case "review":
			return ["mark_blocked", "kill"];
		case "done":
			return [];
		case "killed":
			return [];
	}
}

/** Human-readable label for a request verb. */
export function verbDisplayLabel(verb: RequestVerb): string {
	switch (verb) {
		case "pause":
			return "Pause";
		case "resume":
			return "Resume";
		case "mark_blocked":
			return "Mark blocked";
		case "ready_for_review":
			return "Ready for review";
		case "kill":
			return "Kill";
	}
}

export interface FormatRequestMessageBodyArgs {
	actorName: string;
	verb: RequestVerb;
	note?: string;
}

/**
 * Deterministic message body the popover posts as a `plain` message. Line 1
 * is parseable by an agent regex; line 2 is freeform human note (omitted
 * when empty after trim).
 */
export function formatRequestMessageBody(args: FormatRequestMessageBodyArgs): string {
	const line1 = `@${args.actorName} requested: ${verbDisplayLabel(args.verb)}`;
	const trimmed = (args.note ?? "").trim();
	if (trimmed.length === 0) {
		return line1;
	}
	return `${line1}\n${trimmed}`;
}
