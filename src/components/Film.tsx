import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, finishRoll, loadRoll, patchRoll, type Camera, type Roll } from '../db';
import { daysSince, fmtDate, parseAmount, todayISO } from '../lib/format';
import { findModel, useCatalogVersion } from '../lib/catalog';
import type { CatalogModel } from '../lib/catalogTypes';
import {
  FILM_STOCKS, KIND_DEV, KIND_LABEL, cameraFilmFormats, defaultShots, findStock, isoFromName, stockLabel, stops,
  type FilmKind, type FilmStock
} from '../lib/filmStocks';
import { toast } from '../lib/toast';
import { DateInput, Segmented, Sheet } from './ui';

/** 0.667 → "⅔", -1.333 → "-1⅓", 1 → "+1" */
function fmtStops(n: number, sign = true) {
  const thirds = Math.round(Math.abs(n) * 3);
  const whole = Math.floor(thirds / 3);
  const frac = ['', '⅓', '⅔'][thirds % 3];
  const body = `${whole || !frac ? whole : ''}${frac}`;
  return (n < 0 ? '-' : sign && n > 0 ? '+' : '') + body;
}

/* ======================================================================
 * Gợi ý khi lắp film: ISO, mã DX, dải đo sáng, push/pull, film hết hạn
 * ====================================================================== */

export interface Advice { tone: 'info' | 'warn'; text: string }

export function filmAdvice(cam: Camera, model: CatalogModel | null, r: { stock: string; iso?: number | null; ei?: number | null; kind?: string; expired?: boolean }): Advice[] {
  const out: Advice[] = [];
  const box = r.iso ?? null;
  const shoot = r.ei ?? box;
  const f = model?.film;
  const dx = f?.iso_setting === 'DX';
  if (box && dx) {
    const vals = (f?.iso_values ?? []).slice().sort((a, b) => a - b);
    if (r.ei && r.ei !== box) {
      out.push({ tone: 'warn', text: `Máy tự đọc mã DX nên sẽ chụp ở ISO ${box}, không đẩy/kéo tay được. Muốn push/pull cần film không có mã DX hoặc dán lại mã.` });
    } else if (vals.length && !vals.includes(box)) {
      const lower = [...vals].reverse().find((v) => v <= box) ?? vals[0];
      const d = stops(box, lower);
      out.push({ tone: Math.abs(d) > 1 ? 'warn' : 'info', text: `Máy đọc mã DX, chỉ có ISO ${vals.join(' / ')} → cuộn này sẽ được chụp ở ISO ${lower} (${d < 0 ? `dư sáng ${fmtStops(-d, false)} stop` : `thiếu sáng ${fmtStops(d, false)} stop`})${r.kind === 'slide' ? ' — dương bản sẽ lệch sáng rõ.' : ', film âm bản thường chịu được.'}` });
    } else {
      out.push({ tone: 'info', text: 'Máy tự đọc mã DX, không cần chỉnh ISO.' });
    }
  } else if (shoot && (f?.iso_setting === 'manual' || ['SLR', 'RF', 'TLR', 'MF', 'HALF'].includes(cam.type))) {
    out.push({ tone: 'info', text: `Nhớ chỉnh ISO trên máy về ${shoot}.` });
  }
  if (shoot && f?.iso_min && f?.iso_max && (shoot < f.iso_min || shoot > f.iso_max)) {
    out.push({ tone: 'warn', text: `Máy chỉ đo sáng được ISO ${f.iso_min}–${f.iso_max.toLocaleString('vi-VN')} — ISO ${shoot} nằm ngoài dải này, phải đo sáng ngoài.` });
  }
  if (box && r.ei && r.ei !== box) {
    const d = stops(box, r.ei);
    out.push({ tone: 'warn', text: `${d > 0 ? 'Push' : 'Pull'} ${fmtStops(d)} stop: nhớ dặn lab tráng ${d > 0 ? 'push' : 'pull'} ${fmtStops(d)}.` });
  }
  if (r.kind === 'slide' && (cam.type === 'PNS' || model?.exposure?.modes?.every((m) => m === 'program'))) {
    out.push({ tone: 'info', text: 'Dương bản chỉ chịu lệch khoảng ±½ stop; máy tự động hoàn toàn dễ làm cháy hoặc tối ảnh.' });
  }
  if (r.kind === 'cine' && !/cinestill/i.test(r.stock)) out.push({ tone: 'warn', text: 'Film cine chưa bỏ lớp remjet: cần lab tráng ECN-2 hoặc báo lab trước.' });
  if (r.expired) out.push({ tone: 'info', text: 'Film hết hạn: thường chụp dư khoảng 1 stop cho mỗi 10 năm quá hạn.' });
  return out;
}

/* ======================================================================
 * Bảng lắp film
 * ====================================================================== */

type KindFilter = 'all' | FilmKind;

