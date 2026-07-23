import fs from "node:fs";
import path from "node:path";

const fail = (message) => {
	throw new Error(`AU20 review finding ledger invalid: ${message}`);
};

const reviewPath = path.join(process.cwd(), ".pipeline/work/AU20/review.md");
const review = fs.readFileSync(reviewPath, "utf8");
const expectedBySeverity = {
	CRITICAL: new Set(["F1", "F2", "F3", "F4", "F5", "F6"]),
	WARNING: new Set(["F7", "F8", "F9", "F10", "F11", "F13"]),
	OBSERVATION: new Set(["F12"]),
};

const findings = [
	...review.matchAll(/^(CRITICAL|WARNING|OBSERVATION)(?: \[(F\d+)\])? — /gm),
].map(
	([, severity, id]) => ({ severity, id }),
);
const ids = findings.map(({ id }) => id);

const actualCounts = {};
for (const severity of Object.keys(expectedBySeverity)) {
	actualCounts[severity] = findings.filter((finding) => finding.severity === severity).length;
}

const footerMatches = [
	...review.matchAll(/^Finding counts: (\d+) CRITICAL, (\d+) WARNING, (\d+) OBSERVATION\.$/gm),
];
if (footerMatches.length !== 1) fail(`expected one machine-readable finding-count footer, found ${footerMatches.length}`);

const [, critical, warning, observation] = footerMatches[0];
const footerCounts = {
	CRITICAL: Number(critical),
	WARNING: Number(warning),
	OBSERVATION: Number(observation),
};
for (const severity of Object.keys(expectedBySeverity)) {
	if (footerCounts[severity] !== actualCounts[severity]) {
		fail(`${severity} footer=${footerCounts[severity]} headings=${actualCounts[severity]}`);
	}
}

if (findings.length !== 13 || ids.some((id) => id === undefined)) {
	fail(`expected 13 ID-bearing headings, found ${ids.filter(Boolean).length}`);
}
if (new Set(ids).size !== ids.length) fail("finding IDs must be unique");

const expectedIds = Object.values(expectedBySeverity).flatMap((idsForSeverity) => [
	...idsForSeverity,
]);
const missingIds = expectedIds.filter((id) => !ids.includes(id));
const unknownIds = ids.filter((id) => !expectedIds.includes(id));
if (missingIds.length > 0 || unknownIds.length > 0) {
	fail(`finding ID set mismatch (missing: ${missingIds.join(",") || "none"}; unknown: ${unknownIds.join(",") || "none"})`);
}

for (const [severity, expectedIdsForSeverity] of Object.entries(expectedBySeverity)) {
	const actualIds = findings.filter((finding) => finding.severity === severity).map(({ id }) => id);
	if (
		actualIds.length !== expectedIdsForSeverity.size ||
		actualIds.some((id) => !expectedIdsForSeverity.has(id))
	) {
		fail(`${severity} IDs do not match the reviewed finding map`);
	}
}

console.log(
	JSON.stringify({
		findings: findings.length,
		counts: actualCounts,
		ids: ids.sort((left, right) => Number(left.slice(1)) - Number(right.slice(1))),
	}),
);
