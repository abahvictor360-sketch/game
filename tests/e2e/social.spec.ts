import { expect, test } from '@playwright/test';
import { answerAndContinue, signIn } from './helpers';

test('a friend completes an asynchronous challenge', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await signIn(a, 'creator@fastora.test', 'Creator');
  await a.goto('/play/classic');
  await a.getByRole('button', { name: 'Start game' }).click();
  await a.waitForURL(/\/play\//);
  for (let i = 0; i < 15; i++) await answerAndContinue(a);
  await a.waitForURL(/\/results\//);
  const link = await a.evaluate(async (sid) => {
    const r = await fetch('/api/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid }) });
    return (await r.json()).url as string;
  }, a.url().split('/').pop());
  const b = await (await browser.newContext()).newPage();
  await b.goto(new URL(link).pathname);
  await expect(b.getByText(/Creator wants to see if you can beat their score/)).toBeVisible();
  await expect(b.getByRole('button', { name: 'Accept challenge' })).toHaveCount(0);
  await signIn(b, 'friend@fastora.test', 'Friend');
  await b.goto(new URL(link).pathname);
  await b.getByRole('button', { name: 'Accept challenge' }).click();
  await b.waitForURL(/\/play\//);
  for (let i = 0; i < 15; i++) await answerAndContinue(b);
  await b.waitForURL(/\/results\//);
  await expect(b.getByText(/Challenge from Creator/)).toBeVisible();
  await b.goto(new URL(link).pathname);
  await expect(b.getByText('You’ve already played this challenge.')).toBeVisible();
});

test('two players complete a live match in separate browsers', async ({ browser }) => {
  const [p1, p2] = await Promise.all([1, 2].map(async (n) => {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, `live${n}@fastora.test`, `Live ${n}`);
    await page.goto('/versus');
    await page.getByRole('button', { name: 'Find an opponent' }).click();
    return page;
  }));
  await Promise.all([p1.waitForURL(/\/match\//, { timeout: 30000 }), p2.waitForURL(/\/match\//, { timeout: 30000 })]);
  expect(p1.url()).toBe(p2.url());
  for (let round = 0; round < 15; round++) {
    for (const p of [p1, p2]) {
      const btn = p.locator('.answer:not([disabled])').first();
      await btn.waitFor({ timeout: 20000 });
      await btn.click();
    }
    await expect(p1.getByText(/You: \+\d+/)).toBeVisible({ timeout: 10000 });
  }
  await expect(p1.getByRole('heading', { name: /You won|won|draw/ })).toBeVisible({ timeout: 20000 });
  await expect(p2.getByRole('heading', { name: /You won|won|draw/ })).toBeVisible({ timeout: 20000 });
});

test('leaving a live match forfeits: the leaver sees it at once, the opponent wins', async ({ browser }) => {
  const [p1, p2] = await Promise.all([1, 2].map(async (n) => {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, `quit${n}@fastora.test`, `Quit ${n}`);
    await page.goto('/versus');
    await page.getByRole('button', { name: 'Find an opponent' }).click();
    return page;
  }));
  await Promise.all([p1.waitForURL(/\/match\//, { timeout: 30000 }), p2.waitForURL(/\/match\//, { timeout: 30000 })]);
  await p1.locator('.answer:not([disabled])').first().waitFor({ timeout: 20000 });
  await p1.getByRole('button', { name: 'Leave' }).click();
  await p1.getByRole('button', { name: 'Leave and forfeit' }).click();
  await expect(p1.getByRole('heading', { name: 'You left the match' })).toBeVisible({ timeout: 10000 });
  await expect(p1.locator('.answer')).toHaveCount(0);
  // The opponent keeps playing and wins by forfeit at the end.
  for (let round = 0; round < 15; round++) {
    const btn = p2.locator('.answer:not([disabled])').first();
    await btn.waitFor({ timeout: 20000 });
    await btn.click();
  }
  await expect(p2.getByRole('heading', { name: 'You won!' })).toBeVisible({ timeout: 20000 });
  await expect(p2.getByText('Your opponent left the match.')).toBeVisible();
});
