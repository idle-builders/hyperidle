/**
 * AZ2 — PageScaffold DS component (RED phase).
 *
 * The scroll contract, structural: root is `flex flex-col h-full`; header is the
 * first child (omit for no title strip); `body="scroll"` (default) owns the
 * scroll region itself (`flex-1 overflow-y-auto`, marked `data-page-scroll`);
 * `body="managed"` hands the child a bounded flex column (`flex-1 min-h-0
 * flex flex-col overflow-hidden`) and does NOT mark it `data-page-scroll` —
 * the child (SplitView, ConversationSurface, a detail pane) owns its own scroll.
 *
 * @lore AZ2 §2.3: `min-h-0` on the scroll body is proven redundant (headless
 * Chromium probe: shape A ≡ shape B) — an element whose computed overflow is
 * not `visible` already gets an automatic flex-item min-size of zero. The
 * scroll body here MUST NOT carry `min-h-0`. Adding it back is cargo cult;
 * a future agent who is tempted to "fix" a scroll bug by adding it here should
 * read this test file (and PageScaffold.tsx's own `@lore`) first — the fix for
 * a broken scroll chain is almost always a missing bounded flex column
 * (`body="managed"`), not a `min-h-0` that was never load-bearing on this div.
 */

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageScaffold } from "../PageScaffold.js";

describe("AZ2 — PageScaffold component", () => {
	describe("Root structure", () => {
		it("renders a root div with flex flex-col h-full", () => {
			const { container } = render(<PageScaffold>content</PageScaffold>);
			const root = container.firstElementChild as HTMLElement;
			expect(root.className).toContain("flex");
			expect(root.className).toContain("flex-col");
			expect(root.className).toContain("h-full");
		});

		it("carries the data-ds-component / data-ds-tier / data-ds-source markers", () => {
			const { container } = render(<PageScaffold>content</PageScaffold>);
			const root = container.firstElementChild as HTMLElement;
			expect(root.getAttribute("data-ds-component")).toBe("PageScaffold");
			expect(root.getAttribute("data-ds-tier")).toBe("1");
			expect(root.getAttribute("data-ds-source")).toBe("design-system");
		});

		it("passes data-testid through to the root", () => {
			render(<PageScaffold data-testid="my-page">content</PageScaffold>);
			expect(screen.getByTestId("my-page")).toBeInTheDocument();
		});
	});

	describe("Header slot", () => {
		it("omitting header renders no extra element before the body", () => {
			const { container } = render(<PageScaffold>content</PageScaffold>);
			const root = container.firstElementChild as HTMLElement;
			// Only the body region is a child when header is omitted.
			expect(root.children).toHaveLength(1);
		});

		it("renders the header as the first child, before the body", () => {
			render(
				<PageScaffold header={<div data-testid="my-header">Header</div>}>
					<div data-testid="my-body">Body</div>
				</PageScaffold>,
			);
			const header = screen.getByTestId("my-header");
			const body = screen.getByTestId("my-body");
			expect(header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(
				0,
			);
		});
	});

	describe('body="scroll" (default)', () => {
		it("emits exactly one data-page-scroll element", () => {
			const { container } = render(<PageScaffold>content</PageScaffold>);
			const scrollers = container.querySelectorAll("[data-page-scroll]");
			expect(scrollers).toHaveLength(1);
		});

		it("the scroll element carries flex-1 and overflow-y-auto", () => {
			const { container } = render(<PageScaffold>content</PageScaffold>);
			const scroller = container.querySelector("[data-page-scroll]") as HTMLElement;
			expect(scroller).not.toBeNull();
			expect(scroller.className).toContain("flex-1");
			expect(scroller.className).toContain("overflow-y-auto");
		});

		it("the scroll element does NOT carry min-h-0 (proven redundant, AZ2 §2.3)", () => {
			const { container } = render(<PageScaffold>content</PageScaffold>);
			const scroller = container.querySelector("[data-page-scroll]") as HTMLElement;
			expect(scroller.className).not.toContain("min-h-0");
		});

		it("renders children inside the scroll element", () => {
			render(
				<PageScaffold>
					<div data-testid="child">hi</div>
				</PageScaffold>,
			);
			const child = screen.getByTestId("child");
			const scroller = child.closest("[data-page-scroll]");
			expect(scroller).not.toBeNull();
		});

		it('body="scroll" is also what an explicit body="scroll" produces (default value)', () => {
			const a = render(<PageScaffold>x</PageScaffold>);
			const b = render(<PageScaffold body="scroll">x</PageScaffold>);
			const scrollerA = a.container.querySelector("[data-page-scroll]") as HTMLElement;
			const scrollerB = b.container.querySelector("[data-page-scroll]") as HTMLElement;
			expect(scrollerA.className).toBe(scrollerB.className);
		});
	});

	describe('body="managed"', () => {
		it("emits zero data-page-scroll elements (the child owns its own scroll)", () => {
			const { container } = render(<PageScaffold body="managed">content</PageScaffold>);
			const scrollers = container.querySelectorAll("[data-page-scroll]");
			expect(scrollers).toHaveLength(0);
		});

		it("the managed body wrapper is a bounded flex column: flex-1 min-h-0 flex flex-col overflow-hidden", () => {
			render(
				<PageScaffold body="managed">
					<div data-testid="managed-child">child</div>
				</PageScaffold>,
			);
			const child = screen.getByTestId("managed-child");
			const wrapper = child.parentElement as HTMLElement;
			expect(wrapper.className).toContain("flex-1");
			expect(wrapper.className).toContain("min-h-0");
			expect(wrapper.className).toContain("flex");
			expect(wrapper.className).toContain("flex-col");
			expect(wrapper.className).toContain("overflow-hidden");
		});

		it("renders children inside the managed wrapper", () => {
			render(
				<PageScaffold body="managed">
					<div data-testid="child">hi</div>
				</PageScaffold>,
			);
			expect(screen.getByTestId("child")).toBeInTheDocument();
		});
	});
});
