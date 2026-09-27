import { useState } from "react";
import { devices, diff, numbers } from "./judge-data";

/**
 * JUDGE — you are checking, not reading. Dozens of these a day.
 * The artifact gets the width of the region (expand when it needs more), pins mark
 * the spots, and every pin has a row in an index so you never hunt for a comment again.
 */
export const JUDGE_STEPS = [
	{ id: 0, name: "Opened — agent's pointers" },
	{ id: 1, name: "You ask on a spot" },
	{ id: 2, name: "Answers came back" },
	{ id: 3, name: "Approved, one still open" },
];

interface QA {
	n: string;
	who: "you" | "agent";
	where: string;
	q: string;
	a?: string;
	state: "open" | "answered" | "done";
}

function qaFor(step: number): QA[] {
	const agent: QA[] = [
		{ n: "A", who: "agent", where: "the warning email", q: "I added the amount, not just the date — you did not ask for that. Dishonest to warn about a charge without saying how much.", state: step >= 2 ? "done" : "open" },
		{ n: "B", who: "agent", where: "proration.ts:216", q: "Rounding is half-up at the boundary now. It matches the invoice engine, but it is a behaviour change.", state: "open" },
	];
	if (step === 0) return agent;
	const mine: QA[] = [
		{ n: "1", who: "you", where: "the heading", q: '"2 September" reads as the trial end date. Both dates?',
			a: step >= 2 ? 'Changed to "Trial ends 1 Sep · first bill 2 Sep".' : undefined,
			state: step >= 2 ? "answered" : "open" },
	];
	if (step >= 2) {
		mine.push({ n: "2", who: "you", where: "refund requests", q: "This one went the wrong way — is that us?",
			a: "Three of the four predate the fix. The fourth asked for a refund because they did not see the warning, which is the thing we just changed.",
			state: "answered" });
	}
	return [...mine, ...agent];
}

function TrialPage({ width }: { width: number }) {
	return (
		<div style={{ maxWidth: width, margin: "0 auto" }}>
			<span className="pg-eyebrow">Your trial</span>
			<h3 className="pg-h">Your first bill: 2 September</h3>
			<p className="pg-sub">
				Your trial ends on 1 September. The day after, we start your Team plan and send the first
				invoice.
			</p>
			<div className="pg-bill">
				<span><b>£24</b><span>per month</span></span>
				<span><b>2 Sep</b><span>first charge</span></span>
				<span><b>3 days</b><span>we warn you before</span></span>
			</div>
			<p className="pg-note">Cancel any time before 1 September and you will not be charged.</p>
		</div>
	);
}

function Pin({ n, kind, top, left, onOpen }: {
	n: string; kind: "mine" | "agent" | "done"; top: number; left: number; onOpen: () => void;
}) {
	return (
		<button type="button" className={`pin pin--${kind}`} style={{ top, left }} onClick={onOpen}>
			{n}
		</button>
	);
}

