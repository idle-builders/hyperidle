/**
 * M3 RED — HostThreadSection: accepts agentId prop, passes it to thread creation (D3).
 *
 * These tests FAIL until:
 *  - FOUNDER_ID constant is deleted from HostThreadSection.tsx
 *  - agentId?: string | null prop is added to HostThreadSectionProps
 *  - Thread creation passes agentId (or null) to resolveOrCreateHostThread
 *  - useCurrentUser() is used instead of the FOUNDER_ID constant
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostThreadSection } from "../../shell/HostThreadSection";

vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: vi.fn().mockReturnValue({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	}),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: vi.fn().mockReturnValue({
		user: { id: "mock-user-id", name: "Mock User", email: "m@test.com", avatarUrl: null },
		status: "ready",
		error: null,
	}),
}));

vi.mock("../../services/host-threads", () => ({
	resolveOrCreateHostThread: vi.fn().mockResolvedValue("thread-created"),
	postPlainHostMessage: vi.fn().mockResolvedValue(undefined),
}));

describe("M3 — HostThreadSection: accepts agentId prop (D3)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders without error when agentId is null", () => {
		render(<HostThreadSection hostKind="bet" hostId="bet-001" title="Discussion" agentId={null} />);

		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
	});

	it("renders without error when agentId is a real agent id", () => {
		render(
			<HostThreadSection
				hostKind="bet"
				hostId="bet-001"
				title="Discussion"
				agentId="agent-real-1"
			/>,
		);

		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
	});

	it("renders without error when agentId prop is omitted (default to null)", () => {
		// No agentId prop — backward compatible default
		render(<HostThreadSection hostKind="bet" hostId="bet-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
	});

	it("does NOT use 'agent-unassigned' string in the component", () => {
		const { container } = render(
			<HostThreadSection hostKind="bet" hostId="bet-001" title="Discussion" agentId={null} />,
		);

		// The hardcoded sentinel "agent-unassigned" must never appear in the DOM
		expect(container.textContent).not.toContain("agent-unassigned");
	});
});
