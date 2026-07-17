/**
 * Q1 §4.4: RecipientPicker component.
 *
 * Inline recipient picker for new DM thread creation. Assembled from
 * design-system primitives (SearchField, StatusChip, Tag) and DaisyUI.
 *
 * States:
 * - browsing: search field + recipient list visible
 * - selected: recipient chosen, message textarea visible
 * - sending: POST /api/threads in flight, inputs disabled
 *
 * @lore Q1: This is a page-level composition, not a design-system primitive.
 * It lives in packages/web/src/components/ alongside GlobalSearchPanel.
 *
 * @lore AG5: Not folded into Menu (AG5): a searchable entity-directory panel with
 * browse/selected/sending states + composer, not a transient action menu.
 * Uses role=listbox (entity directory), not role=menu (action list) — different
 * ARIA semantics, different interaction model. The no-handrolled-select lint rule
 * does not flag it because it does not use DaisyUI select classes.
 */

import { Avatar, SearchField, StatusChip, Tag } from "@hyperidle/design-system";
import { type JSX, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Recipient } from "../hooks/useRecipients.js";
import { useRecipients } from "../hooks/useRecipients.js";
import { apiFetch } from "../services/api-fetch.js";
import { deriveInitials } from "../utils/initials.js";

export interface RecipientPickerProps {
	onSelect: (recipient: { id: string; kind: "agent" | "user"; name: string }) => void;
	onCancel: () => void;
}

type PickerState = "browsing" | "selected" | "sending";

function getStatusForRecipient(status: string): "healthy" | "paused" | "blocked" | "done" {
	switch (status) {
		case "active":
			return "healthy";
		case "paused":
			return "paused";
		case "retired":
			return "blocked";
		default:
			return "done";
	}
}

/**
 * Recipient picker for starting a new DM thread.
 *
 * @example
 * <RecipientPicker
 *   onSelect={(r) => navigate(`/conversations/${r.id}`)}
 *   onCancel={() => setPickerOpen(false)}
 * />
 */
