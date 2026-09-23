/**
 * BC5 T9 — SubscriptionsSection component tests.
 *
 * Covers: list, add (event or schedule + prompt), pause/resume, remove — all
 * through `edit_user`, `call` mocked at the door.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastRegion } from "../../shell/ToastRegion.js";
import { SubscriptionsSection, type SubscriptionRow } from "../SubscriptionsSection.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

const SUBS: SubscriptionRow[] = [
	{ id: "sub-1", event: "task.changed", schedule: null, paused: false, documentId: "doc-1" },
	{ id: "sub-2", event: null, schedule: "0 9 * * 1", paused: true, documentId: null },
];

function renderSection(subscriptions: SubscriptionRow[] = SUBS, onChanged = vi.fn()): void {
	render(
		<ToastRegion>
			<SubscriptionsSection userId="agent-1" subscriptions={subscriptions} onChanged={onChanged} />
		</ToastRegion>,
	);
}

describe("SubscriptionsSection — list", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: true, data: { user: { id: "agent-1" } } });
	});
	afterEach(() => vi.restoreAllMocks());

	it("renders one row per subscription, event or schedule as the title", () => {
		renderSection();
		expect(screen.getByText("task.changed")).toBeInTheDocument();
		expect(screen.getByText("0 9 * * 1")).toBeInTheDocument();
	});

	it("shows Active/Paused per row", () => {
		renderSection();
		const rows = screen.getAllByTestId("subscription-row");
		expect(rows[0]?.textContent).toContain("Active");
		expect(rows[1]?.textContent).toContain("Paused");
	});

	it("shows an empty state when there are no subscriptions", () => {
		renderSection([]);
		expect(screen.getByText(/no subscriptions/i)).toBeInTheDocument();
	});
});

describe("SubscriptionsSection — add", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: true, data: { user: { id: "agent-1" } } });
	});
	afterEach(() => vi.restoreAllMocks());

	it("opens the add form on '+ Add subscription'", async () => {
		const user = userEvent.setup();
		renderSection();
		await user.click(screen.getByTestId("new-subscription-btn"));
		expect(screen.getByRole("combobox", { name: /^when$/i })).toBeInTheDocument();
	});

	it("adds an event subscription: edit_user carries event + prompt", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		renderSection(SUBS, onChanged);

		await user.click(screen.getByTestId("new-subscription-btn"));
		await user.selectOptions(screen.getByRole("combobox", { name: /^event$/i }), "document.created");
		await user.type(screen.getByRole("textbox", { name: /prompt/i }), "Summarize it");
		await user.click(screen.getByTestId("subscription-create-submit"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "agent-1",
				subscriptions: { add: [{ event: "document.created", prompt: "Summarize it" }] },
			});
		});
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	it("adds a schedule subscription: edit_user carries the raw cron string", async () => {
		const user = userEvent.setup();
		renderSection();

		await user.click(screen.getByTestId("new-subscription-btn"));
		await user.selectOptions(screen.getByRole("combobox", { name: /^when$/i }), "schedule");
		await user.type(screen.getByLabelText(/cron expression/i), "*/5 * * * *");
		await user.click(screen.getByTestId("subscription-create-submit"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "agent-1",
				subscriptions: { add: [{ schedule: "*/5 * * * *", prompt: null }] },
			});
		});
	});
});

describe("SubscriptionsSection — pause/resume and remove", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: true, data: { user: { id: "agent-1" } } });
	});
	afterEach(() => vi.restoreAllMocks());

	it("Pause calls edit_user with subscriptions.change paused: true", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		renderSection(SUBS, onChanged);

		const rows = screen.getAllByTestId("subscription-row");
		const pauseBtn = rows[0]?.querySelector('[data-testid="subscription-pause-btn"]');
		await user.click((pauseBtn as HTMLElement) ?? document.body);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "agent-1",
				subscriptions: { change: [{ id: "sub-1", paused: true }] },
			});
		});
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	it("Resume calls edit_user with subscriptions.change paused: false", async () => {
		const user = userEvent.setup();
		renderSection();

		const rows = screen.getAllByTestId("subscription-row");
		const resumeBtn = rows[1]?.querySelector('[data-testid="subscription-pause-btn"]');
		await user.click((resumeBtn as HTMLElement) ?? document.body);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "agent-1",
				subscriptions: { change: [{ id: "sub-2", paused: false }] },
			});
		});
	});

	it("Remove calls edit_user with subscriptions.remove", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		renderSection(SUBS, onChanged);

		const rows = screen.getAllByTestId("subscription-row");
		const removeBtn = rows[0]?.querySelector('[data-testid="subscription-remove-btn"]');
		await user.click((removeBtn as HTMLElement) ?? document.body);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "agent-1",
				subscriptions: { remove: ["sub-1"] },
			});
		});
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});
});
