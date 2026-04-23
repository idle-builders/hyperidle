import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ThreadItem } from "../components/ThreadSections";
import { groupThreadsIntoSections, ThreadSections } from "../components/ThreadSections";

const NOW = Date.parse("2026-04-19T12:00:00Z");
const AVATAR =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

const mkThread = (overrides: Partial<ThreadItem>): ThreadItem => ({
	id: overrides.id ?? "t1",
	title: overrides.title ?? "Default title",
	snippet: overrides.snippet ?? "Snippet",
	timestamp: overrides.timestamp ?? "just now",
	avatarUrl: overrides.avatarUrl ?? AVATAR,
	kind: overrides.kind ?? "chat",
	blocking: overrides.blocking ?? false,
	pinned: overrides.pinned ?? false,
	resolvedAt: overrides.resolvedAt,
});

describe("groupThreadsIntoSections", () => {
	it("places pinned threads in the Pinned section regardless of kind", () => {
		const threads: ThreadItem[] = [
			mkThread({ id: "p1", pinned: true, kind: "review" }),
			mkThread({ id: "p2", pinned: true, kind: "chat" }),
			mkThread({ id: "c1", kind: "chat" }),
		];
		const sections = groupThreadsIntoSections(threads, { now: NOW });
		const pinned = sections.find((s) => s.id === "pinned");
		expect(pinned?.items.map((i) => i.id)).toEqual(["p1", "p2"]);
	});

	it("places blocking (non-pinned) threads in the Blocking section ahead of kind groups", () => {
		const threads: ThreadItem[] = [
			mkThread({ id: "c1", kind: "chat" }),
			mkThread({ id: "c2", kind: "chat" }),
			mkThread({ id: "c3", kind: "chat" }),
			mkThread({ id: "r1", kind: "review", blocking: false }),
			mkThread({ id: "b1", kind: "review", blocking: true }),
			mkThread({ id: "b2", kind: "review", blocking: true }),
		];
		const sections = groupThreadsIntoSections(threads, { now: NOW });
		const order = sections.map((s) => s.id);
		// Blocking must come before Chats and Reviews
		expect(order.indexOf("blocking")).toBeLessThan(order.indexOf("reviews"));
		expect(order.indexOf("blocking")).toBeLessThan(order.indexOf("chats"));
		expect(sections.find((s) => s.id === "blocking")?.items.map((i) => i.id)).toEqual(["b1", "b2"]);
	});

	it("a blocking chat outranks a non-blocking review", () => {
		// The critical rule: blocking outranks kind.
		const threads: ThreadItem[] = [
			mkThread({ id: "r1", kind: "review", blocking: false }),
			mkThread({ id: "bc1", kind: "chat", blocking: true }),
		];
		const sections = groupThreadsIntoSections(threads, { now: NOW });
		const blocking = sections.find((s) => s.id === "blocking");
		const reviews = sections.find((s) => s.id === "reviews");
		expect(blocking?.items.map((i) => i.id)).toContain("bc1");
		expect(reviews?.items.map((i) => i.id)).toContain("r1");
		// And blocking section comes before reviews
		const order = sections.map((s) => s.id);
		expect(order.indexOf("blocking")).toBeLessThan(order.indexOf("reviews"));
	});

	it("groups non-blocking reviews and chats into their own sections", () => {
		const threads: ThreadItem[] = [
			mkThread({ id: "r1", kind: "review" }),
			mkThread({ id: "c1", kind: "chat" }),
			mkThread({ id: "r2", kind: "review" }),
		];
		const sections = groupThreadsIntoSections(threads, { now: NOW });
		expect(sections.find((s) => s.id === "reviews")?.items.map((i) => i.id)).toEqual(["r1", "r2"]);
		expect(sections.find((s) => s.id === "chats")?.items.map((i) => i.id)).toEqual(["c1"]);
	});

	it("surfaces resolved items from within the last 24h in the Resolved section", () => {
		const within24h = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
		const older = new Date(NOW - 30 * 60 * 60 * 1000).toISOString();
		const threads: ThreadItem[] = [
			mkThread({ id: "r1", kind: "review", resolvedAt: within24h }),
			mkThread({ id: "r2", kind: "review", resolvedAt: older }),
			mkThread({ id: "r3", kind: "review" }),
		];
		const sections = groupThreadsIntoSections(threads, { now: NOW });
		const resolved = sections.find((s) => s.id === "resolved");
		expect(resolved?.items.map((i) => i.id)).toEqual(["r1"]);
		// older resolved thread is filtered out entirely
		const allIds = sections.flatMap((s) => s.items.map((i) => i.id));
		expect(allIds).not.toContain("r2");
	});

	it("returns sections in the canonical order: Pinned → Blocking → Reviews → Chats → Resolved", () => {
		const threads: ThreadItem[] = [
			mkThread({ id: "p1", pinned: true }),
			mkThread({ id: "b1", blocking: true }),
			mkThread({ id: "r1", kind: "review" }),
			mkThread({ id: "c1", kind: "chat" }),
			mkThread({
				id: "res1",
				kind: "review",
				resolvedAt: new Date(NOW - 60_000).toISOString(),
			}),
		];
		const sections = groupThreadsIntoSections(threads, { now: NOW });
		expect(sections.map((s) => s.id)).toEqual([
			"pinned",
			"blocking",
			"reviews",
			"chats",
			"resolved",
		]);
	});

	it("omits empty sections", () => {
		const threads: ThreadItem[] = [mkThread({ id: "c1", kind: "chat" })];
		const sections = groupThreadsIntoSections(threads, { now: NOW });
		expect(sections.map((s) => s.id)).toEqual(["chats"]);
	});
});

