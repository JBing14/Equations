import { test, expect } from '@playwright/test';

test('no horizontal page scroll at phone width', async ({ page }) => {
  for (const hash of ['#/home', '#/lessons', '#/practice', '#/custom', '#/teacher', '#/settings']) {
    await page.goto('./' + hash);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, hash).toBeLessThanOrEqual(1);
  }
});
