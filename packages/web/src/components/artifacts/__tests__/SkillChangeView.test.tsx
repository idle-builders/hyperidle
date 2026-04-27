/**
 * L9 — SkillChangeView. Skill diff + per-agent impact list above the
 * verdict bar; explicit pin-version OR rollback-window required before
 * approve.
 */
import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillChangeView } from "../SkillChangeView";

const meta: ArtifactMetadataExtended = {
	kind: "skill_change",
	riskTier: "high",
	reversibility: true,
	costEstimate: 3,
	blastRadius: { agents: ["Architect", "Developer", "Builder"], teams: [], products: [] },
	sandboxResult: "passed",
	status: "pending",
	sla: "1d left",
	routing: "Practice Facilitator",
};

const basePayload = {
	skillId: "skill:tests-on-typo",
	diff: {
		before: "Always rerun tests after typo fixes",
		after: "Skip tests when only comments change",
	},
	agentImpacts: [
		{ agentName: "Architect", behaviorChange: "no behavioral change" },
		{ agentName: "Developer", behaviorChange: "30% faster on doc-only PRs" },
		{ agentName: "Builder", behaviorChange: "30% faster on doc-only PRs" },
	],
	rolloutPolicy: null as null | { mode: "pin_version" | "rollback_window"; value: string },
};

describe("L9: SkillChangeView", () => {
	it("wraps content in the shared ArtifactShell metadata strip", () => {
		render(<SkillChangeView metadata={meta} payload={basePayload} />);
		expect(screen.getByTestId("artifact-metadata-strip-v2")).toBeInTheDocument();
	});

	it("renders the skill diff (before/after)", () => {
		render(<SkillChangeView metadata={meta} payload={basePayload} />);
		const diff = screen.getByTestId("skill-change-diff");
		expect(diff).toHaveTextContent("Always rerun tests after typo fixes");
		expect(diff).toHaveTextContent("Skip tests when only comments change");
	});

	it("renders the per-agent impact list with each named agent", () => {
		render(<SkillChangeView metadata={meta} payload={basePayload} />);
		const list = screen.getByTestId("skill-change-impact-list");
		expect(list).toHaveTextContent("Architect");
		expect(list).toHaveTextContent("Developer");
		expect(list).toHaveTextContent("Builder");
		expect(list).toHaveTextContent(/30% faster/i);
	});

	it("places the impact list above the rollout/verdict region in DOM order", () => {
		render(<SkillChangeView metadata={meta} payload={basePayload} />);
		const list = screen.getByTestId("skill-change-impact-list");
		const gate = screen.getByTestId("skill-change-rollout-gate");
		const rel = list.compareDocumentPosition(gate);
		// gate must follow list in DOM (DOCUMENT_POSITION_FOLLOWING).
		expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("rollout gate is aria-disabled when no rolloutPolicy is selected", () => {
		render(<SkillChangeView metadata={meta} payload={basePayload} />);
		const gate = screen.getByTestId("skill-change-rollout-gate");
		expect(gate).toHaveAttribute("aria-disabled", "true");
	});

	it("rollout gate becomes enabled once a pin_version policy is supplied", () => {
		render(
			<SkillChangeView
				metadata={meta}
				payload={{ ...basePayload, rolloutPolicy: { mode: "pin_version", value: "v3.2" } }}
			/>,
		);
		const gate = screen.getByTestId("skill-change-rollout-gate");
		expect(gate).toHaveAttribute("aria-disabled", "false");
	});

	it("emits onRolloutChange when user selects pin_version", async () => {
		const user = userEvent.setup();
		const onRolloutChange = vi.fn();
		render(
			<SkillChangeView metadata={meta} payload={basePayload} onRolloutChange={onRolloutChange} />,
		);
		const pin = screen.getByRole("radio", { name: /pin.*version/i });
		await user.click(pin);
		expect(onRolloutChange).toHaveBeenCalled();
		const arg = onRolloutChange.mock.calls[0]?.[0] as { mode: string };
		expect(arg.mode).toBe("pin_version");
	});

	it("emits onRolloutChange when user selects rollback_window", async () => {
		const user = userEvent.setup();
		const onRolloutChange = vi.fn();
		render(
			<SkillChangeView metadata={meta} payload={basePayload} onRolloutChange={onRolloutChange} />,
		);
		const rb = screen.getByRole("radio", { name: /rollback.*window/i });
		await user.click(rb);
		const arg = onRolloutChange.mock.calls[0]?.[0] as { mode: string };
		expect(arg.mode).toBe("rollback_window");
	});

	it("does not render its own metadata-strip duplicate", () => {
		const { container } = render(<SkillChangeView metadata={meta} payload={basePayload} />);
		expect(container.querySelectorAll("[data-testid='artifact-metadata-strip-v2']")).toHaveLength(
			1,
		);
	});
});
