/* Thư viện film phổ biến. ISO là ISO hộp; formats: khổ có bán. */

export type FilmKind = 'color' | 'bw' | 'slide' | 'cine' | 'instant';
export type FilmFormat = '135' | '120' | 'instax-mini' | 'instax-wide' | 'instax-square' | 'polaroid-600' | 'polaroid-i' | 'polaroid-sx70';

export interface FilmStock { name: string; brand: string; iso: number; kind: FilmKind; formats: FilmFormat[]; shots?: number; note?: string }

export const KIND_LABEL: Record<FilmKind, string> = { color: 'Màu', bw: 'Đen trắng', slide: 'Dương bản', cine: 'Cine', instant: 'Instant' };
export const KIND_DEV: Record<FilmKind, string> = { color: 'C-41', bw: 'Đen trắng', slide: 'E-6', cine: 'C-41 (đã bỏ lớp remjet) / ECN-2', instant: 'Tự hiện' };

const B = (brand: string, list: [string, number, FilmKind, FilmFormat[], string?][]): FilmStock[] =>
  list.map(([name, iso, kind, formats, note]) => ({ name, brand, iso, kind, formats, note }));

export const FILM_STOCKS: FilmStock[] = [
  ...B('Kodak', [
    ['Portra 160', 160, 'color', ['135', '120']],
    ['Portra 400', 400, 'color', ['135', '120']],
    ['Portra 800', 800, 'color', ['135', '120']],
    ['Ektar 100', 100, 'color', ['135', '120']],
    ['Gold 200', 200, 'color', ['135', '120']],
    ['Ultramax 400', 400, 'color', ['135']],
    ['ColorPlus 200', 200, 'color', ['135']],
    ['Pro Image 100', 100, 'color', ['135']],
    ['Ektachrome E100', 100, 'slide', ['135', '120']],
    ['Tri-X 400', 400, 'bw', ['135', '120']],
    ['T-Max 100', 100, 'bw', ['135', '120']],
    ['T-Max 400', 400, 'bw', ['135', '120']],
    ['T-Max P3200', 3200, 'bw', ['135'], 'ISO thật ~800, thường đẩy 3200'],
    ['Vision3 50D', 50, 'cine', ['135']],
    ['Vision3 250D', 250, 'cine', ['135']],
    ['Vision3 500T', 500, 'cine', ['135'], 'Cân bằng đèn tungsten']
  ]),
  ...B('Fujifilm', [
    ['Fujicolor 200', 200, 'color', ['135']],
    ['Fujicolor 400', 400, 'color', ['135']],
    ['Superia X-TRA 400', 400, 'color', ['135']],
    ['Fujicolor C200', 200, 'color', ['135']],
    ['Pro 400H', 400, 'color', ['135', '120'], 'Đã ngừng sản xuất'],
    ['Velvia 50', 50, 'slide', ['135', '120']],
    ['Velvia 100', 100, 'slide', ['135', '120']],
    ['Provia 100F', 100, 'slide', ['135', '120']],
    ['Acros 100 II', 100, 'bw', ['135', '120']],
    ['Instax Mini', 800, 'instant', ['instax-mini']],
    ['Instax Wide', 800, 'instant', ['instax-wide']],
    ['Instax Square', 800, 'instant', ['instax-square']]
  ]),
  ...B('Ilford', [
    ['HP5 Plus', 400, 'bw', ['135', '120']],
    ['FP4 Plus', 125, 'bw', ['135', '120']],
    ['Delta 100', 100, 'bw', ['135', '120']],
    ['Delta 400', 400, 'bw', ['135', '120']],
    ['Delta 3200', 3200, 'bw', ['135', '120'], 'ISO thật ~1000'],
    ['Pan F Plus 50', 50, 'bw', ['135', '120']],
    ['XP2 Super 400', 400, 'bw', ['135', '120'], 'Đen trắng tráng C-41'],
    ['SFX 200', 200, 'bw', ['135', '120'], 'Nhạy hồng ngoại gần'],
    ['Ortho Plus 80', 80, 'bw', ['135', '120']]
  ]),
  ...B('Kentmere', [['Pan 100', 100, 'bw', ['135', '120']], ['Pan 400', 400, 'bw', ['135', '120']]]),
  ...B('Harman', [['Phoenix 200', 200, 'color', ['135', '120']]]),
  ...B('CineStill', [
    ['800T', 800, 'cine', ['135', '120'], 'Tungsten, quầng đỏ quanh đèn'],
    ['400D', 400, 'cine', ['135', '120']],
    ['50D', 50, 'cine', ['135', '120']]
  ]),
  ...B('Lomography', [
    ['Color Negative 100', 100, 'color', ['135', '120']],
    ['Color Negative 400', 400, 'color', ['135', '120']],
    ['Color Negative 800', 800, 'color', ['135', '120']],
    ['LomoChrome Purple', 400, 'color', ['135', '120'], 'Chụp được ISO 100–400'],
    ['LomoChrome Metropolis', 400, 'color', ['135', '120'], 'Chụp được ISO 100–400'],
    ['Lady Grey 400', 400, 'bw', ['135', '120']]
  ]),
  ...B('Foma', [['Fomapan 100', 100, 'bw', ['135', '120']], ['Fomapan 200', 200, 'bw', ['135', '120']], ['Fomapan 400', 400, 'bw', ['135', '120']]]),
  ...B('Rollei', [['Retro 80S', 80, 'bw', ['135', '120']], ['Retro 400S', 400, 'bw', ['135', '120']], ['RPX 400', 400, 'bw', ['135', '120']]]),
  ...B('Agfa', [['APX 100', 100, 'bw', ['135', '120']], ['APX 400', 400, 'bw', ['135', '120']], ['Vista Plus 200', 200, 'color', ['135'], 'Đã ngừng sản xuất']]),
  ...B('Polaroid', [['600', 640, 'instant', ['polaroid-600']], ['i-Type', 640, 'instant', ['polaroid-i']], ['SX-70', 160, 'instant', ['polaroid-sx70']]])
];

