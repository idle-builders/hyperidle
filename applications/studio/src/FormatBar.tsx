/**
 * The format bar — one control for adding formatted pieces wherever someone writes: floating at
 * the bottom of a document in edit mode, and inside the chat box. Every button shows the shape
 * and says its name, so nobody has to know the typing shortcuts.
 */
export type Format = "heading" | "list" | "checklist" | "table" | "quote" | "code" | "link" | "mention";

export const DOC_FORMATS: Format[] = ["heading", "list", "checklist", "table", "quote", "code", "link", "mention"];
export const CHAT_FORMATS: Format[] = ["mention", "link", "list", "quote", "code"];

const NAMES: Record<Format, string> = {
	heading: "Heading",
	list: "List",
	checklist: "Checklist",
	table: "Table",
	quote: "Quote",
	code: "Code",
	link: "Link",
	mention: "Mention",
};

/** Link and mention go inside a line of text; the rest are blocks of their own. */
const INLINE: Format[] = ["link", "mention"];

const SHAPES: Record<Format, React.ReactNode> = {
	heading: <path d="M3.5 3v10M12.5 3v10M3.5 8h9" />,
	list: (
		<>
			<path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5" />
			<circle cx="2.75" cy="4" r="0.9" fill="currentColor" stroke="none" />
			<circle cx="2.75" cy="8" r="0.9" fill="currentColor" stroke="none" />
			<circle cx="2.75" cy="12" r="0.9" fill="currentColor" stroke="none" />
		</>
	),
	checklist: (
		<>
			<rect x="1.75" y="2.25" width="4" height="4" rx="1" />
			<path d="M2.9 4.3l.8.8 1.3-1.5" />
			<rect x="1.75" y="9.75" width="4" height="4" rx="1" />
			<path d="M8.5 4.25h5.5M8.5 11.75h5.5" />
		</>
	),
	table: (
		<>
			<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
			<path d="M1.75 6.5h12.5M6.25 2.75v10.5M10.25 2.75v10.5" />
		</>
	),
	quote: <path d="M3 3v10M6.5 5h7.5M6.5 8h7.5M6.5 11h4.5" />,
	code: <path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" />,
	link: (
		<path d="M6.9 9.1a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.7.7M9.1 6.9a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.7-.7" />
	),
	mention: (
		<text x="8" y="12" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor" stroke="none">@</text>
	),
};

export function FormatBar({ kinds, floating, active, onAdd }: {
	kinds: Format[];
	/** Floats over the bottom of the page instead of sitting in a row. */
	floating?: boolean;
	/** The piece just added, shown pressed. */
	active?: Format | null;
	onAdd?: (kind: Format) => void;
}): React.ReactElement {
	return (
		<div className={floating ? "fmt fmt--floating" : "fmt"} role="toolbar" aria-label="Add formatting">
			{kinds.map((kind, i) => (
				<span key={kind} className="fmt-item">
					{i > 0 && INLINE.includes(kind) !== INLINE.includes(kinds[i - 1]) && <span className="fmt-sep" />}
					<button type="button" className="fmt-b" aria-pressed={active === kind} onMouseDown={(e) => e.preventDefault()} onClick={() => onAdd?.(kind)}>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							{SHAPES[kind]}
						</svg>
						{NAMES[kind]}
					</button>
				</span>
			))}
		</div>
	);
}
