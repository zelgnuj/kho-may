import type { CamType, Camera, Currency, LensSpec, Settings } from '../db';
import { lang, locale, tx } from './i18n';

export const TYPE_LABEL: Record<string, string> = {
  PNS: 'PNS', RF: 'Rangefinder', SLR: 'SLR', HALF: 'Half-frame', TLR: 'TLR',
  MF: 'Medium format', INST: 'Instant', DIG: tx("Máy số"), OTHER: tx("Khác"), '': tx("Chưa phân loại")
};

export const TYPE_ORDER: CamType[] = ['PNS', 'RF', 'SLR', 'HALF', 'TLR', 'MF', 'INST', 'DIG', 'OTHER', ''];

export const FORMATS = ['35mm', '120', 'Instant', tx("Khổ lớn"), 'Digital'];

export const CONDITIONS = ['A', 'B+', 'B', 'C', 'D'];

export const CURRENCY_SYMBOL: Record<Currency, string> = { VND: lang === 'vi' ? 'đ' : '₫', JPY: '¥', USD: '$' };

/* ---------- Tiền hiển thị (giá trị lưu bằng VNĐ; hiển thị VNĐ hoặc USD) ---------- */

export type DisplayCurrency = 'VND' | 'USD';
let display: { cur: DisplayCurrency; usd: number | null } = { cur: lang === 'vi' ? 'VND' : 'USD', usd: null };

/** Gọi khi cài đặt đổi (App) */
export function setDisplayMoney(cur: DisplayCurrency | null | undefined, usdRate: number | null | undefined) {
  display = { cur: cur ?? (lang === 'vi' ? 'VND' : 'USD'), usd: usdRate ?? null };
}
/** Tiền đang hiển thị thực tế (USD cần có tỷ giá) */
export function displayCurrency(): DisplayCurrency { return display.cur === 'USD' && display.usd ? 'USD' : 'VND'; }
export function preferredCurrency(): DisplayCurrency { return display.cur; }

/** Tách giá trị thành phần đầu / số / đơn vị để hiển thị số lớn */
export function valueParts(vnd: number, digits = 1): { pre: string; num: string; unit: string } {
  if (displayCurrency() === 'USD') {
    const usd = vnd / display.usd!;
    return { pre: '$', num: Math.round(usd).toLocaleString('en-US'), unit: '' };
  }
  if (lang === 'vi') return { pre: '', num: trieu(vnd, digits), unit: 'tr' };
  return { pre: '₫', num: (Math.round((vnd / 1e6) * 10 ** digits) / 10 ** digits).toLocaleString('en-US', { maximumFractionDigits: digits }), unit: 'M' };
}

/** "84,3 tr" · "₫84.3M" · "$3,290" */
export function valueLabel(vnd: number | null | undefined, digits = 1): string {
  if (vnd == null) return '—';
  const p = valueParts(vnd, digits);
  return `${p.pre}${p.num}${p.unit ? (lang === 'vi' ? ' ' : '') + p.unit : ''}`;
}

/** Có dấu: "+3,2 tr" / "−$120" */
export function signedValue(vnd: number) {
  return `${vnd >= 0 ? '+' : '−'}${valueLabel(Math.abs(vnd))}`;
}

/** Số tiền người dùng gõ theo tiền đang hiển thị → VNĐ */
export function parseDisplayMoney(raw: string): number | null {
  const n = parseMoney(raw);
  if (n == null) return null;
  return displayCurrency() === 'USD' ? Math.round(n * display.usd!) : Math.round(n);
}

/** VNĐ → chuỗi để điền lại vào ô nhập theo tiền đang hiển thị */
export function formatDisplayInput(vnd: number | null | undefined): string {
  if (vnd == null) return '';
  if (displayCurrency() === 'USD') return String(Math.round(vnd / display.usd!));
  return String(vnd);
}

/** 84300000 -> "84,3" (triệu) */
export function trieu(vnd: number, digits = 1): string {
  const v = vnd / 1e6;
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r.toLocaleString(locale, { maximumFractionDigits: digits });
}

/** @deprecated dùng valueLabel */
export function trieuLabel(vnd: number | null | undefined): string {
  return valueLabel(vnd);
}

export function money(amount: number, cur: Currency): string {
  if (cur === 'VND') return lang === 'vi' ? `${amount.toLocaleString('vi-VN')} đ` : `₫${amount.toLocaleString('en-US')}`;
  if (cur === 'JPY') return lang === 'vi' ? `${amount.toLocaleString('vi-VN')} ¥` : `¥${amount.toLocaleString('en-US')}`;
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
  if (!(d && m && y)) return iso;
  if (lang === 'vi') return `${d}/${m}/${y}`;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTs(ts: number): string {
  const d = new Date(ts);
  if (lang !== 'vi') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

/** Ô nhập tiền: chuỗi gốc (chỉ số, USD có thể có ".") → số. Gõ bao nhiêu hiểu bấy nhiêu, không tự nhân triệu. */
export function parseMoney(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && raw !== '.' ? n : null;
}

/** Chuẩn hoá thứ người dùng gõ/dán vào ô tiền về chuỗi gốc. "4,5tr" / "3.200.000 đ" / "120,50" ($) đều được. */
export function normalizeMoneyInput(s: string, cur: Currency): string {
  const t = s.trim().toLowerCase();
  if (/(tr|triệu|trieu|k|nghìn|ngàn)\s*$/.test(t)) {
    const n = parseAmount(t.replace(/[đ₫$¥]/g, ''));
    if (n != null) return String(cur === 'USD' ? n : Math.round(n));
  }
  if (cur !== 'USD') return t.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  // USD: không nhóm nghìn, dấu phẩy hay chấm đều là dấu thập phân, tối đa 2 số lẻ
  const m = t.replace(/[^\d.,]/g, '').replace(',', '.');
  const [i, ...rest] = m.split('.');
  const int = i.replace(/^0+(?=\d)/, '');
  return rest.length ? `${int || '0'}.${rest.join('').slice(0, 2)}` : int;
}

/** Chuỗi gốc → hiển thị trong ô: 3200000 → "3.200.000" (vi) / "3,200,000" (en). USD giữ nguyên. */
export function formatMoneyInput(raw: string, cur: Currency): string {
  if (!raw || cur === 'USD') return raw;
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'vi' ? '.' : ',');
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

const num = (v: number) => (Number.isInteger(v) || lang !== 'vi' ? String(v) : String(v).replace('.', ','));
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
