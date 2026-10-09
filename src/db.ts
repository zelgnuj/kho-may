import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';

export type CamType = 'PNS' | 'RF' | 'SLR' | 'HALF' | 'TLR' | 'MF' | 'INST' | 'DIG' | 'OTHER' | '';
export type Status = 'owned' | 'sold';
export type Currency = 'VND' | 'JPY' | 'USD';

export interface Lens { name: string }

/** Thông số ống kính liền (PNS, rangefinder ống liền, half-frame, máy số…) */
export interface LensSpec {
  kind: 'fixed' | 'interchangeable';
  /** Tiêu cự (mm). Zoom: focal → focalMax */
  focal: number | null;
  focalMax: number | null;
  /** Khẩu độ lớn nhất (f/). Zoom: aperture ở góc rộng → apertureMax ở tele */
  aperture: number | null;
  apertureMax: number | null;
  /** Điền tự động từ thư viện mẫu máy (nên kiểm tra lại) */
  auto?: boolean;
}

/**
 * Mọi bản ghi đều có id (uuid), createdAt/updatedAt và deletedAt (xóa mềm)
 * để sau này đồng bộ lên tài khoản mà không phải đổi cấu trúc.
 */
export interface Camera {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  brand: string;
  model: string;
  type: CamType;
  format: string;
  mount: string;
  serial: string;
  year?: number | null;
  condition: string;
  status: Status;
  purchasePrice?: number | null;
  purchaseCurrency: Currency;
  purchaseDate: string;
  purchaseFrom: string;
  tags: string[];
  notes: string;
  /** Cuộn đang lắp (bản tóm tắt; chi tiết ở bảng rolls) */
  film?: { stock: string; loadedAt: string; rollId?: string; iso?: number | null; ei?: number | null } | null;
  lenses: Lens[];
  lens?: LensSpec | null;
  coverPhotoId?: string | null;
  /** Giá thị trường mới nhất, VNĐ */
  marketValue?: number | null;
  marketLow?: number | null;
  marketHigh?: number | null;
  marketUpdatedAt?: number | null;
  /** Lần cuối app thử tự tra giá (kể cả khi không tìm được) */
  marketCheckedAt?: number | null;
  /** Lần cuối mở trang chi tiết (dùng cho sắp xếp Đã xem gần đây) */
  lastViewedAt?: number | null;
  marketSource?: 'auto' | 'manual' | null;
  marketNote?: string;
  marketBasis?: string;
  marketConfidence?: string;
  marketSources?: PriceSource[];
}

export interface PriceSource { url: string; title: string }
export interface PriceMeta {
  source: 'auto' | 'manual';
  note?: string;
  basis?: string;
  confidence?: string;
  sources?: PriceSource[];
  usdMedian?: number | null;
}

export interface Photo { id: string; cameraId: string; blob: Blob; createdAt: number }
export interface PricePoint { id: string; cameraId: string; date: number; value: number; low?: number | null; high?: number | null; note?: string; meta?: PriceMeta }
export interface ServiceEntry { id: string; cameraId: string; date: string; text: string; cost?: string; createdAt: number }
export interface Setting { key: string; value: unknown }

/** Phiên bản đã đồng bộ của từng bản ghi (để biết cái gì cần đẩy lên / đã bị xoá) */
export interface SyncMeta { kind: string; id: string; ver: string }

/** 1 = rất muốn, 2 = muốn, 3 = để ngắm */
export type WishPriority = 1 | 2 | 3;
export interface WishItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  brand: string;
  model: string;
  type: CamType;
  priority: WishPriority;
  /** Giá muốn mua, VNĐ */
  targetPrice?: number | null;
  /** Tình trạng / phiên bản muốn (màu đen, còn hộp…) */
  wantNote: string;
  notes: string;
  links: { url: string; label?: string }[];
  marketValue?: number | null;
  marketLow?: number | null;
  marketHigh?: number | null;
  marketUpdatedAt?: number | null;
  marketCheckedAt?: number | null;
  marketNote?: string;
  marketSources?: PriceSource[];
  /** Đã mua được → máy trong kho */
  acquiredAt?: number | null;
  acquiredCameraId?: string | null;
}

class KhoMayDB extends Dexie {
  cameras!: Table<Camera, string>;
  photos!: Table<Photo, string>;
  prices!: Table<PricePoint, string>;
  service!: Table<ServiceEntry, string>;
  settings!: Table<Setting, string>;
  wishlist!: Table<WishItem, string>;
  rolls!: Table<Roll, string>;
  syncMeta!: Table<SyncMeta, [string, string]>;
  thumbs!: Table<{ id: string; blob: Blob }, string>;

