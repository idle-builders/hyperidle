#!/usr/bin/env tsx
import {
	collectDesignProfileCensus,
	findLiveBorderCountMismatches,
} from "./lib/design-profile-census.js";
import { discoverDesignSources } from "./lib/design-source-discovery.js";

// Immutable audit receipts count pre-migration authored sites, not final source
// declarations. Shared class construction (including the upstream PageHeader
// pane consolidation) combines equivalent sites, so the approved receipt
// expansion is the measured final source-profile population.
// Deletion pass: -1 thin, from select-diff.tsx.
// +1 BA9a: SettingsPlugins contribution list left border.
// Review-canvas fabrication cleanup -13 thin, all from deleting fabricated content:
// -3 ReviewActionOperation.tsx (ProposedCallArgsPanel's outer section + header border,
//   plus its `var(--bw-thin)` inline separator style — the panel itself is deleted as
//   test-only-reachable, since `proposedCall` is never populated in production);
// -1 ReviewBatch.tsx net (the "no reply drafted" dashed box deleted; the impact-metric
//   band's border site survives, just moved inside its new `batch.metric ?` guard);
// -1 ReviewCodeDiff.tsx (the trivia expanded-file-list disclosure deleted along with
//   its three hardcoded filenames);
// -5 ReviewComposition.tsx (CheckoutCard's figure + figcaption borders, its two
//   subtotal/total row rules, and the dead "Comment on this" button's border — the
//   whole SPRING24/$120 fake checkout card and one no-op control);
// -3 ReviewVisualDiff.tsx (the deleted MockScreen's hero-band border, the deleted
//   Field component's border, the deleted Thumb component's border — the fake signup
//   screen and its L1 thumbnails).
// Review fix-round -1: ReviewRenderedInContext.tsx — the send-plan/exclusions
//   container's `var(--bw-thin)` inline border, deleted with the five dead
//   fields (`audienceLabel`/`excludedNote`/`sendPlan`/`ctaLabel`/`footer`)
//   `mapRenderedPayload` hardcoded to "" unconditionally.
// thin +2: knowledge document Role row (metadata row rule + error banner).
const APPROVED_BORDER_RECEIPT_EXPANSION = { thin: 192, default: 15, strong: 11 } as const; // -1: KnowledgeDetail.tsx's role-change error banner border deleted with the role row (role stops being editable). -2: capture deletion — ExecutingBand + OutcomeBand borders removed; +1: action-rules list border BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net BB1 default -2: same merge.

