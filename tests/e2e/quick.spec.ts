import { expect, test } from '@playwright/test';
import { fixture, idb, importSample, mockApis } from './helpers';

test.beforeEach(async ({ page }) => { await mockApis(page); await importSample(page); });

test('nút +: chụp ảnh rồi gắn vào máy có sẵn', async ({ page }) => {
  await page.getByRole('button', { name: 'Làm nhanh' }).click();
  await expect(page.getByRole('button', { name: /Chụp ảnh máy/ })).toBeVisible();
  await page.locator('.bottom-nav input[type=file], input[capture]').first().setInputFiles(fixture('photo.jpg'));
  await expect(page.getByRole('dialog', { name: /Ảnh này của máy nào/ })).toBeVisible();
  await page.getByLabel('Tìm máy trong kho').fill('xa');
  await page.locator('[aria-label="Chọn máy"] .pick-row').first().click();
  await page.waitForURL('**/may/**');
  const xa = (await idb<{ id: string; model: string; coverPhotoId?: string }>(page, 'cameras')).find((c) => c.model === 'XA')!;
  expect(page.url()).toContain(xa.id);
  expect(xa.coverPhotoId).toBeTruthy();
  expect(await idb(page, 'photos')).toHaveLength(1);
});

test('nút +: chụp ảnh cho máy mới', async ({ page }) => {
  await page.getByRole('button', { name: 'Làm nhanh' }).click();
  await page.locator('input[capture]').first().setInputFiles(fixture('photo.jpg'));
  await page.getByRole('button', { name: /Máy mới, chưa có trong kho/ }).click();
  await page.waitForURL('**/them?anh=1');
  await expect(page.locator('.photo-row img')).toHaveCount(1);
});

test('nút +: lắp film và thêm wishlist', async ({ page }) => {
  await page.getByRole('button', { name: 'Làm nhanh' }).click();
  await page.getByRole('button', { name: /Lắp film/ }).click();
  await page.locator('[aria-label="Chọn máy"] .pick-row', { hasText: 'OM-2N' }).click();
  await page.getByLabel('Tìm film').fill('portra 400');
  await page.locator('[aria-label="Danh sách film"] .pick-row').first().click();
  await page.getByRole('button', { name: 'Lắp film', exact: true }).click();
  const om = (await idb<{ model: string; film?: { stock: string } }>(page, 'cameras')).find((c) => c.model === 'OM-2N')!;
  expect(om.film?.stock).toBe('Kodak Portra 400');

  await page.goto('/wishlist');
  await page.getByRole('button', { name: 'Làm nhanh' }).click();
  await expect(page.locator('.quick-tile').first()).toContainText('Thêm vào Wishlist');
  await page.locator('.quick-tile').first().click();
  await page.waitForURL('**/wishlist/them');
});
