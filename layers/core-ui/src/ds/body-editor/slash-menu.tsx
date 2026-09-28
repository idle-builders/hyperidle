import type { Editor, Range } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { forwardRef, type JSX, useEffect, useImperativeHandle, useRef, useState } from "react";
import tippy, { type Instance as TippyInstance, type Props as TippyProps } from "tippy.js";

export interface SlashMenuItem {
	title: string;
	description: string;
	command: (props: { editor: Editor; range: Range }) => void;
}

export const SLASH_MENU_ITEMS: SlashMenuItem[] = [
	{
		title: "Heading 1",
		description: "Large section heading",
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
		},
	},
	{
		title: "Heading 2",
		description: "Medium section heading",
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
		},
	},
	{
		title: "Heading 3",
		description: "Small section heading",
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
		},
	},
	{
		title: "Bullet List",
		description: "Unordered list",
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBulletList().run();
		},
	},
	{
		title: "Numbered List",
		description: "Ordered list",
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleOrderedList().run();
		},
	},
	{
		title: "Quote",
		description: "Blockquote",
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBlockquote().run();
		},
	},
	{
		title: "Code Block",
		description: "Fenced code block",
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
		},
	},
	{
		title: "Table",
		description: "Insert a 2x2 table",
		command: ({ editor, range }) => {
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertTable({ rows: 2, cols: 2, withHeaderRow: true })
				.run();
		},
	},
	{
		title: "Divider",
		description: "Horizontal rule",
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setHorizontalRule().run();
		},
	},
	{
		title: "Image",
		description: "Image from URL",
		command: ({ editor, range }) => {
			const url = window.prompt("Image URL");
			if (url) {
				editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
			}
		},
	},
];

export function filterSlashItems(query: string): SlashMenuItem[] {
	if (!query) return SLASH_MENU_ITEMS;
	const q = query.toLowerCase();
	return SLASH_MENU_ITEMS.filter(
		(item) => item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
	);
}

interface SlashMenuDropdownRef {
	onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SlashMenuDropdownProps {
	items: SlashMenuItem[];
	command: (item: SlashMenuItem) => void;
}

/**
 * The slash menu dropdown component rendered via TipTap's ReactRenderer.
 * Supports keyboard navigation (ArrowUp/Down, Enter, Escape).
 *
 * ARIA: role="listbox" on container, role="option" on each item, aria-selected
 * on the highlighted item.
 */
const SlashMenuDropdown = forwardRef<SlashMenuDropdownRef, SlashMenuDropdownProps>(
	(props, ref): JSX.Element => {
		const [selectedIndex, setSelectedIndex] = useState(0);
		const containerRef = useRef<HTMLDivElement>(null);

		// Reset selection when items change (new query produces new array reference)
		// biome-ignore lint/correctness/useExhaustiveDependencies: props.items identity change is the signal — this is intentional.
		useEffect(() => {
			setSelectedIndex(0);
		}, [props.items]);

		const selectItem = (index: number): void => {
			const item = props.items[index];
			if (item) {
				props.command(item);
			}
		};

		useImperativeHandle(ref, () => ({
			onKeyDown: ({ event }: { event: KeyboardEvent }): boolean => {
				if (event.key === "ArrowUp") {
					setSelectedIndex((prev) => (prev <= 0 ? props.items.length - 1 : prev - 1));
					return true;
				}
				if (event.key === "ArrowDown") {
					setSelectedIndex((prev) => (prev >= props.items.length - 1 ? 0 : prev + 1));
					return true;
				}
				if (event.key === "Enter") {
					selectItem(selectedIndex);
					return true;
				}
				return false;
			},
		}));

		if (props.items.length === 0) {
			return (
				<div
					ref={containerRef}
					role="listbox"
					aria-label="Slash commands"
					className="border-width-thin bg-[var(--surface-elevated)]  border-[var(--border-subtle)] rounded-[var(--r-default)] py-[3px] min-w-[200px] max-h-[320px] overflow-y-auto shadow-[var(--shadow-elevated)]"
				>
					<div className="type-copy px-[12px] py-[9px] text-[var(--text-tertiary)] ">
						No results
					</div>
				</div>
			);
		}

		return (
			<div
				ref={containerRef}
				role="listbox"
				aria-label="Slash commands"
				className="border-width-thin bg-[var(--surface-elevated)]  border-[var(--border-subtle)] rounded-[var(--r-default)] py-[3px] min-w-[200px] max-h-[320px] overflow-y-auto shadow-[var(--shadow-elevated)]"
			>
				{props.items.map((item, index) => (
					<button
						key={item.title}
						type="button"
						role="option"
						aria-selected={index === selectedIndex}
						className={`w-full text-left px-[12px] py-[9px] flex flex-col gap-[3px] cursor-pointer ${
							index === selectedIndex
								? "bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]"
								: "hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]"
						}`}
						onClick={() => selectItem(index)}
						onMouseEnter={() => setSelectedIndex(index)}
					>
						<span className="type-copy text-[var(--text-primary)]  ">{item.title}</span>
						<span className="type-small text-[var(--text-tertiary)]  ">{item.description}</span>
					</button>
				))}
			</div>
		);
	},
);
SlashMenuDropdown.displayName = "SlashMenuDropdown";

// ─── Suggestion extension ─────────────────────────────────────────────────────

/**
 * Build the slash menu TipTap extension (Suggestion-based).
 * Triggers on "/" typed at the start of a block.
 */
export function buildSlashMenuExtension(): Extension {
	return Extension.create({
		name: "slashMenu",

		addOptions() {
			return {};
		},

		addProseMirrorPlugins() {
			return [
				Suggestion({
					editor: this.editor,
					char: "/",
					command: ({
						editor,
						range,
						props,
					}: {
						editor: Editor;
						range: Range;
						props: { command: (props: { editor: Editor; range: Range }) => void };
					}) => {
						props.command({ editor, range });
					},
					items: ({ query }: { query: string }): SlashMenuItem[] => {
						return filterSlashItems(query);
					},
					render: () => {
						let component: ReactRenderer<SlashMenuDropdownRef> | null = null;
						let popup: TippyInstance[] | null = null;

						return {
							onStart: (props: {
								editor: Editor;
								clientRect?: (() => DOMRect | null) | null;
								items: SlashMenuItem[];
								command: (item: SlashMenuItem) => void;
							}) => {
								component = new ReactRenderer(SlashMenuDropdown, {
									props,
									editor: props.editor,
								});

								if (!props.clientRect) return;

								popup = tippy("body", {
									getReferenceClientRect: props.clientRect as () => DOMRect,
									appendTo: () => document.body,
									content: component.element,
									showOnCreate: true,
									interactive: true,
									trigger: "manual",
									placement: "bottom-start",
									animation: false,
								} as Partial<TippyProps>);
							},
							onUpdate: (props: {
								items: SlashMenuItem[];
								command: (item: SlashMenuItem) => void;
								clientRect?: (() => DOMRect | null) | null;
							}) => {
								component?.updateProps(props);
								if (popup?.[0] && props.clientRect) {
									popup[0].setProps({
										getReferenceClientRect: props.clientRect as () => DOMRect,
									});
								}
							},
							onKeyDown: (props: { event: KeyboardEvent }): boolean => {
								if (props.event.key === "Escape") {
									popup?.[0]?.hide();
									return true;
								}
								return component?.ref?.onKeyDown(props) ?? false;
							},
							onExit: () => {
								popup?.[0]?.destroy();
								component?.destroy();
								popup = null;
								component = null;
							},
						};
					},
				}),
			];
		},
	});
}
