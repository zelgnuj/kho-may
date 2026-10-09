import { useSyncExternalStore } from 'react';
import type { CamType, LensSpec } from '../db';
import { db } from '../db';
import { applyContributions } from '../../scripts/catalog-merge.mjs';
import type { CatalogModel, Contribution, LensConfig } from './catalogTypes';

/* ======================================================================
 * Thư viện mẫu máy: tải file thư viện (gộp sẵn khi build) + đóng góp đang chờ trên máy
 * ====================================================================== */

let base: CatalogModel[] = [];
let models: CatalogModel[] = [];
let index = new Map<string, CatalogModel>();
let version = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const squash = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9μ]/g, '');

function rebuild(pending: Contribution[]) {
  models = pending.length ? applyContributions(base, pending) : base;
  index = new Map();
  for (const m of models) {
    index.set(squash(`${m.brand} ${m.model}`), m);
    m.aliases?.forEach((a) => {
      const k = squash(a);
      if (!index.has(k)) index.set(k, m);
      const withBrand = squash(`${m.brand} ${a}`);
      if (!index.has(withBrand)) index.set(withBrand, m);
    });
  }
  version++;
  listeners.forEach((l) => l());
}

export async function pendingContributions(): Promise<{ c: Contribution; syncedAt?: number }[]> {
  const row = await db.settings.get('catalogContrib');
  return (row?.value as { c: Contribution; syncedAt?: number }[] | undefined) ?? [];
}

export async function refreshCatalog() {
  const pending = (await pendingContributions()).map((p) => p.c);
  rebuild(pending);
}

export function loadCatalog() {
  if (!loading) {
    loading = (async () => {
      const mod = await import('../generated/catalog.json');
      base = (mod.default as { models: CatalogModel[] }).models;
      await refreshCatalog();
    })();
  }
  return loading;
}

/** Dùng trong component để vẽ lại khi thư viện tải xong / có đóng góp mới */
export function useCatalogVersion() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
}

export function catalogSize() { return models.length; }

export function getModel(id: string) { return models.find((m) => m.id === id) ?? null; }

/** Tìm mẫu theo hãng + tên (bỏ qua dấu cách, gạch nối, hoa/thường; hiểu tên khác) */
export function findModel(brand: string, model: string): CatalogModel | null {
  if (!model.trim()) return null;
  return index.get(squash(`${brand} ${model}`)) ?? index.get(squash(model)) ?? null;
}

const QUALITY_RANK: Record<string, number> = { community_reviewed: 0, manual_reviewed: 0, manufacturer_reviewed: 0, manufacturer_specs: 1, collection_reference: 2, manufacturer_history_partial: 2, metadata_only: 3 };

/** Gợi ý khi đang gõ: ưu tiên mẫu có thông số */
export function searchCatalog(q: string, limit = 5): CatalogModel[] {
  const k = squash(q);
  if (k.length < 2) return [];
  const hits: CatalogModel[] = [];
  for (const m of models) {
    if (squash(`${m.brand} ${m.model}`).includes(k) || squash(m.model).startsWith(k) || m.aliases?.some((a) => squash(a).includes(k))) hits.push(m);
    if (hits.length > 200) break;
  }
  return hits.sort((a, b) => (QUALITY_RANK[a.quality ?? ''] ?? 3) - (QUALITY_RANK[b.quality ?? ''] ?? 3)).slice(0, limit);
}

/* ---------- Từ thư viện → dữ liệu của app ---------- */

export function mainLens(m: CatalogModel): LensConfig | null {
  const cfgs = m.lens?.configurations ?? [];
  return cfgs.find((c) => c.role === 'taking_lens') ?? cfgs[0] ?? null;
}

export function catalogType(m: CatalogModel): CamType {
  if (m.media === 'digital' || m.camera_type === 'mirrorless') return 'DIG';
  const half = m.film?.frame_sizes_mm?.some((f) => f.mode === 'half_frame' || (f.width_mm === 24 && f.height_mm === 18) || (f.width_mm === 18 && f.height_mm === 24));
  switch (m.camera_type) {
    case 'compact': return half ? 'HALF' : 'PNS';
    case 'rangefinder': return half ? 'HALF' : 'RF';
    case 'slr': return m.film?.format === '120' ? 'MF' : 'SLR';
    case 'tlr': return 'TLR';
    case 'instant': return 'INST';
    default: return '';
  }
}

export function catalogFormat(m: CatalogModel): string | undefined {
  if (m.media === 'digital') return 'Digital';
  const f = m.film?.format;
  if (!f) return undefined;
  if (f === '135') return '35mm';
  if (f === '120') return '120';
  if (m.camera_type === 'instant') return 'Instant';
  return f;
}

