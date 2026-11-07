import type { SubscriptionEventName } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { cronOf, cronWords, EVENT_CHOICES, type Often, type Pair } from "./people-page";
import { Seg } from "./Seg";

/**
 * SETTING UP A USER — the small forms behind the buttons on a user's page. Each is a dialog over
 * the page it changes: the list it adds to on top, a few fields below, and the result shows up in
 * the box behind it. Where someone works (folders) and what they can reach (services) are two
 * lists. What starts an agent, and what a person is told about, is a list of reasons. Adding
 * someone and editing someone are the same form. Anything long is a document: an agent's
 * instructions and what a reason makes it do are written where documents are edited, after the
 * dialog has made the agent or the reason.
 */

/** Who a dialog is about. */
export interface Subject {
	name: string;
	agent: boolean;
	/** The page is your own. */
	me: boolean;
}

export function Dialog({
	title,
	sub,
	done,
	aside,
	problem,
	onClose,
	onDone,
	children,
}: {
	title: string;
	sub: string;
	done: string;
	/** Sits left of the buttons: a quiet action, or a word on what comes next. */
	aside?: React.ReactNode;
	/** What went wrong with the last try, in the server's words. */
	problem?: string | null;
	onClose: () => void;
	onDone: () => void;
	children: React.ReactNode;
}): React.ReactElement {
	useEffect(() => {
		const esc = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", esc);
		return () => document.removeEventListener("keydown", esc);
	}, [onClose]);
	return (
		<div className="dlg-back">
			<button
				type="button"
				className="dlg-scrim"
				aria-label="Close"
				tabIndex={-1}
				onClick={onClose}
			/>
			<dialog open className="dlg" aria-label={title}>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						onDone();
					}}
				>
					<header className="dlg-h">
						<h3>{title}</h3>
						<p>{sub}</p>
					</header>
					<div className="dlg-b">{children}</div>
					{problem && <p className="composer-problem">{problem}</p>}
					<footer className="dlg-f">
						<span className="dlg-aside">{aside}</span>
						<button type="button" className="btn" onClick={onClose}>
							Cancel
						</button>
						<button type="submit" className="btn btn--accent">
							{done}
						</button>
					</footer>
				</form>
			</dialog>
		</div>
	);
}

export function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<div className="field">
			<span className="field-l">{label}</span>
			<div className="field-c">
				{children}
				{hint && <p className="field-h">{hint}</p>}
			</div>
		</div>
	);
}

const flipIn = (all: ReadonlySet<string>, x: string): Set<string> => {
	const next = new Set(all);
	if (next.has(x)) next.delete(x);
	else next.add(x);
	return next;
};

/* ---------- the reasons someone starts working, or is told ---------- */

/** A reason already there: built in, or a switch. */
export type ReasonRow = Pair & { id?: string; paused?: boolean };

