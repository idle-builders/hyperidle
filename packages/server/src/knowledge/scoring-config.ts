import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { RelevanceConfig } from "./relevance-engine.js";

// Re-export so callers can import RelevanceConfig from scoring-config
export type { RelevanceConfig };

export interface ScoringWeights {
	tagMatch: number;
	roleMatch: number;
	recency: number;
	confidence: number;
	layerProximity: number;
	attentionScore: number;
}

export interface ScoringContext {
	taskDescription: string;
	taskTags: string[];
	agentRole: string;
	productId: string;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
	tagMatch: 0.35,
	roleMatch: 0.15,
	recency: 0.15,
	confidence: 0.1,
	layerProximity: 0.15,
	attentionScore: 0.1,
};

/** Total context window tokens and knowledge allocation ratio. */
export const CONTEXT_WINDOW_TOKENS = 200_000;
export const KNOWLEDGE_ALLOCATION_RATIO = 0.2;
export const DEFAULT_KNOWLEDGE_BUDGET = CONTEXT_WINDOW_TOKENS * KNOWLEDGE_ALLOCATION_RATIO; // 40_000

const WEIGHT_KEYS: ReadonlyArray<keyof ScoringWeights> = [
	"tagMatch",
	"roleMatch",
	"recency",
	"confidence",
	"layerProximity",
	"attentionScore",
];

const SETTING_PREFIX = "scoring.weight.";

/** Load scoring weights from factory_settings table, falling back to defaults. */
export async function loadScoringWeights(db: HyperIdleDb): Promise<ScoringWeights> {
	const weights: ScoringWeights = { ...DEFAULT_WEIGHTS };

	for (const key of WEIGHT_KEYS) {
		const settingKey = `${SETTING_PREFIX}${key}`;
		const [row] = await db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, settingKey))
			.limit(1);

		if (row) {
			const parsed = Number.parseFloat(row.value);
			if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
				weights[key] = parsed;
			}
		}
	}

	return weights;
}

// --- Attention scoring weights (G2) ---

/**
 * Weights for the attention scoring engine. All values are non-negative.
 *
 * @lore `repetition` and `confidence` are applied as INVERSE contributions in
 * the scorer (high repetition / high confidence REDUCE attention). The weight
 * itself remains a positive knob meaning "how strongly does this signal
 * dampen attention". Defaults are ratios; the scorer normalizes by total.
 */
export interface AttentionWeights {
	readonly novelty: number;
	readonly impact: number;
	readonly conflict: number;
	/** Inverse: high repetition (same finding across many scopes) reduces attention. */
	readonly repetition: number;
	/** Inverse: high confidence reduces attention. */
	readonly confidence: number;
	readonly tasteSensitivity: number;
	readonly recency: number;
	readonly usage: number;
}

/**
 * @lore I6: defaults adjusted to sum to 1.0 (was 1.25). Reduced impact,
 * tasteSensitivity, and recency to bring the total in line.
 */
const DEFAULT_ATTENTION_WEIGHTS: AttentionWeights = {
	novelty: 0.2,
	impact: 0.2,
	conflict: 0.15,
	repetition: 0.1,
	confidence: 0.1,
	tasteSensitivity: 0.15,
	recency: 0.05,
	usage: 0.05,
};

const ATTENTION_WEIGHT_KEYS: ReadonlyArray<keyof AttentionWeights> = [
	"novelty",
	"impact",
	"conflict",
	"repetition",
	"confidence",
	"tasteSensitivity",
	"recency",
	"usage",
];

const ATTENTION_SETTING_PREFIX = "attention.weight.";

/** Threshold at which a recompute crossing upward creates a review item. */
export const ATTENTION_THRESHOLD = 0.7;

/** Absolute bounds for a single attention weight (defense in depth). */
const ATTENTION_WEIGHT_MIN = 0;
const ATTENTION_WEIGHT_MAX = 1;

