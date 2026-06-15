// @vitest-environment jsdom

/**
 * AJ5 — annotation-overlay.test.tsx
 *
 * TDD RED phase — imports modules that do not yet exist.
 * Expected failure: Cannot find module './annotation-overlay.js'
 *
 * AC8: Overlay behavior:
 *   - arm toggle has aria-pressed={armed}
 *   - selecting an element opens a note field
 *   - Save POSTs AnnotationInput to /__annotations with correct payload via mocked fetch
 *   - round-count indicator renders from GET /__annotations
 *   - "New iteration" button POSTs /__annotations/round
 *
 * @lore AJ5: AnnotationOverlay uses fetch() for network calls. We mock globalThis.fetch
 * in beforeEach and restore in afterEach. The overlay GETs /__annotations on mount
 * to populate count; we return a state with known data.
 *
 * @lore AJ5: The overlay mounts in App chrome, not in story root — so it never
 * enters the catalog-snapshot.test.tsx net. Tests here mount it in isolation.
 *
 * @lore AJ5: The overlay prop 'storyRoot' scopes click listeners. In tests we
 * provide a div as the story root; clicking inside it triggers the capture.
 * The overlay excludes its own pill/popover nodes from capture.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AnnotationOverlay } from "./annotation-overlay.js";
import type { AnnotationState } from "./types.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mock fetch helpers
// ---------------------------------------------------------------------------

function makeEmptyState(): AnnotationState {
	return {
		currentRound: 1,
		rounds: [{ round: 1, startedAt: "2026-06-15T10:00:00.000Z", annotations: [] }],
	};
}

function makeStateWithNotes(count: number): AnnotationState {
	return {
		currentRound: 1,
		rounds: [
			{
				round: 1,
				startedAt: "2026-06-15T10:00:00.000Z",
				annotations: Array.from({ length: count }, (_, i) => ({
					id: `id-${i}`,
					createdAt: "2026-06-15T10:01:00.000Z",
					story: "Button",
					variant: "AllVariants",
					note: `note ${i}`,
					target: { component: "Button", dsComponent: "Button", element: "button" },
				})),
			},
		],
	};
}

function mockFetchGET(state: AnnotationState): void {
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string, opts?: RequestInit) => {
			const method = opts?.method ?? "GET";
			if (method === "GET") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ state }),
				});
			}
			// fallback for other calls
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ state }),
			});
		}),
	);
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let storyRoot: HTMLDivElement;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	// Story root — the element the overlay scopes click capture to
	storyRoot = document.createElement("div");
	storyRoot.setAttribute("data-testid", "story-root");
	document.body.appendChild(storyRoot);
});

afterEach(() => {
	root.unmount();
	container.remove();
	storyRoot.remove();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// AC8 — arm toggle aria-pressed
// ---------------------------------------------------------------------------

describe("AC8 — arm toggle", () => {
	test("arm toggle renders with aria-pressed=false initially", async () => {
		mockFetchGET(makeEmptyState());

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const armToggle = container.querySelector(".anno-arm");
		expect(armToggle).not.toBeNull();
		expect(armToggle?.getAttribute("aria-pressed")).toBe("false");
	});

	test("clicking arm toggle changes aria-pressed to true", async () => {
		mockFetchGET(makeEmptyState());

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const armToggle = container.querySelector(".anno-arm") as HTMLButtonElement | null;
		expect(armToggle).not.toBeNull();

		await act(async () => {
			armToggle?.click();
		});

		expect(armToggle?.getAttribute("aria-pressed")).toBe("true");
	});

	test("clicking arm toggle again disarms (aria-pressed back to false)", async () => {
		mockFetchGET(makeEmptyState());

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const armToggle = container.querySelector(".anno-arm") as HTMLButtonElement | null;

		await act(async () => {
			armToggle?.click(); // arm
		});
		expect(armToggle?.getAttribute("aria-pressed")).toBe("true");

		await act(async () => {
			armToggle?.click(); // disarm
		});
		expect(armToggle?.getAttribute("aria-pressed")).toBe("false");
	});
});

// ---------------------------------------------------------------------------
// AC8 — round-count indicator from GET
// ---------------------------------------------------------------------------

describe("AC8 — round-count indicator", () => {
	test("count indicator shows 0 notes on empty state", async () => {
		mockFetchGET(makeEmptyState());

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const countEl = container.querySelector(".anno-count");
		expect(countEl).not.toBeNull();
		// Text should reflect 0 notes
		expect(countEl?.textContent).toMatch(/0/);
	});

	test("count indicator reflects note count from GET state", async () => {
		mockFetchGET(makeStateWithNotes(3));

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const countEl = container.querySelector(".anno-count");
		expect(countEl).not.toBeNull();
		expect(countEl?.textContent).toMatch(/3/);
	});

	test("round label reflects currentRound from GET state", async () => {
		const state: AnnotationState = {
			currentRound: 2,
			rounds: [
				{ round: 1, startedAt: "2026-06-15T10:00:00.000Z", annotations: [] },
				{ round: 2, startedAt: "2026-06-15T10:05:00.000Z", annotations: [] },
			],
		};
		mockFetchGET(state);

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const roundEl = container.querySelector(".anno-round");
		expect(roundEl).not.toBeNull();
		expect(roundEl?.textContent).toMatch(/2/);
	});
});

// ---------------------------------------------------------------------------
// AC8 — Save POSTs AnnotationInput
// ---------------------------------------------------------------------------

describe("AC8 — Save fires POST with AnnotationInput payload", () => {
	test("after arm + element select, Save POSTs to /__annotations with story/variant/note/target", async () => {
		const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
			const method = opts?.method ?? "GET";
			if (method === "GET") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ state: makeEmptyState() }),
				});
			}
			// POST
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ state: makeEmptyState() }),
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		// Create an element inside storyRoot to simulate element selection
		const targetEl = document.createElement("button");
		targetEl.className = "btn-primary";
		targetEl.textContent = "Click me";
		storyRoot.appendChild(targetEl);

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		// Arm the overlay
		const armToggle = container.querySelector(".anno-arm") as HTMLButtonElement | null;
		await act(async () => {
			armToggle?.click();
		});

		// Simulate a click on the story root element (triggers element capture)
		await act(async () => {
			targetEl.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }),
			);
		});

		// Popover should be open — find textarea
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		expect(textarea).not.toBeNull();

		// Type a note
		await act(async () => {
			if (textarea) {
				textarea.value = "My test note";
				textarea.dispatchEvent(new Event("input", { bubbles: true }));
				textarea.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});

		// Click Save
		const saveBtn = container.querySelector(".anno-save") as HTMLButtonElement | null;
		expect(saveBtn).not.toBeNull();

		await act(async () => {
			saveBtn?.click();
		});

		// Assert fetch was called with POST /__annotations
		const postCalls = fetchMock.mock.calls.filter(
			([url, opts]) =>
				(url as string).includes("/__annotations") &&
				(opts as RequestInit | undefined)?.method === "POST",
		);
		expect(postCalls.length).toBeGreaterThan(0);

		// Validate the payload shape
		const postCall = postCalls[0];
		const body = JSON.parse((postCall?.[1] as RequestInit).body as string) as {
			story?: string;
			variant?: string;
			note?: string;
			target?: { component?: string; dsComponent?: string | null; element?: string };
		};

		expect(body.story).toBe("Button");
		expect(body.variant).toBe("AllVariants");
		expect(typeof body.note).toBe("string");
		expect(body.target).toBeDefined();
		expect(typeof body.target?.component).toBe("string");
		expect(typeof body.target?.element).toBe("string");
		// dsComponent is string | null
		expect(body.target?.dsComponent === null || typeof body.target?.dsComponent === "string").toBe(
			true,
		);
	});
});

// ---------------------------------------------------------------------------
// AC8 — "New iteration" POSTs /__annotations/round
// ---------------------------------------------------------------------------

describe("AC8 — New iteration button", () => {
	test("'New iteration' button POSTs to /__annotations/round", async () => {
		const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
			const method = opts?.method ?? "GET";
			if (method === "GET") {
				// Return state with 1 note so "New iteration" is enabled
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ state: makeStateWithNotes(1) }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						state: {
							currentRound: 2,
							rounds: [
								{ round: 1, startedAt: "2026-06-15T10:00:00.000Z", annotations: [] },
								{ round: 2, startedAt: "2026-06-15T10:05:00.000Z", annotations: [] },
							],
						},
					}),
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const iterateBtn = container.querySelector(".anno-iterate") as HTMLButtonElement | null;
		expect(iterateBtn).not.toBeNull();

		// Button should be enabled when there are notes
		expect(iterateBtn?.disabled).toBe(false);

		await act(async () => {
			iterateBtn?.click();
		});

		// Assert POST to /__annotations/round
		const roundCalls = fetchMock.mock.calls.filter(
			([url, opts]) =>
				(url as string).includes("/__annotations/round") &&
				(opts as RequestInit | undefined)?.method === "POST",
		);
		expect(roundCalls.length).toBeGreaterThan(0);
	});

	test("'New iteration' button is disabled when current round has 0 notes", async () => {
		mockFetchGET(makeEmptyState());

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const iterateBtn = container.querySelector(".anno-iterate") as HTMLButtonElement | null;
		expect(iterateBtn).not.toBeNull();
		expect(iterateBtn?.disabled).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC8 — Overlay pill structure
// ---------------------------------------------------------------------------

describe("AC8 — Overlay pill structure", () => {
	test("overlay pill renders with .anno-pill class", async () => {
		mockFetchGET(makeEmptyState());

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const pill = container.querySelector(".anno-pill");
		expect(pill).not.toBeNull();
	});

	test("no popover visible initially (popover only opens after element selection)", async () => {
		mockFetchGET(makeEmptyState());

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		// .anno-popover must not be in the DOM before an element is selected
		const popover = container.querySelector(".anno-popover");
		expect(popover).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// W1 — Outline class application (.anno-hover, .anno-selected, .anno-saved)
// ---------------------------------------------------------------------------

describe("W1 — Outline class application", () => {
	test("hovering a story element while armed uses class toggle (not inline style)", async () => {
		mockFetchGET(makeEmptyState());

		const targetEl = document.createElement("button");
		targetEl.className = "btn-primary";
		storyRoot.appendChild(targetEl);

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		// Dispatch mousemove from targetEl (listener is on storyRoot, bubbles up).
		// The arm listener is only attached when armed, so we arm first.
		const armToggle = container.querySelector(".anno-arm") as HTMLButtonElement | null;
		await act(async () => {
			armToggle?.click();
		});

		// Dispatch mousemove from targetEl — bubbles through storyRoot, firing handleMouseMove
		await act(async () => {
			targetEl.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
		});

		// The implementation uses el.classList.add("anno-hover") — not inline styles.
		// Verify the element has NO inline outline style (class-based approach confirmed).
		expect(targetEl.style.outline).toBe("");
		// And that .anno-hover class was applied via the mousemove handler
		expect(targetEl.classList.contains("anno-hover")).toBe(true);
	});

	test("clicking a story element while armed applies .anno-selected to that element", async () => {
		mockFetchGET(makeEmptyState());

		const targetEl = document.createElement("div");
		targetEl.setAttribute("data-testid", "clickable");
		storyRoot.appendChild(targetEl);

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		// Arm
		const armToggle = container.querySelector(".anno-arm") as HTMLButtonElement | null;
		await act(async () => {
			armToggle?.click();
		});

		// Click story element — triggers capture + popover open + .anno-selected
		await act(async () => {
			targetEl.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }),
			);
		});

		// Popover should be open
		const popover = container.querySelector(".anno-popover");
		expect(popover).not.toBeNull();

		// Captured element must have .anno-selected
		expect(targetEl.classList.contains("anno-selected")).toBe(true);
	});

	test("Cancel clears .anno-selected from captured element", async () => {
		mockFetchGET(makeEmptyState());

		const targetEl = document.createElement("div");
		storyRoot.appendChild(targetEl);

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const armToggle = container.querySelector(".anno-arm") as HTMLButtonElement | null;
		await act(async () => { armToggle?.click(); });

		await act(async () => {
			targetEl.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }),
			);
		});

		expect(targetEl.classList.contains("anno-selected")).toBe(true);

		// Click Cancel
		const cancelBtn = Array.from(container.querySelectorAll<HTMLButtonElement>(".toolbar-btn")).find(
			(b) => b.textContent === "Cancel",
		);
		await act(async () => { cancelBtn?.click(); });

		expect(targetEl.classList.contains("anno-selected")).toBe(false);
	});

	test("Save transitions element from .anno-selected to .anno-saved", async () => {
		const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
			const method = opts?.method ?? "GET";
			if (method === "GET") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ state: makeEmptyState() }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ state: makeStateWithNotes(1) }),
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const targetEl = document.createElement("div");
		storyRoot.appendChild(targetEl);

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const armToggle = container.querySelector(".anno-arm") as HTMLButtonElement | null;
		await act(async () => { armToggle?.click(); });

		await act(async () => {
			targetEl.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }),
			);
		});

		expect(targetEl.classList.contains("anno-selected")).toBe(true);

		// Type a note and Save
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		await act(async () => {
			if (textarea) {
				textarea.value = "test note";
				textarea.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});

		const saveBtn = container.querySelector(".anno-save") as HTMLButtonElement | null;
		await act(async () => { saveBtn?.click(); });

		// After save: .anno-selected removed, .anno-saved added
		expect(targetEl.classList.contains("anno-selected")).toBe(false);
		expect(targetEl.classList.contains("anno-saved")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// W2 — Focus trap in popover
// ---------------------------------------------------------------------------

describe("W2 — Focus trap in popover", () => {
	/** Helper: arm + click story element + await → popover opens */
	async function openPopover(): Promise<HTMLElement> {
		const targetEl = document.createElement("div");
		storyRoot.appendChild(targetEl);

		await act(async () => {
			root.render(
				createElement(AnnotationOverlay, {
					story: "Button",
					variant: "AllVariants",
					storyRoot,
				}),
			);
		});

		const armToggle = container.querySelector(".anno-arm") as HTMLButtonElement | null;
		await act(async () => {
			armToggle?.click();
		});

		await act(async () => {
			targetEl.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }),
			);
		});

		const popover = container.querySelector(".anno-popover") as HTMLElement | null;
		if (!popover) throw new Error("Popover did not open");
		return popover;
	}

	test("popover has aria-modal=true", async () => {
		mockFetchGET(makeEmptyState());
		const popover = await openPopover();
		expect(popover.getAttribute("aria-modal")).toBe("true");
	});

	test("Tab on last focusable in popover wraps focus to textarea (first focusable)", async () => {
		mockFetchGET(makeEmptyState());
		const popover = await openPopover();

		// Collect focusable: textarea, Save, Cancel (in DOM order)
		const focusable = Array.from(
			popover.querySelectorAll<HTMLElement>("textarea, button:not(:disabled)"),
		);
		expect(focusable.length).toBeGreaterThanOrEqual(2);

		const last = focusable[focusable.length - 1]!;
		const first = focusable[0]!;

		// Put focus on the last focusable
		last.focus();
		expect(document.activeElement).toBe(last);

		// Fire Tab keydown on the last element (bubbles to popover onKeyDown)
		await act(async () => {
			last.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
			);
		});

		// Focus trap should have moved focus to first
		expect(document.activeElement).toBe(first);
	});

	test("Shift+Tab on first focusable wraps focus to last (Cancel button)", async () => {
		// @lore AJ5-W2: Use fake timers to suppress the autofocus setTimeout(0)
		// that fires when the popover opens. Without fake timers, the autofocus
		// callback races with the focus trap's last?.focus() call inside act(),
		// restoring focus to textarea and making the assertion flaky.
		vi.useFakeTimers();
		try {
			mockFetchGET(makeEmptyState());
			const popover = await openPopover();

			// Advance fake timers to drain autofocus setTimeout(0)
			await act(async () => {
				vi.runAllTimers();
			});

			const focusable = Array.from(
				popover.querySelectorAll<HTMLElement>("textarea, button:not(:disabled)"),
			);
			expect(focusable.length).toBeGreaterThanOrEqual(2);

			const first = focusable[0]!;
			const last = focusable[focusable.length - 1]!;

			// Put focus on the first focusable (textarea)
			await act(async () => { first.focus(); });
			expect(document.activeElement).toBe(first);

			// Fire Shift+Tab from first — should wrap to last (Cancel)
			await act(async () => {
				first.dispatchEvent(
					new KeyboardEvent("keydown", {
						key: "Tab",
						shiftKey: true,
						bubbles: true,
						cancelable: true,
					}),
				);
			});

			expect(document.activeElement).toBe(last);
		} finally {
			vi.useRealTimers();
		}
	});
});
