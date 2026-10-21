import { useState } from "react";
import { devices, diff, numbers } from "./judge-data";
import { type Close, Closes, type Reason, Reasons } from "./Loop";

/**
 * JUDGE — you are checking, not reading. Dozens of these a day.
 * The artifact gets the width of the region (expand when it needs more), pins mark
 * the spots, and every pin has a row in an index so you never hunt for a comment again. Above the
 * work, the loop: what already checked itself (so your attention goes to the rest), and the
 * decisions and assumptions it rests on (so you can judge why it went this way).
 */
export const JUDGE_STEPS = [
	{ id: 0, name: "Opened — agent's pointers" },
	{ id: 1, name: "You ask on a spot" },
	{ id: 2, name: "Answers came back" },
	{ id: 3, name: "Approved, one still open" },
	{ id: 4, name: "Rejected, reason sent back" },
	{ id: 5, name: "Round 2 came back" },
	{ id: 6, name: "Round 2 approved" },
];

const SEEDED_REASON =
	"Wrong direction. Customers need the warning in the email, not only on this page — most never open the page before the charge.";

interface Qa {
	n: string;
	who: "you" | "agent";
	where: string;
	q: string;
	a?: string;
	state: "open" | "answered" | "done";
}

/** Round 1: the fix rests on people reading the page before they are charged. Rejecting it says that did not hold. */
function loopFor(step: number): { closes: Close[]; reasons: Reason[] } {
	return {
		closes: [
			{
				what: "Proration on a mid-cycle upgrade is right.",
				by: "check",
				state: "met",
				how: "38 tests pass, 3 new ones cover it",
			},
			{
				what: "The page says the date and the amount before the trial runs out.",
				by: "check",
				state: "met",
				how: "checked at all four widths",
			},
			{
				what: "A customer understands what they will pay.",
				by: "review",
				state: step === 3 ? "met" : "open",
				how: step === 3 ? "you approved it" : "you review it · this is what needs your eyes",
			},
		],
		reasons: [
			{
				kind: "Assumption",
				what: "People read the trial-end page before they are charged.",
				state: step === 4 ? "broke" : "open",
				why:
					step === 4
						? "you rejected it: most people never open the page before the charge"
						: "the whole fix rests on it",
			},
			{
				kind: "Decision",
				what: "Say the amount, not only the date.",
				state: "made",
				why: "by Builder · pin A",
			},
			{
				kind: "Decision",
				what: "Round half-up at the boundary, like the invoice engine.",
				state: "made",
				why: "by Builder · pin B · it changes behaviour",
			},
		],
	};
}

const ROUND2: { closes: Close[]; reasons: Reason[] } = {
	closes: [
		{
			what: "A warning email goes out three days before the trial ends.",
			by: "check",
			state: "met",
			how: "sent to a test account three days before its trial ended",
		},
		{
			what: "The email says the date and the amount.",
			by: "check",
			state: "met",
			how: "read back from the test inbox",
		},
		{
			what: "A customer understands what they will pay.",
			by: "review",
			state: "open",
			how: "you review it",
		},
	],
	reasons: [
		{
			kind: "Assumption",
			what: "People read the trial-end page before they are charged.",
			state: "broke",
			why: "you rejected round 1 for it; the warning moved into the email",
		},
		{
			kind: "Assumption",
			what: "People open an email about money three days before.",
			state: "open",
			why: "opens are counted from today",
		},
		{
			kind: "Decision",
			what: "Leave the trial-end page as it was.",
			state: "made",
			why: "by Builder · it was right, only not enough",
		},
	],
};

function Loop({ closes, reasons }: { closes: Close[]; reasons: Reason[] }) {
	return (
		<div className="rev-loop">
			<div>
				<Closes title="How this closes" items={closes} />
			</div>
			<div>
				<Reasons items={reasons} />
			</div>
		</div>
	);
}

