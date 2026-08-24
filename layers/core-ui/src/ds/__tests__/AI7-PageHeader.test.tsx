/**
 * AI7 — PageHeader DS component (RED phase).
 *
 * AC1: One title treatment across primary pages; title treatment encoded in the
 *      primitive and exported as `pageTitleClassName` const.
 * AC2: PageHeader renders a `<header>` with `shrink-0` — the pinned-header proof.
 * AC3: Primitive exported from DS index; correct semantic element; slots work.
 *
 * These tests FAIL until framework/design-system/src/PageHeader.tsx is created
 * and exported from index.ts.
 */

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader, pageTitleClassName } from "../PageHeader.js";

describe("AI7 — PageHeader component", () => {
	describe("Semantic structure and pinning (AC2)", () => {
		it("renders a <header> element as the outermost element", () => {
			const { container } = render(<PageHeader title="My Page" />);
			expect(container.firstElementChild?.tagName.toLowerCase()).toBe("header");
		});

		it("header carries shrink-0 class (pinned-header contract)", () => {
			const { container } = render(<PageHeader title="My Page" />);
			const header = container.firstElementChild as HTMLElement;
			expect(header.className).toContain("shrink-0");
		});

		it("renders title text in an <h1> element by default (AMENDMENT: level defaults to 1)", () => {
			render(<PageHeader title="My Page" />);
			const heading = screen.getByRole("heading", { level: 1 });
			expect(heading).toBeInTheDocument();
			expect(heading.textContent).toBe("My Page");
		});

		it("renders title text in an <h2> element when level={2}", () => {
			render(<PageHeader title="My Page" level={2} />);
			const heading = screen.getByRole("heading", { level: 2 });
			expect(heading).toBeInTheDocument();
			expect(heading.textContent).toBe("My Page");
		});

		it("uses the stable frame and h1 for page presentation", () => {
			render(<PageHeader title="My Page" presentation="page" />);
			const heading = screen.getByRole("heading", { level: 1 });
			expect(heading.closest("[data-page-frame]")).not.toBeNull();
		});

		it("uses a local 18px inset and semantic lead profile for pane presentation", () => {
			const { container } = render(<PageHeader title="Inspector" presentation="pane" />);
			const header = container.firstElementChild as HTMLElement;
			const heading = screen.getByRole("heading", { level: 2 });
			expect(header.className).toContain("pl-[18px]");
			expect(header.className).toContain("pr-[18px]");
			expect(header.className).toContain("py-[12px]");
			expect(heading.className).toContain("type-lead");
			expect(heading.closest("[data-page-frame]")).toBeNull();
		});

		it("can reserve destination pane controls without moving the left inset", () => {
			const { container } = render(
				<PageHeader title="Inspector" presentation="pane" reservePaneControls />,
			);
			const header = container.firstElementChild as HTMLElement;
			expect(header.className).toContain("pl-[18px]");
			expect(header.className).toContain("pr-[84px]");
		});

		it("level={2} title carries the same pageTitleClassName as default (visual treatment is level-invariant)", () => {
			const { container } = render(<PageHeader title="My Page" level={2} />);
			const h2 = container.querySelector("h2");
			expect(h2?.className).toContain("type-title");
			expect(h2?.className).toContain("truncate");
		});
	});

	describe("pageTitleClassName export (AC1 / W1)", () => {
		it("exports pageTitleClassName as a non-empty string", () => {
			expect(typeof pageTitleClassName).toBe("string");
			expect(pageTitleClassName.length).toBeGreaterThan(0);
		});

		it("pageTitleClassName includes the canonical title color", () => {
			expect(pageTitleClassName).toContain("text-[var(--text-primary)]");
		});

		it("pageTitleClassName includes truncation classes", () => {
			expect(pageTitleClassName).toContain("min-w-0");
			expect(pageTitleClassName).toContain("truncate");
		});

		it("h1 element uses pageTitleClassName (the primitive's own <h1> uses the const by default)", () => {
			const { container } = render(<PageHeader title="My Page" />);
			const h1 = container.querySelector("h1");
			expect(h1).toBeInTheDocument();
			expect(h1?.className).toContain("type-title");
			expect(h1?.className).toContain("text-[var(--text-primary)]");
			expect(h1?.className).toContain("truncate");
		});
	});

	describe("Title slot (required)", () => {
		it("renders a string title", () => {
			render(<PageHeader title="Portfolio" />);
			expect(screen.getByText("Portfolio")).toBeInTheDocument();
		});

		it("renders a ReactNode title (e.g. an <input>)", () => {
			render(
				<PageHeader
					title={
						<input data-testid="editable-title" aria-label="Page title" defaultValue="Draft" />
					}
				/>,
			);
			expect(screen.getByTestId("editable-title")).toBeInTheDocument();
		});
	});

	describe("Leading slot (optional)", () => {
		it("omitting `leading` renders no leading wrapper", () => {
			const { container } = render(<PageHeader title="Page" />);
			// No mb-[6px] leading wrapper should appear
			expect(container.querySelector(".mb-\\[6px\\]")).toBeNull();
		});

		it("passing `leading` renders it before the title row", () => {
			render(
				<PageHeader title="Page" leading={<span data-testid="breadcrumb">Work / Page</span>} />,
			);
			const crumb = screen.getByTestId("breadcrumb");
			expect(crumb).toBeInTheDocument();
			// Leading must appear before the h1 in DOM order (default level=1)
			const h1 = screen.getByRole("heading", { level: 1 });
			expect(crumb.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(
				0,
			);
		});
	});

	describe("Subtitle slot (optional)", () => {
		it("omitting `subtitle` renders no subtitle node", () => {
			const { container } = render(<PageHeader title="Page" />);
			// No subtitle div should appear
			expect(container.querySelector(".mt-\\[3px\\]")).toBeNull();
		});

		it("passing `subtitle` renders it below the title row", () => {
			render(
				<PageHeader
					title="Page"
					subtitle={<span data-testid="meta-line">Phase: build · Lead: Dana</span>}
				/>,
			);
			expect(screen.getByTestId("meta-line")).toBeInTheDocument();
		});
	});

	describe("Actions slot (optional)", () => {
		it("omitting `actions` renders no actions container", () => {
			const { container } = render(<PageHeader title="Page" />);
			// No shrink-0 actions cluster (the h2 row uses justify-between but no separate shrink-0 wrapper)
			// The actions wrapper has shrink-0 AND items-center — the header already has shrink-0 so
			// we check for the actions items-center flex wrapper inside the title row
			const actionsClusters = container.querySelectorAll(
				".flex.items-center.gap-\\[9px\\].shrink-0",
			);
			expect(actionsClusters).toHaveLength(0);
		});

		it("passing `actions` renders them in the title row", () => {
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
	});

	describe("data-testid passthrough", () => {
		it("passes data-testid to the <header> element", () => {
			render(<PageHeader title="Page" data-testid="work-portfolio-header" />);
			expect(screen.getByTestId("work-portfolio-header")).toBeInTheDocument();
			expect(screen.getByTestId("work-portfolio-header").tagName.toLowerCase()).toBe("header");
		});
	});

	describe("data-ds-* marker (require-ds-attribute AC3)", () => {
		it("header carries data-ds-component='PageHeader'", () => {
			const { container } = render(<PageHeader title="Page" />);
			const header = container.firstElementChild as HTMLElement;
			expect(header.getAttribute("data-ds-component")).toBe("PageHeader");
		});

		it("header carries data-ds-tier='1'", () => {
			const { container } = render(<PageHeader title="Page" />);
			const header = container.firstElementChild as HTMLElement;
			expect(header.getAttribute("data-ds-tier")).toBe("1");
		});
	});

	describe("Long title truncation", () => {
		it("title element has truncate class for overflow handling", () => {
			const { container } = render(
				<PageHeader title="A Very Long Page Title That Would Overflow On Narrow Screens" />,
			);
			const h1 = container.querySelector("h1");
			expect(h1?.className).toContain("truncate");
			expect(h1?.className).toContain("min-w-0");
		});
	});

	describe("Strip classes (AC1)", () => {
		it("page frame owns strip padding and header keeps the border", () => {
			const { container } = render(<PageHeader title="Page" />);
			const header = container.firstElementChild as HTMLElement;
			const frame = header.querySelector("[data-page-frame]") as HTMLElement;
			expect(frame.className).toContain("px-[24px]");
			expect(header.className).toContain("py-[18px]");
			// NEW-18: border-b-[var(--bw-thin)] → border-width-thin-b @utility
			expect(header.className).toContain("border-width-thin-b");
		});
	});
});
