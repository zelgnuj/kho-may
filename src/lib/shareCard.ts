import type { Camera } from '../db';
import { ART } from '../components/CameraArt';
import { cameraImage, loadImage } from './cameraImage';
import { TYPE_LABEL, lensLabel } from './format';
import { lang, tx } from './i18n';

/* ======================================================================
 * Ảnh chia sẻ lên mạng xã hội, vẽ hoàn toàn trên máy bằng canvas.
 * Ảnh xuất ra là JPEG mới → không mang theo EXIF/GPS của ảnh gốc.
 * ====================================================================== */

export type CardStyle = 'catalog' | 'film';
export type CardFormat = 'post' | 'story';

const SIZE: Record<CardFormat, [number, number]> = { post: [1080, 1350], story: [1080, 1920] };
const BG = '#0E0D0C';
const TEXT = '#F3EFE7';
const MUTED = '#8C857B';
const ART_STROKE = '#77716A';
const FILM_ORANGE = '#F08A3C';

const F_DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const F_SANS = '"Be Vietnam Pro", system-ui, sans-serif';
const F_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

async function fontsReady(sample: string) {
  try {
    await Promise.all([
      document.fonts.load(`800 100px ${F_DISPLAY}`, sample),
      document.fonts.load(`500 30px ${F_MONO}`, sample),
      document.fonts.load(`400 30px ${F_MONO}`, sample),
      document.fonts.load(`500 30px ${F_SANS}`, sample)
    ]);
  } catch { /* vẽ bằng font dự phòng */ }
}

function canvas(format: CardFormat) {
  const [w, h] = SIZE[format];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  return { c, ctx, w, h };
}

