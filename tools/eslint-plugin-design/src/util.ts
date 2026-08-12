/**
 * Shared helpers for design-lint rules.
 *
 * @lore K6: every value here is sourced from `framework/design-system/AESTHETICS.md`
 * recommendations tables or `framework/design-system/src/tokens.css`. Do NOT add a
 * value here that is not in one of those two files — see CLAUDE.md "First Principle".
 *
 * @lore U10: Hearth aesthetic update. The 4px grid is replaced by a 6px grid.
 * The radius scale changes from 0/4/8/12+pill to 0/10/16/9999. The font-size
 * allowlist gains 9px, 10px, 17px, and 30px. The SUB_GRID_VALUE constant is
 * removed — Hearth has no 2px sub-grid as a general rule (2px/4px survive only
 * inside component internals via the AQ-001 component-internal exemption).
 */

import { basename } from "node:path";
import type { JSSyntaxElement, Rule, Scope } from "eslint";
import type { Node as ESTreeNode, TemplateElement } from "estree";
import type { JSXAttribute } from "estree-jsx";

/**
 * Allowed Hearth 6px-grid spacing values used by the spacing/density rule.
 * Source: AESTHETICS.md § Spacing & Density — U10 Hearth override (§ U10 changelog).
 *   Allowlist {0,3,6,9,12,18,24,36,48} — the Hearth `--space-*` scale.
 *
 * @lore U10: Changed from 4px grid {0,4,8,12,16,20,24,32,40,48} to Hearth 6px
 * grid {0,3,6,9,12,18,24,36,48}. Note: 4px and 8px (formerly on-grid) are now
 * off-grid. 2px is no longer a special sub-grid case — it is simply off-grid.
 * Component-internal padding (buttons: 10px/7px, inputs: 10px) and sub-element
 * gaps (badges: 4px, toggle-text: 2px) are exempt per AQ-001 component-internal
 * exemption; they should use a file-level `// hearth-internal-padding` directive.
 *
 * @lore K6 review SEV-1: 0 was missing — `p-[0px]` is implicitly valid (the
 * zero case the spec table omits because nobody writes it explicitly, but it
 * is a real value a developer may type). Added per K6-adversary.md SEV-1 #4.
 */
export const SPACING_ALLOWLIST: ReadonlySet<number> = new Set([0, 3, 6, 9, 12, 18, 24, 36, 48]);

/**
 * Hearth type-scale allowlist.
 * Source: AESTHETICS.md § Typography — U10 Hearth override (§ U10 changelog).
 *   Full allowlist: {9,10,11,12,13,14,15,16,17,18,20,24,30}
 *
 * @lore U10: Added 9px (count badges — numeric counters only, type scale floor),
 * 10px (micro-typography: badge-agent labels, avatar-sm initials, swatch labels),
 * 17px (Hearth --text-lg / --ds-font-size-lg), 30px (Hearth --text-3xl for page
 * titles and brand headings). Kept 11px and 14px for compact density.
 */
export const FONT_SIZE_ALLOWLIST: ReadonlySet<number> = new Set([
	9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 30,
]);

/**
 * Raw Tailwind palette names that are NOT part of the Hearth semantic token set.
 * Source: AESTHETICS.md § Color & Dark Mode — "Raw Tailwind color usage" lint hint
 * regex enumerates these palette names. AQ-018 specifically calls out cool-gray
 * palettes (slate, gray, zinc, neutral) as Hearth violations — all neutrals must
 * be warm-tinted per the Hearth "no cool grays" principle.
 */
export const RAW_TAILWIND_PALETTE = [
	"slate",
	"gray",
	"zinc",
	"neutral",
	"stone",
	"red",
	"orange",
	"amber",
	"yellow",
	"lime",
	"green",
	"emerald",
	"teal",
	"cyan",
	"sky",
	"blue",
	"indigo",
	"violet",
	"purple",
	"fuchsia",
	"pink",
	"rose",
] as const;

/**
 * Files that are exempt from the "no heavy shadow on cards" rule.
 * Source: AESTHETICS.md § AI-Aesthetic tell #10 — "outside files matching
 * `/Modal|Dialog|Popover|Tooltip/`".
 *
 * @lore K6 review SEV-1: the spec's literal regex matches anywhere in the
 * file path, so e.g. `BetCardModalSummary.tsx` or `pages/dialog-bar/Card.tsx`
 * silently exempts every card. We anchor strictly to the basename and require
 * an exact `(Modal|Dialog|Popover|Tooltip|Sheet|Drawer).tsx` filename.
 */
