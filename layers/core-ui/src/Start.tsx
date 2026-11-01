import type { HarnessDescriptor } from "@hyperidle/domain-model";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { post } from "./api";
import { programWords } from "./people-page";
import { useAction } from "./useAction";

/**
 * First start, on a fresh install: the agent programs found on this computer, your name and your
 * team's, and Start talking — which makes you, your team and your first agent, and opens your first
 * conversation. With no program signed in, each says how to fix it and Start talking waits. A team
 * that already runs on a server is joined instead, in the desktop app.
 */
const ready = (h: HarnessDescriptor) => h.discovery.state === "ready" && !h.discovery.disabled;

/** How to make a program ready, from what it says about itself. */
function Fix({ h }: { h: HarnessDescriptor }) {
	const command = h.authAction.command;
	if (h.discovery.state === "missing") return <>Install it, then look again.</>;
	if (h.discovery.state === "unauthenticated" && command)
		return (
			<>
				Sign in: run <code>{command.join(" ")}</code> in a terminal
			</>
		);
	if (h.discovery.state === "unauthenticated") return <>Sign in to it, then look again.</>;
	return <>{h.discovery.reason ?? "It cannot be used on this computer."}</>;
}

function Found({ programs, fixes }: { programs: readonly HarnessDescriptor[]; fixes: boolean }) {
	return (
		<section className="found" aria-label="Found on this computer">
			<span className="found-h">Found on this computer</span>
			{programs.map((h) => (
				<div key={h.type} className={ready(h) ? "found-row" : "found-row found-row--off"}>
					<span className={ready(h) ? "found-ok" : undefined}>{ready(h) ? "✓" : "–"}</span>
					<b>{h.name}</b>
					<span>{programWords(h)}</span>
					{fixes && !ready(h) && h.discovery.state !== "installed" && (
						<span className="found-fix">
							<Fix h={h} />
						</span>
					)}
				</div>
			))}
		</section>
	);
}

/**
 * Joining happens in the desktop app: the team key makes you a person on the server, which hands
 * back your own key; the app keeps it and reopens there as you. A new server also asks for its team.
 */
function Join({ onBack }: { onBack: () => void }) {
	const bridge = window.__HYPERIDLE__;
	const [address, setAddress] = useState("");
	const [teamKey, setTeamKey] = useState("");
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [team, setTeam] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [joining, setJoining] = useState(false);
	const join = async () => {
		if (!bridge?.join) return;
		if (!(address.trim() && teamKey && email.trim() && name.trim()))
			return setProblem("Give the server's address, the team key, your email and your name.");
		if (team !== null && !team.trim()) return setProblem("Name your team, please.");
		setJoining(true);
		const joined = await bridge.join({
			address,
			teamKey,
			email: email.trim(),
			name: name.trim(),
			...(team?.trim() ? { team: team.trim() } : {}),
		});
		setJoining(false);
		if (joined.ok) return;
		if (joined.needsTeam && team === null) setTeam("");
		setProblem(joined.problem ?? "That did not work.");
	};
	const field = (
		label: string,
		value: string,
		set: (v: string) => void,
		more?: { type?: string; placeholder?: string },
	) => (
		<label className="first-field">
			<span>{label}</span>
			<input value={value} aria-label={label} onChange={(e) => set(e.target.value)} {...more} />
		</label>
	);
	return (
		<>
			<p className="first-lead">Join a team that already runs on a server.</p>
			{bridge?.join ? (
				<>
					{field("Server address", address, setAddress, { placeholder: "e.g. team.example.com" })}
					{field("Team key", teamKey, setTeamKey, { type: "password" })}
					<p className="first-note">Whoever runs the server gives you the team key.</p>
					{field("Your email", email, setEmail, { type: "email" })}
					{field("Your name", name, setName)}
					{team !== null && field("Name your team", team, setTeam, { placeholder: "e.g. Product" })}
					{problem && <p className="composer-problem">{problem}</p>}
				</>
			) : (
				<p className="first-note">
					Joining happens in the HyperIdle desktop app: open it on your computer and choose “Join a
					team on a server” there. This page runs in a browser, which cannot keep your key.
				</p>
			)}
			<div className="first-acts">
				{bridge?.join && (
					<button
						type="button"
						className="btn btn--accent"
						disabled={joining}
						onClick={() => void join()}
					>
						Join
					</button>
				)}
				<button type="button" className="first-other" onClick={onBack}>
					Start a new team on this computer instead
				</button>
			</div>
		</>
	);
}

export function Start() {
	const navigate = useNavigate();
	const me = useAction("open_user", {});
	const [looked, setLooked] = useState<readonly HarnessDescriptor[] | null>(null);
	const [lookedNote, setLookedNote] = useState<string | null>(null);
	const [joining, setJoining] = useState(false);
	const [name, setName] = useState("");
	const [team, setTeam] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);

	if (me.data?.user) return <Navigate to="/conversations" replace />;
	const programs = looked ?? me.data?.runsOn ?? [];
	const none = me.data !== null && !programs.some(ready);

	const look = async () => {
		setLookedNote("Looking…");
		const res = await post("/api/start/look");
		const found = res.ok ? ((await res.json()) as { runsOn: HarnessDescriptor[] }).runsOn : null;
		if (found) setLooked(found);
		setLookedNote(
			found?.some(ready)
				? "Looked again just now: one is ready."
				: "Looked again just now: still none ready.",
		);
	};
	const start = async () => {
		if (!(name.trim() && team.trim())) return setProblem("Your name and your team's, please.");
		setStarting(true);
		const res = await post("/api/start", { name: name.trim(), team: team.trim() });
		const body = (await res.json()) as { threadId?: string; error?: string };
		setStarting(false);
		if (!body.threadId) return setProblem(body.error ?? "It did not start.");
		navigate(`/conversations/${body.threadId}?first=1`, { replace: true });
	};

	return (
		<div className="first">
			<div className="first-card">
				<h1>HyperIdle</h1>
				{joining ? (
					<Join onBack={() => setJoining(false)} />
				) : (
					<>
						<p className="first-lead">
							{none
								? "Agents work through a program on this computer. None is ready yet."
								: "Agents already on this computer can start right away."}
						</p>
						<Found programs={programs} fixes={none} />
						{none && (
							<p className="first-note">
								{lookedNote ??
									"Install one, or sign in to one, then look again. Any one of them is enough."}
							</p>
						)}
						<label className="first-field">
							<span>Your name</span>
							<input
								value={name}
								aria-label="Your name"
								onChange={(e) => setName(e.target.value)}
							/>
						</label>
						<label className="first-field">
							<span>Name your team</span>
							<input
								value={team}
								placeholder="e.g. Product"
								aria-label="Team name"
								onChange={(e) => setTeam(e.target.value)}
							/>
						</label>
						{!none && (
							<p className="first-note">
								Folders, GitHub and teammates can come later, when you need them.
							</p>
						)}
						{problem && <p className="composer-problem">{problem}</p>}
						<div className="first-acts">
							{none && (
								<button type="button" className="btn btn--accent" onClick={() => void look()}>
									Look again
								</button>
							)}
							<button
								type="button"
								className={none ? "btn" : "btn btn--accent"}
								disabled={none || starting}
								title={none ? "Needs one agent program that is signed in" : undefined}
								onClick={() => void start()}
							>
								Start talking
							</button>
						</div>
						<button
							type="button"
							className="first-other first-other--start"
							onClick={() => setJoining(true)}
						>
							Join a team on a server instead
						</button>
					</>
				)}
			</div>
		</div>
	);
}
