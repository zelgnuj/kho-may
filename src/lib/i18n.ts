import { en } from '../i18n/en';

/* ======================================================================
 * Đa ngôn ngữ (tiếng Việt / English)
 * - Chuỗi gốc trong code là tiếng Việt và cũng chính là khoá tra từ điển.
 * - tx('Đã thêm {0} máy', n) → "Added 2 cameras" khi đang dùng tiếng Anh.
 * - Đổi ngôn ngữ thì tải lại trang (đơn giản, chắc chắn mọi chữ đều đổi).
 * ====================================================================== */

export type Lang = 'vi' | 'en';

function detect(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'vi' || saved === 'en') return saved;
  } catch { /* trình duyệt chặn bộ nhớ */ }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? '') : '';
  return nav.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export const lang: Lang = detect();
export const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
if (typeof document !== 'undefined') document.documentElement.lang = lang;

/** Khoá chưa có bản dịch (để test phát hiện) */
export const missing = new Set<string>();

export function tx(key: string, ...args: unknown[]): string {
  let s = key;
  if (lang === 'en') {
    const hit = en[key];
    if (hit == null) missing.add(key); else s = hit;
  }
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : s;
}

export function setLang(l: Lang) {
  try { localStorage.setItem('lang', l); } catch { /* bỏ qua */ }
  location.reload();
}

if (typeof window !== 'undefined') (window as unknown as { __i18nMissing: Set<string> }).__i18nMissing = missing;

/** Số + đơn vị, có số ít/số nhiều cho tiếng Anh: plural(1, 'máy', 'camera', 'cameras') → "1 camera" */
export function plural(n: number, vi: string, one: string, many: string): string {
  return `${n.toLocaleString(locale)} ${lang === 'vi' ? vi : n === 1 ? one : many}`;
}
