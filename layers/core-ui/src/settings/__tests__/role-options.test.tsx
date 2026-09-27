/**
 * The role picker offers the roles that exist, not a hardcoded list.
 *
 * `ROLE_OPTIONS` was `AGENT_ROLE_CATALOG.map(...)` — 17 roles the product had
 * opinions about, offered whether or not any agent had them, while a role a
 * plugin or a person actually introduced was never offered back.
 *
 * Founder: "the roles catalog shouldn't be hardcoded, but based of what really
 * exists, a plugin or user should be able to introduce a new role with a new
 * agent. but also reuse an existing role during agent creation."
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AgentEditor, type AgentEditorDraft } from "../AgentEditor";

vi.mock("../../services/api-fetch", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return { ...actual, apiFetch: () => Promise.resolve(new Response("{}", { status: 200 })) };
});

const DRAFT: AgentEditorDraft = {
	name: "Rita",
	role: "release_manager",
	systemPrompt: "",
	harnessType: "",
	modelId: "",
	modelProvider: null,
	maxConcurrentSessions: 1,
	filesystemIds: [],
	modelOptions: {},
};

function renderEditor(roleOptions: readonly string[]) {
	return render(
		<MemoryRouter>
			<AgentEditor
				agentId="a1"
				ownerUserId={null}
				draft={DRAFT}
				onDraftChange={vi.fn()}
				harnesses={[]}
				onSave={vi.fn()}
				onCancel={vi.fn()}
				saving={false}
				error={null}
				rolesInUse={roleOptions}
			/>
		</MemoryRouter>,
	);
}

describe("the role picker offers the roles that exist", () => {
	it("offers a role somebody introduced, which no catalog knew about", async () => {
		renderEditor(["release_manager", "builder"]);

		// The combobox shows the current role by its derived label — no catalog
		// entry exists for `release_manager` and none is needed.
		const triggers = await screen.findAllByRole("combobox");
		const roleTrigger = triggers.find((t) => t.id === "edit-role-a1");
		expect(roleTrigger?.textContent).toContain("Release Manager");
	});

	it("does not offer roles nobody has", async () => {
		renderEditor(["release_manager"]);

		// `brand_voice`, `scout` and `data_analyst` were in the hardcoded catalog
		// and are on no agent here.
		expect(screen.queryByText("Brand Voice")).toBeNull();
		expect(screen.queryByText("Scout")).toBeNull();
		expect(screen.queryByText("Data Analyst")).toBeNull();
	});
});
