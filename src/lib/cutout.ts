import { useEffect, useState } from 'react';
import { db } from '../db';
import { HQ_ID, hqModel } from './modelStore';
import type { InMsg, ModelSpec, OutMsg } from '../workers/cutout.worker';

/* ======================================================================
 * Tách nền ảnh máy ngay trên điện thoại (ảnh không gửi đi đâu).
 *  - ISNet (~179 MB, Apache-2.0): chất lượng cao, người dùng tải một lần ở Cài đặt.
 *  - U²-Net bản nhỏ (u2netp, ~4,6 MB, Apache-2.0): dùng tạm khi chưa tải ISNet.
 * Mô hình chạy trong Web Worker (CPU, WebAssembly) nên giao diện không bị đơ.
 * Kết quả (PNG nền trong suốt, cắt sát chủ thể) lưu trong bảng cutouts theo id ảnh,
 * kèm nhãn mô hình; khi có ISNet, ảnh tách bằng mô hình nhỏ sẽ được tách lại.
 * ====================================================================== */

interface Engine { tag: string; spec: ModelSpec; curve: [number, number]; worker: Worker; backend: string; next: number; waiting: Map<number, { ok: (m: Float32Array) => void; fail: (e: Error) => void }> }

const SMALL: { tag: string; spec: ModelSpec; curve: [number, number] } = { tag: 'u2netp-2', spec: { size: 320, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] }, curve: [0.35, 0.4] };
const hqTag = (version: number) => `isnet-${version}d`;
const HQ = (version: number) => ({ tag: hqTag(version), spec: { size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1] }, curve: [0.4, 0.3] as [number, number] });

let engineP: Promise<Engine> | null = null;

function startWorker(model: ArrayBuffer | string, spec: ModelSpec): Promise<{ worker: Worker; backend: string }> {
  const worker = new Worker(new URL('../workers/cutout.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<OutMsg>) => {
      if (e.data.type === 'loaded') resolve({ worker, backend: e.data.backend });
      else if (e.data.type === 'error') { worker.terminate(); reject(new Error(e.data.message)); }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'worker')); };
    const msg: InMsg = { type: 'load', model, spec };
    worker.postMessage(msg, typeof model === 'string' ? [] : [model]);
  });
}

function engine(): Promise<Engine> {
  if (!engineP) {
    engineP = (async () => {
      const hq = await hqModel();
      let base = SMALL;
      let started: { worker: Worker; backend: string } | null = null;
      if (hq) {
        try {
          base = HQ(hq.version);
          started = await startWorker(await hq.blob.arrayBuffer(), base.spec);
        } catch {
          base = SMALL; started = null; // máy không đủ bộ nhớ / không chạy được → dùng mô hình nhỏ
        }
      }
      if (!started) started = await startWorker(new URL('/models/u2netp.onnx', location.origin).href, SMALL.spec);
      const eng: Engine = { ...base, ...started, next: 1, waiting: new Map() };
      eng.worker.onmessage = (e: MessageEvent<OutMsg>) => {
        const m = e.data;
        if (m.type === 'result') { eng.waiting.get(m.id)?.ok(m.mask); eng.waiting.delete(m.id); }
        else if (m.type === 'error' && m.id != null) { eng.waiting.get(m.id)?.fail(new Error(m.message)); eng.waiting.delete(m.id); }
      };
      return eng;
    })();
    engineP.catch(() => { engineP = null; });
  }
  return engineP;
}

/** Đổi mô hình (sau khi tải / xoá ISNet): dừng worker cũ, lần sau tạo lại */
export async function resetCutoutEngine() {
  const old = engineP;
  engineP = null;
  memory.clear();
  try { (await old)?.worker.terminate(); } catch { /* */ }
}

/** Bắt đầu nạp sẵn mô hình (khi mở bảng chia sẻ) */
export function warmCutout() { engine().catch(() => {}); }

/** Mô hình đang dùng + chạy bằng GPU hay CPU */
export async function cutoutEngineInfo() {
  const e = await engine();
  return { hq: e.tag.startsWith('isnet'), backend: e.backend };
}

