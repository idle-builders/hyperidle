/**
 * L22 — Three relevance signals as first-class data.
 *
 * Implements the L5 composite relevance formula:
 *   relevance = (w_r * recency + w_f * frequency + w_c * citation) / denominator
 *
 * Where:
 *   recency   = exp(-ln(2) * ageDays / halflife)
 *   frequency = clamp01(accessCount / saturation)
 *   citation  = clamp01(citationCount / saturation)  [only when citationCount != null]
 *   denominator excludes w_c when citationCount is null (staged signal support)
 *
 * @lore L22: The denominator shrinks when citationCount is null. This means
 * null-citation items are not penalized vs items with citationCount=0 —
 * the absent signal simply doesn't participate rather than dragging the score
 * down. This enables staged rollout of signals without retroactive re-weighting.
 */

interface RelevanceWeights {
	readonly recency: number;
	readonly frequency: number;
	readonly citation: number;
}

interface RelevanceShape {
	readonly recencyHalflifeDays: number;
	readonly frequencySaturation: number;
	readonly frequencyWindowDays: number;
	readonly citationSaturation: number;
}

interface RelevanceConfig {
	readonly weights: RelevanceWeights;
	readonly shape: RelevanceShape;
}

interface RelevanceInput {
	/** Days since last validation/edit/access. null = no data. */
	ageDays: number | null;
	/** Access count within the frequency window. null = no data. */
	accessCount: number | null;
	/** Citation count (staged: always null in L22). null = signal not yet active. */
	citationCount: number | null;
}

/**
 * Default relevance configuration matching L5 spec constants.
 * Weights: w_r=0.4, w_f=0.4, w_c=0.2
 * Shape: halflife=14d, freqSat=5, window=30d, citSat=5
 */
const DEFAULT_RELEVANCE_CONFIG: RelevanceConfig = {
	weights: { recency: 0.4, frequency: 0.4, citation: 0.2 },
	shape: {
		recencyHalflifeDays: 14,
		frequencySaturation: 5,
		frequencyWindowDays: 30,
		citationSaturation: 5,
	},
};

function clamp01(x: number): number {
	return Math.max(0, Math.min(1, x));
}

function round6(x: number): number {
	return Math.round(x * 1_000_000) / 1_000_000;
}

/**
 * Compute the composite relevance score for a single knowledge item.
 *
 * Returns null when all inputs are null (fake-zero guard — an item with
 * no data at all must not appear to have a score).
 *
 * Invalid inputs (NaN, negative ageDays, negative counts) are treated
 * defensively: NaN ageDays returns null, negative values are clamped to 0.
 */
function computeRelevanceScore(input: RelevanceInput, config: RelevanceConfig): number | null {
	const { weights, shape } = config;
	const { ageDays, accessCount, citationCount } = input;

	// All-null guard — no data means no score
	if (ageDays === null && accessCount === null && citationCount === null) {
		return null;
	}

	// Validate ageDays — NaN is rejected
	if (ageDays !== null && !Number.isFinite(ageDays)) {
		return null;
	}

	// Compute recency signal
	const effectiveAgeDays = ageDays === null ? 0 : Math.max(0, ageDays);
	const recency = Math.exp((-Math.LN2 * effectiveAgeDays) / shape.recencyHalflifeDays);

	// Compute frequency signal — clamp negative to 0
	const effectiveAccessCount = accessCount === null ? 0 : Math.max(0, accessCount);
	const frequency = clamp01(effectiveAccessCount / shape.frequencySaturation);

	// Compute citation signal (only when citationCount is not null)
	const hasCitation = citationCount !== null;
	const effectiveCitationCount = hasCitation ? Math.max(0, citationCount) : 0;
	const citation = hasCitation ? clamp01(effectiveCitationCount / shape.citationSaturation) : 0;

	// Denominator excludes w_c when citationCount is null
	const denominator = weights.recency + weights.frequency + (hasCitation ? weights.citation : 0);

	if (denominator === 0) {
		return 0;
	}

	const numerator =
		weights.recency * recency + weights.frequency * frequency + weights.citation * citation;

	return round6(clamp01(numerator / denominator));
}

export type { RelevanceConfig };
export { computeRelevanceScore, DEFAULT_RELEVANCE_CONFIG };