export function LoadFilmSheet({ open, onClose, cam }: { open: boolean; onClose: () => void; cam: Camera }) {
  useCatalogVersion();
  const model = findModel(cam.brand, cam.model);
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
    const k = q.toLowerCase().replace(/\s+/g, ' ').trim();
    return FILM_STOCKS.filter((s) => fits(s) && (kind === 'all' || s.kind === kind) && (!k || stockLabel(s).toLowerCase().includes(k) || String(s.iso) === k));
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
  const advice = pick ? filmAdvice(cam, model, { stock: pick.label, iso: box, ei, kind: pick.stock?.kind, expired }) : [];

  const save = async () => {
    if (!pick) return;
    await loadRoll(cam, { stock: pick.label, kind: pick.stock?.kind, iso: box, ei: ei && ei !== box ? ei : null, shots, expired, note: note.trim(), loadedAt: date });
    toast(cam.film ? 'Đã đổi cuộn — cuộn cũ chuyển sang Chờ tráng' : 'Đã lắp film');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={cam.film ? 'Đổi cuộn film' : 'Lắp film'} tall>
      {!pick ? (
        <>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm film: Portra, HP5, 400…" aria-label="Tìm film" />
          {kinds.length > 1 && (
            <div className="chips" style={{ padding: 0 }} role="group" aria-label="Loại film">
              {(['all', ...kinds] as KindFilter[]).map((k) => (
                <button key={k} type="button" className={'chip' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Tất cả' : KIND_LABEL[k]}</button>
              ))}
            </div>
          )}
          {!q && kind === 'all' && recent.length > 0 && (
            <>
              <div className="h-mono pick-head">DÙNG GẦN ĐÂY</div>
              <div className="rows pick-list">
                {recent.map((label) => {
                  const s = findStock(label);
                  return <StockRow key={label} label={label} stock={s} onPick={() => choose(label, s)} />;
                })}
              </div>
              <div className="h-mono pick-head">TẤT CẢ FILM{formats?.length === 1 ? ` · KHỔ ${formats[0]}` : ''}</div>
            </>
          )}
          {q.trim() && !list.some((s) => stockLabel(s).toLowerCase() === q.trim().toLowerCase()) && (
            <button type="button" className="pick-free" onClick={() => choose(q.trim(), findStock(q.trim()))}>Dùng “{q.trim()}”</button>
          )}
          <div className="rows pick-list" role="listbox" aria-label="Danh sách film">
            {list.map((s) => <StockRow key={stockLabel(s)} label={stockLabel(s)} stock={s} onPick={() => choose(stockLabel(s), s)} />)}
          </div>
        </>
      ) : (
        <>
          <button type="button" className="film-picked" onClick={() => setPick(null)}>
            <span className={'kind-dot k-' + (pick.stock?.kind ?? 'color')} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              <b>{pick.label}</b>
              <span className="muted" style={{ display: 'block', fontSize: 12 }}>{pick.stock ? `${KIND_LABEL[pick.stock.kind]} · tráng ${KIND_DEV[pick.stock.kind]}` : 'Film tự nhập'}{pick.stock?.note ? ` · ${pick.stock.note}` : ''}</span>
            </span>
            <span className="link-btn">Đổi</span>
          </button>

          {!pick.stock && (
            <label className="field">ISO hộp
              <input className="input mono" inputMode="numeric" value={iso} onChange={(e) => setIso(e.target.value.replace(/\D/g, ''))} placeholder="vd: 400" />
            </label>
          )}
          {box && pick.stock?.kind !== 'instant' && (
            <div className="field">Chụp ở ISO
              <Segmented<string> label="Chụp ở ISO" value={String(ei ?? box)} onChange={(v) => setEi(Number(v) === box ? null : Number(v))}
                options={eiOptions.map(({ d, v }) => ({ value: String(v), label: d === 0 ? `${v} · chuẩn` : `${v} · ${d > 0 ? 'push' : 'pull'} ${d > 0 ? '+' : ''}${d}` }))} />
            </div>
          )}
          <div className="field">Số kiểu
            <Segmented<string> label="Số kiểu" value={String(shots)} onChange={(v) => setShots(Number(v))} options={shotOptions.map((n) => ({ value: String(n), label: String(n) }))} />
          </div>
          <div className="rows" style={{ padding: 0 }}>
            <label className="check"><span>Film hết hạn</span><input type="checkbox" checked={expired} onChange={(e) => setExpired(e.target.checked)} /></label>
          </div>
          <label className="field">Ghi chú cuộn
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: chuyến Đà Lạt, chụp đường phố" />
          </label>
          <div className="field">Ngày lắp<DateInput label="Ngày lắp" value={date} onChange={setDate} /></div>
          {advice.length > 0 && <AdviceList items={advice} />}
          <button type="button" className="btn" onClick={save}>{cam.film ? 'Đổi sang cuộn này' : 'Lắp film'}</button>
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

export function AdviceList({ items }: { items: Advice[] }) {
  return (
    <ul className="advice">
      {items.map((a, i) => <li key={i} className={a.tone}>{a.text}</li>)}
    </ul>
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
    toast('Đã tháo film · cuộn nằm trong Chờ tráng');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Chụp xong cuộn này">
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{cam.film?.stock} sẽ được tháo khỏi máy và chuyển sang danh sách <b>Chờ tráng</b> ở trang Film.</p>
      <div className="field">Ngày chụp xong<DateInput label="Ngày chụp xong" value={date} onChange={setDate} /></div>
      <button type="button" className="btn" onClick={save}>Tháo film</button>
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
    setLab(roll.lab ?? ''); setDate(roll.devAt ?? todayISO()); setCost(roll.devCost != null ? roll.devCost.toLocaleString('vi-VN') : ''); setUrl(roll.scansUrl ?? '');
  }, [roll?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!roll) return null;
  const save = async () => {
    await patchRoll(roll.id, { status: 'developed', lab: lab.trim(), devAt: date || todayISO(), devCost: parseAmount(cost), scansUrl: url.trim() });
    toast('Đã lưu');
    onClose();
  };
  const remove = async () => {
    if (!window.confirm(`Xoá cuộn ${roll.stock} khỏi nhật ký?`)) return;
    await patchRoll(roll.id, { deletedAt: Date.now() });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={roll.status === 'developed' ? 'Cuộn đã tráng' : 'Đánh dấu đã tráng'}>
      <p className="muted" style={{ fontSize: 13 }}>{roll.stock}{roll.note ? ` · ${roll.note}` : ''}</p>
      <label className="field">Lab
        <input className="input" list="labs" value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Tên lab tráng scan" />
        <datalist id="labs">{labs.map((l) => <option key={l} value={l} />)}</datalist>
      </label>
      <div className="form-grid">
        <div className="field">Ngày tráng<DateInput label="Ngày tráng" value={date} onChange={setDate} /></div>
        <label className="field">Chi phí (đ)<input className="input mono" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="vd: 90.000" /></label>
      </div>
      <label className="field">Link ảnh scan
        <input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Google Drive, Flickr, link lab gửi…" />
      </label>
      <button type="button" className="btn" onClick={save}>{roll.status === 'developed' ? 'Lưu' : 'Đã tráng'}</button>
      {roll.status === 'developed' && <button type="button" className="btn secondary" onClick={async () => { await patchRoll(roll.id, { status: 'shot' }); onClose(); }}>Chuyển về Chờ tráng</button>}
      <button type="button" className="link-btn" style={{ color: 'var(--down)', alignSelf: 'center' }} onClick={remove}>Xoá cuộn này</button>
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
  const history = count > 0 && <Link to={`/film?may=${cam.id}`} className="film-history">{count} cuộn đã chụp bằng máy này →</Link>;

  if (!cam.film) {
    return (
      <>
        <button type="button" className="dashed" style={{ width: '100%', background: 'transparent', justifyContent: 'center', minHeight: 52 }} onClick={onLoad}>+ Lắp film vào máy này</button>
        {history}
      </>
    );
  }
  const f = cam.film;
  const kind = roll?.kind ?? findStock(f.stock)?.kind;
  const days = f.loadedAt ? daysSince(f.loadedAt) : null;
  const advice = filmAdvice(cam, findModel(cam.brand, cam.model), { stock: f.stock, iso: roll?.iso ?? f.iso ?? isoFromName(f.stock), ei: roll?.ei ?? f.ei, kind, expired: roll?.expired });
  const iso = roll?.iso ?? f.iso ?? isoFromName(f.stock);
  const ei = roll?.ei ?? f.ei;
  return (
    <>
      <section className="film-card" aria-label="Film đang lắp">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 500 }}>ĐANG LẮP FILM</span>
          {days != null && <span className="mono" style={{ fontSize: 11 }}>{days === 0 ? 'hôm nay' : `${days} ngày`}</span>}
        </div>
        <span className="big">{f.stock}</span>
        <div className="film-tags">
          {iso && <span>ISO {ei && ei !== iso ? `${ei} (${stops(iso, ei) > 0 ? 'push' : 'pull'} ${fmtStops(stops(iso, ei))})` : iso}</span>}
          {kind && <span>{KIND_LABEL[kind as FilmKind]}</span>}
          {roll?.shots && <span>{roll.shots} kiểu</span>}
          {roll?.expired && <span>Hết hạn</span>}
          {f.loadedAt && <span>lắp {fmtDate(f.loadedAt)}</span>}
        </div>
        {roll?.note && <span style={{ fontSize: 13 }}>{roll.note}</span>}
        {advice.length > 0 && <span className="film-hint">{advice[0].text}</span>}
        {days != null && days > 60 && <span className="film-hint">Cuộn đã nằm trong máy {days} ngày — nhớ chụp nốt và đem tráng.</span>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-dark" onClick={onFinish}>Chụp xong</button>
          <button type="button" className="btn-line" onClick={onLoad}>Đổi cuộn</button>
        </div>
      </section>
      {history}
    </>
  );
}
