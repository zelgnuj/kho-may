import type { CamType } from '../db';

/**
 * Đoán loại máy và khổ film từ tên. Chỉ ghi những mẫu chắc chắn;
 * mẫu không khớp sẽ để "Chưa phân loại" cho người dùng tự chọn.
 * Thứ tự quan trọng: quy tắc cụ thể đặt trước quy tắc chung.
 */
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
  const key = `${brand} ${model}`.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [re, type, format] of RULES) {
    if (re.test(key)) return { type, format };
  }
  return { type: '' };
}

/* ---------- Thông số ống kính liền ---------- */

import type { LensSpec } from '../db';

/**
 * Chỉ ghi những mẫu chắc chắn thông số. Mẫu không có ở đây để người dùng tự nhập.
 * [quy tắc tên, tiêu cự, khẩu độ, tiêu cự tele (zoom), khẩu độ ở tele]
 */
const LENS_RULES: [RegExp, number, number, number?, number?][] = [
  [/canon a35 datelux/, 40, 2.8],
  [/canon canonet ql17 g-?iii|canonet ql17 g-?iii/, 40, 1.7],
  [/chinon bellami/, 35, 2.8],
  [/konica c35 af2?\b/, 38, 2.8],
  [/nikon af600\b/, 28, 3.5],
  [/nikon l35 ?af\b/, 35, 2.8],
  [/olympus xa$/, 35, 2.8],
  [/olympus pen[ -]?eed/, 32, 1.7],
  [/olympus (mju|μ|stylus)[ -]?(i|1)?$/, 35, 3.5],
  [/pentax pc ?35 ?af$/, 35, 2.8],
  [/ricoh r1s?$/, 30, 3.5],
  [/yashica electro 35 g(x|sn|s|t)?$/, 45, 1.7],
  [/yashica electro 35 gx$/, 40, 1.7],
  [/yashica electro 35 mc$/, 40, 2.8],
  [/contax t2$/, 38, 2.8],
  [/olympus trip 35$/, 40, 2.8]
];

export function defaultLensKind(type: string): LensSpec['kind'] {
  return type === 'SLR' || type === 'MF' ? 'interchangeable' : 'fixed';
}

export function guessLens(brand: string, model: string, type: string): LensSpec | null {
  if (defaultLensKind(type) === 'interchangeable') return null;
  const key = `${brand} ${model}`.toLowerCase().replace(/\s+/g, ' ').trim();
  // Quy tắc cụ thể (GX) phải thắng quy tắc chung (Electro 35 G…): duyệt ngược để mục sau được ưu tiên
  for (let i = LENS_RULES.length - 1; i >= 0; i--) {
    const [re, f, a, fMax, aMax] = LENS_RULES[i];
    if (re.test(key)) return { kind: 'fixed', focal: f, aperture: a, focalMax: fMax ?? null, apertureMax: aMax ?? null, auto: true };
  }
  return null;
}
