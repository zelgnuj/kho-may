/**
 * POST /api/price — tự tra giá thị trường cho một mẫu máy.
 *
 * Thứ tự nguồn:
 *  1. CompSniper — giá ĐÃ BÁN trên eBay (gói miễn phí 100 lượt/tháng).
 *  2. eBay Browse API (item_summary/search) — miễn phí.
 *   Lấy các tin đang rao bán (Buy It Now, đồ cũ) của đúng mẫu máy, lọc bỏ
 *   phụ kiện / hỏng / lô nhiều máy, bỏ giá ngoại lai, lấy trung vị.
 *   Lưu ý: đây là GIÁ RAO BÁN, thường cao hơn giá thực bán một chút.
 * Dự phòng (tùy chọn): Claude API + tìm kiếm web, khi eBay không đủ dữ liệu.
 *
 * Biến môi trường trên Vercel (cần ít nhất một nguồn):
 *   COMPSNIPER_API_KEY — khóa CompSniper (cs_…)
 *   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET — keyset Production của eBay Developers (bắt buộc cho nguồn eBay)
 *   PRICE_TOKEN       — tùy chọn; nếu đặt, app phải gửi đúng mã này (chống người lạ dùng hết hạn mức)
 *   ANTHROPIC_API_KEY — tùy chọn; bật dự phòng bằng Claude (chỉ chạy khi có PRICE_TOKEN để tránh tốn tiền)
 *   CLAUDE_MODEL      — tùy chọn, mặc định claude-sonnet-5-5
 */

interface PriceBody {
  ping?: boolean;
  brand?: string;
  model?: string;
  type?: string;
  format?: string;
  condition?: string;
  lenses?: string[];
}

interface Result {
  provider: 'compsniper' | 'ebay' | 'claude';
  usd: { low: number | null; median: number | null; high: number | null };
  basis: 'sold' | 'asking' | 'mixed';
  confidence: 'high' | 'medium' | 'low';
  includes: string;
  sampleSize: number | null;
  note: string;
  sources: { url: string; title: string }[];
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const quantile = (s: number[], q: number) => {
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const round = (v: number) => Math.round(v * 100) / 100;

/* ---------------- eBay ---------------- */

let ebayToken: { value: string; exp: number } | null = null;

async function getEbayToken(id: string, secret: string) {
  if (ebayToken && ebayToken.exp > Date.now() + 60_000) return ebayToken.value;
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error(`eBay từ chối khóa (${d.error_description ?? d.error ?? r.status})`);
  ebayToken = { value: d.access_token, exp: Date.now() + (d.expires_in ?? 7200) * 1000 };
  return ebayToken.value;
}

// Tin rao không phải một chiếc máy hoàn chỉnh, chạy tốt
const JUNK = /\b(for parts|parts only|not working|untested|as[- ]is|broken|repair|junk|defect|faulty|lot of|bundle of|\d+\s*cameras|lens only|body cap|case only|strap|manual only|instruction|battery|charger|flash only|lens cap|hood|filter|box only|empty box|replica|toy|keychain|cover|grip|adapter|shell|housing|door|parts)\b/i;
const ACCESSORY_CATEGORY = /(lens|flash|accessor|battery|charger|bag|case|strap|manual|filter|part)/i;

function tokens(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9µμ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/** Tiêu đề phải chứa đủ các "từ khóa" của tên mẫu, và không mang hậu tố biến thể khác (vd "OM-2N" ≠ "OM-2 SP") */
export function titleMatches(title: string, brand: string, model: string) {
  const T = tokens(title);
  const N = tokens(model);
  if (!N.length) return false;
  const okBrand = tokens(brand).every((w) => T.includes(w));
  if (!okBrand) return false;
  // 1) Các từ của tên mẫu đứng liền nhau, nguyên từ: "electro 35 gx"
  for (let i = 0; i + N.length <= T.length; i++) {
    if (N.every((w, j) => T[i + j] === w)) return true;
  }
  // 2) Viết dính / tách khác nhau: "om2n" ~ "om 2n", "pc35af" ~ "pc 35 af"
  const joined = N.join('');
  for (let i = 0; i < T.length; i++) {
    let s = '';
    for (let j = i; j < Math.min(T.length, i + 4); j++) {
      s += T[j];
      if (s === joined) return true;
      if (s.length >= joined.length) break;
    }
  }
  return false;
}

async function fromEbay(b: PriceBody, id: string, secret: string): Promise<Result | null> {
  const token = await getEbayToken(id, secret);
  const brand = (b.brand ?? '').trim();
  const model = (b.model ?? '').trim();
  const isDigital = b.type === 'DIG';
  const q = `${brand} ${model} ${isDigital ? 'camera' : 'film camera'}`.slice(0, 100);
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '200');
  url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE|BEST_OFFER},conditions:{USED},priceCurrency:USD');
  const r = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.errors?.[0]?.longMessage ?? d?.errors?.[0]?.message ?? `eBay lỗi ${r.status}`);

