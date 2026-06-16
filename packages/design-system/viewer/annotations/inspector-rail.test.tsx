// @vitest-environment jsdom

/**
 * AJ7 — inspector-rail.test.tsx (TDD red)
 *
 * AC8/AC9/AC11/AC12: rail chrome.
 *   - collapsed prop hides comment + notes, keeps the toggle (AC12).
 *   - note rows are focusable <button>s (AC8/AC10).
 *   - many annotations → notes list has bounded height (max-height) (AC11).
 *   - saving=true → Save shows "Saving…" disabled; error renders .anno-error (AC9).
 */

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { InspectorRail } from "./inspector-rail.js";
import type { Annotation } from "./types.js";
import { type Picker, usePicker } from "./use-picker.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let storyRoot: HTMLDivElement;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	storyRoot = document.createElement("div");
	storyRoot.innerHTML = `<div data-ds-component="BetCard" class="card"><span class="title">A</span></div>`;
	document.body.appendChild(storyRoot);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	storyRoot.remove();
});

function makeNotes(n: number): Annotation[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `id-${i}`,
		createdAt: "2026-06-16T00:00:00.000Z",
		story: "Button",
		variant: "AllVariants",
		note: `note ${i}`,
		target: { component: "Button", dsComponent: "Button", element: "button" },
	}));
}

interface HarnessProps {
	collapsed?: boolean;
	saving?: boolean;
	error?: string | null;
	annotations?: Annotation[];
	selectFirst?: boolean;
}

function renderRail(props: HarnessProps): { picker: { current: Picker } } {
	const pickerHandle: { current: Picker } = { current: null as unknown as Picker };
	const armRef = createRef<HTMLButtonElement>();
	function Harness(): React.JSX.Element {
		const picker = usePicker(storyRoot);
		pickerHandle.current = picker;
		useEffect(() => {
			pickerHandle.current = picker;
		});
		return createElement(InspectorRail, {
			picker,
			round: 1,
			annotations: props.annotations ?? [],
			note: "",
			onNoteChange: () => undefined,
			onSave: () => undefined,
			saving: props.saving ?? false,
			error: props.error ?? null,
			onNewIteration: () => undefined,
			collapsed: props.collapsed ?? false,
			onToggleCollapsed: () => undefined,
			armButtonRef: armRef,
		});
	}
	act(() => {
		root.render(createElement(Harness));
	});
	if (props.selectFirst) {
		const span = storyRoot.querySelector<HTMLElement>(".title");
		act(() => pickerHandle.current.arm());
		act(() => span?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
	}
	return { picker: pickerHandle };
}

describe("AC12 — collapse", () => {
	test("collapsed hides the notes list but keeps the toggle control", () => {
		renderRail({ collapsed: true, annotations: makeNotes(2) });
		expect(container.querySelector(".anno-rail-toggle")).not.toBeNull();
		expect(container.querySelector(".anno-notes")).toBeNull();
	});

	test("expanded shows the notes list", () => {
		renderRail({ collapsed: false, annotations: makeNotes(2) });
		expect(container.querySelector(".anno-notes")).not.toBeNull();
	});
});

describe("AC8/AC10 — note rows are focusable buttons", () => {
	test("each note row is a <button>", () => {
		renderRail({ annotations: makeNotes(3) });
		const rows = container.querySelectorAll(".anno-note-row");
		expect(rows.length).toBe(3);
		for (const r of rows) {
			expect(r.tagName).toBe("BUTTON");
		}
	});
});

describe("AC11 — notes list bounded height", () => {
	test("notes list has the .anno-notes class (CSS bounds height + scroll)", () => {
		renderRail({ annotations: makeNotes(20) });
		const list = container.querySelector(".anno-notes");
		expect(list).not.toBeNull();
	});
});

describe("AC9 — saving + error states", () => {
	test("saving=true → Save button reads 'Saving…' and is disabled", () => {
		renderRail({ saving: true, selectFirst: true });
		const save = container.querySelector(".anno-save") as HTMLButtonElement | null;
		expect(save).not.toBeNull();
		expect(save?.textContent).toMatch(/Saving/);
		expect(save?.disabled).toBe(true);
	});

	test("error → renders .anno-error", () => {
		renderRail({ error: "Couldn't save", selectFirst: true });
		expect(container.querySelector(".anno-error")?.textContent).toMatch(/Couldn't save/);
	});
});
