import type { InferenceSession } from 'onnxruntime-web';
import { db } from '../db';

/* ======================================================================
 * Tách nền ảnh máy ngay trên điện thoại bằng mô hình U²-Net (bản nhỏ u2netp, ~4,6 MB,
 * giấy phép Apache-2.0). Chạy bằng onnxruntime-web (WebAssembly), không gửi ảnh đi đâu.
 * Lần đầu tải mô hình + thư viện (vài MB), sau đó nằm trong bộ nhớ đệm.
 * Kết quả (PNG nền trong suốt, đã cắt sát chủ thể) lưu trong bảng cutouts theo id ảnh.
 * ====================================================================== */

const VERSION = 2;
const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type Ort = typeof import('onnxruntime-web/wasm');
let loading: Promise<{ ort: Ort; s: InferenceSession }> | null = null;

function session() {
  if (!loading) {
    loading = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      const wasm = (await import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url')).default;
      ort.env.wasm.wasmPaths = { wasm };
      ort.env.wasm.numThreads = 1;
      const s = await ort.InferenceSession.create('/models/u2netp.onnx', { executionProviders: ['wasm'] });
      return { ort, s };
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/** Bắt đầu tải sẵn mô hình (khi mở bảng chia sẻ) */
export function warmCutout() { session().catch(() => {}); }

const memory = new Map<string, Promise<HTMLCanvasElement | null>>();

/**
 * Ảnh tách nền của một ảnh. key = id ảnh (để lưu lại); null nếu không tách được
 * (mô hình không tải được, hoặc kết quả trông không giống một vật thể).
 */
export function cutout(img: HTMLImageElement, key?: string): Promise<HTMLCanvasElement | null> {
  if (key && memory.has(key)) return memory.get(key)!;
  const job = (async () => {
    if (key) {
      const row = await db.cutouts.get(key).catch(() => undefined);
      if (row && row.v === VERSION) return blobToCanvas(row.blob);
    }
    const out = await run(img).catch(() => null);
    if (out && key) {
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
      if (blob) await db.cutouts.put({ id: key, blob, v: VERSION }).catch(() => {});
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

async function run(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  const { ort, s } = await session();

  // 1. Đầu vào 320×320, chuẩn hoá theo ImageNet
  const inp = document.createElement('canvas');
  inp.width = SIZE; inp.height = SIZE;
  const ic = inp.getContext('2d', { willReadFrequently: true })!;
  ic.drawImage(img, 0, 0, SIZE, SIZE);
  const px = ic.getImageData(0, 0, SIZE, SIZE).data;
  const data = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let ch = 0; ch < 3; ch++) data[ch * SIZE * SIZE + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
  }
  const res = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) });
  const pred = res[s.outputNames[0]].data as Float32Array;

  // 2. Mặt nạ: chuẩn hoá về 0..1, làm gắt mép một chút
  let lo = Infinity, hi = -Infinity;
  for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  const mask = document.createElement('canvas');
  mask.width = SIZE; mask.height = SIZE;
  const mc = mask.getContext('2d')!;
  const md = mc.createImageData(SIZE, SIZE);
  let covered = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = (pred[i] - lo) / span;
    const a = Math.max(0, Math.min(1, (v - 0.35) / 0.4));
    if (a > 0.5) covered++;
    md.data[i * 4 + 3] = Math.round(a * 255);
  }
  mc.putImageData(md, 0, 0);
  const ratio = covered / (SIZE * SIZE);
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
