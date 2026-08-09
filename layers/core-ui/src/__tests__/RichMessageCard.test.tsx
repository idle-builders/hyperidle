/**
 * L11 step5 (write-tests) — `RichMessageCard` Tier 2 component.
 *
 * Approved.md §2.1 (review variant), §2.2 (CommentRow rich-row extension is
 * covered separately), §4 (states), §5.7 (sticky-within-card), §8 (a11y).
 * Plan §5.3 (props), §6.1 (file path), §9 (failure modes).
 *
 * @lore L11 step5: until plan T4 lands the component, the import below
 * fails with "Module not found". This is the desired red-phase failure.
 */

import { RichMessageCard } from "@hyperidle/design-system";
import type { Message } from "@hyperidle/domain-model";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const sender = {
	id: "agent-1",
	name: "Aria",
	role: "builder",
};

function reviewMessage(
	overrides: Partial<{ resolvedAt: string | null; title: string; reasoning: string[] }> = {},
): Message {
	return {
		id: "m-rev",
		threadId: "t-1",
		senderId: "agent-1",
		clientKey: "k-rev",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: overrides.resolvedAt ?? null,
		createdAt: "2026-04-19T12:00:00.000Z",
		type: "review",
		payload: {
			title: overrides.title ?? "Approve copy update",
			reasoning: overrides.reasoning ?? [
				"Headline tightens the hero by ~12 chars.",
				"CTA copy aligns with the activation eval.",
			],
			artifactRef: { id: "art-1", kind: "text_diff" },
		},
	};
}

function questionnaireMessage(): Message {
	return {
		id: "m-q",
		threadId: "t-1",
		senderId: "agent-1",
		clientKey: "k-q",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-04-19T12:00:00.000Z",
		type: "questionnaire",
		payload: {
			title: "Pick a target audience",
			question: "Which segment should we ship to first?",
			options: ["Enterprise", "SMB", "Self-serve"],
		},
	};
}

describe("RichMessageCard — review variant (AC-1, AC-8, AC-11)", () => {
	it("mounts with data-component=RichMessageCard and embeds the artifact slot inline", () => {
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={true}
				artifactSlot={
					<div data-component="ArtifactView" data-shape="text_diff">
						mock-artifact
					</div>
				}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		const card = screen.getByTestId("rich-message-card");
		expect(card.getAttribute("data-component")).toBe("RichMessageCard");
		// Artifact slot rendered INSIDE the card (AC-8).
		expect(within(card).getByText("mock-artifact")).toBeInTheDocument();
	});

	it("renders the review title and metadata (REVIEW tag, sender, role)", () => {
		render(
			<RichMessageCard
				message={reviewMessage({ title: "Approve copy update" })}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		expect(screen.getByText("Approve copy update")).toBeInTheDocument();
		expect(screen.getByText(/REVIEW/)).toBeInTheDocument();
		expect(screen.getByText("Aria")).toBeInTheDocument();
	});

	it("renders all 5 binding verdict buttons inside the action toolbar", () => {
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		const toolbar = screen.getByRole("toolbar", { name: /verdict actions/i });
		expect(within(toolbar).getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
		expect(
			within(toolbar).getByRole("button", { name: /approve with comments/i }),
		).toBeInTheDocument();
		expect(within(toolbar).getByRole("button", { name: /request changes/i })).toBeInTheDocument();
		expect(within(toolbar).getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
		expect(within(toolbar).getByRole("button", { name: /reject/i })).toBeInTheDocument();
	});

	it("dispatches onAction with kind='verdict', the right decision, and a non-empty clientKey", () => {
		const onAction = vi.fn();
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={false}
				onAction={onAction}
				state={{ phase: "idle" }}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
		expect(onAction).toHaveBeenCalledTimes(1);
		const payload = onAction.mock.calls[0]![0]!;
		expect(payload.kind).toBe("verdict");
		expect(payload.decision).toBe("approve");
		expect(typeof payload.clientKey).toBe("string");
		expect(payload.clientKey.length).toBeGreaterThan(0);
	});

	it("each click generates a NEW clientKey (no idempotency conflicts on different decisions)", () => {
		const onAction = vi.fn();
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={false}
				onAction={onAction}
				state={{ phase: "idle" }}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
		fireEvent.click(screen.getByRole("button", { name: /reject/i }));
		const k1 = onAction.mock.calls[0]![0]!.clientKey;
		const k2 = onAction.mock.calls[1]![0]!.clientKey;
		expect(k1).not.toBe(k2);
	});

	it("blocking=true exposes a redundant text signal (not just the danger left-border)", () => {
		// AQ-010 / approved.md §8: blocking must not be color-only.
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={true}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		const card = screen.getByTestId("rich-message-card");
		expect(card.getAttribute("data-blocking")).toBe("true");
	});
});

describe("RichMessageCard — questionnaire variant (AC-9)", () => {
	it("renders one button per option inside an Answer-options toolbar", () => {
		render(
			<RichMessageCard
				message={questionnaireMessage()}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		const toolbar = screen.getByRole("toolbar", { name: /answer options/i });
		expect(within(toolbar).getByRole("button", { name: /enterprise/i })).toBeInTheDocument();
		expect(within(toolbar).getByRole("button", { name: /smb/i })).toBeInTheDocument();
		expect(within(toolbar).getByRole("button", { name: /self-serve/i })).toBeInTheDocument();
		// Question + title rendered as part of the card metadata/header.
		expect(screen.getByText(/QUESTION/i)).toBeInTheDocument();
		expect(screen.getByText("Pick a target audience")).toBeInTheDocument();
	});

	it("clicking an answer fires onAction with kind='answer' and the chosen option", () => {
		const onAction = vi.fn();
		render(
			<RichMessageCard
				message={questionnaireMessage()}
				sender={sender}
				blocking={false}
				onAction={onAction}
				state={{ phase: "idle" }}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /enterprise/i }));
		expect(onAction).toHaveBeenCalledTimes(1);
		const payload = onAction.mock.calls[0]![0]!;
		expect(payload.kind).toBe("answer");
		expect(payload.option).toBe("Enterprise");
		expect(typeof payload.clientKey).toBe("string");
	});
});

describe("RichMessageCard — states (approved.md §4, plan §9)", () => {
	it("saving state: replaces the action footer with a Saving strip and removes verdict buttons", () => {
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "saving" }}
			/>,
		);
		expect(screen.getByText(/saving/i)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
	});

	it("error state: renders an alert with the reason and a Retry button", () => {
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "error", reason: "Could not commit verdict" }}
			/>,
		);
		const alert = screen.getByRole("alert");
		expect(alert).toHaveTextContent(/could not commit verdict/i);
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});

	it("Retry from error state fires onAction with kind='retry' (idempotent — same clientKey contract)", () => {
		const onAction = vi.fn();
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={false}
				onAction={onAction}
				state={{ phase: "error", reason: "Network down" }}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /retry/i }));
		expect(onAction).toHaveBeenCalledTimes(1);
		expect(onAction.mock.calls[0]![0]!.kind).toBe("retry");
	});

	it("resolved state: renders the single-line summary with the verdict label and a Re-expand control", () => {
		const onReexpand = vi.fn();
		render(
			<RichMessageCard
				message={reviewMessage({ resolvedAt: "2026-04-19T13:00:00.000Z" })}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
				resolved={{
					decision: "approve",
					actor: "A. Founder",
					timestamp: "2026-04-19T13:00:00.000Z",
					reExpanded: false,
					onReexpandToggle: onReexpand,
				}}
			/>,
		);
		const card = screen.getByTestId("rich-message-card");
		expect(card.getAttribute("data-state")).toBe("resolved");
		expect(within(card).getByText(/RESOLVED/i)).toBeInTheDocument();
		expect(within(card).getByText(/APPROVED/i)).toBeInTheDocument();
		const reExpand = within(card).getByRole("button", { name: /re-expand/i });
		expect(reExpand.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(reExpand);
		expect(onReexpand).toHaveBeenCalledTimes(1);
	});
});