  constructor() {
    super('kho-may');
    this.version(1).stores({
      cameras: 'id, brand, type, status, createdAt, updatedAt',
      photos: 'id, cameraId, createdAt',
      prices: 'id, cameraId, date',
      service: 'id, cameraId, date',
      settings: 'key'
    });
    this.version(2).stores({
      wishlist: 'id, createdAt, updatedAt, priority'
    });
    this.version(3).stores({
      rolls: 'id, cameraId, status, loadedAt, updatedAt'
    });
    this.version(4).stores({
      syncMeta: '[kind+id], kind'
    });
    // ảnh thu nhỏ: bộ nhớ đệm trên máy (không đồng bộ, không sao lưu, tự tạo lại khi thiếu)
    this.version(5).stores({
      thumbs: 'id'
    });
  }
}

export const db = new KhoMayDB();

export const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function blankCamera(): Camera {
  const now = Date.now();
  return {
    id: uid(), createdAt: now, updatedAt: now, deletedAt: null,
    brand: '', model: '', type: '', format: '35mm', mount: '', serial: '', year: null,
    condition: '', status: 'owned',
    purchasePrice: null, purchaseCurrency: 'VND', purchaseDate: '', purchaseFrom: '',
    tags: [], notes: '', film: null, lenses: [], lens: null, coverPhotoId: null,
    marketValue: null, marketLow: null, marketHigh: null, marketUpdatedAt: null
  };
}

export async function saveCamera(c: Camera) {
  await db.cameras.put({ ...c, updatedAt: Date.now() });
}

