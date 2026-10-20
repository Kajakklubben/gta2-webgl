import { expect, test } from '@playwright/test';

test('opens the standalone sprite library', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/sprites.html');
  const library = page.getByRole('main', { name: 'Loaded sprite library' });
  await expect(library).toBeVisible();
  await expect(page.locator('#sprite-entry option')).not.toHaveCount(0);
  await expect(page.getByLabel('Snapped animated sprite preview', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Interpolated animated sprite preview', { exact: true })).toBeVisible();
  await page.locator('#sprite-category').selectOption('cars');
  await expect(page.locator('#sprite-entry option')).not.toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to game', exact: true })).toHaveAttribute('href', '/');
  expect(errors).toEqual([]);
});
