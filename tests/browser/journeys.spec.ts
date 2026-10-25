import { test, expect } from '@playwright/test';
test('a visitor books, refreshes, recovers and inspects correlated evidence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reserve appointment' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reserve appointment' }).click();
  await expect(page.getByText('Reservation confirmed and saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.reservation .badge')).toHaveText(['Confirmed']);
  await page.getByRole('button', { name: 'Run guided recovery drill' }).click();
  await expect(page.getByText('Recovery independently checked', { exact: true })).toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator('.reservation .badge')).toHaveText(['Confirmed']);
  await page.getByRole('button', { name: 'Journey telemetry' }).click();
  await expect(page.getByRole('heading', { name: 'Reservation request traces' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await page.locator('.trace-link').first().click();
  await expect(page.getByRole('heading', { name: 'Correlated signals' })).toBeVisible();
  await expect(page.locator('.signal-grid pre')).toHaveCount(3);
  await page.getByRole('button', { name: 'Recovery evidence', exact: true }).click();
  await expect(page.getByText('Recovery independently checked', { exact: true })).toBeVisible();
  const response = await page.request.get('/api/evidence');
  expect(response.ok()).toBeTruthy();
  const evidence = await response.json();
  expect(evidence.incident.status).toBe('recovered');
  expect(evidence.reservations.filter((r: { probe: boolean }) => !r.probe)).toHaveLength(1);
  expect(errors).toEqual([]);
});
test('unsupported faults require review and manual restore', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Run guided recovery drill' })).toBeEnabled();
  await page.getByLabel('Failure scenario').selectOption('unknown_dependency');
  await page.getByRole('button', { name: 'Run guided recovery drill' }).click();
  await expect(page.getByText('escalated', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Restore manually' })).toBeEnabled();
  await page.getByRole('button', { name: 'Restore manually' }).click();
  await expect(page.getByText('cancelled', { exact: true })).toBeVisible();
});
test('two browser contexts cannot affect each other', async ({ browser }) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    const pa = await a.newPage(),
      pb = await b.newPage();
    await pa.goto('/');
    await pb.goto('/');
    await expect(pa.getByRole('button', { name: 'Inject fault only' })).toBeEnabled();
    await expect(pb.getByRole('button', { name: 'Reserve appointment' })).toBeEnabled();
    await pa.getByRole('button', { name: 'Inject fault only' }).click();
    await expect(pa.getByText('Interrupted', { exact: true })).toBeVisible();
    await pb.getByRole('button', { name: 'Reserve appointment' }).click();
    await expect(pb.getByText('Reservation confirmed and saved.', { exact: true })).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});
test('mobile layout, keyboard entry and public project pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reserve appointment' })).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.goto('/tracker');
  await expect(page.getByRole('heading', { name: 'Work with acceptance criteria.' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(7);
  await page.goto('/guide');
  await expect(page.getByRole('heading', { name: 'Recovery needs evidence.' })).toBeVisible();
});