const SHADOW_OVERLAY_BASENAME_REGEX = /^(Modal|Dialog|Popover|Tooltip|Sheet|Drawer)\.tsx$/;

/**
 * Returns true when the file is one of the overlay primitive component files
 * for which heavy shadow is permitted (Modal/Dialog/Popover/Tooltip/Sheet/Drawer).
 */
export function isShadowOverlayFile(filename: string): boolean {
	return SHADOW_OVERLAY_BASENAME_REGEX.test(basename(filename));
}

/**
 * Class-name string extractor: returns the literal text of `className="..."`.
 * Returns null if the JSXAttribute value is not a static string literal we can
 * parse. We intentionally do not chase template literals or `clsx()` — those
 * are out of scope for the regex-based screenshot-detectable tells (the
 * higher-level `/design-lint` skill catches dynamic cases).
 *
 * Accepts JSXAttribute directly so callers no longer need to cast.
 */
export function getClassNameLiteral(attr: JSXAttribute | null): string | null {
	if (!attr) return null;
	if (attr.type !== "JSXAttribute") return null;
	const v = attr.value;
	if (!v) return null;
	// estree-jsx JSXSimpleAttribute.value is ESTree.BaseExpression | null.
	// We narrow to Literal by checking the type discriminant.
	const vAny = v as { type?: string; value?: unknown };
	if (vAny.type === "Literal" && typeof vAny.value === "string") {
		return vAny.value as string;
	}
	return null;
}

/**
 * Names of helper functions whose string-literal arguments should be treated
 * as className strings (per K6 review SEV-2 — class-string composition is the
 * common case in real components). Walked by `collectClassStringsFromExpression`.
 */
const CLASSNAME_HELPER_NAMES: ReadonlySet<string> = new Set([
	"cn",
	"clsx",
	"classnames",
	"twMerge",
	"twJoin",
]);

/**
 * Internal traversal node type — has an index signature so the `walk` helper
 * can read arbitrary properties (node.value, node.quasis, etc.) without a cast
 * on every access. NOT exported; external callers receive `JSSyntaxElement`.
 *
 * @lore refactor/no-unknown-cast-eslint-plugins: Previously the only AnyNode
 * type was used everywhere, which forced `as unknown as AnyNode` at call sites
 * to bridge estree-jsx → AnyNode (index-signature mismatch). Now the exported
 * output type is `JSSyntaxElement` (structurally compatible with all ESTree /
 * estree-jsx nodes via a single `as JSSyntaxElement`), while the internal walk
 * keeps this private shape to avoid per-property casts inside the traversal switch.
 */
type WalkNode = { type: string; [k: string]: unknown };

/**
 * Public node type used in exported API surfaces. `JSSyntaxElement` is
 * `{ type: string; loc?: ESTree.SourceLocation | null }` — satisfied by every
 * ESTree and estree-jsx node, so callers can pass any node with a single
 * `as JSSyntaxElement` instead of the old `as unknown as AnyNode`.
 */
type AnyNode = JSSyntaxElement;

/**
 * Walk an arbitrary expression and collect every static class-string we can
 * see: bare string literals, template-literal cooked text, members of arrays,
 * nested call arguments to `cn()`/`clsx()`. Used by rules to widen detection
 * beyond `className="literal"`. Returns each found string with its AST node so
 * the rule can report on the right location.
 */