export function catalogLensSpec(m: CatalogModel): LensSpec | null {
  if (m.lens?.kind === 'interchangeable') return { kind: 'interchangeable', focal: null, focalMax: null, aperture: null, apertureMax: null };
  const l = mainLens(m);
  if (!l?.focal_length_min_mm) return null;
  const zoom = l.focal_length_max_mm && l.focal_length_max_mm > l.focal_length_min_mm;
  return {
    kind: 'fixed',
    focal: l.focal_length_min_mm,
    focalMax: zoom ? l.focal_length_max_mm! : null,
    aperture: l.max_aperture_wide_f ?? null,
    apertureMax: zoom && l.max_aperture_tele_f && l.max_aperture_tele_f !== l.max_aperture_wide_f ? l.max_aperture_tele_f : null,
    auto: true
  };
}

/* ---------- Đoán loại máy / ống kính (thư viện trước, quy tắc tên sau) ---------- */

const RULES: [RegExp, CamType, string?][] = [
  [/yashica electro 35 mc/, 'PNS'],
  [/olympus xa$/, 'RF'],
  [/olympus xa ?[1-4]/, 'PNS'],
  [/olympus pen[ -]?(ee|eed|ees|ee-?\d|d|f|ft|fv|s|w|rapid)\b/, 'HALF'],
  [/canon demi|konica recorder|ricoh auto half|kodak ektar h35|yashica samurai/, 'HALF'],
  [/rolleiflex|rolleicord|yashica-?mat|yashica (124|635|d\b)|mamiya c(220|330)/, 'TLR', '120'],
  [/mamiya 7|mamiya 6\b|fuji(film)? gw|fuji(film)? gf670|bronica rf/, 'RF', '120'],
  [/pentax 67|pentax 6x7|pentax 645|mamiya (645|rb67|rz67)|hasselblad|bronica (etr|sq|gs)/, 'MF', '120'],
  [/polaroid|instax/, 'INST', 'Instant'],
  [/canon a35|canonet|yashica electro 35|olympus 35 ?(rc|sp|dc)|konica auto s|leica m|voigtl(ae|ä)nder bessa|minolta hi-?matic (7|9|e|f)\b|minolta cle/, 'RF'],
  [/olympus om[- ]?\d|minolta (x-?\d|xd|xg|srt|sr-?t)|canon (ae-?1|a-?1|f-?1|ftb|at-?1|av-?1|t50|t70|eos)|nikon (f\d|f\b|fm|fe|fa|em|fg|n\d)|pentax (k1000|me|mx|lx|spotmatic|kx|km|p30|program a|super a)|praktica|zenit|contax (rts|139|167|aria)/, 'SLR'],
  [/canon (mc|autoboy|sure shot|prima|af35)|chinon bellami|konica (c35 af|big mini|z-up)|nikon (af600|l35|35ti|28ti|zoom|lite touch)|olympus (oz|mju|μ|stylus|trip|af-?1|xa)|pentax (pc ?35|espio|zoom|iqzoom)|ricoh (ff|r1|r10|gr1|gr10|gr21)|contax t\d?|yashica t\d|fuji(film)? (klasse|natura|tiara)|minolta riva/, 'PNS']
];

export function guessType(brand: string, model: string): { type: CamType; format?: string } {
  const hit = findModel(brand, model);
  if (hit) {
    const t = catalogType(hit);
    if (t) return { type: t, format: catalogFormat(hit) };
  }
  const key = `${brand} ${model}`.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [re, type, format] of RULES) {
    if (re.test(key)) return { type, format };
  }
  return { type: '' };
}

/** Thông số ống kính liền cho các mẫu chưa có trong thư viện (chỉ ghi mẫu chắc chắn) */
const LENS_RULES: [RegExp, number, number][] = [
  [/konica c35 af2?\b/, 38, 2.8],
  [/contax t2$/, 38, 2.8],
  [/olympus trip 35$/, 40, 2.8]
];

export function defaultLensKind(type: string): LensSpec['kind'] {
  return type === 'SLR' || type === 'MF' ? 'interchangeable' : 'fixed';
}

export function guessLens(brand: string, model: string, type: string): LensSpec | null {
  if (defaultLensKind(type) === 'interchangeable') return null;
  const hit = findModel(brand, model);
  if (hit) {
    const spec = catalogLensSpec(hit);
    if (spec?.kind === 'fixed') return spec;
  }
  const key = `${brand} ${model}`.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [re, f, a] of LENS_RULES) {
    if (re.test(key)) return { kind: 'fixed', focal: f, aperture: a, focalMax: null, apertureMax: null, auto: true };
  }
  return null;
}
