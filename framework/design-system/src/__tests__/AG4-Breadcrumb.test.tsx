/**
 * AG4 — Breadcrumb DS component (RED phase).
 *
 * DS Tier 1 — router-agnostic via injected LinkComponent.
 * Renders <nav aria-label="Breadcrumb"> flex row at 13px.
 *
 * Contract:
 *   - Last segment (no `to`) = current page, not a link
 *   - Preceding segments with `to` = links via LinkComponent
 *   - `leading` slot renders before segments
 *   - Middle segments get truncation class max-w-[120px]
 *   - Link color = --text-secondary (NOT --text-tertiary per AQ-010)
 *   - Current segment color = --text-primary
 *   - :focus-visible ring on links (asserted via class presence)
 *
 * These tests FAIL until framework/design-system/src/Breadcrumb.tsx is created
 * and exported from index.ts.
 */

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumb } from "../Breadcrumb.js";

// Router-agnostic link stub — simulates what web passes (RR Link)
function StubLink({
	to,
	className,
	children,
	...rest
}: {
	to: string;
	className?: string;
	children: React.ReactNode;
	[key: string]: unknown;
}): React.JSX.Element {
	return (
		<a href={to} className={className} data-to={to} {...rest}>
			{children}
		</a>
	);
}

function render2Seg(): ReturnType<typeof render> {
	return render(
		<Breadcrumb
			segments={[{ label: "Work", to: "/work/portfolio" }, { label: "My Bet" }]}
			LinkComponent={StubLink}
		/>,
	);
}

