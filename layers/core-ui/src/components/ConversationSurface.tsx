import { type JSX, type ReactNode, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { ComposerSubmitInput } from "../ds";
import { Avatar as DSAvatar, Composer as DSComposer, PageHeader, Tag } from "../ds";
import { PartList } from "./PartList.js";
import type { OpenHandler, Part } from "./parts";

export interface ConversationSurfaceParticipant {
	readonly id: string;
	readonly name: string;
	readonly isAgent: boolean;
}

export interface ConversationSurfaceHeader {
	readonly title: string;
	readonly hostKind: string;
	readonly hostTitle: string;
	readonly hostRoute: string | null;
}

export interface ConversationSurfaceProps {
	/** The derived render units (page: derivePartsFromMessages(...); story: PARTS fixture). */
	parts: ReadonlyArray<Part>;
	/** The routing seam. page: createOpenHandler(navigate); story: console.info noop. */
	onOpen: OpenHandler;
	/** Thread identity for the header (title + host tag/context). */
	header: ConversationSurfaceHeader;
	/** Participants for the header AvatarGroup (derived from identities). */
	participants: ReadonlyArray<ConversationSurfaceParticipant>;
	/** The send path. page: posts a plain message via the existing endpoint; story: noop. */
	onSend: (text: string) => Promise<void> | void;
	/** Story-only visual toggle (default false; the page never sets this). */
	scroll?: boolean;
	/** Read mode keeps context in the readable lane; pane mode owns split identity. */
	headerPresentation?: "read" | "pane";
	/**
	 * What this conversation produced, rendered at the foot of the message
	 * column. A slot rather than a direct dependency: this component renders a
	 * conversation and does not know how produced items are fetched.
	 */
	produced?: ReactNode;
}

// ───────────────────────────────────────────────────────────────────
// Avatar — human vs agent tint + a stronger agent ring.
// ───────────────────────────────────────────────────────────────────
function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
	return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function Avatar({ who }: { who: ConversationSurfaceParticipant }): JSX.Element {
	return (
		<span aria-hidden="true">
			<DSAvatar initials={initialsOf(who.name)} size="sm" agent={who.isAgent} />
		</span>
	);
}

function ParticipantGroup({
	people,
}: {
	people: ReadonlyArray<ConversationSurfaceParticipant>;
}): JSX.Element {
	return (
		<div data-ds-component="AvatarGroup" className="flex items-center pl-[3px]">
			{people.map((p, i) => (
				<div
					key={p.id}
					className="rounded-[var(--r-pill)] ring-2 ring-[var(--surface-page)]"
					style={{ marginLeft: i === 0 ? 0 : -4, zIndex: people.length - i }}
				>
					<Avatar who={p} />
				</div>
			))}
		</div>
	);
}

function ConversationHeader({
	header,
	participants,
	presentation,
}: {
	header: ConversationSurfaceHeader;
	participants: ReadonlyArray<ConversationSurfaceParticipant>;
	presentation: "read" | "pane";
}): JSX.Element | null {
	const context = (
		<div className="type-metadata flex min-w-0 flex-1 items-center gap-[6px] text-[var(--text-secondary)]">
			<Tag label={header.hostKind} tone="accent" />
			<span className="text-[var(--text-tertiary)]">·</span>
			{header.hostRoute ? (
				<Link
					to={header.hostRoute}
					className="type-control truncate text-[var(--text-primary)] hover:text-[var(--accent-deep)] hover:underline"
				>
					{header.hostTitle}
				</Link>
			) : (
				<span className="type-small truncate text-[var(--text-primary)]">{header.hostTitle}</span>
			)}
		</div>
	);
	const controls = (
		<div className="flex items-center gap-[9px]">
			<ParticipantGroup people={participants} />
			<span className="type-metadata tabular-nums text-[var(--text-tertiary)]">
				{participants.length}
			</span>
		</div>
	);
	if (presentation === "read") {
		/* Read mode: PageHeader above already shows the thread title, kind badge,
		 * and participants would add a full-width band (~30px + horizontal rule)
		 * that costs a great deal to say very little. Nothing here. */
		return null;
	}
	return (
		<PageHeader presentation="pane" title={header.title} leading={context} actions={controls} />
	);
}

// ComposerInputRow and Composer (hand-rolled local composer) removed.

// ───────────────────────────────────────────────────────────────────
// The conversation surface — INTERACTIVE, prop-driven. The conversation column
// (PartList) + composer ONLY; it owns NO viewing surface. The single `onOpen`
// OpenHandler routes references to their owned surfaces (page: navigate; story:
// console noop). `onSend` posts the typed plain message (page: real endpoint).
// ───────────────────────────────────────────────────────────────────
export default function ConversationSurface({
	parts,
	onOpen,
	header,
	participants,
	onSend,
	scroll = false,
	headerPresentation = "pane",
	produced,
}: ConversationSurfaceProps): JSX.Element {
	// scroll=true applies to the page layout only (not the story which renders at natural height).
	const scrollRef = useRef<HTMLDivElement | null>(null);

	const handleDSSubmit = async (input: ComposerSubmitInput): Promise<void> => {
		await onSend(input.text);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: parts reference identity changes on each push; scroll on every update is intentional.
	useEffect(() => {
		if (scroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [parts, scroll]);

	return (
		<div
			data-ds-component="ConversationSurface"
			data-testid="conversation-surface"
			className="type-small w-full bg-[var(--surface-page)] text-[var(--text-primary)]"
			style={{
				display: "flex",
				...(scroll ? { height: "100%", overflow: "hidden" } : {}),
			}}
		>
			<main
				className="flex flex-col bg-[var(--surface-page)]"
				style={{ flex: 1, minWidth: 0, ...(scroll ? { height: "100%" } : {}) }}
			>
				<ConversationHeader
					header={header}
					participants={participants}
					presentation={headerPresentation}
				/>
				<div
					ref={scrollRef}
					className="px-[24px] py-[12px]"
					style={scroll ? { flex: 1, minHeight: 0, overflowY: "auto" } : undefined}
				>
					<div className="mx-auto w-full max-w-[760px]">
						{/* The message column is rendered by the PRODUCTION renderer — the
						    approved design and PartList cannot drift. */}
						<PartList parts={parts} onOpen={onOpen} onAnswer={(text) => void onSend(text)} />
						{/*
						 * What was produced in this conversation, inside the scrolling
						 * column and ABOVE the composer. It belongs with the messages it
						 * came from; rendered after the whole surface it landed under the
						 * composer, which reads as though the conversation continues past
						 * the place you type.
						 */}
						{produced}
					</div>
				</div>
				{/* surface-container + top border lifts the composer strip from the message body;
				    DSComposer's own px-[24px] aligns the input with the message column. */}
				<div className="shrink-0 border-width-thin-t border-[var(--border-subtle)] bg-[var(--surface-container)]">
					<div className="mx-auto w-full max-w-[760px]">
						<DSComposer
							threadId={`${header.hostKind}:${header.hostTitle}`}
							onSubmit={handleDSSubmit}
							placeholder={`Message ${participants
								.slice(0, 2)
								.map((p) => p.name)
								.join(", ")}…`}
							iconSend
						/>
					</div>
				</div>
			</main>
		</div>
	);
}
