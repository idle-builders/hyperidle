export const RECEIPT_OUTCOMES = [
	"PROFILE",
	"NONE",
	"REMOVE",
	"SNAP",
	"GEOMETRY",
	"FOREIGN",
	"GLYPH_REPAIR",
	"HEADING_VARIANT",
] as const;
export type ReceiptOutcome = (typeof RECEIPT_OUTCOMES)[number];

export interface AuditSite {
	siteId: string;
	destination: string;
}

export interface MigrationReceipt {
	auditSiteId: string;
	auditDestination: string;
	outcome: ReceiptOutcome;
	profile: string;
	finalPath: string;
	finalLocator: string;
}

const TYPOGRAPHY_PROFILES = new Set([
	"label",
	"metadata",
	"small",
	"copy",
	"control",
	"input",
	"avatar-initial",
	"subheading",
	"lead",
	"title",
	"display",
	"metric",
	"data",
	"inline-code",
]);
const MOTION_PROFILES = new Set([
	"feedback",
	"move",
	"spring",
	"enter",
	"activity",
	"loading",
	"busy",
]);
const BORDER_PROFILES = new Set(["thin", "default", "strong"]);

function expectedOutcome(destination: string): ReceiptOutcome {
	if (
		TYPOGRAPHY_PROFILES.has(destination) ||
		MOTION_PROFILES.has(destination) ||
		BORDER_PROFILES.has(destination)
	) {
		return "PROFILE";
	}
	if (destination === "NONE") return "NONE";
	if (destination === "REMOVE") return "REMOVE";
	if (destination === "SNAP") return "SNAP";
	if (destination === "GEOMETRY") return "GEOMETRY";
	if (destination === "FOREIGN") return "FOREIGN";
	if (destination === "glyph-repair") return "GLYPH_REPAIR";
	if (destination === "heading-variant") return "HEADING_VARIANT";
	throw new Error(`unknown audit destination: ${destination}`);
}

const HEADING_EXPANSION = "h1=display:1;h2=title:1;h3=lead:1;h4-h6=subheading:3";

export function validateMigrationReceipts(
	auditSites: readonly AuditSite[],
	receipts: readonly MigrationReceipt[],
): string[] {
	const findings: string[] = [];
	const auditById = new Map(auditSites.map((site) => [site.siteId, site]));
	const seen = new Set<string>();
	for (const receipt of receipts) {
		if (seen.has(receipt.auditSiteId)) findings.push(`duplicate receipt: ${receipt.auditSiteId}`);
		seen.add(receipt.auditSiteId);
		const site = auditById.get(receipt.auditSiteId);
		if (!site) {
			findings.push(`unknown receipt: ${receipt.auditSiteId}`);
			continue;
		}
		if (receipt.auditDestination !== site.destination) {
			findings.push(`${site.siteId}: receipt destination does not match audit`);
		}
		const expected = expectedOutcome(site.destination);
		if (receipt.outcome !== expected) {
			findings.push(`${site.siteId}: destination ${site.destination} requires ${expected} outcome`);
		}
		const expectedProfile =
			expected === "PROFILE"
				? site.destination
				: expected === "HEADING_VARIANT"
					? HEADING_EXPANSION
					: "";
		if (receipt.profile !== expectedProfile) findings.push(`${site.siteId}: invalid profile field`);
		if (!(receipt.finalPath && receipt.finalLocator))
			findings.push(`${site.siteId}: empty final target`);
		if (/(?:^|:)\d+(?::\d+)?$/.test(receipt.finalLocator)) {
			findings.push(`${site.siteId}: final locator may not be a line number`);
		}
	}
	for (const site of auditSites) {
		if (!seen.has(site.siteId)) findings.push(`missing receipt: ${site.siteId}`);
	}
	return findings;
}