export interface ReasonsSave {
	/** Reasons whose switch changed: id → now paused. */
	paused: Map<string, boolean>;
	times: string[];
	events: SubscriptionEventName[];
	/** The name of what the new reasons make an agent do. */
	name: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const OFTEN: readonly Often[] = ["day", "week", "month"];

interface Time {
	often: Often;
	day: string;
	time: string;
}

export function StartDialog({
	who,
	rows,
	onClose,
	onSave,
}: {
	who: Subject;
	rows: readonly ReasonRow[];
	onClose: () => void;
	onSave: (save: ReasonsSave) => Promise<string | null>;
}) {
	const agent = who.agent;
	const [paused, setPaused] = useState<Map<string, boolean>>(new Map());
	const [times, setTimes] = useState<Time[]>([]);
	const [events, setEvents] = useState<ReadonlySet<SubscriptionEventName>>(new Set());
	const [name, setName] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const have = new Set(rows.map((r) => r.what));
	const choices = EVENT_CHOICES.map((c) => ({
		...c,
		does: c.does.filter((d) => agent || !have.has(`${c.about} ${d.words}`)),
	})).filter((c) => c.does.length > 0);
	const fresh = times.length + events.size > 0;

	const save = async () => {
		if (agent && fresh && !name.trim()) {
			setProblem("Name what these reasons make it do; that is the document it reads.");
			return;
		}
		const failed = await onSave({
			paused,
			times: times.map((t) => cronOf(t.often, t.day, t.time)),
			events: [...events],
			name: name.trim(),
		});
		if (failed) setProblem(failed);
	};
	return (
		<Dialog
			title={agent ? `When ${who.name} starts working` : "What you are told about"}
			sub={
				agent
					? "A list of reasons. Any one of them starts it."
					: "A set of reasons. Each one sends you a notification under the bell."
			}
			done={agent && fresh ? "Add" : "Save"}
			problem={problem}
			onClose={onClose}
			onDone={() => void save()}
		>
			<div className="reach">
				{rows.map((r) => (
					<div key={r.id ?? r.what} className="reach-row">
						<span className="reach-name">{r.what}</span>
						{r.why && <span className="reach-how">{r.why}</span>}
						{r.fixed || !r.id ? (
							<span className="reach-side">always</span>
						) : (
							<button
								type="button"
								className="fact-switch"
								role="switch"
								aria-checked={!(paused.get(r.id) ?? r.paused)}
								aria-label={r.what}
								onClick={() => {
									const id = r.id ?? "";
									setPaused(new Map(paused).set(id, !(paused.get(id) ?? r.paused)));
								}}
							>
								<span className="fact-knob" />
							</button>
						)}
					</div>
				))}
			</div>

			<div className="dlg-part">
				<div className="dlg-part-h">{agent ? "Add reasons" : "More reasons"}</div>
				<Field
					label={agent ? "Start when" : "Tell me when"}
					hint={`${agent ? "Any one of these starts it. " : ""}Things that happen count anywhere ${agent ? who.name : "you"} can see.`}
				>
					{agent && (
						<>
							<span className="field-sub">At a time</span>
							{times.map((t, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: the same time may be listed twice
								<div key={i} className="in-row in-row--words">
									<span>Every</span>
									<select
										className="in"
										aria-label="How often"
										value={t.often}
										onChange={(e) =>
											setTimes(
												times.map((x, j) =>
													j === i ? { ...x, often: e.target.value as Often } : x,
												),
											)
										}
									>
										{OFTEN.map((x) => (
											<option key={x}>{x}</option>
										))}
									</select>
									{t.often === "week" && (
										<>
											<span>on</span>
											<select
												className="in"
												aria-label="Day"
												value={t.day}
												onChange={(e) =>
													setTimes(
														times.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)),
													)
												}
											>
												{DAYS.map((x) => (
													<option key={x}>{x}</option>
												))}
											</select>
										</>
									)}
									<span>at</span>
									<input
										className="in in--time"
										value={t.time}
										aria-label="Time"
										onChange={(e) =>
											setTimes(times.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))
										}
									/>
									<button
										type="button"
										className="in-x"
										aria-label="Remove this time"
										onClick={() => setTimes(times.filter((_, j) => j !== i))}
									>
										✕
									</button>
								</div>
							))}
							{times.length > 0 && (
								<p className="field-h">
									{times.map((t) => cronWords(cronOf(t.often, t.day, t.time))).join(" · ")}
								</p>
							)}
							<button
								type="button"
								className="dlg-quiet"
								onClick={() =>
									setTimes([...times, { often: "week", day: "Monday", time: "08:00" }])
								}
							>
								Add a time
							</button>
							<span className="field-sub">When something happens</span>
						</>
					)}
					<div className="events">
						{choices.map((e) => (
							<div key={e.about} className="events-row">
								<span>{e.about}</span>
								<span className="chips">
									{e.does.map((d) => (
										<button
											key={d.event}
											type="button"
											aria-pressed={events.has(d.event)}
											onClick={() =>
												setEvents(flipIn(events, d.event) as Set<SubscriptionEventName>)
											}
										>
											{d.words}
										</button>
									))}
								</span>
							</div>
						))}
						{choices.length === 0 && <p className="field-h">You are told about all of these.</p>}
					</div>
				</Field>
				{agent && (
					<>
						<Field label="Name">
							<input
								className="in"
								value={name}
								placeholder="What it does, in a few words"
								aria-label="Name"
								onChange={(e) => setName(e.target.value)}
							/>
						</Field>
						<Field
							label="What to do"
							hint={`${who.name} reads it every time one of the reasons starts it.`}
						>
							<span className="field-fixed">A document with this name. You write it next.</span>
						</Field>
					</>
				)}
			</div>
		</Dialog>
	);
}

