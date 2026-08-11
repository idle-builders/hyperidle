import type { ImportDeclaration } from "estree";

/** AU38 §4.3 applicability: `*.integration.test.ts` files only. */
export function isIntegrationTestFile(filename: string): boolean {
	return filename.endsWith(".integration.test.ts");
}

/**
 * AU38 §4.3 applicability: an actual import binding named `test` from a
 * `test-fixtures` module — not a comment mention. Exempts createTestDb-only
 * files and the harness lane's real-binary files without path allowlists.
 */
export function importsFixtureTest(node: ImportDeclaration): boolean {
	const source = node.source.value;
	if (typeof source !== "string" || !source.includes("test-fixtures")) return false;
	return node.specifiers.some(
		(specifier) =>
			specifier.type === "ImportSpecifier" &&
			specifier.imported.type === "Identifier" &&
			specifier.imported.name === "test",
	);
}
