import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../components/ErrorState";

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
});
