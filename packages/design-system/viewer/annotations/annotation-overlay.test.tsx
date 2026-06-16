// @vitest-environment jsdom

/**
 * AJ7 — annotation-overlay.test.tsx (TDD red, supersedes the AJ5 pill/popover suite)
 *
 * The AJ5 review-pill + fixed-to-pill popover + element-mutating outline classes
 * (.anno-pill / .anno-popover / .anno-selected / .anno-saved) are RETIRED. The v2
 * overlay composes usePicker + InspectorRail + HighlightLayer.
 *
 * AC1  — overlay renders the rail (arm button) when given a non-null storyRoot.
 * AC4  — the inspected element's className is UNCHANGED after hover + select + save.
 * AC9  — Save POSTs AnnotationInput (with target.anchor); failed POST → .anno-error;
 *        Save shows "Saving…" while in flight.
 * AC10 — Esc closes an open selection then disarms, returning focus to the arm button.
 * Variant attribution — POST variant derives from the clicked element's .demo-section.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AnnotationOverlay } from "./annotation-overlay.js";
import type { AnnotationState } from "./types.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function emptyState(): AnnotationState {
	return {
		currentRound: 1,
		rounds: [{ round: 1, startedAt: "2026-06-16T00:00:00.000Z", annotations: [] }],
	};
}

let container: HTMLDivElement;
let root: Root;
let storyRoot: HTMLDivElement;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	storyRoot = document.createElement("div");
	storyRoot.className = "demo-grid";
	document.body.appendChild(storyRoot);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	storyRoot.remove();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function mockFetch(
	impl?: (
		url: string,
		opts?: RequestInit,
	) => Promise<{ ok: boolean; json: () => Promise<unknown> }>,
): ReturnType<typeof vi.fn> {
	const fn = vi.fn(
		impl ??
			((url: string, opts?: RequestInit) => {
				const method = opts?.method ?? "GET";
				if (method === "POST") {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ state: emptyState() }),
					});
				}
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: emptyState() }) });
			}),
	);
	vi.stubGlobal("fetch", fn);
	return fn;
}

/** Set a controlled input's value the way React 19 expects (native setter + input event). */
function typeInto(textarea: HTMLTextAreaElement, value: string): void {
	const setter = Object.getOwnPropertyDescriptor(
		window.HTMLTextAreaElement.prototype,
		"value",
	)?.set;
	setter?.call(textarea, value);
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Mount overlay + arm + click a story element. Returns the clicked element. */
async function armAndSelect(el: HTMLElement): Promise<void> {
	await act(async () => {
		root.render(
			createElement(AnnotationOverlay, { story: "Button", variant: "AllVariants", storyRoot }),
		);
	});
	const arm = container.querySelector(".anno-arm") as HTMLButtonElement | null;
	await act(async () => {
		arm?.click();
	});
	await act(async () => {
		el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
	});
}

describe("AC1 — overlay renders rail with arm button", () => {
	test("arm button is present with aria-pressed=false", async () => {
		mockFetch();
		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, { story: "Button", variant: "AllVariants", storyRoot }),
			);
		});
		const arm = container.querySelector(".anno-arm");
		expect(arm).not.toBeNull();
		expect(arm?.getAttribute("aria-pressed")).toBe("false");
	});

	test("no .anno-pill or .anno-popover (AJ5 retired)", async () => {
		mockFetch();
		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, { story: "Button", variant: "AllVariants", storyRoot }),
			);
		});
		expect(container.querySelector(".anno-pill")).toBeNull();
		expect(container.querySelector(".anno-popover")).toBeNull();
	});
});

describe("AC4 — inspected element className is never mutated", () => {
	test("className unchanged after hover + select + save", async () => {
		mockFetch();
		const el = document.createElement("button");
		el.className = "btn-primary lg";
		storyRoot.appendChild(el);

		await armAndSelect(el);

		// hover dispatch
		await act(async () => {
			el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
		});

		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		await act(async () => {
			if (textarea) typeInto(textarea, "note");
		});
		const save = container.querySelector(".anno-save") as HTMLButtonElement | null;
		await act(async () => {
			save?.click();
		});

		expect(el.className).toBe("btn-primary lg");
		expect(el.classList.contains("anno-hover")).toBe(false);
		expect(el.classList.contains("anno-selected")).toBe(false);
		expect(el.classList.contains("anno-saved")).toBe(false);
	});
});

describe("AC9 — Save POST + variant attribution + anchor", () => {
	test("Save POSTs story/variant/note/target with an anchor", async () => {
		const fetchMock = mockFetch();
		const el = document.createElement("button");
		storyRoot.appendChild(el);
		await armAndSelect(el);

		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		await act(async () => {
			if (textarea) typeInto(textarea, "my note");
		});
		const save = container.querySelector(".anno-save") as HTMLButtonElement | null;
		await act(async () => {
			save?.click();
		});

		const post = fetchMock.mock.calls.find(
			([url, opts]) =>
				(url as string).includes("/__annotations") &&
				(opts as RequestInit | undefined)?.method === "POST",
		);
		expect(post).toBeDefined();
		const body = JSON.parse((post?.[1] as RequestInit).body as string) as {
			story: string;
			variant: string;
			note: string;
			target: { component: string; element: string; anchor?: { path: number[] } };
		};
		expect(body.story).toBe("Button");
		expect(body.note).toBe("my note");
		expect(body.target.anchor).toBeDefined();
		expect(Array.isArray(body.target.anchor?.path)).toBe(true);
	});

	test("variant derives from the clicked element's enclosing .demo-section", async () => {
		const fetchMock = mockFetch();
		const section = document.createElement("div");
		section.className = "demo-section";
		section.setAttribute("data-variant", "Compact");
		const el = document.createElement("button");
		section.appendChild(el);
		storyRoot.appendChild(section);

		await armAndSelect(el);
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		await act(async () => {
			if (textarea) typeInto(textarea, "x");
		});
		await act(async () => {
			(container.querySelector(".anno-save") as HTMLButtonElement | null)?.click();
		});
		const post = fetchMock.mock.calls.find(
			([url, opts]) =>
				(url as string).includes("/__annotations") &&
				(opts as RequestInit | undefined)?.method === "POST",
		);
		const body = JSON.parse((post?.[1] as RequestInit).body as string) as { variant: string };
		expect(body.variant).toBe("Compact");
	});

	test("failed POST renders .anno-error and re-enables Save", async () => {
		mockFetch((url, opts) => {
			const method = opts?.method ?? "GET";
			if (method === "POST") return Promise.reject(new Error("down"));
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: emptyState() }) });
		});
		const el = document.createElement("button");
		storyRoot.appendChild(el);
		await armAndSelect(el);
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		await act(async () => {
			if (textarea) typeInto(textarea, "note");
		});
		await act(async () => {
			(container.querySelector(".anno-save") as HTMLButtonElement | null)?.click();
		});
		expect(container.querySelector(".anno-error")).not.toBeNull();
		const save = container.querySelector(".anno-save") as HTMLButtonElement | null;
		expect(save?.disabled).toBe(false);
	});
});

describe("AC10 — Esc returns focus to arm button", () => {
	test("Esc with an open selection clears it and focuses the arm button", async () => {
		mockFetch();
		const el = document.createElement("button");
		storyRoot.appendChild(el);
		await armAndSelect(el);
		expect(container.querySelector("textarea")).not.toBeNull();

		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		const arm = container.querySelector(".anno-arm");
		expect(document.activeElement).toBe(arm);
		expect(container.querySelector("textarea")).toBeNull();
	});
});