/* ---------- a user: adding one and editing one are the same form ---------- */

/** What the form starts from when it edits someone. */
export interface Editing {
	name: string;
	agent: boolean;
	me: boolean;
	what: string;
	discipline: string;
	/** Who it works for, in words. */
	worksFor: string;
	/** The name of its instructions (an agent) or About (a person), and when it was last changed. */
	file: { title: string; edited: string } | null;
}

export interface UserSave {
	name: string;
	what: string;
	discipline: string;
	/** Adding: "You", or the name of a team it works for. */
	worksFor: string;
}

export function UserDialog({
	user,
	disciplines,
	owners,
	onClose,
	onSave,
	onFile,
}: {
	/** Absent: adding someone. */
	user?: Editing;
	/** The disciplines already in use, offered as you type. */
	disciplines: readonly string[];
	/** Who a new agent can work for: "You", then teams. */
	owners: readonly string[];
	onClose: () => void;
	onSave: (save: UserSave) => Promise<string | null>;
	/** Open their instructions or About as a document. */
	onFile?: () => void;
}) {
	const agent = user ? user.agent : true;
	const [name, setName] = useState(user?.name ?? "");
	const [what, setWhat] = useState(user?.what ?? "");
	const [discipline, setDiscipline] = useState(user?.discipline ?? "");
	const [picked, setOwner] = useState<string | null>(null);
	// The choices can arrive after the form opens; until one is picked, the first is meant.
	const owner = picked !== null && owners.includes(picked) ? picked : (owners[0] ?? "You");
	const [problem, setProblem] = useState<string | null>(null);
	const whatLabel = user?.me ? "What you do" : agent ? "What it does" : "What they do";
	const save = async () => {
		if (!name.trim()) {
			setProblem("A name, please.");
			return;
		}
		const failed = await onSave({
			name: name.trim(),
			what: what.trim(),
			discipline: discipline.trim(),
			worksFor: owner,
		});
		if (failed) setProblem(failed);
	};
	return (
		<Dialog
			title={user ? `Edit ${user.me ? "yourself" : user.name}` : "Add someone"}
			sub={
				user
					? user.me
						? "What everyone in the team sees of you."
						: "What everyone sees, and how it is set up."
					: "An agent. It shows up in the team like everyone else."
			}
			done={user ? "Save" : "Add"}
			aside={user ? undefined : "Its instructions are a document. You write them next."}
			problem={problem}
			onClose={onClose}
			onDone={() => void save()}
		>
			<Field label="Name">
				<input
					className="in"
					value={name}
					aria-label="Name"
					onChange={(e) => setName(e.target.value)}
				/>
			</Field>
			<Field label={whatLabel}>
				<input
					className="in"
					value={what}
					aria-label={whatLabel}
					onChange={(e) => setWhat(e.target.value)}
				/>
			</Field>
			<Field
				label="Discipline"
				hint={
					agent
						? "Its craft. It gets the documents marked with the same discipline, and no others marked with a different one."
						: "Your craft, such as Design or Support."
				}
			>
				<input
					className="in"
					list="disciplines"
					value={discipline}
					aria-label="Discipline"
					onChange={(e) => setDiscipline(e.target.value)}
				/>
				<datalist id="disciplines">
					{disciplines.map((d) => (
						<option key={d} value={d} />
					))}
				</datalist>
			</Field>
			{agent && !user && (
				<Field
					label="Works for"
					hint="A team: anyone in it can hand it work and change how it is set up."
				>
					<Seg label="Works for" options={owners} value={owner} onChange={setOwner} />
				</Field>
			)}
			{user && (
				<Field
					label={agent ? "Instructions" : "About you"}
					hint={`Opens as a document${agent ? ", like its skills and memory" : ""}.${user.file ? ` ${user.file.edited}` : ""}`}
				>
					<button type="button" className="doc-link" onClick={onFile}>
						{agent
							? `Who ${user.name} is and how it works`
							: "What agents should know when they work with you"}
					</button>
				</Field>
			)}
		</Dialog>
	);
}
