/**
 * AH4 — Component tests: AgentAddDialog placement affordance.
 *
 * AC2: AgentAddDialog renders a read-only "TEAM {teamName}" KeyValue
 * placement line when the teamName prop is provided.
 * The label is "TEAM" (uppercase) and the value is the team name.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAddDialog } from "../pages/AgentAddDialog";
import { ToastRegion } from "../shell/ToastRegion";

function renderDialog(
	teamName: string,
	open = true,
	rolesInUse?: readonly string[],
): ReturnType<typeof render> {
	return render(
		<ToastRegion>
			<AgentAddDialog
				open={open}
				teamMembersId="tm-acme"
				teamName={teamName}
				onClose={vi.fn()}
				onCreated={vi.fn()}
				{...(rolesInUse ? { rolesInUse } : {})}
			/>
		</ToastRegion>,
	);
}

describe("AH4 AC2 — AgentAddDialog placement affordance", () => {
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
	afterEach(() => vi.restoreAllMocks());

	it("picks a role through the combobox and creates the agent with it", async () => {
		const user = userEvent.setup();
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: "agent-new" }),
		});
		vi.stubGlobal("fetch", fetchSpy);

		render(
			<ToastRegion>
				<AgentAddDialog
					open
					teamMembersId="tm-acme"
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
			const call = fetchSpy.mock.calls.find(
				([, opts]) => (opts as RequestInit | undefined)?.method === "POST",
			);
			expect(call).toBeDefined();
			const opts = call?.[1] as RequestInit;
			const body = JSON.parse(opts.body as string) as { role: string };
			expect(body.role).toBe("scout");
		});
	});
});
