/* Ảnh mẫu trong thư viện chỉ lấy từ Wikimedia Commons (ảnh có giấy phép dùng lại, kèm ghi công). */

const FILE_RE = /^[^/?#\\|<>[\]{}]{1,220}\.(jpe?g|png|tiff?|webp|gif|svg)$/i;

/**
 * "File:Ricoh R1.jpg", "Ricoh_R1.jpg", link trang commons.wikimedia.org/wiki/File:…
 * hoặc link ảnh upload.wikimedia.org → tên file trên Commons. Link nơi khác → null.
 */
export function commonsFileFrom(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  let name = t;
  if (/^https?:\/\//i.test(t)) {
    let u: URL;
    try { u = new URL(t); } catch { return null; }
    const host = u.hostname.toLowerCase();
    if (/(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$/.test(host) && host !== 'upload.wikimedia.org') {
      const fromPath = u.pathname.match(/\/wiki\/(?:File|Tập_tin|Datei|Fichier):(.+)$/i)?.[1];
      const fromQuery = u.searchParams.get('title')?.replace(/^File:/i, '');
      name = fromPath ?? fromQuery ?? '';
    } else if (host === 'upload.wikimedia.org') {
      const parts = u.pathname.split('/').filter(Boolean);
      const i = parts.indexOf('thumb');
      name = i >= 0 ? parts[i + 3] ?? '' : parts[parts.length - 1] ?? '';
    } else return null;
  }
  try { name = decodeURIComponent(name); } catch { /* giữ nguyên */ }
  name = name.replace(/^(File|Tập_tin|Tập tin):/i, '').replace(/_/g, ' ').trim();
  return FILE_RE.test(name) ? name : null;
}