export async function patchCamera(id: string, patch: Partial<Camera>) {
  await db.cameras.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteCamera(id: string) {
  await patchCamera(id, { deletedAt: Date.now() });
}

export async function addPrice(cameraId: string, value: number, low?: number | null, high?: number | null, meta: PriceMeta = { source: 'manual' }) {
  const date = Date.now();
  await db.transaction('rw', db.prices, db.cameras, async () => {
    await db.prices.put({ id: uid(), cameraId, date, value, low, high, meta });
    await patchCamera(cameraId, {
      marketValue: value, marketLow: low ?? null, marketHigh: high ?? null, marketUpdatedAt: date, marketCheckedAt: date,
      marketSource: meta.source, marketNote: meta.note ?? '', marketBasis: meta.basis ?? '', marketConfidence: meta.confidence ?? '',
      marketSources: meta.sources ?? []
    });
  });
}

export async function addPhotos(cameraId: string, blobs: Blob[]) {
  const now = Date.now();
  const rows = blobs.map((blob, i) => ({ id: uid(), cameraId, blob, createdAt: now + i }));
  await db.photos.bulkPut(rows);
  const cam = await db.cameras.get(cameraId);
  if (cam && !cam.coverPhotoId && rows[0]) await patchCamera(cameraId, { coverPhotoId: rows[0].id });
}

export async function deletePhoto(photo: Photo) {
  await db.photos.delete(photo.id);
  await db.thumbs.delete(photo.id);
  const cam = await db.cameras.get(photo.cameraId);
  if (cam?.coverPhotoId === photo.id) {
    const next = await db.photos.where('cameraId').equals(photo.cameraId).first();
    await patchCamera(photo.cameraId, { coverPhotoId: next?.id ?? null });
  }
}

/* ---------- Cuộn film ---------- */

export type RollStatus = 'loaded' | 'shot' | 'developed';
export interface Roll {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  cameraId: string;
  stock: string;
  kind?: string;
  /** ISO hộp */
  iso?: number | null;
  /** ISO chụp (push/pull); trống = như ISO hộp */
  ei?: number | null;
  shots?: number | null;
  expired?: boolean;
  /** Chủ đề / chuyến đi */
  note: string;
  status: RollStatus;
  loadedAt: string;
  shotAt?: string;
  devAt?: string;
  lab?: string;
  devCost?: number | null;
  scansUrl?: string;
}

export async function loadRoll(cam: Camera, r: Omit<Roll, 'id' | 'createdAt' | 'updatedAt' | 'cameraId' | 'status'>) {
  const now = Date.now();
  const roll: Roll = { ...r, id: uid(), createdAt: now, updatedAt: now, cameraId: cam.id, status: 'loaded' };
  await db.transaction('rw', db.rolls, db.cameras, async () => {
    if (cam.film?.rollId) await db.rolls.update(cam.film.rollId, { status: 'shot', shotAt: todayISOLocal(), updatedAt: now });
    await db.rolls.put(roll);
    await patchCamera(cam.id, { film: { stock: roll.stock, loadedAt: roll.loadedAt, rollId: roll.id, iso: roll.iso ?? null, ei: roll.ei ?? null } });
  });
  return roll;
}

/** Chụp xong / tháo film: cuộn chuyển sang "chờ tráng" */
export async function finishRoll(cam: Camera, shotAt: string) {
  const now = Date.now();
  await db.transaction('rw', db.rolls, db.cameras, async () => {
    if (cam.film?.rollId) await db.rolls.update(cam.film.rollId, { status: 'shot', shotAt, updatedAt: now });
    await patchCamera(cam.id, { film: null });
  });
}

export async function patchRoll(id: string, patch: Partial<Roll>) {
  await db.rolls.update(id, { ...patch, updatedAt: Date.now() });
}

export function useRolls() {
  return useLiveQuery(() => db.rolls.filter((r) => !r.deletedAt).toArray(), []);
}

function todayISOLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Film đang lắp từ bản cũ (chưa có cuộn) → tạo cuộn tương ứng, chạy một lần */
export async function migrateFilmToRolls(guess?: (stock: string) => { iso: number | null; kind?: string }) {
  const cams = await db.cameras.filter((c) => !!c.film && !c.film.rollId).toArray();
  for (const c of cams) {
    const now = Date.now();
    const g = guess?.(c.film!.stock);
    const roll: Roll = { id: uid(), createdAt: now, updatedAt: now, cameraId: c.id, stock: c.film!.stock, iso: g?.iso ?? null, kind: g?.kind, note: '', status: 'loaded', loadedAt: c.film!.loadedAt || todayISOLocal() };
    await db.rolls.put(roll);
    await db.cameras.update(c.id, { film: { ...c.film!, rollId: roll.id, iso: roll.iso ?? null } });
  }
}

/* ---------- Wishlist ---------- */

export function blankWish(): WishItem {
  const now = Date.now();
  return { id: uid(), createdAt: now, updatedAt: now, brand: '', model: '', type: '', priority: 2, targetPrice: null, wantNote: '', notes: '', links: [] };
}

export async function saveWish(w: WishItem) {
  await db.wishlist.put({ ...w, updatedAt: Date.now() });
}

export async function patchWish(id: string, patch: Partial<WishItem>) {
  await db.wishlist.update(id, { ...patch, updatedAt: Date.now() });
}

export function useWishlist() {
  return useLiveQuery(() => db.wishlist.filter((w) => !w.deletedAt).toArray(), []);
}

/* ---------- Cài đặt ---------- */

export interface Settings {
  ownerName: string;
  accent: string;
  defaultView: 'grid' | 'list' | 'shelf';
  /** Số VNĐ cho 1 đơn vị ngoại tệ */
  rates: { JPY: number | null; USD: number | null; updatedAt: number | null };
  /** Mã truy cập cho /api/price (PRICE_TOKEN trên Vercel) */
  priceToken: string;
  autoPrice: boolean;
  /** Tra lại giá sau bao nhiêu ngày */
  autoPriceDays: number;
  /** Tổng lượt tra giá mỗi tháng (gói CompSniper) */
  monthlyQuota: number;
  /** Số lượt dành cho tự động mỗi tháng; phần còn lại để bạn tự bấm */
  autoBudget: number;
  priceUsage: { month: string; total: number; auto: number; day: string; dayAuto: number; exhausted: boolean };
  /** Mã đóng góp thư viện (CONTRIB_TOKEN trên Vercel) */
  contribToken: string;
  /** Tên hiển thị khi đóng góp */
  contribName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  ownerName: '',
  accent: '#F2A33A',
  defaultView: 'grid',
  rates: { JPY: null, USD: null, updatedAt: null },
  priceToken: '',
  autoPrice: true,
  autoPriceDays: 60,
  monthlyQuota: 100,
  autoBudget: 60,
  priceUsage: { month: '', total: 0, auto: 0, day: '', dayAuto: 0, exhausted: false },
  contribToken: '',
  contribName: ''
};

export function useSettings(): Settings {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  rows?.forEach((r) => { s[r.key] = r.value; });
  return s as unknown as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.settings.put({ key, value });
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => { s[r.key] = r.value; });
  return s as unknown as Settings;
}

/* ---------- Truy vấn ---------- */

export function useCameras() {
  return useLiveQuery(() => db.cameras.filter((c) => !c.deletedAt).toArray(), []);
}

/** Một lần: điền thông số ống kính liền cho các máy đã có từ thư viện mẫu máy */
export async function backfillLensSpecs(guess: (b: string, m: string, t: string) => LensSpec | null) {
  const done = await db.settings.get('lensBackfill3');
  if (done) return;
  const cams = await db.cameras.toArray();
  for (const c of cams) {
    // Bỏ qua máy đã có thông số do người dùng nhập; điền cho máy còn trống
    if (c.lens && (c.lens.focal != null || c.lens.kind === 'interchangeable') && !c.lens.auto) continue;
    if (c.lens?.focal != null) continue;
    const g = guess(c.brand, c.model, c.type);
    const kind = c.type === 'SLR' || c.type === 'MF' ? 'interchangeable' : 'fixed';
    await db.cameras.update(c.id, { lens: g ?? { kind, focal: null, focalMax: null, aperture: null, apertureMax: null } });
  }
  await db.settings.put({ key: 'lensBackfill3', value: true });
}
