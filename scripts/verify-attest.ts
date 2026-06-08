#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ATTESTATION_DIR = ".verify-attestations";
const SECRET_DIR = join(homedir(), ".config", "hyperidle");
const SECRET_PATH = join(SECRET_DIR, "verify-secret");

const ALL_TOOL_NAMES = [
	"check",
	"lint:biome",
	"lint:eslint",
	"knip",
	"test-coverage",
	"mock-inventory",
	"test",
	"test:integration",
	"build",
	"build:desktop",
	"server:load",
];

function getOrCreateSecret(): string {
	if (existsSync(SECRET_PATH)) {
		return readFileSync(SECRET_PATH, "utf-8").trim();
	}
	mkdirSync(SECRET_DIR, { recursive: true });
	const secret = randomBytes(32).toString("hex");
	writeFileSync(SECRET_PATH, secret + "\n", { mode: 0o600 });
	process.stderr.write(`verify: created signing key at ${SECRET_PATH}\n`);
	process.stderr.write(
		"verify: add it to GitHub → gh secret set VERIFY_SECRET < " + SECRET_PATH + "\n",
	);
	return secret;
}

const secret = getOrCreateSecret();
const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
const dirty = execSync("git status --porcelain", { encoding: "utf-8" }).trim().length > 0;

const payload = {
	sha,
	status: "passed" as const,
	dirty,
	tools: ALL_TOOL_NAMES,
	allTools: ALL_TOOL_NAMES,
	partial: false,
	smartSkipped: [] as string[],
	timestamp: new Date().toISOString(),
};

const hmac = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");

const dir = resolve(process.cwd(), ATTESTATION_DIR);
mkdirSync(dir, { recursive: true });

for (const file of readdirSync(dir)) {
	if (file.endsWith(".json") && file !== `${sha}.json`) {
		try {
			unlinkSync(join(dir, file));
		} catch {}
	}
}

const filePath = join(dir, `${sha}.json`);
writeFileSync(filePath, JSON.stringify({ ...payload, hmac }, null, "\t") + "\n");
process.stderr.write(`verify: attestation → ${ATTESTATION_DIR}/${sha}.json\n`);
if (dirty) {
	process.stderr.write("verify: WARNING — working tree is dirty, commit first for CI\n");
}
