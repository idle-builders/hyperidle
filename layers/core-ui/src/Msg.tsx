/** The pieces a thread is made of, shared by every screen that shows one. */
export function Avatar({ who, human }: { who: string; human?: boolean }) {
	return <span className={human ? "avatar avatar--human" : "avatar"}>{who}</span>;
}

export function Msg({
	who,
	human,
	name,
	at,
	children,
}: {
	who: string;
	human?: boolean;
	name: string;
	at: string;
	children: React.ReactNode;
}) {
	return (
		<article className="msg">
			<Avatar who={who} human={human} />
			<div>
				<div className="msg-who">
					<span className="msg-name">{name}</span>
					<span className="meta">{at}</span>
				</div>
				<div className="msg-body">{children}</div>
			</div>
		</article>
	);
}

export function Event({ children }: { children: React.ReactNode }) {
	return (
		<div className="event">
			<span>{children}</span>
			<span className="event-line" />
		</div>
	);
}
