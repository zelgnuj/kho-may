import { useSyncExternalStore } from 'react';
import { addPrice, db, getSettings, patchCamera, type Camera, type PriceSource } from '../db';

export interface LookupResult {
  usd: { low: number | null; median: number | null; high: number | null };
  vnd: { low: number | null; median: number | null; high: number | null };
  basis: string;
  confidence: string;
  includes: string;
  note: string;
  sources: PriceSource[];
}

export class PriceError extends Error {
  constructor(message: string, public fatal: boolean) { super(message); }
}

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
    // 401/503/404: sai mã hoặc máy chủ chưa cấu hình → dừng cả hàng đợi
    const fatal = res.status === 401 || res.status === 503 || res.status === 404 || res.status === 405;
    throw new PriceError(data?.error ?? `Lỗi ${res.status}`, fatal);
  }
  return data;
}

export async function pingPriceApi(token: string): Promise<{ providers: string[]; protected: boolean }> {
  return callApi(token, { ping: true });
}

export async function lookupPrice(cam: Camera, token: string): Promise<LookupResult> {
  return callApi(token, {
    brand: cam.brand, model: cam.model, type: cam.type, format: cam.format,
    condition: cam.condition, lenses: cam.lenses.map((l) => l.name)
  });
}

/** Tra giá một máy và lưu kết quả. Trả về giá VNĐ hoặc null nếu không tìm được. */
export async function refreshCameraPrice(cam: Camera, token: string): Promise<number | null> {
  const r = await lookupPrice(cam, token);
  if (r.vnd.median == null) {
    await patchCamera(cam.id, { marketCheckedAt: Date.now(), marketNote: r.note || 'Chưa tìm được dữ liệu giá đủ tin cậy.' });
    return null;
  }
  await addPrice(cam.id, r.vnd.median, r.vnd.low, r.vnd.high, {
    source: 'auto', note: r.note, basis: r.basis, confidence: r.confidence, sources: r.sources, usdMedian: r.usd.median
  });
  return r.vnd.median;
}

/* ---------- Hàng đợi tự cập nhật ---------- */

interface QueueState {
  running: boolean;
  done: number;
  total: number;
  current: string;
  error: string | null;
}

let state: QueueState = { running: false, done: 0, total: 0, current: '', error: null };
let stopFlag = false;
const listeners = new Set<() => void>();
const emit = (patch: Partial<QueueState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export function usePriceQueue() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

export function stopPriceQueue() { stopFlag = true; }
export function clearPriceQueueError() { emit({ error: null }); }

export async function runPriceQueue(cams: Camera[], opts: { silent?: boolean } = {}) {
  if (state.running || !cams.length) return;
  const { priceToken } = await getSettings();
  stopFlag = false;
  emit({ running: true, done: 0, total: cams.length, current: '', error: null });
  let i = 0;
  const worker = async () => {
    while (!stopFlag && i < cams.length) {
      const cam = cams[i++];
      emit({ current: `${cam.brand} ${cam.model}` });
      try {
        await refreshCameraPrice(cam, priceToken);
      } catch (e) {
        if (e instanceof PriceError && e.fatal) { stopFlag = true; if (!opts.silent) emit({ error: e.message }); break; }
        await patchCamera(cam.id, { marketCheckedAt: Date.now() });
      }
      emit({ done: state.done + 1 });
    }
  };
  await Promise.all([worker(), worker()]);
  emit({ running: false, current: '' });
}

/** Gọi khi mở app: tự tra giá các máy đang có mà giá đã cũ */
export async function autoRefreshStale(limit = 30) {
  const s = await getSettings();
  if (!s.autoPrice || !navigator.onLine) return;
  const cutoff = Date.now() - s.autoPriceDays * 86400000;
  const stale = (await db.cameras.toArray())
    .filter((c) => !c.deletedAt && c.status === 'owned')
    .filter((c) => !c.marketCheckedAt || c.marketCheckedAt < cutoff)
    .sort((a, b) => (a.marketCheckedAt ?? 0) - (b.marketCheckedAt ?? 0))
    .slice(0, limit);
  await runPriceQueue(stale, { silent: true });
}
