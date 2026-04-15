import { type HyperIdleDb, factorySettings } from "@hyperidle/db";
import { eq } from "drizzle-orm";

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

/** Budget allocation by category. */
export const BUDGET_ALLOCATION = {
	task: 0.4,
	session: 0.3,
	general: 0.2,
	factory: 0.1,
} as const;

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
export function loadScoringWeights(db: HyperIdleDb): ScoringWeights {
	const weights: ScoringWeights = { ...DEFAULT_WEIGHTS };

	for (const key of WEIGHT_KEYS) {
		const settingKey = `${SETTING_PREFIX}${key}`;
		const row = db.select().from(factorySettings).where(eq(factorySettings.key, settingKey)).get();

		if (row) {
			const parsed = Number.parseFloat(row.value);
			if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
				weights[key] = parsed;
			}
		}
	}

	return weights;
}

/** Get the default weights (no DB access). */
export function getDefaultWeights(): ScoringWeights {
	return { ...DEFAULT_WEIGHTS };
}
