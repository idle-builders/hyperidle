import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../ds";

describe("ErrorState", () => {
	it("renders the title and description", () => {
		render(
			<ErrorState
				title="Couldn't load documents"
				description="The server returned an error. Try again?"
				onRetry={() => undefined}
			/>,
		);
		expect(screen.getByText("Couldn't load documents")).toBeInTheDocument();
		expect(screen.getByText(/server returned an error/i)).toBeInTheDocument();
	});

	it("exposes role=alert so screen readers announce it", () => {
		render(<ErrorState title="Failed" description="Retry available." onRetry={() => undefined} />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("invokes onRetry when the retry button is clicked, and omits it when onRetry is absent", async () => {
		const onRetry = vi.fn();
		const { rerender } = render(
			<ErrorState title="Failed" description="Retry available." onRetry={onRetry} />,
		);
		await userEvent.click(screen.getByRole("button", { name: /retry/i }));
		expect(onRetry).toHaveBeenCalledTimes(1);

		rerender(<ErrorState title="Failed" description="No retry." />);
		expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
	});

	it("suppresses the default icon when icon=false, and renders a custom icon when provided", () => {
		const { rerender } = render(<ErrorState title="Error" description="Desc." icon={false} />);
		expect(screen.queryByTestId("custom-icon")).not.toBeInTheDocument();

		rerender(
			<ErrorState title="Error" description="Desc." icon={<svg data-testid="custom-icon" />} />,
		);
		expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
	});

	it("renders the detail text only when provided", () => {
		const { rerender } = render(<ErrorState title="E" description="D" />);
		expect(screen.queryByText(/upstream service unavailable/)).not.toBeInTheDocument();

		rerender(
			<ErrorState title="E" description="D" detail="Error 502: upstream service unavailable" />,
		);
		expect(screen.getByText("Error 502: upstream service unavailable")).toBeInTheDocument();
	});

	it("renders the action slot with and without the retry button", () => {
		const { rerender } = render(
			<ErrorState
				title="E"
				description="D"
				onRetry={() => undefined}
				action={<a href="/status">View status</a>}
			/>,
		);
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "View status" })).toBeInTheDocument();

		rerender(<ErrorState title="E" description="D" action={<a href="/status">View status</a>} />);
		expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
		expect(screen.getByRole("link", { name: "View status" })).toBeInTheDocument();
	});

	describe("compact — renders inline, same content and interaction contract", () => {
		it("renders the title and description", () => {
			render(<ErrorState compact title="Failed to load" description="The server errored." />);
			expect(screen.getByText("Failed to load")).toBeInTheDocument();
			expect(screen.getByText("The server errored.")).toBeInTheDocument();
		});

		it("exposes role=alert", () => {
			render(<ErrorState compact title="Failed" description="Try again." />);
			expect(screen.getByRole("alert")).toBeInTheDocument();
		});

		it("invokes onRetry from the compact retry button", async () => {
			const onRetry = vi.fn();
			render(<ErrorState compact title="Failed" description="Try again." onRetry={onRetry} />);
			await userEvent.click(screen.getByRole("button", { name: /retry/i }));
			expect(onRetry).toHaveBeenCalledTimes(1);
		});

		it("renders the detail text when given", () => {
			render(
				<ErrorState
					compact
					title="Failed"
					description="Try again."
					detail="Error 502: upstream unavailable"
				/>,
			);
			expect(screen.getByText("Error 502: upstream unavailable")).toBeInTheDocument();
		});
	});
});