export const stockLabel = (s: Pick<FilmStock, 'brand' | 'name'>) => `${s.brand} ${s.name}`;

export function findStock(label: string): FilmStock | null {
  const k = label.toLowerCase().replace(/\s+/g, ' ').trim();
  return FILM_STOCKS.find((s) => stockLabel(s).toLowerCase() === k || s.name.toLowerCase() === k) ?? null;
}

/** Đoán ISO từ tên film tự nhập: "Portra 400" → 400 */
export function isoFromName(label: string): number | null {
  const s = findStock(label);
  if (s) return s.iso;
  const m = label.match(/(?:^|\D)(25|32|50|64|80|100|125|160|200|250|320|400|500|640|800|1600|3200)(?:\D|$)/);
  return m ? Number(m[1]) : null;
}

/** Khổ film của máy (theo trường format trong app) → khổ trong thư viện film */
export function cameraFilmFormats(format: string, type: string): FilmFormat[] | null {
  if (type === 'DIG') return [];
  if (format === '120') return ['120'];
  if (format === '35mm' || type === 'HALF') return ['135'];
  if (format === 'Instant' || type === 'INST') return ['instax-mini', 'instax-wide', 'instax-square', 'polaroid-600', 'polaroid-i', 'polaroid-sx70'];
  return null;
}

/** Số kiểu mặc định của một cuộn */
export function defaultShots(stock: FilmStock | null, format: string, type: string): number {
  if (stock?.kind === 'instant') return stock.formats[0].startsWith('instax') ? 10 : 8;
  if (format === '120') return 12;
  return type === 'HALF' ? 72 : 36;
}

/** Push / pull: số stop từ ISO hộp sang ISO chụp */
export function stops(box: number, ei: number) {
  return Math.round(Math.log2(ei / box) * 3) / 3;
}
