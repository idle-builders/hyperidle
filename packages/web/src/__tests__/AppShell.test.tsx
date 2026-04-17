import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppShell } from "../layouts/AppShell";

function renderShell(
	initialPath = "/conversations/review",
	childContent = "Test Page Content",
): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations/review", element: <div>{childContent}</div> },
					{ path: "conversations/chat", element: <div>Chat Page</div> },
					{ path: "work/portfolio", element: <div>Portfolio Page</div> },
					{ path: "work/team", element: <div>Team Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return render(<RouterProvider router={router} />);
}

describe("AppShell", () => {
	it("renders the shell layout with four regions", async () => {
		renderShell();
		await waitFor(() => {
			// IconRail
			expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
			// Main content area
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
			// Outlet content
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});
	});

	it("shows Conversations submenu items when on conversations route", async () => {
		renderShell("/conversations/review");
		await waitFor(() => {
			expect(screen.getByText("Review Queue")).toBeInTheDocument();
			expect(screen.getByText("Chat")).toBeInTheDocument();
		});
	});

	it("navigates between submenu items", async () => {
		const user = userEvent.setup();
		renderShell("/conversations/review");

		await waitFor(() => {
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});

		// Click Chat nav item
		const chatLink = screen.getByText("Chat");
		await user.click(chatLink);

		await waitFor(() => {
			expect(screen.getByText("Chat Page")).toBeInTheDocument();
		});
	});

	it("switches views when clicking IconRail buttons", async () => {
		const user = userEvent.setup();
		renderShell("/conversations/review");

		await waitFor(() => {
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});

		// Click Work view button
		const workButton = screen.getByRole("button", { name: /work/i });
		await user.click(workButton);

		await waitFor(() => {
			expect(screen.getByText("Portfolio Page")).toBeInTheDocument();
		});
	});

	it("opens settings panel when avatar is clicked", async () => {
		const user = userEvent.setup();
		renderShell("/conversations/review");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /profile|user/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /profile|user/i }));

		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();
		});
	});

	it("shows the Rail with active bets and blockers", async () => {
		renderShell();
		await waitFor(() => {
			expect(screen.getByText("Active Bets")).toBeInTheDocument();
			expect(screen.getByText("Blockers")).toBeInTheDocument();
			expect(screen.getByText("Cost")).toBeInTheDocument();
		});
	});
});
