import type { HarnessDescriptor, SubscriptionEventName } from "@hyperidle/domain-model";
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

/** One of a list, each on its own line with a few words beside it. */
function Pick({
	name,
	options,
	value,
	onChange,
}: {
	name: string;
	options: { value: string; what: string; why: string; off?: boolean }[];
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="picks">
			{options.map((o) => (
				<label key={o.value} className="pick" aria-disabled={o.off}>
					<input
						type="radio"
						name={name}
						checked={value === o.value}
						disabled={o.off}
						onChange={() => onChange(o.value)}
					/>
					<span>{o.what}</span>
					<span className="pick-why">{o.why}</span>
				</label>
			))}
		</div>
	);
}

/** Several of a few, each ticked on its own. */
function Ticks({
	options,
	off,
	onFlip,
}: {
	options: readonly { id: string; name: string }[];
	off: ReadonlySet<string>;
	onFlip: (id: string) => void;
}) {
	return (
		<div className="ticks">
			{options.map((a) => (
				<label key={a.id} className="pick">
					<input type="checkbox" checked={!off.has(a.id)} onChange={() => onFlip(a.id)} />
					<span>{a.name}</span>
				</label>
			))}
		</div>
	);
}

const flipIn = (all: ReadonlySet<string>, x: string): Set<string> => {
	const next = new Set(all);
	if (next.has(x)) next.delete(x);
	else next.add(x);
	return next;
};

/* ---------- where someone works (folders) and what they can reach (services) ---------- */

/** One folder or service in the list: on an agent's page, ticked when the agent has it. */
export interface ReachRow {
	id: string;
	name: string;
	how: string;
	/** On an agent's page: it has it. */
	given: boolean;
	/** On your page: who it is given to. */
	givenTo: string;
	/** Cannot be unticked here, such as a service signed in on this computer. */
	locked?: boolean;
}

export type NewReach =
	| { kind: "folder"; where: string; readOnly: boolean; team?: string }
	| { kind: "service"; name: string; key?: string; address?: string };

export interface ReachSave {
	/** Rows whose tick changed: id → now given. */
	ticks: Map<string, boolean>;
	added: NewReach | null;
	/** Your agents unticked under "Who gets it". */
	keepFrom: string[];
}

const MAY = ["Read and change", "Only read"] as const;
const SIGN_IN = ["A key", "An MCP server"] as const;

export function ReachDialog({
	who,
	kind,
	rows,
	yourAgents,
	teams,
	onClose,
	onSave,
}: {
	who: Subject;
	kind: "folder" | "service";
	rows: readonly ReachRow[];
	yourAgents: readonly { id: string; name: string }[];
	/** The teams a new folder can belong to, when there is a choice. */
	teams: readonly string[];
	onClose: () => void;
	onSave: (save: ReachSave) => Promise<string | null>;
}) {
	const agent = who.agent;
	const folder = kind === "folder";
	const [ticks, setTicks] = useState<Map<string, boolean>>(new Map());
	const [may, setMay] = useState<(typeof MAY)[number]>("Read and change");
	const [signIn, setSignIn] = useState<(typeof SIGN_IN)[number]>("A key");
	const [where, setWhere] = useState("");
	const [name, setName] = useState("");
	const [key, setKey] = useState("");
	const [address, setAddress] = useState("");
	const [team, setTeam] = useState(teams[0] ?? "");
	const [off, setOff] = useState<ReadonlySet<string>>(new Set());
	const [problem, setProblem] = useState<string | null>(null);

	const title = folder
		? agent
			? `Where ${who.name} works`
			: "Where you and your agents work"
		: agent
			? `What ${who.name} can reach`
			: "What you and your agents can reach";
	const sub = folder
		? agent
			? `${who.name} works in the folders ticked here. A folder is added once; every agent of yours gets it unless you untick it.`
			: "Add a folder once. Every agent of yours gets it; untick it on an agent's page to keep it away from that one."
		: agent
			? `${who.name} reaches only the services ticked here. A service is connected once; every agent of yours gets it unless you untick it.`
			: "Connect a service once. Every agent of yours gets it; untick it on an agent's page to keep it away from that one.";
	const added: NewReach | null = folder
		? where.trim()
			? { kind: "folder", where: where.trim(), readOnly: may === "Only read", team }
			: null
		: (signIn === "A key" ? name.trim() && key : address.trim())
			? {
					kind: "service",
					name: name.trim(),
					...(signIn === "A key" ? { key } : { address: address.trim() }),
				}
			: null;
	const save = async () => {
		const failed = await onSave({ ticks, added, keepFrom: [...off] });
		if (failed) setProblem(failed);
	};
	return (
		<Dialog
			title={title}
			sub={sub}
			done="Save"
			problem={problem}
			onClose={onClose}
			onDone={() => void save()}
		>
			<div className="reach">
				{rows.length === 0 && (
					<p className="tbox-none">
						{folder ? "No folder yet." : "No service yet."} Add the first one below.
					</p>
				)}
				{rows.map((t) => (
					<div key={t.id} className="reach-row">
						{agent && (
							<input
								type="checkbox"
								checked={ticks.get(t.id) ?? t.given}
								disabled={t.locked}
								aria-label={t.name}
								onChange={(e) => setTicks(new Map(ticks).set(t.id, e.target.checked))}
							/>
						)}
						<span className="reach-name">{t.name}</span>
						<span className="reach-how">{t.how}</span>
						{!agent && <span className="reach-side">Given to {t.givenTo}</span>}
					</div>
				))}
			</div>

			<div className="dlg-part">
				<div className="dlg-part-h">{folder ? "Add a folder" : "Connect a service"}</div>
				{folder ? (
					<>
						<Field
							label="Where"
							hint="A folder on this computer, or the address of a git repository. Every task works on a branch of its own."
						>
							<input
								className="in"
								value={where}
								placeholder="~/code/project"
								aria-label="Where"
								onChange={(e) => setWhere(e.target.value)}
							/>
						</Field>
						<Field label={agent ? `${who.name} may` : "Agents may"}>
							<Seg label="May" options={MAY} value={may} onChange={setMay} />
						</Field>
						{!agent && teams.length > 1 && (
							<Field label="Team" hint="A folder belongs to one team; its agents can be given it.">
								<Seg label="Team" options={teams} value={team} onChange={setTeam} />
							</Field>
						)}
					</>
				) : (
					<>
						<Field label="Service">
							<input
								className="in"
								value={name}
								placeholder="The service's name"
								aria-label="Service"
								onChange={(e) => setName(e.target.value)}
							/>
						</Field>
						<Field label="Sign in with">
							<Seg label="Sign in with" options={SIGN_IN} value={signIn} onChange={setSignIn} />
						</Field>
						{signIn === "A key" ? (
							<Field
								key="key"
								label="Key"
								hint="Kept encrypted. Nobody sees it again, not even you."
							>
								<input
									className="in"
									type="password"
									value={key}
									aria-label="Key"
									onChange={(e) => setKey(e.target.value)}
								/>
							</Field>
						) : (
							<Field
								key="address"
								label="Address"
								hint="Where the MCP server is. If it asks for a key, add one."
							>
								<input
									className="in"
									value={address}
									placeholder="https://"
									aria-label="Address"
									onChange={(e) => setAddress(e.target.value)}
								/>
							</Field>
						)}
						<p className="dlg-note">
							Already signed in to a service on this computer? Then it is in the list by itself,
							with nothing to type.
						</p>
					</>
				)}
				{!agent && yourAgents.length > 0 && (
					<Field
						label={folder ? "Who works in it" : "Who gets it"}
						hint="All of your agents, unless you untick one. An agent works best with only what it needs."
					>
						<Ticks options={yourAgents} off={off} onFlip={(id) => setOff(flipIn(off, id))} />
					</Field>
				)}
			</div>
		</Dialog>
	);
}

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
	/** The agent program it runs on, and its model; null is the program's default. */
	harness: string | null;
	model: string | null;
	sessions: number;
	/** Who it works for, in words. */
	worksFor: string;
	/** The name of its instructions (an agent) or About (a person), and when it was last changed. */
	file: { title: string; edited: string } | null;
}

