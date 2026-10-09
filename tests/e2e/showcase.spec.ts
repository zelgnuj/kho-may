import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import { fixture, idb, importSample, mockApis } from './helpers';

test.beforeEach(async ({ page }) => { await mockApis(page); });

async function addPhoto(page: Page, model: string, file: string) {
  const cam = (await idb<{ id: string; model: string }>(page, 'cameras')).find((c) => c.model === model)!;
  const before = (await idb(page, 'photos')).length;
  await page.goto(`/may/${cam.id}`);
  await page.locator('input[type=file]').setInputFiles(fixture(file));
  await expect.poll(async () => (await idb(page, 'photos')).length).toBe(before + 1);
  return cam.id;
}

/** Kích thước + (tuỳ chọn) lưu ảnh xem trước ra file để soi bằng mắt */
async function preview(page: Page, save?: string) {
  const img = page.locator('.share-preview img');
  await expect(img).toBeVisible();
  await expect(page.locator('.share-preview')).toHaveAttribute('aria-busy', 'false');
  return img.evaluate(async (el: HTMLImageElement, save) => {
    await el.decode();
    let data: string | null = null;
    if (save) {
      const b = await (await fetch(el.src)).blob();
      data = await new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
    }
    return { w: el.naturalWidth, h: el.naturalHeight, data };
  }, save ?? null);
}

function dump(name: string, data: string | null) {
  const dir = process.env.SHOT_DIR;
  if (dir && data) writeFileSync(`${dir}/${name}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
}

test('ảnh chia sẻ một máy: 2 kiểu, 2 khổ, tải về được', async ({ page }) => {
  await importSample(page);
  await addPhoto(page, 'XA', 'photo.jpg');
  await page.getByRole('button', { name: 'Chia sẻ ảnh máy' }).click();
  let p = await preview(page, 'x');
  expect([p.w, p.h]).toEqual([1080, 1350]);
  dump('cam-catalog-post', p.data);

  await page.getByRole('radio', { name: 'Khung phim' }).click();
  await expect(page.locator('.share-preview')).toHaveAttribute('aria-busy', 'false');
  p = await preview(page, 'x');
  dump('cam-film-post', p.data);

  await page.getByRole('radio', { name: 'Story 9:16' }).click();
  await expect.poll(async () => (await preview(page)).h).toBe(1920);
  p = await preview(page, 'x');
  dump('cam-film-story', p.data);

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải ảnh về' }).click();
  expect((await dl).suggestedFilename()).toBe('camera-cabinet-olympus-xa-film.jpg');
});

test('ảnh chia sẻ cả bộ sưu tập: lưới và contact sheet', async ({ page }) => {
  await importSample(page);
  await addPhoto(page, 'XA', 'photo.jpg');
  await addPhoto(page, 'OM-2N', 'photo2.jpg');
  await page.goto('/');
  await page.getByRole('button', { name: 'Chia sẻ bộ sưu tập' }).click();
  let p = await preview(page, 'x');
  expect([p.w, p.h]).toEqual([1080, 1350]);
  dump('col-catalog-post', p.data);
  await page.getByRole('radio', { name: 'Contact sheet' }).click();
  await expect(page.locator('.share-preview')).toHaveAttribute('aria-busy', 'false');
  p = await preview(page, 'x');
  dump('col-film-post', p.data);
  await page.getByRole('radio', { name: 'Story 9:16' }).click();
  await expect.poll(async () => (await preview(page)).h).toBe(1920);
  p = await preview(page, 'x');
  dump('col-film-story', p.data);
});

test('trình diễn: tự chạy, chạm để chuyển, dừng, đóng', async ({ page }) => {
  await importSample(page);
  await addPhoto(page, 'XA', 'photo.jpg');
  await page.goto('/');
  await page.getByRole('button', { name: 'Trình diễn' }).click();
  const stage = page.getByRole('region', { name: 'Trình diễn bộ sưu tập' });
  await expect(stage).toBeVisible();
  await expect(page.locator('nav.bottom-nav, .bottom-nav')).toHaveCount(0);
  // Mới 1 máy có ảnh → chiếu cả máy chưa có ảnh (3 máy đang có)
  await expect(page.locator('.stage-count')).toHaveText('1 / 3');
  await expect(page.locator('.stage-caption .stage-no')).toContainText('Nº 01');
  if (process.env.SHOT_DIR) { await page.waitForTimeout(1500); await page.screenshot({ path: `${process.env.SHOT_DIR}/stage.png` }); }

  // Tự chuyển: rút thời gian để test nhanh
  await page.evaluate(() => document.querySelector<HTMLElement>('.stage')!.style.setProperty('--dur', '0.6s'));
  await page.locator('.stage-progress span.run i').evaluate((el) => { (el as HTMLElement).style.animationDuration = '0.6s'; });
  await expect(page.locator('.stage-count')).toHaveText('2 / 3', { timeout: 5000 });

  // Chạm mép phải → máy tiếp, mép trái → lùi
  await page.getByRole('button', { name: 'Tạm dừng' }).click();
  await expect(stage).toHaveClass(/paused/);
  const vw = page.viewportSize()!.width;
  await stage.click({ position: { x: vw - 20, y: 300 } });
  await expect(page.locator('.stage-count')).toHaveText('3 / 3');
  await stage.click({ position: { x: 20, y: 300 } });
  await expect(page.locator('.stage-count')).toHaveText('2 / 3');

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/$/);
});
