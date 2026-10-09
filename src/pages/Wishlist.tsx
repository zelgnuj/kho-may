import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { blankCamera, blankWish, db, patchWish, saveWish, useCameras, useSettings, useWishlist, type Camera, type WishItem, type WishPriority } from '../db';
import { TYPE_LABEL, displayCurrency, fmtTs, formatDisplayInput, lensLabel, parseDisplayMoney, valueLabel } from '../lib/format';
import { findModel, guessLens, guessType, useCatalogVersion } from '../lib/catalog';
import { modelKey, refreshWishPrice, remainingQuota } from '../lib/autoPrice';
import { useSampleImage } from '../lib/sampleImage';
import { toast } from '../lib/toast';
import { CameraArt } from '../components/CameraArt';
import { ModelPicker } from '../components/ModelPicker';
import { SpecCard } from '../components/SpecCard';
import { ContributeSheet } from '../components/ContributeSheet';
import { SubPage } from '../components/SubPage';
import { Money, SampleImg, Segmented } from '../components/ui';
import { IconExternal, IconHeart, IconPlus } from '../components/Icons';
import { tx } from '../lib/i18n';

export const PRIORITY_LABEL: Record<WishPriority, string> = { 1: tx("Rất muốn"), 2: tx("Muốn"), 3: tx("Để ngắm") };

/** Giá thị trường hiển thị: của mục wishlist, hoặc mượn từ máy cùng mẫu trong kho */
function marketOf(w: WishItem, owned: Camera[]) {
  if (w.marketValue != null) return { value: w.marketValue, low: w.marketLow, high: w.marketHigh, at: w.marketUpdatedAt, borrowed: false };
  const sib = owned.find((c) => c.marketValue != null && modelKey(c) === modelKey(w));
  return sib ? { value: sib.marketValue!, low: sib.marketLow, high: sib.marketHigh, at: sib.marketUpdatedAt, borrowed: true } : null;
}

/** So giá thị trường với giá muốn mua */
function verdict(market: number | null | undefined, target: number | null | undefined) {
  if (market == null || target == null) return null;
  const pct = Math.round(((market - target) / target) * 100);
  if (pct <= 0) return { tone: 'up', short: tx("Trong tầm"), long: pct === 0 ? tx("Giá thị trường đúng bằng giá bạn muốn") : tx("Thị trường đang thấp hơn mục tiêu {0}%", -pct) };
  if (pct <= 15) return { tone: 'warn', short: `+${pct}%`, long: tx("Thị trường cao hơn mục tiêu {0}% — gần tầm, có thể trả giá", pct) };
  return { tone: 'muted', short: `+${pct}%`, long: tx("Thị trường cao hơn mục tiêu {0}%", pct) };
}

function WishThumb({ w, size }: { w: WishItem; size: number }) {
  useCatalogVersion();
  const m = findModel(w.brand, w.model);
  const img = useSampleImage(m);
  return img ? <SampleImg className="thumb-img sample" src={img.url} /> : <CameraArt type={w.type} width={size} strokeWidth={size < 70 ? 3 : 2} />;
}

/* ======================================================================
 * Danh sách
 * ====================================================================== */

type Sort = 'priority' | 'recent' | 'price';

