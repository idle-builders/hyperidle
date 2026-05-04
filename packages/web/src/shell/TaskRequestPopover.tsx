/**
 * L15 — TaskRequestPopover.
 *
 * DaisyUI dropdown anchored to a "Request ▾" trigger. Lists the verbs
 * returned by `requestableVerbsFor(task.state)`. Sending posts a `plain`
 * message to the task's L1 thread (creates the thread on the first send
 * when `threadId` is null).
 *
 * @lore L15: lives in `packages/web/src/shell/` because it composes
 * DaisyUI primitives directly per the no-wrapping rule. Not a Tier 3
 * component — it's a page-internal composition bound to the team-board
 * concern.
 */
import {
	formatRequestMessageBody,
	type RequestVerb,
	requestableVerbsFor,
	type TaskState,
	verbDisplayLabel,
} from "@hyperidle/shared";
import { type JSX, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

export interface TaskRequestPopoverTask {
	id: string;
	state: TaskState;
	ownerAgentId: string;
}

export interface TaskRequestPopoverProps {
	task: TaskRequestPopoverTask;
	founderId: string;
	founderName: string;
	/** Server-confirmed thread id when one exists; null when the first send must create it. */
	threadId: string | null;
	/**
	 * Callback after the server confirms 201/200. Parent uses this to (a)
	 * cache the resolved threadId for next time and (b) bump the chip count
	 * optimistically by +1. The popover does NOT re-fetch a fresh count.
	 */
	onSent: (result: { threadId: string }) => void;
}

interface PostSuccess {
	threadId: string;
}

async function postRequest(args: {
	task: TaskRequestPopoverTask;
	founderId: string;
	founderName: string;
	threadId: string | null;
	verb: RequestVerb;
	note: string;
	clientKey: string;
}): Promise<PostSuccess> {
	const text = formatRequestMessageBody({
		actorName: args.founderName,
		verb: args.verb,
		note: args.note,
	});
	if (args.threadId === null) {
		const res = await fetch("/api/threads", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				hostKind: "task",
				hostId: args.task.id,
				participants: [args.founderId, args.task.ownerAgentId],
				initialMessage: {
					type: "plain",
					payload: { text },
					clientKey: args.clientKey,
				},
			}),
		});
		if (!res.ok) {
			throw new Error(`thread create failed: ${res.status}`);
		}
		const body = (await res.json()) as { thread: { id: string } };
		return { threadId: body.thread.id };
	}
	const res = await fetch(`/api/threads/${args.threadId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			type: "plain",
			payload: { text },
			clientKey: args.clientKey,
		}),
	});
	if (!res.ok) {
		throw new Error(`message append failed: ${res.status}`);
	}
	return { threadId: args.threadId };
}

export function TaskRequestPopover(props: TaskRequestPopoverProps): JSX.Element | null {
	const verbs = requestableVerbsFor(props.task.state);
	const [open, setOpen] = useState(false);
	const [selectedVerb, setSelectedVerb] = useState<RequestVerb | null>(null);
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const textareaId = useId();
	/*
	 * @lore L15 review (apply A): clientKey is the server-side dedupe key for
	 * `(threadId, sender, clientKey)`. It MUST stay STABLE across retries of
	 * the SAME logical send so that a second click after a transient 5xx
	 * de-duplicates instead of double-posting. We mint it once per popover-
	 * open cycle and rotate ONLY after a successful send (`reset()`) or when
	 * the popover closes. Fresh-on-mount because `useRef(crypto.randomUUID())`
	 * survives re-renders inside the same mount.
	 */
	const clientKeyRef = useRef<string>(crypto.randomUUID());

	function rotateClientKey(): void {
		clientKeyRef.current = crypto.randomUUID();
	}

	function reset(): void {
		setSelectedVerb(null);
		setNote("");
		setError(null);
		setSending(false);
		rotateClientKey();
	}

	function close(): void {
		setOpen(false);
		reset();
		triggerRef.current?.focus();
	}

	// L15 review (apply B): Esc cancels + closes; click-outside closes.
	// Restores focus to the trigger via close().
	// biome-ignore lint/correctness/useExhaustiveDependencies: close is intentionally captured by closure — it only touches refs + React-stable setters, so it never observes stale state. Listing it would force a useCallback dance with no semantic gain.
	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: globalThis.KeyboardEvent): void {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		}
		function onPointerDown(event: MouseEvent): void {
			const target = event.target as Node | null;
			if (!target) return;
			if (dialogRef.current?.contains(target)) return;
			if (triggerRef.current?.contains(target)) return;
			close();
		}
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("mousedown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("mousedown", onPointerDown);
		};
	}, [open]);

	if (verbs.length === 0) {
		return null;
	}

	async function handleSend(): Promise<void> {
		if (!selectedVerb || sending) return;
		setSending(true);
		setError(null);
		try {
			const result = await postRequest({
				task: props.task,
				founderId: props.founderId,
				founderName: props.founderName,
				threadId: props.threadId,
				verb: selectedVerb,
				note,
				clientKey: clientKeyRef.current,
			});
			props.onSent({ threadId: result.threadId });
			setOpen(false);
			reset();
			triggerRef.current?.focus();
		} catch {
			setError("Couldn't post — try again");
			setSending(false);
			// Intentionally do NOT rotate clientKey here — retries must reuse
			// the same key so the server's `(threadId, sender, clientKey)`
			// uniqueness collapses duplicates.
		}
	}

	function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void handleSend();
		}
	}

	return (
		<div className="dropdown dropdown-end">
			<button
				ref={triggerRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				className="btn btn-ghost btn-xs text-[12px] font-medium text-[var(--text-mid)] hover:text-[var(--text-hi)]"
				style={{ minHeight: 44, minWidth: 44 }}
				onClick={() => setOpen((v) => !v)}
			>
				Request <span aria-hidden="true">▾</span>
			</button>
			{open ? (
				<div
					ref={dialogRef}
					role="dialog"
					aria-label="Request state change"
					className="dropdown-content z-50 mt-[4px] w-[240px] bg-[var(--surface-2)] rounded-[var(--r2)] border border-[var(--border-default)] shadow-[var(--float)] p-[8px] flex flex-col gap-[8px]"
				>
					<span className="text-[11px] font-heading uppercase tracking-wider text-[var(--text-lo)]">
						Request from {props.founderName}
					</span>
					<div className="flex flex-col gap-[2px]">
						{verbs.map((verb) => {
							const isSelected = selectedVerb === verb;
							const isKill = verb === "kill";
							return (
								<button
									key={verb}
									type="button"
									className={`btn btn-ghost btn-sm justify-start text-[13px] ${isKill ? "text-[var(--danger)]" : ""} ${isSelected ? "bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]" : ""}`}
									onClick={() => setSelectedVerb(verb)}
								>
									{verbDisplayLabel(verb)}
								</button>
							);
						})}
					</div>
					<label
						htmlFor={textareaId}
						className="text-[11px] font-heading uppercase tracking-wider text-[var(--text-lo)]"
					>
						Note (optional)
					</label>
					<textarea
						id={textareaId}
						className="textarea textarea-bordered text-[13px] min-h-[56px]"
						value={note}
						onChange={(e) => setNote(e.target.value)}
						onKeyDown={handleTextareaKeyDown}
						maxLength={280}
					/>
					{error ? (
						<div role="alert" className="text-[12px] text-[var(--danger)]">
							{error}
						</div>
					) : null}
					<div className="flex justify-end gap-[8px]">
						<button type="button" className="btn btn-ghost btn-sm" onClick={close}>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary btn-sm"
							disabled={!selectedVerb || sending}
							onClick={() => {
								void handleSend();
							}}
						>
							{sending ? "Saving…" : "Send"}
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