function qaFor(step: number): Qa[] {
	const agent: Qa[] = [
		{
			n: "A",
			who: "agent",
			where: "the warning email",
			q: "I added the amount, not just the date — you did not ask for that. Dishonest to warn about a charge without saying how much.",
			state: step >= 2 ? "done" : "open",
		},
		{
			n: "B",
			who: "agent",
			where: "proration.ts:216",
			q: "Rounding is half-up at the boundary now. It matches the invoice engine, but it is a behaviour change.",
			state: "open",
		},
	];
	if (step === 0) return agent;
	const mine: Qa[] = [
		{
			n: "1",
			who: "you",
			where: "the heading",
			q: '"2 September" reads as the trial end date. Both dates?',
			a: step >= 2 ? 'Changed to "Trial ends 1 Sep · first bill 2 Sep".' : undefined,
			state: step >= 2 ? "answered" : "open",
		},
	];
	if (step >= 2) {
		mine.push({
			n: "2",
			who: "you",
			where: "refund requests",
			q: "This one went the wrong way — is that us?",
			a: "Three of the four predate the fix. The fourth asked for a refund because they did not see the warning, which is the thing we just changed.",
			state: "answered",
		});
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
				<span>
					<b>£24</b>
					<span>per month</span>
				</span>
				<span>
					<b>2 Sep</b>
					<span>first charge</span>
				</span>
				<span>
					<b>3 days</b>
					<span>we warn you before</span>
				</span>
			</div>
			<p className="pg-note">Cancel any time before 1 September and you will not be charged.</p>
		</div>
	);
}

function Pin({
	n,
	kind,
	top,
	left,
	onOpen,
}: {
	n: string;
	kind: "mine" | "agent" | "done";
	top: number;
	left: number;
	onOpen: () => void;
}) {
	return (
		<button type="button" className={`pin pin--${kind}`} style={{ top, left }} onClick={onOpen}>
			{n}
		</button>
	);
}

/**
 * A retry is a new review, never an edit of the old one — comments stay pinned to the
 * version they were made on. Questions left open on round 1 stay there; round 2 starts clean.
 */
function FlagPop({
	q,
	top,
	left,
	onClose,
}: {
	q: Qa;
	top: number;
	left: number;
	onClose: () => void;
}) {
	return (
		<div className="pop" style={{ top, left }}>
			<div className="pop-head">
				<span>on {q.where}</span>
				<button type="button" style={{ marginLeft: "auto" }} onClick={onClose}>
					✕
				</button>
			</div>
			<div className="pop-body">
				<div className="pop-msg">
					<span className="pop-who">Builder</span>
					<p>{q.q}</p>
				</div>
			</div>
			<div className="pop-reply">
				<input placeholder="Reply…" aria-label="Reply" />
				<button type="button" className="btn">
					Send
				</button>
			</div>
		</div>
	);
}

