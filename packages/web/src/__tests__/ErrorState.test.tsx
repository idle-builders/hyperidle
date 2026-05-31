import { ErrorState } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

	it("has warm card styling with surface-elevated background", () => {
		const { container } = render(
			<ErrorState title="Error" description="Something went wrong." />,
		);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("bg-[var(--surface-elevated)]");
	});

	it("has --r-default radius for card shape", () => {
		const { container } = render(
			<ErrorState title="Error" description="Something went wrong." />,
		);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("rounded-[var(--r-default)]");
	});

	it("has --shadow-subtle shadow for card depth", () => {
		const { container } = render(
			<ErrorState title="Error" description="Something went wrong." />,
		);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("shadow-[var(--shadow-subtle)]");
	});

	it("renders error title in --status-error color", () => {
		render(<ErrorState title="Error occurred" description="Check logs." />);
		const title = screen.getByText("Error occurred");
		expect(title.className).toContain("text-[var(--status-error)]");
	});

	it("renders retry button with --accent-primary background and --text-on-accent text", () => {
		render(<ErrorState title="Failed" description="Retry." onRetry={() => undefined} />);
		const btn = screen.getByRole("button", { name: /retry/i });
		expect(btn.className).toContain("bg-[var(--accent-primary)]");
		expect(btn.className).toContain("text-[var(--text-on-accent)]");
	});
});
