import { BackupReminder } from '../components/Backup';
import { loanStatus } from '../lib/loans';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useCameras, useSettings, type Camera } from '../db';
import { TYPE_LABEL, TYPE_ORDER, isZoom, lensLabel, trieu, trieuLabel } from '../lib/format';
import { changePct, groupPrices } from '../lib/stats';
import { CameraThumb } from '../components/ui';
import { IconFilm, IconGrid, IconList, IconSearch, IconShelf, IconSort } from '../components/Icons';

type View = 'grid' | 'list' | 'shelf';
const SORTS = [
  { k: 'value', label: 'Giá trị: cao → thấp' },
  { k: 'viewed', label: 'Đã xem gần đây' },
  { k: 'recent', label: 'Mới thêm gần đây' },
  { k: 'brand', label: 'Hãng: A → Z' },
  { k: 'type', label: 'Theo loại máy' },
  { k: 'focal', label: 'Tiêu cự: rộng → hẹp' }
] as const;

function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* bỏ qua */ }
}

export default function Collection() {
  const cams = useCameras();
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const filter = params.get('loc') ?? 'all';
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>(() => (readLS('kho-view') as View) || settings.defaultView);
  const [sortIdx, setSortIdx] = useState(() => Number(readLS('kho-sort') ?? 0) % SORTS.length);

  const byCam = useMemo(() => groupPrices(prices), [prices]);
  const all = cams ?? [];
  const owned = all.filter((c) => c.status === 'owned');

  const match = (c: Camera, f: string) => {
    if (f === 'sold') return c.status === 'sold';
    if (c.status !== 'owned') return false;
    if (f === 'all') return true;
    if (f === 'film') return !!c.film;
    if (f === 'loan') return !!c.loan;
    if (f === 'zoom') return isZoom(c.lens);
    if (f === 'noprice') return c.marketValue == null;
    if (f === 'untyped') return !c.type;
    return c.type === f;
  };

  const chips = useMemo(() => {
    const out: { k: string; label: string; n: number }[] = [{ k: 'all', label: 'Tất cả', n: owned.length }];
    TYPE_ORDER.forEach((t) => {
      const n = owned.filter((c) => c.type === t).length;
      if (n) out.push({ k: t || 'untyped', label: TYPE_LABEL[t], n });
    });
    const zoom = owned.filter((c) => isZoom(c.lens)).length;
    if (zoom) out.push({ k: 'zoom', label: 'Zoom', n: zoom });
    const film = owned.filter((c) => c.film).length;
    if (film) out.push({ k: 'film', label: 'Có film', n: film });
    const lent = owned.filter((c) => c.loan).length;
    if (lent) out.splice(1, 0, { k: 'loan', label: 'Cho mượn', n: lent });
    const noprice = owned.filter((c) => c.marketValue == null).length;
    if (noprice) out.push({ k: 'noprice', label: 'Chưa có giá', n: noprice });
    const sold = all.filter((c) => c.status === 'sold').length;
    if (sold) out.push({ k: 'sold', label: 'Đã bán', n: sold });
    return out;
  }, [all, owned]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = all.filter((c) => match(c, filter)).filter((c) => {
      if (!needle) return true;
      return [c.brand, c.model, c.mount, c.serial, c.notes, c.tags.join(' '), c.film?.stock ?? '', TYPE_LABEL[c.type], lensLabel(c.lens) ?? '', isZoom(c.lens) ? 'zoom' : '']
        .join(' ').toLowerCase().includes(needle);
    });
    const sk = SORTS[sortIdx].k;
    list.sort((a, b) => {
      if (sk === 'value') return (b.marketValue ?? -1) - (a.marketValue ?? -1);
      if (sk === 'recent') return b.createdAt - a.createdAt;
      if (sk === 'viewed') return (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0) || b.createdAt - a.createdAt;
      if (sk === 'focal') return (a.lens?.focal ?? 9999) - (b.lens?.focal ?? 9999) || a.brand.localeCompare(b.brand);
      if (sk === 'type') return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.brand.localeCompare(b.brand);
      return a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model);
    });
    return list;
  }, [all, filter, q, sortIdx]);

  const total = owned.reduce((s, c) => s + (c.marketValue ?? 0), 0);
  const loaded = owned.filter((c) => c.film).length;
  const overdue = owned.filter((c) => c.loan && loanStatus(c.loan).overdue);
  const waitingDev = useLiveQuery(() => db.rolls.where('status').equals('shot').filter((r) => !r.deletedAt).count(), []) ?? 0;

  const pickView = (v: View) => { setView(v); writeLS('kho-view', v); };
  const cycleSort = () => { const n = (sortIdx + 1) % SORTS.length; setSortIdx(n); writeLS('kho-sort', String(n)); };
  const setFilter = (k: string) => setParams(k === 'all' ? {} : { loc: k }, { replace: true });

  if (cams === undefined) return <div className="page" />;

  const ownerLine = settings.ownerName ? `Bộ sưu tập của ${settings.ownerName}` : 'Bộ sưu tập';

  return (
    <div className="page">
      <header className="page-head px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">{ownerLine}</span>
          <h1 className="title-xl">Kho máy</h1>
        </div>
      </header>

      {overdue.length > 0 && (
        <div className="px loan-nudge" role="status">
          <button type="button" className="loan-card overdue" style={{ width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setFilter('loan')}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{overdue.length === 1 ? `${overdue[0].loan!.to} giữ ${overdue[0].model} quá hẹn ${-loanStatus(overdue[0].loan!).left!} ngày` : `${overdue.length} máy cho mượn đã quá hẹn trả`}</span>
            <span className="muted" style={{ fontSize: 12 }}>Bấm để xem các máy đang cho mượn</span>
          </button>
        </div>
      )}
      {all.length > 0 && <BackupReminder />}

      {all.length === 0 ? (
        <div className="empty">
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)' }}>
            Kho đang trống. Nhập danh sách có sẵn (CSV từ CamDex hoặc file sao lưu), hoặc thêm từng máy.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/cai-dat/nhap-xuat" className="btn">Nhập CSV</Link>
            <Link to="/them" className="btn secondary">Thêm máy đầu tiên</Link>
          </div>
        </div>
      ) : (
        <>
          <section className="stats px" aria-label="Tổng quan">
            <div className="stat"><span className="k">Số máy</span><span className="v">{owned.length}</span></div>
            <Link to="/gia-tri" className="stat"><span className="k">Ước tính</span><span className="v">{trieu(total)}<small> tr</small></span></Link>
            <Link to="/film" className="stat">
              <span className="k">Film{waitingDev ? ` · ${waitingDev} chờ tráng` : ''}</span><span className="v" style={{ color: 'var(--accent)' }}>{loaded}<small> lắp</small></span>
            </Link>
          </section>

          <div className="px">
            <label className="search">
              <IconSearch size={18} />
              <span className="sr-only">Tìm máy</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm hãng, mẫu, ngàm, serial…" />
            </label>
          </div>

          <div className="chips" role="group" aria-label="Lọc nhanh">
            {chips.map((c) => (
              <button key={c.k} type="button" className={'chip' + (filter === c.k ? ' on' : '')} aria-pressed={filter === c.k} onClick={() => setFilter(c.k)}>
                {c.label}<span className="n">{c.n}</span>
              </button>
            ))}
          </div>

          <div className="toolbar px">
            <button type="button" className="sort-btn" onClick={cycleSort}><IconSort size={18} /><span>{SORTS[sortIdx].label}</span></button>
            <div className="views" role="group" aria-label="Kiểu hiển thị">
              <button type="button" aria-label="Lưới" aria-pressed={view === 'grid'} onClick={() => pickView('grid')}><IconGrid size={18} /></button>
              <button type="button" aria-label="Danh sách" aria-pressed={view === 'list'} onClick={() => pickView('list')}><IconList size={18} /></button>
              <button type="button" aria-label="Kệ trưng bày" aria-pressed={view === 'shelf'} onClick={() => pickView('shelf')}><IconShelf size={18} /></button>
            </div>
          </div>

          {items.length === 0 && <p className="px muted" style={{ fontSize: 14 }}>Không có máy nào khớp.</p>}

          {view === 'grid' && (
            <div className="grid px">
              {items.map((c) => {
                const pct = changePct(byCam.get(c.id));
                return (
                  <Link key={c.id} to={`/may/${c.id}`} className="card">
                    <div className="tile">
                      <CameraThumb camera={c} artWidth={104} />
                      <span className="badge">{c.type === 'DIG' ? 'Digital' : c.format}</span>
                      {c.status === 'sold' && <span className="pill">Đã bán</span>}
                      {c.film && <span className="film-tag"><IconFilm size={12} />{c.film.stock}</span>}
                      {c.loan && <span className={'loan-tag' + (loanStatus(c.loan).overdue ? ' overdue' : '')}>{c.loan.to} mượn</span>}
                    </div>
                    <div className="meta">
                      <span className="sub">{c.brand} · {TYPE_LABEL[c.type]}</span>
                      <span className="name">{c.model}</span>
                      {lensLabel(c.lens) && <span className="lens-spec">{lensLabel(c.lens)}</span>}
                      <div className="row">
                        <span className="val">{c.status === 'sold' ? '—' : trieuLabel(c.marketValue)}</span>
                        {pct != null && <span className={'chg ' + (pct > 0 ? 'up' : pct < 0 ? 'down' : '')}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '–'} {Math.abs(pct)}%</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {view === 'list' && (
            <div className="list px">
              {items.map((c) => (
                <Link key={c.id} to={`/may/${c.id}`} className="list-row">
                  <div className="list-thumb">
                    <CameraThumb camera={c} artWidth={52} strokeWidth={3} />
                    {c.film && <span className="dot" aria-label="Đang lắp film" />}
                  </div>
                  <div className="list-main">
                    <span className="name">{c.brand} {c.model}</span>
                    <span className="spec">{[TYPE_LABEL[c.type], lensLabel(c.lens) ?? (c.type === 'DIG' ? 'Digital' : c.format), c.lens?.kind === 'interchangeable' ? c.mount : ''].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="list-side">
                    <span className="mono" style={{ fontSize: 13 }}>{c.status === 'sold' ? '—' : trieuLabel(c.marketValue)}</span>
                    <span style={{ color: c.status === 'sold' ? 'var(--muted)' : c.loan ? '#7FB8FF' : 'var(--up)' }}>{c.status === 'sold' ? 'Đã bán' : c.loan ? `${c.loan.to} mượn` : 'Trong kho'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {view === 'shelf' && (
            <div className="shelf px">
              {items.map((c) => (
                <Link key={c.id} to={`/may/${c.id}`} className="card" style={{ gap: 6 }}>
                  <div className="tile">
                    <CameraThumb camera={c} artWidth={72} strokeWidth={2.5} />
                    {c.film && <span className="dot" aria-label="Đang lắp film" />}
                  </div>
                  <span className="name">{c.model}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
