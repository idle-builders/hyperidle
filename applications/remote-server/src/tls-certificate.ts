import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createLogger } from "@hyperidle/diagnostics";
import * as acme from "acme-client";

/**
 * The server's own HTTPS certificate from Let's Encrypt, for a name on a domain Cloudflare hosts.
 * The name is proven with a DNS record, so it works where nothing on the internet can reach the
 * server — a home Wi-Fi. The certificate is kept in a folder and renewed when 30 days are left.
 */
export interface TlsConfig {
	readonly domain: string;
	readonly cloudflareToken: string;
	readonly dir: string;
}

export interface TlsCertificate {
	readonly key: string;
	readonly cert: string;
}

const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;
const CLOUDFLARE = "https://api.cloudflare.com/client/v4";
const log = createLogger({ pkg: "remote-server.tls" });

/** Null when the server is not asked to serve HTTPS. */
export function tlsConfigFrom(env: Record<string, string | undefined>): TlsConfig | null {
	const domain = env.HYPERIDLE_TLS_DOMAIN;
	const cloudflareToken = env.CLOUDFLARE_API_TOKEN;
	if (!(domain && cloudflareToken)) return null;
	return {
		domain,
		cloudflareToken,
		dir: env.HYPERIDLE_TLS_DIR ?? path.join(os.homedir(), ".hyperidle", "tls", domain),
	};
}

export function needsRenewal(notAfter: Date, now: Date): boolean {
	return notAfter.getTime() - now.getTime() < RENEW_BEFORE_MS;
}

async function cloudflare<T>(token: string, route: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${CLOUDFLARE}${route}`, {
		...init,
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
	});
	const body = (await res.json()) as { success: boolean; result: T; errors?: unknown };
	if (!body.success) throw new Error(`Cloudflare ${route}: ${JSON.stringify(body.errors)}`);
	return body.result;
}

/** The Cloudflare zone the name sits in: the longest of its parent names Cloudflare hosts. */
async function zoneIdFor(token: string, domain: string): Promise<string> {
	const labels = domain.split(".");
	for (let i = 0; i < labels.length - 1; i++) {
		const name = labels.slice(i).join(".");
		const [zone] = await cloudflare<{ id: string }[]>(token, `/zones?name=${name}`);
		if (zone) return zone.id;
	}
	throw new Error(`No Cloudflare zone holds ${domain}.`);
}

async function issue(cfg: TlsConfig): Promise<TlsCertificate> {
	const accountKeyPath = path.join(cfg.dir, "account.pem");
	if (!fs.existsSync(accountKeyPath))
		fs.writeFileSync(accountKeyPath, await acme.crypto.createPrivateKey(), { mode: 0o600 });
	const accountKey = fs.readFileSync(accountKeyPath);

	const zoneId = await zoneIdFor(cfg.cloudflareToken, cfg.domain);
	const records = new Map<string, string>();
	const client = new acme.Client({
		directoryUrl: acme.directory.letsencrypt.production,
		accountKey,
	});
	const [key, csr] = await acme.crypto.createCsr({ commonName: cfg.domain });
	const cert = await client.auto({
		csr,
		termsOfServiceAgreed: true,
		challengePriority: ["dns-01"],
		challengeCreateFn: async (authz, _challenge, keyAuthorization) => {
			const name = `_acme-challenge.${authz.identifier.value}`;
			const record = await cloudflare<{ id: string }>(
				cfg.cloudflareToken,
				`/zones/${zoneId}/dns_records`,
				{
					method: "POST",
					body: JSON.stringify({ type: "TXT", name, content: keyAuthorization, ttl: 60 }),
				},
			);
			records.set(keyAuthorization, record.id);
		},
		challengeRemoveFn: async (_authz, _challenge, keyAuthorization) => {
			const id = records.get(keyAuthorization);
			if (id)
				await cloudflare(cfg.cloudflareToken, `/zones/${zoneId}/dns_records/${id}`, {
					method: "DELETE",
				});
		},
	});
	return { key: key.toString(), cert };
}

/** The kept certificate, or a new one when there is none or it is close to running out. */
export async function ensureCertificate(cfg: TlsConfig, now = new Date()): Promise<TlsCertificate> {
	fs.mkdirSync(cfg.dir, { recursive: true, mode: 0o700 });
	const keyPath = path.join(cfg.dir, "key.pem");
	const certPath = path.join(cfg.dir, "cert.pem");
	if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
		const kept = {
			key: fs.readFileSync(keyPath, "utf-8"),
			cert: fs.readFileSync(certPath, "utf-8"),
		};
		if (!needsRenewal(acme.crypto.readCertificateInfo(kept.cert).notAfter, now)) return kept;
	}
	log.info("getting a certificate from Let's Encrypt", { domain: cfg.domain });
	const fresh = await issue(cfg);
	fs.writeFileSync(keyPath, fresh.key, { mode: 0o600 });
	fs.writeFileSync(certPath, fresh.cert, { mode: 0o600 });
	return fresh;
}