export default function WishlistPage() {
  const all = useWishlist();
  const cams = useCameras() ?? [];
  const [sort, setSort] = useState<Sort>(() => { try { return (localStorage.getItem('wish-sort') as Sort) || 'priority'; } catch { return 'priority'; } });
  const owned = useMemo(() => cams.filter((c) => c.status === 'owned'), [cams]);
  const ownedKeys = useMemo(() => new Set(owned.map(modelKey)), [owned]);
  const [showGot, setShowGot] = useState(false);

  if (all === undefined) return <div className="page" />;
  const active = all.filter((w) => !w.acquiredAt);
  const got = all.filter((w) => w.acquiredAt).sort((a, b) => (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0));
  const rows = active.map((w) => ({ w, m: marketOf(w, owned) }));
  rows.sort((a, b) => {
    if (sort === 'recent') return b.w.createdAt - a.w.createdAt;
    if (sort === 'price') return (a.w.targetPrice ?? a.m?.value ?? Infinity) - (b.w.targetPrice ?? b.m?.value ?? Infinity);
    return a.w.priority - b.w.priority || b.w.createdAt - a.w.createdAt;
  });
  const budget = active.reduce((s, w) => s + (w.targetPrice ?? 0), 0);
  const inRange = rows.filter((r) => verdict(r.m?.value, r.w.targetPrice)?.tone === 'up').length;
  const pickSort = (v: Sort) => { setSort(v); try { localStorage.setItem('wish-sort', v); } catch { /* bỏ qua */ } };

  return (
    <div className="page">
      <header className="page-head px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">{tx("Đang săn")}</span>
          <h1 className="title-xl">Wishlist</h1>
        </div>
        <Link to="/wishlist/them" className="icon-btn" aria-label={tx("Thêm vào wishlist")}><IconPlus size={20} /></Link>
      </header>

      {active.length === 0 ? (
        <div className="empty">
          <IconHeart size={28} style={{ color: 'var(--accent)' }} />
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)' }}>
            {tx("Ghi lại những máy bạn đang săn, đặt giá muốn mua. App tự theo dõi giá thị trường và báo khi máy về tầm giá.")}</p>
          <Link to="/wishlist/them" className="btn">{tx("Thêm máy đầu tiên")}</Link>
        </div>
      ) : (
        <>
          <section className="stats px" aria-label={tx("Tổng quan wishlist")}>
            <div className="stat"><span className="k">{tx("Đang săn")}</span><span className="v">{active.length}</span></div>
            <div className="stat"><span className="k">{tx("Ngân sách")}</span><span className="v"><Money vnd={budget} /></span></div>
            <div className="stat"><span className="k">{tx("Trong tầm giá")}</span><span className="v" style={{ color: inRange ? 'var(--up)' : undefined }}>{inRange}</span></div>
          </section>
          <div className="px">
            <Segmented<Sort> label={tx("Sắp xếp")} value={sort} onChange={pickSort} options={[{ value: 'priority', label: tx("Ưu tiên") }, { value: 'recent', label: tx("Mới thêm") }, { value: 'price', label: tx("Giá") }]} />
          </div>
          <div className="list px">
            {rows.map(({ w, m }) => {
              const v = verdict(m?.value, w.targetPrice);
              return (
                <Link key={w.id} to={`/wishlist/${w.id}`} className="list-row wish-row">
                  <div className="list-thumb"><WishThumb w={w} size={52} /></div>
                  <div className="list-main">
                    <span className="name">{w.brand} {w.model}</span>
                    <span className="spec">
                      <span className={'prio p' + w.priority}>{PRIORITY_LABEL[w.priority]}</span>
                      {ownedKeys.has(modelKey(w)) && <span className="chip-mini">{tx("Đã có 1 máy")}</span>}
                      {w.wantNote && <span className="wish-want">{w.wantNote}</span>}
                    </span>
                  </div>
                  <div className="list-side">
                    <span className="mono" style={{ fontSize: 13 }}>{m ? valueLabel(m.value) : '—'}</span>
                    {v ? <span className={v.tone}>{v.short}</span> : w.targetPrice != null ? <span className="muted">≤ {valueLabel(w.targetPrice)}</span> : <span className="muted">{tx("chưa đặt giá")}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {got.length > 0 && (
        <section className="section px" style={{ gap: 8 }}>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setShowGot((x) => !x)}>
            {showGot ? tx("Ẩn") : tx("Xem")} {got.length} {' '}{tx("máy đã săn được")}</button>
          {showGot && (
            <div className="rows">
              {got.map((w) => (
                <Link key={w.id} to={w.acquiredCameraId ? `/may/${w.acquiredCameraId}` : `/wishlist/${w.id}`}>
                  <span>{w.brand} {w.model}</span>
                  <span className="mono muted" style={{ fontSize: 12 }}>{fmtTs(w.acquiredAt!)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ======================================================================
 * Chi tiết
 * ====================================================================== */

export function WishDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const w = useLiveQuery(() => (id ? db.wishlist.get(id) : undefined), [id]);
  const cams = useCameras() ?? [];
  const s = useSettings();
  useCatalogVersion();
  const [looking, setLooking] = useState(false);
  const [link, setLink] = useState('');
  const [contrib, setContrib] = useState(false);
  const model = w ? findModel(w.brand, w.model) : null;
  const img = useSampleImage(model);

  if (w === undefined) return <div className="page" />;
  if (!w || w.deletedAt) return <SubPage title={tx("Không tìm thấy")} back="/wishlist" backLabel="Wishlist"><p className="px muted">{tx("Mục này đã bị xoá.")}</p></SubPage>;

  const owned = cams.filter((c) => c.status === 'owned');
  const sameOwned = owned.filter((c) => modelKey(c) === modelKey(w));
  const m = marketOf(w, owned);
  const v = verdict(m?.value, w.targetPrice);
  const pseudo: Camera = { ...blankCamera(), id: w.id, brand: w.brand, model: w.model, type: w.type };

  const lookup = async () => {
    const left = remainingQuota(s);
    if (left <= 0) { toast(tx("Đã hết {0} lượt tra giá tháng này", s.monthlyQuota)); return; }
    if (!window.confirm(tx("Tra giá {0} {1}? Dùng 1 lượt (còn {2} lượt tháng này).", w.brand, w.model, left))) return;
    setLooking(true);
    try {
      const r = await refreshWishPrice(w);
      toast(r == null ? tx("Chưa tìm được đủ dữ liệu giá cho mẫu này") : tx("Giá thị trường ≈ {0}", valueLabel(r)));
    } catch (e) { toast(e instanceof Error ? e.message : tx("Không tra được giá")); }
    finally { setLooking(false); }
  };
  const addLink = async () => {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) { toast(tx("Link cần bắt đầu bằng http:// hoặc https://")); return; }
    await patchWish(w.id, { links: [...w.links, { url }] });
    setLink('');
  };
  const removeLink = (i: number) => patchWish(w.id, { links: w.links.filter((_, j) => j !== i) });
  const remove = async () => {
    if (!window.confirm(tx("Xoá {0} {1} khỏi wishlist?", w.brand, w.model))) return;
    await patchWish(w.id, { deletedAt: Date.now() });
    nav('/wishlist');
  };
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  return (
    <SubPage title={w.model} back="/wishlist" backLabel="Wishlist" action={<Link to={`/wishlist/${w.id}/sua`} className="pill-btn">{tx("Sửa")}</Link>}>
      <div className="wish-hero px">
        <div className="wish-hero-img">{img ? <SampleImg src={img.url} alt={`${w.brand} ${w.model}`} lazy={false} /> : <CameraArt type={w.type} width={140} />}</div>
        <div className="wish-hero-meta">
          <span className="sub">{w.brand}{w.type ? ` · ${TYPE_LABEL[w.type]}` : ''}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={'prio p' + w.priority}>{PRIORITY_LABEL[w.priority]}</span>
            {sameOwned.length > 0 && <Link to={`/may/${sameOwned[0].id}`} className="chip-mini">{tx("Đã có")}{' '}{sameOwned.length} {' '}{tx("máy trong kho")}</Link>}
          </div>
          {img && <a className="muted" style={{ fontSize: 11 }} href={img.page} target="_blank" rel="noreferrer">{tx("Ảnh mẫu:")}{' '}{img.artist}{img.license ? `, ${img.license}` : ''}</a>}
        </div>
      </div>

      <section className="panel" aria-label={tx("Giá")} style={{ margin: '0 20px' }}>
        <div className="section-head">
          <h2 className="h2">{tx("Giá")}</h2>
          <button type="button" className="pill-btn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} disabled={looking} onClick={lookup}>{looking ? tx("Đang tra…") : tx("Tra giá")}</button>
        </div>
        <div className="form-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tx("Thị trường")}</span>
            {m ? <span className="bigval" style={{ fontSize: 30 }}><Money vnd={m.value} /></span> : <span className="muted" style={{ fontSize: 14 }}>{tx("Chưa có")}</span>}
            {m?.low != null && m.high != null && m.low !== m.high && <span className="mono muted" style={{ fontSize: 11 }}>{tx("khoảng {0} – {1}", valueLabel(m.low), valueLabel(m.high))}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tx("Muốn mua ở")}</span>
            {w.targetPrice != null ? <span className="bigval" style={{ fontSize: 30, color: 'var(--accent)' }}><Money vnd={w.targetPrice} /></span>
              : <Link to={`/wishlist/${w.id}/sua`} className="link-btn" style={{ padding: 0, height: 'auto' }}>{tx("+ Đặt giá")}</Link>}
          </div>
        </div>
        {v && <p className={v.tone} style={{ fontSize: 13 }}>{v.long}</p>}
        <span className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
          {m ? tx("{0}Cập nhật {1} · giá eBay quy đổi, chưa gồm ship & thuế.", m.borrowed ? tx("Lấy từ máy cùng mẫu trong kho. ") : '', m.at ? fmtTs(m.at) : '—')
            : w.marketNote || tx("Chưa có giá. App sẽ tự tra khi còn lượt, hoặc bấm “Tra giá”.")}
        </span>
      </section>

      <section className="section px" style={{ gap: 10 }} aria-label={tx("Tin rao")}>
        <h2 className="h-mono">{tx("TIN RAO ĐANG THEO DÕI")}</h2>
        {w.links.length > 0 && (
          <div className="rows">
            {w.links.map((l, i) => (
              <div key={l.url + i}>
                <a href={l.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <IconExternal size={15} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label || host(l.url)}</span>
                </a>
                <button type="button" className="link-btn" style={{ color: 'var(--muted)' }} onClick={() => removeLink(i)}>{tx("Bỏ")}</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder={tx("Dán link (Facebook, Chợ Tốt, eBay…)")} aria-label={tx("Link tin rao")} />
          <button type="button" className="btn small secondary" disabled={!link.trim()} onClick={addLink}>{tx("Thêm")}</button>
        </div>
      </section>

      {(w.wantNote || w.notes) && (
        <section className="section px" style={{ gap: 8 }}>
          <h2 className="h-mono">{tx("GHI CHÚ")}</h2>
          {w.wantNote && <p style={{ fontSize: 14 }}><span className="muted">{tx("Muốn:")}{' '}</span>{w.wantNote}</p>}
          {w.notes && <p style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{w.notes}</p>}
        </section>
      )}

      {model && (
        <section className="section px" aria-label={tx("Thông số kỹ thuật")}>
          <h2 className="h-mono">{tx("THÔNG SỐ")}</h2>
          <SpecCard camera={pseudo} model={model} onContribute={() => setContrib(true)} />
        </section>
      )}
      {contrib && <ContributeSheet model={model} brand={w.brand} modelName={w.model} onClose={() => setContrib(false)} />}

      <section className="section px" style={{ gap: 10 }}>
        <button type="button" className="btn" onClick={() => nav(`/them?wish=${w.id}`)}>{tx("Đã mua được · thêm vào kho")}</button>
        <button type="button" className="btn danger" onClick={remove}>{tx("Xoá khỏi wishlist")}</button>
      </section>
    </SubPage>
  );
}

/* ======================================================================
 * Thêm / sửa
 * ====================================================================== */

export function WishEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const existing = useLiveQuery(() => (id ? db.wishlist.get(id) : undefined), [id]);
  const brands = useLiveQuery(async () => [...new Set((await db.cameras.toArray()).map((c) => c.brand).filter(Boolean))].sort(), []);
  const cams = useCameras() ?? [];
  useCatalogVersion();
  const [w, setW] = useState<WishItem>(() => blankWish());
  const [price, setPrice] = useState('');
  useEffect(() => {
    if (existing) { setW(existing); setPrice(formatDisplayInput(existing.targetPrice)); }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof WishItem>(k: K, v: WishItem[K]) => setW((p) => ({ ...p, [k]: v }));
  const matched = findModel(w.brand, w.model);
  const ownedSame = cams.filter((c) => c.status === 'owned' && modelKey(c) === modelKey(w));
  const canSave = w.brand.trim() && w.model.trim();

  const save = async () => {
    if (!canSave) return;
    const type = w.type || guessType(w.brand, w.model).type;
    await saveWish({ ...w, brand: w.brand.trim(), model: w.model.trim(), type, targetPrice: parseDisplayMoney(price) });
    toast(id ? tx("Đã lưu") : tx("Đã thêm {0} {1} vào wishlist", w.brand, w.model));
    nav(id ? `/wishlist/${w.id}` : '/wishlist', { replace: true });
  };

  return (
    <SubPage title={id ? tx("Sửa") : tx("Thêm máy")} back={id ? `/wishlist/${id}` : '/wishlist'} backLabel={id ? w.model || 'Wishlist' : 'Wishlist'}>
      <section className="section px" style={{ gap: 14 }}>
        <ModelPicker brand={w.brand} model={w.model} ownBrands={brands ?? []}
          onChange={(brand, model) => setW((p) => ({ ...p, brand, model, type: guessType(brand, model).type }))} />
        {matched && (
          <div className="dashed" style={{ borderStyle: 'solid', borderColor: 'var(--line)', fontSize: 13 }}>
            <span>{[matched.release?.year, TYPE_LABEL[guessType(w.brand, w.model).type], lensLabel(guessLens(w.brand, w.model, guessType(w.brand, w.model).type))].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        {ownedSame.length > 0 && <p className="warn" style={{ fontSize: 13 }}>{tx("Bạn đã có {0} máy {1} {2} trong kho.", ownedSame.length, w.brand, w.model)}</p>}

        <div className="field">{tx("Mức độ muốn")}<Segmented<string> label={tx("Mức độ muốn")} value={String(w.priority)} onChange={(v) => set('priority', Number(v) as WishPriority)}
            options={([1, 2, 3] as WishPriority[]).map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] }))} />
        </div>
        <label className="field">{tx("Giá muốn mua ({0})", displayCurrency() === 'USD' ? '$' : tx("VNĐ"))}<input className="input mono" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={tx("vd: 2.500.000")} />
        </label>
        <label className="field">{tx("Tình trạng / phiên bản muốn")}<input className="input" value={w.wantNote} onChange={(e) => set('wantNote', e.target.value)} placeholder={tx("vd: bản đen, còn đo sáng, có hộp")} />
        </label>
        <label className="field">{tx("Ghi chú")}<textarea className="input" style={{ height: 96, padding: 12, resize: 'vertical' }} value={w.notes} onChange={(e) => set('notes', e.target.value)} placeholder={tx("Shop quen, lưu ý khi mua…")} />
        </label>
      </section>
      <div className="px" style={{ display: 'flex' }}>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={!canSave} onClick={save}>{id ? tx("Lưu") : tx("Thêm vào wishlist")}</button>
      </div>
    </SubPage>
  );
}
