/**
 * H2 AC2 — Ntfy adapter tests.
 *
 * Combines a unit-style happy-path (injected fetch) with a proper
 * integration test against a real local HTTP fixture bound to
 * `127.0.0.1:0`. Proves that headers, body, and path match the
 * documented ntfy.sh shape.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNtfyAdapter } from "../../notifications/ntfy-adapter.js";
import type { Notification, Recipient } from "../../notifications/types.js";

interface CapturedRequest {
	method: string;
	path: string;
	headers: Record<string, string | undefined>;
	body: string;
}

function startFixture(): Promise<{ server: Server; port: number; captured: CapturedRequest[] }> {
	const captured: CapturedRequest[] = [];
	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on("data", (chunk: Buffer) => chunks.push(chunk));
			req.on("end", () => {
				captured.push({
					method: req.method ?? "",
					path: req.url ?? "",
					headers: {
						title: req.headers.title as string | undefined,
						priority: req.headers.priority as string | undefined,
						tags: req.headers.tags as string | undefined,
						authorization: req.headers.authorization as string | undefined,
					},
					body: Buffer.concat(chunks).toString("utf-8"),
				});
				res.statusCode = 200;
				res.end("ok");
			});
		});
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address() as AddressInfo | null;
			if (!address) return reject(new Error("no address"));
			resolve({ server, port: address.port, captured });
		});
	});
}

describe("H2 Ntfy adapter (AC2)", () => {
	let fixture: Awaited<ReturnType<typeof startFixture>>;

	beforeEach(async () => {
		fixture = await startFixture();
	});

	afterEach(async () => {
		await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
	});

	it("POSTs to /<topic> with Title, Priority, Tags headers and plain body", async () => {
		const baseUrl = `http://127.0.0.1:${fixture.port}`;
		const adapter = createNtfyAdapter({ baseUrl });
		const recipient: Recipient = { channelId: "factory-alerts" };
		const notification: Notification = {
			title: "Blocking review",
			body: "Operator intervention requested.",
			severity: "blocking",
			tags: ["blocking", "review"],
			timestamp: Date.now(),
		};

		const result = await adapter.send(recipient, notification);

		expect(result.ok).toBe(true);
		expect(fixture.captured).toHaveLength(1);
		const req = fixture.captured[0];
		expect(req!.method).toBe("POST");
		expect(req!.path).toBe("/factory-alerts");
		expect(req!.headers.title).toBe("Blocking review");
		expect(req!.headers.priority).toBe("urgent");
		expect(req!.headers.tags).toBe("blocking,review");
		expect(req!.body).toBe("Operator intervention requested.");
		expect(req!.headers.authorization).toBeUndefined();
	});

	it("includes Authorization: Bearer <token> when a token is configured", async () => {
		const baseUrl = `http://127.0.0.1:${fixture.port}`;
		const adapter = createNtfyAdapter({ baseUrl, authToken: "tk_abcdef" });
		await adapter.send(
			{ channelId: "secret-topic" },
			{
				title: "t",
				body: "b",
				severity: "cost_breach",
				timestamp: Date.now(),
			},
		);
		expect(fixture!.captured[0]!.headers.authorization).toBe("Bearer tk_abcdef");
		expect(fixture!.captured[0]!.headers.priority).toBe("high");
	});

	it("returns ok:false retriable:true on 5xx", async () => {
		const adapter = createNtfyAdapter({
			baseUrl: `http://127.0.0.1:${fixture.port}`,
			fetch: async () => new Response("boom", { status: 503 }),
		});
		const result = await adapter.send(
			{ channelId: "t" },
			{
				title: "t",
				body: "b",
				severity: "blocking",
				timestamp: Date.now(),
			},
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.retriable).toBe(true);
		}
	});

	it("returns ok:false retriable:false on 4xx", async () => {
		const adapter = createNtfyAdapter({
			baseUrl: `http://127.0.0.1:${fixture.port}`,
			fetch: async () => new Response("bad topic", { status: 403 }),
		});
		const result = await adapter.send(
			{ channelId: "t" },
			{
				title: "t",
				body: "b",
				severity: "blocking",
				timestamp: Date.now(),
			},
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.retriable).toBe(false);
		}
	});

	it("rejects invalid topic with non-retriable error", async () => {
		const adapter = createNtfyAdapter({
			baseUrl: `http://127.0.0.1:${fixture.port}`,
		});
		const result = await adapter.send(
			{ channelId: "bad topic with spaces" },
			{
				title: "t",
				body: "b",
				severity: "blocking",
				timestamp: Date.now(),
			},
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.retriable).toBe(false);
			expect(result.error).toContain("invalid topic");
		}
	});

	it("refuses to construct with a non-https non-loopback URL", () => {
		expect(() => createNtfyAdapter({ baseUrl: "http://evil.example.com" })).toThrow();
	});
});
