import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Camera, type Photo, type PricePoint, type ServiceEntry, type Roll, type Setting, type WishItem } from '../db';
import { dataURLToBlob } from './images';

/* ======================================================================
 * Sao lưu đầy đủ: một file .zip gồm backup.json + thư mục photos/ (ảnh gốc, không mã hoá base64)
 * Khôi phục: gộp theo thời điểm sửa — bản nào mới hơn thì giữ, không bao giờ xoá dữ liệu đang có
 * ====================================================================== */

/** Không đưa vào bản sao lưu: mã bí mật và bộ nhớ đệm */
const SKIP_SETTING = (k: string) => k === 'priceToken' || k === 'contribToken' || k.startsWith('img:') || k === 'lastBackup' || k === 'backupSnooze';

export interface BackupInfo { at: number; fp: string; cameras: number; photos: number; bytes: number; wishlist?: number }

interface Payload {
  app: 'kho-may';
  version: number;
  exportedAt: string;
  cameras: Camera[];
  prices: PricePoint[];
  service: ServiceEntry[];
  settings: Setting[];
  wishlist?: WishItem[];
  rolls?: Roll[];
  photos: { id: string; cameraId: string; createdAt: number; file?: string; type?: string; data?: string }[];
}

/** Dấu vân tay dữ liệu: đổi khi có máy/ảnh/giá/nhật ký mới hoặc sửa */
export async function fingerprint() {
  const [cams, photos, prices, service, wish, rolls] = await Promise.all([db.cameras.toArray(), db.photos.count(), db.prices.count(), db.service.count(), db.wishlist.toArray(), db.rolls.toArray()]);
  const last = cams.reduce((m, c) => Math.max(m, c.updatedAt ?? 0), 0);
  const lastW = wish.reduce((m, w) => Math.max(m, w.updatedAt ?? 0), 0);
  const lastR = rolls.reduce((m, r) => Math.max(m, r.updatedAt ?? 0), 0);
  return `${cams.length}:${last}:${photos}:${prices}:${service}:${wish.length}:${lastW}:${rolls.length}:${lastR}`;
}

const ext = (t: string) => (t.includes('png') ? 'png' : t.includes('webp') ? 'webp' : t.includes('heic') ? 'heic' : 'jpg');
const day = () => new Date().toISOString().slice(0, 10);

/** Tạo file sao lưu (chưa lưu đi đâu) */
export async function buildBackup(): Promise<{ file: File; info: BackupInfo }> {
  const [cameras, prices, service, settings, photos, wishlist, rolls] = await Promise.all([
    db.cameras.toArray(), db.prices.toArray(), db.service.toArray(),
    db.settings.filter((s) => !SKIP_SETTING(s.key)).toArray(), db.photos.toArray(), db.wishlist.toArray(), db.rolls.toArray()
  ]);
  const files: Zippable = {};
  const photoMeta: Payload['photos'] = [];
  for (const p of photos) {
    const name = `photos/${p.id}.${ext(p.blob.type)}`;
    files[name] = [new Uint8Array(await p.blob.arrayBuffer()), { level: 0 }];
    photoMeta.push({ id: p.id, cameraId: p.cameraId, createdAt: p.createdAt, file: name, type: p.blob.type || 'image/jpeg' });
  }
  const payload: Payload = { app: 'kho-may', version: 2, exportedAt: new Date().toISOString(), cameras, prices, service, settings, wishlist, rolls, photos: photoMeta };
  files['backup.json'] = [strToU8(JSON.stringify(payload)), { level: 6 }];
  const zip = zipSync(files);
  const file = new File([zip], `camera-cabinet-saoluu-${day()}.zip`, { type: 'application/zip' });
  const live = cameras.filter((c) => !c.deletedAt).length;
  return { file, info: { at: Date.now(), fp: await fingerprint(), cameras: live, photos: photos.length, bytes: file.size, wishlist: wishlist.filter((w) => !w.deletedAt).length } };
}

export function canShareFile(file: File) {
  try { return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); } catch { return false; }
}

/** Mở bảng chia sẻ của hệ điều hành (iPhone: Lưu vào Tệp → iCloud Drive). Trả về false nếu người dùng huỷ */
export async function shareBackup(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: 'Sao lưu Camera Cabinet' });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw e;
  }
}

export function downloadBackup(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function markBackedUp(info: BackupInfo) {
  await db.settings.put({ key: 'lastBackup', value: info });
  await db.settings.delete('backupSnooze');
}

/* ---------- Đọc & khôi phục ---------- */

export interface RestorePlan {
  exportedAt: string;
  cameras: number;
  photos: number;
  payload: Payload;
  blobs: Map<string, Blob>;
}

/** Đọc file .zip (bản mới) hoặc .json (bản cũ) */
export async function readBackup(file: File): Promise<RestorePlan> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  let payload: Payload;
  const blobs = new Map<string, Blob>();
  if (isZip) {
    const entries = unzipSync(buf);
    if (!entries['backup.json']) throw new Error('File zip này không phải bản sao lưu của Camera Cabinet');
    payload = JSON.parse(strFromU8(entries['backup.json']));
    for (const p of payload.photos ?? []) {
      const data = p.file ? entries[p.file] : undefined;
      if (data) blobs.set(p.id, new Blob([data], { type: p.type || 'image/jpeg' }));
    }
  } else {
    try { payload = JSON.parse(new TextDecoder().decode(buf)); } catch { throw new Error('Không đọc được file này'); }
    for (const p of payload.photos ?? []) if (p.data) blobs.set(p.id, await dataURLToBlob(p.data));
  }
  if (payload?.app !== 'kho-may') throw new Error('File không phải bản sao lưu của Camera Cabinet');
  return { exportedAt: payload.exportedAt, cameras: (payload.cameras ?? []).filter((c) => !c.deletedAt).length, photos: blobs.size, payload, blobs };
}

