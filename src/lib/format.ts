import type { CamType, Camera, Currency, LensSpec, Settings } from '../db';

export const TYPE_LABEL: Record<string, string> = {
  PNS: 'PNS', RF: 'Rangefinder', SLR: 'SLR', HALF: 'Half-frame', TLR: 'TLR',
  MF: 'Medium format', INST: 'Instant', DIG: 'Máy số', OTHER: 'Khác', '': 'Chưa phân loại'
};

export const TYPE_ORDER: CamType[] = ['PNS', 'RF', 'SLR', 'HALF', 'TLR', 'MF', 'INST', 'DIG', 'OTHER', ''];

export const FORMATS = ['35mm', '120', 'Instant', 'Khổ lớn', 'Digital'];

export const CONDITIONS = ['A', 'B+', 'B', 'C', 'D'];

export const CURRENCY_SYMBOL: Record<Currency, string> = { VND: 'đ', JPY: '¥', USD: '$' };

/** 84300000 -> "84,3" (triệu) */
export function trieu(vnd: number, digits = 1): string {
  const v = vnd / 1e6;
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r.toLocaleString('vi-VN', { maximumFractionDigits: digits });
}

export function trieuLabel(vnd: number | null | undefined): string {
  if (vnd == null) return '—';
  return `${trieu(vnd)} tr`;
}

export function money(amount: number, cur: Currency): string {
  if (cur === 'VND') return `${amount.toLocaleString('vi-VN')} đ`;
  if (cur === 'JPY') return `${amount.toLocaleString('vi-VN')} ¥`;
  return `$${amount.toLocaleString('en-US')}`;
}

/** Quy đổi sang VNĐ theo tỷ giá đang lưu. Trả null nếu chưa có tỷ giá. */
export function toVND(amount: number | null | undefined, cur: Currency, rates: Settings['rates']): number | null {
  if (amount == null) return null;
  if (cur === 'VND') return amount;
  const r = rates[cur];
  return r ? Math.round(amount * r) : null;
}

export function purchaseVND(c: Camera, rates: Settings['rates']) {
  return toVND(c.purchasePrice, c.purchaseCurrency, rates);
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysSince(iso: string): number {
  const t = new Date(iso + 'T00:00:00').getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

export function fullName(c: Pick<Camera, 'brand' | 'model'>) {
  return `${c.brand} ${c.model}`.trim();
}

/** Parse "4.800.000", "4,8tr", "4800000" -> số */
export function parseAmount(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s/g, '');
  if (!t) return null;
  const m = t.match(/^([\d.,]+)(tr|triệu|trieu|m|k|nghìn|ngàn)?$/);
  if (!m) return null;
  let num: number;
  const unit = m[2];
  if (unit) {
    num = parseFloat(m[1].replace(',', '.'));
    if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') num *= 1e3; else num *= 1e6;
  } else {
    num = parseFloat(m[1].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  }
  return Number.isFinite(num) ? num : null;
}

/** Số tiền VNĐ người dùng gõ: "4,5" hoặc "4.5" (< 100.000) được hiểu là triệu. */
export function parseVND(s: string): number | null {
  const n = parseAmount(s);
  if (n == null) return null;
  return Math.round(n < 100000 ? n * 1e6 : n);
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/* ---------- Ống kính ---------- */

const num = (v: number) => (Number.isInteger(v) ? String(v) : String(v).replace('.', ','));
const fnum = (v: number) => String(v); // khẩu độ giữ dấu chấm theo thói quen: f/2.8

export function isZoom(l?: LensSpec | null) {
  return !!(l && l.focal && l.focalMax && l.focalMax > l.focal);
}

/** "35mm f/2.8" · "38–80mm f/4.5–8" · null nếu chưa có */
export function lensLabel(l?: LensSpec | null): string | null {
  if (!l || l.kind !== 'fixed' || !l.focal) return null;
  const focal = isZoom(l) ? `${num(l.focal)}–${num(l.focalMax!)}mm` : `${num(l.focal)}mm`;
  if (!l.aperture) return focal;
  const ap = l.apertureMax && l.apertureMax !== l.aperture ? `f/${fnum(l.aperture)}–${fnum(l.apertureMax)}` : `f/${fnum(l.aperture)}`;
  return `${focal} ${ap}`;
}