const EXPECTED = {
	typography: {
		// Review-canvas fabrication cleanup -5: -2 ReviewActionOperation.tsx ("Refund
		// amount" label deleted; ProposedCallArgsPanel's "Tool" label deleted with the
		// panel — the "Irreversible" label's own site survives, now conditional on
		// `operation.irreversible`); -1 ReviewComposition.tsx (TaskSection's dead
		// betTitle/taskTitle breadcrumb button deleted); -1 ReviewMetricsMoved.tsx (the
		// unconditional "Timing" badge deleted — only the confirmed `needsYou` case
		// renders now); -1 ReviewVisualDiff.tsx (the deleted Field component's own label).
		label: 108, // +2: SettingsSkillsAndRules.tsx's "Registered skills and rules" and "Create a skill or rule" section labels. -2: the two "Model tier" field labels (AgentAddDialog + AgentDetailPane), gone with the tier dial — people pick a model per agent now. BA9f +1: AgentDetailPane's IDENTITY section heading (the SYSTEM PROMPT heading it replaces was the same profile, and AgentEditor gained an "Identity" label above the document link). -1: read-mode ConversationHeader strip removed (was FR-3 +1); +1: BA1 review N7 RoutineDetailPane "Event" field label (event routines show an Event select instead of Schedule); +1: BA9a SettingsPlugins contribution key label; +1: BA9d D11 RoutineDetailPane "Transition to" edit-mode label; -2: capture deletion — ExecutingBand "Executing…" + OutcomeBand "Executed"/"Execution failed" labels removed; +2: action-rules list header + add-rule header; BB1 -4: WorkBet.tsx, WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task (WorkTaskPage adds the single recursive surface back, so -4 is the net); BB1 -2: ArtifactThreadsSummary, useArtifactThreadSummary and KnowledgeCreateDialog deleted — orphaned when the bet page went
		// Review-canvas fabrication cleanup -10: -2 ReviewCodeDiff.tsx ("All checks
		// passed" pill + the "coverage" label deleted from CiRow); -5
		// ReviewComposition.tsx (CheckoutCard's fixed/the-bug pill, "Promo code" label,
		// and both expired/no-feedback captions, all deleted with the checkout mock);
		// -1 ReviewFieldChangeSet.tsx (the unchanged-fields disclosure's five
		// hardcoded field names deleted); -2 ReviewVisualDiff.tsx net (the deleted
		// MockScreen hero caption + the deleted Field's placeholder-box mark, offset
		// by the honest-absence pane's own "No rendered image supplied" caption).
		metadata: 215, // +4: SettingsSkillsAndRules.tsx's intro lede + loading/error/empty-state paragraphs. BA9g -2: the onboarding roster preview ("Creates: Builder, Product Manager…") and the AgentEditor helper under the deleted template prefill — the "What are you building?" step went with the roster it promised. +1: the plugin contributions list now renders a label per contributed row. +3: action-rules intro lede + description text + scope-tag metadata spans. BA9f +3: the identity-document links in AgentProfile, AgentEditor and AgentDetailPane, each replacing an inline persona editor with a link to the one place it is edited. -1: FR-3 read-mode header wrapper; -2: deletion pass removed Toast.tsx; +1: BA1 D8 RoutineCreateDialog "When" field label (team Select removed, When+Event Selects added net +1); +1: AgentEditor "Applied to every run of this agent." helper under the model-options section; -1: BA9d D10 removed "Draft with AI" error span from WorkBet.tsx; -1: BA9d D5 removed "app-managed" note paragraph from AgentDetailPane.tsx; -1: capture deletion — OutcomeBand executedAt span removed BB1 -6: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net BB1 -6: ArtifactThreadsSummary, useArtifactThreadSummary and KnowledgeCreateDialog deleted — orphaned when the bet page went, their only remaining references being @lore comments saying they had been replaced
		// Review-canvas fabrication cleanup -8: -1 ReviewActionOperation.tsx
		// (ProposedCallArgsPanel's arg-key `dt` deleted with the panel); -1
		// ReviewBatch.tsx net (the "no reply drafted" dashed box's caption deleted;
		// the impact-metric line's own site survives inside its new guard); -2
		// ReviewComposition.tsx (CheckoutCard's "Total" label + value); -3
		// ReviewMetricsMoved.tsx net (the deleted "ties to bank" span and the deleted
		// L1 narrative paragraph's three spans, offset by the conditional "ties" span
		// + the rebuilt per-figure current/prior line); -1 ReviewVisualDiff.tsx (the
		// deleted "Create account" CTA span).
		// Review fix-round net -2: -2 ReviewRenderedInContext.tsx (audienceLabel's
		//   separator "·" span + its own label span, both dead — the field is
		//   hardcoded to "" unconditionally, never a real optional case) + -1
		//   ReviewRenderedInContext.tsx (excludedNote's span, same reason), offset by
		//   +1 ReviewFieldChangeSet.tsx (the unchanged-fields row now uses
		//   `type-metadata` instead of a stray `type-control` left from when the row
		//   was a disclosure button).
		small: 202, // -2: KnowledgeDetail.tsx's role row (label + read-only value) and its error banner deleted — role stops being editable from the document; the create-error paragraph SettingsSkillsAndRules.tsx adds is one type-small site, netting -2 against the 3 the row used to carry. BA9g -2: the onboarding "What are you building?" prompt and its "(pick a team type)" hint. +3: knowledge document Role row (label, read-only value, error banner); -1: FR-21 StaleRetryCard restyle; -3: deletion pass removed Toast.tsx; +2: BA9a SettingsPlugins contribution secondary text BB1 -14: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net BB1 -1: ArtifactThreadsSummary, useArtifactThreadSummary and KnowledgeCreateDialog deleted — orphaned when the bet page went, their only remaining references being @lore comments saying they had been replaced
		// Review fix-round -1: ReviewRenderedInContext.tsx — the sendPlan value
		//   span, dead along with the field it displayed.
		copy: 45,
		// Review-canvas fabrication cleanup -2: ReviewComposition.tsx — TaskSection's
		// dead breadcrumb button and ExaminePane's dead "Comment on this" button, both
		// `onClick={() => {}}` no-ops, deleted outright.
		// Follow-up review fixes -1: ReviewMetricsMoved.tsx — the trivia
		// "Show/Hide N items" toggle deleted outright (`MetricsMovedPayload` has no
		// trivia concept at all, so the toggle disclosed nothing real).
		// Review fix-round -1: ReviewFieldChangeSet.tsx — the unchanged-fields row's
		//   `type-control` class removed (it is a static count, not a control).
		control: 86, // -1: KnowledgeDetail.tsx's role-change error banner dismiss button deleted with the role row. BA9g -2: the preset pills and the custom function chips in the deleted onboarding step. +1: knowledge Role row error-banner dismiss; +2: UI-084 skip-to-main-content link; -2: AU44 B0 deleted select+boolean option pills from SessionView; +1: BA9a SettingsPlugins plugin row name BB1 -3: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net BB1 -2: ArtifactThreadsSummary, useArtifactThreadSummary and KnowledgeCreateDialog deleted — orphaned when the bet page went, their only remaining references being @lore comments saying they had been replaced
		input: 11, // +1: AgentEditor model-option select (a harness's declared select for the chosen model)
		"avatar-initial": 11, // BB1 -3: BetCard and the bet pages deleted when bets and tasks merged into one recursive task
		subheading: 9,
		// Review-canvas fabrication cleanup -1: ReviewVisualDiff.tsx — the deleted
		// MockScreen's "Create your account" hero headline.
		lead: 7, // BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net
		title: 11,
		display: 3,
		metric: 5, // -1: AZ-bugs-ui-c removed metric span from WorkBet
		// Review-canvas fabrication cleanup -6: -2 ReviewActionOperation.tsx
		// (ProposedCallArgsPanel's "Tool" value + arg-value `dd`, deleted with the
		// panel); -2 ReviewCodeDiff.tsx (the hardcoded "+0.4%" coverage figure + the
		// trivia expanded-file-list wrapper, both deleted); -2 ReviewComposition.tsx
		// (CheckoutCard's promo-code input value + its subtotal/total container).
		data: 81, // +1: SettingsSkillsAndRules.tsx's row title span. BA9f -1: AgentProfile's <pre> persona dump deleted — the profile links to the identity document instead of reprinting it. // -5: FR-20 hint bar + FR-21 restyle; -3: deletion pass removed ArtifactEmbed.tsx; -2: capture deletion — OutcomeBand receipt + error type-data paragraphs removed; +1: action-rules rule pattern span BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net
		"inline-code": 2,
	},
	// Follow-up review fixes -1: ReviewMetricsMoved.tsx — the deleted trivia
	// toggle button was the sole `motion-feedback` site removed with it.
	motion: { feedback: 8, move: 15, spring: 2, enter: 1, activity: 7, loading: 6, busy: 1 }, // busy -1: capture deletion — ExecutingBand spinner removed BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net
	border: APPROVED_BORDER_RECEIPT_EXPANSION,
} as const;

