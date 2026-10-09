import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, finishRoll, loadRoll, patchRoll, type Camera, type Roll } from '../db';
import { daysSince, fmtDate, parseAmount, todayISO } from '../lib/format';
import { useCatalogVersion } from '../lib/catalog';
import {
  FILM_STOCKS, KIND_DEV, KIND_LABEL, searchStocks, squashFilm, cameraFilmFormats, defaultShots, findStock, isoFromName, stockLabel, stops,
  type FilmKind, type FilmStock
} from '../lib/filmStocks';
import { toast } from '../lib/toast';
import { DateInput, Segmented, Sheet } from './ui';
import { locale, tx } from '../lib/i18n';

/** 0.667 → "⅔", -1.333 → "-1⅓", 1 → "+1" */
function fmtStops(n: number, sign = true) {
  const thirds = Math.round(Math.abs(n) * 3);
  const whole = Math.floor(thirds / 3);
  const frac = ['', '⅓', '⅔'][thirds % 3];
  const body = `${whole || !frac ? whole : ''}${frac}`;
  return (n < 0 ? '-' : sign && n > 0 ? '+' : '') + body;
}

/* ======================================================================
 * Bảng lắp film
 * ====================================================================== */

type KindFilter = 'all' | FilmKind;

export function LoadFilmSheet({ open, onClose, cam }: { open: boolean; onClose: () => void; cam: Camera }) {
  useCatalogVersion();
  const formats = cameraFilmFormats(cam.format, cam.type);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [pick, setPick] = useState<{ label: string; stock: FilmStock | null } | null>(null);
  const [iso, setIso] = useState('');
  const [ei, setEi] = useState<number | null>(null);
  const [shots, setShots] = useState(36);
  const [expired, setExpired] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());

  const recent = useLiveQuery(async () => {
    const rolls = (await db.rolls.toArray()).filter((r) => !r.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
    return [...new Set(rolls.map((r) => r.stock))].slice(0, 6);
  }, []) ?? [];

  useEffect(() => {
    if (!open) return;
    setQ(''); setPick(null); setEi(null); setExpired(false); setNote(''); setDate(todayISO()); setKind('all');
  }, [open]);

  const fits = (s: FilmStock) => !formats || formats.length === 0 || s.formats.some((f) => formats.includes(f));
  const kinds = useMemo(() => [...new Set(FILM_STOCKS.filter(fits).map((s) => s.kind))], [cam.format, cam.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    return searchStocks(q, FILM_STOCKS.filter((s) => fits(s) && (kind === 'all' || s.kind === kind)));
  }, [q, kind, cam.format, cam.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (label: string, stock: FilmStock | null) => {
    setPick({ label, stock });
    const box = stock?.iso ?? isoFromName(label);
    setIso(box ? String(box) : '');
    setEi(null);
    setShots(defaultShots(stock, cam.format, cam.type));
  };

  const box = Number(iso) || null;
  const shotOptions = cam.format === '120' ? [10, 12, 15, 16] : pick?.stock?.kind === 'instant' ? [8, 10] : cam.type === 'HALF' ? [48, 54, 72] : [24, 27, 36];
  const eiOptions = box ? [-1, 0, 1, 2].map((d) => ({ d, v: Math.round(box * 2 ** d) })) : [];

  const save = async () => {
    if (!pick) return;
    await loadRoll(cam, { stock: pick.label, kind: pick.stock?.kind, iso: box, ei: ei && ei !== box ? ei : null, shots, expired, note: note.trim(), loadedAt: date });
    toast(cam.film ? tx("Đã đổi cuộn — cuộn cũ chuyển sang Chờ tráng") : tx("Đã lắp film"));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={cam.film ? tx("Đổi cuộn film") : tx("Lắp film")} tall>
      {!pick ? (
        <>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("Tìm film: Portra, HP5, 400…")} aria-label={tx("Tìm film")} />
          {kinds.length > 1 && (
            <div className="chips" style={{ padding: 0 }} role="group" aria-label={tx("Loại film")}>
              {(['all', ...kinds] as KindFilter[]).map((k) => (
                <button key={k} type="button" className={'chip' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? tx("Tất cả") : KIND_LABEL[k]}</button>
              ))}
            </div>
          )}
          {!q && kind === 'all' && recent.length > 0 && (
            <>
              <div className="h-mono pick-head">{tx("DÙNG GẦN ĐÂY")}</div>
              <div className="rows pick-list">
                {recent.map((label) => {
                  const s = findStock(label);
                  return <StockRow key={label} label={label} stock={s} onPick={() => choose(label, s)} />;
                })}
              </div>
              <div className="h-mono pick-head">{tx("TẤT CẢ FILM")}{formats?.length === 1 ? tx(" · KHỔ {0}", formats[0]) : ''}</div>
            </>
          )}
          {q.trim() && !list.some((s) => squashFilm(stockLabel(s)) === squashFilm(q)) && (
            <button type="button" className="pick-free" onClick={() => choose(q.trim(), findStock(q.trim()))}>{tx("Dùng “")}{q.trim()}”</button>
          )}
          <div className="rows pick-list" role="listbox" aria-label={tx("Danh sách film")}>
            {list.map((s) => <StockRow key={stockLabel(s)} label={stockLabel(s)} stock={s} onPick={() => choose(stockLabel(s), s)} />)}
          </div>
        </>
      ) : (
        <>
          <button type="button" className="film-picked" onClick={() => setPick(null)}>
            <span className={'kind-dot k-' + (pick.stock?.kind ?? 'color')} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              <b>{pick.label}</b>
              <span className="muted" style={{ display: 'block', fontSize: 12 }}>{pick.stock ? tx("{0} · tráng {1}", KIND_LABEL[pick.stock.kind], KIND_DEV[pick.stock.kind]) : tx("Film tự nhập")}{pick.stock?.note ? ` · ${pick.stock.note}` : ''}</span>
            </span>
            <span className="link-btn">{tx("Đổi")}</span>
          </button>

          {!pick.stock && (
            <label className="field">{tx("ISO hộp")}<input className="input mono" inputMode="numeric" value={iso} onChange={(e) => setIso(e.target.value.replace(/\D/g, ''))} placeholder={tx("vd: 400")} />
            </label>
          )}
          {box && pick.stock?.kind !== 'instant' && (
            <div className="field">{tx("Chụp ở ISO")}<Segmented<string> label={tx("Chụp ở ISO")} value={String(ei ?? box)} onChange={(v) => setEi(Number(v) === box ? null : Number(v))}
                options={eiOptions.map(({ d, v }) => ({ value: String(v), label: d === 0 ? tx("{0} · chuẩn", v) : `${v} · ${d > 0 ? 'push' : 'pull'} ${d > 0 ? '+' : ''}${d}` }))} />
            </div>
          )}
          <div className="field">{tx("Số kiểu")}<Segmented<string> label={tx("Số kiểu")} value={String(shots)} onChange={(v) => setShots(Number(v))} options={shotOptions.map((n) => ({ value: String(n), label: String(n) }))} />
          </div>
          <div className="rows" style={{ padding: 0 }}>
            <label className="check"><span>{tx("Film hết hạn")}</span><input type="checkbox" checked={expired} onChange={(e) => setExpired(e.target.checked)} /></label>
          </div>
          <label className="field">{tx("Ghi chú cuộn")}<input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("vd: chuyến Đà Lạt, chụp đường phố")} />
          </label>
          <div className="field">{tx("Ngày lắp")}<DateInput label={tx("Ngày lắp")} value={date} onChange={setDate} /></div>
          <button type="button" className="btn" onClick={save}>{cam.film ? tx("Đổi sang cuộn này") : tx("Lắp film")}</button>
        </>
      )}
    </Sheet>
  );
}

