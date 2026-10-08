import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useCameras, useSettings, type Camera } from '../db';
import { runPriceQueue, usePriceQueue } from '../lib/autoPrice';
import { toast } from '../lib/toast';
import { TYPE_LABEL, TYPE_ORDER, fullName, purchaseVND, trieu } from '../lib/format';
import { changePct, groupPrices, isStale, valueTimeline } from '../lib/stats';
import { Segmented } from '../components/ui';

const TYPE_COLOR: Record<string, string> = {
  PNS: 'var(--accent)', RF: 'var(--blue)', SLR: 'var(--pink)', HALF: 'var(--teal)',
  TLR: '#E8D58A', MF: '#C9A6FF', INST: '#F0B98C', DIG: '#77716A', OTHER: '#5C5853', '': '#4A4744'
};

const RANGES = [
  { value: '30', label: '1 tháng' },
  { value: '90', label: '3 tháng' },
  { value: '365', label: '1 năm' },
  { value: 'all', label: 'Tất cả' }
];

function Chart({ points }: { points: { date: number; total: number }[] }) {
  const W = 350, H = 176, top = 20, bottom = 140;
  if (points.length < 2) {
    return <p className="dashed" style={{ display: 'block' }}>Biểu đồ sẽ hiện sau ít nhất 2 lần cập nhật giá ở hai ngày khác nhau.</p>;
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
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Giá trị bộ sưu tập từ ${trieu(points[0].total)} đến ${trieu(last.total)} triệu`}>
      <g stroke="#26241F" strokeWidth={1}>{ticks.map((t, i) => <path key={i} d={`M0 ${y(t)} H${W}`} />)}</g>
      <g fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#8E887E">
        {ticks.map((t, i) => <text key={i} x={0} y={y(t) - 5}>{trieu(t, 0)} tr</text>)}
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
  const nav = useNavigate();
  const startQueue = (list: Camera[]) => {
    if (!settings.priceToken) { toast('Cần nhập mã truy cập tra giá trong Cài đặt trước'); nav('/cai-dat'); return; }
    runPriceQueue(list);
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
        <span className="eyebrow">Giá trị ước tính · {owned.length} máy</span>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 72, lineHeight: 0.95 }}>{trieu(total)}<span style={{ fontSize: 30, color: 'var(--muted)' }}> triệu</span></h1>
        {delta != null && delta !== 0 && (
          <span className={'mono ' + (delta > 0 ? 'up' : 'down')} style={{ fontSize: 13 }}>
            {delta > 0 ? '▲' : '▼'} {trieu(Math.abs(delta))} tr ({delta > 0 ? '+' : '−'}{first ? Math.abs(Math.round((delta / first) * 1000) / 10).toLocaleString('vi-VN') : 0}%) · {RANGES.find((r) => r.value === range)?.label.toLowerCase()}
          </span>
        )}
        {hasDigital && <span className="muted" style={{ fontSize: 13 }}>Máy film {trieu(filmVal)} tr · Máy số {trieu(digVal)} tr</span>}
        {priced < owned.length && <span className="muted" style={{ fontSize: 13 }}>Mới tính {priced}/{owned.length} máy đã có giá</span>}
      </header>

      <section className="section px" aria-label="Biểu đồ giá trị" style={{ gap: 12 }}>
        <Segmented label="Khoảng thời gian" value={range} onChange={setRange} options={RANGES} />
        <Chart points={timeline} />
      </section>

      {noPrice > 0 && (
        <section className="panel" style={{ margin: '0 20px' }} aria-label="Máy chưa có giá">
          <div className="section-head"><h2 className="h2">Giá thị trường đã có</h2><span className="mono" style={{ fontSize: 13 }}>{priced} / {owned.length} máy</span></div>
          <div className="progress"><div style={{ width: `${(priced / Math.max(1, owned.length)) * 100}%` }} /></div>
          <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} disabled={q.running}
            onClick={() => startQueue(owned.filter((c) => c.marketValue == null))}>Tự tra giá {noPrice} máy chưa có giá</button>
        </section>
      )}

      <section className="panel" style={{ margin: '0 20px' }} aria-label="Giá mua">
        <div className="section-head"><h2 className="h2">Giá mua đã nhập</h2><span className="mono" style={{ fontSize: 13 }}>{withBuy.length} / {owned.length} máy</span></div>
        <div className="progress"><div style={{ width: `${(withBuy.length / Math.max(1, owned.length)) * 100}%` }} /></div>
        {withBuy.length > 0 && (
          <div className="form-grid">
            <div><span className="muted" style={{ fontSize: 12 }}>Tổng vốn đã ghi</span><div className="mono" style={{ fontSize: 16 }}>{unconverted === withBuy.length ? '—' : `${trieu(buyTotal)} tr`}</div></div>
            <div><span className="muted" style={{ fontSize: 12 }}>Chênh lệch (máy có đủ 2 giá)</span>
              <div className={'mono ' + (valueOfBought - costOfValued >= 0 ? 'up' : 'down')} style={{ fontSize: 16 }}>
                {costOfValued ? `${valueOfBought - costOfValued >= 0 ? '+' : '−'}${trieu(Math.abs(valueOfBought - costOfValued))} tr` : '—'}
              </div>
            </div>
          </div>
        )}
        {unconverted > 0 && <span className="muted" style={{ fontSize: 12 }}>{unconverted} máy mua bằng ngoại tệ chưa quy đổi được — vào Cài đặt để lấy tỷ giá.</span>}
        {withBuy.length < owned.length && <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' }}>Nhập giá mua để biết bạn đã bỏ ra bao nhiêu và đang lãi hay lỗ.</span>}
      </section>

      {types.length > 0 && (
        <section className="section px" aria-label="Theo loại máy" style={{ gap: 12 }}>
          <h2 className="h2">Theo loại máy</h2>
          {total > 0 && (
            <div className="bar">{types.filter((x) => x.v > 0).map((x) => <span key={x.t} style={{ width: `${(x.v / total) * 100}%`, background: TYPE_COLOR[x.t] }} />)}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {types.map((x) => (
              <Link key={x.t} to={`/?loc=${x.t || 'untyped'}`} className="legend-row" style={{ color: 'var(--text)' }}>
                <span><span className="sw" style={{ background: TYPE_COLOR[x.t] }} />{TYPE_LABEL[x.t]} <span className="muted" style={{ fontSize: 12 }}>· {x.n} máy</span></span>
                <span className="mono" style={{ fontSize: 13 }}>{trieu(x.v)} tr</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {topBrands.length > 0 && (
        <section className="section px" aria-label="Theo hãng" style={{ gap: 12 }}>
          <h2 className="h2">Theo hãng</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topBrands.map(([b, s]) => (
              <div key={b} className="brand-row">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
                <span className="track"><span style={{ width: `${(s.n / maxN) * 100}%` }} /></span>
                <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{s.n} · {trieu(s.v)} tr</span>
              </div>
            ))}
            {restBrands.length > 0 && <span className="muted" style={{ fontSize: 12 }}>+ {restBrands.map(([b]) => b).join(', ')}</span>}
          </div>
        </section>
      )}

      {movers.length > 0 && (
        <section className="section px" aria-label="Biến động giá">
          <h2 className="h2">Biến động 90 ngày</h2>
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
        <section className="dashed" style={{ margin: '0 20px', justifyContent: 'space-between' }} aria-label="Giá cần cập nhật">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{stale} máy chưa cập nhật giá</span>
            <span className="muted" style={{ fontSize: 12 }}>Lần cuối hơn 90 ngày trước</span>
          </div>
          <button type="button" className="btn small" disabled={q.running} onClick={() => startQueue(owned.filter((c) => c.marketValue != null && isStale(c)))}>Tra lại</button>
        </section>
      )}

      {owned.length > 0 && (
        <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" className="btn secondary" disabled={q.running} onClick={() => startQueue(owned)}>
            {q.running ? `Đang tra giá ${q.done}/${q.total}…` : `Tra lại giá cả ${owned.length} máy`}
          </button>
          <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {settings.priceToken
              ? `App tự tra giá các máy có giá cũ hơn ${settings.autoPriceDays} ngày mỗi khi bạn mở app.`
              : 'Chưa bật tự tra giá — vào Cài đặt để nhập mã truy cập.'}
          </span>
        </div>
      )}

      {sold > 0 && (
        <Link to="/?loc=sold" className="px" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
          <span>Không tính {sold} máy đã bán</span><span style={{ color: 'var(--accent)' }}>Xem</span>
        </Link>
      )}
    </div>
  );
}
