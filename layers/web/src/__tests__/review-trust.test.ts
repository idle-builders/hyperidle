import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	renameSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { composeValidationContracts } from "../../../../scripts/validation-composition.js";
import {
	createFilesystemReviewVerifier,
	type ReviewClaim,
	type ReviewVerifier,
} from "../../__e2e__/support/review-trust.js";
import { createValidationContracts } from "../../__e2e__/support/validation-contract.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function repositoryFixture() {
	const repositoryRoot = mkdtempSync(join(tmpdir(), "review-verifier-"));
	const acceptedReviewRoot = join(repositoryRoot, "plans/AU20/register-reviews");
	mkdirSync(acceptedReviewRoot, { recursive: true });
	const artifactPath = join(acceptedReviewRoot, "proof.md");
	const payload = '{"a":1}';
	const bytes = JSON.stringify({
		verdict: "accept",
		reviewedPayloadHash: digest(payload),
		reviewerIdentity: "reviewer-1",
		builderIdentity: "builder-1",
	});
	writeFileSync(artifactPath, bytes);
	const reviewManifestPath = join(repositoryRoot, "review-actors.json");
	const reviewManifest = JSON.stringify({
		schemaVersion: 1,
		entries: [
			{
				artifactRelativePath: "proof.md",
				reviewerIdentity: "reviewer-1",
				builderIdentity: "builder-1",
				artifactSha256: digest(bytes),
				reviewedPayloadSha256: digest(payload),
				verdict: "accept",
			},
		],
	});
	writeFileSync(reviewManifestPath, reviewManifest);
	const claim: ReviewClaim = {
		artifactPath: "proof.md",
		artifactHash: digest(bytes),
		payloadHash: digest(payload),
		verdict: "accept",
		reviewerIdentity: "reviewer-1",
		builderIdentity: "builder-1",
	};
	return {
		repositoryRoot,
		acceptedReviewRoot,
		artifactPath,
		canonicalArtifactPath: realpathSync(artifactPath),
		reviewManifestPath,
		expectedManifestSha256: digest(reviewManifest),
		payload,
		bytes,
		claim,
	};
}