export function Judge({ step }: { step: number }) {
	const [wide, setWide] = useState(false);
	const [device, setDevice] = useState("desktop");
	const [openPin, setOpenPin] = useState<string | null>(null);
	const w = devices.find((d) => d.id === device)?.w ?? 1280;

	const qa = qaFor(step);
	const open = qa.filter((q) => q.state === "open").length;
	const answered = qa.filter((q) => q.state === "answered").length;
	const pinned = qa.find((q) => q.n === openPin);

	const page = (
		<>
			<TrialPage width={wide ? w : 720} />
			{step >= 1 && (
				<Pin n="1" kind={step >= 2 ? "done" : "mine"} top={54} left={210} onOpen={() => setOpenPin("1")} />
			)}
			<Pin n="A" kind={step >= 2 ? "done" : "agent"} top={186} left={330} onOpen={() => setOpenPin("A")} />
			{pinned && (
				<div className="pop" style={{ top: pinned.n === "1" ? 84 : 216, left: pinned.n === "1" ? 240 : 360 }}>
					<div className="pop-head">
						<span>on {pinned.where}</span>
						<button type="button" style={{ marginLeft: "auto" }} onClick={() => setOpenPin(null)}>✕</button>
					</div>
					<div className="pop-body">
						<div className="pop-msg">
							<span className="pop-who">{pinned.who === "you" ? "You" : "Builder"}</span>
							<p>{pinned.q}</p>
						</div>
						{pinned.a && (
							<div className="pop-msg">
								<span className="pop-who">Builder</span>
								<p>{pinned.a}</p>
							</div>
						)}
					</div>
					<div className="pop-reply">
						<input placeholder="Reply…" aria-label="Reply" />
						<button type="button" className="btn">Send</button>
					</div>
				</div>
			)}
		</>
	);

	if (wide) {
		return (
			<div className="wide">
				<div className="wide-bar">
					<span className="art-kind">Live preview</span>
					<span className="art-title">Trial-end page</span>
					<span className="art-tools">
						{devices.map((d) => (
							<button key={d.id} type="button" className="tool" aria-pressed={device === d.id}
								onClick={() => setDevice(d.id)}>{d.name}</button>
						))}
					</span>
					<span style={{ marginLeft: "auto" }}>
						<button type="button" className="btn" onClick={() => setWide(false)}>Done</button>
					</span>
				</div>
				<div className="wide-body">{page}</div>
			</div>
		);
	}

	return (
		<div className="rev">
			<header className="rev-head">
				<span className="chip chip--quiet">Review</span>
				<span className="rev-stage">Final · 3 of 3</span>
				<h2>Trial-end explainer</h2>
				<span className="rev-from">Builder · Explain what happens when a trial ends</span>
				<span className="rev-act">
					{open > 0 && <span className="rev-open">{open} open</span>}
					{step === 3
						? <span className="chip chip--flag">Approved · 1 open</span>
						: <button type="button" className="btn btn--accent">Approve</button>}
				</span>
			</header>

			<div className="rev-scroll">
				<div className="rev-in">
					<p className="rev-said">
						Page says the date and the amount before the trial runs out. Proration bug fixed on the
						way. Two things I flagged for you.
					</p>

					<div className="art">
						<div className="art-bar">
							<span className="art-kind">Live preview</span>
							<span className="art-title">Trial-end page</span>
							<span className="art-tools">
								<button type="button" className="tool" onClick={() => setWide(true)}>More space</button>
							</span>
						</div>
						<div className="art-body">{page}</div>
					</div>

					<div className="art">
						<div className="art-bar">
							<span className="art-kind">Code</span>
							<span className="art-title">billing/proration.ts · +3 −2</span>
							<span className="art-tools">
								<button type="button" className="tool">More space</button>
							</span>
						</div>
						<div className="art-body art-body--flush">
							{diff.map((l) => (
								<div key={l.n} className={`code-line${l.sign === "+" ? " code-line--add" : l.sign === "-" ? " code-line--del" : ""}`}>
									<span className="code-n">{l.n}</span>
									<span>{l.sign}</span>
									<span className="code-txt">{l.text}</span>
								</div>
							))}
							<Pin n="B" kind="agent" top={92} left={560} onOpen={() => setOpenPin("B")} />
						</div>
					</div>

					<div className="art">
						<div className="art-bar">
							<span className="art-kind">Numbers</span>
							<span className="art-title">Trial-end tickets · 30 days</span>
						</div>
						<div className="art-body">
							<div className="kpis">
								{numbers.map((k) => (
									<div className="kpi" key={k.label}>
										<span className="kpi-label">{k.label}</span>
										<b>{k.value}</b>
										<span className={`kpi-delta ${k.good ? "kpi-delta--good" : "kpi-delta--bad"}`}>{k.delta}</span>
									</div>
								))}
							</div>
						</div>
					</div>

					<div className="qa">
						<div className="qa-head">
							<span className="qa-title">Questions on this review</span>
							<span className="qa-counts">
								{open > 0 && <span>{open} open</span>}
								{answered > 0 && <span>{answered} answered</span>}
								<span>{qa.length} total</span>
							</span>
						</div>
						{qa.map((q) => (
							<button key={q.n} type="button" className="qa-row" onClick={() => setOpenPin(q.n)}>
								<span className={`qa-mark pin--${q.who === "you" ? "mine" : q.state === "done" ? "done" : "agent"}`}>
									{q.n}
								</span>
								<span>
									<span className="qa-where">
										{q.who === "you" ? "You asked" : "Builder flagged"} · on {q.where}
									</span>
									<span className="qa-q">{q.q}</span>
									{q.a && <span className="qa-a">{q.a}</span>}
								</span>
								<span className={`qa-state qa-state--${q.state}`}>
									{q.state === "open" ? "Open" : q.state === "answered" ? "Answered" : "Settled"}
								</span>
							</button>
						))}
					</div>

					<div className="overall">
						<span className="overall-h">Anything overall?</span>
						<div className="overall-say">
							<input placeholder="Comment on the whole thing, or @someone…" aria-label="Overall comment" />
							<button type="button" className="btn">Send</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
