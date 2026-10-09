import { expect, test, type Page } from '@playwright/test';
import { fixture, idb, importSample, mockApis } from './helpers';
import { FakeSupabase } from './fakeSupabase';

async function login(page: Page, opts: { create?: boolean; server?: FakeSupabase } = {}) {
  await page.goto('/cai-dat/tai-khoan');
  if (opts.create) {
    await page.getByRole('radio', { name: 'Tạo tài khoản' }).click();
    await page.getByLabel('Email').fill('lam@example.com');
    await page.getByLabel('Mật khẩu').fill('123');
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByText('Mật khẩu cần ít nhất 6 ký tự')).toBeVisible();
    await page.getByLabel('Mật khẩu').fill('phim-35mm');
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    // Supabase mặc định: phải xác nhận email trước
    await expect(page.locator('.info-box')).toContainText('Đã gửi thư xác nhận');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
    await expect(page.getByText('Email chưa được xác nhận')).toBeVisible();
    opts.server!.confirmed.add('lam@example.com'); // bấm link trong email
  } else {
    await page.getByLabel('Email').fill('lam@example.com');
    await page.getByLabel('Mật khẩu').fill('sai-mat-khau');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
    await expect(page.getByText('Sai email hoặc mật khẩu')).toBeVisible();
    await page.getByLabel('Mật khẩu').fill('phim-35mm');
  }
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
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
  server.confirmEmail = true;
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
  await login(A.page, { create: true, server });
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
  await expect(B.page.getByRole('radio', { name: 'Tạo tài khoản' })).toBeVisible();
  await expect.poll(async () => (await idb(B.page, 'cameras')).length).toBe(0);
  expect([...server.rows.values()].filter((r) => r.kind === 'camera' && !r.deleted)).toHaveLength(4);

  await A.ctx.close(); await B.ctx.close();
});

test('link trong email: xác nhận tài khoản & đặt lại mật khẩu', async ({ browser }) => {
  const server = new FakeSupabase();
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await server.attach(ctx);
  const page = await ctx.newPage();
  const s = server.session();
  const hash = (type: string) => `#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&token_type=bearer&type=${type}`;
  await page.goto('/xac-nhan' + hash('signup'));
  await expect(page.locator('.info-box')).toContainText('Email đã được xác nhận');
  await page.goto('/dat-lai-mat-khau' + hash('recovery'));
  await page.getByLabel('Mật khẩu mới').fill('moi-123456');
  await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await expect(page.locator('.info-box')).toContainText('Đã đổi mật khẩu');
  await page.goto('/xac-nhan#error=access_denied&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByText('Email link is invalid or has expired')).toBeVisible();
  await ctx.close();
});
