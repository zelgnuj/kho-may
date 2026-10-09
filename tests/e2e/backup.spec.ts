import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixture, idb, importSample, mockApis, wipe } from './helpers';

test.beforeEach(async ({ page }) => { await mockApis(page); });

test('sao lưu kèm ảnh rồi khôi phục trên máy trống', async ({ page }) => {
  await importSample(page);
  const xa = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === 'XA')!;
  await page.goto(`/may/${xa.id}`);
  await page.locator('input[type=file]').setInputFiles(fixture('photo.jpg'));
  await expect.poll(async () => (await idb(page, 'photos')).length).toBe(1);

  await page.goto('/du-lieu');
  await page.getByRole('button', { name: /Sao lưu ngay/ }).click();
  await expect(page.locator('.backup-file')).toContainText('4 máy · 1 ảnh');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Tải file/ }).first().click();
  const file = await (await dl).path();
  await expect(page.locator('section[aria-label="Sao lưu"]')).toContainText('hôm nay');

  await wipe(page);
  await page.goto('/du-lieu');
  await page.locator('section[aria-label="Sao lưu"] input[type=file]').setInputFiles({ name: 'kho-may-saoluu.zip', mimeType: 'application/zip', buffer: readFileSync(file) });
  await expect(page.getByRole('dialog', { name: 'Khôi phục' })).toContainText('4 máy · 1 ảnh');
  await page.getByRole('button', { name: 'Khôi phục', exact: true }).click();
  await page.waitForURL('**/');
  expect(await idb(page, 'cameras')).toHaveLength(4);
  const photos = await idb<{ cameraId: string; blob: Blob }>(page, 'photos');
  expect(photos).toHaveLength(1);
  expect(photos[0].cameraId).toBe(xa.id);
  await expect(page.locator('.thumb-img').first()).toBeVisible();
});

test('khôi phục không ghi đè bản sửa mới hơn', async ({ page }) => {
  await importSample(page);
  await page.goto('/du-lieu');
  await page.getByRole('button', { name: /Sao lưu ngay/ }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Tải file/ }).first().click();
  const buf = readFileSync(await (await dl).path());

  // sửa ghi chú sau khi sao lưu
  await page.evaluate(() => new Promise<void>((res) => {
    const r = indexedDB.open('kho-may');
    r.onsuccess = () => {
      const s = r.result.transaction('cameras', 'readwrite').objectStore('cameras');
      const q = s.getAll();
      q.onsuccess = () => { const c = q.result.find((x: { model: string }) => x.model === 'XA'); c.notes = 'mới sửa'; c.updatedAt = Date.now() + 1000; s.put(c).onsuccess = () => { r.result.close(); res(); }; };
    };
  }));
  await page.reload();
  await page.locator('section[aria-label="Sao lưu"] input[type=file]').setInputFiles({ name: 'b.zip', mimeType: 'application/zip', buffer: buf });
  await page.getByRole('button', { name: 'Khôi phục', exact: true }).click();
  await page.waitForURL('**/');
  const xa = (await idb<{ model: string; notes: string }>(page, 'cameras')).find((c) => c.model === 'XA')!;
  expect(xa.notes).toBe('mới sửa');
});

test('nhắc sao lưu khi lâu chưa sao lưu, bấm Để sau thì ẩn', async ({ page }) => {
  await importSample(page);
  await expect(page.locator('.backup-nudge')).toHaveCount(0);
  // giả lập: máy được thêm từ 5 ngày trước
  await page.evaluate(() => new Promise<void>((res) => {
    const r = indexedDB.open('kho-may');
    r.onsuccess = () => {
      const s = r.result.transaction('cameras', 'readwrite').objectStore('cameras');
      const q = s.getAll();
      q.onsuccess = () => { let n = q.result.length; for (const c of q.result) { c.createdAt -= 5 * 86400000; s.put(c).onsuccess = () => { if (--n === 0) { r.result.close(); res(); } }; } };
    };
  }));
  await page.reload();
  await expect(page.locator('.backup-nudge')).toContainText('chưa sao lưu lần nào');
  await page.getByRole('button', { name: 'Để sau' }).click();
  await expect(page.locator('.backup-nudge')).toHaveCount(0);
});
