import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FirstRunFlow } from "../pages/FirstRunFlow";

interface FetchCall {
	url: string;
	init: RequestInit | undefined;
}

interface MockState {
	calls: FetchCall[];
	statusBody: Record<string, unknown>;
}

function installFetchMock(mock: MockState): void {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		mock.calls.push({ url, init });
		if (url.endsWith("/api/first-run/status")) {
			return new Response(JSON.stringify(mock.statusBody), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (url.endsWith("/api/first-run/factory")) {
			mock.statusBody = { ...mock.statusBody, factoryReady: true };
			return new Response(JSON.stringify({ ok: true, actorId: "actor:ceo" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (url.endsWith("/api/first-run/api-key")) {
			const body = init?.body ? JSON.parse(String(init.body)) : {};
			if (body.key === "sk-ant-validkey1234") {
				mock.statusBody = { ...mock.statusBody, apiKeyReady: true, apiKeyLast4: "1234" };
				return new Response(JSON.stringify({ ok: true, status: 200, last4: "1234" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(
				JSON.stringify({ ok: false, status: 401, message: "authentication_error: bad key" }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		if (url.endsWith("/api/first-run/north-star")) {
			mock.statusBody = { ...mock.statusBody, northStarReady: true };
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (url.endsWith("/api/first-run/team-scaffold")) {
			mock.statusBody = { ...mock.statusBody, teamScaffoldHandled: true };
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (url.endsWith("/api/first-run/complete")) {
			mock.statusBody = { ...mock.statusBody, complete: true };
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response("not found", { status: 404 });
	}) as typeof fetch;
}

function freshStatus(): Record<string, unknown> {
	return {
		factoryReady: false,
		apiKeyReady: false,
		apiKeyLast4: null,
		northStarReady: false,
		teamScaffoldHandled: false,
		complete: false,
	};
}

function renderFlow(): { mock: MockState } {
	const mock: MockState = { calls: [], statusBody: freshStatus() };
	installFetchMock(mock);
	const router = createMemoryRouter(
		[
			{ path: "/first-run", element: <FirstRunFlow /> },
			{ path: "/conversations/review", element: <div>Review</div> },
		],
		{ initialEntries: ["/first-run"] },
	);
	render(<RouterProvider router={router} />);
	return { mock };
}

describe("L10 FirstRunFlow", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.localStorage.clear();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("starts on the factory step when status is fresh", async () => {
		renderFlow();
		expect(await screen.findByTestId("first-run-step-factory")).toBeInTheDocument();
		expect(screen.getByTestId("first-run-factory-name")).toHaveFocus();
	});

	it("rejects empty factory name client-side", async () => {
		const user = userEvent.setup();
		renderFlow();
		await screen.findByTestId("first-run-step-factory");
		await user.click(screen.getByTestId("first-run-factory-submit"));
		expect(await screen.findByTestId("first-run-factory-error")).toHaveTextContent(/required/i);
	});

	it("walks all steps to completion and persists the API key only after a green test", async () => {
		const user = userEvent.setup();
		const { mock } = renderFlow();

		// Factory
		await screen.findByTestId("first-run-step-factory");
		await user.type(screen.getByTestId("first-run-factory-name"), "Acme");
		await user.click(screen.getByTestId("first-run-factory-submit"));

		// API key — bad key first, no advance
		const apiStep = await screen.findByTestId("first-run-step-api-key");
		expect(apiStep).toBeInTheDocument();
		await user.type(screen.getByTestId("first-run-api-key-input"), "sk-ant-bogus");
		await user.click(screen.getByTestId("first-run-api-key-test"));
		expect(await screen.findByTestId("first-run-api-key-error")).toHaveTextContent(/test failed/i);
		// still on api-key step
		expect(screen.getByTestId("first-run-step-api-key")).toBeInTheDocument();

		// Good key
		await user.clear(screen.getByTestId("first-run-api-key-input"));
		await user.type(screen.getByTestId("first-run-api-key-input"), "sk-ant-validkey1234");
		await user.click(screen.getByTestId("first-run-api-key-test"));

		// North star
		await screen.findByTestId("first-run-step-north-star");
		await user.type(screen.getByTestId("first-run-principles"), "p");
		await user.type(screen.getByTestId("first-run-focus"), "f");
		await user.type(screen.getByTestId("first-run-portfolio"), "po");
		await user.click(screen.getByTestId("first-run-north-star-submit"));

		// Team scaffold — skip path
		await screen.findByTestId("first-run-step-team");
		await user.click(screen.getByTestId("first-run-team-skip"));

		// Done
		await screen.findByTestId("first-run-step-done");
		await user.click(screen.getByTestId("first-run-finish"));

		// Eventually navigates to /conversations/review
		await waitFor(() => {
			expect(screen.getByText("Review")).toBeInTheDocument();
		});

		// Sanity check: api-key endpoint was hit twice (bad + good)
		const apiKeyCalls = mock.calls.filter((c) => c.url.endsWith("/api/first-run/api-key"));
		expect(apiKeyCalls).toHaveLength(2);
	});

	it("offers a skip path on team-scaffold but creates team when filled", async () => {
		const user = userEvent.setup();
		const { mock } = renderFlow();
		// Jump status forward to team step so we don't repeat earlier flow.
		mock.statusBody = {
			factoryReady: true,
			apiKeyReady: true,
			apiKeyLast4: "1234",
			northStarReady: true,
			teamScaffoldHandled: false,
			complete: false,
		};
		// remount to pick up new status
		const router = createMemoryRouter([{ path: "/first-run", element: <FirstRunFlow /> }], {
			initialEntries: ["/first-run"],
		});
		render(<RouterProvider router={router} />);
		await screen.findByTestId("first-run-step-team");
		await user.type(screen.getByTestId("first-run-product-name"), "Newsletter");
		await user.type(screen.getByTestId("first-run-brief"), "Help authors batch-publish.");
		await user.click(screen.getByTestId("first-run-team-create"));
		await screen.findByTestId("first-run-step-done");
	});
});
