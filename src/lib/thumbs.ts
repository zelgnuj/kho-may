import { useEffect, useState } from 'react';
import { db } from '../db';
import { compressImage } from './images';
import { thumbUrls } from './thumbCache';

/* ======================================================================
 * Ảnh thu nhỏ cho lưới / danh sách
 * - Tạo một lần từ ảnh gốc (cạnh dài 480px), lưu trong bảng thumbs trên máy.
 * - Giữ sẵn URL trong bộ nhớ để quay lại trang không phải giải mã lại.
 * ====================================================================== */

const urls = thumbUrls;
const inflight = new Map<string, Promise<string | null>>();

async function load(photoId: string): Promise<string | null> {
  const hit = urls.get(photoId);
  if (hit) return hit;
  if (!inflight.has(photoId)) {
    inflight.set(photoId, (async () => {
      try {
        let t = await db.thumbs.get(photoId);
        if (!t) {
          const p = await db.photos.get(photoId);
          if (!p?.blob) return null;
          const small = await compressImage(p.blob, 480, 0.8);
          t = { id: photoId, blob: small };
          await db.thumbs.put(t);
        }
        const u = URL.createObjectURL(t.blob);
        urls.set(photoId, u);
        return u;
      } catch {
        return null;
      } finally {
        inflight.delete(photoId);
      }
    })());
  }
  return inflight.get(photoId)!;
}

/** URL ảnh thu nhỏ của một ảnh (null khi đang tạo / không có) */
/** undefined = đang tải, null = không có ảnh (đã xoá / chưa tải về) */
export function useThumb(photoId: string | null | undefined) {
  const [url, setUrl] = useState<string | null | undefined>(() => (photoId ? urls.get(photoId) : null));
  useEffect(() => {
    if (!photoId) { setUrl(null); return; }
    const cached = urls.get(photoId);
    if (cached) { setUrl(cached); return; }
    setUrl(undefined);
    let alive = true;
    load(photoId).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [photoId]);
  return url;
}

/** Tạo sẵn ảnh thu nhỏ cho ảnh mới (gọi sau khi thêm ảnh) */
export function warmThumbs(ids: string[]) {
  ids.forEach((id) => { load(id); });
}
