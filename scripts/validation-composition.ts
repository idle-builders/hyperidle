import {
	createValidationContracts,
	type ValidationContracts,
} from "../packages/web/e2e/support/validation-contract.js";
import { createFilesystemReviewVerifier } from "../packages/web/e2e/support/review-trust.js";

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
