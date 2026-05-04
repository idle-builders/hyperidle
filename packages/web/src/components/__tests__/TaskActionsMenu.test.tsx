/**
 * L15 — TaskActionsMenu: kebab trigger + flat menu (Open thread + 5 Request items).
 *
 * Selecting a "Request: <state>" item posts a plain message to the task's thread.
 * Selecting "Open thread" navigates to /conversations/review?id=<threadId>
 * (the verified existing route pattern; see L15-plan §6).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { TaskThreadClient } from "../../services/task-thread-client";
import { TaskActionsMenu } from "../TaskActionsMenu";

function makeClient(overrides?: Partial<TaskThreadClient>): TaskThreadClient {
	return {
		findOrCreateTaskThread: vi.fn(async () => ({ threadId: "th-resolved" })),
		postPlainMessage: vi.fn(async () => undefined),
		...overrides,
	};
}

function LocationProbe(): JSX.Element {
	const loc = useLocation();
	return (
		<div data-testid="probe">
			{loc.pathname}
			{loc.search}
		</div>
	);
}

function renderMenu(props: {
	state?: import("@hyperidle/shared").TaskState;
	client?: TaskThreadClient;
}): { client: TaskThreadClient } {
	const client = props.client ?? makeClient();
	render(
		<MemoryRouter initialEntries={["/work/team"]}>
			<Routes>
				<Route
					path="/work/team"
					element={
						<TaskActionsMenu
							task={{
								id: "t-1",
								title: "Implement login endpoint",
								state: props.state ?? "in_progress",
							}}
							client={client}
						/>
					}
				/>
				<Route path="*" element={<LocationProbe />} />
			</Routes>
		</MemoryRouter>,
	);
	return { client };
}

describe("TaskActionsMenu", () => {
	it("renders a kebab trigger labelled 'Actions for <title>' (closed by default)", () => {
		renderMenu({});
		const trigger = screen.getByLabelText("Actions for Implement login endpoint");
		expect(trigger).toHaveAttribute("aria-haspopup", "menu");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	});

	it("opens a menu with 6 items on click", async () => {
		const user = userEvent.setup();
		renderMenu({});
		await user.click(screen.getByLabelText("Actions for Implement login endpoint"));
		const menu = await screen.findByRole("menu");
		expect(menu).toBeInTheDocument();
		const items = screen.getAllByRole("menuitem");
		expect(items).toHaveLength(6);
		expect(items[0]).toHaveTextContent("Open thread");
		expect(items[1]).toHaveTextContent(/Request: In progress/i);
		expect(items[2]).toHaveTextContent(/Request: Blocked/i);
		expect(items[3]).toHaveTextContent(/Request: Done/i);
		expect(items[4]).toHaveTextContent(/Request: Hold/i);
		expect(items[5]).toHaveTextContent(/Request: Kill/i);
	});

	it("disables the menu item matching the current task state", async () => {
		const user = userEvent.setup();
		renderMenu({ state: "in_progress" });
		await user.click(screen.getByLabelText("Actions for Implement login endpoint"));
		const items = screen.getAllByRole("menuitem");
		const inProgressItem = items.find((el) => /Request: In progress/i.test(el.textContent ?? ""));
		expect(inProgressItem).toBeDefined();
		expect(inProgressItem).toHaveAttribute("aria-disabled", "true");
	});

	it("posts a plain message to the task thread when 'Request: Done' is selected", async () => {
		const user = userEvent.setup();
		const { client } = renderMenu({});
		await user.click(screen.getByLabelText("Actions for Implement login endpoint"));
		await user.click(screen.getByRole("menuitem", { name: /Request: Done/i }));
		await waitFor(() => {
			expect(client.findOrCreateTaskThread).toHaveBeenCalledWith("t-1");
		});
		expect(client.postPlainMessage).toHaveBeenCalledTimes(1);
		const [threadId, text, clientKey] = (client.postPlainMessage as ReturnType<typeof vi.fn>).mock
			.calls[0];
		expect(threadId).toBe("th-resolved");
		expect(text).toBe("Requesting state change to done.");
		expect(clientKey).toMatch(/^[A-Za-z0-9_\-:.]{8,128}$/);
	});

	it("navigates to /conversations/review?id=<threadId> when 'Open thread' is selected", async () => {
		const user = userEvent.setup();
		renderMenu({});
		await user.click(screen.getByLabelText("Actions for Implement login endpoint"));
		await user.click(screen.getByRole("menuitem", { name: /Open thread/i }));
		await waitFor(() => {
			expect(screen.getByTestId("probe").textContent).toContain("/conversations/review");
		});
		expect(screen.getByTestId("probe").textContent).toContain("id=th-resolved");
	});

	it("shows an inline alert when posting fails (menu does not auto-navigate)", async () => {
		const user = userEvent.setup();
		const failingClient = makeClient({
			postPlainMessage: vi.fn(async () => {
				throw new Error("Network error");
			}),
		});
		renderMenu({ client: failingClient });
		await user.click(screen.getByLabelText("Actions for Implement login endpoint"));
		await user.click(screen.getByRole("menuitem", { name: /Request: Done/i }));
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toMatch(/failed|error/i);
	});

	it("L15 review C4: trigger button hit area is at least 44×44 (AQ-015)", () => {
		renderMenu({});
		const trigger = screen.getByLabelText("Actions for Implement login endpoint");
		const cls = trigger.className;
		expect(cls).toMatch(/min-w-\[44px\]/);
		expect(cls).toMatch(/min-h-\[44px\]/);
	});

	it("L15 review W3: items disable while a request is in-flight", async () => {
		const user = userEvent.setup();
		let resolveFind: (handle: { threadId: string }) => void = () => {};
		const slowClient = makeClient({
			findOrCreateTaskThread: vi.fn(
				() =>
					new Promise<{ threadId: string }>((r) => {
						resolveFind = r;
					}),
			),
		});
		renderMenu({ client: slowClient });
		await user.click(screen.getByLabelText("Actions for Implement login endpoint"));
		await user.click(screen.getByRole("menuitem", { name: /Request: Done/i }));
		// While in-flight: every menuitem is aria-disabled.
		const items = screen.getAllByRole("menuitem");
		for (const item of items) {
			expect(item).toHaveAttribute("aria-disabled", "true");
		}
		// Trigger announces aria-busy.
		const trigger = screen.getByLabelText("Actions for Implement login endpoint");
		expect(trigger).toHaveAttribute("aria-busy", "true");
		// Resolve to release pending state.
		resolveFind({ threadId: "th-resolved" });
		await waitFor(() => {
			expect(slowClient.postPlainMessage).toHaveBeenCalled();
		});
	});

	it("L15 review W6: aria-controls only set while open", async () => {
		const user = userEvent.setup();
		renderMenu({});
		const trigger = screen.getByLabelText("Actions for Implement login endpoint");
		expect(trigger).not.toHaveAttribute("aria-controls");
		await user.click(trigger);
		await waitFor(() => {
			expect(trigger).toHaveAttribute("aria-controls");
		});
	});

	it("L15 review W2: clicking outside the menu closes it", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/work/team"]}>
				<Routes>
					<Route
						path="/work/team"
						element={
							<>
								<TaskActionsMenu
									task={{ id: "t-1", title: "X", state: "in_progress" }}
									client={makeClient()}
								/>
								<button type="button" data-testid="outside-target">
									outside
								</button>
							</>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);
		await user.click(screen.getByLabelText("Actions for X"));
		await screen.findByRole("menu");
		await user.pointer({ keys: "[MouseLeft]", target: screen.getByTestId("outside-target") });
		await waitFor(() => {
			expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		});
	});
});
