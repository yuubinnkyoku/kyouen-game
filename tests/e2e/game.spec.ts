import { expect, test } from "@playwright/test";

test("full game flow: load, coords, hint, move, cpu reply, undo, redo, reset", async ({ page }) => {
  const fetched: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (/[0-9a-f]{2}\.bin$/.test(u)) fetched.push(u);
  });
  await page.goto("./", { waitUntil: "networkidle" });

  const cells = page.locator(".cell");
  await expect(cells).toHaveCount(81);

  // Coordinate labels like a Go board
  await expect(page.locator(".coords-top")).toContainText("A");
  await expect(page.locator(".coords-top")).toContainText("J");
  await expect(page.locator(".coords-left")).toContainText("1");
  await expect(page.locator(".coords-left")).toContainText("9");

  // CPU center stone after reset
  await expect(cells.nth(40)).toHaveClass(/cpu/);
  await expect(page.locator("#turnLabel")).toContainText("あなたの番");

  // Hint is a checkbox; ON highlights legal points and differentiates stone colors
  const hint = page.locator("#hintToggle");
  await hint.evaluate((el) => {
    (el as HTMLInputElement).checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#board")).toHaveClass(/hint-on/);
  await expect(cells.nth(0)).toHaveClass(/hint-ok/);

  // Hint OFF: no highlight, empty points not restricted
  await hint.evaluate((el) => {
    (el as HTMLInputElement).checked = false;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#board")).not.toHaveClass(/hint-on/);
  await expect(cells.nth(0)).not.toHaveClass(/hint-ok/);
  await expect(cells.nth(0)).toBeEnabled();

  // Player move at A1 (0), CPU must reply with a proven witness
  await cells.nth(0).click();
  await expect(cells.nth(0)).toHaveClass(/you/);
  await expect(page.locator("#turnLabel")).toContainText("あなたの番", { timeout: 30000 });
  const cpuCount = await page.locator(".cell.cpu").count();
  expect(cpuCount).toBe(2);
  expect(fetched.length).toBeGreaterThanOrEqual(1);

  // No end overlay on load / mid-game
  await expect(page.locator("#endOverlay")).toHaveCount(0);

  // 前に戻る / 次に進む
  await page.locator("#undoBtn").click();
  await expect(page.locator(".cell.cpu")).toHaveCount(1);
  await expect(page.locator(".cell.you")).toHaveCount(0);
  await page.locator("#redoBtn").click();
  await expect(page.locator(".cell.cpu")).toHaveCount(2);
  await expect(page.locator(".cell.you")).toHaveCount(1);

  // Result toggle controls circle layer drawing
  const result = page.locator("#resultToggle");
  await result.evaluate((el) => {
    (el as HTMLInputElement).checked = false;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#circleLayer")).toBeEmpty();
  await result.evaluate((el) => {
    (el as HTMLInputElement).checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Reset
  await page.locator("#resetBtn").click();
  await expect(page.locator(".cell.cpu")).toHaveCount(1);
  await expect(cells.nth(40)).toHaveClass(/cpu/);
});
