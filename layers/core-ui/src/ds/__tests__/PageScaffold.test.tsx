/**
 * PageScaffold owns the scroll contract other pages key off of by selector:
 * `body="scroll"` (default) marks its own scroll region `data-page-scroll`;
 * `body="managed"` hands the child a bounded column and does NOT mark it —
 * the child (SplitView, ConversationSurface, a detail pane) owns its own
 * scroll instead. `frame="page"` additionally wraps content in the stable
 * page frame (`data-page-frame`).
 */

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageScaffold } from "../PageScaffold.js";

describe("PageScaffold", () => {
	it("passes data-testid through to the root", () => {
		render(<PageScaffold data-testid="my-page">content</PageScaffold>);
		expect(screen.getByTestId("my-page")).toBeInTheDocument();
	});

	it("renders the header, when given, before the body", () => {
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

	describe('body="scroll" (default)', () => {
		it("wraps children in exactly one data-page-scroll element", () => {
			render(
				<PageScaffold>
					<div data-testid="child">hi</div>
				</PageScaffold>,
			);
			const child = screen.getByTestId("child");
			expect(child.closest("[data-page-scroll]")).toBeInTheDocument();
			expect(document.querySelectorAll("[data-page-scroll]")).toHaveLength(1);
		});

		it('frame="page" additionally places scroll content in the stable page frame', () => {
			render(
				<PageScaffold frame="page">
					<div data-testid="page-child">content</div>
				</PageScaffold>,
			);
			const child = screen.getByTestId("page-child");
			expect(child.closest("[data-page-frame]")).toBeInTheDocument();
			expect(child.closest("[data-page-scroll]")).toBeInTheDocument();
		});

		it('frame="local" is the default and adds no page frame', () => {
			render(
				<PageScaffold>
					<div data-testid="local-child">content</div>
				</PageScaffold>,
			);
			expect(screen.getByTestId("local-child").closest("[data-page-frame]")).toBeNull();
		});
	});

	describe('body="managed"', () => {
		it("emits no data-page-scroll element — the child owns its own scroll", () => {
			const { container } = render(<PageScaffold body="managed">content</PageScaffold>);
			expect(container.querySelectorAll("[data-page-scroll]")).toHaveLength(0);
		});

		it("renders children inside the managed wrapper", () => {
			render(
				<PageScaffold body="managed">
					<div data-testid="child">hi</div>
				</PageScaffold>,
			);
			expect(screen.getByTestId("child")).toBeInTheDocument();
		});

		it("never adds page geometry around a managed child", () => {
			render(
				<PageScaffold body="managed" frame="page">
					<div data-testid="managed-local">child</div>
				</PageScaffold>,
			);
			expect(screen.getByTestId("managed-local").closest("[data-page-frame]")).toBeNull();
		});
	});
});
