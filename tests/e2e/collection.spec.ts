import { expect, test } from '@playwright/test';
import { fixture, idb, importSample, mockApis } from './helpers';

test.beforeEach(async ({ page }) => { await mockApis(page); });

test('nhập CSV, nhận dạng từ thư viện, hiện bảng thông số', async ({ page }) => {
  await importSample(page);
  const cams = await idb<{ id: string; brand: string; model: string; type: string; status: string; lens?: { focal?: number } }>(page, 'cameras');
  expect(cams).toHaveLength(4);
  const xa = cams.find((c) => c.model === 'XA')!;
  expect(xa.type).toBe('RF');
  expect(xa.lens?.focal).toBe(35);
  expect(cams.find((c) => c.model === 'OM-2N')!.type).toBe('SLR');

  await expect(page.locator('.grid-card, .card, a[href^="/may/"]').first()).toBeVisible();
  await page.locator(`a[href="/may/${xa.id}"]`).first().click();
  await expect(page.locator('.spec-card')).toBeVisible();
  await expect(page.locator('.quality-chip')).toHaveText('Đã đối chiếu');
});

test('đóng góp đầu tiên (pin Canon AE-1) đã vào thư viện', async ({ page }) => {
  await importSample(page);
  const ae1 = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === 'AE-1')!;
  await page.goto(`/may/${ae1.id}`);
  await expect(page.locator('.spec-rows div', { hasText: 'Pin' })).toContainText('4LR44');
});

test('chọn Hãng / Mẫu từ thư viện, chịu gõ sai', async ({ page }) => {
  await page.goto('/them');
  await page.getByRole('button', { name: /Chọn hãng/ }).click();
  await page.getByLabel('Tìm hãng').fill('olimpus');
  await page.locator('[aria-label="Danh sách hãng"] .pick-row').first().click();
  await page.getByLabel('Tìm mẫu').fill('xa');
  await page.locator('[aria-label="Danh sách mẫu"] .pick-row').first().click();
  await expect(page.locator('.input.picker')).toHaveText(['Olympus', 'XA']);
  await expect(page.getByText('Có trong thư viện')).toBeVisible();

  await page.getByRole('button', { name: 'XA' }).click();
  await page.getByLabel('Tìm mẫu').fill('Máy Tự Chế 1');
  await page.locator('.pick-free').click();
  await expect(page.locator('.input.picker').nth(1)).toHaveText('Máy Tự Chế 1');
});

test('ảnh: lưới dùng ảnh thu nhỏ lưu sẵn trên máy', async ({ page }) => {
  await mockApis(page);
  await importSample(page);
  const xa = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === 'XA')!;
  await page.goto(`/may/${xa.id}`);
  await page.locator('input[type=file]').first().setInputFiles(fixture('photo.jpg'));
  await expect(page.locator('.hero-scroll img').first()).toBeVisible();
  await page.goto('/');
  await expect(page.locator(`a[href="/may/${xa.id}"] img.thumb-img`)).toBeVisible();
  const thumbs = await idb<{ id: string; blob: Blob }>(page, 'thumbs');
  expect(thumbs).toHaveLength(1);
  const sizes = await page.evaluate(() => new Promise<number[]>((res) => {
    const r = indexedDB.open('kho-may');
    r.onsuccess = () => {
      const t = r.result.transaction(['thumbs', 'photos']);
      const a = t.objectStore('thumbs').getAll(); const b = t.objectStore('photos').getAll();
      t.oncomplete = () => { r.result.close(); res([a.result[0].blob.size, b.result[0].blob.size]); };
    };
  }));
  expect(sizes[0]).toBeGreaterThan(0);
  expect(sizes[0]).toBeLessThanOrEqual(sizes[1]);
  // mở lại app: ảnh thu nhỏ có sẵn, không tạo lại
  await page.reload();
  await expect(page.locator(`a[href="/may/${xa.id}"] img.thumb-img`)).toBeVisible();
  expect(await idb(page, 'thumbs')).toHaveLength(1);
});
