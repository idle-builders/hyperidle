import { type Editor, Extension } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { type Range, type Segment, segmentsOf, toMd, toPm } from "./doc-page";
import { FORMAT_NAMES, type Format, FormatIcon } from "./FormatBar";
import { MentionPicker } from "./MentionPicker";
import { type Mentionable, matching, typedMention } from "./mentionables";

/**
 * The document's text in a small, well-known editor (TipTap over ProseMirror), stored as the
 * Markdown the server keeps. The same editor shows the page in view mode, read-only, so comments
 * point at the same text either way. A comment's highlight is a decoration over its words; while
 * it is open, its two ends are handles to drag.
 */
export interface Highlight {
	readonly id: string;
	readonly range: Range;
	/** Open or being written: highlighted, with handles; otherwise a faint dashed underline. */
	readonly front: boolean;
}

const HIGHLIGHTS = new PluginKey("comment-highlights");

function grip(id: string, end: 0 | 1): HTMLElement {
	const b = document.createElement("button");
	b.type = "button";
	b.className = end === 0 ? "anc-h anc-h--start" : "anc-h anc-h--end";
	b.dataset.comment = id;
	b.dataset.end = String(end);
	b.title = "Drag to change what this comment covers";
	b.setAttribute(
		"aria-label",
		end === 0 ? "Drag to change where the comment starts" : "Drag to change where the comment ends",
	);
	return b;
}

/** Every run of text in the editor, with its position. */
function textsOf(editor: Editor): { pos: number; text: string }[] {
	const out: { pos: number; text: string }[] = [];
	editor.state.doc.descendants((node, pos) => {
		if (node.isText && node.text) out.push({ pos, text: node.text });
	});
	return out;
}

declare module "@tiptap/core" {
	interface Storage {
		markdown: MarkdownStorage;
	}
}

const markdownOf = (editor: Editor): string => editor.storage.markdown.getMarkdown();

export interface DocText {
	readonly editor: Editor | null;
	/** The stored text the editor holds now. */
	readonly markdown: () => string;
	/** A stretch of the stored text, as editor positions. */
	readonly toEditor: (range: Range) => { from: number; to: number } | null;
	/** Editor positions, as a stretch of the stored text. */
	readonly toText: (from: number, to: number) => Range | null;
	/** Draw these comments over the text. */
	readonly draw: (highlights: readonly Highlight[]) => void;
}

/** The editor for one document's body. */
export function useDocText(body: string | null, editable: boolean, onChange: () => void): DocText {
	const filled = useRef(false);
	const shown = useRef<{
		key: string;
		list: readonly { id: string; from: number; to: number; front: boolean }[];
	}>({ key: "[]", list: [] });
	const changed = useRef(onChange);
	changed.current = onChange;
	const editor = useEditor({
		extensions: [
			StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: true } }),
			TaskList,
			TaskItem.configure({ nested: true }),
			TableKit.configure({ table: { resizable: false } }),
			Markdown.configure({ html: false, tightLists: true, bulletListMarker: "-" }),
			Extension.create({
				name: "commentHighlights",
				addProseMirrorPlugins: () => [
					new Plugin({
						key: HIGHLIGHTS,
						props: {
							decorations: (state) =>
								DecorationSet.create(
									state.doc,
									shown.current.list.flatMap((h) => {
										const max = state.doc.content.size;
										const from = Math.max(0, Math.min(h.from, max));
										const to = Math.max(from, Math.min(h.to, max));
										const mark = Decoration.inline(from, to, {
											class: h.front ? "anc anc--on" : "anc anc--bg",
											"data-comment": h.id,
										});
										return h.front
											? [
													mark,
													Decoration.widget(from, () => grip(h.id, 0), {
														side: -1,
														key: `${h.id}:0`,
													}),
													Decoration.widget(to, () => grip(h.id, 1), { side: 1, key: `${h.id}:1` }),
												]
											: [mark];
									}),
								),
						},
					}),
				],
			}),
		],
		content: "",
		editable,
		shouldRerenderOnTransaction: true,
		onUpdate: ({ transaction }) => {
			if (transaction.docChanged) changed.current();
		},
	});

	// The editor takes the stored text when it arrives, and follows it while nobody is writing in it.
	useEffect(() => {
		if (!editor || body === null || (editable && filled.current)) return;
		filled.current = true;
		if (markdownOf(editor) !== body) editor.commands.setContent(body, { emitUpdate: false });
	}, [editor, body, editable]);
	useEffect(() => {
		editor?.setEditable(editable, false);
	}, [editor, editable]);

	const segs = (): Segment[] => (editor ? segmentsOf(textsOf(editor), markdownOf(editor)) : []);
	const toEditor = (range: Range) => {
		const s = segs();
		const from = toPm(s, range.start, "start");
		const to = toPm(s, range.end, "end");
		return from !== null && to !== null && from < to ? { from, to } : null;
	};
	const toText = (from: number, to: number): Range | null => {
		const s = segs();
		const start = toMd(s, from, "start");
		const end = toMd(s, to, "end");
		return start !== null && end !== null && start < end ? { start, end } : null;
	};

	const draw = (highlights: readonly Highlight[]) => {
		const list = highlights.flatMap((h) => {
			const at = toEditor(h.range);
			return at ? [{ id: h.id, front: h.front, ...at }] : [];
		});
		const key = JSON.stringify(list);
		if (!editor || editor.isDestroyed || key === shown.current.key) return;
		shown.current = { key, list };
		editor.view.dispatch(editor.state.tr.setMeta(HIGHLIGHTS, key));
	};

	return {
		editor,
		markdown: () => (editor ? markdownOf(editor) : (body ?? "")),
		toEditor,
		toText,
		draw,
	};
}

