/**
 * AH3 RED — AssistantOverlay notice rendering + crash-recovery component tests.
 *
 * AC2 (overlay side):
 *   - when thread last message has payload.notice.kind=missing_key → renders
 *     the "No API key yet" guidance card with Settings → Credentials affordance
 *   - missing_harness → "Runtime not configured" + "Open Agent settings" affordance
 *   - provider_error → "Couldn't reach the model" + Retry ghost button
 *
 * AC1/§1.7b (crash recovery):
 *   - thread whose last message is a human message AND older than
 *     ASSISTANT_TURN_TIMEOUT_MS shows Retry card, NOT infinite spinner
 *
 * These tests FAIL until:
 *   - AssistantOverlay.tsx branches on payload.notice?.kind
 *   - useAssistantThread adds WS subscription (live-update support)
 *   - ASSISTANT_TURN_TIMEOUT_MS exported from @hyperidle/domain-model
 */

import type { Message } from "@hyperidle/domain-model";
// AH3 RED: ASSISTANT_TURN_TIMEOUT_MS added to @hyperidle/domain-model in the green phase (plan §1.7b)
import { ASSISTANT_TURN_TIMEOUT_MS } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantThreadState } from "../../hooks/useAssistantThread.js";

vi.mock("../../hooks/useAssistantThread.js", () => ({
	useAssistantThread: vi.fn(),
}));
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { MemoryRouter } from "react-router-dom";
import { useAssistantThread } from "../../hooks/useAssistantThread.js";
import { AssistantOverlay } from "../../shell/AssistantOverlay.js";

const NOW_ISO = new Date().toISOString();
// A timestamp older than the turn timeout
const STALE_ISO = new Date(Date.now() - ASSISTANT_TURN_TIMEOUT_MS - 10_000).toISOString();
// A timestamp within the turn timeout window
const RECENT_ISO = new Date(Date.now() - 30_000).toISOString();