  type Item = { title: string; price?: { value: string; currency: string }; itemWebUrl: string; categories?: { categoryName: string }[]; condition?: string };
  const items: Item[] = d.itemSummaries ?? [];
  const kept = items.filter((it) => {
    if (!it.price || it.price.currency !== 'USD') return false;
    if (!titleMatches(it.title, brand, model)) return false;
    if (JUNK.test(it.title)) return false;
    const cats = (it.categories ?? []).map((c) => c.categoryName).join(' | ');
    if (cats && !/camera/i.test(cats)) return false;
    if (cats && ACCESSORY_CATEGORY.test(cats) && !/cameras?\b/i.test(cats.split('|')[0] ?? '')) return false;
    return true;
  });

  const prices = kept.map((it) => parseFloat(it.price!.value)).filter((v) => v > 0).sort((a, b2) => a - b2);
  if (prices.length < 3) return null;

  // Bỏ giá ngoại lai theo IQR
  const q1 = quantile(prices, 0.25), q3 = quantile(prices, 0.75), iqr = q3 - q1;
  const clean = prices.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  const median = quantile(clean, 0.5);
  const n = clean.length;

  // Nguồn: vài tin sát giá giữa + link tìm kiếm đầy đủ
  const near = [...kept]
    .sort((a, c) => Math.abs(parseFloat(a.price!.value) - median) - Math.abs(parseFloat(c.price!.value) - median))
    .slice(0, 4)
    .map((it) => ({ url: it.itemWebUrl, title: `$${parseFloat(it.price!.value).toFixed(0)} · ${it.title}` }));
  const searchLink = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${brand} ${model}`)}&LH_ItemCondition=3000&LH_BIN=1`;

  return {
    provider: 'ebay',
    usd: { low: round(quantile(clean, 0.25)), median: round(median), high: round(quantile(clean, 0.75)) },
    basis: 'asking',
    confidence: n >= 15 ? 'high' : n >= 6 ? 'medium' : 'low',
    includes: 'unknown',
    sampleSize: n,
    note: `Trung vị ${n} tin đang rao bán trên eBay (đồ cũ, Mua ngay), đã loại tin hỏng, phụ kiện và giá bất thường. Giá rao thường cao hơn giá thực bán.`,
    sources: [...near, { url: searchLink, title: 'Xem tất cả tin trên eBay' }]
  };
}

/* ---------------- CompSniper (giá ĐÃ BÁN trên eBay) ---------------- */

let compsniperExhausted = false;

