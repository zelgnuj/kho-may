import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCameras, useRolls, type Roll } from '../db';
import { daysSince, fmtDate } from '../lib/format';
import { KIND_LABEL, findStock, type FilmKind } from '../lib/filmStocks';
import { DevelopSheet } from '../components/Film';
import { IconExternal } from '../components/Icons';

const year = new Date().getFullYear();
const kindOf = (r: Roll) => (r.kind ?? findStock(r.stock)?.kind) as FilmKind | undefined;

export default function FilmPage() {
  const cams = useCameras();
  const rolls = useRolls();
  const [params, setParams] = useSearchParams();
  const only = params.get('may');
  const [edit, setEdit] = useState<Roll | null>(null);

  const byId = useMemo(() => new Map((cams ?? []).map((c) => [c.id, c])), [cams]);
  if (!cams || !rolls) return <div className="page" />;

  const mine = rolls.filter((r) => !only || r.cameraId === only);
  const loaded = mine.filter((r) => r.status === 'loaded' && byId.get(r.cameraId)?.film?.rollId === r.id).sort((a, b) => a.loadedAt.localeCompare(b.loadedAt));
  const waiting = mine.filter((r) => r.status === 'shot').sort((a, b) => (a.shotAt ?? '').localeCompare(b.shotAt ?? ''));
  const done = mine.filter((r) => r.status === 'developed').sort((a, b) => (b.devAt ?? '').localeCompare(a.devAt ?? ''));
  const thisYear = mine.filter((r) => r.loadedAt.startsWith(String(year)));
  const cost = done.filter((r) => (r.devAt ?? '').startsWith(String(year))).reduce((s, r) => s + (r.devCost ?? 0), 0);
  const top = Object.entries(mine.reduce<Record<string, number>>((m, r) => ({ ...m, [r.stock]: (m[r.stock] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const cam = only ? byId.get(only) : null;
  const name = (r: Roll) => { const c = byId.get(r.cameraId); return c ? `${c.brand} ${c.model}` : 'Máy đã xoá'; };

  return (
    <div className="page">
      <header className="page-head px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">{cam ? `${cam.brand} ${cam.model}` : 'Nhật ký film'}</span>
          <h1 className="title-xl">Film</h1>
        </div>
        {cam && <button type="button" className="pill-btn" onClick={() => setParams({})}>Tất cả máy</button>}
      </header>

      <section className="stats px" aria-label="Tổng quan film">
        <div className="stat"><span className="k">Đang lắp</span><span className="v" style={{ color: 'var(--accent)' }}>{loaded.length}</span></div>
        <div className="stat"><span className="k">Chờ tráng</span><span className="v">{waiting.length}</span></div>
        <div className="stat"><span className="k">Cuộn năm {year}</span><span className="v">{thisYear.length}</span></div>
      </section>

      {mine.length === 0 && (
        <div className="empty">
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)' }}>Chưa có cuộn nào. Mở một máy film trong kho và bấm “Lắp film” — app sẽ theo dõi cuộn từ lúc lắp, chụp xong, đến khi tráng.</p>
        </div>
      )}

      {loaded.length > 0 && (
        <section className="section px" style={{ gap: 8 }} aria-label="Đang lắp">
          <h2 className="h-mono">ĐANG LẮP</h2>
          <div className="rows">
            {loaded.map((r) => (
              <Link key={r.id} to={`/may/${r.cameraId}`} className="roll-row">
                <RollMain r={r} title={r.stock} sub={name(r)} />
                <span className="mono muted" style={{ fontSize: 12 }}>{daysSince(r.loadedAt)} ngày</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section className="section px" style={{ gap: 8 }} aria-label="Chờ tráng">
          <h2 className="h-mono">CHỜ TRÁNG</h2>
          <div className="rows">
            {waiting.map((r) => (
              <div key={r.id} className="roll-row">
                <RollMain r={r} title={r.stock} sub={`${name(r)}${r.shotAt ? ` · xong ${fmtDate(r.shotAt)}` : ''}`} />
                <button type="button" className="pill-btn on" onClick={() => setEdit(r)}>Đã tráng</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="section px" style={{ gap: 8 }} aria-label="Đã tráng">
          <h2 className="h-mono">ĐÃ TRÁNG</h2>
          <div className="rows">
            {done.map((r) => (
              <div key={r.id} className="roll-row">
                <button type="button" className="roll-open" onClick={() => setEdit(r)}>
                  <RollMain r={r} title={r.stock} sub={[name(r), r.lab, r.devAt && fmtDate(r.devAt)].filter(Boolean).join(' · ')} />
                </button>
                {r.scansUrl && <a href={r.scansUrl} target="_blank" rel="noreferrer" className="icon-btn ghost" aria-label="Xem ảnh scan"><IconExternal size={18} /></a>}
              </div>
            ))}
          </div>
        </section>
      )}

      {mine.length > 0 && (
        <section className="section px" style={{ gap: 8 }} aria-label="Thống kê">
          <h2 className="h-mono">THỐNG KÊ</h2>
          <div className="rows">
            {top.length > 0 && <div><span>Film dùng nhiều nhất</span><span className="muted" style={{ fontSize: 13, textAlign: 'right' }}>{top.map(([s, n]) => `${s} (${n})`).join(', ')}</span></div>}
            <div><span>Chi phí tráng năm {year}</span><span className="mono muted">{cost ? `${cost.toLocaleString('vi-VN')} đ` : '—'}</span></div>
            <div><span>Tổng số cuộn</span><span className="mono muted">{mine.length}</span></div>
          </div>
        </section>
      )}

      <DevelopSheet roll={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function RollMain({ r, title, sub }: { r: Roll; title: string; sub: string }) {
  const k = kindOf(r);
  return (
    <span className="roll-main">
      <span className={'kind-dot k-' + (k ?? 'color')} title={k ? KIND_LABEL[k] : undefined} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="roll-title">{title}{r.ei && r.iso && r.ei !== r.iso ? <span className="muted mono" style={{ fontSize: 11 }}> @{r.ei}</span> : null}</span>
        <span className="roll-sub">{sub}{r.note ? ` · ${r.note}` : ''}</span>
      </span>
    </span>
  );
}

