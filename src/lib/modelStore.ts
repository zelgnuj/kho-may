import { useEffect, useState } from 'react';
import { db } from '../db';

/* ======================================================================
 * Model tách nền chất lượng cao (ISNet, ~179 MB) — người dùng chủ động tải một lần.
 * File được chia thành nhiều phần (dưới 50 MB/phần) để vừa giới hạn hosting,
 * tải tuần tự, ghép lại, kiểm tra dung lượng rồi lưu trong IndexedDB (bảng models).
 * ====================================================================== */

export const HQ_ID = 'isnet';
const BASE = '/models/isnet/';

export interface Manifest { name: string; version: number; size: number; sha256: string; parts: string[]; input: number; mean: number[]; std: number[] }

export type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; loaded: number; total: number }
  | { phase: 'verifying' }
  | { phase: 'error'; message: string };

let state: DownloadState = { phase: 'idle' };
let controller: AbortController | null = null;
const listeners = new Set<() => void>();
const emit = (s: DownloadState) => { state = s; listeners.forEach((l) => l()); };

export async function manifest(): Promise<Manifest> {
  const r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`manifest ${r.status}`);
  return r.json();
}

export async function hqModel() {
  return db.models.get(HQ_ID).catch(() => undefined);
}

export async function downloadHq(): Promise<boolean> {
  if (state.phase === 'downloading' || state.phase === 'verifying') return false;
  controller = new AbortController();
  try {
    const m = await manifest();
    emit({ phase: 'downloading', loaded: 0, total: m.size });
    const chunks: Uint8Array[] = [];
    let loaded = 0, lastEmit = 0;
    for (const part of m.parts) {
      const r = await fetch(BASE + part, { signal: controller.signal });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        if (loaded - lastEmit > m.size / 200) { lastEmit = loaded; emit({ phase: 'downloading', loaded, total: m.size }); }
      }
    }
    emit({ phase: 'verifying' });
    const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
    chunks.length = 0;
    // HTTPS đã đảm bảo toàn vẹn khi truyền; chỉ kiểm tra đủ dung lượng (băm 179 MB trên điện thoại tốn RAM)
    if (blob.size !== m.size) throw new Error('size');
    await db.models.put({ id: HQ_ID, blob, version: m.version, size: m.size, at: Date.now() });
    emit({ phase: 'idle' });
    return true;
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    emit(aborted ? { phase: 'idle' } : { phase: 'error', message: e instanceof Error ? e.message : String(e) });
    return false;
  } finally {
    controller = null;
  }
}

export function cancelDownload() { controller?.abort(); }

export async function deleteHq() { await db.models.delete(HQ_ID); }

export function useDownloadState() {
  const [s, setS] = useState(state);
  useEffect(() => { const l = () => setS(state); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return s;
}
