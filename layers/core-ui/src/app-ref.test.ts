/** The `?app=` address names any app — a document, a task's description, a message — and reads back the same. */
import { expect, test } from "vitest";
import { type AppRef, appParam, readAppParam } from "./app-ref";

test.each<[string, AppRef, string]>([
	["a document by its id", { kind: "document", id: "doc-1" }, "doc-1"],
	["a task's description", { kind: "task", id: "T-1" }, "task:T-1"],
	[
		"a message, with its conversation",
		{ kind: "message", threadId: "th-1", id: "m-1" },
		"message:th-1:m-1",
	],
])("%s", (_, ref, param) => {
	expect(appParam(ref)).toBe(param);
	expect(readAppParam(param)).toEqual(ref);
});
