/**
 * POST /api/price — tự tra giá thị trường cho một mẫu máy.
 *
 * Gọi Claude API kèm công cụ tìm kiếm web để tìm giá đã bán gần đây
 * (eBay sold, Yahoo! Auction JP, cửa hàng máy ảnh…), trả về khoảng giá
 * bằng USD và VNĐ cùng danh sách nguồn.
 *
 * Biến môi trường trên Vercel:
 *   ANTHROPIC_API_KEY  — khóa Claude API (bắt buộc)
 *   PRICE_TOKEN        — mã truy cập tự đặt; app gửi kèm để người lạ không dùng được (bắt buộc)
 *   CLAUDE_MODEL       — tùy chọn, mặc định claude-sonnet-5-5
 */

type Block = { type: string; text?: string; citations?: { url?: string; title?: string }[]; content?: unknown };

interface PriceBody {
  ping?: boolean;
  brand?: string;
  model?: string;
  type?: string;
  format?: string;
  condition?: string;
  lenses?: string[];
}

const TYPE_EN: Record<string, string> = {
  PNS: 'point-and-shoot film camera', RF: 'rangefinder film camera', SLR: 'SLR film camera',
  HALF: 'half-frame film camera', TLR: 'TLR medium format camera', MF: 'medium format camera',
  INST: 'instant camera', DIG: 'digital camera', OTHER: 'camera', '': 'camera'
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function buildPrompt(b: PriceBody) {
  const name = `${b.brand ?? ''} ${b.model ?? ''}`.trim();
  const kind = TYPE_EN[b.type ?? ''] ?? 'camera';
  const lens = b.lenses?.length ? `The owner's copy comes with: ${b.lenses.join(', ')}.` : '';
  const cond = b.condition ? `Owner's cosmetic grade: ${b.condition} (A = near mint, D = heavily worn).` : '';
  return `Estimate the current second-hand market value of this camera: "${name}" (${kind}${b.format && b.format !== 'Digital' ? `, ${b.format}` : ''}).
${lens} ${cond}

Search for RECENT REALIZED prices (sold / completed listings, roughly the last 6 months) of this exact model in working condition.
Good sources: eBay sold listings, Yahoo! Auctions Japan closed results or Aucfan, reputable used-camera shops (KEH, Kamerastore, MPB, Japanese camera shops), and Vietnamese marketplaces if any show up.
Exclude: "for parts", untested, broken, lots/bundles of several cameras, accessories only, and different variants with a different name (e.g. a "II" or "Zoom" version) unless the name matches.
If sold data is scarce, use asking prices from shops and say so via "basis".
Use at most 5 searches.

Reply with ONLY one JSON object inside a \`\`\`json code block, no other text:
{"currency":"USD","low":number,"median":number,"high":number,"basis":"sold"|"asking"|"mixed","confidence":"high"|"medium"|"low","includes":"body"|"body+lens"|"unknown","sample_size":number,"note_vi":"ngắn gọn bằng tiếng Việt (tối đa 200 ký tự): giá dựa trên gì, nguồn chính, lưu ý biến thể"}
If you truly cannot find usable data, return "median": null with confidence "low".`;
}

function extractJSON(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try { return JSON.parse(raw); } catch { return null; }
}

async function usdToVnd(): Promise<number | null> {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await r.json();
    return typeof d?.rates?.VND === 'number' ? d.rates.VND : null;
  } catch { return null; }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ nhận POST' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const token = process.env.PRICE_TOKEN;
  if (!apiKey || !token) return res.status(503).json({ error: 'Máy chủ chưa cấu hình ANTHROPIC_API_KEY / PRICE_TOKEN' });

  const sent = String(req.headers['x-kho-token'] ?? '');
  if (!safeEqual(sent, token)) return res.status(401).json({ error: 'Sai mã truy cập' });

  const body: PriceBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  if (body.ping) return res.status(200).json({ ok: true });
  if (!body.brand && !body.model) return res.status(400).json({ error: 'Thiếu tên máy' });

  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
  const messages: { role: string; content: unknown }[] = [{ role: 'user', content: buildPrompt(body) }];
  const allBlocks: Block[] = [];

  try {
    for (let turn = 0; turn < 4; turn++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]
        })
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: data?.error?.message ?? `Claude API lỗi ${r.status}` });
      allBlocks.push(...(data.content ?? []));
      if (data.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: data.content });
    }

    const text = allBlocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
    const parsed = extractJSON(text);
    if (!parsed) return res.status(502).json({ error: 'Không đọc được kết quả tra giá' });

    // Nguồn: ưu tiên những link được trích dẫn, sau đó tới kết quả tìm kiếm
    const seen = new Set<string>();
    const sources: { url: string; title: string }[] = [];
    const push = (url?: string, title?: string) => {
      if (!url || seen.has(url) || sources.length >= 6) return;
      seen.add(url);
      sources.push({ url, title: title || new URL(url).hostname });
    };
    allBlocks.forEach((b) => b.citations?.forEach((c) => push(c.url, c.title)));
    allBlocks.forEach((b) => {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        (b.content as { url?: string; title?: string }[]).forEach((c) => push(c.url, c.title));
      }
    });

    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
    const usd = { low: num(parsed.low), median: num(parsed.median), high: num(parsed.high) };
    const rate = await usdToVnd();
    const vnd = (v: number | null) => (v != null && rate ? Math.round((v * rate) / 10000) * 10000 : null);

    return res.status(200).json({
      currency: 'USD',
      usd,
      vnd: { low: vnd(usd.low), median: vnd(usd.median), high: vnd(usd.high) },
      rate,
      basis: parsed.basis ?? 'mixed',
      confidence: parsed.confidence ?? 'low',
      includes: parsed.includes ?? 'unknown',
      sampleSize: num(parsed.sample_size),
      note: typeof parsed.note_vi === 'string' ? parsed.note_vi.slice(0, 300) : '',
      sources,
      model
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Lỗi không xác định' });
  }
}
