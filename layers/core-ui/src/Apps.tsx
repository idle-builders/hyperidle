import {
	appSummary,
	appTitle,
	type DocumentRow,
	isRedactedPayload,
	type PlainReadPayload,
} from "@hyperidle/domain-model";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { APP_SANDBOX, appSrcdoc } from "./app-frame";
import { type AppRef, appParam, readAppParam } from "./app-ref";
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
export function useOpenApp(): (ref: AppRef) => void {
	const [, setSearch] = useSearchParams();
	return (ref) =>
		setSearch((s) => {
			const next = new URLSearchParams(s);
			next.set("app", appParam(ref));
			return next;
		});
}

/**
 * The card an app shows as where room is short: its title and what it says about itself, read
 * from its page without running it. `inline` sits it in a message or a task, not on its own line.
 */
export function AppCard({ page, of, inline }: { page: string; of: AppRef; inline?: boolean }) {
	const openApp = useOpenApp();
	const title = appTitle(page) ?? "An app";
	const line = appSummary(page);
	return (
		<button
			type="button"
			className={inline ? "made made--inline" : "made"}
			onClick={() => openApp(of)}
		>
			<span className="made-head">
				<span className="made-title">{title}</span>
				<span className="chip chip--app">App</span>
			</span>
			{line && line !== title && <span className="made-line">{line}</span>}
			<span className="made-open">Open beside →</span>
		</button>
	);
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
			onClick={() =>
				app ? openApp({ kind: "document", id: doc.id }) : navigate(`/knowledge/${doc.id}`)
			}
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
export function AppPane({ param }: { param: string }) {
	const ref = readAppParam(param);
	if (ref.kind === "task") return <TaskAppPane id={ref.id} />;
	if (ref.kind === "message") return <MessageAppPane threadId={ref.threadId} id={ref.id} />;
	return <DocumentAppPane id={ref.id} />;
}

function DocumentAppPane({ id }: { id: string }) {
	const navigate = useNavigate();
	const view = useAction("open_document", { id }, [`document:${id}`]);
	const doc = view.data?.document;
	return (
		<Pane
			title={doc?.title ?? ""}
			problem={view.problems?.[0]?.message ?? null}
			onRetry={view.reload}
			open={{ label: "Open as a page", to: () => navigate(`/knowledge/${id}`) }}
		>
			{doc?.format === "html" ? (
				<AppFrame html={doc.body} title={doc.title} />
			) : doc ? (
				<p className="app-pane-none">“{doc.title}” is a document, not an app.</p>
			) : null}
		</Pane>
	);
}

function TaskAppPane({ id }: { id: string }) {
	const view = useAction("search_tasks", { ids: [id] }, [`task:${id}`]);
	const task = view.data?.[0];
	const page = task?.descriptionFormat === "html" ? task.description : null;
	const title = (page && appTitle(page)) ?? task?.title ?? "";
	return (
		<Pane title={title} problem={view.problems?.[0]?.message ?? null} onRetry={view.reload}>
			{page ? (
				<AppFrame html={page} title={title} />
			) : task ? (
				<p className="app-pane-none">“{task.title}” has no app.</p>
			) : null}
		</Pane>
	);
}

function MessageAppPane({ threadId, id }: { threadId: string; id: string }) {
	const view = useAction("open_thread", { id: threadId }, [`thread:${threadId}`]);
	const message = view.data?.messages.find((m) => m.id === id);
	const payload =
		message && message.type === "plain" && !isRedactedPayload(message.payload)
			? (message.payload as PlainReadPayload)
			: null;
	const page = payload?.format === "html" ? payload.text : null;
	const title = (page && appTitle(page)) ?? "App";
	return (
		<Pane title={title} problem={view.problems?.[0]?.message ?? null} onRetry={view.reload}>
			{page ? (
				<AppFrame html={page} title={title} />
			) : view.data ? (
				<p className="app-pane-none">This message is not an app.</p>
			) : null}
		</Pane>
	);
}

function Pane({
	title,
	problem,
	onRetry,
	open,
	children,
}: {
	title: string;
	problem: string | null;
	onRetry: () => void;
	open?: { readonly label: string; readonly to: () => void };
	children: ReactNode;
}) {
	const [, setSearch] = useSearchParams();
	const close = () =>
		setSearch((s) => {
			const next = new URLSearchParams(s);
			next.delete("app");
			return next;
		});
	return (
		<aside className="app-pane" aria-label={title || "App"}>
			<header className="app-pane-head">
				<span className="chip chip--app">App</span>
				<h3>{title}</h3>
				{open && (
					<button type="button" className="tool" onClick={open.to}>
						{open.label}
					</button>
				)}
				<button type="button" className="tool" onClick={close}>
					Close
				</button>
			</header>
			{problem ? <Failed what="This app" why={problem} onRetry={onRetry} /> : children}
		</aside>
	);
}
