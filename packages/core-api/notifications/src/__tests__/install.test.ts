import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test, vi } from "vitest";
import { updateConfig } from "../install.js";
import type { NotificationsDeps } from "../ports.js";

const db = {} as HyperIdleDb;

function deliveryConfig() {
	return {
		enabled: false,
		primaryChannel: "console" as const,
		digestChannel: null,
		recipientEmail: null,
		recipientNtfyTopic: null,
		ntfyBaseUrl: "https://ntfy.sh",
		smtpHost: null,
		smtpPort: 587,
		smtpSecure: false,
		smtpUsername: null,
		smtpFrom: null,
		floodMaxPerMinute: 10,
		floodCoalesceWindowMs: 60_000,
		testMaxPerHour: 10,
		smtpIgnoreTls: false,
		digestCron: "0 9 * * *",
	};
}

function makeDeps(
	encryptCredentialValue: (plaintext: string) => string,
	upsert: NotificationsDeps["credentialStore"]["upsert"] = vi.fn(async () => undefined),
) {
	const serverConfig = {
		read: vi.fn(async () => ({
			notifications: {
				delivery: deliveryConfig(),
				mutedTypes: [],
				silence: {
					mode: false,
					silencedTeamIds: [],
					windowStart: null,
					windowEnd: null,
				},
			},
		})),
		update: vi.fn(async () => undefined),
	};
	const credentialStore = {
		findByName: vi.fn<NotificationsDeps["credentialStore"]["findByName"]>(async () => undefined),
		upsert: vi.fn(upsert),
		deleteByName: vi.fn(async () => undefined),
	};
	const deps: NotificationsDeps = {
		serverConfig,
		credentialCipher: {
			encryptCredentialValue: vi.fn(encryptCredentialValue),
			decryptCredentialValue: vi.fn(() => null),
		},
		credentialStore,
		users: { getUserById: vi.fn(async () => undefined) },
		teams: { getTeamMembersById: vi.fn(async () => undefined) },
		work: {
			listQueuedItemsSince: vi.fn(async () => []),
			getItemById: vi.fn(async () => undefined),
		},
	};
	return { deps, serverConfig, credentialStore };
}

describe("notification secret-write errors", () => {
	test("suppresses only MISSING_ROOT_SECRET and performs no credential upsert", async () => {
		const missingRootSecret = Object.assign(new Error("root secret missing"), {
			code: "MISSING_ROOT_SECRET",
		});
		const { deps, credentialStore } = makeDeps(() => {
			throw missingRootSecret;
		});

		const result = await updateConfig(db, { smtpPassword: "secret" }, deps);

		expect(credentialStore.upsert).not.toHaveBeenCalled();
		expect(result.smtp.passwordSet).toBe(false);
		expect(result.smtp.password).toBeNull();
	});

	test("rejects an arbitrary cipher error without upsert or false-success continuation", async () => {
		const cipherError = new Error("cipher implementation failed");
		const { deps, credentialStore, serverConfig } = makeDeps(() => {
			throw cipherError;
		});

		await expect(updateConfig(db, { smtpPassword: "secret" }, deps)).rejects.toBe(cipherError);
		expect(credentialStore.upsert).not.toHaveBeenCalled();
		expect(serverConfig.read).not.toHaveBeenCalled();
	});

	test("rejects a credential-store upsert failure", async () => {
		const writeError = new Error("credential store unavailable");
		const { deps, credentialStore, serverConfig } = makeDeps(
			() => "encrypted-secret",
			async () => {
				throw writeError;
			},
		);

		await expect(updateConfig(db, { smtpPassword: "secret" }, deps)).rejects.toBe(writeError);
		expect(credentialStore.upsert).toHaveBeenCalledOnce();
		expect(serverConfig.read).not.toHaveBeenCalled();
	});

	test("persists a successful encryption once and returns redacted config", async () => {
		const { deps, credentialStore } = makeDeps(() => "encrypted-secret");
		credentialStore.findByName.mockResolvedValue({
			name: "notifications.smtp_password",
			encryptedValue: "encrypted-secret",
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: "2026-07-24T00:00:00.000Z",
		});
		deps.credentialCipher.decryptCredentialValue = vi.fn(() => "secret");

		const result = await updateConfig(db, { smtpPassword: "secret" }, deps);

		expect(credentialStore.upsert).toHaveBeenCalledOnce();
		expect(credentialStore.upsert).toHaveBeenCalledWith(
			db,
			expect.objectContaining({
				name: "notifications_smtp_password",
				encryptedValue: "encrypted-secret",
			}),
		);
		expect(result.smtp.passwordSet).toBe(true);
		expect(result.smtp.password).toBe("***");
		expect(JSON.stringify(result)).not.toContain("secret");
	});
});