export function collectClassStringsFromExpression(
	expr: unknown,
): Array<{ text: string; node: AnyNode }> {
	const out: Array<{ text: string; node: AnyNode }> = [];
	function walk(n: unknown): void {
		if (!n || typeof n !== "object") return;
		const node = n as WalkNode;
		switch (node.type) {
			case "Literal": {
				if (typeof node.value === "string") {
					out.push({ text: node.value as string, node: node as JSSyntaxElement });
				}
				return;
			}
			case "TemplateLiteral": {
				const quasis = node.quasis as Array<TemplateElement>;
				for (const q of quasis) {
					const text = q.value.cooked ?? q.value.raw;
					if (typeof text === "string" && text.length > 0) {
						out.push({ text, node: q as JSSyntaxElement });
					}
				}
				const exprs = node.expressions as unknown[];
				for (const sub of exprs) walk(sub);
				return;
			}
			case "ArrayExpression": {
				const elements = node.elements as unknown[];
				for (const el of elements) walk(el);
				return;
			}
			case "ObjectExpression": {
				const props = node.properties as Array<{
					type: string;
					key?: unknown;
					value?: unknown;
				}>;
				// classnames/cn convention: { 'class-string': condition }
				for (const p of props) {
					if (p.type === "Property") {
						walk(p.key);
					}
				}
				return;
			}
			case "CallExpression": {
				const callee = node.callee as { type: string; name?: string };
				if (
					callee.type === "Identifier" &&
					callee.name &&
					CLASSNAME_HELPER_NAMES.has(callee.name)
				) {
					const args = node.arguments as unknown[];
					for (const a of args) walk(a);
				}
				return;
			}
			case "ConditionalExpression": {
				walk(node.consequent);
				walk(node.alternate);
				return;
			}
			case "LogicalExpression":
			case "BinaryExpression": {
				walk(node.left);
				walk(node.right);
				return;
			}
		}
	}
	walk(expr);
	return out;
}

/**
 * Returns true when the given AST node is contained within a `className=` (or
 * `style=`) JSXAttribute, so a separate visitor can avoid double-reporting on
 * cn()/clsx() args that the JSXAttribute visitor already handled.
 */
export function isInsideClassNameAttribute(node: { parent?: unknown }): boolean {
	let cur = (node as { parent?: WalkNode }).parent;
	while (cur) {
		if (cur.type === "JSXAttribute") {
			const name = (cur as { name?: { type?: string; name?: string } }).name;
			return name?.type === "JSXIdentifier" && (name.name === "className" || name.name === "style");
		}
		cur = (cur as { parent?: WalkNode }).parent;
	}
	return false;
}

/**
 * Collect every static class-string visible from a className JSXAttribute,
 * whether the value is a bare string literal or a `{cn(...)}`/template-literal
 * expression container. Replaces the literal-only `getClassNameLiteral` for
 * rules that want to widen coverage to dynamic compositions.
 */
export function collectClassStringsFromJSXAttribute(
	attr: unknown,
): Array<{ text: string; node: AnyNode }> {
	if (!attr || typeof attr !== "object") return [];
	const a = attr as { value?: WalkNode | null };
	const v = a.value;
	if (!v) return [];
	if (v.type === "Literal" && typeof v.value === "string") {
		return [{ text: v.value as string, node: v as JSSyntaxElement }];
	}
	if (v.type === "JSXExpressionContainer") {
		return collectClassStringsFromExpression(v.expression);
	}
	return [];
}

/**
 * Resolves a bare `Identifier` to the initializer expression of the single
 * same-file `const` it is bound to, so the deep collector can look THROUGH a
 * variable indirection instead of stopping at it.
 *
 * @lore AZ7 review-round-2 NEW-1: `CommentRow.tsx` builds `avatarClass` as a
 * ternary of two class strings, assigns it to a `const`, and only THEN passes
 * it to `className`. Every className-scanning tool in this repo (this deep
 * collector, `scan.mjs`, `predicates.mjs`) walked `className={avatarClass}`
 * and saw only an `Identifier` node — none of the switch cases matched, so
 * the two strings underneath (one carrying `rounded-full`, the pill's
 * forbidden second spelling) were invisible. The same shape turned out NOT to
 * be a one-off: a repo sweep (grep for a bare-identifier `className={...}`)
 * across every package's `src/` under `layers/` and `framework/` found ~30
 * more sites — mostly module-level extracted class-string constants (`ArtifactStackItem.tsx`'s
 * `ROW`/`PILL`, `ErrorState.tsx`'s `RETRY_BTN_CLASS`, …) rather than local
 * ternaries, but the AST shape (an `Identifier` in class-string position) and
 * the blind spot are identical.
 *
 * Deliberately conservative — a false negative (miss a real violation) is
 * preferable to a false positive (report a violation on a variable that could
 * take a different value at runtime, which would make the rule wrong, not
 * just incomplete): only follows a variable that
 *   1. resolves to exactly ONE `const` declaration (not `let`/`var` — nothing
 *      to chase if the binding can be reassigned after its `const` init), and
 *   2. has exactly one WRITE reference anywhere in scope (the initializer
 *      itself) — so a `const` that is never reassigned (TypeScript wouldn't
 *      allow re-assignment anyway, but this also rules out destructuring
 *      rebinds and shadowing edge cases the scope manager might resolve
 *      unexpectedly).
 * A cycle guard (`seen`) stops runaway recursion; real cycles should be
 * impossible in valid JS (a `const` cannot reference a not-yet-declared
 * `const`), but the guard costs nothing and removes the need to prove that.
 */
