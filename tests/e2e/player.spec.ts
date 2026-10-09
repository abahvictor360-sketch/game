import { expect, test } from '@playwright/test';
import { answerAndContinue, signIn } from './helpers';

test('signed-out visitors must sign in, then play a full 15-question Classic game', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Play Classic/ }).first().click();
  await expect(page.getByRole('button', { name: 'Start game' })).toHaveCount(0);
  // Starting directly is refused too: the API sends the visitor to sign in.
  const direct = await page.request.post('/api/play/classic', { headers: { 'Content-Type': 'application/json', Origin: new URL(page.url()).origin }, data: {} });
  expect(direct.status()).toBe(401);
  await page.getByRole('link', { name: 'Sign in or create an account' }).click();
  await page.waitForURL(/\/auth\/signin\?next=%2Fplay%2Fclassic/);
  await page.getByLabel('Email', { exact: true }).fill('classic@fastora.test');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/play\/classic$/);
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForURL(/\/play\//);
  // Lifelines are offered; use 50:50 once.
  await page.getByRole('button', { name: /50:50/ }).click();
  await expect(page.locator('.answer[data-state="removed"]')).toHaveCount(2);
  for (let i = 0; i < 15; i++) await answerAndContinue(page);
  await page.waitForURL(/\/results\//);
  await expect(page.getByText(/points/i).first()).toBeVisible();
  await expect(page.getByText(/Rank #\d+/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share result' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('href', /wa\.me/);
  // Public share page exposes no questions.
  const shareUrl = page.url().replace('/results/', '/s/');
  const res = await page.request.get(shareUrl);
  expect(res.ok()).toBe(true);
  expect(await res.text()).not.toContain('Your answers');
  const img = await page.request.get(shareUrl + '/opengraph-image');
  expect(img.headers()['content-type']).toContain('image/png');
});

test('Daily Challenge resumes after refresh and allows one attempt', async ({ page }) => {
  await signIn(page, 'daily@fastora.test', 'Daily Player');
  await page.goto('/daily');
  await page.getByRole('button', { name: /Start today’s challenge/ }).click();
  await page.waitForURL(/\/play\//);
  const playUrl = page.url();
  await answerAndContinue(page);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Question 2 of 10' })).toBeVisible(); // resumed at question 2
  await page.goto('/daily');
  await page.getByRole('link', { name: 'Resume' }).click();
  await page.waitForURL(playUrl);
  for (let i = 0; i < 9; i++) await answerAndContinue(page);
  await page.waitForURL(/\/results\//);
  await page.goto('/daily');
  await expect(page.getByText('Your result')).toBeVisible();
  await expect(page.getByRole('button', { name: /Start today’s challenge/ })).toHaveCount(0);
  await expect(page.getByRole('table').getByText('Daily Player (you)')).toBeVisible();
});

test('an admin creates, reviews and publishes a question', async ({ page }) => {
  await signIn(page, 'admin@fastora.test', 'Admin');
  await page.goto('/admin/questions/new');
  await page.getByLabel('Question').fill('Which lake is the source of the White Nile, as tested end to end?');
  await page.getByLabel('Option A', { exact: true }).fill('Lake Victoria');
  await page.getByLabel('Option B', { exact: true }).fill('Lake Chad');
  await page.getByLabel('Option C', { exact: true }).fill('Lake Malawi');
  await page.getByLabel('Option D', { exact: true }).fill('Lake Volta');
  await page.getByLabel('Explanation (shown after answering)').fill('The White Nile flows out of Lake Victoria at Jinja, Uganda.');
  await page.getByLabel('Category').selectOption('geography');
  await page.getByLabel('Submit for review after saving').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/\/admin\/questions\/[0-9a-f-]+\?saved=1/);
  await expect(page.getByText('review', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Approve & publish v1/ }).click();
  await expect(page.getByRole('heading', { name: /Question/ }).getByText('approved')).toBeVisible();
  // CSV template is downloadable and the import preview reports errors.
  await page.goto('/admin/import');
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('question,option_a,option_b,option_c,option_d,correct,explanation,category,difficulty\nToo short?,a,b,c,d,Z,short,nope,hard\n') });
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/0 of 1 rows are ready/)).toBeVisible();
  await expect(page.getByText(/unknown category "nope"/)).toBeVisible();
});

test('non-staff cannot reach the admin area', async ({ page }) => {
  await signIn(page, 'player@fastora.test');
  const res = await page.goto('/admin');
  expect(res?.status()).toBe(404);
});

test('the demo account signs in with its password and can play', async ({ page }) => {
  await page.goto('/auth/signin?next=/play/classic');
  await page.getByText('Sign in with a password').click();
  await page.getByLabel('Account email').fill('demo@fastora.africa');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/email and password don’t match/)).toBeVisible();
  await page.getByLabel('Account email').fill('demo@fastora.africa');
  await page.getByLabel('Password').fill('e2e-demo-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/play\/classic$/);
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForURL(/\/play\/[0-9a-f-]{36}$/);
  await page.goto('/profile');
  await expect(page.getByLabel(/Display name/)).toHaveValue('Demo Player');
});
