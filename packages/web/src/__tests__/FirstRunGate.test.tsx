import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { FirstRunGate } from "../layouts/FirstRunGate";

function mockFetch(statusBody: Record<string, unknown>): void {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.endsWith("/api/first-run/status")) {
			return new Response(JSON.stringify(statusBody), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response("not found", { status: 404 });
	}) as typeof fetch;
}

const completeStatus = {
	factoryReady: true,
	apiKeyReady: true,
	apiKeyLast4: "1234",
	northStarReady: true,
	teamScaffoldHandled: true,
	complete: true,
};

const incompleteStatus = {
	factoryReady: false,
	apiKeyReady: false,
	apiKeyLast4: null,
	northStarReady: false,
	teamScaffoldHandled: false,
	complete: false,
};

function renderGate(initialPath: string): void {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<FirstRunGate>
						<div data-testid="populated-ui">Populated UI</div>
					</FirstRunGate>
				),
			},
			{ path: "/first-run", element: <div data-testid="first-run-page">First Run</div> },
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
}

describe("L10 FirstRunGate", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("renders children when first-run is complete", async () => {
		mockFetch(completeStatus);
		renderGate("/");
		await waitFor(() => {
			expect(screen.getByTestId("populated-ui")).toBeInTheDocument();
		});
	});

	it("redirects to /first-run when not complete (no AppShell flash)", async () => {
		mockFetch(incompleteStatus);
		renderGate("/");
		await waitFor(() => {
			expect(screen.getByTestId("first-run-page")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("populated-ui")).not.toBeInTheDocument();
	});

	it("renders loading skeleton during the initial fetch", () => {
		// Fetch never resolves so we stay in loading
		globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
		renderGate("/");
		expect(screen.getByTestId("first-run-gate-loading")).toBeInTheDocument();
	});
});
