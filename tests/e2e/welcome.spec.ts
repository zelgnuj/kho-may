import { expect, test } from '@playwright/test';
import { mockApis } from './helpers';
import { FakeSupabase } from './fakeSupabase';

test('người mới: màn chào → hướng dẫn cài app → tạo tài khoản → vào app', async ({ browser }) => {
  const server = new FakeSupabase();
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await server.attach(ctx);
  const page = await ctx.newPage();
  await mockApis(page, { welcome: true });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Camera\s*Cabinet/ })).toBeVisible();
  await expect(page.locator('.install-steps')).toContainText('Thêm vào MH chính');
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await expect(page.getByText(/dùng tạm, đăng nhập sau/)).toHaveCount(0); // máy mới, chưa có dữ liệu

  await page.getByRole('button', { name: /Dùng luôn trên trình duyệt này/ }).click();
  await page.getByRole('radio', { name: 'Tạo tài khoản' }).click();
  await page.getByLabel('Email').fill('lam@example.com');
  await page.getByLabel('Mật khẩu').fill('phim-35mm');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();

  await expect(page.locator('.bottom-nav')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kho máy' })).toBeVisible();

  // đăng xuất → quay lại màn chào
  await page.goto('/cai-dat/tai-khoan');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Đăng xuất, giữ dữ liệu trên máy' }).click();
  await expect(page.locator('.welcome')).toBeVisible();
  await ctx.close();
});
