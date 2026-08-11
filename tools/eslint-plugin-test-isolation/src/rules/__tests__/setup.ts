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

export const FIXTURE_FILE = "/repo/layers/core-api/src/__tests__/example.integration.test.ts";
export const FIXTURE_IMPORT = 'import { test, expect } from "../__testing__/test-fixtures.js";';
