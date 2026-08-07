// @vitest-environment jsdom
/**
 * U8 red phase — Tier 2 Hearth restyle verification.
 *
 * Tests for:
 * - New structural elements (unread dot, colored border, icon circle)
 * - PitchCard deletion from design-system exports
 * - Hearth token presence on key components
 * - BetCard/TaskCard shadow+border surface lift
 * - Composer pill send button
 * - ThreadRow selected state shadow
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BetCard } from "../BetCard.js";
import { Composer } from "../Composer.js";
import { NotificationRow } from "../NotificationRow.js";
import { TaskCard } from "../TaskCard.js";
import { ThreadRow } from "../ThreadRow.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("U8 — Hearth restyle structural elements", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	// ── ThreadRow ─────────────────────────────────────────────────────────────

	describe("ThreadRow — unread dot", () => {
		it("renders a green unread dot when unread=true", () => {
			act(() => {
				root.render(
					createElement(ThreadRow, {
						title: "Thread title",
						snippet: "snippet",
						timestamp: "2h ago",
						unread: true,
					}),
				);
			});
			// The unread dot must be present in the DOM
			const dot = container.querySelector("[data-testid='unread-dot']");
			expect(dot).not.toBeNull();
		});

		it("renders a transparent spacer dot when unread=false (alignment maintained)", () => {
			// Mockup audit L-14: read rows must have a transparent spacer to keep
			// column alignment consistent with unread rows that show the green dot.
			act(() => {
				root.render(
					createElement(ThreadRow, {
						title: "Thread title",
						snippet: "snippet",
						timestamp: "2h ago",
						unread: false,
					}),
				);
			});
			const spacer = container.querySelector("[data-testid='read-dot-spacer']");
			expect(spacer).not.toBeNull();
			expect((spacer as HTMLElement | null)?.className ?? "").toContain("bg-transparent");
		});

		it("renders a transparent spacer dot by default (unread omitted)", () => {
			act(() => {
				root.render(
					createElement(ThreadRow, {
						title: "Thread title",
						snippet: "snippet",
						timestamp: "2h ago",
					}),
				);
			});
			const spacer = container.querySelector("[data-testid='read-dot-spacer']");
			expect(spacer).not.toBeNull();
		});

		it("unread dot uses accent-primary token class", () => {
			// Mockup audit L-13: dot uses var(--accent-primary), not var(--status-success).
			// Both resolve to the same forest green in Hearth Light, but the semantic
			// token is accent-primary (active indicator) not status-success (health state).
			act(() => {
				root.render(
					createElement(ThreadRow, {
						title: "Thread title",
						snippet: "snippet",
						timestamp: "2h ago",
						unread: true,
					}),
				);
			});
			const dot = container.querySelector("[data-testid='unread-dot']") as HTMLElement | null;
			expect(dot).not.toBeNull();
			// Dot must use the --accent-primary color token
			expect(dot?.className ?? "").toContain("accent-primary");
		});
	});

	describe("ThreadRow — selected state shadow", () => {
		it("selected state uses Hearth accent-primary border", () => {
			act(() => {
				root.render(
					createElement(ThreadRow, {
						avatarUrl: null,
						title: "Thread title",
						snippet: "snippet",
						timestamp: "2h ago",
						selected: true,
					}),
				);
			});
			const row = container.firstElementChild as HTMLElement;
			expect(row.className).toContain("accent-primary");
		});
	});

	// ── NotificationRow ───────────────────────────────────────────────────────

	describe("NotificationRow — colored left border", () => {
		it("renders a left border element", () => {
			act(() => {
				root.render(
					createElement(NotificationRow, {
						severity: "error",
						message: "Something failed",
						timestamp: "1m ago",
					}),
				);
			});
			// The colored left border should be present
			const bordered = container.querySelector("[data-testid='severity-border']");
			expect(bordered).not.toBeNull();
		});

		it("left border is present for severity=healthy", () => {
			act(() => {
				root.render(
					createElement(NotificationRow, {
						severity: "healthy",
						message: "All good",
						timestamp: "1m ago",
					}),
				);
			});
			const bordered = container.querySelector("[data-testid='severity-border']");
			expect(bordered).not.toBeNull();
		});
	});

	describe("NotificationRow — icon circle", () => {
		it("renders an icon circle before the StatusChip", () => {
			act(() => {
				root.render(
					createElement(NotificationRow, {
						severity: "error",
						message: "Something failed",
						timestamp: "1m ago",
					}),
				);
			});
			const iconCircle = container.querySelector("[data-testid='severity-icon-circle']");
			expect(iconCircle).not.toBeNull();
		});

		it("icon circle has the expected shape class (rounded-full or r-pill)", () => {
			act(() => {
				root.render(
					createElement(NotificationRow, {
						severity: "healthy",
						message: "All good",
						timestamp: "1m ago",
					}),
				);
			});
			const iconCircle = container.querySelector(
				"[data-testid='severity-icon-circle']",
			) as HTMLElement | null;
			expect(iconCircle).not.toBeNull();
			expect(iconCircle?.className ?? "").toMatch(/rounded-full|r-pill/);
		});
	});

	// ── BetCard ───────────────────────────────────────────────────────────────

	describe("BetCard — Hearth surface lift", () => {
		it("outer element uses surface-elevated token", () => {
			act(() => {
				root.render(
					createElement(BetCard, {
						title: "Ship auth",
						team: "Platform",
						status: "draft",
						appetite: "2 weeks",
					}),
				);
			});
			const card = container.firstElementChild as HTMLElement;
			expect(card.className).toContain("surface-elevated");
		});

		it("outer element uses r-default radius token", () => {
			act(() => {
				root.render(
					createElement(BetCard, {
						title: "Ship auth",
						team: "Platform",
						status: "draft",
						appetite: "2 weeks",
					}),
				);
			});
			const card = container.firstElementChild as HTMLElement;
			expect(card.className).toContain("r-default");
		});

		it("outer element has shadow-default class", () => {
			act(() => {
				root.render(
					createElement(BetCard, {
						title: "Ship auth",
						team: "Platform",
						status: "draft",
						appetite: "2 weeks",
					}),
				);
			});
			const card = container.firstElementChild as HTMLElement;
			expect(card.className).toContain("shadow-default");
		});

		it("outer element does NOT have explicit border (mockup uses shadow only)", () => {
			// visual-parity-audit: BetCard story/baseline uses shadow-default only, no explicit border
			act(() => {
				root.render(
					createElement(BetCard, {
						title: "Ship auth",
						team: "Platform",
						status: "draft",
						appetite: "2 weeks",
					}),
				);
			});
			const card = container.firstElementChild as HTMLElement;
			// Card uses shadow-default for elevation, no border needed
			expect(card.className).toContain("shadow-default");
			expect(card.className).not.toContain("border border-[");
		});

		it("outer element has hover translate-y lift class", () => {
			act(() => {
				root.render(
					createElement(BetCard, {
						title: "Ship auth",
						team: "Platform",
						status: "draft",
						appetite: "2 weeks",
					}),
				);
			});
			const card = container.firstElementChild as HTMLElement;
			expect(card.className).toContain("hover:translate-y-");
		});

		it("does NOT use old Lucid token surface-4", () => {
			act(() => {
				root.render(
					createElement(BetCard, {
						title: "Ship auth",
						team: "Platform",
						status: "draft",
						appetite: "2 weeks",
					}),
				);
			});
			expect(container.innerHTML).not.toContain("surface-4");
		});

		it("does NOT use old Lucid token surface-6", () => {
			act(() => {
				root.render(
					createElement(BetCard, {
						title: "Ship auth",
						team: "Platform",
						status: "draft",
						appetite: "2 weeks",
					}),
				);
			});
			expect(container.innerHTML).not.toContain("surface-6");
		});
	});

	// ── TaskCard ──────────────────────────────────────────────────────────────

	describe("TaskCard — Hearth surface lift", () => {
		it("outer element uses surface-elevated token", () => {
			act(() => {
				root.render(
					createElement(TaskCard, {
						title: "Fix bug",
						owner: "Alice",
						state: "in_progress",
					}),
				);
			});
			const card = container.firstElementChild as HTMLElement;
			expect(card.className).toContain("surface-elevated");
		});

		it("outer element has shadow-default class", () => {
			act(() => {
				root.render(
					createElement(TaskCard, {
						title: "Fix bug",
						owner: "Alice",
						state: "in_progress",
					}),
				);
			});
			const card = container.firstElementChild as HTMLElement;
			expect(card.className).toContain("shadow-default");
		});

		it("blocked state uses status-error token instead of danger", () => {
			act(() => {
				root.render(
					createElement(TaskCard, {
						title: "Fix bug",
						owner: "Alice",
						state: "blocked",
					}),
				);
			});
			const card = container.firstElementChild as HTMLElement;
			expect(card.className).toContain("status-error");
			expect(card.className).not.toContain("--danger");
		});
	});

	// ── Composer ──────────────────────────────────────────────────────────────

	describe("Composer — pill send button", () => {
		it("send button uses r-pill radius", () => {
			act(() => {
				root.render(
					createElement(Composer, {
						threadId: "t1",
						onSubmit: async () => {},
					}),
				);
			});
			const sendBtn = container.querySelector("button[type='button']") as HTMLElement | null;
			expect(sendBtn).not.toBeNull();
			expect(sendBtn?.className ?? "").toContain("r-pill");
		});

		it("send button uses accent-primary background", () => {
			act(() => {
				root.render(
					createElement(Composer, {
						threadId: "t1",
						onSubmit: async () => {},
					}),
				);
			});
			const sendBtn = container.querySelector("button[type='button']") as HTMLElement | null;
			expect(sendBtn?.className ?? "").toContain("accent-primary");
		});

		it("send button does NOT use old --accent token", () => {
			act(() => {
				root.render(
					createElement(Composer, {
						threadId: "t1",
						onSubmit: async () => {},
					}),
				);
			});
			expect(container.innerHTML).not.toContain("var(--accent)");
		});
	});
});

// ── PitchCard deletion ────────────────────────────────────────────────────────

describe("U8 — PitchCard deleted from design-system", () => {
	it("PitchCard is NOT exported from @hyperidle/design-system index", async () => {
		const indexModule = await import("../index.js");
		expect("PitchCard" in indexModule).toBe(false);
		expect("PitchCardProps" in indexModule).toBe(false);
	});

	it("PitchCard.tsx does not exist at the source path", async () => {
		const { existsSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const filePath = resolve(__dirname, "../PitchCard.tsx");
		expect(existsSync(filePath)).toBe(false);
	});

	it("PitchCard.stories.tsx does not exist", async () => {
		const { existsSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const filePath = resolve(__dirname, "../PitchCard.stories.tsx");
		expect(existsSync(filePath)).toBe(false);
	});
});