describe("filesystem review verifier", () => {
	test("returns verified repository bytes and manifest provenance", () => {
		const fixture = repositoryFixture();
		const verifier = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		expect(verifier.verify(fixture.claim, fixture.payload)).toEqual({
			bytes: Buffer.from(fixture.bytes),
			canonicalPath: fixture.canonicalArtifactPath,
			sha256: fixture.claim.artifactHash,
			reviewerIdentity: "reviewer-1",
			provenance: "repository-review-manifest",
		});
	});

	test.each([
		[
			"traversal",
			(f: ReturnType<typeof repositoryFixture>) => join(f.acceptedReviewRoot, "../outside.md"),
		],
		[
			"prefix sibling",
			(f: ReturnType<typeof repositoryFixture>) =>
				join(f.repositoryRoot, "plans/AU20/register-reviews-evil/proof.md"),
		],
	])("rejects %s artifact escape", (_name, pathFor) => {
		const fixture = repositoryFixture();
		const path = pathFor(fixture);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, fixture.bytes);
		const verifier = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		expect(() =>
			verifier.verify({ ...fixture.claim, artifactPath: path }, fixture.payload),
		).toThrow(/containment|outside|traversal/i);
	});

	test("rejects symlink escape after realpath resolution", () => {
		const fixture = repositoryFixture();
		const outside = join(fixture.repositoryRoot, "outside.md");
		writeFileSync(outside, fixture.bytes);
		const link = join(fixture.acceptedReviewRoot, "escape.md");
		symlinkSync(outside, link);
		const verifier = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		expect(() =>
			verifier.verify({ ...fixture.claim, artifactPath: link }, fixture.payload),
		).toThrow(/symlink|containment|outside/i);
	});

	test("rejects non-regular review artifacts", () => {
		const fixture = repositoryFixture();
		expect(() =>
			createFilesystemReviewVerifier({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: fixture.expectedManifestSha256,
				builderIdentity: "builder-1",
			}).verify({ ...fixture.claim, artifactPath: fixture.acceptedReviewRoot }, fixture.payload),
		).toThrow(/regular.*file/i);
	});

	test.each([
		["reviewer mismatch", { reviewerIdentity: "reviewer-2" }],
		["builder mismatch", { builderIdentity: "builder-2" }],
		["self review", { reviewerIdentity: "builder-1" }],
	] as const)("rejects %s against captured manifest and builder", (_name, patch) => {
		const fixture = repositoryFixture();
		const verifier = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		expect(() => verifier.verify({ ...fixture.claim, ...patch }, fixture.payload)).toThrow(
			/reviewer|builder|independent/i,
		);
	});

	test.each([
		["mutated artifact bytes", { mutateBytes: true }, /artifact.*hash|bytes/i],
		["wrong claimed artifact SHA", { artifactHash: "wrong" }, /artifact.*hash/i],
		["wrong reviewed payload SHA", { payloadHash: "wrong" }, /payload.*hash/i],
		["non-accept verdict", { verdict: "revise" as const }, /verdict|accept/i],
	])("rejects %s", (_name, change, message) => {
		const fixture = repositoryFixture();
		if ("mutateBytes" in change) writeFileSync(fixture.artifactPath, `${fixture.bytes} `);
		const verifier = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		const { mutateBytes: _ignored, ...claimPatch } = change as {
			mutateBytes?: boolean;
			artifactHash?: string;
			payloadHash?: string;
			verdict?: "accept" | "revise";
		};
		expect(() => verifier.verify({ ...fixture.claim, ...claimPatch }, fixture.payload)).toThrow(
			message,
		);
	});

	test("rejects artifact absent from actor manifest instead of trusting claim identity", () => {
		const fixture = repositoryFixture();
		writeFileSync(fixture.reviewManifestPath, JSON.stringify({}));
		const verifier = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		expect(() => verifier.verify(fixture.claim, fixture.payload)).toThrow(
			/manifest.*artifact|unlisted/i,
		);
	});

	test.each([
		["outside repository", "outside"],
		["prefix sibling", "prefix"],
		["symlink escape", "symlink"],
		["non-directory", "file"],
	] as const)("rejects accepted review root %s", (_name, kind) => {
		const fixture = repositoryFixture();
		const external = mkdtempSync(join(tmpdir(), "external-reviews-"));
		let acceptedReviewRoot = external;
		if (kind === "prefix") {
			acceptedReviewRoot = `${fixture.repositoryRoot}-evil`;
			mkdirSync(acceptedReviewRoot);
		}
		if (kind === "symlink") {
			acceptedReviewRoot = join(fixture.repositoryRoot, "review-link");
			symlinkSync(external, acceptedReviewRoot);
		}
		if (kind === "file") {
			acceptedReviewRoot = join(fixture.repositoryRoot, "review-file");
			writeFileSync(acceptedReviewRoot, "not a directory");
		}
		expect(() =>
			createFilesystemReviewVerifier({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: fixture.expectedManifestSha256,
				builderIdentity: "builder-1",
			}),
		).toThrow(/accepted.*root|directory|containment|symlink/i);
	});

	test.each([
		["outside repository", "outside"],
		["symlink escape", "symlink"],
		["non-file", "directory"],
		["malformed JSON", "malformed"],
		["duplicate actor entry", "duplicate"],
	] as const)("rejects actor manifest %s", (_name, kind) => {
		const fixture = repositoryFixture();
		let reviewManifestPath = join(mkdtempSync(join(tmpdir(), "external-manifest-")), "actors.json");
		writeFileSync(reviewManifestPath, "{}");
		if (kind === "symlink") {
			const link = join(fixture.repositoryRoot, "actors-link.json");
			symlinkSync(reviewManifestPath, link);
			reviewManifestPath = link;
		}
		if (kind === "directory") reviewManifestPath = fixture.acceptedReviewRoot;
		if (kind === "malformed") {
			reviewManifestPath = join(fixture.repositoryRoot, "malformed-actors.json");
			writeFileSync(reviewManifestPath, "{");
		}
		if (kind === "duplicate") {
			reviewManifestPath = join(fixture.repositoryRoot, "duplicate-actors.json");
			writeFileSync(
				reviewManifestPath,
				`{"${fixture.artifactPath}":{"reviewerIdentity":"reviewer-1"},"${fixture.artifactPath}":{"reviewerIdentity":"reviewer-2"}}`,
			);
		}
		expect(() =>
			createFilesystemReviewVerifier({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath,
				expectedManifestSha256: fixture.expectedManifestSha256,
				builderIdentity: "builder-1",
			}),
		).toThrow(/manifest|regular.*file|containment|symlink|duplicate|json/i);
	});

	test("rejects manifest mutation and expected manifest hash mismatch", () => {
		const fixture = repositoryFixture();
		writeFileSync(fixture.reviewManifestPath, '{"reviews":[]}');
		expect(() =>
			createFilesystemReviewVerifier({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: fixture.expectedManifestSha256,
				builderIdentity: "builder-1",
			}),
		).toThrow(/manifest.*hash|mutation/i);
	});

	test.each([
		[
			"omitted builder identity",
			(f: ReturnType<typeof repositoryFixture>) => ({
				schemaVersion: 1,
				entries: [
					{
						artifactRelativePath: "proof.md",
						reviewerIdentity: "reviewer-1",
						artifactSha256: f.claim.artifactHash,
						reviewedPayloadSha256: f.claim.payloadHash,
						verdict: "accept",
					},
				],
			}),
		],
		[
			"empty reviewer identity",
			(f: ReturnType<typeof repositoryFixture>) => ({
				schemaVersion: 1,
				entries: [
					{
						artifactRelativePath: "proof.md",
						reviewerIdentity: "",
						builderIdentity: "builder-1",
						artifactSha256: f.claim.artifactHash,
						reviewedPayloadSha256: f.claim.payloadHash,
						verdict: "accept",
					},
				],
			}),
		],
		[
			"empty builder identity",
			(f: ReturnType<typeof repositoryFixture>) => ({
				schemaVersion: 1,
				entries: [
					{
						artifactRelativePath: "proof.md",
						reviewerIdentity: "reviewer-1",
						builderIdentity: "",
						artifactSha256: f.claim.artifactHash,
						reviewedPayloadSha256: f.claim.payloadHash,
						verdict: "accept",
					},
				],
			}),
		],
		[
			"unknown top-level field",
			(f: ReturnType<typeof repositoryFixture>) => ({
				schemaVersion: 1,
				entries: [
					{
						artifactRelativePath: "proof.md",
						reviewerIdentity: "reviewer-1",
						builderIdentity: "builder-1",
						artifactSha256: f.claim.artifactHash,
						reviewedPayloadSha256: f.claim.payloadHash,
						verdict: "accept",
					},
				],
				authority: "caller",
			}),
		],
		[
			"unknown entry field",
			(f: ReturnType<typeof repositoryFixture>) => ({
				schemaVersion: 1,
				entries: [
					{
						artifactRelativePath: "proof.md",
						reviewerIdentity: "reviewer-1",
						builderIdentity: "builder-1",
						artifactSha256: f.claim.artifactHash,
						reviewedPayloadSha256: f.claim.payloadHash,
						verdict: "accept",
						override: true,
					},
				],
			}),
		],
	] as const)("rejects closed manifest schema: %s", (_name, manifestFor) => {
		const fixture = repositoryFixture();
		expect(() =>
			createFilesystemReviewVerifier({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: fixture.expectedManifestSha256,
				builderIdentity: "builder-1",
			}),
		).not.toThrow();
		const manifest = JSON.stringify(manifestFor(fixture));
		writeFileSync(fixture.reviewManifestPath, manifest);
		expect(() =>
			createFilesystemReviewVerifier({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: digest(manifest),
				builderIdentity: "builder-1",
			}),
		).toThrow(/manifest|builder|reviewer|field|schema|identity/i);
	});

	test.each([
		["same relative path", "proof.md"],
		["normalized relative alias", "nested/../proof.md"],
	] as const)("rejects duplicate canonical artifact path: %s", (_name, alias) => {
		const fixture = repositoryFixture();
		const entry = {
			artifactRelativePath: "proof.md",
			reviewerIdentity: "reviewer-1",
			builderIdentity: "builder-1",
			artifactSha256: fixture.claim.artifactHash,
			reviewedPayloadSha256: fixture.claim.payloadHash,
			verdict: "accept",
		};
		const manifest = JSON.stringify({
			schemaVersion: 1,
			entries: [entry, { ...entry, artifactRelativePath: alias }],
		});
		writeFileSync(fixture.reviewManifestPath, manifest);
		expect(() =>
			createFilesystemReviewVerifier({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: digest(manifest),
				builderIdentity: "builder-1",
			}),
		).toThrow(/duplicate|canonical|manifest.*path/i);
	});

	test("artifact and claim rehash cannot override repository manifest", () => {
		const fixture = repositoryFixture();
		const rewritten = `${fixture.bytes} `;
		writeFileSync(fixture.artifactPath, rewritten);
		const verifier = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		expect(() =>
			verifier.verify({ ...fixture.claim, artifactHash: digest(rewritten) }, fixture.payload),
		).toThrow(/manifest.*artifact|artifact.*hash/i);
	});

	test("payload and caller claim rewrite cannot override manifest-reviewed payload", () => {
		const fixture = repositoryFixture();
		const rewrittenPayload = '{"a":2}';
		const verifier = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		expect(() =>
			verifier.verify(
				{ ...fixture.claim, payloadHash: digest(rewrittenPayload) },
				rewrittenPayload,
			),
		).toThrow(/manifest.*payload|payload.*hash|reviewed.*payload/i);
	});

	test("rejects canonical path replacement after descriptor identity is established", () => {
		const fixture = repositoryFixture();
		const displaced = join(fixture.acceptedReviewRoot, "displaced.md");
		expect(() =>
			createFilesystemReviewVerifier({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: fixture.expectedManifestSha256,
				builderIdentity: "builder-1",
				filesystemOperations: {
					afterCanonicalPathStat(path) {
						renameSync(path, displaced);
						writeFileSync(path, fixture.bytes);
					},
				},
			}).verify(fixture.claim, fixture.payload),
		).toThrow(/descriptor|device|inode|mutation|changed|swap/i);
	});

	test("returns the exact verified Buffer with canonical realpath provenance", () => {
		const fixture = repositoryFixture();
		const verified = createFilesystemReviewVerifier({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		}).verify(fixture.claim, fixture.payload);
		expect(Buffer.isBuffer(verified.bytes)).toBe(true);
		expect(verified.canonicalPath).toBe(fixture.canonicalArtifactPath);
		expect(createHash("sha256").update(verified.bytes).digest("hex")).toBe(
			fixture.claim.artifactHash,
		);
	});
});

