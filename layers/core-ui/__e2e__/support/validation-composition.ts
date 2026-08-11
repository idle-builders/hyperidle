import { createFilesystemReviewVerifier } from "./review-trust.js";
import { createValidationContracts, type ValidationContracts } from "./validation-contract.js";

export interface ValidationCompositionOptions {
	repositoryRoot: string;
	acceptedReviewRoot: string;
	reviewManifestPath: string;
	expectedManifestSha256: string;
	builderIdentity: string;
}

export function composeValidationContracts(
	options: ValidationCompositionOptions,
): ValidationContracts {
	const reviewVerifier = createFilesystemReviewVerifier(options);
	return createValidationContracts({ reviewVerifier });
}
