import { expect, test } from '@playwright/test';
import { idb, importSample, mockApis } from './helpers';

test.beforeEach(async ({ page }) => { await mockApis(page); await importSample(page); });

test('cho mượn: ghi người mượn, hẹn trả, quá hẹn, đã trả, lịch sử', async ({ page }) => {
  const xa = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === 'XA')!;
  await page.goto(`/may/${xa.id}`);
  await page.getByRole('button', { name: 'Cho bạn mượn máy này' }).click();
  await page.getByLabel('Người mượn').fill('Minh');
  await page.getByRole('button', { name: '1 tuần' }).click();
  await page.getByLabel('Ghi chú').fill('kèm 2 cuộn film');
  await page.getByRole('button', { name: 'Cho mượn', exact: true }).click();

  await expect(page.locator('.loan-card')).toContainText('Đang cho Minh mượn');
  await expect(page.locator('.loan-card')).toContainText('còn 7 ngày');
  await expect(page.locator('.status-chip.loan')).toHaveText('Minh mượn');

  // Kho máy: lọc Cho mượn, tag trên thẻ
  await page.goto('/');
  await page.getByRole('button', { name: /Cho mượn/ }).click();
  await expect(page.locator('.loan-tag')).toHaveText('Minh mượn');

  // giả lập quá hẹn: lùi ngày mượn & hẹn trả
  await page.evaluate((id) => new Promise<void>((res) => {
    const r = indexedDB.open('kho-may');
    r.onsuccess = () => {
      const s = r.result.transaction('cameras', 'readwrite').objectStore('cameras');
      const q = s.get(id);
      q.onsuccess = () => { const c = q.result; c.loan.since = '2026-01-01'; c.loan.due = '2026-01-10'; s.put(c).onsuccess = () => { r.result.close(); res(); }; };
    };
  }), xa.id);
  await page.reload();
  await expect(page.locator('.loan-nudge')).toContainText('Minh giữ XA quá hẹn');
  await expect(page.locator('.loan-tag.overdue')).toBeVisible();

  // trả máy → vào lịch sử
  await page.goto(`/may/${xa.id}`);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Đã trả' }).click();
  await expect(page.getByRole('button', { name: 'Cho bạn mượn máy này' })).toBeVisible();
  await page.getByRole('button', { name: /Xem 1 lần cho mượn trước/ }).click();
  await expect(page.locator('section[aria-label="Cho mượn"] .rows')).toContainText('Minh');
  const cam = (await idb<{ id: string; loan: unknown; loanHistory: { to: string }[] }>(page, 'cameras')).find((c) => c.id === xa.id)!;
  expect(cam.loan).toBeNull();
  expect(cam.loanHistory[0].to).toBe('Minh');
});

test('nút +: cho mượn nhanh', async ({ page }) => {
  await page.getByRole('button', { name: 'Làm nhanh' }).click();
  await page.locator('.quick-tile', { hasText: 'Cho mượn' }).click();
  await page.locator('[aria-label="Chọn máy"] .pick-row', { hasText: 'OM-2N' }).click();
  await page.getByLabel('Người mượn').fill('Hà');
  await page.getByRole('button', { name: 'Cho mượn', exact: true }).click();
  const om = (await idb<{ model: string; loan?: { to: string } }>(page, 'cameras')).find((c) => c.model === 'OM-2N')!;
  expect(om.loan?.to).toBe('Hà');
});
