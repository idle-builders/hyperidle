/**
 * AM3 — SessionView: the production session view.
 *
 * A streaming human+agent conversation read through the SHARED `PartList` /
 * `ConversationSurface` — a session is a slightly different FORM of conversation.
 * No parallel renderer (AM3 hard-rule). No duplicated diff renderer (reuses
 * `ReviewCodeDiff` via the `diff` Embed's `OpenTarget`).
 *
 * Architecture:
 *   - `derivePartsFromSession(entries, agent)` → `Part[]` (shared adapter)
 *   - `PartList` over the derived `Part[]` (shared source-agnostic renderer)
 *   - `createOpenHandler` + `onOpenSession` callback (sub-agent recursion, task j)
 *   - Descriptor pills from `HarnessCapabilityDescriptor` (no per-backend branch)
 *   - Queued message: pre-Part FIFO state; renders right-aligned like delivered human turn
 *
 * Composer: REUSES the ConversationSurface's exact container treatment
 * (`rounded border bg-surface-elevated shadow`, outer `px-[18px] pb-[18px] pt-[9px]`).
 * Adds descriptor pills + working/queue/Stop state.
 *
 * @lore AM3: The story (`SessionView.stories.tsx`) uses fixture atoms from
 * `sessionContentFixtures.tsx` so it renders stand-alone in the viewer.
 * This production component renders through the REAL shared `PartList` and
 * the REAL `derivePartsFromSession` adapter — the fixture is the byte-for-byte
 * design target; the production view is the mechanical collapse onto shared
 * components (see approved.md §3).
 */

import type {
	ActivityEntry,
	HarnessCapabilityDescriptor,
	OpenHandler,
	PartAuthor,
} from "@hyperidle/shared";
import { deriveComposerPills, derivePartsFromSession } from "@hyperidle/shared";
import { type JSX, useRef, useState } from "react";
import { PartList } from "./PartList.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface SessionViewIdentity {
	/** The session-level agent (feeds PartAuthor on tool/reasoning Parts). */
	readonly agent: PartAuthor;
	/** The viewer / human participant. */
	readonly viewer: PartAuthor;
	/** Session title (the task description). */
	readonly title: string;
	/** Host label (e.g. "Bet · Agent chat reliability"). */
	readonly host: string;
}

export interface SessionViewCost {
	/** Combined session-total cost string (e.g. "$0.71"). */
	readonly costLabel: string;
	/** Combined session-total token string (e.g. "48.2k tokens"). */
	readonly tokensLabel: string;
}

export interface QueuedMessage {
	readonly id: string;
	readonly text: string;
	readonly author: PartAuthor;
}

export interface SessionViewProps {
	/** The normalized activity entries from `useSessionActivity`. */
	readonly entries: ReadonlyArray<ActivityEntry>;
	/** Session identity (agent, viewer, title, host). */
	readonly identity: SessionViewIdentity;
	/** Session-total cost for the header (undefined while not yet available). */
	readonly cost?: SessionViewCost;
	/** The harness capability descriptor (drives the composer pills). */
	readonly descriptor?: HarnessCapabilityDescriptor;
	/** "connecting" | "streaming" | "ended" | "error" */
	readonly status: "connecting" | "streaming" | "ended" | "error";
	/** The open handler seam (host/artifact/review/session routes). */
	readonly onOpen: OpenHandler;
	/** Called when the user sends a message (idle state). */
	readonly onSend: (text: string) => void;
	/** Called when the user clicks Stop (streaming state). */
	readonly onStop?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function initialsOf(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
	const first = words[0] ?? "";
	const last = words[words.length - 1] ?? "";
	return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

function SessionAvatar({ who, size = 26 }: { who: PartAuthor; size?: number }): JSX.Element {
	const tint = who.isAgent
		? "bg-[var(--accent-primary-dim)] border-[var(--accent-primary)] text-[var(--accent-primary)]"
		: "bg-[var(--surface-container)] border-[var(--border-default)] text-[var(--text-secondary)]";
	return (
		<div
			aria-hidden="true"
			className={`inline-flex items-center justify-center rounded-full border-[1.5px] font-[600] shrink-0 ${tint}`}
			style={{ width: size, height: size, fontSize: size <= 22 ? 10 : 12 }}
		>
			{initialsOf(who.name)}
		</div>
	);
}

function ParticipantGroup({ people }: { people: readonly PartAuthor[] }): JSX.Element {
	return (
		<div className="flex items-center pl-[3px]">
			{people.map((p, i) => (
				<div
					key={p.id}
					className="rounded-full ring-2 ring-[var(--surface-page)]"
					style={{ marginLeft: i === 0 ? 0 : -9, zIndex: people.length - i }}
				>
					<SessionAvatar who={p} size={26} />
				</div>
			))}
		</div>
	);
}

/**
 * Queued bubble — RIGHT-ALIGNED, muted, clock, "sends when the agent finishes" + ✕.
 * Follows the unified self/other pattern (isMe = right-bound grey box).
 */
function QueuedBubble({
	msg,
	onCancel,
}: {
	msg: QueuedMessage;
	onCancel: () => void;
}): JSX.Element {
	return (
		<div data-ds-component="QueuedRow" className="flex flex-col items-end opacity-70">
			<div className="flex max-w-[80%] flex-col gap-[9px]">
				<div className="flex items-center gap-[9px]">
					<SessionAvatar who={msg.author} size={26} />
					<span className="text-[13px] font-[600] text-[var(--text-secondary)]">
						{msg.author.name}
					</span>
					<span className="inline-flex items-center gap-[4px] text-[11px] text-[var(--text-tertiary)]">
						<svg
							viewBox="0 0 16 16"
							className="h-[11px] w-[11px] shrink-0"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.3"
							aria-hidden="true"
						>
							<circle cx="8" cy="8" r="6" />
							<path d="M8 5v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
						Queued · sends when the agent finishes
					</span>
					<button
						type="button"
						onClick={onCancel}
						aria-label="Remove queued message"
						className="shrink-0 rounded-[var(--r-subtle)] p-[3px] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
					>
						<svg
							viewBox="0 0 12 12"
							className="h-[10px] w-[10px]"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							aria-hidden="true"
						>
							<path d="M3 3 L9 9 M9 3 L3 9" strokeLinecap="round" />
						</svg>
					</button>
				</div>
				<div className="rounded-[var(--r-default)] bg-[var(--surface-container)] px-[12px] py-[9px]">
					<p className="m-0 text-[15px] leading-[1.55] text-[var(--text-secondary)]">{msg.text}</p>
				</div>
			</div>
		</div>
	);
}

const ICON_PLUS = "M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25V2z";
const ICON_SEND = "M2 8l12-6-5.2 12-1.8-4.8L2 8z";

function ComposerGlyph({ d, size = 14 }: { d: string; size?: number }): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			className="shrink-0"
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			<path d={d} />
		</svg>
	);
}

