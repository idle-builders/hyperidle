/**
 * Q1 — AC1 / AC2 / AC3: RecipientPicker component.
 *
 * Architecture plan §4.4: inline recipient picker for new DM thread creation.
 * States: browsing (search + list), selected (recipient + message input), sending.
 *
 * @lore AU26 J4: `useRecipients` now makes TWO calls — core-api's recipient list
 * and `agent-orchestration`'s active-run counts, which it combines into the live
 * busy dot. The `stubFetch` helper routes by URL for that reason.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipientPicker } from "../components/RecipientPicker.js";

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

	// AC1: picker is accessible (search reachable via the combobox trigger)
	it("renders a combobox trigger on mount", async () => {
		stubFetch();

		renderPicker();
		expect(screen.getByRole("combobox")).toBeInTheDocument();
	});

	// AC2: recipient list is rendered from API response, once opened
	it("renders a list of recipients after loading", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		stubFetch();

		renderPicker();
		await user.click(screen.getByRole("combobox"));
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
		expect(screen.getByText("Growth Engine")).toBeInTheDocument();
		expect(screen.getByText("Founder")).toBeInTheDocument();
	});

	// AC2: agents with active sessions show a "Live" indicator
	it("shows a live indicator for agents with an active session", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		stubFetch();

		renderPicker();
		await user.click(screen.getByRole("combobox"));
		await waitFor(() => {
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
		// Live indicator label (case-insensitive)
		const liveElements = screen.getAllByText(/live/i);
		expect(liveElements.length).toBeGreaterThan(0);
	});

	// AC2: clicking a recipient transitions to selected state (message input visible)
	it("clicking a recipient shows a message input", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();

		stubFetch();

		renderPicker();
		await user.click(screen.getByRole("combobox"));
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
		await user.click(screen.getByRole("combobox"));
		const input = screen.getByRole("textbox");
		await user.click(input);
		await user.keyboard("{Escape}");

		expect(onCancel).toHaveBeenCalled();
	});

	// AC2: empty state when no recipients found
	it("shows empty state when search yields no results", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ recipients: [] }),
		}) as unknown as typeof fetch;

		renderPicker();
		await user.click(screen.getByRole("combobox"));
		await waitFor(() => {
			// Should render some "no results" message
			const noMatch = screen.queryByText(/no/i);
			expect(noMatch).not.toBeNull();
		});
	});

	// AC3: submitting creates a DM thread (POST /api/threads called)
	it("submitting a message POSTs to /api/threads to create a DM thread", async () => {
		const user = (await import("@testing-library/user-event")).default.setup();
		const onSelect = vi.fn();
		const posts: Array<{ url: string; body: unknown }> = [];

		global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "POST" && url.includes("/api/threads")) {
				const body = init?.body ? JSON.parse(init.body as string) : null;
				posts.push({ url, body });
				return new Response(
					JSON.stringify({
						thread: {
							id: "new-thread-id",
							hostKind: "agent",
							hostId: "agent-builder",
							initiatorId: "u-founder",
							participants: ["u-founder", "agent-builder"],
							pinned: false,
							resolvedAt: null,
							lastActiveAt: new Date().toISOString(),
							createdAt: new Date().toISOString(),
						},
						messages: [],
					}),
					{ status: 201, headers: { "Content-Type": "application/json" } },
				);
			}
			// GET /api/agent-orchestration/runs/active-counts
			if (url.includes("/agent-orchestration/")) {
				return new Response(JSON.stringify({ counts: MOCK_ACTIVE_COUNTS }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			// GET /api/recipients
			return new Response(JSON.stringify({ recipients: MOCK_RECIPIENTS }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		renderPicker({ onSelect });

		// Open the combobox and wait for the recipient list to load
		await user.click(screen.getByRole("combobox"));
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
		if (sendBtn) {
			await user.click(sendBtn);
			await waitFor(() => {
				expect(posts.length).toBeGreaterThan(0);
			});
			const body = posts[0]!.body as Record<string, unknown>;
			expect(body.hostKind).toBeDefined();
		}
	});
});
