/**
 * RecipientPicker component.
 *
 * Architecture plan §4.4: inline recipient picker for new DM thread creation.
 * States: browsing (search + list), selected (recipient + message input), sending.
 *
 * @lore: `useRecipients` combines the recipient list with a live busy dot.
 *
 * @lore: the recipient list itself is now `call("search_users", { status: "active", name? })` — the door swap replacing `apiFetch("/api/recipients")`. `search_sessions` (the live busy dot) and `send_message` (starting the DM thread) already rode `call`. All three now go through the one module-wide `call` mock, routed by action name.
 *
 * @lore: sending the first message POSTs no route — the picker's `handleSend` starts the thread via `call("send_message", {recipients, text, clientKey})` (`components/RecipientPicker.tsx`).
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipientPicker } from "../components/RecipientPicker.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

interface MockUserRow {
	id: string;
	kind: "human" | "ai";
	name: string;
	role: string;
	status: string;
	avatarUrl: string | null;
}

function mkUserRow(overrides: Partial<MockUserRow> = {}): MockUserRow {
	return {
		id: overrides.id ?? "agent-1",
		kind: overrides.kind ?? "ai",
		name: overrides.name ?? "Test Agent",
		role: overrides.role ?? "builder",
		status: overrides.status ?? "active",
		avatarUrl: null,
	};
}

const MOCK_USERS: MockUserRow[] = [
	mkUserRow({ id: "agent-builder", name: "Builder Bot" }),
	mkUserRow({ id: "agent-growth", name: "Growth Engine" }),
	mkUserRow({ id: "user-founder", name: "Founder", kind: "human", role: "founder" }),
];

/** Only `agent-builder` is mid-run — the live dot's one true case. */
const ACTIVE_AGENT_IDS: readonly string[] = ["agent-builder"];

/**
 * Route every `call()` the picker makes by action name: `search_users` (the
 * recipient list), `search_sessions` (the live busy dot), `send_message`
 * (starting the DM thread — configurable per test via `sendResult`).
 */
function stubCall(
	options: { users?: MockUserRow[]; activeAgentIds?: readonly string[]; sendResult?: unknown } = {},
): void {
	const { users = MOCK_USERS, activeAgentIds = ACTIVE_AGENT_IDS, sendResult } = options;
	callMock.mockImplementation((name: string) => {
		if (name === "search_sessions") {
			return Promise.resolve({
				ok: true,
				data: activeAgentIds.map((agentId) => ({ id: `session-${agentId}`, agentId })),
			});
		}
		if (name === "search_users") {
			return Promise.resolve({ ok: true, data: users });
		}
		if (name === "send_message" && sendResult !== undefined) {
			return Promise.resolve(sendResult);
		}
		return Promise.resolve({
			ok: false,
			problems: [
				{
					code: "unmocked_call",
					message: `RecipientPicker.test.tsx does not mock call("${name}")`,
				},
			],
		});
	});
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

describe("RecipientPicker", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// opening "New thread" puts focus in the search field immediately —
	// no click needed to start typing a recipient's name.
	it("renders a search input on mount and focuses it", async () => {
		stubCall();

		renderPicker();
		const input = screen.getByRole("textbox");
		expect(input).toHaveFocus();
	});

	// the trigger has a real accessible name — a <span> next to the
	// button (pre-fix) leaves it name:"" for assistive tech.
	it("names the combobox trigger for assistive tech", () => {
		stubCall();

		renderPicker();
		expect(screen.getByRole("combobox", { name: "Recipient" })).toBeInTheDocument();
	});

	// recipient list is rendered from search_users, once loaded
	it("renders a list of recipients after loading", async () => {
		stubCall();

		renderPicker();
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
		expect(screen.getByText("Growth Engine")).toBeInTheDocument();
		expect(screen.getByText("Founder")).toBeInTheDocument();
	});

	// agents with active sessions show a "Live" indicator
	it("shows a live indicator for agents with an active session", async () => {
		stubCall();

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
		stubCall();

		renderPicker();
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
		const avatars = document.querySelectorAll('[data-ds-component="Avatar"]');
		expect(avatars.length).toBeGreaterThanOrEqual(MOCK_USERS.length);
	});

	// clicking a recipient transitions to selected state (message input visible)
	it("clicking a recipient shows a message input", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();

		stubCall();

		renderPicker();
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Builder Bot"));
		// After selection, a message textarea/input should appear
		await waitFor(() => {
			const textarea = screen.queryByRole("textbox");
			// Could be a textarea for composing the message — just verify one exists
			expect(textarea).toBeInTheDocument();
		});
	});

	// Escape (while the popover's search is open) calls onCancel
	it("pressing Escape calls onCancel", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		const onCancel = vi.fn();

		stubCall({ users: [] });

		renderPicker({ onCancel });
		const input = screen.getByRole("textbox");
		await user.click(input);
		await user.keyboard("{Escape}");

		expect(onCancel).toHaveBeenCalled();
	});

	// empty state when no recipients found
	it("shows empty state when search yields no results", async () => {
		stubCall({ users: [] });

		renderPicker();
		await waitFor(() => {
			// Should render some "no results" message
			const noMatch = screen.queryByText(/no/i);
			expect(noMatch).toBeInTheDocument();
		});
	});

	// submitting starts a DM thread via send_message(recipients)
	it("submitting a message calls send_message with recipients to create a DM thread", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		const onSelect = vi.fn();

		stubCall({
			sendResult: {
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
		expect(sendBtn).toBeInTheDocument();
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
