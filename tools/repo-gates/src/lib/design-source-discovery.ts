import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const ROLE_ROOTS = ["layers", "framework", "applications", "tools"] as const;

function isDevelopmentPath(path: string): boolean {
	const parts = path.split("/");
	const name = parts.at(-1) ?? "";
	return (
		parts.some((part) => part.startsWith("__")) ||
		/\.(?:test|spec|stories)\.[^.]+$/.test(name) ||
		/^vitest\.config\.|^playwright.*\.config\./.test(name)
	);
}

function walkFiles(directory: string, visit: (path: string) => void): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("."))
			continue;
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) walkFiles(path, visit);
		else if (entry.isFile()) visit(path);
	}
}

export interface DiscoveredDesignSources {
	discoveredPackages: string[];
	files: Array<{ path: string; content: string }>;
}

export function discoverDesignSources(
	root: string,
	extensions: ReadonlySet<string>,
	packageNames?: ReadonlySet<string>,
): DiscoveredDesignSources {
	const packageSet = new Set<string>();
	const files: Array<{ path: string; content: string }> = [];
	for (const role of ROLE_ROOTS) {
		const rolePath = resolve(root, role);
		if (!existsSync(rolePath)) continue;
		walkFiles(rolePath, (absolutePath) => {
			if (!absolutePath.endsWith("/package.json")) return;
			const packagePath = absolutePath.slice(0, -"/package.json".length);
			const packageRelative = relative(root, packagePath).replace(/\\/g, "/");
			const depth = packageRelative.split("/").length;
			if (depth < 2 || depth > 3) return;
			if (packageNames) {
				const manifest = JSON.parse(readFileSync(absolutePath, "utf8")) as { name?: string };
				if (!(manifest.name && packageNames.has(manifest.name))) return;
			}
			packageSet.add(packageRelative);
		});
	}
	for (const packagePath of [...packageSet].sort()) {
		const sourceRoot = resolve(root, packagePath, "src");
		if (!existsSync(sourceRoot)) continue;
		walkFiles(sourceRoot, (absolutePath) => {
			const relativePath = relative(root, absolutePath).replace(/\\/g, "/");
			if (!extensions.has(extname(relativePath)) || isDevelopmentPath(relativePath)) return;
			files.push({ path: relativePath, content: readFileSync(absolutePath, "utf8") });
		});
	}
	return {
		discoveredPackages: [...packageSet].sort(),
		files: files.sort((a, b) => a.path.localeCompare(b.path)),
	};
}
