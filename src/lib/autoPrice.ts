import { useSyncExternalStore } from 'react';
import { addPrice, db, getSettings, patchCamera, patchWish, setSetting, type Camera, type PriceSource, type Settings, type WishItem } from '../db';

export interface LookupResult {
  usd: { low: number | null; median: number | null; high: number | null };
  vnd: { low: number | null; median: number | null; high: number | null };
  basis: string;
  confidence: string;
  includes: string;
  note: string;
  sources: PriceSource[];
  provider?: string;
  /** Máy chủ đã gọi CompSniper (tốn 1 lượt), kể cả khi phải chuyển nguồn khác */
  compsniperUsed?: boolean;
  /** CompSniper báo hết lượt tháng này */
  compsniperExhausted?: boolean;
}

export class PriceError extends Error {
  constructor(message: string, public fatal: boolean) { super(message); }
}

const DAY = 86400000;

/* ---------- Đếm lượt dùng trong tháng ---------- */

export type PriceUsage = Settings['priceUsage'];

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayKey = (d = new Date()) => `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;

/** Chuẩn hóa: sang tháng mới / ngày mới thì đếm lại từ 0 */
export function normalizeUsage(u: PriceUsage | undefined): PriceUsage {
  const m = monthKey(), d = dayKey();
  const base = u && u.month === m ? u : { month: m, total: 0, auto: 0, day: d, dayAuto: 0, exhausted: false };
  return base.day === d ? base : { ...base, day: d, dayAuto: 0 };
}

async function recordUsage(kind: 'auto' | 'manual', exhausted: boolean) {
  const s = await getSettings();
  const u = normalizeUsage(s.priceUsage);
  const next: PriceUsage = {
    ...u,
    total: exhausted ? Math.max(u.total, s.monthlyQuota) : u.total + 1,
    auto: kind === 'auto' ? u.auto + 1 : u.auto,
    dayAuto: kind === 'auto' ? u.dayAuto + 1 : u.dayAuto,
    exhausted: u.exhausted || exhausted
  };
  await setSetting('priceUsage', next);
  return next;
}

/** Số lượt còn lại trong tháng (toàn bộ) */
export function remainingQuota(s: Settings) {
  const u = normalizeUsage(s.priceUsage);
  return u.exhausted ? 0 : Math.max(0, s.monthlyQuota - u.total);
}

/* ---------- Gọi API ---------- */

async function callApi(token: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch('/api/price', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-kho-token': token } : {}) },
      body: JSON.stringify(body)
    });
  } catch {
    throw new PriceError('Không có mạng', true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data?.compsniperUsed) await recordUsage('manual', !!data.compsniperExhausted);
    const fatal = res.status === 401 || res.status === 503 || res.status === 404 || res.status === 405;
    throw new PriceError(data?.error ?? `Lỗi ${res.status}`, fatal);
  }
  return data;
}

export async function pingPriceApi(token: string): Promise<{ providers: string[]; protected: boolean }> {
  return callApi(token, { ping: true });
}

export const modelKey = (c: Pick<Camera, 'brand' | 'model'>) => `${c.brand}|${c.model}`.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Tra giá một mẫu máy (1 lượt) và áp kết quả cho MỌI máy đang có cùng mẫu.
 * Trả về giá VNĐ hoặc null nếu không đủ dữ liệu.
 */
export async function refreshCameraPrice(cam: Camera, kind: 'auto' | 'manual' = 'manual'): Promise<number | null> {
  const s = await getSettings();
  if (remainingQuota(s) <= 0) throw new PriceError(`Đã dùng hết ${s.monthlyQuota} lượt tra giá của tháng này`, true);

  const r: LookupResult = await callApi(s.priceToken, {
    brand: cam.brand, model: cam.model, type: cam.type, format: cam.format,
    condition: cam.condition, lenses: cam.lenses.map((l) => l.name)
  });
  if (r.compsniperUsed) await recordUsage(kind, !!r.compsniperExhausted);

  const key = modelKey(cam);
  const siblings = (await db.cameras.toArray()).filter((c) => !c.deletedAt && c.status === 'owned' && modelKey(c) === key);
  const targets = siblings.some((c) => c.id === cam.id) ? siblings : [cam, ...siblings];

  if (r.vnd.median == null) {
    const note = r.note || 'Chưa tìm được dữ liệu giá đủ tin cậy.';
    await Promise.all(targets.map((c) => patchCamera(c.id, { marketCheckedAt: Date.now(), marketNote: c.marketValue == null ? note : c.marketNote })));
    await applyToWishlist(key, r);
    return null;
  }
  for (const c of targets) {
    await addPrice(c.id, r.vnd.median, r.vnd.low, r.vnd.high, {
      source: 'auto', note: r.note, basis: r.basis, confidence: r.confidence, sources: r.sources, usdMedian: r.usd.median
    });
  }
  await applyToWishlist(key, r);
  return r.vnd.median;
}

/** Áp kết quả tra giá cho mọi mục wishlist cùng mẫu */
async function applyToWishlist(key: string, r: LookupResult, extra?: WishItem) {
  const items = (await db.wishlist.toArray()).filter((w) => !w.deletedAt && !w.acquiredAt && modelKey(w) === key);
  if (extra && !items.some((w) => w.id === extra.id)) items.push(extra);
  const now = Date.now();
  for (const w of items) {
    if (r.vnd.median == null) {
      await patchWish(w.id, { marketCheckedAt: now, marketNote: w.marketValue == null ? r.note || 'Chưa tìm được dữ liệu giá đủ tin cậy.' : w.marketNote });
    } else {
      await patchWish(w.id, {
        marketValue: r.vnd.median, marketLow: r.vnd.low, marketHigh: r.vnd.high, marketUpdatedAt: now, marketCheckedAt: now,
        marketNote: r.note ?? '', marketSources: r.sources ?? []
      });
    }
  }
}

/**
 * Tra giá cho một mục wishlist (1 lượt). Máy cùng mẫu đang có trong kho cũng được cập nhật theo.
 */
export async function refreshWishPrice(w: WishItem, kind: 'auto' | 'manual' = 'manual'): Promise<number | null> {
  const s = await getSettings();
  if (remainingQuota(s) <= 0) throw new PriceError(`Đã dùng hết ${s.monthlyQuota} lượt tra giá của tháng này`, true);
  const r: LookupResult = await callApi(s.priceToken, { brand: w.brand, model: w.model, type: w.type, format: '', condition: '', lenses: [] });
  if (r.compsniperUsed) await recordUsage(kind, !!r.compsniperExhausted);
  const key = modelKey(w);
  await applyToWishlist(key, r, w);
  if (r.vnd.median != null) {
    const owned = (await db.cameras.toArray()).filter((c) => !c.deletedAt && c.status === 'owned' && modelKey(c) === key);
    for (const c of owned) {
      await addPrice(c.id, r.vnd.median, r.vnd.low, r.vnd.high, {
        source: 'auto', note: r.note, basis: r.basis, confidence: r.confidence, sources: r.sources, usdMedian: r.usd.median
      });
    }
  }
  return r.vnd.median;
}

/* ---------- Hàng đợi ---------- */

interface QueueState { running: boolean; done: number; total: number; current: string; error: string | null }

let state: QueueState = { running: false, done: 0, total: 0, current: '', error: null };
let stopFlag = false;
const listeners = new Set<() => void>();
const emit = (patch: Partial<QueueState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export function usePriceQueue() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
export function stopPriceQueue() { stopFlag = true; }
export function clearPriceQueueError() { emit({ error: null }); }

/** Gom máy theo mẫu: mỗi mẫu chỉ tra 1 lần */
export function uniqueModels(cams: Camera[]) {
  const seen = new Set<string>();
  return cams.filter((c) => { const k = modelKey(c); if (seen.has(k)) return false; seen.add(k); return true; });
}

export async function runPriceQueue(cams: Camera[], opts: { silent?: boolean; kind?: 'auto' | 'manual'; max?: number } = {}) {
  if (state.running) return;
  const s = await getSettings();
  const list = uniqueModels(cams).slice(0, Math.min(opts.max ?? Infinity, remainingQuota(s)));
  if (!list.length) {
    if (!opts.silent && cams.length) emit({ error: `Đã dùng hết ${s.monthlyQuota} lượt tra giá của tháng này` });
    return;
  }
  stopFlag = false;
  emit({ running: true, done: 0, total: list.length, current: '', error: null });
  for (const cam of list) {
    if (stopFlag) break;
    emit({ current: `${cam.brand} ${cam.model}` });
    try {
      await refreshCameraPrice(cam, opts.kind ?? 'manual');
    } catch (e) {
      if (e instanceof PriceError && e.fatal) { stopFlag = true; if (!opts.silent) emit({ error: e.message }); break; }
      await patchCamera(cam.id, { marketCheckedAt: Date.now() });
    }
    emit({ done: state.done + 1 });
  }
  emit({ running: false, current: '' });
}

/**
 * Tự tra khi mở app, tiết kiệm lượt:
 *  - Máy mới chưa có giá: tra ngay (trong hạn mức tự động của tháng).
 *  - Máy đã có giá: chỉ tra lại khi cũ hơn chu kỳ, và tối đa vài máy mỗi ngày để rải đều cả tháng.
 *  - Máy đã tra mà không đủ dữ liệu: 90 ngày sau mới thử lại.
 *  - Máy cùng mẫu dùng chung 1 lượt.
 */
export async function autoRefreshStale() {
  const s = await getSettings();
  if (!s.autoPrice || !navigator.onLine) return;
  const u = normalizeUsage(s.priceUsage);
  const autoLeft = Math.min(Math.max(0, s.autoBudget - u.auto), remainingQuota(s));
  if (autoLeft <= 0) return;

  const now = Date.now();
  const owned = (await db.cameras.toArray()).filter((c) => !c.deletedAt && c.status === 'owned');
  const fresh = uniqueModels(owned.filter((c) => c.marketValue == null && !c.marketCheckedAt));
  const stale = uniqueModels(owned.filter((c) => {
    if (!c.marketCheckedAt) return false;
    if (c.marketValue == null) return now - c.marketCheckedAt > 90 * DAY;
    return now - (c.marketUpdatedAt ?? c.marketCheckedAt) > s.autoPriceDays * DAY;
  })).sort((a, b) => (a.marketUpdatedAt ?? a.marketCheckedAt ?? 0) - (b.marketUpdatedAt ?? b.marketCheckedAt ?? 0));

  const dailyCap = Math.max(1, Math.ceil(s.autoBudget / 30));
  const staleToday = stale.slice(0, Math.max(0, dailyCap - u.dayAuto));
  const list = [...fresh, ...staleToday].slice(0, autoLeft);
  if (list.length) await runPriceQueue(list, { silent: true, kind: 'auto' });

  // Wishlist: mẫu chưa có trong kho (mẫu đã có thì giá được cập nhật cùng máy trong kho)
  const s2 = await getSettings();
  const u2 = normalizeUsage(s2.priceUsage);
  let left = Math.min(Math.max(0, s2.autoBudget - u2.auto), remainingQuota(s2));
  let todayLeft = Math.max(0, dailyCap - u2.dayAuto);
  if (left <= 0) return;
  const ownedKeys = new Set(owned.map(modelKey));
  const seen = new Set<string>();
  const wish = (await db.wishlist.toArray())
    .filter((w) => !w.deletedAt && !w.acquiredAt && w.model && !ownedKeys.has(modelKey(w)))
    .filter((w) => { const k = modelKey(w); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.priority - b.priority);
  for (const w of wish) {
    if (left <= 0) break;
    const isFresh = !w.marketCheckedAt;
    const isStale = !isFresh && (w.marketValue == null ? now - w.marketCheckedAt! > 90 * DAY : now - (w.marketUpdatedAt ?? w.marketCheckedAt!) > s2.autoPriceDays * DAY);
    if (!isFresh && !(isStale && todayLeft > 0)) continue;
    try { await refreshWishPrice(w, 'auto'); } catch (e) { if (e instanceof PriceError && e.fatal) break; await patchWish(w.id, { marketCheckedAt: Date.now() }); }
    left--; if (!isFresh) todayLeft--;
  }
}

/** Ước lượng số lượt tự động mỗi tháng với bộ sưu tập hiện tại */
export function estimateMonthlyAuto(cams: Camera[], cycleDays: number) {
  const n = uniqueModels(cams.filter((c) => c.status === 'owned' && !c.deletedAt)).length;
  return Math.ceil((n * 30) / cycleDays);
}