function StockRow({ label, stock, onPick }: { label: string; stock: FilmStock | null; onPick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={false} className="pick-row" onClick={onPick}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span className={'kind-dot k-' + (stock?.kind ?? 'color')} />
        <span className="pick-name"><span>{label}</span>{stock && <span className="pick-meta">{KIND_LABEL[stock.kind]}{stock.note ? ` · ${stock.note}` : ''}</span>}</span>
      </span>
      {stock && <span className="mono muted" style={{ fontSize: 12 }}>ISO {stock.iso}</span>}
    </button>
  );
}

/* ======================================================================
 * Chụp xong / Đã tráng
 * ====================================================================== */

export function FinishRollSheet({ open, onClose, cam }: { open: boolean; onClose: () => void; cam: Camera }) {
  const [date, setDate] = useState(todayISO());
  useEffect(() => { if (open) setDate(todayISO()); }, [open]);
  const save = async () => {
    await finishRoll(cam, date || todayISO());
    toast(tx("Đã tháo film · cuộn nằm trong Chờ tráng"));
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={tx("Chụp xong cuộn này")}>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{cam.film?.stock} {' '}{tx("sẽ được tháo khỏi máy và chuyển sang danh sách")}{' '}<b>{tx("Chờ tráng")}</b> {' '}{tx("ở trang Film.")}</p>
      <div className="field">{tx("Ngày chụp xong")}<DateInput label={tx("Ngày chụp xong")} value={date} onChange={setDate} /></div>
      <button type="button" className="btn" onClick={save}>{tx("Tháo film")}</button>
    </Sheet>
  );
}

