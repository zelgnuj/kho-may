/**
 * POST /api/contribute — ghi một đóng góp thư viện mẫu máy vào data/catalog-contrib.json trên GitHub.
 * Mỗi lần ghi là một commit → Vercel tự build lại → mọi thiết bị nhận thư viện mới.
 *
 * Biến môi trường trên Vercel:
 *   GITHUB_TOKEN    — fine-grained token, quyền Contents: Read and write cho repo
 *   GITHUB_REPO     — "chủ/repo", vd zelgnuj/kho-may
 *   CONTRIB_TOKEN   — mã đóng góp tự đặt; nhập giống hệt trong Cài đặt của app
 *   GITHUB_BRANCH   — tùy chọn, mặc định main
 */

const PATH = 'data/catalog-contrib.json';

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function valid(c: any): string | null {
  if (!c || typeof c !== 'object') return 'Thiếu nội dung đóng góp';
  if (typeof c.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(c.id)) return 'Mã mẫu không hợp lệ';
  if (c.action !== 'edit' && c.action !== 'add') return 'Kiểu đóng góp không hợp lệ';
  if (!c.set || typeof c.set !== 'object') return 'Không có gì để lưu';
  if (JSON.stringify(c).length > 20000) return 'Đóng góp quá lớn';
  if (c.source?.url && !/^https?:\/\//.test(c.source.url)) return 'Link nguồn không hợp lệ';
  return null;
}

async function gh(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'kho-may',
      ...(init.headers ?? {})
    }
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ nhận POST' });
  const { GITHUB_TOKEN: token, GITHUB_REPO: repo, CONTRIB_TOKEN: secret } = process.env;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repo || !secret) return res.status(503).json({ error: 'Máy chủ chưa cấu hình GITHUB_TOKEN / GITHUB_REPO / CONTRIB_TOKEN' });
  if (!safeEqual(String(req.headers['x-contrib-token'] ?? ''), secret)) return res.status(401).json({ error: 'Sai mã đóng góp' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  if (body.ping) return res.status(200).json({ ok: true, repo });
  const c = body.contribution;
  const err = valid(c);
  if (err) return res.status(400).json({ error: err });

  // Đọc → thêm → ghi; thử lại một lần nếu file vừa bị thay đổi (409)
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = await gh(`/repos/${repo}/contents/${PATH}?ref=${branch}`, token);
    if (!cur.ok) return res.status(502).json({ error: `Không đọc được ${PATH} (${cur.status})` });
    const json = JSON.parse(Buffer.from(cur.data.content, 'base64').toString('utf8'));
    const list: any[] = json.contributions ?? [];
    const dup = list.some((x) => x.id === c.id && x.at === c.at && JSON.stringify(x.set) === JSON.stringify(c.set));
    if (!dup) list.push(c);
    json.contributions = list;
    const content = Buffer.from(JSON.stringify(json, null, 2) + '\n', 'utf8').toString('base64');
    const label = c.set?.brand && c.set?.model ? `${c.set.brand} ${c.set.model}` : c.id;
    const put = await gh(`/repos/${repo}/contents/${PATH}`, token, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Thư viện: ${c.action === 'add' ? 'thêm' : 'sửa'} ${label}${c.note ? ` — ${String(c.note).slice(0, 80)}` : ''}`,
        content,
        sha: cur.data.sha,
        branch
      })
    });
    if (put.ok) return res.status(200).json({ ok: true, commit: put.data?.commit?.html_url ?? null });
    if (put.status !== 409) return res.status(502).json({ error: `GitHub từ chối (${put.status}): ${put.data?.message ?? ''}` });
  }
  return res.status(409).json({ error: 'File vừa được sửa ở nơi khác, thử lại sau' });
}
