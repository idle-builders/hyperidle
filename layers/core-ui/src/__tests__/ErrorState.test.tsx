import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../ds";

describe("ErrorState", () => {
	it("renders error title and description", () => {
		render(
			<ErrorState
				title="Couldn't load knowledge"
				description="The server returned an error. Try again?"
				onRetry={() => undefined}
			/>,
		);
		expect(screen.getByText("Couldn't load knowledge")).toBeInTheDocument();
		expect(screen.getByText(/server returned an error/i)).toBeInTheDocument();
	});

	it("exposes role=alert so screen readers announce it", () => {
		render(<ErrorState title="Failed" description="Retry available." onRetry={() => undefined} />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("invokes onRetry when the retry button is clicked", async () => {
		const onRetry = vi.fn();
		render(<ErrorState title="Failed" description="Retry available." onRetry={onRetry} />);
		await userEvent.click(screen.getByRole("button", { name: /retry/i }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("omits retry button when onRetry is not provided", () => {
		render(<ErrorState title="Failed" description="No retry." />);
		expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
	});

	it("has surface-elevated background", () => {
		const { container } = render(<ErrorState title="Error" description="Something went wrong." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("bg-[var(--surface-elevated)]");
	});

	it("has --r-default radius for card shape", () => {
		const { container } = render(<ErrorState title="Error" description="Something went wrong." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("rounded-[var(--r-default)]");
	});

	it("has --shadow-default shadow matching mockup", () => {
		const { container } = render(<ErrorState title="Error" description="Something went wrong." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("shadow-[var(--shadow-default)]");
	});

	it("has 36px padding matching mockup", () => {
		const { container } = render(<ErrorState title="Error" description="Something went wrong." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("p-[36px]");
	});

	it("has max-width of 440px matching mockup", () => {
		const { container } = render(<ErrorState title="Error" description="Something went wrong." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("max-w-[440px]");
	});

	it("renders title with the title profile and primary color", () => {
		render(<ErrorState title="Error occurred" description="Check logs." />);
		const title = screen.getByText("Error occurred");
		expect(title.className).toContain("type-title");
		expect(title.className).toContain("text-[var(--text-primary)]");
	});

	it("renders description with the copy profile and secondary color", () => {
		render(<ErrorState title="T" description="My description" />);
		const desc = screen.getByText("My description");
		expect(desc.className).toContain("type-copy");
		expect(desc.className).toContain("text-[var(--text-secondary)]");
	});

	it("renders default warning triangle icon by default", () => {
		const { container } = render(<ErrorState title="Error" description="Desc." />);
		const iconContainer = container.querySelector(".w-\\[48px\\]");
		expect(iconContainer).not.toBeNull();
		// AI6: Icon container uses --status-error-dim token (replaces hardcoded rgba).
		const iconEl = iconContainer as HTMLElement | null;
		expect(iconEl?.style.background).toBe("var(--status-error-dim)");
	});

	it("renders icon in status-error color", () => {
		const { container } = render(<ErrorState title="Error" description="Desc." />);
		const iconContainer = container.querySelector(".w-\\[48px\\]");
		expect(iconContainer?.className).toContain("text-[var(--status-error)]");
	});

	it("suppresses icon when icon=false is passed", () => {
		const { container } = render(<ErrorState title="Error" description="Desc." icon={false} />);
		const iconContainer = container.querySelector(".w-\\[48px\\]");
		expect(iconContainer).toBeNull();
	});

	it("renders custom icon when provided", () => {
		render(
			<ErrorState title="Error" description="Desc." icon={<svg data-testid="custom-icon" />} />,
		);
		expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
	});

	it("uses default red-tinted iconBg (AI6: token form)", () => {
		const { container } = render(<ErrorState title="E" description="D" />);
		const iconContainer = container.querySelector(".w-\\[48px\\]") as HTMLElement | null;
		// AI6: default iconBg changed from rgba(220,74,58,0.08) to var(--status-error-dim) token.
		expect(iconContainer?.style.background).toBe("var(--status-error-dim)");
	});

	it("uses custom iconBg when provided", () => {
		const { container } = render(
			<ErrorState title="E" description="D" iconBg="rgba(217,119,6,0.08)" />,
		);
		const iconContainer = container.querySelector(".w-\\[48px\\]") as HTMLElement | null;
		// Browser normalizes rgba values with spaces after commas
		expect(iconContainer?.style.background).toBe("rgba(217, 119, 6, 0.08)");
	});

	it("renders detail block with monospace styling when detail is provided", () => {
		render(
			<ErrorState title="E" description="D" detail="Error 502: upstream service unavailable" />,
		);
		expect(screen.getByText("Error 502: upstream service unavailable")).toBeInTheDocument();
	});

	it("does not render detail block when detail is omitted", () => {
		const { container } = render(<ErrorState title="E" description="D" />);
		// No mono detail block
		const monoBlock = container.querySelector(".font-\\[var\\(--font-mono\\)\\]");
		expect(monoBlock).toBeNull();
	});

	it("renders retry button with pill shape and accent-primary background", () => {
		render(<ErrorState title="Failed" description="Retry." onRetry={() => undefined} />);
		const btn = screen.getByRole("button", { name: /retry/i });
		expect(btn.className).toContain("bg-[var(--accent-primary)]");
		expect(btn.className).toContain("text-[var(--text-on-accent)]");
		expect(btn.className).toContain("rounded-[var(--r-pill)]");
	});

	it("renders action slot alongside retry button when both provided", () => {
		render(
			<ErrorState
				title="E"
				description="D"
				onRetry={() => undefined}
				action={<a href="/status">View status</a>}
			/>,
		);
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "View status" })).toBeInTheDocument();
	});

	it("renders action slot without retry button when only action is provided", () => {
		render(<ErrorState title="E" description="D" action={<a href="/status">View status</a>} />);
		expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
		expect(screen.getByRole("link", { name: "View status" })).toBeInTheDocument();
	});
});
