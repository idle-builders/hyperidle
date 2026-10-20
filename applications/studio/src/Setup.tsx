import { useEffect, useState } from "react";
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
export interface Subject {
	name: string;
	kind: "Agent" | "Person";
	what: string;
	/** The page is your own. */
	me: boolean;
	sessions?: number;
	/** When the document that says who they are was last touched. */
	edited?: string;
}
export interface Row {
	what: string;
	why: string;
	/** Built in: it cannot be switched off. */
	fixed?: boolean;
}

export function Dialog({ title, sub, done, aside, onClose, onDone, children }: {
	title: string;
	sub: string;
	done: string;
	/** Sits left of the buttons: a quiet action, or a word on what comes next. */
	aside?: React.ReactNode;
	onClose: () => void;
	onDone: () => void;
	children: React.ReactNode;
}): React.ReactElement {
	useEffect(() => {
		const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
		document.addEventListener("keydown", esc);
		return () => document.removeEventListener("keydown", esc);
	}, [onClose]);
	return (
		<div className="dlg-back">
			<button type="button" className="dlg-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
			<dialog open className="dlg" aria-label={title}>
				<form onSubmit={(e) => { e.preventDefault(); onDone(); }}>
					<header className="dlg-h">
						<h3>{title}</h3>
						<p>{sub}</p>
					</header>
					<div className="dlg-b">{children}</div>
					<footer className="dlg-f">
						<span className="dlg-aside">{aside}</span>
						<button type="button" className="btn" onClick={onClose}>Cancel</button>
						<button type="submit" className="btn btn--accent">{done}</button>
					</footer>
				</form>
			</dialog>
		</div>
	);
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.ReactElement {
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
function Pick({ name, options, value, onChange }: { name: string; options: { what: string; why: string; off?: boolean }[]; value: string; onChange: (v: string) => void }) {
	return (
		<div className="picks">
			{options.map((o) => (
				<label key={o.what} className="pick" aria-disabled={o.off}>
					<input type="radio" name={name} checked={value === o.what} disabled={o.off} onChange={() => onChange(o.what)} />
					<span>{o.what}</span>
					<span className="pick-why">{o.why}</span>
				</label>
			))}
		</div>
	);
}

/* ---------- where someone works (folders) and what they can reach (services) ---------- */

const FOLDERS = [
	{ name: "~/code/northwind", how: "On this computer · a git repository", users: "Builder" },
	{ name: "~/code/northwind-site", how: "On this computer · a git repository", users: "nobody yet" },
];
const SERVICES = [
	{ name: "GitHub", how: "Signed in on this computer", users: "Builder" },
	{ name: "Zendesk", how: "Key saved 3 weeks ago", users: "Builder, Growth" },
	{ name: "Stripe", how: "Signed in on this computer", users: "Growth" },
	{ name: "Google Drive", how: "Signed in on this computer", users: "Growth" },
];
const MAY = ["Read and change", "Only read"] as const;
const SIGN_IN = ["A key", "An MCP server"] as const;
const YOUR_AGENTS = ["Builder", "Growth", "Facilitation"];

export function ReachDialog({ who, kind, given, onClose, onDone }: {
	who: Subject;
	kind: "folder" | "service";
	/** What this user has already. */
	given: string[];
	onClose: () => void;
	onDone: (added: Row) => void;
}) {
	const agent = who.kind === "Agent";
	const folder = kind === "folder";
	const [may, setMay] = useState<(typeof MAY)[number]>("Read and change");
	const [signIn, setSignIn] = useState<(typeof SIGN_IN)[number]>("A key");
	const added: Row = folder
		? { what: "~/code/northwind-billing", why: may === "Only read" ? "only reads" : "reads and changes" }
		: { what: "Linear", why: signIn === "A key" ? "key saved just now" : "through its MCP server" };
	const title = folder
		? (agent ? `Where ${who.name} works` : "Where you and your agents work")
		: (agent ? `What ${who.name} can reach` : "What you and your agents can reach");
	const sub = folder
		? (agent ? `${who.name} works in the folders ticked here. A folder is added once; every agent of yours gets it unless you untick it.` : "Add a folder once. Every agent of yours gets it; untick it on an agent's page to keep it away from that one.")
		: (agent ? `${who.name} reaches only the services ticked here. A service is connected once; every agent of yours gets it unless you untick it.` : "Connect a service once. Every agent of yours gets it; untick it on an agent's page to keep it away from that one.");
	return (
		<Dialog title={title} sub={sub} done="Save" onClose={onClose} onDone={() => onDone(added)}>
			<div className="reach">
				{(folder ? FOLDERS : SERVICES).map((t) => (
					<div key={t.name} className="reach-row">
						{agent && <input type="checkbox" defaultChecked={given.includes(t.name)} aria-label={t.name} />}
						<span className="reach-name">{t.name}</span>
						<span className="reach-how">{t.how}</span>
						{agent
							? folder && (
								<select className="in in--small" aria-label={`What ${who.name} may do in ${t.name}`}>
									{MAY.map((m) => <option key={m}>{m}</option>)}
								</select>
							)
							: <span className="reach-side">Given to {t.users}</span>}
					</div>
				))}
			</div>

			<div className="dlg-part">
				<div className="dlg-part-h">{folder ? "Add a folder" : "Connect a service"}</div>
				{folder ? (
					<>
						<Field label="Where" hint="A folder on this computer, or the address of a git repository. This one is a git repository on the branch main, so every task works on a branch of its own.">
							<div className="in-row">
								<input className="in" defaultValue="~/code/northwind-billing" aria-label="Where" />
								<button type="button" className="btn">Choose…</button>
							</div>
						</Field>
						<Field label={agent ? `${who.name} may` : "Agents may"}><Seg label="May" options={MAY} value={may} onChange={setMay} /></Field>
					</>
				) : (
					<>
						<Field label="Service"><input className="in" defaultValue="Linear" aria-label="Service" /></Field>
						<Field label="Sign in with"><Seg label="Sign in with" options={SIGN_IN} value={signIn} onChange={setSignIn} /></Field>
						{signIn === "A key"
							? <Field key="key" label="Key" hint="Kept encrypted. Nobody sees it again, not even you."><input className="in" type="password" defaultValue="0000000000000000000000" aria-label="Key" /></Field>
							: <Field key="address" label="Address" hint="Where the MCP server is. If it asks for a key, add one."><input className="in" defaultValue="https://mcp.linear.app/mcp" aria-label="Address" /></Field>}
						<p className="dlg-note">Already signed in to a service on this computer, like GitHub above? Then it is in the list by itself, with nothing to type.</p>
					</>
				)}
				{!agent && (
					<Field label={folder ? "Who works in it" : "Who gets it"} hint="All of your agents, unless you untick one. An agent works best with only what it needs.">
						<div className="ticks">
							{YOUR_AGENTS.map((a) => <label key={a} className="pick"><input type="checkbox" defaultChecked /><span>{a}</span></label>)}
						</div>
					</Field>
				)}
			</div>
		</Dialog>
	);
}

/* ---------- the reasons someone starts working, or is told ---------- */

const EVENTS = [
	{ about: "A task", does: ["is created", "changes"] },
	{ about: "A thread", does: ["starts", "gets a message"] },
	{ about: "A document", does: ["is created", "changes"] },
	{ about: "Someone", does: ["joins the team"] },
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const JOB = "Pricing page check";
const flip = (all: string[], x: string): string[] => (all.includes(x) ? all.filter((y) => y !== x) : [...all, x]);

export function StartDialog({ who, rows, onClose, onDone }: { who: Subject; rows: Row[]; onClose: () => void; onDone: (added: Row[]) => void }) {
	const agent = who.kind === "Agent";
	const [off, setOff] = useState<string[]>([]);
	const [days, setDays] = useState(agent ? ["Thursday"] : []);
	const [events, setEvents] = useState([agent ? "A document changes" : "Someone joins the team"]);
	const why = agent ? `it starts a run of ${JOB}` : "";
	const added: Row[] = [...days.map((d) => ({ what: `Every ${d} at 08:00`, why })), ...events.map((e) => ({ what: e, why }))];
	return (
		<Dialog
			title={agent ? `When ${who.name} starts working` : "What you are told about"}
			sub={agent ? "A list of reasons. Any one of them starts it." : "A set of reasons. Each one sends you a notification under the bell."}
			done={agent ? "Add" : "Save"} onClose={onClose} onDone={() => onDone(added)}
		>
			<div className="reach">
				{rows.map((r) => (
					<div key={r.what + r.why} className="reach-row">
						<span className="reach-name">{r.what}</span>
						{r.why && <span className="reach-how">{r.why}</span>}
						{r.fixed
							? <span className="reach-side">always</span>
							: (
								<button type="button" className="fact-switch" role="switch" aria-checked={!off.includes(r.what + r.why)} aria-label={r.what} onClick={() => setOff(flip(off, r.what + r.why))}>
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
					hint={`${agent ? "Any one of these starts it. " : ""}Things that happen count anywhere in Northwind that ${agent ? who.name : "you"} can see.`}
				>
					{agent && (
						<>
							<span className="field-sub">At a time</span>
							{days.map((d, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: the same day may be listed twice
								<div key={i} className="in-row in-row--words">
									<span>Every</span>
									<select className="in" aria-label="How often" defaultValue="week">{["day", "week", "month"].map((x) => <option key={x}>{x}</option>)}</select>
									<span>on</span>
									<select className="in" aria-label="Day" value={d} onChange={(e) => setDays(days.map((x, j) => (j === i ? e.target.value : x)))}>{DAYS.map((x) => <option key={x}>{x}</option>)}</select>
									<span>at</span>
									<input className="in in--time" defaultValue="08:00" aria-label="Time" />
									<button type="button" className="in-x" aria-label="Remove this time" onClick={() => setDays(days.filter((_, j) => j !== i))}>✕</button>
								</div>
							))}
							<button type="button" className="dlg-quiet" onClick={() => setDays([...days, DAYS[(3 + 4 * days.length) % 7]])}>Add a time</button>
							<span className="field-sub">When something happens</span>
						</>
					)}
					<div className="events">
						{EVENTS.map((e) => (
							<div key={e.about} className="events-row">
								<span>{e.about}</span>
								<span className="chips">
									{e.does.map((d) => <button key={d} type="button" aria-pressed={events.includes(`${e.about} ${d}`)} onClick={() => setEvents(flip(events, `${e.about} ${d}`))}>{d}</button>)}
								</span>
							</div>
						))}
					</div>
				</Field>
				{agent && (
					<>
						<Field label="Name"><input className="in" defaultValue={JOB} aria-label="Name" /></Field>
						<Field label="What to do" hint={`${who.name} reads it every time one of the reasons starts it. Every run shows up as a part of the task “${JOB}”, so you follow it like any other work.`}>
							<span className="field-fixed">A document with this name. You write it next.</span>
						</Field>
					</>
				)}
			</div>
		</Dialog>
	);
}

/* ---------- a user: adding one and editing one are the same form ---------- */

const ADD_KINDS = ["An agent", "A person"] as const;
const OWNERS = ["You", "Product", "Support"] as const;
const PROGRAMS = [
	{ what: "Claude Code", why: "signed in on this computer" },
	{ what: "Codex", why: "signed in on this computer" },
	{ what: "Cursor", why: "not installed", off: true },
];
const MODELS = ["The default", "Faster and cheaper", "Slower and stronger"];

export function UserDialog({ user, program = "Claude Code", onClose, onDone }: { user?: Subject; program?: string; onClose: () => void; onDone: (addedAgent: boolean) => void }) {
	const [kind, setKind] = useState<(typeof ADD_KINDS)[number]>(user?.kind === "Person" ? "A person" : "An agent");
	const [owner, setOwner] = useState<(typeof OWNERS)[number]>("You");
	const [runs, setRuns] = useState(program);
	const agent = kind === "An agent";
	const what = user?.me ? "What you do" : agent ? "What it does" : "What they do";
	return (
		<Dialog
			title={user ? `Edit ${user.me ? "yourself" : user.name}` : "Add someone"}
			sub={user ? (user.me ? "What everyone in the team sees of you." : "What everyone sees, and how it is set up.") : "An agent or a person. Both show up in the team the same way."}
			done={user ? "Save" : "Add"}
			aside={user
				? !user.me && <button type="button" className="dlg-quiet">Remove {user.name} from the team</button>
				: agent ? "Its instructions are a document. You write them next." : "Sam gets a link to join Northwind."}
			onClose={onClose} onDone={() => onDone(!user && agent)}
		>
			{!user && <Field label="Add"><Seg label="Add" options={ADD_KINDS} value={kind} onChange={setKind} /></Field>}
			<Field label="Name"><input className="in" key={kind} defaultValue={user ? (user.me ? "Finn Olsen" : user.name) : agent ? "Researcher" : "Sam Okafor"} aria-label="Name" /></Field>
			{!(user || agent) && <Field label="Email"><input className="in" defaultValue="sam@northwind.example" aria-label="Email" /></Field>}
			<Field label={what}><input className="in" key={kind} defaultValue={user ? user.what : agent ? "Reads what competitors ship and writes it down." : "Sales."} aria-label={what} /></Field>
			{agent && (
				<>
					<Field label="Works for" hint={user ? undefined : "A team: anyone in it can hand it work and change how it is set up."}>
						{user ? <span className="field-fixed">You</span> : <Seg label="Works for" options={OWNERS} value={owner} onChange={setOwner} />}
					</Field>
					<Field label="Runs on"><Pick name="program" options={PROGRAMS} value={runs} onChange={setRuns} /></Field>
					<Field label="Model">
						<select className="in" aria-label="Model" defaultValue={MODELS[0]}>{MODELS.map((m) => <option key={m}>{m}</option>)}</select>
					</Field>
					{user && (
						<Field label="At a time" hint="How many tasks it works on at once.">
							<div className="in-row in-row--words">
								<input className="in in--time" type="number" min={1} defaultValue={user.sessions ?? 1} aria-label="Sessions at a time" />
								<span>sessions</span>
							</div>
						</Field>
					)}
				</>
			)}
			{user && (
				<Field label={agent ? "Instructions" : "About you"} hint={`Opens as a document${agent ? ", like its skills and memory" : ""}. ${user.edited ?? ""}`}>
					<button type="button" className="doc-link">{agent ? `Who ${user.name} is and how it works` : "What agents should know when they work with you"}</button>
				</Field>
			)}
		</Dialog>
	);
}
