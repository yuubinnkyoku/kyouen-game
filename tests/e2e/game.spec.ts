import { expect, test } from "@playwright/test";

test("full game flow: load, center, hint, move, cpu reply, undo, redo, reset", async ({ page }) => {
  const fetched: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (/[0-9a-f]{2}\.bin$/.test(u)) fetched.push(u);
  });
  await page.goto("./", { waitUntil: "networkidle" });

  const cells = page.locator(".cell");
  await expect(cells).toHaveCount(81);

  // CPU center stone after reset
  await expect(cells.nth(40)).toHaveClass(/cpu/);
  await expect(page.locator("#turnLabel")).toContainText("あなたの番");

  // Hint toggle highlights legal points
  await page.locator("#hintToggle").click();
  await expect(page.locator("#hintToggle")).toContainText("ON");
  await expect(cells.nth(0)).toHaveClass(/hint-ok/);

  // Player move at 0, CPU must reply with a proven witness
  await cells.nth(0).click();
  await expect(cells.nth(0)).toHaveClass(/you/);
  await expect(page.locator("#turnLabel")).toContainText("あなたの番", { timeout: 30000 });
  const cpuCount = await page.locator(".cell.cpu").count();
  expect(cpuCount).toBe(2);
  expect(fetched.length).toBeGreaterThanOrEqual(1);

  // Undo restores to center-only, redo restores the set
  await page.locator("#undoBtn").click();
  await expect(page.locator(".cell.cpu")).toHaveCount(1);
  await expect(page.locator(".cell.you")).toHaveCount(0);
  await page.locator("#redoBtn").click();
  await expect(page.locator(".cell.cpu")).toHaveCount(2);
  await expect(page.locator(".cell.you")).toHaveCount(1);

  // Result toggle hides/shows panel
  await page.locator("#resultToggle").click();
  await expect(page.locator("#resultPanel")).toBeHidden();
  await page.locator("#resultToggle").click();
  await expect(page.locator("#resultPanel")).toBeVisible();

  // Reset
  await page.locator("#resetBtn").click();
  await expect(page.locator(".cell.cpu")).toHaveCount(1);
  await expect(cells.nth(40)).toHaveClass(/cpu/);
});
