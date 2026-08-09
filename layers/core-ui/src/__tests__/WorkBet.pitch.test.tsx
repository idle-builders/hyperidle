/**
 * L16 — Bet pitch rendered as L2 blocks (red phase).
 *
 * AC coverage:
 *   AC-1: pitch renders as styled blocks; <pre> replaced.
 *   AC-2: block ids stable per L2.
 *   AC-4: round-trip lossless, id stability, edit-isolation.
 *   AC-5: no '#' markdown markers visible in rendered output.
 *   Optional: malformed pitch falls back to UnknownPayload without crashing.
 *   AC-3 (positive path): useBet is the runtime data source.
 *
 * Note on round-trip structural coverage (case 2):
 *   framework/shared/src/__tests__/blocks/round-trip.test.ts already proves per-kind
 *   structural losslessness (L2 AC-28). Case 2 extends to the consumer surface and
 *   asserts that ALL supported non-unknown kinds appear in the output of a pitch that
 *   exercises all of them, without duplicating the L2 suite's per-case coverage.
 *
 * Case 8 vi.mock note: vi.mock is hoisted to the top by Vitest even when
 * written inside a describe block. Using a factory that returns a shared
 * "api-bet" shaped bet. The mock is reset per test via vi.restoreAllMocks().
 */

import { deriveBlocks } from "@hyperidle/block-derivation";
import { MAX_BODY_BYTES } from "@hyperidle/domain-model";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkBet } from "../pages/WorkBet";
import type { BetDetail } from "../types/bet";

// Top-level mock for case 8 — must be at module level for Vitest hoisting.
// The factory is overridden per-test via vi.mocked below.
vi.mock("../hooks/useBet", () => ({
	useBet: vi.fn(() => ({ data: null, loading: false, error: null })),
}));

// A fixture pitch that exercises all supported non-unknown block kinds.
const RICH_PITCH = `# Problem
The dashboard is fragmented.

## Appetite
Two weeks.

A paragraph block.

- item one
- item two

> A blockquote here.

\`\`\`ts
const x = 1;
\`\`\`

| Col A | Col B |
| ----- | ----- |
| val1  | val2  |

---
`;

const BASE_BET: BetDetail = {
	id: "b-test",
	title: "Test Bet",
	team: "Test Team",
	status: "completed",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 0, total: 0 },
	description: RICH_PITCH,
	tasks: [],
};

function renderWithBet(bet: BetDetail): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

