import { expect, test, type Page } from '@playwright/test';
import { fixture, idb, importSample, mockApis } from './helpers';
import { FakeSupabase } from './fakeSupabase';

async function login(page: Page) {
  await page.goto('/cai-dat/tai-khoan');
  await page.getByLabel('Email').fill('lam@example.com');
  await page.getByRole('button', { name: 'Gửi mã đăng nhập' }).click();
  await page.getByLabel('Mã đăng nhập').fill('000000');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Mã không đúng hoặc đã hết hạn')).toBeVisible();
  await page.getByLabel('Mã đăng nhập').fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('button', { name: 'Đồng bộ ngay' })).toBeVisible();
  await expect(page.locator('.rows')).toContainText('vừa xong', { timeout: 15000 });
}

const syncNow = async (page: Page) => {
  await page.goto('/cai-dat/tai-khoan');
  await page.getByRole('button', { name: 'Đồng bộ ngay' }).click();
  await expect(page.getByRole('button', { name: 'Đồng bộ ngay' })).toBeEnabled({ timeout: 15000 });
};

test('đồng bộ giữa hai thiết bị: máy, ảnh, cuộn film, sửa, xoá', async ({ browser }) => {
  test.setTimeout(90_000);
  const server = new FakeSupabase();
  const mk = async () => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    await server.attach(ctx);
    const page = await ctx.newPage();
    await mockApis(page);
    return { ctx, page };
  };

  // Máy A: có dữ liệu sẵn, rồi mới đăng nhập
  const A = await mk();
  await importSample(A.page);
  const xa = (await idb<{ id: string; model: string }>(A.page, 'cameras')).find((c) => c.model === 'XA')!;
  await A.page.goto(`/may/${xa.id}`);
  await A.page.locator('input[type=file]').first().setInputFiles(fixture('photo.jpg'));
  await expect.poll(async () => (await idb(A.page, 'photos')).length).toBe(1);
  await A.page.getByRole('button', { name: '+ Lắp film vào máy này' }).click();
  await A.page.getByLabel('Tìm film').fill('hp5');
  await A.page.locator('[aria-label="Danh sách film"] .pick-row').first().click();
  await A.page.getByRole('button', { name: 'Lắp film', exact: true }).click();
  await expect.poll(async () => (await idb(A.page, 'rolls')).length).toBe(1);
  await A.page.goto('/cai-dat/giao-dien');
  await A.page.getByLabel('Tên hiển thị').fill('Lâm');
  await A.page.getByLabel('Tên hiển thị').blur();
  await expect.poll(async () => (await idb<{ key: string; value: unknown }>(A.page, 'settings')).find((x) => x.key === 'ownerName')?.value).toBe('Lâm');
  await login(A.page);
  expect([...server.rows.values()].filter((r) => r.kind === 'camera')).toHaveLength(4);
  expect(server.files.size).toBe(1);
  expect(server.rows.get('setting:ownerName')?.data).toEqual({ value: 'Lâm' });

  // Máy B: trống, đăng nhập → kéo về đủ
  const B = await mk();
  await login(B.page);
  expect(await idb(B.page, 'cameras')).toHaveLength(4);
  const photos = await idb<{ cameraId: string }>(B.page, 'photos');
  expect(photos).toHaveLength(1);
  expect(photos[0].cameraId).toBe(xa.id);
  expect((await idb<{ stock: string }>(B.page, 'rolls'))[0].stock).toContain('HP5');
  await B.page.goto('/');
  await expect(B.page.locator('.eyebrow').first()).toContainText('Lâm');
  await B.page.goto(`/may/${xa.id}`);
  await expect(B.page.locator('.film-card')).toContainText('HP5');

  // B sửa ghi chú → tự đồng bộ sau vài giây → A thấy
  await B.page.evaluate((id) => new Promise<void>((res) => {
    const r = indexedDB.open('kho-may');
    r.onsuccess = () => {
      const s = r.result.transaction('cameras', 'readwrite').objectStore('cameras');
      const q = s.get(id);
      q.onsuccess = () => { const c = q.result; c.notes = 'sửa từ máy B'; c.updatedAt = Date.now(); s.put(c).onsuccess = () => { r.result.close(); res(); }; };
    };
  }), xa.id);
  await expect.poll(() => (server.rows.get(`camera:${xa.id}`)?.data as { notes?: string })?.notes, { timeout: 15000 }).toBe('sửa từ máy B');
  await syncNow(A.page);
  expect((await idb<{ id: string; notes: string }>(A.page, 'cameras')).find((c) => c.id === xa.id)?.notes).toBe('sửa từ máy B');

  // A xoá ảnh → B mất ảnh
  await A.page.goto(`/may/${xa.id}/sua`);
  await A.page.getByRole('button', { name: 'Bỏ ảnh' }).first().click();
  await expect.poll(async () => (await idb(A.page, 'photos')).length).toBe(0);
  await syncNow(A.page);
  await expect.poll(() => server.rows.get(`photo:${(photos[0] as unknown as { id: string }).id}`)?.deleted, { timeout: 15000 }).toBe(true);
  await syncNow(B.page);
  expect(await idb(B.page, 'photos')).toHaveLength(0);

  // Xoá dữ liệu trên máy B (không xoá tài khoản) → đồng bộ lại tải về đủ
  await B.page.goto('/cai-dat/sao-luu');
  B.page.once('dialog', (d) => d.accept());
  await B.page.getByRole('button', { name: /Xóa dữ liệu trên máy|Xóa toàn bộ dữ liệu/ }).click();
  // máy chủ không mất gì, và máy B tự tải lại đủ
  expect([...server.rows.values()].filter((r) => r.kind === 'camera' && !r.deleted)).toHaveLength(4);
  await expect.poll(async () => (await idb(B.page, 'cameras')).length, { timeout: 15000 }).toBe(4);
  expect([...server.rows.values()].filter((r) => r.deleted).map((r) => r.kind)).toEqual(['photo']);

  // Đăng xuất & xoá trên máy B → tài khoản vẫn nguyên
  await B.page.goto('/cai-dat/tai-khoan');
  B.page.once('dialog', (d) => d.accept());
  await B.page.getByRole('button', { name: 'Đăng xuất và xoá dữ liệu trên máy này' }).click();
  await expect(B.page.getByRole('button', { name: 'Gửi mã đăng nhập' })).toBeVisible();
  await expect.poll(async () => (await idb(B.page, 'cameras')).length).toBe(0);
  expect([...server.rows.values()].filter((r) => r.kind === 'camera' && !r.deleted)).toHaveLength(4);

  await A.ctx.close(); await B.ctx.close();
});
