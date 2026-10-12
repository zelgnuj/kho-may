import type { Camera } from '../db';
import { ART } from '../components/CameraArt';
import { cameraImage, loadImage } from './cameraImage';
import { TYPE_LABEL, lensLabel } from './format';
import { lang, tx } from './i18n';
import { cutout } from './cutout';

/* ======================================================================
 * Ảnh chia sẻ lên mạng xã hội, vẽ hoàn toàn trên máy bằng canvas.
 * Ảnh xuất ra là JPEG mới → không mang theo EXIF/GPS của ảnh gốc.
 *
 * Ba kiểu, lấy cảm hứng từ đồ vật của dân chơi film:
 *  - poster:  ảnh máy tràn khung, tên máy cỡ thật lớn như áp phích quảng cáo máy ảnh
 *  - instant: một tấm ảnh lấy liền đặt trên mặt bàn gỗ, chú thích viết tay
 *  - film:    dải phim 35mm có lỗ răng cưa, chữ in mép, ngày in góc ảnh
 * Mọi dòng chữ được xếp theo kích thước đo thật (kể cả dấu tiếng Việt) nên không chồng lên nhau.
 * ====================================================================== */

export type CardStyle = 'collage' | 'pop' | 'sticker' | 'film';
export type CardFormat = 'post' | 'story';

const SIZE: Record<CardFormat, [number, number]> = { post: [1080, 1350], story: [1080, 1920] };
const BG = '#0E0D0C';
const PAPER = '#F3EFE7';
const SOFT = '#CFC7BA';
const MUTED = '#8C857B';
const ART_STROKE = '#77716A';
const EDGE = '#F08A3C';
const PRINT = '#F5F2EA';
const INK = '#2B2723';

const F_DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const F_SANS = '"Be Vietnam Pro", system-ui, sans-serif';
const F_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const F_HAND = '"Patrick Hand", "Segoe Print", "Bradley Hand", cursive';

const display = (s: number, w = 800) => `${w} ${s}px ${F_DISPLAY}`;
const sans = (s: number, w = 500) => `${w} ${s}px ${F_SANS}`;
const mono = (s: number, w = 500) => `${w} ${s}px ${F_MONO}`;
const hand = (s: number) => `400 ${s}px ${F_HAND}`;

async function fontsReady(sample: string) {
  try {
    await Promise.all([
      document.fonts.load(display(100), sample), document.fonts.load(display(100, 700), sample),
      document.fonts.load(sans(30), sample), document.fonts.load(sans(30, 600), sample),
      document.fonts.load(mono(30), sample), document.fonts.load(hand(30), sample)
    ]);
  } catch { /* vẽ bằng font dự phòng */ }
}

type Ctx = CanvasRenderingContext2D;

function canvas(format: CardFormat, bg = BG) {
  const [w, h] = SIZE[format];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  return { c, ctx, w, h };
}

/** Vùng an toàn: story chừa chỗ cho thanh trên/dưới của Instagram */
const safe = (format: CardFormat, h: number) => (format === 'story' ? { top: 220, bottom: h - 250 } : { top: 72, bottom: h - 72 });