type Ctx = CanvasRenderingContext2D;

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
function art(ctx: Ctx, type: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#1A1917';
  ctx.fillRect(x, y, w, h);
  const scale = Math.min(w * 0.6 / 120, h * 0.6 / 80);
  ctx.save();
  ctx.translate(x + (w - 120 * scale) / 2, y + (h - 80 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = ART_STROKE; ctx.lineWidth = Math.max(0.8, 2.4 / scale * 1.4); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke(new Path2D(ART[type] ?? ART.RF));
  ctx.restore();
}

/** Chữ co lại cho vừa chiều ngang; nhỏ quá mức thì cắt bớt bằng dấu … */
function fitText(ctx: Ctx, text: string, x: number, y: number, maxW: number, size: number, font: (s: number) => string, min = size * 0.5) {
  let s = size;
  ctx.font = font(s);
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; ctx.font = font(s); }
  let t = text;
  if (ctx.measureText(t).width > maxW) {
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    t += '…';
  }
  ctx.fillText(t, x, y);
  return s;
}

const metaLine = (c: Camera) => [c.year ? String(c.year) : null, lensLabel(c.lens), TYPE_LABEL[c.type] ?? null].filter(Boolean).join('  ·  ');

const ownerLine = (owner: string) => (owner ? tx("Bộ sưu tập của {0}", owner) : tx("Bộ sưu tập"));

function footer(ctx: Ctx, w: number, y: number, left: string, accent: string) {
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED; ctx.font = `500 24px ${F_SANS}`; spacing(ctx, 0);
  fitText(ctx, left, 64, y, w - 64 * 2 - 300, 24, (s) => `500 ${s}px ${F_SANS}`);
  ctx.textAlign = 'right';
  ctx.fillStyle = accent; ctx.font = `500 22px ${F_MONO}`; spacing(ctx, 5);
  ctx.fillText('CAMERA CABINET', w - 64, y);
  spacing(ctx, 0); ctx.textAlign = 'left';
}

/* ---------- Dải phim: lỗ răng cưa + chữ in mép ---------- */

function sprockets(ctx: Ctx, x: number, y: number, w: number, band: number) {
  const hole = { w: band * 0.42, h: band * 0.5 };
  const step = hole.w * 2.1;
  ctx.fillStyle = BG;
  for (let px = x + step * 0.4; px + hole.w < x + w; px += step) {
    rounded(ctx, px, y + (band - hole.h) / 2, hole.w, hole.h, hole.h * 0.22);
    ctx.fill();
  }
}

function edgeText(ctx: Ctx, text: string, x: number, y: number, size: number) {
  ctx.fillStyle = FILM_ORANGE; ctx.font = `500 ${size}px ${F_MONO}`; spacing(ctx, size * 0.18);
  ctx.fillText(text, x, y); spacing(ctx, 0);
}

function dateStamp(ctx: Ctx, x: number, y: number, d = new Date()) {
  const s = `'${String(d.getFullYear()).slice(2)}  ${String(d.getMonth() + 1).padStart(2, ' ')}  ${String(d.getDate()).padStart(2, ' ')}`;
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = `500 38px ${F_MONO}`; spacing(ctx, 2);
  ctx.shadowColor = 'rgba(255,120,40,.85)'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#FF9A4D';
  ctx.fillText(s, x, y);
  ctx.restore();
  spacing(ctx, 0);
}

/* ---------- Một máy ---------- */

export interface CameraCardOpts { style: CardStyle; format: CardFormat; owner: string; accent: string; photoId?: string | null; index?: number }

export async function renderCameraCard(cam: Camera, o: CameraCardOpts): Promise<Blob> {
  const title = cam.model.toUpperCase();
  await fontsReady(title + cam.brand + ownerLine(o.owner) + 'ÁÀẢÃẠĂÂĐÊÔƠƯ');
  const src = await cameraImage(cam, 'full', o.photoId);
  const img = src ? await loadImage(src.src) : null;
  const { c, ctx, w, h } = canvas(o.format);
  const M = 64;
  const story = o.format === 'story';
  const top = story ? 190 : M;
  const textH = 300;
  const bottom = h - (story ? 210 : 40);
  const px = M, pw = w - M * 2;
  let py = top, ph = bottom - textH - top;
  const photoBottom = top + ph;

  if (o.style === 'film') {
    // Ảnh nằm trong một khung phim: dải đen, lỗ răng cưa trên/dưới, chữ in mép màu cam
    const band = 54;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, py, w, ph);
    sprockets(ctx, 0, py, w, band);
    sprockets(ctx, 0, py + ph - band, w, band);
    const stock = (cam.film?.stock ?? `${cam.brand} ${cam.model}`).toUpperCase();
    const frame = o.index != null ? `${o.index + 1}` : '1';
    edgeText(ctx, `${stock}   ▸ ${frame}`, px + 8, py + ph - band - 14, 22);
    ctx.textAlign = 'right'; edgeText(ctx, `${frame}A  ▸`, w - px - 8, py + band + 30, 22); ctx.textAlign = 'left';
    py += band + 46; ph -= (band + 46) * 2;
    if (img) cover(ctx, img, px, py, pw, ph); else art(ctx, cam.type, px, py, pw, ph);
    if (img) dateStamp(ctx, px + pw - 30, py + ph - 30);
  } else {
    ctx.save();
    rounded(ctx, px, py, pw, ph, 24); ctx.clip();
    if (img) cover(ctx, img, px, py, pw, ph); else art(ctx, cam.type, px, py, pw, ph);
    ctx.restore();
  }
  src?.revoke?.();

  // Chữ
  let y = bottom - textH + 78;
  ctx.textAlign = 'left';
  const no = o.index != null ? `Nº ${String(o.index + 1).padStart(2, '0')}  ·  ` : '';
  ctx.fillStyle = o.accent; ctx.font = `500 26px ${F_MONO}`; spacing(ctx, 4);
  fitText(ctx, `${no}${cam.brand.toUpperCase()}`, px, y, pw, 26, (s) => `500 ${s}px ${F_MONO}`);
  spacing(ctx, 0);
  y += 112;
  ctx.fillStyle = TEXT;
  fitText(ctx, title, px - 4, y, pw, 124, (s) => `800 ${s}px ${F_DISPLAY}`);
  y += 56;
  const meta = metaLine(cam);
  if (meta) { ctx.fillStyle = MUTED; fitText(ctx, meta, px, y, pw, 27, (s) => `400 ${s}px ${F_MONO}`); }
  if (cam.film && o.style === 'catalog') {
    y += 42;
    ctx.fillStyle = MUTED; fitText(ctx, tx("Đang lắp {0}", cam.film.stock), px, y, pw, 24, (s) => `400 ${s}px ${F_MONO}`);
  }
  footer(ctx, w, bottom + (story ? 0 : 6), o.owner ? ownerLine(o.owner) : '', o.accent);
  if (src && !src.own && src.credit) {
    ctx.fillStyle = '#5E5850'; ctx.textAlign = 'right';
    fitText(ctx, `${tx("Ảnh mẫu:")} ${src.credit} / Wikimedia Commons`, w - M, photoBottom + 30, pw, 16, (s) => `400 ${s}px ${F_MONO}`);
    ctx.textAlign = 'left';
  }
  return toBlob(c);
}

/* ---------- Cả bộ sưu tập ---------- */

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
  const parts = [
    lang === 'vi' ? `${owned.length} máy` : `${owned.length} ${owned.length === 1 ? 'camera' : 'cameras'}`,
    lang === 'vi' ? `${brands} hãng` : `${brands} ${brands === 1 ? 'brand' : 'brands'}`,
    span
  ];
  return parts.filter(Boolean).join('  ·  ');
}

