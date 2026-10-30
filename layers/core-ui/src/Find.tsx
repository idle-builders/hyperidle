import type { UserRow } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { call, get } from "./api";
import { answering, type Found, findRows, marked } from "./find-hits";
import { Avatar } from "./Msg";
import { RichText } from "./RichText";
import { Seg } from "./Seg";
import { initials } from "./sidebar-lists";
import { useAction } from "./useAction";

/**
 * Find or ask: one overlay, one input, two intents. Tab flips between them and keeps what you
 * typed. Find lists what matched, grouped, with a preview of the matching text; ↵ opens it. Ask
 * saves the question as a thread with an agent in Conversations, and the answer shows here as the
 * agent writes it in that thread; ⌘↵ opens the thread.
 *
 * Who answers: your own agents first, the oldest first, then the team's — the agent you have had
 * longest is the one that knows your work. Another can be picked before asking.
 */
type Mode = "Find" | "Ask";
const MODES = ["Find", "Ask"] as const;

/** Agents in the order asking offers them: yours, oldest first, then everyone else's. */
function askable(users: readonly UserRow[], you: string): UserRow[] {
	return users
		.filter((u) => u.kind === "ai" && u.status !== "retired")
		.sort(
			(a, b) =>
				Number(b.ownerUserId === you) - Number(a.ownerUserId === you) ||
				a.createdAt.localeCompare(b.createdAt),
		);
}

/** The hits for `text`, asked again a moment after typing stops. */
function useFound(text: string, on: boolean): Found | null {
	const [found, setFound] = useState<{ q: string; hits: Found } | null>(null);
	const q = text.trim();
	useEffect(() => {
		if (!(on && q)) return;
		let current = true;
		const timer = setTimeout(() => {
			void get(`/api/search?q=${encodeURIComponent(q)}`)
				.then((r) => (r.ok ? (r.json() as Promise<Found>) : null))
				.then((hits) => {
					if (current && hits) setFound({ q, hits });
				});
		}, 150);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	}, [q, on]);
	return q && found ? found.hits : null;
}

/** The titles of what an answer named, asked for once per set of sources. */
function useTitles(sources: readonly { kind: "document" | "task"; id: string }[]) {
	const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map());
	const key = JSON.stringify(sources);
	useEffect(() => {
		const all = JSON.parse(key) as typeof sources;
		const ids = (kind: string) => all.filter((s) => s.kind === kind).map((s) => s.id);
		const [docIds, taskIds] = [ids("document"), ids("task")];
		void Promise.all([
			docIds.length ? call("search_documents", { ids: docIds }) : null,
			taskIds.length ? call("search_tasks", { ids: taskIds }) : null,
		]).then(([d, t]) =>
			setTitles(
				new Map([
					...(d?.ok ? d.data.map((x): [string, string] => [x.id, x.title]) : []),
					...(t?.ok ? t.data.map((x): [string, string] => [x.id, x.title]) : []),
				]),
			),
		);
	}, [key]);
	return titles;
}

/** The answer, live from the thread the question was saved as. */
function Answer({
	threadId,
	agent,
	you,
	onOpen,
}: {
	threadId: string;
	agent: UserRow;
	you: string;
	onOpen: (to: string) => void;
}) {
	const view = useAction("open_thread", { id: threadId }, [`thread:${threadId}`]);
	const a = answering([...(view.data?.messages ?? [])].reverse(), you);
	const titles = useTitles(a.sources);
	return (
		<>
			{a.said.map((s) =>
				s.yours ? (
					<p key={s.id} className="pal-q">
						{s.text}
					</p>
				) : (
					<div key={s.id} className="pal-ans">
						<RichText text={s.text} />
					</div>
				),
			)}
			{a.waiting && (
				<div className="pal-who">
					<Avatar who={initials(agent.name)} />
					<span>
						<b>{agent.name}</b> is answering
					</span>
				</div>
			)}
			{a.sources.length > 0 && (
				<div className="pal-src">
					<span className="pal-src-h">Sources</span>
					{a.sources.map((s) => (
						<button
							key={s.id}
							type="button"
							className="pal-src-row"
							onClick={() => onOpen(`/${s.kind === "task" ? "work" : "knowledge"}/${s.id}`)}
						>
							<span className="pal-src-sp">{s.kind === "task" ? "Task" : "Document"}</span>
							<span>{titles.get(s.id) ?? ""}</span>
						</button>
					))}
				</div>
			)}
		</>
	);
}

