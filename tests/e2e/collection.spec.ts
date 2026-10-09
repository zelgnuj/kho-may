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

test('lùi từ trang chi tiết về Kho máy: giữ vị trí cuộn, nội dung hiện đủ', async ({ page }) => {
  await mockApis(page);
  await importSample(page);
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('/');
  await expect(page.locator('a[href^="/may/"]').first()).toBeVisible();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(100);
  await page.locator('a[href^="/may/"]').last().click();
  await page.waitForURL('**/may/**');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Kho máy' })).toBeAttached();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 5);
  await expect(page.locator('a[href^="/may/"]').first()).toBeAttached();
});

test('sửa ảnh: xoá ảnh cũ, thêm ảnh mới, lưu → ảnh bìa ngoài lưới là ảnh mới', async ({ page }) => {
  await mockApis(page);
  await importSample(page);
  const xa = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === 'XA')!;
  await page.goto(`/may/${xa.id}`);
  await page.locator('input[type=file]').first().setInputFiles(fixture('photo.jpg'));
  await expect.poll(async () => (await idb(page, 'photos')).length).toBe(1);
  const [oldPhoto] = await idb<{ id: string }>(page, 'photos');
  await page.goto('/');
  await expect(page.locator(`a[href="/may/${xa.id}"] img.thumb-img`)).toBeVisible();
  const oldSrc = await page.locator(`a[href="/may/${xa.id}"] img.thumb-img`).getAttribute('src');

  // Sửa máy: xoá ảnh cũ, thêm ảnh mới, đổi ghi chú, lưu
  await page.goto(`/may/${xa.id}/sua`);
  await page.getByRole('button', { name: 'Bỏ ảnh' }).first().click();
  await page.locator('section[aria-label="Ảnh"] input[type=file]').last().setInputFiles(fixture('photo2.jpg'));
  await page.getByRole('button', { name: 'Lưu máy' }).click();
  await page.waitForURL(`**/may/${xa.id}`);

  const cam = (await idb<{ id: string; coverPhotoId: string }>(page, 'cameras')).find((c) => c.id === xa.id)!;
  const photos = await idb<{ id: string }>(page, 'photos');
  expect(photos).toHaveLength(1);
  expect(photos[0].id).not.toBe(oldPhoto.id);
  expect(cam.coverPhotoId).toBe(photos[0].id);

  await page.goto('/');
  const img = page.locator(`a[href="/may/${xa.id}"] img.thumb-img`);
  await expect(img).toBeVisible();
  expect(await img.getAttribute('src')).not.toBe(oldSrc);

  // xoá hết ảnh → lưới quay về hình vẽ / ảnh mẫu, không để ô trống
  await page.goto(`/may/${xa.id}/sua`);
  await page.getByRole('button', { name: 'Bỏ ảnh' }).first().click();
  await page.getByRole('button', { name: 'Lưu máy' }).click();
  await page.waitForURL(`**/may/${xa.id}`);
  expect((await idb<{ id: string; coverPhotoId: string | null }>(page, 'cameras')).find((c) => c.id === xa.id)!.coverPhotoId).toBeNull();
  await page.goto('/');
  await expect(page.locator(`a[href="/may/${xa.id}"] .thumb-wait`)).toHaveCount(0);
});

test('thẻ máy mặc định không hiện giá, chọn giá thị trường hoặc giá mua trong Giao diện', async ({ page }) => {
  await importSample(page);
  await expect(page.locator('.grid .card').first()).toBeVisible();
  await expect(page.locator('.grid .card .val')).toHaveCount(0);
  await page.goto('/cai-dat/giao-dien');
  const group = page.getByRole('radiogroup', { name: 'Giá trên thẻ máy' });
  await group.getByRole('radio', { name: 'Thị trường' }).click();
  await page.goto('/');
  await expect(page.locator('.grid .card .val').first()).toBeVisible();
  await expect(page.locator('.grid .card .chg', { hasText: 'giá mua' })).toHaveCount(0);

  // Giá mua: sample.csv có máy giá 1,5 triệu
  await page.goto('/cai-dat/giao-dien');
  await group.getByRole('radio', { name: 'Giá mua' }).click();
  await page.goto('/');
  await expect(page.locator('.grid .card', { hasText: 'giá mua' }).first()).toBeVisible();
  await expect(page.locator('.grid .card .val', { hasText: '1,5 tr' })).toHaveCount(1);
});
