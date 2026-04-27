/**
 * L9 — Artifact-kind renderers E2E (red phase).
 *
 * Each test loads the Conversations Review page with a seeded thread of
 * the given kind and asserts the distinguishing renderer is on screen with
 * its metadata strip populated. Validation scenarios from
 * docs/work-packages/TRACK-L.md L9:
 *
 *   - skill_change → SkillChangeView with per-agent impact list above
 *     verdict bar.
 *   - action_summary + risk_tier=critical → red CRITICAL badge + L7
 *     type-to-confirm pattern.
 *   - permission_request L2→L3 + Approve once → autonomy table unchanged
 *     (one-shot grant only).
 *
 * These tests MUST fail today: the seeded threads do not exist and
 * ConversationsReview does not yet route through ArtifactKindRenderer.
 */
import { expect, test } from "@playwright/test";

test.describe("L9 artifact-kind renderers", () => {
	test("action_summary thread renders ActionSummaryView with metadata strip", async ({ page }) => {
		await page.goto("/conversations/review?thread=l9-action-summary");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		await expect(page.getByTestId("artifact-metadata-strip-v2")).toBeVisible();
		await expect(page.getByTestId("action-summary-impact-list")).toBeVisible();
	});

	test("action_summary with risk_tier=critical shows red CRITICAL badge + type-to-confirm", async ({
		page,
	}) => {
		await page.goto("/conversations/review?thread=l9-action-summary-critical");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		const badge = page.getByTestId("artifact-risk-badge");
		await expect(badge).toHaveAttribute("data-risk", "critical");
		await expect(badge).toContainText(/critical/i);
		// L7 type-to-confirm pattern surfaces the confirm input.
		await expect(page.getByTestId("action-summary-confirm-input")).toBeVisible();
	});

	test("skill_change thread renders SkillChangeView with per-agent impact list above verdict bar", async ({
		page,
	}) => {
		await page.goto("/conversations/review?thread=l9-skill-change");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		const list = page.getByTestId("skill-change-impact-list");
		await expect(list).toBeVisible();
		await expect(list).toContainText(/architect/i);
		await expect(list).toContainText(/developer/i);
		await expect(list).toContainText(/builder/i);
		// DOM order: impact list precedes the verdict toolbar.
		const listHandle = await list.elementHandle();
		const toolbarHandle = await page.getByRole("toolbar", { name: /verdict/i }).elementHandle();
		expect(listHandle).not.toBeNull();
		expect(toolbarHandle).not.toBeNull();
		const result = await page.evaluate(
			([a, b]) => {
				if (!(a && b)) return 0;
				return (a as Element).compareDocumentPosition(b as Element);
			},
			[listHandle, toolbarHandle],
		);
		// Node.DOCUMENT_POSITION_FOLLOWING = 4
		expect((result as number) & 4).toBeTruthy();
	});

	test("file_lease thread renders FileLeaseView side-by-side with override verdict labels", async ({
		page,
	}) => {
		await page.goto("/conversations/review?thread=l9-file-lease");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		await expect(page.getByTestId("file-lease-a")).toBeVisible();
		await expect(page.getByTestId("file-lease-b")).toBeVisible();
		await expect(page.getByRole("button", { name: /grant lease to a/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /grant lease to b/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /coordinate/i })).toBeVisible();
	});

	test("permission_request thread renders PermissionRequestView with override verdicts", async ({
		page,
	}) => {
		await page.goto("/conversations/review?thread=l9-permission-request");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		await expect(page.getByTestId("perm-req-current-level")).toContainText(/L2/);
		await expect(page.getByTestId("perm-req-requested-level")).toContainText(/L3/);
		await expect(page.getByRole("button", { name: /approve once/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /raise level/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /deny.*reason/i })).toBeVisible();
	});

	test("Approve once on permission_request leaves autonomy table unchanged", async ({
		page,
		request,
	}) => {
		await page.goto("/conversations/review?thread=l9-permission-request");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		// Capture the agent's autonomy level before the verdict.
		const before = await request.get("/api/agents/agent:builder/skills");
		const beforeBody = (await before.json()) as Array<{
			skill_id: string;
			autonomy_level: number;
		}>;
		const deployBefore = beforeBody.find((s) => s.skill_id === "deploy");
		expect(deployBefore?.autonomy_level).toBe(2);

		// Click "Approve once".
		await page.getByRole("button", { name: /approve once/i }).click();

		// Autonomy level is unchanged after the verdict.
		const after = await request.get("/api/agents/agent:builder/skills");
		const afterBody = (await after.json()) as Array<{
			skill_id: string;
			autonomy_level: number;
		}>;
		const deployAfter = afterBody.find((s) => s.skill_id === "deploy");
		expect(deployAfter?.autonomy_level).toBe(2);
	});

	/**
	 * L9 DoD blocker: distinguished L9 verdict payloads must be POSTed.
	 * We mock /api/conversations/responses to capture the request body and
	 * assert that the discriminating fields are present.
	 */
	test("permission_request 'Approve once' POSTs oneShot=true", async ({ page }) => {
		const captured: Array<{ url: string; method: string; body: unknown }> = [];
		await page.route("**/api/conversations/responses", async (route) => {
			const req = route.request();
			const text = req.postData() ?? "null";
			captured.push({
				url: req.url(),
				method: req.method(),
				body: JSON.parse(text) as unknown,
			});
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({ id: "srv-mock-1" }),
			});
		});

		await page.goto("/conversations/review?thread=l9-permission-request");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		const approve = page.getByRole("button", { name: /approve once/i });
		// verdictDoubleClick is true by default — first click prefills,
		// second commits.
		await approve.click();
		await approve.click();

		await expect.poll(() => captured.length).toBeGreaterThan(0);
		const body = captured[0].body as Record<string, unknown>;
		expect(captured[0].method).toBe("POST");
		expect(body.itemId).toBe("l9-permission-request");
		expect(body.decision).toBe("approve");
		expect(body.oneShot).toBe(true);
		expect(body.leaseGrantedTo).toBeNull();
	});

	test("file_lease 'Grant lease to A' POSTs leaseGrantedTo='a'", async ({ page }) => {
		const captured: Array<{ url: string; method: string; body: unknown }> = [];
		await page.route("**/api/conversations/responses", async (route) => {
			const req = route.request();
			const text = req.postData() ?? "null";
			captured.push({
				url: req.url(),
				method: req.method(),
				body: JSON.parse(text) as unknown,
			});
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({ id: "srv-mock-2" }),
			});
		});

		await page.goto("/conversations/review?thread=l9-file-lease");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		const grantA = page.getByRole("button", { name: /grant lease to a/i });
		await grantA.click();
		await grantA.click();

		await expect.poll(() => captured.length).toBeGreaterThan(0);
		const body = captured[0].body as Record<string, unknown>;
		expect(captured[0].method).toBe("POST");
		expect(body.itemId).toBe("l9-file-lease");
		expect(body.decision).toBe("approve");
		expect(body.leaseGrantedTo).toBe("a");
		expect(body.oneShot).toBeNull();
	});
});
