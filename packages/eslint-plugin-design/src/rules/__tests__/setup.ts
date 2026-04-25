/**
 * Shared RuleTester wiring. Uses @typescript-eslint/parser which is already
 * a workspace dev-dep (see root package.json).
 */
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";

export const ruleTester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: {
			ecmaFeatures: { jsx: true },
			ecmaVersion: 2022,
			sourceType: "module",
		},
	},
});
