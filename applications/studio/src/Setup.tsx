import { useEffect, useState } from "react";
import { Seg } from "./Seg";

/**
 * SETTING UP A USER — the small forms behind the buttons on a user's page. Each is a dialog over
 * the page it changes: a few fields, and the result shows up in the box behind it. Adding someone
 * and editing someone are the same form. The one long piece of writing, an agent's instructions,
 * is a document and opens where documents are edited — so none of this needs a page of its own.
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
}

function Dialog({ title, sub, done, aside, onClose, onDone, children }: {
	title: string;
	sub: string;
	done: string;
	/** Sits left of the buttons: a quiet action, or a word on what comes next. */
	aside?: React.ReactNode;
	onClose: () => void;
	onDone: () => void;
	children: React.ReactNode;
}) {
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

/* ---------- what someone can reach: folders and services ---------- */

const THINGS = [
	{ name: "~/code/northwind", how: "Folder on this computer", folder: true, on: true, users: "Builder" },
	{ name: "GitHub", how: "Signed in on this computer", folder: false, on: true, users: "Builder" },
	{ name: "Zendesk", how: "Key saved 3 weeks ago", folder: false, on: true, users: "Builder, Growth" },
	{ name: "Stripe", how: "Signed in on this computer", folder: false, on: false, users: "Growth" },
	{ name: "Northwind shared drive", how: "Google Drive folder", folder: true, on: false, users: "Growth" },
];
const NEW_KINDS = ["A folder", "A service"] as const;
const MAY = ["Read and change", "Only read"] as const;
const SIGN_IN = ["A key", "A server address"] as const;
const YOUR_AGENTS = ["Builder", "Growth", "Facilitation"];

export function ReachDialog({ who, onClose, onDone }: { who: Subject; onClose: () => void; onDone: (added?: Row) => void }) {
	const agent = who.kind === "Agent";
	const [fresh, setFresh] = useState<(typeof NEW_KINDS)[number] | null>(agent ? null : "A folder");
	const [may, setMay] = useState<(typeof MAY)[number]>("Read and change");
	const [signIn, setSignIn] = useState<(typeof SIGN_IN)[number]>("A key");
	const added: Row | undefined =
		fresh === "A folder" ? { what: "Folder", why: `~/code/northwind-site · ${may === "Only read" ? "only reads" : "reads and writes"}` }
		: fresh === "A service" ? { what: "Linear", why: signIn === "A key" ? "key saved just now" : "through its own server" }
		: undefined;
	return (
		<Dialog
			title={agent ? `What ${who.name} can reach` : "What you and your agents can reach"}
			sub={agent ? `${who.name} reaches only what is ticked here. You connect a folder or a service once, then tick who gets it.` : "Connect a folder or a service once. Then tick, on an agent's page, which of them it gets."}
			done="Save" onClose={onClose} onDone={() => onDone(added)}
		>
			<div className="reach">
				{THINGS.map((t) => (
					<div key={t.name} className="reach-row">
						{agent && <input type="checkbox" defaultChecked={t.on} aria-label={t.name} />}
						<span className="reach-name">{t.name}</span>
						<span className="reach-how">{t.how}</span>
						{agent
							? t.folder && (
								<select className="in in--small" aria-label={`What ${who.name} may do in ${t.name}`} defaultValue={t.on ? MAY[0] : MAY[1]}>
									{MAY.map((m) => <option key={m}>{m}</option>)}
								</select>
							)
							: <span className="reach-users">Given to {t.users}</span>}
					</div>
				))}
			</div>

			<div className="dlg-part">
				<div className="dlg-part-h">
					<span>Connect something new</span>
					<Seg label="What to connect" options={NEW_KINDS} value={fresh} onChange={setFresh} />
				</div>
				{fresh === "A folder" && (
					<>
						<Field label="Where" hint="A folder on this computer, or the address of a git repository. This one is a git repository on the branch main, so every task works on a branch of its own.">
							<div className="in-row">
								<input className="in" defaultValue="~/code/northwind-site" aria-label="Where" />
								<button type="button" className="btn">Choose…</button>
							</div>
						</Field>
						<Field label="Agents may"><Seg label="Agents may" options={MAY} value={may} onChange={setMay} /></Field>
					</>
				)}
				{fresh === "A service" && (
					<>
						<Field label="Service"><input className="in" defaultValue="Linear" aria-label="Service" /></Field>
						<Field label="Sign in with"><Seg label="Sign in with" options={SIGN_IN} value={signIn} onChange={setSignIn} /></Field>
						{signIn === "A key"
							? <Field key="key" label="Key" hint="Kept encrypted. Nobody sees it again, not even you."><input className="in" type="password" defaultValue="0000000000000000000000" aria-label="Key" /></Field>
							: <Field key="address" label="Address" hint="The address of an MCP server. If it asks for a key, add one."><input className="in" defaultValue="https://mcp.linear.app/mcp" aria-label="Address" /></Field>}
						<p className="dlg-note">Already signed in to a service on this computer, like GitHub above? Then it is in the list by itself, with nothing to type.</p>
					</>
				)}
				{fresh && !agent && (
					<Field label="Who gets it">
						<div className="ticks">
							{YOUR_AGENTS.map((a) => <label key={a} className="pick"><input type="checkbox" defaultChecked={a === "Builder"} /><span>{a}</span></label>)}
						</div>
					</Field>
				)}
			</div>
		</Dialog>
	);
}

/* ---------- when someone starts working, or is told ---------- */

const WHEN_KINDS = ["At a time", "When something happens"] as const;
const EVENTS = [
	{ about: "A task", does: ["is created", "changes"] },
	{ about: "A thread", does: ["starts", "gets a message"] },
	{ about: "A document", does: ["is created", "changes"] },
	{ about: "Someone", does: ["joins the team"] },
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function StartDialog({ who, onClose, onDone }: { who: Subject; onClose: () => void; onDone: (added: Row) => void }) {
	const agent = who.kind === "Agent";
	const [kind, setKind] = useState<(typeof WHEN_KINDS)[number]>(agent ? "At a time" : "When something happens");
	const [event, setEvent] = useState(agent ? "A document changes" : "Someone joins the team");
	const timed = kind === "At a time";
	const name = timed ? "Churn check, weekly" : "Pricing page check";
	const added: Row = !agent ? { what: event, why: "" }
		: timed ? { what: "Every Thursday at 08:00", why: `it starts a run of ${name}` }
		: { what: event, why: `it starts ${name}` };
	return (
		<Dialog
			title={agent ? `When should ${who.name} start working?` : "When should you be told?"}
			sub={agent ? "At a time, or when something happens in the team. It works the same way for every agent and every person." : "You get a notification under the bell. The same form starts an agent; for a person it only tells them."}
			done="Add" onClose={onClose} onDone={() => onDone(added)}
		>
			<Field label="When" hint={timed ? "Next time: Thursday 15 October at 08:00, your time." : `Anywhere in Northwind that ${agent ? who.name : "you"} can see.`}>
				{agent && <Seg label="When" options={WHEN_KINDS} value={kind} onChange={setKind} />}
				{timed ? (
					<div className="in-row in-row--words">
						<span>Every</span>
						<select className="in" aria-label="How often" defaultValue="week">{["day", "week", "month"].map((x) => <option key={x}>{x}</option>)}</select>
						<span>on</span>
						<select className="in" aria-label="Day" defaultValue="Thursday">{DAYS.map((x) => <option key={x}>{x}</option>)}</select>
						<span>at</span>
						<input className="in in--time" defaultValue="08:00" aria-label="Time" />
					</div>
				) : (
					<div className="events">
						{EVENTS.map((e) => (
							<div key={e.about} className="events-row">
								<span>{e.about}</span>
								<span className="chips">
									{e.does.map((d) => <button key={d} type="button" aria-pressed={event === `${e.about} ${d}`} onClick={() => setEvent(`${e.about} ${d}`)}>{d}</button>)}
								</span>
							</div>
						))}
					</div>
				)}
			</Field>
			{agent && (
				<>
					<Field label="Name"><input className="in" key={name} defaultValue={name} aria-label="Name" /></Field>
					<Field label="What to do" hint={`${who.name} reads this every time it starts. Every run shows up as a part of the task “${name}”, so you follow it like any other work.`}>
						<textarea
							className="in in--text" aria-label="What to do" key={kind}
							defaultValue={timed
								? "Look at who cancelled last week and why. Write the three biggest reasons into “Why people leave”, and tell me if one of them is new."
								: "If the document is “Pricing”, check that the numbers on the pricing page still match it. Tell me if they do not. For any other document, stop."}
						/>
					</Field>
				</>
			)}
		</Dialog>
	);
}

/* ---------- a user: adding one and editing one are the same form ---------- */

const ADD_KINDS = ["An agent", "A person"] as const;
const OWNERS = ["You", "The whole team"] as const;
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
				: agent ? "Folders, services and start times come next, on its page." : "Sam gets a link to join Northwind."}
			onClose={onClose} onDone={() => onDone(!user && agent)}
		>
			{!user && <Field label="Add"><Seg label="Add" options={ADD_KINDS} value={kind} onChange={setKind} /></Field>}
			<Field label="Name"><input className="in" key={kind} defaultValue={user ? (user.me ? "Finn Olsen" : user.name) : agent ? "Researcher" : "Sam Okafor"} aria-label="Name" /></Field>
			{!(user || agent) && <Field label="Email"><input className="in" defaultValue="sam@northwind.example" aria-label="Email" /></Field>}
			<Field label={what}><input className="in" key={kind} defaultValue={user ? user.what : agent ? "Reads what competitors ship and writes it down." : "Sales."} aria-label={what} /></Field>
			{agent && (
				<>
					<Field label="Works for" hint={user ? undefined : "The whole team: anyone can hand it work and change how it is set up."}>
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
			{user ? (
				<Field label={agent ? "Instructions" : "About you"} hint={`Opens as a document${agent ? ", like its skills and memory" : ""}. ${user.edited ?? ""}`}>
					<button type="button" className="doc-link">{agent ? `Who ${user.name} is and how it works` : "What agents should know when they work with you"}</button>
				</Field>
			) : agent && (
				<Field label="Instructions" hint="In your own words. It becomes a document you can rewrite any time.">
					<textarea
						className="in in--text" aria-label="Instructions"
						defaultValue="You watch what our three closest competitors ship. Once a week, write what changed into “Competitors” and say what it means for our pricing. Ask me before you contact anyone."
					/>
				</Field>
			)}
		</Dialog>
	);
}
