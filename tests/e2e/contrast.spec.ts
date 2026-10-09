import { expect, test } from '@playwright/test';
import { auditContrast } from './contrast';
import { answerAndContinue, signIn } from './helpers';

/** Every piece of text must be readable on what is actually behind it (WCAG AA). */
for (const width of [360, 1280]) {
  test.describe(`text contrast at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('site pages', async ({ page }) => {
      for (const path of ['/', '/how-to-play', '/daily', '/leaderboard', '/auth/signin', '/play/classic']) {
        await page.goto(path);
        expect(await auditContrast(page), path).toEqual([]);
      }
    });
    test('gameplay, feedback and results', async ({ page }) => {
      await signIn(page, `contrast${width}@fastora.test`);
      await page.goto('/play/classic');
      await page.getByRole('button', { name: 'Start game' }).click();
      await page.waitForURL(/\/play\//);
      await page.locator('.answer').first().waitFor();
      expect(await auditContrast(page), 'question').toEqual([]);
      await page.locator('.answer:not([disabled])').first().click();
      await expect(page.locator('#feedback-title')).toBeVisible();
      expect(await auditContrast(page), 'feedback').toEqual([]);
      await page.getByRole('button', { name: /Next question/ }).click();
      for (let i = 1; i < 15; i++) await answerAndContinue(page);
      await page.waitForURL(/\/results\//);
      expect(await auditContrast(page), 'results').toEqual([]);
    });
  });
}