/**
 * Load attention weights from factory_settings, falling back to defaults.
 *
 * @lore G2 security: `attention.weight.*` factory_settings keys MUST be
 * human-write-only. The settings write endpoint is expected to reject agent
 * writes to any key under the `attention.weight.` prefix. This loader is
 * defense-in-depth: values outside `[0, 1]` fall back to the default so a
 * bad write (e.g. all zeros) can never silently neutralize the engine.
 */
export async function loadAttentionWeights(db: HyperIdleDb): Promise<AttentionWeights> {
	const weights: Record<keyof AttentionWeights, number> = { ...DEFAULT_ATTENTION_WEIGHTS };

	for (const key of ATTENTION_WEIGHT_KEYS) {
		const settingKey = `${ATTENTION_SETTING_PREFIX}${key}`;
		const [row] = await db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, settingKey))
			.limit(1);
		if (row) {
			const parsed = Number.parseFloat(row.value);
			if (
				Number.isFinite(parsed) &&
				parsed >= ATTENTION_WEIGHT_MIN &&
				parsed <= ATTENTION_WEIGHT_MAX
			) {
				weights[key] = parsed;
			}
		}
	}

	return {
		novelty: weights.novelty,
		impact: weights.impact,
		conflict: weights.conflict,
		repetition: weights.repetition,
		confidence: weights.confidence,
		tasteSensitivity: weights.tasteSensitivity,
		recency: weights.recency,
		usage: weights.usage,
	};
}

// --- Relevance config (L22) ---

const DEFAULT_RELEVANCE_WEIGHTS = { recency: 0.4, frequency: 0.4, citation: 0.2 } as const;
const DEFAULT_RELEVANCE_SHAPE = {
	recencyHalflifeDays: 14,
	frequencySaturation: 5,
	frequencyWindowDays: 30,
	citationSaturation: 5,
} as const;

const RELEVANCE_WEIGHT_KEYS = [
	"relevance.weight.recency",
	"relevance.weight.frequency",
	"relevance.weight.citation",
] as const;
const RELEVANCE_SHAPE_KEYS = [
	"relevance.recencyHalflifeDays",
	"relevance.frequencySaturation",
	"relevance.frequencyWindowDays",
	"relevance.citationSaturation",
] as const;

/**
 * Load relevance config from factory_settings, falling back to defaults.
 *
 * @lore L22: relevance.weight.* values must be in [0,1]; shape constants must
 * be positive finite numbers. Invalid values fall back to defaults (defense in
 * depth so a bad write can never silently break the relevance engine).
 */
export async function loadRelevanceConfig(db: HyperIdleDb): Promise<RelevanceConfig> {
	const weights = { ...DEFAULT_RELEVANCE_WEIGHTS } as {
		recency: number;
		frequency: number;
		citation: number;
	};
	const shape = { ...DEFAULT_RELEVANCE_SHAPE } as {
		recencyHalflifeDays: number;
		frequencySaturation: number;
		frequencyWindowDays: number;
		citationSaturation: number;
	};

	// Load weight overrides
	for (const settingKey of RELEVANCE_WEIGHT_KEYS) {
		const [row] = await db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, settingKey))
			.limit(1);
		if (row) {
			const parsed = Number.parseFloat(row.value);
			if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
				const weightKey = settingKey.replace("relevance.weight.", "") as keyof typeof weights;
				weights[weightKey] = parsed;
			}
		}
	}

	// Load shape overrides
	for (const settingKey of RELEVANCE_SHAPE_KEYS) {
		const [row] = await db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, settingKey))
			.limit(1);
		if (row) {
			const parsed = Number.parseFloat(row.value);
			if (Number.isFinite(parsed) && parsed > 0) {
				const shapeKey = settingKey.replace("relevance.", "") as keyof typeof shape;
				shape[shapeKey] = parsed;
			}
		}
	}

	return { weights, shape };
}
