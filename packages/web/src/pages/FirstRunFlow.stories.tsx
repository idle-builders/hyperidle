/**
 * Stories for FirstRunFlow (L10). Renders inside MemoryRouter so navigation
 * primitives work standalone in /designsystem.
 */
import type { JSX } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { FirstRunFlow } from "./FirstRunFlow";

function renderWithRouter(): JSX.Element {
	const router = createMemoryRouter(
		[
			{ path: "/first-run", element: <FirstRunFlow /> },
			{ path: "/conversations/review", element: <div>Review</div> },
		],
		{ initialEntries: ["/first-run"] },
	);
	return <RouterProvider router={router} />;
}

export function FirstRunFlowFresh(): JSX.Element {
	return renderWithRouter();
}

export default {
	component: FirstRunFlow,
	title: "L10/FirstRunFlow",
};
