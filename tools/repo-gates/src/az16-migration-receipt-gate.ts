#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	type AuditSite,
	type MigrationReceipt,
	type ReceiptOutcome,
	validateMigrationReceipts,
} from "./lib/az16-receipt-verdict.js";

const root = process.cwd();
const work = resolve(root, ".pipeline/work/AZ16");

function rows(path: string): string[][] {
	return readFileSync(path, "utf8")
		.trimEnd()
		.split("\n")
		.slice(1)
		.filter(Boolean)
		.map((line) => line.split("\t"));
}

const auditSites: AuditSite[] = [];
for (const name of [
	"typography-site-manifest.tsv",
	"motion-site-manifest.tsv",
	"border-site-manifest.tsv",
]) {
	const destinationColumn = name.startsWith("typography") ? 6 : 8;
	for (const row of rows(resolve(work, name))) {
		auditSites.push({ siteId: row[0] ?? "", destination: row[destinationColumn] ?? "" });
	}
}

const receipts: MigrationReceipt[] = [];
for (const name of readdirSync(work).filter((entry) =>
	/^migration-receipts-wave-\d+\.tsv$/.test(entry),
)) {
	for (const row of rows(resolve(work, name))) {
		receipts.push({
			auditSiteId: row[0] ?? "",
			auditDestination: row[1] ?? "",
			outcome: (row[2] ?? "") as ReceiptOutcome,
			profile: row[3] ?? "",
			finalPath: row[4] ?? "",
			finalLocator: row[5] ?? "",
		});
	}
}

const findings = validateMigrationReceipts(auditSites, receipts);
for (const receipt of receipts) {
	if (receipt.finalPath && !existsSync(resolve(root, receipt.finalPath))) {
		findings.push(`${receipt.auditSiteId}: final path does not exist`);
	}
}
if (findings.length > 0) {
	process.stderr.write(`${findings.join("\n")}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`az16-receipt-gate: OK (${receipts.length} immutable audit receipts)\n`);
}
