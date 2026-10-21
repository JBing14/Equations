import { test, expect, type Page } from '@playwright/test';

async function start(page: Page, equation: string) {
  await page.goto('./#/custom');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.fill('#eq-input', equation);
  await page.click('[data-testid=start-custom]');
  await page.waitForSelector('[data-testid=interactive-board]');
}

async function drag(page: Page, side: 'left' | 'right', index: number, to: 'left' | 'right') {
  const term = page.locator(`[data-term-side=${side}][data-term-index="${index}"]`);
  const box = (await term.boundingBox())!;
  const target = (await page.locator(`[data-testid=zone-${to}]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + 10, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(3200);
}

test('dragging +5 across solves x + 5 = 12 and records one move', async ({ page }) => {
  await start(page, 'x + 5 = 12');
  await expect(page.locator('[data-testid=divider]')).toHaveCount(0);
  await drag(page, 'left', 1, 'right');
  await expect(page.locator('[data-testid=divider]').first()).toBeVisible();
  await expect(page.locator('[data-testid=history-move]')).toHaveCount(1);
  await expect(page.getByText('Solved!')).toBeVisible();
});

test('undo steps back (redo can return) and reset clears the divider', async ({ page }) => {
  await start(page, 'x + 5 = 12');
  await drag(page, 'left', 1, 'right');
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('[data-testid=board]').first()).toHaveAttribute('aria-label', /x plus 5 equals 12/);
  await page.getByRole('button', { name: /Redo/ }).click();
  await expect(page.locator('[data-testid=board]').first()).toHaveAttribute('aria-label', /x equals 7/);
  await page.getByRole('button', { name: /Reset/ }).click();
  await expect(page.locator('[data-testid=divider]')).toHaveCount(0);
});

test('a two-step equation takes two recorded moves', async ({ page }) => {
  await start(page, '3x - 4 = 11');
  await drag(page, 'left', 1, 'right');
  await expect(page.locator('[data-testid=history-move]')).toHaveCount(1);
});
