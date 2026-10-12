import type { Camera } from '../db';
import { ART } from '../components/CameraArt';
import { cameraImage, loadImage } from './cameraImage';
import { TYPE_LABEL, lensLabel } from './format';
import { lang, tx } from './i18n';

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

export type CardStyle = 'poster' | 'instant' | 'film';
export type CardFormat = 'post' | 'story';

const SIZE: Record<CardFormat, [number, number]> = { post: [1080, 1350], story: [1080, 1920] };
const BG = '#0E0D0C';
const PAPER = '#F3EFE7';
const SOFT = '#CFC7BA';
const MUTED = '#8C857B';
const ART_STROKE = '#77716A';
const EDGE = '#F08A3C';
const WOOD = '#2A1D15';
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

/** Nền mờ từ chính ảnh (thu nhỏ rồi phóng to: chạy được cả trên Safari) */
function blurBackdrop(ctx: Ctx, img: HTMLImageElement, w: number, h: number) {
  const t = document.createElement('canvas');
  t.width = 40; t.height = Math.round(40 * h / w);
  const tc = t.getContext('2d')!;
  cover(tc, img, 0, 0, t.width, t.height);
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(t, -w * 0.05, -h * 0.05, w * 1.1, h * 1.1);
  ctx.fillStyle = 'rgba(8,7,6,.5)'; ctx.fillRect(0, 0, w, h);
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

function table(ctx: Ctx, w: number, h: number, seed: number) {
  ctx.fillStyle = WOOD; ctx.fillRect(0, 0, w, h);
  // thớ gỗ: các vệt ngang mờ, lệch nhau
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const y = r() * h, th = 1 + r() * 5;
    ctx.fillStyle = r() > 0.5 ? `rgba(255,220,180,${0.015 + r() * 0.03})` : `rgba(0,0,0,${0.04 + r() * 0.06})`;
    ctx.fillRect(0, y, w, th);
  }
  const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.45, h * 0.8);
  g.addColorStop(0, 'rgba(255,214,170,.12)');
  g.addColorStop(1, 'rgba(0,0,0,.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

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
  const blob = o.style === 'instant' ? cameraInstant(cam, o, img, credit) : o.style === 'film' ? cameraFilm(cam, o, img, credit) : cameraPoster(cam, o, img, credit);
  return blob;
}

