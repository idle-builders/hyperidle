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
 * It lives in layers/core-ui/src/components/ alongside GlobalSearchPanel.
 *
 * @lore AG5: Not folded into Menu (AG5): a searchable entity-directory panel with
 * browse/selected/sending states + composer, not a transient action menu.
 * Uses role=listbox (entity directory), not role=menu (action list) — different
 * ARIA semantics, different interaction model. The no-handrolled-control lint
 * rule does not flag it because it does not use DaisyUI control classes.
 */

import { Avatar, Button, Input, SearchField, StatusChip, Tag } from "@hyperidle/design-system";
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
		// @lore AZ7 B2 (review round 1): Input's textarea mode types onKeyDown for
		// HTMLInputElement (InputProps extends InputHTMLAttributes — see
		// Input.tsx's own docblock on the textarea-mode cast). This handler only
		// reads key/shiftKey/preventDefault, none of which are element-specific,
		// so widening the param type to the union is a genuine type, not a cast.
		(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
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
		<div
			data-testid="recipient-picker"
			className="border-width-thin flex flex-col gap-[9px] p-[12px] bg-[var(--surface-container)] rounded-[var(--r-subtle)]  border-[var(--border-default)]"
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
							<div className="type-small py-[8px] text-center text-[var(--text-tertiary)] ">
								Loading...
							</div>
						)}
						{status === "ready" && filteredRecipients.length === 0 && (
							<div className="type-small py-[8px] text-center text-[var(--text-tertiary)] ">
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
									className="flex items-center gap-[9px] px-[8px] py-[6px] rounded-[var(--r-subtle)] text-left cursor-pointer bg-transparent border-none   hover:bg-[var(--surface-container)] focus:outline-none focus:bg-[var(--surface-container)]"
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
											<span className="type-small  text-[var(--text-primary)]  truncate">
												{recipient.name}
											</span>
											{recipient.hasActiveSession && (
												<span
													data-spacing-role="compact-pill"
													className="type-label inline-flex items-center gap-[4px] px-[6px] py-[1px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--accent-primary)_14%,transparent)] text-[var(--accent-deep)]   uppercase "
													aria-label="Live session"
												>
													<span className="motion-activity w-[5px] h-[5px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] " />
													Live
												</span>
											)}
										</span>
										<span className="type-metadata  text-[var(--text-tertiary)]">
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
					<div className="flex items-center gap-[9px] mb-[6px]">
						{/* AI5: shared Avatar primitive. */}
						<Avatar initials={deriveInitials(selected.name)} size="sm" className="flex-shrink-0" />
						<span className="type-small  text-[var(--text-primary)] ">{selected.name}</span>
						<button
							type="button"
							className="type-control ml-auto  text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] bg-transparent border-none cursor-pointer"
							onClick={() => {
								setPickerState("browsing");
								setSelected(null);
								setMessage("");
							}}
						>
							Change
						</button>
					</div>
					{/*
					 * @lore AZ7 B2 (review round 1): was a hand-rolled <textarea>
					 * already on token-legal fill/border but reproducing Input's own
					 * textarea-mode recipe by hand. Migrated to Input's textarea mode.
					 */}
					<Input
						ref={messageRef}
						textarea
						className="w-full"
						placeholder="Type a message..."
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={handleMessageKeyDown}
						disabled={pickerState === "sending"}
					/>
					{sendError && (
						<p className="type-metadata  text-[var(--status-error)]" role="alert">
							{sendError}
						</p>
					)}
					<div className="flex justify-end gap-[9px]">
						<Button
							variant="ghost"
							size="sm"
							onClick={onCancel}
							disabled={pickerState === "sending"}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							onClick={() => void handleSend()}
							disabled={pickerState === "sending" || !message.trim()}
						>
							{pickerState === "sending" ? "Sending..." : "Send"}
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
