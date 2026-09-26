/**
 * ConversationSurface real-props contract.
 *
 * ConversationSurface is now prop-driven (story passes a fixture; page passes
 * real data). This test mounts it with a fixture `parts` + spy `onSend`/`onOpen`
 * and asserts the header (title + host context), the participant avatar group,
 * the message column (rendered via PartList), and the functional send path.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ConversationSurface, {
	type ConversationSurfaceHeader,
	type ConversationSurfaceParticipant,
} from "../components/ConversationSurface";
import type { Part } from "../components/parts";

const PARTS: Part[] = [
	{
		id: "p1",
		kind: "prose",
		author: { id: "u-founder", name: "A. Founder", isAgent: false, isMe: true },
		createdAt: "2026-06-17T09:02:00.000Z",
		embeds: [],
		text: "Hello from the founder",
	},
	{
		id: "p2",
		kind: "prose",
		author: { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false },
		createdAt: "2026-06-17T09:05:00.000Z",
		embeds: [],
		text: "Reply from the agent",
	},
];

const HEADER: ConversationSurfaceHeader = {
	title: "Passkey login",
	hostKind: "Bet",
	hostTitle: "Passkey login bet",
	hostRoute: "/work/bet/bet-1",
};

const PARTICIPANTS: ReadonlyArray<ConversationSurfaceParticipant> = [
	{ id: "u-founder", name: "A. Founder", isAgent: false },
	{ id: "a-atlas", name: "Atlas", isAgent: true },
];

function renderSurface(
	overrides: Partial<{ onSend: (text: string) => void; onOpen: () => void }> = {},
): void {
	render(
		<MemoryRouter>
			<ConversationSurface
				parts={PARTS}
				onOpen={overrides.onOpen ?? (() => undefined)}
				header={HEADER}
				participants={PARTICIPANTS}
				onSend={overrides.onSend ?? (() => undefined)}
			/>
		</MemoryRouter>,
	);
}

describe("ConversationSurface — real props", () => {
	it("renders the header title and host context link", () => {
		renderSurface();
		expect(screen.getByRole("heading", { name: "Passkey login" })).toBeInTheDocument();
		const link = screen.getByRole("link", { name: /Passkey login bet/i });
		expect((link as HTMLAnchorElement).getAttribute("href")).toContain("/work/bet/bet-1");
	});

	it("renders the participant avatar group with the participant count", () => {
		renderSurface();
		const group = screen.getByText("2");
		expect(group).toBeInTheDocument();
		// The avatar group is present.
		expect(document.querySelector("[data-ds-component='AvatarGroup']")).not.toBeNull();
	});

	it("renders the message column via PartList", () => {
		renderSurface();
		expect(document.querySelector("[data-ds-component='PartList']")).not.toBeNull();
		expect(screen.getByText("Hello from the founder")).toBeInTheDocument();
		expect(screen.getByText("Reply from the agent")).toBeInTheDocument();
	});

	it("types into the composer and Send invokes onSend with the typed text", async () => {
		const onSend = vi.fn();
		const user = userEvent.setup();
		renderSurface({ onSend });

		const textarea = screen.getByPlaceholderText(/Message A\. Founder, Atlas/i);
		await user.type(textarea, "A new message");
		await user.click(screen.getByRole("button", { name: /send message/i }));

		expect(onSend).toHaveBeenCalledTimes(1);
		expect(onSend).toHaveBeenCalledWith("A new message");
	});

	it("does not invoke onSend when the composer is empty", async () => {
		const onSend = vi.fn();
		const user = userEvent.setup();
		renderSurface({ onSend });
		await user.click(screen.getByRole("button", { name: /send message/i }));
		expect(onSend).not.toHaveBeenCalled();
	});
});