export function FindOrAsk({ onClose }: { onClose: () => void }) {
	const navigate = useNavigate();
	const me = useAction("open_user", {});
	const users = useAction("search_users", { kind: "ai" });
	const you = me.data?.user?.id ?? "";
	const agents = askable(users.data ?? [], you);

	const [mode, setMode] = useState<Mode>("Find");
	const [text, setText] = useState("");
	const [sel, setSel] = useState(0);
	const [picked, setPicked] = useState<string | null>(null);
	const [threadId, setThreadId] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	const found = useFound(text, mode === "Find");
	const rows = found ? findRows(found) : [];
	const hit = rows[Math.min(sel, rows.length - 1)];
	const agent = agents.find((a) => a.id === picked) ?? agents[0];
	const q = text.trim();

	const open = (to: string) => {
		onClose();
		navigate(to);
	};
	const flip = () => setMode(mode === "Find" ? "Ask" : "Find");

	const ask = async () => {
		if (!(q && agent)) return;
		let id = threadId;
		if (!id) {
			const made = await call("adjust_thread", { title: q.slice(0, 120), members: [agent.id] });
			if (!made.ok) return setProblem(made.problems[0]?.message ?? "The question did not start.");
			id = made.data.thread.id;
			setThreadId(id);
		}
		const sent = await call("send_message", { threadId: id, text: q });
		if (!sent.ok) return setProblem(sent.problems[0]?.message ?? "It did not send.");
		setProblem(null);
		setText("");
	};

	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === "Tab") {
			e.preventDefault();
			flip();
		} else if (e.key === "Escape") onClose();
		else if (mode === "Find" && e.key === "ArrowDown") {
			e.preventDefault();
			setSel(Math.min(sel + 1, rows.length - 1));
		} else if (mode === "Find" && e.key === "ArrowUp") {
			e.preventDefault();
			setSel(Math.max(sel - 1, 0));
		} else if (e.key === "Enter" && mode === "Find") {
			if (hit) open(hit.to);
		} else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			if (threadId) open(`/conversations/${threadId}`);
		} else if (e.key === "Enter") void ask();
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a click outside the overlay closes it; Esc does the same from the keyboard
		// biome-ignore lint/a11y/useKeyWithClickEvents: Esc on the input closes it
		<div
			className="pal-back"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="pal" role="dialog" aria-label="Find or ask">
				<div className="pal-top">
					<Seg label="Mode" options={MODES} value={mode} onChange={setMode} />
					<input
						className="pal-in"
						// biome-ignore lint/a11y/noAutofocus: the overlay opens to type into
						autoFocus
						value={text}
						aria-label={mode}
						placeholder={
							mode === "Find"
								? "Find threads, tasks, documents, apps…"
								: "Ask anything — an agent answers with sources"
						}
						onChange={(e) => {
							setText(e.target.value);
							setSel(0);
						}}
						onKeyDown={onKey}
					/>
					<kbd className="pal-kbd">esc</kbd>
				</div>

				{mode === "Find" ? (
					<div className="pal-body">
						<div className="pal-list" role="listbox" aria-label="Found">
							{agent && q && (
								<button type="button" className="pal-askrow" onClick={flip}>
									<span className="pal-askrow-ic">↳</span>
									<span>
										Ask {agent.name} about “{q}”
									</span>
									<kbd>Tab</kbd>
								</button>
							)}
							{(["Knowledge", "Apps", "Conversations", "Work"] as const).map((group) => {
								const inGroup = rows.filter((r) => r.group === group);
								if (inGroup.length === 0) return null;
								return (
									<div key={group}>
										<p className="pal-group">{group}</p>
										{inGroup.map((r) => (
											<button
												key={r.to}
												type="button"
												role="option"
												className="pal-hit"
												aria-selected={hit?.to === r.to}
												onMouseEnter={() => setSel(rows.indexOf(r))}
												onClick={() => open(r.to)}
											>
												<span className="pal-hit-t">{r.title}</span>
												<span className="pal-hit-w">{r.where}</span>
											</button>
										))}
									</div>
								);
							})}
							{!q && <p className="pal-none">Type to find threads, tasks, documents and apps.</p>}
							{q && found && rows.length === 0 && (
								<p className="pal-none">Nothing found for “{q}”. Tab asks an agent instead.</p>
							)}
						</div>
						<div className="pal-prev">
							{hit && (
								<>
									<span className="pal-prev-sp">{hit.kind}</span>
									<h3>{hit.title}</h3>
									<span className="pal-prev-w">{hit.where}</span>
									{hit.snippet && (
										<p className="pal-prev-s">
											{marked(hit.snippet, q).map((part, i) =>
												i === 1 ? (
													// biome-ignore lint/suspicious/noArrayIndexKey: the three parts never move
													<mark key={i}>{part}</mark>
												) : (
													part
												),
											)}
										</p>
									)}
									<span className="pal-prev-go">↵ open</span>
								</>
							)}
						</div>
					</div>
				) : (
					<div className="pal-ask">
						{agents.length === 0 ? (
							<p className="pal-none">No agent to ask yet. Add one on your team's page.</p>
						) : (
							<label className="pal-asker">
								<span>Ask</span>
								<select
									className="in"
									aria-label="Who answers"
									value={agent?.id ?? ""}
									disabled={threadId !== null}
									onChange={(e) => setPicked(e.target.value)}
								>
									{agents.map((a) => (
										<option key={a.id} value={a.id}>
											{a.name}
										</option>
									))}
								</select>
							</label>
						)}
						{threadId && agent ? (
							<Answer threadId={threadId} agent={agent} you={you} onOpen={open} />
						) : (
							agent && (
								<p className="pal-none">
									↵ asks {agent.name}. The question is saved as a thread in Conversations, and the
									answer shows here as it is written.
								</p>
							)
						)}
						{problem && <p className="composer-problem">{problem}</p>}
					</div>
				)}

				<footer className="pal-foot">
					{mode === "Find" ? (
						<>
							<span>
								<kbd>↑↓</kbd> move
							</span>
							<span>
								<kbd>↵</kbd> open
							</span>
							<span>
								<kbd>Tab</kbd> ask instead
							</span>
						</>
					) : (
						<>
							{threadId && <span className="pal-saved">Saved as a thread in Conversations</span>}
							<span>
								<kbd>↵</kbd> {threadId ? "follow up" : "ask"}
							</span>
							{threadId && (
								<span>
									<kbd>⌘↵</kbd> open thread
								</span>
							)}
							<span>
								<kbd>Tab</kbd> back to find
							</span>
						</>
					)}
				</footer>
			</div>
		</div>
	);
}
