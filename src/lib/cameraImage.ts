import { db, type Camera } from '../db';
import { findModel } from './catalog';
import { fetchImage } from './sampleImage';
import { thumbUrl } from './thumbs';

/* Ảnh để trưng bày / chia sẻ một máy: ảnh của bạn, không có thì ảnh mẫu Wikimedia (kèm ghi công) */

export interface CamImage { src: string; own: boolean; credit?: string; revoke?: () => void }

/** size 'full' = ảnh gốc, 'thumb' = 480px (đủ cho ô lưới) */
export async function cameraImage(cam: Camera, size: 'full' | 'thumb' = 'full', photoId?: string | null): Promise<CamImage | null> {
  const id = photoId ?? cam.coverPhotoId;
  if (id) {
    if (size === 'thumb') {
      const u = await thumbUrl(id);
      if (u) return { src: u, own: true };
    } else {
      const p = await db.photos.get(id);
      if (p?.blob) { const u = URL.createObjectURL(p.blob); return { src: u, own: true, revoke: () => URL.revokeObjectURL(u) }; }
    }
  }
  const m = findModel(cam.brand, cam.model);
  if (!m) return null;
  const s = await fetchImage(m).catch(() => null);
  return s ? { src: s.url, own: false, credit: [s.artist, s.license].filter(Boolean).join(' · ') } : null;
}

/** Tải ảnh để vẽ lên canvas. Ảnh ngoài phải cho phép CORS, không thì trả null */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}