function runMask(e: Engine, rgba: Uint8ClampedArray): Promise<Float32Array> {
  return new Promise((ok, fail) => {
    const id = e.next++;
    e.waiting.set(id, { ok, fail });
    const msg: InMsg = { type: 'run', id, rgba };
    e.worker.postMessage(msg, [rgba.buffer]);
  });
}

const memory = new Map<string, Promise<HTMLCanvasElement | null>>();

/**
 * Ảnh tách nền của một ảnh. key = id ảnh (để lưu lại); null nếu không tách được
 * (mô hình không chạy được, hoặc kết quả trông không giống một vật thể).
 */
export function cutout(img: HTMLImageElement, key?: string): Promise<HTMLCanvasElement | null> {
  if (key && memory.has(key)) return memory.get(key)!;
  const job = (async () => {
    const hq = await hqModel();
    if (key) {
      const row = await db.cutouts.get(key).catch(() => undefined);
      // ảnh đã tách: dùng lại, trừ khi đã có mô hình tốt hơn / bản tách mới hơn
      if (row && (hq ? row.v === hqTag(hq.version) : row.v === SMALL.tag)) return blobToCanvas(row.blob);
    }
    const e = await engine().catch(() => null);
    if (!e) return null;
    const out = await run(e, img).catch(() => null);
    if (out && key) {
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
      if (blob) await db.cutouts.put({ id: key, blob, v: e.tag }).catch(() => {});
    }
    return out;
  })();
  if (key) { memory.set(key, job); job.then((v) => { if (!v) memory.delete(key); }); }
  return job;
}

async function blobToCanvas(blob: Blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close?.();
  return c;
}

async function run(e: Engine, img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  const S = e.spec.size;
  // 1. Ảnh vào: kéo về S×S
  const inp = document.createElement('canvas');
  inp.width = S; inp.height = S;
  const ic = inp.getContext('2d', { willReadFrequently: true })!;
  ic.drawImage(img, 0, 0, S, S);
  const pred = await runMask(e, ic.getImageData(0, 0, S, S).data);

  // 2. Mặt nạ: chuẩn hoá 0..1, làm gắt mép (bỏ vùng mờ như bàn tay nhoè)
  let lo = Infinity, hi = -Infinity;
  for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  const [c0, cw] = e.curve;
  const mask = document.createElement('canvas');
  mask.width = S; mask.height = S;
  const mc = mask.getContext('2d')!;
  const md = mc.createImageData(S, S);
  let covered = 0;
  for (let i = 0; i < S * S; i++) {
    const v = (pred[i] - lo) / span;
    const a = Math.max(0, Math.min(1, (v - c0) / cw));
    if (a > 0.5) covered++;
    md.data[i * 4 + 3] = Math.round(a * 255);
  }
  covered -= keepMainBlobs(md.data, S);
  mc.putImageData(md, 0, 0);
  const ratio = covered / (S * S);
  if (ratio < 0.02 || ratio > 0.92) return null; // không thấy vật thể rõ ràng

  // 3. Áp mặt nạ lên ảnh (tối đa 1400px cạnh dài)
  const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * scale), H = Math.round(img.naturalHeight * scale);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const oc = out.getContext('2d', { willReadFrequently: true })!;
  oc.drawImage(img, 0, 0, W, H);
  oc.globalCompositeOperation = 'destination-in';
  oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
  oc.drawImage(mask, 0, 0, W, H);
  oc.globalCompositeOperation = 'source-over';

  // 4. Cắt sát chủ thể
  const a = oc.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (a[(y * W + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = Math.round(Math.max(W, H) * 0.01);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W, x1 + pad); y1 = Math.min(H, y1 + pad);
  const crop = document.createElement('canvas');
  crop.width = x1 - x0; crop.height = y1 - y0;
  crop.getContext('2d')!.drawImage(out, x0, y0, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return crop;
}

/**
 * Bỏ các mảng rời nhỏ (đồ vật lặt vặt phía sau), chỉ giữ mảng lớn nhất và các mảng
 * đáng kể khác (vd. đèn flash đặt cạnh máy). Trả về số điểm ảnh đã bỏ.
 */
function keepMainBlobs(px: Uint8ClampedArray, S: number) {
  const n = S * S;
  const label = new Int32Array(n);
  const sizes: number[] = [0];
  const queue = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (label[i] || px[i * 4 + 3] < 128) continue;
    const id = sizes.length;
    let head = 0, tail = 0, count = 0;
    queue[tail++] = i; label[i] = id;
    while (head < tail) {
      const j = queue[head++]; count++;
      const x = j % S, y = (j / S) | 0;
      const nb = [x > 0 ? j - 1 : -1, x < S - 1 ? j + 1 : -1, y > 0 ? j - S : -1, y < S - 1 ? j + S : -1];
      for (const k of nb) if (k >= 0 && !label[k] && px[k * 4 + 3] >= 128) { label[k] = id; queue[tail++] = k; }
    }
    sizes.push(count);
  }
  const big = Math.max(0, ...sizes);
  // vùng giữ lại = các mảng đủ lớn, nới rộng vài điểm để giữ mép mờ cho mượt
  let keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] && sizes[label[i]] >= big * 0.3) keep[i] = 1;
  for (let pass = 0; pass < Math.max(2, Math.round(S / 160)); pass++) {
    const next = keep.slice();
    for (let i = 0; i < n; i++) {
      if (keep[i]) continue;
      const x = i % S;
      if ((x > 0 && keep[i - 1]) || (x < S - 1 && keep[i + 1]) || (i >= S && keep[i - S]) || (i < n - S && keep[i + S])) next[i] = 1;
    }
    keep = next;
  }
  let removed = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i] && px[i * 4 + 3] > 0) { if (px[i * 4 + 3] >= 128) removed++; px[i * 4 + 3] = 0; }
  }
  return removed;
}

