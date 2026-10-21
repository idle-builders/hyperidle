import { type Inline, parseRich } from "./rich-text";

function Pieces({ of }: { of: readonly Inline[] }) {
	return (
		<>
			{of.map((p, i) => {
				const key = `${p.kind}-${i}`;
				if (p.kind === "text") return <span key={key}>{p.text}</span>;
				if (p.kind === "bold" || p.kind === "italic") {
					const Tag = p.kind === "bold" ? "strong" : "em";
					return (
						<Tag key={key}>
							<Pieces of={p.children} />
						</Tag>
					);
				}
				if (p.kind === "code") return <code key={key}>{p.text}</code>;
				if (p.kind === "mention") return <strong key={key}>{p.text}</strong>;
				return (
					<a key={key} className="lnk" href={p.href} target="_blank" rel="noreferrer">
						{p.text}
					</a>
				);
			})}
		</>
	);
}

/** A message's text with the formatting it was typed with. */
export function RichText({ text, mentions }: { text: string; mentions?: readonly string[] }) {
	return (
		<>
			{parseRich(text, mentions).map((b, i) => {
				const key = `${b.kind}-${i}`;
				if (b.kind === "list")
					return (
						<ul key={key} className="msg-list">
							{b.items.map((item, j) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: a list item has nothing else to key on
								<li key={j}>
									<Pieces of={item} />
								</li>
							))}
						</ul>
					);
				if (b.kind === "quote")
					return (
						<p key={key} className="quote">
							<Pieces of={b.inline} />
						</p>
					);
				return (
					<p key={key} className="msg-para">
						<Pieces of={b.inline} />
					</p>
				);
			})}
		</>
	);
}
