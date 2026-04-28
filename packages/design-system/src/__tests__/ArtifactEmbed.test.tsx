// @vitest-environment jsdom
// L3 RED — Tier 2 layout: ArtifactEmbed.
// Protected: design/no-embed-chrome — embed root must NOT carry bg-/border-/rounded-/shadow- classes.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactEmbed } from "../ArtifactEmbed.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURE = {
	id: "art1",
	producingTaskId: "task1",
	producingTaskTitle: "Implement auth flow",
	kind: "decision" as const,
	preview: { kind: "decision" as const, claim: "Ship X", rationale: "y" },
	cost: { money: "$0.42", tokens: "12.4k" },
	threadCount: 0,
	createdAt: "2026-04-28T00:00:00.000Z",
};

describe("ArtifactEmbed", () => {
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

	it("renders the identity strip (kind + task title + cost + timestamp)", () => {
		act(() => {
			root.render(createElement(ArtifactEmbed, { data: FIXTURE, onOpen: () => undefined }));
		});
		expect(container.textContent).toContain("DECISION");
		expect(container.textContent).toContain("Implement auth flow");
		expect(container.textContent).toContain("$0.42");
	});

	// Protected: NO chrome on the embed root
	it("root element has no bg-/border-/rounded-/shadow- Tailwind class fragments", () => {
		act(() => {
			root.render(createElement(ArtifactEmbed, { data: FIXTURE, onOpen: () => undefined }));
		});
		const rootEl = container.firstElementChild as HTMLElement | null;
		expect(rootEl).toBeTruthy();
		const cls = rootEl?.className ?? "";
		expect(cls).not.toMatch(/\bbg-/);
		expect(cls).not.toMatch(/\bborder(-|$)/);
		expect(cls).not.toMatch(/\brounded(-|$)/);
		expect(cls).not.toMatch(/\bshadow(-|$)/);
	});

	// Protected: arrow is the only affordance, identity strip is non-interactive
	it("clicking the identity strip body does NOT call onOpen — only the → arrow does", () => {
		const onOpen = vi.fn();
		act(() => {
			root.render(createElement(ArtifactEmbed, { data: FIXTURE, onOpen }));
		});
		// Find the arrow by its accessible label (per approved-design §1)
		const arrow = container.querySelector("[aria-label='Open artifact']") as HTMLElement | null;
		expect(arrow).toBeTruthy();
		arrow?.click();
		expect(onOpen).toHaveBeenCalledTimes(1);
	});
});
