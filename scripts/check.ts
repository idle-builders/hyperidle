#!/usr/bin/env tsx
// Typecheck wrapper. Groups errors by file, caps at 10 files, outputs TOON.
// Called via: npm run check

import { spawn } from "node:child_process";
import { capByFile, groupByFile, toToon } from "./lib/output-cap.js";

const MAX_FILES = 10;
// tsc error format: path(line,col): error TS1234: message
const TS_ERROR_RE = /^(.+?)\(\d+,\d+\): error TS\d+:.+$/;

const child = spawn("tsc", ["--noEmit", "-p", "tsconfig.json"], {
	stdio: ["ignore", "pipe", "pipe"],
});
const chunks: string[] = [];
child.stdout.on("data", (c: Buffer) => chunks.push(c.toString()));
child.stderr.on("data", (c: Buffer) => chunks.push(c.toString()));

child.on("close", (code) => {
	if (code === 0) {
		process.stdout.write("status: passed\ntool: check\ntotalErrors: 0\n");
		process.exit(0);
	}
	const output = chunks.join("");
	const grouped = groupByFile(output, TS_ERROR_RE);
	const result = capByFile(grouped, MAX_FILES);
	result.tool = "check";
	process.stderr.write(`${toToon(result)}\n`);
	process.exit(1);
});
