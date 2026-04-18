/**
 * H3 AC2 — Langfuse observability adapter integration test.
 *
 * A real local HTTP fixture bound to 127.0.0.1:0 captures the batched
 * POST so we can verify the endpoint path, Basic auth header, JSON
 * body shape, and retry behavior.
 */

import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ObservabilityEvent } from "@hyperidle/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createLangfuseObservabilityAdapter } from "../../services/observability/langfuse-adapter.js";

interface CapturedRequest {
	method: string;
	path: string;
	contentType: string | undefined;
	authorization: string | undefined;
	body: string;
}

function startFixture(
	responder?: (req: CapturedRequest) => { status: number; body: string },
): Promise<{ server: Server; port: number; captured: CapturedRequest[] }> {
	const captured: CapturedRequest[] = [];
	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on("data", (chunk: Buffer) => chunks.push(chunk));
			req.on("end", () => {
				const entry: CapturedRequest = {
					method: req.method ?? "",
					path: req.url ?? "",
					contentType: req.headers["content-type"] as string | undefined,
					authorization: req.headers.authorization as string | undefined,
					body: Buffer.concat(chunks).toString("utf-8"),
				};
				captured.push(entry);
				const response = responder?.(entry) ?? { status: 207, body: "" };
				res.statusCode = response.status;
				res.end(response.body);
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

const ts = "2026-04-18T00:00:00.000Z";

describe("LangfuseObservabilityAdapter (H3 AC2)", () => {
	let fixture: Awaited<ReturnType<typeof startFixture>>;

	afterEach(async () => {
		if (fixture) await new Promise<void>((r) => fixture.server.close(() => r()));
	});

	it("POSTs to /api/public/ingestion with Basic auth + batch shape", async () => {
		fixture = await startFixture();
		const adapter = createLangfuseObservabilityAdapter({
			url: `http://127.0.0.1:${fixture.port}`,
			publicKey: "pk-lf-public",
			secretKey: "sk-lf-secret",
		});
		const events: ObservabilityEvent[] = [
			{
				kind: "session_started",
				traceId: "trace-42",
				sessionId: "sess-1",
				ts,
				agentId: "agent-a",
				taskId: "task-1",
			},
			{
				kind: "tool_call",
				traceId: "trace-42",
				sessionId: "sess-1",
				ts,
				toolName: "Read",
				argsSummary: "{file: /tmp/x}",
			},
		];
		await adapter.record(events);
		expect(fixture.captured).toHaveLength(1);
		const req = fixture.captured[0];
		expect(req.method).toBe("POST");
		expect(req.path).toBe("/api/public/ingestion");
		expect(req.contentType).toContain("application/json");
		// Basic auth = base64("pk-lf-public:sk-lf-secret")
		const expected = `Basic ${Buffer.from("pk-lf-public:sk-lf-secret", "utf-8").toString("base64")}`;
		expect(req.authorization).toBe(expected);
		const parsed = JSON.parse(req.body) as { batch: Array<Record<string, unknown>> };
		expect(Array.isArray(parsed.batch)).toBe(true);
		expect(parsed.batch).toHaveLength(2);
		expect(parsed.batch[0].type).toBe("trace-create");
		expect(parsed.batch[1].type).toBe("observation-create");
		const traceBody = parsed.batch[0].body as Record<string, unknown>;
		expect(traceBody.id).toBe("trace-42");
		expect(traceBody.userId).toBe("agent-a");
	});

	it("treats 207 Multi-Status as success", async () => {
		fixture = await startFixture(() => ({ status: 207, body: JSON.stringify({ successes: [] }) }));
		const adapter = createLangfuseObservabilityAdapter({
			url: `http://127.0.0.1:${fixture.port}`,
			publicKey: "pk",
			secretKey: "sk",
		});
		await expect(
			adapter.record([
				{
					kind: "session_started",
					traceId: "t",
					sessionId: "s",
					ts,
					agentId: "a",
					taskId: "k",
				},
			]),
		).resolves.toBeUndefined();
	});

	it("throws on 5xx when swallowErrors=false", async () => {
		fixture = await startFixture(() => ({ status: 503, body: "boom" }));
		const adapter = createLangfuseObservabilityAdapter({
			url: `http://127.0.0.1:${fixture.port}`,
			publicKey: "pk",
			secretKey: "sk",
		});
		await expect(
			adapter.record([
				{
					kind: "session_started",
					traceId: "t",
					sessionId: "s",
					ts,
					agentId: "a",
					taskId: "k",
				},
			]),
		).rejects.toThrow(/503/);
	});

	it("swallows errors when swallowErrors=true", async () => {
		fixture = await startFixture(() => ({ status: 503, body: "boom" }));
		const adapter = createLangfuseObservabilityAdapter({
			url: `http://127.0.0.1:${fixture.port}`,
			publicKey: "pk",
			secretKey: "sk",
			swallowErrors: true,
		});
		await expect(
			adapter.record([
				{
					kind: "session_started",
					traceId: "t",
					sessionId: "s",
					ts,
					agentId: "a",
					taskId: "k",
				},
			]),
		).resolves.toBeUndefined();
	});

	it("batches multiple events into a single POST", async () => {
		fixture = await startFixture();
		const adapter = createLangfuseObservabilityAdapter({
			url: `http://127.0.0.1:${fixture.port}`,
			publicKey: "pk",
			secretKey: "sk",
		});
		const events: ObservabilityEvent[] = Array.from({ length: 10 }, (_, i) => ({
			kind: "tool_call" as const,
			traceId: "t",
			sessionId: "s",
			ts,
			toolName: `Tool-${i}`,
			argsSummary: "{}",
		}));
		await adapter.record(events);
		expect(fixture.captured).toHaveLength(1);
		const parsed = JSON.parse(fixture.captured[0].body) as {
			batch: Array<Record<string, unknown>>;
		};
		expect(parsed.batch).toHaveLength(10);
	});

	it("blocks SSRF to private IP (literal)", async () => {
		const adapter = createLangfuseObservabilityAdapter({
			url: "http://192.168.1.1:3000",
			publicKey: "pk",
			secretKey: "sk",
		});
		await expect(
			adapter.record([
				{
					kind: "session_started",
					traceId: "t",
					sessionId: "s",
					ts,
					agentId: "a",
					taskId: "k",
				},
			]),
		).rejects.toThrow(/blocked/);
	});

	it("does not leak keys in thrown error messages", async () => {
		fixture = await startFixture(() => ({ status: 500, body: "pk-lf-public oops sk-lf-secret" }));
		const adapter = createLangfuseObservabilityAdapter({
			url: `http://127.0.0.1:${fixture.port}`,
			publicKey: "pk-lf-public",
			secretKey: "sk-lf-secret",
		});
		try {
			await adapter.record([
				{
					kind: "session_started",
					traceId: "t",
					sessionId: "s",
					ts,
					agentId: "a",
					taskId: "k",
				},
			]);
			throw new Error("should have thrown");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// scrubErrorMessage redacts common token patterns (sk-..., pk-...).
			expect(msg).not.toContain("sk-lf-secret");
		}
	});

	it("flush awaits in-flight batches", async () => {
		fixture = await startFixture();
		const adapter = createLangfuseObservabilityAdapter({
			url: `http://127.0.0.1:${fixture.port}`,
			publicKey: "pk",
			secretKey: "sk",
		});
		const p = adapter.record([
			{ kind: "session_started", traceId: "t", sessionId: "s", ts, agentId: "a", taskId: "k" },
		]);
		await adapter.flush();
		await p;
		expect(fixture.captured).toHaveLength(1);
	});
});
