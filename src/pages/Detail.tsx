import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { addPhotos, addPrice, db, deleteCamera, finishRoll, patchCamera, uid, useSettings, type Camera, type Currency, type LensSpec, type Photo } from '../db';
import { CONDITIONS, TYPE_LABEL, isZoom, lensLabel, fmtDate, fmtTs, median, money, parseAmount, parseVND, purchaseVND, toVND, todayISO, trieu, trieuLabel } from '../lib/format';
import { changePct } from '../lib/stats';
import { compressImage, useObjectURL } from '../lib/images';
import { toast } from '../lib/toast';
import { refreshCameraPrice, remainingQuota } from '../lib/autoPrice';
import { defaultLensKind, findModel, useCatalogVersion } from '../lib/catalog';
import { useSampleImage } from '../lib/sampleImage';
import { ContributeSheet } from '../components/ContributeSheet';
import { FilmCard, FinishRollSheet, LoadFilmSheet } from '../components/Film';
import { SpecCard } from '../components/SpecCard';
import { LensSpecFields } from '../components/LensSpecFields';
import { CameraArt } from '../components/CameraArt';
import { DateInput, Segmented, Sheet, Sparkline } from '../components/ui';
import { IconBack, IconClock, IconEdit, IconExternal, IconImage, IconTrash } from '../components/Icons';

const BASIS: Record<string, string> = { sold: 'Theo giá đã bán eBay', asking: 'Theo giá rao bán eBay', mixed: 'Giá bán + giá rao' };
const CONF: Record<string, string> = { high: 'cao', medium: 'vừa', low: 'thấp' };

function HeroPhoto({ photo }: { photo: Photo }) {
  const url = useObjectURL(photo.blob);
  return url ? <img src={url} alt="" /> : null;
}

