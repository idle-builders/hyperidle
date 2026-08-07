import { EmptyState } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("EmptyState", () => {
	it("renders title and description as meaningful message", () => {
		render(
			<EmptyState
				title="No knowledge items yet"
				description="Agents will populate this as they learn."
			/>,
		);
		expect(screen.getByText("No knowledge items yet")).toBeInTheDocument();
		expect(screen.getByText("Agents will populate this as they learn.")).toBeInTheDocument();
	});

	it("uses a status role so assistive tech announces it", () => {
		render(<EmptyState title="Nothing needs attention" description="Triage is clear." />);
		const region = screen.getByRole("status");
		expect(region).toHaveTextContent("Nothing needs attention");
		expect(region).toHaveTextContent("Triage is clear.");
	});

	it("supports a testid for integration selectors", () => {
		render(
			<EmptyState
				title="No threads"
				description="Start a conversation to see it here."
				dataTestId="conv-empty"
			/>,
		);
		expect(screen.getByTestId("conv-empty")).toBeInTheDocument();
	});

	it("uses surface-page background (not elevated)", () => {
		const { container } = render(<EmptyState title="No items" description="Nothing here." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("bg-[var(--surface-page)]");
	});

	it("has --r-default radius for card shape", () => {
		const { container } = render(<EmptyState title="No items" description="Nothing here." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("rounded-[var(--r-default)]");
	});

	it("has no shadow (EmptyState is lighter than ErrorState)", () => {
		const { container } = render(<EmptyState title="No items" description="Nothing here." />);
		const outer = container.firstElementChild;
		expect(outer?.className).not.toContain("shadow");
	});

	it("has 36px padding matching mockup", () => {
		const { container } = render(<EmptyState title="No items" description="Nothing here." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("p-[36px]");
	});

	it("has max-width of 420px matching mockup", () => {
		const { container } = render(<EmptyState title="No items" description="Nothing here." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("max-w-[420px]");
	});

	it("renders title at 20px/600 matching mockup typography", () => {
		render(<EmptyState title="Big title" description="desc" />);
		const title = screen.getByText("Big title");
		expect(title.className).toContain("text-[20px]");
		expect(title.className).toContain("font-[600]");
	});

	it("renders description at 15px/text-secondary/1.7 line-height", () => {
		render(<EmptyState title="T" description="My description" />);
		const desc = screen.getByText("My description");
		expect(desc.className).toContain("text-[15px]");
		expect(desc.className).toContain("text-[var(--text-secondary)]");
		expect(desc.className).toContain("leading-[1.7]");
	});

	it("renders icon in a 48x48 tinted container when icon prop is provided", () => {
		const { container } = render(
			<EmptyState title="T" description="D" icon={<svg data-testid="test-icon" />} />,
		);
		const iconContainer = container.querySelector(".w-\\[48px\\]");
		expect(iconContainer).not.toBeNull();
		expect(screen.getByTestId("test-icon")).toBeInTheDocument();
	});

	it("does not render icon container when icon prop is omitted", () => {
		const { container } = render(<EmptyState title="T" description="D" />);
		const iconContainer = container.querySelector(".w-\\[48px\\]");
		expect(iconContainer).toBeNull();
	});

	it("uses default green-tinted iconBg when icon is provided without iconBg (AI6: token form)", () => {
		const { container } = render(<EmptyState title="T" description="D" icon={<svg />} />);
		const iconContainer = container.querySelector(".w-\\[48px\\]") as HTMLElement | null;
		// AI6: default iconBg changed from rgba(22,118,79,0.08) to var(--accent-primary-dim) token.
		expect(iconContainer?.style.background).toBe("var(--accent-primary-dim)");
	});

	it("uses custom iconBg when provided", () => {
		const { container } = render(
			<EmptyState title="T" description="D" icon={<svg />} iconBg="rgba(0,0,255,0.1)" />,
		);
		const iconContainer = container.querySelector(".w-\\[48px\\]") as HTMLElement | null;
		// Browser normalizes rgba values with spaces after commas
		expect(iconContainer?.style.background).toBe("rgba(0, 0, 255, 0.1)");
	});

	it("renders action slot when provided", () => {
		render(
			<EmptyState title="T" description="D" action={<button type="button">Click me</button>} />,
		);
		expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
	});

	it("does not render action wrapper when action is omitted", () => {
		const { container } = render(<EmptyState title="T" description="D" />);
		// Should have: icon-container (absent), title p, description p — only 2 children
		const card = container.firstElementChild;
		expect(card?.children.length).toBe(2);
	});
});