async function fromCompSniper(b: PriceBody, key: string): Promise<Result | null> {
  const brand = (b.brand ?? '').trim();
  const model = (b.model ?? '').trim();
  const keyword = `${brand} ${model}${b.type === 'DIG' ? '' : ' film camera'}`;
  const url = new URL('https://api.compsniper.com/v1/scrape');
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('count', '100');
  const r = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
  if (!r.ok) {
    // Hết lượt / lỗi tạm thời → trả null để chuyển sang nguồn khác
    if (r.status === 429 || r.status === 402) { compsniperExhausted = true; return null; }
    if (r.status >= 500) return null;
    const d = await r.json().catch(() => ({}));
    throw new Error(`CompSniper: ${d?.error ?? d?.message ?? r.status}`);
  }
  const d = await r.json();
  type Sold = { title: string; url: string; soldPrice?: string | number; soldCurrency?: string; conditionId?: number | string; endedAt?: string; buyingFormat?: string };
  const items: Sold[] = d.items ?? [];
  const cutoff = Date.now() - 180 * 86400000;
  const kept = items.filter((it) => {
    const p = Number(it.soldPrice);
    if (!p || (it.soldCurrency && it.soldCurrency !== 'USD')) return false;
    if (Number(it.conditionId) === 7000) return false; // For parts or not working
    if (it.endedAt && Date.parse(it.endedAt) < cutoff) return false;
    if (!titleMatches(it.title, brand, model)) return false;
    return !JUNK.test(it.title);
  });
  const prices = kept.map((it) => Number(it.soldPrice)).sort((a, c) => a - c);
  if (prices.length < 3) return null;
  const q1 = quantile(prices, 0.25), q3 = quantile(prices, 0.75), iqr = q3 - q1;
  const clean = prices.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  const median = quantile(clean, 0.5);
  const n = clean.length;
  const lo = clean[0], hi = clean[clean.length - 1];
  const recent = kept
    .filter((it) => Number(it.soldPrice) >= lo && Number(it.soldPrice) <= hi)
    .sort((a, c) => Date.parse(c.endedAt ?? '0') - Date.parse(a.endedAt ?? '0'))
    .slice(0, 4)
    .map((it) => ({ url: it.url, title: `Đã bán $${Number(it.soldPrice).toFixed(0)}${it.endedAt ? ` · ${it.endedAt.slice(0, 10)}` : ''} · ${it.title}` }));
  const searchLink = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${brand} ${model}`)}&LH_Sold=1&LH_Complete=1`;
  return {
    provider: 'compsniper',
    usd: { low: round(quantile(clean, 0.25)), median: round(median), high: round(quantile(clean, 0.75)) },
    basis: 'sold',
    confidence: n >= 12 ? 'high' : n >= 5 ? 'medium' : 'low',
    includes: 'unknown',
    sampleSize: n,
    note: `Trung vị ${n} giao dịch đã bán trên eBay trong 6 tháng qua (qua CompSniper), đã loại máy hỏng, phụ kiện và giá bất thường. Không tính phí ship.`,
    sources: [...recent, { url: searchLink, title: 'Xem tin đã bán trên eBay' }]
  };
}

/* ---------------- Claude (dự phòng) ---------------- */

type Block = { type: string; text?: string; citations?: { url?: string; title?: string }[]; content?: unknown };

function claudePrompt(b: PriceBody) {
  const name = `${b.brand ?? ''} ${b.model ?? ''}`.trim();
  return `Estimate the current second-hand market value of the camera "${name}"${b.format && b.format !== 'Digital' ? ` (${b.format})` : ''}.
Search for recent realized prices (sold/completed listings, last ~6 months) of this exact model in working condition: eBay sold, Yahoo! Auctions Japan closed results, reputable used-camera shops. Exclude for-parts, untested, bundles and different variants. Use at most 5 searches.
Reply with ONLY one JSON object in a \`\`\`json block:
{"low":number,"median":number,"high":number,"basis":"sold"|"asking"|"mixed","confidence":"high"|"medium"|"low","sample_size":number,"note_vi":"tiếng Việt, tối đa 200 ký tự"}
All prices in USD. If no usable data, "median": null.`;
}

