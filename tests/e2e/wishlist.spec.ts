import { expect, test } from '@playwright/test';
import { idb, importSample, mockApis } from './helpers';

test('wishlist: thêm, tra giá, báo trong tầm, mua được → vào kho', async ({ page }) => {
  await mockApis(page);
  let calls = 0;
  await page.route('**/api/price', (r) => {
    calls++;
    r.fulfill({ json: { usd: { low: 80, median: 100, high: 120 }, vnd: { low: 2000000, median: 2400000, high: 3000000 }, basis: 'sold', confidence: 'medium', includes: '', note: 'test', sources: [], compsniperUsed: true } });
  });
  await page.goto('/wishlist');
  await expect(page.getByText('Thêm máy đầu tiên')).toBeVisible();
  await page.getByRole('link', { name: 'Thêm máy đầu tiên' }).click();

  await page.getByRole('button', { name: /Chọn hãng/ }).click();
  await page.getByLabel('Tìm hãng').fill('ricoh');
  await page.locator('[aria-label="Danh sách hãng"] .pick-row').first().click();
  await page.getByLabel('Tìm mẫu').fill('GR1');
  await page.locator('[aria-label="Danh sách mẫu"] .pick-row').first().click();
  await page.getByRole('radio', { name: 'Rất muốn' }).click();
  await page.getByLabel('Giá muốn mua (VNĐ)').fill('2.500.000');
  await page.getByLabel('Tình trạng / phiên bản muốn').fill('bản đen');
  await page.getByRole('button', { name: 'Thêm vào wishlist' }).click();

  await page.waitForURL('**/wishlist');
  const row = page.locator('.wish-row').first();
  await expect(row).toContainText('Ricoh GR1');
  await expect(row).toContainText('Rất muốn');
  await row.click();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Tra giá' }).click();
  await expect(page.getByText('Thị trường đang thấp hơn mục tiêu 4%')).toBeVisible();
  expect(calls).toBe(1);

  await page.getByLabel('Link tin rao').fill('https://www.facebook.com/marketplace/item/123');
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(page.getByRole('link', { name: 'facebook.com' })).toBeVisible();

  await page.getByRole('button', { name: /Đã mua được/ }).click();
  await expect(page.getByRole('heading', { name: 'Đã mua được' })).toBeVisible();
  await expect(page.locator('.input.picker')).toHaveText(['Ricoh', 'GR1']);
  await page.getByRole('button', { name: 'Lưu máy' }).click();
  await page.waitForURL('**/may/**');

  const cams = await idb<{ model: string; marketValue?: number }>(page, 'cameras');
  expect(cams.find((c) => c.model === 'GR1')?.marketValue).toBe(2400000);
  const wish = await idb<{ acquiredAt?: number }>(page, 'wishlist');
  expect(wish[0].acquiredAt).toBeTruthy();
  await page.goto('/wishlist');
  await expect(page.getByText('Xem 1 máy đã săn được')).toBeVisible();
});

test('cài đặt: danh mục mở được từng trang con, /du-lieu chuyển sang Nhập / Xuất', async ({ page }) => {
  await mockApis(page);
  await importSample(page);
  await page.goto('/cai-dat');
  for (const [label, title] of [['Sao lưu & khôi phục', 'Sao lưu'], ['Nhập / xuất bảng tính', 'Nhập / Xuất'], ['Tự tra giá thị trường', 'Tra giá'], ['Tỷ giá', 'Tỷ giá'], ['Thư viện mẫu máy', 'Thư viện'], ['Giao diện', 'Giao diện']]) {
    await page.locator('.menu-row', { hasText: label }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await page.locator('.back-link').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cài đặt');
  }
  await page.locator('.profile-card').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tài khoản');
  await page.goto('/du-lieu');
  await expect(page).toHaveURL(/\/cai-dat\/nhap-xuat$/);
});
