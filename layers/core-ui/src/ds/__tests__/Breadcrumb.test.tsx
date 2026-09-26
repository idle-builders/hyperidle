/**
 * Breadcrumb — router-agnostic via an injected LinkComponent.
 *
 * Contract: the last segment (no `to`) is the current page, not a link;
 * preceding segments with `to` render as links via LinkComponent; a
 * `leading` slot renders before the segments.
 */

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumb, type BreadcrumbProps } from "../Breadcrumb.js";

// @ts-expect-error A breadcrumb always has a current page.
const EMPTY_SEGMENTS: BreadcrumbProps["segments"] = [];
void EMPTY_SEGMENTS;

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

describe("Breadcrumb component", () => {
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
		it("only the sole current segment (last, no `to`) carries aria-current — a route-having middle segment does not", () => {
			render(
				<Breadcrumb
					segments={[
						{ label: "Work", to: "/work" },
						{ label: "Team without route" },
						{ label: "Current", to: "/wrong" },
					]}
					LinkComponent={StubLink}
				/>,
			);
			expect(screen.getByText("Team without route")).not.toHaveAttribute("aria-current");
			expect(screen.getByText("Current")).toHaveAttribute("aria-current", "page");
			expect(screen.queryByRole("link", { name: "Current" })).not.toBeInTheDocument();
			expect(screen.getByRole("link", { name: "Work" })).toBeInTheDocument();
		});

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
});
