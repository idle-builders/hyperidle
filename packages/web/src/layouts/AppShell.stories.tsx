import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

export default { title: "Layout: AppShell" };

function makeRouter(path: string, content: string): ReturnType<typeof createMemoryRouter> {
	return createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations/review", element: <div className="p-4">{content}</div> },
					{ path: "conversations/chat", element: <div className="p-4">Chat Page</div> },
					{ path: "work/portfolio", element: <div className="p-4">Portfolio Page</div> },
					{ path: "work/team", element: <div className="p-4">Team Page</div> },
					{ path: "knowledge", element: <div className="p-4">Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [path] },
	);
}

export const ConversationsView = (): React.JSX.Element => (
	<div className="h-[600px]">
		<RouterProvider router={makeRouter("/conversations/review", "Review Queue Content")} />
	</div>
);

export const WorkView = (): React.JSX.Element => (
	<div className="h-[600px]">
		<RouterProvider router={makeRouter("/work/portfolio", "Portfolio Content")} />
	</div>
);

export const KnowledgeView = (): React.JSX.Element => (
	<div className="h-[600px]">
		<RouterProvider router={makeRouter("/knowledge", "Knowledge Content")} />
	</div>
);