const BASE_THREAD = {
	id: "t-overlay-ah3",
	hostKind: "user" as const,
	hostId: "u-founder",
	initiatorId: "u-founder",
	participants: ["u-founder", "ast-u-founder"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: NOW_ISO,
	createdAt: NOW_ISO,
};

const BASE_IDENTITIES = {
	"u-founder": { name: "Founder" },
	"ast-u-founder": { name: "Assistant", role: "assistant" },
};

/**
 * @lore AH3 RED: messages cast via `as unknown` because PlainPayload.notice
 * doesn't exist yet — green phase adds it (see AH3-plain-payload-notice.test.ts).
 * The fixture uses record types so the test compiles; the behavioral assertion
 * (overlay renders notice card) fails because the overlay doesn't branch on
 * payload.notice?.kind yet.
 */
function makeData(messages: ReadonlyArray<Record<string, unknown>>): AssistantThreadState {
	return {
		status: "ready" as const,
		data: {
			thread: BASE_THREAD,
			messages: messages as unknown as ReadonlyArray<Message>,
			identities: BASE_IDENTITIES,
		},
		error: null,
		retry: vi.fn(),
		refresh: vi.fn(),
	};
}

function renderOverlay() {
	// AM5 T9: AssistantOverlayInner now calls useNavigate() for block-ref-embed
	// open-contract wiring. Wrap in MemoryRouter to satisfy the Router context requirement.
	return render(
		<MemoryRouter>
			<AssistantOverlay
				open={true}
				onClose={vi.fn()}
				contextRefs={[]}
				onRemoveContextRef={vi.fn()}
			/>
		</MemoryRouter>,
	);
}

describe("AH3: AssistantOverlay notice rendering", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders missing_key guidance card with Settings → Credentials affordance", () => {
		vi.mocked(useAssistantThread).mockReturnValue(
			makeData([
				{
					id: "msg-mk-1",
					threadId: "t-overlay-ah3",
					senderId: "ast-u-founder",
					type: "plain",
					payload: {
						text: "I can't think yet — no API key is configured. Add your Anthropic key in Settings → Credentials.",
						notice: { kind: "missing_key" },
					},
					clientKey: "ck-mk-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		// Must render guidance card for missing_key
		expect(screen.getByText(/no api key/i)).toBeInTheDocument();
		// Must have an affordance pointing to Credentials settings
		expect(
			screen.getByRole("button", { name: /credentials/i }) || screen.getByText(/credentials/i),
		).toBeTruthy();
	});

	it("renders missing_harness guidance card with Open Agent settings affordance", () => {
		vi.mocked(useAssistantThread).mockReturnValue(
			makeData([
				{
					id: "msg-mh-1",
					threadId: "t-overlay-ah3",
					senderId: "ast-u-founder",
					type: "plain",
					payload: {
						text: "My runtime isn't set up. Pick a harness for me and I'll be ready.",
						notice: { kind: "missing_harness" },
					},
					clientKey: "ck-mh-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		// Must render guidance card for missing_harness
		expect(screen.getByText(/runtime not configured/i)).toBeInTheDocument();
		// Must have an affordance pointing to Agent settings
		expect(screen.getByText(/agent/i)).toBeInTheDocument();
	});

	it("renders provider_error guidance card with Retry ghost button", () => {
		vi.mocked(useAssistantThread).mockReturnValue(
			makeData([
				{
					id: "msg-pe-1",
					threadId: "t-overlay-ah3",
					senderId: "ast-u-founder",
					type: "plain",
					payload: {
						text: "The model provider returned an error and I couldn't complete that.",
						notice: { kind: "provider_error" },
					},
					clientKey: "ck-pe-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		// Must render provider_error card copy
		expect(screen.getByText(/couldn't reach the model/i)).toBeInTheDocument();
		// Must have a Retry affordance (ghost button)
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});

	it("renders notice card with role=alert (accessibility)", () => {
		vi.mocked(useAssistantThread).mockReturnValue(
			makeData([
				{
					id: "msg-alert-1",
					threadId: "t-overlay-ah3",
					senderId: "ast-u-founder",
					type: "plain",
					payload: {
						text: "Provider error.",
						notice: { kind: "provider_error" },
					},
					clientKey: "ck-alert-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("regular plain messages without notice render as normal chat (no guidance card)", () => {
		vi.mocked(useAssistantThread).mockReturnValue(
			makeData([
				{
					id: "msg-normal-1",
					threadId: "t-overlay-ah3",
					senderId: "ast-u-founder",
					type: "plain",
					payload: {
						text: "Hello! How can I help you today?",
					},
					clientKey: "ck-normal-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
	});
});

describe("AH3 §1.7b: crash-recovery — stale thinking state renders Retry card", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("thread whose last message is human AND older than ASSISTANT_TURN_TIMEOUT_MS shows Retry card (not spinner)", () => {
		// Last message is a human message, older than the timeout window
		vi.mocked(useAssistantThread).mockReturnValue(
			makeData([
				{
					id: "msg-stale-1",
					threadId: "t-overlay-ah3",
					senderId: "u-founder",
					type: "plain",
					payload: { text: "Can you help me with this?" },
					clientKey: "ck-stale-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: STALE_ISO,
				},
			]),
		);

		renderOverlay();

		// Must NOT show an infinite spinner
		expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();

		// Must show a Retry card (provider_error shape)
		// Either "try again" copy OR a retry button
		const hasRetry =
			screen.queryByRole("button", { name: /retry/i }) !== null ||
			screen.queryByText(/try again/i) !== null;
		expect(hasRetry).toBe(true);
	});

	it("thread whose last message is human AND within ASSISTANT_TURN_TIMEOUT_MS shows thinking indicator", () => {
		vi.mocked(useAssistantThread).mockReturnValue(
			makeData([
				{
					id: "msg-recent-1",
					threadId: "t-overlay-ah3",
					senderId: "u-founder",
					type: "plain",
					payload: { text: "What do you think?" },
					clientKey: "ck-recent-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: RECENT_ISO,
				},
			]),
		);

		renderOverlay();

		// Must show "thinking…" indicator (not the Retry card for a stale turn)
		expect(screen.getByText(/thinking/i)).toBeInTheDocument();
	});

	it("thread whose last message is from the assistant shows neither thinking nor Retry", () => {
		vi.mocked(useAssistantThread).mockReturnValue(
			makeData([
				{
					id: "msg-ast-1",
					threadId: "t-overlay-ah3",
					senderId: "u-founder",
					type: "plain",
					payload: { text: "Help me." },
					clientKey: "ck-ast-0",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: STALE_ISO,
				},
				{
					id: "msg-ast-2",
					threadId: "t-overlay-ah3",
					senderId: "ast-u-founder",
					type: "plain",
					payload: { text: "Sure, here is my answer." },
					clientKey: "ck-ast-1",
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
					createdAt: NOW_ISO,
				},
			]),
		);

		renderOverlay();

		// The assistant replied — no thinking indicator, no stale Retry
		expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
		expect(screen.getByText("Sure, here is my answer.")).toBeInTheDocument();
	});
});
