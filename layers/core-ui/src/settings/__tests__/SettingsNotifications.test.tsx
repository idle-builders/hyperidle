/**
 * BC5 T10 — SettingsNotifications, now "my subscriptions": one toggle per
 * object event, driven by the caller's own event subscriptions off
 * `open_user`. Off means paused (or never subscribed); on adds or unpauses.
 *
 * Replaces AD3-SettingsNotifications-solo / AF8-SettingsNotificationsTypeList
 * / AD5-settings-notifications — all built around the deleted
 * NOTIFICATION_TYPES registry and factory-wide mute, neither of which
 * exists any more (architecture.md §8).
 */

import { OBJECT_EVENTS } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsNotifications } from "../SettingsNotifications.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

afterEach(() => {
	vi.restoreAllMocks();
});

const SELF_ROW = { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } };

function openUserData(subscriptions: unknown[]): Record<string, unknown> {
	return {
		user: SELF_ROW,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions,
		connections: null,
		behaviour: null,
		inbox: null,
	};
}

describe("SettingsNotifications", () => {
	it("renders one toggle per object event", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") return Promise.resolve({ ok: true, data: openUserData([]) });
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		render(<SettingsNotifications />);

		await waitFor(() => {
			expect(screen.getAllByRole("switch")).toHaveLength(OBJECT_EVENTS.length);
		});
	});

	it("an unsubscribed event's toggle is off", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") return Promise.resolve({ ok: true, data: openUserData([]) });
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		render(<SettingsNotifications />);
		await waitFor(() => screen.getAllByRole("switch"));

		for (const toggle of screen.getAllByRole("switch")) {
			expect(toggle).not.toBeChecked();
		}
	});

	it("a subscribed, unpaused event's toggle is on", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({
					ok: true,
					data: openUserData([
						{
							id: "sub-1",
							event: "task.changed",
							schedule: null,
							paused: false,
							documentId: null,
							nextRunAt: null,
						},
					]),
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		render(<SettingsNotifications />);
		const toggle = await screen.findByRole("switch", { name: /a task changes/i });
		expect(toggle).toBeChecked();
	});

	it("a paused subscription's toggle is off", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({
					ok: true,
					data: openUserData([
						{
							id: "sub-1",
							event: "task.changed",
							schedule: null,
							paused: true,
							documentId: null,
							nextRunAt: null,
						},
					]),
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		render(<SettingsNotifications />);
		const toggle = await screen.findByRole("switch", { name: /a task changes/i });
		expect(toggle).not.toBeChecked();
	});

	it("turning an event on with no existing subscription adds one", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") return Promise.resolve({ ok: true, data: openUserData([]) });
			if (name === "edit_user") {
				return Promise.resolve({
					ok: true,
					data: openUserData([
						{
							id: "sub-new",
							event: "task.changed",
							schedule: null,
							paused: false,
							documentId: null,
							nextRunAt: null,
						},
					]),
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		const user = userEvent.setup();
		render(<SettingsNotifications />);
		const toggle = await screen.findByRole("switch", { name: /a task changes/i });
		await user.click(toggle);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "me",
				subscriptions: { add: [{ event: "task.changed" }] },
			});
		});
	});

	it("turning an existing subscribed event off pauses it", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({
					ok: true,
					data: openUserData([
						{
							id: "sub-1",
							event: "task.changed",
							schedule: null,
							paused: false,
							documentId: null,
							nextRunAt: null,
						},
					]),
				});
			}
			if (name === "edit_user") {
				return Promise.resolve({
					ok: true,
					data: openUserData([
						{
							id: "sub-1",
							event: "task.changed",
							schedule: null,
							paused: true,
							documentId: null,
							nextRunAt: null,
						},
					]),
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		const user = userEvent.setup();
		render(<SettingsNotifications />);
		const toggle = await screen.findByRole("switch", { name: /a task changes/i });
		expect(toggle).toBeChecked();
		await user.click(toggle);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "me",
				subscriptions: { change: [{ id: "sub-1", paused: true }] },
			});
		});
	});

	it("renders an error state when open_user fails", async () => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: false, problems: [{ code: "server_error", message: "no" }] });

		render(<SettingsNotifications />);

		await waitFor(() => {
			expect(screen.getByText(/couldn't load notifications/i)).toBeInTheDocument();
		});
	});
});