export function DevelopSheet({ roll, onClose }: { roll: Roll | null; onClose: () => void }) {
  const [lab, setLab] = useState('');
  const [date, setDate] = useState(todayISO());
  const [cost, setCost] = useState('');
  const [url, setUrl] = useState('');
  const labs = useLiveQuery(async () => [...new Set((await db.rolls.toArray()).map((r) => r.lab).filter(Boolean) as string[])], []) ?? [];
  useEffect(() => {
    if (!roll) return;
    setLab(roll.lab ?? ''); setDate(roll.devAt ?? todayISO()); setCost(roll.devCost != null ? roll.devCost.toLocaleString(locale) : ''); setUrl(roll.scansUrl ?? '');
  }, [roll?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!roll) return null;
  const save = async () => {
    await patchRoll(roll.id, { status: 'developed', lab: lab.trim(), devAt: date || todayISO(), devCost: parseAmount(cost), scansUrl: url.trim() });
    toast(tx("Đã lưu"));
    onClose();
  };
  const remove = async () => {
    if (!window.confirm(tx("Xoá cuộn {0} khỏi nhật ký?", roll.stock))) return;
    await patchRoll(roll.id, { deletedAt: Date.now() });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={roll.status === 'developed' ? tx("Cuộn đã tráng") : tx("Đánh dấu đã tráng")}>
      <p className="muted" style={{ fontSize: 13 }}>{roll.stock}{roll.note ? ` · ${roll.note}` : ''}</p>
      <label className="field">Lab
        <input className="input" list="labs" value={lab} onChange={(e) => setLab(e.target.value)} placeholder={tx("Tên lab tráng scan")} />
        <datalist id="labs">{labs.map((l) => <option key={l} value={l} />)}</datalist>
      </label>
      <div className="form-grid">
        <div className="field">{tx("Ngày tráng")}<DateInput label={tx("Ngày tráng")} value={date} onChange={setDate} /></div>
        <label className="field">{tx("Chi phí (đ)")}<input className="input mono" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={tx("vd: 90.000")} /></label>
      </div>
      <label className="field">{tx("Link ảnh scan")}<input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={tx("Google Drive, Flickr, link lab gửi…")} />
      </label>
      <button type="button" className="btn" onClick={save}>{roll.status === 'developed' ? tx("Lưu") : tx("Đã tráng")}</button>
      {roll.status === 'developed' && <button type="button" className="btn secondary" onClick={async () => { await patchRoll(roll.id, { status: 'shot' }); onClose(); }}>{tx("Chuyển về Chờ tráng")}</button>}
      <button type="button" className="link-btn" style={{ color: 'var(--down)', alignSelf: 'center' }} onClick={remove}>{tx("Xoá cuộn này")}</button>
    </Sheet>
  );
}

/* ======================================================================
 * Thẻ film trên trang máy
 * ====================================================================== */

export function FilmCard({ cam, onLoad, onFinish }: { cam: Camera; onLoad: () => void; onFinish: () => void }) {
  useCatalogVersion();
  const roll = useLiveQuery(() => (cam.film?.rollId ? db.rolls.get(cam.film.rollId) : undefined), [cam.film?.rollId]);
  const count = useLiveQuery(() => db.rolls.where('cameraId').equals(cam.id).filter((r) => !r.deletedAt && r.status !== 'loaded').count(), [cam.id]) ?? 0;
  const history = count > 0 && <Link to={`/film?may=${cam.id}`} className="film-history">{count} {' '}{tx("cuộn đã chụp bằng máy này →")}</Link>;

  if (!cam.film) {
    return (
      <>
        <button type="button" className="dashed" style={{ width: '100%', background: 'transparent', justifyContent: 'center', minHeight: 52 }} onClick={onLoad}>{tx("+ Lắp film vào máy này")}</button>
        {history}
      </>
    );
  }
  const f = cam.film;
  const kind = roll?.kind ?? findStock(f.stock)?.kind;
  const days = f.loadedAt ? daysSince(f.loadedAt) : null;
  const iso = roll?.iso ?? f.iso ?? isoFromName(f.stock);
  const ei = roll?.ei ?? f.ei;
  return (
    <>
      <section className="film-card" aria-label={tx("Film đang lắp")}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 500 }}>{tx("ĐANG LẮP FILM")}</span>
          {days != null && <span className="mono" style={{ fontSize: 11 }}>{days === 0 ? tx("hôm nay") : tx("{0} ngày", days)}</span>}
        </div>
        <span className="big">{f.stock}</span>
        <div className="film-tags">
          {iso && <span>ISO {ei && ei !== iso ? `${ei} (${stops(iso, ei) > 0 ? 'push' : 'pull'} ${fmtStops(stops(iso, ei))})` : iso}</span>}
          {kind && <span>{KIND_LABEL[kind as FilmKind]}</span>}
          {roll?.shots && <span>{roll.shots} {' '}{tx("kiểu")}</span>}
          {roll?.expired && <span>{tx("Hết hạn")}</span>}
          {f.loadedAt && <span>{tx("lắp")}{' '}{fmtDate(f.loadedAt)}</span>}
        </div>
        {roll?.note && <span style={{ fontSize: 13 }}>{roll.note}</span>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-dark" onClick={onFinish}>{tx("Chụp xong")}</button>
          <button type="button" className="btn-line" onClick={onLoad}>{tx("Đổi cuộn")}</button>
        </div>
      </section>
      {history}
    </>
  );
}
