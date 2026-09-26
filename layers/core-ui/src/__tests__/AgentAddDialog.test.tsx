/**
 * AH4 — Component tests: AgentAddDialog placement affordance.
 *
 * AC2: AgentAddDialog renders a read-only "TEAM {teamName}" KeyValue
 * placement line when the teamName prop is provided.
 * The label is "TEAM" (uppercase) and the value is the team name.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAddDialog } from "../pages/AgentAddDialog";
import { ToastRegion } from "../shell/ToastRegion";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

function renderDialog(
	teamName: string,
	open = true,
	rolesInUse?: readonly string[],
): ReturnType<typeof render> {
	return render(
		<ToastRegion>
			<AgentAddDialog
				open={open}
				teamName={teamName}
				onClose={vi.fn()}
				onCreated={vi.fn()}
				{...(rolesInUse ? { rolesInUse } : {})}
			/>
		</ToastRegion>,
	);
}

describe("AgentAddDialog placement affordance", () => {
	it("renders TEAM label and team name when teamName is 'Acme'", () => {
		renderDialog("Acme");
		// The KeyValue label is "TEAM" (uppercase) and value is "Acme"
		expect(screen.getByText("Acme")).toBeInTheDocument();
	});

	it("renders TEAM label alongside the team name", () => {
		renderDialog("Acme");
		// The KeyValue renders the label as "TEAM" in uppercase
		expect(screen.getByText("TEAM")).toBeInTheDocument();
	});

	it("renders a different team name correctly", () => {
		renderDialog("Platform Alpha");
		expect(screen.getByText("Platform Alpha")).toBeInTheDocument();
	});

	it("does not render a team picker (placement is read-only in WorkTeam context)", () => {
		renderDialog("Acme");
		// No select with label "Team" — only the read-only KeyValue
		// The dialog title is "Add agent" confirming we're in the right component
		expect(screen.getByText("Add agent")).toBeInTheDocument();
		// The placement field is a KeyValue, not a combobox
		const teamSelects = screen.queryAllByRole("combobox");
		// The Role select exists but there should be no additional "Team" combobox
		// Verify none of the selects has a team-picker label
		for (const sel of teamSelects) {
			expect(sel).not.toHaveAccessibleName("Team");
		}
	});

	it("does not render when open=false", () => {
		renderDialog("Acme", false);
		expect(screen.queryByText("Add agent")).not.toBeInTheDocument();
	});
});

describe("AgentAddDialog — role field is a Combobox", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: true, data: { user: { id: "agent-new" } } });
	});
	afterEach(() => vi.restoreAllMocks());

	it("picks a role through the combobox and creates the agent with it", async () => {
		const user = userEvent.setup();

		render(
			<ToastRegion>
				<AgentAddDialog
					open
					teamName="Acme"
					onClose={vi.fn()}
					onCreated={vi.fn()}
					rolesInUse={["scout", "builder"]}
				/>
			</ToastRegion>,
		);

		await user.type(screen.getByLabelText("Agent name"), "Newbie");

		const trigger = screen.getByRole("combobox", { name: "Role" });
		await user.click(trigger);
		await user.click(await screen.findByText("Scout"));

		await user.click(screen.getByRole("button", { name: /create/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith(
				"edit_user",
				expect.objectContaining({ kind: "ai", role: "scout", team: { name: "Acme" } }),
			);
		});
	});

	it("always sends identity, even with an empty system prompt", async () => {
		const user = userEvent.setup();

		render(
			<ToastRegion>
				<AgentAddDialog open teamName="Acme" onClose={vi.fn()} onCreated={vi.fn()} />
			</ToastRegion>,
		);

		await user.type(screen.getByLabelText("Agent name"), "Newbie");
		await user.click(screen.getByRole("button", { name: /create/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", expect.objectContaining({ identity: "" }));
		});
	});
});
