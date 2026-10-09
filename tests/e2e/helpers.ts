import { expect, type Page } from '@playwright/test';

/** Answer the current question (first available option) and continue. */
export async function answerAndContinue(page: Page) {
  await expect(page.locator('#question-text')).toBeVisible();
  await page.locator('.answer:not([disabled])').first().click();
  await expect(page.locator('#feedback-title')).toBeVisible();
  await page.getByRole('button', { name: /Next question|See results/ }).click();
}

export async function signIn(page: Page, email: string, name?: string) {
  await page.goto('/auth/signin');
  await page.getByLabel('Email', { exact: true }).fill(email);
  if (name) await page.getByLabel('Display name (optional)').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'));
}
