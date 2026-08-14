export const OWNED_TOKEN_FAMILIES = [
	"color",
	"radius",
	"spacing",
	"shadow",
	"z-index",
	"font-family",
	"font-size",
	"font-weight",
	"line-height",
	"letter-spacing",
	"duration",
	"easing",
	"border-width",
] as const;

export type OwnedTokenFamily = (typeof OWNED_TOKEN_FAMILIES)[number];

export const TOKEN_FAMILY_OWNERS: Readonly<Record<OwnedTokenFamily, ReadonlySet<string>>> = {
	color: new Set(["no-hardcoded-color", "no-raw-tailwind-color"]),
	radius: new Set(["radius-token-only"]),
	spacing: new Set(["no-off-grid-spacing"]),
	shadow: new Set(["shadow-token-only"]),
	"z-index": new Set(["no-raw-overlay-z"]),
	"font-family": new Set(["typography-profile-only"]),
	"font-size": new Set(["typography-profile-only"]),
	"font-weight": new Set(["typography-profile-only"]),
	"line-height": new Set(["typography-profile-only"]),
	"letter-spacing": new Set(["typography-profile-only"]),
	duration: new Set(["motion-profile-only"]),
	easing: new Set(["motion-profile-only"]),
	"border-width": new Set(["border-width-profile-only"]),
};

export const NON_FAMILIES = {
	"component-geometry": "component-specific responsive bound, not reusable value vocabulary",
} as const;

export type TokenClassification = OwnedTokenFamily | keyof typeof NON_FAMILIES;

const EXACT_TOKEN_FAMILIES: Readonly<Record<string, TokenClassification>> = {
	"--text-xs": "font-size",
	"--text-sm": "font-size",
	"--text-base": "font-size",
	"--text-lg": "font-size",
	"--text-xl": "font-size",
	"--text-2xl": "font-size",
	"--text-3xl": "font-size",
	"--font-sans": "font-family",
	"--font-mono": "font-family",
	"--fw-normal": "font-weight",
	"--fw-medium": "font-weight",
	"--fw-semibold": "font-weight",
	"--fw-bold": "font-weight",
	"--leading-tight": "line-height",
	"--leading-normal": "line-height",
	"--leading-body": "line-height",
	"--leading-relaxed": "line-height",
	"--tracking-caps": "letter-spacing",
	"--tracking-caps-sm": "letter-spacing",
	"--motion-fast": "duration",
	"--motion-default": "duration",
	"--motion-slow": "duration",
	"--motion-ease": "easing",
	"--easing-expressive": "easing",
	"--bw-thin": "border-width",
	"--bw-default": "border-width",
	"--bw-strong": "border-width",
	"--card-max-h": "component-geometry",
};

/** Classify every custom property declared by the design-token registry. */
export function classifyTokenName(name: string): TokenClassification | null {
	const exact = EXACT_TOKEN_FAMILIES[name];
	if (exact) return exact;
	if (name.startsWith("--r-")) return "radius";
	if (name.startsWith("--space-")) return "spacing";
	if (name.startsWith("--shadow-")) return "shadow";
	if (name.startsWith("--z-")) return "z-index";
	if (
		name.startsWith("--surface-") ||
		name.startsWith("--accent-") ||
		name.startsWith("--status-") ||
		name.startsWith("--border-") ||
		name.startsWith("--text-") ||
		name === "--scrim"
	) {
		return "color";
	}
	return null;
}
