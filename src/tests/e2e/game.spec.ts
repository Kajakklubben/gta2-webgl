import { expect, test } from '@playwright/test';

test('renders assets, moves, synchronizes two players, and reconnects', async ({ browser, page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const onlineUrl = (name: string) => `/?mode=multiplayer&name=${encodeURIComponent(name)}&room=e2e-sync`;
  await page.goto(onlineUrl('Player One'));
  await expect(page.locator('body')).toHaveAttribute('data-connection', 'connected');
  await expect(page.getByLabel('Game world', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-players', '1');
  const context = await browser.newContext(), second = await context.newPage();
  await second.goto(onlineUrl('Player Two')); await expect(second.locator('body')).toHaveAttribute('data-connection', 'connected');
  await expect(page.locator('body')).toHaveAttribute('data-players', '2');
  const before = JSON.parse((await page.locator('body').getAttribute('data-position'))!);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => JSON.parse((await page.locator('body').getAttribute('data-position'))!).y).toBeGreaterThan(before.y + 30);
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: 'test-results/synthetic-world.png' });
  await context.close(); await expect(page.locator('body')).toHaveAttribute('data-players', '1');
  await page.context().setOffline(true);
  await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible({ timeout: 25000 });
  await page.context().setOffline(false); await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-connection', 'connected');
  expect(errors).toEqual([]);
});
test('shows an actionable missing-asset error', async ({ page }) => {
  await page.route('**/assets/bil.sty', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Cannot load bil.sty');
  await expect(page.getByRole('status')).toContainText('Place your GTA2 files in assets/');
});
test('fires the starting pistol and does not equip unloaded weapons', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?mode=multiplayer&name=Weapons&room=e2e-weapons');
  await expect(page.locator('body')).toHaveAttribute('data-connection', 'connected');
  const hud = page.locator('#player-huds .player-hud').first();
  await expect(hud).toContainText('PISTOL');
  await expect(hud).toContainText('AMMO 60');
  await page.keyboard.down('ControlLeft');
  await expect(hud).not.toContainText('AMMO 60');
  await page.keyboard.up('ControlLeft');
  await page.keyboard.press('KeyX');
  await expect(hud).toContainText('NO WEAPON');
  await expect(hud).toContainText('AMMO —');
  await page.keyboard.down('Space');
  await expect(hud).toContainText('NO WEAPON');
  await expect(hud).toContainText('AMMO —');
  await page.keyboard.up('Space');
  await page.screenshot({ path: 'test-results/weapons.png' });
  expect(errors).toEqual([]);
});

test('gives all debug weapons without dropping the multiplayer session', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?mode=multiplayer&name=Debug&room=e2e-debug-weapons');
  await expect(page.locator('body')).toHaveAttribute('data-connection', 'connected');

  await page.locator('#open-menu').click();
  await page.locator('#open-debug').click();
  await page.locator('#debug-tab-player').click();
  await page.locator('#debug-give-all-weapons').click();
  await page.locator('#close-debug').click();

  const hud = page.locator('#player-huds .player-hud').first();
  await page.keyboard.press('KeyX');
  await expect(hud).toContainText('MACHINE GUN');
  await expect(hud).toContainText('AMMO 180');
  await expect(page.locator('body')).toHaveAttribute('data-connection', 'connected');
  expect(errors).toEqual([]);
});
