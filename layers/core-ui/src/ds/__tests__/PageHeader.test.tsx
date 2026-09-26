// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../PageHeader.js";

describe("PageHeader", () => {
	it("renders a <header> element as the outermost element", () => {
		const { container } = render(<PageHeader title="My Page" />);
		expect(container.firstElementChild?.tagName.toLowerCase()).toBe("header");
	});

	it("renders the title in an <h1> by default, and in an <h2> when level={2}", () => {
		const { rerender } = render(<PageHeader title="My Page" />);
		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("My Page");

		rerender(<PageHeader title="My Page" level={2} />);
		expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("My Page");
	});

	it("wraps a page-presentation header in the stable page frame, not a pane-presentation one", () => {
		const { rerender } = render(<PageHeader title="My Page" presentation="page" />);
		expect(screen.getByRole("heading", { level: 1 }).closest("[data-page-frame]")).not.toBeNull();

		rerender(<PageHeader title="Inspector" presentation="pane" />);
		expect(screen.getByRole("heading", { level: 2 }).closest("[data-page-frame]")).toBeNull();
	});

	it("renders a string title", () => {
		render(<PageHeader title="Portfolio" />);
		expect(screen.getByText("Portfolio")).toBeInTheDocument();
	});

	it("renders a ReactNode title (e.g. an editable input)", () => {
		render(
			<PageHeader
				title={<input data-testid="editable-title" aria-label="Page title" defaultValue="Draft" />}
			/>,
		);
		expect(screen.getByTestId("editable-title")).toBeInTheDocument();
	});

	it("renders `leading` before the title in DOM order", () => {
		render(<PageHeader title="Page" leading={<span data-testid="breadcrumb">Work / Page</span>} />);
		const crumb = screen.getByTestId("breadcrumb");
		const h1 = screen.getByRole("heading", { level: 1 });
		expect(crumb.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
	});

	it("renders `subtitle` when provided", () => {
		render(
			<PageHeader
				title="Page"
				subtitle={<span data-testid="meta-line">Phase: build · Lead: Dana</span>}
			/>,
		);
		expect(screen.getByTestId("meta-line")).toBeInTheDocument();
	});

	it("renders `actions` when provided", () => {
		render(
			<PageHeader
				title="Page"
				actions={
					<button type="button" data-testid="create-btn">
						Create
					</button>
				}
			/>,
		);
		expect(screen.getByTestId("create-btn")).toBeInTheDocument();
	});

	it("passes data-testid through to the <header> element", () => {
		render(<PageHeader title="Page" data-testid="work-portfolio-header" />);
		const header = screen.getByTestId("work-portfolio-header");
		expect(header.tagName.toLowerCase()).toBe("header");
	});
});
