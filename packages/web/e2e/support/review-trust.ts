import { createHash } from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	openSync,
	readFileSync,
	realpathSync,
	type Stats,
	statSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export interface ReviewClaim {
	artifactPath: string;
	artifactHash: string;
	payloadHash: string;
	verdict: "accept" | "revise";
	reviewerIdentity: string;
	builderIdentity: string;
}

export interface VerifiedReviewArtifact {
	bytes: Uint8Array;
	canonicalPath: string;
	sha256: string;
	reviewerIdentity: string;
	provenance: "repository-review-manifest";
}

export interface ReviewVerifier {
	verify(claim: ReviewClaim, canonicalPayload: string): VerifiedReviewArtifact;
}

export interface FilesystemReviewVerifierOptions {
	repositoryRoot: string;
	acceptedReviewRoot: string;
	reviewManifestPath: string;
	expectedManifestSha256: string;
	builderIdentity: string;
	filesystemOperations?: {
		afterCanonicalPathStat?(path: string): void;
	};
}

interface ManifestEntry {
	artifactRelativePath: string;
	reviewerIdentity: string;
	builderIdentity: string;
	artifactSha256: string;
	reviewedPayloadSha256: string;
	verdict: "accept";
}

const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

export function createFilesystemReviewVerifier(
	options: FilesystemReviewVerifierOptions,
): ReviewVerifier {
	const repositoryRoot = canonicalDirectory(options.repositoryRoot, "repository root");
	const acceptedReviewRoot = canonicalDirectory(options.acceptedReviewRoot, "accepted review root");
	inside(repositoryRoot, acceptedReviewRoot, "accepted review root");
	const manifestPath = canonicalFile(options.reviewManifestPath, "review manifest");
	inside(repositoryRoot, manifestPath, "review manifest");
	const manifestBytes = stableRead(manifestPath, "review manifest");
	const manifestHashMatches = digest(manifestBytes) === options.expectedManifestSha256;
	const missingActorManifest = manifestBytes.toString("utf8").trim() === "{}";
	if (!(manifestHashMatches || missingActorManifest)) {
		throw new Error("review manifest hash mismatch or mutation");
	}
	if (!options.builderIdentity) throw new Error("captured builder identity is required");
	const entries = missingActorManifest
		? new Map<string, ManifestEntry>()
		: parseManifest(manifestBytes.toString("utf8"), acceptedReviewRoot);

	return {
		verify(claim, canonicalPayload) {
			const claimedPath = isAbsolute(claim.artifactPath)
				? resolve(claim.artifactPath)
				: resolve(acceptedReviewRoot, claim.artifactPath);
			const canonicalPath = canonicalFile(claimedPath, "review artifact");
			inside(acceptedReviewRoot, canonicalPath, "review artifact");
			const entry = entries.get(canonicalPath);
			if (!entry) {
				throw new Error(
					manifestHashMatches
						? "manifest artifact is unlisted"
						: "manifest artifact is unlisted after manifest hash mutation",
				);
			}
			assertClaim(entry, claim, canonicalPayload, options.builderIdentity);
			const bytes = stableRead(
				canonicalPath,
				"review artifact",
				options.filesystemOperations?.afterCanonicalPathStat,
			);
			if (digest(bytes) !== entry.artifactSha256) {
				throw new Error("manifest artifact hash mismatch");
			}
			assertArtifact(bytes, entry);
			return {
				bytes,
				canonicalPath,
				sha256: entry.artifactSha256,
				reviewerIdentity: entry.reviewerIdentity,
				provenance: "repository-review-manifest",
			};
		},
	};
}

function assertClaim(
	entry: ManifestEntry,
	claim: ReviewClaim,
	canonicalPayload: string,
	builderIdentity: string,
): void {
	if (entry.builderIdentity !== builderIdentity || claim.builderIdentity !== builderIdentity) {
		throw new Error("manifest/captured/claimed builder identity mismatch");
	}
	if (
		entry.reviewerIdentity !== claim.reviewerIdentity ||
		entry.reviewerIdentity === builderIdentity
	) {
		throw new Error("manifest reviewer mismatch or non-independent review");
	}
	if (entry.verdict !== claim.verdict) throw new Error("manifest verdict must accept");
	if (entry.artifactSha256 !== claim.artifactHash) {
		throw new Error("manifest artifact hash differs from claim");
	}
	const payloadHash = digest(canonicalPayload);
	if (entry.reviewedPayloadSha256 !== payloadHash || claim.payloadHash !== payloadHash) {
		throw new Error("manifest reviewed payload hash mismatch");
	}
}

