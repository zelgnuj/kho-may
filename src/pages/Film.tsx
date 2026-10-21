import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { finishRoll, useCameras, useRolls, type Camera, type Roll } from '../db';
import { daysSince, fmtDate, money, todayISO } from '../lib/format';
import { KIND_LABEL, findStock, type FilmKind } from '../lib/filmStocks';
import { DevelopSheet, RollSheet } from '../components/Film';
import { IconExternal } from '../components/Icons';
import { toast } from '../lib/toast';
import { lang, tx } from '../lib/i18n';

const year = new Date().getFullYear();
const kindOf = (r: Roll) => (r.kind ?? findStock(r.stock)?.kind) as FilmKind | undefined;
const DONE_PAGE = 8;

export default function FilmPage() {
  const cams = useCameras();
  const rolls = useRolls();
  const [params, setParams] = useSearchParams();
  const only = params.get('may');
  const [edit, setEdit] = useState<Roll | null>(null);
  const [dev, setDev] = useState<Roll | null>(null);
  const [adding, setAdding] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const byId = useMemo(() => new Map((cams ?? []).map((c) => [c.id, c])), [cams]);
  if (!cams || !rolls) return <div className="page" />;

  const mine = rolls.filter((r) => !only || r.cameraId === only);
  const loaded = mine.filter((r) => r.status === 'loaded' && byId.get(r.cameraId)?.film?.rollId === r.id).sort((a, b) => a.loadedAt.localeCompare(b.loadedAt));
  const waiting = mine.filter((r) => r.status === 'shot').sort((a, b) => (a.shotAt ?? '').localeCompare(b.shotAt ?? ''));
  const done = mine.filter((r) => r.status === 'developed').sort((a, b) => (b.devAt ?? '').localeCompare(a.devAt ?? ''));
  const thisYear = mine.filter((r) => (r.shotAt ?? r.loadedAt).startsWith(String(year)));
  const cam = only ? byId.get(only) : null;
  const name = (r: Roll) => { const c = byId.get(r.cameraId); return c ? `${c.brand} ${c.model}` : tx("Máy đã xoá"); };

  const shotNow = async (r: Roll) => {
    const c = byId.get(r.cameraId);
    if (!c) return;
    await finishRoll(c, todayISO());
    toast(tx("{0} chuyển sang Chờ tráng", r.stock));
  };

  return (
    <div className="page">
      <header className="page-head px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span className="eyebrow">{cam ? `${cam.brand} ${cam.model}` : tx("Nhật ký film")}</span>
          <h1 className="title-xl">Film</h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {cam && <button type="button" className="pill-btn" onClick={() => setParams({})}>{tx("Tất cả máy")}</button>}
          <button type="button" className="pill-btn on" onClick={() => setAdding(true)}>{tx("+ Ghi cuộn")}</button>
        </div>
      </header>

      <section className="stats px" aria-label={tx("Tổng quan film")}>
        <div className="stat"><span className="k">{tx("Đang lắp")}</span><span className="v" style={{ color: 'var(--accent)' }}>{loaded.length}</span></div>
        <div className="stat"><span className="k">{tx("Chờ tráng")}</span><span className="v">{waiting.length}</span></div>
        <div className="stat"><span className="k">{tx("Cuộn năm")}{' '}{year}</span><span className="v">{thisYear.length}</span></div>
      </section>

      {mine.length === 0 && (
        <div className="empty">
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)' }}>{tx("Chưa có cuộn nào. Lắp film từ trang máy hoặc nút +, hoặc bấm “Ghi cuộn” để thêm các cuộn đã chụp từ trước.")}</p>
        </div>
      )}

      {loaded.length > 0 && (
        <section className="section px" style={{ gap: 8 }} aria-label={tx("Đang lắp")}>
          <h2 className="h-mono">{tx("ĐANG LẮP")}</h2>
          <div className="rows">
            {loaded.map((r) => (
              <div key={r.id} className="roll-row">
                <button type="button" className="roll-open" onClick={() => setEdit(r)}>
                  <RollMain r={r} sub={tx("{0} · {1} ngày", name(r), daysSince(r.loadedAt))} />
                </button>
                <button type="button" className="pill-btn" onClick={() => shotNow(r)}>{tx("Chụp xong")}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section className="section px" style={{ gap: 8 }} aria-label={tx("Chờ tráng")}>
          <h2 className="h-mono">{tx("CHỜ TRÁNG")}</h2>
          <div className="rows">
            {waiting.map((r) => {
              const wait = r.shotAt ? daysSince(r.shotAt) : null;
              return (
                <div key={r.id} className="roll-row">
                  <button type="button" className="roll-open" onClick={() => setEdit(r)}>
                    <RollMain r={r} sub={[name(r), wait != null && (wait === 0 ? tx("xong hôm nay") : tx("chờ {0} ngày", wait))].filter(Boolean).join(' · ')} warn={wait != null && wait >= 30} />
                  </button>
                  <button type="button" className="pill-btn on" onClick={() => setDev(r)}>{tx("Đã tráng")}</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="section px" style={{ gap: 8 }} aria-label={tx("Đã tráng")}>
          <h2 className="h-mono">{tx("ĐÃ TRÁNG")}</h2>
          <div className="rows">
            {(allDone ? done : done.slice(0, DONE_PAGE)).map((r) => (
              <div key={r.id} className="roll-row">
                <button type="button" className="roll-open" onClick={() => setEdit(r)}>
                  <RollMain r={r} sub={[name(r), r.lab, r.devAt && fmtDate(r.devAt)].filter(Boolean).join(' · ')} />
                </button>
                {r.scansUrl && <a href={r.scansUrl} target="_blank" rel="noreferrer" className="icon-btn ghost" aria-label={tx("Xem ảnh scan")}><IconExternal size={18} /></a>}
              </div>
            ))}
            {!allDone && done.length > DONE_PAGE && (
              <button type="button" className="link-btn" style={{ justifyContent: 'center' }} onClick={() => setAllDone(true)}>{tx("Xem thêm {0} cuộn", done.length - DONE_PAGE)}</button>
            )}
          </div>
        </section>
      )}

      {mine.length > 0 && <FilmStats rolls={mine} byId={byId} showCameras={!only} />}

      <DevelopSheet roll={dev} onClose={() => setDev(null)} />
      <RollSheet open={!!edit} roll={edit} onClose={() => setEdit(null)} />
      <RollSheet open={adding} cameraId={only} onClose={() => setAdding(false)} />
    </div>
  );
}

function RollMain({ r, sub, warn }: { r: Roll; sub: string; warn?: boolean }) {
  const k = kindOf(r);
  return (
    <span className="roll-main">
      <span className={'kind-dot k-' + (k ?? 'color')} title={k ? KIND_LABEL[k] : undefined} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="roll-title">{r.stock}{r.ei && r.iso && r.ei !== r.iso ? <span className="muted mono" style={{ fontSize: 11 }}> @{r.ei}</span> : null}</span>
        <span className={'roll-sub' + (warn ? ' warn' : '')}>{sub}{r.note ? ` · ${r.note}` : ''}</span>
      </span>
    </span>
  );
}

/* ======================================================================
 * Thống kê
 * ====================================================================== */

const KIND_ORDER: FilmKind[] = ['color', 'bw', 'slide', 'cine', 'instant'];
const monthKey = (iso: string) => iso.slice(0, 7);

function FilmStats({ rolls, byId, showCameras }: { rolls: Roll[]; byId: Map<string, Camera>; showCameras: boolean }) {
  const [sel, setSel] = useState<number | null>(null);

  // 12 tháng gần nhất, tính theo ngày chụp xong (cuộn đang lắp: ngày lắp)
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { key, m: d.getMonth() + 1, y: d.getFullYear(), n: rolls.filter((r) => monthKey(r.shotAt ?? r.loadedAt) === key).length };
    });
  }, [rolls]);
  const maxN = Math.max(1, ...months.map((m) => m.n));
  const total12 = months.reduce((s, m) => s + m.n, 0);
  const monthName = (m: { m: number; y: number }) => (lang === 'vi' ? `Tháng ${m.m}/${m.y}` : new Date(m.y, m.m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

  const kinds = KIND_ORDER.map((k) => ({ k, n: rolls.filter((r) => (kindOf(r) ?? 'color') === k).length })).filter((x) => x.n > 0);
  const top = (key: (r: Roll) => string) => Object.entries(rolls.reduce<Record<string, number>>((m, r) => { const k = key(r); m[k] = (m[k] ?? 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const stocks = top((r) => r.stock);
  const cameras = top((r) => { const c = byId.get(r.cameraId); return c ? `${c.brand} ${c.model}` : tx("Máy đã xoá"); });

  const dev = rolls.filter((r) => r.status === 'developed');
  const costYear = dev.filter((r) => (r.devAt ?? '').startsWith(String(year))).reduce((s, r) => s + (r.devCost ?? 0), 0);
  const priced = dev.filter((r) => r.devCost);
  const avgCost = priced.length ? Math.round(priced.reduce((s, r) => s + r.devCost!, 0) / priced.length) : null;
  const waits = dev.filter((r) => r.shotAt && r.devAt).map((r) => Math.max(0, (new Date(r.devAt!).getTime() - new Date(r.shotAt!).getTime()) / 86400000));
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;

  const shown = sel != null ? months[sel] : null;
  return (
    <section className="section px" style={{ gap: 10 }} aria-label={tx("Thống kê")}>
      <h2 className="h-mono">{tx("THỐNG KÊ")}</h2>

      <div className="panel fstat">
        <div className="fstat-head">
          <span className="h2">{tx("Cuộn mỗi tháng")}</span>
          <span className="mono muted" aria-live="polite">{shown ? tx("{0} · {1} cuộn", monthName(shown), shown.n) : tx("12 tháng · {0} cuộn", total12)}</span>
        </div>
        <div className="month-chart" role="img" aria-label={tx("Số cuộn mỗi tháng trong 12 tháng qua")}>
          {months.map((m, i) => (
            <button key={m.key} type="button" className={'mc-col' + (sel === i ? ' on' : '')} aria-label={tx("{0}: {1} cuộn", monthName(m), m.n)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setSel(i)} onPointerLeave={(e) => e.pointerType === 'mouse' && setSel(null)}
              onClick={() => setSel(sel === i ? null : i)}>
              <span className="mc-bar-wrap">
                {m.n > 0 && <span className="mc-bar" style={{ height: `${(m.n / maxN) * 100}%` }} />}
              </span>
              <span className="mc-label">{m.m}<span className="mc-year">{m.m === 1 || i === 0 ? m.y : ''}</span></span>
            </button>
          ))}
        </div>
        <table className="sr-only">
          <caption>{tx("Số cuộn mỗi tháng")}</caption>
          <tbody>{months.map((m) => <tr key={m.key}><th>{monthName(m)}</th><td>{m.n}</td></tr>)}</tbody>
        </table>
      </div>

      {kinds.length > 0 && (
        <div className="panel fstat">
          <span className="h2">{tx("Loại film")}</span>
          <div className="kind-bar" aria-hidden="true">
            {kinds.map(({ k, n }) => <span key={k} className={'k-' + k} style={{ flexGrow: n }} />)}
          </div>
          <div className="kind-legend">
            {kinds.map(({ k, n }) => (
              <span key={k}><span className={'kind-dot k-' + k} />{KIND_LABEL[k]}<b className="mono">{n}</b><span className="mono muted">{Math.round((n / rolls.length) * 100)}%</span></span>
            ))}
          </div>
        </div>
      )}

      <div className="panel fstat">
        <span className="h2">{tx("Film dùng nhiều nhất")}</span>
        <BarList items={stocks} />
      </div>

      {showCameras && cameras.length > 1 && (
        <div className="panel fstat">
          <span className="h2">{tx("Máy chụp nhiều nhất")}</span>
          <BarList items={cameras} />
        </div>
      )}

      <div className="fstat-tiles">
        <div className="stat"><span className="k">{tx("Tiền tráng {0}", year)}</span><span className="v sm">{costYear ? money(costYear, 'VND') : '—'}</span></div>
        <div className="stat"><span className="k">{tx("Trung bình / cuộn")}</span><span className="v sm">{avgCost != null ? money(avgCost, 'VND') : '—'}</span></div>
        <div className="stat"><span className="k">{tx("Chờ tráng trung bình")}</span><span className="v sm">{avgWait != null ? tx("{0} ngày", avgWait) : '—'}</span></div>
        <div className="stat"><span className="k">{tx("Tổng số cuộn")}</span><span className="v sm">{rolls.length}</span></div>
      </div>
    </section>
  );
}

function BarList({ items }: { items: [string, number][] }) {
  const max = Math.max(1, ...items.map(([, n]) => n));
  return (
    <div className="bar-list">
      {items.map(([label, n]) => (
        <div key={label} className="bl-row">
          <span className="bl-label">{label}</span>
          <span className="bl-track"><span className="bl-bar" style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="bl-n mono">{n}</span>
        </div>
      ))}
    </div>
  );
}