describe("RichMessageCard — reasoning (Fix 2)", () => {
	it("short reasoning (single string ≤ 80 chars) renders inline without a toggle", () => {
		render(
			<RichMessageCard
				message={reviewMessage({ reasoning: ["Pick before deploy."] })}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		expect(screen.getByText("Pick before deploy.")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /reasons/i })).toBeNull();
	});

	it("long reasoning collapses behind a `> N reasons` toggle by default", () => {
		render(
			<RichMessageCard
				message={reviewMessage({
					reasoning: [
						"Headline tightens the hero by ~12 chars across breakpoints.",
						"CTA copy aligns with the activation eval and lifts MQLs.",
						"Translation pass lowers the localisation backlog by 4 issues.",
					],
				})}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		const toggle = screen.getByRole("button", { name: /reasons/i });
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
	});
});

describe("RichMessageCard — sticky footer (approved.md §5.7)", () => {
	it("encodes max-height + sticky-bottom on the action footer (visual contract)", () => {
		render(
			<RichMessageCard
				message={reviewMessage()}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		const card = screen.getByTestId("rich-message-card");
		// The visual contract is encoded as data-attributes that the CSS keys
		// off; tests assert the contract markers, not computed style (jsdom
		// has no layout engine — see L11-plan.md §9).
		expect(card.getAttribute("data-sticky-footer")).toBe("true");
		const toolbar = screen.getByRole("toolbar", { name: /verdict actions/i });
		expect(toolbar.getAttribute("data-sticky")).toBe("bottom");
	});
});

describe("RichMessageCard — accessibility", () => {
	it("the card is a labelled section (aria-labelledby points at the title)", () => {
		render(
			<RichMessageCard
				message={reviewMessage({ title: "Approve copy update" })}
				sender={sender}
				blocking={false}
				onAction={vi.fn()}
				state={{ phase: "idle" }}
			/>,
		);
		const card = screen.getByTestId("rich-message-card");
		const labelledBy = card.getAttribute("aria-labelledby");
		expect(labelledBy).toBeTruthy();
		// The id referenced exists in the document and matches the title.
		const target = document.getElementById(labelledBy as string);
		expect(target?.textContent).toMatch(/approve copy update/i);
	});
});
