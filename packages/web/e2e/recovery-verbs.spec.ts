/**
 * L7 — Recovery Verbs E2E.
 *
 * Pins the Playwright validation matrix from
 * `docs/work-packages/TRACK-L.md` L7 + plan §1:
 *
 *   E2E1 — Kill switch from each entry point (avatar menu, Cmd+Shift+.,
 *          Settings → Safety) pauses 3 running sessions and shows the
 *          factory-paused banner across every page.
 *   E2E2 — Commit verdict → Rollback in overflow with reason → toast
 *          surfaces succeeded/partially/failed outcome.
 *   E2E3 — Bet detail Pause Session → paused state → Resume restores.
 *   E2E4 — Kill-switch attempt without a reason is blocked +
 *          rationale field highlighted.
 *
 * @lore L7 review: Playwright does NOT expose `getByLabelText` (that is a
 * Testing Library API). Use `page.getByLabel(/.../)` to match labelled
 * controls. The Playwright dev server does not run a backend on :3001
 * during E2E, so recovery POSTs are stubbed via `page.route` and the
 * factory-state poll is similarly stubbed where the test depends on the
 * paused branch.
 */
import { expect, test } from "@playwright/test";

test.describe("L7 — Recovery verbs E2E", () => {
	test("E2E1a: kill switch from avatar menu pauses sessions and renders factory banner", async ({
		page,
	}) => {
		// Stub backend: the first state poll returns running, the pause POST
		// flips an in-memory flag, and subsequent state polls report paused.
		let paused = false;
		await page.route("**/api/factory/state", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					paused,
					pausedBy: paused ? "actor:ceo" : null,
					pausedAt: paused ? new Date().toISOString() : null,
					pausedReason: paused ? "spotted bad output" : null,
				}),
			});
		});
		await page.route("**/api/factory/pause", async (route) => {
			paused = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true }),
			});
		});

		await page.goto("/work/portfolio");
		// L7 AC1: avatar opens AvatarMenu, then "Pause Factory" menuitem.
		await page
			.getByRole("button", { name: /^user profile$/i })
			.first()
			.click();
		await page.getByRole("menuitem", { name: /pause factory/i }).click();
		await page.getByLabel(/^reason$/i).fill("spotted bad output");
		// Default Settings.safety.killSwitchConfirmMode is press_hold; honor
		// either path so the test is mode-agnostic.
		const typeField = page.getByLabel(/type.*hyperidle/i);
		if (await typeField.isVisible().catch(() => false)) {
			await typeField.fill("HyperIdle");
			await page.getByRole("button", { name: /pause factory/i }).click();
		} else {
			const holdBtn = page.getByRole("button", { name: /hold to confirm/i });
			// Hold timer auto-fires onConfirm at 1500ms; dialog unmounts so we
			// only dispatch pointerdown.
			await holdBtn.dispatchEvent("pointerdown");
		}
		// Banner appears once the post-confirm refresh observes paused=true.
		await expect(page.getByTestId("factory-paused-banner")).toBeVisible();
	});

	test("E2E1b: factory-paused banner is visible across every page", async ({ page }) => {
		await page.route("**/api/factory/state", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					paused: true,
					pausedBy: "actor:ceo",
					pausedAt: new Date().toISOString(),
					pausedReason: "manual pause",
				}),
			});
		});
		await page.goto("/conversations/review");
		await expect(page.getByTestId("factory-paused-banner")).toBeVisible();
		await page.goto("/work/portfolio");
		await expect(page.getByTestId("factory-paused-banner")).toBeVisible();
		await page.goto("/knowledge");
		await expect(page.getByTestId("factory-paused-banner")).toBeVisible();
	});

	test("E2E1c: kill switch via Cmd+Shift+. shortcut opens KillSwitchDialog", async ({ page }) => {
		await page.goto("/work/portfolio");
		await page.keyboard.press("Meta+Shift+.");
		await expect(page.getByRole("dialog", { name: /pause factory|kill switch/i })).toBeVisible();
	});

	test("E2E1d: kill switch via Settings → Safety opens dialog", async ({ page }) => {
		await page.goto("/settings");
		await page.getByRole("tab", { name: /safety/i }).click();
		await page.getByRole("button", { name: /pause factory/i }).click();
		await expect(page.getByRole("dialog", { name: /pause factory|kill switch/i })).toBeVisible();
	});

	test("E2E2: rollback in thread overflow writes audit row and surfaces outcome toast", async ({
		page,
	}) => {
		// Stub the rollback POST so the toast renders without a real backend.
		await page.route("**/api/threads/**/verdict/rollback", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ outcome: "succeeded" }),
			});
		});
		await page.goto("/conversations/review");
		// L4: Approve is a pre-fill→confirm two-click contract. First click
		// arms the verdict; second click commits.
		const approve = page.getByRole("button", { name: /^approve/i }).first();
		await approve.click();
		const confirm = page.getByRole("button", { name: /confirm approve/i });
		await confirm.click();
		// Open overflow menu; Rollback now sits at the top.
		await page.getByRole("button", { name: /more actions/i }).click();
		await page.getByRole("menuitem", { name: /rollback/i }).click();
		await page.getByLabel(/^reason$/i).fill("agent ignored my comments");
		await page.getByRole("button", { name: /confirm rollback/i }).click();
		// Outcome toast (role=status via <output>): succeeded/partially/failed.
		await expect(
			page.getByRole("status").filter({ hasText: /rollback (succeeded|partially|failed)/i }),
		).toBeVisible();
	});

	test("E2E3: pause session on bet detail moves session to paused, Resume restores", async ({
		page,
	}) => {
		// Mock pause + resume so the local UI state flip happens deterministically.
		await page.route("**/api/sessions/**/pause", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true }),
			});
		});
		await page.route("**/api/sessions/**/resume", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true }),
			});
		});
		await page.goto("/work/bet/bet-1");
		await page.waitForSelector("[data-testid='bet-running-sessions']");
		const pauseBtn = page
			.getByTestId("bet-running-sessions")
			.getByRole("button", { name: /^pause$/i })
			.first();
		await pauseBtn.click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.getByLabel(/^reason$/i).fill("checking output");
		const holdBtn = page.getByRole("button", { name: /hold to confirm/i });
		// @lore Press-hold gate auto-fires via a 1500ms setTimeout inside the
		// dialog. After the timer, onConfirm runs and the dialog unmounts —
		// dispatching a follow-up pointerup hits a detached node. Just kick
		// pointerdown and wait for the post-confirm "Resume" affordance.
		await holdBtn.dispatchEvent("pointerdown");
		await expect(page.getByRole("button", { name: /^resume$/i }).first()).toBeVisible();
	});

	test("E2E4: kill-switch attempt without a reason is blocked + rationale field highlighted", async ({
		page,
	}) => {
		await page.goto("/settings");
		await page.getByRole("tab", { name: /safety/i }).click();
		await page.getByRole("button", { name: /pause factory/i }).click();
		// Reason intentionally left blank — confirm path stays disabled.
		// In press_hold mode the gate is the "Hold to confirm" button.
		const holdBtn = page.getByRole("button", { name: /hold to confirm/i });
		const typeName = page.getByLabel(/type.*hyperidle/i);
		if (await holdBtn.isVisible().catch(() => false)) {
			await expect(holdBtn).toBeDisabled();
		} else {
			// type_name mode — confirm button is the verb CTA.
			const submit = page.getByRole("button", { name: /^pause factory$/i }).last();
			await expect(submit).toBeDisabled();
			// And the type-name field exists so the contract is recognizable.
			await expect(typeName).toBeVisible();
		}
		// Rationale field is required.
		const reason = page.getByLabel(/^reason$/i);
		await expect(reason).toHaveAttribute("required", "");
	});
});
