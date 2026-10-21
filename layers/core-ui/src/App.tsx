import { lazy, Suspense, useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useParams, useSearchParams } from "react-router";
import { Arrive } from "./Arrive";
import { Judge } from "./Judge";
import { People, viewFor } from "./People";
import { Shift } from "./Shift";
import { Sidebar } from "./Sidebar";
import { NewConversation, ThreadPage } from "./Thread";

/** The document page carries the editor, the largest piece of the app; it loads when a document is opened. */
const Think = lazy(() => import("./Think").then((m) => ({ default: m.Think })));

/** Light or dark follows the computer. */
function useComputerLooks(): void {
	useEffect(() => {
		const dark = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			document.documentElement.dataset.skin = "paper";
			document.documentElement.dataset.mode = dark.matches ? "dark" : "light";
		};
		apply();
		dark.addEventListener("change", apply);
		return () => dark.removeEventListener("change", apply);
	}, []);
}

/** The one shell: the sidebar, and the screen the address names beside it. */
function Shell() {
	return (
		<div className="frame">
			<Sidebar />
			<Outlet />
		</div>
	);
}

/** A review opens from its thread, so it keeps the thread's address. */
function Conversation() {
	const { id = "" } = useParams();
	const [search] = useSearchParams();
	const review = search.get("review");
	return review ? (
		<Judge key={review} threadId={id} reviewId={review} />
	) : (
		<ThreadPage key={id} id={id} />
	);
}

function Task() {
	const { id = "" } = useParams();
	return <Shift key={id} id={id} />;
}

function Document() {
	const { id = "" } = useParams();
	return (
		<Suspense fallback={null}>
			<Think key={id} id={id} />
		</Suspense>
	);
}

function Page({ of }: { of: "user" | "team" | "plugin" }) {
	const { id = "" } = useParams();
	return <People key={`${of}:${id}`} view={viewFor({ [of]: id })} />;
}

export function App() {
	useComputerLooks();
	// Every screen beside the sidebar still shows its design's made-up content; each later step
	// replaces one screen's content with real data, and none of it is left when the cutover ends.
	return (
		<Routes>
			<Route
				path="/start"
				element={
					<div className="frame frame--first">
						<Arrive step={0} />
					</div>
				}
			/>
			<Route element={<Shell />}>
				<Route path="/conversations" element={null} />
				<Route path="/conversations/new" element={<NewConversation />} />
				<Route path="/conversations/:id" element={<Conversation />} />
				<Route path="/work/:id" element={<Task />} />
				<Route path="/knowledge/:id" element={<Document />} />
				<Route path="/people/:id" element={<Page of="user" />} />
				<Route path="/teams/:id" element={<Page of="team" />} />
				<Route path="/plugins/:id" element={<Page of="plugin" />} />
			</Route>
			<Route path="*" element={<Navigate to="/conversations" replace />} />
		</Routes>
	);
}
