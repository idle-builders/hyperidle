import {
	classifyTokenName,
	NON_FAMILIES,
	TOKEN_FAMILY_OWNERS,
} from "eslint-plugin-design/token-family-owners";
import postcss, { type AtRule, type Declaration, type Rule } from "postcss";

export interface DesignCssSource {
	path: string;
	css: string;
}

export interface DesignCssFinding {
	path: string;
	line: number;
	family: string;
	message: string;
}

const TYPOGRAPHY_PROPERTIES = new Set([
	"font",
	"font-family",
	"font-size",
	"font-weight",
	"letter-spacing",
	"line-height",
]);
const MOTION_PROPERTIES = new Set([
	"animation",
	"animation-duration",
	"animation-name",
	"animation-timing-function",
	"scroll-behavior",
	"transition",
	"transition-duration",
	"transition-property",
	"transition-timing-function",
]);

function finding(
	source: DesignCssSource,
	declaration: Declaration,
	family: string,
): DesignCssFinding {
	return {
		path: source.path,
		line: declaration.source?.start?.line ?? 1,
		family,
		message: `${declaration.prop}: ${declaration.value}`,
	};
}

function isReducedMotionRule(rule: Rule): boolean {
	const parent = rule.parent as AtRule | undefined;
	if (parent?.type !== "atrule" || parent.name !== "media") return false;
	if (!parent.params.includes("prefers-reduced-motion: reduce")) return false;
	const selectors = new Set(rule.selectors.map((selector) => selector.trim()));
	return selectors.has("*") && selectors.has("*::before") && selectors.has("*::after");
}

function hasExactReducedContract(css: string): boolean {
	const root = postcss.parse(css);
	let found = false;
	root.walkRules((rule) => {
		if (!isReducedMotionRule(rule)) return;
		const declarations = new Map(
			rule.nodes.map((node) => [node.type === "decl" ? node.prop : "", node]),
		);
		const animation = declarations.get("animation") as Declaration | undefined;
		const transition = declarations.get("transition") as Declaration | undefined;
		const scroll = declarations.get("scroll-behavior") as Declaration | undefined;
		found =
			animation?.value === "none" &&
			animation.important &&
			transition?.value === "none" &&
			transition.important &&
			scroll?.value === "auto" &&
			scroll.important;
	});
	return found;
}

function tokenFamilyFindings(source: DesignCssSource, root: postcss.Root): DesignCssFinding[] {
	const findings: DesignCssFinding[] = [];
	const seen = new Set<string>();
	root.walkDecls(/^--/, (declaration) => {
		if (seen.has(declaration.prop)) return;
		seen.add(declaration.prop);
		const classification = classifyTokenName(declaration.prop);
		if (!classification) {
			findings.push({
				...finding(source, declaration, declaration.prop),
				message: `token ${declaration.prop} has no classified family`,
			});
			return;
		}
		if (classification in TOKEN_FAMILY_OWNERS) {
			const owners = TOKEN_FAMILY_OWNERS[classification as keyof typeof TOKEN_FAMILY_OWNERS];
			if (owners.size === 0) {
				findings.push({
					...finding(source, declaration, classification),
					message: `token family ${classification} has no gate owner`,
				});
			}
			return;
		}
		const rationale = NON_FAMILIES[classification as keyof typeof NON_FAMILIES];
		if (!rationale?.trim()) {
			findings.push({
				...finding(source, declaration, classification),
				message: `non-family ${classification} has no rationale`,
			});
		}
	});
	return findings;
}

/** Pure CSS verdict used by tests and the executable gate. */
export function evaluateDesignCss(sources: readonly DesignCssSource[]): DesignCssFinding[] {
	const findings: DesignCssFinding[] = [];
	for (const source of sources) {
		const isRegistry = source.path.endsWith("framework/design-system/src/tokens.css");
		const root = postcss.parse(source.css, { from: source.path });
		if (isRegistry && !hasExactReducedContract(source.css)) {
			findings.push({
				path: source.path,
				line: 1,
				family: "reduced-motion",
				message: "missing exact global reduced-motion override",
			});
		}
		if (isRegistry) findings.push(...tokenFamilyFindings(source, root));
		root.walkDecls((declaration) => {
			if (isRegistry) return;
			const property = declaration.prop.toLowerCase();
			if (TYPOGRAPHY_PROPERTIES.has(property)) {
				findings.push(finding(source, declaration, property));
				return;
			}
			if (MOTION_PROPERTIES.has(property)) {
				findings.push(
					finding(source, declaration, property.includes("timing") ? "easing" : "duration"),
				);
				return;
			}
			if (
				/^border(?:-(?:block|inline|top|right|bottom|left)(?:-(?:start|end))?)?-width$/.test(
					property,
				)
			) {
				findings.push(finding(source, declaration, "border-width"));
				return;
			}
			if (
				(property === "color" || property.endsWith("-color")) &&
				/(?:#[0-9a-f]+|rgba?\(|(?:slate|gray|zinc|neutral|red|blue|indigo|purple)-[0-9])/i.test(
					declaration.value,
				)
			) {
				findings.push(finding(source, declaration, "color"));
			}
		});
	}
	return findings;
}
