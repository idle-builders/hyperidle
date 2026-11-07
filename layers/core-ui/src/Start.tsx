import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { post } from "./api";
import { useAction } from "./useAction";

/**
 * First start, on a fresh install: your name and your team's, and Start talking — which makes you,
 * your team and your first agent, and opens your first conversation. A team that already runs on a
 * server is joined instead, in the desktop app.
 */

/**
 * Joining happens in the desktop app: you sign in in your browser, and the server hands back your
 * own key; the app keeps it and reopens there as you. A new server also asks for its team.
 */
function Join({ onBack }: { onBack: () => void }) {
	const bridge = window.__HYPERIDLE__;
	const [address, setAddress] = useState("");
	const [team, setTeam] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [joining, setJoining] = useState(false);
	const join = async () => {
		if (!bridge?.join) return;
		if (!address.trim()) return setProblem("Give the server's address.");
		if (team !== null && !team.trim()) return setProblem("Name your team, please.");
		setJoining(true);
		setProblem(null);
		const joined = await bridge.join({
			address,
			...(team?.trim() ? { team: team.trim() } : {}),
		});
		setJoining(false);
		if (joined.ok || joined.cancelled) return;
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
					<p className="first-note">
						Your browser opens to sign in. Whoever runs the server lets you in there.
					</p>
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
						{joining ? "Signing in…" : "Sign in and join"}
					</button>
				)}
				{joining && (
					<button type="button" className="btn" onClick={() => void bridge?.cancelJoin?.()}>
						Cancel
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
	const [joining, setJoining] = useState(false);
	const [name, setName] = useState("");
	const [team, setTeam] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);

	if (me.data?.user) return <Navigate to="/conversations" replace />;

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
						<p className="first-lead">Agents already on this computer can start right away.</p>
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
						<p className="first-note">
							Folders, GitHub and teammates can come later, when you need them.
						</p>
						{problem && <p className="composer-problem">{problem}</p>}
						<div className="first-acts">
							<button
								type="button"
								className="btn btn--accent"
								disabled={starting}
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