export async function renderCollectionCard(cams: Camera[], o: CollectionCardOpts): Promise<Blob> {
  const story = o.format === 'story';
  const film = o.style === 'film';
  const [W, H] = SIZE[o.format];
  const M = 64;
  const top = story ? 200 : 76;
  const gridTop = top + 256;
  const footerY = H - (story ? 200 : 40);
  const avail = footerY - 56 - gridTop;
  const total = pickForCollage(cams, 99).length;

  // Bố cục theo số máy: ít máy thì ô to, nhiều máy thì lưới 3 cột, không để ô trống thừa
  let cols: number, cellW: number, cellH: number, gap: number, rows: number;
  const band = 30;
  if (film) {
    cols = 3; gap = 22;
    cellW = (W - M * 2 - gap * (cols - 1)) / cols;
    cellH = cellW * 2 / 3 + band * 2;
    const fitRows = Math.max(1, Math.floor((avail + gap) / (cellH + gap)));
    rows = Math.min(fitRows, Math.max(1, Math.ceil(total / cols)));
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
  const title = tx("Kho máy").toUpperCase();
  await fontsReady(title + ownerLine(o.owner) + pick.map((c) => c.model).join(''));
  const imgs = await Promise.all(pick.map(async (c) => {
    const s = await cameraImage(c, 'thumb');
    return s ? loadImage(s.src) : null;
  }));
  const { c, ctx, w, h } = canvas(o.format);
  void h;

  // Tiêu đề
  ctx.textAlign = 'left';
  ctx.fillStyle = o.accent; ctx.font = `500 26px ${F_MONO}`; spacing(ctx, 5);
  fitText(ctx, (film ? 'CONTACT SHEET  ·  ' : '') + ownerLine(o.owner).toUpperCase(), M, top + 26, w - M * 2, 26, (s) => `500 ${s}px ${F_MONO}`);
  spacing(ctx, 0);
  ctx.fillStyle = TEXT;
  fitText(ctx, title, M - 4, top + 160, w - M * 2, 150, (s) => `800 ${s}px ${F_DISPLAY}`);
  ctx.fillStyle = MUTED;
  fitText(ctx, collectionStats(cams), M, top + 214, w - M * 2, 28, (s) => `400 ${s}px ${F_MONO}`);

  const gridH = rows * cellH + (rows - 1) * gap;
  const y0 = gridTop + Math.max(0, (avail - gridH) / 2);
  const gridW = cols * cellW + (cols - 1) * gap;
  const x0 = (w - gridW) / 2;

  if (film) {
    // Tờ contact sheet: mỗi hàng là một dải phim, khung 3:2
    const fh = cellH - band * 2;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * (cellH + gap);
      ctx.fillStyle = '#050505'; ctx.fillRect(0, y, w, cellH);
      sprockets(ctx, 0, y, w, band);
      sprockets(ctx, 0, y + cellH - band, w, band);
      for (let k = 0; k < cols; k++) {
        const i = r * cols + k;
        const x = x0 + k * (cellW + gap);
        const cam = pick[i];
        if (!cam) { ctx.fillStyle = '#121110'; ctx.fillRect(x, y + band, cellW, fh); continue; }
        const img = imgs[i];
        if (img) cover(ctx, img, x, y + band, cellW, fh); else art(ctx, cam.type, x, y + band, cellW, fh);
        ctx.font = `500 15px ${F_MONO}`; ctx.fillStyle = FILM_ORANGE; spacing(ctx, 2);
        ctx.fillText(`▸ ${i + 1}  ${cam.model.toUpperCase()}`.slice(0, 26), x + 2, y + cellH - 9);
        spacing(ctx, 0);
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const lastRowCount = n - Math.floor((n - 1) / cols) * cols;
      const row = Math.floor(i / cols);
      const inLast = row === rows - 1 && lastRowCount < cols;
      // Hàng cuối thiếu ô thì căn giữa
      const shift = inLast ? ((cols - lastRowCount) * (cellW + gap)) / 2 : 0;
      const x = x0 + shift + (i % cols) * (cellW + gap);
      const y = y0 + row * (cellH + gap);
      ctx.save(); rounded(ctx, x, y, cellW, cellH, cols === 1 ? 24 : 14); ctx.clip();
      if (imgs[i]) cover(ctx, imgs[i]!, x, y, cellW, cellH); else art(ctx, pick[i].type, x, y, cellW, cellH);
      ctx.restore();
    }
  }
  const when = new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' });
  footer(ctx, w, footerY, when.charAt(0).toUpperCase() + when.slice(1), o.accent);
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