function renderWithoutOverride(betId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${betId}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet />} />
			</Routes>
		</MemoryRouter>,
	);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("L16 — WorkBet pitch as L2 blocks", () => {
	// ----------------------------------------------------------------
	// Case 1: render fidelity — no markdown markers visible
	// ----------------------------------------------------------------
	it("case 1: renders pitch with no raw markdown markers visible", () => {
		renderWithBet(BASE_BET);

		const section = document.querySelector("[data-testid='bet-pitch']");
		expect(section).toBeTruthy();

		// At least one Block element must exist in the pitch section.
		const blocks = section?.querySelectorAll("[data-ds-component='block']");
		expect(blocks?.length).toBeGreaterThan(0);

		// The heading "Problem" must render as a heading element, not as raw "#".
		const heading = section?.querySelector("h1, h2, h3, h4, h5, h6");
		expect(heading).toBeTruthy();
		expect(heading?.textContent).not.toMatch(/^#/);

		// No visible text outside code/unknown regions starts with "# ".
		const textOutsideCode = (() => {
			if (!section) return "";
			const clone = section.cloneNode(true) as HTMLElement;
			for (const el of clone.querySelectorAll("[data-ds-kind='code'], [data-ds-kind='unknown']")) {
				el.remove();
			}
			return clone.textContent ?? "";
		})();
		expect(textOutsideCode).not.toMatch(/^#\s/m);
		expect(textOutsideCode).not.toMatch(/\*\*/);

		// No legacy <pre data-testid="bet-pitch-body"> present.
		expect(document.querySelector("pre[data-testid='bet-pitch-body']")).toBeNull();
	});

	// ----------------------------------------------------------------
	// Case 2: structural round-trip via direct deriveBlocks call
	// ----------------------------------------------------------------
	it("case 2: deriveBlocks preserves all supported kinds in the output", () => {
		// Pure call — no DOM. L2 round-trip.test.ts proves per-kind structural
		// losslessness; this case proves all expected kinds are present as a set
		// from a multi-kind pitch document.
		const { blocks } = deriveBlocks(RICH_PITCH, { kind: "bet", id: "b-test" });
		const kinds = blocks.map((b) => b.payload.kind);

		expect(kinds).toContain("heading");
		expect(kinds).toContain("paragraph");
		expect(kinds).toContain("list");
		expect(kinds).toContain("quote");
		expect(kinds).toContain("code");
		expect(kinds).toContain("table");
		expect(kinds).toContain("divider");
	});

	// ----------------------------------------------------------------
	// Case 3: block ids stable across re-parse
	// ----------------------------------------------------------------
	it("case 3: block ids are stable across re-parse with identical content", () => {
		renderWithBet(BASE_BET);

		const getIds = (): string[] =>
			Array.from(document.querySelectorAll("[data-testid='bet-pitch'] [data-block-id]")).map(
				(el) => el.getAttribute("data-block-id") ?? "",
			);

		const first = getIds();
		expect(first.length).toBeGreaterThan(0);

		// Re-render with same content.
		cleanup();
		renderWithBet(BASE_BET);
		const second = getIds();

		expect(second).toEqual(first);
	});

	// ----------------------------------------------------------------
	// Case 4: editing one block leaves OTHER block ids unchanged
	// ----------------------------------------------------------------
	it("case 4: editing one block leaves other block ids unchanged", () => {
		const fourBlockPitch = "# Block 1\n\nBlock 2 text.\n\n## Block 3\n\nBlock 4 text.\n";
		const editedPitch = "# Block 1\n\nBlock 2 text modified foo.\n\n## Block 3\n\nBlock 4 text.\n";

		const { blocks: before } = deriveBlocks(fourBlockPitch, { kind: "bet", id: "edit-test" });
		const { blocks: after } = deriveBlocks(editedPitch, { kind: "bet", id: "edit-test" });

		expect(before).toHaveLength(4);
		expect(after).toHaveLength(4);

		// Block 0 (heading 1) — unchanged.
		expect(before[0]!.id).toBe(after[0]!.id);
		// Block 1 (paragraph) — changed.
		expect(before[1]!.id).not.toBe(after[1]!.id);
		// Block 2 (heading 3) — unchanged.
		expect(before[2]!.id).toBe(after[2]!.id);
		// Block 3 (paragraph) — unchanged.
		expect(before[3]!.id).toBe(after[3]!.id);
	});

	// ----------------------------------------------------------------
	// Case 5: empty pitch renders nothing
	// ----------------------------------------------------------------
	it("case 5: empty pitch renders no bet-pitch section", () => {
		renderWithBet({ ...BASE_BET, description: "" });
		expect(document.querySelector("[data-testid='bet-pitch']")).toBeNull();
	});

	// ----------------------------------------------------------------
	// Case 6: whitespace-only pitch renders nothing
	// ----------------------------------------------------------------
	it("case 6: whitespace-only pitch renders no bet-pitch section", () => {
		renderWithBet({ ...BASE_BET, description: "   \n\n  " });
		expect(document.querySelector("[data-testid='bet-pitch']")).toBeNull();
	});

	// ----------------------------------------------------------------
	// Case 7: malformed pitch — unknown payload without crash
	// ----------------------------------------------------------------
	it("case 7: oversize pitch triggers UnknownPayload without crashing", () => {
		// Content sized just over MAX_BODY_BYTES triggers body-too-large → unknown block.
		const oversize = "a".repeat(MAX_BODY_BYTES + 1);

		// Verify deriveBlocks produces unknown for oversize content.
		const { blocks } = deriveBlocks(oversize, { kind: "bet", id: "over-test" });
		expect(blocks.length).toBe(1);
		expect(blocks[0]!.payload.kind).toBe("unknown");

		// Render the page — it must not crash.
		renderWithBet({ ...BASE_BET, description: oversize });
		const section = document.querySelector("[data-testid='bet-pitch']");
		expect(section).toBeTruthy();
		const unknownBlock = section?.querySelector("[data-ds-kind='unknown']");
		expect(unknownBlock).toBeTruthy();
	});

	// ----------------------------------------------------------------
	// Case 8: useBet hook is the runtime data source (positive AC-3 path)
	// ----------------------------------------------------------------
	it("case 8: useBet hook is the runtime data source when no overrideBet is provided", async () => {
		const shapedBet: BetDetail = {
			...BASE_BET,
			id: "api-bet",
			description: "# API Heading\n\nAPI paragraph.\n",
		};

		// Override the module-level mock for this test.
		const { useBet } = await import("../hooks/useBet");
		vi.mocked(useBet).mockReturnValue({
			data: shapedBet,
			loading: false,
			error: null,
			refresh: vi.fn(),
		});

		renderWithoutOverride("api-bet");

		const section = document.querySelector("[data-testid='bet-pitch']");
		expect(section).toBeTruthy();
		// The heading from the API bet pitch must be rendered.
		const heading = section?.querySelector("h1, h2");
		expect(heading?.textContent).toContain("API Heading");
	});
});
