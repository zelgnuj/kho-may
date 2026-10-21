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

test('Film trên thanh điều hướng; ghi cuộn cũ, sửa cuộn, chụp xong nhanh, thống kê', async ({ page }) => {
  await importSample(page);
  // Thanh dưới: Film thay cho Giá trị
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Film' }).click();
  await expect(page).toHaveURL(/\/film$/);
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Giá trị' })).toHaveCount(0);

  // Ghi một cuộn đã tráng từ trước
  await page.getByRole('button', { name: '+ Ghi cuộn' }).click();
  await page.getByLabel('Tìm film').fill('hp5');
  await page.locator('[aria-label="Danh sách film"] .pick-row').first().click();
  await page.getByLabel('Máy chụp').selectOption({ label: 'Olympus XA' });
  await page.getByLabel('Ghi chú cuộn').fill('Hội An');
  await page.getByRole('radio', { name: 'Đã tráng' }).click();
  await page.getByLabel('Lab').fill('Lab Q3');
  await page.getByRole('textbox', { name: 'Chi phí (đ)' }).fill('80000');
  await page.getByRole('button', { name: 'Ghi cuộn', exact: true }).click();
  const done = page.locator('section[aria-label="Đã tráng"]');
  await expect(done).toContainText('HP5');
  await expect(done).toContainText('Lab Q3');

  // Mở cuộn để sửa: đổi lab, chuyển về chờ tráng
  await done.locator('.roll-open').first().click();
  await page.getByRole('radio', { name: 'Chờ tráng' }).click();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('section[aria-label="Chờ tráng"]')).toContainText('HP5');
  let rolls = await idb<{ stock: string; status: string; devCost: number; note: string }>(page, 'rolls');
  expect(rolls[0]).toMatchObject({ status: 'shot', note: 'Hội An', devCost: 80000 });

  // Lắp film từ trang máy rồi bấm "Chụp xong" ngay trên trang Film
  const om = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === 'OM-2N')!;
  await page.goto(`/may/${om.id}`);
  await page.getByRole('button', { name: '+ Lắp film vào máy này' }).click();
  await page.getByLabel('Tìm film').fill('portra 400');
  await page.locator('[aria-label="Danh sách film"] .pick-row').first().click();
  await page.getByRole('button', { name: 'Lắp film', exact: true }).click();
  await expect(page.locator('.film-card')).toContainText('Portra 400');
  await page.goto('/film');
  const loaded = page.locator('section[aria-label="Đang lắp"]');
  await expect(loaded).toContainText('Portra 400');
  // sửa cuộn đang lắp → thẻ trên máy cập nhật theo
  await loaded.locator('.roll-open').click();
  await page.getByLabel('Ghi chú cuộn').fill('Sài Gòn đêm');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await loaded.getByRole('button', { name: 'Chụp xong' }).click();
  await expect(loaded).toHaveCount(0);
  await expect(page.locator('section[aria-label="Chờ tráng"]')).toContainText('Sài Gòn đêm');
  const cam = (await idb<{ id: string; film: unknown }>(page, 'cameras')).find((c) => c.id === om.id)!;
  expect(cam.film).toBeNull();

  // Thống kê: biểu đồ tháng, loại film
  const stats = page.locator('section[aria-label="Thống kê"]');
  await expect(stats.locator('.mc-col')).toHaveCount(12);
  await expect(stats.locator('.kind-legend')).toContainText('Đen trắng');
  await expect(stats.locator('.kind-legend')).toContainText('Màu');
  rolls = await idb(page, 'rolls');
  expect(rolls.length).toBe(2);
});
