import type { DocumentRow } from "@hyperidle/domain-model";
import { useNavigate, useSearchParams } from "react-router";
import { APP_SANDBOX, appSrcdoc, appSummary } from "./app-frame";
import { Failed } from "./Failed";
import { useAction } from "./useAction";

/**
 * An app runs whole only where it has the room: its own page, or the pane beside the work. Where
 * room is short it is a card, which says what the app is without running it.
 */

/** The app, running in its box and filling the space it is given. */
export function AppFrame({ html, title }: { html: string; title: string }) {
	return (
		<iframe className="app-frame" title={title} sandbox={APP_SANDBOX} srcDoc={appSrcdoc(html)} />
	);
}

/** Opens an app in the pane beside whatever is on screen, keeping the rest of the address. */
export function useOpenApp(): (id: string) => void {
	const [, setSearch] = useSearchParams();
	return (id) =>
		setSearch((s) => {
			const next = new URLSearchParams(s);
			next.set("app", id);
			return next;
		});
}

/** A document something made, shown where it was made: an app opens beside it, a document as its page. */
export function MadeCard({ doc }: { doc: DocumentRow }) {
	const navigate = useNavigate();
	const openApp = useOpenApp();
	const app = doc.format === "html";
	const line = app ? appSummary(doc.body) : firstLine(doc.body);
	return (
		<button
			type="button"
			className="made"
			onClick={() => (app ? openApp(doc.id) : navigate(`/knowledge/${doc.id}`))}
		>
			<span className="made-head">
				<span className="made-title">{doc.title}</span>
				<span className={app ? "chip chip--app" : "chip chip--quiet"}>
					{app ? "App" : "Document"}
				</span>
			</span>
			{line && <span className="made-line">{line}</span>}
			<span className="made-open">{app ? "Open beside →" : "Open →"}</span>
		</button>
	);
}

function firstLine(markdown: string): string | null {
	const line = markdown.split("\n").find((l) => l.trim() !== "");
	return line ? line.replace(/^#+\s*/, "").trim() : null;
}

/** The pane the address names with `?app=`: the app beside the page, until it is closed. */
export function AppPane({ id }: { id: string }) {
	const navigate = useNavigate();
	const [, setSearch] = useSearchParams();
	const view = useAction("open_document", { id }, [`document:${id}`]);
	const doc = view.data?.document;
	const close = () =>
		setSearch((s) => {
			const next = new URLSearchParams(s);
			next.delete("app");
			return next;
		});
	return (
		<aside className="app-pane" aria-label={doc?.title ?? "App"}>
			<header className="app-pane-head">
				<span className="chip chip--app">App</span>
				<h3>{doc?.title ?? ""}</h3>
				<button type="button" className="tool" onClick={() => navigate(`/knowledge/${id}`)}>
					Open as a page
				</button>
				<button type="button" className="tool" onClick={close}>
					Close
				</button>
			</header>
			{view.problems ? (
				<Failed what="This app" why={view.problems[0]?.message} onRetry={view.reload} />
			) : doc?.format === "html" ? (
				<AppFrame html={doc.body} title={doc.title} />
			) : doc ? (
				<p className="app-pane-none">“{doc.title}” is a document, not an app.</p>
			) : null}
		</aside>
	);
}