export interface RestoreResult { added: number; updated: number; keptNewer: number; photos: number }

export async function applyRestore(plan: RestorePlan): Promise<RestoreResult> {
  const p = plan.payload;
  const r: RestoreResult = { added: 0, updated: 0, keptNewer: 0, photos: 0 };
  await db.transaction('rw', [db.cameras, db.prices, db.service, db.settings, db.photos, db.wishlist, db.rolls], async () => {
    for (const c of p.cameras ?? []) {
      const cur = await db.cameras.get(c.id);
      if (!cur) { await db.cameras.put(c); if (!c.deletedAt) r.added++; }
      else if ((c.updatedAt ?? 0) > (cur.updatedAt ?? 0)) { await db.cameras.put(c); r.updated++; }
      else if ((c.updatedAt ?? 0) < (cur.updatedAt ?? 0)) r.keptNewer++;
    }
    for (const r of p.rolls ?? []) {
      const cur = await db.rolls.get(r.id);
      if (!cur || (r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) await db.rolls.put(r);
    }
    for (const w of p.wishlist ?? []) {
      const cur = await db.wishlist.get(w.id);
      if (!cur || (w.updatedAt ?? 0) > (cur.updatedAt ?? 0)) await db.wishlist.put(w);
    }
    const addMissing = async <T extends { id: string }>(table: typeof db.prices | typeof db.service, rows: T[]) => {
      if (!rows.length) return;
      const have = new Set(await table.bulkGet(rows.map((x) => x.id)).then((xs) => xs.filter(Boolean).map((x) => x!.id)));
      await (table as unknown as { bulkPut: (r: T[]) => Promise<unknown> }).bulkPut(rows.filter((x) => !have.has(x.id)));
    };
    await addMissing(db.prices, p.prices ?? []);
    await addMissing(db.service, p.service ?? []);
    for (const s of p.settings ?? []) {
      if (SKIP_SETTING(s.key)) continue;
      if (!(await db.settings.get(s.key))) await db.settings.put(s);
    }
    const photoRows: Photo[] = [];
    for (const ph of p.photos ?? []) {
      const blob = plan.blobs.get(ph.id);
      if (blob && !(await db.photos.get(ph.id))) photoRows.push({ id: ph.id, cameraId: ph.cameraId, createdAt: ph.createdAt, blob });
    }
    if (photoRows.length) await db.photos.bulkPut(photoRows);
    r.photos = photoRows.length;
  });
  return r;
}

/* ---------- Bộ nhớ bền & lời nhắc ---------- */

export interface StorageState { persisted: boolean | null; usage: number | null; quota: number | null }

/** Xin trình duyệt đừng tự xoá dữ liệu của app khi máy thiếu dung lượng */
export async function ensurePersistent(): Promise<boolean | null> {
  const s = navigator.storage;
  if (!s?.persisted) return null;
  try {
    if (await s.persisted()) return true;
    return s.persist ? await s.persist() : false;
  } catch { return null; }
}

export async function storageState(): Promise<StorageState> {
  const s = navigator.storage;
  let persisted: boolean | null = null, usage: number | null = null, quota: number | null = null;
  try { persisted = s?.persisted ? await s.persisted() : null; } catch { /* trình duyệt không hỗ trợ */ }
  try { const e = s?.estimate ? await s.estimate() : null; usage = e?.usage ?? null; quota = e?.quota ?? null; } catch { /* như trên */ }
  return { persisted, usage, quota };
}

export const REMIND_OPTIONS = [7, 14, 30, 0] as const;
const DAY = 86400000;

export interface BackupStatus { last: BackupInfo | null; changed: boolean; daysSince: number | null; due: boolean; everyDays: number }

export async function backupStatus(): Promise<BackupStatus> {
  const [lastRow, everyRow, snoozeRow, cams] = await Promise.all([
    db.settings.get('lastBackup'), db.settings.get('backupEvery'), db.settings.get('backupSnooze'), db.cameras.filter((c) => !c.deletedAt).toArray()
  ]);
  const last = (lastRow?.value as BackupInfo | undefined) ?? null;
  const everyDays = (everyRow?.value as number | undefined) ?? 14;
  const snoozeUntil = (snoozeRow?.value as number | undefined) ?? 0;
  const fp = await fingerprint();
  const changed = last ? last.fp !== fp : cams.length > 0;
  const daysSince = last ? Math.floor((Date.now() - last.at) / DAY) : null;
  const oldest = cams.reduce((m, c) => Math.min(m, c.createdAt), Date.now());
  const ageOk = last ? Date.now() - last.at >= everyDays * DAY : Date.now() - oldest >= 2 * DAY;
  const due = everyDays > 0 && changed && ageOk && Date.now() > snoozeUntil;
  return { last, changed, daysSince, due, everyDays };
}

export function useBackupStatus() {
  return useLiveQuery(() => backupStatus(), []);
}

export async function snoozeBackup(days = 3) {
  await db.settings.put({ key: 'backupSnooze', value: Date.now() + days * DAY });
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
}