function spacing(ctx: Ctx, px: number) {
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Vẽ ảnh kiểu object-fit: cover */
function cover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** Hình vẽ máy (khi không có ảnh) ở giữa ô */
function art(ctx: Ctx, type: string, x: number, y: number, w: number, h: number, fill = '#1A1917', stroke = ART_STROKE) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  const scale = Math.min(w * 0.6 / 120, h * 0.6 / 80);
  ctx.save();
  ctx.translate(x + (w - 120 * scale) / 2, y + (h - 80 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = stroke; ctx.lineWidth = Math.min(2, 3 / scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke(new Path2D(ART[type] ?? ART.RF));
  ctx.restore();
}

/* ---------- Chữ: đo thật, co cho vừa, xếp chồng không đè nhau ---------- */

interface Metrics { w: number; asc: number; desc: number }
function measure(ctx: Ctx, text: string, font: string, ls = 0): Metrics {
  ctx.font = font; spacing(ctx, ls);
  const m = ctx.measureText(text);
  return { w: m.width, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
}

/** Cỡ chữ lớn nhất (≤ max) để vừa maxW */
function fitSize(ctx: Ctx, text: string, maxW: number, max: number, min: number, font: (s: number) => string, ls = 0) {
  let s = max;
  while (s > min && measure(ctx, text, font(s), ls).w > maxW) s -= 2;
  return s;
}

/** Cắt bớt bằng … nếu vẫn quá dài */
function clip(ctx: Ctx, text: string, maxW: number, font: string, ls = 0) {
  if (measure(ctx, text, font, ls).w <= maxW) return text;
  let t = text;
  while (t.length > 1 && measure(ctx, t + '…', font, ls).w > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

interface Line { text: string; font: string; color: string; ls?: number; gap?: number; shadow?: boolean; align?: CanvasTextAlign }

/** Xếp các dòng từ dưới lên, dòng cuối nằm trên đường `bottom`. Trả về mép trên cùng đã vẽ. */
function stackUp(ctx: Ctx, lines: Line[], x: number, bottom: number) {
  let cursor = bottom;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const m = measure(ctx, l.text, l.font, l.ls);
    const base = cursor - m.desc;
    draw(ctx, l, x, base);
    cursor = base - m.asc - (i > 0 ? lines[i - 1].gap ?? 16 : 0);
  }
  return cursor;
}

/** Xếp các dòng từ trên xuống, bắt đầu từ mép `top`. Trả về mép dưới cùng. */
function stackDown(ctx: Ctx, lines: Line[], x: number, top: number) {
  let cursor = top;
  for (const l of lines) {
    const m = measure(ctx, l.text, l.font, l.ls);
    const base = cursor + m.asc;
    draw(ctx, l, x, base);
    cursor = base + m.desc + (l.gap ?? 16);
  }
  return cursor;
}

function draw(ctx: Ctx, l: Line, x: number, base: number) {
  ctx.save();
  ctx.font = l.font; spacing(ctx, l.ls ?? 0);
  ctx.fillStyle = l.color; ctx.textAlign = l.align ?? 'left';
  if (l.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 2; }
  ctx.fillText(l.text, x, base);
  ctx.restore();
}

/** Tên máy cỡ lớn: một dòng nếu đủ lớn, không thì tách làm hai dòng */
function titleLines(ctx: Ctx, text: string, maxW: number, max: number, min: number, font: (s: number) => string): { lines: string[]; size: number } {
  const one = fitSize(ctx, text, maxW, max, min, font);
  const words = text.split(/\s+/);
  if (one >= max * 0.62 || words.length < 2) return { lines: [text], size: one };
  let best = { lines: [text], size: one };
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const s = Math.min(fitSize(ctx, a, maxW, max, min, font), fitSize(ctx, b, maxW, max, min, font));
    if (s > best.size) best = { lines: [a, b], size: s };
  }
  return best;
}

/** Dòng thông số: "1979 | 35mm f/2.8 | Rangefinder" với vạch đứng mảnh làm phân cách */
function specRow(ctx: Ctx, items: string[], x: number, base: number, maxW: number, size: number, color: string, rule: string) {
  if (!items.length) return;
  let s = size;
  const pad = () => s * 0.8;
  const total = () => items.reduce((sum, t) => sum + measure(ctx, t, sans(s)).w, 0) + pad() * 2 * (items.length - 1);
  while (total() > maxW && s > size * 0.6) s -= 1;
  let cx = x;
  const cap = measure(ctx, 'H', sans(s)).asc;
  items.forEach((t, i) => {
    if (i) {
      cx += pad();
      ctx.fillStyle = rule; ctx.fillRect(cx, base - cap, 2, cap);
      cx += pad();
    }
    ctx.font = sans(s); spacing(ctx, 0); ctx.fillStyle = color; ctx.textAlign = 'left';
    ctx.fillText(t, cx, base);
    cx += measure(ctx, t, sans(s)).w;
  });
}

const specItems = (c: Camera) => [c.year ? String(c.year) : null, lensLabel(c.lens), TYPE_LABEL[c.type] ?? null].filter(Boolean) as string[];
const ownerLine = (owner: string) => (owner ? tx("Bộ sưu tập của {0}", owner) : tx("Bộ sưu tập máy ảnh"));
const numberTag = (i?: number) => (i != null ? `Nº ${String(i + 1).padStart(2, '0')}` : '');

/** Hạt ngẫu nhiên cố định (ảnh giống nhau mỗi lần tạo) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}
const seedOf = (t: string) => [...t].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

/* ---------- Mặt bàn gỗ + ảnh lấy liền ---------- */

interface PrintOpts { cx: number; cy: number; width: number; angle: number; img: HTMLImageElement | null; type: string; caption: string; sub?: string; corner?: string }

/** Một tấm ảnh lấy liền: viền trắng, cằm dày, chú thích viết tay */
function instantPrint(ctx: Ctx, p: PrintOpts) {
  const m = p.width * 0.06;
  const side = p.width - m * 2;
  const chin = p.width * 0.25;
  const ph = m + side + chin;
  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(p.angle);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = p.width * 0.06; ctx.shadowOffsetY = p.width * 0.025;
  ctx.fillStyle = PRINT;
  rounded(ctx, -p.width / 2, -ph / 2, p.width, ph, p.width * 0.008);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const x0 = -p.width / 2 + m, y0 = -ph / 2 + m;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, side, side); ctx.clip();
  if (p.img) cover(ctx, p.img, x0, y0, side, side); else art(ctx, p.type, x0, y0, side, side, '#22201C');
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, side, side);
  // chú thích trên cằm
  const capMax = side - (p.corner ? p.width * 0.18 : 0);
  const big = fitSize(ctx, p.caption, capMax, Math.round(p.width * 0.085), Math.round(p.width * 0.045), hand);
  const capTop = y0 + side + chin * 0.18;
  const bottom = stackDown(ctx, [{ text: clip(ctx, p.caption, capMax, hand(big)), font: hand(big), color: INK, gap: p.width * 0.012 }], x0, capTop);
  if (p.sub) {
    const s = Math.round(p.width * 0.05);
    stackDown(ctx, [{ text: clip(ctx, p.sub, side, hand(s)), font: hand(s), color: '#6E655C' }], x0, bottom);
  }
  if (p.corner) {
    const s = Math.round(p.width * 0.055);
    draw(ctx, { text: p.corner, font: hand(s), color: '#9A4E2B', align: 'right' }, x0 + side, capTop + measure(ctx, p.corner, hand(s)).asc);
  }
  ctx.restore();
}

/* ---------- Dải phim ---------- */

/** Lỗ răng cưa nằm ở nửa ngoài của dải mép (outer = 'top' | 'bottom'); nửa trong để in chữ */
function sprockets(ctx: Ctx, x: number, y: number, w: number, band: number, outer: 'top' | 'bottom', color = BG) {
  const zone = band * 0.56;
  const hole = { w: zone * 0.58, h: zone * 0.66 };
  const step = hole.w * 1.95;
  const hy = outer === 'top' ? y + (zone - hole.h) / 2 + band * 0.04 : y + band - zone + (zone - hole.h) / 2 - band * 0.04;
  ctx.fillStyle = color;
  for (let px = x + step * 0.3; px + hole.w < x + w; px += step) {
    rounded(ctx, px, hy, hole.w, hole.h, hole.h * 0.24);
    ctx.fill();
  }
}

function edgeText(ctx: Ctx, text: string, x: number, base: number, size: number, align: CanvasTextAlign = 'left') {
  draw(ctx, { text, font: mono(size), color: EDGE, ls: size * 0.16, align }, x, base);
}

/** Mã vạch DX giả ở mép phim */
function dxCode(ctx: Ctx, x: number, y: number, h: number, seed: number) {
  const r = rng(seed);
  ctx.fillStyle = EDGE;
  let cx = x;
  for (let i = 0; i < 18; i++) { const bw = r() > 0.5 ? 6 : 3; if (r() > 0.35) ctx.fillRect(cx, y, bw, h); cx += bw + 4; }
}

function dateStamp(ctx: Ctx, x: number, base: number, size: number, d = new Date()) {
  const s = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, ' ')} ${String(d.getDate()).padStart(2, ' ')}`;
  ctx.save();
  ctx.font = mono(size); spacing(ctx, size * 0.08); ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(255,120,40,.9)'; ctx.shadowBlur = size * 0.4;
  ctx.fillStyle = '#FF9A4D';
  ctx.fillText(s, x, base);
  ctx.restore();
}

/* ---------- Chữ ký nhỏ ---------- */

function wordmark(ctx: Ctx, x: number, base: number, color: string, size = 36, align: CanvasTextAlign = 'right') {
  draw(ctx, { text: 'Camera Cabinet', font: display(size, 700), color, ls: size * 0.04, align }, x, base);
}

/* ====================================================================== */
/* Một máy                                                                 */
/* ====================================================================== */

export interface CameraCardOpts { style: CardStyle; format: CardFormat; owner: string; accent: string; photoId?: string | null; index?: number }

export async function renderCameraCard(cam: Camera, o: CameraCardOpts): Promise<Blob> {
  const title = cam.model.toUpperCase();
  await fontsReady(`${title}${cam.model}${cam.brand}${ownerLine(o.owner)}ÁÀẢÃẠĂÂĐÊÔƠƯáàảãạăâđêôơư`);
  const src = await cameraImage(cam, 'full', o.photoId);
  const img = src ? await loadImage(src.src) : null;
  const credit = src && !src.own && src.credit ? `${tx("Ảnh mẫu:")} ${src.credit} / Wikimedia Commons` : null;
  src?.revoke?.();
  if (o.style === 'film') return cameraFilm(cam, o, img, credit);
  const key = src?.own ? (o.photoId ?? cam.coverPhotoId ?? undefined) : src ? `sample:${src.src}` : undefined;
  const cut = img ? await cutout(img, key) : null;
  const subject: Subject = { cam, img, cut };
  return o.style === 'pop' ? cameraPop(subject, o, credit) : o.style === 'sticker' ? cameraSticker(subject, o, credit) : cameraCollage(subject, o, credit);
}

/** Dải phim 35mm */
function cameraFilm(cam: Camera, o: CameraCardOpts, img: HTMLImageElement | null, credit: string | null) {
  const { c, ctx, w, h } = canvas(o.format);
  const sa = safe(o.format, h);
  const M = 72, maxW = w - M * 2;
  // chữ trước (từ dưới lên) để biết chừa bao nhiêu chỗ cho dải phim
  let bottom = sa.bottom;
  if (o.owner) { draw(ctx, { text: clip(ctx, ownerLine(o.owner), maxW - 320, sans(26)), font: sans(26), color: MUTED }, M, bottom); }
  wordmark(ctx, w - M, bottom, o.accent, 34);
  bottom -= 34 + 40;
  const specs = specItems(cam);
  if (specs.length) { specRow(ctx, specs, M, bottom, maxW, 30, SOFT, o.accent); bottom -= measure(ctx, 'H', sans(30)).asc + 30; }
  const t = titleLines(ctx, cam.model.toUpperCase(), maxW, 200, 100, (s) => display(s));
  const lines: Line[] = [{ text: cam.brand, font: sans(38, 600), color: SOFT, gap: 12 }];
  t.lines.forEach((l, i) => lines.push({ text: l, font: display(t.size), color: PAPER, gap: i < t.lines.length - 1 ? t.size * 0.06 : 0 }));
  const textTop = stackUp(ctx, lines, M, bottom);

  // dải phim từ trên xuống tới trên phần chữ
  const top = sa.top - (o.format === 'story' ? 40 : 0);
  const stripBottom = textTop - 56;
  const band = 92;
  ctx.fillStyle = '#050505'; ctx.fillRect(0, top, w, stripBottom - top);
  sprockets(ctx, 0, top, w, band, 'top');
  sprockets(ctx, 0, stripBottom - band, w, band, 'bottom');
  const fx = M - 20, fw = w - (M - 20) * 2;
  const fy = top + band + 8, fh = stripBottom - band - 8 - fy;
  const stock = (cam.film?.stock ?? `${cam.brand} ${cam.model}`).toUpperCase();
  const frame = o.index != null ? o.index + 1 : 1;
  ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
  if (img) cover(ctx, img, fx, fy, fw, fh); else art(ctx, cam.type, fx, fy, fw, fh, '#1C1A17');
  ctx.restore();
  // chữ in mép: trên là tên film + số khung, dưới là mã vạch + số khung A
  edgeText(ctx, clip(ctx, stock, fw * 0.6, mono(20), 3.2), fx + 6, top + band - 6, 20);
  edgeText(ctx, `${frame}A ▸`, fx + fw - 6, top + band - 6, 20, 'right');
  dxCode(ctx, fx + 6, stripBottom - band + 8, 14, seedOf(cam.id));
  edgeText(ctx, `▸ ${frame}`, fx + fw - 6, stripBottom - band + 26, 20, 'right');
  if (img) dateStamp(ctx, fx + fw - 34, fy + fh - 34, 40);
  if (credit) draw(ctx, { text: clip(ctx, credit, maxW, mono(16, 400)), font: mono(16, 400), color: 'rgba(243,239,231,.4)', align: 'right' }, w - M, stripBottom + 28);
  return toBlob(c);
}

/* ====================================================================== */
/* Cả bộ sưu tập                                                           */
/* ====================================================================== */

export interface CollectionCardOpts { style: CardStyle; format: CardFormat; owner: string; accent: string }

/** Chọn máy để lên ảnh: máy có ảnh của bạn trước */
export function pickForCollage(cams: Camera[], n: number) {
  const owned = cams.filter((c) => c.status === 'owned' && !c.deletedAt);
  const withPhoto = owned.filter((c) => c.coverPhotoId).sort((a, b) => b.createdAt - a.createdAt);
  const rest = owned.filter((c) => !c.coverPhotoId).sort((a, b) => b.createdAt - a.createdAt);
  return [...withPhoto, ...rest].slice(0, n);
}

export function collectionStats(cams: Camera[]) {
  const owned = cams.filter((c) => c.status === 'owned' && !c.deletedAt);
  const brands = new Set(owned.map((c) => c.brand.trim().toLowerCase()).filter(Boolean)).size;
  const years = owned.map((c) => c.year).filter((y): y is number => !!y);
  const span = years.length > 1 ? `${Math.min(...years)}–${Math.max(...years)}` : null;
  return [
    lang === 'vi' ? `${owned.length} máy` : `${owned.length} ${owned.length === 1 ? 'camera' : 'cameras'}`,
    lang === 'vi' ? `${brands} hãng` : `${brands} ${brands === 1 ? 'brand' : 'brands'}`,
    span
  ].filter(Boolean) as string[];
}

/** Tiêu đề bộ sưu tập (từ trên xuống), trả về mép dưới */
function collectionHeader(ctx: Ctx, cams: Camera[], o: CollectionCardOpts, top: number, w: number, color = PAPER, rule = o.accent) {
  const M = 72, maxW = w - M * 2;
  const title = ownerLine(o.owner).toUpperCase();
  const t = titleLines(ctx, title, maxW, 150, 84, (s) => display(s));
  const lines: Line[] = t.lines.map((l, i) => ({ text: l, font: display(t.size), color, gap: i < t.lines.length - 1 ? t.size * 0.08 : 30 }));
  const after = stackDown(ctx, lines, M - 3, top);
  const cap = measure(ctx, 'H', sans(32)).asc;
  specRow(ctx, collectionStats(cams), M, after + cap, maxW, 32, color === PAPER ? SOFT : color, rule);
  return after + cap + 20;
}

function collectionFooter(ctx: Ctx, w: number, base: number, accent: string, color = MUTED) {
  const when = new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' });
  draw(ctx, { text: when.charAt(0).toUpperCase() + when.slice(1), font: sans(26), color }, 72, base);
  wordmark(ctx, w - 72, base, accent, 34);
}

export async function renderCollectionCard(cams: Camera[], o: CollectionCardOpts): Promise<Blob> {
  const story = o.format === 'story';
  const [W, H] = SIZE[o.format];
  const sa = safe(o.format, H);
  const total = pickForCollage(cams, 99).length;
  await fontsReady(ownerLine(o.owner).toUpperCase() + ownerLine(o.owner) + pickForCollage(cams, 12).map((c) => c.brand + c.model).join(''));

  if (o.style !== 'film') {
    const pick = pickForCollage(cams, o.style === 'pop' ? (story ? 6 : 4) : story ? 8 : 6);
    const subjects = await Promise.all(pick.map(async (cam) => {
      const src = await cameraImage(cam, 'full');
      const img = src ? await loadImage(src.src) : null;
      const key = src?.own ? cam.coverPhotoId ?? undefined : src ? `sample:${src.src}` : undefined;
      const cut = img ? await cutout(img, key) : null;
      src?.revoke?.();
      return { cam, img, cut } as Subject;
    }));
    return o.style === 'pop' ? collectionPop(subjects, cams, o) : o.style === 'sticker' ? collectionSticker(subjects, cams, o) : collectionCollage(subjects, cams, o);
  }
  // Contact sheet: mỗi hàng là một dải phim, khung 3:2
  const { c, ctx, w } = canvas(o.format);
  const gridTop = collectionHeader(ctx, cams, o, sa.top, w) + 34;
  const footerBase = sa.bottom;
  const avail = footerBase - 64 - gridTop;
  const M = 72;
  const band = 46, gap = 22;
  const cols = total >= 5 ? 3 : total >= 2 ? 2 : 1;
  const cellW = (W - M * 2 - gap * (cols - 1)) / cols;
  const cellH = cellW * 2 / 3 + band * 2;
  const rows = Math.min(Math.max(1, Math.floor((avail + gap) / (cellH + gap))), Math.max(1, Math.ceil(total / cols)));
  const pick = pickForCollage(cams, Math.min(total, cols * rows));
  const imgs = await Promise.all(pick.map(async (cam) => { const s = await cameraImage(cam, 'thumb'); return s ? loadImage(s.src) : null; }));
  const gridH = rows * cellH + (rows - 1) * gap;
  const y0 = gridTop + Math.max(0, (avail - gridH) * 0.3);
  const x0 = (w - (cols * cellW + (cols - 1) * gap)) / 2;
  const fh = cellH - band * 2;
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * (cellH + gap);
    ctx.fillStyle = '#050505'; ctx.fillRect(0, y, w, cellH);
    sprockets(ctx, 0, y, w, band, 'top');
    sprockets(ctx, 0, y + cellH - band, w, band, 'bottom');
    for (let k = 0; k < cols; k++) {
      const i = r * cols + k;
      const x = x0 + k * (cellW + gap);
      const cam = pick[i];
      if (!cam) { ctx.fillStyle = '#121110'; ctx.fillRect(x, y + band, cellW, fh); continue; }
      if (imgs[i]) cover(ctx, imgs[i]!, x, y + band, cellW, fh); else art(ctx, cam.type, x, y + band, cellW, fh);
      edgeText(ctx, clip(ctx, `▸ ${i + 1}  ${cam.model.toUpperCase()}`, cellW - 4, mono(16), 2.6), x + 2, y + cellH - band + 19, 16);
    }
  }
  collectionFooter(ctx, w, footerBase, o.accent);
  return toBlob(c);
}

/* ====================================================================== */
/* Collage · Pop art · Sticker — dựng từ ảnh máy đã tách nền               */
/* ====================================================================== */

interface Subject { cam: Camera; img: HTMLImageElement | null; cut: HTMLCanvasElement | null }

type Src = HTMLCanvasElement | HTMLImageElement;
const srcW = (s: Src) => (s instanceof HTMLImageElement ? s.naturalWidth : s.width);
const srcH = (s: Src) => (s instanceof HTMLImageElement ? s.naturalHeight : s.height);

/** Ảnh dùng để dựng: ảnh tách nền; không có thì cắt ảnh gốc thành khung vuông bo góc; không có ảnh thì hình vẽ */
function subjectCanvas(s: Subject, max = 1000): HTMLCanvasElement {
  if (s.cut) return s.cut;
  const c = document.createElement('canvas');
  if (s.img) {
    const side = Math.min(max, Math.min(s.img.naturalWidth, s.img.naturalHeight));
    c.width = side; c.height = Math.round(side * 0.8);
    const x = c.getContext('2d')!;
    rounded(x, 0, 0, c.width, c.height, side * 0.05); x.clip();
    cover(x, s.img, 0, 0, c.width, c.height);
    return c;
  }
  c.width = 900; c.height = 600;
  const x = c.getContext('2d')!;
  x.translate(0, 0); x.scale(900 / 120, 600 / 80);
  x.strokeStyle = '#2B2723'; x.lineWidth = 3.2; x.lineJoin = 'round'; x.lineCap = 'round';
  x.fillStyle = '#F5F2EA';
  const p = new Path2D(ART[s.cam.type] ?? ART.RF);
  x.fill(p); x.stroke(p);
  return c;
}

/** Hình bóng đặc của chủ thể, nở rộng thêm r px (để làm viền sticker / viền đen) */
function silhouette(src: Src, color: string, r: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = srcW(src) + r * 2; c.height = srcH(src) + r * 2;
  const x = c.getContext('2d')!;
  const steps = Math.max(16, Math.min(48, Math.round(r * 1.5)));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    x.drawImage(src, r + Math.cos(a) * r, r + Math.sin(a) * r);
  }
  x.drawImage(src, r, r);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Sticker cắt khuôn: viền trắng dày quanh chủ thể */
function sticker(src: Src, border: number, edge = '#FFFFFF'): HTMLCanvasElement {
  const sil = silhouette(src, edge, border);
  const x = sil.getContext('2d')!;
  x.globalCompositeOperation = 'source-over';
  x.drawImage(src, border, border);
  return sil;
}

/** Tách tông kiểu in lụa: tối → màu 1, giữa → màu 2, sáng → màu 3 */
function posterize(src: Src, tones: [string, string, string]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = srcW(src); c.height = srcH(src);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const rgb = tones.map((t) => [parseInt(t.slice(1, 3), 16), parseInt(t.slice(3, 5), 16), parseInt(t.slice(5, 7), 16)]);
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] < 8) continue;
    const l = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const t = l < 58 ? 0 : l < 150 ? 1 : 2;
    d.data[i] = rgb[t][0]; d.data[i + 1] = rgb[t][1]; d.data[i + 2] = rgb[t][2];
    d.data[i + 3] = d.data[i + 3] > 110 ? 255 : 0; // mép gắt như in lụa
  }
  x.putImageData(d, 0, 0);
  return c;
}

/** Vẽ src vừa khung (contain), xoay quanh tâm, có bóng; trả về khung đã vẽ */
function place(ctx: Ctx, src: Src, cx: number, cy: number, maxW: number, maxH: number, angle = 0, shadow?: { color: string; blur: number; dx: number; dy: number }) {
  const sc = Math.min(maxW / srcW(src), maxH / srcH(src));
  const w = srcW(src) * sc, h = srcH(src) * sc;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(angle);
  if (shadow) { ctx.shadowColor = shadow.color; ctx.shadowBlur = shadow.blur; ctx.shadowOffsetX = shadow.dx; ctx.shadowOffsetY = shadow.dy; }
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  ctx.restore();
  return { w, h };
}

/** Chấm Ben-Day: lưới chấm tròn, chấm to dần về một góc */
function halftone(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, step: number, from: 'tl' | 'br' | 'c' = 'br') {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = color;
  for (let row = 0, py = y; py < y + h + step; row++, py += step * 0.866) {
    for (let px = x + (row % 2 ? step / 2 : 0); px < x + w + step; px += step) {
      const u = from === 'c' ? 1 - Math.hypot((px - x) / w - 0.5, (py - y) / h - 0.5) * 1.6
        : from === 'tl' ? 1 - ((px - x) / w + (py - y) / h) / 2 : ((px - x) / w + (py - y) / h) / 2;
      const r = step * 0.46 * Math.max(0.08, Math.min(1, u));
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** Hình nổ kiểu truyện tranh */
function burst(ctx: Ctx, cx: number, cy: number, r: number, spikes: number, fill: string, stroke: string, lw: number, seed: number) {
  const rand = rng(seed);
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * (0.62 + rand() * 0.1) : r * (0.92 + rand() * 0.12);
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke();
  ctx.restore();
}

/** Chữ viền dày (kiểu sticker / truyện tranh), có bóng đặc lệch */
function outlined(ctx: Ctx, text: string, x: number, base: number, font: string, fill: string, stroke: string, lw: number, angle = 0, drop?: { color: string; dx: number; dy: number }, align: CanvasTextAlign = 'left') {
  ctx.save();
  ctx.translate(x, base); ctx.rotate(angle);
  ctx.font = font; spacing(ctx, 0); ctx.textAlign = align; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  if (drop) {
    ctx.fillStyle = drop.color; ctx.strokeStyle = drop.color; ctx.lineWidth = lw;
    ctx.strokeText(text, drop.dx, drop.dy); ctx.fillText(text, drop.dx, drop.dy);
  }
  ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Ô chú thích kiểu truyện tranh: nền màu, viền đen */
function captionBox(ctx: Ctx, text: string, x: number, y: number, font: string, bg: string, fg: string, angle = 0, maxW = 900) {
  const t = clip(ctx, text, maxW - 40, font);
  const m = measure(ctx, t, font);
  const pad = Math.round(m.asc * 0.55);
  const bw = m.w + pad * 2, bh = m.asc + m.desc + pad * 1.6;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = '#111'; ctx.fillRect(6, 6, bw, bh);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, bw, bh);
  ctx.lineWidth = 4; ctx.strokeStyle = '#111'; ctx.strokeRect(0, 0, bw, bh);
  ctx.font = font; ctx.fillStyle = fg; ctx.textAlign = 'left';
  ctx.fillText(t, pad, pad * 0.8 + m.asc);
  ctx.restore();
  return { w: bw, h: bh };
}

/* ---------- Giấy, giấy xé, băng dính, chữ cắt báo ---------- */

/** Nền giấy báo: màu giấy + các cột chữ mờ in sẵn */
function newsprint(ctx: Ctx, w: number, h: number, seed: number) {
  ctx.fillStyle = '#E4DED2'; ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  const cols = 4, gw = 26, cw = (w - gw * (cols + 1)) / cols;
  ctx.fillStyle = 'rgba(40,36,32,.10)';
  for (let c = 0; c < cols; c++) {
    let y = 30 + r() * 40;
    while (y < h - 20) {
      if (r() < 0.06) { y += 34; continue; }
      const lw = cw * (r() < 0.12 ? 0.4 + r() * 0.4 : 0.92 + r() * 0.08);
      ctx.fillRect(gw + c * (cw + gw), y, lw, 7);
      y += 17;
    }
  }
  // vệt ố giấy
  const g = ctx.createRadialGradient(w * 0.7, h * 0.2, 0, w * 0.5, h * 0.5, h * 0.9);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(120,96,60,.18)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

/** Mảnh giấy xé: hình chữ nhật xoay, mép răng cưa ngẫu nhiên */
function tornPaper(ctx: Ctx, cx: number, cy: number, w: number, h: number, angle: number, color: string, seed: number, shadow = true) {
  const r = rng(seed);
  const pts: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 12));
    for (let i = 0; i < n; i++) { const t = i / n; const j = r() * 9; pts.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]); }
  };
  edge(-w / 2, -h / 2, w / 2, -h / 2, 0, 1);
  edge(w / 2, -h / 2, w / 2, h / 2, -1, 0);
  edge(w / 2, h / 2, -w / 2, h / 2, 0, -1);
  edge(-w / 2, h / 2, -w / 2, -h / 2, 1, 0);
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(angle);
  if (shadow) { ctx.shadowColor = 'rgba(40,30,20,.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6; }
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

/** Băng dính giấy */
function tape(ctx: Ctx, cx: number, cy: number, w: number, angle: number) {
  const h = w * 0.3;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(angle);
  ctx.beginPath();
  const z = 6;
  ctx.moveTo(-w / 2, -h / 2);
  for (let i = 0; i <= 4; i++) ctx.lineTo(-w / 2 + (i % 2 ? z : 0), -h / 2 + (h / 4) * i);
  ctx.lineTo(w / 2, h / 2);
  for (let i = 4; i >= 0; i--) ctx.lineTo(w / 2 - (i % 2 ? z : 0), -h / 2 + (h / 4) * i);
  ctx.closePath();
  ctx.fillStyle = 'rgba(236,226,196,.82)'; ctx.fill();
  ctx.restore();
}

/** Chữ cắt từ báo: mỗi ký tự một ô, một kiểu chữ, một màu, nghiêng lệch */
function ransom(ctx: Ctx, text: string, x: number, base: number, maxW: number, size: number, seed: number, accent: string) {
  const styles = [
    { bg: '#151413', fg: '#F5F2EA', font: (s: number) => display(s) },
    { bg: '#F5F2EA', fg: '#151413', font: (s: number) => sans(s * 0.78, 700) },
    { bg: accent, fg: '#151413', font: (s: number) => display(s, 700) },
    { bg: '#D7263D', fg: '#FFFFFF', font: (s: number) => sans(s * 0.74, 600) },
    { bg: '#FFFFFF', fg: '#1D4ED8', font: (s: number) => mono(s * 0.72, 500) },
    { bg: '#F2C14E', fg: '#151413', font: (s: number) => hand(s * 0.9) }
  ];
  const chars = [...text];
  const layout = (s: number) => {
    const r = rng(seed);
    let cx = 0;
    const items = chars.map((ch) => {
      if (ch === ' ') { cx += s * 0.32; return null; }
      const st = styles[Math.floor(r() * styles.length)];
      const f = st.font(s);
      const m = measure(ctx, ch, f);
      const pad = s * 0.1;
      const bw = Math.max(m.w + pad * 2, s * 0.42), bh = s * 1.02;
      const it = { ch, st, f, m, x: cx, bw, bh, rot: (r() - 0.5) * 0.16, dy: (r() - 0.5) * s * 0.12 };
      cx += bw + s * 0.05;
      return it;
    });
    return { items, width: cx };
  };
  let s = size;
  let L = layout(s);
  while (L.width > maxW && s > size * 0.4) { s -= 4; L = layout(s); }
  for (const it of L.items) {
    if (!it) continue;
    ctx.save();
    ctx.translate(x + it.x + it.bw / 2, base - it.bh / 2 + it.dy);
    ctx.rotate(it.rot);
    ctx.shadowColor = 'rgba(40,30,20,.3)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    ctx.fillStyle = it.st.bg; ctx.fillRect(-it.bw / 2, -it.bh / 2, it.bw, it.bh);
    ctx.shadowColor = 'transparent';
    ctx.font = it.f; spacing(ctx, 0); ctx.fillStyle = it.st.fg; ctx.textAlign = 'center';
    ctx.fillText(it.ch, 0, (it.m.asc - it.m.desc) / 2);
    ctx.restore();
  }
  return { width: L.width, height: s * 1.02 };
}

/** Mũi tên vẽ tay */
function handArrow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, lw = 5) {
  const mx = (x0 + x1) / 2 + (y1 - y0) * 0.25, my = (y0 + y1) / 2 - (x1 - x0) * 0.25;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  const a = Math.atan2(y1 - my, x1 - mx);
  for (const d of [-0.5, 0.5]) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a + d) * 26, y1 - Math.sin(a + d) * 26); ctx.stroke(); }
  ctx.restore();
}

/** Con dấu mực */
function stamp(ctx: Ctx, text: string, cx: number, cy: number, angle: number, color: string, size = 30) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(angle);
  const f = display(size, 800);
  const m = measure(ctx, text, f, size * 0.12);
  const w = m.w + size * 1.2, h = size * 1.7;
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color; ctx.lineWidth = 4; rounded(ctx, -w / 2, -h / 2, w, h, 10); ctx.stroke();
  ctx.lineWidth = 1.5; rounded(ctx, -w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 6); ctx.stroke();
  ctx.font = f; spacing(ctx, size * 0.12); ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.fillText(text, 0, (m.asc - m.desc) / 2);
  ctx.restore();
  spacing(ctx, 0);
}

/* ---------- Bảng màu ---------- */

const POP_SETS: [string, string, string, string][] = [
  // nền, chấm, nổ, tông giữa
  ['#FFD60A', '#FF2E88', '#00B4D8', '#FF2E88'],
  ['#00B4D8', '#FFD60A', '#FF2E88', '#FFD60A'],
  ['#FF2E88', '#FFD60A', '#7CFC5A', '#00B4D8'],
  ['#7CFC5A', '#1D4ED8', '#FFD60A', '#FF5A1F'],
  ['#FF5A1F', '#FFD60A', '#00B4D8', '#FFD60A'],
  ['#9B5DE5', '#00F5D4', '#FFD60A', '#F15BB5']
];
const STICKER_BG = ['#FF6B4A', '#3A86FF', '#FFBE0B', '#8338EC', '#06D6A0', '#FB5607'];

const yearOrNo = (s: Subject, index?: number) => (s.cam.year ? String(s.cam.year) : index != null ? numberTag(index) : '');

/* ---------- Pop art ---------- */

function cameraPop(s: Subject, o: CameraCardOpts, credit: string | null) {
  const { c, ctx, w, h } = canvas(o.format);
  const sa = safe(o.format, h);
  const seed = seedOf(s.cam.id);
  const [bg, dots, boom, mid] = POP_SETS[seed % POP_SETS.length];
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  halftone(ctx, 0, 0, w, h, dots, 30, 'br');
  // vạch tốc độ sau lưng máy
  const cy = sa.top + (sa.bottom - sa.top) * 0.42;
  burst(ctx, w * 0.52, cy, Math.min(w, h) * 0.46, 16, boom, '#111', 10, seed);
  // máy: tách tông 3 màu + viền đen dày + bóng đặc lệch
  const src = subjectCanvas(s);
  const pz = s.cut ? posterize(src, ['#111111', mid, '#FFFFFF']) : src;
  const ring = s.cut ? silhouette(pz, '#111', 12) : sticker(src, 12, '#111');
  const shadowC = silhouette(ring, '#111', 0);
  const maxW = w * 0.9, maxH = (sa.bottom - sa.top) * 0.5;
  const ang = -0.07;
  place(ctx, shadowC, w * 0.5 + 22, cy + 22, maxW, maxH, ang);
  place(ctx, ring, w * 0.5, cy, maxW, maxH, ang);
  const inner = Math.min(maxW / ring.width, maxH / ring.height);
  ctx.save(); ctx.translate(w * 0.5, cy); ctx.rotate(ang);
  ctx.drawImage(pz, -(ring.width * inner) / 2 + 12 * inner, -(ring.height * inner) / 2 + 12 * inner, pz.width * inner, pz.height * inner);
  ctx.restore();

  // tên máy: chữ trắng viền đen, bóng màu
  const title = s.cam.model.toUpperCase();
  const size = fitSize(ctx, title, w - 150, 300, 90, (z) => display(z));
  const base = sa.bottom - 70;
  outlined(ctx, title, 70, base, display(size), '#FFFFFF', '#111', 16, -0.04, { color: boom, dx: 12, dy: 12 });
  captionBox(ctx, s.cam.brand.toUpperCase(), 76, base - size * 0.95 - 70, display(46, 800), '#FFFFFF', '#111', -0.04);
  // con số nổ góc trên
  const tag = yearOrNo(s, o.index);
  if (tag) {
    const bx = w - 190, by = sa.top + 120;
    burst(ctx, bx, by, 130, 12, '#FFFFFF', '#111', 8, seed + 3);
    outlined(ctx, tag, bx, by + 22, display(tag.length > 4 ? 52 : 70), '#111', '#FFFFFF', 2, 0.12, undefined, 'center');
  }
  if (o.owner) captionBox(ctx, ownerLine(o.owner), 70, sa.top, sans(26, 700), '#FFFFFF', '#111', 0.02, w * 0.6);
  popFooter(ctx, w, h, sa.bottom, credit);
  return toBlob(c);
}

function popFooter(ctx: Ctx, w: number, _h: number, bottom: number, credit: string | null) {
  const f = display(30, 800);
  const m = measure(ctx, 'CAMERA CABINET', f, 3);
  ctx.fillStyle = '#111'; ctx.fillRect(w - 70 - m.w - 28, bottom - m.asc - 22, m.w + 28, m.asc + 30);
  draw(ctx, { text: 'CAMERA CABINET', font: f, color: '#FFFFFF', ls: 3, align: 'right' }, w - 70 - 14, bottom - 7);
  if (credit) draw(ctx, { text: clip(ctx, credit, w * 0.5, mono(14, 400)), font: mono(14, 400), color: 'rgba(17,17,17,.6)' }, 70, bottom + 30);
}

function collectionPop(subs: Subject[], cams: Camera[], o: CollectionCardOpts) {
  const { c, ctx, w, h } = canvas(o.format, '#111');
  const sa = safe(o.format, h);
  // tiêu đề trên dải đen
  const title = ownerLine(o.owner).toUpperCase();
  const tSize = fitSize(ctx, title, w - 140, 120, 60, (z) => display(z));
  const tm = measure(ctx, title, display(tSize));
  const top = o.format === 'story' ? sa.top : 60;
  outlined(ctx, title, 70, top + tm.asc, display(tSize), '#FFD60A', '#111', 2);
  const statsBase = top + tm.asc + tm.desc + 52;
  draw(ctx, { text: collectionStats(cams).join('  /  '), font: sans(30, 600), color: '#FFFFFF' }, 70, statsBase);
  // lưới Warhol: mỗi ô một bảng màu
  const n = Math.max(1, subs.length);
  const cols = n <= 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const gx = 70, gy = statsBase + 40, gw = w - 140, gh = sa.bottom - 80 - gy;
  const gap = 14;
  const cw = (gw - gap * (cols - 1)) / cols, ch = (gh - gap * (rows - 1)) / rows;
  subs.forEach((s, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const lastSingle = row === rows - 1 && n % cols === 1 && cols > 1;
    const x = gx + (lastSingle ? (gw - cw) / 2 : col * (cw + gap)), y = gy + row * (ch + gap);
    const [bg, dots, boom, mid] = POP_SETS[(i + seedOf(o.owner)) % POP_SETS.length];
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
    ctx.fillStyle = bg; ctx.fillRect(x, y, cw, ch);
    halftone(ctx, x, y, cw, ch, dots, 18, i % 2 ? 'tl' : 'br');
    const src = subjectCanvas(s, 700);
    const pz = s.cut ? posterize(src, ['#111111', mid, '#FFFFFF']) : src;
    const ring = s.cut ? silhouette(pz, '#111', 8) : sticker(src, 8, '#111');
    const ang = (i % 2 ? 0.05 : -0.05);
    place(ctx, silhouette(ring, boom, 0), x + cw / 2 + 12, y + ch * 0.45 + 12, cw * 0.84, ch * 0.62, ang);
    const d = place(ctx, ring, x + cw / 2, y + ch * 0.45, cw * 0.84, ch * 0.62, ang);
    const sc = d.w / ring.width;
    ctx.save(); ctx.translate(x + cw / 2, y + ch * 0.45); ctx.rotate(ang);
    ctx.drawImage(pz, -d.w / 2 + 8 * sc, -d.h / 2 + 8 * sc, pz.width * sc, pz.height * sc);
    ctx.restore();
    const fs = fitSize(ctx, s.cam.model.toUpperCase(), cw - 40, Math.round(ch * 0.16), 26, (z) => display(z));
    outlined(ctx, s.cam.model.toUpperCase(), x + 20, y + ch - 24, display(fs), '#FFFFFF', '#111', 9);
    ctx.restore();
    ctx.lineWidth = 6; ctx.strokeStyle = '#111'; ctx.strokeRect(x, y, cw, ch);
  });
  const f = display(30, 800);
  draw(ctx, { text: 'CAMERA CABINET', font: f, color: '#FFD60A', ls: 3, align: 'right' }, w - 70, sa.bottom - 10);
  return toBlob(c);
}

/* ---------- Sticker ---------- */

function cameraSticker(s: Subject, o: CameraCardOpts, credit: string | null) {
  const seed = seedOf(s.cam.id);
  const bg = STICKER_BG[seed % STICKER_BG.length];
  const { c, ctx, w, h } = canvas(o.format, bg);
  const sa = safe(o.format, h);
  // nền: hoạ tiết sao nhỏ lặp lại
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  const r = rng(seed);
  for (let y = 40; y < h; y += 110) for (let x = (y / 110) % 2 ? 60 : 5; x < w; x += 110) { star(ctx, x + r() * 10, y + r() * 10, 14, 5); }
  const src = subjectCanvas(s);
  const st = sticker(src, Math.round(Math.max(srcW(src), srcH(src)) * 0.035) + 8);
  const cy = sa.top + (sa.bottom - sa.top) * 0.44;
  const d = place(ctx, st, w / 2, cy, w * 0.86, (sa.bottom - sa.top) * 0.56, -0.06, { color: 'rgba(0,0,0,.35)', blur: 30, dx: 0, dy: 16 });
  // tên máy dạng sticker chữ
  const title = s.cam.model.toUpperCase();
  const size = fitSize(ctx, title, w - 180, 220, 90, (z) => display(z));
  const base = Math.min(sa.bottom - 120, cy + d.h / 2 + size * 0.85);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 10;
  outlined(ctx, title, w / 2, base, display(size), '#151413', '#FFFFFF', 30, 0.03, undefined, 'center');
  ctx.restore();
  outlined(ctx, title, w / 2, base, display(size), '#151413', '#FFFFFF', 30, 0.03, undefined, 'center');
  // sticker phụ: hãng, năm/Nº, ống kính
  const pill = (text: string, x: number, y: number, ang: number, fill: string, fg: string, f: string) => {
    const m = measure(ctx, text, f);
    const pw = m.w + 56, ph = m.asc + m.desc + 34;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#FFFFFF'; rounded(ctx, -pw / 2 - 8, -ph / 2 - 8, pw + 16, ph + 16, (ph + 16) / 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = fill; rounded(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fill();
    ctx.font = f; ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.fillText(text, 0, (m.asc - m.desc) / 2);
    ctx.restore();
  };
  pill(s.cam.brand, w * 0.26, sa.top + 70, -0.12, '#151413', '#FFFFFF', sans(40, 700));
  const tag = yearOrNo(s, o.index);
  if (tag) {
    const bx = w - 170, by = sa.top + 110;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(bx, by, 104, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#FFE14D'; ctx.beginPath(); ctx.arc(bx, by, 92, 0, Math.PI * 2); ctx.fill();
    draw(ctx, { text: tag, font: display(tag.length > 4 ? 50 : 64), color: '#151413', align: 'center' }, bx, by + 22);
  }
  const lens = lensLabel(s.cam.lens);
  if (lens) pill(lens, w * 0.7, Math.min(sa.bottom - 40, base + 90), 0.08, '#FFFFFF', '#151413', mono(32, 500));
  draw(ctx, { text: o.owner ? `${ownerLine(o.owner)} · Camera Cabinet` : 'Camera Cabinet', font: sans(26, 600), color: 'rgba(255,255,255,.9)' }, 70, sa.bottom);
  if (credit) draw(ctx, { text: clip(ctx, credit, w - 140, mono(14, 400)), font: mono(14, 400), color: 'rgba(255,255,255,.6)' }, 70, sa.bottom + 30);
  return toBlob(c);
}

function star(ctx: Ctx, cx: number, cy: number, r: number, n: number) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}

function collectionSticker(subs: Subject[], cams: Camera[], o: CollectionCardOpts) {
  const seed = seedOf(o.owner + subs.length);
  const bg = STICKER_BG[seed % STICKER_BG.length];
  const { c, ctx, w, h } = canvas(o.format, bg);
  const sa = safe(o.format, h);
  // tờ giấy sticker: nền nhạt bo góc
  const sheetX = 50, sheetY = sa.top - 20, sheetW = w - 100, sheetH = sa.bottom - sheetY - 40;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#F7F4EE'; rounded(ctx, sheetX, sheetY, sheetW, sheetH, 30); ctx.fill(); ctx.restore();
  const title = ownerLine(o.owner).toUpperCase();
  const size = fitSize(ctx, title, sheetW - 100, 110, 50, (z) => display(z));
  const tm = measure(ctx, title, display(size));
  outlined(ctx, title, sheetX + 50, sheetY + 50 + tm.asc, display(size), bg, '#151413', 6);
  draw(ctx, { text: collectionStats(cams).join('  ·  '), font: sans(28, 600), color: '#151413' }, sheetX + 50, sheetY + 50 + tm.asc + 56);
  const n = Math.max(1, subs.length);
  const cols = n <= 2 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const ax = sheetX + 30, ay = sheetY + 50 + tm.asc + 90, aw = sheetW - 60, ah = sheetY + sheetH - 70 - ay;
  const cw = aw / cols, ch = ah / rows;
  const r = rng(seed);
  subs.forEach((s, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const lastSingle = row === rows - 1 && n % cols === 1 && cols > 1;
    const cx = ax + (lastSingle ? aw / 2 : cw * (col + 0.5)), cy = ay + ch * (row + 0.42);
    const src = subjectCanvas(s, 700);
    const st = sticker(src, Math.round(Math.max(srcW(src), srcH(src)) * 0.04) + 6);
    place(ctx, st, cx, cy, cw * 0.86, ch * 0.66, (r() - 0.5) * 0.2, { color: 'rgba(0,0,0,.28)', blur: 14, dx: 0, dy: 7 });
    const fs = Math.max(24, Math.round(ch * 0.1));
    outlined(ctx, clip(ctx, s.cam.model.toUpperCase(), cw - 40, display(fs)), cx, cy + ch * 0.47, display(fs), '#151413', '#FFFFFF', 10, (r() - 0.5) * 0.1, undefined, 'center');
  });
  draw(ctx, { text: 'Camera Cabinet', font: display(30, 800), color: '#151413', align: 'right' }, sheetX + sheetW - 40, sheetY + sheetH - 30);
  return toBlob(c);
}

/* ---------- Collage ---------- */

function cameraCollage(s: Subject, o: CameraCardOpts, credit: string | null) {
  const { c, ctx, w, h } = canvas(o.format);
  const sa = safe(o.format, h);
  const seed = seedOf(s.cam.id);
  const r = rng(seed);
  newsprint(ctx, w, h, seed);
  const mid = sa.top + (sa.bottom - sa.top) * 0.43;
  // các mảng giấy xé phía sau
  tornPaper(ctx, w * 0.42, mid - 40, w * 0.86, (sa.bottom - sa.top) * 0.42, -0.06, o.accent, seed + 1);
  tornPaper(ctx, w * 0.7, mid + 120, w * 0.5, 220, 0.1, '#1F3A5F', seed + 2);
  // ảnh gốc in nhỏ, dán băng dính
  if (s.img && s.cut) {
    const pw = 300;
    instantPrint(ctx, { cx: w - 210, cy: sa.top + 150, width: pw, angle: 0.09, img: s.img, type: s.cam.type, caption: '' });
    tape(ctx, w - 210, sa.top + 150 - pw * 0.58, 150, -0.1);
  }
  // máy cắt rời, viền trắng như cắt bằng kéo
  const src = subjectCanvas(s);
  const st = sticker(src, Math.round(Math.max(srcW(src), srcH(src)) * 0.022) + 6, '#FBFAF6');
  const d = place(ctx, st, w * 0.47, mid, w * 0.9, (sa.bottom - sa.top) * 0.5, -0.04 + (r() - 0.5) * 0.04, { color: 'rgba(30,20,10,.42)', blur: 24, dx: 6, dy: 16 });
  tape(ctx, w * 0.47 - d.w * 0.42, mid - d.h * 0.42, 170, -0.6);
  tape(ctx, w * 0.47 + d.w * 0.4, mid + d.h * 0.38, 150, -0.5);
  // tên máy cắt chữ báo
  const brandBase = mid + d.h / 2 + 90;
  draw(ctx, { text: s.cam.brand, font: hand(64), color: '#151413' }, 80, brandBase);
  const t = ransom(ctx, s.cam.model.toUpperCase(), 70, brandBase + 160, w - 140, 150, seed, o.accent);
  // ghi chú tay + mũi tên chỉ vào máy
  const note = [lensLabel(s.cam.lens), s.cam.year ? String(s.cam.year) : null].filter(Boolean).join(', ');
  if (note) {
    const nx = Math.min(w - 330, 80 + t.width + 40), ny = brandBase + 40;
    const nf = hand(46);
    draw(ctx, { text: note, font: nf, color: '#B4232C' }, nx, ny + 10);
    handArrow(ctx, nx + 60, ny - 40, w * 0.6, mid + d.h * 0.3, '#B4232C');
  }
  if (s.cam.film) draw(ctx, { text: tx("Đang lắp {0}", s.cam.film.stock), font: hand(40), color: '#1F3A5F' }, 80, Math.min(sa.bottom - 70, brandBase + 160 + 70));
  stamp(ctx, 'CAMERA CABINET', w - 230, sa.bottom - 40, -0.12, '#B4232C', 28);
  if (o.owner) draw(ctx, { text: ownerLine(o.owner), font: hand(40), color: '#151413' }, 80, sa.bottom);
  if (o.index != null) draw(ctx, { text: numberTag(o.index), font: hand(54), color: '#151413' }, 80, sa.top + 40);
  if (credit) draw(ctx, { text: clip(ctx, credit, w - 140, mono(14, 400)), font: mono(14, 400), color: 'rgba(21,20,19,.5)' }, 70, sa.bottom + 34);
  return toBlob(c);
}

function collectionCollage(subs: Subject[], cams: Camera[], o: CollectionCardOpts) {
  const { c, ctx, w, h } = canvas(o.format);
  const sa = safe(o.format, h);
  const seed = seedOf(o.owner + subs.map((s) => s.cam.id).join(''));
  const r = rng(seed);
  newsprint(ctx, w, h, seed);
  // tiêu đề cắt chữ
  const head = o.owner ? tx("Bộ sưu tập của {0}", o.owner) : tx("Bộ sưu tập máy ảnh");
  const tt = ransom(ctx, head.toUpperCase(), 64, sa.top + 110, w - 128, 100, seed, o.accent);
  draw(ctx, { text: collectionStats(cams).join(', '), font: hand(46), color: '#B4232C' }, 70, sa.top + 110 + 70);
  void tt;
  // mảng giấy nền
  tornPaper(ctx, w * 0.3, h * 0.48, w * 0.7, h * 0.32, -0.08, o.accent, seed + 1);
  tornPaper(ctx, w * 0.72, h * 0.62, w * 0.62, h * 0.26, 0.07, '#1F3A5F', seed + 2);
  // các máy cắt rời rải trên trang
  const n = Math.max(1, subs.length);
  const cols = n <= (o.format === 'story' ? 3 : 2) ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const ay = sa.top + 230, ah = sa.bottom - 110 - ay, aw = w - 100;
  const cw = aw / cols, ch = ah / rows;
  subs.forEach((s, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const lastSingle = row === rows - 1 && n % cols === 1 && cols > 1;
    const cx = 50 + (lastSingle ? aw / 2 : cw * (col + 0.5)) + (r() - 0.5) * 40 + (cols === 1 && n > 1 ? (i % 2 ? 1 : -1) * w * 0.1 : 0);
    const cy = ay + ch * (row + 0.45) + (r() - 0.5) * 30;
    const src = subjectCanvas(s, 700);
    const st = sticker(src, Math.round(Math.max(srcW(src), srcH(src)) * 0.025) + 5, '#FBFAF6');
    const ang = (r() - 0.5) * 0.22;
    const d = place(ctx, st, cx, cy, Math.min(cw, w * 0.78), ch * 0.78, ang, { color: 'rgba(30,20,10,.4)', blur: 18, dx: 4, dy: 10 });
    if (r() > 0.4) tape(ctx, cx - d.w * 0.38, cy - d.h * 0.4, 110, -0.5 + r() * 0.3);
    // nhãn tên dán băng dính
    const label = s.cam.model;
    const f = hand(Math.max(30, Math.round(ch * 0.09)));
    const m = measure(ctx, label, f);
    const lx = cx - m.w / 2 - 16, ly = cy + d.h * 0.42;
    ctx.save(); ctx.translate(lx + m.w / 2 + 16, ly); ctx.rotate((r() - 0.5) * 0.12);
    ctx.fillStyle = 'rgba(245,242,234,.95)'; ctx.fillRect(-m.w / 2 - 16, -m.asc - 10, m.w + 32, m.asc + m.desc + 22);
    ctx.font = f; ctx.fillStyle = '#151413'; ctx.textAlign = 'center'; ctx.fillText(label, 0, 2);
    ctx.restore();
  });
  stamp(ctx, 'CAMERA CABINET', w - 230, sa.bottom - 20, -0.1, '#B4232C', 28);
  return toBlob(c);
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/jpeg', 0.9));
}

/** Tên file: camera-cabinet-olympus-xa.jpg */
export function cardFileName(parts: string[]) {
  const slug = parts.join('-').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `camera-cabinet-${slug || 'share'}.jpg`;
}