// AZ7 review-round-3 NB3-1: `unknown | null` is exactly `unknown` in TypeScript
// (`null` is already a member of `unknown`), so the `| null` said nothing about
// what callers get back. The real contract is narrower: either an AST node
// (an object with at least a `type`, matched by the `walk` switch in the deep
// collector) or `null` when resolution fails — never a primitive.
export type IdentifierResolver = (identifierNode: unknown) => { type: string } | null;

/**
 * Builds an `IdentifierResolver` bound to a specific rule's `context`, using
 * ESLint's scope manager (`context.sourceCode.getScope`) to find the
 * declaration a given `Identifier` node resolves to.
 */
export function createConstIdentifierResolver(context: Rule.RuleContext): IdentifierResolver {
	return (identifierNode: unknown): { type: string } | null => {
		const node = identifierNode as { type?: string; name?: string };
		if (!node || node.type !== "Identifier" || typeof node.name !== "string") return null;
		// AZ7 review-round-3 NB3-2: no try/catch here — `.claude/rules/typescript.md`
		// says let unexpected errors propagate. `getScope` is called the same way,
		// uncaught, in `require-ds-attribute.ts:123` on this same plugin; if it
		// throws on a node from this rule's own AST walk that is a real bug in the
		// walk (an unlinked/synthetic node), not a condition to hide behind `null`.
		const scope: Scope.Scope = context.sourceCode.getScope(identifierNode as ESTreeNode);
		let cur: Scope.Scope | null = scope;
		let variable: Scope.Variable | undefined;
		while (cur) {
			variable = cur.variables.find((v) => v.name === node.name);
			if (variable) break;
			cur = cur.upper;
		}
		if (!variable) return null;
		if (variable.defs.length !== 1) return null;
		const def = variable.defs[0];
		if (!def || def.type !== "Variable") return null;
		const declaration = (def as { parent?: { kind?: string } }).parent;
		if (declaration?.kind !== "const") return null;
		const writes = variable.references.filter((r) => r.isWrite());
		if (writes.length !== 1) return null;
		const declarator = def.node as { init?: { type: string } } | null;
		return declarator?.init ?? null;
	};
}

/**
 * Deep variant of `collectClassStringsFromExpression` — walks EVERY call
 * expression's arguments and, for a member-call receiver (`[...].join(" ")`),
 * the receiver too. The shallow collector only widens into `cn()`/`clsx()`-style
 * named helpers; it never chases `.join()`, so `className={[...].join(" ")}` —
 * a real, measured pattern (AZ7 measurement `scan.mjs`/`predicates.mjs`, which
 * use this exact traversal shape) — is invisible to it. `no-off-scale-radius`
 * silently passed `Checkbox.tsx`'s `rounded-[6px]` for this reason: the class
 * list is built via `[...].join(" ")` and the shallow walker stops at the
 * `CallExpression` because `.join` is a `MemberExpression` callee, not a bare
 * `Identifier` named `cn`/`clsx`/etc.
 *
 * @lore AZ7 E2/E6: kept as a SEPARATE exported function rather than changing
 * `collectClassStringsFromExpression` in place — that function backs 20+ other
 * rules already at `error` in production; widening it in place risks surfacing
 * new findings in files those rules currently read as clean, outside this
 * work package's scope. The two new AZ7 rules (`radius-token-only`,
 * `no-handrolled-control`) use the deep variant so their site counts match the
 * measurement's `predicate-sites.json`, which is what `migration-backlog.md`
 * and the scope-line arithmetic in the approved plan are built from.
 *
 * @lore AZ7 review-round-2 NEW-1: accepts an optional `resolveIdentifier` —
 * see `createConstIdentifierResolver` — so a bare `Identifier` in class-string
 * position (`className={avatarClass}`, or a template-literal interpolation
 * `${colorClass}`) can be followed to its same-file `const` initializer
 * instead of being silently invisible. Optional and defaulted to a no-op so
 * every existing call site (and the 20+ rules on the shallow collector) is
 * unaffected unless a rule opts in.
 */