function assertArtifact(bytes: Buffer, entry: ManifestEntry): void {
	let artifact: unknown;
	try {
		artifact = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new Error("review artifact JSON is malformed");
	}
	if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
		throw new Error("review artifact shape is invalid");
	}
	const record = artifact as Record<string, unknown>;
	if (
		record.verdict !== entry.verdict ||
		record.reviewedPayloadHash !== entry.reviewedPayloadSha256 ||
		record.reviewerIdentity !== entry.reviewerIdentity ||
		record.builderIdentity !== entry.builderIdentity
	) {
		throw new Error("review artifact semantics differ from manifest");
	}
}

function parseManifest(content: string, acceptedReviewRoot: string): Map<string, ManifestEntry> {
	let manifest: unknown;
	try {
		manifest = JSON.parse(content);
	} catch {
		throw new Error("review manifest JSON is malformed");
	}
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw new Error("review manifest shape is invalid");
	}
	const root = manifest as Record<string, unknown>;
	if (
		Object.keys(root).sort().join(",") !== "entries,schemaVersion" ||
		root.schemaVersion !== 1 ||
		!Array.isArray(root.entries)
	) {
		throw new Error("review manifest schema or top-level fields are invalid");
	}
	const entries = new Map<string, ManifestEntry>();
	for (const value of root.entries) {
		const entry = parseEntry(value);
		if (isAbsolute(entry.artifactRelativePath)) {
			throw new Error("manifest artifact path must be relative");
		}
		const candidate = resolve(acceptedReviewRoot, entry.artifactRelativePath);
		inside(acceptedReviewRoot, candidate, "manifest artifact path");
		const canonical = canonicalFile(candidate, "manifest artifact");
		inside(acceptedReviewRoot, canonical, "manifest artifact");
		if (entries.has(canonical)) throw new Error("duplicate canonical manifest path");
		entries.set(canonical, entry);
	}
	return entries;
}

function parseEntry(value: unknown): ManifestEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("review manifest entry is invalid");
	}
	const entry = value as Record<string, unknown>;
	const expected =
		"artifactRelativePath,artifactSha256,builderIdentity,reviewedPayloadSha256,reviewerIdentity,verdict";
	if (Object.keys(entry).sort().join(",") !== expected) {
		throw new Error("review manifest entry fields are invalid");
	}
	for (const field of [
		"artifactRelativePath",
		"artifactSha256",
		"builderIdentity",
		"reviewedPayloadSha256",
		"reviewerIdentity",
	] as const) {
		if (typeof entry[field] !== "string" || entry[field].length === 0) {
			throw new Error(`review manifest ${field} identity/value is required`);
		}
	}
	if (entry.verdict !== "accept") throw new Error("review manifest verdict must accept");
	return entry as unknown as ManifestEntry;
}

function canonicalDirectory(path: string, label: string): string {
	const canonical = resolved(path, label);
	if (!statSync(canonical).isDirectory()) throw new Error(`${label} must be a directory`);
	return canonical;
}

function canonicalFile(path: string, label: string): string {
	const canonical = resolved(path, label);
	if (!statSync(canonical).isFile()) throw new Error(`${label} must be a regular file`);
	return canonical;
}

function resolved(path: string, label: string): string {
	try {
		return realpathSync(path);
	} catch {
		throw new Error(`${label} cannot be resolved`);
	}
}

function inside(root: string, candidate: string, label: string): void {
	const fromRoot = relative(root, candidate);
	if (
		fromRoot === ".." ||
		fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
		isAbsolute(fromRoot)
	) {
		throw new Error(`${label} is outside containment root`);
	}
}

function sameFile(left: Stats, right: Stats): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

function stableRead(
	canonicalPath: string,
	label: string,
	afterCanonicalPathStat?: (path: string) => void,
): Buffer {
	const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
	const descriptor = openSync(canonicalPath, constants.O_RDONLY | noFollow);
	try {
		const before = fstatSync(descriptor);
		if (!before.isFile()) throw new Error(`${label} must be a regular file`);
		const pathBefore = statSync(canonicalPath);
		if (!sameFile(before, pathBefore)) throw new Error(`${label} descriptor/path inode mismatch`);
		afterCanonicalPathStat?.(canonicalPath);
		const bytes = readFileSync(descriptor);
		const after = fstatSync(descriptor);
		const pathAfter = statSync(canonicalPath);
		if (
			!(sameFile(before, after) && sameFile(after, pathAfter)) ||
			before.size !== after.size ||
			before.mtimeMs !== after.mtimeMs
		) {
			throw new Error(`${label} descriptor changed or path swapped`);
		}
		return bytes;
	} finally {
		closeSync(descriptor);
	}
}
