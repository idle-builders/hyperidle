export type ProductObjectKind =
	| "team"
	| "task"
	| "agent"
	| "thread"
	| "document"
	| "review"
	| "session";
export const PRODUCT_OBJECT_KINDS = "team task agent thread document review session".split(
	" ",
) as ProductObjectKind[];
export type OpenIntent = "navigate" | "inspect" | "act";
export type ObjectPresentation = "page" | "pane" | "overlay";

export function presentationFor(_kind: ProductObjectKind, intent: OpenIntent): ObjectPresentation {
	return intent === "navigate" ? "page" : intent === "inspect" ? "pane" : "overlay";
}
