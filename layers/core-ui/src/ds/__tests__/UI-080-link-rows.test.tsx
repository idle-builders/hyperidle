// @vitest-environment jsdom
/**
 * UI-080 — navigation rows must render as <a href> links, not buttons.
 *
 * Done = anything that changes the address is a link, so ⌘-click, middle-click,
 * "copy link" and hover-preview all work natively.
 *
 * Covered:
 *   - Row: href prop → <a> element with the correct href
 *   - ThreadRow: href prop → <a> element with the correct href
 *   - ArtifactStackItem: href prop → <a> element with the correct href
 *   - ArtifactGalleryCard: href prop → <a> element with the correct href
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ArtifactGalleryCard } from "../ArtifactGalleryCard.js";
import { ArtifactStackItem } from "../ArtifactStackItem.js";
import { Row } from "../Row.js";
import { ThreadRow } from "../ThreadRow.js";

// biome-ignore lint/style/useNamingConvention: React flag
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FAKE_ARTIFACT = {
	id: "art-1",
	kind: "document",
	label: null,
	preview: null,
	producingTaskId: "task-1",
	producingTaskTitle: "Task 1",
	createdAt: "2026-01-01T00:00:00.000Z",
	threadCount: 0,
};

// ── Row ──────────────────────────────────────────────────────────────────────

describe("Row — href prop renders as anchor link", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders an <a> element when href is provided (no actions)", () => {
		act(() => {
			root.render(
				createElement(Row, {
					title: "Bet row",
					href: "/work/bet/123",
				}),
			);
		});

		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.getAttribute("href")).toBe("/work/bet/123");
	});

	it("renders an <a> element when href is provided with display-only actions", () => {
		act(() => {
			root.render(
				createElement(Row, {
					title: "Bet row",
					href: "/work/bet/456",
					actions: createElement("span", {}, "ACTIVE"),
				}),
			);
		});

		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.getAttribute("href")).toBe("/work/bet/456");
	});

	it("does NOT render an <a> when href is absent (falls back to button)", () => {
		act(() => {
			root.render(
				createElement(Row, {
					title: "Button row",
					onClick: () => undefined,
				}),
			);
		});

		expect(container.querySelector("a")).toBeNull();
		expect(container.querySelector("button")).not.toBeNull();
	});
});

// ── ThreadRow ────────────────────────────────────────────────────────────────

describe("ThreadRow — href prop renders as anchor link", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders an <a> element when href is provided", () => {
		act(() => {
			root.render(
				createElement(ThreadRow, {
					title: "Thread title",
					snippet: "Preview...",
					timestamp: "2h ago",
					href: "/conversations/thread-abc",
				}),
			);
		});

		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.getAttribute("href")).toBe("/conversations/thread-abc");
	});

	it("does NOT render an <a> when href is absent", () => {
		act(() => {
			root.render(
				createElement(ThreadRow, {
					title: "Thread title",
					snippet: "Preview...",
					timestamp: "2h ago",
					onClick: () => undefined,
				}),
			);
		});

		expect(container.querySelector("a")).toBeNull();
	});
});

// ── ArtifactStackItem ────────────────────────────────────────────────────────

describe("ArtifactStackItem — href prop renders as anchor link", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders an <a> element when href is provided", () => {
		act(() => {
			root.render(
				createElement(ArtifactStackItem, {
					data: FAKE_ARTIFACT,
					onOpen: () => undefined,
					href: "/artifacts/art-1",
				}),
			);
		});

		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.getAttribute("href")).toBe("/artifacts/art-1");
	});

	it("falls back to <button> when href is absent", () => {
		act(() => {
			root.render(
				createElement(ArtifactStackItem, {
					data: FAKE_ARTIFACT,
					onOpen: () => undefined,
				}),
			);
		});

		expect(container.querySelector("a")).toBeNull();
		expect(container.querySelector("button")).not.toBeNull();
	});
});

// ── ArtifactGalleryCard ──────────────────────────────────────────────────────

describe("ArtifactGalleryCard — href prop renders as anchor link", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders an <a> element when href is provided", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: FAKE_ARTIFACT,
					onOpen: () => undefined,
					href: "/artifacts/art-1",
				}),
			);
		});

		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.getAttribute("href")).toBe("/artifacts/art-1");
	});

	it("falls back to <button> when href is absent", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: FAKE_ARTIFACT,
					onOpen: () => undefined,
				}),
			);
		});

		expect(container.querySelector("a")).toBeNull();
		expect(container.querySelector("button")).not.toBeNull();
	});
});
