/**
 * AH4 — Component tests: AgentAddDialog placement affordance.
 *
 * AC2: AgentAddDialog renders a read-only "TEAM {teamName}" KeyValue
 * placement line when the teamName prop is provided.
 * The label is "TEAM" (uppercase) and the value is the team name.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentAddDialog } from "../pages/AgentAddDialog";
import { ToastRegion } from "../shell/ToastRegion";

function renderDialog(teamName: string, open = true): ReturnType<typeof render> {
	return render(
		<ToastRegion>
			<AgentAddDialog
				open={open}
				teamMembersId="tm-acme"
				teamName={teamName}
				onClose={vi.fn()}
				onCreated={vi.fn()}
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
