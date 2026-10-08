import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';

export type CamType = 'PNS' | 'RF' | 'SLR' | 'HALF' | 'TLR' | 'MF' | 'INST' | 'DIG' | 'OTHER' | '';
export type Status = 'owned' | 'sold';
export type Currency = 'VND' | 'JPY' | 'USD';

export interface Lens { name: string }

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
  film?: { stock: string; loadedAt: string } | null;
  lenses: Lens[];
  coverPhotoId?: string | null;
  /** Giá thị trường mới nhất, VNĐ */
  marketValue?: number | null;
  marketLow?: number | null;
  marketHigh?: number | null;
  marketUpdatedAt?: number | null;
  /** Lần cuối app thử tự tra giá (kể cả khi không tìm được) */
  marketCheckedAt?: number | null;
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

class KhoMayDB extends Dexie {
  cameras!: Table<Camera, string>;
  photos!: Table<Photo, string>;
  prices!: Table<PricePoint, string>;
  service!: Table<ServiceEntry, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('kho-may');
    this.version(1).stores({
      cameras: 'id, brand, type, status, createdAt, updatedAt',
      photos: 'id, cameraId, createdAt',
      prices: 'id, cameraId, date',
      service: 'id, cameraId, date',
      settings: 'key'
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
    tags: [], notes: '', film: null, lenses: [], coverPhotoId: null,
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
  const cam = await db.cameras.get(photo.cameraId);
  if (cam?.coverPhotoId === photo.id) {
    const next = await db.photos.where('cameraId').equals(photo.cameraId).first();
    await patchCamera(photo.cameraId, { coverPhotoId: next?.id ?? null });
  }
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
  autoPriceDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  ownerName: '',
  accent: '#F2A33A',
  defaultView: 'grid',
  rates: { JPY: null, USD: null, updatedAt: null },
  priceToken: '',
  autoPrice: true,
  autoPriceDays: 30
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