export function RecipientPicker({ onSelect, onCancel }: RecipientPickerProps): JSX.Element {
	const [pickerState, setPickerState] = useState<PickerState>("browsing");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Recipient | null>(null);
	const [message, setMessage] = useState("");
	const [sendError, setSendError] = useState<string | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const messageRef = useRef<HTMLTextAreaElement>(null);

	const { status, recipients } = useRecipients(query || undefined);

	// Auto-focus search on mount
	useEffect(() => {
		searchRef.current?.focus();
	}, []);

	// Auto-focus message textarea on recipient selection
	useEffect(() => {
		if (pickerState === "selected") {
			messageRef.current?.focus();
		}
	}, [pickerState]);

	const handleSelectRecipient = useCallback((recipient: Recipient): void => {
		setSelected(recipient);
		setPickerState("selected");
	}, []);

	const handleSend = useCallback(async (): Promise<void> => {
		if (!(selected && message.trim())) return;
		setPickerState("sending");
		setSendError(null);

		try {
			const res = await apiFetch("/api/threads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					hostKind: selected.kind,
					hostId: selected.id,
					participants: [selected.id],
					initialMessage: {
						type: "plain",
						payload: { text: message.trim() },
						clientKey: crypto.randomUUID(),
					},
				}),
			});
			if (!res.ok) {
				setSendError(`Failed to create thread (HTTP ${res.status})`);
				setPickerState("selected");
				return;
			}
			const body = (await res.json()) as { thread?: { id: string } };
			if (body.thread?.id) {
				onSelect({ id: body.thread.id, kind: selected.kind, name: selected.name });
			}
		} catch {
			setSendError("Network error");
			setPickerState("selected");
		}
	}, [selected, message, onSelect]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLElement>): void => {
			if (e.key === "Escape") {
				onCancel();
			}
		},
		[onCancel],
	);

	const handleMessageKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>): void => {
			if (e.key === "Escape") {
				onCancel();
				return;
			}
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void handleSend();
			}
		},
		[onCancel, handleSend],
	);

	const filteredRecipients = query
		? recipients.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
		: recipients;

	return (
		<search
			data-testid="recipient-picker"
			className="flex flex-col gap-[9px] p-[12px] bg-[var(--surface-container)] rounded-[var(--r-subtle)] border border-[var(--border-default)]"
			onKeyDown={handleKeyDown}
		>
			{pickerState === "browsing" && (
				<>
					<SearchField
						ref={searchRef}
						placeholder="Search agents and users..."
						value={query}
						onChange={setQuery}
					/>
					<div
						className="flex flex-col gap-[3px] max-h-[320px] overflow-y-auto"
						role="listbox"
						aria-label="Recipients"
					>
						{status === "loading" && (
							<div className="py-[9px] text-center text-[var(--text-tertiary)] text-[13px]">
								Loading...
							</div>
						)}
						{status === "ready" && filteredRecipients.length === 0 && (
							<div className="py-[9px] text-center text-[var(--text-tertiary)] text-[13px]">
								No recipients found
							</div>
						)}
						{status === "ready" &&
							filteredRecipients.map((recipient) => (
								<button
									key={recipient.id}
									type="button"
									role="option"
									aria-selected={false}
									className="flex items-center gap-[9px] px-[9px] py-[6px] rounded-[var(--r-subtle)] text-left cursor-pointer bg-transparent border-none transition-[background] duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] focus:outline-none focus:bg-[var(--surface-container)]"
									onClick={() => handleSelectRecipient(recipient)}
								>
									{/* AI5: shared Avatar primitive (initials now uppercased via deriveInitials). */}
									<Avatar
										initials={deriveInitials(recipient.name)}
										size="sm"
										className="flex-shrink-0"
									/>
									<span className="flex-1 min-w-0">
										<span className="flex items-center gap-[6px]">
											<span className="text-[13px] text-[var(--text-primary)] font-medium truncate">
												{recipient.name}
											</span>
											{recipient.hasActiveSession && (
												<span
													className="inline-flex items-center gap-[3px] px-[6px] py-[3px] rounded-full bg-[color-mix(in_oklab,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)] text-[10px] font-medium uppercase tracking-[0.05em]"
													role="img"
													aria-label="Live session"
												>
													<span className="w-[5px] h-[5px] rounded-full bg-[var(--accent-primary)] animate-pulse" />
													Live
												</span>
											)}
										</span>
										<span className="text-[11px] text-[var(--text-tertiary)]">
											<Tag label={recipient.role} />
										</span>
									</span>
									<StatusChip status={getStatusForRecipient(recipient.status)} />
								</button>
							))}
					</div>
				</>
			)}

			{(pickerState === "selected" || pickerState === "sending") && selected && (
				<>
					<div className="flex items-center gap-[9px] mb-[3px]">
						{/* AI5: shared Avatar primitive. */}
						<Avatar initials={deriveInitials(selected.name)} size="sm" className="flex-shrink-0" />
						<span className="text-[13px] text-[var(--text-primary)] font-medium">
							{selected.name}
						</span>
						<button
							type="button"
							className="ml-auto text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] bg-transparent border-none cursor-pointer"
							onClick={() => {
								setPickerState("browsing");
								setSelected(null);
								setMessage("");
							}}
						>
							Change
						</button>
					</div>
					<textarea
						ref={messageRef}
						className="w-full min-h-[80px] p-[9px] bg-[var(--surface-elevated)] border border-[var(--border-default)] rounded-[var(--r-subtle)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:border-[var(--accent-primary)] transition-[border-color] duration-[var(--motion-fast)]"
						placeholder="Type a message..."
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={handleMessageKeyDown}
						disabled={pickerState === "sending"}
					/>
					{sendError && (
						<p className="text-[12px] text-[var(--status-error)]" role="alert">
							{sendError}
						</p>
					)}
					<div className="flex justify-end gap-[9px]">
						<button
							type="button"
							className="btn btn-sm btn-ghost text-[var(--text-tertiary)]"
							onClick={onCancel}
							disabled={pickerState === "sending"}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-sm btn-primary"
							onClick={() => void handleSend()}
							disabled={pickerState === "sending" || !message.trim()}
						>
							{pickerState === "sending" ? "Sending..." : "Send"}
						</button>
					</div>
				</>
			)}
		</search>
	);
}
