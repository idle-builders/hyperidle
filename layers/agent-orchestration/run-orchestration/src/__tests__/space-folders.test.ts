/**
 * Unit tests for the space-folder module.
 *
 * Table-driven: each row tests one distinct branch of the production logic.
 * No DB, no harness — purely filesystem I/O in a temp dir.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	addSpaceFolder,
	listSpaceFolders,
	RESERVED_SPACE_NAMES,
	removeSpaceFolder,
} from "../space-folders.js";

let tmpDir: string;
let spacePath: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "space-folders-test-"));
	spacePath = path.join(tmpDir, "space");
	fs.mkdirSync(spacePath);
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── listSpaceFolders ──────────────────────────────────────────────────────────

describe("listSpaceFolders", () => {
	test("returns empty when space does not exist", () => {
		expect(listSpaceFolders(path.join(tmpDir, "nonexistent"))).toEqual([]);
	});

	test("excludes every reserved name even when it is a symlink", () => {
		const target = path.join(tmpDir, "real");
		fs.mkdirSync(target);
		for (const name of RESERVED_SPACE_NAMES) {
			fs.symlinkSync(target, path.join(spacePath, name));
		}
		expect(listSpaceFolders(spacePath)).toEqual([]);
	});

	test("excludes plain dot-entries that are not symlinks", () => {
		fs.mkdirSync(path.join(spacePath, ".hidden"));
		fs.writeFileSync(path.join(spacePath, ".file"), "");
		expect(listSpaceFolders(spacePath)).toEqual([]);
	});

	test("includes real directories (non-symlink)", () => {
		fs.mkdirSync(path.join(spacePath, "myrepo"));
		const result = listSpaceFolders(spacePath);
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("myrepo");
		expect(result[0]?.isMissing).toBe(false);
		expect(result[0]?.isGit).toBe(false);
	});

	test("includes a valid symlink pointing at an existing directory", () => {
		const target = path.join(tmpDir, "myrepo");
		fs.mkdirSync(target);
		fs.symlinkSync(target, path.join(spacePath, "myrepo"));
		const result = listSpaceFolders(spacePath);
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("myrepo");
		expect(result[0]?.isMissing).toBe(false);
		expect(result[0]?.isGit).toBe(false);
	});

	test("detects a git repo (has .git directory)", () => {
		const target = path.join(tmpDir, "gitrepo");
		fs.mkdirSync(path.join(target, ".git"), { recursive: true });
		fs.symlinkSync(target, path.join(spacePath, "gitrepo"));
		const result = listSpaceFolders(spacePath);
		expect(result).toHaveLength(1);
		expect(result[0]?.isGit).toBe(true);
	});

	test("marks dangling symlink as isMissing=true", () => {
		fs.symlinkSync(path.join(tmpDir, "gone"), path.join(spacePath, "gone"));
		const result = listSpaceFolders(spacePath);
		expect(result).toHaveLength(1);
		expect(result[0]?.isMissing).toBe(true);
		expect(result[0]?.name).toBe("gone");
	});
});

// ── addSpaceFolder ────────────────────────────────────────────────────────────

describe("addSpaceFolder", () => {
	test("creates a symlink under spacePath when all args are valid", () => {
		const target = path.join(tmpDir, "myproject");
		fs.mkdirSync(target);
		const result = addSpaceFolder(spacePath, target, "myproject");
		expect(result.ok).toBe(true);
		expect(fs.lstatSync(path.join(spacePath, "myproject")).isSymbolicLink()).toBe(true);
	});

	test("derives name from basename when name is omitted", () => {
		const target = path.join(tmpDir, "derived");
		fs.mkdirSync(target);
		const result = addSpaceFolder(spacePath, target);
		expect(result.ok).toBe(true);
		expect(fs.existsSync(path.join(spacePath, "derived"))).toBe(true);
	});

	test.each([...RESERVED_SPACE_NAMES])("refuses reserved name: %s", (name) => {
		const target = path.join(tmpDir, "real");
		fs.mkdirSync(target);
		expect(addSpaceFolder(spacePath, target, name)).toMatchObject({
			ok: false,
			code: "RESERVED_NAME",
		});
	});

	test.each(["", ".", "..", "a/b", "a\\b"])("refuses invalid name: %s", (name) => {
		const target = path.join(tmpDir, "real");
		fs.mkdirSync(target);
		expect(addSpaceFolder(spacePath, target, name)).toMatchObject({
			ok: false,
			code: "INVALID_NAME",
		});
	});

	test("refuses when source path does not exist", () => {
		expect(addSpaceFolder(spacePath, path.join(tmpDir, "nope"), "nope")).toMatchObject({
			ok: false,
			code: "SOURCE_NOT_FOUND",
		});
	});

	test("refuses when source is a file, not a directory", () => {
		const file = path.join(tmpDir, "plain.txt");
		fs.writeFileSync(file, "");
		expect(addSpaceFolder(spacePath, file, "plain")).toMatchObject({
			ok: false,
			code: "SOURCE_NOT_DIRECTORY",
		});
	});

	test("refuses SPACE_NOT_SET when spacePath is empty string", () => {
		const target = path.join(tmpDir, "real");
		fs.mkdirSync(target);
		expect(addSpaceFolder("", target, "real")).toMatchObject({ ok: false, code: "SPACE_NOT_SET" });
	});

	test("refuses CONFLICT when name already exists in space", () => {
		const target1 = path.join(tmpDir, "t1");
		const target2 = path.join(tmpDir, "t2");
		fs.mkdirSync(target1);
		fs.mkdirSync(target2);
		addSpaceFolder(spacePath, target1, "clash");
		expect(addSpaceFolder(spacePath, target2, "clash")).toMatchObject({
			ok: false,
			code: "CONFLICT",
		});
	});
});

// ── removeSpaceFolder ─────────────────────────────────────────────────────────

describe("removeSpaceFolder", () => {
	test.each(["", ".", "..", "a/b", "a\\b", [...RESERVED_SPACE_NAMES][0] ?? "conversations"])(
		"refuses NOT_FOUND for invalid or reserved name: %s",
		(name) => {
			expect(removeSpaceFolder(spacePath, name)).toMatchObject({ ok: false, code: "NOT_FOUND" });
		},
	);

	test("removes an existing symlink and returns ok:true", () => {
		const target = path.join(tmpDir, "real");
		fs.mkdirSync(target);
		fs.symlinkSync(target, path.join(spacePath, "real"));
		const result = removeSpaceFolder(spacePath, "real");
		expect(result.ok).toBe(true);
		expect(fs.existsSync(path.join(spacePath, "real"))).toBe(false);
	});

	test("refuses NOT_FOUND when name does not exist", () => {
		expect(removeSpaceFolder(spacePath, "ghost")).toMatchObject({ ok: false, code: "NOT_FOUND" });
	});

	test("refuses NOT_A_SYMLINK when entry is a real directory", () => {
		fs.mkdirSync(path.join(spacePath, "realdir"));
		expect(removeSpaceFolder(spacePath, "realdir")).toMatchObject({
			ok: false,
			code: "NOT_A_SYMLINK",
		});
	});

	test("removes a dangling symlink (target missing) without error", () => {
		fs.symlinkSync(path.join(tmpDir, "gone"), path.join(spacePath, "gone"));
		const result = removeSpaceFolder(spacePath, "gone");
		expect(result.ok).toBe(true);
	});
});