export function collectClassStringsFromExpressionDeep(
	expr: unknown,
	resolveIdentifier?: IdentifierResolver,
): Array<{ text: string; node: AnyNode }> {
	const out: Array<{ text: string; node: AnyNode }> = [];
	const seen = new Set<unknown>();
	function walk(n: unknown): void {
		if (!n || typeof n !== "object") return;
		const node = n as WalkNode;
		switch (node.type) {
			case "Literal": {
				if (typeof node.value === "string") {
					out.push({ text: node.value as string, node: node as JSSyntaxElement });
				}
				return;
			}
			case "TemplateLiteral": {
				const quasis = node.quasis as Array<TemplateElement>;
				for (const q of quasis) {
					const text = q.value.cooked ?? q.value.raw;
					if (typeof text === "string" && text.length > 0) {
						out.push({ text, node: q as JSSyntaxElement });
					}
				}
				const exprs = node.expressions as unknown[];
				for (const sub of exprs) walk(sub);
				return;
			}
			case "ArrayExpression": {
				const elements = node.elements as unknown[];
				for (const el of elements) walk(el);
				return;
			}
			case "ObjectExpression": {
				const props = node.properties as Array<{
					type: string;
					key?: unknown;
					value?: unknown;
				}>;
				for (const p of props) {
					if (p.type === "Property") walk(p.key);
				}
				return;
			}
			case "CallExpression": {
				const args = node.arguments as unknown[];
				for (const a of args) walk(a);
				// `[...].join(" ")` / `arr.filter(Boolean).join(" ")` — also walk the
				// receiver of a member-call, whatever its name (not just cn/clsx).
				const callee = node.callee as WalkNode;
				if (callee.type === "MemberExpression") {
					walk((callee as { object?: unknown }).object);
				}
				return;
			}
			case "ConditionalExpression": {
				walk(node.consequent);
				walk(node.alternate);
				return;
			}
			case "LogicalExpression":
			case "BinaryExpression": {
				walk(node.left);
				walk(node.right);
				return;
			}
			case "ParenthesizedExpression": {
				walk((node as { expression?: unknown }).expression);
				return;
			}
			case "Identifier": {
				if (!resolveIdentifier || seen.has(node)) return;
				seen.add(node);
				const resolved = resolveIdentifier(node);
				if (resolved) walk(resolved);
				return;
			}
		}
	}
	walk(expr);
	return out;
}

/**
 * Deep variant of `collectClassStringsFromJSXAttribute` — see
 * `collectClassStringsFromExpressionDeep` for why this exists as a sibling
 * function rather than a change to the shallow one.
 */
export function collectClassStringsFromJSXAttributeDeep(
	attr: unknown,
	resolveIdentifier?: IdentifierResolver,
): Array<{ text: string; node: AnyNode }> {
	if (!attr || typeof attr !== "object") return [];
	const a = attr as { value?: WalkNode | null };
	const v = a.value;
	if (!v) return [];
	if (v.type === "Literal" && typeof v.value === "string") {
		return [{ text: v.value as string, node: v as JSSyntaxElement }];
	}
	if (v.type === "JSXExpressionContainer") {
		return collectClassStringsFromExpressionDeep(v.expression, resolveIdentifier);
	}
	return [];
}

/**
 * Tiny helper so each rule can build a Rule.RuleModule without ts-eslint Utils.
 * Keeps the rule files free of boilerplate.
 */
export function createRule(rule: Rule.RuleModule): Rule.RuleModule {
	return rule;
}

/**
 * Cast any ESTree / estree-jsx node to `JSSyntaxElement` for passing to
 * `context.report({ node })`. This is the single audited boundary replacing
 * all `node as unknown as Rule.Node` casts in rule files.
 *
 * `JSSyntaxElement` is `{ type: string; loc?: ESTree.SourceLocation | null }`
 * — a structural supertype that every AST node satisfies. ESLint's `context.report`
 * internally accepts any `JSSyntaxElement`, not just the `Rule.Node` union of
 * standard ESTree nodes. The single `as JSSyntaxElement` here is safe because:
 *   1. All ESTree and estree-jsx nodes have `type: string` and `loc`.
 *   2. `context.report` only uses `loc` to report the source position.
 *
 * @lore refactor/no-unknown-cast-eslint-plugins: Replaces all `node as unknown
 * as Rule.Node` double-casts spread across rule files. Centralising the cast
 * makes it auditable and eliminates the `unknown` intermediate.
 */
export function asReportNode(node: { type: string }): JSSyntaxElement {
	return node as JSSyntaxElement;
}