export interface UserSave {
	name: string;
	what: string;
	discipline: string;
	harness: string | null;
	model: string | null;
	sessions: number;
	/** Adding: "You", or the name of a team it works for. */
	worksFor: string;
}

/** The agent programs on this computer, as choices: the ones signed in can be picked. */
function programChoices(programs: readonly HarnessDescriptor[]) {
	return programs.map((p) => ({
		value: p.type,
		what: p.name,
		why:
			p.discovery.state === "ready"
				? "signed in on this computer"
				: p.discovery.state === "missing"
					? "not installed"
					: "not signed in",
		off: p.discovery.state !== "ready" || p.discovery.disabled === true,
	}));
}

export function UserDialog({
	user,
	programs,
	disciplines,
	owners,
	onClose,
	onSave,
	onFile,
}: {
	/** Absent: adding someone. */
	user?: Editing;
	programs: readonly HarnessDescriptor[];
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
	const ready = programs.find((p) => p.discovery.state === "ready")?.type ?? null;
	const [name, setName] = useState(user?.name ?? "");
	const [what, setWhat] = useState(user?.what ?? "");
	const [discipline, setDiscipline] = useState(user?.discipline ?? "");
	const [picked, setOwner] = useState<string | null>(null);
	// The choices can arrive after the form opens; until one is picked, the first is meant.
	const owner = picked !== null && owners.includes(picked) ? picked : (owners[0] ?? "You");
	const [harness, setHarness] = useState<string | null>(user ? user.harness : ready);
	const [model, setModel] = useState<string | null>(user?.model ?? null);
	const [sessions, setSessions] = useState(user?.sessions ?? 1);
	const [problem, setProblem] = useState<string | null>(null);
	const models = (programs.find((p) => p.type === harness)?.models ?? []).filter(
		(m) => m.selectable,
	);
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
			harness,
			model,
			sessions,
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
			{agent && (
				<>
					<Field
						label="Works for"
						hint={
							user
								? undefined
								: "A team: anyone in it can hand it work and change how it is set up."
						}
					>
						{user ? (
							<span className="field-fixed">{user.worksFor}</span>
						) : (
							<Seg label="Works for" options={owners} value={owner} onChange={setOwner} />
						)}
					</Field>
					<Field label="Runs on">
						{programs.length === 0 ? (
							<span className="field-fixed">No agent program found on this computer.</span>
						) : (
							<Pick
								name="program"
								options={programChoices(programs)}
								value={harness ?? ""}
								onChange={(v) => {
									setHarness(v);
									setModel(null);
								}}
							/>
						)}
					</Field>
					<Field label="Model">
						<select
							className="in"
							aria-label="Model"
							value={model ?? ""}
							onChange={(e) => setModel(e.target.value || null)}
						>
							<option value="">The default</option>
							{models.map((m) => (
								<option key={m.id} value={m.id}>
									{m.label}
								</option>
							))}
						</select>
					</Field>
					{user && (
						<Field label="At a time" hint="How many tasks it works on at once.">
							<div className="in-row in-row--words">
								<input
									className="in in--time"
									type="number"
									min={1}
									value={sessions}
									aria-label="Sessions at a time"
									onChange={(e) => setSessions(Math.max(1, Number(e.target.value) || 1))}
								/>
								<span>sessions</span>
							</div>
						</Field>
					)}
				</>
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