/** What a format bar button or a picked block does where the caret is. */
export function addFormat(editor: Editor, kind: Format): void {
	const c = editor.chain().focus();
	if (kind === "heading") c.toggleHeading({ level: 2 }).run();
	else if (kind === "list") c.toggleBulletList().run();
	else if (kind === "checklist") c.toggleTaskList().run();
	else if (kind === "table") c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
	else if (kind === "quote") c.toggleBlockquote().run();
	else if (kind === "code") c.toggleCodeBlock().run();
	else if (kind === "bold") c.toggleBold().run();
	else if (kind === "italic") c.toggleItalic().run();
	else if (kind === "mention") {
		const { from } = editor.state.selection;
		const before = editor.state.doc.textBetween(Math.max(0, from - 1), from);
		c.insertContent(before && !/\s/.test(before) ? " @" : "@").run();
	}
}

/** The piece the caret is in, so its button shows pressed. */
export function activeFormat(editor: Editor | null): Format | null {
	if (!editor) return null;
	const order: [Format, string][] = [
		["table", "table"],
		["checklist", "taskList"],
		["list", "bulletList"],
		["quote", "blockquote"],
		["code", "codeBlock"],
		["heading", "heading"],
		["bold", "bold"],
		["italic", "italic"],
		["link", "link"],
	];
	return order.find(([, name]) => editor.isActive(name))?.[0] ?? null;
}

const BLOCKS: readonly Format[] = ["heading", "list", "checklist", "table", "quote", "code"];

interface Menu {
	readonly kind: "block" | "mention";
	readonly from: number;
	readonly to: number;
	readonly query: string;
	readonly left: number;
	readonly top: number;
}

/** What is being typed at the caret: "/" at the start of an empty line, or an @name. */
function menuAt(editor: Editor, box: DOMRect): Menu | null {
	const { $from, empty } = editor.state.selection;
	if (!(empty && editor.isEditable && $from.parent.isTextblock)) return null;
	const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "￼");
	const block = /^\/(\w*)$/.exec(before);
	const typed = block ? null : typedMention(before, before.length);
	if (!(block || typed)) return null;
	const from = $from.start() + (block ? 0 : (typed?.at ?? 0));
	const at = editor.view.coordsAtPos(from);
	return {
		kind: block ? "block" : "mention",
		from,
		to: $from.pos,
		query: block?.[1] ?? typed?.query ?? "",
		left: at.left - box.left,
		top: at.bottom - box.top + 4,
	};
}

/**
 * The editor on the page, with what typing calls up: "/" opens the block menu at the start of a
 * line, "@" the same mention picker as everywhere else. ↑↓ choose, ↵ takes it, esc closes.
 */
export function DocEditor({ text, people }: { text: DocText; people: readonly Mentionable[] }) {
	const { editor } = text;
	const box = useRef<HTMLDivElement>(null);
	const [closed, setClosed] = useState<number | null>(null);
	const [active, setActive] = useState(0);
	const rect = box.current?.getBoundingClientRect();
	const found = editor && rect ? menuAt(editor, rect) : null;
	const menu = found && found.from !== closed ? found : null;
	const blocks =
		menu?.kind === "block" ? BLOCKS.filter((b) => b.startsWith(menu.query.toLowerCase())) : [];
	const names = menu?.kind === "mention" ? matching(people, menu.query) : [];
	const count = menu?.kind === "block" ? blocks.length : names.length;
	const chosen = Math.min(active, Math.max(0, count - 1));

	const take = (i: number) => {
		if (!(editor && menu)) return;
		const range = { from: menu.from, to: menu.to };
		if (menu.kind === "block") {
			const kind = blocks[i];
			if (!kind) return;
			editor.chain().focus().deleteRange(range).run();
			addFormat(editor, kind);
		} else {
			const m = names[i];
			if (m) editor.chain().focus().insertContentAt(range, `@${m.name} `).run();
		}
		setActive(0);
	};
	const keys = useRef({ count, chosen, take, menu });
	keys.current = { count, chosen, take, menu };

	useEffect(() => {
		if (!editor) return;
		editor.setOptions({
			editorProps: {
				handleKeyDown: (_view, e) => {
					const k = keys.current;
					if (!k.menu || k.count === 0) return false;
					if (e.key === "ArrowDown") setActive((k.chosen + 1) % k.count);
					else if (e.key === "ArrowUp") setActive((k.chosen - 1 + k.count) % k.count);
					else if (e.key === "Enter" || e.key === "Tab") k.take(k.chosen);
					else if (e.key === "Escape") setClosed(k.menu.from);
					else return false;
					return true;
				},
			},
		});
	}, [editor]);

	return (
		<div className="doc-text" ref={box}>
			<section aria-label="The document's text">
				<EditorContent editor={editor} />
			</section>
			{menu && count > 0 && (
				<div className="doc-menu" style={{ left: menu.left, top: menu.top }}>
					{menu.kind === "mention" ? (
						<MentionPicker
							options={names}
							active={chosen}
							head="Mention"
							keys={["mention", "close"]}
							onPick={(m) => take(names.indexOf(m))}
						/>
					) : (
						<div className="picker" role="listbox" aria-label="Add a block">
							<div className="picker-head">
								<span>Add a block</span>
							</div>
							{blocks.map((b, i) => (
								<button
									key={b}
									type="button"
									role="option"
									className="picker-row picker-row--block"
									aria-selected={i === chosen}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => take(i)}
								>
									<FormatIcon kind={b} />
									<span className="picker-name">{FORMAT_NAMES[b]}</span>
								</button>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
