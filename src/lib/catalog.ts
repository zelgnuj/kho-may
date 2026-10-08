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
