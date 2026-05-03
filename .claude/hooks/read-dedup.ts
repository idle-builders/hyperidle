#!/usr/bin/env bun
// PreToolUse hook: deduplicates Read calls within a Claude Code session.
//
// Wired in .claude/settings.json under hooks.PreToolUse for the Read tool.
// On a duplicate Read of an unchanged file, emits a block decision so the
// agent references prior content instead of paying the read tokens again.
//
// State: per-session JSON map of { absolutePath: { mtimeMs, readAtIso } }
// stored in $TMPDIR (or /tmp). Allow-list rule: re-read is permitted if the
// file's current mtime is newer than the cached mtime, OR if the file has
// since been written/edited (handled implicitly by the mtime check — Edit
// and Write bump mtime).
//
// Hook contract (Claude Code):
// - stdin: JSON { session_id, tool_name, tool_input, ... }
// - non-blocking pass: exit 0 with empty stdout
// - block: stdout JSON { decision: "block", reason: "..." }, exit 0

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

type CacheEntry = { mtimeMs: number; readAtIso: string };
type Cache = Record<string, CacheEntry>;

function readStdin(): string {
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
}

function passThrough(): never {
	process.exit(0);
}

function block(reason: string): never {
	process.stdout.write(JSON.stringify({ decision: "block", reason }));
	process.exit(0);
}

const raw = readStdin();
if (!raw.trim()) passThrough();

// biome-ignore lint/suspicious/noExplicitAny: external JSON contract (Claude Code hook payload)
let payload: any;
try {
	payload = JSON.parse(raw);
} catch {
	passThrough();
}

const tool: string = payload?.tool_name ?? "";
const filePath: string | undefined = payload?.tool_input?.file_path;
const sessionId: string = payload?.session_id ?? "default";
const cwd: string = payload?.cwd ?? process.cwd();

if (tool !== "Read" || !filePath) passThrough();

const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
if (!existsSync(abs)) passThrough();

let stat: ReturnType<typeof statSync>;
try {
	stat = statSync(abs);
} catch {
	passThrough();
}
if (stat.isDirectory()) passThrough();

const cacheDir = join(tmpdir(), "claude-read-dedup");
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
const cachePath = join(cacheDir, `${sessionId}.json`);

let cache: Cache = {};
if (existsSync(cachePath)) {
	try {
		cache = JSON.parse(readFileSync(cachePath, "utf8"));
	} catch {
		cache = {};
	}
}

const cached = cache[abs];
const currentMtime = stat.mtimeMs;

if (cached && currentMtime <= cached.mtimeMs) {
	block(
		`Already read ${abs} this session at ${cached.readAtIso} (file unchanged since). Reference the prior Read result instead of re-loading. If you genuinely need to re-read, edit or write the file first.`,
	);
}

cache[abs] = { mtimeMs: currentMtime, readAtIso: new Date().toISOString() };
try {
	mkdirSync(dirname(cachePath), { recursive: true });
	writeFileSync(cachePath, JSON.stringify(cache));
} catch {
	// best-effort cache; never block the read on cache write failure.
}
passThrough();
