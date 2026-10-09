import type { Page } from '@playwright/test';
import path from 'node:path';

export const fixture = (f: string) => path.join(import.meta.dirname, '..', 'fixtures', f);

/** Chặn mọi API bên ngoài để test không phụ thuộc mạng */
export async function mockApis(page: Page) {
  await page.route('**/api/price', (r) => r.fulfill({ status: 503, json: { error: 'off' } }));
  await page.route('**/api/image*', (r) => r.fulfill({ json: { found: false } }));
  await page.route('**/api/contribute', (r) => r.fulfill({ status: 401, json: { error: 'no' } }));
}

export async function importSample(page: Page) {
  await page.goto('/du-lieu');
  await page.locator('section[aria-label="Nhập dữ liệu"] input[type=file]').setInputFiles(fixture('sample.csv'));
  await page.getByRole('button', { name: /^Nhập \d+ máy/ }).click();
  await page.waitForURL('**/');
}

/** Đọc thẳng IndexedDB của app */
export function idb<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate((s) => new Promise<T[]>((res) => {
    const r = indexedDB.open('kho-may');
    r.onsuccess = () => {
      const q = r.result.transaction(s).objectStore(s).getAll();
      q.onsuccess = () => { r.result.close(); res(q.result as T[]); };
    };
  }), store);
}

export async function wipe(page: Page) {
  await page.evaluate(() => new Promise<void>((res) => {
    const r = indexedDB.open('kho-may');
    r.onsuccess = () => {
      const db = r.result;
      const t = db.transaction([...db.objectStoreNames], 'readwrite');
      for (const n of db.objectStoreNames) t.objectStore(n).clear();
      t.oncomplete = () => { db.close(); res(); };
    };
  }));
}
