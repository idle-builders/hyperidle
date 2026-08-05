import {
	createValidationContracts,
	type ValidationContracts,
} from "../layers/web/__e2e__/support/validation-contract.js";
import { createFilesystemReviewVerifier } from "../layers/web/__e2e__/support/review-trust.js";

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
