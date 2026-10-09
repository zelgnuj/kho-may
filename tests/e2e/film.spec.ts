import { expect, test } from '@playwright/test';
import { idb, importSample, mockApis } from './helpers';

test.beforeEach(async ({ page }) => { await mockApis(page); });

test('lắp film (push), chụp xong, chờ tráng, đã tráng', async ({ page }) => {
  await importSample(page);
  const xa = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === 'XA')!;
  await page.goto(`/may/${xa.id}`);
  await page.getByRole('button', { name: '+ Lắp film vào máy này' }).click();
  await page.getByLabel('Tìm film').fill('portra 4');
  await page.locator('[aria-label="Danh sách film"] .pick-row').first().click();
  await expect(page.locator('.film-picked')).toContainText('Kodak Portra 400');
  await page.getByRole('radio', { name: /800 · push \+1/ }).click();
  await expect(page.locator('.advice')).toContainText('Nhớ chỉnh ISO trên máy về 800');
  await expect(page.locator('.advice')).toContainText('push +1');
  await page.getByLabel('Ghi chú cuộn').fill('Đà Lạt');
  await page.getByRole('button', { name: 'Lắp film', exact: true }).click();

  const card = page.locator('.film-card');
  await expect(card).toContainText('Kodak Portra 400');
  await expect(card).toContainText('ISO 800 (push +1)');
  await expect(card).toContainText('Đà Lạt');

  await card.getByRole('button', { name: 'Chụp xong' }).click();
  await page.getByRole('button', { name: 'Tháo film' }).click();
  await expect(page.locator('.film-card')).toHaveCount(0);
  await expect(page.getByText('1 cuộn đã chụp bằng máy này')).toBeVisible();

  await page.goto('/film');
  await expect(page.locator('section[aria-label="Chờ tráng"]')).toContainText('Kodak Portra 400');
  await page.getByRole('button', { name: 'Đã tráng' }).click();
  await page.getByLabel('Lab').fill('Lab Sài Gòn');
  await page.getByLabel('Chi phí (đ)').fill('90.000');
  await page.getByRole('dialog').getByRole('button', { name: 'Đã tráng' }).click();
  await expect(page.locator('section[aria-label="Đã tráng"]')).toContainText('Lab Sài Gòn');
  await expect(page.locator('section[aria-label="Thống kê"]')).toContainText('90.000 đ');
  const rolls = await idb<{ status: string; ei: number; iso: number; devCost: number }>(page, 'rolls');
  expect(rolls[0]).toMatchObject({ status: 'developed', iso: 400, ei: 800, devCost: 90000 });
});

test('máy đọc DX: báo ISO thực tế khi film không nằm trong mức máy hỗ trợ', async ({ page }) => {
  await page.goto('/them');
  await page.getByRole('button', { name: /Chọn hãng/ }).click();
  await page.getByLabel('Tìm hãng').fill('nikon');
  await page.locator('[aria-label="Danh sách hãng"] .pick-row').first().click();
  await page.getByLabel('Tìm mẫu').fill('AF600');
  await page.locator('[aria-label="Danh sách mẫu"] .pick-row').first().click();
  await page.getByRole('button', { name: 'Lưu máy' }).click();
  await page.waitForURL('**/may/**');
  await page.getByRole('button', { name: '+ Lắp film vào máy này' }).click();
  await page.getByLabel('Tìm film').fill('portra 160');
  await page.locator('[aria-label="Danh sách film"] .pick-row').first().click();
  await expect(page.locator('.advice')).toContainText('chụp ở ISO 100 (dư sáng ⅔ stop)');
});

test('đổi cuộn: cuộn cũ tự chuyển sang chờ tráng', async ({ page }) => {
  await importSample(page);
  const om = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === 'OM-2N')!;
  await page.goto(`/may/${om.id}`);
  for (const film of ['hp5', 'tri-x']) {
    await page.getByRole('button', { name: /Lắp film vào máy này|Đổi cuộn/ }).click();
    await page.getByLabel('Tìm film').fill(film);
    await page.locator('[aria-label="Danh sách film"] .pick-row').first().click();
    await page.getByRole('button', { name: /^(Lắp film|Đổi sang cuộn này)$/ }).click();
  }
  await expect(page.locator('.film-card')).toContainText('Tri-X 400');
  const rolls = await idb<{ stock: string; status: string }>(page, 'rolls');
  expect(rolls.find((r) => r.stock.includes('HP5'))?.status).toBe('shot');
  expect(rolls.find((r) => r.stock.includes('Tri-X'))?.status).toBe('loaded');
});
