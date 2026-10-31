/**
 * What the `?app=` address names: a document that is an app (by its id alone), a task whose
 * description is one, or a message that is one, with the conversation it is in so the pane can
 * read it from anywhere.
 */
export type AppRef =
	| { readonly kind: "document"; readonly id: string }
	| { readonly kind: "task"; readonly id: string }
	| { readonly kind: "message"; readonly threadId: string; readonly id: string };

export function appParam(ref: AppRef): string {
	if (ref.kind === "document") return ref.id;
	if (ref.kind === "task") return `task:${ref.id}`;
	return `message:${ref.threadId}:${ref.id}`;
}

export function readAppParam(param: string): AppRef {
	if (param.startsWith("task:")) return { kind: "task", id: param.slice(5) };
	const message = /^message:([^:]+):(.+)$/.exec(param);
	if (message?.[1] && message[2]) return { kind: "message", threadId: message[1], id: message[2] };
	return { kind: "document", id: param };
}