describe("validation contract factory", () => {
	test("captures one verifier for payload and lineage claims", () => {
		const calls: ReviewClaim[] = [];
		const verifier: ReviewVerifier = {
			verify(claim, canonicalPayload) {
				calls.push(claim);
				return {
					bytes: new TextEncoder().encode(canonicalPayload),
					canonicalPath: claim.artifactPath,
					sha256: claim.artifactHash,
					reviewerIdentity: claim.reviewerIdentity,
					provenance: "repository-review-manifest",
				};
			},
		};
		const contracts = createValidationContracts({ reviewVerifier: verifier });
		const claim: ReviewClaim = {
			artifactPath: "plans/AU20/register-reviews/proof.md",
			artifactHash: "hash",
			payloadHash: digest('{"a":1}'),
			verdict: "accept",
			reviewerIdentity: "reviewer-1",
			builderIdentity: "builder-1",
		};
		contracts.unlockPayload({ payload: { a: 1 }, claim });
		contracts.verifyLineage({ lineagePayload: { a: 1 }, claim });
		expect(calls).toEqual([claim, claim]);
	});

	test("caller-supplied trust-shaped fields cannot override captured verifier", () => {
		const verifier: ReviewVerifier = {
			verify() {
				throw new Error("captured verifier called");
			},
		};
		const contracts = createValidationContracts({ reviewVerifier: verifier });
		expect(() =>
			contracts.unlockPayload({
				payload: { a: 1 },
				claim: {
					artifactPath: "proof.md",
					artifactHash: "hash",
					payloadHash: "payload",
					verdict: "accept",
					reviewerIdentity: "reviewer-1",
					builderIdentity: "builder-1",
				},
				reviewTrust: { verify: () => undefined },
			} as never),
		).toThrow(/captured verifier called/);
	});

	test("repository composition captures one filesystem verifier for payload and lineage", () => {
		const fixture = repositoryFixture();
		const contracts = composeValidationContracts({
			repositoryRoot: fixture.repositoryRoot,
			acceptedReviewRoot: fixture.acceptedReviewRoot,
			reviewManifestPath: fixture.reviewManifestPath,
			expectedManifestSha256: fixture.expectedManifestSha256,
			builderIdentity: "builder-1",
		});
		contracts.unlockPayload({ payload: { a: 1 }, claim: fixture.claim });
		contracts.verifyLineage({ lineagePayload: { a: 1 }, claim: fixture.claim });
		expect(() =>
			contracts.unlockPayload({
				payload: { a: 1 },
				claim: fixture.claim,
				reviewVerifier: { verify: () => undefined },
			} as never),
		).not.toThrow();
	});

	test.each(["payload", "lineage"] as const)(
		"rejects caller payload-hash rewrite through repository-composed %s path",
		(path) => {
			const fixture = repositoryFixture();
			const rewrittenPayload = { a: 2 };
			const rewrittenClaim = {
				...fixture.claim,
				payloadHash: digest(JSON.stringify(rewrittenPayload)),
			};
			const contracts = composeValidationContracts({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: fixture.expectedManifestSha256,
				builderIdentity: "builder-1",
			});
			expect(() =>
				path === "payload"
					? contracts.unlockPayload({ payload: rewrittenPayload, claim: rewrittenClaim })
					: contracts.verifyLineage({
							lineagePayload: rewrittenPayload,
							claim: rewrittenClaim,
						}),
			).toThrow(/manifest.*payload|payload.*hash|reviewed.*payload/i);
		},
	);

	test.each([
		["payload builder omitted", "payload", undefined, "reviewer-1"],
		["payload builder mismatch", "payload", "builder-2", "reviewer-1"],
		["payload self review", "payload", "builder-1", "builder-1"],
		["lineage builder omitted", "lineage", undefined, "reviewer-1"],
		["lineage builder mismatch", "lineage", "builder-2", "reviewer-1"],
		["lineage self review", "lineage", "builder-1", "builder-1"],
	] as const)(
		"rejects %s from manifest-bound factory path",
		(_name, path, builderIdentity, reviewerIdentity) => {
			const fixture = repositoryFixture();
			const contracts = composeValidationContracts({
				repositoryRoot: fixture.repositoryRoot,
				acceptedReviewRoot: fixture.acceptedReviewRoot,
				reviewManifestPath: fixture.reviewManifestPath,
				expectedManifestSha256: fixture.expectedManifestSha256,
				builderIdentity: "builder-1",
			});
			const claim = { ...fixture.claim, builderIdentity, reviewerIdentity } as ReviewClaim;
			expect(() =>
				path === "payload"
					? contracts.unlockPayload({ payload: { a: 1 }, claim })
					: contracts.verifyLineage({ lineagePayload: { a: 1 }, claim }),
			).toThrow(/builder|reviewer|manifest|independent/i);
		},
	);
});