/** Áp phích: ảnh tràn khung, tên máy thật to ở đáy */
function cameraPoster(cam: Camera, o: CameraCardOpts, img: HTMLImageElement | null, credit: string | null) {
  const { c, ctx, w, h } = canvas(o.format);
  const sa = safe(o.format, h);
  const M = 72;
  if (img) {
    const ar = img.naturalWidth / img.naturalHeight;
    if (ar / (w / h) > 1.3) {
      // ảnh ngang trong khung dọc: giữ trọn ảnh, nền là chính ảnh làm mờ
      blurBackdrop(ctx, img, w, h);
      const ph = w / ar;
      const py = Math.max(sa.top + 80, h * 0.42 - ph / 2);
      cover(ctx, img, 0, py, w, ph);
    } else cover(ctx, img, 0, 0, w, h);
  } else art(ctx, cam.type, 0, 0, w, h * 0.72, '#16140F');
  // bóng tối để chữ nổi
  const g = ctx.createLinearGradient(0, h * 0.4, 0, h);
  g.addColorStop(0, 'rgba(8,7,6,0)'); g.addColorStop(0.55, 'rgba(8,7,6,.66)'); g.addColorStop(1, 'rgba(8,7,6,.94)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const gt = ctx.createLinearGradient(0, 0, 0, sa.top + 160);
  gt.addColorStop(0, 'rgba(8,7,6,.55)'); gt.addColorStop(1, 'rgba(8,7,6,0)');
  ctx.fillStyle = gt; ctx.fillRect(0, 0, w, sa.top + 160);

  // đầu: chữ ký trái, số thứ tự phải
  const head = measure(ctx, 'Camera Cabinet', display(38, 700), 1.5);
  wordmark(ctx, M, sa.top + head.asc, PAPER, 38, 'left');
  if (o.index != null) draw(ctx, { text: numberTag(o.index), font: display(38, 700), color: o.accent, align: 'right' }, w - M, sa.top + head.asc);

  // đáy: hãng → tên máy → thông số → film → chủ nhân
  const maxW = w - M * 2;
  const t = titleLines(ctx, cam.model.toUpperCase(), maxW, 300, 120, (s) => display(s));
  const lines: Line[] = [{ text: cam.brand, font: sans(42, 600), color: SOFT, gap: 14, shadow: true }];
  t.lines.forEach((l, i) => lines.push({ text: l, font: display(t.size), color: PAPER, gap: i < t.lines.length - 1 ? t.size * 0.06 : 34, shadow: true }));
  let bottom = sa.bottom;
  if (o.owner) {
    draw(ctx, { text: clip(ctx, ownerLine(o.owner), maxW, sans(26)), font: sans(26), color: MUTED }, M, bottom - measure(ctx, 'g', sans(26)).desc);
    bottom -= 26 + 30;
  }
  if (cam.film) {
    const f = tx("Đang lắp {0}", cam.film.stock);
    draw(ctx, { text: clip(ctx, f, maxW, sans(30, 600)), font: sans(30, 600), color: o.accent }, M, bottom - measure(ctx, f, sans(30, 600)).desc);
    bottom -= 30 + 26;
  }
  const specs = specItems(cam);
  if (specs.length) {
    specRow(ctx, specs, M, bottom, maxW, 32, PAPER, o.accent);
    bottom -= measure(ctx, 'H', sans(32)).asc + 34;
  }
  stackUp(ctx, lines.map((l, i) => (i === lines.length - 1 ? { ...l, gap: 0 } : l)), M, bottom);
  if (credit) draw(ctx, { text: clip(ctx, credit, maxW, mono(16, 400)), font: mono(16, 400), color: 'rgba(243,239,231,.45)', align: 'right' }, w - M, sa.top + head.asc + 34);
  return toBlob(c);
}

/** Ảnh lấy liền trên mặt bàn */
function cameraInstant(cam: Camera, o: CameraCardOpts, img: HTMLImageElement | null, credit: string | null) {
  const { c, ctx, w, h } = canvas(o.format, WOOD);
  const sa = safe(o.format, h);
  table(ctx, w, h, seedOf(cam.id));
  const pw = o.format === 'story' ? 860 : 780;
  const cy = o.format === 'story' ? (sa.top + sa.bottom) / 2 - 20 : (sa.top + sa.bottom - 70) / 2;
  const sub = [cam.year ? String(cam.year) : null, lensLabel(cam.lens)].filter(Boolean).join(', ');
  instantPrint(ctx, { cx: w / 2, cy, width: pw, angle: -0.035, img, type: cam.type, caption: `${cam.brand} ${cam.model}`, sub: sub || undefined, corner: o.index != null ? numberTag(o.index) : undefined });
  // chân: chủ nhân trái, chữ ký phải
  const base = sa.bottom;
  if (o.owner) draw(ctx, { text: clip(ctx, ownerLine(o.owner), w - 72 * 2 - 320, sans(26)), font: sans(26), color: 'rgba(240,226,208,.7)' }, 72, base);
  wordmark(ctx, w - 72, base, 'rgba(240,226,208,.85)', 34);
  if (credit) draw(ctx, { text: clip(ctx, credit, w - 144, mono(16, 400)), font: mono(16, 400), color: 'rgba(240,226,208,.4)' }, 72, sa.top);
  return toBlob(c);
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

  if (o.style === 'instant') {
    const n = Math.min(total, story ? 6 : 4);
    const pick = pickForCollage(cams, n);
    const imgs = await Promise.all(pick.map(async (c) => { const s = await cameraImage(c, 'thumb'); return s ? loadImage(s.src) : null; }));
    const { c, ctx, w } = canvas(o.format, WOOD);
    table(ctx, w, H, seedOf(pick.map((x) => x.id).join('')));
    const headBottom = collectionHeader(ctx, cams, o, sa.top, w, '#F0E2D0', o.accent);
    const areaTop = headBottom + 30, areaBottom = sa.bottom - 70;
    const cols = n <= 1 ? 1 : 2;
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = (w - 72 * 2) / cols, cellH = (areaBottom - areaTop) / rows;
    // bề rộng tấm ảnh: vừa ô (ảnh cao = 1.19 × rộng)
    const pw = Math.min(cellW * 0.92, (cellH * 0.94) / 1.19, 620);
    const r = rng(seedOf(pick.map((x) => x.model).join('')));
    pick.forEach((cam, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const lastRowSingle = row === rows - 1 && n % cols === 1 && cols > 1;
      const cx = 72 + (lastRowSingle ? (w - 144) / 2 : cellW * (col + 0.5)) + (r() - 0.5) * cellW * 0.08;
      const cy = areaTop + cellH * (row + 0.5) + (r() - 0.5) * cellH * 0.06;
      instantPrint(ctx, { cx, cy, width: pw, angle: (r() - 0.5) * 0.22, img: imgs[i], type: cam.type, caption: cam.model, sub: cam.brand });
    });
    collectionFooter(ctx, w, sa.bottom, 'rgba(240,226,208,.85)', 'rgba(240,226,208,.6)');
    return toBlob(c);
  }

  const film = o.style === 'film';
  const { c, ctx, w } = canvas(o.format);
  const gridTop = collectionHeader(ctx, cams, o, sa.top, w) + (film ? 34 : 40);
  const footerBase = sa.bottom;
  const avail = footerBase - 64 - gridTop;
  const M = 72;

  let cols: number, cellW: number, cellH: number, gap: number, rows: number;
  const band = 46;
  if (film) {
    cols = total >= 5 ? 3 : total >= 2 ? 2 : 1; gap = 22;
    cellW = (W - M * 2 - gap * (cols - 1)) / cols;
    cellH = cellW * 2 / 3 + band * 2;
    rows = Math.min(Math.max(1, Math.floor((avail + gap) / (cellH + gap))), Math.max(1, Math.ceil(total / cols)));
  } else {
    gap = 12;
    cols = total <= 1 ? 1 : total <= 4 ? 2 : 3;
    const maxRows = cols === 3 ? (story ? 4 : 3) : 2;
    rows = Math.min(maxRows, Math.max(1, Math.ceil(total / cols)));
    cellW = Math.min((W - M * 2 - gap * (cols - 1)) / cols, (avail - gap * (rows - 1)) / rows);
    cellH = cellW;
  }
  const n = Math.min(total, cols * rows);
  const pick = pickForCollage(cams, n);
  const imgs = await Promise.all(pick.map(async (cam) => { const s = await cameraImage(cam, 'thumb'); return s ? loadImage(s.src) : null; }));
  const gridH = rows * cellH + (rows - 1) * gap;
  const y0 = gridTop + Math.max(0, (avail - gridH) * 0.3);
  const gridW = cols * cellW + (cols - 1) * gap;
  const x0 = (w - gridW) / 2;

  if (film) {
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
  } else {
    const lastRowCount = n - Math.floor((n - 1) / cols) * cols;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const shift = row === rows - 1 && lastRowCount < cols ? ((cols - lastRowCount) * (cellW + gap)) / 2 : 0;
      const x = x0 + shift + (i % cols) * (cellW + gap);
      const y = y0 + row * (cellH + gap);
      ctx.save(); rounded(ctx, x, y, cellW, cellH, cols === 1 ? 24 : 14); ctx.clip();
      if (imgs[i]) cover(ctx, imgs[i]!, x, y, cellW, cellH); else art(ctx, pick[i].type, x, y, cellW, cellH);
      // tên máy nhỏ ở góc ô
      const g = ctx.createLinearGradient(0, y + cellH * 0.6, 0, y + cellH);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)');
      ctx.fillStyle = g; ctx.fillRect(x, y + cellH * 0.6, cellW, cellH * 0.4);
      const fs = Math.max(20, Math.round(cellW * 0.085));
      draw(ctx, { text: clip(ctx, pick[i].model.toUpperCase(), cellW - 32, display(fs)), font: display(fs), color: PAPER }, x + 16, y + cellH - 16);
      ctx.restore();
    }
  }
  collectionFooter(ctx, w, footerBase, o.accent);
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
