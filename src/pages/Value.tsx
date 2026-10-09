import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useCameras, useSettings, type Camera } from '../db';
import { remainingQuota, runPriceQueue, uniqueModels, usePriceQueue } from '../lib/autoPrice';
import { TYPE_LABEL, TYPE_ORDER, fullName, purchaseVND, signedValue, valueLabel, valueParts } from '../lib/format';
import { lang, locale, plural, tx } from '../lib/i18n';
import { changePct, groupPrices, isStale, valueTimeline } from '../lib/stats';
import { Segmented } from '../components/ui';

const TYPE_COLOR: Record<string, string> = {
  PNS: 'var(--accent)', RF: 'var(--blue)', SLR: 'var(--pink)', HALF: 'var(--teal)',
  TLR: '#E8D58A', MF: '#C9A6FF', INST: '#F0B98C', DIG: '#77716A', OTHER: '#5C5853', '': '#4A4744'
};

const RANGES = [
  { value: '30', label: tx("1 tháng") },
  { value: '90', label: tx("3 tháng") },
  { value: '365', label: tx("1 năm") },
  { value: 'all', label: tx("Tất cả") }
];

function Chart({ points }: { points: { date: number; total: number }[] }) {
  const W = 350, H = 176, top = 20, bottom = 140;
  if (points.length < 2) {
    return <p className="dashed" style={{ display: 'block' }}>{tx("Biểu đồ sẽ hiện sau ít nhất 2 lần cập nhật giá ở hai ngày khác nhau.")}</p>;
  }
  const vals = points.map((p) => p.total);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) { max += 1e6; min = Math.max(0, min - 1e6); }
  const pad = (max - min) * 0.15;
  min = Math.max(0, min - pad); max += pad;
  const t0 = points[0].date, t1 = points[points.length - 1].date;
  const x = (t: number) => 8 + ((t - t0) / (t1 - t0 || 1)) * (W - 16);
  const y = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ');
  const ticks = [max, (max + min) / 2, min];
  const dfmt = (t: number) => { const dt = new Date(t); return `${dt.getDate()}/${dt.getMonth() + 1}`; };
  const last = points[points.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tx("Giá trị bộ sưu tập từ {0} đến {1}", valueLabel(points[0].total), valueLabel(last.total))}>
      <g stroke="#26241F" strokeWidth={1}>{ticks.map((t, i) => <path key={i} d={`M0 ${y(t)} H${W}`} />)}</g>
      <g fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#8E887E">
        {ticks.map((t, i) => <text key={i} x={0} y={y(t) - 5}>{valueLabel(t, 0)}</text>)}
        <text x={8} y={170}>{dfmt(t0)}</text>
        <text x={W} y={170} textAnchor="end">{dfmt(t1)}</text>
      </g>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.length <= 24 && points.slice(0, -1).map((p, i) => <circle key={i} cx={x(p.date)} cy={y(p.total)} r={3.5} fill="#0E0D0C" stroke="var(--accent)" strokeWidth={2} />)}
      <circle cx={x(last.date)} cy={y(last.total)} r={5} fill="var(--accent)" />
    </svg>
  );
}