function Round2({ approved }: { approved: boolean }) {
	const [openPin, setOpenPin] = useState<string | null>(null);
	const flags: Qa[] = [
		{
			n: "C",
			who: "agent",
			where: "the warning email",
			q: "This is what you asked for: the three-day warning now goes out by email, with the date and the amount.",
			state: approved ? "done" : "open",
		},
		{
			n: "D",
			who: "agent",
			where: "the trial-end page",
			q: "Unchanged from round 1. The page still says the same thing, so the email and the page agree.",
			state: approved ? "done" : "open",
		},
	];
	const pinned = flags.find((q) => q.n === openPin);
	const open = flags.filter((q) => q.state === "open").length;

	return (
		<div className="rev">
			<header className="rev-head">
				<span className="chip chip--quiet">Thread</span>
				<span className="rev-stage">Review · Final · round 2</span>
				<h2>Trial-end explainer</h2>
				<span className="rev-from">Builder · Explain what happens when a trial ends</span>
				<span className="rev-act">
					{approved ? (
						<span className="chip chip--flag">Approved · work item closed</span>
					) : (
						<>
							<button type="button" className="btn">
								Reject
							</button>
							<button type="button" className="btn btn--accent">
								Approve
							</button>
						</>
					)}
				</span>
			</header>

			<div className="rev-scroll">
				<div className="rev-in">
					<button type="button" className="prev-round">
						<span className="prev-round-h">Round 1 · rejected by you</span>
						<span className="prev-round-why">
							"Wrong direction. Customers need the warning in the email, not only on this page…"
						</span>
						<span className="prev-round-meta">1 question still open there · open round 1 ›</span>
					</button>

					<p className="rev-said">
						Moved the warning into the email, as you asked. The page stays as it was. Two things I
						flagged for you.
					</p>

					<div className="since">
						<span className="since-h">Changed since round 1</span>
						<ul>
							<li>New: the three-day warning email, with date and amount</li>
							<li>Same: the trial-end page and the proration fix</li>
						</ul>
					</div>

					<Loop
						closes={
							approved
								? ROUND2.closes.map((c) =>
										c.by === "review" ? { ...c, state: "met" as const, how: "you approved it" } : c,
									)
								: ROUND2.closes
						}
						reasons={ROUND2.reasons}
					/>

					<div className="art">
						<div className="art-bar">
							<span className="art-kind">Email</span>
							<span className="art-title">Three-day warning · new in round 2</span>
						</div>
						<div className="art-body">
							<div className="mail">
								<div className="mail-meta">
									<span>
										<b>To</b> the trial user
									</span>
									<span>
										<b>Subject</b> Your trial ends in 3 days
									</span>
								</div>
								<p>Hi Sam,</p>
								<p>
									Your trial ends on 1 September. On 2 September we start your Team plan and charge
									<b> £24</b>.
								</p>
								<p>
									If you do not want to continue, cancel before 1 September and nothing is charged.
								</p>
							</div>
							<Pin
								n="C"
								kind={approved ? "done" : "agent"}
								top={120}
								left={596}
								onOpen={() => setOpenPin("C")}
							/>
							{pinned?.n === "C" && (
								<FlagPop q={pinned} top={150} left={626} onClose={() => setOpenPin(null)} />
							)}
						</div>
					</div>

					<div className="art">
						<div className="art-bar">
							<span className="art-kind">Live preview</span>
							<span className="art-title">Trial-end page · unchanged</span>
						</div>
						<div className="art-body">
							<TrialPage width={720} />
							<Pin
								n="D"
								kind={approved ? "done" : "agent"}
								top={20}
								left={330}
								onOpen={() => setOpenPin("D")}
							/>
							{pinned?.n === "D" && (
								<FlagPop q={pinned} top={50} left={360} onClose={() => setOpenPin(null)} />
							)}
						</div>
					</div>

					<div className="qa">
						<div className="qa-head">
							<span className="qa-title">Questions on this review</span>
							<span className="qa-counts">
								{open > 0 && <span>{open} open</span>}
								<span>{flags.length} total</span>
							</span>
						</div>
						{flags.map((q) => (
							<button key={q.n} type="button" className="qa-row" onClick={() => setOpenPin(q.n)}>
								<span className={`qa-mark pin--${q.state === "done" ? "done" : "agent"}`}>
									{q.n}
								</span>
								<span>
									<span className="qa-where">Builder flagged · on {q.where}</span>
									<span className="qa-q">{q.q}</span>
								</span>
								<span className={`qa-state qa-state--${q.state}`}>
									{q.state === "open" ? "Open" : "Settled"}
								</span>
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export function Judge({ step }: { step: number }) {
	if (step >= 5) return <Round2 approved={step === 6} />;
	return <Round1 step={step} />;
}

function Round1({ step }: { step: number }) {
	const [wide, setWide] = useState(false);
	const [device, setDevice] = useState("desktop");
	const [openPin, setOpenPin] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState("");
	const [rejected, setRejected] = useState<string | null>(step === 4 ? SEEDED_REASON : null);
	const w = devices.find((d) => d.id === device)?.w ?? 1280;

	const qa = qaFor(step);
	const open = qa.filter((q) => q.state === "open").length;
	const answered = qa.filter((q) => q.state === "answered").length;
	const pinned = qa.find((q) => q.n === openPin);

	const page = (
		<>
			<TrialPage width={wide ? w : 720} />
			{step >= 1 && (
				<Pin
					n="1"
					kind={step >= 2 ? "done" : "mine"}
					top={54}
					left={210}
					onOpen={() => setOpenPin("1")}
				/>
			)}
			<Pin
				n="A"
				kind={step >= 2 ? "done" : "agent"}
				top={186}
				left={330}
				onOpen={() => setOpenPin("A")}
			/>
			{pinned && (
				<div
					className="pop"
					style={{ top: pinned.n === "1" ? 84 : 216, left: pinned.n === "1" ? 240 : 360 }}
				>
					<div className="pop-head">
						<span>on {pinned.where}</span>
						<button type="button" style={{ marginLeft: "auto" }} onClick={() => setOpenPin(null)}>
							✕
						</button>
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
						<button type="button" className="btn">
							Send
						</button>
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
							<button
								key={d.id}
								type="button"
								className="tool"
								aria-pressed={device === d.id}
								onClick={() => setDevice(d.id)}
							>
								{d.name}
							</button>
						))}
					</span>
					<span style={{ marginLeft: "auto" }}>
						<button type="button" className="btn" onClick={() => setWide(false)}>
							Done
						</button>
					</span>
				</div>
				<div className="wide-body">{page}</div>
			</div>
		);
	}

	return (
		<div className="rev">
			<header className="rev-head">
				<span className="chip chip--quiet">Thread</span>
				<span className="rev-stage">Review · Final · 3 of 3</span>
				<h2>Trial-end explainer</h2>
				<span className="rev-from">Builder · Explain what happens when a trial ends</span>
				<span className="rev-act">
					{open > 0 && <span className="rev-open">{open} open</span>}
					{rejected ? (
						<span className="chip chip--quiet">Rejected · sent to Builder</span>
					) : step === 3 ? (
						<span className="chip chip--flag">Approved · 1 open</span>
					) : (
						<>
							<button
								type="button"
								className="btn"
								aria-expanded={rejecting}
								onClick={() => setRejecting(true)}
							>
								Reject
							</button>
							<button type="button" className="btn btn--accent">
								Approve
							</button>
						</>
					)}
				</span>
				{rejecting && (
					<div className="reject" role="dialog" aria-label="Reject this review">
						<label className="reject-h" htmlFor="reject-reason">
							Why are you rejecting this?
						</label>
						<textarea
							id="reject-reason"
							rows={4}
							value={reason}
							placeholder="What is wrong, and what should happen instead…"
							onChange={(e) => setReason(e.target.value)}
						/>
						<p className="reject-to">
							Goes back to Builder and the session that raised this review.
						</p>
						<div className="reject-act">
							<button type="button" className="btn" onClick={() => setRejecting(false)}>
								Cancel
							</button>
							<button
								type="button"
								className="btn btn--accent"
								disabled={reason.trim() === ""}
								onClick={() => {
									setRejected(reason.trim());
									setRejecting(false);
								}}
							>
								Reject and send
							</button>
						</div>
					</div>
				)}
			</header>

			<div className="rev-scroll">
				<div className="rev-in">
					{rejected && (
						<div className="rejected">
							<span className="rejected-h">
								You rejected this · Builder's session has your reason
							</span>
							<p className="rejected-why">{rejected}</p>
							<span className="rejected-next">Builder answers in this thread.</span>
						</div>
					)}
					<p className="rev-said">
						Page says the date and the amount before the trial runs out. Proration bug fixed on the
						way. Two things I flagged for you.
					</p>

					<Loop {...loopFor(step)} />

					<div className="art">
						<div className="art-bar">
							<span className="art-kind">Live preview</span>
							<span className="art-title">Trial-end page</span>
							<span className="art-tools">
								<button type="button" className="tool" onClick={() => setWide(true)}>
									More space
								</button>
							</span>
						</div>
						<div className="art-body">{page}</div>
					</div>

					<div className="art">
						<div className="art-bar">
							<span className="art-kind">Code</span>
							<span className="art-title">billing/proration.ts · +3 −2</span>
							<span className="art-tools">
								<button type="button" className="tool">
									More space
								</button>
							</span>
						</div>
						<div className="art-body art-body--flush">
							{diff.map((l) => (
								<div
									key={l.n}
									className={`code-line${l.sign === "+" ? " code-line--add" : l.sign === "-" ? " code-line--del" : ""}`}
								>
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
										<span className={`kpi-delta ${k.good ? "kpi-delta--good" : "kpi-delta--bad"}`}>
											{k.delta}
										</span>
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
								<span
									className={`qa-mark pin--${q.who === "you" ? "mine" : q.state === "done" ? "done" : "agent"}`}
								>
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
							<input
								placeholder="Comment on the whole thing, or @someone…"
								aria-label="Overall comment"
							/>
							<button type="button" className="btn">
								Send
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
