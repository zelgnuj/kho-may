import Papa from 'papaparse';
import { blankCamera, db, type Camera, type Currency, uid } from '../db';
import { guessType } from './catalog';
import { blobToDataURL, dataURLToBlob } from './images';

export type ImportSource = 'camdex' | 'khomay' | 'unknown';

export interface ImportRow {
  camera: Camera;
  /** Ống kính đoán được từ ghi chú — cần người dùng xác nhận */
  lensFromNotes?: string;
  duplicate: boolean;
}

export interface ImportPreview {
  source: ImportSource;
  rows: ImportRow[];
  fileName: string;
}

const CURRENCIES: Currency[] = ['VND', 'JPY', 'USD'];

const LENS_LIKE = /^\s*[A-Za-zÀ-ỹ][\w\-. ]{0,30}\d{1,3}(-\d{1,3})?\s?mm\s*f\/?\s?\d+(\.\d+)?\s*$/i;

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function fromCamDex(r: Record<string, string>): ImportRow {
  const c = blankCamera();
  c.brand = str(r.brand);
  c.model = str(r.name);
  const digital = /digital/i.test(str(r.groupName)) || str(r.medium).toLowerCase() === 'digital';
  if (digital) {
    c.type = 'DIG';
    c.format = 'Digital';
  } else {
    const g = guessType(c.brand, c.model);
    c.type = g.type;
    c.format = g.format ?? (str(r.filmFormat) || '35mm');
  }
  c.status = str(r.status).toLowerCase() === 'sold' ? 'sold' : 'owned';
  c.serial = str(r.serialNumber);
  c.mount = str(r.lensMount);
  c.year = num(r.manufactureYearStart);
  c.purchasePrice = num(r.purchasePrice);
  const cur = str(r.currency).toUpperCase() as Currency;
  c.purchaseCurrency = CURRENCIES.includes(cur) ? cur : 'VND';

  let notes = str(r.notes);
  const date = notes.match(/Purchase date:\s*(\d{4}-\d{2}-\d{2})/i);
  if (date) c.purchaseDate = date[1];
  const via = notes.match(/Purchased via\s+([^;.,\n]+)/i);
  if (via) c.purchaseFrom = via[1].trim();
  c.notes = notes;

  const lensName = [str(r.lensBrand), str(r.lensModel)].filter(Boolean).join(' ');
  if (lensName) c.lenses = [{ name: lensName }];

  let lensFromNotes: string | undefined;
  if (!lensName && LENS_LIKE.test(notes)) {
    lensFromNotes = notes.trim();
    notes = '';
  }
  return { camera: c, lensFromNotes, duplicate: false };
}

function fromKhoMay(r: Record<string, string>): ImportRow {
  const c = blankCamera();
  if (str(r.id)) c.id = str(r.id);
  c.brand = str(r.brand);
  c.model = str(r.model);
  c.type = (str(r.type) as Camera['type']) || guessType(c.brand, c.model).type;
  c.format = str(r.format) || '35mm';
  c.mount = str(r.mount);
  c.serial = str(r.serial);
  c.year = num(r.year);
  c.condition = str(r.condition);
  c.status = str(r.status) === 'sold' ? 'sold' : 'owned';
  c.purchasePrice = num(r.purchasePrice);
  const cur = str(r.purchaseCurrency).toUpperCase() as Currency;
  c.purchaseCurrency = CURRENCIES.includes(cur) ? cur : 'VND';
  c.purchaseDate = str(r.purchaseDate);
  c.purchaseFrom = str(r.purchaseFrom);
  c.marketValue = num(r.marketValue);
  if (c.marketValue != null) c.marketUpdatedAt = Date.now();
  c.tags = str(r.tags) ? str(r.tags).split('|').map((t) => t.trim()).filter(Boolean) : [];
  c.notes = str(r.notes);
  c.film = str(r.filmStock) ? { stock: str(r.filmStock), loadedAt: str(r.filmLoadedAt) } : null;
  c.lenses = str(r.lenses) ? str(r.lenses).split('|').map((n) => ({ name: n.trim() })).filter((l) => l.name) : [];
  return { camera: c, duplicate: false };
}

