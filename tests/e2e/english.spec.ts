import { expect, test, type Page } from '@playwright/test';
import { fixture, idb, mockApis } from './helpers';

// Bản tiếng Anh: trình duyệt en-US → app tự chạy tiếng Anh, giá trị hiển thị bằng USD
test.use({ locale: 'en-US' });

const VI = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

async function noVietnamese(page: Page, where: string) {
  await page.waitForTimeout(300);
  const text = await page.locator('#root').innerText();
  const bad = text.split('\n').filter((l) => VI.test(l) && l.trim() !== 'Tiếng Việt');
  expect(bad, `${where}: còn chữ tiếng Việt`).toEqual([]);
  const missing = await page.evaluate(() => [...((window as unknown as { __i18nMissing: Set<string> }).__i18nMissing ?? [])]);
  expect(missing, `${where}: thiếu bản dịch`).toEqual([]);
}

test('giao diện tiếng Anh: không sót chữ Việt, giá bằng USD', async ({ page }) => {
  await mockApis(page);
  await page.route('https://open.er-api.com/**', (r) => r.fulfill({ json: { rates: { JPY: 0.0058, USD: 1 / 26000 } } }));

  await page.goto('/cai-dat/nhap-xuat');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('section[aria-label="Import data"] input[type=file]').setInputFiles(fixture('sample.csv'));
  await page.getByRole('button', { name: /^Import \d+ cameras/ }).click();
  await page.waitForURL('**/');

  // Gán giá thị trường cho một máy để kiểm tra hiển thị USD
  const cams = await idb<{ id: string; model: string }>(page, 'cameras');
  const xa = cams.find((c) => c.model === 'XA')!;
  await page.evaluate((id) => new Promise<void>((res) => {
    const r = indexedDB.open('kho-may');
    r.onsuccess = () => {
      const t = r.result.transaction('cameras', 'readwrite');
      const s = t.objectStore('cameras');
      const g = s.get(id);
      g.onsuccess = () => { s.put({ ...g.result, marketValue: 5_200_000, marketUpdatedAt: Date.now(), updatedAt: Date.now() }); };
      t.oncomplete = () => { r.result.close(); res(); };
    };
  }), xa.id);

  await page.goto('/');
  await expect(page.getByText('Collection', { exact: false }).first()).toBeVisible();
  await noVietnamese(page, 'Cabinet');

  await page.goto(`/may/${xa.id}`);
  await expect(page.getByText('$200').first()).toBeVisible();
  await noVietnamese(page, 'Detail');

  for (const [path, name] of [
    ['/gia-tri', 'Value'], ['/wishlist', 'Wishlist'], ['/film', 'Film'], ['/cai-dat', 'Settings'],
    ['/cai-dat/sao-luu', 'Backup'], ['/cai-dat/nhap-xuat', 'Import'], ['/cai-dat/tra-gia', 'Pricing'],
    ['/cai-dat/ty-gia', 'Rates'], ['/cai-dat/thu-vien', 'Library'], ['/cai-dat/giao-dien', 'Appearance'],
    ['/cai-dat/tai-khoan', 'Account'], ['/them', 'Add'], ['/wishlist/them', 'Add wish'], ['/trung-bay', 'Showcase']
  ] as const) {
    await page.goto(path);
    await noVietnamese(page, name);
  }

  await page.goto('/gia-tri');
  await expect(page.locator('#root')).toContainText('$');

  // Đổi sang tiếng Việt trong Cài đặt → Giao diện
  await page.goto('/cai-dat/giao-dien');
  await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByText('Ngôn ngữ')).toBeVisible();
});
