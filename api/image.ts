/**
 * GET /api/image?qid=Q123&file=Tên_file.jpg&q=Olympus%20XA
 * Lấy ảnh mẫu có giấy phép tự do từ Wikimedia Commons cho một mẫu máy:
 *  - `file`: tên file Commons (người dùng đóng góp) — ưu tiên
 *  - `qid`: mã Wikidata của mẫu máy → thuộc tính P18 (ảnh)
 *  - `q`: tên máy (khi chưa có mã) → tìm trên Wikidata, chỉ nhận mục có nhãn TRÙNG KHỚP tên
 * Trả về đường dẫn ảnh thu nhỏ + tác giả + giấy phép để ghi công.
 * Kết quả được CDN của Vercel lưu 30 ngày nên mỗi mẫu chỉ hỏi Wikimedia một lần.
 */

const UA = 'KhoMay/0.1 (https://kho-may.vercel.app; personal camera collection app)';

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

async function fileFromWikidata(qid: string): Promise<string | null> {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`, { headers: { 'user-agent': UA } });
  if (!r.ok) return null;
  const d = await r.json();
  const claims = d?.entities?.[qid]?.claims?.P18;
  const v = claims?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === 'string' ? v : null;
}

const squash = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

async function qidFromName(q: string): Promise<string | null> {
  const u = new URL('https://www.wikidata.org/w/api.php');
  u.searchParams.set('action', 'wbsearchentities');
  u.searchParams.set('search', q);
  u.searchParams.set('language', 'en');
  u.searchParams.set('type', 'item');
  u.searchParams.set('limit', '7');
  u.searchParams.set('format', 'json');
  const r = await fetch(u, { headers: { 'user-agent': UA } });
  if (!r.ok) return null;
  const d = await r.json();
  const want = squash(q);
  const hit = (d?.search ?? []).find((x: any) => squash(x.label ?? '') === want || (x.aliases ?? []).some((a: string) => squash(a) === want));
  return hit?.id ?? null;
}

export default async function handler(req: any, res: any) {
  let qid = String(req.query?.qid ?? '').trim();
  let file = String(req.query?.file ?? '').trim().replace(/^File:/i, '');
  const q = String(req.query?.q ?? '').trim().slice(0, 80);
  if (!qid && !file && !q) return res.status(400).json({ error: 'Thiếu qid, file hoặc q' });
  if (qid && !/^Q\d+$/.test(qid)) return res.status(400).json({ error: 'qid không hợp lệ' });

  res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=604800');
  try {
    if (!file && !qid && q) qid = (await qidFromName(q)) ?? '';
    if (!file && qid) file = (await fileFromWikidata(qid)) ?? '';
    if (!file) return res.status(200).json({ found: false });

    const api = new URL('https://commons.wikimedia.org/w/api.php');
    api.searchParams.set('action', 'query');
    api.searchParams.set('titles', `File:${file}`);
    api.searchParams.set('prop', 'imageinfo');
    api.searchParams.set('iiprop', 'url|extmetadata');
    api.searchParams.set('iiurlwidth', '1000');
    api.searchParams.set('format', 'json');
    const r = await fetch(api, { headers: { 'user-agent': UA } });
    const d = await r.json();
    const page: any = Object.values(d?.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0];
    if (!info) return res.status(200).json({ found: false });
    const meta = info.extmetadata ?? {};
    return res.status(200).json({
      found: true,
      url: info.thumburl ?? info.url,
      page: info.descriptionurl,
      artist: meta.Artist?.value ? stripHtml(meta.Artist.value) : 'Wikimedia Commons',
      license: meta.LicenseShortName?.value ?? '',
      licenseUrl: meta.LicenseUrl?.value ?? ''
    });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Lỗi' });
  }
}