function SessionComposer({
	descriptor,
	selectedModelId: initialModelId,
	running,
	elapsedSecs,
	onSend,
	onStop,
}: {
	descriptor?: HarnessCapabilityDescriptor;
	selectedModelId: string;
	running: boolean;
	elapsedSecs: number;
	onSend: (text: string) => void;
	onStop?: () => void;
}): JSX.Element {
	const [text, setText] = useState("");
	const [selectedModelId, setSelectedModelId] = useState(initialModelId);
	// Per-option toggle state (boolean) or selected-choice state (select).
	const [optionValues, setOptionValues] = useState<Record<string, string | boolean>>({});
	const pills = descriptor ? deriveComposerPills(descriptor, selectedModelId) : [];

	/** Cycle to the next model in the descriptor list. */
	const handleModelCycle = (): void => {
		if (!descriptor) return;
		const ids = descriptor.models.map((m) => m.id);
		const idx = ids.indexOf(selectedModelId);
		setSelectedModelId(ids[(idx + 1) % ids.length] ?? selectedModelId);
	};

	const handleSend = (): void => {
		const trimmed = text.trim();
		if (trimmed) {
			onSend(trimmed);
			setText("");
		}
	};

	const elapsedLabel = elapsedSecs > 0 ? `Working for ${elapsedSecs}s` : "Working…";

	return (
		<div
			data-ds-component="SessionComposer"
			className="rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] transition-shadow duration-[var(--motion-fast)] focus-within:shadow-[var(--shadow-default)]"
		>
			<div className="flex items-end gap-[9px] px-[12px] py-[9px]">
				{/* eslint-disable-next-line design/no-op-button -- Insert opens an attachment picker; AM3 scope covers the shell only, action is a future affordance */}
				<button
					type="button"
					aria-label="Insert"
					aria-haspopup="menu"
					className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] border border-[var(--border-default)] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
				>
					<ComposerGlyph d={ICON_PLUS} size={14} />
				</button>
				<textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSend();
						}
					}}
					rows={2}
					placeholder={
						running
							? "Type to queue a message — it sends when the agent finishes"
							: "Send a message…"
					}
					className="min-h-[48px] flex-1 resize-none border-none bg-transparent py-[3px] text-[15px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
				/>
				{running ? (
					<button
						type="button"
						aria-label="Stop the agent"
						onClick={onStop}
						className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--status-error)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--status-error-hover)]"
					>
						<span className="h-[10px] w-[10px] rounded-[2px] bg-current" />
					</button>
				) : (
					<button
						type="button"
						aria-label="Send message"
						onClick={handleSend}
						className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]"
					>
						<ComposerGlyph d={ICON_SEND} size={15} />
					</button>
				)}
			</div>

			{/* descriptor pill row — model · per-model options + working state */}
			<div className="flex items-center gap-[3px] border-t border-[var(--border-subtle)] px-[9px] py-[6px]">
				{descriptor && (
					<>
						<button
							type="button"
							onClick={handleModelCycle}
							className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
						>
							{descriptor.models.find((m) => m.id === selectedModelId)?.label ?? selectedModelId}
						</button>
						{pills.length > 0 && <span className="h-[16px] w-px bg-[var(--border-subtle)]" />}
						{pills.map((opt) => {
							if (opt.control.kind === "select") {
								const choices = opt.control.choices;
								const current = optionValues[opt.key] as string | undefined;
								const currentIdx = choices.findIndex((c) => c.value === current);
								const displayLabel =
									choices.find((c) => c.value === current)?.label ?? choices[0]?.label ?? opt.label;
								return (
									<button
										key={opt.key}
										type="button"
										data-ds-control="select"
										onClick={() => {
											const next = choices[(currentIdx + 1) % choices.length];
											if (next) {
												setOptionValues((prev) => ({ ...prev, [opt.key]: next.value }));
											}
										}}
										className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
									>
										{displayLabel}
									</button>
								);
							}
							if (opt.control.kind === "boolean") {
								const on = optionValues[opt.key] === true;
								return (
									<button
										key={opt.key}
										type="button"
										data-ds-control="boolean"
										onClick={() => {
											setOptionValues((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }));
										}}
										className={`inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)] ${on ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}
									>
										{opt.label}
									</button>
								);
							}
							return null;
						})}
					</>
				)}
				<span className="flex-1" />
				{running && (
					<>
						<span className="mr-[3px] inline-flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
							<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
							{elapsedLabel}
						</span>
						<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)]">
							Queues while working
						</span>
					</>
				)}
			</div>
		</div>
	);
}

// ── SessionView (production) ─────────────────────────────────────────

/**
 * The production session view — renders through the SAME shared `PartList`
 * as the conversation, fed via `derivePartsFromSession`. No parallel renderer.
 */
export function SessionView({
	entries,
	identity,
	cost,
	descriptor,
	status,
	onOpen,
	onSend,
	onStop,
}: SessionViewProps): JSX.Element {
	const parts = derivePartsFromSession(entries, identity.agent);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
	const [elapsedSecs] = useState(0);

	const running = status === "streaming";

	// Use the first model id from the descriptor as default
	const defaultModelId = descriptor?.models[0]?.id ?? "";

	const handleSend = (text: string): void => {
		if (running) {
			// Queue the message — non-interrupting (concept Phase 4 queue contract)
			const queuedMsg: QueuedMessage = {
				id: `q-${Date.now()}`,
				text,
				author: identity.viewer,
			};
			setQueuedMessages((prev) => [...prev, queuedMsg]);
		} else {
			onSend(text);
		}
	};

	const handleCancelQueued = (id: string): void => {
		setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
	};

	// The session-total cost displayed in the header (combined total, not per-turn)
	const costDisplay = cost ? `${cost.costLabel} · ${cost.tokensLabel}` : null;

	return (
		<div
			data-ds-component="SessionView"
			className="flex h-full w-full flex-col bg-[var(--surface-page)]"
			style={{ fontFamily: "var(--font-sans)" }}
		>
			{/* header — minimal session identity + combined session-total cost */}
			<header className="flex shrink-0 items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
				<div className="mx-auto flex w-full max-w-[760px] items-center gap-[12px]">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-[6px] text-[12px] text-[var(--text-secondary)]">
							<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
								{running && (
									<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
								)}
								Session
							</span>
							<span className="text-[var(--text-tertiary)]">·</span>
							<span className="truncate font-[500] text-[var(--text-primary)]">
								{identity.host}
							</span>
						</div>
						<h1 className="mt-[3px] mb-0 text-[17px] font-[600] leading-[1.25] text-[var(--text-primary)]">
							{identity.title}
						</h1>
					</div>
					{/* combined SESSION-TOTAL cost in the header (aspect g) */}
					{costDisplay && (
						<div className="flex shrink-0 items-center gap-[6px] font-mono tabular-nums text-[11px] text-[var(--text-tertiary)]">
							<span className="text-[var(--text-secondary)]">{cost?.costLabel}</span>
							<span>·</span>
							<span>{cost?.tokensLabel}</span>
						</div>
					)}
					<span className="h-[20px] w-px bg-[var(--border-subtle)]" />
					<ParticipantGroup people={[identity.agent, identity.viewer]} />
				</div>
			</header>

			{/* reading column */}
			<div className="relative flex-1 overflow-hidden" ref={scrollRef}>
				<div className="h-full overflow-y-auto">
					<div className="mx-auto flex max-w-[760px] flex-col gap-[12px] px-[24px] py-[18px]">
						{/* shared PartList over derivePartsFromSession — NO parallel renderer */}
						<PartList parts={parts} onOpen={onOpen} />

						{/* queued messages — right-aligned, muted, cancellable */}
						{queuedMessages.map((q) => (
							<QueuedBubble key={q.id} msg={q} onCancel={() => handleCancelQueued(q.id)} />
						))}
					</div>
				</div>
			</div>

			{/* composer — conversation's EXACT container treatment + descriptor pills */}
			<div className="shrink-0 bg-[var(--surface-page)] px-[18px] pb-[18px] pt-[9px]">
				<div className="mx-auto w-full max-w-[760px]">
					<SessionComposer
						descriptor={descriptor}
						selectedModelId={defaultModelId}
						running={running}
						elapsedSecs={elapsedSecs}
						onSend={handleSend}
						onStop={onStop}
					/>
				</div>
			</div>
		</div>
	);
}