export default function Value() {
  const cams = useCameras();
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const settings = useSettings();
  const [range, setRange] = useState('90');
  const byCam = useMemo(() => groupPrices(prices), [prices]);
  const q = usePriceQueue();
  const startQueue = (list: Camera[]) => {
    const n = uniqueModels(list).length;
    const left = remainingQuota(settings);
    if (left <= 0) { window.alert(tx("Đã dùng hết {0} lượt tra giá tháng này.", settings.monthlyQuota)); return; }
    const use = Math.min(n, left);
    if (!window.confirm(tx("Tra giá {0} mẫu máy sẽ dùng {1} lượt{2}. Còn {3} lượt tháng này. Tiếp tục?", n, use, use < n ? tx(" (chỉ đủ cho {0} mẫu)", use) : '', left))) return;
    runPriceQueue(list, { kind: 'manual' });
  };

  if (!cams) return <div className="page" />;
  const owned = cams.filter((c) => c.status === 'owned');
  const sold = cams.length - owned.length;
  const total = owned.reduce((s, c) => s + (c.marketValue ?? 0), 0);
  const priced = owned.filter((c) => c.marketValue != null).length;
  const filmVal = owned.filter((c) => c.type !== 'DIG').reduce((s, c) => s + (c.marketValue ?? 0), 0);
  const digVal = total - filmVal;
  const hasDigital = owned.some((c) => c.type === 'DIG');

  const since = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
  const timeline = valueTimeline(cams, byCam, since);
  const first = timeline[0]?.total;
  const delta = timeline.length >= 2 && first != null ? total - first : null;

  const withBuy = owned.filter((c) => c.purchasePrice != null);
  const buyVND = withBuy.map((c) => purchaseVND(c, settings.rates));
  const buyTotal = buyVND.reduce<number>((s, v) => s + (v ?? 0), 0);
  const unconverted = buyVND.filter((v) => v == null).length;
  const valueOfBought = withBuy.reduce((s, c, i) => s + (buyVND[i] != null && c.marketValue != null ? c.marketValue : 0), 0);
  const costOfValued = withBuy.reduce((s, c, i) => s + (buyVND[i] != null && c.marketValue != null ? buyVND[i]! : 0), 0);

  const types = TYPE_ORDER.map((t) => {
    const list = owned.filter((c) => c.type === t);
    return { t, n: list.length, v: list.reduce((s, c) => s + (c.marketValue ?? 0), 0) };
  }).filter((x) => x.n);

  const brandMap = new Map<string, { n: number; v: number }>();
  owned.forEach((c) => {
    const b = brandMap.get(c.brand) ?? { n: 0, v: 0 };
    b.n++; b.v += c.marketValue ?? 0;
    brandMap.set(c.brand, b);
  });
  const brands = [...brandMap.entries()].sort((a, b) => b[1].n - a[1].n || b[1].v - a[1].v);
  const topBrands = brands.slice(0, 5);
  const restBrands = brands.slice(5);
  const maxN = topBrands[0]?.[1].n ?? 1;

  const movers = owned
    .map((c) => ({ c, pct: changePct(byCam.get(c.id)) }))
    .filter((m): m is { c: typeof m.c; pct: number } => m.pct != null && m.pct !== 0)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5);

  const stale = owned.filter((c) => c.marketValue != null && isStale(c)).length;
  const noPrice = owned.length - priced;

  return (
    <div className="page">
      <header className="px" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="eyebrow">{tx("Giá trị ước tính ·")}{' '}{plural(owned.length, 'máy', 'camera', 'cameras')}</span>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 72, lineHeight: 0.95 }}><BigMoney vnd={total} /></h1>
        {delta != null && delta !== 0 && (
          <span className={'mono ' + (delta > 0 ? 'up' : 'down')} style={{ fontSize: 13 }}>
            {delta > 0 ? '▲' : '▼'} {valueLabel(Math.abs(delta))} ({delta > 0 ? '+' : '−'}{first ? Math.abs(Math.round((delta / first) * 1000) / 10).toLocaleString(locale) : 0}%) · {RANGES.find((r) => r.value === range)?.label.toLowerCase()}
          </span>
        )}
        {hasDigital && <span className="muted" style={{ fontSize: 13 }}>{tx("Máy film {0} · Máy số {1}", valueLabel(filmVal), valueLabel(digVal))}</span>}
        {priced < owned.length && <span className="muted" style={{ fontSize: 13 }}>{tx("Mới tính")}{' '}{priced}/{owned.length} {' '}{tx("máy đã có giá")}</span>}
      </header>

      <section className="section px" aria-label={tx("Biểu đồ giá trị")} style={{ gap: 12 }}>
        <Segmented label={tx("Khoảng thời gian")} value={range} onChange={setRange} options={RANGES} />
        <Chart points={timeline} />
      </section>

      {noPrice > 0 && (
        <section className="panel" style={{ margin: '0 20px' }} aria-label={tx("Máy chưa có giá")}>
          <div className="section-head"><h2 className="h2">{tx("Giá thị trường đã có")}</h2><span className="mono" style={{ fontSize: 13 }}>{priced} / {owned.length} {' '}{tx("máy")}</span></div>
          <div className="progress"><div style={{ width: `${(priced / Math.max(1, owned.length)) * 100}%` }} /></div>
          <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} disabled={q.running}
            onClick={() => startQueue(owned.filter((c) => c.marketValue == null))}>{tx("Tra giá {0} chưa có giá", plural(noPrice, 'máy', 'camera', 'cameras'))}</button>
        </section>
      )}

      <section className="panel" style={{ margin: '0 20px' }} aria-label={tx("Giá mua")}>
        <div className="section-head"><h2 className="h2">{tx("Giá mua đã nhập")}</h2><span className="mono" style={{ fontSize: 13 }}>{withBuy.length} / {owned.length} {' '}{tx("máy")}</span></div>
        <div className="progress"><div style={{ width: `${(withBuy.length / Math.max(1, owned.length)) * 100}%` }} /></div>
        {withBuy.length > 0 && (
          <div className="form-grid">
            <div><span className="muted" style={{ fontSize: 12 }}>{tx("Tổng vốn đã ghi")}</span><div className="mono" style={{ fontSize: 16 }}>{unconverted === withBuy.length ? '—' : valueLabel(buyTotal)}</div></div>
            <div><span className="muted" style={{ fontSize: 12 }}>{tx("Chênh lệch (máy có đủ 2 giá)")}</span>
              <div className={'mono ' + (valueOfBought - costOfValued >= 0 ? 'up' : 'down')} style={{ fontSize: 16 }}>
                {costOfValued ? signedValue(valueOfBought - costOfValued) : '—'}
              </div>
            </div>
          </div>
        )}
        {unconverted > 0 && <span className="muted" style={{ fontSize: 12 }}>{unconverted} {' '}{tx("máy mua bằng ngoại tệ chưa quy đổi được — vào Cài đặt để lấy tỷ giá.")}</span>}
        {withBuy.length < owned.length && <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' }}>{tx("Nhập giá mua để biết bạn đã bỏ ra bao nhiêu và đang lãi hay lỗ.")}</span>}
      </section>

      {types.length > 0 && (
        <section className="section px" aria-label={tx("Theo loại máy")} style={{ gap: 12 }}>
          <h2 className="h2">{tx("Theo loại máy")}</h2>
          {total > 0 && (
            <div className="bar">{types.filter((x) => x.v > 0).map((x) => <span key={x.t} style={{ width: `${(x.v / total) * 100}%`, background: TYPE_COLOR[x.t] }} />)}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {types.map((x) => (
              <Link key={x.t} to={`/?loc=${x.t || 'untyped'}`} className="legend-row" style={{ color: 'var(--text)' }}>
                <span><span className="sw" style={{ background: TYPE_COLOR[x.t] }} />{TYPE_LABEL[x.t]} <span className="muted" style={{ fontSize: 12 }}>· {plural(x.n, 'máy', 'camera', 'cameras')}</span></span>
                <span className="mono" style={{ fontSize: 13 }}>{valueLabel(x.v)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {topBrands.length > 0 && (
        <section className="section px" aria-label={tx("Theo hãng")} style={{ gap: 12 }}>
          <h2 className="h2">{tx("Theo hãng")}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topBrands.map(([b, s]) => (
              <div key={b} className="brand-row">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
                <span className="track"><span style={{ width: `${(s.n / maxN) * 100}%` }} /></span>
                <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{s.n} · {valueLabel(s.v)}</span>
              </div>
            ))}
            {restBrands.length > 0 && <span className="muted" style={{ fontSize: 12 }}>+ {restBrands.map(([b]) => b).join(', ')}</span>}
          </div>
        </section>
      )}

      {movers.length > 0 && (
        <section className="section px" aria-label={tx("Biến động giá")}>
          <h2 className="h2">{tx("Biến động 90 ngày")}</h2>
          <div className="rows">
            {movers.map(({ c, pct }) => (
              <Link key={c.id} to={`/may/${c.id}`}>
                <span>{fullName(c)}</span>
                <span className={'mono ' + (pct > 0 ? 'up' : 'down')} style={{ fontSize: 13 }}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {stale > 0 && (
        <section className="dashed" style={{ margin: '0 20px', justifyContent: 'space-between' }} aria-label={tx("Giá cần cập nhật")}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{tx("{0} chưa cập nhật giá", plural(stale, 'máy', 'camera', 'cameras'))}</span>
            <span className="muted" style={{ fontSize: 12 }}>{tx("Lần cuối hơn 90 ngày trước")}</span>
          </div>
          <button type="button" className="btn small" disabled={q.running} onClick={() => startQueue(owned.filter((c) => c.marketValue != null && isStale(c)))}>{tx("Tra lại")}</button>
        </section>
      )}

      {owned.length > 0 && (
        <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" className="btn secondary" disabled={q.running} onClick={() => startQueue(owned)}>
            {q.running ? tx("Đang tra giá {0}/{1}…", q.done, q.total) : tx("Tra lại giá cả {0} mẫu máy", uniqueModels(owned).length)}
          </button>
          <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {settings.autoPrice
              ? tx("Tự động: máy mới được tra ngay; máy có giá cũ hơn {0} ngày được tra lại rải rác vài máy mỗi ngày. Còn {1} lượt tháng này.", settings.autoPriceDays, remainingQuota(settings))
              : tx("Tự tra giá đang tắt — bật lại trong Cài đặt.")}
          </span>
        </div>
      )}

      {sold > 0 && (
        <Link to="/?loc=sold" className="px" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
          <span>{tx("Không tính {0} đã bán", plural(sold, 'máy', 'camera', 'cameras'))}</span><span style={{ color: 'var(--accent)' }}>{tx("Xem")}</span>
        </Link>
      )}
    </div>
  );
}

function BigMoney({ vnd }: { vnd: number }) {
  const p = valueParts(vnd);
  return <>{p.pre}{p.num}{p.unit && <span style={{ fontSize: 30, color: 'var(--muted)' }}>{lang === 'vi' ? ' triệu' : p.unit}</span>}</>;
}