export default function Detail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const cam = useLiveQuery(() => db.cameras.get(id), [id]);
  const photos = useLiveQuery(() => db.photos.where('cameraId').equals(id).sortBy('createdAt'), [id]);
  const prices = useLiveQuery(() => db.prices.where('cameraId').equals(id).sortBy('date'), [id]);
  const service = useLiveQuery(() => db.service.where('cameraId').equals(id).reverse().sortBy('date'), [id]);
  const [sheet, setSheet] = useState<null | 'price' | 'film' | 'finish' | 'service' | 'lens' | 'lensSpec' | 'purchase' | 'profile'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [looking, setLooking] = useState(false);
  const [slide, setSlide] = useState(0);
  const [contrib, setContrib] = useState(false);
  useCatalogVersion();
  const entryEarly = cam ? findModel(cam.brand, cam.model) : null;
  const sampleImg = useSampleImage(entryEarly, !!cam && !cam.coverPhotoId);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Ghi lại lần xem (không đụng updatedAt để không ảnh hưởng đồng bộ sau này)
  useEffect(() => { if (id) db.cameras.update(id, { lastViewedAt: Date.now() }).catch(() => {}); }, [id]);

  const orderedPhotos = useMemo(() => {
    if (!photos || !cam) return [];
    const cover = photos.find((p) => p.id === cam.coverPhotoId);
    return cover ? [cover, ...photos.filter((p) => p !== cover)] : photos;
  }, [photos, cam]);

  if (cam === undefined) return <div className="page" />;
  if (!cam || cam.deletedAt) {
    return (
      <div className="page px">
        <p className="muted">Không tìm thấy máy này.</p>
        <Link to="/" className="btn secondary">Về Kho máy</Link>
      </div>
    );
  }

  const buy = purchaseVND(cam, settings.rates);
  const diff = buy != null && cam.marketValue != null ? cam.marketValue - buy : null;
  const pct = changePct(prices);

  const autoLookup = async () => {
    const left = remainingQuota(settings);
    if (left <= 0) { toast(`Đã dùng hết ${settings.monthlyQuota} lượt tra giá tháng này. Có thể nhập tay.`); return; }
    const age = cam.marketUpdatedAt ? Math.floor((Date.now() - cam.marketUpdatedAt) / 86400000) : null;
    if (age != null && age < 7 && !window.confirm(`Giá vừa cập nhật ${age === 0 ? 'hôm nay' : `${age} ngày trước`}. Tra lại sẽ tốn 1 lượt (còn ${left} lượt tháng này). Vẫn tra?`)) return;
    setLooking(true);
    try {
      const v = await refreshCameraPrice(cam, 'manual');
      toast(v != null ? `Giá thị trường: ${trieu(v)} tr · còn ${left - 1} lượt` : 'Chưa tìm được dữ liệu giá đủ tin cậy');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi khi tra giá');
    } finally {
      setLooking(false);
    }
  };

  const onPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const blobs = await Promise.all([...files].map((f) => compressImage(f)));
    await addPhotos(cam.id, blobs);
    toast(`Đã thêm ${blobs.length} ảnh`);
  };

  const toggleStatus = async () => {
    const toSold = cam.status === 'owned';
    if (!window.confirm(toSold ? `Đánh dấu ${cam.brand} ${cam.model} là đã bán? Máy sẽ không còn tính vào giá trị bộ sưu tập.` : `Chuyển ${cam.brand} ${cam.model} về Trong kho?`)) return;
    if (toSold && cam.film) await finishRoll(cam, todayISO());
    await patchCamera(cam.id, { status: toSold ? 'sold' : 'owned' });
    toast(toSold ? 'Đã chuyển sang Đã bán' : 'Đã chuyển về Trong kho');
  };

  const onDelete = async () => {
    if (!window.confirm(`Xóa ${cam.brand} ${cam.model} khỏi kho?`)) return;
    await deleteCamera(cam.id);
    toast('Đã xóa máy');
    nav('/', { replace: true });
  };

  const entry = findModel(cam.brand, cam.model);
  const lensKind = cam.lens?.kind ?? defaultLensKind(cam.type);
  const lensTag = lensLabel(cam.lens);

  const sample = !orderedPhotos.length ? sampleImg?.url : undefined;
  const subline = [TYPE_LABEL[cam.type], cam.type === 'DIG' ? null : cam.format, lensTag ?? (lensKind === 'interchangeable' && cam.mount ? `Ngàm ${cam.mount}` : null), cam.year ? String(cam.year) : (entry?.release?.year ? String(entry.release.year) : undefined)].filter(Boolean).join(' · ');

  return (
    <div style={{ paddingBottom: 'calc(var(--safe-bottom) + 40px)' }}>
      <div className="showcase">
        {orderedPhotos.length ? (
          <div className="hero-scroll" onScroll={(e) => { const el = e.currentTarget; setSlide(Math.round(el.scrollLeft / el.clientWidth)); }}>
            {orderedPhotos.map((p) => <HeroPhoto key={p.id} photo={p} />)}
          </div>
        ) : sample ? (
          <>
            <img className="showcase-sample" src={sample} alt="" />
            <a className="showcase-credit" href={sampleImg?.page} target="_blank" rel="noreferrer">Ảnh mẫu · {sampleImg?.artist}{sampleImg?.license ? ` · ${sampleImg.license}` : ''}</a>
          </>
        ) : (
          <div className="showcase-empty">
            <CameraArt type={cam.type} width={260} strokeWidth={1.1} />
            <button type="button" className="pill-btn" onClick={() => fileRef.current?.click()}>+ Thêm ảnh máy của bạn</button>
          </div>
        )}
        <div className="showcase-shade" aria-hidden="true" />
        <div className="hero-actions">
          <button type="button" className="icon-btn dark" aria-label="Quay lại" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}><IconBack /></button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="icon-btn dark" aria-label="Thêm ảnh" onClick={() => fileRef.current?.click()}><IconImage size={19} /></button>
            <Link to={`/may/${cam.id}/sua`} className="icon-btn dark" aria-label="Sửa thông tin"><IconEdit size={19} /></Link>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onPhotos(e.target.files); e.target.value = ''; }} />

        <div className="showcase-info">
          {orderedPhotos.length > 1 && (
            <div className="dots" aria-label={`Ảnh ${slide + 1}/${orderedPhotos.length}`}>
              {orderedPhotos.map((p, i) => <span key={p.id} className={i === slide ? 'on' : ''} />)}
            </div>
          )}
          <span style={{ fontSize: 15, color: 'var(--text-2)' }}>{cam.brand}</span>
          <h1 className="showcase-title">{cam.model}</h1>
          {subline && <span className="showcase-sub">{subline}</span>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            <span className={'status-chip ' + cam.status}>{cam.status === 'owned' ? 'Trong kho' : 'Đã bán'}</span>
            {cam.marketValue != null && cam.status === 'owned' && <span className="status-chip">{trieu(cam.marketValue)} tr</span>}
            {cam.film && <span className="status-chip film">{cam.film.stock}</span>}
          </div>
          <button type="button" className="swipe-hint" onClick={() => detailsRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            Vuốt lên xem chi tiết
          </button>
        </div>
      </div>

      <div className="detail-sheet" ref={detailsRef}>
      {cam.status === 'owned' && cam.type !== 'DIG' && (
        <div className="px">
          <FilmCard cam={cam} onLoad={() => setSheet('film')} onFinish={() => setSheet('finish')} />
        </div>
      )}

      <section className="panel" aria-label="Giá thị trường" style={{ margin: '0 20px' }}>
        <div className="section-head">
          <h2 className="h2">Giá thị trường</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="pill-btn" onClick={() => setSheet('price')}>Nhập tay</button>
            <button type="button" className="pill-btn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} disabled={looking} onClick={autoLookup}>
              {looking ? 'Đang tra…' : 'Tự tra giá'}
            </button>
          </div>
        </div>
        {cam.marketValue != null ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="bigval">{trieu(cam.marketValue)} <small>triệu</small></span>
                {cam.marketLow != null && cam.marketHigh != null && cam.marketLow !== cam.marketHigh && (
                  <span className="mono muted" style={{ fontSize: 12 }}>khoảng {trieu(cam.marketLow)} – {trieu(cam.marketHigh)} tr</span>
                )}
              </div>
              {pct != null && <span className={'mono ' + (pct > 0 ? 'up' : pct < 0 ? 'down' : 'muted')} style={{ fontSize: 13 }}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '–'} {Math.abs(pct)}% / 90 ngày</span>}
            </div>
            <Sparkline values={(prices ?? []).map((p) => p.value)} color="var(--accent)" />
          </>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
            {looking ? 'Đang tìm giá đã bán của mẫu này trên eBay…'
              : cam.marketNote || 'Chưa có giá. Bấm “Tự tra giá” để app tự lấy giá từ eBay.'}
          </p>
        )}
        <div className="form-grid" style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Giá mua</span>
            {cam.purchasePrice != null ? (
              <button type="button" onClick={() => setSheet('purchase')} style={{ padding: 0, border: 0, background: 'transparent', textAlign: 'left' }}>
                <span className="mono" style={{ fontSize: 14 }}>{money(cam.purchasePrice, cam.purchaseCurrency)}</span>
                {cam.purchaseCurrency !== 'VND' && buy != null && <span className="mono muted" style={{ fontSize: 11, display: 'block' }}>≈ {trieuLabel(buy)}</span>}
              </button>
            ) : (
              <button type="button" className="link-btn" style={{ padding: 0, height: 'auto', textAlign: 'left' }} onClick={() => setSheet('purchase')}>+ Thêm giá mua</button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Chênh lệch</span>
            <span className={'mono ' + (diff == null ? 'muted' : diff >= 0 ? 'up' : 'down')} style={{ fontSize: 14 }}>
              {diff == null ? '—' : `${diff >= 0 ? '+' : '−'}${trieu(Math.abs(diff))} tr${buy ? ` (${diff >= 0 ? '+' : '−'}${Math.round(Math.abs(diff / buy) * 100)}%)` : ''}`}
            </span>
          </div>
        </div>
        {cam.marketValue != null && cam.marketSource === 'auto' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span className="chip-mini">{BASIS[cam.marketBasis ?? ''] ?? 'Tự tra'}</span>
              {cam.marketConfidence && <span className="chip-mini" style={{ color: cam.marketConfidence === 'low' ? 'var(--down)' : undefined }}>Độ tin cậy: {CONF[cam.marketConfidence] ?? cam.marketConfidence}</span>}
            </div>
            {cam.marketNote && <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' }}>{cam.marketNote}</p>}
            {!!cam.marketSources?.length && (
              <details>
                <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>Nguồn ({cam.marketSources.length})</summary>
                <div className="src-list">
                  {cam.marketSources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer"><IconExternal size={14} style={{ flex: 'none' }} /><span>{s.title}</span></a>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        {cam.marketUpdatedAt && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Cập nhật lần cuối: {fmtTs(cam.marketUpdatedAt)}{cam.marketSource === 'manual' ? ' · nhập tay' : ''}</span>}
      </section>

      <section className="section px" aria-label="Hồ sơ">
        <div className="section-head">
          <h2 className="h2">Hồ sơ</h2>
          <button type="button" className="link-btn" onClick={() => setSheet('profile')}>Sửa</button>
        </div>
        <dl className="kv" onClick={() => setSheet('profile')} style={{ cursor: 'pointer' }}>
          <div><dt>Số serial</dt><dd className="mono">{cam.serial || '—'}</dd></div>
          <div><dt>Tình trạng</dt><dd>{cam.condition || '—'}</dd></div>
          <div><dt>Mua tại</dt><dd>{cam.purchaseFrom || '—'}</dd></div>
          <div><dt>Ngày mua</dt><dd className="mono">{fmtDate(cam.purchaseDate) || '—'}</dd></div>
        </dl>
        {cam.tags.length > 0 && <div className="tags">{cam.tags.map((t) => <span key={t} className="tag" style={{ textTransform: 'none' }}>#{t}</span>)}</div>}
      </section>

      <section className="section px" aria-label="Ống kính">
        <div className="section-head">
          <h2 className="h2">Ống kính</h2>
          {lensKind === 'interchangeable'
            ? <button type="button" className="link-btn" onClick={() => setSheet('lens')}>+ Thêm</button>
            : <button type="button" className="link-btn" onClick={() => setSheet('lensSpec')}>{lensLabel(cam.lens) ? 'Sửa' : '+ Nhập thông số'}</button>}
        </div>
        {lensKind === 'fixed' ? (
          <button type="button" className="lens-card" style={{ textAlign: 'left', width: '100%', color: 'var(--text)' }} onClick={() => setSheet('lensSpec')}>
            <span className="lens-ring" aria-hidden="true" />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              {lensLabel(cam.lens)
                ? <span className="big">{lensLabel(cam.lens)}</span>
                : <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Chưa có thông số ống kính</span>}
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="chip-mini">Ống kính liền</span>
                {isZoom(cam.lens) && <span className="chip-mini" style={{ color: 'var(--accent)' }}>Zoom</span>}
                {cam.lens?.auto && <span className="chip-mini">Điền tự động · kiểm tra lại</span>}
              </span>
            </span>
          </button>
        ) : cam.lenses.length ? (
          <div className="rows">
            {cam.lenses.map((l, i) => (
              <div key={i}>
                <span style={{ fontWeight: 500 }}>{l.name}</span>
                <button type="button" className="icon-btn ghost" aria-label={`Bỏ ${l.name}`} onClick={() => patchCamera(cam.id, { lenses: cam.lenses.filter((_, j) => j !== i) })}><IconTrash size={18} /></button>
              </div>
            ))}
          </div>
        ) : <p className="muted" style={{ fontSize: 13 }}>Máy thay ống kính{cam.mount ? ` · ngàm ${cam.mount}` : ''}. Chưa ghi ống kính nào.</p>}
      </section>

      <section className="section px" aria-label="Thông số kỹ thuật">
        <h2 className="h2">Thông số kỹ thuật</h2>
        {entry
          ? <SpecCard camera={cam} model={entry} onContribute={() => setContrib(true)} />
          : (
            <div className="dashed" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <span>Mẫu này chưa có trong thư viện.</span>
              <button type="button" className="pill-btn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => setContrib(true)}>+ Thêm {cam.brand} {cam.model} vào thư viện</button>
            </div>
          )}
      </section>

      <section className="section px" aria-label="Nhật ký">
        <div className="section-head">
          <h2 className="h2">Nhật ký bảo dưỡng</h2>
          <button type="button" className="link-btn" onClick={() => setSheet('service')}>+ Thêm</button>
        </div>
        {service?.length ? (
          <ol className="timeline">
            {service.map((s) => (
              <li key={s.id}>
                <span className="mono muted" style={{ fontSize: 12, paddingTop: 2 }}>{fmtDate(s.date)}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14 }}>{s.text}</span>
                  {s.cost && <span className="muted" style={{ fontSize: 12 }}>{s.cost}</span>}
                </div>
                <button type="button" className="icon-btn ghost" style={{ width: 36, height: 36 }} aria-label="Xóa dòng nhật ký" onClick={() => db.service.delete(s.id)}><IconTrash size={16} /></button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="dashed"><IconClock size={18} style={{ flex: 'none' }} />Chưa có ghi chép nào. Ghi lại CLA, thay mút gương, thay pin, cuộn film đã chụp…</div>
        )}
      </section>

      {cam.notes && (
        <section className="section px" aria-label="Ghi chú">
          <h2 className="h2">Ghi chú</h2>
          <p className="panel" style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-2)', whiteSpace: 'pre-wrap', display: 'block' }}>{cam.notes}</p>
        </section>
      )}

      <div className="px" style={{ display: 'flex', gap: 10 }}>
        <Link to={`/may/${cam.id}/sua`} className="btn secondary" style={{ flex: 1 }}>Sửa thông tin</Link>
        <button type="button" className="btn danger" onClick={onDelete}>Xóa</button>
      </div>
      <div className="px" style={{ display: 'flex', justifyContent: 'center' }}>
        <button type="button" className="link-btn" style={{ color: 'var(--muted)' }} onClick={toggleStatus}>
          {cam.status === 'owned' ? 'Đánh dấu đã bán' : 'Chuyển về Trong kho'}
        </button>
      </div>
      </div>

      <PriceSheet open={sheet === 'price'} onClose={() => setSheet(null)} cam={cam} />
      <LoadFilmSheet open={sheet === 'film'} onClose={() => setSheet(null)} cam={cam} />
      <FinishRollSheet open={sheet === 'finish'} onClose={() => setSheet(null)} cam={cam} />
      <ServiceSheet open={sheet === 'service'} onClose={() => setSheet(null)} cam={cam} />
      <LensSheet open={sheet === 'lens'} onClose={() => setSheet(null)} cam={cam} />
      {sheet === 'purchase' && <PurchaseSheet open onClose={() => setSheet(null)} cam={cam} />}
      {sheet === 'lensSpec' && <LensSpecSheet onClose={() => setSheet(null)} cam={cam} />}
      {sheet === 'profile' && <ProfileSheet onClose={() => setSheet(null)} cam={cam} />}
      {contrib && <ContributeSheet model={entry} brand={cam.brand} modelName={cam.model} onClose={() => setContrib(false)} />}
    </div>
  );
}

/* ---------- Các bảng nhập nhanh ---------- */

function PriceSheet({ open, onClose, cam }: { open: boolean; onClose: () => void; cam: Camera }) {
  const settings = useSettings();
  const [cur, setCur] = useState<Currency>('VND');
  const [vals, setVals] = useState(['', '', '']);
  const q = encodeURIComponent(`${cam.brand} ${cam.model}`);
  const links = [
    { label: 'eBay · đã bán', href: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1` },
    { label: 'Yahoo! Auction JP · đã kết thúc', href: `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${q}` },
    { label: 'Google · giá VN', href: `https://www.google.com/search?q=${q}+gi%C3%A1` }
  ];
  const parsed = vals.map((v) => (cur === 'VND' ? parseVND(v) : parseAmount(v))).filter((n): n is number => n != null && n > 0);
  const inVND = parsed.map((n) => toVND(n, cur, settings.rates)).filter((n): n is number => n != null);
  const missingRate = cur !== 'VND' && !settings.rates[cur];
  const med = inVND.length ? median(inVND) : null;

  const save = async () => {
    if (med == null) return;
    await addPrice(cam.id, med, Math.min(...inVND), Math.max(...inVND));
    setVals(['', '', '']);
    toast(`Đã lưu giá ${trieu(med)} tr`);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Cập nhật giá">
      <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>1. Mở một nguồn bên dưới, xem vài tin <b>đã bán</b> gần đây của đúng mẫu máy.</p>
      <div className="src-chips">
        {links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label}<IconExternal size={14} /></a>)}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>2. Nhập 1–3 mức giá bạn thấy. App lấy giá giữa làm giá thị trường.</p>
      <Segmented label="Đơn vị" value={cur} onChange={setCur} options={[{ value: 'VND', label: 'VNĐ' }, { value: 'JPY', label: '¥ Yên' }, { value: 'USD', label: '$ USD' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {vals.map((v, i) => (
          <label key={i} className="field">
            <span className="sr-only">Giá {i + 1}</span>
            <input className="input mono" inputMode="decimal" placeholder={cur === 'VND' ? 'vd 4,5tr' : cur === 'JPY' ? 'vd 15000' : 'vd 120'} value={v}
              onChange={(e) => setVals(vals.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
      {missingRate && <p className="down" style={{ fontSize: 13 }}>Chưa có tỷ giá {cur}. Vào Cài đặt để lấy tỷ giá tự động hoặc nhập tay.</p>}
      {med != null && <p className="mono" style={{ fontSize: 14 }}>Giá giữa: {trieu(med)} tr{inVND.length > 1 ? ` · từ ${trieu(Math.min(...inVND))} đến ${trieu(Math.max(...inVND))} tr` : ''}</p>}
      <button type="button" className="btn" disabled={med == null} onClick={save}>Lưu giá</button>
    </Sheet>
  );
}

function ServiceSheet({ open, onClose, cam }: { open: boolean; onClose: () => void; cam: Camera }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayISO());
  const [cost, setCost] = useState('');
  const save = async () => {
    if (!text.trim()) return;
    await db.service.put({ id: uid(), cameraId: cam.id, date, text: text.trim(), cost: cost.trim() || undefined, createdAt: Date.now() });
    setText(''); setCost('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Thêm vào nhật ký">
      <label className="field">Nội dung
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="vd: CLA, thay mút gương, thay pin" autoFocus />
      </label>
      <div className="form-grid">
        <label className="field">Ngày<input className="input mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Chi phí / nơi làm<input className="input" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Không bắt buộc" /></label>
      </div>
      <button type="button" className="btn" disabled={!text.trim()} onClick={save}>Lưu</button>
    </Sheet>
  );
}

function LensSheet({ open, onClose, cam }: { open: boolean; onClose: () => void; cam: Camera }) {
  const [name, setName] = useState('');
  const save = async () => {
    if (!name.trim()) return;
    await patchCamera(cam.id, { lenses: [...cam.lenses, { name: name.trim() }] });
    setName('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Thêm ống kính">
      <label className="field">Tên ống kính
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: Zuiko 50mm f/1.4" autoFocus />
      </label>
      <button type="button" className="btn" disabled={!name.trim()} onClick={save}>Lưu</button>
    </Sheet>
  );
}

function PurchaseSheet({ open, onClose, cam }: { open: boolean; onClose: () => void; cam: Camera }) {
  const [cur, setCur] = useState<Currency>(cam.purchaseCurrency);
  const [amount, setAmount] = useState(cam.purchasePrice != null ? String(cam.purchasePrice) : '');
  const [date, setDate] = useState(cam.purchaseDate);
  const [from, setFrom] = useState(cam.purchaseFrom);
  const value = cur === 'VND' ? parseVND(amount) : parseAmount(amount);
  const save = async () => {
    await patchCamera(cam.id, { purchasePrice: value, purchaseCurrency: cur, purchaseDate: date, purchaseFrom: from.trim() });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Giá mua">
      <Segmented label="Đơn vị" value={cur} onChange={setCur} options={[{ value: 'VND', label: 'VNĐ' }, { value: 'JPY', label: '¥ Yên' }, { value: 'USD', label: '$ USD' }]} />
      <label className="field">Số tiền
        <input className="input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={cur === 'VND' ? 'vd 3,2tr hoặc 3200000' : 'vd 4800'} autoFocus />
      </label>
      {value != null && <span className="mono muted" style={{ fontSize: 12 }}>= {money(value, cur)}</span>}
      <div className="form-grid">
        <div className="field"><span>Ngày mua</span><DateInput label="Ngày mua" value={date} onChange={setDate} /></div>
        <label className="field">Mua ở đâu<input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Buyee, shop…" /></label>
      </div>
      <button type="button" className="btn" onClick={save}>Lưu</button>
    </Sheet>
  );
}

function LensSpecSheet({ onClose, cam }: { onClose: () => void; cam: Camera }) {
  const [spec, setSpec] = useState<LensSpec>(cam.lens ?? { kind: defaultLensKind(cam.type), focal: null, focalMax: null, aperture: null, apertureMax: null });
  const save = async () => {
    await patchCamera(cam.id, { lens: { ...spec, auto: false } });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Ống kính">
      <LensSpecFields value={spec} onChange={setSpec} />
      <button type="button" className="btn" onClick={save}>Lưu</button>
    </Sheet>
  );
}

function ProfileSheet({ onClose, cam }: { onClose: () => void; cam: Camera }) {
  const [serial, setSerial] = useState(cam.serial);
  const [condition, setCondition] = useState(cam.condition);
  const [from, setFrom] = useState(cam.purchaseFrom);
  const [date, setDate] = useState(cam.purchaseDate);
  const [tags, setTags] = useState(cam.tags.join(', '));
  const save = async () => {
    await patchCamera(cam.id, {
      serial: serial.trim(), condition, purchaseFrom: from.trim(), purchaseDate: date,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean)
    });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Hồ sơ">
      <label className="field">Số serial
        <input className="input mono" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Không bắt buộc" />
      </label>
      <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
        <legend className="field" style={{ padding: '0 0 8px', display: 'block' }}>Tình trạng</legend>
        <div className="grade">
          {CONDITIONS.map((g) => (
            <button key={g} type="button" className={condition === g ? 'on' : ''} aria-pressed={condition === g} onClick={() => setCondition(condition === g ? '' : g)}>{g}</button>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label className="field">Mua tại
          <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Buyee, shop…" />
        </label>
        <div className="field"><span>Ngày mua</span><DateInput label="Ngày mua" value={date} onChange={setDate} /></div>
      </div>
      <label className="field">Thẻ (cách nhau bằng dấu phẩy)
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="máy đi phố, kỷ niệm" />
      </label>
      <button type="button" className="btn" onClick={save}>Lưu</button>
    </Sheet>
  );
}
