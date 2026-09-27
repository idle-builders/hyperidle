/**
 * Q1 §4.4: RecipientPicker component.
 *
 * Inline recipient picker for new DM thread creation. Built on the shared
 * `Combobox` in server-driven mode (options = `useRecipients`' current
 * results, passing `onQueryChange`) — the same pattern `TaskDependencyField`
 * uses for searching tasks.
 *
 * States:
 * - browsing: Combobox (closed trigger + popover search) visible
 * - selected: recipient chosen, message textarea visible
 * - sending: send_message({recipients}) in flight, inputs disabled
 *
 * @lore Q1: This is a page-level composition, not a design-system primitive.
 * It lives in layers/core-ui/src/components/ alongside GlobalSearchPanel.
 *
 * @lore the hand-built listbox (role=listbox rows with an Avatar and a
 * StatusChip each) is gone with the migration to Combobox — each row's
 * avatar and live-session dot now come back through `ComboboxOption.leading`
 * instead of a separate colored pill. The post-pick header (avatar + name +
 * Change) was always untouched.
 */

import { type JSX, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Button, Combobox, Input, LiveDot } from "../ds";
import type { Recipient } from "../hooks/useRecipients.js";
import { useRecipients } from "../hooks/useRecipients.js";
import { call } from "../services/call.js";
import { deriveInitials } from "../utils/initials.js";

export interface RecipientPickerProps {
	onSelect: (recipient: { id: string; kind: "agent" | "user"; name: string }) => void;
	onCancel: () => void;
}

type PickerState = "browsing" | "selected" | "sending";

/** The Combobox row's description line — role and status. The live-session state has its own dot in `leading` instead. */
function recipientDescription(r: Recipient): string {
	return [r.role, r.status].join(" · ");
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
	const messageRef = useRef<HTMLTextAreaElement>(null);

	const { status, recipients, error } = useRecipients(query || undefined);

	// Auto-focus message textarea on recipient selection
	useEffect(() => {
		if (pickerState === "selected") {
			messageRef.current?.focus();
		}
	}, [pickerState]);

	const handleSelectRecipient = useCallback(
		(id: string): void => {
			const recipient = recipients.find((r) => r.id === id);
			if (!recipient) return;
			setSelected(recipient);
			setPickerState("selected");
		},
		[recipients],
	);

	const handleSend = useCallback(async (): Promise<void> => {
		if (!(selected && message.trim())) return;
		setPickerState("sending");
		setSendError(null);

		try {
			const res = await call("send_message", {
				recipients: [selected.id],
				text: message.trim(),
				clientKey: crypto.randomUUID(),
			});
			if (!res.ok) {
				setSendError(res.problems[0]?.message ?? "Failed to start thread");
				setPickerState("selected");
				return;
			}
			onSelect({ id: res.data.thread.id, kind: selected.kind, name: selected.name });
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

	const options = recipients.map((r) => ({
		id: r.id,
		label: r.name,
		description: recipientDescription(r),
		leading: (
			<span className="flex items-center gap-[6px]">
				<Avatar initials={deriveInitials(r.name)} size="sm" className="flex-shrink-0" />
				{r.hasActiveSession && (
					<span role="img" aria-label="Live session">
						<LiveDot />
					</span>
				)}
			</span>
		),
	}));

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: onKeyDown only listens for Escape-to-cancel, bubbled from whichever focusable child has focus — the container itself needs no interactive role.
		<div
			data-testid="recipient-picker"
			className="border-width-thin flex flex-col gap-[9px] p-[12px] bg-[var(--surface-container)] rounded-[var(--r-subtle)]  border-[var(--border-default)]"
			onKeyDown={handleKeyDown}
		>
			{pickerState === "browsing" && (
				<Combobox
					label="Recipient"
					// Opens on mount: before the Combobox migration this was a plain,
					// always-visible search field a person could type into right away.
					// Defaulting to closed would cost that — a click just to start typing.
					defaultOpen
					options={options}
					onChange={handleSelectRecipient}
					onQueryChange={setQuery}
					placeholder="Search agents and users…"
					inputAriaLabel="Search agents and users"
					listAriaLabel="Recipients"
					loading={status === "loading"}
					error={status === "error" ? (error ?? "Failed to load recipients") : null}
					emptyMessage={status === "ready" ? "No recipients found" : undefined}
				/>
			)}

			{(pickerState === "selected" || pickerState === "sending") && selected && (
				<>
					<div className="flex items-center gap-[9px] mb-[6px]">
						{/* Shared Avatar primitive. */}
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