describe("ThreadSections component", () => {
	const now = NOW;
	const threads: ThreadItem[] = [
		{
			id: "b1",
			title: "Deploy blocked",
			snippet: "Waiting on review",
			timestamp: "2m",
			avatarUrl: AVATAR,
			kind: "review",
			blocking: true,
			pinned: false,
		},
		{
			id: "b2",
			title: "Payment issue",
			snippet: "...",
			timestamp: "3m",
			avatarUrl: AVATAR,
			kind: "review",
			blocking: true,
			pinned: false,
		},
		{
			id: "c1",
			title: "Standup",
			snippet: "...",
			timestamp: "5m",
			avatarUrl: AVATAR,
			kind: "chat",
			blocking: false,
			pinned: false,
		},
		{
			id: "c2",
			title: "Retro notes",
			snippet: "...",
			timestamp: "15m",
			avatarUrl: AVATAR,
			kind: "chat",
			blocking: false,
			pinned: false,
		},
		{
			id: "c3",
			title: "Random",
			snippet: "...",
			timestamp: "20m",
			avatarUrl: AVATAR,
			kind: "chat",
			blocking: false,
			pinned: false,
		},
	];

	it("renders section headers for populated sections only", () => {
		render(<ThreadSections threads={threads} now={now} />);
		expect(screen.getByRole("heading", { name: /blocking/i })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /chats/i })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: /^pinned$/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /^resolved$/i })).toBeNull();
	});

	it("places the Blocking section's DOM position before the Chats section", () => {
		const { container } = render(<ThreadSections threads={threads} now={now} />);
		const sections = container.querySelectorAll("[data-thread-section]");
		const ids = Array.from(sections).map((s) => s.getAttribute("data-thread-section"));
		expect(ids.indexOf("blocking")).toBeLessThan(ids.indexOf("chats"));
	});

	it("shows the correct threads under each section heading", () => {
		const { container } = render(<ThreadSections threads={threads} now={now} />);
		const blocking = container.querySelector("[data-thread-section='blocking']") as HTMLElement;
		const chats = container.querySelector("[data-thread-section='chats']") as HTMLElement;
		expect(within(blocking).getByText("Deploy blocked")).toBeInTheDocument();
		expect(within(blocking).getByText("Payment issue")).toBeInTheDocument();
		expect(within(chats).getByText("Standup")).toBeInTheDocument();
		expect(within(chats).getByText("Retro notes")).toBeInTheDocument();
		expect(within(chats).getByText("Random")).toBeInTheDocument();
	});

	it("renders empty state when no threads provided", () => {
		render(<ThreadSections threads={[]} now={now} />);
		expect(screen.getByText(/no threads/i)).toBeInTheDocument();
	});
});