export async function parseCSVFile(file: File): Promise<ImportPreview> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' });
  const fields = parsed.meta.fields ?? [];
  let source: ImportSource = 'unknown';
  if (fields.includes('name') && fields.includes('brand') && (fields.includes('groupName') || fields.includes('filmFormat'))) source = 'camdex';
  else if (fields.includes('brand') && fields.includes('model')) source = 'khomay';

  const rows =
    source === 'camdex' ? parsed.data.map(fromCamDex)
    : source === 'khomay' ? parsed.data.map(fromKhoMay)
    : [];

  const existing = await db.cameras.filter((c) => !c.deletedAt).toArray();
  const key = (c: Camera) => `${c.brand}|${c.model}|${c.serial}|${c.status}`.toLowerCase();
  const have = new Set(existing.map(key));
  const ids = new Set(existing.map((c) => c.id));
  rows.forEach((r) => {
    r.duplicate = have.has(key(r.camera)) || ids.has(r.camera.id);
  });
  return { source, rows: rows.filter((r) => r.camera.brand || r.camera.model), fileName: file.name };
}

export async function commitImport(rows: ImportRow[], opts: { lensFromNotes: boolean; skipDuplicates: boolean }) {
  const now = Date.now();
  const cams = rows
    .filter((r) => !(opts.skipDuplicates && r.duplicate))
    .map((r, i) => {
      const c: Camera = { ...r.camera, createdAt: now + i, updatedAt: now + i };
      if (r.lensFromNotes) {
        if (opts.lensFromNotes) {
          c.lenses = [...c.lenses, { name: r.lensFromNotes }];
          c.notes = '';
        } else {
          c.notes = r.lensFromNotes;
        }
      }
      return c;
    });
  await db.cameras.bulkPut(cams);
  const priced = cams.filter((c) => c.marketValue != null);
  if (priced.length) {
    await db.prices.bulkPut(priced.map((c) => ({ id: uid(), cameraId: c.id, date: now, value: c.marketValue! })));
  }
  return cams.length;
}

/* ---------- Xuất ---------- */

export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportCSV(cams: Camera[], opts: { purchase: boolean; serial: boolean }) {
  const rows = cams.map((c) => ({
    id: c.id,
    brand: c.brand,
    model: c.model,
    type: c.type,
    format: c.format,
    mount: c.mount,
    serial: opts.serial ? c.serial : '',
    year: c.year ?? '',
    condition: c.condition,
    status: c.status,
    purchasePrice: opts.purchase ? c.purchasePrice ?? '' : '',
    purchaseCurrency: opts.purchase ? c.purchaseCurrency : '',
    purchaseDate: opts.purchase ? c.purchaseDate : '',
    purchaseFrom: opts.purchase ? c.purchaseFrom : '',
    marketValue: c.marketValue ?? '',
    tags: c.tags.join('|'),
    lenses: c.lenses.map((l) => l.name).join('|'),
    filmStock: c.film?.stock ?? '',
    filmLoadedAt: c.film?.loadedAt ?? '',
    notes: c.notes
  }));
  const csv = '﻿' + Papa.unparse(rows);
  download(`kho-may-${stamp()}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

export async function exportJSON(includePhotos: boolean) {
  const [cameras, prices, service, settings] = await Promise.all([
    db.cameras.toArray(), db.prices.toArray(), db.service.toArray(), db.settings.toArray()
  ]);
  let photos: { id: string; cameraId: string; createdAt: number; data: string }[] = [];
  if (includePhotos) {
    const all = await db.photos.toArray();
    photos = await Promise.all(all.map(async (p) => ({ id: p.id, cameraId: p.cameraId, createdAt: p.createdAt, data: await blobToDataURL(p.blob) })));
  }
  const payload = { app: 'kho-may', version: 1, exportedAt: new Date().toISOString(), cameras, prices, service, settings, photos };
  download(`kho-may-saoluu-${stamp()}.json`, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
}

export async function restoreJSON(file: File): Promise<number> {
  const data = JSON.parse(await file.text());
  if (data?.app !== 'kho-may') throw new Error('File không phải bản sao lưu của Kho máy');
  const photos = await Promise.all(
    (data.photos ?? []).map(async (p: { id: string; cameraId: string; createdAt: number; data: string }) => ({
      id: p.id, cameraId: p.cameraId, createdAt: p.createdAt, blob: await dataURLToBlob(p.data)
    }))
  );
  await db.transaction('rw', [db.cameras, db.prices, db.service, db.settings, db.photos], async () => {
    await db.cameras.bulkPut(data.cameras ?? []);
    await db.prices.bulkPut(data.prices ?? []);
    await db.service.bulkPut(data.service ?? []);
    await db.settings.bulkPut(data.settings ?? []);
    if (photos.length) await db.photos.bulkPut(photos);
  });
  return (data.cameras ?? []).length;
}
