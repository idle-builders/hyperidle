// @lore: ChangeRow-based — no notification type registry; labels and links derived from change.object/kind

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