async function fromClaude(b: PriceBody, apiKey: string): Promise<Result | null> {
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
  const messages: { role: string; content: unknown }[] = [{ role: 'user', content: claudePrompt(b) }];
  const blocks: Block[] = [];
  for (let turn = 0; turn < 4; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2048, messages, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message ?? `Claude API lỗi ${r.status}`);
    blocks.push(...(data.content ?? []));
    if (data.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: data.content });
  }
  const text = blocks.filter((x) => x.type === 'text').map((x) => x.text ?? '').join('\n');
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  let p: Record<string, unknown>;
  try { p = JSON.parse(m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { return null; }
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
  if (num(p.median) == null) return null;
  const seen = new Set<string>();
  const sources: { url: string; title: string }[] = [];
  const add = (u?: string, t?: string) => { if (u && !seen.has(u) && sources.length < 6) { seen.add(u); sources.push({ url: u, title: t || u }); } };
  blocks.forEach((x) => x.citations?.forEach((c) => add(c.url, c.title)));
  blocks.forEach((x) => { if (x.type === 'web_search_tool_result' && Array.isArray(x.content)) (x.content as { url?: string; title?: string }[]).forEach((c) => add(c.url, c.title)); });
  return {
    provider: 'claude',
    usd: { low: num(p.low), median: num(p.median), high: num(p.high) },
    basis: (p.basis as Result['basis']) ?? 'mixed',
    confidence: (p.confidence as Result['confidence']) ?? 'low',
    includes: 'unknown',
    sampleSize: num(p.sample_size),
    note: typeof p.note_vi === 'string' ? p.note_vi.slice(0, 300) : '',
    sources
  };
}

/* ---------------- Handler ---------------- */

async function usdToVnd(): Promise<number | null> {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await r.json();
    return typeof d?.rates?.VND === 'number' ? d.rates.VND : null;
  } catch { return null; }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ nhận POST' });

  const compKey = process.env.COMPSNIPER_API_KEY;
  const ebayId = process.env.EBAY_CLIENT_ID;
  const ebaySecret = process.env.EBAY_CLIENT_SECRET;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const token = process.env.PRICE_TOKEN;

  if (token && !safeEqual(String(req.headers['x-kho-token'] ?? ''), token)) {
    return res.status(401).json({ error: 'Sai mã truy cập' });
  }
  const useClaude = !!(anthropic && token); // dự phòng tốn phí chỉ bật khi có mã bảo vệ
  const providers = [compKey ? 'compsniper' : null, ebayId && ebaySecret ? 'ebay' : null, useClaude ? 'claude' : null].filter(Boolean);
  if (!providers.length) return res.status(503).json({ error: 'Máy chủ chưa cấu hình nguồn giá (COMPSNIPER_API_KEY hoặc EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)' });

  const body: PriceBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  if (body.ping) return res.status(200).json({ ok: true, providers, protected: !!token });
  if (!body.brand && !body.model) return res.status(400).json({ error: 'Thiếu tên máy' });

  try {
    let result: Result | null = null;
    const errors: string[] = [];
    compsniperExhausted = false;
    const compsniperUsed = !!compKey;
    if (compKey) {
      try { result = await fromCompSniper(body, compKey); }
      catch (e) { errors.push(e instanceof Error ? e.message : 'CompSniper lỗi'); }
    }
    if (!result && ebayId && ebaySecret) {
      try { result = await fromEbay(body, ebayId, ebaySecret); }
      catch (e) { errors.push(e instanceof Error ? e.message : 'eBay lỗi'); }
    }
    if (!result && useClaude) result = await fromClaude(body, anthropic!);
    if (!result && errors.length) return res.status(502).json({ error: errors.join(' · '), compsniperUsed, compsniperExhausted });

    const rate = await usdToVnd();
    const vnd = (v: number | null | undefined) => (v != null && rate ? Math.round((v * rate) / 10000) * 10000 : null);
    if (!result) {
      return res.status(200).json({
        provider: providers[0], usd: { low: null, median: null, high: null }, vnd: { low: null, median: null, high: null },
        rate, basis: 'mixed', confidence: 'low', includes: 'unknown', sampleSize: 0,
        note: 'Không đủ dữ liệu trên eBay cho mẫu này (cần ít nhất 3 tin khớp đúng tên). Có thể nhập tay.', sources: [],
        compsniperUsed, compsniperExhausted
      });
    }
    return res.status(200).json({
      ...result,
      compsniperUsed, compsniperExhausted,
      rate,
      vnd: { low: vnd(result.usd.low), median: vnd(result.usd.median), high: vnd(result.usd.high) }
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Lỗi không xác định' });
  }
}
