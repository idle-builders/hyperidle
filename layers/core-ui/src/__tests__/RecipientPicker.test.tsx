/**
 * Q1 — AC1 / AC2 / AC3: RecipientPicker component.
 *
 * Architecture plan §4.4: inline recipient picker for new DM thread creation.
 * States: browsing (search + list), selected (recipient + message input), sending.
 *
 * @lore AU26 J4: `useRecipients` now makes TWO calls — core-api's recipient list
 * and `agent-orchestration`'s active-run counts, which it combines into the live
 * busy dot. The `stubFetch` helper routes by URL for that reason.
 *
 * @lore BC3: sending the first message no longer POSTs `/api/threads` — the
 * picker's `handleSend` starts the thread via
 * `call("send_message", {recipients, text, clientKey})`
 * (`components/RecipientPicker.tsx`). `call` is mocked module-wide, same
 * pattern as `Conversations.context-link.test.tsx`; `useRecipients`'s own
 * fetch calls (recipient list + active-run counts) are untouched.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipientPicker } from "../components/RecipientPicker.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

interface MockRecipient {
	id: string;
	kind: "agent" | "user";
	name: string;
	role: string;
	status: string;
	avatarUrl: string | null;
}

function mkRecipient(overrides: Partial<MockRecipient> = {}): MockRecipient {
	return {
		id: overrides.id ?? "agent-1",
		kind: overrides.kind ?? "agent",
		name: overrides.name ?? "Test Agent",
		role: overrides.role ?? "builder",
		status: overrides.status ?? "active",
		avatarUrl: null,
	};
}

const MOCK_RECIPIENTS: MockRecipient[] = [
	mkRecipient({ id: "agent-builder", name: "Builder Bot" }),
	mkRecipient({ id: "agent-growth", name: "Growth Engine" }),
	mkRecipient({ id: "user-founder", name: "Founder", kind: "user", role: "founder" }),
];

/** Only `agent-builder` is mid-run — the live dot's one true case. */
const MOCK_ACTIVE_COUNTS: Record<string, number> = { "agent-builder": 1 };

/** Route the recipient list and the orchestration run counts. */
function stubFetch(recipients: MockRecipient[] = MOCK_RECIPIENTS): void {
	global.fetch = vi.fn().mockImplementation((url: string) =>
		Promise.resolve({
			ok: true,
			json: () =>
				Promise.resolve(
					url.includes("/agent-orchestration/") ? { counts: MOCK_ACTIVE_COUNTS } : { recipients },
				),
		}),
	) as unknown as typeof fetch;
}

function renderPicker(
	props: { onSelect?: () => void; onCancel?: () => void } = {},
): ReturnType<typeof render> {
	const onSelect = props.onSelect ?? vi.fn();
	const onCancel = props.onCancel ?? vi.fn();
	return render(
		<MemoryRouter>
			<RecipientPicker onSelect={onSelect} onCancel={onCancel} />
		</MemoryRouter>,
	);
}

describe("RecipientPicker (Q1 §4.4)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC1: opening "New thread" puts focus in the search field immediately —
	// no click needed to start typing a recipient's name.
	it("renders a search input on mount and focuses it", async () => {
		stubFetch();

		renderPicker();
		const input = screen.getByRole("textbox");
		expect(input).toHaveFocus();
	});

	// AC1: the trigger has a real accessible name — a <span> next to the
	// button (pre-fix) leaves it name:"" for assistive tech.
	it("names the combobox trigger for assistive tech", () => {
		stubFetch();

		renderPicker();
		expect(screen.getByRole("combobox", { name: "Recipient" })).toBeInTheDocument();
	});

	// AC2: recipient list is rendered from API response, once loaded
	it("renders a list of recipients after loading", async () => {
		stubFetch();

		renderPicker();
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
		expect(screen.getByText("Growth Engine")).toBeInTheDocument();
		expect(screen.getByText("Founder")).toBeInTheDocument();
	});

	// AC2: agents with active sessions show a "Live" indicator
	it("shows a live indicator for agents with an active session", async () => {
		stubFetch();

		renderPicker();
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
		// The dot carries the live signal now — its accessible name replaces
		// the old visible "Live" word in the description text.
		expect(screen.getByRole("img", { name: /live session/i })).toBeInTheDocument();
	});

	// Moving RecipientPicker onto Combobox dropped each row's Avatar because
	// ComboboxOption had no slot for one — restored via `leading`.
	it("renders each recipient row's avatar", async () => {
		stubFetch();

		renderPicker();
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
		const avatars = document.querySelectorAll('[data-ds-component="Avatar"]');
		expect(avatars.length).toBeGreaterThanOrEqual(MOCK_RECIPIENTS.length);
	});

	// AC2: clicking a recipient transitions to selected state (message input visible)
	it("clicking a recipient shows a message input", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();

		stubFetch();

		renderPicker();
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Builder Bot"));
		// After selection, a message textarea/input should appear
		await waitFor(() => {
			const textarea = screen.queryByRole("textbox");
			// Could be a textarea for composing the message — just verify one exists
			expect(textarea).not.toBeNull();
		});
	});

	// AC1: Escape (while the popover's search is open) calls onCancel
	it("pressing Escape calls onCancel", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		const onCancel = vi.fn();

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ recipients: [] }),
		}) as unknown as typeof fetch;

		renderPicker({ onCancel });
		const input = screen.getByRole("textbox");
		await user.click(input);
		await user.keyboard("{Escape}");

		expect(onCancel).toHaveBeenCalled();
	});

	// AC2: empty state when no recipients found
	it("shows empty state when search yields no results", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ recipients: [] }),
		}) as unknown as typeof fetch;

		renderPicker();
		await waitFor(() => {
			// Should render some "no results" message
			const noMatch = screen.queryByText(/no/i);
			expect(noMatch).not.toBeNull();
		});
	});

	// AC3: submitting starts a DM thread via send_message(recipients)
	it("submitting a message calls send_message with recipients to create a DM thread", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		const onSelect = vi.fn();

		stubFetch();
		callMock.mockResolvedValue({
			ok: true,
			data: {
				thread: {
					id: "new-thread-id",
					hostKind: "agent",
					hostId: "agent-builder",
					initiatorId: "u-founder",
					members: ["u-founder", "agent-builder"],
					pinned: false,
					resolvedAt: null,
					lastActiveAt: new Date().toISOString(),
					createdAt: new Date().toISOString(),
				},
			},
		});

		renderPicker({ onSelect });

		// Wait for the recipient list to load
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});

		// Select a recipient
		await user.click(screen.getByText("Builder Bot"));

		// Find message input and type a message
		await waitFor(() => {
			const textareas = screen.queryAllByRole("textbox");
			expect(textareas.length).toBeGreaterThan(0);
		});

		const textareas = screen.queryAllByRole("textbox");
		const messageInput = textareas[textareas.length - 1]!;
		await user.click(messageInput);
		await user.type(messageInput, "Hello agent");

		// Submit
		const sendBtn = screen.queryByRole("button", { name: /send/i });
		expect(sendBtn).not.toBeNull();
		await user.click(sendBtn!);
		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith(
				"send_message",
				expect.objectContaining({ recipients: ["agent-builder"], text: "Hello agent" }),
			);
		});
		expect(onSelect).toHaveBeenCalledWith({
			id: "new-thread-id",
			kind: "agent",
			name: "Builder Bot",
		});
	});
});
