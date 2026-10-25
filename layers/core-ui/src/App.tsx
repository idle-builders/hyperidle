import { lazy, Suspense, useState } from "react";
import { Navigate, Outlet, Route, Routes, useParams, useSearchParams } from "react-router";
import { FocusContext } from "./focus";
import { Judge } from "./Judge";
import { useAppLooks } from "./looks";
import { TeamScreen, UserScreen } from "./People";
import { PluginScreen } from "./Plugins";
import { Shift } from "./Shift";
import { Sidebar } from "./Sidebar";
import { Start } from "./Start";
import { NewConversation, ThreadPage } from "./Thread";
import { useAction } from "./useAction";

/** The document page carries the editor, the largest piece of the app; it loads when a document is opened. */
const Think = lazy(() => import("./Think").then((m) => ({ default: m.Think })));

/**
 * The one shell: the sidebar, and the screen the address names beside it. A fresh install — no
 * person has a row yet — goes to first start instead.
 */
function Shell() {
	const me = useAction("open_user", {});
	const [editing, setEditing] = useState(false);
	// Nothing opens the live connection until a person exists: it speaks for whoever asked for it.
	if (!(me.data || me.problems)) return null;
	if (me.data && me.data.user === null) return <Navigate to="/start" replace />;
	return (
		<FocusContext.Provider value={{ editing, setEditing }}>
			<div className="frame">
				<Sidebar />
				<Outlet />
			</div>
		</FocusContext.Provider>
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

function Person() {
	const { id = "" } = useParams();
	return <UserScreen key={id} id={id} />;
}

function Team() {
	const { id = "" } = useParams();
	return <TeamScreen key={id} name={id} />;
}

function Plugin() {
	const { id = "" } = useParams();
	return <PluginScreen key={id} id={id} />;
}

export function App() {
	useAppLooks();
	return (
		<Routes>
			<Route path="/start" element={<Start />} />
			<Route element={<Shell />}>
				<Route path="/conversations" element={null} />
				<Route path="/conversations/new" element={<NewConversation />} />
				<Route path="/conversations/:id" element={<Conversation />} />
				<Route path="/work/:id" element={<Task />} />
				<Route path="/knowledge/:id" element={<Document />} />
				<Route path="/people/:id" element={<Person />} />
				<Route path="/teams/:id" element={<Team />} />
				<Route path="/plugins/:id" element={<Plugin />} />
			</Route>
			<Route path="*" element={<Navigate to="/conversations" replace />} />
		</Routes>
	);
}
