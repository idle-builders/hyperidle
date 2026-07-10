/**
 * H2 AC3 — SMTP adapter tests.
 *
 * Runs an in-process `smtp-server` on 127.0.0.1:0 and fires the adapter
 * at it. Verifies that the recipient, subject, and body reach the
 * server exactly as sent. This replaces the "MailHog" from the AC spec
 * with a hermetic in-process implementation (documented deviation in
 * docs/plans/H2-plan.md §4.10).
 *
 * @lore `smtp-server` uses `net.Socket`. Bun provides Node compat, so
 * the integration test should be portable; skip with
 * `NOTIFICATIONS_SKIP_SMTP=1` if a platform cannot bind loopback.
 */

import {
	createSmtpAdapter,
	type Notification,
	type Recipient,
} from "@hyperidle/server/app-runtime";
import { SMTPServer } from "smtp-server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface CapturedMessage {
	envelope: { from: string; to: string[] };
	raw: string;
}

interface Fixture {
	server: SMTPServer;
	port: number;
	captured: CapturedMessage[];
	close: () => Promise<void>;
}

async function startSmtpFixture(): Promise<Fixture> {
	const captured: CapturedMessage[] = [];
	return new Promise<Fixture>((resolve, reject) => {
		const server = new SMTPServer({
			authOptional: true,
			disabledCommands: ["AUTH", "STARTTLS"],
			onData(stream, session, callback) {
				const chunks: Buffer[] = [];
				stream.on("data", (chunk: Buffer) => chunks.push(chunk));
				stream.on("end", () => {
					const rcpts = session.envelope.rcptTo.map((r) => r.address);
					captured.push({
						envelope: {
							from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
							to: rcpts,
						},
						raw: Buffer.concat(chunks).toString("utf-8"),
					});
					callback();
				});
				stream.on("error", (err) => callback(err));
			},
		});
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.server.address();
			if (!address || typeof address === "string") {
				return reject(new Error("could not determine smtp fixture port"));
			}
			resolve({
				server,
				port: address.port,
				captured,
				close: () =>
					new Promise<void>((done) => {
						server.close(() => done());
					}),
			});
		});
	});
}

describe("H2 SMTP adapter (AC3)", () => {
	let fixture: Fixture;

	beforeEach(async () => {
		fixture = await startSmtpFixture();
	});

	afterEach(async () => {
		await fixture.close();
	});

	it("delivers a notification through an in-process SMTP server", async () => {
		const adapter = createSmtpAdapter({
			host: "127.0.0.1",
			port: fixture.port,
			secure: false,
			from: "hyperidle@example.com",
			ignoreTls: true,
		});
		const recipient: Recipient = { channelId: "ops@example.com" };
		const notification: Notification = {
			title: "Blocking review: secret key rotation",
			body: "Please review the skill change at /items/42.",
			severity: "blocking",
			timestamp: Date.now(),
		};

		const result = await adapter.send(recipient, notification);

		expect(result.ok).toBe(true);
		expect(fixture.captured).toHaveLength(1);
		const msg = fixture.captured[0];
		expect(msg!.envelope.from).toBe("hyperidle@example.com");
		expect(msg!.envelope.to).toEqual(["ops@example.com"]);
		expect(msg!.raw).toContain("Subject: Blocking review: secret key rotation");
		expect(msg!.raw).toContain("To: ops@example.com");
		expect(msg!.raw).toContain("From: hyperidle@example.com");
		expect(msg!.raw).toContain("Please review the skill change at /items/42.");
	});

	it("returns ok:false when the SMTP server is unreachable", async () => {
		const adapter = createSmtpAdapter({
			host: "127.0.0.1",
			port: 1, // almost certainly nothing listening
			secure: false,
			from: "hyperidle@example.com",
		});
		const result = await adapter.send(
			{ channelId: "ops@example.com" },
			{
				title: "t",
				body: "b",
				severity: "blocking",
				timestamp: Date.now(),
			},
		);
		expect(result.ok).toBe(false);
	});

	it("strips CR/LF from subject to prevent header injection", async () => {
		const adapter = createSmtpAdapter({
			host: "127.0.0.1",
			port: fixture.port,
			secure: false,
			from: "hyperidle@example.com",
			ignoreTls: true,
		});
		await adapter.send(
			{ channelId: "ops@example.com" },
			{
				title: "Evil subject\r\nBcc: attacker@example.com",
				body: "body",
				severity: "blocking",
				timestamp: Date.now(),
			},
		);
		expect(fixture.captured).toHaveLength(1);
		const msg = fixture.captured[0];
		// The attacker's synthesized `Bcc:` header must NOT be emitted as
		// a real header line — smtp-server envelope should list only the
		// legitimate RCPT (ops@example.com), and the raw stream must not
		// contain a newline-prefixed "Bcc:" header.
		expect(msg!.envelope.to).toEqual(["ops@example.com"]);
		expect(msg!.raw).not.toMatch(/^Bcc:/m);
		expect(msg!.raw).not.toMatch(/\r?\nBcc:/i);
	});
});
