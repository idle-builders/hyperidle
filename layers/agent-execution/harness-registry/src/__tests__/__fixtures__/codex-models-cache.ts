/**
 * A real capture of `~/.codex/models_cache.json`, taken 2026-08-25 and trimmed to
 * the fields the parser reads. The account etag is redacted.
 *
 * Captured, never hand-written: a hand-written fixture proves only that the
 * parser agrees with our idea of the format, which is the mistake that made a
 * hardcoded codex model list look reasonable in the first place.
 */
export const CODEX_MODELS_CACHE_CAPTURE = String.raw`{
	"fetched_at": "2026-08-25T22:17:59.275325Z",
	"etag": "<redacted>",
	"client_version": "0.149.0",
	"models": [
		{
			"slug": "gpt-5.6-sol",
			"display_name": "GPT-5.6-Sol",
			"default_reasoning_level": "low",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				},
				{
					"effort": "max",
					"description": "Maximum reasoning depth for the hardest problems"
				},
				{
					"effort": "ultra",
					"description": "Maximum reasoning with automatic task delegation"
				}
			],
			"visibility": "list",
			"supported_in_api": true,
			"context_window": 272000
		},
		{
			"slug": "gpt-5.6-terra",
			"display_name": "GPT-5.6-Terra",
			"default_reasoning_level": "medium",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				},
				{
					"effort": "max",
					"description": "Maximum reasoning depth for the hardest problems"
				},
				{
					"effort": "ultra",
					"description": "Maximum reasoning with automatic task delegation"
				}
			],
			"visibility": "list",
			"supported_in_api": true,
			"context_window": 272000
		},
		{
			"slug": "gpt-5.6-luna",
			"display_name": "GPT-5.6-Luna",
			"default_reasoning_level": "medium",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				},
				{
					"effort": "max",
					"description": "Maximum reasoning depth for the hardest problems"
				}
			],
			"visibility": "list",
			"supported_in_api": true,
			"context_window": 272000
		},
		{
			"slug": "gpt-reserve",
			"display_name": "GPT-Reserve",
			"default_reasoning_level": "medium",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				},
				{
					"effort": "max",
					"description": "Maximum reasoning depth for the hardest problems"
				}
			],
			"visibility": "hide",
			"supported_in_api": true,
			"context_window": 272000
		},
		{
			"slug": "gpt-5.5",
			"display_name": "GPT-5.5",
			"default_reasoning_level": "medium",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				}
			],
			"visibility": "list",
			"supported_in_api": true,
			"context_window": 272000
		},
		{
			"slug": "gpt-5.4",
			"display_name": "GPT-5.4",
			"default_reasoning_level": "medium",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				}
			],
			"visibility": "list",
			"supported_in_api": true,
			"context_window": 272000
		},
		{
			"slug": "gpt-5.4-mini",
			"display_name": "GPT-5.4-Mini",
			"default_reasoning_level": "medium",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				}
			],
			"visibility": "list",
			"supported_in_api": true,
			"context_window": 272000
		},
		{
			"slug": "gpt-5.3-codex-spark",
			"display_name": "GPT-5.3-Codex-Spark",
			"default_reasoning_level": "high",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				}
			],
			"visibility": "list",
			"supported_in_api": false,
			"context_window": 128000
		},
		{
			"slug": "codex-auto-review",
			"display_name": "Codex Auto Review",
			"default_reasoning_level": "medium",
			"supported_reasoning_levels": [
				{
					"effort": "low",
					"description": "Fast responses with lighter reasoning"
				},
				{
					"effort": "medium",
					"description": "Balances speed and reasoning depth for everyday tasks"
				},
				{
					"effort": "high",
					"description": "Greater reasoning depth for complex problems"
				},
				{
					"effort": "xhigh",
					"description": "Extra high reasoning depth for complex problems"
				},
				{
					"effort": "max",
					"description": "Maximum reasoning depth for the hardest problems"
				}
			],
			"visibility": "hide",
			"supported_in_api": true,
			"context_window": 272000
		}
	]
}
`;