/* ---------- Tách nền sẵn cho mọi ảnh bìa (chạy nền, từng ảnh một) ---------- */

export interface PrecutState { running: boolean; done: number; total: number }
let pre: PrecutState = { running: false, done: 0, total: 0 };
let stopFlag = false;
const preListeners = new Set<() => void>();
const setPre = (p: PrecutState) => { pre = p; preListeners.forEach((l) => l()); };

/** Đếm ảnh bìa đã tách bằng ISNet / tổng số */
export async function precutCounts() {
  const cams = await db.cameras.filter((c) => !c.deletedAt && c.status === 'owned' && !!c.coverPhotoId).toArray();
  const ids = cams.map((c) => c.coverPhotoId!);
  const rows = await db.cutouts.bulkGet(ids);
  const hq = await hqModel();
  const done = hq ? rows.filter((r) => r?.v === hqTag(hq.version)).length : 0;
  return { done, total: ids.length, ids };
}

export async function precutAll() {
  const hq = await hqModel();
  if (pre.running || !hq) return;
  stopFlag = false;
  const { ids, done, total } = await precutCounts();
  setPre({ running: true, done, total });
  let n = done;
  for (const id of ids) {
    if (stopFlag) break;
    const row = await db.cutouts.get(id);
    if (row?.v === hqTag(hq.version)) continue;
    while (document.hidden && !stopFlag) await new Promise((r) => setTimeout(r, 2000));
    const p = await db.photos.get(id);
    if (p?.blob) {
      const url = URL.createObjectURL(p.blob);
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        await cutout(img, id);
      } catch { /* bỏ qua ảnh lỗi */ } finally { URL.revokeObjectURL(url); }
    }
    n++;
    setPre({ running: true, done: n, total });
  }
  setPre({ running: false, done: n, total });
}

export function stopPrecut() { stopFlag = true; }

export function usePrecut() {
  const [s, setS] = useState(pre);
  useEffect(() => { const l = () => setS(pre); preListeners.add(l); return () => { preListeners.delete(l); }; }, []);
  return s;
}

export { HQ_ID };
