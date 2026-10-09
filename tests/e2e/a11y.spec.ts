import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/how-to-play', '/daily', '/leaderboard', '/play/classic', '/auth/signin', '/privacy'];

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}

test('no serious accessibility violations during gameplay and feedback', async ({ page }) => {
  await page.goto('/play/classic');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForURL(/\/play\//);
  const check = async () => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  };
  expect(await check()).toEqual([]);
  await page.locator('.answer:not([disabled])').first().click();
  await expect(page.locator('#feedback-title')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await check()).toEqual([]);
});

test.describe('smallest supported phone (360px)', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  for (const path of [...PAGES, '/versus', '/help']) {
    test(`no horizontal scrolling on ${path}`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
  test('gameplay fits and answers are at least 44px tall', async ({ page }) => {
    await page.goto('/play/classic');
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.waitForURL(/\/play\//);
    await page.locator('.answer').first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    for (const h of await page.locator('.answer').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  });
});
