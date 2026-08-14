import { describe, expect, test } from "vitest";
import { validateMigrationReceipts } from "../lib/az16-receipt-verdict.js";

describe("AZ16 immutable audit receipts", () => {
	test("accepts a destination-compatible receipt", () => {
		expect(
			validateMigrationReceipts(
				[{ siteId: "site-1", destination: "copy" }],
				[
					{
						auditSiteId: "site-1",
						auditDestination: "copy",
						outcome: "PROFILE",
						profile: "copy",
						finalPath: "framework/example/src/Copy.tsx",
						finalLocator: "Copy:p",
					},
				],
			),
		).toEqual([]);
	});

	test("fails duplicates and incompatible outcomes", () => {
		const receipt = {
			auditSiteId: "site-1",
			auditDestination: "copy",
			outcome: "REMOVE" as const,
			profile: "",
			finalPath: "framework/example/src/Copy.tsx",
			finalLocator: "Copy:p",
		};
		const findings = validateMigrationReceipts(
			[{ siteId: "site-1", destination: "copy" }],
			[receipt, receipt],
		);
		expect(findings).toContain("duplicate receipt: site-1");
		expect(findings).toContain("site-1: destination copy requires PROFILE outcome");
	});
});
