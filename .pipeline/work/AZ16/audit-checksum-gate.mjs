#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const checksumFile = ".pipeline/work/AZ16/audit-checksums.sha256";
const entries = readFileSync(checksumFile, "utf8").trim().split("\n").map((line) => {
	const match = line.match(/^([a-f0-9]{64})  (.+)$/);
	if (!match) throw new Error(`invalid checksum row: ${line}`);
	return { expected: match[1], path: match[2] };
});
if (entries.length !== 6) throw new Error(`expected 6 frozen audit files, found ${entries.length}`);
const mismatches = entries.filter(({ expected, path }) =>
	createHash("sha256").update(readFileSync(path)).digest("hex") !== expected,
);
if (mismatches.length) throw new Error(`frozen AZ16 audit changed: ${mismatches.map(({ path }) => path).join(", ")}`);
console.log(`AZ16 frozen audit checksums OK (${entries.length} files)`);
