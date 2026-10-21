import { useLayoutEffect, useRef, useState } from "react";
import { CHAT_FORMATS, type Format, FormatBar } from "./FormatBar";
import { MentionPicker, useMentionables } from "./MentionPicker";
import { type Mentionable, matching, typedMention } from "./mentionables";
import { addFormat, escapeRegExp } from "./rich-text";

/**
 * The chat box: the message on top, the format bar and Send under it. Typing `@` opens the
 * mention picker; ↑↓ choose, ↵ puts the name in, esc closes it and keeps what was typed. ↵ on
 * its own sends; shift-↵ starts a new line.
 */
export function Composer({
	label,
	placeholder,
	pickerHead,
	pickerKeys,
	startPicking,
	onSend,
}: {
	label: string;
	placeholder?: string;
	pickerHead: string;
	pickerKeys: readonly [string, string];
	/** Open with the picker showing everyone, before anything is typed. */
	startPicking?: boolean;
	/** Resolves to whether it was sent; a message that was not sent stays in the box. */
	onSend: (text: string, mentioned: readonly Mentionable[]) => Promise<boolean>;
}) {
	const people = useMentionables();
	const box = useRef<HTMLTextAreaElement>(null);
	const [text, setText] = useState("");
	const [caret, setCaret] = useState(0);
	const [active, setActive] = useState(0);
	const [opening, setOpening] = useState(Boolean(startPicking));
	const [closedAt, setClosedAt] = useState<number | null>(null);
	const [sending, setSending] = useState(false);
	const select = useRef<{ start: number; end: number } | null>(null);

	useLayoutEffect(() => {
		const sel = select.current;
		if (sel && box.current) {
			box.current.setSelectionRange(sel.start, sel.end);
			select.current = null;
		}
	});

	const typed = typedMention(text, caret);
	const query = typed && typed.at !== closedAt ? typed : opening ? { at: caret, query: "" } : null;
	const options = query ? matching(people, query.query) : [];
	const picking = options.length > 0;
	const chosen = Math.min(active, options.length - 1);

	const change = (next: string, start: number, end = start) => {
		setText(next);
		setCaret(start);
		setActive(0);
		select.current = { start, end };
	};

	const pick = (m: Mentionable) => {
		if (!query) return;
		const typedAt = typed && typed.at !== closedAt ? typed.at : null;
		const from = typedAt ?? caret;
		const name = `@${m.name} `;
		const lead = typedAt === null && from > 0 && !/\s/.test(text[from - 1] ?? "") ? " " : "";
		change(text.slice(0, from) + lead + name + text.slice(caret), from + lead.length + name.length);
		setOpening(false);
		box.current?.focus();
	};

	const send = async () => {
		if (text.trim() === "" || sending) return;
		setSending(true);
		const mentioned = people.filter((m) =>
			new RegExp(`(^|\\s)@${escapeRegExp(m.name)}(?!\\w)`, "i").test(text),
		);
		const sent = await onSend(text.trim(), mentioned);
		setSending(false);
		if (sent) change("", 0);
	};

	const format = (kind: Format) => {
		const el = box.current;
		if (!el) return;
		const edit = addFormat(text, el.selectionStart, el.selectionEnd, kind);
		change(edit.text, edit.start, edit.end);
		setClosedAt(null);
		el.focus();
	};

	return (
		<div className="composer">
			<div className="composer-col">
				{picking && (
					<MentionPicker
						options={options}
						active={chosen}
						head={pickerHead}
						keys={pickerKeys}
						onPick={pick}
					/>
				)}
				<div className="composer-box">
					<textarea
						ref={box}
						rows={1}
						value={text}
						placeholder={placeholder}
						aria-label={label}
						// biome-ignore lint/a11y/noAutofocus: a new conversation starts in its box
						autoFocus={startPicking}
						onChange={(e) => {
							setText(e.target.value);
							setCaret(e.target.selectionStart);
							setActive(0);
							setOpening(false);
							// esc closes the picker for that one @; once it is gone, a new @ opens it again.
							if (!typedMention(e.target.value, e.target.selectionStart)) setClosedAt(null);
						}}
						onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
						onKeyDown={(e) => {
							if (picking && e.key === "ArrowDown") {
								e.preventDefault();
								setActive((chosen + 1) % options.length);
							} else if (picking && e.key === "ArrowUp") {
								e.preventDefault();
								setActive((chosen - 1 + options.length) % options.length);
							} else if (picking && (e.key === "Enter" || e.key === "Tab")) {
								e.preventDefault();
								const m = options[chosen];
								if (m) pick(m);
							} else if (picking && e.key === "Escape") {
								e.preventDefault();
								setOpening(false);
								setClosedAt(typed?.at ?? null);
							} else if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								void send();
							}
						}}
					/>
					<div className="composer-row">
						<FormatBar kinds={CHAT_FORMATS} onAdd={format} />
						<button
							type="button"
							className="btn btn--accent"
							disabled={text.trim() === "" || sending}
							onClick={() => void send()}
						>
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
