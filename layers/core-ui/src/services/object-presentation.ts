// @lore BB1: "bet" removed — a bet is a task with no parent.
// @lore artifacts-become-knowledge: "artifact" removed — produced content is a
// knowledge item; there is no separate artifact navigable surface.
export type ProductObjectKind =
	| "team"
	| "task"
	| "routine"
	| "agent"
	| "thread"
	| "document"
	| "review"
	| "session";
export const PRODUCT_OBJECT_KINDS = "team task routine agent thread document review session".split(
	" ",
) as ProductObjectKind[];
export type OpenIntent = "navigate" | "inspect" | "act";
export type ObjectPresentation = "page" | "pane" | "overlay";

export function presentationFor(_kind: ProductObjectKind, intent: OpenIntent): ObjectPresentation {
	return intent === "navigate" ? "page" : intent === "inspect" ? "pane" : "overlay";
}
