/**
 * @lore BC5 T10: the inbox carries a `ChangeRow` now, not a notification type
 * — there is no registry of type keys left to label from. This file derives
 * the popover row's label and link straight off the change's `object`/`kind`
 * (architecture.md §8: "renders the change row, links to the object").
 */

import type { ChangeObject, ChangeRow } from "@hyperidle/domain-model";

const OBJECT_LABELS: Record<ChangeObject, string> = {
	task: "Task",
	thread: "Conversation",
	document: "Document",
	user: "User",
};

/** e.g. "Task changed", "Conversation message", "Document created". */
export function titleForChange(change: ChangeRow): string {
	const kindWord = change.kind === "message" ? "message" : change.kind;
	return `${OBJECT_LABELS[change.object]} ${kindWord}`;
}

/** In-app route to the object a change happened to. */
export function linkForChange(change: ChangeRow): string {
	switch (change.object) {
		case "task":
			return `/work/task/${change.objectId}`;
		case "thread":
			return `/conversations/${change.objectId}`;
		case "document":
			return `/documents/${change.objectId}`;
		case "user":
			return `/agents/${change.objectId}`;
	}
}
