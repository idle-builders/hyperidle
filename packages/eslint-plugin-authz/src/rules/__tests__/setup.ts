/**
 * Shared RuleTester wiring for eslint-plugin-authz tests.
 * Uses @typescript-eslint/parser — already a workspace dev-dep.
 */

import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";

export const ruleTester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
		},
	},
});
