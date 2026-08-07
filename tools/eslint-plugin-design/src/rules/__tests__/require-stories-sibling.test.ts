/**
 * The require-stories-sibling rule reads from the filesystem (existsSync).
 * We use real fixture files committed under test-fixtures/sibling-fixtures/.
 *
 * Each fixture path includes "framework/design-system/src/" as a substring so
 * the rule's target-dir gate passes; the actual on-disk path is local to the
 * eslint-plugin-design package.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { requireStoriesSibling } from "../require-stories-sibling.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..", "..", "..");
const fxBase = `${pkgRoot}/test-fixtures/sibling-fixtures/framework/design-system/src`;

ruleTester.run("require-stories-sibling", requireStoriesSibling, {
	valid: [
		{
			// Not a component path → exempt.
			filename: "/elsewhere/Foo.tsx",
			code: "export const Foo = ()=> null;",
		},
		{
			// Component file with opt-out comment.
			filename: `${fxBase}/OptedOut.tsx`,
			code: "// design-lint-disable require-stories-sibling\nexport const OptedOut = ()=> null;",
		},
		{
			// Has a sibling .stories.tsx on disk (committed under test-fixtures).
			filename: `${fxBase}/HasStories.tsx`,
			code: "export const HasStories = ()=> null;",
		},
	],
	invalid: [
		{
			filename: `${fxBase}/NoStories.tsx`,
			code: "export const NoStories = ()=> null;",
			errors: [{ messageId: "missing" }],
		},
	],
});