const root = process.cwd();
const discovered = discoverDesignSources(
	root,
	new Set([".ts", ".tsx", ".css"]),
	new Set(["@hyperidle/core-ui", "@hyperidle/design-system"]),
);
if (discovered.discoveredPackages.length === 0 || discovered.files.length === 0) {
	throw new Error("design-profile-census: dynamic package/source discovery matched zero files");
}
const census = collectDesignProfileCensus(discovered.files);
const output = {
	schemaVersion: 1,
	discoveredPackages: discovered.discoveredPackages,
	scannedFiles: discovered.files.map((file) => file.path),
	...census,
};
const failures: string[] = [];
for (const group of ["typography", "motion"] as const) {
	for (const [profile, expected] of Object.entries(EXPECTED[group])) {
		const actual = census.profiles[group][profile as keyof (typeof census.profiles)[typeof group]];
		if (actual !== expected)
			failures.push(`${group}.${profile}: expected ${expected}, found ${actual}`);
	}
}
failures.push(
	...findLiveBorderCountMismatches(census.profiles.border, APPROVED_BORDER_RECEIPT_EXPANSION),
);
for (const [family, count] of Object.entries(census.rawByFamily)) {
	if (count !== 0) failures.push(`rawByFamily.${family}: expected 0, found ${count}`);
}
for (const site of census.invalidProfileSites)
	failures.push(`${site.path}:${site.locator} ${site.reason}`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (failures.length > 0) {
	process.stderr.write(`${failures.join("\n")}\n`);
	process.exitCode = 1;
}
