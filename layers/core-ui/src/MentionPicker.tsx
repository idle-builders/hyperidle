import { Avatar } from "./Msg";
import { type Mentionable, mentionables } from "./mentionables";
import { useAction } from "./useAction";

const NONE: readonly never[] = [];

/** Everyone you can @mention, with their load from the sessions running now. */
export function useMentionables(): readonly Mentionable[] {
	const me = useAction("open_user", {});
	const users = useAction("search_users", {});
	const running = useAction("search_sessions", { state: "active" });
	return mentionables(users.data ?? NONE, running.data ?? NONE, me.data?.user?.id ?? "");
}

/**
 * The mention picker: agents and people in one list, each with what they do and their load.
 * `head` and `keys` name what picking does here — hand off, bring in, mention.
 */
export function MentionPicker({
	options,
	active,
	head,
	keys,
	inline,
	onPick,
}: {
	options: readonly Mentionable[];
	active?: number;
	head: string;
	/** What ↵ and esc do, e.g. ["hand off", "keep it"]; none when the picker is clicked only. */
	keys?: readonly [string, string];
	inline?: boolean;
	onPick: (m: Mentionable) => void;
}) {
	return (
		<div className={inline ? "picker picker--inline" : "picker"} role="listbox" aria-label={head}>
			<div className="picker-head">
				<span>{head}</span>
				<span>agents and people, same list</span>
			</div>
			{options.map((m, i) => (
				<button
					key={m.id}
					type="button"
					role="option"
					className="picker-row"
					aria-selected={i === active}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => onPick(m)}
				>
					<Avatar who={m.initials} human={m.human} />
					<span>
						<span className="picker-name">{m.name}</span>
						<span className="picker-what">{m.what}</span>
					</span>
					<span className="picker-load">{m.load}</span>
				</button>
			))}
			{keys && (
				<div className="picker-foot">
					<span>
						<kbd>↑↓</kbd> choose
					</span>
					<span>
						<kbd>↵</kbd> {keys[0]}
					</span>
					<span>
						<kbd>esc</kbd> {keys[1]}
					</span>
				</div>
			)}
		</div>
	);
}