describe("AG4 — Breadcrumb component", () => {
	describe("Semantic structure", () => {
		it("renders a <nav> with aria-label='Breadcrumb'", () => {
			render2Seg();
			expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
		});

		it("renders all segment labels", () => {
			render2Seg();
			expect(screen.getByText("Work")).toBeInTheDocument();
			expect(screen.getByText("My Bet")).toBeInTheDocument();
		});
	});

	describe("Link vs current segment", () => {
		it("last segment (no `to`) is NOT a link", () => {
			render2Seg();
			// "My Bet" is the current segment — should not be wrapped in <a>
			const links = screen.getAllByRole("link");
			const linkTexts = links.map((l) => l.textContent);
			expect(linkTexts).not.toContain("My Bet");
		});

		it("segment with `to` renders as a link with correct href", () => {
			render2Seg();
			const link = screen.getByRole("link", { name: "Work" });
			expect(link).toBeInTheDocument();
			expect(link).toHaveAttribute("href", "/work/portfolio");
		});

		it("multiple link segments all render with correct hrefs", () => {
			render(
				<Breadcrumb
					segments={[
						{ label: "Work", to: "/work/portfolio" },
						{ label: "Acme", to: "/work/team/team-1" },
						{ label: "Ship it" },
					]}
					LinkComponent={StubLink}
				/>,
			);
			expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute("href", "/work/portfolio");
			expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute(
				"href",
				"/work/team/team-1",
			);
			// Last segment: no link
			const links = screen.getAllByRole("link");
			expect(links).toHaveLength(2);
		});
	});

	describe("LinkComponent injection (router-agnostic)", () => {
		it("uses the injected LinkComponent to render link segments", () => {
			const MockLink = vi.fn(({ to, children }: { to: string; children: React.ReactNode }) => (
				<a href={to} data-mock-link="true">
					{children}
				</a>
			));
			render(
				<Breadcrumb
					segments={[{ label: "Work", to: "/work/portfolio" }, { label: "Current" }]}
					LinkComponent={MockLink}
				/>,
			);
			expect(MockLink).toHaveBeenCalled();
			expect(screen.getByText("Work").closest("[data-mock-link='true']")).toBeInTheDocument();
		});
	});

	describe("Truncation on middle segments", () => {
		it("middle segment (not first, not last) gets truncation class", () => {
			const { container } = render(
				<Breadcrumb
					segments={[
						{ label: "Work", to: "/work/portfolio" },
						{ label: "A Very Long Team Name", to: "/work/team/team-1" },
						{ label: "Current Bet" },
					]}
					LinkComponent={StubLink}
				/>,
			);
			// The middle segment link or its wrapper should have max-w-[120px]
			const truncated = container.querySelector(".max-w-\\[120px\\]");
			expect(truncated).toBeInTheDocument();
		});

		it("first segment does NOT have truncation class", () => {
			render(
				<Breadcrumb
					segments={[
						{ label: "Work", to: "/work/portfolio" },
						{ label: "Middle", to: "/work/team/t1" },
						{ label: "Current" },
					]}
					LinkComponent={StubLink}
				/>,
			);
			// First segment link should NOT be in a max-w-[120px] element
			const workLink = screen.getByRole("link", { name: "Work" });
			expect(workLink.closest(".max-w-\\[120px\\]")).toBeNull();
		});
	});

	describe("Leading slot", () => {
		it("renders the leading slot before segments", () => {
			render(
				<Breadcrumb
					segments={[{ label: "Work", to: "/work/portfolio" }, { label: "Bet" }]}
					leading={
						<button data-testid="back-btn" type="button">
							←
						</button>
					}
					LinkComponent={StubLink}
				/>,
			);
			const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
			const backBtn = screen.getByTestId("back-btn");
			const workLink = screen.getByRole("link", { name: "Work" });
			// back-btn must appear before the work link in DOM order
			expect(nav).toContainElement(backBtn);
			expect(nav).toContainElement(workLink);
			const children = Array.from(
				nav.querySelectorAll("[data-testid='back-btn'], a[href='/work/portfolio']"),
			);
			expect(children[0]).toBe(backBtn);
		});

		it("renders without leading slot when not provided", () => {
			render2Seg();
			// No back button — just the two segments
			expect(screen.queryByTestId("back-btn")).not.toBeInTheDocument();
		});
	});

	describe("Separators", () => {
		it("renders separators between segments", () => {
			const { container } = render(
				<Breadcrumb
					segments={[{ label: "Work", to: "/work/portfolio" }, { label: "Bet" }]}
					LinkComponent={StubLink}
				/>,
			);
			// There should be at least one separator character (/ or aria-hidden span)
			expect(container.textContent).toContain("/");
		});
	});

	describe("testId passthrough on segments", () => {
		it("passes testId to the link element", () => {
			render(
				<Breadcrumb
					segments={[
						{ label: "Work", to: "/work/portfolio", testId: "team-breadcrumb-back" },
						{ label: "Current" },
					]}
					LinkComponent={StubLink}
				/>,
			);
			// The link with testId should be findable by testId
			expect(screen.getByTestId("team-breadcrumb-back")).toBeInTheDocument();
			expect(screen.getByTestId("team-breadcrumb-back")).toHaveAttribute("href", "/work/portfolio");
		});
	});

	describe("Single segment (current page only)", () => {
		it("renders a single non-link segment without crashing", () => {
			render(<Breadcrumb segments={[{ label: "Knowledge" }]} LinkComponent={StubLink} />);
			expect(screen.getByText("Knowledge")).toBeInTheDocument();
			expect(screen.queryAllByRole("link")).toHaveLength(0);
		});
	});

	describe("N1 — AQ-010 contrast + focus-ring contract (must not silently regress)", () => {
		// These tests assert the class names that encode the --text-secondary contrast
		// and :focus-visible ring contract. If Breadcrumb.tsx drifts from these
		// class names, these tests will catch it before a visual review is needed.

		it("link segments carry the --text-secondary color class (NOT --text-tertiary)", () => {
			render2Seg();
			const workLink = screen.getByRole("link", { name: "Work" });
			// The link element must have the text-[color:var(--text-secondary)] class
			// (not text-[color:var(--text-tertiary)] which is 2.85:1 — below WCAG AA).
			expect(workLink.className).toContain("text-[color:var(--text-secondary)]");
			expect(workLink.className).not.toContain("text-[color:var(--text-tertiary)]");
		});

		it("link segments carry :focus-visible ring classes", () => {
			render2Seg();
			const workLink = screen.getByRole("link", { name: "Work" });
			// The focus-visible ring must be present as a Tailwind class — if it's
			// removed or changed to a different approach, this assertion will fail.
			expect(workLink.className).toContain("focus-visible:outline");
			expect(workLink.className).toContain("focus-visible:outline-[color:var(--accent-primary)]");
		});
	});
});
