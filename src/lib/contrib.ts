import { db, getSettings } from '../db';
import { pendingContributions, refreshCatalog, squash } from './catalog';
import type { Contribution } from './catalogTypes';

type Pending = { c: Contribution; syncedAt?: number; error?: string };

async function savePending(list: Pending[]) {
  await db.settings.put({ key: 'catalogContrib', value: list });
  await refreshCatalog();
}

export function newModelId(brand: string, model: string) {
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug(brand)}-${slug(model)}`.slice(0, 80) || `mau-${Date.now()}`;
}

export async function contribToken() {
  const s = await getSettings();
  return s.contribToken;
}

async function post(token: string, body: unknown) {
  const r = await fetch('/api/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-contrib-token': token },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error ?? `Lỗi ${r.status}`);
  return data;
}

export async function pingContrib(token: string) {
  return post(token, { ping: true });
}

/**
 * Lưu đóng góp: áp ngay vào thư viện trên máy, rồi gửi lên GitHub (nếu đã cấu hình).
 * Trả về 'synced' | 'local' (chưa gửi được, sẽ thử lại sau).
 */
export async function submitContribution(c: Contribution): Promise<{ state: 'synced' | 'local'; error?: string }> {
  const list = await pendingContributions() as Pending[];
  const item: Pending = { c };
  list.push(item);
  await savePending(list);
  return trySync(item);
}

async function trySync(item: Pending): Promise<{ state: 'synced' | 'local'; error?: string }> {
  const token = await contribToken();
  if (!token) return { state: 'local', error: 'Chưa nhập mã đóng góp trong Cài đặt' };
  try {
    await post(token, { contribution: item.c });
    const list = await pendingContributions() as Pending[];
    const found = list.find((p) => p.c.id === item.c.id && p.c.at === item.c.at && JSON.stringify(p.c.set) === JSON.stringify(item.c.set));
    if (found) { found.syncedAt = Date.now(); delete found.error; }
    await savePending(list);
    return { state: 'synced' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lỗi';
    return { state: 'local', error: msg };
  }
}

/** Gửi lại các đóng góp chưa gửi; bỏ những mục đã gửi quá 3 ngày (bản build mới đã có) */
export async function syncPending() {
  const list = await pendingContributions() as Pending[];
  const keep = list.filter((p) => !p.syncedAt || Date.now() - p.syncedAt < 3 * 86400000);
  if (keep.length !== list.length) await savePending(keep);
  for (const p of keep.filter((x) => !x.syncedAt)) await trySync(p);
}

export async function pendingStats() {
  const list = await pendingContributions() as Pending[];
  return { waiting: list.filter((p) => !p.syncedAt).length, synced: list.filter((p) => p.syncedAt).length, items: list };
}

export function exportPendingJSON(items: Pending[]) {
  return JSON.stringify(items.map((p) => p.c), null, 2);
}

export const sameModel = (a: string, b: string) => squash(a) === squash(b);
